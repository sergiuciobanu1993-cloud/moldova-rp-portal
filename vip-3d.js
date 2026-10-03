// Vitrina 3D din VIP Shop (03.10.2026) — vezi și vip-3d.css.
// MRP3D.open(items, index) deschide o mașină sau o armă mare, pe tot ecranul,
// și o lasă rotită cu degetul / mouse-ul / săgețile.
//
// Două moduri, alese singure pentru fiecare obiect:
//   • „relief" — avem o singură poză (cazul de azi). Poza e îngroșată pe
//     adâncime din straturi suprapuse și se înclină în spațiu; vezi mereu
//     aceeași parte a obiectului, dar cu volum, umbră și luciu.
//   • „360" — există un set de poze din toate unghiurile în
//     assets/vip-360/<cheie>/01.webp … NN.webp, trecut în
//     assets/vip-360/index.json. Atunci rotirea e completă, ca în showroom.
//     Cheia = modelul mașinii (ex. „jesko") sau itemul armei cu litere mici
//     (ex. „weapon_dracovvsgold"). Nu trebuie schimbat nimic în cod când se
//     adaugă un set nou — doar pozele și un rând în index.json.
(() => {
  const MANIFEST_URL = 'assets/vip-360/index.json';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KIND = {
    wpn: { label: 'Armă', layers: 18, gap: 1.5, maxY: 58, maxX: 16, idleY: 24, ar: '3 / 2' },
    car: { label: 'Mașină', layers: 10, gap: 1.4, maxY: 26, maxX: 9, idleY: 12, ar: '16 / 9' },
  };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let manifestP = null;
  function loadManifest() {
    if (!manifestP) {
      manifestP = fetch(MANIFEST_URL, { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : {}))
        .then(j => (j && j.items) || {})
        .catch(() => ({}));
    }
    return manifestP;
  }

  let root = null, st = null;

  function build() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'v3-overlay';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Vizualizare 3D');
    root.innerHTML = `
      <div class="v3-panel">
        <div class="v3-top">
          <span class="v3-tier"><span class="odds-dot" data-v3-dot></span><span data-v3-tier></span><span class="v3-badge" data-v3-mode>3D</span></span>
          <button type="button" class="v3-close" data-v3-close aria-label="Închide">✕</button>
        </div>
        <div class="v3-stage" data-v3-stage tabindex="0" aria-label="Trage sau folosește săgețile ca să rotești">
          <div class="v3-glow"></div><div class="v3-grid"></div><div class="v3-shadow"></div>
          <div class="v3-obj" data-v3-obj></div>
          <div class="v3-hint" data-v3-hint>↔ Trage ca să rotești</div>
        </div>
        <div class="v3-info"><h3 class="v3-name" data-v3-name></h3><p class="v3-sub" data-v3-sub></p></div>
        <div class="v3-nav" data-v3-nav><button type="button" data-v3-prev aria-label="Premiul anterior">‹</button><span data-v3-count></span><button type="button" data-v3-next aria-label="Premiul următor">›</button></div>
      </div>`;
    document.body.appendChild(root);
    const q = s => root.querySelector(s);
    root.addEventListener('click', e => { if (e.target === root) close(); });
    q('[data-v3-close]').addEventListener('click', close);
    q('[data-v3-prev]').addEventListener('click', () => show(st.idx - 1));
    q('[data-v3-next]').addEventListener('click', () => show(st.idx + 1));

    const stage = q('[data-v3-stage]');
    stage.addEventListener('pointerdown', e => {
      if (!st) return;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-drag', 'was-used');
      st.drag = { x: e.clientX, y: e.clientY, ry: st.tRy, rx: st.tRx, f: st.frameF, w: stage.clientWidth || 600 };
      st.lastInput = performance.now();
    });
    stage.addEventListener('pointermove', e => {
      if (!st || !st.drag) return;
      const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y;
      if (st.mode === '360') st.frameF = st.drag.f - (dx / (st.drag.w * 1.15)) * st.frames.length;
      else {
        st.tRy = clamp(st.drag.ry + dx * 0.42, -st.k.maxY, st.k.maxY);
        st.tRx = clamp(st.drag.rx - dy * 0.28, -st.k.maxX, st.k.maxX);
      }
      st.lastInput = performance.now();
    });
    const end = () => { if (st) st.drag = null; stage.classList.remove('is-drag'); };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    root.addEventListener('keydown', e => {
      if (!st) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        if (st.mode === '360') st.frameF += dir;
        else st.tRy = clamp(st.tRy + dir * 14, -st.k.maxY, st.k.maxY);
        st.lastInput = performance.now();
        stage.classList.add('was-used');
      }
      if (e.key === 'Tab') {                       // focusul rămâne în fereastră
        const f = [...root.querySelectorAll('button:not([hidden]), [tabindex="0"]')].filter(n => n.offsetParent);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    return root;
  }

  function open(items, index) {
    items = (items || []).filter(it => it && it.src);
    if (!items.length) return;
    build();
    st = { items, idx: 0, mode: 'relief', k: KIND.wpn, ry: 0, rx: 0, tRy: 0, tRx: 0, frameF: 0, frames: [], drag: null, lastInput: 0, raf: 0, returnTo: document.activeElement, token: 0 };
    root.hidden = false;
    root.querySelector('[data-v3-stage]').classList.remove('was-used');
    show(index || 0);
    root.querySelector('[data-v3-close]').focus();
    if (!st.raf) st.raf = requestAnimationFrame(tick);
  }

  function close() {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    const back = st.returnTo;
    st = null;
    root.hidden = true;
    root.querySelector('[data-v3-obj]').innerHTML = '';
    if (back && back.focus) { try { back.focus(); } catch { /* elementul a dispărut */ } }
  }

  function show(i) {
    const n = st.items.length;
    st.idx = ((i % n) + n) % n;
    const it = st.items[st.idx];
    const token = ++st.token;
    st.k = KIND[it.kind] || KIND.wpn;
    st.mode = 'relief';
    st.ry = st.tRy = reduceMotion ? 0 : -st.k.idleY;
    st.rx = st.tRx = 0;
    st.frames = []; st.frameF = 0;
    st.lastInput = 0;

    const q = s => root.querySelector(s);
    q('.v3-panel').style.setProperty('--wa', it.accent || '#ff8a1f');
    q('[data-v3-dot]').className = 'odds-dot ' + (it.rarity || '');
    q('[data-v3-tier]').textContent = it.tier || '';
    q('[data-v3-name]').textContent = it.label || '';
    const ammo = Math.floor(Number(it.ammo) || 0);
    q('[data-v3-sub]').innerHTML = esc(st.k.label) + (ammo > 0 ? ` · <span class="ammo-note">+ ${ammo} gloanțe</span>` : '');
    q('[data-v3-nav]').hidden = n < 2;
    q('[data-v3-count]').textContent = `${st.idx + 1} / ${n}`;
    renderRelief(it);

    // dacă există poze din toate unghiurile pentru obiectul ăsta, trecem pe rotire completă
    loadManifest().then(items360 => {
      if (!st || token !== st.token) return;
      const set = it.key && items360[String(it.key).toLowerCase()];
      const count = set && Math.floor(Number(set.frames) || 0);
      if (!count || count < 8) return;
      const ext = /^[a-z0-9]{2,5}$/i.test(set.ext || '') ? set.ext : 'webp';
      const urls = Array.from({ length: count }, (_, f) => `assets/vip-360/${String(it.key).toLowerCase()}/${String(f + 1).padStart(2, '0')}.${ext}`);
      const first = new Image();
      first.onload = () => { if (st && token === st.token) render360(it, urls, set); };
      first.src = urls[0];
    });
  }

  function renderRelief(it) {
    const obj = root.querySelector('[data-v3-obj]');
    const k = st.k;
    obj.className = 'v3-obj' + (it.kind === 'car' ? ' is-car' : '');
    obj.style.setProperty('--v3-ar', k.ar);
    root.querySelector('[data-v3-mode]').textContent = '3D';
    root.querySelector('[data-v3-hint]').textContent = '↔ Trage ca să rotești';
    // poza mare → poza obișnuită → poza din colecția serverului (prima care există)
    const sources = [it.hdSrc, it.src, it.src2].filter(Boolean);
    let si = 0;
    const depth = (k.layers - 1) * k.gap;
    let html = '';
    for (let i = k.layers - 1; i >= 0; i--) {     // de la spate spre față
      const z = depth / 2 - i * k.gap;
      const cls = i === 0 ? ' is-front' : ' is-back';
      html += `<img class="v3-layer${cls}" src="${esc(sources[0])}" alt="" style="transform:translateZ(${z.toFixed(1)}px)" draggable="false">`;
    }
    html += `<div class="v3-sheen" style="transform:translateZ(${(depth / 2 + 1).toFixed(1)}px)"></div>`;
    obj.innerHTML = html;
    obj.style.setProperty('--v3-mask', `url("${sources[0]}")`);
    const probe = obj.querySelector('.v3-layer.is-front');
    probe.addEventListener('error', () => {
      if (!obj.isConnected || !probe.isConnected || si >= sources.length - 1) return;
      si++;
      obj.querySelectorAll('.v3-layer').forEach(im => { im.src = sources[si]; });
      obj.style.setProperty('--v3-mask', `url("${sources[si]}")`);
    });
  }

  function render360(it, urls, set) {
    const obj = root.querySelector('[data-v3-obj]');
    st.mode = '360';
    st.frames = urls;
    st.frameF = 0;
    st.shown = -1;
    obj.className = 'v3-obj' + (it.kind === 'car' ? ' is-car' : '');
    obj.style.setProperty('--v3-ar', /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(set.aspect || '') ? set.aspect : '16 / 9');
    obj.style.setProperty('--v3-rx', '0deg'); obj.style.setProperty('--v3-ry', '0deg');
    obj.innerHTML = '<img class="v3-frame" alt="" draggable="false">';
    root.querySelector('[data-v3-mode]').textContent = '360°';
    root.querySelector('[data-v3-hint]').textContent = '↔ Trage ca să rotești complet';
    urls.forEach(u => { const im = new Image(); im.src = u; });   // încărcăm restul cadrelor în fundal
  }

  function tick(now) {
    if (!st) return;
    const obj = root.querySelector('[data-v3-obj]');
    const idle = !st.drag && now - st.lastInput > 2200;
    if (st.mode === '360') {
      if (idle && !reduceMotion) st.frameF += st.frames.length / (60 * 9);     // o tură la ~9 secunde
      const n = st.frames.length;
      const f = ((Math.round(st.frameF) % n) + n) % n;
      if (f !== st.shown) { st.shown = f; const im = obj.querySelector('.v3-frame'); if (im) im.src = st.frames[f]; }
    } else {
      if (idle && !reduceMotion) { st.tRy = Math.sin(now / 1700) * st.k.idleY; st.tRx = Math.sin(now / 2600) * (st.k.maxX * 0.35); }
      st.ry += (st.tRy - st.ry) * 0.12;
      st.rx += (st.tRx - st.rx) * 0.12;
      obj.style.setProperty('--v3-ry', st.ry.toFixed(2) + 'deg');
      obj.style.setProperty('--v3-rx', st.rx.toFixed(2) + 'deg');
      obj.style.setProperty('--v3-sx', (50 + (st.ry / st.k.maxY) * 46).toFixed(1) + '%');
      root.querySelector('.v3-shadow').style.setProperty('--v3-sh', Math.max(0.55, Math.cos(st.ry * Math.PI / 180)).toFixed(3));
    }
    st.raf = requestAnimationFrame(tick);
  }

  window.MRP3D = { open, close, preload: loadManifest };
})();
