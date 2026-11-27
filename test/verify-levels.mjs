// Verifies every level: not already solved at start, stored solution wins within inventory and par,
// and every listed trap (common wrong answer) does NOT win.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['../js/engine.js', '../js/levels.js']) vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'));
const { engine: G, LEVELS } = globalThis.GS;

let fails = 0;
const fmt = (n) => (n === undefined ? '-' : (Math.round(n * 100) / 100).toString());

function apply(level, placements, toggles) {
  const st = G.makeState(level);
  const used = {};
  for (const [type, x, y, rot] of placements) {
    const i = y * level.w + x;
    if (st.blocked[i]) throw new Error(`placement on blocked tile ${x},${y}`);
    if (st.tiles[i]) throw new Error(`placement on occupied tile ${x},${y}`);
    st.tiles[i] = { type, rot, fixed: false };
    used[type] = (used[type] || 0) + 1;
  }
  for (const [x, y, on] of toggles || []) st.tiles[y * level.w + x].on = on;
  return { st, used };
}

for (const lv of LEVELS) {
  const errs = [];
  // start state
  const s0 = G.makeState(lv);
  const r0 = G.evalGoals(lv, s0, G.simulate(s0));
  if (r0.win) errs.push('already solved at start');
  // solution
  try {
    const { st, used } = apply(lv, lv.solution, lv.toggles);
    for (const [t, n] of Object.entries(used)) if ((lv.inv[t] || 0) < n) errs.push(`solution needs ${n}× ${t}, inventory has ${lv.inv[t] || 0}`);
    if (lv.solution.length > lv.par) errs.push(`solution uses ${lv.solution.length} > par ${lv.par}`);
    const res = G.simulate(st);
    const ev = G.evalGoals(lv, st, res);
    if (!ev.win) errs.push('solution does NOT win: ' + JSON.stringify(ev.goals.map((g) => g.ok)) + ' problems=' + ev.problems);
    const readings = ev.goals.map((g) => {
      const r = g.reading;
      return g.goal.type === 'spin' ? `${g.goal.at}: ${fmt(r.rpm)} rpm dir ${r.dir}` : `${g.goal.at}: ${fmt(Math.abs(r.V))} V ${fmt(Math.abs(r.I))} A`;
    }).join(' | ');
    console.log(`${ev.win ? 'PASS' : 'FAIL'} ${lv.id} ${lv.name.padEnd(24)} ${readings}`);
  } catch (e) { errs.push(e.message); }
  // traps
  for (const trap of lv.traps || []) {
    try {
      const { st } = apply(lv, trap.place, trap.toggles);
      const res = G.simulate(st);
      const ev = G.evalGoals(lv, st, res);
      const why = ev.goals.map((g) => {
        const r = g.reading;
        return g.goal.type === 'spin' ? `${fmt(r.rpm)}rpm dir${r.dir}` : `${fmt(Math.abs(r.V || 0))}V${r.blown ? ' BLOWN' : ''}`;
      }).join(',');
      console.log(`     trap "${trap.note}": ${ev.win ? 'WINS (bad!)' : 'correctly fails'} [${why}]`);
      if (ev.win) errs.push(`trap wins: ${trap.note}`);
    } catch (e) { errs.push('trap error: ' + e.message); }
  }
  if (errs.length) { fails++; console.log('   ERRORS:', errs.join('; ')); }
}

// physics sanity checks
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'} physics: ${name}`); if (!cond) fails++; }
{
  // short circuit: battery with wire loop only
  const lv = { w: 3, h: 2, fixed: [['battery', 1, 0, 0], ['wire_l', 0, 0, 1], ['wire_l', 2, 0, 2], ['wire_l', 0, 1, 0], ['wire_i', 1, 1, 1], ['wire_l', 2, 1, 3]] };
  const st = G.makeState(lv); const r = G.simulate(st);
  check('wire across battery = short circuit', r.short);
}
{
  // perpetual motion: dynamo powers motor that drives the same dynamo
  const lv = { w: 3, h: 3, fixed: [['wire_l', 0, 0, 1], ['dynamo', 1, 0, 0], ['wire_l', 2, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 2, 1, 0], ['wire_l', 0, 2, 0], ['motor', 1, 2, 0], ['wire_l', 2, 2, 3], ['gear_s', 1, 1, 0], ['crank', 0, 3, 0]] };
  lv.h = 3;
  const st = G.makeState(lv); const r = G.simulate(st);
  check('motor driving its own dynamo is flagged as perpetual motion', r.perpetual.length > 0);
}
{
  // conflicting drivers jam
  const lv = { w: 3, h: 1, fixed: [['crank', 0, 0, 0], ['crank', 1, 0, 0]] };
  const st = G.makeState(lv); const r = G.simulate(st);
  check('two cranks meshing directly jam', r.jam);
}
console.log(fails ? `\n${fails} FAILURE(S)` : `\nALL ${LEVELS.length} LEVELS + PHYSICS CHECKS PASS`);
process.exit(fails ? 1 : 0);
