'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const MAX_BYTES = 512 * 1024 * 1024, MAX_FILES = 8192
const MIME = Object.freeze({'.html':'text/html','.htm':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.ico':'image/x-icon','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.txt':'text/plain','.gltf':'model/gltf+json','.glb':'model/gltf-binary'})
const SCENE_MIME=Object.freeze({...MIME,'.pkg':'application/octet-stream','.tex':'application/octet-stream','.mdl':'application/octet-stream','.mat':'application/octet-stream','.fx':'text/plain','.dxs':'application/octet-stream'})
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const validId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
function safeRelative(name) {
  return typeof name === 'string' && name.length <= 1024 && name.length > 0 && !/[\\:\u0000-\u001f]/.test(name) && name.split('/').every(p => p && p !== '.' && p !== '..' && !/^[.]|[ .]$|[<>"|?*]/.test(p) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))
}
function plainPath(filename) {
  let current = path.resolve(filename)
  for (;;) {
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink()) throw Error('壁纸路径包含链接或目录联接')
    const parent = path.dirname(current); if (parent === current) break; current = parent
  }
  return fs.lstatSync(filename)
}
function resource(root, name) {
  if (!safeRelative(name)) throw Error('壁纸资源路径无效')
  const target = path.resolve(root, ...name.split('/')), base = path.resolve(root)
  if (!target.startsWith(base + path.sep)) throw Error('壁纸资源越界')
  const stat = plainPath(target)
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES) throw Error('壁纸资源不是普通文件或过大')
  if (!fs.realpathSync(target).startsWith(fs.realpathSync(base) + path.sep)) throw Error('壁纸资源越界')
  return { target, stat }
}
function openChecked(target, expected) {
  const fd=fs.openSync(target,'r')
  try {const actual=fs.fstatSync(fd);if(!actual.isFile()||actual.nlink!==1||actual.dev!==expected.dev||actual.ino!==expected.ino||actual.size!==expected.size||actual.mtimeMs!==expected.mtimeMs)throw Error('壁纸资源在读取前发生变化');return fd}catch(error){fs.closeSync(fd);throw error}
}
function readChecked(record) {const fd=openChecked(record.target,record.stat);try{return fs.readFileSync(fd)}finally{fs.closeSync(fd)}}
function jsonFile(filename, limit = 2 * 1024 * 1024) {
  const stat = plainPath(filename)
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) throw Error('壁纸清单无效或过大')
  return JSON.parse(readChecked({target:filename,stat}).toString('utf8'))
}
function propertiesFrom(project) {
  const source = project.general?.properties
  if (!plain(source)) return {}
  const output = Object.create(null)
  for (const [key, item] of Object.entries(source).slice(0, 512)) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(key) || !plain(item)) continue
    const rawType = String(item.type || '').toLowerCase(),type=rawType==='textinput'?'text':rawType
    const supported = ['bool','slider','color','text','combo','group'].includes(type)
    output[key] = { type, supported, order:Number.isFinite(item.order)?item.order:Object.keys(output).length,
      ...(typeof item.condition==='string'&&item.condition.length<=512?{condition:item.condition}:{}), label:String(item.text || key).slice(0, 300), value:item.value ?? (type === 'bool' ? false : type === 'slider' ? 0 : ''),
      ...(type === 'slider' ? {min:Number.isFinite(item.min)?item.min:0,max:Number.isFinite(item.max)?item.max:100,step:Number.isFinite(item.step)&&item.step>0?item.step:1}:{}),
      ...(type === 'combo' ? {options:(Array.isArray(item.options)?item.options:[]).slice(0,128).filter(x=>plain(x)&&['string','number','boolean'].includes(typeof x.value)).map(x=>({label:String(x.label || x.value).slice(0,200),value:x.value}))}:{}),
    }
  }
  return JSON.parse(JSON.stringify(output))
}
function validateValues(definitions, values) {
  if (!plain(values) || Object.keys(values).length > 512) throw Error('网页壁纸属性无效')
  for (const [key, value] of Object.entries(values)) {
    const d = definitions[key]
    if (!d?.supported || d.type === 'group') throw Error('网页壁纸属性不受支持')
    if (d.type === 'bool' && typeof value !== 'boolean' || d.type === 'slider' && (!Number.isFinite(value) || value < d.min || value > d.max) || d.type === 'text' && (typeof value !== 'string' || value.length > 4096) || d.type === 'color' && (typeof value !== 'string' || !/^(?:0(?:\.\d+)?|1(?:\.0+)?) (?:0(?:\.\d+)?|1(?:\.0+)?) (?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value)) || d.type === 'combo' && !d.options.some(x=>x.value === value)) throw Error('网页壁纸属性值超出范围')
  }
  return values
}
function inspect(root) {
  const project = jsonFile(path.join(root, 'project.json'))
  if (!plain(project)) throw Error('project.json 无效')
  const type = String(project.type || '').toLowerCase(), entry = project.file
  const title = String(project.title || path.basename(root)).slice(0, 200)
  let supported = ['video','web','scene'].includes(type), reason = supported ? '' : '应用或未知类型壁纸不能作为背景运行'
  if (type==='scene') {
    if(!safeRelative(entry)||! /\.(?:json|pkg)$/i.test(entry)) {supported=false;reason='场景入口必须是 JSON 或 PKG 文件'}
    else try{resource(root,fs.existsSync(path.join(root,'scene.pkg'))?'scene.pkg':entry);reason='使用本机 Wallpaper Engine 原引擎渲染'}catch{supported=false;reason='场景资源缺失，请重新下载或选择完整作品文件夹'}
  } else if (supported) {
    resource(root, entry)
    if (type === 'video' && path.extname(entry).toLowerCase() !== '.mp4') { supported=false;reason='仅支持 H.264 MP4 视频' }
    if (type === 'web' && !/\.html?$/i.test(entry)) { supported=false;reason='网页入口必须为 HTML 文件' }
  }
  let thumbnail = null
  try { const p=resource(root,project.preview);const mime=MIME[path.extname(project.preview).toLowerCase()];if(mime?.startsWith('image/')&&mime!=='image/svg+xml'&&p.stat.size<=2*1024*1024)thumbnail=`data:${mime};base64,${readChecked(p).toString('base64')}` } catch {}
  return {title,type,entry,supported,reason,thumbnail,properties:propertiesFrom(project),warnings:type==='web'?['系统音频、系统媒体信息和原生插件暂不支持；默认静音、离线']:[]}
}
function collect(root,type='web') {
  const files=[];let total=0
  function visit(relative='') {
    for(const entry of fs.readdirSync(path.join(root,...relative.split('/').filter(Boolean)),{withFileTypes:true})) {
      const name=relative?relative+'/'+entry.name:entry.name
      if (!safeRelative(name)) throw Error('壁纸含不安全文件名')
      const stat=plainPath(path.join(root,...name.split('/')))
      if (stat.isDirectory()) { if(name.split('/').length>20)throw Error('壁纸目录过深');visit(name);continue }
      if(type==='scene'&&/\.(?:exe|dll|bat|cmd|ps1|lnk)$/i.test(name))throw Error('场景资源不能包含程序或系统脚本')
      if (!(type==='scene'?SCENE_MIME:MIME)[path.extname(name).toLowerCase()]) continue
      if (/^(?:auth|credentials|cookies|local state)(?:\.|$)/i.test(entry.name)) throw Error('壁纸目录含账号文件')
      const {target,stat:checked}=resource(root,name);total+=checked.size
      if(total>MAX_BYTES||files.length>=MAX_FILES)throw Error('网页壁纸超过 512 MB 或 8192 个资源上限')
      files.push({path:name,bytes:checked.size,sha256:hash(readChecked({target,stat:checked}))})
    }
  }
  visit();return files.sort((a,b)=>a.path.localeCompare(b.path,'en'))
}
function steamRoots() {
  const roots=new Set()
  if(process.platform==='win32')try{const output=execFileSync('reg.exe',['query','HKCU\\Software\\Valve\\Steam','/v','SteamPath'],{encoding:'utf8',windowsHide:true,timeout:3000});const value=output.match(/SteamPath\s+REG_SZ\s+(.+)/)?.[1]?.trim();if(value)roots.add(path.resolve(value))}catch{}
  for(const root of [...roots])try{const text=fs.readFileSync(path.join(root,'steamapps','libraryfolders.vdf'),'utf8');for(const m of text.matchAll(/"path"\s+"((?:\\.|[^"\\])*)"/g))roots.add(path.resolve(m[1].replace(/\\\\/g,'\\')))}catch{}
  return [...new Map([...roots].map(root=>[path.resolve(root).toLowerCase(),path.join(root,'steamapps','workshop','content','431960')])).values()]
}
class WallpaperProjects {
  constructor(root) {this.root=path.resolve(root);this.candidates=new Map();this.verified=new Map();this.permissionsFile=path.join(this.root,'network.json')}
  scan(roots=steamRoots()) {
    const rows=[]
    for(const root of roots)try{plainPath(root);for(const d of fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()).slice(0,2000)){try{rows.push(this.candidate(path.join(root,d.name)))}catch{rows.push({id:null,title:d.name,type:'unknown',supported:false,reason:'清单缺失、损坏或路径不安全'})}}}catch{}
    return rows
  }
  candidate(root) {plainPath(root);const row=inspect(root),id=crypto.randomUUID();this.candidates.set(id,path.resolve(root));if(this.candidates.size>4000)this.candidates.delete(this.candidates.keys().next().value);return {...row,id}}
  source(id) {const root=this.candidates.get(id);if(!root)throw Error('壁纸选择已过期，请刷新');return {root,...inspect(root)}}
  import(id) {
    const source=this.source(id);if(!source.supported)throw Error(source.reason)
    if(!['web','scene'].includes(source.type))return source
    return this.importBundle({...(source.type==='scene'?{type:'scene'}:{}),title:source.title,entry:source.type==='scene'?'project.json':source.entry,properties:source.properties,files:collect(source.root,source.type).map(item=>({...item,data:readChecked(resource(source.root,item.path))}))})
  }
  importBundle(bundle) {
    if(!plain(bundle)||!safeRelative(bundle.entry)||!Array.isArray(bundle.files)||!bundle.files.length||bundle.files.length>MAX_FILES)throw Error('网页资源包无效')
    if(bundle.type!==undefined&&bundle.type!=='scene')throw Error('壁纸资源包类型无效')
    const scene=bundle.type==='scene',names=new Set();let total=0
    const files=bundle.files.map(item=>{if(!plain(item)||!safeRelative(item.path)||!(scene?SCENE_MIME:MIME)[path.extname(item.path).toLowerCase()]||names.has(item.path.toLowerCase()))throw Error('壁纸资源包路径无效或重复');names.add(item.path.toLowerCase());const data=Buffer.isBuffer(item.data)?item.data:Buffer.from(item.data);total+=data.length;if(total>MAX_BYTES||data.length!==item.bytes||hash(data)!==item.sha256)throw Error('壁纸资源校验失败');return {...item,data}}).sort((a,b)=>a.path.localeCompare(b.path,'en'))
    if(!files.some(f=>f.path===bundle.entry)||!(scene?bundle.entry==='project.json':/\.html?$/i.test(bundle.entry)))throw Error('壁纸入口缺失')
    if(scene){const project=JSON.parse(files.find(f=>f.path==='project.json').data.toString('utf8'));if(String(project.type).toLowerCase()!=='scene'||!safeRelative(project.file)||! /\.(?:json|pkg)$/i.test(project.file)||!files.some(f=>f.path==='scene.pkg'||f.path===project.file))throw Error('场景资源包不完整或入口无效')}
    const metadata={...(scene?{type:'scene'}:{}),title:String(bundle.title || '壁纸').slice(0,200),entry:bundle.entry,properties:propertiesFrom({general:{properties:Object.fromEntries(Object.entries(bundle.properties || {}).map(([k,v])=>[k,{...v,text:v.label,options:v.options?.map(o=>({label:o.label,value:o.value}))}]))}}),files:files.map(({data,...f})=>({path:f.path,bytes:f.bytes,sha256:f.sha256}))}
    const projectId=hash(Buffer.from(JSON.stringify(metadata))),destination=path.join(this.root,projectId)
    fs.mkdirSync(this.root,{recursive:true});plainPath(this.root)
    if(!fs.existsSync(destination)){const stage=path.join(this.root,'stage-'+crypto.randomUUID());fs.mkdirSync(stage);try{for(const f of files){const target=path.join(stage,...f.path.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,f.data,{flag:'wx',mode:0o600})}fs.writeFileSync(path.join(stage,'.manifest.json'),JSON.stringify(metadata),{flag:'wx',mode:0o600});fs.renameSync(stage,destination)}catch(error){if(path.dirname(stage)===this.root)fs.rmSync(stage,{recursive:true,force:true});throw error}}
    const result=this.get(projectId);for(const file of result.files)this.info(projectId,file.path)
    return {type:scene?'scene':'web',projectId,title:result.title,properties:result.properties,supported:true}
  }
  get(id) {if(!validId(id))throw Error('网页壁纸标识无效');const metadata=jsonFile(path.join(this.root,id,'.manifest.json'));if(hash(Buffer.from(JSON.stringify(metadata)))!==id)throw Error('网页壁纸清单校验失败');resource(path.join(this.root,id),metadata.entry);return metadata}
  info(id,name) {const m=this.get(id),entry=m.files.find(f=>f.path===name);if(!entry)throw Error('资源不在壁纸清单中');const r=resource(path.join(this.root,id),name);if(r.stat.size!==entry.bytes)throw Error('壁纸资源已损坏');const signature=[r.stat.dev,r.stat.ino,r.stat.size,r.stat.mtimeMs,r.stat.ctimeMs].join(':');const key=id+'/'+name;if(this.verified.get(key)!==signature){const digest=crypto.createHash('sha256'),chunk=Buffer.alloc(1024*1024),fd=openChecked(r.target,r.stat);try{let size;while((size=fs.readSync(fd,chunk,0,chunk.length,null))>0)digest.update(chunk.subarray(0,size))}finally{fs.closeSync(fd)}if(digest.digest('hex')!==entry.sha256)throw Error('壁纸资源内容校验失败');if(this.verified.size>16384)this.verified.clear();this.verified.set(key,signature)}return {target:r.target,stat:r.stat,bytes:r.stat.size,mime:MIME[path.extname(name).toLowerCase()]}}
  read(id,name) {const r=this.info(id,name);return {data:readChecked(r),mime:r.mime}}
  export(id) {const m=this.get(id);return {...m,files:m.files.map(f=>({...f,data:this.read(id,f.path).data}))}}
  streamExport(id) {const m=this.get(id);return {...m,files:m.files.map(f=>({...f,source:this.info(id,f.path)}))}}
  imported() {try{return fs.readdirSync(this.root).filter(validId).flatMap(id=>{try{const m=this.get(id);let thumbnail=null;try{const project=JSON.parse(this.read(id,'project.json').data.toString('utf8')),info=this.info(id,project.preview);if(info.mime.startsWith('image/')&&info.mime!=='image/svg+xml'&&info.bytes<=2*1024*1024)thumbnail=`data:${info.mime};base64,${readChecked(info).toString('base64')}`}catch{}return [{id,projectId:id,title:m.title,type:m.type || 'web',supported:true,reason:m.type==='scene'?'使用本机 Wallpaper Engine 原引擎渲染':'',properties:m.properties,thumbnail,imported:true}]}catch{return []}})}catch{return []}}
  domains(id,value) {this.get(id);let records={};try{records=jsonFile(this.permissionsFile)}catch{};if(value!==undefined){if(!Array.isArray(value)||value.length>16||value.some(v=>typeof v!=='string'||v.length>253||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(v)||/\.(?:local|localhost|internal|test|invalid)$/.test(v)))throw Error('请输入最多 16 个完整 HTTPS 域名，不使用通配符');records[id]=[...new Set(value)];fs.mkdirSync(this.root,{recursive:true});plainPath(this.root);if(fs.existsSync(this.permissionsFile))plainPath(this.permissionsFile);fs.writeFileSync(this.permissionsFile,JSON.stringify(records),{mode:0o600})}return records[id] || []}
}
module.exports={WallpaperProjects,MIME,SCENE_MIME,MAX_BYTES,MAX_FILES,hash,plain,safeRelative,resource,inspect,collect,propertiesFrom,validateValues,validId,steamRoots,plainPath,openChecked,readChecked}
