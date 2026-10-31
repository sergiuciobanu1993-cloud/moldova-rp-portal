// (31.10.2026) Imagini gata de pus pe Discord: rezultatele unui sondaj
// (Admin → Sondaje) și câștigătorii unei săptămâni (Admin → Clasament).
// Se desenează în browser (canvas 1200×675) și se descarcă sau se copiază;
// postarea o face omul, nu site-ul.
window.MrpImage = (function () {
  'use strict';
  var W = 1200, H = 675, F = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';
  var ORANGE = '#ff8a1f', TEXT = '#f7f7f7', MUTED = '#9ca1a8', PANEL = 'rgba(255,255,255,.05)', LINE = 'rgba(255,255,255,.10)';
  var logo = null;
  function loadLogo() {
    if (logo) return Promise.resolve(logo);
    return new Promise(function (ok) {
      var im = new Image(); im.onload = function () { logo = im; ok(im); }; im.onerror = function () { ok(null); }; im.src = '/assets/logo.png';
    });
  }
  function fmt(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  // rupe textul pe rânduri care încap în lățime (cel mult `max` rânduri, cu „…” la final)
  function lines(c, text, width, max) {
    var words = String(text || '').split(/\s+/), out = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > width && cur) { out.push(cur); cur = w; } else cur = t; });
    if (cur) out.push(cur);
    if (out.length > max) { out = out.slice(0, max); var last = out[max - 1]; while (c.measureText(last + '…').width > width && last.length) last = last.slice(0, -1); out[max - 1] = last + '…'; }
    return out;
  }
  function fit(c, text, width) { var t = String(text || ''); if (c.measureText(t).width <= width) return t; while (t.length && c.measureText(t + '…').width > width) t = t.slice(0, -1); return t + '…'; }
  function base(c, eyebrow) {
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0b0d10'); g.addColorStop(1, '#07080a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    var r = c.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 620); r.addColorStop(0, 'rgba(255,138,31,.22)'); r.addColorStop(1, 'rgba(255,138,31,0)'); c.fillStyle = r; c.fillRect(0, 0, W, H);
    c.fillStyle = ORANGE; c.fillRect(0, 0, 8, H);
    if (logo) c.drawImage(logo, 56, 40, 48, 48);
    c.textBaseline = 'middle'; c.font = '900 22px ' + F; c.fillStyle = TEXT; c.fillText('MOLDOVA', 116, 65);
    var mw = c.measureText('MOLDOVA').width; c.fillStyle = ORANGE; c.fillText('RP', 116 + mw, 65);
    c.font = '800 16px ' + F; c.fillStyle = MUTED; c.textAlign = 'right'; c.fillText('moldovarp.md', W - 56, 65); c.textAlign = 'left';
    c.font = '900 15px ' + F; c.fillStyle = ORANGE; c.fillText(eyebrow.split('').join(String.fromCharCode(8202)), 56, 128);
  }
  function poll(p) {
    return loadLogo().then(function () {
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
      base(c, p.open ? 'SONDAJ · REZULTATE PÂNĂ ACUM' : 'SONDAJ · REZULTATE FINALE');
      c.font = '900 40px ' + F; c.fillStyle = TEXT; c.textBaseline = 'alphabetic';
      var q = lines(c, p.question, W - 112, 2); q.forEach(function (l, i) { c.fillText(l, 56, 180 + i * 48); });
      var top = 180 + q.length * 48 + 6;
      var rows = p.options.map(function (o, i) { return { label: o, n: p.counts ? p.counts[i] || 0 : 0 }; }).sort(function (a, b) { return b.n - a.n; });
      var maxN = rows.length ? rows[0].n : 0;
      var avail = H - 70 - top, gap = 10, rh = Math.min(56, Math.floor((avail - gap * (rows.length - 1)) / rows.length));
      rows.forEach(function (r, i) {
        var y = top + i * (rh + gap), x = 56, w = W - 112, pct = p.total ? Math.round(r.n / p.total * 100) : 0, win = r.n === maxN && maxN > 0;
        rr(c, x, y, w, rh, 12); c.fillStyle = PANEL; c.fill(); c.strokeStyle = win ? 'rgba(255,138,31,.7)' : LINE; c.lineWidth = win ? 2 : 1; c.stroke();
        if (pct > 0) { c.save(); rr(c, x, y, w, rh, 12); c.clip(); c.fillStyle = win ? 'rgba(255,138,31,.32)' : 'rgba(255,255,255,.09)'; c.fillRect(x, y, w * pct / 100, rh); c.restore(); }
        c.textBaseline = 'middle'; c.font = '800 ' + Math.min(22, rh * 0.42) + 'px ' + F; c.fillStyle = TEXT;
        var right = pct + '%  ·  ' + fmt(r.n) + (r.n === 1 ? ' vot' : ' voturi');
        c.font = '900 ' + Math.min(22, rh * 0.42) + 'px ' + F; var rw = c.measureText(right).width;
        c.font = '800 ' + Math.min(22, rh * 0.42) + 'px ' + F; c.fillText(fit(c, (win ? '🏆  ' : '') + r.label, w - rw - 60), x + 20, y + rh / 2);
        c.font = '900 ' + Math.min(22, rh * 0.42) + 'px ' + F; c.fillStyle = win ? ORANGE : MUTED; c.textAlign = 'right'; c.fillText(right, x + w - 20, y + rh / 2); c.textAlign = 'left';
      });
      c.textBaseline = 'alphabetic'; c.font = '700 17px ' + F; c.fillStyle = MUTED;
      var when = p.open ? (p.endsAt ? 'se închide pe ' + new Date(p.endsAt).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'încă se poate vota pe site') : 'sondaj încheiat';
      c.fillText(fmt(p.total) + (p.total === 1 ? ' vot' : ' de voturi') + '  ·  ' + when, 56, H - 34);
      return cv;
    });
  }
  function weekly(weekIso, winners) {
    return loadLogo().then(function () {
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
      var d = function (iso, add) { var t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + (add || 0)); return t.toLocaleDateString('ro-RO', { timeZone: 'UTC', day: 'numeric', month: 'long' }); };
      base(c, 'CLASAMENTUL SĂPTĂMÂNII');
      c.textBaseline = 'alphabetic'; c.font = '900 46px ' + F; c.fillStyle = TEXT; c.fillText('Topul săptămânii', 56, 186);
      c.font = '700 22px ' + F; c.fillStyle = MUTED; c.fillText(d(weekIso) + ' – ' + d(weekIso, 6), 56, 222);
      var hours = function (m) { return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; };
      var cats = [
        { id: 'jucatori', title: 'Cei mai activi jucători', val: function (w) { return hours(w.value); } },
        { id: 'factiuni', title: 'Facțiunea săptămânii', val: function (w) { return hours(w.value); } },
        { id: 'questuri', title: 'Questurile de Crăciun', val: function (w) { return fmt(w.value) + ' puncte'; } },
      ].map(function (k) { k.list = winners.filter(function (w) { return w.category === k.id; }).sort(function (a, b) { return a.rank - b.rank; }); return k; })
       .filter(function (k) { return k.list.length; });
      var MED = ['🥇', '🥈', '🥉'];
      var colW = (W - 112 - (cats.length - 1) * 16) / Math.max(1, cats.length), y0 = 262, ch = H - 70 - y0;
      cats.forEach(function (k, i) {
        var x = 56 + i * (colW + 16);
        rr(c, x, y0, colW, ch, 16); c.fillStyle = PANEL; c.fill(); c.strokeStyle = LINE; c.lineWidth = 1; c.stroke();
        c.font = '900 14px ' + F; c.fillStyle = ORANGE; c.fillText(k.title.toUpperCase(), x + 22, y0 + 38);
        k.list.slice(0, 3).forEach(function (w, j) {
          var yy = y0 + 66 + j * 82;
          c.font = '34px ' + F; c.fillText(k.id === 'factiuni' ? '🛡' : (MED[w.rank - 1] || '🏅'), x + 20, yy + 38);
          c.font = '900 24px ' + F; c.fillStyle = TEXT; c.fillText(fit(c, w.name || '—', colW - 100), x + 74, yy + 26);
          c.font = '700 17px ' + F; c.fillStyle = MUTED; c.fillText(k.val(w), x + 74, yy + 52);
        });
      });
      c.font = '700 17px ' + F; c.fillStyle = MUTED; c.fillText('Câștigătorii primesc insigna pe profil și premiul în joc de la staff  ·  moldovarp.md/clasament.html', 56, H - 34);
      return cv;
    });
  }
  // fereastra cu imaginea: descarcă / copiază
  function show(cv, filename) {
    var old = document.getElementById('mrp-img-modal'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'mrp-img-modal';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Imagine pentru Discord');
    m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:grid;place-items:center;padding:20px';
    var url = cv.toDataURL('image/png');
    m.innerHTML = '<div style="width:min(900px,100%);background:#121416;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.6)">' +
      '<img src="' + url + '" alt="Previzualizare" style="display:block;width:100%;height:auto;border-radius:10px">' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px"><a class="btn-primary" download="' + filename + '" href="' + url + '" style="text-decoration:none">Descarcă imaginea</a>' +
      '<button type="button" class="btn-ghost" data-copy>Copiază imaginea</button><span data-msg style="color:#8f949a;font-size:12px"></span>' +
      '<button type="button" class="btn-ghost" data-close style="margin-left:auto">Închide</button></div></div>';
    document.body.appendChild(m);
    var close = function () { m.remove(); document.removeEventListener('keydown', esc); };
    var esc = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-close]')) close(); });
    m.querySelector('[data-copy]').addEventListener('click', function () {
      var msg = m.querySelector('[data-msg]');
      if (!window.ClipboardItem || !navigator.clipboard) { msg.textContent = 'Browserul nu poate copia imagini; folosește „Descarcă”.'; return; }
      cv.toBlob(function (b) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () { msg.textContent = 'Copiată ✓ — o lipești cu Ctrl+V pe Discord.'; }, function () { msg.textContent = 'Nu s-a putut copia; folosește „Descarcă”.'; });
      }, 'image/png');
    });
    m.querySelector('[data-close]').focus();
  }
  return { poll: poll, weekly: weekly, show: show };
})();
