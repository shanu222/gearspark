# GearSpark: Deployment Guide

## Architecture decision

| Layer | Used? | Service |
|---|---|---|
| Frontend | **Yes** | **Vercel** (static site) |
| Backend | **No** | Railway is not needed |
| Database | **No** | Railway PostgreSQL is not needed |
| File storage | **No** | Cloudflare R2 is not needed |

### Why no backend, database or storage
I audited every feature against what it actually needs:

- **Physics, levels, scoring:** all computed in the browser (`js/engine.js`). No server logic.
- **Saving progress (stars, unlocks, mute):** stored per player in `localStorage` (`gearspark.v1`). There are no accounts, so there's nothing to sync between devices.
- **Assets:** all graphics and sounds are generated in code. No uploads, no user files, no media library.
- **No API keys or secrets** exist anywhere in the project.

Adding Railway, PostgreSQL or R2 now would add cost, latency and attack surface with no user-facing benefit. **When they would become necessary:** if you later add user accounts with cross-device progress, global leaderboards, or user-created level sharing, you'd add a Railway API + Railway PostgreSQL. Only player-uploaded media (e.g. thumbnails for shared levels) would justify Cloudflare R2.

---

## 1. Push the code to GitHub
The repository `shanu222/gearspark` was empty. From the folder containing this code:

```bash
git remote add origin https://github.com/shanu222/gearspark.git   # skip if already set
git push -u origin main
```

(If you received `gearspark.bundle`: `git clone gearspark.bundle gearspark && cd gearspark && git remote set-url origin https://github.com/shanu222/gearspark.git && git push -u origin main`.)

## 2. Deploy on Vercel
1. Go to vercel.com → **Add New… → Project** → import `shanu222/gearspark`.
2. Vercel reads `vercel.json` automatically. Confirm these settings:
   - **Framework Preset:** Other
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** leave default (there are no dependencies; it finishes instantly)
   - **Node.js version:** 18 or newer (default is fine)
3. (Optional, recommended) add the environment variable below.
4. Click **Deploy**.

### Vercel environment variables
| Variable | Required? | Environments | Value you provide | Purpose |
|---|---|---|---|---|
| `SITE_URL` | Optional | Production (and Preview if you like) | Your public URL, **no trailing slash**, e.g. `https://gearspark.vercel.app` or your custom domain | Adds canonical URL, Open Graph/Twitter image URLs (rich link previews on WhatsApp, LinkedIn, X) and `sitemap.xml` |

There are **no secret values**. Nothing in the frontend is sensitive. After changing `SITE_URL`, redeploy so the build picks it up.

### Railway environment variables
**None.** No Railway service is used.

### `.env.example`
Included at the repo root. It documents `SITE_URL` and records that Railway, PostgreSQL and R2 are not used.

## 3. Custom domain (optional)
Vercel → Project → **Settings → Domains** → add e.g. `gearspark.freearcadehub.com` and create the DNS record Vercel shows (CNAME to `cname.vercel-dns.com`). Then set `SITE_URL` to that domain and redeploy.

## 4. Add GearSpark to FreeArcadeHub
Choose one:
- **Link** your FreeArcadeHub card to the Vercel URL (simplest; GearSpark updates independently).
- **Embed** it in an iframe on a FreeArcadeHub page. `vercel.json` already allows framing only from `freearcadehub.com` and its subdomains (`frame-ancestors`):
  ```html
  <iframe src="https://YOUR-GEARSPARK-URL/" title="GearSpark" style="width:100%;height:100vh;border:0" allow="fullscreen"></iframe>
  ```
- **Self-host** the single file `build/standalone/gearspark.html` (produced by `npm run build`) inside the FreeArcadeHub repo, e.g. `public/games/gearspark/index.html`.

Card image: `public/og.png` (1200 × 630) works as a thumbnail.

## 5. What `vercel.json` configures
- Build command, output directory, clean URLs, no trailing slashes
- **Security headers:** strict Content-Security-Policy (`script-src 'self'`, no third-party origins, no `eval`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera, mic, location etc. disabled), HSTS, framing restricted to self + FreeArcadeHub
- **Caching:** `/assets/*` files are content-hashed and cached for 1 year (immutable). HTML always revalidates, so new deploys show up immediately.
- **404:** `dist/404.html` is served for unknown paths

## 6. Verify the live deployment
After Vercel finishes:
1. Open the URL: the menu shows 4 worlds; only 1-1 is unlocked.
2. Play 1-1 (drag four corner wires, tap to rotate): the bulb lights and the win card appears.
3. Reload: your stars are still there.
4. Visit `/anything`: the GearSpark 404 page appears.
5. Optional header check: `curl -sI https://YOUR-URL/ | grep -i content-security-policy`.
6. Open on a phone and play 1-1 by touch.

## 7. Local production preview
```bash
npm run preview      # http://localhost:4173, same headers/404 behaviour as vercel.json
```
