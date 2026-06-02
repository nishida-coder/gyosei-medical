const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Users/nishi/.cache/puppeteer/chrome/win64-147.0.7727.56/chrome-win64/chrome.exe';
const OUT = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.54';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // Home: scan whole DOM for NEWS/お知らせ in any visible form
  {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setViewport({ width: 390, height: 13200, deviceScaleFactor: 1, isMobile: true });
    await page.goto('https://gyosei-medical.com/', { waitUntil: 'load', timeout: 60000 });
    await sleep(8000);
    const newsScan = await page.evaluate(() => {
      const out = [];
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        const text = (el.textContent || '');
        const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('');
        if (/お知らせ/.test(own) || /^NEWS$/i.test(own.trim()) || (/NEWS/.test(own) && own.length < 30)) {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          out.push({
            tag: el.tagName,
            cls: (el.className || '').toString().slice(0, 60),
            text: own.trim().slice(0, 40),
            top: Math.round(r.top + window.scrollY),
            width: Math.round(r.width),
            height: Math.round(r.height),
            visible: cs.display !== 'none' && cs.visibility !== 'hidden',
            display: cs.display,
            color: cs.color,
            bg: cs.backgroundColor,
          });
          if (out.length >= 20) break;
        }
      }
      return out;
    });
    console.log('HOME NEWS SCAN:');
    console.log(JSON.stringify(newsScan, null, 2));

    // Also screenshot full home page
    await page.screenshot({ path: path.join(OUT, 'home_full.png'), fullPage: true });
    await page.close();
  }

  // Kokoro: inspect photo card + MEDIA in detail
  {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setViewport({ width: 390, height: 9000, deviceScaleFactor: 1, isMobile: true });
    await page.goto('https://gyosei-medical.com/kokoromental/', { waitUntil: 'load', timeout: 60000 });
    await sleep(8000);

    // Find doctor card area + parent chain
    const detail = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      let circleImg = null;
      for (const img of imgs) {
        const cs = getComputedStyle(img);
        const r = img.getBoundingClientRect();
        if (cs.borderRadius && /50%|9999/.test(cs.borderRadius) && r.width > 100 && r.width < 250) {
          circleImg = img;
          break;
        }
      }
      const chain = [];
      let p = circleImg ? circleImg.parentElement : null;
      for (let i = 0; i < 8 && p; i++) {
        const cs = getComputedStyle(p);
        const r = p.getBoundingClientRect();
        chain.push({
          level: i,
          tag: p.tagName,
          cls: (p.className || '').toString().slice(0, 80),
          bg: cs.backgroundColor,
          border: cs.border,
          boxShadow: cs.boxShadow,
          padding: cs.padding,
          width: Math.round(r.width),
          height: Math.round(r.height),
        });
        p = p.parentElement;
      }

      // Find MEDIA section in detail
      const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4'));
      let mediaH = heads.find(h => /MEDIA/i.test(h.textContent || ''));
      let mediaInfo = null;
      if (mediaH) {
        // Find its container section
        let sec = mediaH.parentElement;
        while (sec && sec.tagName !== 'SECTION' && sec.tagName !== 'BODY') sec = sec.parentElement;
        sec = sec || mediaH.parentElement;
        const r = sec.getBoundingClientRect();
        const items = sec.querySelectorAll('article, a, li');
        const itemDetails = [];
        items.forEach((item, idx) => {
          if (idx >= 5) return;
          const ir = item.getBoundingClientRect();
          const im = item.querySelector('img');
          const imR = im ? im.getBoundingClientRect() : null;
          itemDetails.push({
            tag: item.tagName,
            cls: (item.className || '').toString().slice(0, 60),
            width: Math.round(ir.width),
            height: Math.round(ir.height),
            imgWidth: imR ? Math.round(imR.width) : null,
            imgHeight: imR ? Math.round(imR.height) : null,
            text: (item.textContent || '').trim().slice(0, 60),
          });
        });
        mediaInfo = {
          sectionTag: sec.tagName,
          sectionCls: (sec.className || '').toString().slice(0, 80),
          sectionHeight: Math.round(r.height),
          sectionTop: Math.round(r.top + window.scrollY),
          itemCount: items.length,
          items: itemDetails,
        };
      }

      // Doctor name detail - target near top of doctor section
      const allHead = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,p,div,span'));
      const names = [];
      for (const h of allHead) {
        const cs = getComputedStyle(h);
        const fs = parseFloat(cs.fontSize);
        const txt = (h.textContent || '').trim();
        // own text only
        const own = Array.from(h.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        if (own.length > 0 && own.length < 30 && fs >= 18 && fs <= 36) {
          if (/Mincho|Serif|明朝|游明朝/i.test(cs.fontFamily)) {
            names.push({ tag: h.tagName, text: own, fontSize: Math.round(fs), fontFamily: cs.fontFamily.slice(0, 50) });
            if (names.length >= 8) break;
          }
        }
      }

      // Tag heights/centering check
      const tagSelectors = ['.gm-tag', '.tag', '.specialty', '.category'];
      const tagInfo = [];
      for (const sel of tagSelectors) {
        const els = document.querySelectorAll(sel);
        els.forEach((el, i) => {
          if (i >= 3) return;
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          tagInfo.push({
            selector: sel,
            text: (el.textContent || '').trim().slice(0, 20),
            height: Math.round(r.height),
            fontSize: Math.round(parseFloat(cs.fontSize)),
            lineHeight: cs.lineHeight,
            paddingTop: cs.paddingTop,
            paddingBottom: cs.paddingBottom,
            display: cs.display,
            alignItems: cs.alignItems,
          });
        });
      }

      return { chain, mediaInfo, names, tagInfo };
    });
    console.log('KOKORO DETAIL:');
    console.log(JSON.stringify(detail, null, 2));
    await page.close();
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
