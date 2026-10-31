// Muzica de fundal a paginilor publice — widget mic, fix în colțul din
// dreapta jos: pornit/oprit, volum și (31.10.2026) lista de melodii.
//
// (31.10.2026) Piesa veche (assets/audio/theme.mp3) a fost scoasă. Melodiile
// de acum sunt cântate direct de browser, „la cutia muzicală", din note
// (Web Audio) — fără fișiere audio și fără versuri. Toate sunt vechi și
// libere de drepturi:
//   • Jingle Bells (J. L. Pierpont, 1857)
//   • Noapte de vis / Silent Night (F. X. Gruber, 1818)
//   • We Wish You a Merry Christmas (cântec popular englezesc)
//   • Clopoțeii / Șcedrik (melodie populară ucraineană)
// Pentru o melodie nouă: adaug-o în SONGS (note + bas), apare singură în listă.
//
// Ce ține minte (localStorage, „mrp_audio_state"): volumul, dacă e oprită,
// melodia aleasă și unde rămăsese — ca la trecerea pe altă pagină cântecul
// să continue de unde era, nu de la capăt.
//
// Autoplay: browserele nu lasă sunetul să pornească până la prima apăsare a
// vizitatorului pe pagină — pornim atunci.
(function () {
  "use strict";
  var STORAGE_KEY = "mrp_audio_state";
  var DEFAULT_VOLUME = 0.4;
  var GAP = 2.5; // secunde de liniște între melodii

  // ---------------------------------------------------------------------
  // Notele. Fiecare melodie: tempo (secunde pe timp), melodia ca note
  // „Nume:durată" (R = pauză), basul pe acorduri și, opțional, clopoței
  // de sanie pe fiecare timp.
  // ---------------------------------------------------------------------
  var SEMI = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, Bb: 10, B: 11 };
  function NOTE(n) {
    var m = /^([A-G](?:#|b)?)(\d)$/.exec(n);
    return 440 * Math.pow(2, (SEMI[m[1]] + (Number(m[2]) + 1) * 12 - 69) / 12);
  }
  function seq(str) { // "E5:1 E5:1 E5:2" → [[frecvență, durată], ...]
    return str.trim().split(/\s+/).map(function (tok) {
      var p = tok.split(":");
      return [p[0] === "R" ? null : NOTE(p[0]), Number(p[1])];
    });
  }
  function bass(chords, beatsPerChord, split) { // tonica, apoi cvinta, pe fiecare acord
    var R = { C: ["C3", "G3"], F: ["F3", "C3"], G: ["G2", "D3"], D: ["D3", "A3"], Am: ["A2", "E3"], Em: ["E3", "B2"], B: ["B2", "F#3"] };
    var out = [];
    chords.split(" ").forEach(function (ch) {
      out.push([NOTE(R[ch][0]), split]);
      if (beatsPerChord > split) out.push([NOTE(R[ch][1]), beatsPerChord - split]);
    });
    return out;
  }
  function rep(s, n) { var o = ""; for (var i = 0; i < n; i++) o += s; return o; }

  var JB_A = "E5:1 E5:1 E5:2 E5:1 E5:1 E5:2 E5:1 G5:1 C5:1.5 D5:0.5 E5:4 ";
  var WISH = "G4:1 C5:1 C5:0.5 D5:0.5 C5:0.5 B4:0.5 A4:1 A4:1 A4:1 D5:1 D5:0.5 E5:0.5 D5:0.5 C5:0.5 B4:1 G4:1 G4:1 " +
    "E5:1 E5:0.5 F5:0.5 E5:0.5 D5:0.5 C5:1 A4:1 G4:0.5 G4:0.5 A4:1 D5:1 B4:1 C5:2 ";
  var SHC = "G5:1 F#5:0.5 G5:0.5 E5:1 ";    // motivul din „Șcedrik"
  var SHC_HI = "B5:1 A5:0.5 B5:0.5 G5:1 ";  // același, o terță mai sus

  var SONGS = [
    {
      id: "jingle", title: "Jingle Bells", q: 0.21, bells: true,
      mel: seq(JB_A +
        "F5:1 F5:1 F5:1.5 F5:0.5 F5:1 E5:1 E5:1 E5:0.5 E5:0.5 E5:1 D5:1 D5:1 E5:1 D5:2 G5:2 " +
        JB_A +
        "F5:1 F5:1 F5:1.5 F5:0.5 F5:1 E5:1 E5:1 E5:0.5 E5:0.5 G5:1 G5:1 F5:1 D5:1 C5:4"),
      bass: bass("C C C C F C D G C C C C F C G C", 4, 2),
    },
    {
      id: "noapte", title: "Noapte de vis", sub: "Silent Night", q: 0.27, soft: true,
      mel: seq(
        "G5:1.5 A5:0.5 G5:1 E5:3 G5:1.5 A5:0.5 G5:1 E5:3 D6:2 D6:1 B5:3 C6:2 C6:1 G5:3 " +
        "A5:2 A5:1 C6:1.5 B5:0.5 A5:1 G5:1.5 A5:0.5 G5:1 E5:3 A5:2 A5:1 C6:1.5 B5:0.5 A5:1 G5:1.5 A5:0.5 G5:1 E5:3 " +
        "D6:2 D6:1 F6:1.5 D6:0.5 B5:1 C6:3 E6:3 C6:1.5 G5:0.5 E5:1 G5:1.5 F5:0.5 D5:1 C5:6"),
      bass: bass("C C G C F C F C G C C C", 6, 3),
    },
    {
      id: "wish", title: "We Wish You a Merry Christmas", q: 0.28,
      mel: seq(WISH + WISH + "R:1"),
      // primul timp e anacruza (G4), de aceea basul intră după un timp
      bass: [[null, 1]].concat(bass("C F G Em Am F G C C F G Em Am F G C", 3, 1)),
    },
    {
      id: "clopotei", title: "Clopoțeii", sub: "Șcedrik", q: 0.24,
      mel: seq(rep(SHC, 8) + rep(SHC_HI, 4) + rep(SHC, 3) + "E5:3"),
      mel2: seq(rep("R:3 ", 4) + rep(SHC_HI, 4) + rep(SHC, 4) + rep("R:3 ", 4)),
      bass: bass("Em D C B Em D C B Em D C B Em D C Em", 3, 3),
    },
  ];
  var ALL = "toate";

  // fiecare melodie → o listă de note {at, f, d, v} (v = vocea), plus lungimea
  SONGS.forEach(function (s) {
    var ev = [];
    function voice(list, v) {
      var t = 0;
      list.forEach(function (n) {
        if (n[0]) ev.push({ at: t * s.q, f: n[0], d: n[1] * s.q, v: v });
        t += n[1];
      });
      return t;
    }
    var beats = voice(s.mel, "mel");
    if (s.mel2) voice(s.mel2, "mel2");
    voice(s.bass, "bass");
    if (s.bells) for (var i = 0; i < beats; i++) ev.push({ at: i * s.q, f: 0, d: 0, v: i % 2 ? "bell" : "bell-soft" });
    ev.sort(function (a, b) { return a.at - b.at; });
    s.ev = ev;
    s.len = beats * s.q + 1.2;
  });
  function songById(id) { for (var i = 0; i < SONGS.length; i++) if (SONGS[i].id === id) return SONGS[i]; return null; }

  // ---------------------------------------------------------------------
  // Ce ținem minte
  // ---------------------------------------------------------------------
  var saved = (function () {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return raw && typeof raw === "object" ? raw : {};
    } catch { return {}; }
  })();
  var volume = typeof saved.volume === "number" ? Math.min(1, Math.max(0, saved.volume)) : DEFAULT_VOLUME;
  var muted = !!saved.muted;
  var choice = saved.choice === ALL || songById(saved.choice) ? saved.choice : ALL;
  // unde rămăsese — doar dacă a fost de curând; altfel de la capăt
  var fresh = typeof saved.at === "number" && Date.now() - saved.at < 30 * 60 * 1000;
  var cur = fresh && songById(saved.song) ? songById(saved.song) : (choice === ALL ? SONGS[0] : songById(choice));
  var pos = fresh && typeof saved.pos === "number" && saved.pos >= 0 && saved.pos < cur.len ? saved.pos : 0;

  // ---------------------------------------------------------------------
  // Redarea: un planificator care pune notele cu ~0,5 s înainte
  // ---------------------------------------------------------------------
  var ctx = null, master = null, bus = null, playing = false, t0 = 0, idx = 0, timer = 0, gapUntil = 0, noiseBuf = null;
  function position() { return playing && ctx && !gapUntil ? Math.max(0, ctx.currentTime - t0) : pos; }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: volume, muted: muted, choice: choice, song: cur.id, pos: Math.round(position() * 10) / 10, at: Date.now() }));
    } catch { /* mod privat — merge, doar nu ține minte între pagini */ }
  }
  function ensureCtx() {
    if (ctx) return ctx;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
    } catch { ctx = null; }
    return ctx;
  }
  function setMaster() { if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05); }
  function env(g, t, a, peak, r) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + r);
  }
  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 0.1);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function tone(type, f, t, peak, a, r, stopAt) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    env(g, t, a, peak, r);
    o.connect(g).connect(bus); o.start(t); o.stop(stopAt);
  }
  function voiceNote(e, t) {
    if (e.v === "mel" || e.v === "mel2") {
      // cutie muzicală: fundamentala + două armonice, stinse încet
      var parts = e.v === "mel" ? [[1, 0.11], [2, 0.04], [3.01, 0.015]] : [[1, 0.055], [2, 0.018]];
      parts.forEach(function (p) { tone("sine", e.f * p[0], t, p[1], 0.004, Math.min(1.3, 0.5 + e.d), t + 1.5); });
    } else if (e.v === "bass") {
      tone("triangle", e.f, t, cur.soft ? 0.06 : 0.085, 0.01, Math.min(0.9, 0.3 + e.d * 0.5), t + 1);
    } else {
      // clopoței de sanie: două tonuri metalice + un fâșâit scurt
      var acc = e.v === "bell" ? 1 : 0.55;
      tone("sine", 3870 * (1 + (Math.random() - 0.5) * 0.04), t, 0.028 * acc, 0.002, 0.12, t + 0.2);
      tone("sine", 5520 * (1 + (Math.random() - 0.5) * 0.04), t, 0.02 * acc, 0.002, 0.12, t + 0.2);
      var n = ctx.createBufferSource(), ng = ctx.createGain(), bp = ctx.createBiquadFilter();
      n.buffer = noise(); bp.type = "bandpass"; bp.frequency.value = 7000; bp.Q.value = 1.5;
      env(ng, t, 0.002, 0.03 * acc, 0.04);
      n.connect(bp).connect(ng).connect(bus); n.start(t); n.stop(t + 0.08);
    }
  }
  function nextSong() {
    if (choice !== ALL) return songById(choice);
    return SONGS[(SONGS.indexOf(cur) + 1) % SONGS.length];
  }
  function newBus() {
    // fiecare pornire are „busul" ei: la oprire îl stingem, ca notele deja
    // puse să nu se mai audă
    if (bus) {
      var old = bus;
      try { old.gain.setTargetAtTime(0, ctx.currentTime, 0.04); } catch { /* */ }
      setTimeout(function () { try { old.disconnect(); } catch { /* */ } }, 400);
    }
    bus = ctx.createGain();
    bus.connect(master);
  }
  function startSong(song, from) {
    cur = song;
    newBus();
    t0 = ctx.currentTime + 0.05 - from;
    idx = 0;
    while (idx < cur.ev.length && cur.ev[idx].at < from - 0.01) idx++;
    paintNow(); paintList(); persist();
  }
  function tick() {
    if (!playing || !ctx) return;
    var now = ctx.currentTime;
    if (gapUntil) {
      if (now >= gapUntil) { gapUntil = 0; startSong(nextSong(), 0); }
      return;
    }
    var horizon = now + 0.5 - t0;
    while (idx < cur.ev.length && cur.ev[idx].at <= horizon) {
      var e = cur.ev[idx++], at = t0 + e.at;
      if (at >= now - 0.02) voiceNote(e, Math.max(at, now));
    }
    if (now - t0 >= cur.len) { pos = 0; gapUntil = now + GAP; paintList(); }
  }
  function play() {
    if (muted || volume === 0 || !ensureCtx()) return;
    var go = function () {
      if (playing || ctx.state !== "running") return;
      playing = true;
      startSong(cur, pos);
      clearInterval(timer);
      timer = setInterval(tick, 100);
      tick();
      refreshIcon();
    };
    if (ctx.state === "running") go();
    else { try { var p = ctx.resume(); if (p && p.then) p.then(go, function () {}); } catch { /* */ } }
  }
  function stop() {
    if (!playing) return;
    if (gapUntil) { cur = nextSong(); pos = 0; gapUntil = 0; } else pos = Math.min(position(), cur.len);
    playing = false;
    clearInterval(timer);
    if (bus) newBus();
    refreshIcon(); paintList(); persist();
  }

  // pornirea la prima apăsare pe pagină (regula browserelor)
  function firstGesture(e) {
    if (e && e.target && e.target.closest && e.target.closest(".mrp-audio-widget")) return; // widgetul se ocupă singur
    document.removeEventListener("pointerdown", firstGesture, true);
    document.removeEventListener("keydown", firstGesture, true);
    play();
  }
  document.addEventListener("pointerdown", firstGesture, true);
  document.addEventListener("keydown", firstGesture, true);
  // fila ascunsă: oprim; la întoarcere reluăm de unde era
  var pausedByHide = false;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && playing) { pausedByHide = true; stop(); }
    else if (!document.hidden && pausedByHide) { pausedByHide = false; play(); }
  });
  window.addEventListener("pagehide", persist);
  setInterval(function () { if (playing) persist(); }, 1000);

  // ---------------------------------------------------------------------
  // Widgetul: buton pornit/oprit, numele melodiei (deschide lista), volum
  // ---------------------------------------------------------------------
  var style = document.createElement("style");
  style.textContent =
    ".mrp-audio-widget{--ma:var(--orange,#ff8a1f);position:fixed;right:18px;bottom:18px;z-index:500;display:flex;align-items:center;gap:8px;" +
    "padding:8px 14px 8px 8px;background:rgba(11,12,13,.88);border:1px solid rgba(255,255,255,.1);border-radius:100px;" +
    "backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(0,0,0,.35);font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#f1f3f5}" +
    ".mrp-audio-btn{width:34px;height:34px;flex-shrink:0;border:0;border-radius:50%;display:grid;place-items:center;" +
    "background:var(--ma);color:#0b0b0b;font-size:15px;cursor:pointer;transition:transform .15s ease}" +
    ".mrp-audio-btn:hover{transform:scale(1.07)}" +
    ".mrp-audio-pick{display:flex;align-items:center;gap:6px;max-width:170px;min-height:34px;padding:0 10px;border:1px solid rgba(255,255,255,.14);border-radius:100px;" +
    "background:rgba(255,255,255,.04);color:inherit;font:700 12px/1.1 Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-align:left}" +
    ".mrp-audio-pick:hover,.mrp-audio-pick[aria-expanded=\"true\"]{border-color:var(--ma)}" +
    ".mrp-audio-pick span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}" +
    ".mrp-audio-pick b{color:var(--ma);font-size:13px}" +
    ".mrp-audio-pick i{font-style:normal;opacity:.6;font-size:10px}" +
    ".mrp-audio-vol{width:70px;accent-color:var(--ma);cursor:pointer}" +
    ".mrp-audio-btn:focus-visible,.mrp-audio-pick:focus-visible,.mrp-audio-list button:focus-visible,.mrp-audio-vol:focus-visible{outline:2px solid var(--ma);outline-offset:2px}" +
    ".mrp-audio-list{position:absolute;right:0;bottom:calc(100% + 10px);width:270px;max-width:calc(100vw - 24px);padding:8px;border-radius:14px;box-sizing:border-box;" +
    "background:rgba(11,14,20,.97);border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 40px rgba(0,0,0,.5);display:grid;gap:2px}" +
    ".mrp-audio-list[hidden]{display:none}" +
    ".mrp-audio-list h4{margin:2px 8px 6px;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.5)}" +
    ".mrp-audio-list button{display:grid;grid-template-columns:22px 1fr auto;align-items:center;gap:8px;width:100%;min-height:42px;padding:6px 8px;border:0;border-radius:9px;" +
    "background:transparent;color:inherit;font:600 13px/1.25 Inter,ui-sans-serif,system-ui,sans-serif;text-align:left;cursor:pointer}" +
    ".mrp-audio-list button:hover{background:rgba(255,255,255,.06)}" +
    ".mrp-audio-list button[aria-checked=\"true\"]{background:rgba(255,255,255,.08);color:var(--ma)}" +
    ".mrp-audio-list button small{display:block;font-size:11px;font-weight:500;color:rgba(255,255,255,.5)}" +
    ".mrp-audio-list .ic{text-align:center}" +
    ".mrp-audio-list .eq{display:none;align-items:flex-end;gap:2px;height:12px}" +
    ".mrp-audio-list .eq i{width:3px;background:var(--ma);border-radius:1px;animation:mrpEq .9s ease-in-out infinite}" +
    ".mrp-audio-list .eq i:nth-child(2){animation-delay:-.3s}.mrp-audio-list .eq i:nth-child(3){animation-delay:-.6s}" +
    ".mrp-audio-list button.is-now .eq{display:flex}" +
    "@keyframes mrpEq{0%,100%{height:3px}50%{height:12px}}" +
    "@media (prefers-reduced-motion:reduce){.mrp-audio-list .eq i{animation:none;height:8px}}" +
    "@media (max-width:520px){.mrp-audio-widget{right:12px;bottom:12px;padding:7px 10px 7px 7px;gap:6px}.mrp-audio-vol{width:52px}.mrp-audio-pick{max-width:118px}}";
  document.head.appendChild(style);

  var widget = document.createElement("div");
  widget.className = "mrp-audio-widget";
  widget.setAttribute("role", "group");
  widget.setAttribute("aria-label", "Muzică de fundal");

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mrp-audio-btn";

  var pick = document.createElement("button");
  pick.type = "button";
  pick.className = "mrp-audio-pick";
  pick.title = "Alege melodia";
  pick.setAttribute("aria-haspopup", "true");
  pick.setAttribute("aria-expanded", "false");
  pick.setAttribute("aria-controls", "mrp-audio-list");

  var list = document.createElement("div");
  list.className = "mrp-audio-list";
  list.id = "mrp-audio-list";
  list.setAttribute("role", "radiogroup");
  list.setAttribute("aria-label", "Melodii");
  list.hidden = true;
  var items = [{ id: ALL, title: "Toate pe rând", ic: "🔀" }].concat(SONGS.map(function (s) { return { id: s.id, title: s.title, sub: s.sub, ic: "♪" }; }));
  list.innerHTML = "<h4>Melodii</h4>" + items.map(function (it) {
    return '<button type="button" role="radio" data-song="' + it.id + '"><span class="ic">' + it.ic + "</span><span>" + it.title +
      (it.sub ? "<small>" + it.sub + "</small>" : "") + '</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></button>';
  }).join("");

  var slider = document.createElement("input");
  slider.type = "range";
  slider.className = "mrp-audio-vol";
  slider.min = "0"; slider.max = "100"; slider.step = "1";
  slider.value = String(Math.round(volume * 100));
  slider.setAttribute("aria-label", "Volum muzică");

  function refreshIcon() {
    btn.textContent = muted || volume === 0 ? "🔇" : "🔊";
    btn.setAttribute("aria-label", muted ? "Pornește muzica" : "Oprește muzica");
    btn.setAttribute("aria-pressed", String(!muted));
  }
  function paintNow() {
    pick.innerHTML = "<b>♪</b><span>" + cur.title + "</span><i>▾</i>";
    pick.setAttribute("aria-label", "Melodia: " + (choice === ALL ? "toate pe rând, acum " : "") + cur.title + ". Apasă ca să alegi alta.");
  }
  function paintList() {
    [].forEach.call(list.querySelectorAll("button[data-song]"), function (b) {
      b.setAttribute("aria-checked", String(b.dataset.song === choice));
      b.classList.toggle("is-now", playing && !gapUntil && b.dataset.song === cur.id);
    });
  }
  function openList(on) {
    list.hidden = !on;
    pick.setAttribute("aria-expanded", String(on));
    if (on) {
      paintList();
      var sel = list.querySelector('[aria-checked="true"]');
      if (sel) sel.focus();
    }
  }
  refreshIcon(); paintNow(); paintList();

  btn.addEventListener("click", function () {
    muted = !muted;
    setMaster();
    if (muted) stop(); else play();
    refreshIcon(); persist();
  });
  slider.addEventListener("input", function () {
    volume = Math.min(100, Math.max(0, Number(slider.value) || 0)) / 100;
    if (volume > 0 && muted) muted = false;
    setMaster();
    if (volume === 0) stop(); else play();
    refreshIcon(); persist();
  });
  pick.addEventListener("click", function () { openList(list.hidden); });
  list.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-song]");
    if (!b) return;
    choice = b.dataset.song;
    // alegerea pornește melodia de la început (și muzica, dacă era oprită)
    if (muted || volume === 0) {
      muted = false;
      if (volume === 0) { volume = DEFAULT_VOLUME; slider.value = String(Math.round(volume * 100)); }
      setMaster();
    }
    if (choice !== ALL) cur = songById(choice);
    pos = 0; gapUntil = 0;
    if (playing && ctx) startSong(cur, 0); else play();
    refreshIcon(); paintNow(); paintList(); persist();
    openList(false);
    pick.focus();
  });
  list.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    var bs = [].slice.call(list.querySelectorAll("button[data-song]")), i = bs.indexOf(document.activeElement);
    bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length].focus();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !list.hidden) { openList(false); pick.focus(); } });
  document.addEventListener("pointerdown", function (e) { if (!list.hidden && !widget.contains(e.target)) openList(false); }, true);

  widget.appendChild(list);
  widget.appendChild(btn);
  widget.appendChild(pick);
  widget.appendChild(slider);

  function mount() { document.body.appendChild(widget); }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
