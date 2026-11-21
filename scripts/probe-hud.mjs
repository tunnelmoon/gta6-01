// Focused probe: the HUD readouts must actually update in the DOM.
// hud.ts looks up a fixed list of element ids and silently skips any
// that are missing, so a mismatch between game/index.html and hud.ts
// leaves readouts frozen or blank with no error. This probe reads the
// live DOM after driving each readout: objective text, weapon name and
// ammo after switching, speed and vehicle HP while driving, subtitle
// text during a mission intro, the WASTED overlay, the shop Close
// button, and the pause-menu quality/volume controls.
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
const errors = [];
let exitCode = 0;
function pass(name, detail = '') {
  console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
}
function fail(name, detail = '') {
  console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  exitCode = 1;
}
try {
  await ensureServer();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const state = () => page.evaluate(() => window.__solmar.state());
  const dbg = (expr) => page.evaluate(expr);
  const hudText = (id) => page.evaluate((i) => {
    const el = document.getElementById(i);
    return el ? el.textContent : null;
  }, id);
  const hudHidden = (id) => page.evaluate((i) => {
    const el = document.getElementById(i);
    return el ? el.classList.contains('hidden') : null;
  }, id);
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

  await page.goto(`${BASE}/?quality=low`, { waitUntil: 'load' });
  await sleep(2500);
  await menuClick('btn-new');
  await sleep(900);
  await page.keyboard.press('Enter'); // skip M1 intro
  await sleep(600);
  let s = await state();
  console.log(`new game: state=${s.state} mission=${s.mission} step=${s.step}`);

  // 1. Objective readout must carry the mission text.
  const ot = await hudText('objective-title');
  const os = await hudText('objective-step');
  const od = await hudText('objective-dist');
  console.log(`objective: title=${JSON.stringify(ot)} step=${JSON.stringify(os)} dist=${JSON.stringify(od)}`);
  if (ot && ot.includes('Salt and Ignition') && os && os.length > 3) pass('objective title and step render');
  else fail('objective title and step render', `title=${ot} step=${os}`);
  if (od && od.endsWith('m')) pass('objective distance renders', od);
  else fail('objective distance renders', `dist=${od}`);

  // 2. Weapon readout must follow a weapon switch.
  await dbg(`window.__solmar.giveWeapons()`);
  await page.keyboard.press('Digit4'); // Bulldog Carbine
  await waitGame(1);
  const wn = await hudText('weapon-name');
  const wa = await hudText('weapon-ammo');
  console.log(`weapon after switch to slot 4: name=${JSON.stringify(wn)} ammo=${JSON.stringify(wa)}`);
  if (wn && wn.includes('Bulldog')) pass('weapon name updates on switch', wn);
  else fail('weapon name updates on switch', `name=${wn}`);
  if (wa && wa.includes('/')) pass('weapon ammo renders', wa);
  else fail('weapon ammo renders', `ammo=${wa}`);

  // 3. Speed and vehicle HP must go live in a car.
  s = await state();
  await dbg(`window.__solmar.spawnCar('solmarGT', ${s.px + 4}, ${s.pz}, 0)`);
  await sleep(500);
  await page.keyboard.press('KeyE');
  await sleep(600);
  s = await state();
  console.log(`in vehicle: ${s.inVehicle}`);
  await page.keyboard.down('KeyW');
  await waitGame(3);
  await page.keyboard.up('KeyW');
  const sp = await hudText('speed-num');
  const sl = await hudText('speed-label');
  const vehHidden = await hudHidden('veh-hp-row');
  const vehFill = await page.evaluate(() => {
    const el = document.getElementById('veh-hp-fill');
    return el ? el.style.width : null;
  });
  console.log(`speed: num=${JSON.stringify(sp)} label=${JSON.stringify(sl)} vehRowHidden=${vehHidden} vehFill=${vehFill}`);
  if (sp && Number(sp) > 0) pass('speedometer goes live while driving', `${sp} MPH`);
  else fail('speedometer goes live while driving', `num=${sp}`);
  if (sl === 'MPH') pass('speed label renders');
  else fail('speed label renders', `label=${sl}`);
  if (vehHidden === false) pass('vehicle HP row shows in a car', `fill=${vehFill}`);
  else fail('vehicle HP row shows in a car', `hidden=${vehHidden}`);

  // Screenshot the driving HUD for a visual check.
  await page.screenshot({ path: '/home/hatch/workspace/makefun-gta6-01/test-build/playtest/10-hud-driving.jpg', type: 'jpeg', quality: 80 });

  // 4. Subtitle must render during a mission intro cutscene.
  await dbg(`window.__solmar.mission(2)`);
  await sleep(1500);
  // Wait for the cutscene to be playing and a subtitle line to appear.
  let subSp = null;
  let subLn = null;
  for (let i = 0; i < 40; i++) {
    s = await state();
    subSp = await hudText('subtitle-speaker');
    subLn = await hudText('subtitle-line');
    if (s.state === 'cutscene' && subLn && subLn.length > 3) break;
    await sleep(400);
  }
  console.log(`subtitle during M2 intro: speaker=${JSON.stringify(subSp)} line=${JSON.stringify(subLn)} state=${s.state}`);
  if (subLn && subLn.length > 3) pass('cutscene subtitle renders', `${subSp}: ${subLn.slice(0, 40)}`);
  else fail('cutscene subtitle renders', `line=${subLn}`);
  await page.keyboard.press('Enter'); // skip the cutscene
  await sleep(600);

  // 5. WASTED overlay must show when the player dies.
  await dbg(`window.__solmar.damagePlayer(500)`);
  await sleep(800);
  const wastedHidden = await hudHidden('wasted');
  console.log(`wasted overlay hidden=${wastedHidden}`);
  if (wastedHidden === false) pass('WASTED overlay shows on death');
  else fail('WASTED overlay shows on death', `hidden=${wastedHidden}`);
  await sleep(2500); // let the wasted overlay clear and the respawn happen
  // Wait until the player is actually back to playing (the wasted state
  // lasts ~2.2 game-seconds, and game time runs slowly headless).
  for (let i = 0; i < 40; i++) {
    s = await state();
    if (s.state === 'playing') break;
    await sleep(500);
  }
  s = await state();
  console.log(`after wasted: state=${s.state} cash=${s.cash}`);

  // 6. Shop Close button must hide the shop panel.
  await dbg(`window.__solmar.teleport(-120, 80)`);
  await sleep(600);
  s = await state();
  if (s.inVehicle) {
    await page.keyboard.press('KeyE'); // exit the car first
    await sleep(500);
  }
  await page.keyboard.press('KeyE');
  await sleep(800);
  const shopOpen = !(await hudHidden('shop-panel'));
  console.log(`shop open=${shopOpen}`);
  if (!shopOpen) {
    fail('shop opens for the close test');
  } else {
    await menuClick('shop-close');
    await sleep(400);
    const shopClosed = await hudHidden('shop-panel');
    if (shopClosed) pass('shop Close button hides the panel');
    else fail('shop Close button hides the panel');
  }

  // 7. Pause menu quality/volume controls must exist and work.
  await page.keyboard.press('Escape');
  await sleep(700);
  const qTag = await page.evaluate(() => {
    const el = document.getElementById('quality');
    return el ? el.tagName : null;
  });
  const vTag = await page.evaluate(() => {
    const el = document.getElementById('volume');
    return el ? `${el.tagName}:${el.type}` : null;
  });
  console.log(`quality control: ${qTag}, volume control: ${vTag}`);
  if (qTag === 'SELECT') pass('quality is a select');
  else fail('quality is a select', `tag=${qTag}`);
  if (vTag === 'INPUT:range') pass('volume is a range input');
  else fail('volume is a range input', `tag=${vTag}`);
  // Change both and confirm no console errors appear.
  await page.evaluate(() => {
    const q = document.getElementById('quality');
    q.value = 'low';
    q.dispatchEvent(new Event('change', { bubbles: true }));
    const v = document.getElementById('volume');
    v.value = '30';
    v.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(600);
  await page.screenshot({ path: '/home/hatch/workspace/makefun-gta6-01/test-build/playtest/11-hud-pause.jpg', type: 'jpeg', quality: 80 });
  // Back button must close the controls screen.
  await menuClick('btn-controls');
  await sleep(500);
  const controlsOpen = !(await hudHidden('controls-screen'));
  if (!controlsOpen) {
    fail('controls screen opens');
  } else {
    await menuClick('btn-back');
    await sleep(400);
    const controlsClosed = await hudHidden('controls-screen');
    if (controlsClosed) pass('controls Back button closes the screen');
    else fail('controls Back button closes the screen');
  }
  await page.keyboard.press('Escape'); // resume
  await sleep(500);

  if (errors.length) { console.log('console errors:', errors.slice(0, 5).join(' | ')); exitCode = 1; }
  console.log(exitCode === 0 ? 'PROBE: ALL PASS' : 'PROBE: FAILED');
} finally {
  await browser.close();
  if (server) server.kill();
}
process.exit(exitCode);
