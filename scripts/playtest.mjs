// End-to-end playtest for Solmar Sunset: 34 checks driving the real game
// in headless Chromium (small viewport + lowfx for speed). Mixes real input
// (keys, mouse) with the debug API for movement between objectives, and
// uses the game's real damage/step functions for the rest.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const GAME_URL = 'http://127.0.0.1:8934/?seed=7&lowfx=1';

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log('PASS ' + name + (detail ? ' - ' + detail : ''));
  } else {
    failed++;
    failures.push(name);
    console.log('FAIL ' + name + (detail ? ' - ' + detail : ''));
  }
}

const server = spawn('node', ['serve.ts', '--port', '8934'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r) => setTimeout(r, 1200));

try {
  const browser = await chromium.launch({
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('requestfailed', (req) => consoleErrors.push('reqfail ' + req.url()));
  page.on('response', (res) => {
    if (res.status() >= 400) consoleErrors.push('http ' + res.status() + ' ' + res.url());
  });

  const ev = (fn, ...args) => page.evaluate(fn, ...args);
  const gameTime = () => ev(() => window.__solmar.game.time);
  async function waitGame(sec, timeoutMs = 180000) {
    const t0 = await gameTime();
    await page.waitForFunction((target) => window.__solmar.game.time >= target, t0 + sec, { timeout: timeoutMs });
  }
  async function waitFor(fn, timeoutMs = 120000) {
    await page.waitForFunction(fn, undefined, { timeout: timeoutMs });
  }

  await page.goto(GAME_URL, { waitUntil: 'load' });
  await waitFor(() => !!window.__solmar);
  await waitGame(1);

  // 1-3: boot, title, new game.
  check('1. game boots, no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  check('2. title state', (await ev(() => window.__solmar.state())) === 'title');
  await page.click('#btn-newgame');
  await waitGame(0.5);
  check('3. new game starts playing', (await ev(() => window.__solmar.state())) === 'playing');
  check('4. HUD health bar width is 100%', await ev(() => document.getElementById('health-fill').style.width) === '100%');
  check('5. speed readout blank on foot', await ev(() => document.getElementById('speed-val').textContent) === '');

  // 6-8: walk, sprint, drive.
  const p0 = await ev(() => window.__solmar.playerPos());
  await page.keyboard.down('w');
  await waitGame(2);
  await page.keyboard.up('w');
  const p1 = await ev(() => window.__solmar.playerPos());
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('6. walking with W moves Mara', moved > 4, moved.toFixed(1) + 'm');
  const s0 = await ev(() => window.__solmar.game.player.speed);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await waitGame(1.5);
  const s1 = await ev(() => window.__solmar.game.player.speed);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  check('7. sprint is faster than walk', s1 > 7, 'sprint ' + s1.toFixed(1) + ' m/s');
  await ev(() => window.__solmar.teleport(-520, 84));
  await waitGame(0.3);
  const entered = await ev(() => window.__solmar.enterNearestVehicle());
  check('8. enter nearest parked car', entered !== null, String(entered));
  await ev(() => {
    const g = window.__solmar.game;
    if (g.playerVehicle) {
      g.playerVehicle.pos.set(0, 0, 80);
      g.playerVehicle.heading = Math.PI / 2;
      g.rig.yaw = Math.PI / 2;
    }
  });
  await waitGame(0.5);
  await page.keyboard.down('w');
  await waitGame(2);
  await page.keyboard.up('w');
  const carSpeed = await ev(() => Math.abs(window.__solmar.game.playerVehicle?.speed ?? 0));
  check('9. driving accelerates the car', carSpeed > 5, carSpeed.toFixed(1) + ' m/s');
  check('10. speed readout live in a car', await ev(() => document.getElementById('speed-val').textContent) !== '');
  await page.keyboard.press('e');
  await waitGame(0.5);
  check('11. exit vehicle with E', await ev(() => window.__solmar.game.player.state) === 'foot');
  check('12. no NaN in player position', await ev(() => {
    const p = window.__solmar.playerPos();
    return Number.isFinite(p.x) && Number.isFinite(p.z);
  }));

  // 13-16: mission 1 flow.
  await ev(() => window.__solmar.teleport(-540, 105));
  await waitGame(0.5);
  await page.keyboard.press('e');
  await waitGame(0.5);
  check('13. mission 1 starts with cutscene', await ev(() => window.__solmar.state()) === 'cutscene');
  await page.keyboard.press('Enter');
  await waitGame(0.5);
  check('14. cutscene skips to playing', await ev(() => window.__solmar.state()) === 'playing');
  check('15. mission 1 step 0 is goto VIP lot', await ev(() => window.__solmar.mission().step) === 'goto');
  await ev(() => window.__solmar.teleport(636, -172));
  await waitGame(1);
  check('16. reaching VIP lot advances to kill step', await ev(() => window.__solmar.mission().step) === 'kill');
  const guardCount = await ev(() => window.__solmar.game.combat.enemies.filter((e) => e.alive).length);
  check('17. 3 guards spawned', guardCount === 3, String(guardCount));

  // 18: real shooting kills a guard.
  const guardPos = await ev(() => {
    const g = window.__solmar.game;
    const e = g.combat.enemies.find((x) => x.alive);
    return { x: e.pos.x, z: e.pos.z };
  });
  await ev((gp) => {
    const g = window.__solmar.game;
    g.rig.yaw = Math.atan2(gp.x - g.player.pos.x, gp.z - g.player.pos.z);
    g.debugAim = true;
  }, guardPos);
  await waitGame(0.5);
  await page.mouse.move(320, 180);
  await page.mouse.down();
  for (let i = 0; i < 7; i++) {
    // Re-aim at the nearest living guard each second, like a player would.
    await ev(() => {
      const g = window.__solmar.game;
      const alive = g.combat.enemies.filter((e) => e.alive);
      if (alive.length === 0) return;
      let best = alive[0];
      let bestD = Infinity;
      for (const e of alive) {
        const d = Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      g.rig.yaw = Math.atan2(best.pos.x - g.player.pos.x, best.pos.z - g.player.pos.z);
    });
    await waitGame(1);
  }
  await page.mouse.up();
  await ev(() => {
    window.__solmar.game.debugAim = false;
  });
  const guardsLeft = await ev(() => window.__solmar.game.combat.enemies.filter((e) => e.alive).length);
  check('18. real shooting kills a guard', guardsLeft < 3, guardsLeft + ' left');

  // 19-21: finish the kill step via the real damage path, steal, deliver.
  await ev(() => {
    const g = window.__solmar.game;
    for (const e of [...g.combat.enemies]) if (e.alive) g.combat.damageEnemy(e, 999, g.player.pos);
  });
  await waitGame(0.5);
  check('19. kill step completes to steal', await ev(() => window.__solmar.mission().step) === 'steal');
  await ev(() => window.__solmar.teleport(645, -182));
  await waitGame(0.5);
  const stole = await ev(() => window.__solmar.enterNearestVehicle());
  await waitGame(0.5);
  check('20. steal the Solmar GT, wanted goes 2 stars', stole === 'solmarGT' && (await ev(() => window.__solmar.wanted())) === 2, String(stole) + ' stars=' + (await ev(() => window.__solmar.wanted())));
  await waitGame(1.5);
  check('21. police cruisers spawn on 2 stars', await ev(() => window.__solmar.game.police.units.length) >= 1, String(await ev(() => window.__solmar.game.police.units.length)));
  await ev(() => {
    const g = window.__solmar.game;
    if (g.playerVehicle) g.playerVehicle.pos.set(-460, 0, -126);
  });
  await waitGame(1);
  check('22. deliver completes mission 1, +$1500', await ev(() => {
    const g = window.__solmar.game;
    return g.missions.current === 0 && !g.missions.active && g.player.cash >= 1750;
  }), 'cash=' + (await ev(() => window.__solmar.playerPos().cash)));
  check('23. kestrel unlocked after mission 1', await ev(() => window.__solmar.game.combat.unlocked.has('kestrel')));
  check('24. Voss Customs unlocked after mission 1', await ev(() => window.__solmar.game.missions.customsUnlocked));
  await waitGame(6); // let the outro cutscene finish
  check('25. back to playing after outro', await ev(() => window.__solmar.state()) === 'playing');

  // 26-28: mission 2 flow (abbreviated: real movement, real damage path).
  await ev(() => window.__solmar.teleport(-460, -118));
  await waitGame(0.5);
  await page.keyboard.press('e');
  await waitGame(0.5);
  await page.keyboard.press('Enter');
  await waitGame(0.5);
  check('26. mission 2 starts', await ev(() => window.__solmar.mission().current) === 1);
  await ev(() => window.__solmar.teleport(-60, 470));
  await waitGame(1);
  check('27. mission 2 kill step has 8 gunmen', await ev(() => window.__solmar.game.combat.enemies.filter((e) => e.alive).length) === 8);
  await ev(() => {
    const g = window.__solmar.game;
    for (const e of [...g.combat.enemies]) if (e.alive) g.combat.damageEnemy(e, 999, g.player.pos);
  });
  await waitGame(0.5);
  check('28. kill step completes to grab', await ev(() => window.__solmar.mission().step) === 'grab');
  await ev(() => window.__solmar.teleport(240, 735));
  await waitGame(0.5);
  await page.keyboard.press('e');
  await waitGame(0.5);
  check('29. ledger grabbed, steal step next', await ev(() => window.__solmar.mission().step) === 'steal');
  await ev(() => window.__solmar.teleport(215, 752));
  await waitGame(0.5);
  await ev(() => window.__solmar.enterNearestVehicle());
  await waitGame(0.5);
  check('30. hijack the Cargo Mule', await ev(() => window.__solmar.game.playerVehicle?.def.id) === 'cargoMule');
  await ev(() => {
    const g = window.__solmar.game;
    if (g.playerVehicle) g.playerVehicle.pos.set(520, 0, 128);
  });
  await waitGame(1);
  check('31. deliver completes mission 2, viper unlocked', await ev(() => {
    const g = window.__solmar.game;
    return g.missions.current === 1 && g.combat.unlocked.has('viper') && g.missions.armoryUnlocked;
  }));
  await waitGame(7); // outro

  // 32: mission 3 convoy.
  await ev(() => window.__solmar.teleport(520, 160));
  await waitGame(0.5);
  await page.keyboard.press('e');
  await waitGame(0.5);
  await page.keyboard.press('Enter');
  await waitGame(0.5);
  check('32. mission 3 starts at night', await ev(() => window.__solmar.mission().current) === 2 && (await ev(() => window.__solmar.game.city.getTimeOfDay())) === 'night');
  await waitGame(2);
  await ev(() => {
    const g = window.__solmar.game;
    for (const v of g.vehicles) {
      if (v.def.id === 'v8Dorado' && Math.hypot(v.pos.x + 150, v.pos.z + 80) < 60) v.damage(120);
    }
  });
  await waitGame(1);
  check('33. disabling escorts stops the convoy', await ev(() => window.__solmar.mission().step) === 'rescue');
  await ev(() => {
    const g = window.__solmar.game;
    const van = g.vehicles.find((v) => v.def.id === 'cargoMule' && Math.hypot(v.pos.x + 150, v.pos.z + 80) < 80);
    if (van) g.player.teleport(van.pos.x + 3, van.pos.z + 3);
  });
  await waitGame(0.5);
  await page.keyboard.press('e');
  await waitGame(0.5);
  check('34. Mateo rescued, respray step next', await ev(() => window.__solmar.mission().step) === 'respray');

  // 35: complete the respray (enter the van, drive to Voss Customs unseen).
  await ev(() => window.__solmar.enterNearestVehicle());
  await waitGame(0.5);
  await ev(() => {
    const g = window.__solmar.game;
    if (g.playerVehicle) g.playerVehicle.pos.set(-460, 0, -126);
  });
  await waitGame(1);
  check('35. respray completes mission 3, bulldog + armor', await ev(() => {
    const g = window.__solmar.game;
    return g.missions.current === 2 && g.combat.unlocked.has('bulldog') && g.player.armor >= 100;
  }));
  await waitGame(7); // outro
  check('36. back to playing after mission 3 outro', await ev(() => window.__solmar.state()) === 'playing');

  // 37-42: mission 4 finale.
  await ev(() => window.__solmar.teleport(0, -405));
  await waitGame(0.5);
  await page.keyboard.press('e');
  await waitGame(0.5);
  await page.keyboard.press('Enter');
  await waitGame(0.5);
  check('37. mission 4 starts at sunset', await ev(() => window.__solmar.mission().current) === 3 && (await ev(() => window.__solmar.game.city.getTimeOfDay())) === 'sunset');
  await ev(() => window.__solmar.teleport(0, -505));
  await waitGame(1);
  check('38. crossing the bridge advances to the gate step', await ev(() => window.__solmar.mission().step) === 'gate');
  await ev(() => window.__solmar.teleport(120, -710));
  await waitGame(0.5);
  await page.keyboard.press('e');
  await waitGame(0.5);
  check('39. breaching the gate starts the kill step', await ev(() => window.__solmar.mission().step) === 'kill');
  const m4Count = await ev(() => window.__solmar.game.combat.enemies.filter((e) => e.alive).length);
  check('40. 12 guards plus the underboss spawn', m4Count === 13, String(m4Count));
  await ev(() => {
    const g = window.__solmar.game;
    for (const e of [...g.combat.enemies]) if (e.alive) g.combat.damageEnemy(e, 999, g.player.pos);
  });
  await waitGame(0.5);
  check('41. killing all 13 advances to the vault breach', await ev(() => window.__solmar.mission().step) === 'breach');
  await ev(() => window.__solmar.teleport(125, -798));
  await page.keyboard.down('e');
  await waitGame(4);
  await page.keyboard.up('e');
  check('42. vault breach advances to the escape', await ev(() => window.__solmar.mission().step) === 'escape');
  check('43. escape sets 4 stars and spawns the getaway GT', await ev(() => window.__solmar.wanted() === 4 && window.__solmar.game.vehicles.some((v) => v.def.id === 'solmarGT' && Math.hypot(v.pos.x - 95, v.pos.z + 750) < 5)));
  await ev(() => window.__solmar.teleport(95, -747));
  await waitGame(0.5);
  const getaway = await ev(() => window.__solmar.enterNearestVehicle());
  check('44. enter the getaway GT', getaway === 'solmarGT', String(getaway));
  await ev(() => {
    const g = window.__solmar.game;
    if (g.playerVehicle) g.playerVehicle.pos.set(780, 0, 260);
  });
  await waitGame(1);
  check('45. reaching the marina completes mission 4', await ev(() => window.__solmar.game.missions.current) === 3 && (await ev(() => window.__solmar.game.missions.storyComplete)) === true);
  await waitGame(13); // outro
  check('46. story complete menu shows, $50,000 paid', await ev(() => window.__solmar.state() === 'complete' && window.__solmar.playerPos().cash >= 62000), 'cash=' + (await ev(() => window.__solmar.playerPos().cash)));
  check('47. save records mission 4 done', await ev(() => {
    const s = JSON.parse(localStorage.getItem('solmar-sunset-save-v1') || 'null');
    return s !== null && s.missionIndex === 3;
  }));

  await browser.close();
} finally {
  server.kill();
}
console.log('PLAYTEST: ' + passed + ' passed, ' + failed + ' failed' + (failed ? ' (' + failures.join(', ') + ')' : ''));
if (failed > 0) process.exit(1);
console.log('PLAYTEST OK');
