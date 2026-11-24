'use strict';
// Contact sheet: node tools/qa/sheet.js out.png cols img1.png img2.png ... (images shown at half their pixel size = CSS size)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [out, cols, ...imgs] = process.argv.slice(2);
  const items = imgs.map(p => `<figure><img src="file://${p}"><figcaption>${p.split('/').pop().replace('.png', '')}</figcaption></figure>`).join('');
  const html = `<html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},auto);gap:6px;width:max-content;font:12px sans-serif;color:#fff"><style>figure{margin:0}img{display:block;width:360px}figcaption{padding:2px 4px;background:#222}</style>${items}</body></html>`;
  const tmp = out + '.html'; fs.writeFileSync(tmp, html);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
  await p.goto('file://' + tmp); await p.waitForTimeout(500);
  await p.screenshot({ path: out, fullPage: true }); await b.close(); fs.unlinkSync(tmp);
})();
