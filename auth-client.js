// Shared client-side helpers for talking to the Moldova RP API and guarding pages.
// Loaded by login.html, dashboard.html and admin.html before their page scripts.

const AUTH_KEY = "mrp_auth";

function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function setAuth(token, user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  // (27.10.2026) șterge și cookie-ul care deschide paginile panoului de admin
  try { fetch("/api/auth/sesiune-panou", { method: "DELETE", keepalive: true }).catch(() => {}); } catch { /* fără rețea */ }
}

// (27.10.2026) Paginile panoului (admin*.html) le trimite serverul doar
// staff-ului care are cookie-ul de panou (vezi PANEL_COOKIE în backend/server.js).
// Îl cerem după fiecare login; pentru jucători serverul doar șterge orice cookie
// vechi. Întoarce { staff, home } sau null dacă tokenul nu mai e valid.
async function syncPanelSession(token) {
  const t = token || getAuth()?.token;
  if (!t) return null;
  try {
    const res = await fetch("/api/auth/sesiune-panou", { method: "POST", headers: { Authorization: `Bearer ${t}` } });
    if (res.status === 401) return null;
    if (!res.ok) return { staff: false, home: "dashboard.html", error: true };
    return await res.json();
  } catch {
    return { staff: false, home: "dashboard.html", error: true };
  }
}

// Linkul ?next= primit de la server când cineva deschide o pagină de panou fără
// cookie. Acceptăm doar o pagină admin*.html de pe acest site.
function panelNextFromUrl() {
  const next = new URLSearchParams(location.search).get("next") || "";
  return /^\/admin[\w-]*\.html(\?[^#]*)?$/i.test(next) ? next : null;
}

// fetch() wrapper that attaches the JWT and bounces to the login page on 401.
async function apiFetch(path, options = {}) {
  const auth = getAuth();
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers);
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearAuth();
    window.location.href = "login.html";
    throw new Error("Neautentificat");
  }
  return res;
}

