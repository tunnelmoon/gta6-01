// Probe: measure rAF rate and __shotReady on the shot URL.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8734';
const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERROR:', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
await page.goto(`${BASE}/?shot=start&seed=1`, { waitUntil: 'load' });
console.log('loaded, __solmar?', await page.evaluate(() => !!window.__solmar));
await page.evaluate(() => {
  window.__rafCount = 0;
  const tick = () => { window.__rafCount++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  const s = await page.evaluate(() => ({
    raf: window.__rafCount,
    ready: !!window.__shotReady,
    solmar: !!window.__solmar,
    time: window.__solmar ? window.__solmar.time() : null,
  }));
  console.log(`t=${(i + 1) * 10}s raf=${s.raf} ready=${s.ready} solmar=${s.solmar} time=${s.time}`);
}
await browser.close();
