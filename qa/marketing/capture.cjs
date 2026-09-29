// Marketplace images (1840x900) from the demo build. Fictional data only. See qa/marketing/README.md.
// With --crops, renders the three highlight views at 1160x660 and saves them halved as 580x330
// (the Marketplace's cropped highlight size), so the layout reflows instead of being sliced.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const CROPS = process.argv.includes('--crops');
const dist = path.join(__dirname, 'dist-demo');
const out = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(__dirname, '..', '..', 'docs', 'marketing');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const small = [
  'Email,Full Name,Organisation',
  'amelia.clarke@example.com,Amelia Clarke,Tidewell Logistics',
  'jonas.weber@example.com,Jonas Weber-Hartmann,Northmere Travel',
  'priya.nair@example.com,Priya Nair,Corvane Retail',
  'mateo.garcia@example.com,Mateo Garcia,Veloair',
  'hannah.schmidt@example.com,Hannah Schmidt,Brackenfield Finance',
  'aisha.khan@example.com,Aisha Khan,Ridgeway Partners',
  "tom.o.brien@example.com,Tom O'Brien,Harlow Health",
  'oscar.lindqvist@example.com,Oscar Lindqvist,Ridgeway Partners',
  'sofia.rossi@example.com,Sofia Rossi-Bianchi,Kestrel Hospitality',
  'chen.wei@example.com,Chen Wei,Marrowby Media',
  'grace.doyle@example,Grace Doyle,Fernhill Foods'
].join('\n');
const crm = ['Contact Name,Work Email,Account,Owner', ...small.split('\n').slice(1, 10).map((l) => { const [e, n, o] = l.split(','); return `${n},${e},${o},Sales`; })].join('\n');
const withProblem = ['Email,Full Name,Organisation', 'mateo.garcia@example.com,Mateo Garcia,Veloair', 'hannah.schmidt@example.com,Hannah Schmidt,Brackenfield Finance', 'oscar.lindqvist@example.com,Oscar Lindqvist,Ridgeway Partners', 'aisha.khan@example.com,Aisha Khan,Ridgeway Partners'].join('\n');
// Same generator as bridge-demo.js, so the first 12,840 rows match existing customers (a third renamed).
const FIRST = ['Emma','Noah','Olivia','Liam','Ava','Lucas','Mia','Ethan','Isla','Leo','Zara','Finn','Ruby','Omar','Chloe','Arjun','Nora','Felix','Maya','Hugo','Ines','Kai','Elena','Ravi','Freya','Tomas','Lena','Yusuf','Clara','Diego'];
const LAST = ['Walsh','Becker','Moreau','Kowalski','Silva','Novak','Jensen','Brennan','Costa','Fischer','Haddad','Larsen','Duarte','Keane','Petrov','Iqbal','Romano','Sato','Byrne','Lindgren','Okafor','Meyer','Carvalho','Doyle','Varga','Nilsen','Rahman','Quinn','Farrell','Hale'];
const demoName = (i) => `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}${i >= FIRST.length * LAST.length ? ' ' + String.fromCharCode(65 + Math.floor(i / (FIRST.length * LAST.length)) % 26) + '.' : ''}`;
const demoEmail = (i) => `${demoName(i).toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '')}.${i}@example.com`;
const ORGS = ['Tidewell Logistics', 'Northmere Travel', 'Corvane Retail', 'Veloair', 'Brackenfield Finance', 'Harlow Health'];
const big = ['Email,Full Name,Organisation', ...Array.from({ length: 16413 }, (_, i) => `${demoEmail(i)},${demoName(i)},${ORGS[i % ORGS.length]}`)].join('\n');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: CROPS ? { width: 1160, height: 660 } : { width: 1840, height: 900 } });
  const scaler = CROPS ? await browser.newPage() : null;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('https://harness.local/**', (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html';
    route.fulfill({ status: 200, contentType: types[path.extname(rel)] || 'application/octet-stream', body: fs.readFileSync(path.join(dist, rel)) });
  });
  const open = async (tab) => {
    await page.goto('https://harness.local/index.html');
    await page.getByRole('heading', { name: 'Customers', exact: true }).waitFor();
    if (tab) await page.getByRole('tab', { name: tab, exact: true }).click();
  };
  const scrollTo = async (locator, offset = 24) => {
    await locator.first().evaluate((e, o) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - o), offset);
    await page.waitForTimeout(150);
  };
  const shot = async (name) => {
    if (CROPS && !name.startsWith('highlight-')) return;
    await page.mouse.move(CROPS ? 1155 : 1835, 5);
    await page.waitForTimeout(100);
    if (!CROPS) { await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('saved', name); return; }
    const src = `data:image/png;base64,${(await page.screenshot()).toString('base64')}`;
    const dataUrl = await scaler.evaluate(async (s) => {
      const img = new Image();
      img.src = s;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 580;
      canvas.height = 330;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, 580, 330);
      return canvas.toDataURL('image/png');
    }, src);
    fs.writeFileSync(path.join(out, `${name}-580x330.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('saved', `${name}-580x330`);
  };
  const upload = (name, text) => page.locator('#csv-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

  // 1. Know before you import
  await open('Import');
  await upload('support-contacts.csv', small);
  await page.getByRole('heading', { name: 'Import preview' }).waitFor();
  await page.getByText('will be created').first().waitFor();
  await scrollTo(page.locator('.nq-notice', { hasText: 'will be excluded' }));
  await shot('highlight-1-know-before-you-import');

  // 2. Built for large sites
  await open('Import');
  await upload('crm-export-september.csv', big);
  await page.getByRole('heading', { name: 'Jira comparison complete' }).waitFor({ timeout: 120000 });
  await scrollTo(page.locator('.nq-card', { hasText: 'Jira comparison complete' }));
  await shot('highlight-2-built-for-large-sites');

  // 8. Typed confirmation (crop of the same run)
  const importButton = page.getByRole('button', { name: /^Import [\d,]+ customer changes/ });
  const count = (await importButton.innerText()).match(/Import ([\d,]+)/)[1].replace(/,/g, '');
  await importButton.click();
  await page.locator('#import-confirm-count').fill(Number(count).toLocaleString('en-GB'));
  await scrollTo(page.locator('.nq-notice', { hasText: 'Check before importing' }), 300);
  await shot('screenshot-6-large-import-confirmation');

  // 3. Organisations that stay in sync
  await open('Organisation sync');
  await page.getByRole('heading', { name: 'Sync health' }).waitFor();
  await page.getByRole('button', { name: 'Check tickets' }).click();
  await page.getByRole('button', { name: 'Correct 51 tickets' }).waitFor();
  await scrollTo(page.locator('.nq-card', { hasText: 'Checks every ticket' }));
  await shot('highlight-3-organisations-in-sync');

  // 4. Column mapping with a saved mapping
  await open('Import');
  await upload('crm-contacts.csv', crm);
  await page.getByText('Using the saved mapping "CRM monthly export".').waitFor();
  await page.getByRole('heading', { name: 'Import preview' }).waitFor();
  await scrollTo(page.locator('.nq-card', { hasText: 'Upload a CSV' }));
  await shot('screenshot-1-column-mapping');

  // 5. Import complete with a row to fix
  await open('Import');
  await upload('new-partner-contacts.csv', withProblem);
  await page.getByRole('heading', { name: 'Import preview' }).waitFor();
  await page.getByRole('button', { name: /^Import \d+ customer change/ }).click();
  await page.getByText(/^Import finished/).waitFor({ timeout: 20000 }).catch(async (e) => { await page.screenshot({ path: path.join(out, 'debug-results.png'), fullPage: true }); console.log('ERRS', errors.join(' | ')); throw e; });
  await scrollTo(page.locator('.nq-stats'));
  await shot('screenshot-2-import-results');

  // 6. Sync settings and mappings
  await open('Organisation sync');
  await page.getByRole('heading', { name: 'Client mappings' }).waitFor();
  await page.getByLabel('Client value 5').waitFor();
  await scrollTo(page.locator('.nq-header'), 32);
  await shot('screenshot-3-sync-settings');

  // 7. Import History
  await open('Import History');
  await page.getByText('crm-export-september.csv').waitFor();
  await page.getByText(/7c1e0a2/).waitFor();
  await shot('screenshot-4-import-history');

  // Organisations
  await open('Organisations');
  await page.getByText('Tidewell Logistics').waitFor();
  await shot('screenshot-5-organisations');

  console.log(errors.length ? `ERRORS: ${errors.join(' | ')}` : 'all captured, no console errors');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
