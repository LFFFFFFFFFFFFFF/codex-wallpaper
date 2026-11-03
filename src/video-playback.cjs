'use strict';
// Reuse the earlier local-media cache: real 1080p/30 H.264 copies, never a
// CSS resize of a 4K decoder. The selected/exported file remains the original.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {VideoCache,signature}=require('./wallpaper-video-cache.cjs');
const {plainPath}=require('./we/wallpaper-projects.cjs');
const {configureTranscoder}=require('./runtime-paths.cjs');
const localURL=file=>pathToFileURL(file).href.replace(/^file:\/\/\//,'app://fs/@fs/');
const isVideo=file=>['.mp4','.webm'].includes(path.extname(file||'').toLowerCase());
// Existing bounded MP4 track-header reader, also used to validate FFmpeg output.
function mp4Size(file){
 const fd=fs.openSync(file,'r'),length=fs.fstatSync(fd).size,header=Buffer.alloc(16);
 const box=(offset,end)=>{if(end-offset<8)return null;fs.readSync(fd,header,0,Math.min(16,end-offset),offset);let bytes=header.readUInt32BE(),head=8;if(bytes===1){if(end-offset<16)throw Error('MP4 结构无效');bytes=Number(header.readBigUInt64BE(8));head=16}if(bytes===0)bytes=end-offset;if(!Number.isSafeInteger(bytes)||bytes<head||offset+bytes>end)throw Error('MP4 结构无效');return {type:header.toString('ascii',4,8),start:offset+head,end:offset+bytes}};
 try{for(let offset=0;offset<length;){const top=box(offset,length);if(!top)break;if(top.type==='moov')for(let at=top.start;at<top.end;){const track=box(at,top.end);if(!track)break;if(track.type==='trak')for(let sub=track.start;sub<track.end;){const child=box(sub,track.end);if(!child)break;if(child.type==='tkhd'&&child.end-child.start>=76){const size=Buffer.alloc(8);fs.readSync(fd,size,0,8,child.end-8);const width=size.readUInt32BE()/65536,height=size.readUInt32BE(4)/65536;if(width>=1&&height>=1&&width<=32768&&height<=32768)return {width,height}}sub=child.end}at=track.end}offset=top.end}throw Error('无法读取 MP4 尺寸')}finally{fs.closeSync(fd)}
}
function createVideoPlayback({root,resourcesPath,Cache=VideoCache}){
 const toolConfig=path.join(root,'wallpaper-data','ffmpeg-tool.json'),bundled=path.join(resourcesPath,'tools','ffmpeg','tool.json');
 let cache=new Cache({root:path.join(root,'video-cache'),toolConfig:fs.existsSync(toolConfig)?toolConfig:bundled,readSize:mp4Size}),memo=new Map();
 return {
  async prepare(s){
   if(s.we||!isVideo(s.file)){delete s.playback;if(s.we&&s.quality==='performance')s.quality='smooth';return s}
   const source=s.file,stat=plainPath(source);if(!stat.isFile()||stat.nlink!==1||stat.size>512*1024*1024)throw Error('视频不是普通本地文件或超过512MiB');
   const mode=['original','performance'].includes(s.quality)?s.quality:'smooth',key=source+'\0'+signature(stat)+'\0'+mode;
   let entry=memo.get(key),descriptor;
   if(entry){try{if(signature(plainPath(entry.descriptor.file))===entry.signature)descriptor=entry.descriptor}catch{}}
   if(!descriptor){
    if(mode!=='original')descriptor=await cache.get(source,null,{audio:true,quality:mode});
    else{let size={};try{size=mp4Size(source)}catch{}descriptor={file:source,url:localURL(source),quality:'original',...size}}
    memo.set(key,{descriptor,signature:signature(plainPath(descriptor.file))});
   }
   s.playback={...descriptor,source,requested:mode};return s;
  },
  async configure(file){await configureTranscoder(file,{configFile:toolConfig});cache.close();cache=new Cache({root:path.join(root,'video-cache'),toolConfig,readSize:mp4Size});memo.clear()},
  close(){cache.close();memo.clear()}
 };
}
module.exports={createVideoPlayback,mp4Size,localURL,isVideo};
