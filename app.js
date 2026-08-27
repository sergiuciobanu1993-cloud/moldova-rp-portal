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
