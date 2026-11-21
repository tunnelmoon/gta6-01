// Diagnostic probe: FPS, movement, and click registration.
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE ERROR', m.text().slice(0, 300));
});
await page.goto('http://127.0.0.1:8734/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2000));

// FPS over 4s on the title screen
const fps = await page.evaluate(() => new Promise((resolve) => {
  let n = 0;
  const t0 = performance.now();
  const tick = () => {
    n++;
    if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
    else resolve(n / 4);
  };
  requestAnimationFrame(tick);
}));
console.log('FPS (title):', fps.toFixed(1));

await page.click('#btn-new');
await new Promise((r) => setTimeout(r, 1000));
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 800));
const st = () => page.evaluate(() => window.__solmar.state());
let s = await st();
console.log('state:', s.state, 'pos:', s.px, s.pz, 'mission:', s.mission, 'step:', s.step);

// hold W for 3s, sample every 500ms
await page.keyboard.down('KeyW');
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 500));
  s = await st();
  console.log(`t=${(i + 1) * 0.5}s pos: ${s.px}, ${s.pz} time=${s.time}`);
}
await page.keyboard.up('KeyW');
// check whether the key is seen as held by the page
const keysHeld = await page.evaluate(() => {
  // the Input instance is not exposed; infer from movement only
  return 'n/a';
});
console.log('keysHeld:', keysHeld);
await browser.close();
