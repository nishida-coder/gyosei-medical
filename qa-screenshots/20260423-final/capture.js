const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Users/nishi/.cache/puppeteer/chrome/win64-147.0.7727.56/chrome-win64/chrome.exe';
const OUT = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-final';
const HEIGHT = 2500;
const WAIT_MS = 6000;

const jobs = [
  { slug: 'privacy',    url: 'https://gyosei-medical.com/privacypolicy/' },
  { slug: 'management', url: 'https://gyosei-medical.com/management/' },
];
const widths = [375, 390, 430, 768, 1024];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const results = [];
  for (const job of jobs) {
    for (const w of widths) {
      const page = await browser.newPage();
      await page.setCacheEnabled(false);
      await page.setViewport({ width: w, height: HEIGHT, deviceScaleFactor: 1, isMobile: w < 768 });
      try {
        await page.goto(job.url, { waitUntil: 'load', timeout: 60000 });
      } catch (e) {
        console.error(`GOTO FAIL ${job.slug} ${w}: ${e.message}`);
      }
      await sleep(WAIT_MS);

      const check = await page.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const winW = window.innerWidth;
        const overflow = docW > winW + 1;
        const els = Array.from(document.querySelectorAll('p,h1,h2,h3,h4,li,a,span,div'));
        let breakAll = 0;
        for (const el of els) {
          const cs = getComputedStyle(el);
          if (cs.wordBreak === 'break-all') breakAll++;
        }
        const main = document.querySelector('main') || document.body;
        const cs = getComputedStyle(main);
        const bodyPadL = parseFloat(cs.paddingLeft) || 0;
        const bodyPadR = parseFloat(cs.paddingRight) || 0;
        const article = document.querySelector('article, .entry-content, .p-entry, .post, .content, main');
        let aPadL = 0, aPadR = 0, aBox = null;
        if (article) {
          const acs = getComputedStyle(article);
          aPadL = parseFloat(acs.paddingLeft) || 0;
          aPadR = parseFloat(acs.paddingRight) || 0;
          const r = article.getBoundingClientRect();
          aBox = { left: Math.round(r.left), rightGap: Math.round(winW - r.right), width: Math.round(r.width) };
        }
        return { docW, winW, overflow, breakAll, bodyPadL, bodyPadR, aPadL, aPadR, aBox };
      });

      const file = path.join(OUT, `${job.slug}_${w}px.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`SAVED ${job.slug} ${w} | ${JSON.stringify(check)}`);
      results.push({ slug: job.slug, w, check });
      await page.close();
    }
  }
  fs.writeFileSync(path.join(OUT, '_results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error(e); process.exit(1); });
