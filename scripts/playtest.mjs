// Exhaustive playtest for Solmar Sunset against the scratch build.
// Runs the game in headless Chromium (software WebGL is slow, about
// 1-5 fps, so every wait is measured in GAME time, not real time) and
// drives it with real keyboard / mouse input plus the __solmar debug
// hooks. Prints PASS/FAIL per check and a final score. Exit code 0
// only when every check passes.
// Usage: node scripts/playtest.mjs  (starts its own test server)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8734';
const OUT = '/home/hatch/workspace/makefun-gta6-01/test-build/playtest';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
async function ensureServer() {
  try {
    const res = await fetch(`${BASE}/index.html`);
    if (res.ok) return;
  } catch {
    // fall through
  }
  server = spawn('node', ['scripts/serve-test.mjs'], { stdio: 'pipe' });
  for (let i = 0; i < 40; i++) {
    await sleep(200);
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
const errors = [];
const failedRequests = [];
try {
  await ensureServer();
  fs.mkdirSync(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
  });

  const state = () => page.evaluate(() => window.__solmar.state());
  const dbg = (expr) => page.evaluate(expr);
  // Direct DOM click for menu buttons: at very low headless FPS,
  // Playwright's hit-test can catch a stale layout and refuse the click
  // even though the layout is correct (verified by probe3).
  const menuClick = (id) =>
    page.evaluate((btnId) => {
      const el = document.getElementById(btnId);
      if (!el) throw new Error(`missing button ${btnId}`);
      el.click();
    }, id);
  const shot = async (name) => {
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80 });
  };
  // Wait until the game's clock advances by `seconds` (game time).
  // Headless software rendering runs far below real time, so real-time
  // sleeps are meaningless here.
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
  // Hold a key for `seconds` of game time.
  async function holdKey(code, seconds) {
    await page.keyboard.down(code);
    await waitGame(seconds);
    await page.keyboard.up(code);
  }
  // Hold the left mouse button for `seconds` of game time (auto weapons
  // fire continuously while held; a quick click can fall between frames).
  async function holdMouse(seconds) {
    await page.mouse.move(480, 270);
    await page.mouse.down();
    await waitGame(seconds);
    await page.mouse.up();
  }

  // ---------- Slice 0: boot ----------
  await page.goto(`${BASE}/?quality=low`, { waitUntil: 'load' });
  await sleep(2500);
  let s = await state();
  check('0.1 title screen loads, game state is title', s.state === 'title', `state=${s.state}`);
  check('0.2 no console errors on load', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('0.3 no failed requests on load', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));
  check('0.4 loading overlay hidden', await page.evaluate(() => document.getElementById('loading').classList.contains('hidden')));
  check('0.5 new game button visible', await page.evaluate(() => !document.getElementById('btn-new').offsetParent === false));
  const bootShot = await page.screenshot({ type: 'jpeg', quality: 80 });
  check('0.6 title frame renders (not blank)', bootShot.length > 20000, `${bootShot.length} bytes`);
  await shot('00-title');

  // ---------- Slice 1: world + movement ----------
  await menuClick('btn-new');
  await sleep(1200);
  s = await state();
  check('1.1 new game starts the M1 intro cutscene', s.state === 'cutscene' && s.mission === 1, `state=${s.state} mission=${s.mission}`);
  check('1.2 letterbox on during cutscene', await page.evaluate(() => document.getElementById('letterbox-top').classList.contains('on')));
  await page.keyboard.press('Enter');
  await sleep(800);
  s = await state();
  check('1.3 enter skips cutscene to playing', s.state === 'playing', `state=${s.state}`);
  check('1.4 player starts in front of El Faro', Math.abs(s.px - -536) < 8 && Math.abs(s.pz - 104) < 8, `x=${s.px} z=${s.pz}`);
  check('1.5 mission 1 step 0: drive to the VIP lot', s.step === 0 && s.stepText.includes('VIP lot'), `step=${s.step} "${s.stepText}"`);
  // walk forward (north, toward the bar, 14m of open ground)
  const before = { x: s.px, z: s.pz };
  await holdKey('KeyW', 1.5);
  s = await state();
  const moved = Math.hypot(s.px - before.x, s.pz - before.z);
  check('1.6 walking moves the player', moved > 4, `moved ${moved.toFixed(1)}m`);
  check('1.7 no NaN after walking', s.nan === false);
  check('1.8 traffic and pedestrians populated', s.traffic >= 18 && s.peds >= 28, `cars=${s.traffic} peds=${s.peds}`);
  // enter a car (spawned south of the player, facing south, open road ahead)
  await dbg(`window.__solmar.spawnCar('solmarGT', ${s.px}, ${s.pz + 3}, 0)`);
  await sleep(300);
  await page.keyboard.press('KeyE');
  await sleep(500);
  s = await state();
  check('1.9 pressing E enters the nearest car', s.inVehicle === 'Solmar GT', `inVehicle=${s.inVehicle}`);
  // drive south (open ground, road at z=120)
  const carBefore = { x: s.px, z: s.pz };
  await holdKey('KeyW', 3);
  s = await state();
  const drove = Math.hypot(s.px - carBefore.x, s.pz - carBefore.z);
  check('1.10 driving moves the car', drove > 15, `drove ${drove.toFixed(1)}m`);
  await page.keyboard.press('KeyE');
  await sleep(400);
  s = await state();
  check('1.12 pressing E exits the car', s.inVehicle === null, `inVehicle=${s.inVehicle}`);
  // minimap draws
  const mm = await page.evaluate(() => {
    const c = document.getElementById('minimap');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, 220, 220).data;
    let nonZero = 0;
    for (let i = 0; i < d.length; i += 400) if (d[i] !== 0 || d[i + 1] !== 0 || d[i + 2] !== 0) nonZero++;
    return nonZero;
  });
  check('1.13 minimap draws the world', mm > 50, `${mm} sampled pixels lit`);
  await shot('01-freeroam');

  // ---------- Slice 2: combat ----------
  await dbg(`window.__solmar.giveWeapons()`);
  await dbg(`window.__solmar.spawnEnemy(${s.px + 8}, ${s.pz - 2}, 60, 'guard')`);
  await sleep(400);
  let en = await dbg(`window.__solmar.enemies()`);
  check('2.1 guard spawns in front of the player', en.length >= 1, `${en.length} enemies`);
  await page.keyboard.press('Digit4');
  await sleep(300);
  s = await state();
  check('2.2 switching to Bulldog works', s.weapon === 'Bulldog Carbine', `weapon=${s.weapon}`);
  const guard = en[0];
  await dbg(`window.__solmar.aimAt(${guard.x}, ${guard.z})`);
  await sleep(200);
  const hpBefore = (await dbg(`window.__solmar.enemies()`))[0].hp;
  await holdMouse(1.0);
  en = await dbg(`window.__solmar.enemies()`);
  const hpAfter = en.length > 0 ? en[0].hp : 0;
  check('2.3 firing hits the guard', hpAfter < hpBefore, `hp ${hpBefore} -> ${hpAfter}`);
  s = await state();
  check('2.4 ammo decreases when firing', s.clip < 30, `clip=${s.clip}`);
  // reload
  await page.keyboard.press('KeyR');
  await sleep(300);
  s = await state();
  check('2.5 reload starts', s.reloading === true, `reloading=${s.reloading}`);
  await waitGame(1.6);
  s = await state();
  check('2.6 reload refills the clip', s.clip === 30 && s.reloading === false, `clip=${s.clip}`);
  // barrel explosion
  await dbg(`window.__solmar.spawnBarrel(${s.px + 6}, ${s.pz})`);
  await dbg(`window.__solmar.spawnEnemy(${s.px + 6}, ${s.pz + 1}, 60, 'guard')`);
  await sleep(300);
  const guard2 = (await dbg(`window.__solmar.enemies()`)).find((e) => e.state !== 'dead');
  if (guard2) {
    await dbg(`window.__solmar.aimAt(${s.px + 6}, ${s.pz})`);
    await sleep(200);
    await holdMouse(0.6);
    en = await dbg(`window.__solmar.enemies()`);
    const dead = en.filter((e) => e.state === 'dead').length;
    check('2.7 explosive barrel kills nearby enemies', dead >= 1, `${dead} dead`);
  } else {
    check('2.7 explosive barrel kills nearby enemies', false, 'no guard to test');
  }
  await shot('02-combat');

  // ---------- Slice 3: wanted + police ----------
  await dbg(`window.__solmar.setWanted(2)`);
  await sleep(500);
  s = await state();
  check('3.1 wanted level 2 shows 2 stars', s.stars === 2, `stars=${s.stars}`);
  await waitGame(3);
  s = await state();
  check('3.2 police units spawn at 2 stars', s.police >= 1, `${s.police} units`);
  const heatBefore = s.heat;
  await dbg(`window.__solmar.setWanted(1)`);
  await waitGame(10);
  s = await state();
  check('3.3 heat decays when unseen', s.heat < heatBefore || s.stars === 0, `heat ${heatBefore} -> ${s.heat}`);
  s = await state();
  const cashBefore = s.cash;
  await dbg(`window.__solmar.damagePlayer(200)`);
  await sleep(600);
  s = await state();
  check('3.4 lethal damage shows WASTED', s.state === 'wasted', `state=${s.state}`);
  check('3.5 wasted costs $100', s.cash === Math.max(0, cashBefore - 100), `cash ${cashBefore} -> ${s.cash}`);
  await waitGame(3);
  s = await state();
  check('3.6 respawn returns to playing with full health', s.state === 'playing' && s.health === 100, `state=${s.state} health=${s.health}`);
  check('3.7 death restarts the current mission at step 0', s.step === 0, `step=${s.step}`);
  await shot('03-wasted');

  // ---------- Slice 4: missions end to end ----------
  // restart clean. The pause menu shows via a DOM class, so poll the
  // class directly: Playwright's :visible hit-test flakes at the very
  // low headless FPS (it timed out once while the button was visible).
  // Retry the Escape press in case a keypress lands between frames.
  let pauseVisible = false;
  for (let attempt = 0; attempt < 3 && !pauseVisible; attempt++) {
    await page.keyboard.press('Escape');
    for (let i = 0; i < 50; i++) {
      await sleep(300);
      pauseVisible = await page.evaluate(() => !document.getElementById('pause-menu').classList.contains('hidden'));
      if (pauseVisible) break;
    }
  }
  if (!pauseVisible) throw new Error('pause menu did not open after 3 Escape attempts');
  await menuClick('btn-quit');
  await sleep(600);
  await menuClick('btn-new');
  await sleep(900);
  await page.keyboard.press('Enter');
  await sleep(600);
  s = await state();
  check('4.0 fresh new game after quit', s.state === 'playing' && s.mission === 1 && s.step === 0, `state=${s.state} mission=${s.mission} step=${s.step}`);

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

  // M1: goto VIP lot
  await dbg(`window.__solmar.teleport(640, -180)`);
  s = await waitStep(1, 1);
  check('4.1 M1 goto VIP lot completes', s.mission === 1 && s.step === 1, `mission=${s.mission} step=${s.step} "${s.stepText}"`);
  // M1: kill 3 guards
  s = await state();
  check('4.2 M1 kill step spawns 3 guards', s.enemies === 3, `${s.enemies} enemies`);
  await doStep();
  s = await waitStep(1, 2);
  check('4.3 M1 kill step completes', s.mission === 1 && s.step === 2, `step=${s.step}`);
  // M1: steal GT
  await doStep();
  s = await waitStep(1, 3);
  check('4.4 M1 steal completes, player in the GT', s.mission === 1 && s.step === 3 && s.inVehicle === 'Solmar GT', `step=${s.step} inVehicle=${s.inVehicle}`);
  check('4.5 steal triggers the 2-star pursuit', s.stars >= 2, `stars=${s.stars}`);
  // M1: deliver (clear wanted first so the GT survives the trip)
  await dbg(`window.__solmar.setWanted(0)`);
  await dbg(`window.__solmar.teleport(-460, -140)`);
  s = await waitStep(2, 0, 120000);
  check('4.6 M1 deliver completes, M2 starts', s.mission === 2, `mission=${s.mission} step=${s.step}`);
  check('4.7 M1 reward paid ($1,500)', s.cash >= 1500, `cash=$${s.cash}`);
  await shot('04-m2-start');

  // M2: goto port gate
  await dbg(`window.__solmar.teleport(-60, 480)`);
  s = await waitStep(2, 1);
  check('4.9 M2 goto port gate completes', s.mission === 2 && s.step === 1, `step=${s.step}`);
  // M2: kill 8 syndicate
  s = await state();
  check('4.10 M2 kill step spawns 8 syndicate', s.enemies === 8, `${s.enemies} enemies`);
  await doStep();
  s = await waitStep(2, 2);
  check('4.11 M2 kill step completes', s.mission === 2 && s.step === 2, `step=${s.step}`);
  // M2: interact ledger
  await doStep();
  s = await waitStep(2, 3);
  check('4.12 M2 ledger interact completes', s.mission === 2 && s.step === 3, `step=${s.step}`);
  // M2: steal Cargo Mule
  await doStep();
  s = await waitStep(2, 4);
  check('4.13 M2 steal completes, player in the Mule', s.mission === 2 && s.step === 4 && s.inVehicle === 'Cargo Mule', `step=${s.step} inVehicle=${s.inVehicle}`);
  // M2: deliver to motel
  await dbg(`window.__solmar.teleport(520, 140)`);
  s = await waitStep(3, 0, 120000);
  check('4.14 M2 deliver completes, M3 starts', s.mission === 3, `mission=${s.mission} step=${s.step}`);
  check('4.15 M2 reward paid (cash >= $5,000)', s.cash >= 5000, `cash=$${s.cash}`);
  await shot('05-m3-start');

  // M3: convoy - disable both escorts via the debug hook
  s = await state();
  check('4.16 M3 convoy step active', s.mission === 3 && s.step === 0, `mission=${s.mission} step=${s.step}`);
  await doStep();
  s = await waitStep(3, 1, 120000);
  check('4.17 convoy stops when both escorts are disabled', s.mission === 3 && s.step === 1, `step=${s.step} "${s.stepText}"`);
  // M3: rescue Mateo at the stopped van
  await doStep();
  s = await waitStep(3, 2, 120000);
  check('4.18 rescue interact completes at the stopped van', s.mission === 3 && s.step === 2, `step=${s.step}`);
  // M3: respray at Voss Customs (in a car). The rescue leaves the player
  // on foot at the van's stop point, which moves from run to run, so
  // spawn the car next to the player instead of at a fixed spot.
  s = await state();
  await dbg(`window.__solmar.spawnCar('solmarGT', ${s.px}, ${s.pz + 3}, 0)`);
  await sleep(300);
  await page.keyboard.press('KeyE');
  await sleep(400);
  s = await state();
  if (!s.inVehicle) {
    // retry beside the player in case the first spawn overlapped the van
    await dbg(`window.__solmar.spawnCar('solmarGT', ${s.px + 4}, ${s.pz}, 0)`);
    await sleep(300);
    await page.keyboard.press('KeyE');
    await sleep(400);
  }
  await dbg(`window.__solmar.teleport(-460, -140)`);
  s = await waitStep(4, 0, 120000);
  check('4.19 M3 respray completes, M4 starts', s.mission === 4, `mission=${s.mission} step=${s.step}`);
  check('4.20 M3 reward paid (cash >= $12,500)', s.cash >= 12500, `cash=$${s.cash}`);
  await shot('06-m4-start');

  // M4: cross the bridge
  await dbg(`window.__solmar.teleport(0, -510)`);
  s = await waitStep(4, 1);
  check('4.21 M4 bridge crossing completes', s.mission === 4 && s.step === 1, `step=${s.step}`);
  // M4: kill 12 elites
  s = await state();
  check('4.22 M4 breach spawns 12 elites', s.enemies === 12, `${s.enemies} enemies`);
  await doStep();
  s = await waitStep(4, 2);
  check('4.23 M4 breach completes', s.mission === 4 && s.step === 2, `step=${s.step}`);
  // M4: underboss
  s = await state();
  check('4.24 underboss spawns (250 hp)', s.enemies === 1, `${s.enemies} enemies`);
  await doStep();
  s = await waitStep(4, 3);
  check('4.25 underboss defeated', s.mission === 4 && s.step === 3, `step=${s.step}`);
  // M4: vault hold
  await doStep();
  s = await waitStep(4, 4, 120000);
  check('4.26 vault crack completes, escape step active', s.mission === 4 && s.step === 4, `step=${s.step}`);
  check('4.27 vault triggers 4-star escape', s.stars >= 4, `stars=${s.stars}`);
  // M4: escape to the marina
  await dbg(`window.__solmar.teleport(780, 260)`);
  s = await waitStep(4, 4, 120000);
  // the ending cutscene starts; wait for it
  await waitGame(2);
  s = await state();
  const storyDone = s.storyComplete === true || s.state === 'cutscene' || s.state === 'ending';
  check('4.28 story completes at the marina', storyDone, `storyComplete=${s.storyComplete} state=${s.state}`);
  await shot('07-ending');

  // ---------- Slice 5: shops, save/load, pause ----------
  await page.keyboard.press('Enter');
  await sleep(1000);
  await page.keyboard.press('Escape');
  await sleep(500);
  s = await state();
  check('5.1 pause menu opens', s.state === 'paused', `state=${s.state}`);
  await menuClick('btn-resume');
  await sleep(500);
  s = await state();
  check('5.2 resume returns to playing', s.state === 'playing', `state=${s.state}`);
  // armory shop: the player arrives in the getaway car, so exit it
  // first (E exits the vehicle while driving) and then press E again
  // to open the shop.
  await dbg(`window.__solmar.teleport(-120, 80)`);
  await sleep(600);
  s = await state();
  if (s.inVehicle) {
    await page.keyboard.press('KeyE');
    await sleep(500);
  }
  await page.keyboard.press('KeyE');
  await sleep(500);
  check('5.3 armory shop opens near the armory', await page.evaluate(() => !document.getElementById('shop-panel').classList.contains('hidden')));
  await menuClick('shop-close');
  await sleep(300);
  // save / load
  await page.keyboard.press('Escape');
  await sleep(400);
  await menuClick('btn-save');
  await sleep(400);
  const saved = await page.evaluate(() => localStorage.getItem('solmar-save-v1'));
  check('5.4 save writes to localStorage', !!saved && JSON.parse(saved).story === true, saved ? saved.slice(0, 80) : 'none');
  await menuClick('btn-quit');
  await sleep(600);
  await menuClick('btn-continue');
  await sleep(900);
  s = await state();
  check('5.5 continue loads the save (free roam, story complete)', s.state === 'playing' && s.storyComplete === true, `state=${s.state} story=${s.storyComplete}`);
  check('5.6 no console errors across the whole run', errors.length === 0, errors.slice(0, 5).join(' | '));
  check('5.7 no failed requests across the whole run', failedRequests.length === 0, failedRequests.slice(0, 5).join(' | '));
  await shot('08-freeroam');

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nPLAYTEST: ${passed}/${results.length} passed`);
  if (passed !== results.length) {
    console.log('FAILED CHECKS:');
    for (const r of results.filter((r) => !r.ok)) console.log(` - ${r.name} ${r.detail}`);
  }
  process.exitCode = passed === results.length ? 0 : 1;
} catch (e) {
  console.error('PLAYTEST CRASH:', e);
  process.exitCode = 2;
} finally {
  await browser.close();
  if (server) server.kill();
}
