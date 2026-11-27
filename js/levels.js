/* GearSpark — level data.
 * fixed:    [type, x, y, rot, extra]   parts already on the board (locked)
 * inv:      parts the player can place
 * solution: one verified solution (used by test/verify-levels.mjs, never shown in-game)
 * traps:    common wrong answers that must NOT win (also verified)
 */
(function (root) {
  'use strict';

  const WORLDS = [
    { id: 'w1', name: 'Home Wiring', tag: 'Circuits', color: '#f2b84b', blurb: 'Loops, switches, series, parallel, resistors and diodes.' },
    { id: 'w2', name: 'Gear Workshop', tag: 'Mechanics', color: '#7cc4e8', blurb: 'Gear trains, direction, speed ratios and belts.' },
    { id: 'w3', name: 'Motor Factory', tag: 'Electric → Motion', color: '#8fd18a', blurb: 'Motors turn electricity into rotation.' },
    { id: 'w4', name: 'Power Station', tag: 'Motion → Electric', color: '#e88f6a', blurb: 'Dynamos turn rotation back into electricity.' }
  ];

  const L = [];

  // ---------------- WORLD 1: HOME WIRING ----------------
  L.push({
    id: '1-1', world: 0, name: 'First Light', w: 3, h: 3,
    intro: 'Drag the corner wires onto the empty squares. Tap a part to rotate it. Close the loop so current can flow from + back to −.',
    hint: 'Each corner must point into its two neighbours. Watch the copper ends line up.',
    concept: { title: 'A circuit must be a closed loop', text: 'Current flows out of the battery’s + terminal, through the bulb, and back into the − terminal. Break the loop anywhere and the current stops everywhere.' },
    blocked: [[1, 1]],
    fixed: [['battery', 1, 0, 0], ['bulb', 1, 2, 0], ['wire_i', 0, 1, 0], ['wire_i', 2, 1, 0]],
    inv: { wire_l: 4 },
    goals: [{ type: 'lit', at: [1, 2] }],
    par: 4,
    solution: [['wire_l', 0, 0, 1], ['wire_l', 2, 0, 2], ['wire_l', 2, 2, 3], ['wire_l', 0, 2, 0]]
  });

  L.push({
    id: '1-2', world: 0, name: 'Flip the Switch', w: 3, h: 3,
    intro: 'Finish the loop, then tap the switch to close it.',
    hint: 'A switch is just a gap you can open and close. Closed = connected.',
    concept: { title: 'Switches control the whole loop', text: 'Opening a switch anywhere in a series loop stops current in every part of that loop. That is how every light switch in your house works.' },
    blocked: [[1, 1]],
    fixed: [['battery', 1, 0, 0], ['bulb', 1, 2, 0], ['switch', 2, 1, 1, { on: false }]],
    inv: { wire_l: 4, wire_i: 1 },
    goals: [{ type: 'lit', at: [1, 2] }],
    par: 5,
    solution: [['wire_l', 0, 0, 1], ['wire_l', 2, 0, 2], ['wire_l', 2, 2, 3], ['wire_l', 0, 2, 0], ['wire_i', 0, 1, 0]],
    toggles: [[2, 1, true]],
    traps: [{ note: 'switch left open', place: [['wire_l', 0, 0, 1], ['wire_l', 2, 0, 2], ['wire_l', 2, 2, 3], ['wire_l', 0, 2, 0], ['wire_i', 0, 1, 0]] }]
  });

  L.push({
    id: '1-3', world: 0, name: 'Side by Side', w: 3, h: 3,
    intro: 'Two bulbs, one battery. Give each bulb its own path back to the battery.',
    hint: 'T-junctions split the current. Each bulb gets the full 6 V when wired in parallel.',
    concept: { title: 'Parallel circuits', text: 'In parallel, every branch gets the full battery voltage, so both bulbs shine brightly. The battery supplies more total current (I = V ÷ R for each branch, added together).' },
    fixed: [['battery', 1, 0, 0], ['bulb', 1, 1, 0], ['bulb', 1, 2, 0]],
    inv: { wire_l: 4, wire_t: 2 },
    goals: [{ type: 'lit', at: [1, 1], label: 'A' }, { type: 'lit', at: [1, 2], label: 'B' }],
    par: 6,
    solution: [['wire_l', 0, 0, 1], ['wire_l', 2, 0, 2], ['wire_t', 0, 1, 3], ['wire_t', 2, 1, 1], ['wire_l', 0, 2, 0], ['wire_l', 2, 2, 3]]
  });

  L.push({
    id: '1-4', world: 0, name: 'Stack the Cells', w: 4, h: 3,
    intro: 'Two bulbs in series share the voltage and glow dim. Add a second battery in series to boost the voltage.',
    hint: 'Batteries in series add up: + of one must face − of the next. Backwards, they cancel out.',
    concept: { title: 'Series voltages add', text: 'Bulbs in series split the voltage: two 12 Ω bulbs on 6 V get about 3 V each, too dim. Two 6 V cells in series give 12 V, so each bulb gets about 6 V. Reverse one cell and they cancel to 0 V.' },
    blocked: [[1, 1], [2, 1]],
    fixed: [['battery', 1, 0, 0], ['bulb', 1, 2, 0], ['bulb', 2, 2, 0]],
    inv: { battery: 1, wire_l: 4, wire_i: 2 },
    goals: [{ type: 'lit', at: [1, 2], label: 'A' }, { type: 'lit', at: [2, 2], label: 'B' }],
    par: 7,
    solution: [['battery', 2, 0, 0], ['wire_l', 0, 0, 1], ['wire_l', 3, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 3, 1, 0], ['wire_l', 0, 2, 0], ['wire_l', 3, 2, 3]],
    traps: [
      { note: 'second battery reversed', place: [['battery', 2, 0, 2], ['wire_l', 0, 0, 1], ['wire_l', 3, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 3, 1, 0], ['wire_l', 0, 2, 0], ['wire_l', 3, 2, 3]] },
      { note: 'wire instead of battery (6 V only)', place: [['wire_i', 2, 0, 1], ['wire_l', 0, 0, 1], ['wire_l', 3, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 3, 1, 0], ['wire_l', 0, 2, 0], ['wire_l', 3, 2, 3]] }
    ]
  });

  L.push({
    id: '1-5', world: 0, name: 'Resist the Surge', w: 4, h: 3,
    intro: '12 V is too much for a 6 V bulb: it will burn out. Use a resistor to take some of the voltage.',
    hint: 'A 12 Ω resistor in series with the 12 Ω bulb splits the 12 V roughly in half.',
    concept: { title: 'Resistors share the voltage', text: 'In a series loop the voltage divides in proportion to resistance (V = I × R). Equal resistances get equal shares, so the bulb gets a safe ~6 V instead of ~11 V.' },
    blocked: [[1, 1], [2, 1]],
    fixed: [['battery', 1, 0, 0], ['battery', 2, 0, 0], ['bulb', 1, 2, 0]],
    inv: { resistor: 1, wire_l: 4, wire_i: 3 },
    goals: [{ type: 'lit', at: [1, 2] }],
    par: 7,
    solution: [['resistor', 2, 2, 0], ['wire_l', 0, 0, 1], ['wire_l', 3, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 3, 1, 0], ['wire_l', 0, 2, 0], ['wire_l', 3, 2, 3]],
    traps: [{ note: 'no resistor → bulb burns out', place: [['wire_i', 2, 2, 1], ['wire_l', 0, 0, 1], ['wire_l', 3, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 3, 1, 0], ['wire_l', 0, 2, 0], ['wire_l', 3, 2, 3]] }]
  });

  L.push({
    id: '1-6', world: 0, name: 'One-Way Street', w: 4, h: 3,
    intro: 'Light bulb A but keep bulb B dark. Diodes only let current through in one direction.',
    hint: 'Current flows from the right rail to the left rail here. Point the diode’s arrow the same way.',
    concept: { title: 'Diodes are one-way valves', text: 'A diode conducts from anode to cathode (the way its arrow points) and blocks the reverse. Bulb B’s diode faces backwards, so B stays dark. Diodes protect electronics from batteries put in the wrong way.' },
    fixed: [['wire_l', 0, 0, 1], ['battery', 1, 0, 0], ['wire_i', 2, 0, 1], ['wire_l', 3, 0, 2],
            ['bulb', 1, 1, 0], ['bulb', 1, 2, 0], ['diode', 2, 2, 0], ['wire_l', 0, 2, 0], ['wire_l', 3, 2, 3]],
    inv: { diode: 1, wire_t: 2 },
    goals: [{ type: 'lit', at: [1, 1], label: 'A' }, { type: 'off', at: [1, 2], label: 'B' }],
    par: 3,
    solution: [['diode', 2, 1, 2], ['wire_t', 0, 1, 3], ['wire_t', 3, 1, 1]],
    traps: [{ note: 'diode backwards', place: [['diode', 2, 1, 0], ['wire_t', 0, 1, 3], ['wire_t', 3, 1, 1]] }]
  });

  // ---------------- WORLD 2: GEAR WORKSHOP ----------------
  L.push({
    id: '2-1', world: 1, name: 'Gear Chain', w: 5, h: 3,
    intro: 'Connect the hand crank to the conveyor with gears. Gears that touch will mesh.',
    hint: 'Every gear in a chain turns the opposite way to its neighbour.',
    concept: { title: 'Meshing gears reverse direction', text: 'When two gears mesh, one turns clockwise and the other counter-clockwise. In a chain the direction alternates: crank ↻, gear ↺, gear ↻, gear ↺, conveyor ↻.' },
    fixed: [['crank', 0, 1, 0], ['conveyor', 4, 1, 0]],
    inv: { gear_s: 3 },
    goals: [{ type: 'spin', at: [4, 1], dir: 'cw', min: 20 }],
    par: 3,
    solution: [['gear_s', 1, 1, 0], ['gear_s', 2, 1, 0], ['gear_s', 3, 1, 0]]
  });

  L.push({
    id: '2-2', world: 1, name: 'Odd or Even?', w: 4, h: 3,
    intro: 'The conveyor must move to the right (clockwise). Two gears turn it the wrong way. Count the meshes!',
    hint: 'A crossed belt carries rotation across a gap and reverses it, without the extra mesh.',
    concept: { title: 'Count the meshes', text: 'Odd number of meshes = opposite direction; even = same direction. On a grid the count is fixed by distance, so engineers use crossed belts or idler arrangements to flip direction.' },
    fixed: [['crank', 0, 1, 0], ['conveyor', 3, 1, 0]],
    inv: { gear_s: 2, xbelt: 1 },
    goals: [{ type: 'spin', at: [3, 1], dir: 'cw', min: 20 }],
    par: 2,
    solution: [['gear_s', 1, 1, 0], ['xbelt', 2, 1, 0]],
    traps: [{ note: 'two gears → wrong direction', place: [['gear_s', 1, 1, 0], ['gear_s', 2, 1, 0]] }]
  });

  L.push({
    id: '2-3', world: 1, name: 'Gear Up', w: 4, h: 3,
    intro: 'The pump needs at least 60 rpm, but the crank only gives 30. Speed it up.',
    hint: 'Idler gears never change the speed. Put the compound gear’s small side (blue) toward the crank and its big side (gold) toward the pump.',
    concept: { title: 'Speed ratio = teeth ratio', text: 'A 16-tooth gear driving an 8-tooth gear makes it spin twice as fast (16 ÷ 8 = 2). A plain gear in between (an idler) changes direction only, not speed. Compound gears put two sizes on one shaft to change speed.' },
    fixed: [['crank', 0, 1, 0], ['pump', 3, 1, 0]],
    inv: { compound: 1, gear_l: 1, gear_s: 1 },
    goals: [{ type: 'spin', at: [3, 1], min: 60 }],
    par: 2,
    solution: [['compound', 1, 1, 2], ['gear_s', 2, 1, 0]],
    traps: [{ note: 'idlers only → still 30 rpm', place: [['gear_l', 1, 1, 0], ['gear_s', 2, 1, 0]] }]
  });

  L.push({
    id: '2-4', world: 1, name: 'Fragile Cargo', w: 4, h: 3,
    intro: 'Glassware on board! Run the conveyor counter-clockwise between 10 and 20 rpm.',
    hint: 'Big side of the compound gear facing the driver halves the speed.',
    concept: { title: 'Gearing down trades speed for force', text: 'An 8-tooth gear driving a 16-tooth gear halves the speed and doubles the turning force (torque). That is why bicycles use a small front gear for climbing hills.' },
    fixed: [['crank', 0, 1, 0], ['conveyor', 3, 1, 0]],
    inv: { compound: 1, gear_s: 2 },
    goals: [{ type: 'spin', at: [3, 1], dir: 'ccw', min: 10, max: 20 }],
    par: 2,
    solution: [['compound', 1, 1, 0], ['gear_s', 2, 1, 0]],
    traps: [
      { note: 'plain gears → 30 rpm, too fast', place: [['gear_s', 1, 1, 0], ['gear_s', 2, 1, 0]] },
      { note: 'compound backwards → 60 rpm', place: [['compound', 1, 1, 2], ['gear_s', 2, 1, 0]] }
    ]
  });

  // ---------------- WORLD 3: MOTOR FACTORY ----------------
  L.push({
    id: '3-1', world: 2, name: 'Motor Start', w: 3, h: 4,
    intro: 'Power the motor. Its gear will drive the conveyor below it.',
    hint: 'Same loop as your first light, with a motor instead of a bulb.',
    concept: { title: 'Motors: electricity → motion', text: 'Current through a motor’s coils creates a magnetic field that pushes against magnets and turns the shaft. More voltage = more speed (here 10 rpm per volt).' },
    blocked: [[1, 1], [0, 3], [2, 3]],
    fixed: [['battery', 1, 0, 0], ['motor', 1, 2, 0], ['conveyor', 1, 3, 0]],
    inv: { wire_l: 4, wire_i: 2 },
    goals: [{ type: 'spin', at: [1, 3], dir: 'cw', min: 30 }],
    par: 6,
    solution: [['wire_l', 0, 0, 1], ['wire_l', 2, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 2, 1, 0], ['wire_l', 2, 2, 3], ['wire_l', 0, 2, 0]]
  });

  L.push({
    id: '3-2', world: 2, name: 'Reverse Polarity', w: 3, h: 5,
    intro: 'Place the battery and a gear so the conveyor runs clockwise.',
    hint: 'Flip the battery around: reversing the current reverses a DC motor.',
    concept: { title: 'Reverse the current, reverse the motor', text: 'A DC motor’s direction depends on which way current flows through it. Swap + and − and it spins backwards. Electric cars and cranes reverse this way.' },
    blocked: [[1, 1], [0, 3], [2, 3], [0, 4], [2, 4]],
    fixed: [['wire_l', 0, 0, 1], ['wire_l', 2, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 2, 1, 0], ['wire_l', 2, 2, 3], ['wire_l', 0, 2, 0],
            ['motor', 1, 2, 0], ['conveyor', 1, 4, 0]],
    inv: { battery: 1, gear_s: 1 },
    goals: [{ type: 'spin', at: [1, 4], dir: 'cw', min: 30 }],
    par: 2,
    solution: [['battery', 1, 0, 2], ['gear_s', 1, 3, 0]],
    traps: [{ note: 'battery normal way → conveyor backwards', place: [['battery', 1, 0, 0], ['gear_s', 1, 3, 0]] }]
  });

  L.push({
    id: '3-3', world: 2, name: 'Two Jobs, One Battery', w: 3, h: 4,
    intro: 'Run the light and the pump at the same time.',
    hint: 'Wire the bulb and the motor in parallel so each gets the full voltage.',
    concept: { title: 'Parallel loads work independently', text: 'Homes wire every socket in parallel: each appliance gets full voltage, and switching one off doesn’t affect the others. The battery delivers the sum of all branch currents.' },
    blocked: [[0, 3], [2, 3]],
    fixed: [['battery', 1, 0, 0], ['bulb', 1, 1, 0], ['motor', 1, 2, 0], ['pump', 1, 3, 0]],
    inv: { wire_l: 4, wire_t: 2 },
    goals: [{ type: 'lit', at: [1, 1] }, { type: 'spin', at: [1, 3], min: 40 }],
    par: 6,
    solution: [['wire_l', 0, 0, 1], ['wire_l', 2, 0, 2], ['wire_t', 0, 1, 3], ['wire_t', 2, 1, 1], ['wire_l', 0, 2, 0], ['wire_l', 2, 2, 3]]
  });

  L.push({
    id: '3-4', world: 2, name: 'Speed Limit', w: 4, h: 4,
    intro: 'The conveyor must run clockwise between 15 and 35 rpm. At full power the motor is too fast.',
    hint: 'A resistor in series lowers the motor’s voltage, and its speed with it.',
    concept: { title: 'Controlling speed with voltage', text: 'A 12 Ω resistor in series takes most of the 6 V, leaving the 6 Ω motor about 2 V (≈20 rpm). Real speed controllers do the same job far more efficiently by switching power on and off very fast (PWM).' },
    blocked: [[1, 1], [2, 1], [0, 3], [2, 3], [3, 3]],
    fixed: [['battery', 1, 0, 0], ['motor', 1, 2, 0], ['conveyor', 1, 3, 0]],
    inv: { wire_l: 4, wire_i: 3, resistor: 1 },
    goals: [{ type: 'spin', at: [1, 3], dir: 'cw', min: 15, max: 35 }],
    par: 8,
    solution: [['wire_i', 2, 0, 1], ['wire_l', 0, 0, 1], ['wire_l', 3, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 3, 1, 0], ['wire_l', 0, 2, 0], ['resistor', 2, 2, 0], ['wire_l', 3, 2, 3]],
    traps: [{ note: 'no resistor → too fast', place: [['wire_i', 2, 0, 1], ['wire_l', 0, 0, 1], ['wire_l', 3, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 3, 1, 0], ['wire_l', 0, 2, 0], ['wire_i', 2, 2, 1], ['wire_l', 3, 2, 3]] }]
  });

  // ---------------- WORLD 4: POWER STATION ----------------
  L.push({
    id: '4-1', world: 3, name: 'Hand-Cranked Light', w: 4, h: 3,
    intro: 'No battery here! Turn the crank to spin the dynamo and light the bulb.',
    hint: 'The dynamo needs about 45 rpm or more. The crank gives 30. Gear it up, then wire the loop.',
    concept: { title: 'Dynamos: motion → electricity', text: 'Spinning a coil near magnets induces a voltage (Faraday’s law). Faster spin = more voltage. At 60 rpm this dynamo makes 6 V. Every power station works this way.' },
    blocked: [[0, 0], [0, 2]],
    fixed: [['crank', 0, 1, 0], ['dynamo', 2, 1, 1], ['bulb', 3, 1, 1]],
    inv: { compound: 1, gear_s: 1, wire_l: 4 },
    goals: [{ type: 'lit', at: [3, 1] }],
    par: 5,
    solution: [['compound', 1, 1, 2], ['wire_l', 2, 0, 1], ['wire_l', 3, 0, 2], ['wire_l', 3, 2, 3], ['wire_l', 2, 2, 0]],
    traps: [{ note: 'no speed-up → 3 V, too dim', place: [['gear_s', 1, 1, 0], ['wire_l', 2, 0, 1], ['wire_l', 3, 0, 2], ['wire_l', 3, 2, 3], ['wire_l', 2, 2, 0]] }]
  });

  L.push({
    id: '4-2', world: 3, name: 'Micro-Hydro', w: 5, h: 3,
    intro: 'A slow water wheel (20 rpm) must light a village bulb. One speed-up stage isn’t enough.',
    hint: 'Chain two compound gears: small side in, big side out, twice. 20 → 40 → 80 rpm.',
    concept: { title: 'Multi-stage gearboxes', text: 'Ratios multiply: ×2 then ×2 = ×4. Wind turbines use multi-stage gearboxes to turn slow blades (~15 rpm) into fast generator speeds (~1500 rpm). Small hydro plants power remote villages the same way.' },
    blocked: [[0, 0], [0, 2]],
    fixed: [['wheel', 0, 1, 0], ['dynamo', 3, 1, 1], ['bulb', 4, 1, 1],
            ['wire_l', 3, 0, 1], ['wire_l', 4, 0, 2], ['wire_l', 4, 2, 3], ['wire_l', 3, 2, 0]],
    inv: { compound: 2, gear_s: 1 },
    goals: [{ type: 'lit', at: [4, 1] }],
    par: 2,
    solution: [['compound', 1, 1, 2], ['compound', 2, 1, 2]],
    traps: [{ note: 'one stage only → 40 rpm, too dim', place: [['compound', 1, 1, 2], ['gear_s', 2, 1, 0]] }]
  });

  L.push({
    id: '4-3', world: 3, name: 'Power Line', w: 5, h: 4,
    intro: 'Crank → dynamo → wires → motor → conveyor. Make the conveyor run clockwise at 30 rpm or more.',
    hint: 'Gear up the dynamo. If the conveyor runs backwards, rotate the motor to reverse its connections.',
    concept: { title: 'Energy can travel as electricity', text: 'Mechanical energy became electrical energy, travelled through wires, and became mechanical energy again. Each conversion loses some energy as heat. That’s why the motor gets ~5.1 V, not the full 6 V.' },
    blocked: [[3, 1], [0, 3], [1, 3], [2, 3], [4, 3]],
    fixed: [['crank', 0, 1, 0], ['dynamo', 2, 1, 1], ['conveyor', 3, 3, 0],
            ['wire_l', 2, 0, 1], ['wire_i', 3, 0, 1], ['wire_l', 4, 0, 2], ['wire_i', 4, 1, 0], ['wire_l', 4, 2, 3], ['wire_l', 2, 2, 0]],
    inv: { compound: 1, gear_s: 1, motor: 1 },
    goals: [{ type: 'spin', at: [3, 3], dir: 'cw', min: 30 }],
    par: 2,
    solution: [['compound', 1, 1, 2], ['motor', 3, 2, 2]],
    traps: [
      { note: 'motor wired the other way → backwards', place: [['compound', 1, 1, 2], ['motor', 3, 2, 0]] },
      { note: 'no speed-up → motor too slow', place: [['gear_s', 1, 1, 0], ['motor', 3, 2, 2]] }
    ]
  });

  L.push({
    id: '4-4', world: 3, name: 'The Energy Chain', w: 5, h: 5,
    intro: 'Battery → motor → gears → dynamo → bulb. Light the bulb without burning it out.',
    hint: 'More speed means more voltage. Too much and the bulb blows. Keep the ratio 1 : 1.',
    concept: { title: 'More is not always better', text: 'Gearing the dynamo up ×2 would make ~11 V and burn out a 6 V bulb. Engineers match the generator’s output to what the load is rated for. That’s why power grids regulate voltage.' },
    blocked: [[1, 1], [3, 0], [4, 0], [3, 1], [4, 1], [0, 3], [0, 4], [1, 4], [2, 4]],
    fixed: [['battery', 1, 0, 0], ['wire_l', 0, 0, 1], ['wire_l', 2, 0, 2], ['wire_i', 0, 1, 0], ['wire_i', 2, 1, 0], ['wire_l', 0, 2, 0], ['wire_l', 2, 2, 3],
            ['motor', 1, 2, 0], ['dynamo', 3, 3, 1], ['wire_l', 3, 2, 1], ['wire_l', 4, 2, 2], ['bulb', 4, 3, 1], ['wire_l', 4, 4, 3], ['wire_l', 3, 4, 0]],
    inv: { gear_s: 1, gear_l: 1, compound: 1 },
    goals: [{ type: 'lit', at: [4, 3] }],
    par: 2,
    solution: [['gear_s', 1, 3, 0], ['gear_l', 2, 3, 0]],
    traps: [
      { note: 'compound ×2 → bulb burns out', place: [['gear_s', 1, 3, 0], ['compound', 2, 3, 2]] },
      { note: 'compound ÷2 → too dim', place: [['gear_s', 1, 3, 0], ['compound', 2, 3, 0]] }
    ]
  });

  const SANDBOX = {
    id: 'sandbox', world: -1, name: 'Sandbox', w: 8, h: 6, sandbox: true,
    intro: 'Unlimited parts. Build anything: test circuits, gear trains and power plants. Tap any part to read its multimeter.',
    concept: { title: 'Free build', text: 'Everything obeys the same physics as the levels: Ohm’s law, Kirchhoff’s laws, gear ratios and energy conversion. Perpetual-motion machines are detected and refused.' },
    fixed: [], inv: {}, goals: [], par: 0
  };

  root.GS = Object.assign(root.GS || {}, { WORLDS, LEVELS: L, SANDBOX });
})(typeof globalThis !== 'undefined' ? globalThis : this);
