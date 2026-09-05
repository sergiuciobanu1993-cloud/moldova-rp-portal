// Modal de profil jucător, partajat între paginile de admin care au nevoie
// să deschidă profilul complet al unui jucător la un click pe numele lui
// (Jucători, Kill Logs, și oricare altă pagină viitoare). Extras din
// admin-jucatori.html (care avea implementarea originală, inline) ca să nu
// se dubleze codul de fiecare dată — o singură sursă de adevăr pentru cum
// arată și se comportă modalul.
//
// Cerință: pagina trebuie să fi încărcat deja auth-client.js (pentru
// apiFetch) înainte de acest script. Totul e închis într-un IIFE, ca să nu
// intre în coliziune cu `const escapeHtml` / `function fmtDate` etc.
// declarate separat, la nivel de pagină, în fiecare admin-*.html (scripturile
// clasice dintr-un singur document partajează același scop global pentru
// let/const, deci o redeclarare ar arunca eroare de sintaxă fără acest IIFE).
window.openPlayerProfile = (function () {
  const escapeHtml = s => (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function fmtMoney(n) { return '$' + Number(n || 0).toLocaleString('ro-RO'); }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtDelta(n) { return (n > 0 ? '+' : '') + Number(n).toLocaleString('ro-RO') + '$'; }

  function vehiclesHtml(vehicles) {
    if (!vehicles || !vehicles.length) return '<span class="muted">—</span>';
    return vehicles.map(v => {
      const label = v.name ? `${v.name} (${v.plate})` : (v.plate || '?');
      return `<span class="pill off" style="margin:2px">${escapeHtml(label)}</span>`;
    }).join(' ');
  }

  function killCauseLabel(k) {
    if (k.adminKill) return `ucis de <strong>admin ${escapeHtml(k.adminKill.staff || 'necunoscut')}</strong>`;
    if (k.killer) return `ucis de <strong>${escapeHtml(k.killer)}</strong>${k.cause ? ` <span class="muted">(${escapeHtml(k.cause)})</span>` : ''}`;
    return '<span class="muted">necunoscut — detectat automat</span>';
  }

  // Fiecare categorie de log are un format diferit de "details" (vine direct
  // din moldovarp-api) — arătăm doar un rezumat scurt (profilul nu e locul
  // pentru tot detaliul), dar acoperim categoriile frecvente, altfel rămâne
  // gol ("—") fără niciun motiv vizibil pentru staff.
  function activityLine(log) {
    const cat = escapeHtml(log.category || '?');
    const who = escapeHtml(log.player || '');
    const d = log.details || {};
    let extra = '';
    if (log.category === 'death') {
      extra = killCauseLabel({ killer: d.killer, adminKill: d.adminKill, cause: d.cause });
    } else if (log.category === 'admin') {
      extra = `<span class="muted">${escapeHtml(d.action || '')}${d.target ? ' → ' + escapeHtml(d.target) : ''}</span>`;
    } else if (log.category === 'money') {
      const parts = [];
      if (typeof d.cashDelta === 'number' && d.cashDelta !== 0) parts.push(`cash ${fmtDelta(d.cashDelta)}`);
      if (typeof d.bankDelta === 'number' && d.bankDelta !== 0) parts.push(`bancă ${fmtDelta(d.bankDelta)}`);
      extra = parts.join(', ') || 'schimbare bani';
      if (d.possibleSource) extra += ` <span class="muted">· posibil: ${escapeHtml(d.possibleSource)}</span>`;
    } else if (log.category === 'connect' || log.category === 'disconnect') {
      extra = log.category === 'connect' ? 's-a conectat' : `s-a deconectat${d.reason ? ` <span class="muted">(${escapeHtml(String(d.reason))})</span>` : ''}`;
    } else if (log.category === 'chat') {
      extra = d.message ? escapeHtml(String(d.message)) : '<span class="muted">—</span>';
    } else if (log.category === 'command') {
      extra = d.command ? `<code>${escapeHtml('/' + String(d.command).replace(/^\//, ''))}</code>` : '<span class="muted">—</span>';
    } else if (log.category === 'vehicle_acquired') {
      extra = `<strong>${escapeHtml(d.vehicle || 'un vehicul')}</strong> <span class="muted">(${escapeHtml(d.plate || '?')})</span>`;
    } else if (d.item) {
      extra = `<strong>${escapeHtml((d.count ? d.count + 'x ' : '') + d.item)}</strong>${d.to ? ` → ${escapeHtml(d.to)}` : ''}${typeof d.totalPrice === 'number' ? ` <span class="muted">(${fmtDelta(d.totalPrice).replace('+', '')})</span>` : ''}`;
    } else if (d.recipe) {
      extra = `a craftat <strong>${escapeHtml(d.recipe)}</strong>`;
    }
    return `<div class="msg"><b>${cat}${who ? ' · ' + who : ''}</b><span>${extra || '<span class="muted">—</span>'}</span><small>${fmtDate(log.at)}</small></div>`;
  }

  // Statusul de moderare din Luxu Admin (bans/warnings/jail — vezi
  // /api/admin/live/moderation pe backend) e opțional în răspuns: profilul
  // funcționează normal și fără el (server de joc offline, sau resursa
  // veche fără suport încă) — arătăm secțiunea doar dacă a venit ceva.
  function moderationHtml(mod) {
    if (!mod) return '';
    const rows = [];
    if (mod.jail && mod.jail.active) {
      rows.push(`<p style="margin:0 0 10px"><span class="pill warn">LA ÎNCHISOARE ACUM</span> ${escapeHtml(mod.jail.reason || '')} <span class="muted">— eliberare ${fmtDate(mod.jail.expires_at)}</span></p>`);
    }
    const warnCount = (mod.warnings || []).length;
    if (warnCount) {
      rows.push(`<p style="margin:0 0 10px"><span class="pill warn">${warnCount} AVERTISMENT${warnCount > 1 ? 'E' : ''}</span></p>`);
    }
    // Ban-urile pot avea dată de expirare (sau nu — permanente); avertismentele
    // n-au niciodată; închisoarea (dacă mai există istoric, dincolo de cea
    // activă arătată deja mai sus) are mereu. Arătăm coloana EXPIRĂ pentru
    // toate trei, cu "—"/"Permanent" cand nu se aplică.
    function expiry(it) {
      if (it.kind === 'Avertisment') return '<span class="muted">—</span>';
      if (!it.expires_at) return '<span class="muted">Permanent</span>';
      const expired = new Date(it.expires_at) < new Date();
      return `${fmtDate(it.expires_at)}${expired ? ' <span class="muted">(expirat)</span>' : ''}`;
    }
    const items = [
      ...(mod.bans || []).map(b => ({ ...b, kind: 'Ban' })),
      ...(mod.warnings || []).map(w => ({ ...w, kind: 'Avertisment' })),
      ...(mod.jail && !mod.jail.active ? [{ ...mod.jail, kind: 'Închisoare' }] : []),
    ].sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
    const table = items.length ? `<table><thead><tr><th>TIP</th><th>MOTIV</th><th>ADMIN</th><th>DATA</th><th>EXPIRĂ</th></tr></thead><tbody>${
      items.map(it => `<tr><td><span class="pill ${it.kind === 'Avertisment' ? 'off' : 'warn'}">${escapeHtml(it.kind.toUpperCase())}</span></td><td>${escapeHtml(it.reason || '—')}</td><td>${escapeHtml(it.admin || '—')}</td><td>${fmtDate(it.date || it.created_at)}</td><td>${expiry(it)}</td></tr>`).join('')
    }</tbody></table>` : `<p class="muted" style="margin:0">Niciun ban/avertisment în Luxu Admin.</p>`;
    return `<h2 style="font-size:14px;margin:22px 0 10px">🛡 Moderare (Luxu Admin)</h2>${rows.join('')}${table}`;
  }

  function renderProfile(p) {
    const body = document.getElementById('profile-body');
    document.getElementById('profile-title').textContent = `Profil — ${p.name}`;

    const liveSrc = p.live || p.lastKnown;
    const live = liveSrc ? `
      <div class="metrics" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px">
        <article><small>STATUS</small><strong style="font-size:16px;color:${p.live ? 'var(--green)' : 'var(--muted)'}">${p.live ? 'ONLINE' : 'OFFLINE'}</strong><em>${escapeHtml(liveSrc.jobLabel || liveSrc.job || '')}</em></article>
        <article><small>CASH</small><strong>${fmtMoney(liveSrc.cash)}</strong><em>&nbsp;</em></article>
        <article><small>BANCĂ</small><strong>${fmtMoney(liveSrc.bank)}</strong><em>&nbsp;</em></article>
        <article><small>BANI MURDARI</small><strong>${liveSrc.blackMoney == null ? '—' : fmtMoney(liveSrc.blackMoney)}</strong><em>${p.live && liveSrc.group && liveSrc.group !== 'user' ? escapeHtml(liveSrc.group) : '&nbsp;'}</em></article>
      </div>
      <p style="margin:0 0 6px"><b style="font-size:11px;color:var(--muted);letter-spacing:.08em">VEHICULE</b><br>${vehiclesHtml(liveSrc.vehicles)}</p>
      ${!p.live ? `<p class="muted" style="margin:0 0 18px;font-size:11px">Date din ultima dată văzut online: ${fmtDate(p.lastKnown.syncedAt)} — nu sunt live.</p>` : `<p style="margin:0 0 18px"></p>`}
    ` : `<p class="muted" style="margin:0 0 18px">Jucătorul nu e online momentan și nu avem încă nicio poză salvată din ultima dată — se arată doar istoricul de mai jos.</p>`;

    const account = p.account ? `
      <p style="margin:0 0 18px">
        <b style="font-size:11px;color:var(--muted);letter-spacing:.08em">CONT SITE</b><br>
        ${escapeHtml(p.account.username)} ${p.account.game_id ? `<span class="muted">(ID #${escapeHtml(p.account.game_id)})</span>` : ''}
        ${p.account.faction_name ? ` · ${escapeHtml(p.account.faction_name)}${p.account.rank_name ? ' — ' + escapeHtml(p.account.rank_name) : ''}` : ''}
        ${p.account.playtime_minutes != null ? ` · ${Math.round(p.account.playtime_minutes / 60)}h jucate` : ''}
      </p>` : `<p class="muted" style="margin:0 0 18px">Jucătorul nu are (încă) cont pe site.</p>`;

    const punishments = p.punishments.length ? `<table><thead><tr><th>TIP</th><th>MOTIV</th><th>DE CINE</th><th>CÂND</th></tr></thead><tbody>${
      p.punishments.map(pu => `<tr><td><span class="pill warn">${escapeHtml(pu.type)}</span></td><td>${escapeHtml(pu.reason)}</td><td>${escapeHtml(pu.issued_by || '—')}</td><td>${fmtDate(pu.created_at)}</td></tr>`).join('')
    }</tbody></table>` : `<p class="muted" style="margin:0">Nicio sancțiune.</p>`;

    const tickets = p.tickets.length ? `<table><thead><tr><th>SUBIECT</th><th>STATUS</th><th>DESCHIS</th></tr></thead><tbody>${
      p.tickets.map(t => `<tr><td>${escapeHtml(t.subject)}</td><td><span class="pill ${t.status === 'open' ? 'warn' : 'off'}">${escapeHtml(t.status)}</span></td><td>${fmtDate(t.created_at)}</td></tr>`).join('')
    }</tbody></table>` : `<p class="muted" style="margin:0">Niciun tichet.</p>`;

    const activity = p.recentActivity.length ? `<div class="thread">${p.recentActivity.map(activityLine).join('')}</div>` : `<p class="muted" style="margin:0">Nicio activitate recentă.</p>`;

    const killsVictim = p.killsAsVictim.length ? `<div class="thread">${p.killsAsVictim.map(k => `<div class="msg"><span>${killCauseLabel(k)}</span><small>${fmtDate(k.at)}</small></div>`).join('')}</div>` : `<p class="muted" style="margin:0">Nicio moarte recentă.</p>`;
    const killsKiller = p.killsAsKiller.length ? `<div class="thread">${p.killsAsKiller.map(k => `<div class="msg"><span>a ucis pe <strong>${escapeHtml(k.victim)}</strong>${k.cause ? ` <span class="muted">(${escapeHtml(k.cause)})</span>` : ''}</span><small>${fmtDate(k.at)}</small></div>`).join('')}</div>` : `<p class="muted" style="margin:0">Niciun kill recent (din ultimele ~300 de morți de pe server).</p>`;

    body.innerHTML = `
      ${live}
      ${account}
      <h2 style="font-size:14px;margin:22px 0 10px">⚠ Sancțiuni</h2>${punishments}
      ${moderationHtml(p.moderation)}
      <h2 style="font-size:14px;margin:22px 0 10px">🎫 Tichete</h2>${tickets}
      <h2 style="font-size:14px;margin:22px 0 10px">🗂 Activitate recentă</h2>${activity}
      <h2 style="font-size:14px;margin:22px 0 10px">🔪 Kill-uri — ca victimă</h2>${killsVictim}
      <h2 style="font-size:14px;margin:22px 0 10px">🔪 Kill-uri — ca ucigaș</h2>${killsKiller}
    `;
  }

  function ensureModal() {
    if (document.getElementById('profile-overlay')) return;
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'profile-overlay';
    div.hidden = true;
    div.innerHTML = `
      <section class="formbox modal-box" id="profile-box">
        <div class="modal-head">
          <h2 id="profile-title">Profil jucător</h2>
          <button type="button" class="modal-close" id="profile-close-btn" aria-label="Închide">✕</button>
        </div>
        <div id="profile-body"><p class="muted">Se încarcă…</p></div>
      </section>`;
    document.body.appendChild(div);

    function closeProfile() {
      document.getElementById('profile-overlay').hidden = true;
      document.body.classList.remove('modal-open');
    }
    div.addEventListener('click', (e) => { if (e.target.id === 'profile-overlay') closeProfile(); });
    document.getElementById('profile-close-btn').addEventListener('click', closeProfile);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('profile-overlay').hidden) closeProfile();
    });
  }

  return async function openPlayerProfile(name) {
    ensureModal();
    document.getElementById('profile-overlay').hidden = false;
    document.body.classList.add('modal-open');
    document.getElementById('profile-title').textContent = `Profil — ${name}`;
    document.getElementById('profile-body').innerHTML = '<p class="muted">Se încarcă…</p>';
    try {
      const res = await apiFetch(`/api/admin/player-profile?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error();
      renderProfile(await res.json());
    } catch {
      document.getElementById('profile-body').innerHTML = '<p class="muted">Nu am putut încărca profilul.</p>';
    }
  };
})();
