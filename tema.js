// Tema de sezon a site-ului (07.10.2026) — deocamdată: Halloween.
// Fișierul e încărcat de pwa.js pe toate paginile. Ce face:
//   1) întreabă serverul (/api/tema) dacă e pornită o temă — o pornește /
//      oprește fondatorul din Admin → Dashboard → „Tema site-ului";
//   2) dacă da, pune pe <html> clasa „tema-<nume>", încarcă foaia de stil a
//      temei și adaugă decorul (lilieci, păianjen, ceață, bandă pe prima pagină);
//   3) ține minte răspunsul pe dispozitiv, ca la vizita următoare tema să apară
//      imediat (pwa.js o aplică înainte să răspundă serverul).
// Vizitatorul își poate opri efectele din butonul cu dovleac (stânga-jos);
// alegerea rămâne pe dispozitivul lui. Cine are „mișcare redusă" setată în
// telefon / calculator nu vede deloc animațiile.
// Previzualizare doar pentru tine: adaugă ?tema=halloween la orice adresă
// (rămâne cât ții fila deschisă); ?tema=nu o oprește.
(() => {
  if (window.MRP_TEMA) return;
  const VER = '20261007a'; // aceeași ca în pwa.js — schimbă-le împreună când modifici tema
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

  let hw = null; // starea decorului de Halloween, cât e pornit

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
  }
  function hwSpawnSpider() {
    if (!hw || !hw.fx || document.hidden) return;
    const s = el('div', 'hw-spider', '<i></i>' + SPIDER_SVG);
    s.style.setProperty('--x', rand(12, 88).toFixed(1) + 'vw');
    s.style.setProperty('--h', Math.round(rand(90, Math.min(220, window.innerHeight * 0.3))) + 'px');
    s.addEventListener('animationend', e => { if (e.target === s) s.remove(); });
    hw.decor.appendChild(s);
  }
  function hwLoops(on) {
    if (!hw) return;
    hw.timers.forEach(clearTimeout);
    hw.timers = [];
    if (!on) { hw.decor.querySelectorAll('.hw-bat,.hw-spider').forEach(x => x.remove()); return; }
    const again = (fn, min, max, first) => {
      const tick = wait => { hw.timers.push(setTimeout(() => { if (!hw || !hw.fx) return; fn(); tick(rand(min, max)); }, wait)); };
      tick(first);
    };
    again(hwSpawnBats, 9000, 17000, 1400);
    again(hwSpawnSpider, 32000, 55000, rand(9000, 16000));
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
  function hwSetFx(on, say) {
    if (!hw) return;
    hw.fx = on && !reduced();
    root.classList.toggle('hw-nofx', !hw.fx);
    if (hw.btn) {
      hw.btn.setAttribute('aria-pressed', String(hw.fx));
      hw.btn.title = hw.fx ? 'Oprește efectele de Halloween' : 'Pornește efectele de Halloween';
      hw.btn.setAttribute('aria-label', hw.btn.title);
    }
    hwLoops(hw.fx);
    if (say) hwTip(hw.fx ? 'Efectele de Halloween sunt pornite.' : 'Ai oprit efectele de Halloween pe acest dispozitiv. Apasă din nou pe dovleac ca să le pornești.');
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
    // în Admin și în MDT (unelte de lucru): doar culorile și pânza, fără animații
    const work = /^\/(admin|mdt)/i.test(location.pathname);
    const decor = el('div', 'hw-decor', '<div class="hw-web"></div>');
    decor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(decor);
    hw = { decor, fog: null, btn: null, timers: [], fx: false };
    if (work) { root.classList.add('hw-nofx'); return; }
    hw.fog = el('div', 'hw-fog');
    hw.fog.setAttribute('aria-hidden', 'true');
    document.body.appendChild(hw.fog);
    if (!reduced()) {
      hw.btn = el('button', 'hw-fx', '<span></span>');
      hw.btn.type = 'button';
      hw.btn.addEventListener('click', () => {
        const on = !hw.fx;
        ls.set('mrp_tema_fx', on ? '1' : '0');
        hwSetFx(on, true);
      });
      document.body.appendChild(hw.btn);
    }
    hwSetFx(ls.get('mrp_tema_fx') !== '0', false);
  }
  function stopHalloween() {
    if (!hw) return;
    hw.timers.forEach(clearTimeout);
    [hw.decor, hw.fog, hw.btn].forEach(x => x && x.remove());
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

  window.MRP_TEMA = { get theme() { return current; } };

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
