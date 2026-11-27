"""GearSpark end-to-end tests against the production build (dist/) served with vercel.json headers.
Run: npm run test:e2e   (needs Python Playwright + Chrome/Chromium)
"""
import os, re, subprocess, sys, time, json, pathlib, urllib.request, urllib.error
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 4199
BASE = f'http://localhost:{PORT}'
SHOTS = pathlib.Path(os.environ.get('SHOTS', ROOT / 'test-results')); SHOTS.mkdir(exist_ok=True)
CHROME = os.environ.get('CHROME_PATH', '/usr/bin/google-chrome')
results = []

def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

server = subprocess.Popen(['node', str(ROOT / 'test' / 'serve.mjs')], env={**os.environ, 'PORT': str(PORT)}, stdout=subprocess.PIPE)
time.sleep(0.8)
try:
    # ---------- HTTP / deployment config ----------
    r = urllib.request.urlopen(BASE + '/')
    check('GET / returns 200', r.status == 200)
    check('CSP header present', 'script-src \'self\'' in (r.headers.get('Content-Security-Policy') or ''))
    html = r.read().decode()
    asset = re.search(r'src="(/assets/[^"]+\.js)"', html).group(1)
    ra = urllib.request.urlopen(BASE + asset)
    check('hashed JS asset served with immutable cache', 'immutable' in (ra.headers.get('Cache-Control') or ''))
    try:
        urllib.request.urlopen(BASE + '/no-such-page'); check('unknown route returns 404 page', False)
    except urllib.error.HTTPError as e:
        check('unknown route returns 404 page', e.code == 404 and 'Back to GearSpark' in e.read().decode())
    for f in ['/favicon.svg', '/robots.txt', '/og.png']:
        try: check(f'{f} served', urllib.request.urlopen(BASE + f).status == 200)
        except urllib.error.HTTPError as e: check(f'{f} served', False, str(e.code))

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        errors = []
        def new_page(vp, debug=True):
            pg = browser.new_page(viewport=vp)
            pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
            pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
            pg.goto(BASE + ('/?debug' if debug else '/'))
            return pg

        def tile_xy(pg, x, y):
            box = pg.locator('#board').bounding_box()
            L = pg.evaluate('GS.debug.app.layout')
            return box['x'] + L['ox'] + x * L['T'] + L['T'] / 2, box['y'] + L['oy'] + y * L['T'] + L['T'] / 2

        def drag_from_tray(pg, ptype, x, y):
            item = pg.locator(f'.inv-item[data-type="{ptype}"]')
            item.scroll_into_view_if_needed()
            b = item.bounding_box()
            sx, sy = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
            tx, ty = tile_xy(pg, x, y)
            pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(sx + 15, sy - 15, steps=3); pg.mouse.move(tx, ty, steps=8); pg.mouse.up()
            pg.wait_for_timeout(50)

        def tile(pg, x, y):
            return pg.evaluate(f'(()=>{{const a=GS.debug.app;const t=a.state.tiles[{y}*a.state.w+{x}];return t?{{type:t.type,rot:t.rot,on:!!t.on}}:null}})()')

        # ---------- desktop journey ----------
        pg = new_page({'width': 1366, 'height': 820})
        pg.wait_for_timeout(300)
        check('menu renders 4 worlds and 18 level buttons', pg.locator('.world').count() == 4 and pg.locator('.lv').count() == 18)
        check('only level 1-1 unlocked on first visit', pg.locator('.lv:not([disabled])').count() == 1)
        pg.screenshot(path=str(SHOTS / 'desktop-menu.png'))
        pg.click('#btn-help-menu'); check('How-to-play modal opens from menu', pg.locator('#modal-body .help').is_visible())
        pg.click('#modal-body button'); check('modal closes', pg.locator('#modal').is_hidden())
        pg.click('#btn-continue'); pg.wait_for_timeout(200)
        check('first level start shows help once', pg.locator('#modal-body .help').is_visible())
        pg.click('#modal-body button')
        check('level 1-1 title shown', '1-1' in pg.inner_text('#lv-title'))
        # tap-to-arm placement
        pg.click('.inv-item[data-type="wire_l"]'); x, y = tile_xy(pg, 0, 0); pg.mouse.click(x, y); pg.wait_for_timeout(50)
        check('tap tray item then tap square places part', (tile(pg, 0, 0) or {}).get('type') == 'wire_l')
        pg.mouse.click(x, y); check('tapping a placed part rotates it', tile(pg, 0, 0)['rot'] == 1)
        pg.keyboard.press('r'); check('R key rotates selected part', tile(pg, 0, 0)['rot'] == 2)
        pg.keyboard.press('Control+z'); check('Ctrl+Z undoes rotation', tile(pg, 0, 0)['rot'] == 1)
        pg.keyboard.press('Delete'); check('Delete removes selected part', tile(pg, 0, 0) is None)
        pg.click('#btn-undo'); check('Undo button restores removed part', tile(pg, 0, 0) is not None)
        # drag off the board → back to tray
        tx, ty = tile_xy(pg, 0, 0); pg.mouse.move(tx, ty); pg.mouse.down(); pg.mouse.move(tx + 20, ty, steps=3); pg.mouse.move(5, 5, steps=6); pg.mouse.up()
        check('dragging a part off the board returns it to tray', tile(pg, 0, 0) is None and pg.inner_text('.inv-item[data-type="wire_l"] .inv-count') == '×4')
        # dragging onto blocked or fixed square is refused
        drag_from_tray(pg, 'wire_l', 1, 1); check('cannot place on blocked square', tile(pg, 1, 1) is None)
        drag_from_tray(pg, 'wire_l', 1, 0); check('cannot place on fixed part', tile(pg, 1, 0)['type'] == 'battery')
        pg.click('#btn-hint'); pg.wait_for_timeout(100); check('hint shows toast', 'corner' in pg.inner_text('#toast').lower())
        # solve with real drags + clicks
        for (x, y, rot) in [(0, 0, 1), (2, 0, 2), (2, 2, 3), (0, 2, 0)]:
            drag_from_tray(pg, 'wire_l', x, y)
            tx, ty = tile_xy(pg, x, y)
            for _ in range(rot): pg.mouse.click(tx, ty); pg.wait_for_timeout(30)
        pg.wait_for_timeout(300)
        check('goal turns green when bulb lights', pg.locator('#goals li.ok').count() == 1)
        x, y = tile_xy(pg, 1, 2); pg.mouse.click(x, y)
        meter = pg.inner_text('#meter')
        check('multimeter shows live bulb reading', 'Bright' in meter and '5.7' in meter, meter.replace('\n', ' ')[:90])
        pg.screenshot(path=str(SHOTS / 'desktop-1-1-solved.png'))
        pg.wait_for_selector('#modal-body .win', timeout=4000)
        check('win modal with 3 stars', pg.locator('.big-stars span.on').count() == 3)
        pg.screenshot(path=str(SHOTS / 'desktop-1-1-win.png'))
        pg.click('button[data-a="next"]'); pg.wait_for_timeout(200)
        check('Next level button opens 1-2', '1-2' in pg.inner_text('#lv-title'))
        # switch toggle by tap
        x, y = tile_xy(pg, 2, 1); pg.mouse.click(x, y); check('tapping a switch flips it', tile(pg, 2, 1)['on'] is True)
        pg.click('#btn-sound'); check('sound toggle persists', json.loads(pg.evaluate("localStorage.getItem('gearspark.v1')"))['muted'] is True)
        pg.click('#btn-sound')
        pg.click('#btn-reset'); check('reset restores level start', tile(pg, 2, 1)['on'] is False)
        pg.click('#btn-back'); pg.wait_for_timeout(100)
        check('back to menu shows 1-1 with stars and 1-2 unlocked', pg.locator('.lv:not([disabled])').count() == 2 and '★★★' in pg.locator('.lv').first.inner_text())

        # ---------- every level wins through the UI ----------
        lv_ids = pg.evaluate('GS.LEVELS.map(l=>l.id)')
        all_ok = True
        for lid in lv_ids:
            pg.evaluate("""(id)=>{const L=GS.LEVELS.find(l=>l.id===id);GS.debug.startLevel(L);const a=GS.debug.app;
              L.solution.forEach(([t,x,y,r])=>{a.state.tiles[y*L.w+x]={type:t,rot:r,fixed:false}});
              (L.toggles||[]).forEach(([x,y,on])=>{a.state.tiles[y*L.w+x].on=on});GS.debug.resimulate();}""", lid)
            try:
                pg.wait_for_selector('#modal-body .win', timeout=3000)
                stars = pg.locator('.big-stars span.on').count()
                if stars != 3: all_ok = False; print('   level', lid, 'stars', stars)
            except Exception:
                all_ok = False; print('   level', lid, 'did not show win modal')
            if lid in ('2-3', '3-4', '4-3'): pg.screenshot(path=str(SHOTS / f'desktop-{lid}-win.png'))
        check('all 18 levels: verified solution wins with ★★★ in the real UI', all_ok)
        check('final level offers Sandbox', pg.locator('button[data-a="sandbox"]').count() == 1)
        pg.reload(); pg.wait_for_timeout(300)
        check('progress persists after reload (54/54 stars, all unlocked)', pg.inner_text('#total-stars') == '54 / 54' and pg.locator('.lv:not([disabled])').count() == 18)

        # ---------- sandbox: physics problems surface in UI ----------
        pg.click('#btn-sandbox'); pg.wait_for_timeout(200)
        check('sandbox offers all 19 parts with unlimited counts', pg.locator('.inv-item').count() == 19 and pg.inner_text('.inv-item .inv-count') == '∞')
        drag_from_tray(pg, 'battery', 1, 0)
        for (t, x, y, rot) in [('wire_l', 0, 0, 1), ('wire_l', 2, 0, 2), ('wire_l', 0, 1, 0), ('wire_i', 1, 1, 1), ('wire_l', 2, 1, 3)]:
            drag_from_tray(pg, t, x, y); tx, ty = tile_xy(pg, x, y)
            for _ in range(rot): pg.mouse.click(tx, ty); pg.wait_for_timeout(20)
        pg.wait_for_timeout(250)
        check('short circuit detected and explained', 'Short circuit' in pg.inner_text('#status'))
        pg.screenshot(path=str(SHOTS / 'desktop-sandbox-short.png'))
        drag_from_tray(pg, 'crank', 5, 3); drag_from_tray(pg, 'crank', 6, 3); pg.wait_for_timeout(150)
        check('gear jam detected and explained', 'Gear jam' in pg.inner_text('#status'))
        pg.close()

        # ---------- mobile + tablet ----------
        for name, vp in [('mobile', {'width': 390, 'height': 844}), ('tablet', {'width': 820, 'height': 1180})]:
            m = browser.new_page(viewport=vp, has_touch=True, is_mobile=(name == 'mobile'))
            m.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
            m.goto(BASE + '/?debug'); m.wait_for_timeout(250)
            sw = m.evaluate('document.documentElement.scrollWidth')
            check(f'{name}: no horizontal overflow on menu', sw <= vp['width'], f'scrollWidth {sw}')
            m.screenshot(path=str(SHOTS / f'{name}-menu.png'))
            m.click('#btn-continue'); m.wait_for_timeout(200); m.click('#modal-body button')
            # touch: tap tray item, tap squares, tap to rotate
            for (x, y, rot) in [(0, 0, 1), (2, 0, 2), (2, 2, 3), (0, 2, 0)]:
                if m.evaluate('GS.debug.app.armed') != 'wire_l': m.tap('.inv-item[data-type="wire_l"]')
                tx, ty = tile_xy(m, x, y); m.touchscreen.tap(tx, ty); m.wait_for_timeout(30)
                for _ in range(rot): m.touchscreen.tap(tx, ty); m.wait_for_timeout(30)
            m.wait_for_timeout(300)
            check(f'{name}: level 1-1 solvable with touch', m.locator('#goals li.ok').count() == 1)
            m.screenshot(path=str(SHOTS / f'{name}-1-1.png'))
            sw = m.evaluate('document.documentElement.scrollWidth')
            check(f'{name}: no horizontal overflow in game', sw <= vp['width'], f'scrollWidth {sw}')
            m.close()

        # ---------- production page without ?debug ----------
        q = new_page({'width': 1280, 'height': 800}, debug=False); q.wait_for_timeout(200)
        check('debug hook not exposed in production URL', q.evaluate('typeof GS.debug') == 'undefined')
        q.close()
        csp = [e for e in errors if 'Content Security Policy' in e or 'Refused' in e]
        check('no CSP violations', not csp, '; '.join(csp)[:200])
        check('no console or page errors', not errors, '; '.join(errors)[:300])
        browser.close()
finally:
    server.terminate()

failed = [r for r in results if not r[1]]
print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
