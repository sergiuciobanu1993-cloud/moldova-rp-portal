// „Vitrina" — modele 3D interactive pentru secțiunile de pe pagina
// principală (30.09.2026), în completarea sferei jucătorilor (sfera.js):
//   • Facțiuni online  → ORBITĂ: facțiunile se rotesc în jurul logo-ului,
//                        mai mari cele cu mai mulți membri online.
//   • Actualizări      → COVERFLOW: carduri în arc, cel din mijloc în față.
//   • Ultimele anunțuri→ TEANC: un teanc de carduri; rotița / glisarea
//                        aruncă cardul de sus și îl arată pe următorul.
//   • Regulamente, Despre, bannerele → carduri care se înclină după mouse.
// app.js și scriptul de regulamente randează listele ca înainte; aici doar
// le „îmbrăcăm" (MutationObserver), deci click-ul pe anunțuri (modalul)
// și linkurile merg exact ca înainte. Stilurile sunt în vitrina.css.
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Urmărește o listă randată de alt script; `fn` rulează după fiecare
  // randare nouă (și o dată la pornire).
  function watch(list, fn) {
    let busy = false;
    const run = () => { if (busy) return; busy = true; try { fn(); } finally { busy = false; } };
    new MutationObserver(muts => {
      if (muts.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && !n.classList.contains('vt-own')))) run();
    }).observe(list, { childList: true });
    run();
  }

  // Imaginile din carduri se încarcă după randare — când vin, recalculăm
  // înălțimea cardurilor (o singură dată pe rafală de imagini).
  function onImages(list, fn) {
    let t;
    const later = e => { if (e.target.tagName === 'IMG') { clearTimeout(t); t = setTimeout(fn, 80); } };
    list.addEventListener('load', later, true);
    list.addEventListener('error', later, true);
  }

  // ---------- derulare comună: rotiță + tragere, cu „trepte" ----------
  // Rotița e preluată doar cât cursorul e pe element și doar până la capete;
  // de acolo pagina merge mai departe normal (ca la sfera jucătorilor).
  function makeScroller(area, { onFrame, dragPx }) {
    const s = { pos: 0, target: 0, max: 0, raf: 0, from: null, timer: 0 };
    const frame = () => {
      s.raf = 0;
      const d = s.target - s.pos;
      s.pos = Math.abs(d) < 0.002 || reduce ? s.target : s.pos + d * 0.16;
      onFrame(s.pos);
      if (s.pos !== s.target) s.raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!s.raf) s.raf = requestAnimationFrame(frame); };
    const snapLater = () => {
      clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        const from = s.from == null ? Math.round(s.target) : s.from;
        const moved = s.target - from;
        const i = moved > 0.12 ? Math.ceil(s.target - 0.001) : moved < -0.12 ? Math.floor(s.target + 0.001) : Math.round(s.target);
        s.target = clamp(i, 0, s.max);
        s.from = null;
        kick();
      }, 170);
    };
    s.kick = kick;
    s.go = i => { s.target = clamp(Math.round(i), 0, s.max); kick(); };
    s.setMax = m => { s.max = Math.max(0, m); s.target = clamp(s.target, 0, s.max); s.pos = clamp(s.pos, 0, s.max); onFrame(s.pos); };

    area.addEventListener('wheel', e => {
      if (s.max <= 0) return;
      const r = area.getBoundingClientRect();
      const vh = window.innerHeight;
      const inView = r.top > -r.height * 0.3 && r.bottom < vh + r.height * 0.3;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const px = e.deltaMode === 1 ? delta * 40 : delta;
      if (!inView || (s.target <= 0.001 && px < 0) || (s.target >= s.max - 0.001 && px > 0)) return;
      e.preventDefault();
      if (s.from == null) s.from = Math.round(s.target);
      s.target = clamp(s.target + px / 170, 0, s.max);
      kick();
      snapLater();
    }, { passive: false });

    let down = null;
    area.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, t0: s.target, moved: false, id: e.pointerId };
    });
    area.addEventListener('pointermove', e => {
      if (!down || e.pointerId !== down.id || s.max <= 0) return;
      const dx = e.clientX - down.x;
      if (!down.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - down.y)) {
        down.moved = true;
        s.from = Math.round(down.t0);
        try { area.setPointerCapture(e.pointerId); } catch {}
        area.classList.add('is-drag');
      }
      if (down.moved) { s.target = clamp(down.t0 - dx / dragPx(), 0, s.max); kick(); }
    });
    const end = e => {
      if (!down || (e && e.pointerId !== down.id)) return;
      if (down.moved) {
        area.classList.remove('is-drag');
        const stop = ev => { ev.preventDefault(); ev.stopImmediatePropagation(); };
        area.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => area.removeEventListener('click', stop, { capture: true }), 60);
        snapLater();
      }
      down = null;
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
    return s;
  }

  // Butoane ‹ • • • › sub o listă (puse lângă ea, nu în ea, ca să nu fie
  // șterse când lista se reîncarcă).
  function makeControls(after, label, s) {
    const bar = el('div', 'vt-ctrl');
    const prev = el('button', 'vt-arrow', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', `${label}: înapoi`);
    const next = el('button', 'vt-arrow', '›'); next.type = 'button'; next.setAttribute('aria-label', `${label}: înainte`);
    const dots = el('div', 'vt-dots');
    bar.append(prev, dots, next);
    after.insertAdjacentElement('afterend', bar);
    prev.addEventListener('click', () => s.go(Math.round(s.target) - 1));
    next.addEventListener('click', () => s.go(Math.round(s.target) + 1));
    return {
      bar,
      setCount(n) {
        bar.hidden = n < 2;
        if (dots.childElementCount !== n) {
          dots.innerHTML = '';
          for (let i = 0; i < n; i++) {
            const d = el('button', 'vt-dot'); d.type = 'button';
            d.setAttribute('aria-label', `${label} ${i + 1}`);
            d.addEventListener('click', () => s.go(i));
            dots.appendChild(d);
          }
        }
      },
      update(pos) {
        const a = Math.round(pos);
        [...dots.children].forEach((d, i) => d.classList.toggle('is-active', i === a));
        prev.disabled = a <= 0;
        next.disabled = a >= dots.childElementCount - 1;
      },
    };
  }

  // Un card din lateral nu deschide modalul — doar vine în față.
  function frontOnlyClicks(list, s) {
    list.addEventListener('click', e => {
      const card = e.target.closest('.vt-item');
      if (!card || !list.contains(card)) return;
      const i = Number(card.dataset.vtIndex);
      if (Number.isFinite(i) && i !== Math.round(s.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        s.go(i);
      }
    }, true);
  }

  // ======================= ACTUALIZĂRI: coverflow =======================
  const updates = document.getElementById('updates-list');
  if (updates) {
    let items = [];
    let ctrl;
    const cardW = () => Math.min(updates.clientWidth * (updates.clientWidth < 640 ? 0.84 : 0.46), 520);
    const s = makeScroller(updates, { onFrame: paint, dragPx: () => cardW() * 0.8 });
    ctrl = makeControls(updates, 'Actualizarea', s);
    frontOnlyClicks(updates, s);

    function paint(pos) {
      const W = cardW();
      items.forEach((it, i) => {
        const d = i - pos, ad = Math.abs(d), sg = Math.sign(d);
        const x = sg * (Math.min(ad, 1) * W * 0.64 + Math.max(0, ad - 1) * W * 0.28);
        const ry = -clamp(d, -1, 1) * 42;
        const z = -Math.min(ad, 3) * 170;
        const o = ad > 2.7 ? 0 : 1 - Math.max(0, ad - 1.7);
        it.style.transform = `translateX(-50%) translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg)`;
        it.style.opacity = o.toFixed(3);
        it.style.zIndex = String(100 - Math.round(ad * 10));
        it.style.pointerEvents = ad < 2.2 ? '' : 'none';
        it.classList.toggle('is-front', ad < 0.5);
        it.tabIndex = ad < 0.5 ? 0 : -1;
      });
      ctrl.update(pos);
    }

    function enhance() {
      items = [...updates.querySelectorAll(':scope > .news')];
      if (items.length < 2) {
        updates.classList.remove('vt-flow');
        updates.style.height = '';
        items.forEach(it => { it.classList.remove('vt-item', 'is-front'); it.removeAttribute('style'); });
        ctrl.setCount(0);
        return;
      }
      updates.classList.add('vt-flow');
      const W = cardW();
      items.forEach((it, i) => { it.classList.add('vt-item'); it.dataset.vtIndex = i; it.style.width = `${W}px`; });
      const h = Math.max(...items.map(it => it.offsetHeight));
      items.forEach(it => { it.style.height = `${h}px`; });
      updates.style.height = `${h + 24}px`;
      ctrl.setCount(items.length);
      s.setMax(items.length - 1);
    }
    watch(updates, enhance);
    onImages(updates, () => { items.forEach(it => { it.style.height = ''; }); enhance(); });
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { items.forEach(it => { it.style.height = ''; }); enhance(); }, 200); });
  }

  // ======================= ULTIMELE ANUNȚURI: teanc =======================
  const news = document.getElementById('news-list');
  if (news) {
    let items = [];
    const s = makeScroller(news, { onFrame: paint, dragPx: () => news.clientWidth * 0.6 });
    const ctrl = makeControls(news, 'Anunțul', s);
    frontOnlyClicks(news, s);

    function paint(pos) {
      items.forEach((it, i) => {
        const d = i - pos;
        let tf, o;
        if (d < 0) { // aruncat în sus, în spatele teancului
          const t = Math.min(1, -d);
          tf = `translate3d(${(t * 6).toFixed(1)}%,${(-t * 105).toFixed(1)}%,0) rotate(${(-t * 9).toFixed(2)}deg)`;
          o = 1 - t;
        } else {
          const k = Math.min(d, 3);
          tf = `translate3d(0,${(k * 16).toFixed(1)}px,0) scale(${(1 - k * 0.05).toFixed(4)})`;
          o = d > 3 ? Math.max(0, 4 - d) : 1;
        }
        it.style.transform = tf;
        it.style.opacity = o.toFixed(3);
        it.style.zIndex = String(100 - i);
        it.style.pointerEvents = Math.abs(d) < 0.5 ? '' : 'none';
        it.classList.toggle('is-front', Math.abs(d) < 0.5);
        it.tabIndex = Math.abs(d) < 0.5 ? 0 : -1;
      });
      ctrl.update(pos);
    }

    function enhance() {
      items = [...news.querySelectorAll(':scope > .news')];
      if (items.length < 2) {
        news.classList.remove('vt-deck');
        news.style.height = '';
        items.forEach(it => { it.classList.remove('vt-item', 'is-front'); it.removeAttribute('style'); });
        ctrl.setCount(0);
        return;
      }
      news.classList.add('vt-deck');
      items.forEach((it, i) => { it.classList.add('vt-item'); it.dataset.vtIndex = i; it.style.height = ''; });
      const h = Math.max(...items.map(it => it.offsetHeight));
      items.forEach(it => { it.style.height = `${h}px`; });
      news.style.height = `${h + 3 * 16 + 8}px`;
      ctrl.setCount(items.length);
      s.setMax(items.length - 1);
    }
    watch(news, enhance);
    onImages(news, enhance);
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(enhance, 200); });
  }

  // ======================= FACȚIUNI ONLINE: orbită =======================
  const factions = document.getElementById('faction-grid');
  if (factions) {
    let items = [], core = null, base = -Math.PI / 2, raf = 0, last = 0, hover = false, visible = true;

    function geom() {
      const w = factions.clientWidth || 1000;
      const mobile = w < 640;
      const rx = mobile ? w * 0.4 : Math.min(w * 0.42, 470);
      return { rx, ry: rx * (mobile ? 0.95 : 0.3), mobile };
    }

    function paint() {
      const g = geom();
      const n = items.length;
      const two = n > 7;
      const outer = two ? Math.ceil(n / 2) : n;
      const inner = n - outer;
      items.forEach((it, i) => {
        const ring = two && i % 2 === 1 ? 1 : 0;
        const idx = two ? Math.floor(i / 2) : i;
        const count = ring ? inner : outer;
        const a = base * (ring ? -1.15 : 1) + (idx / count) * Math.PI * 2 + (ring ? Math.PI / count : 0);
        const f = ring ? 0.58 : 1;
        const x = Math.cos(a) * g.rx * f;
        const y = Math.sin(a) * g.ry * f;
        const depth = (Math.sin(a) + 1) / 2; // 0 = în spate, 1 = în față
        const sc = 0.7 + depth * 0.3;
        it.style.transform = `translate(-50%,-50%) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
        it.style.opacity = (0.45 + depth * 0.55).toFixed(3);
        it.style.zIndex = String(10 + Math.round(depth * 100));
      });
    }

    const running = () => !reduce && !hover && visible && !document.hidden && items.length > 0;
    function frame(now) {
      raf = 0;
      const dt = last ? Math.min(now - last, 100) : 16;
      last = now;
      base += dt * 0.00011; // o tură în ~57 de secunde
      paint();
      if (running()) raf = requestAnimationFrame(frame); else last = 0;
    }
    const kick = () => { if (!raf && running()) raf = requestAnimationFrame(frame); };

    function enhance() {
      items = [...factions.querySelectorAll(':scope > .faction')];
      if (!items.length) {
        factions.classList.remove('vt-orbit');
        factions.style.height = '';
        core?.remove(); core = null;
        return;
      }
      factions.classList.add('vt-orbit');
      const counts = items.map(it => parseInt(it.querySelector('small')?.textContent, 10) || 0);
      const max = Math.max(1, ...counts);
      items.forEach((it, i) => {
        it.classList.add('vt-item');
        const g0 = geom();
        it.style.setProperty('--sz', `${Math.round(g0.mobile ? 30 + 22 * (counts[i] / max) : 46 + 38 * (counts[i] / max))}px`);
        it.title = it.textContent.replace(/\s+/g, ' ').trim();
      });
      const total = counts.reduce((a, b) => a + b, 0);
      if (!core || !core.isConnected) { // app.js rescrie lista la 30s
        core = el('div', 'vt-core vt-own');
        core.innerHTML = '<img src="assets/logo.png" alt=""><strong></strong><small>în facțiuni acum</small>';
        factions.prepend(core);
      }
      core.querySelector('strong').textContent = String(total);
      const g = geom();
      factions.style.setProperty('--rx', `${g.rx}px`);
      factions.style.setProperty('--ry', `${g.ry}px`);
      factions.style.height = `${Math.round(g.ry * 2 + (g.mobile ? 110 : 170))}px`;
      paint();
      kick();
    }
    watch(factions, enhance);

    factions.addEventListener('mouseover', e => { if (e.target.closest('.vt-item')) { hover = true; } });
    factions.addEventListener('mouseout', e => { if (e.target.closest('.vt-item') && !e.relatedTarget?.closest?.('.vt-item')) { hover = false; kick(); } });
    // tragere = rotire manuală
    let drag = null;
    factions.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; drag = { x: e.clientX, b: base, id: e.pointerId, moved: false }; });
    factions.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; try { factions.setPointerCapture(e.pointerId); } catch {} factions.classList.add('is-drag'); }
      if (drag.moved) { base = drag.b + dx * 0.006; paint(); }
    });
    const endDrag = () => { if (drag) { factions.classList.remove('is-drag'); drag = null; kick(); } };
    factions.addEventListener('pointerup', endDrag);
    factions.addEventListener('pointercancel', endDrag);
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }).observe(factions);
    document.addEventListener('visibilitychange', kick);
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(enhance, 200); });
  }

  // ============ REGULAMENTE, DESPRE, bannere: înclinare după mouse ============
  if (canHover && !reduce) {
    const tilt = (card, e, power) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.classList.add('vt-tilt', 'is-tilting');
      card.style.setProperty('--mx', `${((px + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${((py + 0.5) * 100).toFixed(1)}%`);
      card.style.transform = `perspective(900px) rotateX(${(-py * 9 * power).toFixed(2)}deg) rotateY(${(px * 11 * power).toFixed(2)}deg) translateY(-4px)`;
    };
    const untilt = card => { card.classList.remove('is-tilting'); card.style.transform = ''; };

    const regs = document.getElementById('reg-cards');
    if (regs) {
      regs.addEventListener('pointermove', e => { const c = e.target.closest('.info-card'); if (c) tilt(c, e, 1); });
      regs.addEventListener('pointerout', e => {
        const c = e.target.closest('.info-card');
        if (c && !c.contains(e.relatedTarget)) untilt(c);
      });
    }
    document.querySelectorAll('.about-box, .callout-banner, #anunturi .callout').forEach(card => {
      card.classList.add('vt-tilt');
      const power = card.classList.contains('about-box') ? 0.35 : 0.6;
      card.addEventListener('pointermove', e => tilt(card, e, power));
      card.addEventListener('pointerleave', () => untilt(card));
    });
  }
})();
