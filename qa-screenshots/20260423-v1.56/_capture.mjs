// CDP-based screenshot capture for kokoro/class PC widths.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const OUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.56';
const PORT = 9231;
const HEIGHT = 2500;
const WAIT_MS = 8000;

const JOBS = [
  { slug: 'kokoro', url: 'https://gyosei-medical.com/kokoromental/', width: 1024 },
  { slug: 'kokoro', url: 'https://gyosei-medical.com/kokoromental/', width: 1280 },
  { slug: 'class',  url: 'https://gyosei-medical.com/class-clinic/',  width: 1024 },
  { slug: 'class',  url: 'https://gyosei-medical.com/class-clinic/',  width: 1280 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url) { const r = await fetch(url); return r.json(); }

function launchChrome() {
  const userDir = join(tmpdir(), `cdp-cap-${Date.now()}`);
  mkdirSync(userDir, { recursive: true });
  const args = [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${userDir}`, '--hide-scrollbars', 'about:blank',
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

const DIAG_EXPR = `(() => {
  const out = {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
  const leftCol = document.querySelector('#left_col');
  if (leftCol) {
    const r = leftCol.getBoundingClientRect();
    const cs = getComputedStyle(leftCol);
    out.leftCol = {
      x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
      padding: cs.padding, textAlign: cs.textAlign,
    };
  }
  // doctor card candidates
  const cardSelectors = [
    '#left_col .doctor-card', '#left_col .doctor', '#left_col .dr-card',
    '#left_col .doctor-profile', '#left_col .doctor_box', '#left_col article',
    '#left_col .profile-card', '#left_col > div'
  ];
  for (const sel of cardSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const parent = el.parentElement.getBoundingClientRect();
      out.card = {
        sel,
        x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
        parentX: Math.round(parent.left), parentW: Math.round(parent.width),
        leftOffset: Math.round(r.left - parent.left),
        rightOffset: Math.round((parent.left + parent.width) - (r.left + r.width)),
        margin: cs.margin, marginLeft: cs.marginLeft, marginRight: cs.marginRight,
        padding: cs.padding,
        backgroundColor: cs.backgroundColor,
        border: cs.border,
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
      };
      break;
    }
  }
  // photo / circle
  const photoSelectors = [
    '#left_col .doctor-photo', '#left_col .doctor-circle', '#left_col .doctor-img',
    '#left_col .doctor-avatar', '#left_col .photo', '#left_col img.doctor',
    '#left_col img'
  ];
  for (const sel of photoSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.photo = {
        sel, x: Math.round(r.left), y: Math.round(r.top),
        w: Math.round(r.width), h: Math.round(r.height),
        borderRadius: cs.borderRadius,
        marginTop: cs.marginTop,
      };
      // measure gap from top of card if card found
      const card = document.querySelector(out.card ? out.card.sel : 'nothing');
      if (card) {
        const cr = card.getBoundingClientRect();
        out.photo.gapFromCardTop = Math.round(r.top - cr.top);
      }
      break;
    }
  }
  // tag pills
  const tagSelectors = [
    '#left_col .tag', '#left_col .tags li', '#left_col .tag-list li',
    '#left_col .badge', '#left_col .chip', '#left_col .specialty',
    '#left_col .doctor-tag', '#left_col .pill', '#left_col .label'
  ];
  for (const sel of tagSelectors) {
    const els = document.querySelectorAll(sel);
    if (els.length) {
      const arr = [];
      els.forEach((el, i) => {
        if (i > 5) return;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        arr.push({
          text: el.textContent.trim().slice(0, 24),
          w: Math.round(r.width), h: Math.round(r.height),
          fontSize: cs.fontSize, lineHeight: cs.lineHeight,
          padding: cs.padding, display: cs.display,
          alignItems: cs.alignItems, justifyContent: cs.justifyContent,
        });
      });
      out.tags = { sel, count: els.length, items: arr };
      break;
    }
  }
  return JSON.stringify(out);
})()`;

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
      width: job.width, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
    });
    const loaded = new Promise((res) => cdp.on('Page.loadEventFired', res));
    await cdp.send('Page.navigate', { url: job.url });
    await Promise.race([loaded, sleep(20000)]);
    await sleep(WAIT_MS);

    const diagRes = await cdp.send('Runtime.evaluate', { expression: DIAG_EXPR, returnByValue: true });
    const diag = JSON.parse(diagRes.result.value);

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: job.width, height: HEIGHT, scale: 1 },
      captureBeyondViewport: true,
    });
    const file = join(OUT_DIR, `${job.slug}_${job.width}.png`);
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
    console.log(`-> ${job.slug} @ ${job.width}`);
    try {
      const r = await captureOne(job, browserCdp);
      console.log(`   saved: ${r.file}`);
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
