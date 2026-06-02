// CDP screenshot + doctor-card centering measurement for kokoro at 1280x1800.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const OUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.57';
const PORT = 9237;
const WIDTH = 1280;
const HEIGHT = 1800;
const WAIT_MS = 6000;
const URL = 'https://gyosei-medical.com/kokoromental/';
const OUT_FILE = 'kokoro_1280.png';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = async (u) => (await fetch(u)).json();

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

const MEASURE_EXPR = `(() => {
  // Doctor card: <li> with a descendant .image (circle).
  const lis = Array.from(document.querySelectorAll('li'));
  const card = lis.find((li) => li.querySelector('.image'));
  if (!card) return JSON.stringify({ found: false });
  const parent = card.parentElement;
  const cr = card.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();
  const ccs = getComputedStyle(card);
  const pcs = getComputedStyle(parent);
  const padL = parseFloat(pcs.paddingLeft) || 0;
  const padR = parseFloat(pcs.paddingRight) || 0;
  const innerLeft = pr.left + padL;
  const innerRight = pr.right - padR;
  const leftOffset = Math.round(cr.left - innerLeft);
  const rightOffset = Math.round(innerRight - cr.right);
  return JSON.stringify({
    found: true,
    parentTag: parent.tagName.toLowerCase(),
    parentClass: parent.className,
    parent: {
      left: Math.round(pr.left), right: Math.round(pr.right),
      width: Math.round(pr.width),
      paddingLeft: padL, paddingRight: padR,
      innerLeft: Math.round(innerLeft), innerRight: Math.round(innerRight),
      innerWidth: Math.round(innerRight - innerLeft),
      display: pcs.display, justifyContent: pcs.justifyContent,
      textAlign: pcs.textAlign,
    },
    card: {
      left: Math.round(cr.left), right: Math.round(cr.right),
      width: Math.round(cr.width),
      marginLeft: ccs.marginLeft, marginRight: ccs.marginRight,
    },
    leftOffset,
    rightOffset,
    centered: Math.abs(leftOffset - rightOffset) <= 1,
    delta: leftOffset - rightOffset,
  });
})()`;

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

  const { targetId } = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browserCdp.send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = {
    send: (m, p = {}) => browserCdp.send(m, p, sessionId),
    on: (m, h) => browserCdp.on(m, (params, sid) => { if (sid === sessionId) h(params); }),
  };

  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
  });
  const loaded = new Promise((res) => cdp.on('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url: URL });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(WAIT_MS);

  const measureRes = await cdp.send('Runtime.evaluate', { expression: MEASURE_EXPR, returnByValue: true });
  const measure = JSON.parse(measureRes.result.value);

  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
    captureBeyondViewport: true,
  });
  const file = join(OUT_DIR, OUT_FILE);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  writeFileSync(join(OUT_DIR, '_measure.json'), JSON.stringify(measure, null, 2));

  console.log('Saved:', file);
  console.log('Measurement:', JSON.stringify(measure, null, 2));

  browserCdp.close();
  proc.kill();
  try { rmSync(proc.userDir, { recursive: true, force: true }); } catch {}
}

main().catch((e) => { console.error(e); process.exit(1); });
