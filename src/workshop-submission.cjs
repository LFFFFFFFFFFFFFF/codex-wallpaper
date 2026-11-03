'use strict';
const pack=require('./workshop-package.cjs');
const COMMUNITY='LFFFFFFFFFFFFFF/codex-wallpaper';
const CREATOR_REPO='codex-wallpaper-works';
const DEFAULT_CATALOG=`https://raw.githubusercontent.com/${COMMUNITY}/main/community/catalog.json`;
const MARKER='<!-- codex-wallpaper-submission:v1 -->';
const MAX_PACKAGE=pack.MAX+pack.COVER+65536;
function login(value){if(typeof value!=='string'||! /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(value))throw Error('GitHub账号无效');return value;}
function releasePath(owner,id){login(owner);if(!/^[a-f0-9]{64}$/.test(id))throw Error('作品ID无效');return `https://github.com/${owner}/${CREATOR_REPO}/releases/download/wallpaper-${id}`;}
function submission(value,author){
 if(!value||Object.keys(value).some(k=>!['format','version','id','url','sha256','bytes','coverUrl','rightsConfirmed'].includes(k))||value.format!=='skinforge.wallpaper-submission'||value.version!==1||value.rightsConfirmed!==true||!Number.isSafeInteger(value.bytes)||value.bytes<=0||value.bytes>MAX_PACKAGE||!/^[a-f0-9]{64}$/.test(value.sha256))throw Error('投稿信息无效或未确认分发权利');
 const base=releasePath(author,value.id);
 if(value.url!==base+'/wallpaper.sfwallpaper'||(value.coverUrl&&!['png','jpg','jpeg','webp'].some(ext=>value.coverUrl===base+'/cover.'+ext)))throw Error('投稿必须引用投稿人自己仓库中对应作品的Release');
 return {...value};
}
function issueBody(value,meta){return `作品：${meta.title}\n作者：${meta.author||'未署名'}\n许可：${meta.license}\n\n请维护者检查素材权利和实际画面后，添加 workshop-approved 标签。\n\n${MARKER}\n\x60\x60\x60json\n${JSON.stringify(value,null,2)}\n\x60\x60\x60`;}
function parseBody(body,author){if(typeof body!=='string'||body.length>16000||body.split(MARKER).length!==2)throw Error('缺少唯一的作品投稿数据');const text=body.slice(body.indexOf(MARKER)+MARKER.length).trim();const match=/^\x60{3}json\s*\n([\s\S]+?)\n\x60{3}$/.exec(text);if(!match)throw Error('投稿JSON格式无效');return submission(JSON.parse(match[1]),author);}
async function review(issue,permission,getBytes){
 if(!['admin','maintain','write'].includes(permission))throw Error('审核者需要仓库写入或维护权限');
 if(issue.pull_request||issue.state!=='open'||!issue.labels?.some(x=>x.name==='workshop-approved'))throw Error('投稿尚未批准或已关闭');
 const s=parseBody(issue.body,issue.user.login),bytes=await getBytes(s.url,s.bytes);
 if(bytes.length!==s.bytes||pack.sha(bytes)!==s.sha256)throw Error('投稿文件大小或SHA256不符');
 const p=pack.inspect(bytes);if(p.id!==s.id)throw Error('投稿ID与包内容不符');
 if(s.coverUrl){const cover=p.manifest.cover;if(!cover||!s.coverUrl.endsWith('/'+cover.file))throw Error('投稿封面与包内容不符');const b=await getBytes(s.coverUrl,cover.bytes);if(b.length!==cover.bytes||pack.sha(b)!==cover.sha256)throw Error('投稿封面校验失败');}
 return {...pack.metaOnly(p.manifest),id:s.id,url:s.url,sha256:s.sha256,bytes:s.bytes,kind:p.manifest.media.mime.startsWith('video/')?'video':'image',...(s.coverUrl?{coverUrl:s.coverUrl}:{})};
}
function addEntry(catalog,entry){const old=catalog.items.find(x=>x.id===entry.id);if(old){if(JSON.stringify(old)!==JSON.stringify(entry))throw Error('目录已有同ID但不同内容的作品');return false;}if(catalog.items.length>=200)throw Error('社区目录已满');catalog.items.push(entry);return true;}
module.exports={COMMUNITY,CREATOR_REPO,DEFAULT_CATALOG,MARKER,MAX_PACKAGE,login,releasePath,submission,issueBody,parseBody,review,addEntry};
