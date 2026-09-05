const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
menu?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', open ? 'true' : 'false');
});
document.querySelectorAll('.nav a').forEach(a => a.addEventListener('click', () => {
  nav.classList.remove('open');
  menu?.setAttribute('aria-expanded','false');
}));

// Cursor custom "flotant" — un punct urmărește mouse-ul instant, un inel mai
// mare rămâne puțin în urmă (interpolare/lerp), ceea ce dă senzația de
// plutire. Se activează doar pe dispozitive cu mouse real (vezi și CSS).
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const dot = document.createElement('div'); dot.className = 'cursor-dot';
  const ring = document.createElement('div'); ring.className = 'cursor-ring';
  document.body.append(dot, ring);

  let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
  let ringX = mouseX, ringY = mouseY;

  window.addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY;
    dot.style.left = mouseX + 'px';
    dot.style.top = mouseY + 'px';
  });

  const interactiveSelector = 'a, button, input, textarea, select, [role="button"]';
  document.addEventListener('mouseover', e => {
    if (e.target.closest(interactiveSelector)) {
      dot.classList.add('cursor-hover');
      ring.classList.add('cursor-hover');
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest(interactiveSelector)) {
      dot.classList.remove('cursor-hover');
      ring.classList.remove('cursor-hover');
    }
  });

  document.addEventListener('mouseleave', () => { dot.style.opacity = '0'; ring.style.opacity = '0'; });
  document.addEventListener('mouseenter', () => { dot.style.opacity = '1'; ring.style.opacity = '1'; });

  (function animateRing() {
    ringX += (mouseX - ringX) * 0.15;
    ringY += (mouseY - ringY) * 0.15;
    ring.style.left = ringX + 'px';
    ring.style.top = ringY + 'px';
    requestAnimationFrame(animateRing);
  })();
}

// Live jucători-online / sloturi, citite din backend-ul nostru (care la rândul
// lui întreabă serverul de joc FiveM — vezi /api/server-status). Guarded
// because app.js is shared across pages that don't all have these elements.
const online = document.getElementById('online');
const slots = document.getElementById('slots');
if (online || slots) {
  const loadServerStatus = async () => {
    try {
      const res = await fetch('/api/server-status');
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (online) online.textContent = d.online ? d.players : '—';
      if (slots) slots.textContent = d.maxPlayers || '—';
    } catch {
      // Leave the last known value in place rather than showing an error.
    }
  };
  loadServerStatus();
  setInterval(loadServerStatus, 30000);
}

