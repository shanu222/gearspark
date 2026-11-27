/* GearSpark — game controller: screens, input, simulation, animation, progress. */
(function (root) {
  'use strict';
  const { engine: G, render: R, sfx, audio, LEVELS, WORLDS, SANDBOX } = root.GS;
  const P = G.PARTS;
  const TAU = Math.PI * 2;
  const $ = (s) => document.querySelector(s);
  const STORE = 'gearspark.v1';
  const WORLD_ICONS = ['i-bolt', 'i-gear', 'i-motor', 'i-turbine'];
  const SANDBOX_ORDER = ['wire_i', 'wire_l', 'wire_t', 'wire_x', 'battery', 'switch', 'bulb', 'resistor', 'diode', 'motor', 'dynamo', 'gear_s', 'gear_l', 'compound', 'xbelt', 'crank', 'wheel', 'conveyor', 'pump'];
  const REDUCED = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = root.matchMedia && root.matchMedia('(pointer: fine)').matches;
  const icon = (id) => `<svg><use href="#${id}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- persistence ----------
  function load() {
    try { return Object.assign({ stars: {}, muted: false, seenHelp: false }, JSON.parse(localStorage.getItem(STORE) || '{}')); }
    catch (e) { return { stars: {}, muted: false, seenHelp: false }; }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(app.progress)); } catch (e) { /* storage unavailable */ } }

  const app = {
    progress: load(), level: null, state: null, res: null, ev: null, anim: {},
    selected: -1, hover: -1, armed: null, drag: null, undo: [], won: false, time: 0,
    layout: { ox: 0, oy: 0, T: 64, W: 0, H: 0 }, prevProblems: new Set(), lastPointer: null,
    fx: { pops: {}, spin: {}, particles: [], rings: [], flash: 0 }, goalOk: {}, winToken: 0
  };
  audio.setMuted(app.progress.muted);

  // ---------- helpers ----------
  const isUnlocked = (i) => i === 0 || (app.progress.stars[LEVELS[i - 1].id] || 0) > 0;
  const totalStars = () => LEVELS.reduce((n, l) => n + (app.progress.stars[l.id] || 0), 0);
  const fmt = (v, d) => (v === undefined || v === null || isNaN(v) ? '—' : (Math.abs(v) < 0.005 ? 0 : v).toFixed(d === undefined ? 2 : d));
  const dirText = (d) => (d > 0 ? '↻ Clockwise' : d < 0 ? '↺ Counter-clockwise' : 'Stopped');
  const nextLevelToPlay = () => LEVELS.find((l, i) => isUnlocked(i) && !app.progress.stars[l.id]);

  function remaining(type) {
    if (app.level.sandbox) return Infinity;
    const placed = app.state.tiles.reduce((n, t) => n + (t && !t.fixed && t.type === type ? 1 : 0), 0);
    const lifted = app.drag && app.drag.lifted && app.drag.tile.type === type ? 1 : 0;
    return (app.level.inv[type] || 0) - placed - lifted;
  }
  function snapshot() { return app.state.tiles.map((t) => (t ? Object.assign({}, t) : null)); }
  function pushUndo() { app.undo.push(snapshot()); if (app.undo.length > 80) app.undo.shift(); }

  // ---------- screens ----------
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => {
      const on = s.id === id;
      if (on && s.hidden) { s.hidden = false; s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; }
      else s.hidden = !on;
    });
    window.scrollTo(0, 0);
  }

  // ---------- title / level map ----------
  function renderMenu() {
    $('#total-stars').textContent = `${totalStars()} / ${LEVELS.length * 3}`;
    const next = nextLevelToPlay();
    $('#play-label').textContent = totalStars() === 0 ? 'Play' : next ? 'Continue' : 'Play again';
    $('#play-sub').textContent = next ? `Level ${next.id} · ${next.name}` : 'All levels complete ★';
    $('#btn-continue').onclick = () => { sfx.tap(); startLevel(next || LEVELS[0]); };
    const wrap = $('#worlds');
    wrap.innerHTML = '';
    WORLDS.forEach((w, wi) => {
      const lv = LEVELS.map((l, i) => ({ l, i })).filter((o) => o.l.world === wi);
      const got = lv.reduce((n, o) => n + (app.progress.stars[o.l.id] || 0), 0);
      const anyOpen = lv.some((o) => isUnlocked(o.i));
      const card = document.createElement('section');
      card.className = 'world' + (anyOpen ? '' : ' locked-world');
      card.style.setProperty('--wc', w.color);
      card.style.animationDelay = `${wi * 0.07}s`;
      card.innerHTML = `<div class="world-head"><span class="world-icon">${icon(WORLD_ICONS[wi])}</span>
        <div><h3>${esc(w.name)}</h3><small>${esc(w.tag)}</small></div>
        <span class="world-stars">${icon('i-star')}${got}/${lv.length * 3}</span></div><div class="lv-path"></div>`;
      const path = card.querySelector('.lv-path');
      if (lv.length === 4) path.classList.add('n4');
      lv.forEach(({ l, i }, k) => {
        const open = isUnlocked(i), st = app.progress.stars[l.id] || 0;
        const step = document.createElement('div');
        step.className = 'lv-step' + (k > 0 && open ? ' lit' : '');
        const b = document.createElement('button');
        b.className = 'lv' + (st ? ' done' : '') + (open && !st && next === l ? ' next' : '');
        b.disabled = !open;
        b.title = open ? `${l.id} ${l.name}` : 'Locked: finish the previous level';
        b.setAttribute('aria-label', open ? `Level ${l.id} ${l.name}, ${st} stars` : `Level ${l.id} locked`);
        b.innerHTML = `<span class="lv-node">${open ? esc(l.id.split('-')[1]) : `<span class="lock">${icon('i-lock')}</span>`}</span>
          <span class="lv-stars">${[1, 2, 3].map((n) => `<span class="st${n <= st ? ' on' : ''}">${icon('i-star')}</span>`).join('')}</span>
          <span class="lv-name">${esc(l.name)}</span>`;
        b.addEventListener('click', () => { sfx.tap(); startLevel(l); });
        step.appendChild(b);
        path.appendChild(step);
      });
      wrap.appendChild(card);
    });
  }
  function goMenu() { app.level = null; hideModal(); renderMenu(); show('screen-menu'); }

  // ---------- level lifecycle ----------
  function startLevel(lv) {
    app.level = lv;
    app.state = G.makeState(lv);
    app.anim = {}; app.selected = -1; app.armed = null; app.drag = null; app.undo = []; app.won = false;
    app.fx = { pops: {}, spin: {}, particles: [], rings: [], flash: 0 }; app.goalOk = {};
    app.winToken++;
    app.prevProblems = new Set();
    const w = lv.sandbox ? null : WORLDS[lv.world];
    const badge = $('#lv-badge');
    badge.style.setProperty('--wc', w ? w.color : '#5fd8ff');
    badge.innerHTML = icon(w ? WORLD_ICONS[lv.world] : 'i-sandbox');
    $('#lv-title').textContent = lv.sandbox ? 'Sandbox' : `${lv.id} · ${lv.name}`;
    $('#lv-world').textContent = lv.sandbox ? 'Free build' : w.name;
    $('#concept').innerHTML = `<h4>${esc(lv.concept.title)}</h4><p>${esc(lv.concept.text)}</p>`;
    $('#concept-panel').open = FINE && root.innerWidth > 860;
    $('#intro-text').textContent = lv.intro;
    $('#intro').hidden = false;
    $('#btn-hint').hidden = !!lv.sandbox;
    show('screen-game');
    hideModal();
    buildInventory();
    resize();
    resimulate(true);
    if (!app.progress.seenHelp) { showHelp(); app.progress.seenHelp = true; save(); }
  }
  function nextLevel() {
    const i = LEVELS.indexOf(app.level);
    if (i >= 0 && i < LEVELS.length - 1) startLevel(LEVELS[i + 1]); else goMenu();
  }
  function dismissIntro() { $('#intro').hidden = true; }

  // ---------- parts dock ----------
  function buildInventory() {
    const inv = $('#inventory');
    inv.innerHTML = '';
    inv.classList.toggle('wrap', !!app.level.sandbox);
    const types = app.level.sandbox ? SANDBOX_ORDER : Object.keys(app.level.inv);
    types.forEach((type, k) => {
      const b = document.createElement('button');
      b.className = 'inv-item'; b.dataset.type = type;
      b.style.animationDelay = `${Math.min(k, 12) * 0.03}s`;
      b.title = `${P[type].name}: ${P[type].desc}`;
      b.setAttribute('aria-label', P[type].name);
      b.innerHTML = `<canvas></canvas><span class="inv-name">${esc(P[type].short)}</span><span class="inv-count"></span>`;
      b.addEventListener('pointerdown', (e) => {
        audio.unlock();
        if (remaining(type) <= 0) { sfx.tap(); toast('None left. Drag a placed part off the board to reuse it.'); return; }
        app.drag = { from: 'inv', type, x0: e.clientX, y0: e.clientY, moved: false, tile: { type, rot: 0, fixed: false } };
        app.lastPointer = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      });
      inv.appendChild(b);
    });
    requestAnimationFrame(() => inv.querySelectorAll('.inv-item').forEach((b) => R.drawIcon(b.querySelector('canvas'), b.dataset.type)));
    updateInventory();
  }
  function updateInventory(bumpType) {
    document.querySelectorAll('.inv-item').forEach((b) => {
      const n = remaining(b.dataset.type);
      b.querySelector('.inv-count').textContent = n === Infinity ? '∞' : '×' + n;
      b.classList.toggle('empty', n <= 0);
      b.classList.toggle('armed', app.armed === b.dataset.type);
      if (bumpType === b.dataset.type) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    });
  }

  // ---------- simulation ----------
  function problemsOf(res) {
    const p = [];
    if (res.short) p.push('short');
    if (res.jam) p.push('jam');
    if (res.perpetual.length) p.push('perpetual');
    if (res.over.length) p.push('over');
    return p;
  }
  function resimulate(initial) {
    app.res = G.simulate(app.state);
    app.ev = app.level.sandbox ? { goals: [], win: false, problems: problemsOf(app.res) } : G.evalGoals(app.level, app.state, app.res);
    const probs = new Set(problemsOf(app.res));
    if (!initial) {
      if (probs.has('short') && !app.prevProblems.has('short')) sfx.spark();
      if (probs.has('jam') && !app.prevProblems.has('jam')) sfx.clank();
      if (probs.has('perpetual') && !app.prevProblems.has('perpetual')) sfx.clank();
      if (probs.has('over') && !app.prevProblems.has('over')) sfx.spark();
    }
    app.prevProblems = probs;
    // celebrate goals that just came true
    app.ev.goals.forEach((g) => {
      const key = g.goal.at.join(',');
      if (g.ok && !app.goalOk[key] && !initial) ring(g.goal.at[1] * app.state.w + g.goal.at[0], '#4ee38f');
      app.goalOk[key] = g.ok;
    });
    updatePanels();
    updateInventory();
    if (!app.level.sandbox && app.ev.win && !app.won) {
      app.won = true;
      sfx.power();
      app.fx.flash = 1;
      confetti(90);
      const lvAtWin = app.level, token = ++app.winToken;
      setTimeout(() => { if (app.level === lvAtWin && app.winToken === token && app.ev.win) showWin(); else app.won = false; }, 1100);
    } else if (!app.ev.win) app.won = false;
  }

  // ---------- panels ----------
  function goalIcon(g) { return g.type === 'spin' ? 'i-gear' : g.type === 'off' ? 'i-close' : 'i-hint'; }
  function goalText(g) {
    const t = app.state.tiles[g.at[1] * app.state.w + g.at[0]];
    const name = t ? P[t.type].short : 'Target';
    if (g.type === 'lit') return `Light bulb${g.label ? ' ' + g.label : ''}`;
    if (g.type === 'off') return `Bulb ${g.label || ''} stays dark`;
    const d = g.dir === 'cw' ? ' ↻' : g.dir === 'ccw' ? ' ↺' : '';
    const range = g.max !== undefined ? `${g.min}–${g.max} rpm` : `≥ ${g.min} rpm`;
    return `${name}${d} ${range}`;
  }
  function goalReading(g, r) {
    if (g.type === 'spin') return `${fmt(r.rpm || 0, 1)} rpm ${r.dir > 0 ? '↻' : r.dir < 0 ? '↺' : ''}`;
    if (r.blown) return `${fmt(Math.abs(r.V || 0), 1)} V · burnt out`;
    if (g.type === 'off') return Math.abs(r.I || 0) < 1e-3 ? 'dark' : `${fmt(Math.abs(r.V || 0), 1)} V`;
    return `${fmt(Math.abs(r.V || 0), 1)} V / need 4 V`;
  }
  function updatePanels() {
    const goalsEl = $('#goals'), parEl = $('#par');
    if (app.level.sandbox) {
      goalsEl.innerHTML = `<li class="ok"><span class="gi">${icon('i-sandbox')}</span><span class="gt"><b>Free build</b><small>unlimited parts</small></span></li>`;
      parEl.hidden = true;
    } else {
      goalsEl.innerHTML = app.ev.goals.map((g) => `<li class="${g.ok ? 'ok' : ''}"><span class="gi">${icon(g.ok ? 'i-star' : goalIcon(g.goal))}</span><span class="gt"><b>${esc(goalText(g.goal))}</b><small>${esc(goalReading(g.goal, g.reading))}</small></span></li>`).join('');
      const used = G.placedCount(app.state), st = used === 0 ? 3 : G.starsFor(app.level, used);
      parEl.hidden = false;
      parEl.title = `Use ${app.level.par} parts or fewer for 3 stars`;
      parEl.innerHTML = `Parts <b>${used}</b>/${app.level.par} <span class="pstars">${[1, 2, 3].map((n) => `<span class="${n <= st ? '' : 'dim'}">${icon('i-star')}</span>`).join('')}</span>`;
    }
    const p = app.prevProblems, msgs = [];
    if (p.has('short')) msgs.push(['', '⚡ Short circuit! Current bypasses every load.']);
    if (p.has('over')) msgs.push(['', '🔥 Over-voltage: a bulb gets more than 9 V.']);
    if (p.has('jam')) msgs.push(['', '⛔ Gear jam! Drivers are fighting each other.']);
    if (p.has('perpetual')) msgs.push(['violet', '♾ Perpetual motion refused: a generator can’t power its own motor.']);
    const html = msgs.map(([c, m]) => `<div class="alert ${c}">${esc(m)}</div>`).join('');
    const st = $('#status');
    if (st.dataset.html !== html) { st.innerHTML = html; st.dataset.html = html; }
    updateMeter();
  }

  function ro(label, value, cls, wide) { return `<div class="ro${wide ? ' wide' : ''}"><span>${label}</span><b class="${cls || ''}">${value}</b></div>`; }
  function updateMeter() {
    const el = $('#meter');
    const i = app.selected;
    const t = i >= 0 ? app.state.tiles[i] : null;
    if (!t) {
      el.innerHTML = `<div class="meter-empty">${icon('i-drag')}<span>Tap any part for live volts, amps &amp; rpm</span></div>`;
      return;
    }
    const d = P[t.type], r = app.res.tiles[i] || {};
    const kind = d.kind || (d.wire ? 'wire' : 'mech');
    let rows = '';
    if (kind === 'wire') rows += ro('Current', `${fmt(r.I || 0)} A`, '', true);
    else if (kind === 'battery') {
      rows += ro('Output', `${fmt(r.V)} V`) + ro('Current', `${fmt(r.I)} A`) + ro('Power', `${fmt(r.P)} W`) + ro('State', r.short ? 'SHORT' : 'OK', r.short ? 'bad' : 'good');
    } else if (kind === 'bulb') {
      const v = Math.abs(r.V || 0);
      rows += ro('Voltage', `${fmt(v)} V`) + ro('Current', `${fmt(Math.abs(r.I || 0))} A`) + ro('Power', `${fmt(r.P)} W`) +
        ro('State', r.blown ? 'Burnt out' : r.lit ? 'Bright' : v > 1 ? 'Dim' : 'Off', r.blown ? 'bad' : r.lit ? 'good' : 'txt');
    } else if (kind === 'resistor') {
      rows += ro('Drop', `${fmt(Math.abs(r.V || 0))} V`) + ro('Current', `${fmt(Math.abs(r.I || 0))} A`) + ro('Heat', `${fmt(r.P)} W`, '', true);
    } else if (kind === 'diode') {
      rows += ro('State', r.on ? 'Conducting' : 'Blocking', r.on ? 'good' : 'txt') + ro('Current', `${fmt(Math.max(0, r.I || 0))} A`);
    } else if (kind === 'switch') {
      rows += ro('State', t.on ? 'Closed' : 'Open', t.on ? 'good' : 'txt') + ro('Current', `${fmt(Math.abs(r.I || 0))} A`);
    } else if (kind === 'motor') {
      rows += ro('Voltage', `${fmt(Math.abs(r.V || 0))} V`) + ro('Current', `${fmt(Math.abs(r.I || 0))} A`) + ro('Speed', `${fmt(r.rpm || 0, 1)} rpm`) + ro('Direction', dirText(r.dir), 'txt');
      if (r.rpm === 0 && Math.abs(r.V || 0) > 0.01 && Math.abs(r.V) < G.C.MOTOR_START) rows += ro('Note', 'Below 1.5 V start', 'txt', true);
    } else if (kind === 'dynamo') {
      rows += ro('Speed', `${fmt(r.rpm || 0, 1)} rpm`) + ro('Generates', `${fmt(r.emf || 0)} V`) + ro('Current', `${fmt(Math.abs(r.I || 0))} A`) + ro('Direction', dirText(r.dir), 'txt');
      if (r.perpetual) rows += ro('State', 'Feedback loop refused', 'bad', true);
    } else if (d.belt) {
      rows += ro('Carries', `${fmt(r.rpm || 0, 1)} rpm`) + ro('Effect', 'Reverses', 'txt');
    } else {
      rows += ro('Speed', `${fmt(r.rpm || 0, 1)} rpm`) + ro('Direction', dirText(r.dir), 'txt') + ro('Teeth', d.mech.small ? '16 gold · 8 blue' : String(d.mech.teeth), 'txt', true);
      if (r.jam) rows += ro('State', 'Jammed', 'bad', true);
    }
    const btns = [];
    if (t.type === 'switch') btns.push(`<button class="btn" data-act="toggle">${icon('i-switch')}Flip</button>`);
    if (!t.fixed) btns.push(`<button class="btn" data-act="rotate">${icon('i-rotate')}Rotate <kbd>R</kbd></button>`, `<button class="btn" data-act="remove">${icon('i-trash')}Remove</button>`);
    el.innerHTML = `<div class="mhead"><canvas></canvas><b>${esc(d.name)}</b>${t.fixed ? `<span class="pill">${icon('i-lock')}fixed</span>` : ''}</div>
      <p class="mdesc">${esc(d.desc)}</p><div class="readouts">${rows}</div>${btns.length ? `<div class="mbtns">${btns.join('')}</div>` : ''}`;
    R.drawIcon(el.querySelector('canvas'), t.type);
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  }

  function act(a) {
    const i = app.selected;
    const t = i >= 0 ? app.state.tiles[i] : null;
    if (!t) return;
    if (a === 'toggle' && t.type === 'switch') { pushUndo(); t.on = !t.on; sfx.toggle(); burst(i, '#4ee38f', 6); resimulate(); }
    if (a === 'rotate' && !t.fixed) { pushUndo(); rotateTile(i); }
    if (a === 'remove' && !t.fixed) { pushUndo(); puff(i); app.state.tiles[i] = null; app.selected = -1; sfx.remove(); resimulate(); updateInventory(t.type); }
  }
  function rotateTile(i) {
    const t = app.state.tiles[i];
    t.rot = (t.rot + 1) % 4;
    app.fx.spin[i] = (app.fx.spin[i] || 0) - Math.PI / 2;
    sfx.rotate(); resimulate();
  }

  // ---------- toast & modals ----------
  let toastTimer = null;
  function toast(msg, cls) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show ' + (cls || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 3800);
  }
  function showModal(html) { $('#modal-body').innerHTML = html; $('#modal').hidden = false; }
  function hideModal() { $('#modal').hidden = true; }

  function showWin() {
    const lv = app.level;
    const used = G.placedCount(app.state);
    const stars = G.starsFor(lv, used);
    const prev = app.progress.stars[lv.id] || 0;
    app.progress.stars[lv.id] = Math.max(stars, prev); save();
    sfx.win();
    const last = LEVELS.indexOf(lv) === LEVELS.length - 1;
    showModal(`<div class="win">
      <div class="medal"><svg viewBox="0 0 64 64"><use href="#logo-mark"/></svg></div>
      <div class="big-stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? 'on' : ''}" style="animation-delay:${0.15 + k * 0.18}s">${icon('i-star')}</span>`).join('')}</div>
      <h2>${last ? 'Master Engineer!' : stars === 3 ? 'Perfect machine!' : 'Machine running!'}</h2>
      <p class="win-sub">Parts <b>${used}</b> · Par <b>${lv.par}</b>${stars < 3 ? ' · fewer parts = more stars' : ''}${stars > prev && prev > 0 ? ' · new best!' : ''}</p>
      <div class="learned"><span>${icon('i-book')}You learned</span><h4>${esc(lv.concept.title)}</h4><p>${esc(lv.concept.text)}</p></div>
      <div class="modal-actions"><button class="btn" data-a="menu">${icon('i-sandbox')}Levels</button><button class="btn" data-a="replay">${icon('i-reset')}Replay</button>${last ? `<button class="btn btn-primary" data-a="sandbox">Sandbox ${icon('i-play')}</button>` : `<button class="btn btn-primary" data-a="next">Next ${icon('i-play')}</button>`}</div></div>`);
    $('#modal-body').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      sfx.tap();
      const a = b.dataset.a;
      if (a === 'menu') goMenu();
      if (a === 'replay') startLevel(lv);
      if (a === 'next') nextLevel();
      if (a === 'sandbox') startLevel(SANDBOX);
    }));
    const nb = $('#modal-body .btn-primary'); if (nb) nb.focus({ preventScroll: true });
  }

  function showHelp() {
    const step = (ic, col, title, text) => `<div class="help-step"><span class="hi" style="background:${col}">${icon(ic)}</span><div><b>${title}</b><small>${text}</small></div></div>`;
    showModal(`<div class="help"><h2>How to play</h2>
      <div class="help-steps">
        ${step('i-drag', '#5fd8ff', 'Drag parts onto the board', 'Or tap a part in the tray, then tap a square.')}
        ${step('i-rotate', '#e0ad48', 'Tap a part to rotate it', 'Tap a switch to flip it. Drag a part off the board to remove it.')}
        ${step('i-bolt', '#ffd25a', 'Power every goal', 'Current glows, gears turn. Tap any part to read its live values.')}
        ${step('i-star', '#4ee38f', 'Fewer parts, more stars', 'Hit the par for ★★★.')}
      </div>
      <p class="help-keys"><kbd>R</kbd> rotate · <kbd>Del</kbd> remove · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Esc</kbd> cancel</p>
      <div class="modal-actions"><button class="btn btn-primary" data-a="ok">Let’s build ${icon('i-play')}</button></div></div>`);
    $('#modal-body button').addEventListener('click', () => { sfx.tap(); hideModal(); });
  }

  // ---------- effects ----------
  function tileCenter(i) {
    const { T, ox, oy } = app.layout, w = app.state.w;
    return [ox + (i % w) * T + T / 2, oy + Math.floor(i / w) * T + T / 2];
  }
  function burst(i, color, n) {
    if (REDUCED) return;
    const [x, y] = tileCenter(i), T = app.layout.T;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, s = (0.6 + Math.random()) * T * 2.4;
      app.fx.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, color, size: 2 + Math.random() * 2, kind: 'spark' });
    }
  }
  function puff(i) {
    if (REDUCED) return;
    const [x, y] = tileCenter(i), T = app.layout.T;
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * TAU, s = Math.random() * T * 0.9;
      app.fx.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - T * 0.3, life: 0.6, max: 0.6, color: 'rgba(160,185,210,', size: T * (0.06 + Math.random() * 0.08), kind: 'puff' });
    }
  }
  function ring(i, color) { if (!REDUCED) app.fx.rings.push({ i, t: 0, color }); }
  function confetti(n) {
    if (REDUCED) return;
    const { W } = app.layout;
    const cols = ['#ffd25a', '#e0ad48', '#5fd8ff', '#4ee38f', '#ff8a5c', '#ffffff'];
    for (let k = 0; k < n; k++) {
      app.fx.particles.push({ x: W * (0.2 + Math.random() * 0.6), y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 260, vy: 120 + Math.random() * 220,
        life: 2.6, max: 2.6, color: cols[k % cols.length], size: 5 + Math.random() * 5, kind: 'confetti', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 });
    }
  }
  const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  // ---------- board layout & drawing ----------
  const canvas = $('#board');
  const ctx = canvas.getContext('2d');
  function resize() {
    if (!app.level) return;
    const wrap = $('#board-wrap');
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 22;
    const T = Math.floor(Math.min((W - pad * 2) / app.state.w, (H - pad * 2) / app.state.h, 132));
    app.layout = { T, W, H, ox: Math.round((W - T * app.state.w) / 2), oy: Math.round((H - T * app.state.h) / 2) };
  }
  function tileAt(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    const x = cx - rect.left - app.layout.ox, y = cy - rect.top - app.layout.oy;
    const tx = Math.floor(x / app.layout.T), ty = Math.floor(y / app.layout.T);
    if (tx < 0 || ty < 0 || tx >= app.state.w || ty >= app.state.h) return -1;
    return ty * app.state.w + tx;
  }
  const canPlace = (i) => i >= 0 && !app.state.blocked[i] && !app.state.tiles[i];

  function drawBoard() {
    const { T, W, H, ox, oy } = app.layout;
    const st = app.state, bw = T * st.w, bh = T * st.h;
    ctx.clearRect(0, 0, W, H);
    // machined frame
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
    R.roundRect(ctx, ox - 14, oy - 14, bw + 28, bh + 28, 20);
    const fr = ctx.createLinearGradient(0, oy - 14, 0, oy + bh + 14);
    fr.addColorStop(0, '#2a4a6e'); fr.addColorStop(0.5, '#15304d'); fr.addColorStop(1, '#0d2136');
    ctx.fillStyle = fr; ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(160,210,255,0.18)'; ctx.lineWidth = 1;
    R.roundRect(ctx, ox - 13.5, oy - 13.5, bw + 27, bh + 27, 20); ctx.stroke();
    // corner bolts on the frame
    ctx.fillStyle = '#5f7f9f';
    for (const [bx, by] of [[ox - 6, oy - 6], [ox + bw + 6, oy - 6], [ox - 6, oy + bh + 6], [ox + bw + 6, oy + bh + 6]]) {
      ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, TAU); ctx.fill();
    }
    R.roundRect(ctx, ox - 4, oy - 4, bw + 8, bh + 8, 12); ctx.fillStyle = '#081627'; ctx.fill();
    // cells
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      const i = y * st.w + x, px = ox + x * T, py = oy + y * T;
      if (st.blocked[i]) {
        ctx.fillStyle = '#071220'; ctx.fillRect(px + 1.5, py + 1.5, T - 3, T - 3);
        ctx.save(); ctx.beginPath(); ctx.rect(px + 1.5, py + 1.5, T - 3, T - 3); ctx.clip();
        ctx.strokeStyle = 'rgba(120,150,180,0.09)'; ctx.lineWidth = 3;
        for (let k = -T; k < T; k += 12) { ctx.beginPath(); ctx.moveTo(px + k, py + T); ctx.lineTo(px + k + T, py); ctx.stroke(); }
        ctx.restore();
        continue;
      }
      const g = ctx.createLinearGradient(px, py, px, py + T);
      g.addColorStop(0, (x + y) % 2 ? '#163754' : '#173a59'); g.addColorStop(1, (x + y) % 2 ? '#12304b' : '#133250');
      ctx.fillStyle = g;
      R.roundRect(ctx, px + 1.5, py + 1.5, T - 3, T - 3, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(140,200,255,0.06)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + T / 2, py + 6); ctx.lineTo(px + T / 2, py + T - 6); ctx.moveTo(px + 6, py + T / 2); ctx.lineTo(px + T - 6, py + T / 2); ctx.stroke();
    }
    // goal halos
    if (app.ev && app.ev.goals) app.ev.goals.forEach((g) => {
      const px = ox + g.goal.at[0] * T, py = oy + g.goal.at[1] * T;
      const pulse = g.ok ? 1 : 0.55 + 0.45 * Math.sin(app.time * 3.2);
      ctx.save(); ctx.lineWidth = 2.5;
      ctx.strokeStyle = g.ok ? 'rgba(78,227,143,0.95)' : `rgba(240,170,50,${0.45 + 0.5 * pulse})`;
      if (!g.ok) { ctx.setLineDash([8, 6]); ctx.lineDashOffset = -app.time * 14; }
      ctx.shadowColor = g.ok ? 'rgba(78,227,143,0.7)' : 'rgba(240,170,50,0.5)'; ctx.shadowBlur = 12;
      R.roundRect(ctx, px + 4, py + 4, T - 8, T - 8, 10); ctx.stroke(); ctx.restore();
    });
    // hover / drop target
    const dragging = app.drag && app.drag.moved;
    if (app.hover >= 0 && !st.blocked[app.hover]) {
      const hx = ox + (app.hover % st.w) * T, hy = oy + Math.floor(app.hover / st.w) * T;
      if (dragging || app.armed) {
        const ok = canPlace(app.hover);
        ctx.fillStyle = ok ? 'rgba(78,227,143,0.16)' : 'rgba(255,97,89,0.16)';
        R.roundRect(ctx, hx + 2, hy + 2, T - 4, T - 4, 8); ctx.fill();
        ctx.strokeStyle = ok ? 'rgba(78,227,143,0.8)' : 'rgba(255,97,89,0.7)'; ctx.lineWidth = 2; ctx.stroke();
      } else if (FINE && st.tiles[app.hover]) {
        ctx.strokeStyle = 'rgba(95,216,255,0.35)'; ctx.lineWidth = 1.5;
        R.roundRect(ctx, hx + 3, hy + 3, T - 6, T - 6, 9); ctx.stroke();
      }
    }
    // parts
    for (let i = 0; i < st.tiles.length; i++) {
      const t = st.tiles[i];
      if (!t) continue;
      const [cx, cy] = tileCenter(i);
      if (t.fixed) {
        ctx.fillStyle = 'rgba(3,10,20,0.32)';
        R.roundRect(ctx, cx - T / 2 + 3, cy - T / 2 + 3, T - 6, T - 6, 7); ctx.fill();
        ctx.fillStyle = '#6a86a3';
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(cx + dx * (T / 2 - 8), cy + dy * (T / 2 - 8), 2.3, 0, TAU); ctx.fill(); }
      }
      ctx.save(); ctx.translate(cx, cy);
      const p0 = app.fx.pops[i];
      if (p0 !== undefined) {
        const k = Math.min(1, (app.time - p0) / 0.32);
        const s = 0.55 + 0.45 * easeOutBack(k);
        ctx.scale(s, s);
        if (k >= 1) delete app.fx.pops[i];
      }
      if (app.fx.spin[i]) ctx.rotate(app.fx.spin[i]);
      R.drawPart(ctx, t, T, app.res.tiles[i], app.anim[i] || 0, app.time);
      const r = app.res.tiles[i];
      if (r && r.jam) {
        ctx.strokeStyle = 'rgba(255,97,89,0.95)'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
        const k = T * 0.16; ctx.beginPath(); ctx.moveTo(-k, -k); ctx.lineTo(k, k); ctx.moveTo(k, -k); ctx.lineTo(-k, k); ctx.stroke();
      }
      ctx.restore();
    }
    // goal badges
    if (app.ev && app.ev.goals) app.ev.goals.forEach((g) => {
      const px = ox + g.goal.at[0] * T, py = oy + g.goal.at[1] * T;
      const lab = g.ok ? '✓' : g.goal.label || (g.goal.type === 'spin' ? (g.goal.dir === 'cw' ? '↻' : g.goal.dir === 'ccw' ? '↺' : '⟳') : g.goal.type === 'off' ? '○' : '★');
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(px + 13, py + 13, 11, 0, TAU);
      ctx.fillStyle = g.ok ? '#3fd283' : '#eaa530'; ctx.fill(); ctx.restore();
      ctx.font = '700 13px "Chakra Petch", ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#07121f'; ctx.fillText(lab, px + 13, py + 13.5);
    });
    // selection
    if (app.selected >= 0 && st.tiles[app.selected]) {
      const sx = ox + (app.selected % st.w) * T, sy = oy + Math.floor(app.selected / st.w) * T;
      ctx.save(); ctx.strokeStyle = '#5fd8ff'; ctx.lineWidth = 2.5; ctx.shadowColor = 'rgba(95,216,255,0.8)'; ctx.shadowBlur = 12;
      R.roundRect(ctx, sx + 2.5, sy + 2.5, T - 5, T - 5, 9); ctx.stroke(); ctx.restore();
    }
    // rings
    app.fx.rings.forEach((rg) => {
      const [cx, cy] = tileCenter(rg.i), k = rg.t / 0.7;
      ctx.strokeStyle = rg.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, T * (0.3 + k * 0.6), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    });
    // short-circuit sparks
    if (app.res.short && !REDUCED) app.res.shortTiles.forEach((i) => {
      if (Math.random() < 0.6) {
        const [cx, cy] = tileCenter(i);
        for (let k = 0; k < 2; k++) app.fx.particles.push({ x: cx + (Math.random() - 0.5) * T * 0.5, y: cy + (Math.random() - 0.5) * T * 0.4, vx: (Math.random() - 0.5) * 240, vy: -Math.random() * 240, life: 0.4, max: 0.4, color: '#ffd25a', size: 2, kind: 'spark' });
      }
    });
    // particles
    app.fx.particles.forEach((p) => {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color; ctx.globalAlpha = a; ctx.lineWidth = p.size; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); ctx.stroke();
      } else if (p.kind === 'puff') {
        ctx.fillStyle = p.color + (a * 0.5) + ')'; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU); ctx.fill();
      } else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 2);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
      }
    });
    ctx.globalAlpha = 1;
    // power-on flash
    if (app.fx.flash > 0) {
      ctx.save(); ctx.globalAlpha = app.fx.flash * 0.35;
      const rg = ctx.createRadialGradient(ox + bw / 2, oy + bh / 2, 10, ox + bw / 2, oy + bh / 2, Math.max(bw, bh));
      rg.addColorStop(0, '#fff3c4'); rg.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = rg; ctx.fillRect(ox - 14, oy - 14, bw + 28, bh + 28); ctx.restore();
    }
    // drag ghost
    if (dragging && app.lastPointer) {
      const rect = canvas.getBoundingClientRect();
      ctx.save();
      ctx.translate(app.lastPointer.x - rect.left, app.lastPointer.y - rect.top);
      ctx.scale(1.1, 1.1);
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 10;
      ctx.globalAlpha = 0.92;
      R.drawPart(ctx, app.drag.tile, T, null, app.time * 0.6, app.time);
      ctx.restore();
    }
  }

  // ---------- title background ----------
  const bg = $('#menu-bg');
  const bctx = bg.getContext('2d');
  function sizeBg() {
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    bg.width = Math.round(root.innerWidth * dpr); bg.height = Math.round(root.innerHeight * dpr);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const bgSparks = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), s: 0.3 + Math.random() * 0.7, p: Math.random() }));
  function drawBg(t) {
    const W = root.innerWidth, H = root.innerHeight;
    bctx.clearRect(0, 0, W, H);
    const T = Math.max(120, Math.min(W, H) * 0.32);
    const sp = REDUCED ? 0 : t;
    bctx.save(); bctx.globalAlpha = 0.16;
    // meshed train, top-right
    const gx = W - T * 0.55, gy = T * 0.35;
    bctx.save(); bctx.translate(gx, gy); R.drawGear(bctx, T * 1.9, 16, sp * 0.25); bctx.restore();
    bctx.save(); bctx.translate(gx - T * 1.32, gy + T * 0.55); R.drawGear(bctx, T * 1.9, 8, -sp * 0.5 + 0.2, { fill: '#a9bccf', dark: '#4d6075', light: '#dce7f1' }); bctx.restore();
    // bottom-left
    const hx = T * 0.35, hy = H - T * 0.3;
    bctx.save(); bctx.translate(hx, hy); R.drawGear(bctx, T * 2.2, 16, -sp * 0.2); bctx.restore();
    bctx.save(); bctx.translate(hx + T * 1.55, hy - T * 0.3); R.drawGear(bctx, T * 1.6, 8, sp * 0.4 + 0.3, { fill: '#5ab7e6', dark: '#1f5f86', light: '#bfe6fb' }); bctx.restore();
    bctx.restore();
    // circuit trace with flowing current
    bctx.save();
    const yL = H * 0.62;
    const path = [[0, yL], [W * 0.28, yL], [W * 0.34, yL - 40], [W * 0.66, yL - 40], [W * 0.72, yL], [W, yL]];
    bctx.strokeStyle = 'rgba(201,121,62,0.16)'; bctx.lineWidth = 3;
    bctx.beginPath(); path.forEach(([x, y], k) => (k ? bctx.lineTo(x, y) : bctx.moveTo(x, y))); bctx.stroke();
    let len = 0; const segs = [];
    for (let k = 1; k < path.length; k++) { const d = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]); segs.push(d); len += d; }
    bctx.fillStyle = 'rgba(255,210,90,0.55)';
    for (let n = 0; n < 14; n++) {
      let s = ((n / 14) * len + sp * 90) % len, k = 0;
      while (s > segs[k]) { s -= segs[k]; k++; }
      const f = s / segs[k], x = path[k][0] + (path[k + 1][0] - path[k][0]) * f, y = path[k][1] + (path[k + 1][1] - path[k][1]) * f;
      bctx.beginPath(); bctx.arc(x, y, 2.4, 0, TAU); bctx.fill();
    }
    bctx.restore();
    // drifting sparks
    bgSparks.forEach((s) => {
      const y = ((s.y - sp * 0.02 * s.s) % 1 + 1) % 1;
      const a = 0.15 + 0.35 * Math.abs(Math.sin(sp * 1.5 + s.p * 6));
      bctx.fillStyle = `rgba(255,217,138,${a})`;
      bctx.beginPath(); bctx.arc(s.x * W, y * H, 1.2 + s.s * 1.6, 0, TAU); bctx.fill();
    });
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!$('#screen-menu').hidden) drawBg(now / 1000);
    if (app.level && !$('#screen-game').hidden) {
      app.time += dt;
      for (const k in app.res.tiles) {
        const r = app.res.tiles[k];
        if (r.rpm && !r.linked) app.anim[k] = ((app.anim[k] || 0) + r.dir * r.rpm / 60 * TAU * dt) % (TAU * 1000);
      }
      for (const k in app.fx.spin) { app.fx.spin[k] *= Math.exp(-dt * 16); if (Math.abs(app.fx.spin[k]) < 0.002) delete app.fx.spin[k]; }
      app.fx.particles.forEach((p) => {
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (p.kind === 'confetti') { p.vy += 60 * dt; p.vx *= 0.99; p.rot += p.vr * dt; }
        else if (p.kind === 'spark') { p.vy += 520 * dt; p.vx *= 0.96; }
        else { p.vx *= 0.92; p.vy *= 0.92; }
      });
      app.fx.particles = app.fx.particles.filter((p) => p.life > 0);
      app.fx.rings.forEach((r) => { r.t += dt; });
      app.fx.rings = app.fx.rings.filter((r) => r.t < 0.7);
      app.fx.flash = Math.max(0, app.fx.flash - dt * 1.6);
      drawBoard();
    }
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function placeNew(i, type) {
    pushUndo();
    app.state.tiles[i] = { type, rot: 0, fixed: false };
    app.selected = i; app.fx.pops[i] = app.time;
    burst(i, '#ffd25a', 10); sfx.place(); dismissIntro();
    resimulate(); updateInventory(type);
  }
  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    const i = tileAt(e.clientX, e.clientY);
    app.lastPointer = { x: e.clientX, y: e.clientY };
    if (i < 0) { app.selected = -1; updateMeter(); return; }
    const t = app.state.tiles[i];
    if (t) app.drag = { from: 'board', idx: i, x0: e.clientX, y0: e.clientY, moved: false, tile: t, lifted: false };
    else if (app.armed && canPlace(i)) {
      if (remaining(app.armed) > 0) { const type = app.armed; placeNew(i, type); if (remaining(type) <= 0) { app.armed = null; updateInventory(); } }
    } else { app.selected = -1; updateMeter(); }
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (!app.level) return;
    app.lastPointer = { x: e.clientX, y: e.clientY };
    app.hover = tileAt(e.clientX, e.clientY);
    const d = app.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 7) {
      if (d.from === 'board') {
        if (d.tile.fixed) { app.drag = null; return; }
        pushUndo();
        app.state.tiles[d.idx] = null; d.lifted = true;
        if (app.selected === d.idx) app.selected = -1;
        resimulate();
      }
      d.moved = true; app.armed = null; updateInventory();
    }
  });
  window.addEventListener('pointerup', (e) => {
    const d = app.drag;
    if (!d) return;
    app.drag = null;
    const i = tileAt(e.clientX, e.clientY);
    if (!d.moved) {
      if (d.from === 'board') tapTile(d.idx);
      else {
        app.armed = app.armed === d.type ? null : d.type; sfx.tap(); updateInventory();
        if (app.armed) toast(`Tap a square to place: ${P[d.type].name}`);
      }
      return;
    }
    if (d.from === 'inv') { if (canPlace(i)) placeNew(i, d.type); else updateInventory(); return; }
    if (canPlace(i)) { app.state.tiles[i] = d.tile; app.selected = i; app.fx.pops[i] = app.time; burst(i, '#ffd25a', 8); sfx.place(); }
    else if (i >= 0) { app.state.tiles[d.idx] = d.tile; }
    else { sfx.remove(); }
    resimulate(); updateInventory(i < 0 ? d.tile.type : undefined);
  });
  window.addEventListener('pointercancel', () => {
    const d = app.drag; app.drag = null;
    if (d && d.lifted) { app.state.tiles[d.idx] = d.tile; resimulate(); }
  });

  function tapTile(i) {
    const t = app.state.tiles[i];
    if (!t) return;
    const wasSelected = app.selected === i;
    app.selected = i;
    if (t.type === 'switch') { pushUndo(); t.on = !t.on; sfx.toggle(); burst(i, t.on ? '#4ee38f' : '#8ea6bf', 6); resimulate(); return; }
    if (!t.fixed) { pushUndo(); rotateTile(i); return; }
    if (!wasSelected) sfx.tap();
    updateMeter();
  }

  window.addEventListener('keydown', (e) => {
    if (!app.level || $('#screen-game').hidden) return;
    if (!$('#modal').hidden) { if (e.key === 'Escape' && !$('#modal-body .win')) hideModal(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.key === 'r' || e.key === 'R') act('rotate');
    if (e.key === 'Delete' || e.key === 'Backspace') act('remove');
    if (e.key === ' ' && app.selected >= 0 && app.state.tiles[app.selected] && app.state.tiles[app.selected].type === 'switch') { e.preventDefault(); act('toggle'); }
    if (e.key === 'Escape') { app.selected = -1; app.armed = null; updateInventory(); updateMeter(); }
  });

  function undo() {
    if (!app.undo.length) { toast('Nothing to undo.'); return; }
    app.state.tiles = app.undo.pop();
    if (app.selected >= 0 && !app.state.tiles[app.selected]) app.selected = -1;
    sfx.remove(); resimulate(); updateInventory();
  }

  // ---------- buttons ----------
  $('#btn-back').addEventListener('click', () => { sfx.tap(); goMenu(); });
  $('#btn-reset').addEventListener('click', () => {
    pushUndo(); const u = app.undo; startLevel(app.level); app.undo = u;
    toast('Level reset. Undo brings your build back.');
  });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-hint').addEventListener('click', () => { sfx.tap(); toast('💡 ' + app.level.hint, 'hint'); });
  $('#btn-help').addEventListener('click', () => { sfx.tap(); showHelp(); });
  $('#btn-help-menu').addEventListener('click', () => { sfx.tap(); showHelp(); });
  $('#btn-sandbox').addEventListener('click', () => { sfx.tap(); startLevel(SANDBOX); });
  $('#intro-close').addEventListener('click', dismissIntro);
  const syncMute = () => {
    ['#btn-sound', '#btn-sound-menu'].forEach((s) => {
      const b = $(s), m = app.progress.muted;
      b.querySelector('use').setAttribute('href', m ? '#i-mute' : '#i-sound');
      b.classList.toggle('off', m);
      b.title = m ? 'Sound off' : 'Sound on';
      b.setAttribute('aria-pressed', String(!m));
    });
  };
  const toggleMute = () => { app.progress.muted = !app.progress.muted; audio.setMuted(app.progress.muted); save(); syncMute(); sfx.tap(); };
  $('#btn-sound').addEventListener('click', toggleMute);
  $('#btn-sound-menu').addEventListener('click', toggleMute);
  syncMute();
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !$('#modal-body .win')) hideModal(); });
  window.addEventListener('resize', () => { resize(); sizeBg(); });
  if (root.ResizeObserver) new ResizeObserver(resize).observe($('#board-wrap'));

  // Test hook, only exposed with ?debug in the URL (used by the automated browser tests).
  if (/[?&]debug\b/.test(location.search)) root.GS.debug = { app, startLevel, resimulate };

  // ---------- boot ----------
  sizeBg();
  renderMenu();
  show('screen-menu');
  requestAnimationFrame(frame);
  const splash = $('#splash'), t0 = performance.now();
  const hideSplash = () => setTimeout(() => splash.classList.add('gone'), Math.max(0, 450 - (performance.now() - t0)));
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(hideSplash);
  else hideSplash();
})(window);
