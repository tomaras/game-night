// Tiny static file server used by the tests. Serves a build directory under a URL base path (like GitHub Pages
// serves the dev site under /game-night-dev/) and lets the test swap which build is "deployed" while it runs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.nes': 'application/octet-stream' };

export function serve({ base = '/', root, port = 0 }) {
  const state = { root };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith(base)) { res.writeHead(404); res.end('not found'); return; }
    let rel = decodeURIComponent(u.pathname.slice(base.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(state.root, rel);
    if (!file.startsWith(state.root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({
    port: server.address().port,
    url: `http://127.0.0.1:${server.address().port}${base}`,
    setRoot: (r) => { state.root = r; },
    close: () => new Promise((r) => server.close(r)),
  })));
}

if (process.argv[1] && process.argv[1].endsWith('serve.mjs')) {
  const s = await serve({ base: process.argv[3] || '/', root: path.resolve(process.argv[2] || 'dist'), port: +process.argv[4] || 8081 });
  console.log('serving', s.url);
}