// Lista reală de jucători conectați acum pe server (vezi /api/live/players,
// care citește players.json de pe serverul FiveM). Expune doar id-ul de slot
// și numele — nimic altceva (fără identifiers/ping/endpoint). Guarded: doar
// homepage are #player-grid.
const playerGrid = document.getElementById('player-grid');
if (playerGrid) {
  const initials = name => (name || '??').trim().slice(0, 2).toUpperCase();
  // Player display names come straight from the game server (Rockstar/Steam
  // profile name) — a player can set that to anything, including HTML. Never
  // trust it into innerHTML unescaped.
  const escapeHtml = s => (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const loadPlayers = async () => {
    try {
      const res = await fetch('/api/live/players');
      if (!res.ok) throw new Error();
      const d = await res.json();
      const sub = document.getElementById('player-grid-sub');
      if (!d.online) {
        playerGrid.innerHTML = '<div class="empty-state">Serverul este offline momentan.</div>';
        if (sub) sub.textContent = 'Serverul este offline momentan.';
        return;
      }
      if (d.namesRedacted) {
        // Server-side privacy setting (sv_playersToken not configured yet) —
        // FXServer only gives us the count, not real names. Say so instead
        // of rendering a wall of duplicate "Player" cards.
        playerGrid.innerHTML = `<div class="empty-state">${d.players} jucători online acum — lista cu nume va fi disponibilă în curând.</div>`;
        if (sub) sub.textContent = `${d.players} jucători online acum`;
        return;
      }
      if (!d.list || !d.list.length) {
        playerGrid.innerHTML = '<div class="empty-state">Niciun jucător conectat momentan.</div>';
        if (sub) sub.textContent = 'Niciun jucător conectat momentan.';
        return;
      }
      const SHOWN = 24;
      const shown = d.list.slice(0, SHOWN);
      playerGrid.innerHTML = shown.map(p => `
        <div class="player">
          <div class="avatar">${escapeHtml(initials(p.name))}</div>
          <div><strong>${escapeHtml(p.name)}${p.group ? ` <span class="staff-badge">${escapeHtml(p.group)}</span>` : ''}</strong><small>Slot server #${escapeHtml(p.id)}</small></div>
          <span class="online-badge">ONLINE</span>
        </div>`).join('');
      if (sub) sub.textContent = d.list.length > SHOWN
        ? `${d.list.length} jucători online acum · se afișează primii ${SHOWN}`
        : `${d.list.length} jucători online acum`;
    } catch {
      // Lasă lista anterioară dacă nu avem încă date live.
    }
  };
  loadPlayers();
  setInterval(loadPlayers, 30000);
}

// Lista COMPLETĂ, dinamică, a facțiunilor care au chiar acum jucători online
// (vezi /api/live/factions) — nu mai e o listă fixă de 4 carduri, ca să nu
// rămână "invizibile" facțiuni reale de pe server (ex: Cruisin, Los Customs)
// doar pentru că nu erau ghicite dinainte. Banii facțiunilor rămân doar
// pentru admin — aici arătăm doar câți membri sunt online acum. Guarded:
// doar homepage are #faction-grid.
const factionGrid = document.getElementById('faction-grid');
if (factionGrid) {
  const initials = name => (name || '??').trim().slice(0, 2).toUpperCase();
  // Etichetele de job vin din baza de date a serverului de joc (editabile de
  // oricine administrează joburile ESX) — escapăm la fel ca numele jucătorilor,
  // niciodată nu băgăm text netratat în innerHTML.
  const escapeHtml = s => (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const loadFactions = async () => {
    const sub = document.getElementById('faction-grid-sub');
    try {
      const res = await fetch('/api/live/factions');
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (!d.online || !Array.isArray(d.factions)) {
        factionGrid.innerHTML = '<div class="empty-state">Datele despre facțiuni nu sunt disponibile momentan.</div>';
        if (sub) sub.textContent = 'Datele despre facțiuni nu sunt disponibile momentan.';
        return;
      }
      // Doar facțiuni cu etichetă reală și cu cel puțin un membru online acum
      // (ex: excludem "unemployed"/fără facțiune, care are eticheta goală).
      const active = d.factions
        .filter(f => f.label && f.online > 0)
        .sort((a, b) => b.online - a.online);
      if (!active.length) {
        factionGrid.innerHTML = '<div class="empty-state">Nicio facțiune nu are membri online momentan.</div>';
        if (sub) sub.textContent = 'Nicio facțiune nu are membri online momentan.';
        return;
      }
      factionGrid.innerHTML = active.map(f => `
        <div class="faction">
          <span>${escapeHtml(initials(f.label))}</span>
          <div><strong>${escapeHtml(f.label)}</strong><small>${f.online} online</small></div>
        </div>`).join('');
      if (sub) sub.textContent = `${active.length} facțiuni cu jucători online acum`;
    } catch {
      // Lasă lista anterioară dacă nu avem încă date live.
    }
  };
  loadFactions();
  setInterval(loadFactions, 30000);
}

// Conținut editabil din Admin → Conținut pagini (vezi backend/server.js
// /api/content/:page și scripts/seed-content.js pentru valorile inițiale).
// Orice element din pagină cu atributul data-block="<cheie>" e populat cu
// valoarea salvată în DB pentru pagina curentă (identificată prin
// data-content-page pe <body>). Progressive enhancement: dacă fetch-ul
// eșuează, sau un bloc anume lipsește din răspuns, elementul rămâne exact
// cu textul static deja scris în HTML — nimic nu se strică. Paginile fără
// data-content-page pe <body> (admin, dashboard etc.) ies imediat, fără
// niciun request. ghid-factiune.html are propria logică (conținut per
// facțiune/categorie, selectat după ?slug=) și nu folosește acest loader.
(() => {
  const page = document.body.dataset.contentPage;
  if (!page) return;
  const nodes = document.querySelectorAll('[data-block]');
  if (!nodes.length) return;

  const escapeHtml = s => (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Randare specializată pentru blocurile de tip "list" — cheia identifică
  // exact ce card se construiește pentru fiecare element din listă. Blocurile
  // de tip "html" (ex: grila de joburi) nu au nevoie de randare specială —
  // merg direct pe ramura generică innerHTML de mai jos.
  const LIST_RENDERERS = {
    highlights_items: (container, items) => {
      const pill = (it, hidden) => `<span class="highlight-pill"${hidden ? ' aria-hidden="true"' : ''}><span class="highlight-pill-icon">${escapeHtml(it.icon)}</span><span>${escapeHtml(it.title)}</span></span>`;
      container.innerHTML = items.map(it => pill(it, false)).join('') + items.map(it => pill(it, true)).join('');
    },
    guide_list: (container, items) => {
      container.innerHTML = items.map(it => `
        <a class="reg-item" href="${escapeHtml(it.url)}">
          <div><h3>${escapeHtml(it.icon)} ${escapeHtml(it.title)}</h3><small>${escapeHtml(it.text)}</small></div>
          <span class="reg-arrow">→</span>
        </a>`).join('');
    },
    license_list: (container, items) => {
      container.innerHTML = items.map(it => `
        <a class="reg-item" href="${escapeHtml(it.url)}">
          <div><h3>${escapeHtml(it.icon)} ${escapeHtml(it.title)}</h3><small>${escapeHtml(it.text)}</small></div>
          <span class="reg-arrow">→</span>
        </a>`).join('');
    },
    videos: (container, items) => {
      container.innerHTML = items.map(it => `
        <div class="video-job-card">
          <div class="video-job-embed"><iframe src="${escapeHtml(it.url)}" title="${escapeHtml(it.title)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
          <div class="video-job-body"><h3>${escapeHtml(it.title)}</h3><p>${escapeHtml(it.text)}</p></div>
        </div>`).join('');
    }
  };

  (async () => {
    try {
      const res = await fetch(`/api/content/${encodeURIComponent(page)}`);
      if (!res.ok) throw new Error();
      const blocks = await res.json();
      nodes.forEach(el => {
        const b = blocks[el.dataset.block];
        if (!b) return;
        if (b.type === 'list') {
          const renderer = LIST_RENDERERS[el.dataset.block];
          if (!renderer) return;
          try {
            const items = JSON.parse(b.content);
            if (Array.isArray(items)) renderer(el, items);
          } catch {
            // Listă coruptă în DB — păstrează conținutul static din HTML.
          }
          return;
        }
        if (b.type === 'text') el.textContent = b.content;
        // richtext/html — scrise doar de staff (ADMIN_ROLES), la fel de
        // privilegiate ca restul conținutului editat din admin.
        else el.innerHTML = b.content;
      });
    } catch {
      // API indisponibil — pagina rămâne cu conținutul static din HTML.
    }
  })();
})();

// Ultimele anunțuri, publicate de admin din panoul de administrare (vezi
// /api/announcements — public, întoarce doar cele cu is_published=true).
// Guarded: doar homepage are #news-list.
const newsList = document.getElementById('news-list');
if (newsList) {
  const MONTHS_RO = ['IAN', 'FEB', 'MAR', 'APR', 'MAI', 'IUN', 'IUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const fmtNewsDate = d => {
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')} ${MONTHS_RO[date.getMonth()]}`;
  };
  const escapeHtml = s => (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const truncate = (s, n) => (s || '').length > n ? s.slice(0, n).trim() + '…' : (s || '');
  const loadNews = async () => {
    try {
      const res = await fetch('/api/announcements');
      if (!res.ok) throw new Error();
      const items = await res.json();
      if (!items.length) {
        newsList.innerHTML = '<div class="empty-state">Niciun anunț publicat momentan.</div>';
        return;
      }
      newsList.innerHTML = items.slice(0, 6).map(a => `
        <article class="news">
          <span class="news-date">${escapeHtml(fmtNewsDate(a.published_at))}</span>
          <div>
            ${a.image_url ? `<img class="news-img" src="${escapeHtml(a.image_url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
            <span class="tag">${escapeHtml((a.category || 'General').toUpperCase())}</span>
            <h3>${escapeHtml(a.title)}</h3>
            <p>${escapeHtml(truncate(a.content, 160))}</p>
            ${a.video_url ? `<a class="news-video" href="${escapeHtml(a.video_url)}" target="_blank" rel="noopener noreferrer">▶ Vezi videoclipul</a>` : ''}
          </div>
        </article>`).join('');
    } catch {
      // Lasă lista anterioară (sau starea "Se încarcă…") dacă nu avem date.
    }
  };
  loadNews();
  setInterval(loadNews, 60000);
}
