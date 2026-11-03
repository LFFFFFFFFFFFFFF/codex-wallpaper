'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process');
const pack=require('./workshop-package.cjs'),protocol=require('./workshop-submission.cjs'),{atomic}=require('./workshop-store.cjs');
function createRunner(){
 const children=new Set();let closed=false;
 function run(file,args,input){return new Promise((resolve,reject)=>{
  if(closed)return reject(Error('程序正在退出，发布已停止'));
  const env={...process.env,GH_HOST:'github.com',GH_PROMPT_DISABLED:'1',GIT_TERMINAL_PROMPT:'0',GH_NO_UPDATE_NOTIFIER:'1'};delete env.GH_DEBUG;
  const child=execFile(file,args,{windowsHide:true,shell:false,timeout:180000,maxBuffer:2*1024*1024,env},(error,stdout,stderr)=>{
   children.delete(child);if(error){const e=Error((stderr||error.message).replace(/\b(?:gh[pousr]_[\w]+|github_pat_[\w]+)\b/g,'[已隐藏]').slice(0,1200));e.notFound=/HTTP 404/.test(stderr);reject(e);}else resolve(stdout);
  });children.add(child);child.stdin.on('error',()=>{});child.stdin.end(input||'');
 });}
 return {run,close(){closed=true;for(const child of children)child.kill();}};
}
function createPublisher({root,runner=createRunner()}){
 const config=path.join(root,'github-cli.json');
 async function command(){
  let value;try{value=JSON.parse(await fsp.readFile(config,'utf8'));}catch{}
  if(value){const b=await fsp.readFile(value.path);if(pack.sha(b)!==value.sha256)throw Error('GitHub CLI文件已变化，请重新选择');return value.path;}
  return 'gh';
 }
 async function configure(file){if(path.basename(file).toLowerCase()!=='gh.exe')throw Error('请选择官方GitHub CLI的gh.exe');const version=await runner.run(file,['--version']);if(!/^gh version /m.test(version))throw Error('不是GitHub CLI');atomic(config,{path:file,sha256:pack.sha(await fsp.readFile(file))});return {message:'GitHub CLI已配置，请用 gh auth login 登录一次'};}
 async function api(file,endpoint,method='GET',body){const args=['api','--hostname','github.com',endpoint,'--method',method];if(body!==undefined)args.push('--input','-');return JSON.parse(await runner.run(file,args,body===undefined?undefined:JSON.stringify(body)));}
 async function account(){try{const file=await command(),user=await api(file,'user');return {file,login:protocol.login(user.login)};}catch(e){throw Error('无法读取GitHub登录：请安装官方GitHub CLI并运行 gh auth login。'+e.message);}}
 async function maybe(file,endpoint){try{return await api(file,endpoint);}catch(e){if(e.notFound)return null;throw e;}}
 async function publish(stage,expectedLogin){
  const {file,login}=await account();if(login!==expectedLogin)throw Error('GitHub账号已切换，请重新确认发布目标');
  const bytes=await fsp.readFile(stage.file);if(bytes.length!==stage.bytes||pack.sha(bytes)!==stage.sha256)throw Error('待发布文件已变化，请重新准备');
  const repo=`${login}/${protocol.CREATOR_REPO}`,base=`repos/${repo}`;let uploaded=false;
  try{
   let info=await maybe(file,base);
   if(!info)info=await api(file,'user/repos','POST',{name:protocol.CREATOR_REPO,description:'Wallpaper works published with Codex Wallpaper',private:false,auto_init:true});
   if(info.private||info.owner?.login?.toLowerCase()!==login.toLowerCase()||info.archived)throw Error('目标仓库必须是当前账号拥有的可写公开仓库；不会自动修改私有仓库');
   const tag='wallpaper-'+stage.id;let release=await maybe(file,`${base}/releases/tags/${tag}`);
   if(!release){for(let page=1;page<=10;page++){const rows=await api(file,`${base}/releases?per_page=100&page=${page}`);release=rows.find(x=>x.tag_name===tag);if(release||rows.length<100)break;if(page===10)throw Error('Release记录过多，请手动核对');}}
   if(!release)release=await api(file,`${base}/releases`,'POST',{tag_name:tag,name:stage.meta.title,body:`${stage.meta.description}\n\nAuthor: ${stage.meta.author}\nLicense: ${stage.meta.license}`,draft:true});
   const assets=[{file:stage.file,name:'wallpaper.sfwallpaper',bytes:stage.bytes,sha256:stage.sha256},...(stage.cover?[stage.cover]:[])];
   for(const asset of assets){
    const existing=release.assets?.find(a=>a.name===asset.name);
    if(existing){if(existing.size!==asset.bytes||existing.digest!=='sha256:'+asset.sha256)throw Error('Release已有同名但不同内容的文件，已停止；不会覆盖');}
    else{if(!release.draft)throw Error('已发布Release缺少文件，已停止；不会修改已发布作品');await runner.run(file,['release','upload',tag,asset.file,'--repo',repo]);}
   }
   release=await api(file,`${base}/releases/${release.id}`);
   const assetBase=protocol.releasePath(login,stage.id);
   for(const asset of assets){const r=release.assets?.find(a=>a.name===asset.name);if(!r||r.size!==asset.bytes||r.digest!=='sha256:'+asset.sha256||(!release.draft&&r.browser_download_url!==assetBase+'/'+asset.name))throw Error('上传未通过GitHub大小与摘要校验，请重试');}
   if(release.draft)release=await api(file,`${base}/releases/${release.id}`,'PATCH',{draft:false});uploaded=true;
   for(const asset of assets){const r=release.assets?.find(a=>a.name===asset.name);if(!r||r.browser_download_url!==assetBase+'/'+asset.name)throw Error('公开后的下载地址尚未确认，请重试');}
   const value=protocol.submission({format:'skinforge.wallpaper-submission',version:1,id:stage.id,url:assetBase+'/wallpaper.sfwallpaper',sha256:stage.sha256,bytes:stage.bytes,rightsConfirmed:true,...(stage.cover?{coverUrl:assetBase+'/'+stage.cover.name}:{})},login);
   let existing;
   // Deterministic release IDs plus issue reconciliation make retries safe after an uncertain response.
   for(let page=1;page<=10;page++){const issues=await api(file,`repos/${protocol.COMMUNITY}/issues?creator=${encodeURIComponent(login)}&state=all&per_page=100&page=${page}`);if(!Array.isArray(issues))throw Error('投稿列表格式无效');for(const i of issues){try{if(!i.pull_request&&protocol.parseBody(i.body,login).id===stage.id)existing=i;}catch{}}if(existing||issues.length<100)break;if(page===10)throw Error('投稿记录过多，请在GitHub手动核对后投稿');}
   const issue=existing||await api(file,`repos/${protocol.COMMUNITY}/issues`,'POST',{title:'[作品投稿] '+stage.meta.title,body:protocol.issueBody(value,stage.meta)});
   if(!Number.isSafeInteger(issue.number)||issue.html_url!==`https://github.com/${protocol.COMMUNITY}/issues/${issue.number}`)throw Error('投稿响应无效，请重试核对');
   return {issueUrl:issue.html_url,issueNumber:issue.number,url:value.url,message:existing?'已找到原投稿，未重复创建；审核记录见GitHub':'上传及投稿完成；维护者审核通过后进入社区目录'};
  }catch(e){throw Error((uploaded?'作品已上传，但投稿确认未完成；重试将复用已有文件。':'发布未完成；重试会核对已有Release，不覆盖不同内容。')+' '+e.message);}
 }
 return {account,configure,publish,close:()=>runner.close()};
}
module.exports={createRunner,createPublisher};
