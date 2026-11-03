'use strict';
const {parentPort,workerData:r}=require('node:worker_threads');
try{const {WallpaperProjects}=require('./we/wallpaper-projects.cjs'),library=new WallpaperProjects(r.store),row=library.candidate(r.source);const result=library.import(row.id);parentPort.postMessage({ok:true,...result});}catch(e){parentPort.postMessage({ok:false,error:e.message});}
