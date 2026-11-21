// Offline audit: our shipped sources must make zero network requests.
// Checks game/src/*.js, game/index.html, main.ts, shots.json and the
// repo scripts for http://, https://, fetch(, XMLHttpRequest and WebSocket.
// The vendored three.module.min.js is third-party and excluded by design.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'game';
const root = path.resolve(dir);
const patterns = [/https?:\/\//g, /\bfetch\s*\(/g, /XMLHttpRequest/g, /WebSocket/g, /import\s*\(/g];
let bad = 0;

function walk(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor' || entry.name === 'node_modules') continue;
      walk(p);
      continue;
    }
    if (!/\.(js|html|json|ts)$/.test(entry.name)) continue;
    if (entry.name === 'offline-audit.mjs') continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const re of patterns) {
      const hits = text.match(re);
      if (hits) {
        console.log(`FAIL ${path.relative(root, p)}: ${re} x${hits.length}`);
        bad += hits.length;
      }
    }
  }
}

walk(root);
if (bad === 0) {
  console.log(`offline audit OK: no network references under ${root}`);
  process.exit(0);
} else {
  console.log(`offline audit FAILED: ${bad} network reference(s)`);
  process.exit(1);
}
