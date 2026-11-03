'use strict';
const {parentPort,workerData:r}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),{Workshop}=require('./workshop-store.cjs'),pack=require('./workshop-package.cjs');
try{const store=new Workshop(r.root);let result;
 if(r.action==='import'){const st=fs.statSync(r.file);if(!st.isFile()||st.size>pack.MAX+pack.COVER+65536)throw Error('分享包过大');result=store.import(fs.readFileSync(r.file));}
 else if(r.action==='create'){const st=fs.statSync(r.media);if(!st.isFile()||st.size>pack.MAX)throw Error('壁纸大于128MiB分享上限');if(r.cover&&fs.statSync(r.cover).size>pack.COVER)throw Error('封面超过4MiB');const value=store.create(r.meta,fs.readFileSync(r.media),path.extname(r.media).toLowerCase(),r.cover?fs.readFileSync(r.cover):null,r.cover?path.extname(r.cover).toLowerCase():null);result={id:value.id,reused:value.reused};}
 else if(r.action==='export'){const bytes=store.export(r.id),temp=r.output+'.'+require('node:crypto').randomUUID()+'.tmp';try{fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,r.output);}finally{if(fs.existsSync(temp)&&path.dirname(path.resolve(temp))===path.dirname(path.resolve(r.output)))fs.unlinkSync(temp);}result={bytes:bytes.length};}
 else if(r.action==='verify'){store.get(r.id);result={id:r.id};}
 else throw Error('未知工坊任务');parentPort.postMessage({ok:true,...result});
}catch(e){parentPort.postMessage({ok:false,error:e.message});}
