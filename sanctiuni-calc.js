// (06.11.2026) Calculatorul de sancțiuni: cauți abaterea (MG, DM, RK, „no fear"…), o adaugi,
// iar el adună minutele de jail și warn-urile și scrie motivul. Datele vin direct din
// regulamentul „Sancțiuni oficiale" de pe site (/api/regulations/sanctiuni-oficiale), deci
// când se schimbă regulamentul, se schimbă și calculatorul. Capitolele 1–6 au minute fixe;
// capitolul 10 (pedepsele din celelalte regulamente) au de multe ori un interval („35–90 de
// minute"): acolo minutele se pot schimba din listă.
// Folosit de calculator-sanctiuni.html (public) și admin-sanctiuni.html (staff).
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();
  const clean = s => String(s || "").replace(/\*\*/g, "").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
  const minLabel = m => `${m} ${m === 1 ? "minut" : "min"}`;

  function parse(md) {
    const items = [];
    let mode = "skip", minutes = null, group = "", reg = "", cur = null;
    for (const raw of String(md || "").split("\n")) {
      const l = raw.trim();
      if (/^# /.test(l)) {
        cur = null;
        const m = /SANC[ȚT]IUNI\s*[–-]\s*(\d+)\s*MINUT/i.exec(l);
        if (m) { mode = "main"; minutes = +m[1]; group = `Jail ${m[1]} minute`; }
        else if (/^#\s*\S*\s*10\./.test(l) || /CELELALTE REGULAMENTE/i.test(l)) mode = "other";
        else mode = "skip";
        continue;
      }
      if (mode === "main") {
        if (/^###\s/.test(l)) {
          const t = clean(l.replace(/^###\s*/, ""));
          const [a, b] = t.split(/\s+[—–-]\s+/);
          let code = null, name = t;
          // codul e partea scurtă (MG, DM, RDM, RS…): „MG — METAGAMING" sau „ROLEPLAY SCÂRBOS — RS"
          if (b && /^[A-Z]{1,4}$/.test(a)) { code = a; name = b; } else if (b && /^[A-Z]{1,4}$/.test(b)) { code = b; name = a; }
          cur = { id: "o" + items.length, kind: "main", group, code, name, desc: "", minutes, min: minutes, max: minutes, warns: 0, ban: "" };
          items.push(cur);
          continue;
        }
        if (!cur || !l || /^---/.test(l)) continue;
        const w = /suplimentar[ăa]\s*:\s*\+?\s*(\d+)\s*warn/i.exec(clean(l));
        if (w) { cur.warns = +w[1]; continue; }
        if (!cur.desc && !/^>/.test(l) && !/^se sancționează|^următoarele/i.test(l)) cur.desc = clean(l);
        continue;
      }
      if (mode === "other") {
        if (/^##\s/.test(l)) { group = clean(l.replace(/^##\s*/, "")); reg = ""; continue; }
        const r = /^Regulamentul complet:\s*\*\*(.+?)\*\*/i.exec(l);
        if (r) { reg = clean(r[1]); continue; }
        const m = /^\*\s+\*\*([^*]+)\*\*\s*(.+?)\s+—\s+⚖️?\s*(.+)$/.exec(l);
        if (!m) continue;
        const pen = clean(m[3]);
        const range = /(\d+)\s*[–-]\s*(\d+)\s*(?:de\s*)?minut/i.exec(pen);
        const one = !range && /(\d+)\s*(?:de\s*)?minut/i.exec(pen);
        const wn = /\+?\s*(\d+)\s*warn/i.exec(pen);
        const it = {
          id: "r" + items.length, kind: "other", group, reg, code: clean(m[1]), name: clean(m[2]).replace(/…$/, "…"), desc: "",
          penalty: pen,
          min: range ? +range[1] : one ? +one[1] : 0, max: range ? +range[2] : one ? +one[1] : 0,
          warns: wn ? +wn[1] : /\bwarn\b/i.test(pen) ? 1 : 0,
          ban: /\bban\b/i.test(pen) ? (/(ban[^/+,;]*)/i.exec(pen) || [""])[0].trim() : "",
        };
        it.minutes = it.min;
        items.push(it);
      }
    }
    items.forEach(it => { it.q = norm([it.code, it.name, it.desc, it.group, it.reg, it.penalty].join(" ")); });
    return items;
  }

  const CSS = `.sc{--sc-panel:var(--panel,#111317);--sc-line:var(--line,rgba(255,255,255,.08));--sc-muted:var(--muted,#8d939b);--sc-or:#ff8a1f;--sc-or2:#ffa24a;display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
.sc *{box-sizing:border-box}
.sc-left{min-width:0}
.sc-search{position:relative;margin:0 0 12px}
.sc-search input{width:100%;min-height:50px;padding:0 16px 0 46px;border-radius:13px;border:1px solid var(--sc-line);background:#0c0d10;color:inherit;font:inherit;font-size:15px;outline:0}
.sc-search input:focus{border-color:var(--sc-or);box-shadow:0 0 0 3px rgba(255,138,31,.14)}
.sc-search svg{position:absolute;left:15px;top:50%;width:19px;height:19px;transform:translateY(-50%);color:var(--sc-muted);fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.sc-chips{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 14px}
.sc-chip{padding:7px 12px;border-radius:9px;border:1px solid var(--sc-line);background:rgba(255,255,255,.03);color:#c9cdd2;font:inherit;font-weight:800;font-size:12.5px;cursor:pointer}
.sc-chip:hover{border-color:rgba(255,255,255,.18);color:#fff}
.sc-chip[aria-pressed="true"]{background:linear-gradient(135deg,#ffa24a,#ff7a14);border-color:transparent;color:#1a0f02}
.sc-list{display:flex;flex-direction:column;gap:8px}
.sc-g{margin:10px 0 2px;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#757b83}
.sc-g:first-child{margin-top:0}
.sc-it{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:12px;border:1px solid var(--sc-line);background:var(--sc-panel)}
.sc-it.on{border-color:rgba(255,138,31,.55);background:rgba(255,138,31,.06)}
.sc-code{flex:none;min-width:52px;padding:6px 8px;border-radius:9px;background:rgba(255,138,31,.12);border:1px solid rgba(255,138,31,.35);color:var(--sc-or2);font-weight:900;font-size:12px;text-align:center;letter-spacing:.03em}
.sc-code.n{background:rgba(255,255,255,.05);border-color:var(--sc-line);color:#aeb3b9}
.sc-tx{flex:1;min-width:0}
.sc-tx b{display:block;font-size:14px}
.sc-tx small{display:block;margin-top:2px;color:var(--sc-muted);font-size:12px;line-height:1.45;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sc-pen{flex:none;text-align:right;font-size:12.5px;font-weight:800;white-space:nowrap}
.sc-pen span{display:block}
.sc-pen .w{color:#ffd166}.sc-pen .b{color:#ff8a8a}
.sc-add{flex:none;width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,138,31,.45);background:transparent;color:var(--sc-or2);font:inherit;font-size:20px;font-weight:900;line-height:1;cursor:pointer}
.sc-add:hover{background:rgba(255,138,31,.12)}
.sc-it.on .sc-add{background:linear-gradient(135deg,#ffa24a,#ff7a14);border-color:transparent;color:#1a0f02}
.sc-empty{padding:18px;border-radius:12px;border:1px dashed var(--sc-line);color:var(--sc-muted);text-align:center}
.sc-sum{position:sticky;top:120px;padding:18px;border-radius:16px;border:1px solid rgba(255,138,31,.35);background:radial-gradient(500px 160px at 100% 0,rgba(255,138,31,.12),transparent 70%),var(--sc-panel)}
.sc-sum h3{margin:0 0 12px;font-size:16px}
.sc-tot{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 14px}
.sc-tot div{padding:12px;border-radius:12px;border:1px solid var(--sc-line);background:#0c0d10}
.sc-tot small{display:block;color:var(--sc-muted);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.sc-tot strong{display:block;font-size:26px;font-weight:900;margin-top:2px;font-variant-numeric:tabular-nums}
.sc-tot .w strong{color:#ffd166}
.sc-sel{display:flex;flex-direction:column;gap:6px;margin:0 0 12px}
.sc-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--sc-line);font-size:13px}
.sc-row b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-row input{width:62px;padding:5px 6px;border-radius:7px;border:1px solid var(--sc-line);background:#0c0d10;color:inherit;font:inherit;font-size:12.5px;text-align:right}
.sc-row em{font-style:normal;color:#ffd166;font-size:12px;white-space:nowrap}
.sc-x{width:26px;height:26px;border-radius:7px;border:1px solid var(--sc-line);background:none;color:#aeb3b9;cursor:pointer;font-size:14px;line-height:1}
.sc-x:hover{border-color:#ff7272;color:#ff8a8a}
.sc-ban{margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,114,114,.4);background:rgba(255,114,114,.07);color:#ffb3b3;font-size:12.5px;line-height:1.5}
.sc-reason{width:100%;min-height:78px;resize:vertical;padding:10px 12px;border-radius:10px;border:1px solid var(--sc-line);background:#0c0d10;color:inherit;font:inherit;font-size:13px;line-height:1.5}
.sc-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.sc-btn{flex:1 1 auto;min-height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--sc-line);background:rgba(255,255,255,.04);color:inherit;font:inherit;font-weight:800;font-size:13px;cursor:pointer}
.sc-btn.p{background:linear-gradient(135deg,#ffa24a,#ff7a14);border-color:transparent;color:#1a0f02}
.sc-btn:disabled{opacity:.5;cursor:default}
.sc-note{margin:10px 0 0;color:var(--sc-muted);font-size:11.5px;line-height:1.5}
.sc-hint{color:var(--sc-muted);font-size:13px;margin:0}
@media(max-width:980px){.sc{grid-template-columns:1fr}.sc-sum{position:static;order:-1}}
@media(max-width:560px){.sc-it{flex-wrap:wrap}.sc-pen{text-align:left;order:3;flex-basis:100%;padding-left:66px;display:flex;gap:10px}}`;

  function mount(root, opts = {}) {
    if (!document.getElementById("sc-css")) { const st = document.createElement("style"); st.id = "sc-css"; st.textContent = CSS; document.head.appendChild(st); }
    root.innerHTML = '<p class="sc-hint">Se încarcă sancțiunile din regulament…</p>';
    let items = [], filter = "", q = "";
    const picked = new Map();   // id → minutele alese
    fetch("/api/regulations/sanctiuni-oficiale").then(r => r.ok ? r.json() : Promise.reject()).then(d => {
      items = parse(d.content || "");
      if (!items.length) throw new Error();
      build();
    }).catch(() => { root.innerHTML = '<p class="sc-hint">Nu am putut încărca regulamentul „Sancțiuni oficiale". Încearcă din nou puțin mai târziu.</p>'; });

    function build() {
      const mins = [...new Set(items.filter(i => i.kind === "main").map(i => i.minutes))].sort((a, b) => a - b);
      root.innerHTML = `<div class="sc">
        <div class="sc-left">
          <label class="sc-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" placeholder="Caută: MG, DM, RK, no fear, troll, jaf, poliție…" aria-label="Caută abaterea" autocomplete="off"></label>
          <div class="sc-chips" role="group" aria-label="Filtru">
            <button type="button" class="sc-chip" data-f="" aria-pressed="true">Toate</button>
            ${mins.map(m => `<button type="button" class="sc-chip" data-f="m${m}" aria-pressed="false">${m} min</button>`).join("")}
            <button type="button" class="sc-chip" data-f="w" aria-pressed="false">Cu warn</button>
            ${items.some(i => i.kind === "other") ? '<button type="button" class="sc-chip" data-f="other" aria-pressed="false">Din alte regulamente</button>' : ""}
          </div>
          <div class="sc-list" id="sc-list"></div>
        </div>
        <aside class="sc-sum" aria-live="polite"></aside>
      </div>`;
      const input = root.querySelector(".sc-search input");
      input.addEventListener("input", () => { q = norm(input.value); list(); });
      root.querySelector(".sc-chips").addEventListener("click", e => {
        const b = e.target.closest("[data-f]"); if (!b) return;
        filter = b.dataset.f;
        root.querySelectorAll(".sc-chip").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        list();
      });
      root.querySelector("#sc-list").addEventListener("click", e => {
        const b = e.target.closest("[data-add]"); if (!b) return;
        const it = items.find(i => i.id === b.dataset.add);
        if (picked.has(it.id)) picked.delete(it.id); else picked.set(it.id, it.minutes);
        list(); summary();
      });
      list(); summary();
    }

    function list() {
      const box = root.querySelector("#sc-list");
      const words = q ? q.split(" ") : [];
      let show = items.filter(i => {
        if (filter === "other" && i.kind !== "other") return false;
        if (filter === "w" && !i.warns) return false;
        if (/^m\d+$/.test(filter) && !(i.kind === "main" && i.minutes === +filter.slice(1))) return false;
        if (!filter && !q && i.kind === "other") return false;   // fără căutare: doar capitolele 1–6
        return words.every(w => i.q.includes(w) || (w.length <= 4 && norm(i.code) === w));
      });
      // codul exact (ex. „rk") primul
      if (q) show.sort((a, b) => (norm(b.code) === q) - (norm(a.code) === q));
      if (!show.length) { box.innerHTML = `<div class="sc-empty">Nimic găsit${q ? ` pentru „${esc(input().value)}”` : ""}. Încearcă alt cuvânt sau codul abaterii (ex. MG, DM, RDM).</div>`; return; }
      let lastG = "";
      box.innerHTML = show.slice(0, 120).map(i => {
        const g = i.group !== lastG ? `<div class="sc-g">${esc(i.group)}${i.reg ? ` · ${esc(i.reg)}` : ""}</div>` : "";
        lastG = i.group;
        const pen = i.kind === "main" ? `<span>${minLabel(i.minutes)}</span>` : (i.max ? `<span>${i.min === i.max ? minLabel(i.min) : `${i.min}–${i.max} min`}</span>` : "");
        return `${g}<div class="sc-it${picked.has(i.id) ? " on" : ""}">
          <span class="sc-code${i.code ? "" : " n"}">${esc(i.code || "—")}</span>
          <div class="sc-tx"><b>${esc(i.name)}</b>${i.desc ? `<small>${esc(i.desc)}</small>` : i.penalty ? `<small>⚖️ ${esc(i.penalty)}</small>` : ""}</div>
          <div class="sc-pen">${pen}${i.warns ? `<span class="w">+${i.warns} Warn</span>` : ""}${i.ban ? '<span class="b">poate fi ban</span>' : ""}</div>
          <button type="button" class="sc-add" data-add="${i.id}" aria-label="${picked.has(i.id) ? "Scoate" : "Adaugă"} ${esc(i.code || i.name)}" title="${picked.has(i.id) ? "Scoate din calcul" : "Adaugă la calcul"}">${picked.has(i.id) ? "✓" : "+"}</button>
        </div>`;
      }).join("");
    }
    const input = () => root.querySelector(".sc-search input");

    function totals() {
      const sel = [...picked].map(([id, m]) => ({ it: items.find(i => i.id === id), m: Math.max(0, Math.round(Number(m) || 0)) }));
      return { sel, minutes: sel.reduce((s, x) => s + x.m, 0), warns: sel.reduce((s, x) => s + (x.it.warns || 0), 0), bans: sel.filter(x => x.it.ban).map(x => `${x.it.code || x.it.name}: ${x.it.ban}`) };
    }
    function reasonText(t) {
      if (!t.sel.length) return "";
      const what = t.sel.map(x => x.it.code && x.it.kind === "main" ? x.it.code : x.it.kind === "other" ? `${x.it.group.split(" (")[0]} ${x.it.code}` : x.it.name).join(" + ");
      return `${what} · ${t.minutes} min jail${t.warns ? ` · +${t.warns} Warn` : ""} (Sancțiuni oficiale)`;
    }
    function summary() {
      const box = root.querySelector(".sc-sum");
      const t = totals();
      const keep = box.querySelector(".sc-reason");
      const edited = keep && keep.dataset.edited === "1" ? keep.value : null;
      box.innerHTML = `<h3>Calcul</h3>
        <div class="sc-tot"><div><small>Jail</small><strong>${t.minutes} min</strong></div><div class="w"><small>Warn</small><strong>${t.warns ? "+" + t.warns : "0"}</strong></div></div>
        ${t.sel.length ? `<div class="sc-sel">${t.sel.map(x => `<div class="sc-row"><b title="${esc(x.it.name)}">${esc(x.it.code ? x.it.code + " · " : "")}${esc(x.it.name)}</b>
          ${x.it.min !== x.it.max ? `<input type="number" min="${x.it.min}" max="${x.it.max}" value="${x.m}" data-m="${x.it.id}" aria-label="Minute pentru ${esc(x.it.code || x.it.name)}" title="Între ${x.it.min} și ${x.it.max} minute">` : `<span>${minLabel(x.m)}</span>`}
          ${x.it.warns ? `<em>+${x.it.warns}W</em>` : ""}<button type="button" class="sc-x" data-rm="${x.it.id}" aria-label="Scoate">✕</button></div>`).join("")}</div>`
          : '<p class="sc-hint" style="margin:0 0 12px">Apasă <b>+</b> la abaterile făcute. Minutele și warn-urile se adună.</p>'}
        ${t.bans.length ? `<div class="sc-ban">⚠ Pentru ${t.bans.map(esc).join("; ")} regulamentul prevede și ban. Decide administrația, după caz.</div>` : ""}
        ${t.sel.length ? `<textarea class="sc-reason" aria-label="Motivul sancțiunii"></textarea>
          <div class="sc-btns"><button type="button" class="sc-btn" data-act="copy">Copiază motivul</button>${opts.onApply ? '<button type="button" class="sc-btn p" data-act="apply">Pune în formularul de sancțiune</button>' : ""}<button type="button" class="sc-btn" data-act="clear">Golește</button></div>` : ""}
        <p class="sc-note">Valorile sunt cele din regulamentul „Sancțiuni oficiale”. La fapte grave sau repetate, administrația poate da sancțiuni în plus (8.4–8.5).</p>`;
      const ta = box.querySelector(".sc-reason");
      if (ta) {
        ta.value = edited != null ? edited : reasonText(t);
        if (edited != null) ta.dataset.edited = "1";
        ta.addEventListener("input", () => { ta.dataset.edited = "1"; });
      }
      box.querySelectorAll("[data-m]").forEach(inp => inp.addEventListener("change", () => {
        const it = items.find(i => i.id === inp.dataset.m);
        picked.set(it.id, Math.min(it.max, Math.max(it.min, Math.round(Number(inp.value) || it.min))));
        summary();
      }));
      box.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { picked.delete(b.dataset.rm); list(); summary(); }));
      box.querySelector('[data-act="clear"]')?.addEventListener("click", () => { picked.clear(); list(); summary(); });
      box.querySelector('[data-act="copy"]')?.addEventListener("click", function () {
        const b = this;
        navigator.clipboard.writeText(ta.value).then(() => { b.textContent = "Copiat ✓"; setTimeout(() => { b.textContent = "Copiază motivul"; }, 1600); }).catch(() => { ta.select(); });
      });
      box.querySelector('[data-act="apply"]')?.addEventListener("click", () => opts.onApply({ ...totals(), reason: ta.value }));
    }
  }
  window.SanctiuniCalc = { mount, parse };
})();
