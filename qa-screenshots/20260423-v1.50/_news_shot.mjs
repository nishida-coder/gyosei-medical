import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const OUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.50';
const PORT = 9232;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url){ return (await fetch(url)).json(); }
function launchChrome(){
  const userDir = join(tmpdir(), `cdp-ns-${Date.now()}`);
  mkdirSync(userDir, { recursive: true });
  const args=[`--remote-debugging-port=${PORT}`,'--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking',`--user-data-dir=${userDir}`,'--hide-scrollbars','about:blank'];
  const p = spawn(CHROME, args, { stdio:'ignore' }); p.userDir = userDir; return p;
}
class CDP {
  constructor(ws){ this.ws=new WebSocket(ws); this.id=0; this.p=new Map(); this.e=new Map();
    this.ready=new Promise((res,rej)=>{this.ws.addEventListener('open',()=>res());this.ws.addEventListener('error',e=>rej(e));});
    this.ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id!=null&&this.p.has(m.id)){const {resolve,reject}=this.p.get(m.id);this.p.delete(m.id);if(m.error)reject(new Error(m.error.message));else resolve(m.result);}else if(m.method){(this.e.get(m.method)||[]).forEach(h=>h(m.params,m.sessionId));}});
  }
  send(method,params={},sid){const id=++this.id;return new Promise((res,rej)=>{this.p.set(id,{resolve:res,reject:rej});const pl={id,method,params};if(sid)pl.sessionId=sid;this.ws.send(JSON.stringify(pl));});}
  on(m,h){if(!this.e.has(m))this.e.set(m,[]);this.e.get(m).push(h);}
}
async function main(){
  const proc = launchChrome();
  let v; for(let i=0;i<50;i++){try{v=await fetchJson(`http://127.0.0.1:${PORT}/json/version`);break;}catch{await sleep(200);}}
  const cdp = new CDP(v.webSocketDebuggerUrl); await cdp.ready;
  const { targetId } = await cdp.send('Target.createTarget',{url:'about:blank'});
  const { sessionId } = await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  const s = (m,p={})=>cdp.send(m,p,sessionId);
  await s('Network.enable'); await s('Network.setCacheDisabled',{cacheDisabled:true}); await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:2,mobile:true});
  const loaded = new Promise(res=>cdp.on('Page.loadEventFired',(p,sid)=>{ if(sid===sessionId) res(); }));
  await s('Page.navigate',{url:'https://gyosei-medical.com/'});
  await Promise.race([loaded, sleep(20000)]); await sleep(6000);

  // get bounding rect of news slider
  const r = await s('Runtime.evaluate',{expression:`(()=>{const el=document.querySelector('.item.item1') || document.querySelector('.slick-slide'); if(!el) return null; const r=el.getBoundingClientRect(); return JSON.stringify({y: r.top + window.scrollY, h: r.height});})()`,returnByValue:true});
  console.log('news rect:', r.result.value);
  const info = JSON.parse(r.result.value);

  const shot = await s('Page.captureScreenshot',{
    format:'png',
    clip:{x:0, y: Math.max(0, info.y - 30), width: 390, height: Math.min(800, info.h + 100), scale: 1},
    captureBeyondViewport:true,
  });
  writeFileSync(join(OUT_DIR, 'home_news_focus_390px.png'), Buffer.from(shot.data,'base64'));
  console.log('saved focus shot');

  proc.kill();
  try{rmSync(proc.userDir,{recursive:true,force:true});}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
