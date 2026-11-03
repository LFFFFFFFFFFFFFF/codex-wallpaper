import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {prepare} from '../lib/build-plan.mjs';import {patchAsar,sha256File} from '../lib/asar.mjs';import {updateIntegrityResource} from '../lib/integrity.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const options={};for(let i=2;i<process.argv.length;i++){const k=process.argv[i];if(k==='--plan')options.plan=true;else if(['--source','--out'].includes(k)&&process.argv[i+1]&&!process.argv[i+1].startsWith('--'))options[k.slice(2)]=process.argv[++i];else throw Error('Usage: node scripts/build.mjs --source PATH [--out EMPTY_PATH] [--plan]');}
try{
 if(!options.source){if(process.platform!=='win32')throw Error('Windows is required; pass --source to inspect a local Windows build');const q=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"$p=Get-AppxPackage -Name OpenAI.Codex; if(-not $p){throw 'Codex package not installed'}; Join-Path $p.InstallLocation 'app'"],{encoding:'utf8',windowsHide:true}).trim();options.source=q;}
 const p=await prepare(options.source,options.out||path.join(repo,'.local'));
 if(options.plan){console.log(JSON.stringify({ok:true,mode:'plan-only',version:p.version,changed:Object.keys(p.replacements),added:Object.keys(p.additions),outputCreated:false,sourceChanged:false}));process.exit(0);}
 if(await fs.stat(p.output).catch(()=>null))throw Error('Output already exists. Preserve it and choose a new empty --out directory.');
 await fs.mkdir(p.output,{recursive:true});await fs.writeFile(path.join(p.output,'BUILD-IN-PROGRESS.json'),JSON.stringify({format:'skinforge.local-build',source:p.source,version:p.version}));
 const runtime=path.join(p.output,'runtime');await fs.mkdir(runtime);
 async function copy(s,d){await fs.mkdir(d,{recursive:true});for(const e of await fs.readdir(s,{withFileTypes:true})){if(['ChatGPT.exe','app.asar'].includes(e.name))continue;const from=path.join(s,e.name),to=path.join(d,e.name);if(e.isSymbolicLink())throw Error('Unexpected link in installed runtime');if(e.isDirectory())await copy(from,to);else await fs.copyFile(from,to);}}
 await copy(p.source,runtime);
 const native=path.join(runtime,'resources','app.asar.unpacked','.vite','build','we');await fs.mkdir(native,{recursive:true});await fs.copyFile(path.join(repo,'src','we','wallpaper-native-window.ps1'),path.join(native,'wallpaper-native-window.ps1'));
 if(process.env.SKINFORGE_WE_CAPTURE_EXE)await fs.copyFile(process.env.SKINFORGE_WE_CAPTURE_EXE,path.join(runtime,'resources','codex-we-window-capture.exe'));
 if(process.env.SKINFORGE_FFMPEG_EXE){
  const {createRequire}=await import('node:module'),require=createRequire(import.meta.url),{configureTranscoder}=require('../src/runtime-paths.cjs');
  const tools=path.join(runtime,'resources','tools','ffmpeg');await fs.mkdir(tools,{recursive:true});const ffmpeg=path.join(tools,'ffmpeg.exe');await fs.copyFile(process.env.SKINFORGE_FFMPEG_EXE,ffmpeg);
  const configFile=path.join(tools,'tool.json');await configureTranscoder(ffmpeg,{configFile});const config=JSON.parse(await fs.readFile(configFile,'utf8'));config.path='ffmpeg.exe';await fs.writeFile(configFile,JSON.stringify(config,null,2));
 }
 const archive=path.join(runtime,'resources','app.asar'),exe=path.join(runtime,'ChatGPT.exe');
 const patch=await patchAsar({source:p.archive,output:archive,expectedSha256:p.archiveSha256,replacements:p.replacements,additions:p.additions,entry:p.target.entry});
 const executable=await updateIntegrityResource({originalExe:p.exe,originalArchive:p.archive,archive,output:exe});
 if(await sha256File(p.archive)!==p.archiveSha256||await sha256File(p.exe)!==p.exeSha256)throw Error('Source changed during build; do not use partial output');
 const manifest={format:'skinforge.local-wallpaper-build',version:1,codexVersion:p.version,source:p.source,sourceArchiveSha256:p.archiveSha256,archive,archiveSha256:patch.outputSha256,exe,executable,originalInstallationModified:false,wallpaperBundled:false,authCopied:false,createdAt:new Date().toISOString()};
 await fs.copyFile(path.join(repo,'launcher','Start-Wallpaper.ps1'),path.join(p.output,'Start-Wallpaper.ps1'));
 await fs.copyFile(path.join(repo,'launcher','Start-Wallpaper.vbs'),path.join(p.output,'Start-Wallpaper.vbs'));
 await fs.mkdir(path.join(p.output,'licenses'),{recursive:true});await fs.copyFile(path.join(repo,'third-party','fflate-LICENSE.txt'),path.join(p.output,'licenses','fflate-LICENSE.txt'));
 await fs.writeFile(path.join(p.output,'build-manifest.json'),JSON.stringify(manifest,null,2));
 await fs.unlink(path.join(p.output,'BUILD-IN-PROGRESS.json'));
 console.log(JSON.stringify({ok:true,version:p.version,entry:path.join(p.output,'Start-Wallpaper.ps1'),signature:'local modified copy; original publisher signature is not valid',profile:'independent by default'}));
}catch(e){console.error(e.message);process.exitCode=1;}
