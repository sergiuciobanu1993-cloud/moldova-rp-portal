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
  // (08.10.2026) Frazele, numele RP + ID static și etichetele de „suspect" din
  // Loguri (log-format.js) — încărcate o singură dată, dacă pagina nu le are deja.
  if (!window.LogFormat && !document.querySelector('script[data-log-format]')) {
    const lf = document.createElement('script');
    lf.src = '/log-format.js?v=20261008a';
    lf.dataset.logFormat = '1';
    lf.onload = () => window.LogFormat && window.LogFormat.injectStyles();
    document.head.appendChild(lf);
  } else if (window.LogFormat) {
    window.LogFormat.injectStyles();
  }
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
  // multi = în listă sunt rânduri de la mai multe personaje ale jucătorului →
  // arătăm și numele personajului, ca să se știe de pe care a fost
  function activityLine(log, multi) {
    const LF = window.LogFormat;
    if (LF) {
      const flags = log.flags || LF.flagsFor(log);
      const label = LF.CATEGORY_LABEL[log.category] || log.category || '?';
      const who = multi && (log.who?.rpName || log.rpName)
        ? ` <span class="pp-char-tag">${escapeHtml(log.who?.rpName || log.rpName)}${log.who?.staticId ? ' #' + escapeHtml(log.who.staticId) : ''}</span>` : '';
      return `<div class="msg"><b>${escapeHtml(label)}${who}</b><span>${LF.formatDetails(log)}${flags.length ? '<br>' + LF.flagsHtml(flags) : ''}</span><small>${fmtDate(log.at)}</small></div>`;
    }
    const cat = escapeHtml(log.category || '?');
    const who = escapeHtml(log.player || '') + (multi && log.rpName ? ` <span class="pp-char-tag">${escapeHtml(log.rpName)}</span>` : '');
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
      // confirmedSource = sursă sigură (ex: eveniment ESX de bancă), arătată
      // fără "posibil" — vezi server.lua/admin-loguri.html.
      if (d.confirmedSource) extra += ` · <strong>${escapeHtml(d.confirmedSource)}</strong>`;
      else if (d.possibleSource) extra += ` <span class="muted">· posibil: ${escapeHtml(d.possibleSource)}</span>`;
    } else if (log.category === 'money_vehicle_deposit' || log.category === 'money_vehicle_withdraw') {
      const verb = log.category === 'money_vehicle_deposit' ? 'a pus' : 'a scos';
      const prep = log.category === 'money_vehicle_deposit' ? 'în' : 'din';
      const sum = (typeof d.count === 'number') ? fmtDelta(d.count).replace('+', '') : 'bani';
      extra = `${verb} <strong>${sum}</strong> ${prep} torpedou/portbagaj`;
      if (d.vehicle) extra += ` <span class="muted">(${escapeHtml(String(d.vehicle))})</span>`;
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

  // Case + business-uri + gașcă (op-crime) — la fel ca la moderare, secțiunea
  // apare doar dacă backend-ul chiar a reușit să contacteze jocul (altfel
  // houses/businesses sunt liste goale și gang e null, indistinct de "nu are
  // nimic" — dar profilul funcționează normal oricum, nu blocăm restul).
  function propertyHtml(p) {
    function houseCoordText(coord) {
      if (!coord) return '<span class="muted">—</span>';
      return `<code>${coord.x.toFixed(1)}, ${coord.y.toFixed(1)}, ${coord.z.toFixed(1)}</code>`;
    }
    const houses = (p.houses || []).map(h => `
      <tr>
        <td><strong>${escapeHtml(h.label || 'Casă')}</strong> <span class="muted" style="font-size:11px">#${escapeHtml(h.houseId)}</span></td>
        <td>${houseCoordText(h.coord)}</td>
        <td>${h.price != null ? fmtMoney(h.price) : '<span class="muted">—</span>'}</td>
        <td>${fmtDate(h.updated_at || h.created_at)}</td>
      </tr>`).join('');
    const housesTable = houses ? `<table><thead><tr><th>CASĂ</th><th>LOCAȚIE</th><th>PREȚ</th><th>DE LA</th></tr></thead><tbody>${houses}</tbody></table>`
      : `<p class="muted" style="margin:0 0 14px">Nicio casă deținută.</p>`;

    const businesses = (p.businesses || []).map(b => `
      <tr>
        <td>${escapeHtml(b.jobLabel || b.job || '—')}</td>
        <td>${b.creator ? escapeHtml(b.creator) : '<span class="muted">necunoscut</span>'}</td>
      </tr>`).join('');
    // "creator" nu e garantat un nume de jucător real (vezi comentariul din
    // server.lua/getBusinesses) — de-aia nu-l facem buton clickabil aici, ca
    // să nu deschidem din greșeală profilul altcuiva.
    const businessesTable = businesses ? `<table><thead><tr><th>BUSINESS</th><th>CREAT DE</th></tr></thead><tbody>${businesses}</tbody></table>`
      : `<p class="muted" style="margin:0 0 14px">Niciun business găsit (după nume — vezi nota din pagina Jucători dacă lipsește unul știut).</p>`;

    // Benzinării/magazine (v1.27.0) — sisteme SEPARATE de business-urile de mai
    // sus, cu identificator real de proprietar, deci match exact (nu ghicit
    // după nume) — dar disponibil DOAR cât jucătorul e online (identificatorul
    // exact vine din /players, nu din nimic ce putem căuta offline).
    function coordText(coord) {
      if (!coord) return '<span class="muted">—</span>';
      return `<code>${coord.x.toFixed(1)}, ${coord.y.toFixed(1)}, ${coord.z.toFixed(1)}</code>`;
    }
    function stationsHtml(list, emptyText) {
      if (!list || !list.length) return `<p class="muted" style="margin:0 0 14px">${emptyText}</p>`;
      const rows = list.map(s => `
        <tr>
          <td>${s.name ? escapeHtml(s.name) : `<span class="muted">${escapeHtml(s.stationId || '—')}</span>`}</td>
          <td>${coordText(s.coord)}</td>
          <td><span class="pill ${s.role === 'proprietar' ? 'warn' : 'off'}">${s.role === 'proprietar' ? 'PROPRIETAR' : 'ANGAJAT'}</span></td>
        </tr>`).join('');
      return `<table><thead><tr><th>NUME</th><th>COORDONATE</th><th>ROL</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    const gasStationsHtml = stationsHtml(p.gasStations, 'Nicio benzinărie (doar cât jucătorul e online — vezi pagina Jucători pentru lista completă).');
    const storesHtml = stationsHtml(p.stores, 'Niciun magazin (doar cât jucătorul e online — vezi pagina Jucători pentru lista completă).');

    // (10.10.2026) Banda (VX Banda) și mafia (op-crime) — pot fi ambele
    const orgLine = (o, none) => o ? `
      <p style="margin:0 0 14px">
        ${o.color ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${escapeHtml(o.color)};margin-right:6px;vertical-align:middle"></span>` : ''}
        <strong>${escapeHtml(o.org || '—')}</strong>
        <span class="pill ${o.isOwner ? 'warn' : 'off'}" style="margin-left:6px">${escapeHtml((o.rank || (o.isOwner ? 'Lider' : 'Membru')).toUpperCase())}</span>
      </p>` : `<p class="muted" style="margin:0 0 14px">${none}</p>`;
    const band = p.band !== undefined ? p.band : (p.gang && p.gang.kind === 'band' ? p.gang : null);
    const mafia = p.mafia !== undefined ? p.mafia : (p.gang && p.gang.kind !== 'band' ? p.gang : null);
    const gang = orgLine(band, 'Nu face parte din nicio bandă.');
    const mafiaHtml = orgLine(mafia, 'Nu face parte din nicio mafie (op-crime).');

    return `
      <h2 style="font-size:14px;margin:22px 0 10px">🏠 Case</h2>${housesTable}
      <h2 style="font-size:14px;margin:22px 0 10px">🏢 Business-uri</h2>${businessesTable}
      <h2 style="font-size:14px;margin:22px 0 10px">⛽ Benzinării</h2>${gasStationsHtml}
      <h2 style="font-size:14px;margin:22px 0 10px">🏪 Magazine</h2>${storesHtml}
      <h2 style="font-size:14px;margin:22px 0 10px">🏴 Bandă</h2>${gang}
      <h2 style="font-size:14px;margin:22px 0 10px">🎩 Mafie (op-crime)</h2>${mafiaHtml}
    `;
  }

  // Secțiuni lungi care se închid/deschid (29.09.2026) — închise implicit.
  function fold(title, summary, inner, count) {
    if (!count) return `<h2 style="font-size:14px;margin:22px 0 10px">${title}</h2>${inner}`;
    return `<details class="pp-fold"><summary><span><b>${title}</b> <span class="muted" style="font-weight:400">· ${summary}</span></span><span class="pp-fold-btn"></span></summary>${inner}</details>`;
  }

  // Cutiile deschise în VIP Shop (29.09.2026).
  const VIP_ICON = { cash: '💵', item: '🎒', vehicle: '🚗', coins: '🪙' };
  function vipHtml(list) {
    if (list == null) return '<p class="muted" style="margin:0">Serverul de joc nu răspunde — nu am putut citi cutiile.</p>';
    if (!list.length) return '<p class="muted" style="margin:0">Nu a deschis nicio cutie.</p>';
    const spent = list.reduce((s, e) => s + (Number(e.priceCoins) || 0), 0);
    const rows = list.map(e => `
      <tr>
        <td>${escapeHtml(e.caseName || '—')}</td>
        <td>${VIP_ICON[e.rewardType] || '🎁'} ${escapeHtml(e.rewardLabel || '—')}</td>
        <td>🪙 ${Number(e.priceCoins) || 0}</td>
        <td><span class="pill ${e.claimedAt ? 'on' : 'warn'}">${e.claimedAt ? 'RIDICAT' : 'ÎN AȘTEPTARE'}</span></td>
        <td>${fmtDate(e.createdAt)}</td>
      </tr>`).join('');
    return `<p style="margin:0 0 10px">${list.length} cutii deschise · 🪙 ${spent} coins cheltuiți${list.length >= 50 ? ' <span class="muted">(ultimele 50)</span>' : ''}</p>
      <table><thead><tr><th>CUTIE</th><th>RECOMPENSĂ</th><th>PREȚ</th><th>STATUS</th><th>CÂND</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderProfile(p) {
    const body = document.getElementById('profile-body');
    document.getElementById('profile-title').textContent = `Profil — ${p.name}`;

    const liveSrc = p.live || p.lastKnown;
    const live = liveSrc ? `
      <div class="metrics" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px">
        <article><small>STATUS</small><strong style="font-size:16px;color:${p.live ? 'var(--green)' : 'var(--muted)'}">${p.live ? 'ONLINE' : 'OFFLINE'}</strong><em>${escapeHtml(liveSrc.jobLabel || liveSrc.job || '')}</em></article>
        <article><small>CASH</small><strong>${liveSrc.cash == null ? '—' : fmtMoney(liveSrc.cash)}</strong><em>&nbsp;</em></article>
        <article><small>BANCĂ</small><strong>${liveSrc.bank == null ? '—' : fmtMoney(liveSrc.bank)}</strong><em>&nbsp;</em></article>
        <article><small>BANI MURDARI</small><strong>${liveSrc.blackMoney == null ? '—' : fmtMoney(liveSrc.blackMoney)}</strong><em>${p.live && liveSrc.group && liveSrc.group !== 'user' ? escapeHtml(liveSrc.group) : '&nbsp;'}</em></article>
      </div>
      ${(() => {
        // (29.09.2026) ID static, ID server, grad și ore jucate pe server.
        const src = p.live || p.lastKnown || {};
        const hours = p.live?.playtimeMinutes ?? p.account?.server_playtime_minutes ?? p.lastKnown?.playtimeMinutes;
        const rows = [
          src.serverName ? `Nume server: <strong>${escapeHtml(src.serverName)}</strong>` : '',
          p.live?.cfxName ? `Nume CFX: <strong>${escapeHtml(p.live.cfxName)}</strong>` : '',
          src.staticId ? `ID static: <strong>#${escapeHtml(src.staticId)}</strong>` : '',
          p.live?.serverId != null ? `ID server: <strong>${escapeHtml(String(p.live.serverId))}</strong>` : '',
          (src.jobLabel || src.job) ? `Job: <strong>${escapeHtml([src.jobLabel || src.job, src.gradeLabel].filter(Boolean).join(' · '))}</strong>` : '',
          hours != null ? `Ore jucate pe server: <strong>${Math.floor(hours / 60)}h ${hours % 60}m</strong>` : `Ore jucate pe server: <span class="muted">necunoscut (serverul nu trimite încă orele)</span>`,
          (p.live?.license || src.license) ? `Licență: <code>${escapeHtml(p.live?.license || src.license)}</code>` : '',
        ].filter(Boolean);
        return `<p style="margin:0 0 14px"><b style="font-size:11px;color:var(--muted);letter-spacing:.08em">IDENTITATE</b><br>${rows.join('<br>')}</p>`;
      })()}
      <p style="margin:0 0 6px"><b style="font-size:11px;color:var(--muted);letter-spacing:.08em">VEHICULE</b><br>${vehiclesHtml(liveSrc.vehicles)}</p>
      ${!p.live ? `<p class="muted" style="margin:0 0 18px;font-size:11px">${p.lastKnown.fromGame ? 'Date din baza de date a jocului' : 'Date salvate de site'} — ultima dată văzut online: ${fmtDate(p.lastKnown.syncedAt)}. Nu sunt live.</p>` : `<p style="margin:0 0 18px"></p>`}
    ` : (p.account && !p.account.game_linked
      ? `<p class="muted" style="margin:0 0 18px">Contul de site nu e legat de niciun personaj din joc, așa că nu avem de unde lua banii, jobul sau mașinile lui. Jucătorul trebuie să scrie <b>/leagacont</b> în joc și să pună codul în Dashboard, la „Contul din joc”.</p>`
      : `<p class="muted" style="margin:0 0 18px">Jucătorul nu e online acum și nu avem încă date salvate despre personajul legat — apar automat după ce intră pe server cu acel personaj.${p.lastSeenFromLogs ? ` Ultima activitate pe server (din loguri): <b>${fmtDate(p.lastSeenFromLogs)}</b>.` : ''}</p>
         ${(p.otherCharacters || []).length ? `<p style="margin:-8px 0 18px;font-size:12px"><span class="pill warn">ALT PERSONAJ</span> În loguri apare jucând cu alt personaj decât cel legat pe site (<code>${p.otherCharacters.map(escapeHtml).join('</code>, <code>')}</code>). Datele se salvează doar pentru personajul legat — dacă vrea altul, să refacă <b>/leagacont</b> de pe el.</p>` : ''}`);

    const account = p.account ? `
      <p style="margin:0 0 18px">
        <b style="font-size:11px;color:var(--muted);letter-spacing:.08em">CONT SITE</b><br>
        ${escapeHtml(p.account.username)} ${p.account.game_id ? `<span class="muted">(ID #${escapeHtml(p.account.game_id)})</span>` : ''}
        ${p.account.faction_name ? ` · ${escapeHtml(p.account.faction_name)}${p.account.rank_name ? ' — ' + escapeHtml(p.account.rank_name) : ''}` : ''}
        ${p.account.playtime_minutes != null ? ` · ${Math.round(p.account.playtime_minutes / 60)}h jucate` : ''}
        <br>${p.account.other_character
          ? `<span class="pill warn">ALT PERSONAJ</span> <span class="muted">contul de site e al aceluiași jucător, dar e legat de alt personaj: <b>${escapeHtml(p.account.game_name || '—')}</b>. Banii și orele se salvează doar pentru personajul legat.</span>`
          : p.account.game_linked
          ? `<span class="pill on">LEGAT DE JOC</span> <span class="muted">personaj: ${escapeHtml(p.account.game_name || '—')}</span>`
          : (p.discordCharacters || []).length
            ? `<span class="pill info">GĂSIT DUPĂ DISCORD</span> <span class="muted">— n-a folosit /leagacont, dar personajele cu același Discord sunt: ${p.discordCharacters.map(c => `<b>${escapeHtml(c.rpName || c.identifier)}</b>${c.staticId ? ` #${escapeHtml(c.staticId)}` : ''}${c.online ? ' (online)' : ''}`).join(', ')}. Mai sus sunt datele ${p.discordCharacters.length > 1 ? 'primului' : 'lui'}.</span>`
            : `<span class="pill warn">NELEGAT DE JOC</span> <span class="muted">— n-a folosit încă /leagacont</span>`}
      </p>` : `<p class="muted" style="margin:0 0 18px">Jucătorul nu are (încă) cont pe site.</p>`;

    const punishments = p.punishments.length ? `<table><thead><tr><th>TIP</th><th>MOTIV</th><th>DE CINE</th><th>CÂND</th></tr></thead><tbody>${
      p.punishments.map(pu => `<tr><td><span class="pill warn">${escapeHtml(pu.type)}</span></td><td>${escapeHtml(pu.reason)}</td><td>${escapeHtml(pu.issued_by || '—')}</td><td>${fmtDate(pu.created_at)}</td></tr>`).join('')
    }</tbody></table>` : `<p class="muted" style="margin:0">Nicio sancțiune.</p>`;

    const tickets = p.tickets.length ? `<table><thead><tr><th>SUBIECT</th><th>STATUS</th><th>DESCHIS</th></tr></thead><tbody>${
      p.tickets.map(t => `<tr><td>${escapeHtml(t.subject)}</td><td><span class="pill ${t.status === 'open' ? 'warn' : 'off'}">${escapeHtml(t.status)}</span></td><td>${fmtDate(t.created_at)}</td></tr>`).join('')
    }</tbody></table>` : `<p class="muted" style="margin:0">Niciun tichet.</p>`;

    const multiChar = new Set(p.recentActivity.map(l => l.identifier).filter(Boolean)).size > 1;
    const activity = p.recentActivity.length ? `<div class="thread">${p.recentActivity.map(l => activityLine(l, multiChar)).join('')}</div>` : `<p class="muted" style="margin:0">Nicio activitate recentă.</p>`;

    const killsVictim = p.killsAsVictim.length ? `<div class="thread">${p.killsAsVictim.map(k => `<div class="msg"><span>${killCauseLabel(k)}</span><small>${fmtDate(k.at)}</small></div>`).join('')}</div>` : `<p class="muted" style="margin:0">Nicio moarte recentă.</p>`;
    const killsKiller = p.killsAsKiller.length ? `<div class="thread">${p.killsAsKiller.map(k => `<div class="msg"><span>a ucis pe <strong>${escapeHtml(k.victim)}</strong>${k.cause ? ` <span class="muted">(${escapeHtml(k.cause)})</span>` : ''}</span><small>${fmtDate(k.at)}</small></div>`).join('')}</div>` : `<p class="muted" style="margin:0">Niciun kill recent (din ultimele ~300 de morți de pe server).</p>`;

    // (08.10.2026) Pe server un jucător poate avea 2 personaje (aceeași licență,
    // char0:/char2:…). Le arătăm pe toate, cu orele și banii fiecăruia, plus
    // totalul — ca staff-ul să vadă jucătorul întreg, nu doar un personaj.
    const chars = p.characters || [];
    const money = v => v == null ? '—' : '$' + Number(v).toLocaleString('ro-RO');
    const hm = m => m == null ? '—' : `${Math.floor(m / 60)}h ${m % 60}m`;
    const sum = k => chars.some(c => c[k] != null) ? chars.reduce((t, c) => t + (Number(c[k]) || 0), 0) : null;
    const charactersHtml = chars.length > 1 ? `
      <div class="pp-chars-wrap">
        <b style="font-size:11px;color:var(--muted);letter-spacing:.08em">PERSONAJELE JUCĂTORULUI (${chars.length}) — aceeași licență</b>
        <div class="pp-chars">${chars.map(c => {
          const me = c.identifier === p.charIdentifier;
          const name = c.rpName || c.identifier;
          return `<div class="pp-char${me ? ' is-me' : ''}">
            <div class="pp-char-top"><strong>${escapeHtml(name)}</strong>${c.staticId ? ` <span class="muted">#${escapeHtml(c.staticId)}</span>` : ''}
              <span class="pill ${c.online ? 'on' : 'off'}">${c.online ? 'ONLINE' : 'OFFLINE'}</span>${me ? ' <span class="pill info">ACESTA</span>' : ''}</div>
            <div>Ore jucate: <strong>${hm(c.playtimeMinutes)}</strong>${c.jobLabel ? ` · ${escapeHtml([c.jobLabel, c.gradeLabel].filter(Boolean).join(' · '))}` : ''}</div>
            <div>Cash <strong>${money(c.cash)}</strong> · Bancă <strong>${money(c.bank)}</strong> · Murdari <strong>${money(c.blackMoney)}</strong></div>
            ${!c.online && c.lastSeen ? `<div class="muted">Ultima dată online: ${fmtDate(c.lastSeen)}</div>` : ''}
            <div class="muted" style="font-size:11px"><code>${escapeHtml(c.identifier)}</code></div>
            ${me ? '' : `<button type="button" class="btn-ghost pp-char-open" data-name="${escapeHtml(name)}" data-id="${escapeHtml(c.identifier)}">Deschide profilul →</button>`}
          </div>`;
        }).join('')}</div>
        <p class="muted" style="margin:8px 0 0;font-size:12px">Total pe toate personajele: <strong>${hm(sum('playtimeMinutes'))}</strong> jucate · cash + bancă <strong>${money((sum('cash') ?? 0) + (sum('bank') ?? 0))}</strong> · bani murdari <strong>${money(sum('blackMoney'))}</strong></p>
      </div>` : '';

    body.innerHTML = `
      ${live}
      ${charactersHtml}
      ${account}
      <h2 style="font-size:14px;margin:22px 0 10px">⚠ Sancțiuni</h2>${punishments}
      ${moderationHtml(p.moderation)}
      ${propertyHtml(p)}
      ${fold('🎁 VIP Shop — cutii deschise', `${(p.vipHistory || []).length} cutii`, vipHtml(p.vipHistory), (p.vipHistory || []).length)}
      ${fold('🎫 Tichete', `${p.tickets.length}`, tickets, p.tickets.length)}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 0">
        <a class="btn-ghost" style="text-decoration:none;padding:8px 12px" href="admin-loguri.html?player=${encodeURIComponent(p.charIdentifier || p.name)}">🗂 Toate logurile lui</a>
        <a class="btn-ghost" style="text-decoration:none;padding:8px 12px" href="admin-loguri.html?tab=bani&player=${encodeURIComponent(p.charIdentifier || p.name)}">💰 Traseul banilor</a>
      </div>
      ${fold('🗂 Activitate recentă', `${p.recentActivity.length} acțiuni`, activity, p.recentActivity.length)}
      ${fold('🔪 Kill-uri — ca victimă', `${p.killsAsVictim.length}`, killsVictim, p.killsAsVictim.length)}
      ${fold('🔪 Kill-uri — ca ucigaș', `${p.killsAsKiller.length}`, killsKiller, p.killsAsKiller.length)}
    `;
    body.querySelectorAll('.pp-char-open').forEach(b => b.addEventListener('click', () => {
      window.openPlayerProfile(b.dataset.name, { identifier: b.dataset.id });
    }));
  }

  function ensureModal() {
    if (document.getElementById('profile-overlay')) return;
    if (!document.getElementById('pp-fold-style')) {
      const st = document.createElement('style');
      st.id = 'pp-fold-style';
      st.textContent = `
        details.pp-fold{margin:18px 0 0}
        .pp-chars-wrap{margin:0 0 18px}
        .pp-chars{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:8px}
        .pp-char{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.02);font-size:13px}
        .pp-char.is-me{border-color:rgba(120,170,255,.45);box-shadow:inset 3px 0 0 #7db2ff}
        .pp-char-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px}
        .pp-char .pp-char-open{align-self:flex-start;margin-top:6px;padding:7px 12px;font-size:12px}
        .pp-char-tag{display:inline-block;margin-left:4px;padding:1px 7px;border-radius:999px;background:rgba(120,170,255,.14);color:#9cc3ff;font-size:10px;font-weight:800;vertical-align:1px}
        details.pp-fold>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.03);font-size:13px;user-select:none}
        details.pp-fold>summary::-webkit-details-marker{display:none}
        details.pp-fold>summary:hover{border-color:rgba(255,138,31,.45)}
        details.pp-fold>summary:focus-visible{outline:2px solid var(--orange);outline-offset:2px}
        details.pp-fold .pp-fold-btn{color:var(--orange);font-weight:800;font-size:12px;white-space:nowrap}
        details.pp-fold .pp-fold-btn::after{content:"Arată ▾"}
        details.pp-fold[open] .pp-fold-btn::after{content:"Ascunde ▴"}
        details.pp-fold[open]>summary{margin-bottom:12px}`;
      document.head.appendChild(st);
    }
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

  // opts.identifier (opțional): identificatorul exact al personajului, ca
  // profilul să fie găsit sigur (ex. din istoricul VIP Shop).
  return async function openPlayerProfile(name, opts = {}) {
    ensureModal();
    document.getElementById('profile-overlay').hidden = false;
    document.body.classList.add('modal-open');
    document.getElementById('profile-title').textContent = `Profil — ${name}`;
    document.getElementById('profile-body').innerHTML = '<p class="muted">Se încarcă…</p>';
    try {
      const qs = new URLSearchParams({ name });
      if (opts.identifier) qs.set('identifier', opts.identifier);
      if (opts.rpName) qs.set('rpName', opts.rpName);
      if (opts.userId) qs.set('userId', opts.userId);
      const res = await apiFetch(`/api/admin/player-profile?${qs.toString()}`);
      if (!res.ok) throw new Error();
      renderProfile(await res.json());
    } catch {
      document.getElementById('profile-body').innerHTML = '<p class="muted">Nu am putut încărca profilul.</p>';
    }
  };
})();
