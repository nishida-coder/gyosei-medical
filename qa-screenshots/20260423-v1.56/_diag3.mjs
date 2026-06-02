// More tolerant DOCTOR section probe with structural HTML dump
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const OUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.56';
const PORT = 9233;
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
    '--headless=new','--disable-gpu','--no-sandbox','--no-first-run',
    '--no-default-browser-check','--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${userDir}`,'--hide-scrollbars','about:blank',
  ];
  const p = spawn(CHROME, args, { stdio: 'ignore', detached: false });
  p.userDir = userDir;
  return p;
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0; this.pending = new Map(); this.events = new Map();
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

const DIAG_EXPR = `(() => { try {
  const out = { innerWidth: window.innerWidth };
  // find any element whose normalized text equals DOCTOR
  const candidates = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    // only consider elements with own text
    const ownText = Array.from(node.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (ownText === 'DOCTOR') {
      candidates.push(node);
    }
  }
  out.doctorMatches = candidates.length;
  if (candidates.length === 0) {
    // also try contains
    const heads = document.querySelectorAll('h1,h2,h3,h4,h5,h6,.title,.heading,.section-title');
    heads.forEach(h => {
      const t = (h.textContent||'').trim();
      if (t === 'DOCTOR' || t.toUpperCase() === 'DOCTOR') candidates.push(h);
    });
    out.doctorMatchesAfterHeads = candidates.length;
  }
  if (candidates.length === 0) {
    out.error = 'no DOCTOR heading found';
    return JSON.stringify(out);
  }
  const dh = candidates[0];
  const dhr = dh.getBoundingClientRect();
  const dhcs = getComputedStyle(dh);
  out.doctorHeading = {
    tag: dh.tagName, cls: dh.className, id: dh.id,
    x: Math.round(dhr.left), y: Math.round(dhr.top),
    w: Math.round(dhr.width), h: Math.round(dhr.height),
    fontSize: dhcs.fontSize, textAlign: dhcs.textAlign,
    parentTag: dh.parentElement?.tagName, parentCls: dh.parentElement?.className,
  };
  // walk up from heading to find a container ancestor that includes an img+heading
  let card = dh;
  for (let i = 0; i < 8; i++) {
    if (!card.parentElement) break;
    card = card.parentElement;
    const img = card.querySelector('img');
    const r = card.getBoundingClientRect();
    // a reasonable card: contains the image, has bounded size
    if (img && r.height > 200 && r.height < 900 && r.width <= out.innerWidth) {
      const ir = img.getBoundingClientRect();
      if (Math.abs(ir.top - dhr.top) < 400 && ir.top > dhr.top) {
        break;
      }
    }
  }
  // Save ancestor chain
  const chain = [];
  let p = dh;
  for (let i = 0; i < 8 && p; i++) {
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    chain.push({
      tag: p.tagName, cls: (p.className||'').toString().slice(0,80), id: p.id,
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
      bg: cs.backgroundColor, br: cs.borderRadius, ml: cs.marginLeft, mr: cs.marginRight,
      pad: cs.padding, display: cs.display, textAlign: cs.textAlign,
    });
    p = p.parentElement;
  }
  out.chain = chain;
  // Identify the visible card frame: ancestor with non-transparent bg or border
  let frame = null;
  p = dh.parentElement;
  while (p && p !== document.body) {
    const cs = getComputedStyle(p);
    const bg = cs.backgroundColor;
    const hasBg = bg && !/rgba?\\(0, 0, 0, 0\\)/.test(bg) && bg !== 'transparent';
    const hasBorder = cs.borderTopWidth !== '0px';
    if ((hasBg || hasBorder) && p.querySelector('img')) { frame = p; break; }
    p = p.parentElement;
  }
  if (frame) {
    const fr = frame.getBoundingClientRect();
    const fcs = getComputedStyle(frame);
    const fp = frame.parentElement.getBoundingClientRect();
    out.frame = {
      tag: frame.tagName, cls: (frame.className||'').toString().slice(0,80),
      x: Math.round(fr.left), y: Math.round(fr.top),
      w: Math.round(fr.width), h: Math.round(fr.height),
      parentX: Math.round(fp.left), parentW: Math.round(fp.width),
      leftOffset: Math.round(fr.left - fp.left),
      rightOffset: Math.round((fp.left + fp.width) - (fr.left + fr.width)),
      bg: fcs.backgroundColor, br: fcs.borderRadius, padding: fcs.padding,
      margin: fcs.margin, marginLeft: fcs.marginLeft, marginRight: fcs.marginRight,
      boxShadow: fcs.boxShadow, border: fcs.border, textAlign: fcs.textAlign,
    };
    const img = frame.querySelector('img');
    if (img) {
      const ir = img.getBoundingClientRect();
      const ics = getComputedStyle(img);
      out.photo = {
        x: Math.round(ir.left), y: Math.round(ir.top),
        w: Math.round(ir.width), h: Math.round(ir.height),
        borderRadius: ics.borderRadius,
        gapFromFrameTop: Math.round(ir.top - fr.top),
        photoCenterX: Math.round(ir.left + ir.width/2),
        frameCenterX: Math.round(fr.left + fr.width/2),
        centerDelta: Math.round(ir.left + ir.width/2 - (fr.left + fr.width/2)),
      };
      // walk up from img to find round wrapper (border-radius circle)
      let w = img.parentElement;
      for (let i = 0; i < 4 && w && w !== frame; i++) {
        const wcs = getComputedStyle(w);
        if (wcs.borderRadius && wcs.borderRadius !== '0px') {
          const wr = w.getBoundingClientRect();
          out.photoWrap = {
            tag: w.tagName, cls: (w.className||'').toString().slice(0,60),
            w: Math.round(wr.width), h: Math.round(wr.height),
            gapFromFrameTop: Math.round(wr.top - fr.top),
            borderRadius: wcs.borderRadius,
            background: wcs.backgroundColor, padding: wcs.padding,
            border: wcs.border,
            wrapCenterX: Math.round(wr.left + wr.width/2),
          };
          break;
        }
        w = w.parentElement;
      }
    }
    // pills within frame
    const pillEls = frame.querySelectorAll('span, li, a, em, strong, div');
    const pills = [];
    pillEls.forEach((el) => {
      if (el.children.length > 0) return;
      const txt = (el.textContent||'').trim();
      if (!txt || txt.length > 20) return;
      const r2 = el.getBoundingClientRect();
      const cs2 = getComputedStyle(el);
      if (r2.height < 16 || r2.height > 60) return;
      if (r2.width < 30 || r2.width > 240) return;
      const bg = cs2.backgroundColor;
      const hasBg = bg && !/rgba?\\(0, 0, 0, 0\\)/.test(bg) && bg !== 'transparent';
      const hasRadius = cs2.borderTopLeftRadius !== '0px';
      if (!(hasBg || hasRadius)) return;
      pills.push({
        text: txt,
        tag: el.tagName, cls: (el.className||'').toString().slice(0,60),
        w: Math.round(r2.width), h: Math.round(r2.height),
        x: Math.round(r2.left), y: Math.round(r2.top),
        fontSize: cs2.fontSize, lineHeight: cs2.lineHeight,
        padding: cs2.padding, paddingTop: cs2.paddingTop, paddingBottom: cs2.paddingBottom,
        display: cs2.display, alignItems: cs2.alignItems,
        background: bg, borderRadius: cs2.borderTopLeftRadius,
      });
    });
    pills.sort((a,b) => a.y - b.y || a.x - b.x);
    // group by y
    const groups = [];
    pills.forEach(p2 => {
      const g = groups.find(g => Math.abs(g[0].y - p2.y) < 4);
      if (g) g.push(p2); else groups.push([p2]);
    });
    out.pillGroups = groups.slice(0, 6).map(g => ({ y: g[0].y, count: g.length, items: g }));
  }
  return JSON.stringify(out);
} catch(e) { return JSON.stringify({ error: e.message, stack: e.stack }); } })()`;

async function probe(job, browserCdp) {
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
    return { ...job, diag: JSON.parse(diagRes.result.value) };
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
  const browserCdp = new CDP(version.webSocketDebuggerUrl);
  await browserCdp.ready;
  const results = [];
  for (const job of JOBS) {
    console.log(`-> ${job.slug} @ ${job.width}`);
    try { results.push(await probe(job, browserCdp)); }
    catch (e) { console.error(`   FAIL: ${e.message}`); results.push({ ...job, error: e.message }); }
  }
  browserCdp.close();
  writeFileSync(join(OUT_DIR, '_diag3.json'), JSON.stringify(results, null, 2));
  proc.kill();
  try { rmSync(proc.userDir, { recursive: true, force: true }); } catch {}
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