// Bounces to login.html if there is no token at all. Cheap, local-only check —
// pages should still confirm with /api/me since a stale/expired token has to
// round-trip to the server to be caught.
// (08.11.2026) pagina de unde ai fost trimis la autentificare: după login te întoarcem acolo
// (de ex. tichete.html?cat=bug din ghidul FPS), nu în Contul meu
const AFTER_LOGIN_KEY = "mrp_after_login";
function rememberAfterLogin() {
  try { sessionStorage.setItem(AFTER_LOGIN_KEY, location.pathname.replace(/^\/+/, "") + location.search + location.hash); } catch { /* fără sessionStorage */ }
}
function takeAfterLogin() {
  let p = null;
  try { p = sessionStorage.getItem(AFTER_LOGIN_KEY); sessionStorage.removeItem(AFTER_LOGIN_KEY); } catch { /* fără sessionStorage */ }
  // doar pagini de pe site, ca „tichete.html?cat=bug” (nu adrese externe, nu login/register)
  return p && /^[a-z0-9-]+\.html(?:[?#][^\s]*)?$/i.test(p) && !/^(login|register|auth-callback)\.html/i.test(p) ? p : null;
}

function requireAuth() {
  const auth = getAuth();
  if (!auth?.token) {
    rememberAfterLogin();
    window.location.href = "login.html";
    return null;
  }
  return auth;
}

// (03.10.2026, cerut de Sergiu) Cine vede ce în panoul de administrare:
//   • moderator → Tichete, Loguri, Kill Logs, Caută jucător, Sancțiuni
//   • admin     → tot ce are moderatorul + Jucători
//   • co-fondator / fondator → toate paginile
// Aceleași reguli sunt aplicate și pe server (backend/server.js), deci
// ascunderea linkurilor de aici e doar ca meniul să arate curat — datele
// sunt oricum refuzate de server pentru gradele fără acces.
const PANEL_FOUNDERS = ["co-fondator", "owner"];
const PANEL_ADMINS = ["admin", "co-fondator", "owner"];
const PANEL_MODS = ["moderator", "admin", "co-fondator", "owner"];
const PANEL_ACCESS = {
  "admin-tichete.html": PANEL_MODS,
  "admin-loguri.html": PANEL_MODS,
  "admin-kill-logs.html": PANEL_MODS,
  "admin-cauta.html": PANEL_MODS,
  "admin-sanctiuni.html": PANEL_MODS,
  "admin-jucatori.html": PANEL_ADMINS,
  "admin-craciun.html": PANEL_ADMINS,   // (31.10.2026) tragerea la tombolă o fac doar fondatorii (server)
  "admin-clasament.html": PANEL_ADMINS, // (31.10.2026) premiile clasamentului săptămânii
};
function panelRolesFor(file) {
  return PANEL_ACCESS[file] || PANEL_FOUNDERS;   // orice altă pagină admin*.html = doar fondatorii
}
// Prima pagină din panou pe care o poate deschide un grad (pentru linkul
// „Admin Panel" din Contul meu și pentru redirecționări).
function panelHomeFor(role) {
  if (PANEL_FOUNDERS.includes(role)) return "admin.html";
  if (PANEL_MODS.includes(role)) return "admin-tichete.html";
  return "dashboard.html";
}
// Ascunde din meniul din stânga linkurile la care gradul nu are acces
// (le ascunde, nu le șterge — dacă gradul s-a schimbat între timp, a doua
// trecere, cu gradul confirmat de server, le arată la loc).
function filterPanelNav(role) {
  document.querySelectorAll("aside.side > a:not(.brand):not(.back)").forEach(a => {
    const href = a.getAttribute("href");
    let allowed = true;
    if (!href) allowed = PANEL_FOUNDERS.includes(role);                     // rubrici încă nefăcute (Reclamații, CK, Audit)
    else {
      const file = href.split(/[?#]/)[0];
      if (/^admin[\w-]*\.html$/.test(file)) allowed = panelRolesFor(file).includes(role);   // restul (VIP Shop etc.) = pagini publice
    }
    a.style.display = allowed ? "" : "none";
  });
}
// La încărcare, înainte de răspunsul serverului, filtrăm meniul după gradul
// ținut minte de la login — ca linkurile interzise să nu clipească pe ecran.
// (31.10.2026) Linkul „🎄 Crăciun" din meniul din stânga al panoului — pus
// de aici, ca să nu-l adăugăm în fiecare pagină admin*.html
(function addXmasPanelLink() {
  const side = document.querySelector("aside.side");
  if (!side) return;
  // (04.11.2026) „🏪 Afaceri", lângă Facțiuni (banii benzinăriilor, magazinelor și firmelor)
  const fin = side.querySelector('a[href="admin-financiar.html"]');
  if (fin && !side.querySelector('a[href="admin-afaceri.html"]')) {
    const b = document.createElement("a");
    b.href = "admin-afaceri.html"; b.textContent = "🏪 Afaceri";
    if (location.pathname.endsWith("admin-afaceri.html")) b.className = "sel";
    fin.after(b);
  }
  let after = side.querySelector('a[href="admin-vip-shop.html"]');
  for (const [href, text] of [["admin-craciun.html", "🎄 Crăciun"], ["admin-clasament.html", "🏆 Clasament"], ["admin-sondaje.html", "🗳 Sondaje"]]) {
    let a = side.querySelector(`a[href="${href}"]`);
    if (!a) {
      a = document.createElement("a");
      a.href = href;
      a.textContent = text;
      if (location.pathname.endsWith(href)) a.className = "sel";
      if (after) after.after(a); else side.appendChild(a);
    }
    after = a;
  }
})();
try {
  const cachedRole = getAuth()?.user?.role;
  if (cachedRole && document.querySelector("aside.side")) filterPanelNav(cachedRole);
} catch { /* fără sesiune — requireRole trimite oricum la login */ }

// Confirms the session against /api/me and enforces a role allow-list,
// redirecting non-members back to the dashboard instead of the admin page.
async function requireRole(...roles) {
  if (!requireAuth()) return null;
  let res;
  try {
    res = await apiFetch("/api/me");
  } catch {
    // A genuine 401 is already handled inside apiFetch (it clears the
    // session and redirects to login before throwing). Anything else that
    // lands here is a network hiccup, not an invalid session — don't wipe
    // the user's login over a transient failure.
    return null;
  }
  if (!res.ok) {
    // Non-401 failure (500/502/503, cold start, etc.). Most likely
    // transient — leave the session intact and just report "no access"
    // for this render instead of forcing a logout.
    return null;
  }
  const me = await res.json();
  // ținem minte gradul confirmat, ca meniul să fie corect de la prima clipă data viitoare
  try {
    const auth = getAuth();
    if (auth?.user && auth.user.role !== me.role) setAuth(auth.token, { ...auth.user, role: me.role });
  } catch { /* stocare indisponibilă */ }
  if (!roles.includes(me.role)) {
    // staff fără acces la pagina asta → prima pagină din panou la care are voie
    const home = panelHomeFor(me.role);
    const here = location.pathname.split("/").pop();
    window.location.href = home !== here ? home : "dashboard.html";
    return null;
  }

  // Meniul din stânga: doar paginile gradului (vezi PANEL_ACCESS mai sus).
  // Rulează pe orice pagină de admin (toate apelează requireRole la
  // încărcare), deci acoperă tot panoul dintr-un singur loc.
  filterPanelNav(me.role);

  return me;
}

function wireLogout(selector) {
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      clearAuth();
      window.location.href = "login.html";
    });
  });
}

