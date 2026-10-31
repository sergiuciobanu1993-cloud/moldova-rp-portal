// (31.10.2026) Sondajul de pe site — se afișează în orice element [data-sondaj]
// (prima pagină și Contul meu). Datele: /api/sondaj (backend/server.js, „Sondaje").
// Votează doar cine e logat și are contul legat de personaj; rezultatele se văd
// după vot sau după ce s-a închis sondajul. Sondajele le pun fondatorii din
// Admin → Sondaje.
(function () {
  "use strict";
  var boxes = document.querySelectorAll("[data-sondaj]");
  if (!boxes.length) return;
  var auth = null;
  try { auth = JSON.parse(localStorage.getItem("mrp_auth") || "null"); } catch (e) { auth = null; }
  var token = auth && auth.token;

  var css = document.createElement("style");
  css.textContent =
    ".sj{position:relative;padding:24px;border-radius:16px;border:1px solid rgba(255,138,31,.32);background:linear-gradient(150deg,rgba(255,138,31,.08),transparent 55%),var(--panel,#101214);color:var(--text,#f5f5f5)}" +
    ".sj-eye{margin:0;font-size:10px;letter-spacing:.18em;font-weight:900;color:var(--orange,#ff8a1f)}" +
    ".sj h2{margin:6px 0 4px;font-size:clamp(20px,2.4vw,26px);line-height:1.25;letter-spacing:-.01em;text-wrap:balance}" +
    ".sj-sub{margin:0 0 16px;color:var(--muted,#9ca1a8);font-size:13px}" +
    ".sj-opts{display:grid;gap:8px}" +
    ".sj-opt{position:relative;display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;min-height:46px;padding:10px 14px;border-radius:11px;border:1px solid var(--line,rgba(255,255,255,.1));background:rgba(255,255,255,.03);color:inherit;font:700 14px/1.35 Inter,system-ui,sans-serif;text-align:left;cursor:pointer;overflow:hidden;transition:border-color .15s ease}" +
    ".sj-opt:hover:not(:disabled){border-color:var(--orange,#ff8a1f)}" +
    ".sj-opt:focus-visible{outline:2px solid var(--orange,#ff8a1f);outline-offset:2px}" +
    ".sj-opt:disabled{cursor:default}" +
    ".sj-opt i{position:absolute;left:0;top:0;bottom:0;background:rgba(255,138,31,.16);transition:width .7s ease;pointer-events:none}" +
    ".sj-opt span,.sj-opt b{position:relative}" +
    ".sj-opt b{font-variant-numeric:tabular-nums;color:var(--muted,#9ca1a8);font-size:13px;white-space:nowrap}" +
    ".sj-opt.mine{border-color:var(--orange,#ff8a1f)}.sj-opt.mine b{color:var(--orange,#ff8a1f)}" +
    ".sj-msg{margin:12px 0 0;font-size:13px;color:var(--muted,#9ca1a8)}.sj-msg a{color:var(--orange,#ff8a1f);font-weight:800}" +
    ".sj-err{color:#ff8a7a}" +
    "@media (prefers-reduced-motion:reduce){.sj-opt i{transition:none}}";
  document.head.appendChild(css);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(iso) { return new Date(iso).toLocaleString("ro-RO", { timeZone: "Europe/Chisinau", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); }

  function render(box, p, msg) {
    var res = p.counts;
    var sub = p.open
      ? (p.endsAt ? "Votezi o singură dată · se închide pe " + when(p.endsAt) : "Votezi o singură dată")
      : "Sondaj încheiat · " + p.total + (p.total === 1 ? " vot" : " de voturi");
    if (p.open && res) sub = "Mulțumim pentru vot! · " + p.total + (p.total === 1 ? " vot" : " de voturi") + " până acum";
    var opts = p.options.map(function (o, i) {
      var pct = res && p.total ? Math.round(res[i] / p.total * 100) : 0;
      return '<button type="button" class="sj-opt' + (p.mine === i ? " mine" : "") + '" data-i="' + i + '"' + (res || !p.open ? " disabled" : "") + ">" +
        (res ? '<i style="width:0" data-w="' + pct + '%"></i>' : "") + "<span>" + esc(o) + (p.mine === i ? " ✓" : "") + "</span>" +
        (res ? "<b>" + pct + "% · " + res[i] + "</b>" : "") + "</button>";
    }).join("");
    var note = msg || (!token && p.open ? 'Ca să votezi, <a href="login.html">intră în cont</a>.' : "");
    box.innerHTML = '<div class="sj"><p class="sj-eye">🗳 SONDAJ</p><h2>' + esc(p.question) + '</h2><p class="sj-sub">' + esc(sub) + '</p><div class="sj-opts">' + opts + "</div>" + (note ? '<p class="sj-msg">' + note + "</p>" : "") + "</div>";
    box.setAttribute("data-poll", p.id);
    box.hidden = false;
    requestAnimationFrame(function () { [].forEach.call(box.querySelectorAll(".sj-opt i"), function (i) { i.style.width = i.dataset.w; }); });
  }

  function load() {
    fetch("/api/sondaj", { headers: token ? { Authorization: "Bearer " + token } : {} })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.poll) return;
        [].forEach.call(boxes, function (box) { render(box, d.poll); });
      }).catch(function () {});
  }

  [].forEach.call(boxes, function (box) {
    box.addEventListener("click", function (e) {
      var b = e.target.closest(".sj-opt");
      if (!b || b.disabled) return;
      if (!token) { location.href = "login.html"; return; }
      var all = box.querySelectorAll(".sj-opt");
      [].forEach.call(all, function (x) { x.disabled = true; });
      var id = box.getAttribute("data-poll");
      fetch("/api/sondaj/" + id + "/vot", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ option: Number(b.dataset.i) }),
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._ok = r.ok; return d; }); })
        .then(function (d) {
          if (d._ok && d.poll) { [].forEach.call(boxes, function (x) { render(x, d.poll); }); return; }
          [].forEach.call(all, function (x) { x.disabled = false; });
          var m = box.querySelector(".sj-msg") || box.querySelector(".sj").appendChild(document.createElement("p"));
          m.className = "sj-msg sj-err";
          m.textContent = d.error || "Nu s-a putut trimite votul. Încearcă din nou.";
        });
    });
  });
  load();
})();
