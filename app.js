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

// Live "X online" per facțiune, potrivit după eticheta jobului din FiveM
// (vezi /api/live/factions). Banii facțiunilor rămân doar pentru admin —
// aici arătăm doar câți membri sunt online acum. Guarded: doar homepage are
// #faction-grid.
const factionGrid = document.getElementById('faction-grid');
if (factionGrid) {
  const normalize = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const loadFactions = async () => {
    try {
      const res = await fetch('/api/live/factions');
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (!d.online || !Array.isArray(d.factions)) return;
      factionGrid.querySelectorAll('.faction').forEach(card => {
        const name = normalize(card.querySelector('strong')?.textContent);
        const match = d.factions.find(f => {
          const label = normalize(f.label);
          return label === name || label.includes(name) || name.includes(label);
        });
        const badge = card.querySelector('.faction-live');
        if (badge) badge.textContent = match ? `· ${match.online} online` : '';
      });
    } catch {
      // Lasă badge-urile goale dacă nu avem încă date live.
    }
  };
  loadFactions();
  setInterval(loadFactions, 30000);
}
