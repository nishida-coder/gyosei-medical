// Re-probe DOCTOR section with better selectors.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const OUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.56';
const PORT = 9232;
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

// Better probe: find DOCTOR heading, then walk to the card and analyze
const DIAG_EXPR = `(() => { try {
  const out = {
    innerWidth: window.innerWidth,
  };
  // find DOCTOR text
  const all = document.querySelectorAll('#left_col *');
  let doctorHeading = null;
  for (const el of all) {
    const txt = (el.textContent || '').trim();
    if (txt === 'DOCTOR' || txt === 'Doctor' || txt === 'doctor') {
      // require leaf-ish to avoid huge parent
      if (el.children.length <= 1 && el.offsetHeight < 100) {
        doctorHeading = el;
        break;
      }
    }
  }
  if (!doctorHeading) {
    // fallback by heading tags
    const heads = document.querySelectorAll('#left_col h1,#left_col h2,#left_col h3,#left_col h4,#left_col .heading,#left_col .section-title');
    for (const h of heads) {
      if ((h.textContent||'').trim().toUpperCase().startsWith('DOCTOR')) { doctorHeading = h; break; }
    }
  }
  if (doctorHeading) {
    const dr = doctorHeading.getBoundingClientRect();
    out.doctorHeading = {
      tag: doctorHeading.tagName, cls: doctorHeading.className,
      x: Math.round(dr.left), y: Math.round(dr.top), w: Math.round(dr.width),
    };
    // the "card" is likely the parent section or the next sibling block containing img
    // strategy: find the closest ancestor whose direct children include an IMG
    let card = doctorHeading.parentElement;
    let depth = 0;
    while (card && depth < 6) {
      const hasImg = card.querySelector('img');
      const r = card.getBoundingClientRect();
      if (hasImg && r.height > 100 && r.height < 800) break;
      card = card.parentElement;
      depth++;
    }
    if (card) {
      const r = card.getBoundingClientRect();
      const cs = getComputedStyle(card);
      const parent = card.parentElement.getBoundingClientRect();
      out.card = {
        tag: card.tagName, cls: card.className.slice(0, 80),
        x: Math.round(r.left), y: Math.round(r.top),
        w: Math.round(r.width), h: Math.round(r.height),
        parentX: Math.round(parent.left), parentW: Math.round(parent.width),
        leftOffset: Math.round(r.left - parent.left),
        rightOffset: Math.round((parent.left + parent.width) - (r.left + r.width)),
        margin: cs.margin, padding: cs.padding,
        backgroundColor: cs.backgroundColor,
        border: cs.border, borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
        display: cs.display,
        textAlign: cs.textAlign,
      };
      // photo = first img inside card
      const img = card.querySelector('img');
      if (img) {
        const ir = img.getBoundingClientRect();
        const ics = getComputedStyle(img);
        // gap from top of card
        out.photo = {
          src: (img.src || '').split('/').pop(),
          x: Math.round(ir.left), y: Math.round(ir.top),
          w: Math.round(ir.width), h: Math.round(ir.height),
          borderRadius: ics.borderRadius,
          marginTop: ics.marginTop,
          gapFromCardTop: Math.round(ir.top - r.top),
          // detect if image has visible "frame" wrapper
        };
        // photo center vs card center
        out.photo.photoCenterX = Math.round(ir.left + ir.width / 2);
        out.photo.cardCenterX = Math.round(r.left + r.width / 2);
        out.photo.centerDelta = out.photo.photoCenterX - out.photo.cardCenterX;
        // check img's parent (might be the frame)
        const wrap = img.parentElement;
        if (wrap) {
          const wr = wrap.getBoundingClientRect();
          const wcs = getComputedStyle(wrap);
          out.photoWrap = {
            tag: wrap.tagName, cls: wrap.className.slice(0,80),
            w: Math.round(wr.width), h: Math.round(wr.height),
            x: Math.round(wr.left), y: Math.round(wr.top),
            padding: wcs.padding,
            background: wcs.backgroundColor,
            border: wcs.border,
            borderRadius: wcs.borderRadius,
            gapImgFromWrapTop: Math.round(ir.top - wr.top),
          };
        }
      }
      // find tag pills: small inline elements with bg color near top of card
      // collect candidates: spans/li/a within card that look pill-shaped
      const candidates = card.querySelectorAll('span, li, a, div, em, strong');
      const pills = [];
      candidates.forEach((el) => {
        if (el.children.length > 0) return;
        const txt = (el.textContent||'').trim();
        if (!txt || txt.length > 20) return;
        const r2 = el.getBoundingClientRect();
        const cs2 = getComputedStyle(el);
        if (r2.height < 18 || r2.height > 60) return;
        if (r2.width < 30 || r2.width > 220) return;
        const bg = cs2.backgroundColor;
        const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
        const hasBorder = cs2.borderTopWidth && cs2.borderTopWidth !== '0px';
        const hasRadius = cs2.borderTopLeftRadius && cs2.borderTopLeftRadius !== '0px';
        if (!(hasBg || hasBorder || hasRadius)) return;
        pills.push({
          text: txt,
          tag: el.tagName, cls: el.className.slice(0,60),
          w: Math.round(r2.width), h: Math.round(r2.height),
          y: Math.round(r2.top),
          fontSize: cs2.fontSize, lineHeight: cs2.lineHeight,
          padding: cs2.padding,
          display: cs2.display, alignItems: cs2.alignItems,
          background: bg, borderRadius: cs2.borderTopLeftRadius,
        });
      });
      // sort by y, then take first batch of 3 close together
      pills.sort((a,b) => a.y - b.y);
      out.pillsAll = pills.slice(0, 10);
      // pick the group of 3 with similar y
      const groups = [];
      let current = [];
      for (const p of pills) {
        if (current.length === 0 || Math.abs(p.y - current[0].y) < 5) current.push(p);
        else { groups.push(current); current = [p]; }
      }
      if (current.length) groups.push(current);
      const tripleGroup = groups.find(g => g.length === 3) || groups[0];
      out.tags = tripleGroup;
    }
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
  writeFileSync(join(OUT_DIR, '_diag2.json'), JSON.stringify(results, null, 2));
  proc.kill();
  try { rmSync(proc.userDir, { recursive: true, force: true }); } catch {}
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
