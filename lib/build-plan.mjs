import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readAsarMember,sha256File,joinPreloadScripts} from './asar.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const normalize=p=>path.resolve(p).replaceAll('\\','/').toLowerCase().replace(/\/$/,'');
export function disjoint(source,output){const a=normalize(source),b=normalize(output);assert(a!==b&&!a.startsWith(b+'/')&&!b.startsWith(a+'/'),'Source and output must not overlap');}
export async function prepare(source,output){
 source=await fs.realpath(source);output=path.resolve(output);disjoint(source,output);
 let parent=output;while(!await fs.stat(parent).catch(()=>null))parent=path.dirname(parent);
 const resolved=path.resolve(await fs.realpath(parent),path.relative(parent,output));disjoint(source,resolved);
 const archive=path.join(source,'resources','app.asar'),exe=path.join(source,'ChatGPT.exe');
 const manifest=JSON.parse((await readAsarMember(archive,'package.json')).toString());
 const supported=JSON.parse(await fs.readFile(path.join(repo,'supported-builds.json'),'utf8')).builds;
 const target=supported[manifest.version];assert(target,'Unsupported Codex version; compatibility must be reviewed before building');
 assert.equal(manifest.main,target.entry,'Unexpected main entry');
 const archiveSha256=await sha256File(archive),exeSha256=await sha256File(exe);
 assert.equal(archiveSha256,target.archiveSha256,'Application archive differs from the reviewed version');assert.equal(exeSha256,target.executableSha256,'Executable differs from the reviewed version');
 const main=await fs.readFile(path.join(repo,'src','wallpaper-main.cjs')),preload=joinPreloadScripts(joinPreloadScripts(joinPreloadScripts(joinPreloadScripts(Buffer.from('const sfwAppearance = (() => { const module = {exports:{}};\n'+await fs.readFile(path.join(repo,'src','wallpaper-appearance.cjs'),'utf8')+'\nreturn module.exports; })();'),await fs.readFile(path.join(repo,'src','wallpaper-preload.cjs'))),await fs.readFile(path.join(repo,'src','workshop-preload.cjs'))),await fs.readFile(path.join(repo,'src','we-preload.cjs'))),await fs.readFile(path.join(repo,'src','player-preload.cjs')));
 const additions={'.vite/build/skinforge-latest-wallpaper.cjs':main};
 for(const file of ['wallpaper-appearance.cjs','workshop-main.cjs','workshop-worker.cjs','workshop-store.cjs','workshop-package.cjs','workshop-community.cjs','workshop-submission.cjs','workshop-github.cjs','vendor/fflate.cjs','wallpaper-video-cache.cjs','video-playback.cjs','local-media-path.cjs','runtime-paths.cjs'])additions['.vite/build/'+file]=await fs.readFile(path.join(repo,'src',file));
 for(const file of ['we-main.cjs','we-worker.cjs',...(await fs.readdir(path.join(repo,'src','we'))).filter(f=>f.endsWith('.cjs')).map(f=>'we/'+f)])additions['.vite/build/'+file]=await fs.readFile(path.join(repo,'src',file));
 let ipc=(await readAsarMember(archive,target.ipcFile)).toString();assert.equal(ipc.split('"codex-ipc"').length-1,target.ipcLiteralOccurrences,'IPC anchor changed');
 ipc=ipc.replaceAll('"codex-ipc"','(process.env.SKINFORGE_WALLPAPER_IPC||"skinforge-codex-wallpaper-ipc")');
 return {source,output,archive,exe,archiveSha256,exeSha256,version:manifest.version,target,replacements:{[target.entry]:joinPreloadScripts("require('./skinforge-latest-wallpaper.cjs');",await readAsarMember(archive,target.entry)),[target.preload]:joinPreloadScripts(await readAsarMember(archive,target.preload),preload),[target.ipcFile]:Buffer.from(ipc)},additions};
}
