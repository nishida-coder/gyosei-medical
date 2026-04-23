const puppeteer = require('puppeteer');
const path = require('path');

const OUTPUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-final';
const WAIT_MS = 10000;
const CAPTURE_HEIGHT = 2500;

const pages = [
  { slug: 'dr-class', url: 'https://gyosei-medical.com/class-clinic/' },
  { slug: 'dr-tsuchiya', url: 'https://gyosei-medical.com/tsuchiya/' },
  { slug: 'dr-kokoro', url: 'https://gyosei-medical.com/kokoromental/' },
  { slug: 'news-list', url: 'https://gyosei-medical.com/news/' },
];

const widths = [375, 390, 430];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];
  for (const p of pages) {
    for (const w of widths) {
      const filename = `${p.slug}_${w}px.png`;
      const outPath = path.join(OUTPUT_DIR, filename).replace(/\\/g, '/');
      console.log(`[start] ${filename} -> ${p.url}`);
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: w, height: CAPTURE_HEIGHT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
        await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, WAIT_MS));
        await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: w, height: CAPTURE_HEIGHT } });
        results.push({ filename, ok: true });
        console.log(`[done]  ${filename}`);
      } catch (e) {
        results.push({ filename, ok: false, error: String(e) });
        console.log(`[fail]  ${filename}: ${e.message}`);
      } finally {
        await page.close();
      }
    }
  }
  await browser.close();
  console.log('\n=== SUMMARY ===');
  for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.filename}${r.error ? ' - ' + r.error : ''}`);
})();
