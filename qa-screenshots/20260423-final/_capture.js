const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

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
  const client = await CDP({ port: 9222 });
  const { Page, Emulation, Network, Runtime } = client;
  await Network.enable();
  await Page.enable();
  await Network.setCacheDisabled({ cacheDisabled: true });

  const results = [];

  for (const job of jobs) {
    for (const w of widths) {
      await Emulation.setDeviceMetricsOverride({
        width: w,
        height: HEIGHT,
        deviceScaleFactor: 1,
        mobile: w < 768,
      });
      await Page.navigate({ url: job.url });
      await Page.loadEventFired();
      await sleep(WAIT_MS);

      // Checks
      const { result: checkRes } = await Runtime.evaluate({
        expression: `(() => {
          const docW = document.documentElement.scrollWidth;
          const winW = window.innerWidth;
          const overflow = docW > winW + 1;
          // mid-word breaks: look for elements with overflow-wrap: break-word / word-break: break-all causing visible break
          // heuristic: sample paragraphs and check for break-all / break-word
          const texts = Array.from(document.querySelectorAll('p,h1,h2,h3,h4,li,a,span'));
          let breakAll = 0;
          for (const el of texts) {
            const cs = getComputedStyle(el);
            if (cs.wordBreak === 'break-all') breakAll++;
          }
          // hugging edge: check body/main first child padding-left/right
          const main = document.querySelector('main') || document.body;
          const cs = getComputedStyle(main);
          const padL = parseFloat(cs.paddingLeft) || 0;
          const padR = parseFloat(cs.paddingRight) || 0;
          // also check common container
          const container = document.querySelector('.container, .l-container, .wrap, .wrapper, .inner, article, section');
          let cPadL = 0, cPadR = 0;
          if (container) {
            const ccs = getComputedStyle(container);
            cPadL = parseFloat(ccs.paddingLeft) || 0;
            cPadR = parseFloat(ccs.paddingRight) || 0;
          }
          return JSON.stringify({ docW, winW, overflow, breakAll, padL, padR, cPadL, cPadR });
        })()`,
        returnByValue: true,
      });

      const { data } = await Page.captureScreenshot({ format: 'png' });
      const file = path.join(OUT, `${job.slug}_${w}px.png`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));

      results.push({ slug: job.slug, w, file, check: checkRes.value });
      console.log(`SAVED ${file} | ${checkRes.value}`);
    }
  }
  fs.writeFileSync(path.join(OUT, '_results.json'), JSON.stringify(results, null, 2));
  await client.close();
  console.log('DONE');
})().catch(e => { console.error(e); process.exit(1); });
