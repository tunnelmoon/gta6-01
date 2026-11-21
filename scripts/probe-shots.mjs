// Fast framing probe: render ONLY the combat and end cover shots with a
// short settle wait (70s each, ~30 frames) instead of the full 150-frame
// shot wait, so framing iterations are quick. Output goes to
// ~/workspace/makefun-gta6-01/shots-probe/ (not screenshots/).
// Usage: node scripts/probe-shots.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OUT = '/home/hatch/workspace/makefun-gta6-01/shots-probe';
const BASE = 'http://127.0.0.1:8734';
const SHOTS = [
  { name: '3-combat.jpg', query: '?shot=combat&seed=1' },
  { name: '4-end.jpg', query: '?shot=end&seed=1' },
];
const SETTLE_MS = 70000;

let server = null;
async function ensureServer() {
  try {
    const res = await fetch(`${BASE}/index.html`);
    if (res.ok) return;
  } catch { /* fall through */ }
  server = spawn('node', ['scripts/serve-test.mjs'], { stdio: 'pipe' });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`${BASE}/index.html`);
      if (res.ok) return;
    } catch { /* retry */ }
  }
  throw new Error('test server did not come up');
}

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
});
const errors = [];
try {
  await ensureServer();
  fs.mkdirSync(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  for (const s of SHOTS) {
    await page.goto(`${BASE}/${s.query}`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const file = path.join(OUT, s.name);
    await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
    const size = fs.statSync(file).size;
    console.log(`${s.name}: ${size} bytes`);
  }
  if (errors.length) console.log('console errors:', errors.slice(0, 5).join(' | '));
  console.log(errors.length ? 'PROBE SHOTS: done with errors' : 'PROBE SHOTS: OK, no console errors');
} finally {
  await browser.close();
  if (server) server.kill();
}
