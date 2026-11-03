'use strict'

const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const dns = require('node:dns')
const https = require('node:https')
const net = require('node:net')
const { Readable } = require('node:stream')
const { WallpaperDiagnostics } = require('./wallpaper-diagnostics.cjs')
const {quality:sceneQuality}=require('./wallpaper-quality.cjs')
const { validateValues, openChecked, readChecked } = require('./wallpaper-projects.cjs')
const SCHEME = 'skinforge-wallpaper'
function publicAddress(address) {
  if (net.isIP(address) === 4) {const b=address.split('.').map(Number);return !(b[0]===0||b[0]===10||b[0]===127||b[0]>=224||b[0]===169&&b[1]===254||b[0]===172&&b[1]>=16&&b[1]<=31||b[0]===192&&(b[1]===168||b[1]===0)||b[0]===100&&b[1]>=64&&b[1]<=127||b[0]===198&&(b[1]===18||b[1]===19))}
  if(net.isIP(address)===6)return /^2[0-9a-f]{3}:/i.test(address)&&!/^2001:(?:db8|0):/i.test(address)
  return false
}
function remoteResponse(request, domains) {
  return new Promise(resolve=>{
    let url;try{url=new URL(request.url);if(url.protocol!=='https:'||url.port&&url.port!=='443'||url.username||url.password||!domains.includes(url.hostname)||!['GET','HEAD','POST'].includes(request.method))throw Error()}catch{resolve(new Response('未授权的网络请求',{status:403}));return}
    // Pin the actual connection to a checked DNS result. Never use Chromium's
    // unchecked resolution or forward cookies / authorization from other sessions.
    dns.lookup(url.hostname,{all:true},async(error,addresses)=>{
      if(error||!addresses?.length||addresses.some(a=>!publicAddress(a.address))){resolve(new Response('禁止访问本机或私有网络',{status:403}));return}
      let body=null
      try{if(request.method==='POST'){body=Buffer.from(await request.arrayBuffer());if(body.length>1024*1024)throw Error()}}catch{resolve(new Response('请求过大',{status:413}));return}
      const headers={};for(const key of ['accept','content-type','origin','referer','range']){const v=request.headers.get(key);if(v)headers[key]=v}
      const selected=addresses[0]
      const outgoing=https.request(url,{method:request.method,headers,agent:false,lookup:(_hostname,options,callback)=>callback(null,options?.all?[selected]:selected.address,selected.family)},incoming=>{
        const responseHeaders=new Headers();for(const [key,value] of Object.entries(incoming.headers))if(value!==undefined&&!['set-cookie','connection','transfer-encoding','content-length'].includes(key))responseHeaders.set(key,Array.isArray(value)?value.join(', '):value)
        const status=incoming.statusCode || 502
        if(request.method==='HEAD'||[204,205,304].includes(status)){incoming.resume();resolve(new Response(null,{status,headers:responseHeaders}))}
        else resolve(new Response(Readable.toWeb(incoming),{status,headers:responseHeaders}))
      })
      outgoing.setTimeout(15000,()=>outgoing.destroy());outgoing.on('error',()=>resolve(new Response('网络资源不可用',{status:502})));if(body)outgoing.write(body);outgoing.end()
    })
  })
}
function shim(values) {
  return `<script>(()=>{let listener=null,paused=false;const values=${JSON.stringify(values).replace(/</g,'\\u003c')};const call=(name,value)=>{try{listener?.[name]?.(value)}catch{}};const initial=()=>{call('applyGeneralProperties',{fps:30});call('applyUserProperties',Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{value:v}])));call('setPaused',paused)};Object.defineProperty(window,'wallpaperPropertyListener',{configurable:true,get:()=>listener,set:value=>{listener=value;queueMicrotask(initial)}});window.wallpaperRegisterAudioListener=callback=>{if(typeof callback==='function')queueMicrotask(()=>callback(Array(128).fill(0)))};window.wallpaperRegisterMediaPropertiesListener=()=>{};window.wallpaperRegisterMediaPlaybackListener=()=>{};window.wallpaperRegisterMediaTimelineListener=()=>{};window.__skinforgeWallpaperUpdate=(next,stop)=>{paused=stop;call('applyUserProperties',Object.fromEntries(Object.entries(next).map(([k,v])=>[k,{value:v}])));call('setPaused',paused)};document.addEventListener('DOMContentLoaded',initial,{once:true})})()</script>`
}
function audioSettings(value){
  if(value===undefined)return {muted:true,volume:.5}
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.muted!=='boolean'||!Number.isFinite(value.volume)||value.volume<0||value.volume>1)throw Error('壁纸声音设置无效')
  return {muted:value.muted,volume:value.volume}
}
// This runs inside the isolated wallpaper, with no preload, Node, or host IPC.
// Scale HTML media and Web Audio at their output; never capture system sound.
function installAudioShim(initial){
  let sound=initial
  const media=new Set(),references=new WeakMap(),base=new WeakMap(),routed=new WeakSet(),gains=new WeakMap(),outputs=new Set()
  const proto=window.HTMLMediaElement?.prototype,volume=proto&&Object.getOwnPropertyDescriptor(proto,'volume')
  const gainValue=()=>sound.muted?0:sound.volume
  const updateMedia=node=>{if(!volume)return;if(!base.has(node))base.set(node,volume.get.call(node));if(!references.has(node)){const ref=new WeakRef(node);references.set(node,ref);media.add(ref)}volume.set.call(node,base.get(node)*(routed.has(node)?1:gainValue()))}
  if(volume?.configurable)Object.defineProperty(proto,'volume',{...volume,get(){return base.has(this)?base.get(this):volume.get.call(this)},set(value){volume.set.call(this,value);base.set(this,volume.get.call(this));updateMedia(this)}})
  const connect=window.AudioNode?.prototype.connect,disconnect=window.AudioNode?.prototype.disconnect
  const master=context=>{if(!gains.has(context)){const gain=context.createGain();gain.gain.value=gainValue();gains.set(context,gain);outputs.add(new WeakRef(gain));connect.call(gain,context.destination)}return gains.get(context)}
  if(connect){window.AudioNode.prototype.connect=function(destination,...args){const output=destination===this.context.destination?master(this.context):destination,result=connect.call(this,output,...args);return result===output?destination:result};window.AudioNode.prototype.disconnect=function(...args){if(args[0]===this.context.destination&&gains.has(this.context))args[0]=gains.get(this.context);return disconnect.apply(this,args)}}
  for(const constructor of new Set([window.AudioContext,window.webkitAudioContext].filter(Boolean))){const original=constructor.prototype.createMediaElementSource;if(original)constructor.prototype.createMediaElementSource=function(node){const result=original.call(this,node);routed.add(node);updateMedia(node);return result}}
  if(window.Audio)window.Audio=new Proxy(window.Audio,{construct(target,args,newTarget){const node=Reflect.construct(target,args,newTarget);updateMedia(node);return node}})
  const scan=()=>{for(const node of document.querySelectorAll('audio,video'))updateMedia(node)}
  document.addEventListener('play',event=>updateMedia(event.target),true)
  document.addEventListener('DOMContentLoaded',()=>{scan();new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true})},{once:true})
  window.__skinforgeWallpaperAudio=next=>{sound=next;for(const ref of media){const node=ref.deref();if(node)updateMedia(node);else media.delete(ref)}for(const ref of outputs){const gain=ref.deref();if(gain)gain.gain.value=gainValue();else outputs.delete(ref)}}
}
class WallpaperRuntime {
  constructor({BrowserWindow,session,projects,powerMonitor,desktopCapturer,nativeImage,screen}) {Object.assign(this,{BrowserWindow,session,projects,nativeImage});this.nativeEngine=new (require('./wallpaper-native-engine.cjs').NativeEngine)({desktopCapturer,projects,screen});this.players=new Map();this.revisions=new Map();this.locked=false;this.onLock=()=>{this.locked=true;for(const p of this.players.values())this.reconcile(p)};this.onUnlock=()=>{this.locked=false;for(const p of this.players.values()){this.reconcile(p);this.resizeScene(p)}};powerMonitor?.on('lock-screen',this.onLock);powerMonitor?.on('unlock-screen',this.onUnlock);powerMonitor?.on('suspend',this.onLock);powerMonitor?.on('resume',this.onUnlock);this.powerMonitor=powerMonitor}
  key(host,slot) {
    // Electron's id getter is unavailable during the destroyed event. Retain
    // the identity from opening the slot so shutdown can still drain it.
    this.hostIds ||= new WeakMap()
    if(!this.hostIds.has(host))this.hostIds.set(host,host.id)
    return this.hostIds.get(host)+':'+slot
  }
  beginDiagnostics(p) {
    this.diagnostics ||= new WallpaperDiagnostics()
    p.generation=this.nextGeneration=(this.nextGeneration || 0)+1
    this.diagnostics.begin(p)
    this.scheduleDiagnostics(p)
  }
  scheduleDiagnostics(p) {
    clearInterval(p.diagnosticTimer)
    p.diagnosticTimer=setInterval(()=>{this.diagnostics.sample(p);if(!this.diagnostics.active(p))clearInterval(p.diagnosticTimer)},1000)
    p.diagnosticTimer.unref?.()
  }
  trackCleanup(pending) {
    this.pendingCleanup ||= new Set()
    const tracked=Promise.resolve(pending);this.pendingCleanup.add(tracked)
    // Host destruction starts cleanup before will-quit. Keep it reachable after
    // its player has left the map, including a native open still in progress.
    void tracked.finally(()=>this.pendingCleanup.delete(tracked)).catch(()=>{})
    return tracked
  }
  owns(contents) {return [...this.players.values()].some(p=>p.win?.webContents===contents)}
  async refreshProject(id) {for(const p of [...this.players.values()].filter(p=>p.projectId===id)){const payload={slot:p.slot,projectId:id,token:p.clientToken,properties:p.values,paused:p.paused,audio:p.audio,bounds:p.bounds,quality:p.quality};const host=p.host;this.close(host,p.slot);if(!host.isDestroyed())await this.open(host,payload)}}
  close(host,slot) {
    const key=this.key(host,slot),p=this.players.get(key);this.revisions.set(key,(this.revisions.get(key) || 0)+1);
    this.closingByKey ||= new Map();this.orphanedByKey ||= new Map();
    if(!p){if(this.closingByKey.has(key))return this.closingByKey.get(key);const orphan=this.orphanedByKey.get(key);return orphan?this.finishClose(key,orphan):undefined}
    this.diagnostics?.event(p,'close');if(!p.hostWindow?.isDestroyed?.())this.diagnostics?.sample(p);this.diagnostics?.end(p);clearInterval(p.diagnosticTimer);this.players.delete(key);p.closed=true;this.reconcileAudio();clearTimeout(p.timeout);clearTimeout(p.ackTimeout);clearTimeout(p.resizeTimer);host.removeListener('destroyed',p.destroy);for(const name of ['hide','minimize','show','restore','move','resize'])p.hostWindow?.removeListener(name,p.hostChange);
    const closing=this.finishClose(key,p);p.win?.destroy();if(!p.captureScene){p.session.protocol.unhandle(SCHEME);p.session.protocol.unhandle('https')}return closing;
  }
  finishClose(key,p){
    const closing=this.trackCleanup(Promise.all([p.capture?.destroy(),p.native?this.nativeEngine.close(p):undefined]));this.closingByKey.set(key,closing);
    void closing.then(()=>{if(this.closingByKey.get(key)===closing){this.closingByKey.delete(key);this.orphanedByKey.delete(key)}},()=>{if(this.closingByKey.get(key)===closing){this.closingByKey.delete(key);this.orphanedByKey.set(key,p)}});return closing;
  }
  send(p,event,payload) {if(!p.host.isDestroyed()&&this.players.get(p.key)===p)p.host.send(event,{slot:p.slot,token:p.token,clientToken:p.clientToken,generation:p.generation,...payload})}
  state(p,status,error='') {if(status!==p.lastStatus)this.diagnostics?.event(p,status);p.lastStatus=status;if(error)p.lastError=error;this.reconcileAudio();this.send(p,'codex-we:state',{status,error,projectId:p.projectId,phase:p.phase,sourceFpsLimit:p.sourceFpsLimit??null})}
  reconcileAudio(){
    const active=[...this.players.values()].filter(p=>p.ready&&p.lastStatus==='playing'&&!p.paused&&!p.resizePending&&!this.locked&&(!p.hostWindow||!p.hostWindow.isDestroyed?.()&&p.hostWindow.isVisible()&&!p.hostWindow.isMinimized())&&p.audio?.muted===false)
    const owner=active.filter(p=>p.slot==='library').at(-1) || active.at(-1)
    for(const p of [...this.players.values()].filter(p=>p!==owner).concat(owner?[owner]:[])){
      if(!p.audio)continue
      const sound={muted:p!==owner,volume:p.audio?.volume ?? .5},key=JSON.stringify(sound)
      if(p.audioKey===key)continue;p.audioKey=key;p.effectiveAudio=sound
      if(p.native)p.audioQueue=(p.audioQueue || Promise.resolve()).then(()=>this.players.get(p.key)===p?this.nativeEngine.properties(p):null).catch(error=>this.state(p,'error',error.message))
      else if(p.win&&!p.win.isDestroyed()){p.win.webContents.setAudioMuted(sound.muted);void p.win.webContents.executeJavaScript(`window.__skinforgeWallpaperAudio?.(${JSON.stringify(sound)});true`).catch(()=>{})}
    }
  }
  reconcile(p) {if(!p.ready)return;const hidden=this.locked||p.hostWindow&&(!p.hostWindow.isVisible()||p.hostWindow.isMinimized()),stop=hidden||p.paused||p.resizePending;if(p.native){if(p.nativePaused!==Boolean(stop)){p.nativePaused=Boolean(stop);p.nativeQueue=(p.nativeQueue || Promise.resolve()).then(()=>this.players.get(p.key)===p?this.nativeEngine.paused(p,Boolean(stop)):null).catch(error=>this.state(p,'error',error.message))}}else void p.win.webContents.executeJavaScript(`window.__skinforgeWallpaperUpdate?.(${JSON.stringify(p.values)},${Boolean(stop)});true`).catch(()=>{});if(p.capture)p.capture.pause(Boolean(stop||p.streaming));else if(stop)p.win.webContents.stopPainting();else p.win.webContents.startPainting();this.state(p,p.resizePending?'loading':hidden||p.paused?'paused':'playing')}
  resizeScene(p) {
    if(!p.native||!p.ready)return
    if(this.locked||p.hostWindow&&(p.hostWindow.isDestroyed?.()||!p.hostWindow.isVisible()||p.hostWindow.isMinimized())){clearTimeout(p.resizeTimer);return}
    const target=this.nativeEngine.target(p),changed=target.width!==p.native.width||target.height!==p.native.height
    if(changed||p.resizePending){
      clearTimeout(p.resizeTimer);p.resizePending=changed;p.latest=null;this.reconcile(p)
      // Resizing the HWND alone can leave the engine's original render target
      // stretched or partially repainted. Reopen at the physical pixel size.
      if(changed&&!this.locked&&(!p.hostWindow||p.hostWindow.isVisible()&&!p.hostWindow.isMinimized()))p.resizeTimer=setTimeout(()=>{p.nativeQueue=(p.nativeQueue || Promise.resolve()).then(()=>this.rebuildScene(p)).catch(error=>{if(this.players.get(p.key)===p)this.state(p,'error',error.message)})},300)
    }else if(!p.nativePaused)void this.nativeEngine.place(p).catch(error=>this.state(p,'error',error.message))
  }
  async rebuildScene(p) {
    if(this.players.get(p.key)!==p||p.host.isDestroyed())return
    // Clearing the debounce timer cannot cancel work already in nativeQueue.
    // Recheck after queued native operations finish, before closing a window.
    const target=this.nativeEngine.target(p)
    if(target.width===p.native.width&&target.height===p.native.height){p.resizePending=false;this.reconcile(p);return}
    if(this.locked||p.hostWindow&&(!p.hostWindow.isVisible()||p.hostWindow.isMinimized()))return
    this.diagnostics?.event(p,'resize-rebuild')
    const payload={slot:p.slot,projectId:p.projectId,token:p.clientToken,properties:p.values,paused:p.paused,audio:p.audio,bounds:p.bounds,recoveryCount:p.recoveryCount,quality:p.quality}
    const closing=this.close(p.host,p.slot),revision=this.revisions.get(p.key)
    await closing
    if(this.revisions.get(p.key)!==revision||p.host.isDestroyed())return
    return this.open(p.host,payload)
  }
  sceneFrame(p,frame) {
    if(this.players.get(p.key)!==p)return
    if(p.streaming){p.capture?.ack();return}
    this.diagnostics?.count(p,'received')
    const size=frame
    if(size.width!==p.native.width||size.height!==p.native.height){
      this.diagnostics?.count(p,'rejected')
      // WGC can retain an icon-sized surface after a Windows restore. Previously
      // these frames were discarded forever, leaving a magnified stale strip.
      // Allow transient frames, then rebuild once through the bounded recovery.
      const active=p.ready&&!p.paused&&!p.nativePaused&&!p.resizePending&&!this.locked&&(!p.hostWindow||p.hostWindow.isVisible()&&!p.hostWindow.isMinimized())
      if(active){
        p.wrongSizeSince ??= Date.now()
        if(Date.now()-p.wrongSizeSince>=1000){
          p.capture?.pause(true)
          p.failurePromise ||= this.sceneFailure(p,Error('场景恢复后的画面尺寸异常，正在重新连接壁纸'))
          void p.failurePromise.catch(()=>{});return
        }
      }else p.wrongSizeSince=null
      p.capture?.ack();return
    }
    p.wrongSizeSince=null
    // WGC may deliver the newly created HWND before its content has painted.
    // Do not let the consumer pause on that initial blank surface. Sampling is
    // bounded; an intentionally black wallpaper is accepted after two seconds.
    if(!p.ready){
      let content=false
      for(let y=0;y<9&&!content;y++)for(let x=0;x<16;x++){const i=(Math.floor((y+.5)*frame.height/9)*frame.width+Math.floor((x+.5)*frame.width/16))*4;if(frame.pixels[i]||frame.pixels[i+1]||frame.pixels[i+2]){content=true;break}}
      if(!content){p.firstBlankAt ??= Date.now();if(Date.now()-p.firstBlankAt<2000){p.phase='first-content';this.diagnostics?.count(p,'rejected');p.capture?.ack();return}}
    }
    if(!p.ready){p.ready=true;p.loaded=true;p.phase='paint';clearTimeout(p.timeout);this.resizeScene(p);queueMicrotask(()=>this.reconcile(p))}
    // Keep the last complete renderer canvas while rebuilding. Never send a
    // late old-size frame to overwrite the newly sized background.
    if(p.resizePending){this.diagnostics?.count(p,'rejected');p.capture?.ack();return}
    p.latest=frame;this.flush(p)
  }
  openScene(host,payload,metadata,values) {return this.trackCleanup(this.startScene(host,payload,metadata,values))}
  async startScene(host,payload,metadata,values) {
    const slot=payload.slot==='library'?'library':'background',key=this.key(host,slot),closing=this.close(host,slot),revision=this.revisions.get(key)
    await closing
    if(this.destroyed||this.revisions.get(key)!==revision||host.isDestroyed())return {ok:false,error:'场景预览已切换'}
    const token=crypto.randomBytes(16).toString('hex')
    const p={key,host,slot,token,clientToken:payload.token,projectId:payload.projectId,values,audio:audioSettings(payload.audio),quality:sceneQuality(payload.quality),captureScene:true,recoveryCount:payload.recoveryCount===1?1:0,paused:payload.paused===true,ready:false,inFlight:false,latest:null,destroy:()=>this.close(host,slot)}
    p.hostWindow=this.BrowserWindow.fromWebContents?.(host);p.hostChange=()=>{this.reconcile(p);this.resizeScene(p)};for(const name of ['hide','minimize','show','restore','move','resize'])p.hostWindow?.on(name,p.hostChange);this.players.set(key,p);host.once('destroyed',p.destroy)
    this.beginDiagnostics(p);this.state(p,'loading');this.bounds(p,payload.bounds)
    try{
      p.phase='engine';this.diagnostics.event(p,'engine-start');const source=await this.nativeEngine.open(p);if(this.players.get(key)!==p){await this.nativeEngine.close(p);return {ok:false,error:'场景预览已切换'}}
      await this.nativeEngine.place(p)
      // Placement crosses an asynchronous native helper. The slot may have
      // closed or switched meanwhile, after close already checked p.capture.
      if(this.players.get(key)!==p){await this.nativeEngine.close(p);return {ok:false,error:'场景预览已切换'}}
      p.phase='capture';this.diagnostics.event(p,'capture-start');p.enginePath=this.nativeEngine.engine
      p.capture=new (require('./wallpaper-window-capture.cjs').WindowCapture)({onFrame:frame=>this.sceneFrame(p,frame),onTiming:(name,ms)=>this.diagnostics?.timing(p,name,ms),onError:error=>{p.failurePromise ||= this.sceneFailure(p,error);void p.failurePromise.catch(()=>{})}})
      p.timeout=setTimeout(()=>{if(!p.ready){p.failurePromise ||= this.sceneFailure(p,Error('场景画面尺寸未在 15 秒内同步，请重试'));void p.failurePromise.catch(()=>{})}},15000)
      await p.capture.start(p)
      return this.players.get(key)===p?{ok:true,token,generation:p.generation}:{ok:false,error:'场景预览已切换'}
    }catch(error){return await (p.failurePromise || this.sceneFailure(p,error)) || {ok:false,error:error.message}}
  }
  async sceneFailure(p,error){
    if(this.players.get(p.key)!==p)return
    this.lastSceneFailure={phase:p.phase,error:error.message,code:error.code,details:error.details,native:p.native,bounds:p.bounds}
    this.state(p,'error',error.message);const closing=this.close(p.host,p.slot)
    const revision=this.revisions.get(p.key)
    await closing
    if(p.recoveryCount===1||p.host.isDestroyed())return
    try{const status=await this.nativeEngine.running();if((!status.running||['capture','paint'].includes(p.phase))&&this.revisions.get(p.key)===revision&&!p.host.isDestroyed())return await this.open(p.host,{slot:p.slot,projectId:p.projectId,token:p.clientToken,properties:p.values,paused:p.paused,audio:p.audio,bounds:p.bounds,recoveryCount:1,quality:p.quality})}catch{}
  }
  async open(host,payload) {
    if(this.destroyed)return {ok:false,error:'壁纸播放器已关闭'}
    const slot=payload.slot==='library'?'library':'background',key=this.key(host,slot)
    audioSettings(payload.audio)
    sceneQuality(payload.quality)
    const metadata=this.projects.get(payload.projectId),values={...Object.fromEntries(Object.entries(metadata.properties).filter(([,p])=>p.supported&&p.type!=='group').map(([k,p])=>[k,p.value])),...validateValues(metadata.properties,payload.properties || {})}
    if(metadata.type==='scene')return this.openScene(host,payload,metadata,values)
    const existing=this.players.get(key)
    if(existing?.projectId===payload.projectId&&payload.token===existing.clientToken){existing.values=values;existing.audio=audioSettings(payload.audio);this.reconcile(existing);return {ok:true,token:existing.token,generation:existing.generation}}
    this.close(host,slot)
    const token=crypto.randomBytes(16).toString('hex'),wallpaperSession=this.session.fromPartition('skinforge-wallpaper-'+token)
    const domains=this.projects.domains(payload.projectId)
    const origin=SCHEME+'://'+token
    const local=value=>{try{const u=new URL(value);return u.protocol===SCHEME+':'&&u.hostname===token&&!u.port&&!u.username&&!u.password}catch{return false}}
    wallpaperSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));wallpaperSession.setPermissionCheckHandler(()=>false);wallpaperSession.on('will-download',e=>e.preventDefault())
    wallpaperSession.webRequest.onBeforeRequest((details,callback)=>{const u=details.url;let permitted=local(u)||/^(?:data:|blob:|about:blank$)/.test(u);if(!permitted)try{const url=new URL(u);permitted=url.protocol==='https:'&&domains.includes(url.hostname)&&(!url.port||url.port==='443')&&!url.username&&!url.password}catch{};callback({cancel:!permitted})})
    wallpaperSession.protocol.handle('https',request=>remoteResponse(request,domains))
    const csp=`default-src 'self' data: blob: ${domains.map(d=>'https://'+d).join(' ')}; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${domains.map(d=>'https://'+d).join(' ')}; style-src 'self' 'unsafe-inline' ${domains.map(d=>'https://'+d).join(' ')}; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'`
    wallpaperSession.protocol.handle(SCHEME,request=>{
      try{if(!local(request.url)||!['GET','HEAD'].includes(request.method))throw Error();const name=decodeURIComponent(new URL(request.url).pathname.slice(1)),info=this.projects.info(payload.projectId,name);const headers={'content-type':info.mime,'content-security-policy':csp,'x-content-type-options':'nosniff','cache-control':'no-store','accept-ranges':'bytes'};if(name===metadata.entry){if(info.bytes>8*1024*1024)throw Error();const html=readChecked(info).toString('utf8'),doctype=html.match(/^\s*<!doctype[^>]*>/i)?.[0] || '',data=Buffer.from(doctype+shim(values)+'<script>('+installAudioShim.toString()+')('+JSON.stringify({muted:true,volume:.5})+')</script>'+html.slice(doctype.length));return new Response(request.method==='HEAD'?null:data,{headers})}let start=0,end=info.bytes-1,status=200;const range=request.headers.get('range');if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'content-range':`bytes */${info.bytes}`}});start=match[1]?Number(match[1]):Math.max(0,info.bytes-Number(match[2]));end=match[1]&&match[2]?Math.min(end,Number(match[2])):end;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.bytes)return new Response(null,{status:416,headers:{'content-range':`bytes */${info.bytes}`}});status=206;headers['content-range']=`bytes ${start}-${end}/${info.bytes}`}headers['content-length']=String(Math.max(0,end-start+1));return new Response(request.method==='HEAD'||!info.bytes?null:Readable.toWeb(fs.createReadStream(info.target,{fd:openChecked(info.target,info.stat),autoClose:true,start,end,highWaterMark:1024*1024})),{status,headers})}catch{return new Response('壁纸资源缺失或不安全',{status:404})}
    })
    const win=new this.BrowserWindow({show:false,width:960,height:540,frame:false,webPreferences:{session:wallpaperSession,offscreen:{useSharedTexture:false,deviceScaleFactor:1},backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false,navigateOnDragDrop:false}})
    const p={key,host,slot,token,clientToken:payload.token,projectId:payload.projectId,values,audio:audioSettings(payload.audio),win,session:wallpaperSession,paused:payload.paused===true,ready:false,inFlight:false,latest:null,destroy:()=>this.close(host,slot)}
    p.hostWindow=this.BrowserWindow.fromWebContents?.(host);p.hostChange=()=>this.reconcile(p);for(const name of ['hide','minimize','show','restore'])p.hostWindow?.on(name,p.hostChange)
    this.players.set(key,p);this.beginDiagnostics(p);p.phase='page-load';host.once('destroyed',p.destroy);win.webContents.setAudioMuted(true);win.webContents.setFrameRate(30);win.webContents.setWindowOpenHandler(()=>({action:'deny'}))
    for(const eventName of ['will-navigate','will-frame-navigate','will-redirect'])win.webContents.on(eventName,(event,url)=>{if(!local(typeof url==='string'?url:event.url))event.preventDefault()})
    win.webContents.on('will-attach-webview',e=>e.preventDefault())
    win.webContents.on('render-process-gone',()=>this.state(p,'error','网页壁纸进程已退出，请重试'))
    win.webContents.on('paint',(_event,_dirty,image)=>{
      p.paintEvents=(p.paintEvents || 0)+1
      if(this.players.get(key)!==p||!p.loaded||image.isEmpty())return
      this.diagnostics.count(p,'received')
      const size=image.getSize(1)
      // A resize may leave an old paint event queued. Do not relabel those
      // pixels with the new display bounds; request a fresh complete frame.
      if(p.renderSize&&(size.width!==p.renderSize.width||size.height!==p.renderSize.height)){this.diagnostics.count(p,'rejected');win.webContents.invalidate();return}
      if(!p.ready){p.ready=true;clearTimeout(p.timeout);queueMicrotask(()=>this.reconcile(p))}
      p.phase='paint';if(p.latest)this.diagnostics.count(p,'replaced')
      p.latest=image;this.flush(p)
    })
    p.timeout=setTimeout(()=>{this.state(p,'error','网页壁纸在 15 秒内未产生首帧，请检查资源');win.webContents.stopPainting()},15000)
    this.bounds(p,payload.bounds);this.state(p,'loading')
    try{await win.loadURL(origin+'/'+metadata.entry.split('/').map(encodeURIComponent).join('/'));p.loaded=true;p.phase='first-paint';this.diagnostics.event(p,'page-loaded');win.webContents.setBackgroundThrottling(false);win.webContents.invalidate();return {ok:true,token,generation:p.generation}}catch(error){const message='网页壁纸加载失败（'+String(error.code||error.message).slice(0,100)+'），请重试';this.state(p,'error',message);return {ok:false,error:message}}
  }
  bounds(p,bounds) {
    if(!bounds)return
    const w=Number(bounds.width),h=Number(bounds.height),dpr=Number(bounds.scaleFactor ?? 1)
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w>30000||h>30000||!Number.isFinite(dpr)||dpr<.25||dpr>8)throw Error('壁纸显示区域无效')
    // A ResizeObserver/IPC message can arrive after minimization. Preserve the
    // last drawable canvas size until a visible host reports its new bounds.
    if(p.captureScene&&p.bounds&&(this.locked||p.hostWindow&&(!p.hostWindow.isVisible()||p.hostWindow.isMinimized())))return
    const changed=!p.bounds||p.bounds.width!==w||p.bounds.height!==h||p.bounds.scaleFactor!==dpr
    p.bounds={width:w,height:h,scaleFactor:dpr}
    if(changed){this.diagnostics?.event(p,'bounds');p.latest=null}
    if(p.captureScene){this.resizeScene(p);return}
    // OSR has an explicit deviceScaleFactor of 1. Renderer DPR includes display
    // scale and zoom; do not divide it by the desktop DPI a second time.
    const scale=Math.min(1,1280/(w*dpr),720/(h*dpr))
    p.renderSize={width:Math.max(1,Math.floor(w*dpr*scale)),height:Math.max(1,Math.floor(h*dpr*scale))}
    p.win.setContentSize(p.renderSize.width,p.renderSize.height)
  }
  flush(p) {
    if(p.inFlight||!p.latest||p.resizePending||p.host.isDestroyed()||this.players.get(p.key)!==p)return
    const prepareStarted=performance.now()
    let image=p.latest;p.latest=null
    // WGC already supplies tightly packed BGRA. Keep its buffer through IPC;
    // converting to NativeImage and back creates redundant full-frame copies.
    const representation=p.captureScene?1:Math.max(...(image.getScaleFactors?.() || [1]))
    let size=p.captureScene?{width:image.width,height:image.height}:image.getSize(representation),bitmap=p.captureScene?image.pixels:image.toBitmap({scaleFactor:representation})
    p.frameInfo={...size,bytes:bitmap.length}
    if(bitmap.length!==size.width*size.height*4)return
    if(!p.captureScene&&(size.width>1280||size.height>720)){
      // A display-DPI transition can deliver one oversized frame before bounds
      // catch up. Normalize it instead of dropping every frame / showing stale art.
      const scale=Math.min(1280/size.width,720/size.height)
      image=this.nativeImage.createFromBitmap(bitmap,{width:size.width,height:size.height,scaleFactor:1}).resize({width:Math.max(1,Math.floor(size.width*scale)),height:Math.max(1,Math.floor(size.height*scale)),quality:'best'})
      size=image.getSize(1);bitmap=image.toBitmap({scaleFactor:1})
      p.frameInfo={...size,bytes:bitmap.length}
    }
    if(bitmap.length!==size.width*size.height*4||size.width>(p.captureScene?3840:1280)||size.height>(p.captureScene?2160:720))return
    this.diagnostics?.timing(p,'prepare',performance.now()-prepareStarted)
    p.inFlight=true;p.lastFrameSent=Date.now();p.frameId=(p.frameId || 0)+1
    this.diagnostics?.count(p,'sent');this.diagnostics?.count(p,'bytes',bitmap.length)
    const sendStarted=performance.now()
    this.send(p,'codex-we:frame',{frameId:p.frameId,width:size.width,height:size.height,pixels:bitmap,bounds:p.bounds?{...p.bounds}:undefined})
    this.diagnostics?.timing(p,'send',performance.now()-sendStarted)
    p.ackTimeout=setTimeout(()=>{p.latest=null;p.paused=true;if(p.native)this.reconcile(p);else p.win.webContents.stopPainting();this.state(p,'error','背景画面接收超时，已暂停以避免堆积；请重试')},p.captureScene?10000:2000)
  }
  async beginStream(p){
    if(!p.captureScene||!p.ready||!p.native||p.paused||p.resizePending||this.locked||p.hostWindow?.isMinimized()||p.hostWindow?.isVisible()===false)return {ok:false,error:'场景当前不适合视频流'}
    const revision=p.streamRevision=(p.streamRevision||0)+1
    if(this.nativeEngine.windows.get(p.native.title)!==p)return {ok:false,error:'场景窗口已切换'}
    const owned=await this.nativeEngine.helper('find',p.native.title)
    if(p.streamRevision!==revision||this.players.get(p.key)!==p||p.host.isDestroyed()||p.paused||p.resizePending||this.locked||p.hostWindow?.isMinimized()||p.hostWindow?.isVisible()===false||!owned.found||'window:'+owned.handle+':0'!==p.native.sourceId||owned.width!==p.native.width||owned.height!==p.native.height)return {ok:false,error:'场景窗口验证失败'}
    // Refresh Chromium's window sources after every native window rebuild.
    // Do not hand the renderer a guessed/unlisted source or another window.
    const sources=await this.nativeEngine.desktopCapturer?.getSources({types:['window'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false})
    if(p.streamRevision!==revision||!sources?.some(s=>s.id===p.native.sourceId&&s.name===p.native.title)||this.players.get(p.key)!==p||p.paused||this.locked)return {ok:false,error:'场景窗口列表尚未同步'}
    if(!p.capture.setStreamMode?.(true))return {ok:false,error:'捕获器不支持暂停，使用兼容播放'}
    p.streaming=true;p.latest=null;this.diagnostics?.event(p,'native-stream')
    return {ok:true,source:{id:p.native.sourceId,width:p.native.width,height:p.native.height}}
  }
  endStream(p){p.streamRevision=(p.streamRevision||0)+1;p.streaming=false;p.capture?.setStreamMode?.(false);this.diagnostics?.event(p,'raw-fallback');this.reconcile(p);return {ok:true}}
  action(host,payload) {
    if(!payload||!['background','library'].includes(payload.slot))throw Error('壁纸播放器入口无效')
    if(payload.action==='diagnostics-start'){
      const p=this.players.get(this.key(host,payload.slot));if(!p)return {ok:false,error:'请先加载网页或场景壁纸'}
      this.diagnostics.begin(p,true);this.scheduleDiagnostics(p);return {ok:true}
    }
    if(payload.action==='diagnostics'){
      const key=this.key(host,payload.slot),p=this.players.get(key),report=this.diagnostics?.snapshot(key,p)
      if(report){report.sourceFpsLimit=p?.sourceFpsLimit??null;const c=p?.capture?.info;if(c)report.capture={backend:c.backend,vendorId:c.vendorId,deviceId:c.deviceId,cursorCaptureEnabled:c.cursorCaptureEnabled}}
      return report?{ok:true,report}:{ok:false,error:'还没有网页或场景壁纸记录，请先加载壁纸'}
    }
    if(payload.action==='open')return this.open(host,payload)
    if(payload.action==='close')return Promise.resolve(this.close(host,payload.slot)).then(()=>({ok:true}))
    const p=this.players.get(this.key(host,payload.slot));if(!p||p.token!==payload.token)return {ok:false,error:'壁纸播放器已切换'}
    if(payload.action==='stream-begin')return this.beginStream(p)
    if(payload.action==='stream-end')return this.endStream(p)
    if(payload.action==='stream-stats'){
      if(!p.streaming||!Number.isInteger(payload.frames)||payload.frames<1||payload.frames>120||payload.width!==p.native.width||payload.height!==p.native.height||!Number.isFinite(payload.drawMs)||payload.drawMs<0||payload.drawMs>60000)return {ok:false,error:'视频流计数无效'}
      this.diagnostics?.count(p,'streamPresented',payload.frames);this.diagnostics?.timing(p,'streamDraw',payload.drawMs);p.frameInfo={width:payload.width,height:payload.height,bytes:0};return {ok:true}
    }
    if(payload.action==='ack'){
      // An old or duplicated acknowledgement must not release a newer frame.
      if(!p.inFlight||payload.frameId!==undefined&&payload.frameId!==p.frameId)return {ok:false,error:'壁纸帧已切换'}
      clearTimeout(p.ackTimeout);p.lastFrameAck=Date.now();const elapsed=p.lastFrameAck-(p.lastFrameSent || p.lastFrameAck)
      this.diagnostics?.ack(p,payload,elapsed);p.maximumAckMs=Math.max(p.maximumAckMs || 0,elapsed);p.inFlight=false;if(p.capture)p.capture.ack();else this.flush(p)
    }
    else if(payload.action==='pause'){p.paused=payload.paused===true;p.lastPauseAction={paused:p.paused,time:Date.now()};this.reconcile(p)}
    else if(payload.action==='properties'){
      const definitions=this.projects.get(p.projectId).properties;const next={...p.values,...validateValues(definitions,payload.properties||{})};p.values=next;
      if(p.captureScene){if(p.native)return this.nativeEngine.properties(p).then(()=>({ok:true}))}else this.reconcile(p)
    }
    else if(payload.action==='audio'){p.audio=audioSettings(payload.audio);this.reconcileAudio()}
    else if(payload.action==='bounds')this.bounds(p,payload.bounds)
    else if(payload.action==='mouse'){const x=Number(payload.x),y=Number(payload.y);if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1&&y>=0&&y<=1&&!p.paused&&!this.locked){if(p.native){if(p.capture?.mouse?.(x,y))return {ok:true};const now=Date.now();if(!p.nativeMousePending&&now-(p.nativeLastMouse || 0)>=100){p.nativeMousePending=true;p.nativeLastMouse=now;void this.nativeEngine.mouse(p,x,y).catch(()=>{}).finally(()=>p.nativeMousePending=false)}}else{const [w,h]=p.win.getContentSize();p.win.webContents.sendInputEvent({type:'mouseMove',x:Math.min(w-1,Math.floor(x*w)),y:Math.min(h-1,Math.floor(y*h))})}}}
    else throw Error('壁纸运行操作无效')
    return {ok:true}
  }
  destroy() {
    if(this.destroyPromise)return this.destroyPromise
    this.destroyed=true
    for(const p of [...this.players.values()])this.close(p.host,p.slot)
    for(const event of ['lock-screen','suspend'])this.powerMonitor?.removeListener(event,this.onLock)
    for(const event of ['unlock-screen','resume'])this.powerMonitor?.removeListener(event,this.onUnlock)
    this.destroyPromise=(async()=>{
      while(this.pendingCleanup?.size)await Promise.allSettled([...this.pendingCleanup])
      // A failed earlier close has already left players. Retry its exact owned
      // window once on exit; never terminate the shared WE process here.
      for(const [key,p]of this.orphanedByKey||[])this.finishClose(key,p)
      while(this.pendingCleanup?.size)await Promise.allSettled([...this.pendingCleanup])
      await this.nativeEngine.commandQueue?.catch(()=>{})
    })()
    return this.destroyPromise
  }
}
module.exports={WallpaperRuntime,SCHEME,publicAddress,remoteResponse,shim,audioSettings,installAudioShim}
