/* GearSpark — synthesized sound effects (Web Audio, no files). */
(function (root) {
  'use strict';
  let ac = null, master = null, muted = false;
  function ctx() {
    if (!ac) {
      const A = root.AudioContext || root.webkitAudioContext;
      if (!A) return null;
      ac = new A(); master = ac.createGain(); master.gain.value = 0.35; master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type, vol, slide) {
    if (muted) return; const a = ctx(); if (!a) return;
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, hp) {
    if (muted) return; const a = ctx(); if (!a) return;
    const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = a.createBufferSource(); s.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 1500;
    const g = a.createGain(); g.gain.value = vol || 0.25;
    s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  const SFX = {
    place() { tone(520, 0.07, 'triangle', 0.25); tone(780, 0.05, 'sine', 0.12); },
    rotate() { tone(900, 0.04, 'square', 0.07); },
    remove() { tone(420, 0.09, 'triangle', 0.2, 260); },
    toggle() { tone(1200, 0.03, 'square', 0.1); tone(600, 0.05, 'triangle', 0.15); },
    spark() { noise(0.25, 0.35, 2500); tone(160, 0.2, 'sawtooth', 0.12, 60); },
    clank() { noise(0.12, 0.25, 600); tone(110, 0.15, 'square', 0.1, 70); },
    power() { tone(330, 0.12, 'sine', 0.18, 660); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.25), i * 110)); },
    tap() { tone(700, 0.03, 'sine', 0.1); }
  };
  root.GS = Object.assign(root.GS || {}, {
    sfx: SFX,
    audio: { setMuted(m) { muted = m; }, isMuted() { return muted; }, unlock() { ctx(); } }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
