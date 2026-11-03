import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),pack=require('../src/workshop-package.cjs'),community=require('../src/workshop-community.cjs');
const [command,...args]=process.argv.slice(2),options={};
try{
 for(let i=0;i<args.length;i+=2){if(!/^--[a-z-]+$/.test(args[i])||args[i+1]===undefined)throw Error('Expected --option value');options[args[i].slice(2)]=args[i+1];}
 const allowed=command==='package'?['media','out','title','author','description','tags','license','cover']:command==='catalog-entry'?['file','id','url']:['file'];if(Object.keys(options).some(x=>!allowed.includes(x)))throw Error('Unknown option');
 async function read(file,max){if(!file)throw Error('Missing file option');const st=await fs.stat(file);if(!st.isFile()||st.size>max)throw Error('File exceeds format limit');return fs.readFile(file);}
 if(command==='package'){
  if(!options.out)throw Error('Missing --out');const media=await read(options.media,pack.MAX),cover=options.cover?await read(options.cover,pack.COVER):null;
  const meta={title:options.title,author:options.author||'',description:options.description||'',tags:(options.tags||'').split(',').filter(Boolean).map(x=>x.trim()),license:options.license||'All-Rights-Reserved'};
  const result=pack.create(meta,media,path.extname(options.media).toLowerCase(),cover,options.cover?path.extname(options.cover).toLowerCase():null);await fs.writeFile(options.out,result.bytes,{flag:'wx'});console.log(JSON.stringify({id:result.id,bytes:result.bytes.length,sha256:pack.sha(result.bytes)}));
 }else if(command==='inspect'||command==='catalog-entry'){
  const bytes=await read(options.file,pack.MAX+pack.COVER+65536),p=pack.inspect(bytes);
  if(command==='inspect')console.log(JSON.stringify({id:p.id,sha256:pack.sha(bytes),bytes:bytes.length,manifest:p.manifest},null,2));
  else{const item={...pack.metaOnly(p.manifest),id:options.id,url:options.url,sha256:pack.sha(bytes),bytes:bytes.length};console.log(JSON.stringify(community.catalog({format:'skinforge.wallpaper-catalog',version:1,items:[item]}).items[0],null,2));}
 }else if(command==='validate-catalog'){const b=await read(options.file,1024*1024),c=community.catalog(JSON.parse(b));console.log(JSON.stringify({ok:true,items:c.items.length}));}
 else throw Error('Usage: node scripts/workshop.mjs package --media FILE --out FILE --title TITLE [--author NAME --license CC0-1.0 --tags a,b --cover FILE] | inspect --file FILE | catalog-entry --file FILE --id SLUG --url HTTPS_URL | validate-catalog --file FILE');
}catch(error){console.error(error.message);process.exitCode=1;}
