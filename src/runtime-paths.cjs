'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
function runtimePaths({env=process.env,resourcesPath=process.resourcesPath,home=os.homedir()}={}){
 const base=env.LOCALAPPDATA||env.APPDATA||path.join(home,'.local','share');
 const dataRoot=path.resolve(base,'SkinForgeCodex');
 const configured=typeof env.SKINFORGE_TOOL_CONFIG==='string'&&path.isAbsolute(env.SKINFORGE_TOOL_CONFIG)?env.SKINFORGE_TOOL_CONFIG:null;
 const bundled=resourcesPath?path.join(resourcesPath,'tools','ffmpeg','tool.json'):null;
 const userTool=path.join(dataRoot,'tools','ffmpeg','tool.json');
 return {dataRoot,videoCache:path.join(dataRoot,'cache','video-1080p30'),userTool,toolConfig:configured||(bundled&&fs.existsSync(bundled)?bundled:userTool)};
}
function transcoderPath(configFile){
 let stat;try{stat=fs.lstatSync(configFile)}catch(error){if(error.code==='ENOENT')throw Object.assign(Error('未配置转码工具；可播放原视频，或在「运行环境」中选择 FFmpeg。'),{code:'ETOOLMISSING'});throw error}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>8192)throw Error('转码工具清单无效');
 const config=JSON.parse(fs.readFileSync(configFile,'utf8').replace(/^\uFEFF/,''));
 if(typeof config.path!=='string'||!config.path||/[\x00-\x1f]/.test(config.path)||!/^[a-f0-9]{64}$/.test(config.sha256))throw Error('转码工具清单无效');
 const executable=path.isAbsolute(config.path)?path.resolve(config.path):path.resolve(path.dirname(configFile),config.path);
 if(!path.isAbsolute(config.path)){const relative=path.relative(path.dirname(configFile),executable);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('转码工具路径越出工具目录')}
 if(executable.startsWith('\\\\')||executable.startsWith('//'))throw Error('转码工具必须位于本机');
 return {executable,sha256:config.sha256};
}
async function configureTranscoder(executable,{configFile=runtimePaths().userTool}={}){
 if(typeof executable!=='string'||!path.isAbsolute(executable)||executable.startsWith('\\\\'))throw Error('请选择本机 FFmpeg 程序');
 const stat=fs.lstatSync(executable);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>256*1024*1024||!/^ffmpeg(?:[-\w.]*)?(?:\.exe)?$/i.test(path.basename(executable)))throw Error('请选择普通的 FFmpeg 程序文件');
 const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(executable))hash.update(chunk);
 const record={schemaVersion:1,path:path.resolve(executable),sha256:hash.digest('hex')};
 fs.mkdirSync(path.dirname(configFile),{recursive:true});const temporary=configFile+'.'+crypto.randomUUID()+'.tmp';
 try{fs.writeFileSync(temporary,JSON.stringify(record,null,2),{flag:'wx'});fs.renameSync(temporary,configFile)}finally{try{fs.unlinkSync(temporary)}catch{}}
 return {configured:true};
}
module.exports={runtimePaths,transcoderPath,configureTranscoder};
