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
function requireAuth() {
  const auth = getAuth();
  if (!auth?.token) {
    window.location.href = "login.html";
    return null;
  }
  return auth;
}

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
  if (!roles.includes(me.role)) {
    window.location.href = "dashboard.html";
    return null;
  }

  // Linkul din sidebar către txAdmin (control total pe serverul de joc) nu
  // trebuie doar blocat la click — nu trebuie nici măcar VĂZUT de cineva
  // fără gradul necesar. Verificarea de mai jos rulează pe orice pagină de
  // admin (toate apelează requireRole la încărcare), deci acoperă tot
  // panoul dintr-un singur loc, fără să repetăm logica în fiecare pagină.
  const txadminLink = document.getElementById("nav-txadmin");
  if (txadminLink && !["co-fondator", "owner"].includes(me.role)) {
    txadminLink.remove();
  }

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

// Meniu mobil pentru panoul de admin. Sidebar-ul fix (.side) e complet ascuns
// sub 600px lățime (vezi admin.css) — fără asta, staff-ul n-ar avea NICIO
// cale să navigheze între paginile de admin de pe telefon. Centralizat aici
// (auth-client.js e deja încărcat de toate cele 12 pagini de admin, ca să
// verifice rolul), nu repetat în fiecare pagină. Pe pagini fără .side
// (login/dashboard), nu face nimic.
(function setupMobileSidebar() {
  const side = document.querySelector(".side");
  if (!side) return;

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