// (06.11.2026, cerut de Sergiu) Panoul are acum meniul sus, pe tab-uri: rândul de sus
// are grupele (Prezentare, Jucători, Moderare, Loguri, Economie, Conținut), iar rândul
// de dedesubt paginile grupei deschise. Linkurile le luăm din meniul vechi din stânga
// (aside.side, rămas în pagină dar ascuns), ca să rămână aceleași reguli de acces
// (filterPanelNav) și aceleași linkuri puse de aici (Afaceri, Crăciun, Clasament, Sondaje).
const PANEL_GROUPS = [
  { id: "prez", label: "Prezentare", icon: "grid", pages: ["admin.html", "admin-txadmin.html"] },
  { id: "juc", label: "Jucători", icon: "users", pages: ["admin-cauta.html", "admin-jucatori.html", "admin-utilizatori.html", "admin-financiar.html"] },
  { id: "mod", label: "Moderare", icon: "shield", pages: ["admin-tichete.html", "admin-sanctiuni.html"] },
  { id: "log", label: "Loguri", icon: "list", pages: ["admin-loguri.html", "admin-kill-logs.html"] },
  { id: "eco", label: "Economie", icon: "coins", pages: ["admin-afaceri.html", "admin-vip-shop.html", "vip-shop.html", "admin-clasament.html", "admin-craciun.html"] },
  { id: "con", label: "Conținut", icon: "doc", pages: ["admin-anunturi.html", "admin-actualizari.html", "admin-regulamente.html", "admin-continut.html", "admin-sondaje.html"] },
];
const PANEL_ROLE_LABEL = { owner: "Fondator", "co-fondator": "Co-fondator", admin: "Admin", moderator: "Moderator" };
const PANEL_ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18.5 14.8c1.7.8 2.7 2.5 3 5.2"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12l2.2 2.2 4.4-4.4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.6-2.4-2.9-5.5-3"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
};
const panelIcon = (k, cls) => `<svg class="${cls || "pi"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PANEL_ICONS[k] || ""}</svg>`;
(function setupPanelTop() {
  const side = document.querySelector("aside.side");
  if (!side || !document.body) return;
  const here = location.pathname.split("/").pop() || "admin.html";
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bar = document.createElement("div");
  // „site-header": beculețele temei de iarnă (tema.js) se agață sub bara asta, ca pe site
  bar.className = "ptop site-header";
  bar.setAttribute("role", "navigation");
  bar.setAttribute("aria-label", "Panou admin");
  document.body.prepend(bar);
  document.body.classList.add("ptop-on");
  let menuOpen = false;
  function who() {
    const a = getAuth()?.user || {};
    const el = document.getElementById("admin-name");
    const t = el && el.textContent.trim();
    const name = t && t !== "…" ? t : (a.display_name || a.username || "Staff");
    return { name, role: PANEL_ROLE_LABEL[a.role] || "Staff" };
  }
  function render() {
    const links = [...side.querySelectorAll(":scope > a[href]:not(.brand):not(.back)")].filter(a => a.style.display !== "none");
    const items = links.map(a => {
      const href = a.getAttribute("href");
      return { href, file: href.split(/[?#]/)[0], label: a.textContent.replace(/^[^\p{L}\p{N}]+/u, "").trim(), id: a.id || "" };
    });
    const groups = PANEL_GROUPS.map(g => ({ ...g, items: [] }));
    for (const it of items) (groups.find(g => g.pages.includes(it.file)) || groups[0]).items.push(it);
    for (const g of groups) g.items.sort((x, y) => (g.pages.indexOf(x.file) + 99) % 99 - (g.pages.indexOf(y.file) + 99) % 99);
    const shown = groups.filter(g => g.items.length);
    const cur = shown.find(g => g.items.some(i => i.file === here)) || shown[0];
    const me = who();
    bar.innerHTML = `<div class="ptop-in">
      <a class="ptop-brand" href="${esc(panelHomeFor(getAuth()?.user?.role))}"><img src="assets/logo-128.webp" alt=""><span><b>MOLDOVA<em>RP</em></b><small>Panou admin</small></span></a>
      <nav class="ptop-groups">${shown.map(g => `<a class="ptab${g === cur ? " sel" : ""}" href="${esc(g.items.find(i => i.file === here) ? here : g.items[0].href)}"${g === cur ? ' aria-current="true"' : ""}>${panelIcon(g.icon)}<span>${esc(g.label)}</span></a>`).join("")}</nav>
      <div class="ptop-me">
        <button type="button" class="ptop-acc" aria-haspopup="menu" aria-expanded="${menuOpen}"><span class="av">${esc(me.name.charAt(0).toUpperCase())}</span><span class="who"><b>${esc(me.name)}</b><small>${esc(me.role)}</small></span>${panelIcon("chev", "pi chev")}</button>
        <div class="ptop-menu" role="menu"${menuOpen ? "" : " hidden"}><a role="menuitem" href="dashboard.html">Contul meu</a><a role="menuitem" href="index.html">Site public</a><button type="button" role="menuitem" data-out>Ieși din cont</button></div>
      </div></div>
      ${cur ? `<div class="ptop-sub"><div class="ptop-in"><span class="ptop-gl">${esc(cur.label)}</span>${cur.items.map(i => `<a class="pchip${i.file === here ? " sel" : ""}" href="${esc(i.href)}"${i.id ? ` data-id="${esc(i.id)}"` : ""}${i.file === here ? ' aria-current="page"' : ""}>${esc(i.label)}</a>`).join("")}</div></div>` : ""}`;
    // titlul mic de deasupra numelui paginii: grupa în care ești
    const small = document.querySelector("main > header small");
    if (small && cur && /^PANEL ADMINISTRATIV$/i.test(small.textContent.trim())) small.textContent = cur.label.toUpperCase();
  }
  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; render(); }); } };
  render();
  // gradul confirmat de server (filterPanelNav), linkuri adăugate de pagini, numele contului
  new MutationObserver(later).observe(side, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "href"] });
  const nameEl = document.getElementById("admin-name");
  if (nameEl) new MutationObserver(later).observe(nameEl, { childList: true, characterData: true, subtree: true });
  bar.addEventListener("click", e => {
    if (e.target.closest(".ptop-acc")) { menuOpen = !menuOpen; render(); return; }
    if (e.target.closest("[data-out]")) { clearAuth(); location.href = "login.html"; }
  });
  document.addEventListener("click", e => { if (menuOpen && !e.target.closest(".ptop-me")) { menuOpen = false; render(); } });
  document.addEventListener("keydown", e => { if (menuOpen && e.key === "Escape") { menuOpen = false; render(); bar.querySelector(".ptop-acc")?.focus(); } });
  // pe telefon: grupa și pagina deschisă rămân la vedere în rândurile care se derulează
  requestAnimationFrame(() => bar.querySelectorAll(".ptab.sel, .pchip.sel").forEach(el => el.scrollIntoView({ block: "nearest", inline: "center" })));
})();

