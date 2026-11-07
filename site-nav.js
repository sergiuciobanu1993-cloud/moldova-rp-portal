// (06.11.2026) Bara de sus, aceeași pe toate paginile publice: aceleași linkuri, pagina
// curentă evidențiată, iar în dreapta contul tău (avatar + meniu) sau „Autentificare".
// Se pune imediat după <header> în pagină: înlocuiește headerul vechi al paginii pe loc,
// fără să clipească. Nu se folosește pe „Contul meu" (dashboard.html) și în panoul admin,
// care au barele lor.
(function () {
  const old = document.currentScript && document.currentScript.previousElementSibling;
  const hdr = old && old.tagName === "HEADER" ? old : document.querySelector("body > header");
  if (!hdr || hdr.dataset.mrpNav) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const hash = location.hash;
  const LINKS = [
    ["index.html", "Acasă"],
    ["regulamente.html", "Regulamente"],
    ["index.html#factiuni", "Facțiuni"],
    ["joburi.html", "Joburi"],
    ["clasament.html", "Clasament"],
    ["vip-shop.html", "VIP Shop"],
    ["index.html#actualizari", "Actualizări"],
    ["tichete.html", "Suport"],
  ];
  const MORE = [
    ["incepe.html", "Începe să joci"],
    ["cod-penal.html", "Codul Penal"],
    ["legislatie-rutiera.html", "Legislația rutieră"],
    ["calculator-sanctiuni.html", "Calculator sancțiuni"],
    ["ghid-factiuni.html", "Ghiduri facțiuni"],
    ["premium.html", "Premium"],
    ["concurs.html", "Concursuri"],
    ["index.html#despre", "Despre noi"],
  ];
  // pagina curentă: aceeași pagină (pe Acasă, doar fără #), Regulament → Regulamente, Tichet → Suport
  const alias = { "regulament.html": "regulamente.html", "tichet.html": "tichete.html", "ghid-factiune.html": "ghid-factiuni.html" };
  const cur = alias[here] || here;
  const isCur = href => { const [f, h] = href.split("#"); return f === cur && (cur !== "index.html" ? !h : !h && !hash); };
  let auth = null;
  try { auth = JSON.parse(localStorage.getItem("mrp_auth") || "null"); } catch { /* fără sesiune */ }
  const user = auth && auth.token && auth.user ? auth.user : null;
  const name = user ? (user.display_name || user.username || "Contul meu") : "";
  const staff = user && ["moderator", "admin", "co-fondator", "owner"].includes(user.role);
  const panel = user && ["co-fondator", "owner"].includes(user.role) ? "admin.html" : "admin-tichete.html";
  const moreCur = MORE.some(([h]) => isCur(h));
  // (07.11.2026) venit din „Contul meu" (dashboard.html pune mrp_back_cont = secțiunea de unde ai plecat):
  // apare butonul „Înapoi la cont" sus, până te întorci în cont
  let back = null;
  try { back = user ? sessionStorage.getItem("mrp_back_cont") : null; } catch { /* fără sessionStorage */ }
  const backHref = back != null ? "dashboard.html" + (/^#[\w-]+$/.test(back) ? back : "") : "";

  const h = document.createElement("header");
  h.className = "site-header mrp-hdr";
  h.dataset.mrpNav = "1";
  h.innerHTML = `
    <a class="mrp-brand" href="index.html" aria-label="Moldova RP - Acasă"><img src="assets/logo-128.webp" alt=""><span>MOLDOVA<b>RP</b></span></a>
    <nav class="mrp-links" aria-label="Meniu">
      ${LINKS.map(([href, t]) => `<a href="${href}"${isCur(href) ? ' class="on" aria-current="page"' : ""}>${t}</a>`).join("")}
      <div class="mrp-more"><button type="button" class="mrp-more-btn${moreCur ? " on" : ""}" aria-haspopup="true" aria-expanded="false">Mai mult <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="mrp-drop" hidden>${MORE.map(([href, t]) => `<a href="${href}"${isCur(href) ? ' class="on" aria-current="page"' : ""}>${t}</a>`).join("")}<a href="craciun.html" data-craciun-link hidden>🎄 Crăciun</a></div></div>
    </nav>
    <div class="mrp-right">
      ${backHref ? `<a class="mrp-back" href="${backHref}" title="Înapoi la Contul meu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span>Înapoi la cont</span></a>` : ""}
      ${user ? `<div class="mrp-me"><button type="button" class="mrp-acc" aria-haspopup="true" aria-expanded="false"><span class="mrp-av">${esc(name.charAt(0).toUpperCase())}</span><b>${esc(name)}</b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="mrp-drop r" hidden><a href="dashboard.html">Contul meu</a><a href="dashboard.html#vehicule">Vehiculele mele</a><a href="tichete.html">Tichetele mele</a>${staff ? `<a href="${panel}">⚙ Panou admin</a>` : ""}<button type="button" data-out>Deconectare</button></div></div>`
        : `<a class="mrp-login" href="login.html">Autentificare</a>`}
      <button type="button" class="mrp-burger" aria-label="Deschide meniul" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>`;
  // headerul vechi era fix (paginile publice) sau în flux (paginile cu dashboard.css): păstrăm la fel
  const fixed = getComputedStyle(hdr).position === "fixed";
  h.classList.add(fixed ? "is-fixed" : "is-sticky");
  hdr.replaceWith(h);

  if (!document.getElementById("mrp-hdr-css")) {
    const st = document.createElement("style");
    st.id = "mrp-hdr-css";
    st.textContent = `
.mrp-hdr{display:flex;align-items:center;gap:22px;height:72px;padding:0 clamp(16px,4vw,64px);background:rgba(7,8,10,.82);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.07);color:#f3f4f6;font-family:Inter,system-ui,sans-serif;box-sizing:border-box;z-index:40}
.mrp-hdr.is-fixed{position:fixed;top:0;left:0;right:0}
.mrp-hdr.is-sticky{position:sticky;top:0}
.mrp-hdr *{box-sizing:border-box}
.mrp-hdr svg{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.mrp-brand{display:flex;align-items:center;gap:10px;flex:none;color:#fff;text-decoration:none;font-weight:950;font-size:17px;letter-spacing:.04em}
.mrp-brand img{width:34px;height:34px}
.mrp-brand b{color:#ff8a1f}
.mrp-links{display:flex;align-items:center;gap:2px;flex:1;justify-content:center;min-width:0}
.mrp-links>a,.mrp-more-btn{padding:9px 12px;border-radius:9px;color:#b9bec5;font:inherit;font-weight:700;font-size:13.5px;text-decoration:none;white-space:nowrap;background:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background .15s ease,color .15s ease}
.mrp-links>a:hover,.mrp-more-btn:hover{background:rgba(255,255,255,.06);color:#fff}
.mrp-links>a.on,.mrp-more-btn.on{color:#fff;background:rgba(255,138,31,.14);box-shadow:inset 0 -2px 0 #ff8a1f}
.mrp-more-btn svg{width:14px;height:14px}
.mrp-more,.mrp-me{position:relative}
.mrp-drop{position:absolute;top:calc(100% + 8px);left:0;min-width:210px;padding:6px;border-radius:12px;background:#15181d;border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 50px rgba(0,0,0,.55);display:flex;flex-direction:column;z-index:5}
.mrp-drop.r{left:auto;right:0}
.mrp-drop[hidden]{display:none}
.mrp-drop a,.mrp-drop button{display:block;padding:10px 12px;border-radius:8px;color:#d6d9dd;font:inherit;font-weight:700;font-size:13px;text-decoration:none;text-align:left;background:none;border:0;cursor:pointer}
.mrp-drop a:hover,.mrp-drop button:hover{background:rgba(255,255,255,.06);color:#fff}
.mrp-drop a.on{color:#ffa24a}
.mrp-drop a[hidden]{display:none}
.mrp-drop button[data-out]{color:#ff8a8a;border-top:1px solid rgba(255,255,255,.08);border-radius:0 0 8px 8px;margin-top:4px}
.mrp-right{display:flex;align-items:center;gap:10px;flex:none;margin-left:auto}
.mrp-back{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px 0 10px;border-radius:12px;border:1px solid rgba(255,138,31,.55);background:linear-gradient(135deg,rgba(255,162,74,.18),rgba(255,122,20,.1));color:#ffb46b;font-weight:800;font-size:13px;text-decoration:none;white-space:nowrap;transition:background .15s ease}
.mrp-back:hover{background:rgba(255,138,31,.24);color:#fff}
.mrp-back svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.mrp-login{padding:10px 16px;border-radius:10px;border:1px solid rgba(255,138,31,.55);color:#fff;font-weight:800;font-size:13px;text-decoration:none;background:rgba(255,138,31,.1)}
.mrp-login:hover{background:rgba(255,138,31,.2)}
.mrp-acc{display:flex;align-items:center;gap:9px;padding:4px 12px 4px 4px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#f3f4f6;font:inherit;font-size:13px;cursor:pointer;max-width:220px}
.mrp-acc:hover,.mrp-acc[aria-expanded="true"]{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.08)}
.mrp-acc b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mrp-acc svg{width:14px;height:14px;flex:none;color:#8d939b}
.mrp-av{width:32px;height:32px;flex:none;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#ffa24a,#ff7a14);color:#1a0f02;font-weight:950}
.mrp-burger{display:none;width:42px;height:42px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);cursor:pointer;flex-direction:column;align-items:center;justify-content:center;gap:4px}
.mrp-burger span{display:block;width:18px;height:2px;border-radius:2px;background:#fff}
.mrp-hdr a:focus-visible,.mrp-hdr button:focus-visible{outline:2px solid #ff8a1f;outline-offset:2px}
@media(max-width:1180px){.mrp-links>a,.mrp-more-btn{padding:8px 9px;font-size:13px}}
@media(max-width:1020px){
  .mrp-burger{display:flex}
  .mrp-links{display:none;position:absolute;top:72px;left:0;right:0;flex-direction:column;align-items:stretch;gap:0;padding:10px 16px 16px;background:#0e1013;border-bottom:1px solid rgba(255,255,255,.08);max-height:calc(100vh - 72px);overflow-y:auto}
  .mrp-hdr.open .mrp-links{display:flex}
  .mrp-links>a,.mrp-more-btn{padding:13px 8px;border-radius:0;border-top:1px solid rgba(255,255,255,.06);justify-content:space-between}
  .mrp-links>a.on{box-shadow:inset 3px 0 0 #ff8a1f}
  .mrp-more-btn{width:100%}
  .mrp-more .mrp-drop{position:static;box-shadow:none;border:0;background:transparent;padding:0 0 6px 12px}
  .mrp-acc b,.mrp-acc svg{display:none}
  .mrp-acc{padding:3px}
}
@media(max-width:560px){.mrp-back{padding:0 10px}.mrp-back span{display:none}}
@media(max-width:420px){.mrp-brand span{display:none}.mrp-login{padding:9px 12px}}`;
    document.head.appendChild(st);
  }

  const drops = [...h.querySelectorAll(".mrp-more, .mrp-me")];
  const closeAll = except => drops.forEach(d => { if (d === except) return; d.querySelector(".mrp-drop").hidden = true; d.querySelector("button").setAttribute("aria-expanded", "false"); });
  drops.forEach(d => d.querySelector("button").addEventListener("click", e => {
    e.stopPropagation();
    const dd = d.querySelector(".mrp-drop"), open = dd.hidden;
    closeAll(d); dd.hidden = !open; e.currentTarget.setAttribute("aria-expanded", String(open));
  }));
  document.addEventListener("click", e => { if (!e.target.closest(".mrp-more, .mrp-me")) closeAll(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeAll(); h.classList.remove("open"); } });
  const burger = h.querySelector(".mrp-burger");
  burger.addEventListener("click", () => { const o = h.classList.toggle("open"); burger.setAttribute("aria-expanded", String(o)); });
  h.querySelectorAll(".mrp-links a").forEach(a => a.addEventListener("click", () => h.classList.remove("open")));
  const forget = () => { try { sessionStorage.removeItem("mrp_back_cont"); } catch { /* nimic */ } };
  h.querySelector(".mrp-back")?.addEventListener("click", forget);
  h.querySelector("[data-out]")?.addEventListener("click", () => {
    try { localStorage.removeItem("mrp_auth"); } catch { /* fără stocare */ }
    try { fetch("/api/auth/sesiune-panou", { method: "DELETE", keepalive: true }).catch(() => {}); } catch { /* fără rețea */ }
    location.href = "login.html";
  });
  // numele confirmat de server (dacă între timp s-a schimbat) și poza de Discord
  if (user) fetch("/api/me", { headers: { Authorization: "Bearer " + auth.token } }).then(r => r.ok ? r.json() : null).then(me => {
    if (!me) return;
    const n = me.display_name || me.username;
    if (n) { h.querySelector(".mrp-acc b").textContent = n; }
    if (me.discord_id && /^\w+$/.test(me.discord_avatar || "")) {
      const im = new Image();
      im.onload = () => { const av = h.querySelector(".mrp-av"); av.textContent = ""; im.style.cssText = "width:100%;height:100%;border-radius:50%;object-fit:cover"; av.appendChild(im); };
      im.alt = ""; im.src = `https://cdn.discordapp.com/avatars/${encodeURIComponent(me.discord_id)}/${encodeURIComponent(me.discord_avatar)}.png?size=64`;
    }
  }).catch(() => {});
})();
