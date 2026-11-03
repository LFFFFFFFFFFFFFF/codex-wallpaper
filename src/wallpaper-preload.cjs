;(()=>{
const {ipcRenderer}=require('electron'),channel='skinforge-latest-wallpaper-v1';
if(location.protocol!=='app:'||location.host!=='-'||!location.pathname.endsWith('/index.html'))return;
const api=r=>ipcRenderer.invoke(channel,r);let current,media=null,appearance=null,weReady=false,loadError='';
function renderAvailability(){
 if(!current)return;
 const ready=current.kind==='we'?weReady:media?.tagName==='VIDEO'?media.readyState>=2:media?.complete&&media.naturalWidth>0;
 const active=!!current.enabled&&!!ready;
 appearance?.apply({...current,enabled:active});
 document.documentElement.classList.toggle('sfw-enabled',active);
 const button=document.getElementById('sfw-button');
 button.textContent=current.enabled&&!ready?(loadError?'壁纸加载失败':'壁纸加载中…'):'壁纸';
 button.title=loadError||'壁纸设置';
 if(loadError)document.getElementById('sfw-status').textContent=loadError;
}
function apply(s){
 if(current?.we?.projectId!==s.we?.projectId){weReady=false;loadError='';}
 current=s;document.documentElement.style.setProperty('--sfw-shade',String(s.shade??.32));
 if(s.kind==='we'){media?.pause?.();media?.remove();media=null;}else{
 if(!media||media.dataset.url!==s.url){media?.pause?.();media?.remove();loadError='';media=document.createElement(s.kind==='video'?'video':'img');media.dataset.url=s.url||'';const selected=media;const loaded=()=>{if(media===selected){loadError='';renderAvailability();}};media.addEventListener('load',loaded);media.addEventListener('loadeddata',loaded);media.addEventListener('error',()=>{if(media===selected){loadError='壁纸素材未能加载，请重新加载或选择其他作品';renderAvailability();}});if(s.kind==='video'){media.autoplay=true;media.loop=true;media.playsInline=true;media.muted=s.muted!==false;}if(s.url)media.src=s.url;document.querySelector('#sfw-layer').prepend(media);}
 media.style.objectFit=s.fit||'cover';if(media.tagName==='VIDEO'){media.muted=s.muted!==false;media.volume=Number.isFinite(s.volume)?s.volume:.5;if(s.enabled&&!s.paused&&!document.hidden)media.play().catch(()=>{});else media.pause();}
 }
 const status=document.getElementById('sfw-status');if(status)status.textContent=s.error||s.title;
 const toggle=document.getElementById('sfw-toggle');if(toggle)toggle.textContent=s.enabled?'关闭壁纸':'开启壁纸';
 const fit=document.getElementById('sfw-fit');if(fit)fit.value=s.fit;const shade=document.getElementById('sfw-shade');if(shade)shade.value=String(s.shade);
 renderAvailability();
 document.dispatchEvent(new Event('sfw-background-changed'));
}
async function act(r){try{const result=await api(r);if(result.ok&&result.state)apply(result.state);else if(result.error)document.getElementById('sfw-status').textContent=result.error;}catch(e){document.getElementById('sfw-status').textContent=e.message;}}
function mount(){
 if(document.getElementById('sfw-button'))return;
 const style=document.createElement('style');style.textContent=`
 #sfw-layer{position:fixed;inset:0;z-index:0;pointer-events:none;background:#111;display:none}#sfw-layer>video,#sfw-layer>img{width:100%;height:100%;display:block}#sfw-layer:after{content:'';position:absolute;inset:0;background:rgba(0,0,0,var(--sfw-shade,.32))}
 html.sfw-enabled #sfw-layer{display:block}html.sfw-enabled,html.sfw-enabled body{background:transparent!important}html.sfw-enabled #root{position:relative;z-index:1;background:transparent!important}
 #sfw-button,#sfw-panel{position:fixed;z-index:2147483000;color:#f4f4f5;background:rgba(18,23,31,.94);border:1px solid #ffffff35;border-radius:12px;font:13px system-ui}#sfw-button{right:18px;bottom:18px;padding:8px 14px;cursor:pointer;app-region:no-drag}#sfw-panel{right:18px;bottom:62px;box-sizing:border-box;width:min(340px,calc(100vw - 36px));max-height:calc(100vh - 90px);overflow:auto;padding:16px;box-shadow:0 12px 48px #0008}#sfw-panel[hidden]{display:none}#sfw-panel p{margin:0 0 12px;color:#bbc6d2;font-size:12px;overflow-wrap:anywhere}#sfw-panel button,#sfw-panel select{color:#f4f4f5;background:#293340;border:1px solid #ffffff30;border-radius:7px;padding:7px 9px;margin:3px;cursor:pointer}#sfw-panel label{display:block;margin-top:12px}#sfw-panel input[type=range]{width:100%}`;
 document.head.append(style);
 const layer=document.createElement('div');layer.id='sfw-layer';layer.setAttribute('aria-hidden','true');document.body.prepend(layer);
 const button=document.createElement('button');button.id='sfw-button';button.textContent='壁纸';button.setAttribute('aria-label','壁纸设置');button.setAttribute('aria-expanded','false');document.body.append(button);
 const panel=document.createElement('section');panel.id='sfw-panel';panel.hidden=true;panel.setAttribute('aria-label','壁纸设置');panel.innerHTML='<strong>Codex 壁纸 · 0.4.0</strong><p id="sfw-status">读取中…</p><button id="sfw-pick">选择以前制作的壁纸</button><button id="sfw-toggle">关闭壁纸</button><label>画面适配 <select id="sfw-fit"><option value="cover">铺满</option><option value="contain">完整显示</option></select></label><label>整屏压暗 <input id="sfw-shade" type="range" min="0" max="0.85" step="0.05"></label><p>本机视频／图片；声音默认关闭。</p>';document.body.append(panel);
 button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));};document.getElementById('sfw-pick').onclick=()=>act({action:'pick'});document.getElementById('sfw-toggle').onclick=()=>act({action:'set',enabled:!current.enabled});document.getElementById('sfw-fit').onchange=e=>act({action:'set',fit:e.target.value});document.getElementById('sfw-shade').onchange=e=>act({action:'set',shade:Number(e.target.value)});
 const workshop=document.createElement('button');workshop.id='sfw-workshop';workshop.textContent='创意工坊';workshop.onclick=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');document.dispatchEvent(new Event('sfw-workshop-open'));};panel.append(workshop);
 const we=document.createElement('button');we.id='sfw-we-open';we.textContent='Wallpaper Engine 本机壁纸';we.onclick=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');document.dispatchEvent(new Event('sfw-we-open'));};panel.insertBefore(we,panel.querySelector('label'));
 document.addEventListener('sfw-workshop-applied',()=>void act({action:'read'}));
 document.addEventListener('sfw-we-availability',e=>{weReady=e.detail?.ready===true;loadError=e.detail?.error||'';renderAvailability();});
 document.addEventListener('visibilitychange',()=>{if(media?.tagName==='VIDEO'){if(document.hidden||current?.paused)media.pause();else if(current?.enabled)media.play().catch(()=>{});}});
 document.addEventListener('sfw-media-reload',()=>{if(media?.tagName==='VIDEO'){media.currentTime=0;if(current?.enabled&&!current.paused&&!document.hidden)media.play().catch(()=>{});}else if(media?.src){const url=media.src;media.removeAttribute('src');media.src=url;}});
 appearance=sfwAppearance.mount(document,panel,patch=>void act({action:'set',...patch}));
 void act({action:'read'});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
