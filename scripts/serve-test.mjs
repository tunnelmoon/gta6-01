// Static file server for the scratch test build (never the repo).
// Serves /home/hatch/workspace/makefun-gta6-01/test-build/game on 127.0.0.1:8734.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/hatch/workspace/makefun-gta6-01/test-build/game';
const PORT = 8734;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`test server at http://127.0.0.1:${PORT}/`);
});
