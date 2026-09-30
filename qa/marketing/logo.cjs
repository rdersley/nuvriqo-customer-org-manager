// App logo in the Nuvriqo family (blue gradient tile, white N, small badge; Portal+ uses a "+").
// This app's badge is two people, for customers. Drawn at 1024px, saved at 144px (Marketplace) and 512px.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const out = process.argv[2] || path.join(__dirname, '..', '..', 'docs', 'marketing');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const urls = await page.evaluate(() => {
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const r = S * 0.22;
    g.beginPath();
    g.moveTo(r, 0); g.arcTo(S, 0, S, S, r); g.arcTo(S, S, 0, S, r); g.arcTo(0, S, 0, 0, r); g.arcTo(0, 0, S, 0, r);
    g.closePath();
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, '#0b3d8f');
    grad.addColorStop(1, '#0c66e4');
    g.fillStyle = grad;
    g.fill();
    // N
    g.fillStyle = '#ffffff';
    g.font = `bold ${S * 0.62}px "Segoe UI", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', S * 0.42, S * 0.57);
    // Badge: two white figures, clear of the N (Portal+ puts a plain white "+" here)
    g.fillStyle = '#ffffff';
    const person = (x, y, k) => {
      g.beginPath(); g.arc(x, y, S * 0.052 * k, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x, y + S * 0.13 * k, S * 0.09 * k, S * 0.07 * k, 0, Math.PI, 0); g.fill();
    };
    person(S * 0.745, S * 0.19, 0.82);
    person(S * 0.855, S * 0.165, 1);
    const scaled = (size) => {
      const d = document.createElement('canvas');
      d.width = size; d.height = size;
      const dg = d.getContext('2d');
      dg.imageSmoothingQuality = 'high';
      dg.drawImage(c, 0, 0, size, size);
      return d.toDataURL('image/png');
    };
    return { s144: scaled(144), s512: scaled(512) };
  });
  fs.writeFileSync(path.join(out, 'app-logo-144.png'), Buffer.from(urls.s144.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(out, 'app-logo-512.png'), Buffer.from(urls.s512.split(',')[1], 'base64'));
  console.log('saved app-logo-144.png, app-logo-512.png');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
