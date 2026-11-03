'use strict'
const {localMediaPath}=require('./local-media-path.cjs')
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url')
const {plainPath}=require('./we/wallpaper-projects.cjs')
const {runtimePaths,transcoderPath}=require('./runtime-paths.cjs')
const ROOT=runtimePaths().videoCache
const TOOL_CONFIG=runtimePaths().toolConfig
const signature=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':')
const digest=async file=>{const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex')}
const localURL=file=>pathToFileURL(file).href.replace(/^file:\/\/\//,'app://fs/@fs/')
const FILTER='scale=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,fps=30,setsar=1'
const PROFILES=Object.freeze({smooth:{width:1920,height:1080,filter:FILTER,profile:'high',level:'4.1',args:[]},performance:{width:1280,height:720,filter:'scale=w=min(1280\\,iw):h=min(720\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,fps=30,setsar=1',profile:'main',level:'3.1',args:['-refs','2','-bf','2']}})
function recipe(quality){if(!Object.hasOwn(PROFILES,quality))throw Error('未知视频性能档');return PROFILES[quality]}
class VideoCache{
 constructor({root=ROOT,toolConfig=TOOL_CONFIG,readSize}={}){Object.assign(this,{root:path.resolve(root),toolConfig,readSize});this.pending=new Map();this.verified=new Map();this.children=new Set();this.queue=Promise.resolve();this.closed=false}
 async tool(){
  if(this.toolVerified)return this.toolVerified
  const config=transcoderPath(this.toolConfig),filename=config.executable
  const exe=plainPath(filename);if(!exe.isFile()||exe.nlink!==1||await digest(filename)!==config.sha256)throw Error('流畅模式转码器校验失败')
  this.toolVerified=filename;return filename
 }
 async get(source,projectId,{audio=false,quality='smooth'}={}){
  if(this.closed)throw Error('流畅视频连接正在关闭')
  recipe(quality)
  source=localMediaPath(source)
  const stat=plainPath(source);if(!stat.isFile()||stat.nlink!==1||stat.size>512*1024*1024)throw Error('原视频不是普通本地文件')
  try{await this.tool()}catch(error){if(error.code!=='ETOOLMISSING')throw error;let size={};try{size=this.readSize(source)}catch{}return {projectId,file:source,url:localURL(source),kind:'video',mime:path.extname(source).toLowerCase()==='.webm'?'video/webm':'video/mp4',name:path.basename(source),...size,quality:'original',notice:'未配置 FFmpeg，当前播放原视频；请在播放器中选择 FFmpeg 后生成播放副本。'}}
  const fingerprint=signature(stat),variant=quality==='performance'?(audio?'720p30-x264-main-crf18-aac-v1':'720p30-x264-main-crf18-v1'):(audio?'1080p30-x264-crf18-aac-v2':'1080p30-x264-crf18-v1'),key=crypto.createHash('sha256').update(variant+'\0'+source.toLowerCase()+'\0'+fingerprint).digest('hex')
  let pending=this.pending.get(key)
  if(!pending){pending=this.queue.catch(()=>{}).then(()=>this.prepare(source,fingerprint,key,audio,quality));this.queue=pending;this.pending.set(key,pending);void pending.finally(()=>{if(this.pending.get(key)===pending)this.pending.delete(key)}).catch(()=>{})}
  const output=await pending
  return {projectId,file:output.file,url:localURL(output.file),kind:'video',mime:'video/mp4',name:path.basename(source),width:output.width,height:output.height,quality,fps:30,audioPreserved:audio}
 }
 async cached(file,manifest,source,fingerprint,audio=false,quality='smooth'){
  try{
   const budget=recipe(quality)
   const record=JSON.parse(fs.readFileSync(manifest,'utf8')),stat=plainPath(file)
   if(record.version!==1||(record.quality||'smooth')!==quality||(record.withAudio===true)!==audio||typeof record.source!=='string'||path.resolve(record.source).toLowerCase()!==path.resolve(source).toLowerCase()||record.sourceSignature!==fingerprint||record.fps!==30||!stat.isFile()||stat.nlink!==1||stat.size!==record.bytes||record.width>budget.width||record.height>budget.height||record.width<2||record.height<2||!/^[a-f0-9]{64}$/.test(record.sha256))return null
   if(this.verified.get(file)!==signature(stat)){if(await digest(file)!==record.sha256)return null;this.verified.set(file,signature(stat))}
   return {file,width:record.width,height:record.height}
  }catch{return null}
 }
 async prepare(source,fingerprint,key,audio=false,quality='smooth'){
  if(this.closed)throw Error('流畅视频连接正在关闭')
  const budget=recipe(quality)
  await fsp.mkdir(this.root,{recursive:true});plainPath(this.root)
  const file=path.join(this.root,key+'.mp4'),manifest=path.join(this.root,key+'.json')
  const cached=await this.cached(file,manifest,source,fingerprint,audio,quality);if(cached)return cached
  // Never replace an unverified cache entry automatically. Keep it reviewable.
  if(fs.existsSync(file)||fs.existsSync(manifest))throw Error('流畅视频缓存校验失败；请先切回原始视频')
  const executable=await this.tool(),temporary=path.join(this.root,key+'-'+crypto.randomUUID()+'.tmp.mp4')
  if(signature(plainPath(source))!==fingerprint)throw Error('原视频在转码前发生变化')
  let diagnostic=''
  try{
   await new Promise((resolve,reject)=>{
    const args=['-hide_banner','-nostdin','-loglevel','error','-n','-threads','4','-i',source,'-map','0:v:0',...(audio?['-map','0:a:0?','-c:a','aac','-b:a','192k','-ac','2']:['-an']),'-sn','-dn','-vf',budget.filter,'-c:v','libx264','-preset','fast','-crf','18','-profile:v',budget.profile,'-level:v',budget.level,...budget.args,'-pix_fmt','yuv420p','-threads','4','-filter_threads','2','-movflags','+faststart',temporary]
    const child=spawn(executable,args,{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});this.children.add(child);let failure
    const timer=setTimeout(()=>{failure=Error('流畅视频生成超时，请切回原始视频');child.kill()},300000);timer.unref?.()
    child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-4096)})
    child.once('error',error=>{failure=error});child.once('close',code=>{clearTimeout(timer);this.children.delete(child);failure?reject(failure):code===0?resolve():reject(Error('流畅视频生成失败：'+diagnostic.slice(-400)))})
   })
   if(this.closed||signature(plainPath(source))!==fingerprint)throw Error('原视频在转码中发生变化或连接已关闭')
   const size=this.readSize(temporary),stat=plainPath(temporary)
   if(size.width>budget.width||size.height>budget.height||size.width<2||size.height<2||!stat.size)throw Error('流畅视频尺寸校验失败')
   const record={version:1,quality,source,sourceSignature:fingerprint,sourceSha256:await digest(source),sha256:await digest(temporary),bytes:stat.size,width:size.width,height:size.height,fps:30,withAudio:audio,recipe:{codec:'h264',profile:budget.profile,level:budget.level,pixelFormat:'yuv420p',crf:18,crop:false,audio:audio?'aac-192k':false},created:new Date().toISOString()}
   if(signature(plainPath(source))!==fingerprint)throw Error('原视频在校验中发生变化')
   // Both destinations are new files. Only verified output is ever advertised.
   await fsp.rename(temporary,file);await fsp.writeFile(manifest,JSON.stringify(record,null,2),{flag:'wx'});this.verified.set(file,signature(plainPath(file)))
   return {file,...size}
  }finally{await fsp.unlink(temporary).catch(()=>{})}
 }
 close(){this.closed=true;for(const child of this.children)child.kill()}
}
module.exports={VideoCache,ROOT,TOOL_CONFIG,signature,digest,FILTER,PROFILES}
