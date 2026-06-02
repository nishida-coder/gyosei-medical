// Quick news-card focused check using same CDP approach
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const OUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.50';
const PORT = 9231;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url){ return (await fetch(url)).json(); }
function launchChrome(){
  const userDir = join(tmpdir(), `cdp-news-${Date.now()}`);
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
  await s('Emulation.setDeviceMetricsOverride',{width:390,height:1200,deviceScaleFactor:2,mobile:true});
  const loaded = new Promise(res=>cdp.on('Page.loadEventFired',(p,sid)=>{ if(sid===sessionId) res(); }));
  await s('Page.navigate',{url:'https://gyosei-medical.com/'});
  await Promise.race([loaded, sleep(20000)]); await sleep(6000);

  // find news card on page
  const expr = `(() => {
    const out = { matches: [] };
    const allText = Array.from(document.querySelectorAll('h2, h3, .section-title, .heading')).map(el => ({tag: el.tagName, text: el.textContent.trim().slice(0,40)}));
    out.headings = allText.slice(0, 30);
    // any element labeled NEWS / お知らせ
    const containers = Array.from(document.querySelectorAll('section, div')).filter(el => /NEWS|お知らせ|news/i.test(el.textContent.slice(0,80)));
    out.containerCount = containers.length;
    // look for card-like elements
    const cards = document.querySelectorAll('article, .card, .news-card, .post, .news-item');
    out.cardCount = cards.length;
    const top = [];
    cards.forEach((c,i)=>{ if(i<6){ const r=c.getBoundingClientRect(); top.push({tag:c.tagName, cls:c.className, w:Math.round(r.width), h:Math.round(r.height), sw:c.scrollWidth, overflow:c.scrollWidth - c.clientWidth, text:c.textContent.trim().slice(0,60)}); } });
    out.cards = top;
    // any horizontal overflow anywhere in page?
    let overflowEls = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        const cs = getComputedStyle(el);
        if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
          overflowEls.push({tag: el.tagName, cls: (el.className||'').toString().slice(0,40), w: el.clientWidth, sw: el.scrollWidth, diff: el.scrollWidth - el.clientWidth});
        }
      }
    });
    out.overflowEls = overflowEls.slice(0, 10);
    out.overflowCount = overflowEls.length;
    return JSON.stringify(out);
  })()`;
  const r = await s('Runtime.evaluate',{expression:expr,returnByValue:true});
  console.log(r.result.value);

  // also do a focused screenshot near news area (scroll)
  await s('Runtime.evaluate',{expression:`document.querySelector('h2, h3, .section-title')?.scrollIntoView({block:'center'});`});
  await sleep(500);

  proc.kill();
  try{rmSync(proc.userDir,{recursive:true,force:true});}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
