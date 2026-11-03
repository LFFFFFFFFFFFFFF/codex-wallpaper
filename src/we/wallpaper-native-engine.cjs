'use strict'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process')
const {steamRoots,plainPath,resource,hash,readChecked}=require('./wallpaper-projects.cjs')
const {QUALITY}=require('./wallpaper-quality.cjs')
function engineFrameLimit(engine,username=require('node:os').userInfo().username){
 try{const file=path.join(path.dirname(engine),'config.json'),stat=plainPath(file);if(!stat.isFile()||stat.nlink!==1||stat.size>8*1024*1024)return null;const config=JSON.parse(readChecked({target:file,stat}).toString('utf8')),fps=config[username]?.general?.user?.fps;return Number.isFinite(fps)&&fps>=1&&fps<=240?fps:null}catch{return null}
}
const run=(exe,args,options={})=>new Promise((resolve,reject)=>execFile(exe,args,{windowsHide:true,timeout:15000,maxBuffer:1024*1024,...options},(error,stdout,stderr)=>{if(!error)return resolve(stdout);const code=typeof error.code==='number'?'0x'+(error.code>>>0).toString(16):error.code || error.signal || 'unknown',failure=Error(error.killed?'Wallpaper Engine 响应超时，请重试':'Wallpaper Engine 操作失败（'+code+'），请重试');failure.code=error.code;failure.details=(stderr || stdout || '').slice(-8192);reject(failure)}))
// The engine parses RAW~ JSON itself; CRT escaping would corrupt its quotes.
const argument=value=>/[\s"]/.test(value)?'"'+value.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"':value
const propertiesArgument=values=>'RAW~('+JSON.stringify(values).replace(/[\u007e\u0029\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+')~END'
const HELPER_STAGES=Object.freeze({verify:'验证引擎',running:'检测引擎',start:'启动引擎',cache:'准备场景缓存',find:'查找场景窗口',place:'放置场景窗口',pause:'暂停场景',resume:'恢复场景',mouse:'传递鼠标位置',close:'关闭场景窗口'})
function helperFailure(error,action){
 const details=String(error.details || ''),code=typeof error.code==='number'?'0x'+(error.code>>>0).toString(16):String(error.code || 'unknown')
 const stage=HELPER_STAGES[action] || '场景辅助程序'
 const message=/about_Execution_Policies|PSSecurityException|running scripts is disabled|execution polic(?:y|ies)|禁止运行脚本/i.test(details)
  ? '系统策略阻止了场景辅助程序运行，请检查电脑的 PowerShell 管理策略。'
  : /executable signature is invalid/i.test(details)
   ? 'Wallpaper Engine 程序签名验证失败，请在 Steam 中验证安装文件后重试。'
   : action==='cache'
    ? '场景缓存初始化失败，请检查用户缓存目录的写入权限及缓存是否属于当前用户。'
    : `场景辅助程序执行失败（${stage}，${code}），请检查安装文件后重试。`
 const failure=Error(message);Object.assign(failure,{code:error.code,details:error.details,stage:action});return failure
}
function discoverEngine(roots=steamRoots()) {
 if(process.platform!=='win32')return null
 for(const workshop of roots)for(const name of ['wallpaper64.exe','wallpaper32.exe']){
  const filename=path.resolve(workshop,'../../..','common/wallpaper_engine',name)
  try{const stat=plainPath(filename);if(stat.isFile()&&stat.nlink===1)return filename}catch{}
 }
 return null
}
// Scene pixels follow the visible canvas, including Windows DPI / browser zoom.
// The render window stays fully underneath its host and never exceeds 4K.
function sceneBounds(bounds,host,screen,hostWindow,quality='original'){
 const box=screen?.dipToScreenRect?.(hostWindow,host) || host
 const width=(bounds?.width || 960)*(bounds?.scaleFactor || 1),height=(bounds?.height || 540)*(bounds?.scaleFactor || 1)
 const budget=QUALITY[quality]||QUALITY.original
 const scale=Math.min(1,budget.width/width,budget.height/height,box.width/width,box.height/height)
 return {x:Math.round(box.x),y:Math.round(box.y),width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))}
}
class NativeEngine {
 constructor({desktopCapturer,projects,screen,engine=discoverEngine(),runner=run}={}){Object.assign(this,{desktopCapturer,projects,screen,engine,runner});this.verified=null;this.windows=new Map();this.preferenceFile=projects?.root?path.join(projects.root,'.native-engine.json'):null;try{const stat=plainPath(this.preferenceFile);if(stat.isFile()&&stat.nlink===1&&stat.size<=1024&&JSON.parse(readChecked({target:this.preferenceFile,stat})).bitness===32){this.prefer32=true;const alternate=path.join(path.dirname(this.engine),'wallpaper32.exe');plainPath(alternate);this.engine=alternate}}catch{}}
 target(p){
  const win=p.hostWindow,inactive=win&&(win.isDestroyed?.()||win.isMinimized?.()||win.isVisible?.()===false)
  // Windows reports the minimized icon rectangle (often 160 x 28). It is not
  // a render target. Keep the last visible content bounds across hide/lock.
  const host=inactive?(p.lastVisibleHostBounds || win.getNormalBounds?.()):win?.getContentBounds?.()
  const valid=host&&Number.isFinite(host.width)&&Number.isFinite(host.height)&&host.width>0&&host.height>0
  if(valid&&!inactive)p.lastVisibleHostBounds={...host}
  return sceneBounds(p.bounds,valid?host:{x:0,y:0,width:p.bounds?.width || 960,height:p.bounds?.height || 540},this.screen,win,p.quality)
 }
 async helper(action,title,extra=[]){
  const shellRoot=path.join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0'),shell=path.join(shellRoot,'powershell.exe'),script=path.join(__dirname,'wallpaper-native-window.ps1').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)
  // This policy applies only to this child and our protected, bundled helper.
  // It never changes machine/user policy, and Group Policy still takes priority.
  try{return JSON.parse((await this.runner(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Action',action,'-EnginePath',this.engine,...(title?['-Title',title]:[]),...extra],{env:{...process.env,PSModulePath:path.join(shellRoot,'Modules')}})).trim())}
  catch(error){throw helperFailure(error,action)}
 }
 async verify(){if(!this.engine)throw Error('场景壁纸需要本机安装 Wallpaper Engine');const s=plainPath(this.engine),signature=[this.engine,s.size,s.mtimeMs].join(':');if(this.verified!==signature){await this.helper('verify');this.verified=signature}}
 rememberCompatibility(){if(!this.preferenceFile||this.prefer32||! /wallpaper32\.exe$/i.test(this.engine))return;const temporary=this.preferenceFile+'.'+crypto.randomUUID()+'.tmp';try{fs.mkdirSync(this.projects.root,{recursive:true});plainPath(this.projects.root);fs.writeFileSync(temporary,JSON.stringify({bitness:32}),{flag:'wx',mode:0o600});fs.renameSync(temporary,this.preferenceFile);this.prefer32=true}catch{try{fs.unlinkSync(temporary)}catch{}}}
 async running(){await this.verify();const status=await this.helper('running');if(status.running){const filename=path.resolve(status.enginePath);if(path.dirname(filename).toLowerCase()!==path.dirname(this.engine).toLowerCase()||!/^wallpaper(?:32|64)\.exe$/i.test(path.basename(filename)))throw Error('Wallpaper Engine 运行路径无效');this.engine=filename;await this.verify();this.wasRunning=true;this.rememberCompatibility()}return status}
 async ensureRunning(){
  if(this.starting)return this.starting
  const pending=(async()=>{
   if((await this.running()).running)return
   // After an observed engine exit, try the official sibling executable once.
   // Do not terminate a running engine or change its desktop/startup settings.
   if(this.wasRunning&&/wallpaper64\.exe$/i.test(this.engine)){const alternate=path.join(path.dirname(this.engine),'wallpaper32.exe');try{plainPath(alternate);this.engine=alternate;await this.verify()}catch{this.engine=path.join(path.dirname(this.engine),'wallpaper64.exe')}}
   await this.helper('start')
   for(let n=0;n<30;n++){await new Promise(r=>setTimeout(r,250));if((await this.running()).running){try{await this.rawCommand(['-control','getWallpaper']);return}catch{}}}
   throw Error('Wallpaper Engine 未能正常启动，请在 Steam 中启动后重试')
  })();this.starting=pending;try{return await pending}finally{if(this.starting===pending)this.starting=null}
 }
 async rawCommand(args){
  try{return await this.runner(this.engine,args.map(a=>a.startsWith('RAW~(')?a:argument(a)),{cwd:path.dirname(this.engine),windowsVerbatimArguments:true})}
  catch(error){
   error.stage='engine-command:'+args[1]
   if(error.code===1){const action=({openWallpaper:'打开场景窗口',getWallpaper:'读取引擎状态',applyProperties:'设置场景属性',closeWallpaper:'关闭场景窗口'})[args[1]] || '执行命令';error.message=`Wallpaper Engine 拒绝${action}（0x1）。请确认两个程序均以普通用户启动，并检查壁纸能否在原软件的「在窗口中播放」中打开。`}
   throw error
  }
 }
 async command(args){const pending=(this.commandQueue || Promise.resolve()).catch(()=>{}).then(async()=>{await this.verify();if(['openWallpaper','getWallpaper'].includes(args[1]))await this.ensureRunning();else if(!(await this.running()).running)return '';try{return await this.rawCommand(args)}catch(error){if(args[1]!=='openWallpaper'||(await this.running()).running)throw error;await this.ensureRunning();return this.rawCommand(args)}});this.commandQueue=pending;return pending}
 async properties(p){const changed=p.values;await this.command(['-control','applyProperties','-location',p.native.title,'-properties',propertiesArgument({...changed,volume:p.effectiveAudio?.muted===false?Math.round(p.effectiveAudio.volume*100):0,fps:30})])}
 async projectFile(id,metadata){
  if(typeof id!=='string'||! /^[a-f0-9]{64}$/.test(id))throw Error('场景缓存项目标识无效')
  const cacheKey=crypto.createHash('sha256').update(this.projects.root).digest('hex').slice(0,32)
  if(!this.cacheDirectory){
   // The protected helper resolves Windows known folders and the current SID.
   // Never derive a writable cache from the executable or accept a caller path.
   const result=await this.helper('cache',null,['-CacheKey',cacheKey]),directory=result?.cachePath
   if(result?.protected!==true||typeof directory!=='string'||! /^[\x20-\x7e]+$/.test(directory)||!path.isAbsolute(directory)||path.resolve(directory)!==directory||path.basename(directory)!==cacheKey||! /^CodexWECache(?:-S-1-(?:[0-9]+-)+[0-9]+)?$/.test(path.basename(path.dirname(directory))))throw Error('场景缓存目录验证失败')
   if(!plainPath(directory).isDirectory())throw Error('场景缓存不是普通目录')
   this.cacheDirectory=directory
  }
  const cache=this.cacheDirectory
  if(!plainPath(cache).isDirectory())throw Error('场景缓存不是普通目录')
  const target=path.join(cache,id)
  if(!fs.existsSync(target)){const stage=path.join(cache,'stage-'+crypto.randomUUID());fs.mkdirSync(stage);try{for(const f of metadata.files){const bytes=this.projects.read(id,f.path).data,filename=path.join(stage,...f.path.split('/'));fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes,{flag:'wx'})}fs.renameSync(stage,target)}catch(error){if(path.dirname(stage)===cache&&stage.startsWith(cache+path.sep+'stage-'))fs.rmSync(stage,{recursive:true,force:true});throw error}}
  for(const f of metadata.files){const r=resource(target,f.path);if(r.stat.size!==f.bytes||hash(readChecked(r))!==f.sha256)throw Error('场景英文路径缓存校验失败，请移除后重新导入')}
  return resource(target,'project.json').target
 }
 async open(p){
  await this.verify();const metadata=this.projects.get(p.projectId);if(metadata.type!=='scene')throw Error('不是受管理的场景壁纸')
  for(const f of metadata.files)this.projects.info(p.projectId,f.path)
  const file=await this.projectFile(p.projectId,metadata),title='Codex WE Scene '+p.token
  if(p.closed)throw Error('场景预览已取消')
  const initial=this.target(p);p.sourceFpsLimit=engineFrameLimit(this.engine);p.native={title,width:initial.width,height:initial.height};this.windows.set(title,p)
  try{
   await this.command(['-control','openWallpaper','-file',file,'-playInWindow',title,'-width',String(initial.width),'-height',String(initial.height),'-x',String(initial.x),'-y',String(initial.y),'-borderless','1','-activate','0'])
   for(let n=0;n<16;n++){
    if(this.windows.get(title)!==p)throw Error('场景预览已取消')
    // Position as soon as the HWND exists. Property commands can be slow; do
    // not leave the engine's initial decorated rectangle exposed meanwhile.
    const owned=await this.helper('place',title,['-X',String(initial.x),'-Y',String(initial.y),'-Width',String(initial.width),'-Height',String(initial.height)])
    // WGC opens the verified HWND directly; Chromium's window picker can omit
    // an occluded engine window while successive previews are being created.
    if(owned.found){p.native.sourceId='window:'+owned.handle+':0';if(owned.x===initial.x&&owned.y===initial.y&&owned.width===initial.width&&owned.height===initial.height)p.nativePosition=[initial.x,initial.y,initial.width,initial.height].join(':');await this.properties(p);return p.native.sourceId}
    await new Promise(r=>setTimeout(r,250))
   }
   throw Error('未找到场景渲染窗口；请确认 Wallpaper Engine 正在运行后重试')
  }catch(error){await this.close(p);throw error}
 }
 close(p){
  const title=p.native?.title;if(!title)return Promise.resolve()
  if(p.nativeClosing)return p.nativeClosing
  p.nativeClosing=(async()=>{
   try{await this.command(['-control','closeWallpaper','-location',title])}catch{}
   // The CLI can return before its server removes the HWND, or reject a command
   // during shutdown. Confirm closure, then use only the exact verified window.
   for(let n=0;n<3;n++){
    const owned=await this.helper('find',title)
    if(!owned.found){this.windows.delete(title);return}
    if(n===0)await new Promise(resolve=>setTimeout(resolve,150))
    else await this.helper('close',title)
   }
   if((await this.helper('find',title)).found)throw Error('场景窗口关闭未确认，可能仍占用显卡；请正常重启 Wallpaper Engine 后重试。')
   this.windows.delete(title)
  })()
  void p.nativeClosing.catch(()=>{p.nativeClosing=null})
  return p.nativeClosing
 }
 async place(p){
  if(!p.native||this.windows.get(p.native.title)!==p)return
  if(p.hostWindow&&(p.hostWindow.isDestroyed?.()||p.hostWindow.isMinimized?.()||p.hostWindow.isVisible?.()===false))return
  if(p.nativePlacing){p.nativePlaceAgain=true;return}
  const b=this.target(p),key=[b.x,b.y,p.native.width,p.native.height].join(':');if(key===p.nativePosition)return
  p.nativePlacing=true
  try{
   const result=await this.helper('place',p.native.title,['-X',String(b.x),'-Y',String(b.y),'-Width',String(p.native.width),'-Height',String(p.native.height)])
   // A queued pause may minimize the scene during the native call. Do not
   // cache success for an iconic rectangle or a placement that did not stick.
   p.nativePosition=result?.found&&!result.minimized&&result.width===p.native.width&&result.height===p.native.height?key:null
  }finally{p.nativePlacing=false;if(p.nativePlaceAgain){p.nativePlaceAgain=false;await this.place(p)}}
 }
 async paused(p,value){if(!p.native||this.windows.get(p.native.title)!==p)return;await this.helper(value?'pause':'resume',p.native.title);if(!value){p.nativePosition=null;await this.place(p)}}
 async mouse(p,x,y){if(p.native)await this.helper('mouse',p.native.title,['-X',String(Math.round(x*(p.native.width-1))),'-Y',String(Math.round(y*(p.native.height-1)))])}
}
module.exports={NativeEngine,discoverEngine,sceneBounds,engineFrameLimit}
