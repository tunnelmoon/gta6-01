// Tiny probe: does Escape open the pause menu, and does the menu
// render (with the new quality select + volume range) on screen?
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const BASE = 'http://127.0.0.1:8734';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
async function ensureServer() {
  try {
    const res = await fetch(`${BASE}/index.html`);
    if (res.ok) return;
  } catch { /* fall through */ }
  server = spawn('node', ['scripts/serve-test.mjs'], { stdio: 'pipe' });
  for (let i = 0; i < 40; i++) {
    await sleep(200);
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
let exitCode = 0;
try {
  await ensureServer();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror:', String(e)));
  const state = () => page.evaluate(() => window.__solmar.state());
  const menuClick = (id) => page.evaluate((btnId) => {
    const el = document.getElementById(btnId);
    if (!el) throw new Error(`missing button ${btnId}`);
    el.click();
  }, id);
  await page.goto(`${BASE}/?quality=low`, { waitUntil: 'load' });
  await sleep(2500);
  await menuClick('btn-new');
  await sleep(900);
  await page.keyboard.press('Enter');
  await sleep(600);
  let s = await state();
  console.log(`before Escape: state=${s.state}`);
  await page.keyboard.press('Escape');
  await sleep(700);
  s = await state();
  const pausedHidden = await page.evaluate(() => document.getElementById('pause-menu').classList.contains('hidden'));
  console.log(`after Escape: state=${s.state} pauseMenuHidden=${pausedHidden}`);
  if (s.state === 'paused' && !pausedHidden) console.log('PASS pause menu opens');
  else { console.log('FAIL pause menu opens'); exitCode = 1; }
  await page.screenshot({ path: '/home/hatch/workspace/makefun-gta6-01/test-build/playtest/12-pause-menu.jpg', type: 'jpeg', quality: 80 });
  // Change quality + volume via the real controls, then resume.
  await page.evaluate(() => {
    const q = document.getElementById('quality');
    q.value = 'medium';
    q.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(400);
  await menuClick('btn-resume');
  await sleep(500);
  s = await state();
  console.log(`after resume: state=${s.state}`);
  if (s.state === 'playing') console.log('PASS resume returns to playing');
  else { console.log('FAIL resume'); exitCode = 1; }
  console.log(exitCode === 0 ? 'PROBE: ALL PASS' : 'PROBE: FAILED');
} finally {
  await browser.close();
  if (server) server.kill();
}
process.exit(exitCode);
