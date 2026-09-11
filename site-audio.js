// Muzică de fundal pentru paginile publice ale site-ului — widget mic, fix
// în colțul din dreapta jos, cu control de volum vizibil pentru orice
// vizitator. Preferința de volum/mut și poziția din piesă se țin în
// localStorage, ca navigarea între pagini (site-ul nu e un SPA, fiecare
// pagină își reîncarcă propriul <audio>) să pară cât mai continuă, nu ca și
// cum piesa ar lua-o mereu de la capăt.
//
// Autoplay: browserele blochează sunetul cu autoplay până la prima
// interacțiune a vizitatorului cu pagina — încercăm play() imediat, iar dacă
// e respins, pornim la primul click/tap/tastă oriunde pe pagină.
(function () {
  var STORAGE_KEY = "mrp_audio_state";
  var DEFAULT_VOLUME = 0.4;
  var SRC = "assets/audio/theme.mp3";

  function loadState() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!raw || typeof raw !== "object") return null;
      return raw;
    } catch {
      return null;
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage indisponibil (mod privat etc.) — widget-ul tot
      // funcționează în cadrul aceleiași pagini, doar nu ține minte între ele.
    }
  }

  var saved = loadState() || {};
  var volume = typeof saved.volume === "number" ? Math.min(1, Math.max(0, saved.volume)) : DEFAULT_VOLUME;
  var muted = !!saved.muted;
  var startTime = typeof saved.time === "number" && saved.time >= 0 ? saved.time : 0;

  var audio = new Audio(SRC);
  audio.loop = true;
  audio.volume = volume;
  audio.muted = muted;
  audio.preload = "auto";

  // currentTime nu poate fi setat până metadata nu s-a încărcat pe unele
  // browsere (Safari mai ales) — ascultăm loadedmetadata ca să fim siguri.
  function applyStartTime() {
    if (startTime > 0 && isFinite(audio.duration) && startTime < audio.duration) {
      try { audio.currentTime = startTime; } catch { /* ignorăm — pornim de la 0 */ }
    }
  }
  if (audio.readyState >= 1) applyStartTime();
  else audio.addEventListener("loadedmetadata", applyStartTime, { once: true });

  function persistNow() {
    saveState({ volume: audio.volume, muted: audio.muted, time: audio.currentTime || 0 });
  }

  var lastSavedSecond = -1;
  audio.addEventListener("timeupdate", function () {
    var sec = Math.floor(audio.currentTime);
    if (sec !== lastSavedSecond) {
      lastSavedSecond = sec;
      persistNow();
    }
  });
  window.addEventListener("pagehide", persistNow);

  function tryAutoplay() {
    var p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        var start = function () {
          audio.play().catch(function () { /* tot blocat — renunțăm silențios */ });
        };
        document.addEventListener("pointerdown", start, { once: true });
        document.addEventListener("keydown", start, { once: true });
      });
    }
  }
  tryAutoplay();

  // ---------------------------------------------------------------------
  // Widget-ul vizual — buton mut/nemut + slider de volum, colț dreapta-jos.
  // ---------------------------------------------------------------------
  var style = document.createElement("style");
  style.textContent =
    ".mrp-audio-widget{position:fixed;right:18px;bottom:18px;z-index:500;display:flex;align-items:center;gap:10px;" +
    "padding:9px 14px 9px 10px;background:rgba(11,12,13,.86);border:1px solid rgba(255,255,255,.08);border-radius:100px;" +
    "backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(0,0,0,.35);font-family:Inter,ui-sans-serif,system-ui,sans-serif}" +
    ".mrp-audio-btn{width:34px;height:34px;flex-shrink:0;border:0;border-radius:50%;display:grid;place-items:center;" +
    "background:linear-gradient(145deg,#ff8a1f,#ff6d16);color:#0b0b0b;font-size:15px;cursor:pointer;transition:transform .15s ease}" +
    ".mrp-audio-btn:hover{transform:scale(1.07)}" +
    ".mrp-audio-vol{width:74px;accent-color:#ff8a1f;cursor:pointer}" +
    "@media (max-width:520px){.mrp-audio-widget{right:12px;bottom:12px;padding:8px 12px 8px 8px}.mrp-audio-vol{width:56px}}";
  document.head.appendChild(style);

  var widget = document.createElement("div");
  widget.className = "mrp-audio-widget";
  widget.setAttribute("role", "group");
  widget.setAttribute("aria-label", "Control muzică fundal");

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mrp-audio-btn";

  var slider = document.createElement("input");
  slider.type = "range";
  slider.className = "mrp-audio-vol";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  slider.value = String(Math.round(volume * 100));
  slider.setAttribute("aria-label", "Volum muzică fundal");

  function refreshIcon() {
    btn.textContent = audio.muted || audio.volume === 0 ? "🔇" : "🔊";
    btn.setAttribute("aria-label", audio.muted ? "Pornește sunetul" : "Oprește sunetul");
    btn.setAttribute("aria-pressed", String(!audio.muted));
  }
  refreshIcon();

  btn.addEventListener("click", function () {
    audio.muted = !audio.muted;
    if (!audio.muted) tryAutoplay();
    refreshIcon();
    persistNow();
  });

  slider.addEventListener("input", function () {
    var v = Math.min(100, Math.max(0, Number(slider.value) || 0)) / 100;
    audio.volume = v;
    if (v > 0 && audio.muted) audio.muted = false;
    if (v > 0) tryAutoplay();
    refreshIcon();
    persistNow();
  });

  widget.appendChild(btn);
  widget.appendChild(slider);

  function mount() {
    document.body.appendChild(widget);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
