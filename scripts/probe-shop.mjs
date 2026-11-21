// Probe the armory shop (5.3) in a clean state: new game, skip cutscene,
// teleport on foot to the armory, press E, and log what happens.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const BASE = 'http://127.0.0.1:8734';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
async function ensureServer() {
  try {
    const res = await fetch(`${BASE}/index.html`);
    if (res.ok) return;
  } catch {}
  server = spawn('node', ['scripts/serve-test.mjs'], { stdio: 'pipe' });
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    try {
      const res = await fetch(`${BASE}/index.html`);
      if (res.ok) return;
    } catch {}
  }
  throw new Error('test server did not come up');
}

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
});
try {
  await ensureServer();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await sleep(3000);
  // new game
  await page.click('#btn-new');
  await sleep(2000);
  // skip cutscene
  await page.keyboard.press('Enter');
  await sleep(1000);
  const dbg = (expr) => page.evaluate(expr);
  const state = () => dbg(`window.__solmar.state()`);
  let s = await state();
  console.log('after new game: state=', s.state, 'pos=', Math.round(s.px), Math.round(s.pz), 'inVehicle=', s.inVehicle, 'mission=', s.mission, 'step=', s.step);
  // teleport on foot to the armory
  await dbg(`window.__solmar.teleport(-120, 80)`);
  await sleep(800);
  s = await state();
  console.log('after teleport: pos=', Math.round(s.px), Math.round(s.pz), 'inVehicle=', s.inVehicle);
  console.log('interact prompt:', await page.evaluate(() => document.getElementById('interact-prompt')?.textContent));
  // press E
  await page.keyboard.press('KeyE');
  await sleep(600);
  s = await state();
  console.log('after E: pos=', Math.round(s.px), Math.round(s.pz), 'inVehicle=', s.inVehicle);
  console.log('shop-panel hidden?', await page.evaluate(() => document.getElementById('shop-panel').classList.contains('hidden')));
  console.log('shop title:', await page.evaluate(() => document.getElementById('shop-title')?.textContent));
  console.log('interact prompt now:', await page.evaluate(() => document.getElementById('interact-prompt')?.textContent));
  // press E again
  await page.keyboard.press('KeyE');
  await sleep(600);
  console.log('after 2nd E: shop-panel hidden?', await page.evaluate(() => document.getElementById('shop-panel').classList.contains('hidden')));
} finally {
  await browser.close();
  if (server) server.kill();
}
