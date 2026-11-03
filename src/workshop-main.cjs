'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Worker}=require('node:worker_threads');
const {Workshop}=require('./workshop-store.cjs'),pack=require('./workshop-package.cjs'),community=require('./workshop-community.cjs');
module.exports=function setup({root,dialog,load,save,state,commit=async s=>{save(s);return state()}}){
 const store=new Workshop(path.join(root,'workshop')),covers=new Map();let busy=false,remote=[];
 const url=file=>file?'app://fs/@fs/'+file.replaceAll('\\','/'):null;
 const alive=w=>{if(w.isDestroyed())throw Error('窗口已关闭，操作未提交');};
 const list=()=>{const saved=store.list();return {ok:true,catalogUrl:saved.catalogUrl,items:saved.items.map(r=>({id:r.id,...pack.metaOnly(r.manifest),kind:r.manifest.media.mime.startsWith('video/')?'video':'image',bytes:r.manifest.media.bytes,url:url(r.mediaFile),coverUrl:url(r.coverFile)||(r.manifest.media.mime.startsWith('image/')&&!r.manifest.media.file.endsWith('.gif')?url(r.mediaFile):null),favorite:r.favorite})),activeId:load().workshopId||null};};
 function job(data){return new Promise((resolve,reject)=>{let received=false;const worker=new Worker(path.join(__dirname,'workshop-worker.cjs'),{workerData:{root:store.root,...data}});const timer=setTimeout(()=>{worker.terminate();reject(Error('工坊任务超时，请重试'));},90000);worker.once('message',result=>{received=true;clearTimeout(timer);result.ok?resolve(result):reject(Error(result.error));});worker.once('error',e=>{clearTimeout(timer);reject(e);});worker.once('exit',()=>{clearTimeout(timer);if(!received)reject(Error('工坊任务未完成'));});});}
 async function choose(w,filters,title){const p=await dialog.showOpenDialog(w,{title,properties:['openFile'],filters});alive(w);return p.canceled?null:fs.realpathSync(p.filePaths[0]);}
 return async function handle(w,r){
  if(r.action==='workshop:list')return list();
  if(busy)throw Error('工坊正在处理文件，请稍候');busy=true;
  try{
   if(r.action==='workshop:import'){const file=await choose(w,[{name:'壁纸分享包',extensions:['sfwallpaper']}],'导入壁纸分享包');if(!file)return {ok:true,canceled:true};const result=await job({action:'import',file});return {...list(),id:result.id,message:result.reused?'已存在，复用本机作品':'作品已导入；选择预览后可应用'};}
   if(r.action==='workshop:cover'){const file=await choose(w,[{name:'封面图片',extensions:['png','jpg','jpeg','webp']}],'选择作品封面（4MiB以内）');if(!file)return {ok:true,canceled:true};const st=fs.statSync(file);if(!st.isFile()||st.size>pack.COVER)throw Error('封面超过4MiB');const token=crypto.randomUUID();covers.set(w.id,{token,file,expires:Date.now()+600000});return {ok:true,token,name:path.basename(file)};}
   if(r.action==='workshop:create'){const meta=pack.metadata(r.meta),s=load();if(!s.file)throw Error('请先在壁纸设置中选择视频或图片');let cover=null;if(r.coverToken){const c=covers.get(w.id);if(!c||c.token!==r.coverToken||c.expires<Date.now())throw Error('封面选择已失效，请重新选择');cover=c.file;}const result=await job({action:'create',media:s.file,meta,cover});covers.delete(w.id);return {...list(),id:result.id,message:'作品已保存到本机工坊，可导出分享'};}
   if(r.action==='workshop:apply'){await job({action:'verify',id:r.id});alive(w);const item=store.get(r.id,false),s=load();delete s.we;Object.assign(s,{file:item.mediaFile,title:item.manifest.title,enabled:true,workshopId:item.id});return {ok:true,state:await commit(s,w),message:'已应用壁纸'};}
   if(r.action==='workshop:favorite'){store.favorite(r.id,r.value);return list();}
   if(r.action==='workshop:export'){const item=store.get(r.id,false),title=item.manifest.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-');const p=await dialog.showSaveDialog(w,{title:'导出壁纸分享包',defaultPath:title+'.sfwallpaper',filters:[{name:'壁纸分享包',extensions:['sfwallpaper']}]});alive(w);if(p.canceled||!p.filePath)return {ok:true,canceled:true};await job({action:'export',id:r.id,output:p.filePath});return {ok:true,message:'分享包已导出'};}
   if(r.action==='workshop:catalog'){const value=r.url?community.httpsUrl(r.url):'';store.catalog(value);remote=[];return {...list(),remote:[],message:value?'目录地址已保存，点击刷新读取':'已关闭社区目录'};}
   if(r.action==='workshop:refresh'){const endpoint=store.settings().catalogUrl;if(!endpoint)throw Error('请先填写GitHub目录JSON地址');const b=await community.getBytes(endpoint,1024*1024);const parsed=community.catalog(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b)));remote=parsed.items;return {ok:true,remote,message:'社区目录已刷新（'+remote.length+'项）'};}
   if(r.action==='workshop:download'){const item=remote.find(x=>x.id===r.id);if(!item)throw Error('请重新刷新并选择社区作品');const bytes=await community.getBytes(item.url,item.bytes);if(bytes.length!==item.bytes||pack.sha(bytes)!==item.sha256)throw Error('下载大小或SHA256与目录不符');const file=path.join(store.root,'.download-'+crypto.randomUUID());fs.writeFileSync(file,bytes,{flag:'wx'});try{const result=await job({action:'import',file});return {...list(),id:result.id,message:'已下载到本机工坊；请预览后应用'};}finally{if(path.dirname(path.resolve(file))===path.resolve(store.root)&&path.basename(file).startsWith('.download-'))fs.unlinkSync(file);}}
   throw Error('未知工坊操作');
  }finally{busy=false;}
 };
};
