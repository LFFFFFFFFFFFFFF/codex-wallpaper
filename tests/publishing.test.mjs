import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),pack=require('../src/workshop-package.cjs'),protocol=require('../src/workshop-submission.cjs'),{createPublisher}=require('../src/workshop-github.cjs'),{Workshop}=require('../src/workshop-store.cjs'),setup=require('../src/workshop-main.cjs'),community=require('../src/workshop-community.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jc1kAAAAASUVORK5CYII=','base64');
const meta={title:'Original fixture',author:'artist',description:'An original test',tags:[],license:'CC0-1.0'};
const temp=()=>fs.mkdtemp(path.join(os.tmpdir(),'sf-publish-'));
async function stage(){const root=await temp(),p=pack.create(meta,png,'.png',png,'.png'),file=path.join(root,'wallpaper.sfwallpaper');await fs.writeFile(file,p.bytes);return {root,p,id:p.id,file,bytes:p.bytes.length,sha256:pack.sha(p.bytes),meta};}
const notFound=()=>Object.assign(Error('HTTP 404'),{notFound:true});
function fakeGitHub(s){
 const state={account:'artist',repo:null,release:null,issues:[],calls:[],failIssue:false};
 const runner={close(){},async run(file,args,input){state.calls.push(args);if(args[0]==='release'){const name=path.basename(args[3]);state.release.assets.push({name,size:s.bytes,digest:'sha256:'+s.sha256,browser_download_url:protocol.releasePath('artist',s.id)+'/'+name});return '';}
  assert.equal(args[0],'api');assert.equal(args[2],'github.com');const endpoint=args[3],method=args[5],body=input?JSON.parse(input):undefined;let result;
  if(endpoint==='user')result={login:state.account};
  else if(endpoint==='user/repos'){state.repo={owner:{login:'artist'},private:false};result=state.repo;}
  else if(endpoint.endsWith('/codex-wallpaper-works')){if(!state.repo)throw notFound();result=state.repo;}
  else if(endpoint.includes('/releases/tags/')){if(!state.release||state.release.draft)throw notFound();result=state.release;}
  else if(endpoint.includes('/releases?'))result=state.release?[state.release]:[];
  else if(endpoint.endsWith('/releases')){state.release={id:12,tag_name:body.tag_name,draft:true,assets:[]};result=state.release;}
  else if(endpoint.endsWith('/releases/12')){if(method==='PATCH')state.release.draft=false;result=state.release;}
  else if(endpoint.includes('/issues?'))result=state.issues;
  else if(endpoint.endsWith('/issues')){const i={number:4,html_url:`https://github.com/${protocol.COMMUNITY}/issues/4`,body:body.body};state.issues.push(i);if(state.failIssue){state.failIssue=false;throw Error('HTTP 500 after issue creation');}result=i;}
  else throw Error('Unexpected endpoint '+endpoint);
  return JSON.stringify(result);
 }};return {state,runner};
}
test('default catalog survives favorite writes; explicit disabled and custom URLs are preserved',async()=>{
 const s=new Workshop(await temp());assert.equal(s.settings().catalogUrl,protocol.DEFAULT_CATALOG);s.catalog('');assert.equal(new Workshop(s.root).settings().catalogUrl,'');s.catalog('https://test.github.io/catalog.json');assert.equal(new Workshop(s.root).settings().catalogUrl,'https://test.github.io/catalog.json');
});
test('pack exports are deterministic across clock changes for safe release retries',()=>{
 const a=pack.create(meta,png,'.png').bytes;const old=Date;globalThis.Date=class extends old{constructor(...args){super(...(args.length?args:['2031-01-01T12:00:00Z']));}};try{assert.deepEqual(pack.create(meta,png,'.png').bytes,a);}finally{globalThis.Date=old;}
});
test('publishing creates a public draft, verifies assets then publishes and reconciles an uncertain issue response',async()=>{
 const s=await stage(),{state,runner}=fakeGitHub(s),pub=createPublisher({root:s.root,runner});state.failIssue=true;
 await assert.rejects(pub.publish(s,'artist'),/已上传.*投稿确认未完成/);const r=await pub.publish(s,'artist');assert.equal(r.issueNumber,4);assert.equal(state.issues.length,1);assert.equal(state.calls.filter(x=>x[0]==='release').length,1);assert.equal(state.release.draft,false);
 assert.equal(protocol.parseBody(state.issues[0].body,'artist').id,s.id);
});
test('draft release retry reuses verified assets; private repository, account switch, mutation and conflicting asset refuse publication',async()=>{
 const s=await stage(),f=fakeGitHub(s),pub=createPublisher({root:s.root,runner:f.runner});
 f.state.account='other';await assert.rejects(pub.publish(s,'artist'),/账号已切换/);assert.equal(f.state.repo,null);f.state.account='artist';
 f.state.repo={owner:{login:'artist'},private:true};await assert.rejects(pub.publish(s,'artist'),/公开仓库/);
 f.state.repo.private=false;f.state.release={id:12,tag_name:'wallpaper-'+s.id,draft:true,assets:[{name:'wallpaper.sfwallpaper',size:s.bytes,digest:'sha256:'+s.sha256,browser_download_url:protocol.releasePath('artist',s.id)+'/wallpaper.sfwallpaper'}]};
 await pub.publish(s,'artist');assert.equal(f.state.calls.filter(x=>x[0]==='release').length,0);
 f.state.release.assets[0].digest='sha256:'+'0'.repeat(64);await assert.rejects(pub.publish(s,'artist'),/不会覆盖/);
 await fs.writeFile(s.file,'changed');await assert.rejects(pub.publish(s,'artist'),/待发布文件已变化/);
});
test('moderation enforces maintainer rights, owner URL, approved snapshot, pack ID/hash and cover contents',async()=>{
 const s=await stage(),coverUrl=protocol.releasePath('artist',s.id)+'/cover.png';const value={format:'skinforge.wallpaper-submission',version:1,id:s.id,url:protocol.releasePath('artist',s.id)+'/wallpaper.sfwallpaper',bytes:s.bytes,sha256:s.sha256,rightsConfirmed:true,coverUrl};
 const issue={user:{login:'artist'},state:'open',labels:[{name:'workshop-approved'}],body:protocol.issueBody(value,meta)},fetch=async url=>url===coverUrl?png:s.p.bytes;
 const entry=await protocol.review(issue,'write',fetch);assert.equal(entry.coverUrl,coverUrl);const catalog={format:'skinforge.wallpaper-catalog',version:1,items:[]};assert.equal(protocol.addEntry(catalog,entry),true);assert.equal(protocol.addEntry(catalog,entry),false);assert.equal(community.catalog(catalog).items[0].coverUrl,coverUrl);
 await assert.rejects(protocol.review(issue,'triage',fetch),/权限/);await assert.rejects(protocol.review({...issue,labels:[]},'admin',fetch),/尚未批准/);assert.throws(()=>protocol.parseBody(issue.body,'other'),/投稿人自己/);
 await assert.rejects(protocol.review(issue,'admin',async()=>Buffer.from('wrong')),/SHA256/);assert.throws(()=>protocol.addEntry(catalog,{...entry,bytes:entry.bytes+1}),/不同内容/);
 assert.throws(()=>protocol.parseBody(issue.body+'\n'+protocol.MARKER,'artist'),/唯一/);assert.throws(()=>protocol.submission({...value,url:'https://localhost/a'},'artist'),/自己/);
 await assert.rejects(protocol.review(issue,'admin',async url=>url===coverUrl?Buffer.from('bad'):s.p.bytes),/封面校验/);
});
test('main publication requires a window-owned expiring confirmation; preview stages stay local and are cleaned',async()=>{
 const root=await temp(),store=new Workshop(path.join(root,'workshop')),p=pack.create(meta,png,'.png');store.import(p.bytes);let calls=0;
 const handle=setup({root,dialog:{},load:()=>({}),save(){},state:()=>({}),publisherFactory:()=>({account:async()=>({login:'artist'}),publish:async(s,login)=>{calls++;assert.equal(login,'artist');assert.equal(pack.inspect(await fs.readFile(s.file)).id,p.id);return {issueNumber:4};},close(){}})});
 const w={id:1,isDestroyed:()=>false},prepared=await handle(w,{action:'workshop:publish-prepare',id:p.id});assert(!JSON.stringify(prepared).includes(root));
 await assert.rejects(handle({...w,id:2},{action:'workshop:publish',token:prepared.publication.token,rightsConfirmed:true}));await assert.rejects(handle(w,{action:'workshop:publish',token:prepared.publication.token}));assert.equal(calls,0);
 await handle(w,{action:'workshop:publish',token:prepared.publication.token,rightsConfirmed:true});assert.equal(calls,1);assert.equal((await fs.readdir(store.root)).filter(x=>x.startsWith('.publish-')).length,0);await assert.rejects(handle(w,{action:'workshop:publish',token:prepared.publication.token,rightsConfirmed:true}));handle.close();
});
