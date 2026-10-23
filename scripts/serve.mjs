// Petit serveur local : node scripts/serve.mjs [port] [préfixe]
// Le préfixe simule l'adresse GitHub Pages, ex. : node scripts/serve.mjs 8080 /on-time-web/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.argv[2] || 8080);
const prefix = process.argv[3] || '/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith(prefix)) { res.writeHead(302, { Location: prefix }); return res.end(); }
  url = url.slice(prefix.length) || 'index.html';
  let file = path.join(ROOT, url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': TYPES['.html'] }); return fs.createReadStream(path.join(ROOT, '404.html')).pipe(res); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`On time Web : http://localhost:${port}${prefix}`));
