// Final precise measurements with correct selectors
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const OUT = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.59';
const PORT = 9241;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = async (u) => (await fetch(u)).json();

const TARGETS = [
  { name: 'kokoro_1280', url: 'https://gyosei-medical.com/kokoromental/' },
  { name: 'class_1280',  url: 'https://gyosei-medical.com/class-clinic/' },
];

function launchChrome() {
  const userDir = join(tmpdir(), `cdp-final-${Date.now()}`);
  mkdirSync(userDir, { recursive: true });
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, '--headless=new',
    '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${userDir}`, '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore', detached: false });
  p.userDir = userDir;
  return p;
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0; this.pending = new Map(); this.events = new Map();
    this.ready = new Promise((resolve) => { this.ws.addEventListener('open', () => resolve()); });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      } else if (msg.method) {
        const h = this.events.get(msg.method) || [];
        for (const fn of h) fn(msg.params, msg.sessionId);
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

const EXPR = `(() => {
  const lis = Array.from(document.querySelectorAll('li.article'));
  const card = lis.find((li) => li.querySelector('.image'));
  if (!card) return JSON.stringify({ found: false });
  const photoWrap = card.querySelector('.image');
  const photoImg = photoWrap.querySelector('img');
  const cr = card.getBoundingClientRect();
  const ir = photoImg.getBoundingClientRect();
  const wr = photoWrap.getBoundingClientRect();
  const ccs = getComputedStyle(card);
  const cardBorderTop = parseFloat(ccs.borderTopWidth) || 0;
  const cardPadTop = parseFloat(ccs.paddingTop) || 0;
  // Real circle = the <img> with border-radius: 100%
  const topGap = Math.round(ir.top - cr.top);

  // First tag pill = <a class^="cat-category"> inside li.cat under #post_meta_top
  const pills = Array.from(card.querySelectorAll('#post_meta_top li.cat a'));
  const pill = pills[0];
  let pillInfo = null;
  let bottomGap = null;
  if (pill) {
    const pillR = pill.getBoundingClientRect();
    const liR = pill.parentElement.getBoundingClientRect();
    const pcs = getComputedStyle(pill);
    const lcs = getComputedStyle(pill.parentElement);
    bottomGap = Math.round(pillR.top - ir.bottom);
    pillInfo = {
      anchor: {
        height: Math.round(pillR.height * 100) / 100,
        width: Math.round(pillR.width * 100) / 100,
        lineHeight: pcs.lineHeight,
        fontSize: pcs.fontSize,
        padding: pcs.padding,
        borderRadius: pcs.borderTopLeftRadius,
        display: pcs.display,
        ratioLHvsH: (parseFloat(pcs.lineHeight) / pillR.height).toFixed(3),
      },
      wrapperLi: {
        height: Math.round(liR.height * 100) / 100,
        lineHeight: lcs.lineHeight,
        fontSize: lcs.fontSize,
        display: lcs.display,
        alignItems: lcs.alignItems,
      },
      innerSpan: (() => {
        const sp = pill.querySelector('span');
        if (!sp) return null;
        const sr = sp.getBoundingClientRect();
        const scs = getComputedStyle(sp);
        return {
          height: Math.round(sr.height * 100) / 100,
          lineHeight: scs.lineHeight,
          fontSize: scs.fontSize,
          centerOffsetVsAnchor: Math.round(((sr.top + sr.height/2) - (pillR.top + pillR.height/2)) * 100) / 100,
        };
      })(),
    };
  }
  return JSON.stringify({
    card: {
      top: Math.round(cr.top), bottom: Math.round(cr.bottom),
      borderTopWidth: cardBorderTop, paddingTop: cardPadTop,
    },
    photoImg: {
      top: Math.round(ir.top), bottom: Math.round(ir.bottom),
      height: Math.round(ir.height), width: Math.round(ir.width),
      borderRadius: getComputedStyle(photoImg).borderTopLeftRadius,
    },
    photoWrap: { top: Math.round(wr.top), bottom: Math.round(wr.bottom) },
    topGap: { value: topGap, target: 24, ok: topGap >= 24 },
    bottomGapPhotoToPill: { value: bottomGap, target: 18, ok: bottomGap >= 18 },
    pill: pillInfo,
  }, null, 2);
})()`;

async function run() {
  mkdirSync(OUT, { recursive: true });
  const proc = launchChrome();
  let v;
  for (let i = 0; i < 50; i++) { try { v = await fetchJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(200); } }
  const root = new CDP(v.webSocketDebuggerUrl);
  await root.ready;
  for (const t of TARGETS) {
    const { targetId } = await root.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await root.send('Target.attachToTarget', { targetId, flatten: true });
    const cdp = { send: (m, p = {}) => root.send(m, p, sessionId), on: (m, h) => root.on(m, (p, s) => { if (s === sessionId) h(p); }) };
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1800, deviceScaleFactor: 1, mobile: false });
    const loaded = new Promise((res) => cdp.on('Page.loadEventFired', res));
    await cdp.send('Page.navigate', { url: t.url });
    await Promise.race([loaded, sleep(20000)]);
    await sleep(6000);
    const r = await cdp.send('Runtime.evaluate', { expression: EXPR, returnByValue: true });
    writeFileSync(join(OUT, `_final_${t.name}.json`), r.result.value);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1280, height: 1800, scale: 1 }, captureBeyondViewport: true });
    writeFileSync(join(OUT, `${t.name}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`\n=== ${t.name} ===\n${r.result.value}`);
    await root.send('Target.closeTarget', { targetId });
  }
  root.close(); proc.kill();
  try { rmSync(proc.userDir, { recursive: true, force: true }); } catch {}
}
run().catch((e) => { console.error(e); process.exit(1); });
