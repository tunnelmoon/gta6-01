// Render the four deterministic cover shots with headless Chromium.
// Usage: node scripts/shots.mjs [outDir]  (default: screenshots/)
// The server must be running (npm run serve:test) or pass --serve to
// start it here. Each shot loads ?shot=<name>&seed=1 and waits for
// window.__shotReady, then screenshots 1280x720.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OUT = process.argv[2] || 'screenshots';
const BASE = 'http://127.0.0.1:8734';
const SHOTS = [
  { name: '1-start.jpg', query: '?shot=start&seed=1' },
  { name: '2-play.jpg', query: '?shot=play&seed=1' },
  { name: '3-combat.jpg', query: '?shot=combat&seed=1' },
  { name: '4-end.jpg', query: '?shot=end&seed=1' },
];

let server = null;
async function ensureServer() {
  try {
    const res = await fetch(`${BASE}/index.html`);
    if (res.ok) return;
  } catch {
    // fall through to spawn
  }
  server = spawn('node', ['scripts/serve-test.mjs'], { stdio: 'inherit' });
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`${BASE}/index.html`);
      if (res.ok) return;
    } catch {
      // keep waiting
    }
  }
  throw new Error('test server did not come up');
}

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
});
try {
  await ensureServer();
  fs.mkdirSync(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  for (const s of SHOTS) {
    await page.goto(`${BASE}/${s.query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, undefined, { timeout: 600000 });
    const file = path.join(OUT, s.name);
    await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
    const size = fs.statSync(file).size;
    console.log(`${s.name}: ${size} bytes`);
  }
  console.log(errors.length === 0 ? 'shots OK, no console errors' : `shots done with ${errors.length} console error(s):\n${errors.join('\n')}`);
} finally {
  await browser.close();
  if (server) server.kill();
}
