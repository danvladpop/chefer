const {
  chromium,
} = require('/Users/danpop/work/git-projects/chefer/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright');
const fs = require('fs'),
  path = require('path');
const dir = process.argv[2],
  shotDir = process.argv[3];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 1,
  });
  const out = [];
  for (const f of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.dc.html'))
    .sort()) {
    let html = fs.readFileSync(path.join(dir, f), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    await page.setContent(html, { waitUntil: 'load' });
    const r = await page.evaluate(() => {
      const root = document.querySelector('x-dc > div');
      const H = root.getBoundingClientRect().height,
        top = root.getBoundingClientRect().top;
      // clipped descendants (beyond root bottom)
      let maxBottom = 0;
      for (const el of root.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.height) maxBottom = Math.max(maxBottom, b.bottom - top);
      }
      // inner vertical overflow in clipping containers
      const inner = [];
      for (const el of root.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (
          (cs.overflowY === 'hidden' || cs.overflowY === 'auto' || cs.overflow === 'hidden') &&
          el.scrollHeight > el.clientHeight + 2 &&
          el.clientHeight > 40
        )
          inner.push({
            tag: el.tagName,
            over: el.scrollHeight - el.clientHeight,
            label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 40),
          });
      }
      // natural height
      root.style.height = 'auto';
      const N = root.getBoundingClientRect().height;
      return { H: Math.round(H), N: Math.round(N), maxBottom: Math.round(maxBottom), inner };
    });
    out.push({ f, ...r });
  }
  fs.writeFileSync(path.join(shotDir, 'measure.json'), JSON.stringify(out, null, 1));
  await browser.close();
})();
