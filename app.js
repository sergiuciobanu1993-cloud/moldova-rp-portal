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

// Placeholder live-counter animation until the server API is connected.
// Guarded because app.js is shared across pages that don't all have #online.
const online = document.getElementById('online');
if (online) {
  let value = Number(online.textContent);
  setInterval(() => {
    const next = Math.max(90, Math.min(180, value + Math.floor(Math.random()*7)-3));
    value = next;
    online.textContent = value;
  }, 7000);
}
