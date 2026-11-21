// Focused probe: reproduce the M2 stall. Loads the scratch build,
// starts a new game, fast-forwards M1 via debug hooks, then watches
// M2 start, the intro cutscene, and the goto step. Logs state every
// step so the stall point is visible.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8734';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const state = () => page.evaluate(() => window.__solmar.state());
const dbg = (expr) => page.evaluate(expr);
const menuClick = (id) => page.evaluate((btnId) => {
  const el = document.getElementById(btnId);
  if (!el) throw new Error(`missing button ${btnId}`);
  el.click();
}, id);

try {
  await page.goto(`${BASE}/?quality=low`, { waitUntil: 'load' });
  await sleep(2500);
  let s = await state();
  console.log('boot:', JSON.stringify({ state: s.state, mission: s.mission, step: s.step }));
  await menuClick('btn-new');
  await sleep(1000);
  s = await state();
  console.log('after new game:', JSON.stringify({ state: s.state, mission: s.mission, step: s.step }));
  await page.keyboard.press('Enter');
  await sleep(600);
  s = await state();
  console.log('after Enter skip:', JSON.stringify({ state: s.state, mission: s.mission, step: s.step }));

  // fast-forward M1: complete each step, log after each
  for (let i = 0; i < 6; i++) {
    await dbg(`window.__solmar.completeStep()`);
    await sleep(1500);
    s = await state();
    console.log(`after completeStep #${i + 1}:`, JSON.stringify({ state: s.state, mission: s.mission, step: s.step, cash: s.cash, stars: s.stars, inVehicle: s.inVehicle }));
    if (s.mission === 2) break;
    if (s.state === 'cutscene') {
      await page.keyboard.press('Enter');
      await sleep(600);
      s = await state();
      console.log('  (skipped cutscene):', JSON.stringify({ state: s.state, mission: s.mission, step: s.step }));
      if (s.mission === 2) break;
    }
  }

  // Now in M2 (or not). Watch the M2 intro cutscene.
  console.log('--- M2 phase ---');
  for (let i = 0; i < 10; i++) {
    s = await state();
    console.log(`t+${i}s:`, JSON.stringify({ state: s.state, mission: s.mission, step: s.step, stepText: s.stepText, px: s.px, pz: s.pz }));
    if (s.state === 'cutscene') {
      await page.keyboard.press('Enter');
      console.log('  pressed Enter to skip cutscene');
    }
    if (s.mission === 2 && s.step === 0 && s.state === 'playing') break;
    await sleep(1000);
  }

  // Try the M2 goto: teleport to the Port Gate.
  await dbg(`window.__solmar.teleport(-60, 480)`);
  await sleep(500);
  for (let i = 0; i < 10; i++) {
    s = await state();
    console.log(`goto t+${i}s:`, JSON.stringify({ state: s.state, mission: s.mission, step: s.step, px: s.px, pz: s.pz, stepText: s.stepText }));
    if (s.step === 1) break;
    if (s.state === 'cutscene') await page.keyboard.press('Enter');
    await sleep(1000);
  }
  console.log('errors:', errors.slice(0, 5));
} catch (e) {
  console.error('PROBE CRASH:', e);
} finally {
  await browser.close();
}
