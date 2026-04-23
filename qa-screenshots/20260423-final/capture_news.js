const puppeteer = require('puppeteer');
const path = require('path');

const OUTPUT_DIR = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-final';
const WAIT_MS = 6000;
const CAPTURE_HEIGHT = 2500;

const pages = [
  { slug: 'news-list', url: 'https://gyosei-medical.com/news/' },
  { slug: 'cat-year', url: 'https://gyosei-medical.com/category3/2000/' },
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

        // Layout QA: overflow, mid-word-break heuristic (overflowing text nodes), padding snapshot
        const qa = await page.evaluate(() => {
          const doc = document;
          const body = doc.body;
          const htmlEl = doc.documentElement;
          const docWidth = Math.max(body.scrollWidth, htmlEl.scrollWidth, body.offsetWidth, htmlEl.offsetWidth);
          const viewWidth = htmlEl.clientWidth;
          const hOverflow = docWidth > viewWidth + 1;

          // find elements that overflow their parent (potential mid-word/overflow issues)
          const overflowers = [];
          const all = doc.querySelectorAll('main *, article *, .news *, .entry *, .post *');
          for (const el of all) {
            const r = el.getBoundingClientRect();
            if (r.right > viewWidth + 1 && r.width < viewWidth * 1.2) {
              overflowers.push({ tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,60), right: Math.round(r.right) });
              if (overflowers.length >= 5) break;
            }
          }

          // word-break style on list items / titles
          const titles = Array.from(doc.querySelectorAll('h1,h2,h3,h4,article a, .news a, li a')).slice(0, 20);
          const wbStyles = titles.map(t => {
            const cs = getComputedStyle(t);
            return { wb: cs.wordBreak, ws: cs.whiteSpace, ow: cs.overflowWrap };
          });
          const hasBreakAll = wbStyles.some(s => s.wb === 'break-all');

          // main/article container padding
          const main = doc.querySelector('main') || doc.querySelector('#main') || doc.querySelector('article') || body;
          const mainCs = getComputedStyle(main);
          const mainPad = { top: mainCs.paddingTop, right: mainCs.paddingRight, bottom: mainCs.paddingBottom, left: mainCs.paddingLeft };
          const mainRect = main.getBoundingClientRect();

          return { docWidth, viewWidth, hOverflow, overflowers, hasBreakAll, mainPad, mainWidth: Math.round(mainRect.width) };
        });

        await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: w, height: CAPTURE_HEIGHT } });
        results.push({ filename, ok: true, qa });
        console.log(`[done]  ${filename} overflow=${qa.hOverflow} docW=${qa.docWidth} viewW=${qa.viewWidth} breakAll=${qa.hasBreakAll} mainPad=${JSON.stringify(qa.mainPad)} overflowers=${qa.overflowers.length}`);
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
      console.log(`OK   ${r.filename} | overflow=${r.qa.hOverflow} breakAll=${r.qa.hasBreakAll} overflowers=${r.qa.overflowers.length} mainPadLR=${r.qa.mainPad.left}/${r.qa.mainPad.right}`);
      if (r.qa.overflowers.length) console.log('     overflow samples:', JSON.stringify(r.qa.overflowers));
    } else {
      console.log(`FAIL ${r.filename} - ${r.error}`);
    }
  }
})();
