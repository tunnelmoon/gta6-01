// Screenshot driver: serves game/ locally, loads each ?shot= scenario at
// 1280x720, waits for window.__shotReady, captures the frame twice and
// requires byte-identical output, then writes the screenshots.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const LOWFX = process.env.SHOT_LOWFX === '1';
const SHOTS = [
  { name: '1-start.jpg', query: '?shot=start&seed=1' + (LOWFX ? '&lowfx=1' : '') },
  { name: '2-play.jpg', query: '?shot=play&seed=1' + (LOWFX ? '&lowfx=1' : '') },
  { name: '3-combat.jpg', query: '?shot=combat&seed=1' + (LOWFX ? '&lowfx=1' : '') },
  { name: '4-end.jpg', query: '?shot=end&seed=1' + (LOWFX ? '&lowfx=1' : '') },
];

const server = spawn('node', ['serve.ts', '--port', '8931'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve) => setTimeout(resolve, 1500));

let failures = 0;
try {
  const browser = await chromium.launch({
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  for (const shot of SHOTS) {
    errors.length = 0;
    await page.goto('http://127.0.0.1:8931/' + shot.query, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__shotReady === true, undefined, { timeout: 180000 });
    } catch {
      console.log('FAIL ' + shot.name + ': __shotReady never set; errors: ' + errors.join(' | '));
      failures++;
      continue;
    }
    const buf1 = await page.screenshot({ type: 'jpeg', quality: 88 });
    const buf2 = await page.screenshot({ type: 'jpeg', quality: 88 });
    const h1 = createHash('sha256').update(buf1).digest('hex');
    const h2 = createHash('sha256').update(buf2).digest('hex');
    if (h1 !== h2) {
      console.log('FAIL ' + shot.name + ': two renders differ (not deterministic)');
      failures++;
      continue;
    }
    if (buf1.length > 262144) {
      console.log('FAIL ' + shot.name + ': ' + buf1.length + ' bytes exceeds 256 KiB');
      failures++;
      continue;
    }
    writeFileSync(ROOT + '/screenshots/' + shot.name, buf1);
    console.log('PASS ' + shot.name + ': ' + buf1.length + ' bytes, deterministic' + (errors.length ? ' (console errors: ' + errors.join(' | ') + ')' : ''));
    if (errors.length) failures++;
  }
  await browser.close();
} finally {
  server.kill();
}
if (failures > 0) {
  console.error('SHOTS FAILED: ' + failures + ' failure(s)');
  process.exit(1);
}
console.log('SHOTS OK');
