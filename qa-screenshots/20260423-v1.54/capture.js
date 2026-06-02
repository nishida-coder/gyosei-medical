const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Users/nishi/.cache/puppeteer/chrome/win64-147.0.7727.56/chrome-win64/chrome.exe';
const OUT = 'C:/libunworks/projects/gyosei-medical/qa-screenshots/20260423-v1.54';
const WIDTH = 390;
const HEIGHT = 3500;
const WAIT_MS = 8000;

const jobs = [
  { slug: 'home',     url: 'https://gyosei-medical.com/' },
  { slug: 'cat',      url: 'https://gyosei-medical.com/category3/2000/' },
  { slug: 'kokoro',   url: 'https://gyosei-medical.com/kokoromental/' },
  { slug: 'class',    url: 'https://gyosei-medical.com/class-clinic/' },
  { slug: 'mishima',  url: 'https://gyosei-medical.com/mishima-itami/' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const results = [];
  for (const job of jobs) {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, isMobile: true });
    try {
      await page.goto(job.url, { waitUntil: 'load', timeout: 60000 });
    } catch (e) {
      console.error(`GOTO FAIL ${job.slug}: ${e.message}`);
    }
    await sleep(WAIT_MS);

    const check = await page.evaluate((slug) => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const docH = document.documentElement.scrollHeight;
      const overflow = docW > winW + 1;

      const result = { docW, winW, docH, overflow, slug };

      // home: NEWS section detection
      if (slug === 'home') {
        const candidates = Array.from(document.querySelectorAll('section, div, aside'));
        let news = null;
        for (const el of candidates) {
          const t = (el.textContent || '').slice(0, 200);
          if (/NEWS/.test(t) && /お知らせ/.test(t) && el.getBoundingClientRect().height < 1500) {
            news = el;
            break;
          }
        }
        if (news) {
          const cs = getComputedStyle(news);
          const r = news.getBoundingClientRect();
          result.news = {
            found: true,
            bg: cs.backgroundColor,
            width: Math.round(r.width),
            height: Math.round(r.height),
            top: Math.round(r.top + window.scrollY),
            childCount: news.querySelectorAll('li, article, a, .news-item, p').length,
          };
        } else {
          result.news = { found: false };
        }
      }

      // DR pages: doctor circle, photo card, name, tags, MEDIA section
      if (slug === 'kokoro' || slug === 'class' || slug === 'mishima') {
        // Doctor circle image
        const imgs = Array.from(document.querySelectorAll('img'));
        let circle = null;
        for (const img of imgs) {
          const cs = getComputedStyle(img);
          const r = img.getBoundingClientRect();
          if (cs.borderRadius && /50%|9999/.test(cs.borderRadius) && r.width > 100 && r.width < 250) {
            circle = { width: Math.round(r.width), height: Math.round(r.height), borderRadius: cs.borderRadius };
            break;
          }
        }
        result.doctorCircle = circle;

        // Photo card section - check for white frame (background, border, padding)
        let photoCard = null;
        if (circle) {
          // find parent card
          const circleEl = imgs.find(img => {
            const cs = getComputedStyle(img);
            const r = img.getBoundingClientRect();
            return cs.borderRadius && /50%|9999/.test(cs.borderRadius) && r.width > 100 && r.width < 250;
          });
          if (circleEl) {
            let p = circleEl.parentElement;
            for (let i = 0; i < 5 && p; i++) {
              const cs = getComputedStyle(p);
              const bg = cs.backgroundColor;
              const border = cs.border;
              const bs = cs.boxShadow;
              if ((bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ||
                  (border && border !== '0px none rgb(0, 0, 0)' && !border.startsWith('0px')) ||
                  (bs && bs !== 'none')) {
                const r = p.getBoundingClientRect();
                photoCard = {
                  level: i + 1,
                  bg, border, boxShadow: bs,
                  width: Math.round(r.width),
                  tag: p.tagName,
                  cls: p.className && p.className.toString().slice(0, 80),
                };
                break;
              }
              p = p.parentElement;
            }
          }
        }
        result.photoCardFrame = photoCard;

        // Doctor name (serif, ~28px) - find h1/h2/h3 with serif font near top
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, p'));
        let name = null;
        for (const h of headings) {
          const cs = getComputedStyle(h);
          const fs = parseFloat(cs.fontSize);
          const ff = cs.fontFamily;
          if (fs >= 20 && fs <= 36 && /serif|Mincho|明朝|游明朝|Noto Serif/i.test(ff)) {
            const txt = (h.textContent || '').trim();
            if (txt.length > 0 && txt.length < 30) {
              name = { fontSize: Math.round(fs), fontFamily: ff.slice(0, 60), text: txt.slice(0, 30) };
              break;
            }
          }
        }
        result.doctorName = name;

        // Tags - find elements that look like tags (multiple short text items in a row)
        const tagCandidates = Array.from(document.querySelectorAll('span, li, a, div'));
        const tags = [];
        for (const t of tagCandidates) {
          const cs = getComputedStyle(t);
          const r = t.getBoundingClientRect();
          const txt = (t.textContent || '').trim();
          // Tag-like: short text, small height, has background/border
          if (txt.length > 0 && txt.length < 20 && r.height > 18 && r.height < 50 && r.width > 30 && r.width < 200) {
            const bg = cs.backgroundColor;
            const border = cs.border;
            if ((bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ||
                (border && !border.startsWith('0px'))) {
              tags.push({
                text: txt.slice(0, 20),
                height: Math.round(r.height),
                fontSize: Math.round(parseFloat(cs.fontSize)),
                lineHeight: cs.lineHeight,
                paddingTop: cs.paddingTop,
                paddingBottom: cs.paddingBottom,
                bg: bg.slice(0, 30),
              });
              if (tags.length >= 5) break;
            }
          }
        }
        result.tags = tags;

        // MEDIA section
        const all = Array.from(document.querySelectorAll('section, div, h2, h3'));
        let media = null;
        for (const el of all) {
          const t = (el.textContent || '').slice(0, 100);
          if (/MEDIA/i.test(t) && el.getBoundingClientRect().height < 2000 && el.getBoundingClientRect().height > 50) {
            // Find horizontal item cards inside
            const items = el.querySelectorAll('a, article, li, .media-item');
            if (items.length >= 1 && items.length < 20) {
              const r = el.getBoundingClientRect();
              const firstItem = items[0];
              const itemR = firstItem ? firstItem.getBoundingClientRect() : null;
              const itemImg = firstItem ? firstItem.querySelector('img') : null;
              const imgR = itemImg ? itemImg.getBoundingClientRect() : null;
              media = {
                found: true,
                height: Math.round(r.height),
                itemCount: items.length,
                firstItemHeight: itemR ? Math.round(itemR.height) : null,
                firstItemWidth: itemR ? Math.round(itemR.width) : null,
                firstImgWidth: imgR ? Math.round(imgR.width) : null,
                firstImgHeight: imgR ? Math.round(imgR.height) : null,
              };
              break;
            }
          }
        }
        if (!media) {
          // try any element with MEDIA text
          const mediaH = Array.from(document.querySelectorAll('h1,h2,h3,h4')).find(h => /MEDIA/i.test(h.textContent || ''));
          if (mediaH) {
            media = { found: 'heading-only', headingText: mediaH.textContent.trim().slice(0, 50) };
          } else {
            media = { found: false };
          }
        }
        result.media = media;
      }

      // cat: clinic cards
      if (slug === 'cat') {
        const cards = Array.from(document.querySelectorAll('article, .clinic-card, .card, li, .post'));
        const cardData = [];
        for (const c of cards) {
          const r = c.getBoundingClientRect();
          if (r.width > 200 && r.height > 100 && r.height < 800) {
            cardData.push({ width: Math.round(r.width), height: Math.round(r.height), tag: c.tagName, cls: (c.className || '').toString().slice(0, 60) });
            if (cardData.length >= 3) break;
          }
        }
        result.clinicCards = cardData;

        // tags on cat page
        const tagCandidates = Array.from(document.querySelectorAll('span, li, a, div'));
        const tags = [];
        for (const t of tagCandidates) {
          const cs = getComputedStyle(t);
          const r = t.getBoundingClientRect();
          const txt = (t.textContent || '').trim();
          if (txt.length > 0 && txt.length < 20 && r.height > 16 && r.height < 40 && r.width > 30 && r.width < 200) {
            const bg = cs.backgroundColor;
            const border = cs.border;
            if ((bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ||
                (border && !border.startsWith('0px'))) {
              tags.push({
                text: txt.slice(0, 20),
                height: Math.round(r.height),
                fontSize: Math.round(parseFloat(cs.fontSize)),
                lineHeight: cs.lineHeight,
              });
              if (tags.length >= 4) break;
            }
          }
        }
        result.catTags = tags;
      }

      return result;
    }, job.slug);

    const file = path.join(OUT, `${job.slug}_390.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`SAVED ${job.slug} -> ${file}`);
    console.log(JSON.stringify(check, null, 2));
    results.push({ slug: job.slug, check });
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, '_results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error(e); process.exit(1); });
