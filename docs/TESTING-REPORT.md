# GearSpark: Testing & Verification Report

Date: 27 Nov 2026 · Build: `npm run build` (Node 22) · Browser: Google Chrome (Playwright)

## Summary
| Suite | Result |
|---|---|
| Production build | ✅ builds with no errors or warnings (`dist/` + standalone file) |
| Level & physics verification (`npm test`) | ✅ 18/18 levels solvable, 17 "trap" wrong answers correctly fail, 3/3 physics rules |
| Browser end-to-end on the production build (`npm run test:e2e`) | ✅ 46/46 checks |
| Console / page errors | ✅ none |
| Content-Security-Policy violations | ✅ none |

The E2E suite runs against `dist/` served by `test/serve.mjs`, which applies the **same headers, clean URLs and 404 handling as `vercel.json`**.

## What was verified
**Deployment config:** 200 on `/`, CSP present, hashed assets cached immutably, 404 page with status 404 for unknown routes, favicon/robots/og image served.

**User journeys (desktop, real mouse input):** menu → help modal → first level → place by tap-to-arm and by drag → rotate by tap and `R` → undo with `Ctrl+Z` and the button → remove with `Del` → drag off the board returns the part to the tray → blocked/fixed squares refuse placement → hint → solve 1-1 → goals turn green → multimeter shows live 5.75 V → win modal ★★★ → Next level → switch toggle → sound toggle saved → reset → back to menu with stars and unlock.

**Every level through the real UI:** each of the 18 stored solutions is applied in the live app and must show the win modal with ★★★; the last level offers Sandbox; after reload, 54/54 stars persist and all levels stay unlocked.

**Sandbox:** all 19 parts unlimited; a short circuit built with real drags is detected and explained; two meshing cranks are detected as a gear jam.

**Mobile (390 × 844, touch) and tablet (820 × 1180, touch):** no horizontal overflow on menu or game; level 1-1 solved with touch taps only.

**Production safety:** the test hook (`GS.debug`) is absent unless `?debug` is in the URL.

## Raw output: level & physics verification
```
PASS 1-1 First Light              1,2: 5.75 V 0.48 A
PASS 1-2 Flip the Switch          1,2: 5.75 V 0.48 A
     trap "switch left open": correctly fails [0V]
PASS 1-3 Side by Side             1,1: 5.53 V 0.46 A | 1,2: 5.53 V 0.46 A
PASS 1-4 Stack the Cells          1,2: 5.76 V 0.48 A | 2,2: 5.76 V 0.48 A
     trap "second battery reversed": correctly fails [0V,0V]
     trap "wire instead of battery (6 V only)": correctly fails [2.94V,2.94V]
PASS 1-5 Resist the Surge         1,2: 5.76 V 0.48 A
     trap "no resistor → bulb burns out": correctly fails [11.07V BLOWN]
PASS 1-6 One-Way Street           1,1: 4.89 V 0.41 A | 1,2: 0 V 0 A
     trap "diode backwards": correctly fails [0V,0V]
PASS 2-1 Gear Chain               4,1: 30 rpm dir 1
PASS 2-2 Odd or Even?             3,1: 30 rpm dir 1
     trap "two gears → wrong direction": correctly fails [30rpm dir-1]
PASS 2-3 Gear Up                  3,1: 60 rpm dir -1
     trap "idlers only → still 30 rpm": correctly fails [30rpm dir-1]
PASS 2-4 Fragile Cargo            3,1: 15 rpm dir -1
     trap "plain gears → 30 rpm, too fast": correctly fails [30rpm dir-1]
     trap "compound backwards → 60 rpm": correctly fails [60rpm dir-1]
PASS 3-1 Motor Start              1,3: 55.28 rpm dir 1
PASS 3-2 Reverse Polarity         1,4: 55.28 rpm dir 1
     trap "battery normal way → conveyor backwards": correctly fails [55.28rpm dir-1]
PASS 3-3 Two Jobs, One Battery    1,1: 5.33 V 0.44 A | 1,3: 53.21 rpm dir 1
PASS 3-4 Speed Limit              1,3: 19.44 rpm dir 1
     trap "no resistor → too fast": correctly fails [55.25rpm dir1]
PASS 4-1 Hand-Cranked Light       3,1: 5.54 V 0.46 A
     trap "no speed-up → 3 V, too dim": correctly fails [2.77V]
PASS 4-2 Micro-Hydro              4,1: 7.38 V 0.62 A
     trap "one stage only → 40 rpm, too dim": correctly fails [3.69V]
PASS 4-3 Power Line               3,3: 51.34 rpm dir 1
     trap "motor wired the other way → backwards": correctly fails [51.34rpm dir-1]
     trap "no speed-up → motor too slow": correctly fails [25.67rpm dir1]
PASS 4-4 The Energy Chain         4,3: 5.1 V 0.42 A
     trap "compound ×2 → bulb burns out": correctly fails [10.2V BLOWN]
     trap "compound ÷2 → too dim": correctly fails [2.55V]
PASS physics: wire across battery = short circuit
PASS physics: motor driving its own dynamo is flagged as perpetual motion
PASS physics: two cranks meshing directly jam

ALL 18 LEVELS + PHYSICS CHECKS PASS
```

