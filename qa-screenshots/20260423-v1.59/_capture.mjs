// CDP screenshots + DR detail spacing & tag pill metrics
// Two targets: kokoro (1280x1800) and class (1280x1800).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const OUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.59';
const PORT = 9239;
const WAIT_MS = 6000;

const TARGETS = [
  { name: 'kokoro_1280', url: 'https://gyosei-medical.com/kokoromental/', width: 1280, height: 1800 },
  { name: 'class_1280',  url: 'https://gyosei-medical.com/class-clinic/',  width: 1280, height: 1800 },
];

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
  // Find the DR detail card: li.article that contains a circular photo .image
  const lis = Array.from(document.querySelectorAll('li.article'));
  const card = lis.find((li) => li.querySelector('.image'));
  if (!card) return JSON.stringify({ found: false });

  const photo = card.querySelector('.image');
  const cr = card.getBoundingClientRect();
  const pr = photo.getBoundingClientRect();
  const ccs = getComputedStyle(card);
  const pcs = getComputedStyle(photo);

  // Top gap: from white card top edge to top of circle
  // Account for card border + padding
  const cardBorderTop = parseFloat(ccs.borderTopWidth) || 0;
  const cardPadTop = parseFloat(ccs.paddingTop) || 0;
  const topGapVisual = Math.round(pr.top - cr.top); // visual distance from card top edge to circle top
  const topGapInner = Math.round(pr.top - (cr.top + cardBorderTop + cardPadTop));

  // Find tag pills below the photo. Try common selectors.
  const tagCandidates = [
    '.tag', '.tags li', '.tags span', '.category', '.cat', '.label',
    'ul.tags li', 'ul li.tag', '.post-tags li', '.taglist li'
  ];
  let tagEls = [];
  for (const sel of tagCandidates) {
    const found = Array.from(card.querySelectorAll(sel));
    if (found.length) { tagEls = found; break; }
  }
  // Fallback: any descendant whose computed border-radius is 999px or whose className contains 'tag' / 'pill'
  if (tagEls.length === 0) {
    tagEls = Array.from(card.querySelectorAll('*')).filter((el) => {
      const cs = getComputedStyle(el);
      const br = parseFloat(cs.borderTopLeftRadius) || 0;
      const cls = (el.className || '').toString().toLowerCase();
      return (cls.includes('tag') || cls.includes('pill') || cls.includes('cat') || cls.includes('label'))
        && el.getBoundingClientRect().top > pr.bottom
        && el.getBoundingClientRect().height > 0;
    });
  }

  // Bottom gap: from circle bottom to first tag pill top
  let bottomGap = null;
  let firstTagRect = null;
  let firstTagInfo = null;
  if (tagEls.length) {
    // Pick the first tag that sits below the photo
    const below = tagEls
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.top >= pr.bottom - 2)
      .sort((a, b) => a.r.top - b.r.top);
    if (below.length) {
      firstTagRect = below[0].r;
      bottomGap = Math.round(firstTagRect.top - pr.bottom);
      const tagEl = below[0].el;
      const tcs = getComputedStyle(tagEl);
      const innerSpan = tagEl.querySelector('span');
      const spanInfo = innerSpan ? (() => {
        const sr = innerSpan.getBoundingClientRect();
        const scs = getComputedStyle(innerSpan);
        const tagCenter = firstTagRect.top + firstTagRect.height / 2;
        const spanCenter = sr.top + sr.height / 2;
        return {
          tag: innerSpan.tagName.toLowerCase(),
          text: innerSpan.textContent.trim().slice(0, 40),
          height: Math.round(sr.height * 100) / 100,
          width: Math.round(sr.width * 100) / 100,
          top: Math.round(sr.top * 100) / 100,
          lineHeight: scs.lineHeight,
          fontSize: scs.fontSize,
          display: scs.display,
          padding: scs.padding,
          verticalAlign: scs.verticalAlign,
          centerOffset: Math.round((spanCenter - tagCenter) * 100) / 100,
        };
      })() : null;
      firstTagInfo = {
        tag: tagEl.tagName.toLowerCase(),
        className: tagEl.className,
        text: tagEl.textContent.trim().slice(0, 60),
        height: Math.round(firstTagRect.height * 100) / 100,
        width: Math.round(firstTagRect.width * 100) / 100,
        top: Math.round(firstTagRect.top * 100) / 100,
        bottom: Math.round(firstTagRect.bottom * 100) / 100,
        lineHeight: tcs.lineHeight,
        fontSize: tcs.fontSize,
        padding: tcs.padding,
        paddingTop: tcs.paddingTop,
        paddingBottom: tcs.paddingBottom,
        borderRadius: tcs.borderTopLeftRadius,
        display: tcs.display,
        alignItems: tcs.alignItems,
        boxSizing: tcs.boxSizing,
        ratioLHvsH: (parseFloat(tcs.lineHeight) / firstTagRect.height).toFixed(3),
        innerSpan: spanInfo,
        tagsFound: tagEls.length,
      };
    }
  }

  return JSON.stringify({
    found: true,
    card: {
      top: Math.round(cr.top), bottom: Math.round(cr.bottom),
      height: Math.round(cr.height), width: Math.round(cr.width),
      borderTopWidth: cardBorderTop, paddingTop: cardPadTop,
      paddingBottom: parseFloat(ccs.paddingBottom) || 0,
    },
    photo: {
      top: Math.round(pr.top), bottom: Math.round(pr.bottom),
      height: Math.round(pr.height), width: Math.round(pr.width),
      borderRadius: pcs.borderTopLeftRadius,
    },
    topGap: { visual: topGapVisual, inner: topGapInner, target: 24 },
    bottomGap: { value: bottomGap, target: 18 },
    firstTag: firstTagInfo,
    tagsCount: tagEls.length,
  }, null, 2);
})()`;

async function capture(browserCdp, target) {
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
    width: target.width, height: target.height, deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = new Promise((res) => cdp.on('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url: target.url });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(WAIT_MS);

  const measureRes = await cdp.send('Runtime.evaluate', { expression: MEASURE_EXPR, returnByValue: true });
  const measure = JSON.parse(measureRes.result.value);

  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: target.width, height: target.height, scale: 1 },
    captureBeyondViewport: true,
  });
  const file = join(OUT_DIR, `${target.name}.png`);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  writeFileSync(join(OUT_DIR, `_measure_${target.name}.json`), JSON.stringify(measure, null, 2));

  console.log(`\n=== ${target.name} (${target.url}) ===`);
  console.log('Saved:', file);
  console.log(JSON.stringify(measure, null, 2));

  await browserCdp.send('Target.closeTarget', { targetId });
  return measure;
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

  for (const t of TARGETS) {
    await capture(browserCdp, t);
  }

  browserCdp.close();
  proc.kill();
  try { rmSync(proc.userDir, { recursive: true, force: true }); } catch {}
}

main().catch((e) => { console.error(e); process.exit(1); });
