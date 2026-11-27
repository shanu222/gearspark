// GearSpark production build (no dependencies).
//   dist/                         → deploy to Vercel (hashed, cacheable assets)
//   build/standalone/gearspark.html → one self-contained file for embedding elsewhere
// Optional env: SITE_URL (e.g. https://gearspark.vercel.app) adds canonical/Open Graph URLs + sitemap.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const SITE_URL = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
if (SITE_URL && !/^https?:\/\/[^\s/]+/.test(SITE_URL)) { console.error(`SITE_URL is not a valid URL: ${SITE_URL}`); process.exit(1); }

const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
const jsFiles = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
for (const f of [...cssFiles, ...jsFiles]) if (!fs.existsSync(path.join(root, f))) { console.error(`Missing file referenced in index.html: ${f}`); process.exit(1); }

const css = cssFiles.map(read).join('\n');
const js = jsFiles.map((f) => `/* ${f} */\n${read(f)}`).join('\n;\n');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);

const meta = SITE_URL ? [
  `<link rel="canonical" href="${SITE_URL}/">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:url" content="${SITE_URL}/">`,
  `<meta property="og:image" content="${SITE_URL}/og.png">`,
  `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:image" content="${SITE_URL}/og.png">`
].join('\n  ') : '';

const stripTags = (h) => h.replace(/\s*<link rel="stylesheet" href="[^"]+">/g, '').replace(/\s*<script src="[^"]+"><\/script>/g, '');
const base = stripTags(html).replace('<!--SITE_META-->', meta);

// ---- dist (Vercel) ----
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
const cssName = `assets/gearspark.${hash(css)}.css`, jsName = `assets/gearspark.${hash(js)}.js`;
fs.writeFileSync(path.join(dist, cssName), css);
fs.writeFileSync(path.join(dist, jsName), js);
const page = base
  .replace('</head>', `  <link rel="stylesheet" href="/${cssName}">\n</head>`)
  .replace('</body>', `<script src="/${jsName}" defer></script>\n</body>`);
fs.writeFileSync(path.join(dist, 'index.html'), page);
for (const f of fs.readdirSync(path.join(root, 'public'))) fs.copyFileSync(path.join(root, 'public', f), path.join(dist, f));
fs.writeFileSync(path.join(dist, '404.html'), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found | GearSpark</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/${cssName}"></head><body><main class="notfound"><h1>404</h1><p>This page doesn’t exist. The machine is still running, though.</p><a class="btnlink" href="/">▶ Back to GearSpark</a></main></body></html>`);
fs.writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n${SITE_URL ? `Sitemap: ${SITE_URL}/sitemap.xml\n` : ''}`);
if (SITE_URL) fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}/</loc></url></urlset>\n`);

// ---- standalone single file ----
const sa = path.join(root, 'build', 'standalone');
fs.mkdirSync(sa, { recursive: true });
const standalone = base
  .replace('</head>', `  <style>\n${css}</style>\n</head>`)
  .replace('</body>', `<script>\n${js.replace(/<\/script/gi, '<\\/script')}</script>\n</body>`)
  .replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml">', `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(read('public/favicon.svg'))}">`);
fs.writeFileSync(path.join(sa, 'gearspark.html'), standalone);

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(1) + ' KB';
console.log(`dist/index.html      ${kb(path.join(dist, 'index.html'))}`);
console.log(`dist/${cssName}  ${kb(path.join(dist, cssName))}`);
console.log(`dist/${jsName}  ${kb(path.join(dist, jsName))}`);
console.log(`build/standalone/gearspark.html  ${kb(path.join(sa, 'gearspark.html'))}`);
console.log(SITE_URL ? `SITE_URL: ${SITE_URL} (canonical, Open Graph, sitemap written)` : 'SITE_URL not set: canonical/Open Graph URLs and sitemap skipped');
