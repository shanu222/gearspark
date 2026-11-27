# GearSpark ⚙️⚡

**Wire it. Gear it. Power it.** GearSpark is an electromechanical puzzle game with real physics. Players wire circuits, mesh gears, drive motors and spin generators. Every volt, amp and rpm is calculated, not scripted.

A product of Resilience Technologies Labs.

## Features
- **18 levels in 4 worlds:** Home Wiring (circuits), Gear Workshop (mechanics), Motor Factory (electric → motion), Power Station (motion → electric)
- **Sandbox** with all 19 parts, unlimited
- **Live multimeter** on every part: voltage, current, power, rpm, direction
- **Physics feedback:** short circuits, gear jams, burnt-out bulbs and perpetual-motion attempts are detected and explained
- **Learning:** an engineering concept per level, hints, and a "What you learned" card on every win
- **Stars by parts used vs par**, sequential unlocks, progress saved in the browser
- **Input:** mouse, touch (drag or tap-to-place) and keyboard (`R`, `Del`, `Ctrl+Z`, `Esc`, `Space`)
- **Audio:** synthesized sound effects with a mute toggle (remembered)
- **No images, fonts or third-party scripts:** all art is drawn in code

## Architecture
Fully client-side static site. **No backend, database or file storage is required**, and none is included (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#why-no-backend-database-or-storage)).

```
index.html            page shell
css/style.css         styles (responsive: phone, tablet, desktop)
js/boot.js            runtime error screen
js/engine.js          physics engine: circuit solver, gear solver, coupling (no DOM; also runs in Node)
js/levels.js          level data + verified solutions + "trap" wrong answers
js/render.js          procedural canvas art
js/audio.js           Web Audio sound effects
js/game.js            UI, input, progress (localStorage)
public/               favicon.svg, og.png (copied to dist/)
build.mjs             zero-dependency production build
vercel.json           Vercel build + security/caching headers
test/verify-levels.mjs  level + physics verification (Node)
test/e2e.py             46-check browser test suite (Playwright)
test/serve.mjs          local production server that applies vercel.json headers
```

## Commands
| Command | What it does |
|---|---|
| `npm run build` | Builds `dist/` (Vercel) and `build/standalone/gearspark.html` (single file) |
| `npm test` | Verifies every level and core physics rules |
| `npm run preview` | Builds and serves `dist/` at http://localhost:4173 with production headers |
| `npm run test:e2e` | Full browser test suite (needs `pip install playwright` and Chrome; set `CHROME_PATH` if not at `/usr/bin/google-chrome`) |

No `npm install` is needed: there are no dependencies.

## Deploy
See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. In short: import the repo in Vercel; it reads `vercel.json` (build `npm run build`, output `dist`). Optional env var: `SITE_URL`.

## Physics model
- **Circuits:** modified nodal analysis (Kirchhoff + Ohm), Gaussian elimination. Battery 6 V / 0.5 Ω; bulb 12 Ω (bright ≥ 4 V, burns out > 9 V); resistor 12 Ω; diode 0.7 V; short circuit > 3 A.
- **Gears:** meshing reverses direction; speed ratio = teeth ratio; idlers change direction only; compound gear 16 + 8 teeth; crossed belt reverses; conflicting drivers jam.
- **Motor:** 6 Ω, 10 rpm/V, 1.5 V start. **Dynamo:** 0.1 V/rpm, 1 Ω, polarity follows rotation.
- **Energy conservation:** generator → motor → same generator loops are found (strongly connected components) and refused.
- **Stated simplifications:** motors are modelled at no-load (speed ∝ voltage); grid gears mesh with orthogonal neighbours.

Test results: [docs/TESTING-REPORT.md](docs/TESTING-REPORT.md).
