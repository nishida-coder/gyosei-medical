// CDP: crop #index_news at 390 and 1024, plus focus check on .archive_link a
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const OUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.61';
const PORT = 9241;
const WAIT_MS = 5000;
const URL = 'https://gyosei-medical.com/';

const TARGETS = [
  { name: 'home-newsbar_390px',  width: 390,  height: 2400 },
  { name: 'home-newsbar_1024px', width: 1024, height: 2400 },
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
  const sec = document.querySelector('#index_news');
  if (!sec) return JSON.stringify({ found: false });
  // Scroll to bring section into view (forces lazy layout in some templates)
  sec.scrollIntoView({ block: 'start', inline: 'start' });
  window.scrollTo(0, 0);
  // Force reflow
  void sec.offsetHeight;
  const secRect = sec.getBoundingClientRect();
  const secCs = getComputedStyle(sec);
  const link = document.querySelector('#index_news .archive_link a');
  if (!link) return JSON.stringify({ found: true, secRect: { top: secRect.top + window.scrollY, bottom: secRect.bottom + window.scrollY, height: secRect.height, display: secCs.display, visibility: secCs.visibility }, linkFound: false });
  const lr = link.getBoundingClientRect();
  const cs = getComputedStyle(link);
  const container = link.parentElement;
  const contRect = container.getBoundingClientRect();
  const contCs = getComputedStyle(container);
  const parentRect = container.parentElement.getBoundingClientRect();

  // Check arrow: last text node or ::after
  const afterCs = getComputedStyle(link, '::after');
  const beforeCs = getComputedStyle(link, '::before');
  const linkText = link.textContent;
  const hasArrowInText = /[›»→]/.test(linkText);
  const afterContent = afterCs.content;
  const beforeContent = beforeCs.content;

  // Centering check: is link centered in its container?
  const linkCenter = lr.left + lr.width / 2;
  const contCenter = contRect.left + contRect.width / 2;
  const parentCenter = parentRect.left + parentRect.width / 2;
  const centeredInCont = Math.abs(linkCenter - contCenter) < 5;
  const centeredInParent = Math.abs(linkCenter - parentCenter) < 5;

  // Walk up ancestors to check if any is display:none
  let hiddenAncestor = null;
  let node = sec;
  while (node && node !== document.body.parentElement) {
    const s = getComputedStyle(node);
    if (s.display === 'none' || s.visibility === 'hidden') {
      hiddenAncestor = { tag: node.tagName, id: node.id, cls: (node.className||'').toString().slice(0,80), display: s.display, visibility: s.visibility };
      break;
    }
    node = node.parentElement;
  }
  return JSON.stringify({
    found: true,
    hiddenAncestor,
    secRect: {
      top: Math.round(secRect.top + window.scrollY),
      bottom: Math.round(secRect.bottom + window.scrollY),
      height: Math.round(secRect.height),
      width: Math.round(secRect.width),
      display: secCs.display,
      visibility: secCs.visibility,
    },
    link: {
      text: linkText.trim(),
      hasArrowInText,
      rect: {
        top: Math.round(lr.top + window.scrollY),
        bottom: Math.round(lr.bottom + window.scrollY),
        left: Math.round(lr.left),
        right: Math.round(lr.right),
        width: Math.round(lr.width * 100) / 100,
        height: Math.round(lr.height * 100) / 100,
      },
      style: {
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        padding: cs.padding,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        minWidth: cs.minWidth,
        minHeight: cs.minHeight,
        width: cs.width,
        height: cs.height,
        display: cs.display,
        justifyContent: cs.justifyContent,
        alignItems: cs.alignItems,
        borderRadius: cs.borderTopLeftRadius,
        textAlign: cs.textAlign,
        margin: cs.margin,
      },
      after: {
        content: afterContent,
        color: afterCs.color,
        backgroundColor: afterCs.backgroundColor,
        display: afterCs.display,
        marginLeft: afterCs.marginLeft,
        position: afterCs.position,
      },
      before: {
        content: beforeContent,
      },
    },
    container: {
      tag: container.tagName.toLowerCase(),
      className: container.className,
      textAlign: contCs.textAlign,
      display: contCs.display,
      justifyContent: contCs.justifyContent,
      rect: {
        left: Math.round(contRect.left),
        right: Math.round(contRect.right),
        width: Math.round(contRect.width),
      },
    },
    centering: {
      linkCenter: Math.round(linkCenter),
      containerCenter: Math.round(contCenter),
      parentCenter: Math.round(parentCenter),
      centeredInContainer: centeredInCont,
      centeredInParent: centeredInParent,
      offsetFromContainerCenter: Math.round(linkCenter - contCenter),
      offsetFromParentCenter: Math.round(linkCenter - parentCenter),
    },
  }, null, 2);
})()`;

async function run(browserCdp, target) {
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
    mobile: target.width < 500,
  });
  const loaded = new Promise((res) => cdp.on('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url: URL });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(WAIT_MS);
  // Force #index_news visible for verification (TCD hides it at max-width:1024px).
  // This lets us inspect and screenshot the desktop archive_link button at any viewport.
  await cdp.send('Runtime.evaluate', { expression: `(() => {
    const s = document.createElement('style');
    s.id = 'qa-force-index-news';
    s.textContent = '#index_news{display:block!important;visibility:visible!important;opacity:1!important;}';
    document.head.appendChild(s);
  })()` });
  await sleep(500);

  const measureRes = await cdp.send('Runtime.evaluate', { expression: MEASURE_EXPR, returnByValue: true });
  const measure = JSON.parse(measureRes.result.value);

  // Compute crop from section rect (with small padding)
  let clip = { x: 0, y: 0, width: target.width, height: 600, scale: 1 };
  if (measure.found && measure.secRect) {
    const pad = 20;
    const y = Math.max(0, measure.secRect.top - pad);
    const h = measure.secRect.height + pad * 2;
    clip = { x: 0, y, width: target.width, height: h, scale: 1 };
  }

  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip,
    captureBeyondViewport: true,
  });
  const file = join(OUT_DIR, `${target.name}.png`);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  writeFileSync(join(OUT_DIR, `_measure_${target.name}.json`), JSON.stringify(measure, null, 2));

  console.log(`\n=== ${target.name} ===`);
  console.log('Saved:', file);
  console.log('Clip:', JSON.stringify(clip));
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
    await run(browserCdp, t);
  }

  browserCdp.close();
  proc.kill();
  try { rmSync(proc.userDir, { recursive: true, force: true }); } catch {}
}

main().catch((e) => { console.error(e); process.exit(1); });
