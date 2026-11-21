// Focused probe: skipping the ending cutscene with Enter must not leave
// the letterbox stuck on. Reproduces the 08-freeroam screenshot defect:
// after Enter-skipping the ending, free roam showed black letterbox bars.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

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
const errors = [];
let exitCode = 0;
try {
  await ensureServer();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const state = () => page.evaluate(() => window.__solmar.state());
  const dbg = (expr) => page.evaluate(expr);
  const letterboxOn = () => page.evaluate(() =>
    document.getElementById('letterbox-top').classList.contains('on') ||
    document.getElementById('letterbox-bottom').classList.contains('on'));
  const menuClick = (id) => page.evaluate((btnId) => {
    const el = document.getElementById(btnId);
    if (!el) throw new Error(`missing button ${btnId}`);
    el.click();
  }, id);
  async function waitGame(seconds, capMs = 120000) {
    const t0 = (await state()).time;
    const real0 = Date.now();
    while (Date.now() - real0 < capMs) {
      const cur = await state();
      if (cur.time - t0 >= seconds) return cur;
      await sleep(300);
    }
    return state();
  }
  async function waitStep(mission, step, timeoutMs = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const cur = await state();
      if (cur.mission === mission && cur.step === step) return cur;
      if (cur.mission > mission) return cur;
      if (cur.state === 'cutscene') {
        await page.keyboard.press('Enter');
        await sleep(400);
      }
      await sleep(300);
    }
    return state();
  }
  async function doStep() {
    await dbg(`window.__solmar.completeStep()`);
    await sleep(700);
  }

  await page.goto(`${BASE}/?quality=low`, { waitUntil: 'load' });
  await sleep(2500);
  await menuClick('btn-new');
  await sleep(900);
  await page.keyboard.press('Enter'); // skip M1 intro
  await sleep(600);
  let s = await state();
  console.log(`new game: state=${s.state} mission=${s.mission} step=${s.step}`);

  // Jump straight to M4 via the debug hook.
  await dbg(`window.__solmar.mission(4)`);
  s = await waitStep(4, 0);
  console.log(`M4 started: mission=${s.mission} step=${s.step} state=${s.state}`);

  // M4: cross the bridge
  await dbg(`window.__solmar.teleport(0, -510)`);
  s = await waitStep(4, 1);
  console.log(`M4 bridge: step=${s.step}`);
  // M4: kill 12 elites
  await doStep();
  s = await waitStep(4, 2);
  console.log(`M4 breach: step=${s.step}`);
  // M4: underboss
  await doStep();
  s = await waitStep(4, 3);
  console.log(`M4 underboss: step=${s.step}`);
  // M4: vault
  await doStep();
  s = await waitStep(4, 4, 120000);
  console.log(`M4 vault: step=${s.step} stars=${s.stars}`);
  // M4: escape to the marina -> ending cutscene
  await dbg(`window.__solmar.teleport(780, 260)`);
  await waitGame(2);
  s = await state();
  console.log(`at marina: storyComplete=${s.storyComplete} state=${s.state} letterbox=${await letterboxOn()}`);
  // Wait until the ending cutscene is actually playing.
  for (let i = 0; i < 40; i++) {
    s = await state();
    if (s.state === 'cutscene') break;
    await sleep(300);
  }
  console.log(`ending cutscene: state=${s.state} letterbox=${await letterboxOn()}`);
  // Skip it with Enter, exactly like a player would.
  await page.keyboard.press('Enter');
  await sleep(1000);
  s = await state();
  const lbAfterSkip = await letterboxOn();
  console.log(`after Enter skip: state=${s.state} storyComplete=${s.storyComplete} letterbox=${lbAfterSkip}`);
  if (s.state === 'playing' && !lbAfterSkip) {
    console.log('PASS letterbox off after skipping the ending');
  } else {
    console.log('FAIL letterbox still on after skipping the ending');
    exitCode = 1;
  }
  // Auto-save check: the M4 auto-save must record the finished story,
  // so Continue resumes in free roam instead of dropping back into M4.
  const autoSaved = await page.evaluate(() => localStorage.getItem('solmar-save-v1'));
  const autoStory = autoSaved ? JSON.parse(autoSaved).story : null;
  console.log(`auto-save story flag: ${autoStory} (${autoSaved ? autoSaved.slice(0, 80) : 'no save'})`);
  if (autoStory === true) {
    console.log('PASS auto-save records story complete');
  } else {
    console.log('FAIL auto-save story flag is not true');
    exitCode = 1;
  }
  // The 08-freeroam scenario: quit to title, continue, letterbox must stay off.
  await page.keyboard.press('Escape');
  await sleep(500);
  await menuClick('btn-quit');
  await sleep(600);
  await menuClick('btn-continue');
  await sleep(900);
  s = await state();
  const lbAfterContinue = await letterboxOn();
  console.log(`after quit+continue: state=${s.state} story=${s.storyComplete} letterbox=${lbAfterContinue}`);
  if (s.state === 'playing' && !lbAfterContinue && s.storyComplete === true) {
    console.log('PASS letterbox off and story complete after quit+continue');
  } else {
    console.log('FAIL after quit+continue');
    exitCode = 1;
  }
  await page.screenshot({ path: '/home/hatch/workspace/makefun-gta6-01/test-build/playtest/09-letterbox-probe.jpg', type: 'jpeg', quality: 80 });
  if (errors.length) { console.log('console errors:', errors.slice(0, 5).join(' | ')); exitCode = 1; }
  console.log(exitCode === 0 ? 'PROBE: ALL PASS' : 'PROBE: FAILED');
} finally {
  await browser.close();
  if (server) server.kill();
}
process.exit(exitCode);
