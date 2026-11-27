/* GearSpark — physics engine
 * Real circuit solving (modified nodal analysis, Ohm's + Kirchhoff's laws),
 * real gear-train kinematics (direction flips, speed ratio = teeth ratio),
 * and electromechanical coupling (motors and dynamos).
 * No DOM access: runs in the browser and in Node (for level verification).
 */
(function (root) {
  'use strict';

  const N = 0, E = 1, S = 2, W = 3;
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const opp = (s) => (s + 2) % 4;
  const rotSide = (s, rot) => (s + rot) % 4;
  const baseSide = (s, rot) => (s - rot + 8) % 4;

  // Physical constants. All values are SI (volts, ohms, amps, rpm).
  const C = {
    BATTERY_V: 6, BATTERY_R: 0.5,
    BULB_R: 12, BULB_RATED: 6, BULB_LIT: 4, BULB_MAX: 9,
    RESISTOR_R: 12,
    MOTOR_R: 6, MOTOR_K: 10, MOTOR_START: 1.5,   // rpm per volt, minimum start voltage
    DYNAMO_K: 0.1, DYNAMO_R: 1,                  // volts per rpm, internal resistance
    DIODE_VF: 0.7, DIODE_R: 0.5,
    WIRE_R: 0.001, SWITCH_R: 0.001,
    SHORT_A: 3,                                  // battery current that counts as a short circuit
    CRANK_RPM: 30, WHEEL_RPM: 20,
    GMIN: 1e-9
  };

  // Part catalogue. Sides are given for rotation 0 (N=0,E=1,S=2,W=3).
  const PARTS = {
    wire_i:   { name: 'Straight Wire', short: 'Wire', cat: 'elec', wire: [N, S],
                desc: 'Copper conductor. Connects the two ends it touches.' },
    wire_l:   { name: 'Corner Wire', short: 'Corner', cat: 'elec', wire: [N, E],
                desc: 'Turns a circuit through 90°.' },
    wire_t:   { name: 'T-Junction', short: 'T-Joint', cat: 'elec', wire: [E, S, W],
                desc: 'Splits current into branches (parallel circuits).' },
    wire_x:   { name: 'Cross Junction', short: 'Cross', cat: 'elec', wire: [N, E, S, W],
                desc: 'Joins all four sides into one node.' },
    battery:  { name: 'Battery 6 V', short: 'Battery', cat: 'elec', kind: 'battery', pins: { p: E, n: W },
                desc: '6 V cell with 0.5 Ω internal resistance. Current leaves from + and returns to −.' },
    switch:   { name: 'Switch', short: 'Switch', cat: 'elec', kind: 'switch', pins: { a: W, b: E },
                desc: 'Tap to open or close. An open switch breaks the loop.' },
    bulb:     { name: 'Bulb 6 V', short: 'Bulb', cat: 'elec', kind: 'bulb', pins: { a: W, b: E },
                desc: '12 Ω lamp rated 6 V. Bright above 4 V, burns out above 9 V.' },
    resistor: { name: 'Resistor 12 Ω', short: 'Resistor', cat: 'elec', kind: 'resistor', pins: { a: W, b: E },
                desc: 'Limits current. In series it takes a share of the voltage (V = I × R).' },
    diode:    { name: 'Diode', short: 'Diode', cat: 'elec', kind: 'diode', pins: { a: W, b: E },
                desc: 'One-way valve for current: flows from anode (▶) to cathode (|). Drops 0.7 V.' },
    motor:    { name: 'DC Motor', short: 'Motor', cat: 'em', kind: 'motor', pins: { a: W, b: E }, mech: { teeth: 8 },
                desc: '6 Ω motor. Speed = 10 rpm per volt. Reverse the current and it spins the other way.' },
    dynamo:   { name: 'Dynamo', short: 'Dynamo', cat: 'em', kind: 'dynamo', pins: { a: W, b: E }, mech: { teeth: 8 },
                desc: 'Generator: turns rotation into voltage (0.1 V per rpm). Direction sets polarity.' },
    gear_s:   { name: 'Small Gear (8 teeth)', short: 'Gear 8', cat: 'mech', mech: { teeth: 8 },
                desc: 'Meshes with neighbours. Each mesh reverses direction.' },
    gear_l:   { name: 'Large Gear (16 teeth)', short: 'Gear 16', cat: 'mech', mech: { teeth: 16 },
                desc: 'Meshes with neighbours. Bigger gear, same rule: speed ratio = teeth ratio.' },
    compound: { name: 'Compound Gear (16 + 8)', short: 'Compound', cat: 'mech', mech: { teeth: 16, small: [E, S], smallTeeth: 8 },
                desc: 'A 16-tooth and an 8-tooth gear on one shaft. Big gear meshes on the gold sides, small gear on the blue sides. Changes speed ×2 or ÷2.' },
    xbelt:    { name: 'Crossed Belt', short: 'X-Belt', cat: 'mech', belt: [W, E],
                desc: 'A figure-8 belt linking the two parts on its ends. Same speed, opposite direction.' },
    crank:    { name: 'Hand Crank', short: 'Crank', cat: 'mech', mech: { teeth: 8, source: 'CRANK_RPM' },
                desc: 'Mechanical power source: 30 rpm clockwise.' },
    wheel:    { name: 'Water Wheel', short: 'Wheel', cat: 'mech', mech: { teeth: 8, source: 'WHEEL_RPM' },
                desc: 'Hydro power source: 20 rpm clockwise, driven by flowing water.' },
    conveyor: { name: 'Conveyor', short: 'Conveyor', cat: 'mech', mech: { teeth: 8 }, load: true,
                desc: 'Mechanical load. Clockwise drive moves the belt top to the right.' },
    pump:     { name: 'Water Pump', short: 'Pump', cat: 'mech', mech: { teeth: 8 }, load: true,
                desc: 'Mechanical load. Needs enough rpm to lift water.' }
  };

  function teethAt(tile, worldSide) {
    const m = PARTS[tile.type].mech;
    if (!m) return 0;
    if (m.small) {
      const bs = baseSide(worldSide, tile.rot);
      if (m.small.indexOf(bs) >= 0) return m.smallTeeth;
    }
    return m.teeth;
  }

  // Which world sides expose electrical contacts.
  function elecSides(tile) {
    const d = PARTS[tile.type];
    if (d.wire) return d.wire.map((s) => rotSide(s, tile.rot));
    if (d.pins) return Object.values(d.pins).map((s) => rotSide(s, tile.rot));
    return [];
  }
  function pinSide(tile, name) { return rotSide(PARTS[tile.type].pins[name], tile.rot); }

  // ---------- small linear-algebra helper ----------
  function solveLinear(A, b, n) {
    // Gaussian elimination with partial pivoting. A is Float64Array n*n (row-major).
    for (let c = 0; c < n; c++) {
      let piv = c, best = Math.abs(A[c * n + c]);
      for (let r = c + 1; r < n; r++) {
        const v = Math.abs(A[r * n + c]);
        if (v > best) { best = v; piv = r; }
      }
      if (best < 1e-18) continue;
      if (piv !== c) {
        for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[piv * n + k]; A[piv * n + k] = t; }
        const t = b[c]; b[c] = b[piv]; b[piv] = t;
      }
      const d = A[c * n + c];
      for (let r = c + 1; r < n; r++) {
        const f = A[r * n + c] / d;
        if (f === 0) continue;
        for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
        b[r] -= f * b[c];
      }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
      const d = A[r * n + r];
      x[r] = Math.abs(d) < 1e-18 ? 0 : s / d;
    }
    return x;
  }

  class DSU {
    constructor(n) { this.p = Array.from({ length: n }, (_, i) => i); }
    find(x) { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; }
    union(a, b) { a = this.find(a); b = this.find(b); if (a !== b) this.p[a] = b; }
  }

  // ---------- topology ----------
  function buildTopology(state) {
    const { w, h, tiles } = state;
    const T = w * h;
    const pinId = (i, s) => i * 4 + s;
    const exposed = new Uint8Array(T * 4);
    for (let i = 0; i < T; i++) {
      const t = tiles[i];
      if (!t) continue;
      for (const s of elecSides(t)) exposed[pinId(i, s)] = 1;
    }
    const dsu = new DSU(T * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      for (const s of [E, S]) {
        const nx = x + DX[s], ny = y + DY[s];
        if (nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (exposed[pinId(i, s)] && exposed[pinId(j, opp(s))]) dsu.union(pinId(i, s), pinId(j, opp(s)));
      }
    }
    // node indices
    const nodeOf = new Map();
    let n = 0;
    const node = (i, s) => {
      const r = dsu.find(pinId(i, s));
      if (!nodeOf.has(r)) nodeOf.set(r, n++);
      return nodeOf.get(r);
    };
    const elements = [];
    const centers = {};
    for (let i = 0; i < T; i++) {
      const t = tiles[i];
      if (!t) continue;
      const d = PARTS[t.type];
      if (d.wire) {
        const c = n++;
        centers[i] = c;
        for (const s of elecSides(t)) elements.push({ k: 'R', a: c, b: node(i, s), r: C.WIRE_R, tile: i, seg: s });
      } else if (d.pins) {
        const kind = d.kind;
        if (kind === 'battery') {
          elements.push({ k: 'V', p: node(i, pinSide(t, 'p')), n: node(i, pinSide(t, 'n')), E: C.BATTERY_V, r: C.BATTERY_R, tile: i });
        } else if (kind === 'dynamo') {
          elements.push({ k: 'G', a: node(i, pinSide(t, 'a')), b: node(i, pinSide(t, 'b')), r: C.DYNAMO_R, tile: i });
        } else if (kind === 'diode') {
          elements.push({ k: 'D', a: node(i, pinSide(t, 'a')), b: node(i, pinSide(t, 'b')), on: true, tile: i });
        } else if (kind === 'switch') {
          if (t.on) elements.push({ k: 'R', a: node(i, pinSide(t, 'a')), b: node(i, pinSide(t, 'b')), r: C.SWITCH_R, tile: i });
          else { node(i, pinSide(t, 'a')); node(i, pinSide(t, 'b')); }
        } else {
          const r = kind === 'bulb' ? C.BULB_R : kind === 'resistor' ? C.RESISTOR_R : C.MOTOR_R;
          elements.push({ k: 'R', a: node(i, pinSide(t, 'a')), b: node(i, pinSide(t, 'b')), r, tile: i, kind });
        }
      }
    }
    // electrical connectivity (which parts share a circuit)
    const edsu = new DSU(Math.max(n, 1));
    for (const el of elements) {
      if (el.k === 'V') edsu.union(el.p, el.n); else edsu.union(el.a, el.b);
    }

    // mechanical graph
    const bodies = [];
    const bodyOf = new Int32Array(T).fill(-1);
    for (let i = 0; i < T; i++) {
      const t = tiles[i];
      if (t && PARTS[t.type].mech) { bodyOf[i] = bodies.length; bodies.push(i); }
    }
    const medges = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = tiles[i];
      if (!t) continue;
      if (bodyOf[i] >= 0) {
        for (const s of [E, S]) {
          const nx = x + DX[s], ny = y + DY[s];
          if (nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (bodyOf[j] < 0) continue;
          medges.push({ u: bodyOf[i], v: bodyOf[j], tu: teethAt(t, s), tv: teethAt(tiles[j], opp(s)), k: 'mesh' });
        }
      }
      if (PARTS[t.type].belt) {
        const [s1, s2] = PARTS[t.type].belt.map((s) => rotSide(s, t.rot));
        const x1 = x + DX[s1], y1 = y + DY[s1], x2 = x + DX[s2], y2 = y + DY[s2];
        if (x1 >= 0 && y1 >= 0 && x1 < w && y1 < h && x2 >= 0 && y2 >= 0 && x2 < w && y2 < h) {
          const a = bodyOf[y1 * w + x1], b = bodyOf[y2 * w + x2];
          if (a >= 0 && b >= 0) medges.push({ u: a, v: b, tu: 1, tv: 1, k: 'belt', tile: i });
        }
      }
    }
    const adj = bodies.map(() => []);
    for (const e of medges) {
      adj[e.u].push({ to: e.v, ratio: e.tu / e.tv });
      adj[e.v].push({ to: e.u, ratio: e.tv / e.tu });
    }
    const mcomp = new Int32Array(bodies.length).fill(-1);
    let mc = 0;
    for (let b = 0; b < bodies.length; b++) {
      if (mcomp[b] >= 0) continue;
      const st = [b]; mcomp[b] = mc;
      while (st.length) { const u = st.pop(); for (const e of adj[u]) if (mcomp[e.to] < 0) { mcomp[e.to] = mc; st.push(e.to); } }
      mc++;
    }
    return { n, elements, centers, edsu, bodies, bodyOf, adj, mcomp, mcompCount: mc, medges };
  }

  // ---------- circuit solve ----------
  function solveCircuit(topo, dyn) {
    const n = topo.n;
    const els = topo.elements;
    let V = new Float64Array(n);
    if (n === 0) return { V, I: new Map() };
    for (let iter = 0; iter < 16; iter++) {
      const A = new Float64Array(n * n);
      const b = new Float64Array(n);
      for (let k = 0; k < n; k++) A[k * n + k] += C.GMIN;
      const stampG = (a, c, g) => { A[a * n + a] += g; A[c * n + c] += g; A[a * n + c] -= g; A[c * n + a] -= g; };
      const stampSrc = (p, q, e, r) => { const g = 1 / r; stampG(p, q, g); b[p] += e * g; b[q] -= e * g; };
      for (const el of els) {
        if (el.k === 'R') stampG(el.a, el.b, 1 / el.r);
        else if (el.k === 'V') stampSrc(el.p, el.n, el.E, el.r);
        else if (el.k === 'G') {
          const d = dyn[el.tile] || { rpm: 0, dir: 0 };
          const e = C.DYNAMO_K * d.rpm;
          // clockwise: + at pin b; counter-clockwise: + at pin a
          if (d.dir >= 0) stampSrc(el.b, el.a, e, el.r); else stampSrc(el.a, el.b, e, el.r);
        } else if (el.k === 'D') {
          if (el.on) stampSrc(el.a, el.b, C.DIODE_VF, C.DIODE_R);
        }
      }
      V = solveLinear(A, b, n);
      let changed = false;
      for (const el of els) {
        if (el.k !== 'D') continue;
        const vd = V[el.a] - V[el.b];
        const i = el.on ? (vd - C.DIODE_VF) / C.DIODE_R : 0;
        if (el.on && i < -1e-9) { el.on = false; changed = true; }
        else if (!el.on && vd > C.DIODE_VF + 1e-9) { el.on = true; changed = true; }
      }
      if (!changed) break;
    }
    // element currents
    const I = new Map();
    for (const el of els) {
      let cur = 0;
      if (el.k === 'R') cur = (V[el.a] - V[el.b]) / el.r;
      else if (el.k === 'V') cur = (el.E - (V[el.p] - V[el.n])) / el.r; // current out of + terminal
      else if (el.k === 'G') {
        const d = dyn[el.tile] || { rpm: 0, dir: 0 };
        const e = C.DYNAMO_K * d.rpm;
        // current flowing a->b through the dynamo
        cur = d.dir >= 0 ? (e - (V[el.b] - V[el.a])) / el.r : -(e - (V[el.a] - V[el.b])) / el.r;
      } else if (el.k === 'D') cur = el.on ? (V[el.a] - V[el.b] - C.DIODE_VF) / C.DIODE_R : 0;
      I.set(el, cur);
    }
    return { V, I };
  }

  // ---------- gear solve ----------
  function solveMech(topo, drivers) {
    const nb = topo.bodies.length;
    const rpm = new Float64Array(nb), dir = new Int8Array(nb);
    const jammed = new Uint8Array(nb);
    const set = new Uint8Array(nb);
    const byComp = Array.from({ length: topo.mcompCount }, () => []);
    for (const [b, d] of drivers) byComp[topo.mcomp[b]].push([b, d]);
    for (let c = 0; c < topo.mcompCount; c++) {
      const ds = byComp[c];
      if (!ds.length) continue;
      const [b0, d0] = ds[0];
      rpm[b0] = d0.rpm; dir[b0] = d0.dir; set[b0] = 1;
      const q = [b0];
      let bad = false;
      while (q.length && !bad) {
        const u = q.shift();
        for (const e of topo.adj[u]) {
          const r = rpm[u] * e.ratio, d = -dir[u];
          if (!set[e.to]) { set[e.to] = 1; rpm[e.to] = r; dir[e.to] = d; q.push(e.to); }
          else if (dir[e.to] !== d || Math.abs(rpm[e.to] - r) > 0.01 * Math.max(r, 1)) { bad = true; break; }
        }
      }
      for (const [b, d] of ds) {
        if (!set[b] || dir[b] !== d.dir || Math.abs(rpm[b] - d.rpm) > 0.01 * Math.max(d.rpm, 1)) bad = true;
      }
      if (bad) {
        for (let b = 0; b < nb; b++) if (topo.mcomp[b] === c) { rpm[b] = 0; dir[b] = 0; jammed[b] = 1; }
      }
    }
    return { rpm, dir, jammed };
  }

  // Tarjan SCC to find generator -> motor -> generator feedback loops (perpetual motion).
  function findPerpetual(state, topo) {
    const dyns = [], mots = [];
    topo.elements.forEach((el) => {
      if (el.k === 'G') dyns.push(el);
      if (el.k === 'R' && el.kind === 'motor') mots.push(el);
    });
    if (!dyns.length || !mots.length) return new Set();
    const nodes = [...dyns.map((d) => ({ t: 'G', el: d })), ...mots.map((m) => ({ t: 'M', el: m }))];
    const adj = nodes.map(() => []);
    const ecomp = (el) => topo.edsu.find(el.a);
    const mcompOf = (el) => topo.mcomp[topo.bodyOf[el.tile]];
    nodes.forEach((a, ia) => nodes.forEach((b, ib) => {
      if (a.t === 'G' && b.t === 'M' && ecomp(a.el) === ecomp(b.el)) adj[ia].push(ib);
      if (a.t === 'M' && b.t === 'G' && mcompOf(a.el) === mcompOf(b.el)) adj[ia].push(ib);
    }));
    let idx = 0; const st = [], on = [], ix = [], low = [], flagged = new Set();
    const strong = (v) => {
      ix[v] = low[v] = idx++; st.push(v); on[v] = true;
      for (const w of adj[v]) {
        if (ix[w] === undefined) { strong(w); low[v] = Math.min(low[v], low[w]); }
        else if (on[w]) low[v] = Math.min(low[v], ix[w]);
      }
      if (low[v] === ix[v]) {
        const comp = []; let w;
        do { w = st.pop(); on[w] = false; comp.push(w); } while (w !== v);
        if (comp.length > 1) comp.forEach((k) => flagged.add(nodes[k].el.tile));
      }
    };
    nodes.forEach((_, i) => { if (ix[i] === undefined) strong(i); });
    return flagged;
  }

  // ---------- full simulation ----------
  function simulate(state) {
    const topo = buildTopology(state);
    const { tiles } = state;
    const perpetual = findPerpetual(state, topo);
    let dyn = {};
    let circ, mech;
    for (let iter = 0; iter < 12; iter++) {
      circ = solveCircuit(topo, dyn);
      const drivers = new Map();
      topo.bodies.forEach((ti, b) => {
        const t = tiles[ti];
        const src = PARTS[t.type].mech.source;
        if (src) drivers.set(b, { rpm: C[src], dir: 1 });
      });
      for (const el of topo.elements) {
        if (el.kind !== 'motor') continue;
        const i = circ.I.get(el);
        const v = Math.abs(circ.V[el.a] - circ.V[el.b]);
        if (v >= C.MOTOR_START && !perpetual.has(el.tile)) drivers.set(topo.bodyOf[el.tile], { rpm: C.MOTOR_K * v, dir: i >= 0 ? 1 : -1 });
      }
      mech = solveMech(topo, drivers);
      const nd = {};
      let same = true;
      for (const el of topo.elements) {
        if (el.k !== 'G') continue;
        const b = topo.bodyOf[el.tile];
        const v = perpetual.has(el.tile) ? { rpm: 0, dir: 0 } : { rpm: mech.rpm[b], dir: mech.dir[b] };
        nd[el.tile] = v;
        const o = dyn[el.tile] || { rpm: 0, dir: 0 };
        if (Math.abs(o.rpm - v.rpm) > 1e-6 || o.dir !== v.dir) same = false;
      }
      dyn = nd;
      if (same) break;
    }

    // ---------- results per tile ----------
    const out = { tiles: {}, short: false, shortTiles: [], jam: false, jamTiles: [], perpetual: [...perpetual], over: [] };
    const V = circ.V;
    for (const el of topo.elements) {
      const i = circ.I.get(el);
      const t = tiles[el.tile];
      const r = out.tiles[el.tile] || (out.tiles[el.tile] = {});
      if (el.seg !== undefined) {
        (r.segs || (r.segs = {}))[el.seg] = i; // positive = flowing from centre toward that side
        r.I = Math.max(r.I || 0, Math.abs(i));
        continue;
      }
      if (el.k === 'V') {
        r.I = i; r.V = V[el.p] - V[el.n]; r.P = r.V * i; r.emf = el.E;
        if (Math.abs(i) > C.SHORT_A) { out.short = true; out.shortTiles.push(el.tile); r.short = true; }
        continue;
      }
      const va = V[el.a], vb = V[el.b];
      r.V = va - vb; r.I = i; r.P = Math.abs(r.V * i);
      if (t.type === 'bulb') {
        const v = Math.abs(r.V);
        r.blown = v > C.BULB_MAX;
        r.lit = v >= C.BULB_LIT && !r.blown;
        r.glow = r.blown ? 0 : Math.min(1.25, Math.pow(v / C.BULB_RATED, 2));
        if (r.blown) out.over.push(el.tile);
      } else if (t.type === 'diode') {
        r.on = el.on && i > 1e-6;
      } else if (t.type === 'dynamo') {
        const d = dyn[el.tile] || { rpm: 0, dir: 0 };
        r.emf = C.DYNAMO_K * d.rpm;
      }
    }
    // switches report state even when open
    tiles.forEach((t, k) => { if (t && t.type === 'switch') { const r = out.tiles[k] || (out.tiles[k] = {}); r.on = !!t.on; if (r.I === undefined) r.I = 0; } });
    topo.bodies.forEach((ti, b) => {
      const r = out.tiles[ti] || (out.tiles[ti] = {});
      r.rpm = mech.rpm[b]; r.dir = mech.dir[b];
      if (mech.jammed[b]) { r.jam = true; out.jam = true; out.jamTiles.push(ti); }
      if (perpetual.has(ti)) r.perpetual = true;
    });
    // crossed belts report the speed they carry
    for (const e of topo.medges) {
      if (e.k !== 'belt') continue;
      const r = out.tiles[e.tile] || (out.tiles[e.tile] = {});
      r.rpm = mech.rpm[e.u]; r.dir = mech.dir[e.u]; r.linked = true;
    }
    return out;
  }

  // ---------- level helpers ----------
  function makeState(level) {
    const tiles = new Array(level.w * level.h).fill(null);
    const blocked = new Uint8Array(level.w * level.h);
    (level.blocked || []).forEach(([x, y]) => { blocked[y * level.w + x] = 1; });
    (level.fixed || []).forEach((f) => {
      const [type, x, y, rot, extra] = f;
      tiles[y * level.w + x] = Object.assign({ type, rot: rot || 0, fixed: true }, extra || {});
    });
    return { w: level.w, h: level.h, tiles, blocked };
  }

  function evalGoals(level, state, res) {
    const goals = (level.goals || []).map((g) => {
      const idx = g.at[1] * state.w + g.at[0];
      const r = res.tiles[idx] || {};
      let ok = false;
      if (g.type === 'lit') ok = !!r.lit;
      else if (g.type === 'off') ok = !r.lit && !r.blown && Math.abs(r.I || 0) < 1e-3;
      else if (g.type === 'spin') {
        const rpm = r.rpm || 0;
        ok = rpm >= (g.min || 1) - 0.05 && (g.max === undefined || rpm <= g.max + 0.05) && !r.jam;
        if (g.dir) ok = ok && r.dir === (g.dir === 'cw' ? 1 : -1);
      }
      return { goal: g, ok, reading: r };
    });
    const problems = [];
    if (res.short) problems.push('short');
    if (res.jam) problems.push('jam');
    if (res.perpetual.length) problems.push('perpetual');
    const win = goals.length > 0 && goals.every((g) => g.ok) && problems.length === 0;
    return { goals, win, problems };
  }

  function placedCount(state) {
    return state.tiles.reduce((n, t) => n + (t && !t.fixed ? 1 : 0), 0);
  }
  function starsFor(level, used) {
    if (used <= level.par) return 3;
    if (used <= level.par + 2) return 2;
    return 1;
  }

  const API = { PARTS, C, N, E, S, W, DX, DY, rotSide, baseSide, teethAt, elecSides, simulate, makeState, evalGoals, placedCount, starsFor };
  root.GS = Object.assign(root.GS || {}, { engine: API });
})(typeof globalThis !== 'undefined' ? globalThis : this);
