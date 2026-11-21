// Probe the armory shop (5.3) with rapid polling: watch the shop panel and
// the interact prompt after pressing E, to catch a brief open-then-close.
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
  page.on('console', (m) => { if (m.text().includes('[E-DEBUG]')) console.log('GAME:', m.text()); });
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await sleep(3000);
  await page.click('#btn-new');
  await sleep(2000);
  await page.keyboard.press('Enter');
  await sleep(1000);
  const dbg = (expr) => page.evaluate(expr);
  const state = () => dbg(`window.__solmar.state()`);
  const shopHidden = () => page.evaluate(() => document.getElementById('shop-panel').classList.contains('hidden'));
  const promptText = () => page.evaluate(() => {
    const e = document.getElementById('interact');
    return e ? (e.classList.contains('hidden') ? '(hidden)' : e.textContent) : '(no element)';
  });
  await dbg(`window.__solmar.teleport(-120, 80)`);
  await sleep(800);
  let s = await state();
  console.log('at armory: pos=', Math.round(s.px), Math.round(s.pz), 'inVehicle=', s.inVehicle, 'state=', s.state);
  console.log('prompt:', await promptText());
  console.log('shop hidden before E:', await shopHidden());
  // press E and poll rapidly
  await page.keyboard.press('KeyE');
  let sawOpen = false;
  for (let i = 0; i < 40; i++) {
    await sleep(50);
    const hidden = await shopHidden();
    if (!hidden) {
      sawOpen = true;
      console.log(`shop OPEN at poll ${i} (t=${(i + 1) * 50}ms)`);
      break;
    }
  }
  if (!sawOpen) console.log('shop never opened in 2s after E');
  s = await state();
  console.log('after E: pos=', Math.round(s.px), Math.round(s.pz), 'inVehicle=', s.inVehicle);
  console.log('prompt after E:', await promptText());
  console.log('shop hidden now:', await shopHidden());
} finally {
  await browser.close();
  if (server) server.kill();
}
