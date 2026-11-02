// (03.11.2026) Sunetele alertelor din Studio-ul de streaming — generate în browser (Web Audio),
// fără fișiere audio: nu au drepturi de autor și nu trebuie descărcate. Folosite de
// stream-overlay.html (pe live) și de streamer.html (butonul „Ascultă").
(() => {
  let AC = null, master = null;
  const ac = () => {
    if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.connect(AC.destination); }
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  };
  function tone(f, t0, dur, type = 'sine', vol = .3, f2) {
    const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  function noise(t0, dur, f1, f2, vol = .3) {
    const c = ac(), len = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + t0;
    s.buffer = b; fl.type = 'bandpass'; fl.Q.value = 1.2; fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * .3); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  }
  const SOUND = {
    coin: () => { tone(988, 0, .09, 'square', .18); tone(1319, .08, .4, 'square', .18); },
    pop: () => { tone(420, 0, .12, 'sine', .45, 900); tone(1200, .05, .08, 'triangle', .15); },
    whoosh: () => noise(0, .7, 300, 4000, .5),
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .11, i === 3 ? .7 : .16, 'triangle', .28)),
    laser: () => tone(1600, 0, .35, 'sawtooth', .16, 140),
    bell: () => { tone(880, 0, 1.4, 'sine', .3); tone(1760, 0, .9, 'sine', .12); tone(2640, 0, .5, 'sine', .06); },
    drum: () => { tone(160, 0, .35, 'sine', .7, 45); noise(0, .15, 1800, 800, .25); tone(160, .22, .35, 'sine', .6, 45); },
    magic: () => [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, i * .07, .3, 'sine', .16)),
  };
  window.MRPSound = {
    names: Object.keys(SOUND),
    play(name, vol) {
      if (!SOUND[name]) return;
      try { ac(); master.gain.value = Math.max(0, Math.min(1, (vol ?? 70) / 100)); SOUND[name](); } catch { /* fără sunet */ }
    },
  };
})();
