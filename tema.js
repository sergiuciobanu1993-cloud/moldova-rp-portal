// Tema de sezon a site-ului (07.10.2026) — deocamdată: Halloween.
// Fișierul e încărcat de pwa.js pe toate paginile. Ce face:
//   1) întreabă serverul (/api/tema) dacă e pornită o temă — o pornește /
//      oprește fondatorul din Admin → Dashboard → „Tema site-ului";
//   2) dacă da, pune pe <html> clasa „tema-<nume>", încarcă foaia de stil a
//      temei și adaugă decorul (lilieci, fantome, păianjen, ochi, lună și
//      cimitir, ceață, bandă pe prima pagină) și sunetele;
//   3) ține minte răspunsul pe dispozitiv, ca la vizita următoare tema să apară
//      imediat (pwa.js o aplică înainte să răspundă serverul).
// Butonul cu dovleac (stânga-jos) are trei trepte, ținute minte pe dispozitiv:
//   efecte + sunete → efecte fără sunete → totul oprit.
// Cine are „mișcare redusă" setată în telefon / calculator nu vede animațiile
// și nu aude sunetele de pe pagini.
// Sunetele sunt generate pe loc (fără fișiere audio). Browserul nu lasă niciun
// sunet să pornească înainte ca vizitatorul să apese ceva pe pagină, iar dacă
// vizitatorul a oprit muzica site-ului, tac și sunetele de pe pagini.
// Previzualizare doar pentru tine: adaugă ?tema=halloween la orice adresă
// (rămâne cât ții fila deschisă); ?tema=nu o oprește.
(() => {
  if (window.MRP_TEMA) return;
  const VER = '20261007b'; // aceeași ca în pwa.js — schimbă-le împreună când modifici tema
  const root = document.documentElement;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* mod privat */ } },
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* mod privat */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch { /* mod privat */ } },
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------
  // Sunete — fiecare e „desenat" din oscilatoare și zgomot filtrat.
  // snd.play(nume, volum, k) îl pornește; întoarce durata în secunde (0 dacă
  // sunetul nu se poate porni încă). k = treapta rarității (0–3), unde contează.
  // ------------------------------------------------------------------
  const snd = (() => {
    let ctx = null, master = null;
    const noiseCache = new WeakMap();
    function noise(c, color) {
      let m = noiseCache.get(c);
      if (!m) { m = {}; noiseCache.set(c, m); }
      if (m[color]) return m[color];
      const len = Math.floor(c.sampleRate * 2), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      return (m[color] = buf);
    }
    const osc = (c, type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const gain = (c, v) => { const g = c.createGain(); g.gain.value = v; return g; };
    const filt = (c, type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    // volum: urcă în „a" secunde până la „peak", stă „hold", coboară în „r"
    function env(g, t, a, peak, hold, r) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
    }
    function noiseSrc(c, color, t, dur) {
      const s = c.createBufferSource();
      s.buffer = noise(c, color); s.loop = true;
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
      return s;
    }
    function tone(c, out, t, type, f0, f1, dur, peak, a = 0.01) {
      const o = osc(c, type, f0), g = gain(c, 0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      env(g, t, a, peak, 0, Math.max(0.02, dur - a));
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
    }

    const defs = {
      // clopot de biserică: câteva armonice „strâmbe", cele joase țin mai mult
      bell(c, out, t) {
        const f0 = 208;
        [[0.5, 0.22, 4.6], [1, 0.5, 3.6], [1.19, 0.34, 2.8], [1.5, 0.18, 2.2], [2, 0.36, 2.4], [2.51, 0.14, 1.5], [3.01, 0.1, 1.1], [4.17, 0.06, 0.8]].forEach(([r, a, d]) => {
          const o = osc(c, 'sine', f0 * r), g = gain(c, 0);
          env(g, t, 0.006, a * 0.2, 0, d);
          o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.1);
        });
        const n = noiseSrc(c, 'white', t, 0.03), ng = gain(c, 0);
        env(ng, t, 0.002, 0.08, 0, 0.03);
        n.connect(filt(c, 'highpass', 2500)).connect(ng).connect(out);
        return 4.7;
      },
      // urlet de lup: urcă, ține cu un tremur ușor, coboară
      howl(c, out, t) {
        const lp = filt(c, 'lowpass', 1500), g = gain(c, 0);
        const a = osc(c, 'sine', 250), b = osc(c, 'triangle', 500), bg = gain(c, 0.16);
        [a, b].forEach((o, i) => {
          const m = i ? 2 : 1;
          o.frequency.setValueAtTime(250 * m, t);
          o.frequency.exponentialRampToValueAtTime(425 * m, t + 0.6);
          o.frequency.linearRampToValueAtTime(462 * m, t + 1.7);
          o.frequency.exponentialRampToValueAtTime(300 * m, t + 2.7);
        });
        const lfo = osc(c, 'sine', 5.4), lg = gain(c, 0);
        lg.gain.setValueAtTime(0, t + 0.6); lg.gain.linearRampToValueAtTime(7, t + 1.2);
        lfo.connect(lg); lg.connect(a.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2, t + 0.4);
        g.gain.setValueAtTime(0.2, t + 1.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
        a.connect(lp); b.connect(bg).connect(lp); lp.connect(g).connect(out);
        [a, b, lfo].forEach(o => { o.start(t); o.stop(t + 2.9); });
        return 2.9;
      },
      // bufniță: hu… hu-huu
      owl(c, out, t) {
        const lp = filt(c, 'lowpass', 800);
        lp.connect(out);
        [[0, 0.24], [0.6, 0.2], [0.88, 0.5]].forEach(([at, d]) => {
          const o = osc(c, 'sine', 345), g = gain(c, 0);
          o.frequency.setValueAtTime(345, t + at);
          o.frequency.exponentialRampToValueAtTime(305, t + at + d);
          env(g, t + at, 0.05, 0.2, d * 0.4, d * 0.6);
          o.connect(g).connect(lp); o.start(t + at); o.stop(t + at + d + 0.1);
        });
        return 1.5;
      },
      // liliac: câteva chițăituri subțiri + fâlfâit
      bat(c, out, t) {
        for (let i = 0; i < 5; i++) tone(c, out, t + i * 0.075 + Math.random() * 0.02, 'sine', 6200 - i * 250, 4300, 0.045, 0.1, 0.004);
        const bp = filt(c, 'bandpass', 1100, 1.2);
        bp.connect(out);
        for (let i = 0; i < 7; i++) {
          const n = noiseSrc(c, 'white', t + i * 0.06, 0.03), g = gain(c, 0);
          env(g, t + i * 0.06, 0.004, 0.13, 0, 0.03);
          n.connect(g).connect(bp);
        }
        return 0.55;
      },
      // fantomă: un „uuu" care urcă și coboară
      ghost(c, out, t) {
        const lp = filt(c, 'lowpass', 1600), g = gain(c, 0);
        const a = osc(c, 'sine', 370), b = osc(c, 'sine', 555), bg = gain(c, 0.3);
        [a, b].forEach((o, i) => {
          const m = i ? 1.5 : 1;
          o.frequency.setValueAtTime(370 * m, t);
          o.frequency.exponentialRampToValueAtTime(520 * m, t + 0.8);
          o.frequency.exponentialRampToValueAtTime(430 * m, t + 1.4);
          o.frequency.exponentialRampToValueAtTime(320 * m, t + 2.2);
        });
        const lfo = osc(c, 'sine', 4.2), lg = gain(c, 9);
        lfo.connect(lg); lg.connect(a.frequency);
        const n = noiseSrc(c, 'white', t, 2.3), ng = gain(c, 0.035);
        n.connect(filt(c, 'bandpass', 700, 7)).connect(ng).connect(g);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.13, t + 0.55);
        g.gain.setValueAtTime(0.13, t + 1.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
        a.connect(lp); b.connect(bg).connect(lp); lp.connect(g).connect(out);
        [a, b, lfo].forEach(o => { o.start(t); o.stop(t + 2.4); });
        return 2.4;
      },
      // lespede de piatră trasă + bufnitura de la capăt
      slab(c, out, t) {
        const n = noiseSrc(c, 'brown', t, 0.75), g = gain(c, 0), am = gain(c, 0.6);
        const lfo = osc(c, 'square', 15), lg = gain(c, 0.4);
        lfo.connect(lg); lg.connect(am.gain);
        env(g, t, 0.05, 0.5, 0.5, 0.2);
        n.connect(filt(c, 'lowpass', 520)).connect(am).connect(g).connect(out);
        lfo.start(t); lfo.stop(t + 0.85);
        tone(c, out, t + 0.68, 'sine', 75, 42, 0.28, 0.4, 0.005);
        return 1;
      },
      // scârțâit de lemn (capacul)
      creak(c, out, t) {
        const o = osc(c, 'sawtooth', 48), bp = filt(c, 'bandpass', 800, 9), g = gain(c, 0);
        o.frequency.setValueAtTime(48, t);
        o.frequency.linearRampToValueAtTime(92, t + 0.3);
        o.frequency.linearRampToValueAtTime(66, t + 0.5);
        o.frequency.linearRampToValueAtTime(104, t + 0.7);
        bp.frequency.setValueAtTime(750, t);
        bp.frequency.linearRampToValueAtTime(1500, t + 0.7);
        env(g, t, 0.04, 1.3, 0.45, 0.2);
        o.connect(bp).connect(g).connect(out); o.start(t); o.stop(t + 0.8);
        return 0.8;
      },
      // bufnitură joasă
      thud(c, out, t) {
        tone(c, out, t, 'sine', 95, 40, 0.26, 0.45, 0.004);
        const n = noiseSrc(c, 'brown', t, 0.12), g = gain(c, 0);
        env(g, t, 0.003, 0.3, 0, 0.12);
        n.connect(filt(c, 'lowpass', 320)).connect(g).connect(out);
        return 0.3;
      },
      // se vede culoarea: acord minor rece, mai sus cu cât premiul e mai rar
      reveal(c, out, t, k = 0) {
        const base = [196, 220, 247, 262][Math.max(0, Math.min(3, k))];
        [1, 1.189, 1.498].forEach((r, i) => {
          const o = osc(c, 'triangle', base * r), g = gain(c, 0);
          env(g, t + i * 0.05, 0.07, 0.11, 0.25, 1.1);
          o.connect(g).connect(out); o.start(t); o.stop(t + 1.7);
        });
        if (k >= 2) tone(c, out, t + 0.12, 'sine', base * 4, base * 4, 0.7, 0.05, 0.01);
        return 1.6;
      },
      // râs: câteva „ha" care coboară
      laugh(c, out, t) {
        const f1 = filt(c, 'bandpass', 720, 5), f2 = filt(c, 'bandpass', 1180, 6), mix = gain(c, 1);
        f1.connect(mix); f2.connect(mix); mix.connect(out);
        for (let i = 0; i < 7; i++) {
          const at = t + i * 0.17, f = 178 * Math.pow(0.94, i);
          const o = osc(c, 'sawtooth', f), g = gain(c, 0);
          o.frequency.setValueAtTime(f * 1.12, at);
          o.frequency.exponentialRampToValueAtTime(f * 0.86, at + 0.12);
          env(g, at, 0.012, 0.5 - i * 0.04, 0.03, 0.09);
          o.connect(g); g.connect(f1); g.connect(f2);
          o.start(at); o.stop(at + 0.16);
        }
        return 1.35;
      },
      // premiul: acord de orgă; la premiile rare se aude și râsul
      organ(c, out, t, k = 0) {
        const base = [146.8, 155.6, 164.8, 174.6][Math.max(0, Math.min(3, k))];
        [1, 1.189, 1.498, 2].forEach((r, i) => {
          [[1, 0.5], [2, 0.28], [4, 0.12]].forEach(([h, a]) => {
            const o = osc(c, 'sine', base * r * h), g = gain(c, 0);
            env(g, t + i * 0.06, 0.02, a * 0.12, 0.45, 0.6);
            o.connect(g).connect(out); o.start(t); o.stop(t + 1.4);
          });
        });
        if (k >= 2) { const g = gain(c, 0.8); g.connect(out); defs.laugh(c, g, t + 0.55); return 1.95; }
        return 1.3;
      },
    };

    // contextul audio se creează abia la prima apăsare a vizitatorului
    function unlock() {
      if (!ctx) {
        try {
          const C = window.AudioContext || window.webkitAudioContext;
          ctx = new C();
          master = ctx.createGain();
          master.gain.value = 0.9;
          master.connect(ctx.destination);
        } catch { ctx = null; return; }
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    }
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    return {
      names: Object.keys(defs),
      // target = { ctx, out }: redare într-un alt context (folosit la teste)
      play(name, vol = 1, k = 0, target = null) {
        if (!defs[name]) return 0;
        const c = target ? target.ctx : ctx;
        if (!c || (!target && c.state !== 'running')) return 0;
        const out = c.createGain();
        out.gain.value = vol;
        out.connect(target ? target.out : master);
        try { return defs[name](c, out, c.currentTime + 0.03, k); } catch { return 0; }
      },
    };
  })();

  // ------------------------------------------------------------------
  // Halloween
  // ------------------------------------------------------------------
  const BAT_SVG = '<svg viewBox="-34 -18 68 34" fill="currentColor" aria-hidden="true">'
    + '<path class="wg l" d="M-3-3C-10-11-21-13-32-9.5c3.5 3 4.500 7.500 3.500 13 4-3 8-3 11 1 2.500-3 6.500-3 9.500 1 1-2 2.500-3.500 4.500-3z"/>'
    + '<path class="wg r" d="M3-3C10-11 21-13 32-9.5c-3.500 3-4.500 7.500-3.500 13-4-3-8-3-11 1-2.500-3-6.500-3-9.500 1-1-2-2.500-3.500-4.500-3z"/>'
    + '<ellipse cx="0" cy="2" rx="4.2" ry="7.5"/><circle cx="0" cy="-6" r="3.6"/><path d="M-3.400-7l.8-5.500 2.200 4zM3.400-7l-.8-5.500-2.200 4z"/></svg>';
  const SPIDER_SVG = '<svg viewBox="0 0 40 34" aria-hidden="true"><g fill="none" stroke="#cdb4ff" stroke-width="1.3" stroke-linecap="round">'
    + '<path d="M15 15Q7 8 3 14M14 18Q5 15 1 22M14 21Q6 23 4 30M16 24Q11 29 11 33M25 15Q33 8 37 14M26 18Q35 15 39 22M26 21Q34 23 36 30M24 24Q29 29 29 33"/></g>'
    + '<circle cx="20" cy="21" r="7.5" fill="#1d1529" stroke="#cdb4ff" stroke-width="1"/><circle cx="20" cy="11.5" r="4.6" fill="#1d1529" stroke="#cdb4ff" stroke-width="1"/>'
    + '<circle cx="18.300" cy="10.500" r="1" fill="#ff5a4d"/><circle cx="21.700" cy="10.500" r="1" fill="#ff5a4d"/></svg>';
  const GHOST_SVG = '<svg viewBox="0 0 48 60" aria-hidden="true"><path fill="#efe8ff" d="M24 3C12.500 3 6 12 6 24v31l6-5.500 6 6 6-6 6 6 6-6 6 5.500V24C42 12 35.500 3 24 3z"/>'
    + '<ellipse cx="17" cy="24" rx="3.6" ry="5.2" fill="#1a1024"/><ellipse cx="31" cy="24" rx="3.6" ry="5.2" fill="#1a1024"/><ellipse cx="24" cy="36.500" rx="4" ry="5.2" fill="#1a1024"/></svg>';

  // treptele butonului cu dovleac: 'all' efecte + sunete, 'mute' fără sunete, 'off' nimic
  const MODES = ['all', 'mute', 'off'];
  const MODE_SAVE = { all: '1', mute: 'm', off: '0' };
  const MODE_TEXT = {
    all: ['Efecte și sunete de Halloween: pornite', 'Efectele și sunetele de Halloween sunt pornite.'],
    mute: ['Efecte de Halloween pornite, sunete oprite', 'Efectele rămân, dar sunetele de Halloween sunt oprite.'],
    off: ['Efecte și sunete de Halloween: oprite', 'Ai oprit efectele și sunetele de Halloween pe acest dispozitiv. Apasă din nou pe dovleac ca să le pornești.'],
  };
  let hw = null; // starea decorului de Halloween, cât e pornit

  // sunetele de pe pagini: doar pe treapta „all", cu fila la vedere și numai
  // dacă vizitatorul nu a oprit muzica site-ului (butonul din dreapta-jos)
  function hwSound(name, vol) {
    if (!hw || hw.mode !== 'all' || hw.work || document.hidden) return;
    let k = 0.85;
    try {
      const a = JSON.parse(ls.get('mrp_audio_state') || 'null');
      if (a && (a.muted || a.volume === 0)) return;
      if (a && typeof a.volume === 'number') k = Math.min(1, 0.35 + a.volume * 1.2);
    } catch { /* fără preferință salvată */ }
    snd.play(name, vol * k);
  }

  function hwSpawnBats() {
    if (!hw || !hw.fx || document.hidden) return;
    const small = window.innerWidth < 600;
    const n = Math.random() < 0.35 ? 3 : 1;
    const rev = Math.random() < 0.5;
    const baseY = rand(8, 58), baseT = rand(5.5, 8.5), dy = rand(-22, 10);
    for (let i = 0; i < n; i++) {
      const b = el('div', 'hw-bat' + (rev ? ' rev' : ''), BAT_SVG);
      b.style.setProperty('--y', (baseY + i * rand(3, 7)).toFixed(1) + 'vh');
      b.style.setProperty('--w', Math.round(small ? rand(28, 44) : rand(38, 66)) + 'px');
      b.style.setProperty('--t', (baseT + rand(-0.6, 0.6)).toFixed(2) + 's');
      b.style.setProperty('--dy', dy.toFixed(1) + 'vh');
      b.style.setProperty('--dl', (i * 0.28).toFixed(2) + 's');
      b.addEventListener('animationend', e => { if (e.target === b) b.remove(); });
      hw.decor.appendChild(b);
    }
    if (Math.random() < 0.35) hwSound('bat', 0.6);
  }
  function hwSpawnSpider() {
    if (!hw || !hw.fx || document.hidden) return;
    const s = el('div', 'hw-spider', '<i></i>' + SPIDER_SVG);
    s.style.setProperty('--x', rand(12, 88).toFixed(1) + 'vw');
    s.style.setProperty('--h', Math.round(rand(90, Math.min(220, window.innerHeight * 0.3))) + 'px');
    s.addEventListener('animationend', e => { if (e.target === s) s.remove(); });
    hw.decor.appendChild(s);
  }
  // o fantomă urcă încet de jos, legănându-se
  function hwSpawnGhost() {
    if (!hw || !hw.fx || document.hidden) return;
    const small = window.innerWidth < 600;
    const g = el('div', 'hw-ghost', GHOST_SVG);
    g.style.setProperty('--x', rand(6, 84).toFixed(1) + 'vw');
    g.style.setProperty('--w', Math.round(small ? rand(34, 50) : rand(46, 74)) + 'px');
    g.style.setProperty('--t', rand(13, 19).toFixed(1) + 's');
    g.style.setProperty('--dx', rand(-16, 16).toFixed(1) + 'vw');
    g.addEventListener('animationend', e => { if (e.target === g) g.remove(); });
    hw.decor.appendChild(g);
    if (Math.random() < 0.45) hwSound('ghost', 0.75);
  }
  // o pereche de ochi care clipesc lângă marginea ecranului
  function hwSpawnEyes() {
    if (!hw || !hw.fx || document.hidden) return;
    const e = el('div', 'hw-eyes', '<i></i><i></i>');
    e.style.left = (Math.random() < 0.5 ? rand(1.5, 9) : rand(87, 95)).toFixed(1) + 'vw';
    e.style.top = rand(18, 80).toFixed(1) + 'vh';
    e.style.setProperty('--c', ['#d6ff5a', '#ff9a3d', '#ff5a4d'][Math.floor(Math.random() * 3)]);
    e.addEventListener('animationend', ev => { if (ev.target === e) e.remove(); });
    hw.decor.appendChild(e);
  }
  // din când în când, un sunet de noapte (niciodată același de două ori la rând)
  function hwAmbient() {
    if (!hw) return;
    const pool = ['howl', 'bell', 'owl'].filter(n => n !== hw.lastAmbient);
    hw.lastAmbient = pool[Math.floor(Math.random() * pool.length)];
    hwSound(hw.lastAmbient, hw.lastAmbient === 'bell' ? 0.7 : 0.8);
  }
  // la apăsare sar câțiva lilieci mici din locul acela
  function hwClick(e) {
    if (!hw || !hw.fx || !hw.top) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const now = performance.now();
    if (now - hw.lastClick < 180 || hw.top.childElementCount > 14) return;
    hw.lastClick = now;
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const b = el('i', 'hw-cb');
      b.style.left = e.clientX + 'px';
      b.style.top = e.clientY + 'px';
      b.style.setProperty('--dx', Math.round(rand(-78, 78)) + 'px');
      b.style.setProperty('--dy', Math.round(rand(-120, -36)) + 'px');
      b.style.setProperty('--r', Math.round(rand(-45, 45)) + 'deg');
      b.style.setProperty('--s', rand(0.7, 1.3).toFixed(2));
      b.addEventListener('animationend', () => b.remove());
      hw.top.appendChild(b);
    }
  }
  function hwLoops(on) {
    if (!hw) return;
    hw.timers.forEach(clearTimeout);
    hw.timers = [];
    if (!on) {
      hw.decor.querySelectorAll('.hw-bat,.hw-spider,.hw-ghost,.hw-eyes').forEach(x => x.remove());
      if (hw.top) hw.top.textContent = '';
      return;
    }
    const again = (fn, min, max, first) => {
      const tick = wait => { hw.timers.push(setTimeout(() => { if (!hw || !hw.fx) return; fn(); tick(rand(min, max)); }, wait)); };
      tick(first);
    };
    again(hwSpawnBats, 9000, 17000, 1400);
    again(hwSpawnGhost, 24000, 42000, rand(5000, 9000));
    again(hwSpawnEyes, 14000, 26000, rand(6000, 11000));
    again(hwSpawnSpider, 18000, 32000, rand(9000, 15000));
    again(hwAmbient, 55000, 110000, rand(20000, 38000));
  }
  function hwTip(text) {
    document.querySelector('.hw-tip')?.remove();
    const t = el('div', 'hw-tip');
    t.setAttribute('role', 'status');
    t.textContent = text;
    document.body.appendChild(t);
    clearTimeout(hwTip.timer);
    hwTip.timer = setTimeout(() => t.remove(), 4500);
  }
  function hwSetMode(mode, say) {
    if (!hw) return;
    if (reduced()) mode = 'off';
    hw.mode = MODES.includes(mode) ? mode : 'all';
    hw.fx = hw.mode !== 'off';
    root.classList.toggle('hw-nofx', !hw.fx);
    if (hw.btn) {
      hw.btn.dataset.mode = hw.mode;
      hw.btn.title = MODE_TEXT[hw.mode][0];
      hw.btn.setAttribute('aria-label', MODE_TEXT[hw.mode][0] + '. Apasă ca să schimbi.');
    }
    hwLoops(hw.fx);
    if (say) hwTip(MODE_TEXT[hw.mode][1]);
  }
  // banda de pe prima pagină (textul și linkul vin din Admin)
  function hwBanner(data) {
    const home = (document.body && document.body.dataset.contentPage === 'index') || /^\/(index\.html)?$/i.test(location.pathname);
    const old = document.querySelector('.hw-banner');
    const text = data && data.banner && String(data.banner.text || '').trim();
    const main = document.querySelector('main');
    if (!home || !main || !text || ss.get('mrp_tema_banda_x') === text) { if (old) old.remove(); return; }
    if (old && old.dataset.text === text) return;
    if (old) old.remove();
    const b = el('aside', 'hw-banner', '<span class="hw-banner-ico" aria-hidden="true"></span><p></p>');
    b.dataset.text = text;
    b.querySelector('p').textContent = text;
    const link = String(data.banner.link || '');
    if (/^\/(?![\/\\])/.test(link) || /^https:\/\//i.test(link)) {
      const a = el('a', 'hw-banner-go');
      a.href = link;
      a.textContent = 'Vezi →';
      if (/^https:/i.test(link)) { a.target = '_blank'; a.rel = 'noopener'; }
      b.appendChild(a);
    }
    const x = el('button', 'hw-banner-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Închide banda');
    x.textContent = '✕';
    x.addEventListener('click', () => { ss.set('mrp_tema_banda_x', text); b.remove(); });
    b.appendChild(x);
    main.insertBefore(b, main.firstElementChild);
  }
  function startHalloween(data) {
    if (!document.body) return;
    hwBanner(data);
    if (hw) return;
    // în Admin și în MDT (unelte de lucru): doar culorile și pânza, fără animații și sunete
    const work = /^\/(admin|mdt)/i.test(location.pathname);
    const decor = el('div', 'hw-decor', '<div class="hw-web"></div>' + (work ? '' : '<div class="hw-web l"></div>'));
    decor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(decor);
    hw = { decor, extra: [], btn: null, top: null, timers: [], fx: false, mode: 'off', work, lastClick: 0, lastAmbient: null };
    if (work) { root.classList.add('hw-nofx'); return; }
    // în spatele conținutului: ceața, luna și cimitirul de la marginea de jos
    const fog = el('div', 'hw-fog');
    const night = el('div', 'hw-night', '<i class="hw-moon"></i><i class="hw-graves"></i>');
    hw.top = el('div', 'hw-top');
    [fog, night, hw.top].forEach(x => { x.setAttribute('aria-hidden', 'true'); document.body.appendChild(x); hw.extra.push(x); });
    document.addEventListener('pointerdown', hwClick, { passive: true });
    if (!reduced()) {
      hw.btn = el('button', 'hw-fx', '<span></span>');
      hw.btn.type = 'button';
      hw.btn.addEventListener('click', () => {
        const next = MODES[(MODES.indexOf(hw.mode) + 1) % MODES.length];
        ls.set('mrp_tema_fx', MODE_SAVE[next]);
        hwSetMode(next, true);
      });
      document.body.appendChild(hw.btn);
    }
    const saved = ls.get('mrp_tema_fx');
    hwSetMode(saved === '0' ? 'off' : saved === 'm' ? 'mute' : 'all', false);
  }
  function stopHalloween() {
    if (!hw) return;
    hw.timers.forEach(clearTimeout);
    document.removeEventListener('pointerdown', hwClick);
    [hw.decor, hw.btn, ...hw.extra].forEach(x => x && x.remove());
    document.querySelectorAll('.hw-banner,.hw-tip').forEach(x => x.remove());
    root.classList.remove('hw-nofx');
    hw = null;
  }

  // ------------------------------------------------------------------
  // Pornirea / oprirea unei teme
  // ------------------------------------------------------------------
  const THEMES = {
    halloween: { css: '/tema-halloween.css?v=' + VER, start: startHalloween, stop: stopHalloween },
  };
  let current = null;
  function apply(theme, data) {
    theme = Object.prototype.hasOwnProperty.call(THEMES, theme) ? theme : null;
    for (const name in THEMES) {
      if (name === theme) continue;
      root.classList.remove('tema-' + name);
      THEMES[name].stop();
    }
    const link = document.getElementById('tema-css');
    if (!theme) {
      if (link) link.remove();
    } else {
      root.classList.add('tema-' + theme);
      if (!link) {
        const l = document.createElement('link');
        l.id = 'tema-css'; l.rel = 'stylesheet'; l.href = THEMES[theme].css;
        document.head.appendChild(l);
      } else if (link.getAttribute('href') !== THEMES[theme].css) link.href = THEMES[theme].css;
      THEMES[theme].start(data);
    }
    if (theme !== current) {
      current = theme;
      document.dispatchEvent(new CustomEvent('mrp:tema', { detail: { theme } }));
    }
  }

  // previzualizare (doar în fila asta): ?tema=halloween / ?tema=nu
  const q = /[?&]tema=([a-z-]*)/i.exec(location.search);
  if (q) { if (THEMES[q[1].toLowerCase()]) ss.set('mrp_tema_proba', q[1].toLowerCase()); else ss.del('mrp_tema_proba'); }
  const proba = (() => { const p = ss.get('mrp_tema_proba'); return THEMES[p] ? p : null; })();
  function probaBadge() {
    if (!proba || document.querySelector('.hw-proba') || !document.body) return;
    const b = el('div', 'hw-proba', '<span>Previzualizare temă — o vezi doar tu</span>');
    const x = el('button');
    x.type = 'button';
    x.textContent = 'Închide';
    x.addEventListener('click', () => {
      ss.del('mrp_tema_proba');
      const u = new URL(location.href);
      u.searchParams.delete('tema');
      location.replace(u.pathname + u.search + u.hash);
    });
    b.appendChild(x);
    document.body.appendChild(b);
  }

  let saved = null;
  try { saved = JSON.parse(ls.get('mrp_tema') || 'null'); } catch { saved = null; }
  apply(proba || (saved && saved.theme), saved);
  probaBadge();

  // Pentru celelalte scripturi ale site-ului (ex. deschiderea cutiilor din VIP
  // Shop): ce temă e pornită și redarea unui sunet al temei. Sunetele cerute
  // de aici NU țin de butonul cu dovleac — pagina care le cere are propriul
  // buton de sunet.
  window.MRP_TEMA = {
    get theme() { return current; },
    sounds: snd.names,
    play: (name, opts = {}) => snd.play(name, opts.vol == null ? 1 : opts.vol, opts.k || 0, opts.target || null),
  };

  fetch('/api/tema', { headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!d || typeof d !== 'object') return; // server indisponibil: rămâne ce știam
      const data = { theme: d.theme || null, banner: d.banner || null };
      ls.set('mrp_tema', JSON.stringify(data));
      apply(proba || data.theme, data);
    })
    .catch(() => { /* fără rețea: rămâne ce știam */ });
})();
