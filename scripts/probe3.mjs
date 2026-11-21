// Probe the pause menu layout at 960x540: what covers #btn-quit?
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto('http://127.0.0.1:8734/?quality=low', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2000));
await page.click('#btn-new');
await new Promise((r) => setTimeout(r, 1000));
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 800));
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 800));
const info = await page.evaluate(() => {
  const q = document.getElementById('btn-quit');
  const r = q.getBoundingClientRect();
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  const panel = document.querySelector('#pause-menu .panel').getBoundingClientRect();
  const rows = [...document.querySelectorAll('#pause-menu .btn-row')].map((e) => {
    const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  return {
    quit: { x: r.x, y: r.y, w: r.width, h: r.height, cx, cy },
    topAtCenter: top ? `${top.tagName}.${top.className}#${top.id}` : 'none',
    panel: { x: panel.x, y: panel.y, w: panel.width, h: panel.height },
    rows,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
