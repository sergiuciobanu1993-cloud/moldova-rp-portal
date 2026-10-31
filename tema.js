// Tema de sezon a site-ului (07.10.2026) — Halloween și (din 30.10.2026)
// sărbătorile de iarnă („iarna”: ninsoare, beculețe, sanie, clopoței).
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
// sunet să pornească înainte ca vizitatorul să apese ceva pe pagină (pe FIECARE
// pagină deschisă). Sunetele de pe pagini țin doar de butonul cu dovleac — nu
// de butonul de muzică al site-ului. La prima apăsare dintr-o vizită se aude
// un sunet în câteva secunde, apoi cam unul pe minut; ritmul se păstrează când
// treci de la o pagină la alta.
// Previzualizare doar pentru tine: adaugă ?tema=halloween sau ?tema=iarna la orice adresă
// (rămâne cât ții fila deschisă); ?tema=nu o oprește.
(() => {
  if (window.MRP_TEMA) return;
  const VER = '20261031d'; // aceeași ca în pwa.js — schimbă-le împreună când modifici tema
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
      // liliecii care sar la apăsare: câteva bătăi de aripi + un chițăit scurt
      // (puțin diferit de fiecare dată, ca să nu sune ca un bip)
      flap(c, out, t) {
        const bp = filt(c, 'bandpass', 850 + Math.random() * 550, 1.1);
        bp.connect(out);
        for (let i = 0; i < 4; i++) {
          const at = t + i * 0.045, n = noiseSrc(c, 'white', at, 0.03), g = gain(c, 0);
          env(g, at, 0.004, 0.6 - i * 0.09, 0, 0.028);
          n.connect(g).connect(bp);
        }
        const f = 5200 + Math.random() * 1800;
        tone(c, out, t + 0.02, 'sine', f, f * 0.72, 0.04, 0.16, 0.004);
        tone(c, out, t + 0.1, 'sine', f * 0.94, f * 0.68, 0.035, 0.12, 0.004);
        return 0.25;
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

      // ---- (30.10.2026) sunetele temei de iarnă ----
      // clopoței de sanie: câteva scuturături, fiecare din tonuri înalte „metalice"
      jingle(c, out, t) {
        const hp = filt(c, 'highpass', 1800);
        hp.connect(out);
        for (let i = 0; i < 9; i++) {
          const at = t + i * 0.13 + Math.random() * 0.02, acc = i % 4 === 0 ? 1 : 0.6;
          [2350, 3870, 5520, 7150].forEach((f, j) => {
            const o = osc(c, 'sine', f * (1 + (Math.random() - 0.5) * 0.04)), g = gain(c, 0);
            env(g, at, 0.002, (0.07 - j * 0.012) * acc, 0, 0.16 + Math.random() * 0.12);
            o.connect(g).connect(hp); o.start(at); o.stop(at + 0.35);
          });
          const n = noiseSrc(c, 'white', at, 0.05), ng = gain(c, 0);
          env(ng, at, 0.002, 0.07 * acc, 0, 0.05);
          n.connect(filt(c, 'bandpass', 6500, 1.5)).connect(ng).connect(hp);
        }
        return 1.5;
      },
      // cutie muzicală: începutul refrenului din „Jingle Bells" (cântec din 1857)
      musicbox(c, out, t) {
        const E = 659.25, G = 783.99, C = 523.25, D = 587.33, q = 0.2;
        const notes = [[E, 1], [E, 1], [E, 2], [E, 1], [E, 1], [E, 2], [E, 1], [G, 1], [C, 1.5], [D, 0.5], [E, 3]];
        let at = t;
        notes.forEach(([f, d]) => {
          [[1, 0.13], [2, 0.05], [3.01, 0.02]].forEach(([h, a]) => {
            const o = osc(c, 'sine', f * h), g = gain(c, 0);
            env(g, at, 0.004, a, 0, 0.9);
            o.connect(g).connect(out); o.start(at); o.stop(at + 1);
          });
          at += d * q;
        });
        return at - t + 0.9;
      },
      // clopoței în vânt: câteva note înalte, la întâmplare
      chime(c, out, t) {
        const scale = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093];
        for (let i = 0; i < 6; i++) {
          const at = t + i * (0.16 + Math.random() * 0.14), f = scale[Math.floor(Math.random() * scale.length)];
          [[1, 0.08], [2.76, 0.025]].forEach(([h, a]) => {
            const o = osc(c, 'sine', f * h), g = gain(c, 0);
            env(g, at, 0.003, a, 0, 1.6);
            o.connect(g).connect(out); o.start(at); o.stop(at + 1.7);
          });
        }
        return 2.6;
      },
      // „Ho-ho-ho!": trei „ho" pe voce groasă (formante de „o"), tot mai jos
      hohoho(c, out, t) {
        const f1 = filt(c, 'bandpass', 480, 4), f2 = filt(c, 'bandpass', 820, 5), mix = gain(c, 1);
        f1.connect(mix); f2.connect(mix); mix.connect(filt(c, 'lowpass', 2200)).connect(out);
        [[0, 132], [0.36, 124], [0.72, 112]].forEach(([at, f]) => {
          const o = osc(c, 'sawtooth', f), g = gain(c, 0);
          o.frequency.setValueAtTime(f * 1.08, t + at);
          o.frequency.exponentialRampToValueAtTime(f * 0.9, t + at + 0.26);
          env(g, t + at, 0.03, 0.55, 0.12, 0.14);
          o.connect(g); g.connect(f1); g.connect(f2);
          o.start(t + at); o.stop(t + at + 0.32);
          const n = noiseSrc(c, 'white', t + at, 0.05), ng = gain(c, 0);
          env(ng, t + at, 0.004, 0.05, 0, 0.05);
          n.connect(filt(c, 'bandpass', 1400, 1)).connect(ng).connect(out);
        });
        return 1.05;
      },
      // bulgăre de zăpadă care lovește: o bufnitură moale + scrâșnet de zăpadă
      splat(c, out, t) {
        tone(c, out, t, 'sine', 140, 60, 0.18, 0.35, 0.003);
        const n = noiseSrc(c, 'white', t, 0.35), g = gain(c, 0);
        env(g, t, 0.004, 0.22, 0.02, 0.3);
        n.connect(filt(c, 'lowpass', 1800)).connect(g).connect(out);
        return 0.4;
      },
      // aruncarea: un „fâș" scurt prin aer
      whoosh(c, out, t) {
        const n = noiseSrc(c, 'white', t, 0.4), bp = filt(c, 'bandpass', 600, 2), g = gain(c, 0);
        bp.frequency.setValueAtTime(500, t);
        bp.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
        env(g, t, 0.12, 0.18, 0, 0.22);
        n.connect(bp).connect(g).connect(out);
        return 0.4;
      },
      // un clinchet mic, la apăsare
      twinkle(c, out, t) {
        const scale = [1318.5, 1568, 1760, 2093, 2349.3];
        const f = scale[Math.floor(Math.random() * scale.length)];
        tone(c, out, t, 'sine', f, f, 0.5, 0.09, 0.003);
        tone(c, out, t + 0.06, 'sine', f * 1.5, f * 1.5, 0.35, 0.04, 0.003);
        return 0.55;
      },

      // ---- (31.10.2026) cutiile din VIP Shop cu tema de iarnă ----
      // rotirea s-a oprit: o bufnitură moale în zăpadă și un clinchet de clopoțel
      xstop(c, out, t) {
        tone(c, out, t, 'sine', 120, 55, 0.2, 0.3, 0.003);
        const n = noiseSrc(c, 'white', t, 0.16), g = gain(c, 0);
        env(g, t, 0.003, 0.12, 0, 0.14);
        n.connect(filt(c, 'lowpass', 1300)).connect(g).connect(out);
        [2350, 3870, 5520].forEach((f, j) => tone(c, out, t + 0.03, 'sine', f, f, 0.32, 0.05 - j * 0.012, 0.002));
        return 0.4;
      },
      // caseta alunecă din perete: scrâșnet de zăpadă + două scuturături de clopoței
      xslide(c, out, t) {
        const n = noiseSrc(c, 'white', t, 0.7), bp = filt(c, 'bandpass', 700, 1.4), g = gain(c, 0);
        bp.frequency.setValueAtTime(600, t);
        bp.frequency.exponentialRampToValueAtTime(1500, t + 0.6);
        env(g, t, 0.08, 0.12, 0.35, 0.22);
        n.connect(bp).connect(g).connect(out);
        const r = noiseSrc(c, 'brown', t, 0.7), rg = gain(c, 0);
        env(rg, t, 0.06, 0.35, 0.3, 0.25);
        r.connect(filt(c, 'lowpass', 300)).connect(rg).connect(out);
        [0.5, 0.64].forEach((d, i) => [2350, 3870, 5520, 7150].forEach((f, j) =>
          tone(c, out, t + d, 'sine', f * (1 + (Math.random() - 0.5) * 0.04), 0, 0.25, (0.05 - j * 0.01) * (i ? 0.7 : 1), 0.002)));
        return 0.95;
      },
      // se vede culoarea: arpegiu major de celestă, mai sus cu cât premiul e mai rar
      xreveal(c, out, t, k = 0) {
        const base = [523.25, 587.33, 659.25, 698.46][Math.max(0, Math.min(3, k))];
        [1, 1.26, 1.498, 2].forEach((r, i) => {
          [[1, 0.09], [2.76, 0.025], [5.4, 0.008]].forEach(([h, a]) => {
            const o = osc(c, 'sine', base * r * h), g = gain(c, 0);
            env(g, t + i * 0.07, 0.004, a, 0, 1.2);
            o.connect(g).connect(out); o.start(t); o.stop(t + 1.6);
          });
        });
        if (k >= 2) defs.twinkle(c, out, t + 0.32);
        return 1.6;
      },
      // capacul: hârtie de cadou foșnind și o fundă care se desface
      xribbon(c, out, t) {
        let at = t;
        for (let i = 0; i < 5; i++) {
          const d = 0.035 + Math.random() * 0.05, n = noiseSrc(c, 'white', at, d), g = gain(c, 0);
          env(g, at, 0.004, 0.09 + Math.random() * 0.06, 0, d);
          n.connect(filt(c, 'bandpass', 2600 + Math.random() * 1800, 0.9)).connect(g).connect(out);
          at += d + 0.02 + Math.random() * 0.04;
        }
        tone(c, out, at, 'sine', 620, 300, 0.12, 0.12, 0.004);
        return at - t + 0.15;
      },
      // premiul: „Jingle Bells" la cutia muzicală, cu atât mai sus cu cât e mai rar;
      // la rare se aud și clopoțeii de sanie, la legendare și „Ho-ho-ho"
      xwin(c, out, t, k = 0) {
        k = Math.max(0, Math.min(3, k));
        const st = Math.pow(2, [0, 2, 4, 5][k] / 12), q = 0.17;
        const E = 659.25 * st, G = 783.99 * st, C = 523.25 * st, D = 587.33 * st;
        const notes = k >= 2
          ? [[E, 1], [E, 1], [E, 2], [E, 1], [E, 1], [E, 2], [E, 1], [G, 1], [C, 1.5], [D, 0.5], [E, 3]]
          : [[E, 1], [E, 1], [E, 2], [E, 1], [E, 1], [E, 2]];
        let at = t;
        notes.forEach(([f, d]) => {
          [[1, 0.12], [2, 0.045], [3.01, 0.018]].forEach(([h, a]) => {
            const o = osc(c, 'sine', f * h), g = gain(c, 0);
            env(g, at, 0.004, a, 0, 0.8);
            o.connect(g).connect(out); o.start(at); o.stop(at + 0.9);
          });
          at += d * q;
        });
        let end = at - t + 0.8;
        if (k >= 2) { const g = gain(c, 0.55); g.connect(out); defs.jingle(c, g, t + 0.05); end = Math.max(end, 1.55); }
        if (k >= 3) { const g = gain(c, 0.9); g.connect(out); defs.hohoho(c, g, at + 0.1); end = Math.max(end, at - t + 1.15); }
        return end;
      },
    };

    // Contextul audio se creează abia la prima apăsare a vizitatorului și se
    // pornește din evenimentele pe care browserele le acceptă drept „apăsare":
    // pe telefon contează ridicarea degetului (touchend / pointerup / click),
    // nu atingerea — de aceea ascultăm mai multe.
    function unlock() {
      if (!ctx) {
        try {
          const C = window.AudioContext || window.webkitAudioContext;
          ctx = new C();
          master = ctx.createGain();
          master.gain.value = 1;
          master.connect(ctx.destination);
        } catch { ctx = null; return null; }
      }
      if (ctx.state === 'running') return Promise.resolve();
      try { const p = ctx.resume(); return p && p.then ? p.catch(() => {}) : null; } catch { return null; }
    }
    ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    function play(name, vol = 1, k = 0, target = null) {
      if (!defs[name]) return 0;
      const c = target ? target.ctx : ctx;
      if (!c) return 0;
      if (!target && c.state !== 'running') { unlock(); return 0; } // încă blocat de browser
      const out = c.createGain();
      out.gain.value = vol;
      out.connect(target ? target.out : master);
      try { return defs[name](c, out, c.currentTime + 0.03, k); } catch { return 0; }
    }
    return {
      names: Object.keys(defs),
      get ready() { return !!ctx && ctx.state === 'running'; },
      // target = { ctx, out }: redare într-un alt context (folosit la teste)
      play,
      // dintr-o apăsare: pornește sunetul imediat ce browserul dă drumul la
      // audio; dacă asta durează mai mult de „wait" ms, renunță (altfel s-ar
      // strânge mai multe sunete și ar porni toate odată)
      soon(name, vol = 1, wait = 1500) {
        const p = unlock(), asked = Date.now();
        if (ctx && ctx.state === 'running') play(name, vol);
        else if (p) p.then(() => { if (Date.now() - asked <= wait) play(name, vol); });
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

  // sunetele de pe pagini: doar pe treapta „all" a butonului cu dovleac și cu
  // fila la vedere; întoarce true dacă sunetul chiar a pornit
  function hwSound(name, vol) {
    if (!hw || hw.mode !== 'all' || hw.work || document.hidden) return false;
    return snd.play(name, vol) > 0;
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
    if (Math.random() < 0.5) hwSound('bat', 0.8);
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
    if (Math.random() < 0.7) hwSound('ghost', 0.9);
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
  // Din când în când, un sunet de noapte (lup, clopot, bufniță — niciodată
  // același de două ori la rând). Momentul următorului sunet se ține minte cât
  // e deschisă fila, ca navigarea între pagini să nu o ia mereu de la capăt.
  // La prima apăsare din vizită, primul sunet vine în câteva secunde.
  const SND_NEXT = 'mrp_tema_sunet_urm';
  function hwAmbient() {
    if (!hw || hw.mode !== 'all' || document.hidden || !snd.ready) return;
    const now = Date.now();
    let next = Number(ss.get(SND_NEXT)) || 0;
    if (!next) { next = now + rand(2500, 5000); ss.set(SND_NEXT, String(Math.round(next))); }
    if (now < next) return;
    const last = ss.get('mrp_tema_sunet_ult');
    const pool = ['howl', 'bell', 'owl'].filter(n => n !== last);
    const name = pool[Math.floor(Math.random() * pool.length)];
    if (!hwSound(name, name === 'bell' ? 0.9 : 1)) return;
    ss.set('mrp_tema_sunet_ult', name);
    ss.set(SND_NEXT, String(Math.round(now + rand(45000, 90000))));
    // prima dată pe acest dispozitiv: spunem de unde se opresc
    if (!ls.get('mrp_tema_sunet_stiut')) {
      ls.set('mrp_tema_sunet_stiut', '1');
      hwTip('Site-ul are sunete de Halloween. Le poți opri din butonul cu dovleac.', 7000);
    }
  }
  // Sunetul liliecilor de la apăsare. Cu mouse-ul se aude chiar la apăsare; pe
  // ecran tactil abia când atingerea se dovedește a fi o apăsare (evenimentul
  // „click") — altfel ar suna la fiecare început de derulare a paginii.
  function hwFlap(target) {
    if (!hw || hw.mode !== 'all') return;
    if (target && target.closest && target.closest('.hw-fx')) return; // dovleacul are sunetul lui
    const now = performance.now();
    if (now - hw.lastFlap < 180) return;
    hw.lastFlap = now;
    snd.soon('flap', 0.8, 400);
  }
  function hwTap(e) {
    if (!hw || !hw.fx || hw.lastPtr === 'mouse' || performance.now() - hw.lastDown > 900) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    hwFlap(e.target);
  }
  // la apăsare sar câțiva lilieci mici din locul acela
  function hwClick(e) {
    if (!hw || !hw.fx || !hw.top) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const now = performance.now();
    hw.lastPtr = e.pointerType || 'mouse';
    hw.lastDown = now;
    if (hw.lastPtr === 'mouse') hwFlap(e.target);
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
    again(hwAmbient, 3000, 3000, 2500); // doar verifică dacă a venit momentul
  }
  function hwTip(text, ms = 4500) {
    document.querySelector('.hw-tip')?.remove();
    const t = el('div', 'hw-tip');
    t.setAttribute('role', 'status');
    t.textContent = text;
    document.body.appendChild(t);
    clearTimeout(hwTip.timer);
    hwTip.timer = setTimeout(() => t.remove(), ms);
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
    hw = { decor, extra: [], btn: null, top: null, timers: [], fx: false, mode: 'off', work, lastClick: 0, lastFlap: 0, lastDown: 0, lastPtr: '' };
    if (work) { root.classList.add('hw-nofx'); return; }
    // în spatele conținutului: ceața, luna și cimitirul de la marginea de jos
    const fog = el('div', 'hw-fog');
    const night = el('div', 'hw-night', '<i class="hw-moon"></i><i class="hw-graves"></i>');
    hw.top = el('div', 'hw-top');
    [fog, night, hw.top].forEach(x => { x.setAttribute('aria-hidden', 'true'); document.body.appendChild(x); hw.extra.push(x); });
    document.addEventListener('pointerdown', hwClick, { passive: true });
    document.addEventListener('click', hwTap, { passive: true });
    if (!reduced()) {
      hw.btn = el('button', 'hw-fx', '<span></span>');
      hw.btn.type = 'button';
      hw.btn.addEventListener('click', () => {
        const next = MODES[(MODES.indexOf(hw.mode) + 1) % MODES.length];
        ls.set('mrp_tema_fx', MODE_SAVE[next]);
        hwSetMode(next, true);
        // pe treapta cu sunete se aude pe loc un clopot — așa știi că merg
        if (hw.mode === 'all') { snd.soon('bell', 0.9); ss.set(SND_NEXT, String(Date.now() + 40000)); }
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
    document.removeEventListener('click', hwTap);
    [hw.decor, hw.btn, ...hw.extra].forEach(x => x && x.remove());
    document.querySelectorAll('.hw-banner,.hw-tip').forEach(x => x.remove());
    root.classList.remove('hw-nofx');
    hw = null;
  }

  // ------------------------------------------------------------------
  // (30.10.2026) Sărbătorile de iarnă: ninsoare, beculețe pe antet, sat cu
  // (31.10.2026: + Moșul strigă „Ho-ho-ho!” și scapă cadouri, oameni de zăpadă
  // care fac cu mâna și aruncă bulgări, bulgări care se lipesc de ecran)
  //
  // brazi în spate, o sanie care trece din când în când, stele căzătoare,
  // fulgi la apăsare și sunete (clopoței, cutie muzicală). Butonul cu fulg
  // (stânga-jos) are aceleași trei trepte ca dovleacul de Halloween.
  // ------------------------------------------------------------------
  const FLAKE_SVG = '<svg viewBox="-12 -12 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">'
    + '<path d="M0-10V10M-8.700-5L8.700 5M-8.700 5L8.700-5M0-10l-2.600-2.600M0-10l2.600-2.600M0 10l-2.600 2.600M0 10l2.600 2.600"/>'
    + '<path d="M-3.200-6.200L0-4l3.200-2.200M-3.200 6.200L0 4l3.200 2.200"/></g></svg>';
  const SLEIGH_SVG = '<svg viewBox="0 0 220 60" aria-hidden="true"><g fill="currentColor">'
    // doi reni
    + '<path d="M8 30c4-3 10-4 16-3l6-6 2 1-4 6c4 0 8 2 10 5l9 1-1 3-9-1c-2 3-6 4-10 4l-2 9h-3l1-9-6-1-4 8h-3l3-9c-3-1-5-4-5-8z"/>'
    + '<path d="M22 21l-3-7 2-1 3 6 2-6 2 1-3 7zM52 30c4-3 10-4 16-3l6-6 2 1-4 6c4 0 8 2 10 5l9 1-1 3-9-1c-2 3-6 4-10 4l-2 9h-3l1-9-6-1-4 8h-3l3-9c-3-1-5-4-5-8z"/>'
    + '<path d="M66 21l-3-7 2-1 3 6 2-6 2 1-3 7z"/>'
    // hamurile
    + '<path d="M95 36h30v1.600H95zM50 36h8v1.600h-8z" opacity=".8"/>'
    // sania cu Moșul și sacul
    + '<path d="M128 30h44c6 0 10 4 10 10v2h-52z"/><path d="M124 47h66c5 0 8-3 9-7h3c-1 6-6 10-12 10h-66z"/>'
    + '<circle cx="150" cy="21" r="6"/><path d="M144 30c0-6 3-9 6-9s6 3 6 9zM146 16l8-6 6 4-4 2z"/><path d="M160 28c0-9 6-14 13-14 6 0 10 4 10 10 0 3-1 5-2 6z"/>'
    + '</g></svg>';
  // omul de zăpadă: trei bulgări, nas de morcov, fular, joben, mâini de crenguțe (una face cu mâna)
  const SNOWMAN_SVG = '<svg viewBox="0 0 120 150" aria-hidden="true">'
    + '<ellipse cx="60" cy="118" rx="38" ry="32" fill="#f4f9ff"/><ellipse cx="60" cy="70" rx="28" ry="25" fill="#f8fbff"/><circle cx="60" cy="34" r="20" fill="#fbfdff"/>'
    + '<path d="M44 125q16 8 32 0" fill="none" stroke="#d5e4f3" stroke-width="3" stroke-linecap="round"/>'
    + '<g fill="#1d2633"><circle cx="53" cy="29" r="2.600"/><circle cx="67" cy="29" r="2.600"/><circle cx="60" cy="64" r="2.600"/><circle cx="60" cy="76" r="2.600"/><circle cx="60" cy="110" r="2.800"/>'
    + '<circle cx="51" cy="42" r="1.300"/><circle cx="55" cy="44.500" r="1.300"/><circle cx="60" cy="45.500" r="1.300"/><circle cx="65" cy="44.500" r="1.300"/><circle cx="69" cy="42" r="1.300"/></g>'
    + '<path d="M60 34l17 3-17 3z" fill="#ff8a2a"/>'
    + '<path d="M38 52q22 8 44 0l1 7q-23 8-46 0z" fill="#e8414f"/><path d="M70 56l6 20-7 1-4-18z" fill="#c9303d"/>'
    + '<rect x="42" y="4" width="36" height="7" rx="2" fill="#1d2633"/><rect x="47" y="-14" width="26" height="20" rx="2" fill="#1d2633"/><rect x="47" y="0" width="26" height="4" fill="#e8414f"/>'
    + '<path d="M34 70L8 58M14 61l-6-8M14 61l-9 1" fill="none" stroke="#6b4020" stroke-width="3" stroke-linecap="round"/>'
    + '<g class="wn-arm"><path d="M86 70l26-16M106 58l8-6M106 58l3 8" fill="none" stroke="#6b4020" stroke-width="3" stroke-linecap="round"/></g>'
    + '</svg>';
  const WN_MODES_TEXT = {
    all: ['Efecte și sunete de sărbători: pornite', 'Efectele și sunetele de sărbători sunt pornite.'],
    mute: ['Efecte de sărbători pornite, sunete oprite', 'Ninsoarea rămâne, dar sunetele de sărbători sunt oprite.'],
    off: ['Efecte și sunete de sărbători: oprite', 'Ai oprit efectele și sunetele de sărbători pe acest dispozitiv. Apasă din nou pe fulg ca să le pornești.'],
  };
  let wn = null; // starea decorului de iarnă, cât e pornit
  const WN_NEXT = 'mrp_tema_iarna_urm';

  function wnSound(name, vol) {
    if (!wn || wn.mode !== 'all' || wn.work || document.hidden) return false;
    return snd.play(name, vol) > 0;
  }

  // ninsoarea: fulgi desenați pe un singur <canvas>, cu vânt care se schimbă încet
  function wnSnowSize() {
    if (!wn || !wn.cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth, h = window.innerHeight;
    wn.cv.width = Math.round(w * dpr); wn.cv.height = Math.round(h * dpr);
    wn.cv.style.width = w + 'px'; wn.cv.style.height = h + 'px';
    wn.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wn.W = w; wn.H = h;
    const want = Math.round(Math.min(w < 600 ? 70 : 160, (w * h) / 11000));
    while (wn.flakes.length < want) wn.flakes.push(wnFlake(true));
    wn.flakes.length = want;
  }
  function wnFlake(anywhere) {
    const r = Math.random() < 0.12 ? rand(2.6, 4.2) : rand(0.8, 2.4);
    return { x: rand(0, wn.W || 1000), y: anywhere ? rand(0, wn.H || 800) : rand(-40, -8), r,
      vy: 0.35 + r * 0.32 + rand(0, 0.25), ph: rand(0, 6.28), amp: rand(0.2, 0.9), a: rand(0.45, 0.95), star: r > 2.6 };
  }
  function wnSnowFrame(now) {
    if (!wn) return;
    wn.raf = 0;
    if (!wn.fx || document.hidden) return;
    const dt = wn.last ? Math.min(now - wn.last, 60) / 16.7 : 1;
    wn.last = now;
    const cx = wn.cx, W = wn.W, H = wn.H, wind = Math.sin(now / 9000) * 0.45 + Math.sin(now / 3100) * 0.12;
    cx.clearRect(0, 0, W, H);
    for (const f of wn.flakes) {
      f.ph += 0.012 * dt;
      f.y += f.vy * dt;
      f.x += (wind * (0.6 + f.r * 0.25) + Math.sin(f.ph) * f.amp * 0.5) * dt;
      if (f.y > H + 8 || f.x < -20 || f.x > W + 20) Object.assign(f, wnFlake(false), f.x < -20 ? { x: W + 10 } : f.x > W + 20 ? { x: -10 } : {});
      if (f.star) {
        cx.save();
        cx.translate(f.x, f.y); cx.rotate(f.ph * 0.6);
        cx.strokeStyle = 'rgba(235,246,255,' + f.a + ')';
        cx.lineWidth = 1;
        cx.beginPath();
        for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; cx.moveTo(-Math.cos(a) * f.r * 1.6, -Math.sin(a) * f.r * 1.6); cx.lineTo(Math.cos(a) * f.r * 1.6, Math.sin(a) * f.r * 1.6); }
        cx.stroke();
        cx.restore();
      } else {
        cx.fillStyle = 'rgba(255,255,255,' + f.a + ')';
        cx.beginPath(); cx.arc(f.x, f.y, f.r, 0, 6.2832); cx.fill();
      }
    }
    wn.raf = requestAnimationFrame(wnSnowFrame);
  }
  function wnSnow(on) {
    if (!wn || !wn.cv) return;
    if (wn.raf) { cancelAnimationFrame(wn.raf); wn.raf = 0; }
    wn.last = 0;
    if (on && !document.hidden) wn.raf = requestAnimationFrame(wnSnowFrame);
    else wn.cx.clearRect(0, 0, wn.W || 0, wn.H || 0);
  }
  function wnVisibility() { if (wn && wn.fx) wnSnow(!document.hidden); }

  // beculețele de pe antet (sau de sus, pe paginile fără antet)
  function wnGarland() {
    if (!wn) return;
    const host = document.querySelector('.site-header');
    const g = el('div', 'wn-garland' + (host ? '' : ' top'));
    g.setAttribute('aria-hidden', 'true');
    const n = Math.max(10, Math.min(48, Math.round(window.innerWidth / 44)));
    const colors = ['r', 'g', 'y', 'b'];
    for (let i = 0; i < n; i++) {
      const b = el('i', 'c-' + colors[i % 4]);
      b.style.left = ((i + 0.5) / n * 100).toFixed(2) + '%';
      b.style.setProperty('--d', ((i % 4) * 0.6 + Math.floor(i / 4) % 2 * 0.15).toFixed(2) + 's'); // aprinse în valuri, pe culori
      b.style.setProperty('--sag', (Math.sin(((i + 0.5) / n) * Math.PI * Math.max(4, Math.round(n / 6))) ** 2 * 7).toFixed(1) + 'px');
      g.appendChild(b);
    }
    (host || document.body).appendChild(g);
    wn.extra.push(g);
  }

  function wnSpawnSleigh() {
    if (!wn || !wn.fx || document.hidden) return;
    const small = window.innerWidth < 600;
    const s = el('div', 'wn-sleigh' + (Math.random() < 0.5 ? ' rev' : ''), SLEIGH_SVG + '<b class="wn-trail"></b>');
    s.style.setProperty('--y', rand(9, 30).toFixed(1) + 'vh');
    s.style.setProperty('--w', Math.round(small ? rand(120, 160) : rand(170, 240)) + 'px');
    s.style.setProperty('--t', rand(13, 18).toFixed(1) + 's');
    s.style.setProperty('--dy', rand(-8, 6).toFixed(1) + 'vh');
    s.addEventListener('animationend', e => { if (e.target === s) s.remove(); });
    wn.decor.appendChild(s);
    wnSound('jingle', 0.7);
    // Moșul strigă „Ho-ho-ho!" și lasă să cadă câteva cadouri
    wn.timers.push(setTimeout(() => { if (wn && wn.fx) wnSound('hohoho', 0.9); }, 1800));
    const T = parseFloat(s.style.getPropertyValue('--t')) * 1000;
    for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) {
      wn.timers.push(setTimeout(() => {
        if (!wn || !wn.fx || !s.isConnected) return;
        const r = s.getBoundingClientRect();
        if (r.right < 0 || r.left > window.innerWidth) return;
        const g = el('i', 'wn-gift c' + Math.floor(Math.random() * 3));
        g.style.left = (r.left + r.width * (s.classList.contains('rev') ? 0.25 : 0.75)) + 'px';
        g.style.top = (r.top + r.height * 0.6) + 'px';
        g.style.setProperty('--dx', Math.round(rand(-60, 60)) + 'px');
        g.style.setProperty('--r', Math.round(rand(-200, 200)) + 'deg');
        g.addEventListener('animationend', () => g.remove());
        wn.decor.appendChild(g);
      }, T * rand(0.25, 0.7)));
    }
  }
  // un om de zăpadă iese de jos, face cu mâna, apoi se ascunde; dacă îl
  // apeși, aruncă un bulgăre
  function wnSpawnSnowman() {
    if (!wn || !wn.fx || document.hidden || wn.decor.querySelector('.wn-snowman')) return;
    const small = window.innerWidth < 600;
    const left = Math.random() < 0.5;
    const m = el('div', 'wn-snowman' + (left ? '' : ' r'), SNOWMAN_SVG);
    m.style.left = (left ? rand(10, 26) : rand(66, 80)).toFixed(1) + 'vw';
    m.style.setProperty('--w', Math.round(small ? rand(74, 92) : rand(112, 140)) + 'px');
    m.title = 'Aruncă un bulgăre!';
    m.addEventListener('pointerdown', ev => {
      ev.stopPropagation();
      const r = m.getBoundingClientRect();
      wnThrow(r.left + r.width / 2, r.top + r.height * 0.3);
    });
    m.addEventListener('animationend', e => { if (e.target === m) m.remove(); });
    wn.decor.appendChild(m);
    if (Math.random() < 0.6) wnSound('chime', 0.5);
  }
  // un bulgăre zboară într-un arc și se lipește de „geam", apoi se topește la vale
  function wnThrow(fromX, fromY) {
    if (!wn || !wn.fx || document.hidden || !wn.top) return;
    const W = window.innerWidth, H = window.innerHeight;
    const sx = fromX != null ? fromX : (Math.random() < 0.5 ? -30 : W + 30);
    const sy = fromY != null ? fromY : H * rand(0.75, 0.95);
    const tx = rand(W * 0.2, W * 0.8), ty = rand(H * 0.18, H * 0.55);
    const ball = el('i', 'wn-ball');
    ball.style.left = sx + 'px'; ball.style.top = sy + 'px';
    ball.style.setProperty('--dx', Math.round(tx - sx) + 'px');
    ball.style.setProperty('--dy', Math.round(ty - sy) + 'px');
    ball.style.setProperty('--arc', Math.round(-Math.min(220, Math.abs(tx - sx) * 0.35 + 60)) + 'px');
    wn.top.appendChild(ball);
    wnSound('whoosh', 0.7);
    ball.addEventListener('animationend', () => {
      ball.remove();
      if (!wn) return;
      const sp = el('i', 'wn-splat');
      sp.style.left = tx + 'px'; sp.style.top = ty + 'px';
      sp.style.setProperty('--r', Math.round(rand(0, 360)) + 'deg');
      sp.style.setProperty('--s', rand(0.85, 1.25).toFixed(2));
      sp.addEventListener('animationend', () => sp.remove());
      wn.top.appendChild(sp);
      wnSound('splat', 0.9);
    }, { once: true });
  }
  const SLED_SVG = '<svg class="wn-sled" viewBox="0 0 160 40" aria-hidden="true"><path d="M14 8h120c6 0 10 4 10 10v4H24z" fill="#c9303d"/><path d="M18 14h118" stroke="#ffd25a" stroke-width="2"/>'
    + '<path d="M30 22v8M70 22v8M110 22v8" stroke="#8a5a2b" stroke-width="3"/><path d="M6 34h132c8 0 12-4 14-10" fill="none" stroke="#d9e4ee" stroke-width="3.500" stroke-linecap="round"/></svg>';
  // omul de zăpadă trece pe sanie prin josul ecranului
  function wnSpawnSledman() {
    if (!wn || !wn.fx || document.hidden || wn.decor.querySelector('.wn-sledman')) return;
    const small = window.innerWidth < 600;
    const rev = Math.random() < 0.5;
    const m = el('div', 'wn-sledman' + (rev ? ' rev' : ''), '<span class="wn-sm">' + SNOWMAN_SVG + '</span>' + SLED_SVG);
    m.style.setProperty('--w', Math.round(small ? rand(96, 116) : rand(140, 176)) + 'px');
    m.style.setProperty('--t', rand(8.5, 12).toFixed(1) + 's');
    m.title = 'Aruncă un bulgăre!';
    m.addEventListener('pointerdown', ev => { ev.stopPropagation(); const r = m.getBoundingClientRect(); wnThrow(r.left + r.width / 2, r.top + r.height * 0.3); });
    m.addEventListener('animationend', e => { if (e.target === m) m.remove(); });
    wn.decor.appendChild(m);
    wnSound('whoosh', 0.5);
    wn.timers.push(setTimeout(() => { if (wn && wn.fx) wnSound('jingle', 0.5); }, 600));
  }
  // un om de zăpadă se uită de după marginea ecranului, face cu mâna și uneori aruncă un bulgăre
  function wnSpawnPeek() {
    if (!wn || !wn.fx || document.hidden || wn.decor.querySelector('.wn-peek')) return;
    const small = window.innerWidth < 600;
    const left = Math.random() < 0.5;
    const m = el('div', 'wn-peek ' + (left ? 'l' : 'r'), SNOWMAN_SVG);
    m.style.setProperty('--y', rand(26, 62).toFixed(1) + 'vh');
    m.style.setProperty('--w', Math.round(small ? rand(70, 86) : rand(100, 128)) + 'px');
    m.title = 'Aruncă un bulgăre!';
    const toss = () => { const r = m.getBoundingClientRect(); wnThrow(left ? r.right - 10 : r.left + 10, r.top + r.height * 0.35); };
    m.addEventListener('pointerdown', ev => { ev.stopPropagation(); toss(); });
    m.addEventListener('animationend', e => { if (e.target === m) m.remove(); });
    wn.decor.appendChild(m);
    if (Math.random() < 0.5) wn.timers.push(setTimeout(() => { if (wn && wn.fx && m.isConnected) toss(); }, 3000));
  }
  function wnSpawnSnowball() { if (wn && wn.fx && !document.hidden && wn.top && wn.top.querySelectorAll('.wn-splat').length < 3) wnThrow(); }
  function wnSpawnStar() {
    if (!wn || !wn.fx || document.hidden) return;
    const st = el('i', 'wn-star');
    st.style.left = rand(30, 95).toFixed(1) + 'vw';
    st.style.top = rand(3, 30).toFixed(1) + 'vh';
    st.addEventListener('animationend', () => st.remove());
    wn.decor.appendChild(st);
  }
  function wnAmbient() {
    if (!wn || wn.mode !== 'all' || document.hidden || !snd.ready) return;
    const now = Date.now();
    let next = Number(ss.get(WN_NEXT)) || 0;
    if (!next) { next = now + rand(3000, 6000); ss.set(WN_NEXT, String(Math.round(next))); }
    if (now < next) return;
    const last = ss.get('mrp_tema_iarna_ult');
    const pool = ['musicbox', 'chime', 'jingle', 'bell'].filter(n => n !== last);
    const name = pool[Math.floor(Math.random() * pool.length)];
    if (!wnSound(name, name === 'bell' ? 0.7 : name === 'musicbox' ? 0.9 : 0.8)) return;
    ss.set('mrp_tema_iarna_ult', name);
    ss.set(WN_NEXT, String(Math.round(now + rand(50000, 95000))));
    if (!ls.get('mrp_tema_iarna_sunet_stiut')) {
      ls.set('mrp_tema_iarna_sunet_stiut', '1');
      hwTip('Site-ul are sunete de sărbători. Le poți opri din butonul cu fulg.', 7000);
    }
  }
  // la apăsare: câțiva fulgi sar din locul acela + un clinchet
  function wnRing(target) {
    if (!wn || wn.mode !== 'all') return;
    if (target && target.closest && target.closest('.wn-fx')) return;
    const now = performance.now();
    if (now - wn.lastRing < 180) return;
    wn.lastRing = now;
    snd.soon('twinkle', 0.8, 400);
  }
  function wnTap(e) {
    if (!wn || !wn.fx || wn.lastPtr === 'mouse' || performance.now() - wn.lastDown > 900) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    wnRing(e.target);
  }
  function wnClick(e) {
    if (!wn || !wn.fx || !wn.top) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const now = performance.now();
    wn.lastPtr = e.pointerType || 'mouse';
    wn.lastDown = now;
    if (wn.lastPtr === 'mouse') wnRing(e.target);
    if (now - wn.lastClick < 180 || wn.top.childElementCount > 16) return;
    wn.lastClick = now;
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = el('i', 'wn-cb', FLAKE_SVG);
      f.style.left = e.clientX + 'px';
      f.style.top = e.clientY + 'px';
      f.style.color = ['#ffffff', '#bfe6ff', '#ffd27a'][Math.floor(Math.random() * 3)];
      f.style.setProperty('--dx', Math.round(rand(-80, 80)) + 'px');
      f.style.setProperty('--dy', Math.round(rand(-110, -30)) + 'px');
      f.style.setProperty('--r', Math.round(rand(-120, 120)) + 'deg');
      f.style.setProperty('--s', rand(0.6, 1.2).toFixed(2));
      f.addEventListener('animationend', () => f.remove());
      wn.top.appendChild(f);
    }
  }
  // ---- (31.10.2026) efecte la trecerea între pagini și la deschiderea ferestrelor ----
  const WN_NAV = 'mrp_wn_nav';
  // un fulg care sare dintr-un punct (aceeași animație ca la apăsare)
  function wnBurstAt(x, y, opts = {}) {
    if (!wn || !wn.top) return;
    const n = opts.n || 6;
    for (let i = 0; i < n; i++) {
      const f = el('i', 'wn-cb' + (opts.big ? ' big' : ''), FLAKE_SVG);
      const px = opts.w ? x + rand(-opts.w / 2, opts.w / 2) : x;
      f.style.left = px + 'px';
      f.style.top = y + 'px';
      f.style.color = ['#ffffff', '#bfe6ff', '#ffd27a'][Math.floor(Math.random() * 3)];
      f.style.setProperty('--dx', Math.round(rand(-70, 70)) + 'px');
      f.style.setProperty('--dy', Math.round(rand(opts.up || -120, -25)) + 'px');
      f.style.setProperty('--r', Math.round(rand(-160, 160)) + 'deg');
      f.style.setProperty('--s', rand(0.6, 1.25).toFixed(2));
      f.style.animationDelay = Math.round(rand(0, opts.spread || 0)) + 'ms';
      f.addEventListener('animationend', () => f.remove());
      wn.top.appendChild(f);
    }
  }
  // Plecarea spre altă pagină: o cortină de noapte cu ninsoare coboară peste
  // pagină (~0,3 s), apoi browserul merge mai departe. Dacă pagina nouă se
  // încarcă greu, în mijloc se învârte un fulg.
  function wnNav(e) {
    if (!wn || !wn.fx || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('download') || a.closest('[data-no-fx]')) return;
    if (a.target && a.target !== '_self') return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // doar o ancoră pe aceeași pagină
    if (/^\/(admin|mdt|api)/i.test(url.pathname) || /\.(pdf|zip|apk|png|jpe?g|mp4)$/i.test(url.pathname)) return;
    e.preventDefault();
    ss.set(WN_NAV, String(Date.now()));
    if (wn.mode === 'all') snd.soon('whoosh', 0.7, 200);
    let v = document.querySelector('.wn-veil');
    if (!v) {
      v = el('div', 'wn-veil', '<i class="wn-veil-flake">' + FLAKE_SVG + '</i>');
      v.setAttribute('aria-hidden', 'true');
      document.body.appendChild(v);
    }
    // dacă navigarea nu pornește (ex. e oprită de browser), cortina se ridică singură
    clearTimeout(wn.veilT);
    wn.veilT = setTimeout(() => v.remove(), 6000);
    setTimeout(() => { location.href = url.href; }, 300);
  }
  // întoarcerea cu „Înapoi": browserul poate reda pagina veche din memorie,
  // cu cortina încă trasă — o scoatem
  function wnShow(e) {
    if (e.persisted) document.querySelectorAll('.wn-veil').forEach(x => x.remove());
  }
  // Sosirea pe pagină după un link de pe site: câțiva fulgi cad de sus pe
  // toată lățimea și o lumină rece trece peste antet.
  function wnArrive() {
    const t = Number(ss.get(WN_NAV)) || 0;
    ss.del(WN_NAV);
    if (!wn || !wn.fx || !wn.top || Date.now() - t > 5000) return;
    const w = window.innerWidth;
    const n = Math.min(26, Math.round(w / 55));
    for (let i = 0; i < n; i++) {
      const f = el('i', 'wn-drop', FLAKE_SVG);
      f.style.left = Math.round(rand(0, w)) + 'px';
      f.style.color = ['#ffffff', '#bfe6ff', '#ffd27a', '#ffffff'][i % 4];
      f.style.setProperty('--fy', Math.round(rand(window.innerHeight * 0.35, window.innerHeight * 0.8)) + 'px');
      f.style.setProperty('--fx', Math.round(rand(-60, 60)) + 'px');
      f.style.setProperty('--r', Math.round(rand(-220, 220)) + 'deg');
      f.style.setProperty('--s', rand(0.6, 1.4).toFixed(2));
      f.style.animationDelay = Math.round(rand(0, 450)) + 'ms';
      f.style.animationDuration = Math.round(rand(1500, 2300)) + 'ms';
      f.addEventListener('animationend', () => f.remove());
      wn.top.appendChild(f);
    }
    const g = el('i', 'wn-arrive');
    g.addEventListener('animationend', () => g.remove());
    wn.top.appendChild(g);
  }
  // Ferestrele care se deschid (anunțuri, confirmări, profiluri, secțiuni
  // pliabile): o ramă de lumină rece-aurie le încadrează o clipă, din marginea
  // de sus sar fulgi și se aude un arpegiu scurt de clopoței.
  const WN_POP_SEL = 'dialog,[role="dialog"],[aria-modal="true"],[class*="modal-overlay"],[class*="-overlay"],[id$="-overlay"],.cf-back';
  const WN_POP_SKIP = '.hero-overlay,#reveal-overlay,.wn-top,.wn-decor,.vt-view,.ox-stage,[data-no-fx]';
  const WN_PANEL_SEL = '[role="dialog"],dialog,.news-modal,.modal-box,.modal,[class*="-box"],.panel,.formbox';
  function wnShown(t) {
    if (!t.isConnected || t.hidden || !t.getClientRects().length) return false;
    return getComputedStyle(t).visibility !== 'hidden';
  }
  function wnPanelOf(t) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const small = x => { const r = x.getBoundingClientRect(); return r.width > 40 && r.height > 30 && (r.width < vw * 0.96 || r.height < vh * 0.96); };
    if (small(t)) return t;
    const inner = [...t.querySelectorAll(WN_PANEL_SEL)].find(small) || [...t.children].find(small);
    return inner || null;
  }
  function wnPop(panel, soft) {
    if (!wn || !wn.fx || !wn.top || !panel) return;
    const now = performance.now();
    if (now - (wn.lastPop || 0) < 400) return;
    wn.lastPop = now;
    const r = panel.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    if (!soft) {
      const ring = el('i', 'wn-pop');
      const cs = getComputedStyle(panel);
      Object.assign(ring.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: cs.borderRadius || '12px' });
      ring.addEventListener('animationend', () => ring.remove());
      wn.top.appendChild(ring);
      wnBurstAt(r.left + r.width / 2, Math.max(12, r.top), { n: Math.min(16, Math.round(r.width / 32)), w: r.width * 0.9, up: -140, spread: 180, big: true });
      if (wn.mode === 'all' && snd.ready) snd.play('xreveal', 0.4, 1);
    } else {
      wnBurstAt(r.left + Math.min(r.width, 260) / 2, r.top + 6, { n: 5, w: Math.min(r.width, 260), spread: 120 });
      if (wn.mode === 'all' && snd.ready) snd.play('twinkle', 0.8);
    }
  }
  function wnWatch(recs) {
    if (!wn || !wn.fx) return;
    for (const r of recs) {
      if (r.type === 'childList') {
        r.addedNodes.forEach(n => {
          if (n.nodeType !== 1 || n.closest(WN_POP_SKIP)) return;
          const t = n.matches(WN_POP_SEL) ? n : n.querySelector(WN_POP_SEL);
          if (t && !t.closest(WN_POP_SKIP)) { wn.vis.set(t, false); wn.cand.add(t); }
        });
      } else {
        const t = r.target;
        if (t.nodeType === 1 && t.matches(WN_POP_SEL) && !t.closest(WN_POP_SKIP)) wn.cand.add(t);
      }
    }
    if (wn.cand.size && !wn.popRaf) {
      wn.popRaf = requestAnimationFrame(() => {
        if (!wn) return;
        wn.popRaf = 0;
        const list = [...wn.cand];
        wn.cand.clear();
        list.forEach(t => {
          const was = wn.vis.get(t), now = wnShown(t);
          wn.vis.set(t, now);
          if (now && was === false) wnPop(wnPanelOf(t));
        });
      });
    }
  }
  function wnToggle(e) {
    const d = e.target;
    if (!wn || !wn.fx || !d || d.tagName !== 'DETAILS' || !d.open || d.closest(WN_POP_SKIP)) return;
    wnPop(d.querySelector('summary') || d, true);
  }
  function wnPopStart() {
    wn.vis = new WeakMap();
    wn.cand = new Set();
    document.querySelectorAll(WN_POP_SEL).forEach(t => wn.vis.set(t, wnShown(t)));
    wn.mo = new MutationObserver(wnWatch);
    wn.mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'open'] });
    document.addEventListener('toggle', wnToggle, true);
    window.addEventListener('click', wnNav);
    window.addEventListener('pageshow', wnShow);
  }
  function wnPopStop() {
    if (wn.mo) wn.mo.disconnect();
    if (wn.popRaf) cancelAnimationFrame(wn.popRaf);
    clearTimeout(wn.veilT);
    document.removeEventListener('toggle', wnToggle, true);
    window.removeEventListener('click', wnNav);
    window.removeEventListener('pageshow', wnShow);
    document.querySelectorAll('.wn-veil').forEach(x => x.remove());
  }

  function wnLoops(on) {
    if (!wn) return;
    wn.timers.forEach(clearTimeout);
    wn.timers = [];
    wnSnow(on);
    if (!on) {
      wn.decor.querySelectorAll('.wn-sleigh,.wn-star,.wn-snowman,.wn-gift,.wn-sledman,.wn-peek').forEach(x => x.remove());
      if (wn.top) wn.top.textContent = '';
      return;
    }
    const again = (fn, min, max, first) => {
      const tick = wait => { wn.timers.push(setTimeout(() => { if (!wn || !wn.fx) return; fn(); tick(rand(min, max)); }, wait)); };
      tick(first);
    };
    again(wnSpawnSleigh, 40000, 70000, rand(6000, 11000));
    again(wnSpawnSnowman, 28000, 50000, rand(12000, 20000));
    again(wnSpawnSledman, 45000, 80000, rand(22000, 32000));
    again(wnSpawnPeek, 35000, 60000, rand(30000, 42000));
    again(wnSpawnSnowball, 30000, 60000, rand(18000, 28000));
    again(wnSpawnStar, 16000, 34000, rand(4000, 9000));
    again(wnAmbient, 3000, 3000, 2500);
  }
  function wnSetMode(mode, say) {
    if (!wn) return;
    if (reduced()) mode = 'off';
    wn.mode = MODES.includes(mode) ? mode : 'all';
    wn.fx = wn.mode !== 'off';
    root.classList.toggle('wn-nofx', !wn.fx);
    if (wn.btn) {
      wn.btn.dataset.mode = wn.mode;
      wn.btn.title = WN_MODES_TEXT[wn.mode][0];
      wn.btn.setAttribute('aria-label', WN_MODES_TEXT[wn.mode][0] + '. Apasă ca să schimbi.');
    }
    wnLoops(wn.fx);
    if (say) hwTip(WN_MODES_TEXT[wn.mode][1]);
  }
  function startIarna(data) {
    if (!document.body) return;
    hwBanner(data);
    if (wn) return;
    const work = /^\/(admin|mdt)/i.test(location.pathname);
    const decor = el('div', 'wn-decor');
    decor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(decor);
    wn = { decor, extra: [], btn: null, top: null, cv: null, cx: null, flakes: [], W: 0, H: 0, raf: 0, last: 0, timers: [], fx: false, mode: 'off', work, lastClick: 0, lastRing: 0, lastDown: 0, lastPtr: '' };
    wnGarland();
    if (work) { root.classList.add('wn-nofx'); return; }
    // în spatele conținutului: cerul cu aurora și satul cu brazi
    const night = el('div', 'wn-night', '<i class="wn-aurora"></i><i class="wn-village"></i>');
    night.setAttribute('aria-hidden', 'true');
    document.body.appendChild(night);
    wn.extra.push(night);
    wn.cv = el('canvas', 'wn-snow');
    wn.cx = wn.cv.getContext('2d');
    decor.appendChild(wn.cv);
    wnSnowSize();
    wn.onResize = () => { clearTimeout(wn.rz); wn.rz = setTimeout(wnSnowSize, 150); };
    window.addEventListener('resize', wn.onResize);
    document.addEventListener('visibilitychange', wnVisibility);
    wn.top = el('div', 'wn-top');
    wn.top.setAttribute('aria-hidden', 'true');
    document.body.appendChild(wn.top);
    wn.extra.push(wn.top);
    document.addEventListener('pointerdown', wnClick, { passive: true });
    document.addEventListener('click', wnTap, { passive: true });
    wnPopStart();
    if (!reduced()) {
      wn.btn = el('button', 'wn-fx', FLAKE_SVG);
      wn.btn.type = 'button';
      wn.btn.addEventListener('click', () => {
        const next = MODES[(MODES.indexOf(wn.mode) + 1) % MODES.length];
        ls.set('mrp_tema_fx_iarna', MODE_SAVE[next]);
        wnSetMode(next, true);
        if (wn.mode === 'all') { snd.soon('jingle', 0.8); ss.set(WN_NEXT, String(Date.now() + 40000)); }
      });
      document.body.appendChild(wn.btn);
    }
    const saved = ls.get('mrp_tema_fx_iarna');
    wnSetMode(saved === '0' ? 'off' : saved === 'm' ? 'mute' : 'all', false);
    wnArrive();
  }
  function stopIarna() {
    if (!wn) return;
    wn.timers.forEach(clearTimeout);
    if (wn.raf) cancelAnimationFrame(wn.raf);
    if (wn.onResize) window.removeEventListener('resize', wn.onResize);
    document.removeEventListener('visibilitychange', wnVisibility);
    document.removeEventListener('pointerdown', wnClick);
    document.removeEventListener('click', wnTap);
    wnPopStop();
    [wn.decor, wn.btn, ...wn.extra].forEach(x => x && x.remove());
    document.querySelectorAll('.hw-banner,.hw-tip').forEach(x => x.remove());
    root.classList.remove('wn-nofx');
    wn = null;
  }

  // ------------------------------------------------------------------
  // Pornirea / oprirea unei teme
  // ------------------------------------------------------------------
  const THEMES = {
    halloween: { css: '/tema-halloween.css?v=' + VER, start: startHalloween, stop: stopHalloween },
    iarna: { css: '/tema-iarna.css?v=' + VER, start: startIarna, stop: stopIarna },
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