// Meniu mobil pentru panoul de admin. Sidebar-ul fix (.side) e complet ascuns
// sub 600px lățime (vezi admin.css) — fără asta, staff-ul n-ar avea NICIO
// cale să navigheze între paginile de admin de pe telefon. Centralizat aici
// (auth-client.js e deja încărcat de toate cele 12 pagini de admin, ca să
// verifice rolul), nu repetat în fiecare pagină. Pe pagini fără .side
// (login/dashboard), nu face nimic.
(function setupMobileSidebar() {
  const side = document.querySelector(".side");
  if (!side || document.querySelector(".ptop")) return;   // (06.11.2026) cu meniul de sus nu mai e nevoie de sertar

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "side-toggle";
  toggle.setAttribute("aria-label", "Deschide meniul");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "☰";

  const backdrop = document.createElement("div");
  backdrop.className = "side-backdrop";

  document.body.prepend(backdrop);
  document.body.prepend(toggle);

  function closeMenu() {
    side.classList.remove("open");
    backdrop.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }
  function openMenu() {
    side.classList.add("open");
    backdrop.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
  }

  toggle.addEventListener("click", () => {
    side.classList.contains("open") ? closeMenu() : openMenu();
  });
  backdrop.addEventListener("click", closeMenu);
  // Un click pe orice link din sidebar închide sertarul — utilizatorul
  // oricum navighează spre altă pagină, dar dacă e ancora curentă (fără
  // link real / "#"), asta evită ca sertarul să rămână deschis peste noua
  // pagină redată din cache-ul de navigare al telefonului (bfcache).
  side.querySelectorAll("a").forEach(a => a.addEventListener("click", closeMenu));
})();
