import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 500)));
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 800)));
page.on('requestfailed', (r) => console.log('REQFAIL', r.url()));
await page.goto('http://127.0.0.1:8734/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 3000));
console.log('solmar?', await page.evaluate(() => typeof window.__solmar));
console.log('loading hidden?', await page.evaluate(() => document.getElementById('loading').classList.contains('hidden')));
await browser.close();
