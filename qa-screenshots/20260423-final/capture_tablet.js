const puppeteer = require('puppeteer');
const path = require('path');

const OUTPUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-final';
const WAIT_MS = 6000;
const CAPTURE_HEIGHT = 2500;

const pages = [
  { slug: 'dr-class', url: 'https://gyosei-medical.com/class-clinic/' },
  { slug: 'dr-tsuchiya', url: 'https://gyosei-medical.com/tsuchiya/' },
  { slug: 'dr-kokoro', url: 'https://gyosei-medical.com/kokoromental/' },
];

const widths = [768, 1024];

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
        await page.setCacheEnabled(false);
        await page.setViewport({ width: w, height: CAPTURE_HEIGHT, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
        await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, WAIT_MS));

        // Quick QA checks
        const qa = await page.evaluate(() => {
          const doc = document;
          const body = doc.body;
          const htmlEl = doc.documentElement;
          const docWidth = Math.max(body.scrollWidth, htmlEl.scrollWidth, body.offsetWidth, htmlEl.offsetWidth);
          const viewWidth = htmlEl.clientWidth;
          const hOverflow = docWidth > viewWidth + 1;

          // Find doctor card heuristically
          const candidates = Array.from(doc.querySelectorAll('[class*="doctor"], [class*="profile"], [class*="staff"], [class*="member"], [class*="card"]'));
          let photoWidth = null, photoHeight = null, photoCentered = null, nameNowrap = null, tagHeights = [];
          for (const el of candidates) {
            const img = el.querySelector('img');
            if (img) {
              const r = img.getBoundingClientRect();
              if (r.width >= 150 && r.width <= 260 && r.height >= 150) {
                photoWidth = Math.round(r.width);
                photoHeight = Math.round(r.height);
                const parentRect = el.getBoundingClientRect();
                const imgCenterX = r.left + r.width / 2;
                const parentCenterX = parentRect.left + parentRect.width / 2;
                photoCentered = Math.abs(imgCenterX - parentCenterX) < 20;
                const nameEl = el.querySelector('h1,h2,h3,h4,[class*="name"]');
                if (nameEl) {
                  const ws = getComputedStyle(nameEl).whiteSpace;
                  nameNowrap = ws === 'nowrap' || nameEl.scrollWidth <= nameEl.clientWidth + 2;
                }
                const tags = el.querySelectorAll('[class*="tag"], [class*="badge"], [class*="chip"], li');
                tags.forEach(t => {
                  const tr = t.getBoundingClientRect();
                  if (tr.height > 20 && tr.height < 60) tagHeights.push(Math.round(tr.height));
                });
                break;
              }
            }
          }
          const uniformTags = tagHeights.length > 0 && tagHeights.every(h => Math.abs(h - 36) <= 2);
          return { docWidth, viewWidth, hOverflow, photoWidth, photoHeight, photoCentered, nameNowrap, tagHeights, uniformTags };
        });

        await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: w, height: CAPTURE_HEIGHT } });
        results.push({ filename, ok: true, qa });
        console.log(`[done]  ${filename} QA: overflow=${qa.hOverflow} photo=${qa.photoWidth}x${qa.photoHeight} centered=${qa.photoCentered} nowrap=${qa.nameNowrap} uniform36=${qa.uniformTags} tagH=${JSON.stringify(qa.tagHeights)}`);
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
  for (const r of results) {
    if (r.ok) {
      console.log(`OK   ${r.filename} | overflow=${r.qa.hOverflow} photo=${r.qa.photoWidth}x${r.qa.photoHeight} centered=${r.qa.photoCentered} nowrap=${r.qa.nameNowrap} uniform36=${r.qa.uniformTags}`);
    } else {
      console.log(`FAIL ${r.filename} - ${r.error}`);
    }
  }
})();
