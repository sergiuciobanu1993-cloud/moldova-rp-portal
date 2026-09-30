// Intro imersiv pe pagina principală (30.09.2026, varianta compactă).
// O cutie de mărimea bannerului de sus; scenele se derulează singure (nu mai
// blocăm scroll-ul paginii). "p" e poziția în poveste: partea întreagă =
// scena, zecimalele = cât a înaintat în ea (0 intră, ~0.6 text complet,
// 1 iese). Doar variabile CSS se schimbă aici — stilurile sunt în imersiv.css.
(() => {
  const root = document.getElementById('experienta');
  if (!root) return;
  const scenes = Array.from(root.querySelectorAll('.imx-scene'));
  const N = scenes.length;
  if (!N) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const pair = (s, d) => {
    if (!s) return d;
    const v = s.split(',').map(Number);
    return v.length === 2 && v.every(Number.isFinite) ? v : d;
  };

  // Ritmul fiecărei scene: [u (0..1 din durată), p local, ușurare]
  // Prima scenă ține puțin ceața, apoi o ridică.
  const TIMING_FIRST = { ms: 9000, knots: [[0, 0, 0], [0.26, 0.02, 1], [0.55, 0.6, 1], [0.86, 0.7, 0], [1, 1, 1]] };
  const TIMING = { ms: 7000, knots: [[0, 0, 0], [0.2, 0.6, 1], [0.82, 0.7, 0], [1, 1, 1]] };
  const timing = i => (i === 0 ? TIMING_FIRST : TIMING);
  function localP(i, u) {
    const k = timing(i).knots;
    for (let j = 1; j < k.length; j++) {
      if (u <= k[j][0]) {
        const f = (u - k[j - 1][0]) / (k[j][0] - k[j - 1][0]);
        const e = k[j][2] ? f * f * (3 - 2 * f) : f;
        return k[j - 1][1] + (k[j][1] - k[j - 1][1]) * e;
      }
    }
    return 1;
  }
  // u la care textul scenei e complet vizibil (pentru click pe puncte/săgeți)
  const readyU = i => (i === 0 ? 0.55 : 0.2);

  const blocks = scenes.map(sc =>
    Array.from(sc.querySelectorAll('.imx-block')).map((el, k) => ({
      el,
      inn: pair(el.dataset.in, [0.08 + k * 0.06, 0.32 + k * 0.06]),
      out: pair(el.dataset.out, [0.76, 0.97]),
    })));

  // puncte
  const dotsWrap = root.querySelector('.imx-dots');
  const dots = scenes.map((sc, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const label = sc.dataset.label || `Scena ${i + 1}`;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = '<span></span>';
    b.querySelector('span').textContent = label;
    b.addEventListener('click', () => jump(i));
    li.appendChild(b);
    dotsWrap && dotsWrap.appendChild(li);
    return b;
  });

  let cur = 0, u = 0;          // scena curentă și progresul în ea
  let tween = null;            // tranziție rapidă la click
  let userPaused = false, hover = false, visible = true;

  function pNow() { return cur + localP(cur, u); }

  function render(p) {
    scenes.forEach((sc, i) => {
      // scena 0 revine la finalul buclei (după ultima), prin ceață
      const t = i === 0 && p > N - 0.5 ? p - N : p - i;
      let o = i === 0 && t >= 0 ? 1 : ss(-0.35, -0.05, t);
      o *= 1 - ss(0.78, 1.05, t);
      sc.style.setProperty('--o', o.toFixed(3));
      sc.style.visibility = o <= 0.002 ? 'hidden' : 'visible';
      if (!reduce) {
        const k = clamp((t + 0.35) / 1.4, 0, 1);
        sc.style.setProperty('--s', (1.22 - 0.2 * k).toFixed(4));
        sc.style.setProperty('--y', `${((0.5 - k) * 3).toFixed(2)}%`);
      }
      blocks[i].forEach(b => {
        const v = ss(b.inn[0], b.inn[1], t) * (1 - ss(b.out[0], b.out[1], t)) * o;
        b.el.style.setProperty('--v', v.toFixed(3));
        b.el.style.pointerEvents = v > 0.6 ? '' : 'none';
      });
    });

    const q = p >= N ? p - N : p; // după buclă, p poate trece puțin de N
    const fog = Math.max(1 - ss(0.02, 0.5, q), ss(N - 1 + 0.72, N - 0.02, q));
    let haze = 0;
    for (let j = 1; j < N; j++) haze = Math.max(haze, 1 - ss(0, 0.2, Math.abs(p - (j - 0.08))));
    root.style.setProperty('--fog', fog.toFixed(3));
    root.style.setProperty('--haze', (haze * 0.5).toFixed(3));
    root.classList.toggle('is-foggy', fog > 0.45);

    const active = Math.floor(q + 0.08) % N;
    dots.forEach((d, i) => {
      const fill = i < active ? 1 : i === active ? clamp(q - active, 0, 1) : 0;
      d.style.setProperty('--fill', fill.toFixed(3));
      if (i === active) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
  }

  function jump(i) {
    i = ((i % N) + N) % N;
    const from = pNow();
    // de la ultima la prima: mergem înainte, prin ceață
    const to = (i === 0 && cur === N - 1) ? N + localP(0, readyU(0)) : i + localP(i, readyU(i));
    tween = { from, to, start: performance.now(), dur: Math.min(1400, 500 + Math.abs(to - from) * 350), i };
    kick();
  }

  let last = 0, raf = 0;
  const running = () => !!tween || (!userPaused && !hover && visible && !document.hidden);
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(now - last, 100) : 16;
    last = now;
    if (tween) {
      const f = clamp((now - tween.start) / tween.dur, 0, 1);
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      render(tween.from + (tween.to - tween.from) * e);
      if (f >= 1) { cur = tween.i; u = readyU(cur); tween = null; }
    } else {
      u += dt / timing(cur).ms;
      if (u >= 1) { u -= 1; cur = (cur + 1) % N; }
      render(pNow());
    }
    if (running()) raf = requestAnimationFrame(frame); else last = 0;
  }
  function kick() { if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); } }

  // butoane
  const pauseBtn = root.querySelector('[data-imx="pause"]');
  root.querySelector('[data-imx="prev"]')?.addEventListener('click', () => jump(cur - 1));
  root.querySelector('[data-imx="next"]')?.addEventListener('click', () => jump(cur + 1));
  pauseBtn?.addEventListener('click', () => {
    userPaused = !userPaused;
    pauseBtn.setAttribute('aria-pressed', String(userPaused));
    pauseBtn.textContent = userPaused ? '▶' : '❚❚';
    pauseBtn.setAttribute('aria-label', userPaused ? 'Pornește derularea automată' : 'Oprește derularea automată');
    kick();
  });

  // se oprește cât ține cineva mouse-ul pe ea / nu e pe ecran / tab ascuns
  const fine = window.matchMedia('(hover: hover)').matches;
  if (fine) {
    root.addEventListener('mouseenter', () => { hover = true; });
    root.addEventListener('mouseleave', () => { hover = false; kick(); });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }, { threshold: 0.15 }).observe(root);
  }
  document.addEventListener('visibilitychange', kick);

  // glisare pe telefon
  let sx = null, sy = null;
  root.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  root.addEventListener('touchend', e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) jump(cur + (dx < 0 ? 1 : -1));
  }, { passive: true });

  render(0);
  kick();

  // numărul real de jucători online în ultima scenă
  const live = document.getElementById('imx-live');
  if (live) {
    const label = live.querySelector('span');
    const update = async () => {
      try {
        const res = await fetch('/api/server-status');
        if (!res.ok) throw new Error();
        const d = await res.json();
        const n = Number(d.players) || 0;
        if (d.online) {
          live.classList.remove('is-off');
          label.textContent = n === 1
            ? '1 jucător este acum în oraș. Intră și tu.'
            : `${n} jucători sunt acum în oraș. Intră și tu.`;
        } else {
          live.classList.add('is-off');
          label.textContent = 'Serverul e momentan oprit. Revino în curând.';
        }
      } catch {
        live.classList.add('is-off');
        label.textContent = 'Intră pe Discord ca să afli când începe povestea ta.';
      }
    };
    update();
    setInterval(update, 60000);
  }
})();
