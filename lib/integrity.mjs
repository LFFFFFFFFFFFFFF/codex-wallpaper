// Repackage the cloned executable's existing ASAR header digest.
// No fuse, sandbox, CSP, DevTools, trust store, or validation branch is changed.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';


const digest = data => crypto.createHash('sha256').update(data).digest('hex');
async function headerDigest(filename) {
  const handle = await fs.open(filename, 'r');
  try {
    const prefix = Buffer.alloc(16);
    if ((await handle.read(prefix, 0, 16, 0)).bytesRead !== 16) throw Error('Invalid ASAR header');
    const length = prefix.readUInt32LE(12);
    if (length < 2 || length > 64 * 1024 * 1024) throw Error('Invalid header length');
    const json = Buffer.alloc(length);
    if ((await handle.read(json, 0, length, 16)).bytesRead !== length) throw Error('Incomplete header');
    JSON.parse(json.toString('utf8'));
    return digest(json);
  } finally { await handle.close(); }
}

export async function updateIntegrityResource({ originalExe, originalArchive, archive, output }) {
  if (path.resolve(originalExe).toLowerCase() === path.resolve(output).toLowerCase()) throw Error('Never alter the original executable');
  const oldHash = await headerDigest(originalArchive), newHash = await headerDigest(archive);
  const original = await fs.readFile(originalExe);
  const originalRecord = Buffer.from(JSON.stringify([{ file: 'resources\\app.asar', alg: 'SHA256', value: oldHash }]));
  const index = original.indexOf(originalRecord);
  if (index < 0 || original.indexOf(originalRecord, index + 1) >= 0) throw Error('Expected exactly one existing ASAR integrity resource');
  const newRecord = Buffer.from(JSON.stringify([{ file: 'resources\\app.asar', alg: 'SHA256', value: newHash }]));
  if (newRecord.length !== originalRecord.length) throw Error('Resource size changed');
  const modified = Buffer.from(original); newRecord.copy(modified, index);
  for (let i = 0; i < original.length; i++) {
    if (i < index || i >= index + originalRecord.length) {
      if (original[i] !== modified[i]) throw Error('Executable bytes outside the existing integrity record changed');
    }
  }
  await fs.writeFile(output, modified);
  const reread = await fs.readFile(output);
  if (!reread.equals(modified)) throw Error('Executable output verification failed');
  return { originalExecutableSha256: digest(original), customExecutableSha256: digest(modified), oldHeaderSha256: oldHash, newHeaderSha256: newHash, resourceOffset: index, originalSignaturePreserved: false, integrityValidationDisabled: false, resourceRecordBytes: originalRecord.length };
}
