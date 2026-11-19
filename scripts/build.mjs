// Build script for Solmar Sunset (gta6-01).
// Runs the TypeScript check, emits plain ES modules into game/src, makes sure
// the vendored Three.js build is in place, then audits the shipped game for
// offline safety: zero external URLs, zero em dashes, size limits respected.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const GAME = join(ROOT, 'game');
const SRC = join(GAME, 'src');

function run(cmd, label) {
  console.log('> ' + label);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

let failed = false;
function check(name, ok, detail = '') {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' - ' + detail : ''));
  if (!ok) failed = true;
}

run('npx tsc --noEmit', 'tsc --noEmit');
run('npx tsc', 'tsc emit to game/src');

const vendorThree = join(GAME, 'vendor', 'three.module.min.js');
if (!existsSync(vendorThree)) {
  copyFileSync(join(ROOT, 'node_modules', 'three', 'build', 'three.module.min.js'), vendorThree);
}
check('vendored three.js present', existsSync(vendorThree), 'game/vendor/three.module.min.js');

// Offline audit: no external URLs in any shipped source or in index.html.
const urlRe = /(https?:)?\/\/[a-zA-Z0-9]/;
const emDash = String.fromCharCode(0x2014);
const shipped = walk(GAME).filter((p) => !p.includes('/vendor/'));
const urlHits = [];
const dashHits = [];
for (const p of shipped) {
  const text = readFileSync(p, 'utf8');
  if (urlRe.test(text)) urlHits.push(p.replace(ROOT, ''));
  if (text.includes(emDash)) dashHits.push(p.replace(ROOT, ''));
}
check('no external URLs in game/ sources', urlHits.length === 0, urlHits.join(', ') || 'clean');
check('no em dashes in game/ sources', dashHits.length === 0, dashHits.join(', ') || 'clean');

// Size limits from the kit gate.
const files = walk(GAME);
const totalBytes = files.reduce((sum, p) => sum + statSync(p).size, 0);
const indexBytes = statSync(join(GAME, 'index.html')).size;
check('game/ file count <= 993', files.length <= 993, files.length + ' files');
check('game/ total size <= 48 MiB', totalBytes <= 48 * 1024 * 1024, (totalBytes / 1048576).toFixed(2) + ' MiB');
check('index.html <= 1 MiB', indexBytes <= 1024 * 1024, indexBytes + ' bytes');

if (failed) {
  console.error('BUILD FAILED: one or more checks failed.');
  process.exit(1);
}
console.log('BUILD OK');
