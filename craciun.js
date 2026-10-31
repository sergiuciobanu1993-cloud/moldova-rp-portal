// (31.10.2026) Questurile de Crăciun — partea din fiecare pagină.
// Încărcat de pwa.js doar pentru cine e logat. Întreabă serverul
// (/api/craciun/pagina) dacă pe pagina asta e ascuns un cadou și ce sarcini
// ale zilei se pot bifa aici; restul (calendarul, progresul) e pe craciun.html.
//   • Cadoul apare după câteva secunde, într-un loc la întâmplare, stă puțin
//     și apoi zboară — dacă nu l-ai prins, revine mai târziu.
//   • Sarcinile „stai X secunde pe pagina…" se numără doar cât e fila deschisă.
//   • Sarcinile cu eveniment vin de la alte scripturi: „mrp:muzica" (widgetul
//     de muzică, site-audio.js) și „mrp:bulgare" (oamenii de zăpadă, tema.js).
(function () {
  "use strict";
  var auth;
  try { auth = JSON.parse(localStorage.getItem("mrp_auth") || "null"); } catch (e) { auth = null; }
  if (!auth || !auth.token) return;
  var file = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
  if (/^(admin|mdt|login|register|auth-callback|offline)/.test(file)) return;

  function api(path, body) {
    return fetch(path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + auth.token },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._ok = r.ok; return d; }); })
      .catch(function () { return { _ok: false }; });
  }
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- stiluri (nu depind de tema site-ului) ----
  var css = document.createElement("style");
  css.textContent =
    ".xq-gift{position:fixed;z-index:9000;width:58px;height:58px;padding:0;border:0;background:none;cursor:pointer;filter:drop-shadow(0 6px 14px rgba(0,0,0,.45)) drop-shadow(0 0 12px rgba(255,214,120,.55));" +
    "animation:xqIn .5s cubic-bezier(.3,1.6,.5,1) both,xqBob 1.6s ease-in-out .5s infinite}" +
    ".xq-gift svg{display:block;width:100%;height:100%}" +
    ".xq-gift:focus-visible{outline:3px solid #ffd27a;outline-offset:4px;border-radius:12px}" +
    ".xq-gift.out{animation:xqOut .7s ease-in forwards}" +
    ".xq-gift.got{animation:xqGot .45s ease-out forwards}" +
    "@keyframes xqIn{from{transform:scale(0) rotate(-30deg);opacity:0}to{transform:none;opacity:1}}" +
    "@keyframes xqBob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-8px) rotate(4deg)}}" +
    "@keyframes xqOut{to{transform:translate(40px,-120vh) rotate(40deg);opacity:0}}" +
    "@keyframes xqGot{to{transform:scale(1.8);opacity:0}}" +
    ".xq-spark{position:fixed;z-index:9001;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;pointer-events:none;animation:xqSpark .8s ease-out forwards}" +
    "@keyframes xqSpark{to{transform:translate(var(--dx),var(--dy)) scale(.3);opacity:0}}" +
    ".xq-toast{position:fixed;left:50%;bottom:86px;z-index:9002;transform:translateX(-50%);max-width:min(440px,calc(100vw - 24px));box-sizing:border-box;display:flex;gap:12px;align-items:center;" +
    "padding:12px 16px;border-radius:14px;background:rgba(12,18,30,.97);border:1px solid rgba(242,184,75,.55);box-shadow:0 14px 34px rgba(0,0,0,.5);color:#f5f7fa;" +
    "font:600 13px/1.4 Inter,system-ui,sans-serif;animation:xqToast .35s ease-out both}" +
    ".xq-toast .tx{flex:1;min-width:0}.xq-toast b{display:block;color:#ffd27a;font-size:14px}" +
    ".xq-toast a{color:#9fd8ff;font-weight:800;white-space:nowrap;text-decoration:none}" +
    ".xq-toast .ic{font-size:26px;line-height:1}" +
    "@keyframes xqToast{from{transform:translate(-50%,16px);opacity:0}}" +
    "@media (prefers-reduced-motion:reduce){.xq-gift,.xq-gift.out,.xq-gift.got,.xq-toast{animation:none}.xq-spark{display:none}}";
  document.head.appendChild(css);

  var toastTimer = 0;
  function toast(icon, title, text, link) {
    var old = document.querySelector(".xq-toast");
    if (old) old.remove();
    var t = document.createElement("div");
    t.className = "xq-toast";
    t.setAttribute("role", "status");
    t.innerHTML = '<span class="ic" aria-hidden="true">' + icon + '</span><div class="tx"><b></b><span class="msg"></span></div>' + (link ? '<a href="/craciun.html">Vezi questurile →</a>' : "");
    t.querySelector(".tx b").textContent = title;
    t.querySelector(".tx .msg").textContent = text || "";
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 6500);
  }
  function sparks(x, y) {
    if (reduced) return;
    var cols = ["#ffd27a", "#ffffff", "#e8414f", "#33c27a", "#9fd8ff"];
    for (var i = 0; i < 18; i++) {
      var s = document.createElement("i");
      s.className = "xq-spark";
      s.style.left = x + "px"; s.style.top = y + "px";
      s.style.background = cols[i % cols.length];
      var a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 70;
      s.style.setProperty("--dx", Math.round(Math.cos(a) * r) + "px");
      s.style.setProperty("--dy", Math.round(Math.sin(a) * r) + "px");
      s.addEventListener("animationend", function () { this.remove(); });
      document.body.appendChild(s);
    }
  }
  function badgesSay(list) {
    (list || []).forEach(function (b, i) {
      setTimeout(function () { toast(b.icon, "Insignă nouă: " + b.title, "Ai primit și un bilet la tombola de Crăciun.", true); }, 2200 + i * 3000);
    });
  }

  // ---- cadoul ascuns ----
  var COLORS = [["#e8414f", "#a31d2b"], ["#33c27a", "#1d7d4c"], ["#4b7bff", "#2848a8"], ["#b04cf0", "#6d2a99"]];
  function giftSvg() {
    var c = COLORS[Math.floor(Math.random() * COLORS.length)];
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="26" width="48" height="32" rx="4" fill="' + c[0] + '"/>' +
      '<rect x="8" y="26" width="48" height="8" fill="' + c[1] + '" opacity=".55"/><rect x="5" y="20" width="54" height="10" rx="3" fill="' + c[0] + '"/>' +
      '<rect x="28" y="20" width="8" height="38" fill="#ffd27a"/><rect x="5" y="23" width="54" height="4" fill="#ffd27a" opacity=".9"/>' +
      '<path d="M32 20c-4-10-16-12-16-5 0 5 9 6 16 5zM32 20c4-10 16-12 16-5 0 5-9 6-16 5z" fill="#ffd27a" stroke="#c48a1c" stroke-width="1.5"/>' +
      '<circle cx="32" cy="20" r="3.5" fill="#f2b84b"/></svg>';
  }
  function placeGift(gift) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "xq-gift";
    b.setAttribute("aria-label", "Un cadou ascuns! Apasă ca să-l iei");
    b.title = "Un cadou ascuns!";
    b.innerHTML = giftSvg();
    var w = window.innerWidth, h = window.innerHeight;
    b.style.left = Math.round(16 + Math.random() * Math.max(10, w - 90)) + "px";
    b.style.top = Math.round(h * 0.18 + Math.random() * h * 0.6) + "px";
    var gone = setTimeout(function () {
      b.classList.add("out");
      setTimeout(function () { b.remove(); }, 750);
      setTimeout(function () { placeGift(gift); }, 35000 + Math.random() * 40000); // revine mai târziu
    }, 28000);
    b.addEventListener("click", function () {
      clearTimeout(gone);
      var r = b.getBoundingClientRect();
      b.disabled = true;
      api("/api/craciun/cadou", { token: gift.token }).then(function (d) {
        if (!d._ok) { b.remove(); toast("🎁", "Cadoul a scăpat", d.error || "Încearcă din nou mai târziu."); return; }
        sparks(r.left + r.width / 2, r.top + r.height / 2);
        b.classList.add("got");
        setTimeout(function () { b.remove(); }, 500);
        toast("🎁", "Ai găsit un cadou! " + d.found + " din " + d.total,
          d.found >= d.total ? "Le-ai găsit pe toate!" : "Mai sunt " + (d.total - d.found) + " ascunse prin site.", true);
        badgesSay(d.newBadges);
      });
    });
    document.body.appendChild(b);
  }

  // ---- sarcinile zilei ----
  function done(task) {
    api("/api/craciun/sarcina", { id: task.id }).then(function (d) {
      if (!d._ok) return;
      toast("✅", "Sarcină îndeplinită (" + d.doneToday + "/" + d.of + ")", d.dayDone ? "Ai bifat toate sarcinile de azi! Zile bifate: " + d.taskDays + "." : task.text, true);
      badgesSay(d.newBadges);
    });
  }
  function onPage(task) {
    var left = Math.max(1, task.secs || 5);
    var iv = setInterval(function () {
      if (document.hidden) return;
      if (--left <= 0) { clearInterval(iv); done(task); }
    }, 1000);
  }
  function onEvent(task) {
    var name = "mrp:" + task.event;
    var fn = function () { document.removeEventListener(name, fn); done(task); };
    document.addEventListener(name, fn);
  }

  api("/api/craciun/pagina?p=" + encodeURIComponent(file)).then(function (st) {
    if (!st || !st._ok || !st.active) return;
    // linkurile spre pagina questurilor (ascunse în afara sezonului)
    [].forEach.call(document.querySelectorAll("[data-craciun-link]"), function (a) { a.hidden = false; });
    if (st.gift && !reduced) setTimeout(function () { placeGift(st.gift); }, 6000 + Math.random() * 9000);
    else if (st.gift) placeGift(st.gift);
    (st.tasks || []).forEach(function (t) { if (t.event) onEvent(t); else onPage(t); });
  });
})();
