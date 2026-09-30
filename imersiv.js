// Intro imersiv pe pagina principală (30.09.2026).
// Secțiunea #experienta e înaltă de câteva ecrane; scena din ea stă lipită
// (sticky), iar poziția scroll-ului devine "timpul" animației: fiecare scenă
// are propriul t (0 = abia intră, 1 = iese). Doar variabile CSS se schimbă
// aici — stilurile sunt în imersiv.css.
(() => {
  const root = document.getElementById('experienta');
  if (!root) return;
  const stage = root.querySelector('.imx-stage');
  const scenes = Array.from(root.querySelectorAll('.imx-scene'));
  const N = scenes.length;
  if (!stage || !N) return;

  const PER = 1.1;   // cât scroll (în ecrane) ține o scenă
  const HOLD = 0.75; // cât mai rămâne ultima scenă înainte de restul paginii
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const pair = (s, d) => {
    if (!s) return d;
    const v = s.split(',').map(Number);
    return v.length === 2 && v.every(Number.isFinite) ? v : d;
  };

  const blocks = scenes.map((sc, i) =>
    Array.from(sc.querySelectorAll('.imx-block')).map((el, k) => ({
      el,
      inn: pair(el.dataset.in, i === N - 1
        ? [0.02 + k * 0.05, 0.24 + k * 0.05]
        : [0.08 + k * 0.07, 0.34 + k * 0.07]),
      // ultima scenă nu mai dispare — din ea se intră în restul paginii
      out: pair(el.dataset.out, i === N - 1 ? [99, 100] : [0.74, 0.96]),
    })));

  // navigare laterală
  const rail = root.querySelector('.imx-rail');
  const railBtns = scenes.map((sc, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span></span>`;
    b.querySelector('span').textContent = sc.dataset.label || `Scena ${i + 1}`;
    b.setAttribute('aria-label', `Mergi la: ${sc.dataset.label || `scena ${i + 1}`}`);
    b.addEventListener('click', () => goTo(i));
    li.appendChild(b);
    rail && rail.appendChild(li);
    return b;
  });
  const prevBtn = root.querySelector('[data-imx="prev"]');
  const nextBtn = root.querySelector('[data-imx="next"]');

  let vh = 0;
  let maxP = N - 1 + HOLD / PER;
  function measure() {
    vh = stage.offsetHeight || window.innerHeight;
    root.style.height = `${Math.round(((N - 1) * PER + HOLD) * vh + vh)}px`;
  }
  const docTop = () => root.getBoundingClientRect().top + window.scrollY;
  const progress = () => clamp(-root.getBoundingClientRect().top / (PER * vh), 0, maxP);

  function goTo(i) {
    i = clamp(i, 0, N - 1);
    const t = i === 0 ? 0 : 0.5; // la mijlocul scenei textul e complet vizibil
    window.scrollTo({ top: Math.round(docTop() + (i + t) * PER * vh), behavior: reduce ? 'auto' : 'smooth' });
  }
  function current(p) { return clamp(Math.floor(p + 0.3), 0, N - 1); }
  prevBtn && prevBtn.addEventListener('click', () => goTo(current(progress()) - 1));
  nextBtn && nextBtn.addEventListener('click', () => {
    const c = current(progress());
    if (c >= N - 1) document.getElementById('acasa')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    else goTo(c + 1);
  });

  let lastActive = -1;
  function render() {
    const p = progress();
    scenes.forEach((sc, i) => {
      const t = p - i;
      let o = i === 0 ? 1 : ss(-0.35, -0.05, t);
      if (i < N - 1) o *= 1 - ss(0.78, 1.05, t);
      sc.style.setProperty('--o', o.toFixed(3));
      sc.style.visibility = o <= 0.002 ? 'hidden' : 'visible';
      if (!reduce) {
        const k = clamp((t + 0.35) / 1.4, 0, 1);
        sc.style.setProperty('--s', (1.28 - 0.24 * k).toFixed(4));
        sc.style.setProperty('--y', `${((0.5 - k) * 5).toFixed(2)}vh`);
      }
      blocks[i].forEach(b => {
        const v = ss(b.inn[0], b.inn[1], t) * (1 - ss(b.out[0], b.out[1], t));
        b.el.style.setProperty('--v', v.toFixed(3));
        b.el.style.pointerEvents = v > 0.6 ? '' : 'none';
      });
    });

    const fog = 1 - ss(0.02, 0.5, p);
    let haze = 0;
    for (let j = 1; j < N; j++) haze = Math.max(haze, 1 - ss(0, 0.2, Math.abs(p - (j - 0.08))));
    root.style.setProperty('--fog', fog.toFixed(3));
    root.style.setProperty('--haze', (haze * 0.5).toFixed(3));
    root.style.setProperty('--cue', (1 - ss(0.02, 0.18, p)).toFixed(3));
    root.style.setProperty('--exit', (ss(maxP - 0.4, maxP, p) * 0.9).toFixed(3));
    root.classList.toggle('is-foggy', fog > 0.45);

    const a = current(p);
    if (a !== lastActive) {
      railBtns.forEach((b, i) => {
        b.classList.toggle('is-active', i === a);
        if (i === a) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      if (prevBtn) prevBtn.disabled = a === 0;
      lastActive = a;
    }
  }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; render(); });
  };
  measure();
  render();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { measure(); render(); });

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
