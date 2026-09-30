// „Sfera" jucătorilor online (30.09.2026) — pagina principală.
// Când sunt mai mult de 6 jucători (01.10.2026: înainte 24), toată lista se pune pe o sferă 3D
// de aceeași mărime ca grila de dinainte. Se rotește cu rotița mouse-ului
// (cât ține cursorul pe ea), trăgând cu mouse-ul / degetul sau cu săgețile.
// La capete, rotița dă drumul paginii să meargă mai departe.
// Staff-ul (moderator și mai sus) poate deschide profilul unui jucător.
// app.js apelează MRPSfera.render(list, sub) la fiecare actualizare.
(() => {
  const grid = document.getElementById('player-grid');
  if (!grid) return;

  // doar adminii (admin, co-fondator, owner) — la fel ca pagina admin-jucatori.html
  const STAFF = ['admin', 'co-fondator', 'owner'];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const initials = name => (name || '??').trim().slice(0, 2).toUpperCase();

  let isStaff = false;
  let built = null;        // { stage, ring, cards[], cols, rows, step, R, ... }
  let rot = 0, target = 0; // în grade: coloana din față = rot / step
  let raf = 0, snapTimer = 0, lastList = null, subEl = null, query = '';

  // ---- cine se uită: staff sau nu (confirmat de server, nu doar local) ----
  (async () => {
    try {
      const auth = typeof getAuth === 'function' ? getAuth() : null;
      if (!auth?.token) return;
      const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${auth.token}` } });
      if (!res.ok) return;
      const me = await res.json();
      isStaff = STAFF.includes(me.role);
      if (isStaff) { grid.classList.add('staff-links'); markGridCards(); }
      if (isStaff && lastList && lastList.length > 6) render(lastList, subEl, true);
    } catch { /* vizitator obișnuit */ }
  })();

  // (01.10.2026) Și în grila simplă (puțini jucători), staff-ul poate
  // deschide profilul cu un click pe card — ca în sferă.
  const profileUrl = name => `admin-jucatori.html?profil=${encodeURIComponent(name)}`;
  function markGridCards() {
    if (!isStaff || grid.classList.contains('is-sfera')) return;
    grid.querySelectorAll('.player[data-name]').forEach(c => {
      c.tabIndex = 0;
      c.setAttribute('role', 'link');
      c.title = `Deschide profilul lui ${c.dataset.name}`;
    });
  }
  new MutationObserver(markGridCards).observe(grid, { childList: true });
  grid.addEventListener('click', e => {
    if (!isStaff || grid.classList.contains('is-sfera')) return;
    const card = e.target.closest('.player[data-name]');
    if (card) window.open(profileUrl(card.dataset.name), '_blank', 'noopener');
  });
  grid.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !isStaff || grid.classList.contains('is-sfera')) return;
    const card = e.target.closest('.player[data-name]');
    if (card) window.open(profileUrl(card.dataset.name), '_blank', 'noopener');
  });

  function layout(n) {
    const w = grid.clientWidth || 1100;
    const mobile = w < 640;
    const cardW = mobile ? Math.min(w - 40, 320) : clamp(Math.round(w / 3.25), 280, 390);
    const cardH = mobile ? 74 : 84;
    const gap = mobile ? 10 : 14;
    const maxRows = mobile ? 6 : 8;
    // puțini jucători = mai puține rânduri, ca sfera să aibă coloane de rotit
    const rows = clamp(Math.round(n / (mobile ? 5 : 9)), 3, maxRows);
    // +2 coloane goale: un gol vizibil între ultimul și primul jucător
    const cols = Math.max(Math.ceil(n / rows) + 2, 6);
    const step = 360 / cols;
    const R = Math.max((cols * (cardW + gap)) / (2 * Math.PI), mobile ? 260 : 520);
    const dPhi = ((cardH + gap) / R) * (180 / Math.PI); // grade între rânduri
    return { cardW, cardH, gap, rows, cols, step, R, dPhi, mobile };
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function cardFor(p) {
    const staffLink = isStaff;
    const c = el(staffLink ? 'a' : 'div', 'player sf-card');
    if (staffLink) {
      c.href = profileUrl(p.name);
      c.target = '_blank';
      c.rel = 'noopener';
      c.title = `Deschide profilul lui ${p.name}`;
    }
    c.appendChild(el('div', 'avatar', initials(p.name)));
    const info = el('div', 'sf-info');
    const strong = el('strong', null, p.name);
    if (p.group) { strong.appendChild(document.createTextNode(' ')); strong.appendChild(el('span', 'staff-badge', p.group)); }
    info.appendChild(strong);
    info.appendChild(el('small', null, `Slot server #${p.id}`));
    c.appendChild(info);
    c.appendChild(el('span', 'online-badge', 'ONLINE'));
    if (staffLink) c.appendChild(el('span', 'sf-open', 'Profil ↗'));
    c.dataset.name = (p.name || '').toLowerCase();
    return c;
  }

  function build(list) {
    const L = layout(list.length);
    grid.classList.add('is-sfera');
    grid.innerHTML = '';
    grid.style.setProperty('--sf-w', `${L.cardW}px`);
    grid.style.setProperty('--sf-h', `${L.cardH}px`);
    grid.style.height = `${L.rows * (L.cardH + L.gap) + (L.mobile ? 70 : 90)}px`;

    const stage = el('div', 'sfera-stage');
    stage.setAttribute('role', 'region');
    stage.setAttribute('aria-label', 'Jucători online — rotește cu rotița mouse-ului sau trage');
    stage.tabIndex = 0;
    const ring = el('div', 'sfera-ring');
    stage.appendChild(ring);

    const cards = list.map((p, i) => {
      const col = Math.floor(i / L.rows);
      const row = i % L.rows;
      const c = cardFor(p);
      const theta = col * L.step;
      const phi = (row - (L.rows - 1) / 2) * L.dPhi;
      c.style.transform = `translate(-50%,-50%) rotateY(${theta}deg) rotateX(${-phi}deg) translateZ(${L.R}px)`;
      ring.appendChild(c);
      return { c, col, theta, phi };
    });

    const ctrl = el('div', 'sfera-ctrl');
    const prev = el('button', null, '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Rotește la stânga');
    const next = el('button', null, '›'); next.type = 'button'; next.setAttribute('aria-label', 'Rotește la dreapta');
    const pos = el('span', 'sfera-pos');
    const search = el('input', 'sfera-search');
    search.type = 'search';
    search.placeholder = 'Caută jucător…';
    search.setAttribute('aria-label', 'Caută un jucător în listă');
    search.value = query;
    ctrl.append(prev, pos, next, search);
    grid.append(stage, ctrl);

    prev.addEventListener('click', () => goCol(Math.round(target / L.step) - 1));
    next.addEventListener('click', () => goCol(Math.round(target / L.step) + 1));
    search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); applySearch(); });
    stage.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
    });

    built = { ...L, stage, ring, cards, pos, maxRot: (L.cols - 1) * L.step, lastCol: Math.ceil(list.length / L.rows) - 1 };
    built.maxRot = built.lastCol * L.step;
    target = clamp(target, 0, built.maxRot);
    rot = clamp(rot, 0, built.maxRot);
    bindInput(stage);
    applySearch();
    paint();
  }

  function goCol(i) {
    if (!built) return;
    target = clamp(i, 0, built.lastCol) * built.step;
    kick();
  }

  function applySearch() {
    if (!built) return;
    let first = null;
    built.cards.forEach(k => {
      const hit = query && k.c.dataset.name.includes(query);
      k.c.classList.toggle('is-hit', !!hit);
      if (hit && !first) first = k;
    });
    grid.classList.toggle('has-query', !!query);
    if (first) goCol(first.col);
  }

  // ---- desen: rotim inelul, iar fiecare card se estompează spre margini ----
  function paint() {
    if (!built) return;
    built.ring.style.transform = `translateZ(${-built.R}px) rotateY(${-rot}deg)`;
    built.cards.forEach(k => {
      let rel = ((k.theta - rot) % 360 + 540) % 360 - 180; // -180..180
      const f = Math.cos(rel * Math.PI / 180) * Math.cos(k.phi * Math.PI / 180);
      const o = f <= 0.05 ? 0 : clamp(0.15 + f * 0.95, 0, 1);
      k.c.style.opacity = o.toFixed(3);
      k.c.style.pointerEvents = f > 0.55 ? '' : 'none';
      k.c.tabIndex = f > 0.8 ? 0 : -1;
    });
    const col = Math.round(rot / built.step);
    built.pos.textContent = `${col + 1} / ${built.lastCol + 1}`;
  }

  function frame() {
    raf = 0;
    const d = target - rot;
    rot = Math.abs(d) < 0.05 ? target : rot + d * (reduce ? 1 : 0.14);
    paint();
    if (rot !== target) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  // după ce se oprește rotița / tragerea, ne așezăm pe o coloană întreagă —
  // în direcția mișcării, ca o singură „treaptă" de rotiță să conteze
  let gestureFrom = null;
  function snapLater() {
    if (gestureFrom == null && built) gestureFrom = Math.round(rot / built.step);
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      if (!built) return;
      const st = built.step;
      const moved = target - gestureFrom * st;
      const col = moved > st * 0.12 ? Math.ceil(target / st - 0.001)
        : moved < -st * 0.12 ? Math.floor(target / st + 0.001)
        : Math.round(target / st);
      target = clamp(col, 0, built.lastCol) * st;
      gestureFrom = null;
      kick();
    }, 170);
  }

  // ---- rotița, tragerea cu mouse-ul / degetul ----
  function bindInput(stage) {
    stage.addEventListener('wheel', e => {
      if (!built) return;
      const r = stage.getBoundingClientRect();
      const vh = window.innerHeight;
      // doar când sfera e bine pe ecran — altfel e un scroll normal de pagină
      const inView = r.top > -r.height * 0.3 && r.bottom < vh + r.height * 0.3;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const px = e.deltaMode === 1 ? delta * 40 : delta;
      const atStart = target <= 0.01 && px < 0;
      const atEnd = target >= built.maxRot - 0.01 && px > 0;
      if (!inView || atStart || atEnd) return; // la capete: pagina merge mai departe
      e.preventDefault();
      if (gestureFrom == null) gestureFrom = Math.round(target / built.step);
      target = clamp(target + px * (built.step / 170), 0, built.maxRot);
      kick();
      snapLater();
    }, { passive: false });

    let down = null;
    stage.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, t0: target, moved: false, id: e.pointerId };
      gestureFrom = Math.round(target / (built ? built.step : 1));
    });
    stage.addEventListener('pointermove', e => {
      if (!down || e.pointerId !== down.id || !built) return;
      const dx = e.clientX - down.x;
      if (!down.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - down.y)) {
        down.moved = true;
        try { stage.setPointerCapture(e.pointerId); } catch {}
        stage.classList.add('is-drag');
      }
      if (down.moved) {
        target = clamp(down.t0 - dx * (built.step / (built.cardW + built.gap)), 0, built.maxRot);
        kick();
      }
    });
    const end = e => {
      if (!down || (e && e.pointerId !== down.id)) return;
      if (down.moved) {
        stage.classList.remove('is-drag');
        // nu deschidem profilul dacă a fost o tragere, nu un click
        const stop = ev => { ev.preventDefault(); ev.stopPropagation(); };
        stage.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => stage.removeEventListener('click', stop, { capture: true }), 50);
        snapLater();
      }
      down = null;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }

  function render(list, sub, force) {
    lastList = list;
    subEl = sub;
    const sig = list.map(p => `${p.id}:${p.name}:${p.group || ''}`).join('|') + (isStaff ? '#s' : '');
    if (!force && built && built.sig === sig) return; // nimic schimbat
    build(list);
    built.sig = sig;
    if (sub) {
      const hint = window.matchMedia('(hover: hover)').matches ? 'rotește cu rotița mouse-ului' : 'trage stânga-dreapta';
      sub.textContent = `${list.length} jucători online acum · ${hint}${isStaff ? ' · click = profil' : ''}`;
    }
  }

  function reset() {
    if (!built) return;
    built = null;
    grid.classList.remove('is-sfera', 'has-query');
    grid.style.height = '';
  }

  let rz = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => { if (built && lastList) render(lastList, subEl, true); }, 200);
  });

  window.MRPSfera = { render, reset };
  // dacă lista a venit deja înainte să se încarce acest fișier
  if (Array.isArray(window.__mrpPlayers) && window.__mrpPlayers.length > 6) {
    render(window.__mrpPlayers, document.getElementById('player-grid-sub'));
  }
})();
