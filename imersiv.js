// Fundal imersiv în bannerul de sus (hero) — 30.09.2026.
// Scenele se schimbă singure în spatele textului: la intrare fumul se
// ridică și arată capitala, apoi fiecare scenă se apropie lent și trece
// în următoarea printr-un fum cald. "p" = poziția în buclă (partea
// întreagă = scena, zecimalele = cât a înaintat în ea).
(() => {
  const root = document.getElementById('hero-imx');
  if (!root) return;
  const scenes = Array.from(root.querySelectorAll('.hx-scene'));
  const N = scenes.length;
  if (!N) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SCENE_MS = reduce ? 10000 : 8000;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  let p = 0, firstPass = true; // fumul gros doar la prima intrare, nu la fiecare buclă
  function render() {
    scenes.forEach((sc, i) => {
      // scena 0 revine la capătul buclei, după ultima
      const t = i === 0 && p > N - 0.5 ? p - N : p - i;
      const o = (i === 0 && t >= 0 ? 1 : ss(-0.18, 0.02, t)) * (1 - ss(0.84, 1.02, t));
      sc.style.setProperty('--o', o.toFixed(3));
      sc.style.visibility = o <= 0.002 ? 'hidden' : 'visible';
      if (!reduce) {
        const k = clamp((t + 0.18) / 1.2, 0, 1);
        const dir = i % 2 ? 1 : -1; // alunecă alternativ stânga / dreapta
        sc.style.setProperty('--s', (1.2 - 0.14 * k).toFixed(4));
        sc.style.setProperty('--x', `${(dir * (k - 0.5) * 2.4).toFixed(2)}%`);
      }
    });
    if (p > 0.5) firstPass = false;
    const intro = firstPass ? 1 - ss(0.02, 0.22, p) : 0;
    let between = 0;
    for (let j = 0; j <= N; j++) between = Math.max(between, 1 - ss(0, 0.1, Math.abs(p - (j - 0.07))));
    root.style.setProperty('--smoke', Math.max(intro, between * 0.55).toFixed(3));
  }

  let last = 0, raf = 0, visible = true;
  const running = () => visible && !document.hidden;
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(now - last, 100) : 16;
    last = now;
    p += dt / SCENE_MS;
    if (p >= N) p -= N;
    render();
    if (running()) raf = requestAnimationFrame(frame); else last = 0;
  }
  function kick() { if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); } }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }, { threshold: 0 }).observe(root);
  }
  document.addEventListener('visibilitychange', kick);

  render();
  kick();
})();
