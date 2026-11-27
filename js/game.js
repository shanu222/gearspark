/* GearSpark — game controller: screens, input, simulation loop, progress. */
(function (root) {
  'use strict';
  const { engine: G, render: R, sfx, audio, LEVELS, WORLDS, SANDBOX } = root.GS;
  const P = G.PARTS;
  const TAU = Math.PI * 2;
  const $ = (s) => document.querySelector(s);
  const STORE = 'gearspark.v1';
  const SANDBOX_ORDER = ['wire_i', 'wire_l', 'wire_t', 'wire_x', 'battery', 'switch', 'bulb', 'resistor', 'diode', 'motor', 'dynamo', 'gear_s', 'gear_l', 'compound', 'xbelt', 'crank', 'wheel', 'conveyor', 'pump'];

  // ---------- persistence ----------
  function load() {
    try { return Object.assign({ stars: {}, muted: false, seenHelp: false }, JSON.parse(localStorage.getItem(STORE) || '{}')); }
    catch (e) { return { stars: {}, muted: false, seenHelp: false }; }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(app.progress)); } catch (e) { /* storage unavailable */ } }

  const app = {
    progress: load(), level: null, state: null, res: null, ev: null, anim: {}, sparks: [],
    selected: -1, hover: -1, armed: null, drag: null, undo: [], won: false, time: 0,
    layout: { ox: 0, oy: 0, T: 64, W: 0, H: 0 }, prevProblems: new Set(), lastPointer: null
  };
  audio.setMuted(app.progress.muted);

  // ---------- helpers ----------
  const idx = (x, y) => y * app.state.w + x;
  const isUnlocked = (i) => i === 0 || (app.progress.stars[LEVELS[i - 1].id] || 0) > 0;
  const totalStars = () => LEVELS.reduce((n, l) => n + (app.progress.stars[l.id] || 0), 0);
  const fmt = (v, d) => (v === undefined || v === null || isNaN(v) ? '—' : (Math.abs(v) < 0.005 ? 0 : v).toFixed(d === undefined ? 2 : d));
  const dirText = (d) => (d > 0 ? 'clockwise ↻' : d < 0 ? 'counter-clockwise ↺' : 'stopped');

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
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
    window.scrollTo(0, 0);
  }

  function renderMenu() {
    $('#total-stars').textContent = `${totalStars()} / ${LEVELS.length * 3}`;
    const wrap = $('#worlds');
    wrap.innerHTML = '';
    WORLDS.forEach((w, wi) => {
      const lv = LEVELS.map((l, i) => ({ l, i })).filter((o) => o.l.world === wi);
      const got = lv.reduce((n, o) => n + (app.progress.stars[o.l.id] || 0), 0);
      const card = document.createElement('section');
      card.className = 'world';
      card.style.setProperty('--wc', w.color);
      card.innerHTML = `<header><span class="wnum">World ${wi + 1}</span><h3>${w.name}</h3><span class="wtag">${w.tag}</span></header>
        <p>${w.blurb}</p><div class="wstars">★ ${got} / ${lv.length * 3}</div><div class="lv-grid"></div>`;
      const grid = card.querySelector('.lv-grid');
      lv.forEach(({ l, i }) => {
        const b = document.createElement('button');
        const open = isUnlocked(i), st = app.progress.stars[l.id] || 0;
        b.className = 'lv' + (open ? '' : ' locked') + (st ? ' done' : '');
        b.disabled = !open;
        b.innerHTML = `<span class="lv-id">${l.id}</span><span class="lv-name">${l.name}</span><span class="lv-stars">${open ? '★'.repeat(st) + '☆'.repeat(3 - st) : '🔒'}</span>`;
        b.addEventListener('click', () => startLevel(l));
        grid.appendChild(b);
      });
      wrap.appendChild(card);
    });
    const next = LEVELS.find((l, i) => isUnlocked(i) && !app.progress.stars[l.id]);
    const cont = $('#btn-continue');
    cont.textContent = totalStars() === 0 ? '▶ Start playing' : next ? `▶ Continue: ${next.id} ${next.name}` : '▶ Replay level 1';
    cont.onclick = () => startLevel(next || LEVELS[0]);
  }

  function goMenu() { app.level = null; renderMenu(); show('screen-menu'); }

  // ---------- level lifecycle ----------
  function startLevel(lv) {
    app.level = lv;
    app.state = G.makeState(lv);
    app.anim = {}; app.sparks = []; app.selected = -1; app.armed = null; app.drag = null; app.undo = []; app.won = false; app.winToken = (app.winToken || 0) + 1;
    app.prevProblems = new Set();
    $('#lv-title').textContent = lv.sandbox ? 'Sandbox' : `${lv.id} · ${lv.name}`;
    $('#lv-world').textContent = lv.sandbox ? 'Free build' : WORLDS[lv.world].name;
    $('#concept').innerHTML = `<h4>${lv.concept.title}</h4><p>${lv.concept.text}</p>`;
    $('#intro').textContent = lv.intro;
    $('#btn-hint').hidden = !!lv.sandbox;
    $('#goals-card').hidden = !!lv.sandbox;
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

  // ---------- inventory ----------
  function buildInventory() {
    const inv = $('#inventory');
    inv.innerHTML = '';
    inv.classList.toggle('wrap', !!app.level.sandbox);
    const types = app.level.sandbox ? SANDBOX_ORDER : Object.keys(app.level.inv);
    types.forEach((type) => {
      const b = document.createElement('button');
      b.className = 'inv-item'; b.dataset.type = type;
      b.title = `${P[type].name}: ${P[type].desc}`;
      b.innerHTML = `<canvas></canvas><span class="inv-name">${P[type].short}</span><span class="inv-count"></span>`;
      b.addEventListener('pointerdown', (e) => {
        if (remaining(type) <= 0) { sfx.tap(); toast('None left. Drag a placed part off the board to get it back.'); return; }
        audio.unlock();
        app.drag = { from: 'inv', type, x0: e.clientX, y0: e.clientY, moved: false, tile: { type, rot: 0, fixed: false } };
        app.lastPointer = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      });
      inv.appendChild(b);
    });
    requestAnimationFrame(() => inv.querySelectorAll('.inv-item').forEach((b) => R.drawIcon(b.querySelector('canvas'), b.dataset.type)));
    updateInventory();
  }
  function updateInventory() {
    document.querySelectorAll('.inv-item').forEach((b) => {
      const n = remaining(b.dataset.type);
      b.querySelector('.inv-count').textContent = n === Infinity ? '∞' : '×' + n;
      b.classList.toggle('empty', n <= 0);
      b.classList.toggle('armed', app.armed === b.dataset.type);
    });
  }

  // ---------- simulation ----------
  function resimulate(initial) {
    app.res = G.simulate(app.state);
    app.ev = app.level.sandbox ? { goals: [], win: false, problems: problemsOf(app.res) } : G.evalGoals(app.level, app.state, app.res);
    const probs = new Set(problemsOf(app.res));
    if (!initial) {
      if (probs.has('short') && !app.prevProblems.has('short')) { sfx.spark(); toast('⚡ Short circuit! Current is skipping every load and rushing straight back to the battery.', 'bad'); }
      if (probs.has('jam') && !app.prevProblems.has('jam')) { sfx.clank(); toast('⛔ Gear jam! Two drivers are fighting each other.', 'bad'); }
      if (probs.has('perpetual') && !app.prevProblems.has('perpetual')) { sfx.clank(); toast('♾ No free energy: a generator can’t power the motor that turns it.', 'bad'); }
      if (probs.has('over') && !app.prevProblems.has('over')) { sfx.spark(); toast('🔥 Over-voltage: that bulb would burn out above 9 V.', 'bad'); }
    }
    app.prevProblems = probs;
    updatePanels();
    updateInventory();
    if (!app.level.sandbox && app.ev.win && !app.won) {
      app.won = true;
      sfx.power();
      const lvAtWin = app.level, token = (app.winToken = (app.winToken || 0) + 1);
      setTimeout(() => { if (app.level === lvAtWin && app.winToken === token && app.ev.win) showWin(); else app.won = false; }, 1100);
    } else if (!app.ev.win) app.won = false;
  }
  function problemsOf(res) {
    const p = [];
    if (res.short) p.push('short');
    if (res.jam) p.push('jam');
    if (res.perpetual.length) p.push('perpetual');
    if (res.over.length) p.push('over');
    return p;
  }

  // ---------- side panels ----------
  function goalText(g) {
    const t = app.state.tiles[idx(g.at[0], g.at[1])];
    const name = t ? P[t.type].short : 'Target';
    const lbl = g.label ? ` ${g.label}` : '';
    if (g.type === 'lit') return `Light bulb${lbl} (≥ 4 V)`;
    if (g.type === 'off') return `Keep bulb${lbl} dark`;
    const d = g.dir === 'cw' ? 'clockwise ↻ ' : g.dir === 'ccw' ? 'counter-clockwise ↺ ' : '';
    const range = g.max !== undefined ? `${g.min}–${g.max} rpm` : `≥ ${g.min} rpm`;
    return `${name} turns ${d}at ${range}`;
  }
  function goalReading(g, r) {
    if (g.type === 'spin') return `${fmt(r.rpm || 0, 1)} rpm ${r.dir > 0 ? '↻' : r.dir < 0 ? '↺' : ''}`;
    if (r.blown) return `${fmt(Math.abs(r.V || 0), 1)} V · burnt out`;
    return `${fmt(Math.abs(r.V || 0), 1)} V`;
  }
  function updatePanels() {
    if (!app.level.sandbox) {
      $('#goals').innerHTML = app.ev.goals.map((g) => `<li class="${g.ok ? 'ok' : ''}"><span class="chk">${g.ok ? '✓' : ''}</span><span class="gt">${goalText(g.goal)}</span><span class="gr">${goalReading(g.goal, g.reading)}</span></li>`).join('');
      const used = G.placedCount(app.state);
      $('#par').textContent = `Parts used: ${used} · Par for ★★★: ${app.level.par}`;
    }
    const msgs = [];
    const p = app.prevProblems;
    if (p.has('short')) msgs.push(['bad', '⚡ Short circuit: over 3 A flowing with no load in the way. Real wires would overheat and the battery would drain in minutes.']);
    if (p.has('over')) msgs.push(['bad', '🔥 Over-voltage: a bulb is getting more than 9 V. Add resistance or lower the voltage.']);
    if (p.has('jam')) msgs.push(['bad', '⛔ Gear jam: drivers in one gear train want different speeds or directions, so nothing can turn.']);
    if (p.has('perpetual')) msgs.push(['bad', '♾ Perpetual motion refused: a generator is powering the motor that drives it. Energy must come from a battery, crank or water.']);
    $('#status').innerHTML = msgs.map(([c, m]) => `<div class="msg ${c}">${m}</div>`).join('');
    updateMeter();
  }

  function row(k, v) { return `<div class="mrow"><span>${k}</span><b>${v}</b></div>`; }
  function updateMeter() {
    const el = $('#meter');
    const i = app.selected;
    const t = i >= 0 ? app.state.tiles[i] : null;
    if (!t) {
      el.innerHTML = '<p class="muted">Tap any part on the board to read its live voltage, current, power and speed.</p>';
      return;
    }
    const d = P[t.type], r = app.res.tiles[i] || {};
    let rows = '';
    const kind = d.kind || (d.wire ? 'wire' : 'mech');
    if (kind === 'wire') rows += row('Current', `${fmt(r.I || 0)} A`);
    else if (kind === 'battery') {
      rows += row('EMF', '6.00 V') + row('Terminal voltage', `${fmt(r.V)} V`) + row('Current out', `${fmt(r.I)} A`) + row('Power delivered', `${fmt(r.P)} W`);
      if (r.short) rows += row('State', '<span class="bad">SHORT CIRCUIT</span>');
    } else if (kind === 'bulb') {
      const v = Math.abs(r.V || 0);
      rows += row('Voltage', `${fmt(v)} V`) + row('Current', `${fmt(Math.abs(r.I || 0))} A`) + row('Power', `${fmt(r.P)} W`) +
        row('State', r.blown ? '<span class="bad">Burnt out (&gt; 9 V)</span>' : r.lit ? '<span class="good">Bright</span>' : v > 1 ? 'Dim (&lt; 4 V)' : 'Off');
    } else if (kind === 'resistor') {
      rows += row('Voltage drop', `${fmt(Math.abs(r.V || 0))} V`) + row('Current', `${fmt(Math.abs(r.I || 0))} A`) + row('Heat', `${fmt(r.P)} W`);
    } else if (kind === 'diode') {
      rows += row('State', r.on ? '<span class="good">Conducting</span>' : 'Blocking') + row('Current', `${fmt(Math.max(0, r.I || 0))} A`) + row('Forward drop', '0.70 V');
    } else if (kind === 'switch') {
      rows += row('State', t.on ? '<span class="good">Closed</span>' : 'Open') + row('Current', `${fmt(Math.abs(r.I || 0))} A`);
    } else if (kind === 'motor') {
      rows += row('Voltage', `${fmt(Math.abs(r.V || 0))} V`) + row('Current', `${fmt(Math.abs(r.I || 0))} A`) + row('Speed', `${fmt(r.rpm || 0, 1)} rpm`) + row('Direction', dirText(r.dir));
      if (r.rpm === 0 && Math.abs(r.V || 0) > 0.01 && Math.abs(r.V) < G.C.MOTOR_START) rows += row('Note', 'Below 1.5 V start voltage');
    } else if (kind === 'dynamo') {
      rows += row('Speed', `${fmt(r.rpm || 0, 1)} rpm`) + row('Direction', dirText(r.dir)) + row('Generated EMF', `${fmt(r.emf || 0)} V`) + row('Output current', `${fmt(Math.abs(r.I || 0))} A`);
      if (r.perpetual) rows += row('State', '<span class="bad">Feedback loop refused</span>');
    } else {
      if (d.belt) rows += row('Carries', `${fmt(r.rpm || 0, 1)} rpm (reversed)`);
      else {
        rows += row('Speed', `${fmt(r.rpm || 0, 1)} rpm`) + row('Direction', dirText(r.dir));
        if (d.mech.small) rows += row('Teeth', '16 (gold sides) + 8 (blue sides)');
        else rows += row('Teeth', d.mech.teeth);
        if (r.jam) rows += row('State', '<span class="bad">Jammed</span>');
      }
    }
    const canEdit = !t.fixed;
    el.innerHTML = `<div class="mhead"><b>${d.name}</b>${t.fixed ? '<span class="pill">fixed</span>' : ''}</div><p class="mdesc">${d.desc}</p>${rows}
      <div class="mbtns">${t.type === 'switch' ? '<button data-act="toggle">Flip switch</button>' : ''}${canEdit ? '<button data-act="rotate">⟳ Rotate <kbd>R</kbd></button><button data-act="remove">✕ Remove <kbd>Del</kbd></button>' : ''}</div>`;
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  }

  function act(a) {
    const i = app.selected;
    const t = i >= 0 ? app.state.tiles[i] : null;
    if (!t) return;
    if (a === 'toggle' && t.type === 'switch') { pushUndo(); t.on = !t.on; sfx.toggle(); resimulate(); }
    if (a === 'rotate' && !t.fixed) { pushUndo(); t.rot = (t.rot + 1) % 4; sfx.rotate(); resimulate(); }
    if (a === 'remove' && !t.fixed) { pushUndo(); app.state.tiles[i] = null; app.selected = -1; sfx.remove(); resimulate(); }
  }

  // ---------- toast & modals ----------
  let toastTimer = null;
  function toast(msg, cls) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show ' + (cls || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 3600);
  }
  function showModal(html) { $('#modal-body').innerHTML = html; $('#modal').hidden = false; }
  function hideModal() { $('#modal').hidden = true; }

  function showWin() {
    const lv = app.level;
    const used = G.placedCount(app.state);
    const stars = G.starsFor(lv, used);
    const best = Math.max(stars, app.progress.stars[lv.id] || 0);
    app.progress.stars[lv.id] = best; save();
    sfx.win();
    const last = LEVELS.indexOf(lv) === LEVELS.length - 1;
    showModal(`<div class="win">
      <div class="big-stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? 'on' : ''}" style="animation-delay:${k * 0.15}s">★</span>`).join('')}</div>
      <h2>${last ? 'You finished GearSpark!' : 'Machine running!'}</h2>
      <p class="muted">Parts used: ${used} · Par: ${lv.par}${stars < 3 ? ' · Use fewer parts for ★★★' : ''}</p>
      <div class="learned"><span>What you learned</span><h4>${lv.concept.title}</h4><p>${lv.concept.text}</p></div>
      <div class="mbtns center"><button data-a="menu">Levels</button><button data-a="replay">Replay</button>${last ? '<button class="primary" data-a="sandbox">Open Sandbox</button>' : '<button class="primary" data-a="next">Next level ▶</button>'}</div></div>`);
    $('#modal-body').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'menu') { hideModal(); goMenu(); }
      if (a === 'replay') startLevel(lv);
      if (a === 'next') nextLevel();
      if (a === 'sandbox') startLevel(SANDBOX);
    }));
  }

  function showHelp() {
    showModal(`<div class="help"><h2>How to play</h2>
      <ul>
        <li><b>Drag</b> a part from the tray onto an empty square, or tap a part in the tray and then tap a square.</li>
        <li><b>Tap</b> a placed part to rotate it. Tap a <b>switch</b> to flip it.</li>
        <li><b>Drag</b> a placed part off the board to put it back in the tray. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes.</li>
        <li>Parts with <b>bolts</b> in the corners are fixed in place.</li>
        <li>Everything runs <b>live</b>: glowing dots show real current, gears turn at their real rpm.</li>
        <li>Tap any part to read the <b>multimeter</b>: volts, amps, watts and rpm, all calculated with real physics.</li>
        <li>Meet every goal to win. Use as few parts as the <b>par</b> for ★★★.</li>
      </ul>
      <div class="mbtns center"><button class="primary" data-a="ok">Let’s build</button></div></div>`);
    $('#modal-body').querySelector('button').addEventListener('click', hideModal);
  }

  // ---------- layout & drawing ----------
  const canvas = $('#board');
  const ctx = canvas.getContext('2d');
  function resize() {
    if (!app.level) return;
    const wrap = $('#board-wrap');
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 18;
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

  function draw() {
    const { T, W, H, ox, oy } = app.layout;
    const st = app.state;
    ctx.clearRect(0, 0, W, H);
    // board plate
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    R.roundRect(ctx, ox - 10, oy - 10, T * st.w + 20, T * st.h + 20, 14);
    ctx.fillStyle = '#10263c'; ctx.fill();
    ctx.restore();
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      const i = y * st.w + x, px = ox + x * T, py = oy + y * T;
      if (st.blocked[i]) {
        ctx.fillStyle = '#0a1726'; ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
        ctx.save(); ctx.beginPath(); ctx.rect(px + 1, py + 1, T - 2, T - 2); ctx.clip();
        ctx.strokeStyle = 'rgba(120,150,180,0.12)'; ctx.lineWidth = 2;
        for (let k = -T; k < T; k += 10) { ctx.beginPath(); ctx.moveTo(px + k, py + T); ctx.lineTo(px + k + T, py); ctx.stroke(); }
        ctx.restore();
        continue;
      }
      ctx.fillStyle = (x + y) % 2 ? '#15324f' : '#163654';
      ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
      ctx.strokeStyle = 'rgba(120,175,225,0.10)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + T / 2, py + 4); ctx.lineTo(px + T / 2, py + T - 4); ctx.moveTo(px + 4, py + T / 2); ctx.lineTo(px + T - 4, py + T / 2); ctx.stroke();
    }
    // goal halos (under parts)
    if (app.ev && app.ev.goals) app.ev.goals.forEach((g) => {
      const px = ox + g.goal.at[0] * T, py = oy + g.goal.at[1] * T;
      ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
      ctx.strokeStyle = g.ok ? 'rgba(85,214,138,0.9)' : 'rgba(242,184,75,0.85)';
      R.roundRect(ctx, px + 4, py + 4, T - 8, T - 8, 10); ctx.stroke(); ctx.restore();
    });
    // hover / drop target
    const dragging = app.drag && app.drag.moved;
    if ((dragging || app.armed) && app.hover >= 0) {
      const hx = ox + (app.hover % st.w) * T, hy = oy + Math.floor(app.hover / st.w) * T;
      ctx.fillStyle = canPlace(app.hover) ? 'rgba(85,214,138,0.18)' : 'rgba(255,90,78,0.18)';
      ctx.fillRect(hx + 1, hy + 1, T - 2, T - 2);
    }
    // parts
    for (let i = 0; i < st.tiles.length; i++) {
      const t = st.tiles[i];
      if (!t) continue;
      const cx = ox + (i % st.w) * T + T / 2, cy = oy + Math.floor(i / st.w) * T + T / 2;
      if (t.fixed) {
        ctx.fillStyle = 'rgba(5,14,24,0.35)'; ctx.fillRect(cx - T / 2 + 2, cy - T / 2 + 2, T - 4, T - 4);
        ctx.fillStyle = '#6f8297';
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(cx + dx * (T / 2 - 7), cy + dy * (T / 2 - 7), 2.4, 0, TAU); ctx.fill(); }
      }
      ctx.save(); ctx.translate(cx, cy);
      R.drawPart(ctx, t, T, app.res.tiles[i], app.anim[i] || 0, app.time);
      const r = app.res.tiles[i];
      if (r && r.jam) {
        ctx.strokeStyle = 'rgba(255,90,78,0.9)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        const k = T * 0.16; ctx.beginPath(); ctx.moveTo(-k, -k); ctx.lineTo(k, k); ctx.moveTo(k, -k); ctx.lineTo(-k, k); ctx.stroke();
      }
      ctx.restore();
    }
    // goal badges (over parts)
    if (app.ev && app.ev.goals) app.ev.goals.forEach((g) => {
      const px = ox + g.goal.at[0] * T, py = oy + g.goal.at[1] * T;
      const txt = g.ok ? '✓' : g.goal.type === 'spin' ? (g.goal.dir === 'cw' ? '↻' : g.goal.dir === 'ccw' ? '↺' : '⟳') : g.goal.label || (g.goal.type === 'off' ? '○' : '✦');
      const lab = g.goal.label && !g.ok ? g.goal.label : txt;
      ctx.beginPath(); ctx.arc(px + 12, py + 12, 10, 0, TAU);
      ctx.fillStyle = g.ok ? '#2fb36c' : '#e0a032'; ctx.fill();
      ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0b1726'; ctx.fillText(lab, px + 12, py + 12.5);
    });
    // selection
    if (app.selected >= 0 && st.tiles[app.selected]) {
      const sx = ox + (app.selected % st.w) * T, sy = oy + Math.floor(app.selected / st.w) * T;
      ctx.strokeStyle = '#6fd6ff'; ctx.lineWidth = 2.5;
      R.roundRect(ctx, sx + 2, sy + 2, T - 4, T - 4, 8); ctx.stroke();
    }
    // sparks for short circuits
    if (app.res.short) app.res.shortTiles.forEach((i) => {
      if (Math.random() < 0.6) {
        const cx = ox + (i % st.w) * T + T / 2, cy = oy + Math.floor(i / st.w) * T + T / 2;
        for (let k = 0; k < 3; k++) app.sparks.push({ x: cx + (Math.random() - 0.5) * T * 0.5, y: cy + (Math.random() - 0.5) * T * 0.4, vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 220, life: 0.45 });
      }
    });
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    app.sparks.forEach((s) => {
      ctx.strokeStyle = `rgba(255,${180 + Math.floor(Math.random() * 60)},90,${s.life * 2})`;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke();
    });
    // drag ghost
    if (dragging && app.lastPointer) {
      const rect = canvas.getBoundingClientRect();
      ctx.save(); ctx.globalAlpha = 0.85;
      ctx.translate(app.lastPointer.x - rect.left, app.lastPointer.y - rect.top);
      R.drawPart(ctx, app.drag.tile, T, null, 0, app.time);
      ctx.restore();
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (app.level && !$('#screen-game').hidden) {
      app.time += dt;
      for (const k in app.res.tiles) {
        const r = app.res.tiles[k];
        if (r.rpm && !r.linked) app.anim[k] = ((app.anim[k] || 0) + r.dir * r.rpm / 60 * TAU * dt) % (TAU * 1000);
      }
      app.sparks.forEach((s) => { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt; s.life -= dt; });
      app.sparks = app.sparks.filter((s) => s.life > 0);
      draw();
    }
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    const i = tileAt(e.clientX, e.clientY);
    app.lastPointer = { x: e.clientX, y: e.clientY };
    if (i < 0) { app.selected = -1; updateMeter(); return; }
    const t = app.state.tiles[i];
    if (t) {
      app.drag = { from: 'board', idx: i, x0: e.clientX, y0: e.clientY, moved: false, tile: t, lifted: false };
    } else if (app.armed && canPlace(i)) {
      if (remaining(app.armed) > 0) {
        pushUndo();
        app.state.tiles[i] = { type: app.armed, rot: 0, fixed: false };
        app.selected = i; sfx.place();
        if (remaining(app.armed) <= 0) app.armed = null;
        resimulate();
      }
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
      else { app.armed = app.armed === d.type ? null : d.type; sfx.tap(); updateInventory(); if (app.armed) toast(`Tap an empty square to place: ${P[d.type].name}`); }
      return;
    }
    if (d.from === 'inv') {
      if (canPlace(i)) { pushUndo(); app.state.tiles[i] = { type: d.type, rot: 0, fixed: false }; app.selected = i; sfx.place(); }
    } else if (canPlace(i)) { app.state.tiles[i] = d.tile; app.selected = i; sfx.place(); }
    else if (i >= 0) { app.state.tiles[d.idx] = d.tile; } // occupied square → snap back
    else { sfx.remove(); } // dropped off the board → back to tray
    resimulate();
  });

  function tapTile(i) {
    const t = app.state.tiles[i];
    if (!t) return;
    const wasSelected = app.selected === i;
    app.selected = i;
    if (t.type === 'switch') { pushUndo(); t.on = !t.on; sfx.toggle(); resimulate(); return; }
    if (!t.fixed) { pushUndo(); t.rot = (t.rot + 1) % 4; sfx.rotate(); resimulate(); return; }
    if (!wasSelected) sfx.tap();
    updateMeter();
  }

  window.addEventListener('keydown', (e) => {
    if (!app.level || $('#screen-game').hidden) return;
    if (!$('#modal').hidden) { if (e.key === 'Escape') hideModal(); return; }
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
    sfx.remove(); resimulate();
  }

  // ---------- wire up buttons ----------
  $('#btn-back').addEventListener('click', goMenu);
  $('#btn-reset').addEventListener('click', () => { pushUndo(); const u = app.undo; startLevel(app.level); app.undo = u; toast('Level reset. Ctrl+Z brings your build back.'); });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-hint').addEventListener('click', () => { toast('💡 ' + app.level.hint); });
  $('#btn-help').addEventListener('click', showHelp);
  $('#btn-help-menu').addEventListener('click', showHelp);
  $('#btn-sandbox').addEventListener('click', () => startLevel(SANDBOX));
  const muteBtn = $('#btn-sound');
  const syncMute = () => { muteBtn.textContent = app.progress.muted ? '🔇' : '🔊'; muteBtn.title = app.progress.muted ? 'Sound off' : 'Sound on'; };
  muteBtn.addEventListener('click', () => { app.progress.muted = !app.progress.muted; audio.setMuted(app.progress.muted); save(); syncMute(); });
  syncMute();
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !$('#modal-body .win')) hideModal(); });
  window.addEventListener('resize', resize);
  if (root.ResizeObserver) new ResizeObserver(resize).observe($('#board-wrap'));

  // Test hook, only exposed with ?debug in the URL (used by the automated browser tests).
  if (/[?&]debug\b/.test(location.search)) root.GS.debug = { app, startLevel, resimulate };
  renderMenu();
  show('screen-menu');
  requestAnimationFrame(frame);
})(window);
