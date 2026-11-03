'use strict';
const fs=require('node:fs'),path=require('node:path'),{Worker}=require('node:worker_threads');
const {WallpaperProjects,resource}=require('./we/wallpaper-projects.cjs'),{WallpaperRuntime,SCHEME}=require('./we/wallpaper-runtime.cjs');
module.exports=function setup({electron,root,load,save,state,commit=async s=>{save(s);return state()}}){
 const {app,protocol,dialog}=electron;
 if(!app.isReady())protocol.registerSchemesAsPrivileged([{scheme:SCHEME,privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
 const library=new WallpaperProjects(path.join(root,'we-projects'));let runtime,busy=false,quitting=false;
 const captureReady=()=>fs.existsSync(path.join(process.resourcesPath||path.join(root,'runtime','resources'),'codex-we-window-capture.exe'));
 const getRuntime=async()=>{await app.whenReady();return runtime ||= new WallpaperRuntime({BrowserWindow:electron.BrowserWindow,session:electron.session,powerMonitor:electron.powerMonitor,desktopCapturer:electron.desktopCapturer,nativeImage:electron.nativeImage,screen:electron.screen,projects:library});};
 function importSource(source){return new Promise((resolve,reject)=>{let received=false;const worker=new Worker(path.join(__dirname,'we-worker.cjs'),{workerData:{store:library.root,source}});const timer=setTimeout(()=>{worker.terminate();reject(Error('WE资源检查超时，请换一个作品重试'));},120000);worker.once('message',r=>{received=true;clearTimeout(timer);r.ok?resolve(r):reject(Error(r.error));});worker.once('error',e=>{clearTimeout(timer);reject(e);});worker.once('exit',()=>{clearTimeout(timer);if(!received)reject(Error('WE资源检查未完成'));});});}
 app.on('before-quit',e=>{if(runtime&&!quitting){e.preventDefault();quitting=true;void runtime.destroy().finally(()=>app.quit());}});
 return async function handle(w,r){
  if(r.action==='we:runtime'){
   const allowed=['open','close','ack','pause','bounds','mouse','audio','properties','diagnostics','diagnostics-start'];if(!allowed.includes(r.payload?.action))throw Error('未知WE播放操作');
   const payload={...r.payload,slot:'background'};if(payload.action==='open'){const s=load();if(!s.enabled||s.we?.projectId!==payload.projectId)throw Error('WE壁纸已切换');payload.quality=s.quality==='original'?'original':'smooth';payload.audio={muted:s.muted!==false,volume:Number.isFinite(s.volume)?s.volume:.5};payload.properties=s.we.properties||{};if(s.we.type==='scene'&&!captureReady())throw Error('缺少WE场景画面接收器，请构建原生辅助工具');}
   return (await getRuntime()).action(w.webContents,payload);
  }
  if(r.action==='we:metadata'){const s=load();if(!s.we)return {ok:true,properties:{},values:{}};return {ok:true,type:s.we.type,projectId:s.we.projectId,properties:library.get(s.we.projectId).properties,values:s.we.properties||{},domains:s.we.type==='web'?library.domains(s.we.projectId):[]};}
  if(r.action==='we:domains'){const s=load();if(s.we?.type!=='web'||s.we.projectId!==r.projectId)throw Error('网页壁纸已切换');library.domains(r.projectId,r.domains);await (await getRuntime()).refreshProject(r.projectId);return {ok:true};}
  if(r.action==='we:setProperties'){const s=load();if(!s.we||s.we.projectId!==r.projectId)throw Error('壁纸已切换，请重新打开参数');const {validateValues}=require('./we/wallpaper-projects.cjs');const values=validateValues(library.get(s.we.projectId).properties,r.values);const player=(await getRuntime()).players.get(w.webContents.id+':background');if(!player)throw Error('请先启动WE壁纸');const result=await runtime.action(w.webContents,{action:'properties',slot:'background',token:player.token,properties:values});if(!result.ok)throw Error(result.error);s.we.properties={...(s.we.properties||{}),...values};save(s);return {ok:true,state:state()};}
  if(busy)throw Error('正在检查WE作品，请稍候');busy=true;
  try{
   if(r.action==='we:scan')return {ok:true,rows:library.scan(),captureReady:captureReady()};
   if(r.action==='we:pick'){const result=await dialog.showOpenDialog(w,{title:'选择含 project.json 的WE作品文件夹',properties:['openDirectory']});if(result.canceled)return {ok:true,canceled:true};return {ok:true,row:library.candidate(result.filePaths[0]),captureReady:captureReady()};}
   if(r.action==='we:apply'){
    const source=library.source(r.id);if(!source.supported)throw Error(source.reason);if(source.type==='scene'&&!captureReady())throw Error('缺少WE场景画面接收器');
    let result;if(source.type==='video')result={type:'video',file:resource(source.root,source.entry).target,title:source.title};else result=await importSource(source.root);
    if(w.isDestroyed())throw Error('窗口已关闭');const s=load();delete s.workshopId;if(result.type==='video'){delete s.we;s.file=result.file;}else{s.file=null;s.we={projectId:result.projectId,type:result.type,title:result.title};}s.title=result.title;s.enabled=true;return {ok:true,state:await commit(s,w)};
   }
   throw Error('未知WE壁纸操作');
  }finally{busy=false;}
 };
};
