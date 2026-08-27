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
          <div><strong>${escapeHtml(p.name)}</strong><small>Slot server #${escapeHtml(p.id)}</small></div>
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
