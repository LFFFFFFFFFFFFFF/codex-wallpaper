import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';


export async function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

// A newline does not end an expression before a following `(`. Keep each
// independently authored preload section separate, including the original one.
export function joinPreloadScripts(...sections) {
  return Buffer.concat(sections.flatMap((section, index) =>
    index ? [Buffer.from('\n;\n'), Buffer.from(section)] : [Buffer.from(section)]));
}

export async function readAsarHeader(filename) {
  const handle = await fs.open(filename, 'r');
  try {
    const prefix = Buffer.alloc(16);
    if ((await handle.read(prefix, 0, 16, 0)).bytesRead !== 16) throw Error('Invalid ASAR header');
    const headerSize = prefix.readUInt32LE(4), jsonSize = prefix.readUInt32LE(12);
    if (prefix.readUInt32LE(0) !== 4 || headerSize < 8 || headerSize > 64 * 1024 * 1024 || jsonSize > headerSize - 8) throw Error('Invalid ASAR sizes');
    const json = Buffer.alloc(jsonSize);
    if ((await handle.read(json, 0, jsonSize, 16)).bytesRead !== jsonSize) throw Error('Incomplete ASAR header');
    const header = JSON.parse(json.toString('utf8'));
    if (!header.files) throw Error('ASAR file inventory missing');
    return { header, dataOffset: 8 + headerSize };
  } finally { await handle.close(); }
}

function member(header, name, create = false) {
  if (!name || name.includes('\\') || name.split('/').some(p => !p || ['.', '..', '__proto__', 'constructor', 'prototype'].includes(p))) throw Error('Unsafe ASAR member path');
  const parts = name.split('/'); let node = header;
  for (let i = 0; i < parts.length; i++) {
    if (!node.files) throw Error('ASAR directory missing');
    const key = parts[i];
    if (!Object.hasOwn(node.files, key)) {
      if (!create) throw Error(`ASAR member missing: ${name}`);
      node.files[key] = i === parts.length - 1 ? {} : { files: {} };
    }
    node = node.files[key];
  }
  return node;
}

export async function readAsarMember(filename, name) {
  const { header, dataOffset } = await readAsarHeader(filename);
  const node = member(header, name);
  if (node.unpacked || node.link || !Number.isSafeInteger(node.size)) throw Error('Expected packed regular ASAR member');
  const handle = await fs.open(filename, 'r');
  try {
    const bytes = Buffer.alloc(node.size);
    if ((await handle.read(bytes, 0, bytes.length, dataOffset + Number(node.offset))).bytesRead !== bytes.length) throw Error('Incomplete ASAR member');
    return bytes;
  } finally { await handle.close(); }
}

function encodeHeader(header) {
  const text = Buffer.from(JSON.stringify(header));
  const padded = Math.ceil(text.length / 4) * 4;
  const pickle = Buffer.alloc(8 + padded);
  pickle.writeUInt32LE(4 + padded, 0); pickle.writeUInt32LE(text.length, 4); text.copy(pickle, 8);
  const prefix = Buffer.alloc(8); prefix.writeUInt32LE(4, 0); prefix.writeUInt32LE(pickle.length, 4);
  return Buffer.concat([prefix, pickle]);
}

function integrity(bytes, blockSize = 4 * 1024 * 1024) {
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const blocks = [];
  for (let i = 0; i < bytes.length; i += blockSize) blocks.push(hash(bytes.subarray(i, i + blockSize)));
  if (!blocks.length) blocks.push(hash(bytes));
  return { algorithm: 'SHA256', hash: hash(bytes), blockSize, blocks };
}

export async function patchAsar({ source, output, replacements, additions, expectedSha256, entry }) {
  if (path.resolve(source).toLowerCase() === path.resolve(output).toLowerCase()) throw Error('Source archive must never be overwritten');
  const sourceSha256 = await sha256File(source);
  if (expectedSha256 && sourceSha256 !== expectedSha256) throw Error(`Source version/hash changed: ${sourceSha256}`);
  const { header, dataOffset } = await readAsarHeader(source);
  const sourceStat = await fs.stat(source), originalBodyBytes = sourceStat.size - dataOffset;
  const append = [], records = []; let offset = originalBodyBytes;
  for (const [name, bytesValue] of [...Object.entries(replacements), ...Object.entries(additions)]) {
    const bytes = Buffer.from(bytesValue), isNew = Object.hasOwn(additions, name);
    if (isNew) {
      try { member(header, name); throw Error(`Refusing to replace an existing new member: ${name}`); }
      catch (e) { if (!e.message.startsWith('ASAR member missing:')) throw e; }
    }
    const node = member(header, name, isNew);
    if (node.link || node.unpacked || node.files) throw Error('Cannot patch non-packed member');
    const priorHash = node.integrity?.hash ?? null;
    node.offset = String(offset); node.size = bytes.length; node.integrity = integrity(bytes, node.integrity?.blockSize);
    records.push({ path: name, added: isNew, bytes: bytes.length, priorHash, sha256: node.integrity.hash });
    offset += bytes.length; append.push(bytes);
  }
  const encoded = encodeHeader(header);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const destination = await fs.open(output, 'wx');
  const input = await fs.open(source, 'r');
  let completed = false;
  try {
    await destination.writeFile(encoded);
    const buffer = Buffer.alloc(4 * 1024 * 1024); let position = dataOffset;
    while (position < sourceStat.size) {
      const wanted = Math.min(buffer.length, sourceStat.size - position);
      const { bytesRead } = await input.read(buffer, 0, wanted, position);
      if (!bytesRead) throw Error('Unexpected archive end');
      await destination.writeFile(buffer.subarray(0, bytesRead)); position += bytesRead;
    }
    for (const bytes of append) await destination.writeFile(bytes);
    await destination.sync(); completed = true;
  } finally {
    await input.close(); await destination.close();
    if (!completed) await fs.unlink(output).catch(() => {});
  }
  for (const record of records) {
    const observed = await readAsarMember(output, record.path);
    if (integrity(observed).hash !== record.sha256) throw Error(`Patched member verification failed: ${record.path}`);
  }
  return { sourceSha256, outputSha256: await sha256File(output), originalBodyBytes, entry, members: records, securitySettingsChanged: false };
}
