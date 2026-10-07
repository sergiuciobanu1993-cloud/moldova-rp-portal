// Aplicația Moldova RP pe telefon (30.09.2026) — inclus pe toate paginile.
// 1) Înregistrează service worker-ul (sw.js), care face site-ul instalabil.
// 2) Pe pagina principală și în „Contul meu" arată, pe telefon, un card mic
//    „Instalează aplicația" — pe Android/Chrome cu butonul nativ de instalare,
//    pe iPhone cu pașii din Safari (Partajează → Adaugă pe ecranul principal).
// 3) Orice element cu [data-install-app] (ex. linkul din subsol) face același lucru.
// (07.10.2026) Tema de sezon a site-ului (ex. Halloween). pwa.js e singurul
// script inclus pe toate paginile, de aceea pornește de aici: tema ținută
// minte de la ultima vizită se aplică pe loc (ca pagina să nu „clipească"
// din normal în Halloween), apoi tema.js întreabă serverul dacă mai e pornită
// și adaugă decorul. Se pornește / oprește din Admin → Dashboard.
(() => {
  const TEME = { halloween: '/tema-halloween.css?v=20261007c' };
  try {
    let tema = null;
    const q = /[?&]tema=([a-z-]*)/i.exec(location.search);
    if (q) { if (TEME[q[1].toLowerCase()]) sessionStorage.setItem('mrp_tema_proba', q[1].toLowerCase()); else sessionStorage.removeItem('mrp_tema_proba'); }
    tema = sessionStorage.getItem('mrp_tema_proba') || (JSON.parse(localStorage.getItem('mrp_tema') || 'null') || {}).theme;
    if (TEME[tema] && !document.getElementById('tema-css')) {
      document.documentElement.classList.add('tema-' + tema);
      const l = document.createElement('link');
      l.id = 'tema-css'; l.rel = 'stylesheet'; l.href = TEME[tema];
      document.head.appendChild(l);
    }
  } catch { /* fără stocare (mod privat): tema.js o aplică după răspunsul serverului */ }
  const s = document.createElement('script');
  s.src = '/tema.js?v=20261007c';
  s.async = true;
  document.head.appendChild(s);
})();

(() => {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });

  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) {
    document.documentElement.classList.add('is-app');
    const st = document.createElement('style');
    st.textContent = '[data-install-app]{display:none!important}';
    document.head.appendChild(st);
    return;
  }

  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = isIOS || /android|mobile/i.test(ua);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* mod privat */ } },
  };
  let deferred = null;

  const css = `
    .pwa-card{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:900;display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border-radius:16px;background:rgba(16,18,20,.96);border:1px solid rgba(255,138,31,.35);box-shadow:0 18px 50px rgba(0,0,0,.55);color:#f5f2ee;font:14px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transform:translateY(140%);transition:transform .45s cubic-bezier(.2,.8,.2,1)}
    .pwa-card.show{transform:none}
    .pwa-card img{width:44px;height:44px;border-radius:11px;flex:none}
    .pwa-card div{flex:1;min-width:0}
    .pwa-card strong{display:block;font-size:14px}
    .pwa-card small{display:block;color:#9ca1a8;font-size:12px}
    .pwa-card .pwa-go{flex:none;min-height:40px;padding:0 14px;border:0;border-radius:10px;background:#ff8a1f;color:#0b0b0b;font:800 13px/1 inherit;font-family:inherit;cursor:pointer}
    .pwa-card .pwa-x{flex:none;width:32px;height:32px;border:0;border-radius:50%;background:rgba(255,255,255,.06);color:#9ca1a8;font-size:16px;cursor:pointer}
    .pwa-card button:focus-visible{outline:2px solid #ff8a1f;outline-offset:2px}
    .pwa-ios{position:fixed;inset:0;z-index:950;display:grid;place-items:end center;padding:16px 16px calc(16px + env(safe-area-inset-bottom));background:rgba(0,0,0,.6)}
    .pwa-ios>div{width:100%;max-width:420px;padding:20px;border-radius:18px;background:#121416;border:1px solid rgba(255,255,255,.1);color:#f5f2ee;font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    .pwa-ios h3{margin:0 0 12px;font-size:17px}
    .pwa-ios ol{margin:0 0 16px;padding-left:20px}
    .pwa-ios li{margin:6px 0}
    .pwa-ios b{color:#ff8a1f}
    .pwa-ios button{width:100%;min-height:44px;border:0;border-radius:10px;background:#ff8a1f;color:#0b0b0b;font:800 14px/1 inherit;font-family:inherit}`;
  function addStyle() {
    if (document.getElementById('pwa-style')) return;
    const st = document.createElement('style');
    st.id = 'pwa-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function iosHelp() {
    addStyle();
    const wrap = document.createElement('div');
    wrap.className = 'pwa-ios';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Instalează aplicația pe iPhone');
    wrap.innerHTML = `<div><h3>Instalează Moldova RP pe iPhone</h3><ol>
      <li>Deschide site-ul în <b>Safari</b>.</li>
      <li>Apasă butonul <b>Partajează</b> (pătratul cu săgeata în sus, jos pe ecran).</li>
      <li>Alege <b>„Adaugă pe ecranul principal"</b>, apoi <b>Adaugă</b>.</li>
    </ol><button type="button">Am înțeles</button></div>`;
    const close = () => wrap.remove();
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    wrap.querySelector('button').addEventListener('click', close);
    document.body.appendChild(wrap);
    wrap.querySelector('button').focus();
  }

  async function install() {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      deferred = null;
      document.querySelector('.pwa-card')?.remove();
      if (choice && choice.outcome === 'accepted') store.set('mrp_pwa_card', 'installed');
      return;
    }
    if (isIOS) { iosHelp(); return; }
    alert('Deschide meniul browserului (⋮) și alege „Instalează aplicația" sau „Adaugă pe ecranul de pornire".');
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-install-app]');
    if (!t) return;
    e.preventDefault();
    install();
  });

  // cardul apare doar pe telefon, doar pe pagina principală / contul meu,
  // și nu mai apare 14 zile după ce a fost închis
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const onPromoPage = path === '/' || /\/(index|dashboard)\.html$/.test(path);
  const dismissedAt = Number(store.get('mrp_pwa_card_closed') || 0);
  const canPromo = isMobile && onPromoPage && store.get('mrp_pwa_card') !== 'installed' && Date.now() - dismissedAt > 14 * 864e5;

  function showCard() {
    if (!canPromo || document.querySelector('.pwa-card')) return;
    addStyle();
    const card = document.createElement('div');
    card.className = 'pwa-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Instalează aplicația');
    card.innerHTML = `<img src="/assets/app/icon-192.png" alt=""><div><strong>Moldova RP pe telefon</strong><small>Instalează aplicația: pe ecran, fără browser.</small></div><button type="button" class="pwa-go">Instalează</button><button type="button" class="pwa-x" aria-label="Închide">✕</button>`;
    card.querySelector('.pwa-go').addEventListener('click', install);
    card.querySelector('.pwa-x').addEventListener('click', () => { store.set('mrp_pwa_card_closed', String(Date.now())); card.remove(); });
    document.body.appendChild(card);
    setTimeout(() => card.classList.add('show'), 60);
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    setTimeout(showCard, 2500);
  });
  window.addEventListener('appinstalled', () => {
    store.set('mrp_pwa_card', 'installed');
    document.querySelector('.pwa-card')?.remove();
  });
  // iPhone nu are „beforeinstallprompt" — arătăm cardul cu pașii din Safari
  if (isIOS) window.addEventListener('load', () => setTimeout(showCard, 3500));
})();
