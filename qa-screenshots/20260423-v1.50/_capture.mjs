// CDP-based screenshot capture using Node 24 native WebSocket + fetch.
// No third-party deps.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const OUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.50';
const PORT = 9230;
const HEIGHT = 2500;
const WAIT_MS = 6000;

const JOBS = [
  { slug: 'dr-mishima', url: 'https://gyosei-medical.com/mishima-itami/', width: 390 },
  { slug: 'dr-mishima', url: 'https://gyosei-medical.com/mishima-itami/', width: 768 },
  { slug: 'dr-class',   url: 'https://gyosei-medical.com/class-clinic/',  width: 390 },
  { slug: 'home',       url: 'https://gyosei-medical.com/',               width: 390 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const r = await fetch(url);
  return r.json();
}

function launchChrome() {
  const userDir = join(tmpdir(), `cdp-cap-${Date.now()}`);
  mkdirSync(userDir, { recursive: true });
  const args = [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${userDir}`,
    '--hide-scrollbars',
    'about:blank',
  ];
  const p = spawn(CHROME, args, { stdio: 'ignore', detached: false });
  p.userDir = userDir;
  return p;
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (e) => reject(e));
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        const handlers = this.events.get(msg.method) || [];
        for (const h of handlers) h(msg.params, msg.sessionId);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  on(method, handler) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(handler);
  }
  close() { try { this.ws.close(); } catch {} }
}

async function captureOne(job, browserCdp) {
  const { targetId } = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browserCdp.send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = {
    send: (method, params = {}) => browserCdp.send(method, params, sessionId),
    on: (method, h) => browserCdp.on(method, (params, sid) => { if (sid === sessionId) h(params); }),
    close: async () => { try { await browserCdp.send('Target.closeTarget', { targetId }); } catch {} },
  };
  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: job.width,
      height: HEIGHT,
      deviceScaleFactor: 2,
      mobile: job.width < 768,
    });
    const loaded = new Promise((res) => cdp.on('Page.loadEventFired', res));
    await cdp.send('Page.navigate', { url: job.url });
    await Promise.race([loaded, sleep(20000)]);
    await sleep(WAIT_MS);

    // diag: include text sizes for the elements we care about
    const diagExpr = `(() => {
      const d = document.documentElement;
      const out = {
        scrollWidth: d.scrollWidth,
        innerWidth: window.innerWidth,
        bodyScrollWidth: document.body.scrollWidth,
      };
      // doctor name candidates
      const nameSelectors = ['.doctor-name', '.doc-name', '.doctor__name', 'h1.doctor', '.profile-name', '.dr-name', '.doctor-profile h1', '.doctor-profile h2', 'main h1', '.profile h2'];
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const cs = getComputedStyle(el);
          out.docName = { sel, text: el.textContent.trim().slice(0,40), fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontFamily: cs.fontFamily };
          break;
        }
      }
      // doctor circle / portrait
      const imgSelectors = ['.doctor-photo', '.doctor-img', '.profile-photo', '.doctor img', '.profile img', '.doctor-circle', '.doctor-avatar'];
      for (const sel of imgSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const r = el.getBoundingClientRect();
          out.docPhoto = { sel, w: Math.round(r.width), h: Math.round(r.height) };
          break;
        }
      }
      // tags
      const tagSelectors = ['.tag', '.tags li', '.tag-list li', '.badge', '.chip', '.specialty', '.doctor-tag'];
      for (const sel of tagSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length) {
          const r = els[0].getBoundingClientRect();
          const cs = getComputedStyle(els[0]);
          out.tag = { sel, count: els.length, h: Math.round(r.height), fontSize: cs.fontSize, lineHeight: cs.lineHeight, padding: cs.padding };
          break;
        }
      }
      // news card overflow check (home only)
      const newsSelectors = ['.news-card', '.news-item', '.news li', '.news-list li', '.home-news .card', '.news article'];
      for (const sel of newsSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length) {
          const el = els[0];
          const r = el.getBoundingClientRect();
          out.newsCard = { sel, w: Math.round(r.width), sw: el.scrollWidth, overflow: el.scrollWidth - el.clientWidth };
          break;
        }
      }
      return JSON.stringify(out);
    })()`;
    const diagRes = await cdp.send('Runtime.evaluate', { expression: diagExpr, returnByValue: true });
    const diag = JSON.parse(diagRes.result.value);

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: job.width, height: HEIGHT, scale: 1 },
      captureBeyondViewport: true,
    });
    const file = join(OUT_DIR, `${job.slug}_${job.width}px.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    return { ...job, file, diag };
  } finally {
    await cdp.close();
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const proc = launchChrome();
  let version;
  for (let i = 0; i < 50; i++) {
    try { version = await fetchJson(`http://127.0.0.1:${PORT}/json/version`); break; }
    catch { await sleep(200); }
  }
  if (!version) { proc.kill(); throw new Error('Chrome CDP did not start'); }
  console.log('Chrome up:', version.Browser);

  const browserCdp = new CDP(version.webSocketDebuggerUrl);
  await browserCdp.ready;

  const results = [];
  for (const job of JOBS) {
    console.log(`-> ${job.slug} @ ${job.width}px`);
    try {
      const r = await captureOne(job, browserCdp);
      console.log(`   saved: ${r.file}  scrollWidth=${r.diag.scrollWidth} innerWidth=${r.diag.innerWidth}`);
      results.push(r);
    } catch (e) {
      console.error(`   FAIL: ${e.message}`);
      results.push({ ...job, error: e.message });
    }
  }
  browserCdp.close();
  writeFileSync(join(OUT_DIR, '_diag.json'), JSON.stringify(results, null, 2));
  proc.kill();
  try { rmSync(proc.userDir, { recursive: true, force: true }); } catch {}
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
