# Marketplace screenshots

Regenerates the listing images in `docs/marketing/` (1840×900, the Marketplace highlight size) from the real UI, built against `bridge-demo.js`: fictional companies and people, `example.com` addresses, no Jira site needed.

From the repo root:

```bash
npm install --no-save playwright
npx playwright install chromium
cd static && npx vite build --config ../qa/marketing/vite.demo.config.mjs && cd ..
node qa/marketing/capture.cjs
```

The demo data must stay fictional: no real customers, companies or brands, including well-known fictional brands from films or TV.

Titles, summaries and captions for each image are in `docs/marketing/README.md`.
