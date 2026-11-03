'use strict';
const {app,ipcMain,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const appearance=require('./wallpaper-appearance.cjs');
const CHANNEL='skinforge-latest-wallpaper-v1';
const ROOT=path.resolve(process.resourcesPath,'../..');
const DATA=path.join(ROOT,'wallpaper-data'),CONFIG=path.join(DATA,'settings.json');
const {createVideoPlayback,localURL}=require('./video-playback.cjs');
const video=createVideoPlayback({root:ROOT,resourcesPath:process.resourcesPath});app.on('before-quit',()=>video.close());
fs.mkdirSync(DATA,{recursive:true});
const digest=file=>{const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),b=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,b,0,b.length,null)))h.update(b.subarray(0,n));return h.digest('hex');}finally{fs.closeSync(fd);}};
function load(){try{return JSON.parse(fs.readFileSync(CONFIG,'utf8'));}catch{return {version:1,enabled:false,file:null,fit:'cover',shade:0.32,muted:true};}}
function save(s){const tmp=CONFIG+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s,null,2));fs.renameSync(tmp,CONFIG);}
function state(){const s=load();if(s.we)return {...s,kind:'we',url:null,title:s.we.title};if(s.file&&!fs.existsSync(s.file))return {...s,file:null,error:'壁纸文件不存在，请重新选择'};const ext=path.extname(s.file||'').toLowerCase(),file=s.playback&&s.playback.source===s.file&&fs.existsSync(s.playback.file)?s.playback.file:s.file;return {...s,kind:['.mp4','.webm'].includes(ext)?'video':'image',url:file?localURL(file):null,title:s.title||path.basename(s.file||'未选择壁纸')};}
function owner(e){try{const w=BrowserWindow.fromWebContents(e.sender),u=new URL(e.sender.getURL());return w&&e.senderFrame===e.sender.mainFrame&&u.protocol==='app:'&&u.host==='-'&&u.pathname==='/index.html'?w:null;}catch{return null;}}
const pending=new Set();
const commit=async(s,w)=>{await video.prepare(s);if(w?.isDestroyed())throw Error('窗口已关闭，操作未提交');save(s);return state()};
const workshop=require('./workshop-main.cjs')({root:ROOT,dialog,load,save,state,commit});
const we=require('./we-main.cjs')({electron:require('electron'),root:ROOT,load,save,state,commit});
let queue=Promise.resolve();
async function handle(e,r){
 try{
 const w=owner(e);if(!w)throw Error('只允许本应用主界面操作壁纸');
 if(typeof r?.action==='string'&&r.action.startsWith('we:'))return await we(w,r);
 if(typeof r?.action==='string'&&r.action.startsWith('workshop:'))return await workshop(w,r);
 if(r?.action==='read'){
  try{return {ok:true,state:await commit(load(),w)}}catch(error){const s=state();if(s.kind!=='video')throw error;return {ok:true,state:{...s,url:s.file?localURL(s.file):null,playback:{quality:'original',notice:'播放副本未就绪，当前播放原视频：'+error.message},error:'副本准备失败，可切回原文件或重新配置 FFmpeg。'}}}
 }
 if(r?.action==='video:tool'){const p=await dialog.showOpenDialog(w,{title:'选择 FFmpeg 转码工具',properties:['openFile'],filters:[{name:'FFmpeg',extensions:['exe']}]});if(p.canceled)return {ok:true,canceled:true};await video.configure(p.filePaths[0]);return {ok:true,state:await commit(load(),w)};}
 if(r?.action==='pick'){
  if(pending.has(w.id))return {ok:false,error:'文件选择器已经打开'};pending.add(w.id);
  try{const p=await dialog.showOpenDialog(w,{title:'选择以前制作的动态壁纸或图片',properties:['openFile'],filters:[{name:'壁纸视频与图片',extensions:['mp4','webm','png','jpg','jpeg','webp','gif']}]});if(p.canceled)return {ok:true,canceled:true};
   const file=fs.realpathSync(p.filePaths[0]),st=fs.statSync(file),ext=path.extname(file).toLowerCase();if(!st.isFile()||st.size>512*1024*1024||!['.mp4','.webm','.png','.jpg','.jpeg','.webp','.gif'].includes(ext))throw Error('文件类型或大小不支持');
   const target=path.join(DATA,digest(file)+ext);if(!fs.existsSync(target))fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);const s=load();delete s.we;delete s.workshopId;s.file=target;s.title=path.basename(file);s.enabled=true;return {ok:true,state:await commit(s,w)};
  }finally{pending.delete(w.id);}
 }
 if(r?.action==='set'){
  const s=load();Object.assign(s,appearance.update(s,r));if(typeof r.enabled==='boolean')s.enabled=r.enabled;if(['cover','contain'].includes(r.fit))s.fit=r.fit;if(Number.isFinite(r.shade)&&r.shade>=0&&r.shade<=0.85)s.shade=r.shade;if(typeof r.muted==='boolean')s.muted=r.muted;if(typeof r.paused==='boolean')s.paused=r.paused;if(Number.isFinite(r.volume)&&r.volume>=0&&r.volume<=1)s.volume=r.volume;if(['smooth','original','performance'].includes(r.quality)){if(r.quality==='performance'&&s.we)throw Error('720p性能档仅用于视频');s.quality=r.quality;}if(typeof r.mouseInteraction==='boolean')s.mouseInteraction=r.mouseInteraction;return {ok:true,state:await commit(s,w)};
 }
 throw Error('未知壁纸操作');
 }catch(error){return {ok:false,error:error.message||'壁纸操作失败'};}
}
ipcMain.handle(CHANNEL,(e,r)=>{
 // Frame ACK/mouse/diagnostics must never wait behind a video conversion.
 if(r?.action==='we:runtime'||r?.action==='we:metadata')return handle(e,r);
 const next=queue.catch(()=>{}).then(()=>handle(e,r));queue=next;return next;
});