## Raw output: browser end-to-end
```
PASS GET / returns 200
PASS CSP header present
PASS hashed JS asset served with immutable cache
PASS unknown route returns 404 page
PASS /favicon.svg served
PASS /robots.txt served
PASS /og.png served
PASS menu renders 4 worlds and 18 level buttons
PASS only level 1-1 unlocked on first visit
PASS How-to-play modal opens from menu
PASS modal closes
PASS first level start shows help once
PASS level 1-1 title shown
PASS tap tray item then tap square places part
PASS tapping a placed part rotates it
PASS R key rotates selected part
PASS Ctrl+Z undoes rotation
PASS Delete removes selected part
PASS Undo button restores removed part
PASS dragging a part off the board returns it to tray
PASS cannot place on blocked square
PASS cannot place on fixed part
PASS hint shows toast
PASS goal turns green when bulb lights
PASS multimeter shows live bulb reading  [Bulb 6 V fixed  12 Ω lamp rated 6 V. Bright above 4 V, burns out above 9 V.  Voltage 5.75 ]
PASS win modal with 3 stars
PASS Next level button opens 1-2
PASS tapping a switch flips it
PASS sound toggle persists
PASS reset restores level start
PASS back to menu shows 1-1 with stars and 1-2 unlocked
PASS all 18 levels: verified solution wins with ★★★ in the real UI
PASS final level offers Sandbox
PASS progress persists after reload (54/54 stars, all unlocked)
PASS sandbox offers all 19 parts with unlimited counts
PASS short circuit detected and explained
PASS gear jam detected and explained
PASS mobile: no horizontal overflow on menu  [scrollWidth 390]
PASS mobile: level 1-1 solvable with touch
PASS mobile: no horizontal overflow in game  [scrollWidth 390]
PASS tablet: no horizontal overflow on menu  [scrollWidth 820]
PASS tablet: level 1-1 solvable with touch
PASS tablet: no horizontal overflow in game  [scrollWidth 820]
PASS debug hook not exposed in production URL
PASS no CSP violations
PASS no console or page errors
46/46 checks passed
```

## Not verified here (needs your accounts)
- **The live Vercel deployment itself.** I couldn't deploy from this environment. Run the checklist in `docs/DEPLOYMENT.md` §6 after your first deploy. The local server reproduces Vercel's headers and routing, so no differences are expected.
- **Safari / Firefox:** tested in Chrome only. The code uses standard APIs (Canvas 2D, Pointer Events, Web Audio, localStorage) supported by all current browsers.
- **Sound output:** sound effects are generated, but audio can't be heard in an automated test. The mute setting is verified.

## Known limitations (by design)
- Progress is per browser/device (no accounts). Clearing site data resets it.
- Motors are modelled at no-load; gears mesh with orthogonal grid neighbours only.
- 18 levels + sandbox. More levels can be added in `js/levels.js`; add a `solution` (and `traps`) so `npm test` proves each new level is solvable.
