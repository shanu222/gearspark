/* GearSpark — canvas rendering (procedural art, no image files). */
(function (root) {
  'use strict';
  const G = root.GS.engine;
  const P = G.PARTS;
  const TAU = Math.PI * 2;

  const COL = {
    copper: '#c9793e', copperDark: '#6e3a17', live: '#ffd25a', liveGlow: 'rgba(255,210,90,0.55)',
    brass: '#d9a845', brassDark: '#7d5a16', brassLight: '#f3d27e',
    steel: '#a9bccf', steelDark: '#4d6075', steelLight: '#dce7f1',
    blue: '#5ab7e6', blueDark: '#1f5f86',
    red: '#ff5a4e', green: '#55d68a', purple: '#b98cff',
    ink: '#0b1726', text: '#eaf2fb'
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function gearPath(ctx, rOut, rRoot, teeth) {
    ctx.beginPath();
    const step = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      const pts = [[rRoot, a - step * 0.5], [rRoot, a - step * 0.28], [rOut, a - step * 0.16], [rOut, a + step * 0.16], [rRoot, a + step * 0.28]];
      pts.forEach(([r, t], k) => { const x = Math.cos(t) * r, y = Math.sin(t) * r; if (i === 0 && k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    }
    ctx.closePath();
  }

  function drawGear(ctx, T, teeth, angle, opt) {
    const o = Object.assign({ out: teeth >= 16 ? 0.49 : 0.40, root: teeth >= 16 ? 0.42 : 0.31, fill: COL.brass, dark: COL.brassDark, light: COL.brassLight, holes: true }, opt || {});
    ctx.save();
    ctx.rotate(angle);
    gearPath(ctx, o.out * T, o.root * T, teeth);
    const g = ctx.createRadialGradient(-o.out * T * 0.3, -o.out * T * 0.3, 1, 0, 0, o.out * T);
    g.addColorStop(0, o.light); g.addColorStop(0.6, o.fill); g.addColorStop(1, o.dark);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1, T * 0.015); ctx.strokeStyle = o.dark; ctx.stroke();
    // spokes / lightening holes
    if (o.holes && teeth >= 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * TAU / 4) * o.root * T * 0.55, Math.sin(i * TAU / 4) * o.root * T * 0.55, o.root * T * 0.17, 0, TAU); ctx.fill(); }
    }
    // hub
    ctx.beginPath(); ctx.arc(0, 0, T * 0.08, 0, TAU); ctx.fillStyle = o.dark; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, T * 0.04, 0, TAU); ctx.fillStyle = '#1b1b1b'; ctx.fill();
    // index mark so rotation is visible
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(o.root * T * 0.75, 0, T * 0.025, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function lead(ctx, x1, x2, T) {
    ctx.strokeStyle = COL.copperDark; ctx.lineWidth = T * 0.13; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x2, 0); ctx.stroke();
    ctx.strokeStyle = COL.copper; ctx.lineWidth = T * 0.08;
    ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x2, 0); ctx.stroke();
  }

  // Animated current dots along the x-axis (base frame) from -T/2 to T/2.
  function flowDots(ctx, T, I, time, x1, x2) {
    const a = Math.abs(I || 0);
    if (a < 0.005) return;
    const sgn = I > 0 ? 1 : -1;
    const L = x2 - x1, gap = T * 0.2;
    const speed = T * Math.min(2.4, 0.35 + a * 1.6);
    const ph = ((time * speed) % gap + gap) % gap;
    ctx.fillStyle = COL.live;
    ctx.shadowColor = COL.live; ctx.shadowBlur = T * 0.08;
    for (let p = 0; p < L + gap; p += gap) {
      let x = sgn > 0 ? x1 + ((p + ph) % L) : x2 - ((p + ph) % L);
      ctx.beginPath(); ctx.arc(x, 0, T * 0.028, 0, TAU); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function label(ctx, text, x, y, size, color, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-rot);
    ctx.font = `700 ${size}px "Chakra Petch", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // ---------- wires (drawn in world frame) ----------
  function drawWire(ctx, tile, T, r, time) {
    const sides = G.elecSides(tile);
    const live = r && r.I > 0.005;
    ctx.lineCap = 'round';
    for (const pass of [0, 1, 2]) {
      for (const s of sides) {
        const ex = G.DX[s] * T / 2, ey = G.DY[s] * T / 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey);
        if (pass === 0) { ctx.strokeStyle = COL.copperDark; ctx.lineWidth = T * 0.15; ctx.lineCap = 'butt'; }
        else if (pass === 1) { ctx.strokeStyle = COL.copper; ctx.lineWidth = T * 0.09; ctx.lineCap = 'butt'; }
        else { if (!live) continue; ctx.strokeStyle = `rgba(255,214,110,${Math.min(0.75, 0.25 + r.I)})`; ctx.lineWidth = T * 0.05; }
        ctx.stroke();
      }
    }
    ctx.beginPath(); ctx.arc(0, 0, T * 0.085, 0, TAU); ctx.fillStyle = COL.copper; ctx.fill();
    ctx.lineWidth = T * 0.02; ctx.strokeStyle = COL.copperDark; ctx.stroke();
    if (live && r.segs) {
      for (const s of sides) {
        const i = r.segs[s];
        if (i === undefined) continue;
        ctx.save(); ctx.rotate(Math.atan2(G.DY[s], G.DX[s]));
        flowDots(ctx, T, i, time, 0, T / 2);
        ctx.restore();
      }
    }
  }

  // ---------- part bodies (base frame, rotated) ----------
  const BODY = {
    battery(ctx, T, r, a, time, rot) {
      lead(ctx, -T / 2, T / 2, T);
      if (r) flowDots(ctx, T, r.I, time, -T / 2, T / 2);
      roundRect(ctx, -T * 0.32, -T * 0.19, T * 0.56, T * 0.38, T * 0.06);
      const g = ctx.createLinearGradient(0, -T * 0.19, 0, T * 0.19);
      g.addColorStop(0, '#3c4a5c'); g.addColorStop(0.5, '#222c38'); g.addColorStop(1, '#141b24');
      ctx.fillStyle = g; ctx.fill();
      roundRect(ctx, T * 0.06, -T * 0.19, T * 0.18, T * 0.38, T * 0.04); ctx.fillStyle = '#e2a63a'; ctx.fill();
      roundRect(ctx, T * 0.24, -T * 0.08, T * 0.07, T * 0.16, T * 0.02); ctx.fillStyle = COL.steel; ctx.fill();
      if (r && r.short) { ctx.strokeStyle = COL.red; ctx.lineWidth = T * 0.04; roundRect(ctx, -T * 0.34, -T * 0.21, T * 0.67, T * 0.42, T * 0.07); ctx.stroke(); }
      label(ctx, '+', T * 0.15, 0, T * 0.2, '#1a1208', rot);
      label(ctx, '−', -T * 0.24, 0, T * 0.2, '#e8eef5', rot);
      label(ctx, '6V', -T * 0.07, 0, T * 0.12, '#cfd9e4', rot);
    },
    switch(ctx, T, r, a, time, rot, tile) {
      lead(ctx, -T / 2, -T * 0.2, T); lead(ctx, T * 0.2, T / 2, T);
      if (r && tile.on) flowDots(ctx, T, r.I, time, -T / 2, T / 2);
      roundRect(ctx, -T * 0.3, T * 0.05, T * 0.6, T * 0.14, T * 0.03); ctx.fillStyle = '#26323f'; ctx.fill();
      for (const x of [-T * 0.2, T * 0.2]) { ctx.beginPath(); ctx.arc(x, 0, T * 0.06, 0, TAU); ctx.fillStyle = COL.steelLight; ctx.fill(); ctx.strokeStyle = COL.steelDark; ctx.lineWidth = T * 0.02; ctx.stroke(); }
      ctx.save(); ctx.translate(-T * 0.2, 0); ctx.rotate(tile.on ? 0 : -0.6);
      ctx.strokeStyle = tile.on ? COL.green : '#e9eef4'; ctx.lineWidth = T * 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(T * 0.4, 0); ctx.stroke();
      ctx.restore();
      label(ctx, tile.on ? 'ON' : 'OFF', 0, -T * 0.3, T * 0.13, tile.on ? COL.green : '#9fb0c2', rot);
    },
    bulb(ctx, T, r, a, time, rot) {
      lead(ctx, -T / 2, T / 2, T);
      if (r) flowDots(ctx, T, r.I, time, -T / 2, T / 2);
      const glow = r ? r.glow || 0 : 0;
      if (glow > 0.02) {
        const rg = ctx.createRadialGradient(0, 0, T * 0.05, 0, 0, T * (0.3 + glow * 0.45));
        rg.addColorStop(0, `rgba(255,236,160,${0.9 * Math.min(1, glow)})`); rg.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, T * (0.3 + glow * 0.45), 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, T * 0.25, 0, TAU);
      if (r && r.blown) ctx.fillStyle = '#2a2d33';
      else { const t = Math.min(1, glow); ctx.fillStyle = `rgb(${Math.round(90 + 165 * t)},${Math.round(110 + 130 * t)},${Math.round(130 + 40 * t)})`; }
      ctx.fill(); ctx.lineWidth = T * 0.025; ctx.strokeStyle = 'rgba(230,240,250,0.8)'; ctx.stroke();
      // filament
      ctx.strokeStyle = r && r.blown ? '#555' : glow > 0.05 ? '#fff6d0' : '#6b5a3a'; ctx.lineWidth = T * 0.025;
      ctx.beginPath(); ctx.moveTo(-T * 0.12, T * 0.05);
      for (let i = 0; i <= 6; i++) ctx.lineTo(-T * 0.12 + i * T * 0.04, (i % 2 ? -1 : 1) * T * 0.05);
      ctx.stroke();
      if (r && r.blown) {
        ctx.strokeStyle = COL.red; ctx.lineWidth = T * 0.03;
        ctx.beginPath(); ctx.moveTo(-T * 0.14, -T * 0.16); ctx.lineTo(-T * 0.02, -T * 0.02); ctx.lineTo(-T * 0.08, T * 0.06); ctx.lineTo(T * 0.12, T * 0.16); ctx.stroke();
      }
    },
    resistor(ctx, T, r, a, time, rot) {
      lead(ctx, -T / 2, T / 2, T);
      if (r) flowDots(ctx, T, r.I, time, -T / 2, T / 2);
      roundRect(ctx, -T * 0.24, -T * 0.1, T * 0.48, T * 0.2, T * 0.08); ctx.fillStyle = '#d9c39a'; ctx.fill();
      ctx.strokeStyle = '#8b7350'; ctx.lineWidth = T * 0.015; ctx.stroke();
      [['#8b4a1e', -0.14], ['#e03a2f', -0.06], ['#111', 0.02], ['#d6a13d', 0.14]].forEach(([c, x]) => { ctx.fillStyle = c; ctx.fillRect(x * T, -T * 0.1, T * 0.04, T * 0.2); });
      label(ctx, '12Ω', 0, -T * 0.26, T * 0.13, '#e8d9b8', rot);
      if (r && Math.abs(r.P) > 0.5) { ctx.fillStyle = `rgba(255,120,60,${Math.min(0.5, r.P / 6)})`; roundRect(ctx, -T * 0.24, -T * 0.1, T * 0.48, T * 0.2, T * 0.08); ctx.fill(); }
    },
    diode(ctx, T, r, a, time, rot) {
      lead(ctx, -T / 2, T / 2, T);
      if (r) flowDots(ctx, T, r.I, time, -T / 2, T / 2);
      roundRect(ctx, -T * 0.2, -T * 0.1, T * 0.4, T * 0.2, T * 0.05); ctx.fillStyle = '#1d1f24'; ctx.fill();
      ctx.fillStyle = '#d7dee6'; ctx.fillRect(T * 0.1, -T * 0.1, T * 0.05, T * 0.2);
      // symbol
      const on = r && r.on;
      ctx.fillStyle = on ? COL.green : '#e6edf5'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = T * 0.03;
      ctx.beginPath(); ctx.moveTo(-T * 0.1, -T * 0.36); ctx.lineTo(-T * 0.1, -T * 0.16); ctx.lineTo(T * 0.08, -T * 0.26); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(T * 0.1, -T * 0.37); ctx.lineTo(T * 0.1, -T * 0.15); ctx.stroke();
    },
    motor(ctx, T, r, a, time, rot) {
      drawGear(ctx, T, 8, a, { fill: COL.steel, dark: COL.steelDark, light: COL.steelLight, out: 0.42, root: 0.33 });
      lead(ctx, -T / 2, -T * 0.28, T); lead(ctx, T * 0.28, T / 2, T);
      if (r) { flowDots(ctx, T, r.I, time, -T / 2, -T * 0.28); flowDots(ctx, T, r.I, time, T * 0.28, T / 2); }
      ctx.beginPath(); ctx.arc(0, 0, T * 0.27, 0, TAU);
      const g = ctx.createRadialGradient(-T * 0.08, -T * 0.08, 2, 0, 0, T * 0.27);
      g.addColorStop(0, '#5f86a8'); g.addColorStop(1, '#1d3a55'); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = T * 0.025; ctx.strokeStyle = '#9ec6e6'; ctx.stroke();
      label(ctx, 'M', 0, 0, T * 0.24, '#e9f4ff', rot);
      if (r && r.rpm > 0) { ctx.strokeStyle = 'rgba(158,198,230,0.7)'; ctx.lineWidth = T * 0.02; ctx.beginPath(); ctx.arc(0, 0, T * 0.21, a, a + 1.6); ctx.stroke(); }
    },
    dynamo(ctx, T, r, a, time, rot) {
      drawGear(ctx, T, 8, a, { fill: COL.steel, dark: COL.steelDark, light: COL.steelLight, out: 0.42, root: 0.33 });
      lead(ctx, -T / 2, -T * 0.28, T); lead(ctx, T * 0.28, T / 2, T);
      if (r) { flowDots(ctx, T, r.I, time, -T / 2, -T * 0.28); flowDots(ctx, T, r.I, time, T * 0.28, T / 2); }
      ctx.beginPath(); ctx.arc(0, 0, T * 0.27, 0, TAU);
      const g = ctx.createRadialGradient(-T * 0.08, -T * 0.08, 2, 0, 0, T * 0.27);
      g.addColorStop(0, '#c9784a'); g.addColorStop(1, '#5a2614'); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = T * 0.025; ctx.strokeStyle = '#f0b48c'; ctx.stroke();
      label(ctx, 'G', 0, 0, T * 0.24, '#fff1e6', rot);
      if (r && r.perpetual) { ctx.strokeStyle = COL.purple; ctx.lineWidth = T * 0.04; ctx.beginPath(); ctx.arc(0, 0, T * 0.34, 0, TAU); ctx.stroke(); }
    },
    gear_s(ctx, T, r, a) { drawGear(ctx, T, 8, a); },
    gear_l(ctx, T, r, a) { drawGear(ctx, T, 16, a); },
    compound(ctx, T, r, a) {
      // gold bars: big-gear sides (W, N). blue bars: small-gear sides (E, S).
      const bar = (s, c) => {
        ctx.fillStyle = c;
        const L = T * 0.5, th = T * 0.05;
        if (s === 3) ctx.fillRect(-T / 2, -L / 2, th, L);
        if (s === 0) ctx.fillRect(-L / 2, -T / 2, L, th);
        if (s === 1) ctx.fillRect(T / 2 - th, -L / 2, th, L);
        if (s === 2) ctx.fillRect(-L / 2, T / 2 - th, L, th);
      };
      bar(3, COL.brass); bar(0, COL.brass); bar(1, COL.blue); bar(2, COL.blue);
      drawGear(ctx, T, 16, a);
      drawGear(ctx, T, 8, a, { out: 0.27, root: 0.2, fill: COL.blue, dark: COL.blueDark, light: '#bfe6fb' });
    },
    crank(ctx, T, r, a) {
      drawGear(ctx, T, 8, a, { fill: '#b98a3a', dark: '#5f4314', light: '#e9c886' });
      ctx.save(); ctx.rotate(a);
      ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = T * 0.08; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(T * 0.28, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(T * 0.28, 0, T * 0.08, 0, TAU); ctx.fillStyle = '#d6453b'; ctx.fill();
      ctx.restore();
    },
    wheel(ctx, T, r, a, time) {
      // water
      ctx.strokeStyle = 'rgba(90,183,230,0.75)'; ctx.lineWidth = T * 0.06; ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const off = ((time * 0.6 + k / 3) % 1);
        ctx.globalAlpha = 1 - off;
        ctx.beginPath(); ctx.moveTo(-T * 0.5, -T * 0.42 + off * T * 0.1); ctx.quadraticCurveTo(-T * 0.2, -T * 0.5, -T * 0.05 + off * T * 0.2, -T * 0.35 + off * T * 0.2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.save(); ctx.rotate(a);
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = T * 0.05;
      ctx.beginPath(); ctx.arc(0, 0, T * 0.36, 0, TAU); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const t = i * TAU / 8;
        ctx.save(); ctx.rotate(t);
        ctx.fillStyle = '#b07a43'; ctx.fillRect(T * 0.3, -T * 0.05, T * 0.18, T * 0.1);
        ctx.strokeStyle = '#6a431f'; ctx.lineWidth = T * 0.025; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(T * 0.33, 0); ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, T * 0.09, 0, TAU); ctx.fillStyle = '#4e3217'; ctx.fill();
      ctx.restore();
    },
    conveyor(ctx, T, r, a) {
      drawGear(ctx, T, 8, a, { fill: COL.steel, dark: COL.steelDark, light: COL.steelLight, out: 0.42, root: 0.33 });
      roundRect(ctx, -T * 0.46, -T * 0.15, T * 0.92, T * 0.3, T * 0.15);
      ctx.fillStyle = '#1e252e'; ctx.fill(); ctx.strokeStyle = '#59677a'; ctx.lineWidth = T * 0.02; ctx.stroke();
      const rr = T * 0.11;
      for (const x of [-T * 0.31, T * 0.31]) {
        ctx.save(); ctx.translate(x, 0); ctx.rotate(a);
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fillStyle = '#7d8ea3'; ctx.fill();
        ctx.strokeStyle = '#2b3542'; ctx.lineWidth = T * 0.02; ctx.beginPath(); ctx.moveTo(-rr, 0); ctx.lineTo(rr, 0); ctx.moveTo(0, -rr); ctx.lineTo(0, rr); ctx.stroke();
        ctx.restore();
      }
      // chevrons and crate on top run
      const run = T * 0.62, shift = ((a * rr) % run + run) % run;
      ctx.strokeStyle = 'rgba(242,184,75,0.9)'; ctx.lineWidth = T * 0.025;
      for (let k = 0; k < 3; k++) {
        const x = -run / 2 + ((k * run / 3 + shift) % run);
        ctx.beginPath(); ctx.moveTo(x - T * 0.03, -T * 0.06); ctx.lineTo(x + T * 0.02, 0); ctx.lineTo(x - T * 0.03, T * 0.06); ctx.stroke();
      }
      const cx = -run / 2 + ((shift * 0.5 + run * 0.25) % run);
      roundRect(ctx, cx - T * 0.08, -T * 0.32, T * 0.16, T * 0.15, T * 0.02); ctx.fillStyle = '#b8864a'; ctx.fill();
      ctx.strokeStyle = '#6b4a22'; ctx.lineWidth = T * 0.015; ctx.stroke();
    },
    pump(ctx, T, r, a, time) {
      drawGear(ctx, T, 8, a, { fill: COL.steel, dark: COL.steelDark, light: COL.steelLight, out: 0.42, root: 0.33 });
      ctx.fillStyle = '#2f6f99'; ctx.fillRect(-T * 0.06, -T * 0.5, T * 0.12, T * 0.3);
      roundRect(ctx, -T * 0.22, -T * 0.22, T * 0.44, T * 0.36, T * 0.08);
      const g = ctx.createLinearGradient(0, -T * 0.22, 0, T * 0.14); g.addColorStop(0, '#4fa3d4'); g.addColorStop(1, '#1d4f73');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#a7dbf6'; ctx.lineWidth = T * 0.02; ctx.stroke();
      if (r && r.rpm > 0) {
        ctx.fillStyle = '#bfe9ff';
        for (let k = 0; k < 3; k++) {
          const p = ((time * r.rpm / 40 + k / 3) % 1);
          ctx.globalAlpha = 1 - p;
          ctx.beginPath(); ctx.arc(0, -T * 0.22 - p * T * 0.28, T * 0.035, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.save(); ctx.rotate(a);
      ctx.strokeStyle = '#d9f1ff'; ctx.lineWidth = T * 0.025;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i * TAU / 3) * T * 0.11, Math.sin(i * TAU / 3) * T * 0.11); ctx.stroke(); }
      ctx.restore();
    },
    xbelt(ctx, T, r, a, time) {
      const px = T * 0.38, pr = T * 0.1;
      const off = r && r.rpm ? (time * r.rpm * 0.02 * (r.dir || 1)) % 1 : 0;
      ctx.setLineDash([T * 0.06, T * 0.04]); ctx.lineDashOffset = -off * T * 0.5;
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = T * 0.07;
      ctx.beginPath(); ctx.moveTo(-px, -pr); ctx.lineTo(px, pr); ctx.moveTo(-px, pr); ctx.lineTo(px, -pr); ctx.stroke();
      ctx.strokeStyle = '#c45b3c'; ctx.lineWidth = T * 0.045;
      ctx.beginPath(); ctx.moveTo(-px, -pr); ctx.lineTo(px, pr); ctx.moveTo(-px, pr); ctx.lineTo(px, -pr); ctx.stroke();
      ctx.setLineDash([]);
      for (const x of [-px, px]) { ctx.beginPath(); ctx.arc(x, 0, pr, 0, TAU); ctx.fillStyle = '#5f6e80'; ctx.fill(); ctx.strokeStyle = '#c45b3c'; ctx.lineWidth = T * 0.03; ctx.stroke(); }
      ctx.fillStyle = 'rgba(234,242,251,0.85)';
      for (const x of [-T * 0.48, T * 0.48]) { ctx.beginPath(); ctx.moveTo(x, -T * 0.06); ctx.lineTo(x + (x < 0 ? 1 : -1) * T * 0.06, 0); ctx.lineTo(x, T * 0.06); ctx.fill(); }
    }
  };

  function drawPart(ctx, tile, T, r, angle, time) {
    if (P[tile.type].wire) { drawWire(ctx, tile, T, r, time); return; }
    const rot = tile.rot * Math.PI / 2;
    ctx.save(); ctx.rotate(rot);
    BODY[tile.type](ctx, T, r, angle || 0, time || 0, rot, tile);
    ctx.restore();
  }

  function drawIcon(canvas, type) {
    const dpr = root.devicePixelRatio || 1;
    const S = canvas.clientWidth || 48;
    canvas.width = S * dpr; canvas.height = S * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    const tile = { type, rot: 0, on: true };
    drawPart(ctx, tile, S * 0.92, null, 0.3, 0);
  }

  root.GS = Object.assign(root.GS || {}, { render: { drawPart, drawIcon, drawGear, roundRect, COL } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
