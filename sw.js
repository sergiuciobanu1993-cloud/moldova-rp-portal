// Service worker Moldova RP (30.09.2026) — face site-ul instalabil ca
// aplicație pe telefon și îi dă o pagină „Ești offline" când nu e internet.
// Reguli, ca să nu vadă nimeni date vechi sau ale altcuiva:
//   • /api/* NU trece niciodată prin cache (conturi, bani, tichete = mereu live).
//   • Paginile, CSS-ul și JS-ul: întâi rețeaua (update-urile apar imediat),
//     cache-ul doar dacă nu e internet.
//   • Imaginile și fonturile: din cache, reîmprospătate în fundal.
// La un update al acestui fișier schimbă VERSION, ca să se curețe cache-ul vechi.
const VERSION = 'mrp-2026-09-30a';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/assets/logo.png',
  '/assets/app/icon-192.png',
  '/assets/favicon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

async function trimRuntime(max = 160) {
  const c = await caches.open(RUNTIME);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // YouTube, fonturi externe etc.
  if (url.pathname.startsWith('/api/')) return;           // date live, niciodată din cache
  if (url.pathname.startsWith('/auth') || url.searchParams.has('code')) return; // login Discord

  // pagini: rețea întâi, apoi cache, apoi pagina offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        const res = preload || await fetch(req);
        if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)); }
        return res;
      } catch {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  const isAsset = /\.(css|js)$/i.test(url.pathname);
  const isMedia = /\.(png|jpe?g|webp|gif|svg|ico|woff2?|mp3|ogg)$/i.test(url.pathname);
  if (!isAsset && !isMedia) return;

  if (isAsset) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)).then(() => trimRuntime()); }
        return res;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  // imagini / fonturi / sunete: cache, reîmprospătat în fundal
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const refresh = fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)).then(() => trimRuntime()); }
      return res;
    }).catch(() => null);
    return cached || (await refresh) || Response.error();
  })());
});
