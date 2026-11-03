'use strict';
const path=require('node:path');
// Canonical identity for an explicitly chosen local file. Keep native Windows
// filesystem paths here; URL encoding remains the responsibility of node:url.
function localMediaPath(input,{platform=process.platform}={}){
 if(typeof input!=='string'||!input||input.length>32767||/[\u0000-\u001f]/.test(input))throw Error('请选择有效的本机媒体文件路径');
 if(platform!=='win32'){
  if(!path.posix.isAbsolute(input)||input.startsWith('//'))throw Error('请选择本机媒体文件，不支持网络路径');
  return path.posix.resolve(input);
 }
 let file=input.replaceAll('/','\\');
 if(file.startsWith('\\\\?\\')){
  // Support only the extended DOS-drive form, never UNC, GLOBALROOT or a device.
  if(!/^\\\\\?\\[A-Za-z]:\\/.test(file))throw Error('请选择本机媒体文件，不支持网络或设备路径');
  file=file.slice(4);
  // Removing the namespace prefix must not reinterpret literal dot components
  // or Win32-trimmed names as a different authorized file.
  if(file.slice(3).split('\\').some(part=>part==='.'||part==='..'||/[ .]$/.test(part)))throw Error('本机扩展路径包含有歧义的名称');
 }
 if(!/^[A-Za-z]:\\/.test(file)||file.slice(2).includes(':')||file.slice(3).split('\\').some(part=>part!=='.'&&part!=='..'&&/[ .]$/.test(part)))throw Error('请选择本机媒体文件，不支持网络、设备或数据流路径');
 return path.win32.resolve(file);
}
module.exports={localMediaPath};
