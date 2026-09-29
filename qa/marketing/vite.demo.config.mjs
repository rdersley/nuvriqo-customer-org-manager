import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Builds the real UI against the demo bridge (fictional data) for Marketplace screenshots.
const app = fileURLToPath(new URL('../../', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export default {
  root: `${app}static`,
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { '@forge/bridge': fileURLToPath(new URL('./bridge-demo.js', import.meta.url)) } },
  build: { outDir: fileURLToPath(new URL('./dist-demo', import.meta.url)), emptyOutDir: true }
};
