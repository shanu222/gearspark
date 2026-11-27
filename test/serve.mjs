// Local production preview: serves dist/ with the same headers, cleanUrls and 404 handling as vercel.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const toRe = (src) => new RegExp('^' + src.replace('(.*)', '.*') + '$');
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  for (const h of cfg.headers) if (toRe(h.source).test(url)) for (const { key, value } of h.headers) res.setHeader(key, value);
  let file = path.normalize(path.join(dist, url));
  if (!file.startsWith(dist)) { res.writeHead(400); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  let status = 200;
  if (!fs.existsSync(file)) { file = path.join(dist, '404.html'); status = 404; }
  res.writeHead(status, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`GearSpark preview: http://localhost:${port}`));
