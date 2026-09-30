// „Orbita" — scroll imersiv pentru secțiunile de pe pagina principală
// (30.09.2026). Stilurile sunt în orbita.css. Nu blocăm scroll-ul: doar
// citim cât de mult a intrat fiecare secțiune pe ecran și dăm valorile
// mai departe în CSS (--e, --q).
(() => {
  const SECTIONS = [
    ['jucatori', 'Jucători online', 'JUCĂTORI'],
    ['factiuni', 'Facțiuni online', 'FACȚIUNI'],
    ['actualizari', 'Actualizări', 'ACTUALIZĂRI'],
    ['regulamente', 'Regulamente', 'REGULAMENTE'],
    ['anunturi', 'Ultimele anunțuri', 'ANUNȚURI'],
  ];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  const items = SECTIONS.map(([id, label, word]) => {
    const el = document.getElementById(id);
    if (!el) return null;
    el.classList.add('orb-sec');
    const deco = document.createElement('div');
    deco.className = 'orb-deco';
    deco.setAttribute('aria-hidden', 'true');
    deco.innerHTML = '<div class="orb-panel"></div><div class="orb-word"></div><div class="orb-ring"><i></i><i></i><i></i></div>';
    deco.querySelector('.orb-word').textContent = word;
    el.prepend(deco);
    return { el, id, label, e: -1, q: -1 };
  }).filter(Boolean);
  if (!items.length) return;
  document.documentElement.classList.add('orb-on');

  // orbita din stânga
  const rail = document.createElement('ol');
  rail.className = 'orb-rail';
  rail.setAttribute('aria-label', 'Secțiunile paginii');
  items.forEach(it => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${it.id}`;
    a.innerHTML = '<svg viewBox="0 0 34 34" aria-hidden="true"><circle class="bg" cx="17" cy="17" r="14"/><circle class="fg" cx="17" cy="17" r="14"/></svg><b></b><span></span>';
    a.querySelector('span').textContent = it.label;
    a.setAttribute('aria-label', it.label);
    li.appendChild(a);
    rail.appendChild(li);
    it.link = a;
  });
  document.body.appendChild(rail);

  // apariția conținutului: o singură dată pe secțiune
  const reveal = el => {
    if (el.classList.contains('orb-in')) return;
    el.classList.add('orb-in');
    setTimeout(() => el.classList.add('orb-done'), 1900);
  };
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { reveal(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    items.forEach(it => io.observe(it.el));
  } else {
    items.forEach(it => it.el.classList.add('orb-in', 'orb-done'));
  }

  let lastActive = null, shown = false;
  function update() {
    const vh = window.innerHeight || 800;
    let active = null;
    items.forEach(it => {
      const r = it.el.getBoundingClientRect();
      const e = reduce ? 1 : clamp((vh - r.top) / (vh * 0.85), 0, 1);
      const q = clamp((vh - r.top) / (vh + r.height), 0, 1);
      if (Math.abs(e - it.e) > 0.002) { it.el.style.setProperty('--e', e.toFixed(3)); it.e = e; }
      if (Math.abs(q - it.q) > 0.002) {
        it.el.style.setProperty('--q', q.toFixed(3));
        it.link.style.setProperty('--q', q.toFixed(3));
        it.q = q;
      }
      if (r.top < vh * 0.5 && r.bottom > vh * 0.5) active = it;
    });
    if (active !== lastActive) {
      items.forEach(it => {
        it.link.classList.toggle('is-active', it === active);
        if (it === active) it.link.setAttribute('aria-current', 'true'); else it.link.removeAttribute('aria-current');
      });
      lastActive = active;
    }
    const first = items[0].el.getBoundingClientRect();
    const lastR = items[items.length - 1].el.getBoundingClientRect();
    const show = first.top < vh * 0.6 && lastR.bottom > vh * 0.4;
    if (show !== shown) { rail.classList.toggle('is-shown', show); shown = show; }
  }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  // listele se umplu după ce vin datele de pe server — recalculăm
  if ('ResizeObserver' in window) new ResizeObserver(onScroll).observe(document.body);
  update();
})();
