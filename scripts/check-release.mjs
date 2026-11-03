import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {releaseFiles} from './release-list.mjs';
export async function checkFiles(root,files){
 const errors=[];for(const file of files){
  if(/(^|\/)(?:runtime|profiles?|profile-[^/]+|wallpaper-data|wallpapers|workshop|inspection|verification|node_modules|\.git|\.local[^/]*|\.release)(\/|$)/i.test(file)||/\.(?:exe|dll|asar|pak|bin|mp4|webm|glb|png|jpe?g|webp|gif|zip|sfwallpaper|sqlite\w*)$/i.test(file)||/(^|\/)(?:auth\.json|cookies|login data|local state|last-launch\.json)$/i.test(file))errors.push(file+': generated/private/binary file');
  const bytes=await fs.readFile(path.join(root,file));if(bytes.length>300000||bytes.includes(0))errors.push(file+': binary or oversized content');const text=bytes.toString();
  if(/[A-Z]:[\\/](?:Users[\\/][^\s"'<>]+|SkinForge[^\s"'<>]*|AI[\\/])/i.test(text))errors.push(file+': private machine path');
  if(/\b(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{30,})\b/.test(text)||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))errors.push(file+': possible secret');
  if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text))errors.push(file+': email address must be reviewed before source release');
 }return errors;
}
export async function audit(root){const files=await releaseFiles(root),errors=await checkFiles(root,files);try{const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\0').filter(Boolean);for(const file of tracked)if(!files.includes(file))errors.push(file+': tracked but not release-allowlisted');}catch{/* A freshly unpacked source ZIP has no .git directory. */}if(errors.length)throw Error(errors.join('\n'));return {ok:true,files:files.length,mode:'allowlisted text source; heuristic secret scan; no runtime/media/profile',remoteUpload:false};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))audit(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});
