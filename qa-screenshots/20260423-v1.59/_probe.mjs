// Probe DOM around DR card to find true tag pills
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const PORT = 9240;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = async (u) => (await fetch(u)).json();

function launchChrome() {
  const userDir = join(tmpdir(), `cdp-probe-${Date.now()}`);
  mkdirSync(userDir, { recursive: true });
  const args = [
    `--remote-debugging-port=${PORT}`, '--headless=new',
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

const PROBE = `(() => {
  const lis = Array.from(document.querySelectorAll('li.article'));
  const card = lis.find((li) => li.querySelector('.image'));
  if (!card) return JSON.stringify({ found: false });
  const photo = card.querySelector('.image');
  const pr = photo.getBoundingClientRect();
  // List every descendant under card that is BELOW the photo
  const all = Array.from(card.querySelectorAll('*'));
  const below = all
    .map((el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }))
    .filter(({ r, cs }) => r.top >= pr.bottom - 2 && r.height > 0 && cs.display !== 'none')
    .sort((a, b) => a.r.top - b.r.top);
  // Also: show outerHTML of card (truncated) to identify pill structure
  return JSON.stringify({
    cardOuterHTML: card.outerHTML.slice(0, 3000),
    photoBottom: Math.round(pr.bottom),
    belowSummary: below.slice(0, 40).map(({ el, r, cs }) => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 60),
      id: el.id || '',
      top: Math.round(r.top),
      h: Math.round(r.height * 100) / 100,
      w: Math.round(r.width * 100) / 100,
      lh: cs.lineHeight,
      fs: cs.fontSize,
      pad: cs.padding,
      br: cs.borderTopLeftRadius,
      txt: (el.textContent || '').trim().slice(0, 40),
    })),
  }, null, 2);
})()`;

async function main() {
  const proc = launchChrome();
  let v;
  for (let i = 0; i < 50; i++) { try { v = await fetchJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(200); } }
  const root = new CDP(v.webSocketDebuggerUrl);
  await root.ready;
  const { targetId } = await root.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await root.send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = { send: (m, p = {}) => root.send(m, p, sessionId), on: (m, h) => root.on(m, (p, s) => { if (s === sessionId) h(p); }) };
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1800, deviceScaleFactor: 1, mobile: false });
  const loaded = new Promise((res) => cdp.on('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url: 'https://gyosei-medical.com/kokoromental/' });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(6000);
  const r = await cdp.send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  writeFileSync('C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.59/_probe_kokoro.json', r.result.value);
  console.log(r.result.value);
  root.close(); proc.kill(); try { rmSync(proc.userDir, { recursive: true, force: true }); } catch {}
}
main().catch((e) => { console.error(e); process.exit(1); });
