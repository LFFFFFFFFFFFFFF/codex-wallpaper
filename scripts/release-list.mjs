import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
export async function releaseFiles(root){
 const list=JSON.parse(await fs.readFile(path.join(root,'release-files.json'),'utf8'));
 assert(Array.isArray(list)&&list.length>0&&new Set(list).size===list.length,'Invalid release file list');
 for(const file of list){assert(typeof file==='string'&&!file.includes('\\')&&!file.split('/').some(x=>['','..','.'].includes(x))&&!path.isAbsolute(file),'Unsafe release path');const st=await fs.lstat(path.join(root,file));assert(st.isFile()&&!st.isSymbolicLink(),'Release files must be ordinary files');}
 return list.sort();
}
