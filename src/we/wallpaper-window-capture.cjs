'use strict'
const path=require('node:path'),{spawn}=require('node:child_process')
const MAX_FRAME=3840*2160*4
class FrameDecoder {
 constructor(onFrame){this.onFrame=onFrame;this.reset()}
 reset(){this.header=Buffer.alloc(12);this.headerBytes=0;this.buffer=Buffer.alloc(0);this.pixelBytes=0}
 recycle(pixels){if(Buffer.isBuffer(pixels)&&pixels.length>0&&pixels.length<=MAX_FRAME)this.spare=pixels}
 clear(){this.spare=null;this.reset()}
 push(chunk){if(chunk.length>MAX_FRAME+12)throw Error('场景画面接收数据过大');let offset=0;while(offset<chunk.length){if(this.headerBytes<12){const count=Math.min(12-this.headerBytes,chunk.length-offset);chunk.copy(this.header,this.headerBytes,offset,offset+count);this.headerBytes+=count;offset+=count;if(this.headerBytes<12)return;if(this.header.readUInt32LE(0)!==0x31474653)throw Error('场景画面格式无效');this.width=this.header.readUInt32LE(4);this.height=this.header.readUInt32LE(8);if(!this.width||!this.height||this.width>3840||this.height>2160)throw Error('场景画面尺寸无效');const bytes=this.width*this.height*4;this.buffer=this.spare?.length===bytes?this.spare:Buffer.allocUnsafe(bytes);this.spare=null}const count=Math.min(this.buffer.length-this.pixelBytes,chunk.length-offset);chunk.copy(this.buffer,this.pixelBytes,offset,offset+count);this.pixelBytes+=count;offset+=count;if(this.pixelBytes===this.buffer.length){const pixels=this.buffer,width=this.width,height=this.height;this.reset();this.onFrame(pixels,width,height)}}}
}
function releaseCaptureChild(child,{delay=setTimeout,cancel=clearTimeout}={}){
 if(!child||child.exitCode!==null&&child.exitCode!==undefined||child?.signalCode)return Promise.resolve()
 return new Promise(resolve=>{
  let timer
  const done=()=>{cancel(timer);child.removeListener('exit',done);child.removeListener('error',done);resolve()}
  child.once('exit',done);child.once('error',done)
  // EOF lets the native HostGuard close its exact owned WE window. Immediate
  // TerminateProcess used to skip its destructors and leave that window alive.
  timer=delay(()=>{child.kill();done()},1500);timer.unref?.()
  try{child.stdin.end()}catch{child.kill();done()}
 })
}
class WindowCapture {
 constructor({onFrame,onError,onTiming=()=>{},clock=()=>performance.now(),executable=path.join(process.resourcesPath || '', 'codex-we-window-capture.exe')}){Object.assign(this,{onFrame,onError,onTiming,clock,executable});this.closed=false;this.stopped=false;this.waiting=false;this.held=false;this.lastRequestAt=null;this.decoder=new FrameDecoder((pixels,width,height)=>{if(!this.waiting)throw Error('场景画面未请求就到达');this.waiting=false;clearTimeout(this.responseTimer);this.held=true;this.heldPixels=pixels;this.onTiming('capture',this.clock()-this.lastRequestAt);this.onFrame({pixels,width,height});this.resolveFirst?.();this.resolveFirst=null;this.rejectFirst=null})}
 start(p){this.firstFrame=new Promise((resolve,reject)=>{this.resolveFirst=resolve;this.rejectFirst=reject});const child=this.child=spawn(this.executable,[p.native.sourceId.split(':')[1],p.native.title,p.enginePath,p.hostWindow.getNativeWindowHandle().readBigUInt64LE().toString()],{cwd:path.dirname(this.executable),windowsHide:true,stdio:['pipe','pipe','pipe']});let status='';child.stdout.on('data',chunk=>{try{this.decoder.push(chunk)}catch(error){this.fail(error)}});child.stderr.on('data',chunk=>{status=(status+chunk.toString()).slice(-8192);this.readStatus(chunk.toString())});child.on('error',error=>this.fail(error));child.on('exit',code=>{if(!this.closed){const error=Error('场景画面接收器已退出，请重试');error.code=code;error.details=status;this.fail(error)}});child.stdin.on('error',error=>{if(!this.closed)this.fail(error)});this.request();return this.firstFrame}
 readStatus(text){
  const lines=((this.statusPending || '')+text).split('\n');this.statusPending=lines.pop().slice(-8192)
  for(const line of lines)try{
   const value=JSON.parse(line)
   if(value.backend==='windows-graphics-capture'&&value.cursorCaptureEnabled===false)this.info=value
   if(value.type==='captureState'&&typeof value.suspended==='boolean'&&this.info){this.info.captureSuspended=value.suspended;this.info.captureThrottled=value.throttled===true}
   if(value.type==='frameTiming')for(const key of ['nativeWait','readback','rowCopy','pipeWrite'])if(Number.isFinite(value[key])&&value[key]>=0)this.onTiming(key,Math.min(60000,value[key]))
  }catch{}
 }
 deadline(){clearTimeout(this.responseTimer);this.responseTimer=setTimeout(()=>this.fail(Error('场景画面在 15 秒内未到达，请重试')),15000)}
 request(){
  if(this.closed||this.stopped||this.waiting||this.held)return
  // Limit request starts to 30 FPS. Slow consumers have already spent this
  // interval processing the previous frame; do not add another full interval.
  const now=this.clock(),remaining=this.lastRequestAt===null?0:1000/30-(now-this.lastRequestAt)
  if(remaining>0){if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.request()},Math.ceil(remaining));return}
  clearTimeout(this.timer);this.timer=null;this.lastRequestAt=now;this.waiting=true;this.deadline();this.child.stdin.write('f')
 }
 mouse(x,y){if(this.closed||this.info?.mousePipe!==true||![x,y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))return false;const now=this.clock();if(this.mouseAt&&now-this.mouseAt<1000/60)return true;this.mouseAt=now;const b=Buffer.alloc(5);b[0]=109;b.writeUInt16LE(Math.round(x*65535),1);b.writeUInt16LE(Math.round(y*65535),3);this.child.stdin.write(b);return true}
 ack(){if(this.heldPixels){this.decoder.recycle(this.heldPixels);this.heldPixels=null}this.held=false;this.request()}
 setStreamMode(value){if(this.closed||this.info?.streamPause!==true)return false;if(this.streamSuspended===value)return true;if(value)this.pause(true);this.streamSuspended=value;this.child.stdin.write(value?'s':'r');return true}
 pause(stop){this.stopped=stop;if(stop){clearTimeout(this.timer);this.timer=null;clearTimeout(this.responseTimer)}else if(this.waiting)this.deadline();else if(!this.held)this.ack()}
 fail(error){if(this.closed)return;this.rejectFirst?.(error);this.rejectFirst=null;this.destroy();this.onError(error)}
 destroy(){if(this.closed)return this.cleanup;this.closed=true;this.rejectFirst?.(Error('场景预览已切换'));this.rejectFirst=null;clearTimeout(this.timer);clearTimeout(this.responseTimer);this.heldPixels=null;this.decoder.clear();return this.cleanup=releaseCaptureChild(this.child)}
}
module.exports={WindowCapture,FrameDecoder,releaseCaptureChild}
