// Formatarea logurilor, comună (08.10.2026; 14.10.2026: transfer, schimb, amendă, factură, fonduri): pagina Loguri, Kill Logs,
// profilul jucătorului și serverul (backend/server.js o încarcă și el, pentru
// regulile de „suspect" și pentru Traseul banilor) — ca o frază, o regulă sau
// un prag să fie scrise o singură dată, nu în patru locuri care apoi diferă.
// În browser: window.LogFormat. Pe server: require("../log-format.js").
(function (root) {
  'use strict';

  const CATEGORY_LABEL = {
    chat: 'Chat', command: 'Comandă', connect: 'Conectare', disconnect: 'Deconectare', death: 'Moarte / Kill', money: 'Bani',
    money_vehicle_deposit: 'Bani ascunși în vehicul', money_vehicle_withdraw: 'Bani scoși din vehicul',
    item_buy: 'Cumpărare', item_craft: 'Crafting', item_transfer: 'Transfer item', item_obtained: 'Item obținut', item_drop: 'Aruncat pe jos',
    item_pickup: 'Ridicat de jos', item_primit: 'Item primit', depozit: 'Depozit',
    vehicle_acquired: 'Vehicul nou',
    transfer: 'Transfer bancar', schimb: 'Schimb (meniul G)', amenda: 'Amendă', factura: 'Factură',
    fond: 'Fond facțiune', banda_fond: 'Fond bandă',
    admin: 'Acțiune staff',
    discord: 'Discord',
  };
  const CATEGORY_PILL = {
    chat: 'info', command: 'info', connect: 'on', disconnect: 'off', death: 'warn', money: 'warn',
    money_vehicle_deposit: 'warn', money_vehicle_withdraw: 'warn',
    item_buy: 'info', item_craft: 'info', item_transfer: 'info', item_obtained: 'info', item_drop: 'warn',
    item_pickup: 'info', item_primit: 'info', depozit: 'info',
    vehicle_acquired: 'info',
    transfer: 'warn', schimb: 'warn', amenda: 'info', factura: 'info', fond: 'info', banda_fond: 'warn',
    admin: 'warn',
    discord: 'info',
  };

  // Praguri pentru „suspect" — aceleași peste tot. 200.000$ e și pragul de la
  // care serverul de joc trimite alertă pe Discord (DISCORD_MONEY_THRESHOLD).
  const MONEY_BIG = 200000;
  const MONEY_HUGE = 1000000;

  // Traducem cele mai comune actiuni de staff din Luxu Admin (kill, revive,
  // ban, kick etc.) intr-un text usor de citit in romana. Potrivirea e dupa
  // cuvinte-cheie in stringul de actiune trimis de Luxu (schema lor exacta nu
  // e documentata public) — daca actiunea nu se potriveste cu niciun tipar de
  // mai jos, arătăm textul brut trimis de Luxu, ca sa nu pierdem informatie.
  const ADMIN_ACTION_PATTERNS = [
    [/revive|reviv/i, 'a reînviat'],
    [/kill/i, 'a ucis'],
    [/\bban\b/i, 'a interzis (ban)'],
    [/kick/i, 'a dat kick'],
    [/mute/i, 'a dat mute'],
    [/teleport/i, 'a teleportat'],
    [/heal|vindec/i, 'a vindecat'],
    [/give.*(money|cash|bani|account)|(money|cash|bani|account).*give|set.*(money|cash|bank|account)/i, 'a dat / a setat bani'],
    [/give.*item|item.*give|da.*item|item.*dat/i, 'a dat un item'],
    [/take.*item|item.*take|ia.*item|item.*luat/i, 'a luat un item'],
    [/give.*vehic|vehic.*give|da.*masin|masin.*dat/i, 'a dat un vehicul'],
    [/freeze|inghet/i, 'a înghețat'],
    [/noclip/i, 'a activat noclip'],
  ];
  function humanizeAdminAction(action) {
    if (!action) return null;
    for (const [re, label] of ADMIN_ACTION_PATTERNS) {
      if (re.test(action)) return label;
    }
    return null;
  }

  const escapeHtml = s => (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Unele campuri libere (metadata de item, motivul unei actiuni de staff,
  // payload-ul brut Luxu) pot contine orice — inclusiv text urias. Taiem cu
  // "…" ce trece de o lungime rezonabila.
  function truncate(value, max) {
    const s = (value ?? '').toString();
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  function fmtDate(d) { return new Date(d).toLocaleString('ro-RO'); }
  function fmtMoney(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ro-RO') + '$'; }
  function fmtSum(n) { return Math.abs(Math.round(Number(n) || 0)).toLocaleString('ro-RO') + '$'; }

  // ---- Ce fel de item e ------------------------------------------------------
  // Pe acest server banii cash sunt și un item fizic în inventar ("money").
  // Banii murdari sunt și ei, de regulă, un item ("black_money").
  const MONEY_ITEM_NAMES = new Set(['money', 'cash', 'bani']);
  function isMoneyItemName(name) { return MONEY_ITEM_NAMES.has(String(name || '').trim().toLowerCase()); }
  function isBlackMoneyItem(name) { return /^(black[_ ]?money|dirty[_ ]?money|bani[_ ]?murdari|marked[_ ]?bills|blackmoney)$/i.test(String(name || '').trim()); }
  function plateOf(v) { return String(v || '?').trim().replace(/^(trunk|glovebox|glove)[\s:_-]*/i, '').trim().toUpperCase() || '?'; }
  // (pasul A, 14.10) jocul trimite doar placa + compartiment: 'portbagaj' / 'torpedou';
  // rândurile vechi au prefixul în placă (trunkABC123 / gloveABC123)
  function stashSpot(v, comp) {
    const c = String(comp || '').toLowerCase();
    if (/^portbagaj|^trunk/.test(c)) return 'portbagajul';
    if (/^torpedou|^glove/.test(c)) return 'torpedoul';
    return /^trunk/i.test(String(v || '')) ? 'portbagajul' : /^glove/i.test(String(v || '')) ? 'torpedoul' : 'torpedoul/portbagajul';
  }
  function isWeaponItem(name) { return /^weapon_|(^|[\s_])weapon([\s_]|$)/i.test(String(name || '').trim()); }

  // ---- Cine e jucătorul ------------------------------------------------------
  // Numele de FiveM se schimbă și se pot asemăna între jucători; numele RP și
  // ID-ul static (#313 din HUD) sunt cele după care staff-ul îl recunoaște.
  function playerButton(name, identifier, rpName, label) {
    return `<button type="button" class="player-link" data-player="${escapeHtml(name)}"${identifier ? ` data-identifier="${escapeHtml(identifier)}"` : ''}${rpName ? ` data-rpname="${escapeHtml(rpName)}"` : ''}>${label || escapeHtml(name)}</button>`;
  }
  function shortId(id) { const s = String(id || ''); return s.length > 22 ? s.slice(0, 12) + '…' + s.slice(-6) : s; }
  function staticTag(id) {
    return id ? ` <span class="lf-sid" title="ID static (din joc)">#${escapeHtml(String(id))}</span>` : '';
  }
  // Coloana „Jucător": numele RP mare + #ID static, dedesubt numele de FiveM.
  function whoHtml(log) {
    const who = log.who || {};
    const rp = who.rpName || log.rpName || null;
    const sid = who.staticId || null;
    if (!log.player && !rp) return '<span class="muted">necunoscut</span>';
    const label = `<strong>${escapeHtml(rp || log.player)}</strong>`;
    const main = (log.player ? playerButton(log.player, log.identifier || who.identifier, rp, label) : label) + staticTag(sid);
    const cfx = rp && log.player ? `<br><span class="muted lf-cfx" title="Numele de FiveM">${escapeHtml(log.player)}</span>` : '';
    return main + cfx;
  }
  // Alt jucător pomenit în frază („lui X", „ucis de X") — cu numele RP și ID.
  function otherHtml(name, who) {
    if (!name) return '<strong>necunoscut</strong>';
    if (who && who.rpName) {
      const cfx = String(name).trim().toLowerCase() === String(who.rpName).trim().toLowerCase() || /^#\d+$/.test(String(name)) ? '' : ` <span class="muted lf-cfx">(${escapeHtml(name)})</span>`;
      return `${playerButton(name, who.identifier, who.rpName, `<strong>${escapeHtml(who.rpName)}</strong>`)}${staticTag(who.staticId)}${cfx}`;
    }
    return playerButton(name, null, null, `<strong>${escapeHtml(name)}</strong>`);
  }

  // Botul de loguri Discord aduce mesaje "brute" (fără embed) — de multe ori
  // markdown de Discord (### Secțiune, **bold**). Randăm minimal, fără
  // librărie; "**" nepereche sunt tratate pe rând.
  function formatDiscordContent(value, max) {
    const escaped = escapeHtml(truncate(value, max));
    const boldPair = /\*\*([^*]+?)\*\*/g;
    return escaped.split('\n').map(line => {
      const heading = line.match(/^#{1,6}\s*(.+)$/);
      const text = (heading ? heading[1] : line).replace(boldPair, '<strong>$1</strong>');
      return heading
        ? `<span class="muted" style="text-transform:uppercase;font-size:11px;letter-spacing:.03em">${text}</span>`
        : text;
    }).join('<br>');
  }

  // Metadata unui item: scoatem câmpurile utile pentru staff (pe cine e
  // înregistrat, serie etc.); câmpurile tehnice sunt ascunse intenționat, iar
  // pozele/blob-urile lungi nu apar niciodată ca text.
  const ITEM_META_HIDDEN_KEYS = new Set([
    'label', 'license', 'jobName', 'card_type',
    'mainName', 'clothType', 'clothingNum', 'clothingTexture',
  ]);
  const ITEM_META_PHOTO_KEY_PATTERN = /photo|poza|poză|image|picture|avatar/i;
  const ITEM_META_FRIENDLY_FIELDS = [
    ['card_name', 'nume'],
    ['registered', 'înregistrată pe'],
    ['card_category', 'categorii'],
    ['card_sex', 'sex'],
    ['card_birthdate', 'născut'],
    ['variationNumber', 'variantă'],
  ];
  function redactLongBlobs(value, depth) {
    if (depth > 2) return '[…omis…]';
    if (typeof value === 'string') return value.length > 60 ? '[text lung omis]' : value;
    if (Array.isArray(value)) return value.map(v => redactLongBlobs(v, depth + 1));
    if (value && typeof value === 'object') {
      const out = {};
      for (const k of Object.keys(value)) out[k] = redactLongBlobs(value[k], depth + 1);
      return out;
    }
    return value;
  }
  function describeItemMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return '';
    const bits = [];
    const seenKeys = new Set(ITEM_META_HIDDEN_KEYS);
    Object.keys(metadata).filter(k => ITEM_META_PHOTO_KEY_PATTERN.test(k)).forEach(k => seenKeys.add(k));
    const serial = metadata.serial ?? metadata.serie;
    if (serial) { bits.push(`serie: <code>${escapeHtml(String(serial))}</code>`); seenKeys.add('serial'); seenKeys.add('serie'); }
    for (const [key, label] of ITEM_META_FRIENDLY_FIELDS) {
      seenKeys.add(key);
      const value = metadata[key];
      if (value === undefined || value === null || value === '') continue;
      const strong = key === 'card_name' || key === 'registered';
      const text = escapeHtml(String(value));
      bits.push(`${label}: ${strong ? `<strong>${text}</strong>` : text}`);
    }
    if (typeof metadata.durability === 'number') { bits.push(`durabilitate: ${Math.round(metadata.durability)}%`); seenKeys.add('durability'); }
    if (typeof metadata.ammo === 'number') { bits.push(`muniție: ${metadata.ammo}`); seenKeys.add('ammo'); }
    if (Array.isArray(metadata.components) && metadata.components.length) {
      bits.push(`atașamente: ${metadata.components.map(c => escapeHtml(String(c))).join(', ')}`);
      seenKeys.add('components');
    }
    const extraKeys = Object.keys(metadata).filter(k => !seenKeys.has(k));
    let extra = '';
    if (extraKeys.length) {
      const extraObj = {};
      extraKeys.forEach(k => { extraObj[k] = redactLongBlobs(metadata[k], 0); });
      extra = escapeHtml(truncate(JSON.stringify(extraObj), 150));
    }
    const summary = bits.join(' · ');
    if (!summary && !extra) return '';
    return `<span class="muted">(${summary}${summary && extra ? ' · ' : ''}${extra})</span>`;
  }

  // „5x Pâine", „$500", „$500 bani murdari" — cum se citește un item
  function itemText(item, count) {
    if (isMoneyItemName(item) && typeof count === 'number') return `<strong>${fmtSum(count)}</strong>`;
    if (isBlackMoneyItem(item) && typeof count === 'number') return `<strong>${fmtSum(count)} bani murdari</strong>`;
    return `<strong>${escapeHtml((count ? count + 'x ' : '') + (item || 'un item'))}</strong>`;
  }
  const PHYSICAL = ' <span class="muted">(bani ca item fizic)</span>';
  function moneyNote(item) { return isMoneyItemName(item) ? PHYSICAL : ''; }

  // Sursa unei schimbări de bani: „sigur" (eveniment de bancă confirmat) sau
  // „posibil" (dedus din ce s-a întâmplat în aceeași clipă). Numele celuilalt
  // jucător din „transfer de la X" devine clickabil.
  function sourceHtml(text, who) {
    const m = /^(transfer (?:bani )?(?:de la|către)) (.+?)( \(.+\))?$/.exec(String(text));
    if (m) return `${escapeHtml(m[1])} ${otherHtml(m[2], who)}${m[3] ? `<span class="muted">${escapeHtml(m[3])}</span>` : ''}`;
    return escapeHtml(text);
  }



  // ---- Banii scriși de vx_traseu (din 15.10, pasul 3): un rând pe operație ----
  // d.sursa === 'vx_traseu', cu cont (bank/money/black_money), cale (add/remove/
  // set/sync), resursa + motiv. „sync” = bani ca item mutați (dat/primit/vehicul),
  // aceiași bani care apar și ca item_transfer / money_vehicle_*.
  const RES_LABEL = {
    lc_fuel: 'benzinărie', lc_stores: 'magazin', 'wais-hunting': 'vânătoare', '17mov_Lumberjack': 'tăietor de lemne',
    bp_taxijob: 'taxi', '0r-ambulancejob': 'job EMS', '0r-fishingv2': 'pescuit', 'jg-dealerships': 'dealer auto',
    'jg-mechanic': 'mecanic', '0r-heistpack': 'jaf (heist)', '0r-trucker': 'tirist', pickle_casinos: 'cazinou',
    vx_magazin_haine: 'magazin de haine', vx_garaje: 'garaj', vx_banking: 'bancă', vx_radial: 'meniul G',
    vx_iarba: 'iarbă', 'frkn-rentacar': 'închiriere mașini', vx_battlepass: 'Battle Pass', vx_banda: 'Banda mea',
    vx_furt: 'furt la comandă', vx_primarie: 'primărie', luxu_admin: 'panoul de admin (Luxu)', vx_dosar: 'dosarul poliției',
    vx_facturi: 'facturi', vx_capt: 'capturi', '17mov_VehicleDirtSystem': 'spălătorie auto',
  };
  // motive scrise ca „slug” → text
  const MOTIV_TEXT = { 'magazin-haine': 'magazin de haine', 'Cazinou': 'cazinou', 'Battle Pass': 'Battle Pass' };
  // în ce grupă intră banii (Traseul banilor)
  const RES_KIND = {
    'wais-hunting': 'job', '17mov_Lumberjack': 'job', bp_taxijob: 'job', '0r-ambulancejob': 'job', '0r-fishingv2': 'job',
    '0r-trucker': 'job', vx_battlepass: 'job', lc_fuel: 'buy', lc_stores: 'buy', 'jg-dealerships': 'buy', 'jg-mechanic': 'buy',
    vx_magazin_haine: 'buy', vx_garaje: 'buy', 'frkn-rentacar': 'buy', vx_iarba: 'buy', pickle_casinos: 'casino',
    '0r-heistpack': 'heist', vx_furt: 'heist', luxu_admin: 'admin',
  };
  function resLabel(r) { return RES_LABEL[r] || r; }
  function isTraseuMoney(d) { return !!d && d.sursa === 'vx_traseu'; }
  // { text ({cp} = celălalt jucător), kind, sure, resOnly?, unknown?, peer? }
  function moneyReason(d) {
    const motiv = String(d.motiv || '').trim();
    const res = String(d.resursa || '').trim();
    const delta = Number(d.delta ?? (Number(d.cashDelta) || 0) + (Number(d.bankDelta) || 0) + (Number(d.blackDelta) || 0)) || 0;
    const out = d.cale === 'remove' || delta < 0;
    if (d.cale === 'sync' && !res) {
      if (d.cauza === 'vehicul') return { text: out ? `puși în vehiculul ${d.loc || '?'}` : `luați din vehiculul ${d.loc || '?'}`, kind: out ? 'stash_in' : 'stash_out', sure: true, where: d.loc || null };
      if (d.cauza === 'dat') return { text: 'dați lui {cp}', kind: 'transfer_out', sure: true, peer: true };
      if (d.cauza === 'primit') return { text: 'primiți de la {cp}', kind: 'transfer_in', sure: true, peer: true };
    }
    if (res === 'luxu_admin' || d.cale === 'set') return { text: d.cale === 'set' ? 'sold setat din panoul de admin' : 'schimbați din panoul de admin', kind: 'admin', sure: true };
    if (/^salariu/i.test(motiv)) return { text: 'salariu', kind: 'salary', sure: true };
    if (res === 'vx_dosar' || /^vx_dosar/.test(motiv)) {
      const ref = (/([A-Z0-9]{6,})$/.exec(motiv) || [])[1];
      return { text: `${/sentin/i.test(motiv) ? 'sentință plătită' : 'amendă plătită'}${ref ? ` (${ref})` : ''}`, kind: 'fine', sure: true };
    }
    if (res === 'vx_banking' && /depunere|retragere/i.test(motiv)) return { text: /depunere/i.test(motiv) ? 'depunere la bancă (cash → bancă)' : 'retragere de la bancă (bancă → cash)', kind: 'move', sure: true };
    if (res === 'vx_radial') return { text: out ? 'dați lui {cp} (meniul G)' : 'primiți de la {cp} (meniul G)', kind: out ? 'transfer_out' : 'transfer_in', sure: true, peer: true };
    if (!motiv || motiv === 'unknown' || /necunoscut/i.test(motiv)) {
      if (res) return { text: `${resLabel(res)} — motiv nescris de joc`, kind: RES_KIND[res] || 'other', sure: false, resOnly: true };
      return { text: 'sursă necunoscută', kind: 'unknown', sure: false, unknown: true };
    }
    if (MOTIV_TEXT[motiv]) return { text: MOTIV_TEXT[motiv], kind: RES_KIND[res] || (/cazinou/i.test(motiv) ? 'casino' : 'other'), sure: true, peer: !!d.cu };
    const m = /^([\w.-]+):\s*(.+)$/.exec(motiv);
    const text = m && m[1] === res ? `${resLabel(res)}: ${m[2]}`
      : (res && !motiv.toLowerCase().includes(resLabel(res).toLowerCase()) && !motiv.toLowerCase().includes(res.toLowerCase()) ? `${motiv} (${resLabel(res)})` : motiv);
    return { text, kind: RES_KIND[res] || (/cazinou/i.test(motiv) ? 'casino' : 'other'), sure: true, peer: !!d.cu };
  }

  // ---- Logurile noi de bani (14.10.2026): bancă, schimb, amenzi, facturi, fonduri
  // Celălalt jucător vine ca identificator (d.cu / d.contraparte / d.actor) + ID
  // static; serverul pune numele lui în log.peerWho / log.actorWho.
  function personHtml(who, sid, fallback) {
    const s = sid != null && sid !== '' ? String(sid) : (who && who.staticId) || null;
    if (who && (who.rpName || who.player)) {
      const label = `<strong>${escapeHtml(who.rpName || who.player)}</strong>`;
      return playerButton(who.player || who.rpName, who.identifier, who.rpName, label) + staticTag(who.staticId || s);
    }
    if (s) return playerButton('#' + s, who && who.identifier, null, `<span class="lf-sid" title="ID static (din joc) — nume necunoscut încă">#${escapeHtml(s)}</span>`);
    return `<strong>${escapeHtml(fallback || 'necunoscut')}</strong>`;
  }
  const FACTION_LABEL = {
    police: 'Poliție', sheriff: 'Sheriff', ambulance: 'EMS', loscustoms: 'Los Santos Customs', mechanic: 'Mecanici',
    cruisin: 'Cruisin', taxi: 'Taxi', gov: 'Guvern', government: 'Guvern', fbi: 'FBI', army: 'Armată', doj: 'Justiție',
  };
  function factionLabel(job) {
    const k = String(job || '').replace(/^society_/i, '').trim();
    if (!k) return 'necunoscută';
    return FACTION_LABEL[k.toLowerCase()] || k.charAt(0).toUpperCase() + k.slice(1);
  }
  const CHANNEL_LABEL = { telefon: 'din telefon', cont: 'de la bancă / ATM', banca: 'de la bancă', atm: 'de la ATM' };
  const FINE_PATH = { telefon: 'din telefon', parc: 'la parcul auto', auto: 'automat', card: 'cu cardul', sentinta: 'din sentință', comanda: 'prin comandă', banca: 'la bancă' };
  const PAY_MODE = { banca: 'din bancă', cash: 'cash', money: 'cash', mana: 'cash, în mână' };
  function refTag(ref) { return ref ? ` <span class="muted">· ref. <code>${escapeHtml(String(ref))}</code></span>` : ''; }
  function itemsText(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return list.slice(0, 12).map(x => {
      if (x == null) return '';
      if (typeof x !== 'object') return escapeHtml(String(x));
      const name = x.label || x.name || x.item || '?';
      const count = Number(x.count ?? x.amount ?? x.qty);
      return escapeHtml((Number.isFinite(count) && count ? count + 'x ' : '') + name);
    }).filter(Boolean).join(', ') + (list.length > 12 ? ` și încă ${list.length - 12}` : '');
  }
  function swapSide(money, items) {
    const bits = [];
    if (Number(money) > 0) bits.push(`<strong>${fmtSum(money)}</strong>`);
    const it = itemsText(items);
    if (it) bits.push(`<strong>${it}</strong>`);
    return bits.join(' + ');
  }
  // De ce s-au mișcat banii unui fond (motivul scris de vx_traseu)
  function fundReason(d) {
    const motiv = String(d.motiv || '');
    const res = String(d.resursa || '');
    const ref = (/([A-Z0-9]{6,})$/.exec(motiv) || [])[1];
    if (res === 'vx_dosar' || /^vx_dosar/.test(motiv)) return { text: /sentin/i.test(motiv) ? 'sentință plătită' : 'amendă plătită', ref };
    if (res === 'vx_facturi' || d.tipNota === 'factura') return { text: d.comentariu || 'factură plătită' };
    if (res === 'r_boss') return { text: d.cale === 'remove' ? 'retragere din meniul de șef' : 'depunere din meniul de șef' };
    if (res === 'vx_garaje') return { text: 'taxă la parcul auto' };
    // (de pe 16.10) „jg-mechanic: reparatie / factura service / piese…”
    const mech = /^jg-mechanic:\s*(.+)$/i.exec(motiv);
    if (mech) return /^necunoscut/i.test(mech[1]) ? { text: 'mecanic — motiv necunoscut', unknown: true } : { text: `mecanic — ${mech[1]}` };
    if (d.tipNota === 'alta_sursa' || motiv === 'alta_sursa') return { text: d.comentariu || 'altă sursă din joc', note: 'bani noi din joc, nu de la un jucător' };
    if (!motiv || motiv === 'unknown') return { text: `motiv nescris de joc${res ? ` (resursa ${res})` : ''}`, unknown: true };
    return { text: motiv + (d.comentariu && !motiv.includes(d.comentariu) ? ` — ${d.comentariu}` : '') };
  }

  // Fiecare categorie de log are un format diferit de "details" — o frază pe
  // înțeles. Jobul jucătorului se adaugă la final, la fel pentru orice categorie.
  function formatDetails(log) {
    const d = log.details || {};
    const body = formatDetailsBody(log, d);
    return d.job ? `${body} <span class="muted">· job: ${escapeHtml(d.job)}</span>` : body;
  }

  function formatDetailsBody(log, d) {
    switch (log.category) {
      case 'chat':
      case 'command':
        return d.message ? escapeHtml(truncate(d.message, 400)) : '<span class="muted">—</span>';
      case 'connect':
        return 's-a conectat pe server';
      case 'disconnect':
        return d.reason ? `a ieșit de pe server <span class="muted">(${escapeHtml(truncate(d.reason, 200))})</span>` : 'a ieșit de pe server';
      case 'death': {
        const parts = [];
        if (d.adminKill) {
          parts.push(`a fost ucis de <strong>admin ${escapeHtml(d.adminKill.staff || 'necunoscut')}</strong>`);
          parts.push('<span class="muted">(comandă din panoul de admin)</span>');
        } else if (d.killer) {
          parts.push(`a fost ucis de ${otherHtml(d.killer, log.killerWho)}${d.ucigasConfirmat === true ? ' <span class="lf-sure">confirmat de server</span>' : ''}`);
        } else {
          parts.push('a murit');
        }
        if (d.cause) parts.push(`<span class="muted">(${escapeHtml(String(d.cause))})</span>`);
        return parts.join(' ');
      }
      case 'money': {
        if (isTraseuMoney(d)) {
          const parts = [];
          if (Number(d.cashDelta)) parts.push(`${d.cashDelta > 0 ? 'a primit' : 'a pierdut'} <strong>${fmtSum(d.cashDelta)}</strong> cash`);
          if (Number(d.bankDelta)) parts.push(`${d.bankDelta > 0 ? 'a primit' : 'a pierdut'} <strong>${fmtSum(d.bankDelta)}</strong> în bancă`);
          if (Number(d.blackDelta)) parts.push(`${d.blackDelta > 0 ? 'a primit' : 'a pierdut'} <strong>${fmtSum(d.blackDelta)} bani murdari</strong>`);
          if (!parts.length && Number(d.delta)) parts.push(`${d.delta > 0 ? 'a primit' : 'a pierdut'} <strong>${fmtSum(d.delta)}</strong>${d.cont === 'black_money' ? ' bani murdari' : d.cont === 'bank' ? ' în bancă' : ' cash'}`);
          const r = moneyReason(d);
          const inflow = (Number(d.delta) || 0) > 0 || (Number(d.cashDelta) || 0) + (Number(d.bankDelta) || 0) + (Number(d.blackDelta) || 0) > 0;
          const lbl = r.kind === 'move' ? 'ce a fost' : inflow ? 'de unde' : 'unde s-au dus';
          let src;
          if (log.explainedSure && log.explainedBy && !r.sure) src = `<strong>${escapeHtml(log.explainedBy)}</strong> <span class="lf-sure">sigur</span>`;
          else if (r.unknown) src = '<span class="lf-unknown">necunoscut</span>';
          else {
            const txt = log.peerWho || d.cuStatic
              ? escapeHtml(r.text).replace('{cp}', personHtml(log.peerWho, d.cuStatic, 'alt jucător'))
              : escapeHtml(r.text).replace('lui {cp}', 'altui jucător').replace('{cp}', 'alt jucător');
            src = `<strong>${txt}</strong> ${r.sure ? '<span class="lf-sure">sigur</span>' : '<span class="lf-maybe">doar resursa</span>'}`;
          }
          const note = d.cale === 'sync' ? ' <span class="muted">(bani ca item în inventar)</span>' : '';
          const left = [];
          if (typeof d.cash === 'number') left.push(`${d.cash.toLocaleString('ro-RO')}$ cash`);
          if (typeof d.bank === 'number') left.push(`${d.bank.toLocaleString('ro-RO')}$ în bancă`);
          if (Number(d.black)) left.push(`${Number(d.black).toLocaleString('ro-RO')}$ murdari`);
          const total = left.length ? `<span class="muted"> · a rămas cu ${left.join(', ')}</span>` : '';
          const idBits = [];
          if (log.identifier) idBits.push(`licență: <code title="${escapeHtml(log.identifier)}">${escapeHtml(shortId(log.identifier))}</code>`);
          if (d.discord) idBits.push(`Discord: <code>${escapeHtml(d.discord)}</code>`);
          const idInfo = idBits.length ? `<br><span class="muted" style="font-size:11px">${idBits.join(' · ')}</span>` : '';
          return `${parts.join(' și ') || 'schimbare de bani'} · ${lbl}: ${src}${note}${total}${idInfo}`;
        }
        const parts = [];
        if (typeof d.cashDelta === 'number' && d.cashDelta !== 0) parts.push(`${d.cashDelta > 0 ? 'a primit' : 'a pierdut'} <strong>${fmtSum(d.cashDelta)}</strong> cash`);
        if (typeof d.bankDelta === 'number' && d.bankDelta !== 0) parts.push(`${d.bankDelta > 0 ? 'a primit' : 'a pierdut'} <strong>${fmtSum(d.bankDelta)}</strong> în bancă`);
        let change = parts.join(' și ') || 'schimbare de bani';
        let internal = false;
        // Depunere/scoatere la bancă: aceiași bani mutați dintr-un buzunar în altul
        if (typeof d.cashDelta === 'number' && typeof d.bankDelta === 'number'
            && d.cashDelta !== 0 && d.cashDelta === -d.bankDelta) {
          change = d.bankDelta > 0
            ? `a depus <strong>${fmtSum(d.bankDelta)}</strong> din cash în bancă`
            : `a scos <strong>${fmtSum(d.cashDelta)}</strong> din bancă în cash`;
          internal = true;
        }
        const total = (typeof d.cash === 'number' && typeof d.bank === 'number')
          ? `<span class="muted"> · a rămas cu ${d.cash.toLocaleString('ro-RO')}$ cash, ${d.bank.toLocaleString('ro-RO')}$ în bancă</span>`
          : '';
        const inflow = (Number(d.cashDelta) || 0) + (Number(d.bankDelta) || 0) > 0;
        const lbl = inflow ? 'de unde' : 'unde s-au dus';
        const source = internal
          ? (d.confirmedSource ? ` <span class="lf-sure">confirmat de bancă</span>` : ` <span class="lf-maybe">probabil</span>`)
          : d.confirmedSource
          ? ` · ${lbl}: <strong>${sourceHtml(d.confirmedSource, log.peerWho)}</strong> <span class="lf-sure">sigur</span>`
          : log.explainedSure && log.explainedBy
          ? ` · ${lbl}: <strong>${escapeHtml(log.explainedBy)}</strong> <span class="lf-sure">sigur</span>`
          : (d.possibleSource
            ? ` · ${lbl}: ${sourceHtml(d.possibleSource, log.peerWho)} <span class="lf-maybe">posibil</span>`
            : (log.explainedBy
              ? ` · ${lbl}: ${escapeHtml(log.explainedBy)} <span class="lf-maybe">dedus</span>`
              : ` · ${lbl}: <span class="lf-unknown">necunoscut</span>`));
        const idBits = [];
        if (log.identifier) idBits.push(`licență: <code title="${escapeHtml(log.identifier)}">${escapeHtml(shortId(log.identifier))}</code>`);
        if (d.discord) idBits.push(`Discord: <code>${escapeHtml(d.discord)}</code>`);
        const idInfo = idBits.length ? `<br><span class="muted" style="font-size:11px">${idBits.join(' · ')}</span>` : '';
        return change + source + total + idInfo;
      }
      case 'item_buy': {
        const free = typeof d.totalPrice === 'number' && d.totalPrice === 0;
        const parts = [free ? `a luat gratis ${itemText(d.item, d.count)}` : `a cumpărat ${itemText(d.item, d.count)}`];
        if (typeof d.totalPrice === 'number' && !free) parts.push(`cu <strong>${fmtSum(d.totalPrice)}</strong>`);
        if (d.shop && !/^\d+$/.test(String(d.shop))) parts.push(`<span class="muted">de la ${escapeHtml(String(d.shop))}</span>`);
        else if (free) parts.push('<span class="muted">(magazin de facțiune / armurerie)</span>');
        return parts.join(' ');
      }
      case 'item_craft': {
        const parts = [`a craftat <strong>${escapeHtml(d.recipe || 'un item')}</strong>`];
        if (d.bench) parts.push(`<span class="muted">(bench: ${escapeHtml(String(d.bench))})</span>`);
        return parts.join(' ');
      }
      case 'item_transfer': {
        if (d.lootedFromCorpse) {
          return `${otherHtml(d.to, log.toWho)} i-a luat de pe cadavru ${itemText(d.item, d.count)}${moneyNote(d.item)}`;
        }
        return `i-a dat ${itemText(d.item, d.count)} lui ${otherHtml(d.to, log.toWho)}${moneyNote(d.item)}`;
      }
      // (16.10) iteme puse / luate din depozite: vehicul (torpedou/portbagaj), facțiune, bandă, casă
      case 'depozit': {
        const took = d.sens === 'luat';
        const what = d.bani ? `<strong>${fmtSum(d.count)}${isBlackMoneyItem(d.item) || /murdar/i.test(String(d.eticheta || '')) ? ' bani murdari' : ''}</strong>`
          : `<strong>${escapeHtml((d.count ? d.count + 'x ' : '') + (d.eticheta || d.item || 'un item'))}</strong>`;
        let where;
        if (d.tip === 'vehicul') {
          const spot = /portbagaj|trunk/i.test(String(d.depozit || '')) ? 'portbagajul' : /torpedou|glove/i.test(String(d.depozit || '')) ? 'torpedoul' : 'vehiculul';
          const owner = d.proprietar && d.proprietar !== log.identifier ? ` <span class="muted">(mașina lui</span> ${personHtml(log.ownerWho, null, 'alt jucător')}<span class="muted">)</span>` : (d.proprietar ? ' <span class="muted">(mașina lui)</span>' : '');
          where = `${spot === 'vehiculul' ? 'vehiculul' : `${spot} vehiculului`} <strong>${escapeHtml(String(d.cheie || '?'))}</strong>${owner}`;
        } else if (d.tip === 'factiune') {
          where = `depozitul facțiunii <strong>${escapeHtml(factionLabel(d.cheie))}</strong> <span class="muted">(${escapeHtml(String(d.depozit || ''))})</span>`;
        } else if (d.tip === 'banda') {
          where = `depozitul bandei <strong>${escapeHtml(log.bandName || ('#' + (d.cheie ?? '?')))}</strong>`;
        } else if (d.tip === 'casa') {
          where = `casa <strong>${escapeHtml(String(d.cheie || d.depozit || '?'))}</strong>`;
        } else {
          where = `depozitul <strong>${escapeHtml(String(d.depozit || d.cheie || '?'))}</strong>`;
        }
        const serii = Array.isArray(d.serii) && d.serii.length ? ` <span class="muted">· serie: ${d.serii.slice(0, 3).map(x => `<code>${escapeHtml(String(x))}</code>`).join(', ')}${d.serii.length > 3 ? '…' : ''}</span>` : '';
        return `${took ? 'a luat' : 'a pus'} ${what} ${took ? 'din' : 'în'} ${where}${serii}`;
      }
      // (15.10) aceeași mutare, scrisă pe cel care primește
      case 'item_primit':
        return `a primit ${itemText(d.item, d.count)} de la ${otherHtml(d.from, log.fromWho)}${moneyNote(d.item)}`;
      case 'item_obtained': {
        if (d.adminGrant) {
          return `a primit ${itemText(d.item, d.count)} de la <strong>admin ${escapeHtml(d.adminGrant.staff || 'necunoscut')}</strong>`;
        }
        if (isMoneyItemName(d.item) || isBlackMoneyItem(d.item)) {
          return `i-au apărut în inventar ${itemText(d.item, d.count)} <span class="muted">(dați de un script: job, vânzare, jaf, cazino…)</span>`;
        }
        const parts = [`a obținut ${itemText(d.item, d.count)}`];
        const metaDesc = describeItemMetadata(d.metadata);
        if (metaDesc) parts.push(metaDesc);
        return parts.join(' ');
      }
      case 'item_drop':
        return `a aruncat pe jos ${itemText(d.item, d.count)}${moneyNote(d.item)}${log.pickedBy ? ` · ridicat apoi de ${otherHtml(log.pickedBy.player, log.pickedBy.who)} <span class="lf-maybe">probabil</span>` : ''}`;
      case 'item_pickup':
        return `a ridicat de jos ${itemText(d.item, d.count)}${moneyNote(d.item)}${log.droppedBy ? ` · aruncat de ${otherHtml(log.droppedBy.player, log.droppedBy.who)} <span class="lf-maybe">probabil</span>` : ''}`;
      // Bani puși/luați din torpedoul sau portbagajul unui vehicul (placuta
      // vine din id-ul inventarului ox_inventory, best-effort).
      case 'money_vehicle_deposit': {
        const sum = (typeof d.count === 'number') ? fmtSum(d.count) + (d.murdari === true ? ' bani murdari' : '') : 'bani';
        return `a ascuns <strong>${sum}</strong> în ${stashSpot(d.vehicle, d.compartiment)} vehiculului <strong>${escapeHtml(plateOf(d.vehicle))}</strong>`;
      }
      case 'money_vehicle_withdraw': {
        const sum = (typeof d.count === 'number') ? fmtSum(d.count) + (d.murdari === true ? ' bani murdari' : '') : 'bani';
        return `a scos <strong>${sum}</strong> din ${stashSpot(d.vehicle, d.compartiment)} vehiculului <strong>${escapeHtml(plateOf(d.vehicle))}</strong>`;
      }
      case 'vehicle_acquired': {
        const label = d.vehicle || 'un vehicul';
        const plate = d.plate ? ` <span class="muted">(${escapeHtml(d.plate)})</span>` : '';
        if (d.adminGrant) {
          return `a primit vehiculul <strong>${escapeHtml(label)}</strong>${plate} de la <strong>admin ${escapeHtml(d.adminGrant.staff || 'necunoscut')}</strong>`;
        }
        return `are un vehicul nou: <strong>${escapeHtml(label)}</strong>${plate} <span class="muted">· nu știm sigur dacă l-a cumpărat, primit sau transferat</span>`;
      }
      case 'transfer': {
        const peer = personHtml(log.peerWho, d.cuStatic);
        const how = d.canal ? ` <span class="muted">(${escapeHtml(CHANNEL_LABEL[d.canal] || String(d.canal))})</span>` : '';
        const fee = Number(d.comision) > 0 ? ` <span class="muted">· comision ${fmtSum(d.comision)}</span>` : '';
        const later = d.livrat && d.livrat !== 'acum' ? ` <span class="muted">· livrat: ${escapeHtml(String(d.livrat))}</span>` : '';
        return d.rol === 'primit'
          ? `a primit <strong>${fmtSum(d.suma)}</strong> prin bancă de la ${peer}${how}${fee}${later}`
          : `a trimis <strong>${fmtSum(d.suma)}</strong> prin bancă lui ${peer}${how}${fee}${later}`;
      }
      case 'schimb': {
        const peer = personHtml(log.peerWho, d.cuStatic);
        const gave = swapSide(d.baniDati, d.dat);
        const got = swapSide(d.baniPrimiti, d.primit);
        const via = d.canal === 'meniu_g' ? ' <span class="muted">(meniul G)</span>' : (d.canal ? ` <span class="muted">(${escapeHtml(String(d.canal))})</span>` : '');
        if (gave && !got) return `i-a dat lui ${peer} ${gave} <span class="muted">fără nimic în schimb</span>${via}`;
        if (got && !gave) return `a primit de la ${peer} ${got} <span class="muted">fără să dea nimic</span>${via}`;
        if (!gave && !got) return `schimb gol cu ${peer}${via}`;
        return `schimb cu ${peer}: a dat ${gave} · a primit ${got}${via}`;
      }
      case 'amenda': {
        const paid = d.stare === 'platita';
        const who = factionLabel(d.factiune);
        const path = FINE_PATH[d.cale] ? ` ${FINE_PATH[d.cale]}` : (d.cale ? ` (${escapeHtml(String(d.cale))})` : '');
        const p = d.plata || {};
        const split = Number(p.money) > 0 && Number(p.bank) > 0 ? ` <span class="muted">(${fmtSum(p.money)} cash + ${fmtSum(p.bank)} din bancă)</span>`
          : Number(p.money) > 0 ? ' <span class="muted">(cash)</span>' : (d.mod === 'banca' || Number(p.bank) > 0 ? ' <span class="muted">(din bancă)</span>' : '');
        const sent = d.sentinta ? ` <span class="muted">· sentința #${escapeHtml(String(d.sentinta))}</span>` : '';
        const by = d.autorStatic ? ` · dată de ${personHtml(log.actorWho, d.autorStatic)}` : '';
        const isSent = d.cale === 'sentinta' || d.sentinta;
        if (paid && isSent) return `a plătit sentința de <strong>${fmtSum(d.suma)}</strong> către <strong>${escapeHtml(who)}</strong>${split}${by}${sent}${refTag(d.ref)}`;
        return paid
          ? `a plătit${path} amenda de <strong>${fmtSum(d.suma)}</strong> către <strong>${escapeHtml(who)}</strong>${split}${by}${sent}${refTag(d.ref)}`
          : `a primit o amendă de <strong>${fmtSum(d.suma)}</strong> de la <strong>${escapeHtml(who)}</strong> <span class="muted">(${escapeHtml(String(d.stare || 'neplătită'))})</span>${by}${sent}${refTag(d.ref)}`;
      }
      case 'factura': {
        const peer = personHtml(log.peerWho, d.cuStatic);
        const firm = `<strong>${escapeHtml(d.firma || factionLabel(d.job))}</strong>`;
        const mode = PAY_MODE[d.mod] ? ` <span class="muted">(${PAY_MODE[d.mod]})</span>` : '';
        const parts = [];
        if (Number(d.inFond) > 0) parts.push(`${fmtSum(d.inFond)} în fondul firmei`);
        if (Number(d.laLucrator) > 0) parts.push(`${fmtSum(d.laLucrator)} la lucrător${PAY_MODE[d.lucratorPlata] ? ` (${PAY_MODE[d.lucratorPlata]})` : ''}`);
        const split = parts.length ? ` <span class="muted">· ${parts.join(', ')}</span>` : '';
        return d.rol === 'incasator'
          ? `a încasat factura de <strong>${fmtSum(d.suma)}</strong> pentru ${firm} de la ${peer}${mode}${split}${refTag(d.ref)}`
          : `a plătit factura de <strong>${fmtSum(d.suma)}</strong> la ${firm}, emisă de ${peer}${mode}${split}${refTag(d.ref)}`;
      }
      case 'fond': {
        const fund = `fondul <strong>${escapeHtml(factionLabel(d.cont))}</strong>`;
        const r = fundReason(d);
        const out = d.cale === 'remove' || Number(d.delta) < 0;
        const sum = `<strong>${fmtSum(d.suma ?? d.delta)}</strong>`;
        const self = !d.contraparte || d.contraparte === log.identifier;
        const why = ` — ${escapeHtml(r.text)}${r.ref ? refTag(r.ref) : ''}${r.unknown ? ' <span class="lf-unknown">necunoscut</span>' : ''}${r.note ? ` <span class="muted">(${escapeHtml(r.note)})</span>` : ''}`;
        let head, actor = '';
        if (d.legatura === 'nota') {
          head = `${out ? 'au ieșit' : 'au intrat'} ${sum} ${out ? 'din' : 'în'} ${fund}`;
          if (d.actor && d.actor !== log.identifier) actor = ` · făcut de ${personHtml(log.actorWho, d.actorStatic)}`;
          else if (d.actor) head = `${out ? 'a scos' : 'a adus'} ${sum} ${out ? 'din' : 'în'} ${fund}`;
        } else if (self) {
          head = out ? `a scos ${sum} din ${fund}` : `a plătit ${sum} în ${fund}`;
        } else {
          head = `${out ? `${sum} din ${fund} către` : `${sum} în ${fund} de la`} ${personHtml(log.peerWho, d.contraparteStatic)}`;
        }
        const sold = typeof d.sold === 'number' ? ` <span class="muted">· sold fond: ${fmtSum(d.sold)}</span>` : '';
        return head + why + actor + sold;
      }
      case 'banda_fond': {
        const dirty = d.murdari === true || /dirty|black/i.test(String(d.fond || ''));
        const delta = Number(d.delta ?? d.suma) || 0;
        const sign = delta < 0 ? '−' : '+';
        const op = { kit: 'kit', depunere: 'depunere', retragere: 'retragere', plata: 'plată' }[d.op] || d.op || d.tip || 'mișcare';
        const src = d.sursa || d.actorResursa || d.motiv;
        const ACTOR = { curator: 'dat de curator', consola: 'din consolă (staff)', sistem: 'automat' };
        const by = d.static || d.identifier ? ` · de ${personHtml(log.actorWho, d.static)}` : (ACTOR[d.actorTip] ? ` <span class="muted">· ${ACTOR[d.actorTip]}</span>` : '');
        // plata automată pentru teritorii: zone + săptămâna
        const zones = Array.isArray(d.zone) ? d.zone : (d.zone != null ? [d.zone] : []);
        const zoneTxt = zones.length ? ` <span class="muted">· teritorii: ${zones.length > 1 || typeof zones[0] !== 'number' ? escapeHtml(zones.map(z => typeof z === 'object' ? (z.label || z.name || z.id) : z).join(', ')) : zones[0] + ' cartiere'}${d.saptamana ? ` · săptămâna ${escapeHtml(String(d.saptamana))}` : ''}</span>` : (d.saptamana ? ` <span class="muted">· săptămâna ${escapeHtml(String(d.saptamana))}</span>` : '');
        const sold = typeof d.sold_dupa === 'number' ? ` <span class="muted">· sold: ${fmtSum(d.sold_inainte)} → ${fmtSum(d.sold_dupa)}</span>` : '';
        const state = d.stare && d.stare !== 'facut' ? ` <span class="muted">(stare: ${escapeHtml(String(d.stare))})</span>` : '';
        return `fondul bandei <strong>${escapeHtml(d.banda || ('#' + (d.org ?? '?')))}</strong>: <strong>${sign}${fmtSum(delta)}</strong> ${dirty ? '<strong>bani murdari</strong>' : 'bani curați'} — ${escapeHtml(String(op))}${src ? ` <span class="muted">(sursa: ${escapeHtml(String(src))})</span>` : ''}${zoneTxt}${by}${state}${sold}`;
      }
      case 'admin': {
        const parts = [];
        const nice = humanizeAdminAction(d.action);
        parts.push(`<strong>${escapeHtml(nice || d.action || 'acțiune')}</strong>`);
        if (d.target) parts.push(`→ <strong>${escapeHtml(d.target)}</strong>`);
        if (d.reason) parts.push(`<span class="muted">(${escapeHtml(truncate(d.reason, 300))})</span>`);
        if (nice && d.action) parts.push(`<span class="muted">· acțiune brută: ${escapeHtml(truncate(d.action, 200))}</span>`);
        return parts.length ? parts.join(' ') : `<span class="muted">${escapeHtml(truncate(JSON.stringify(d.raw || {}), 300))}</span>`;
      }
      // Copiate din canalele Discord de loguri (bancă/facturi, heist-uri…).
      case 'discord': {
        const parts = [];
        if (d.title) parts.push(`<strong>${escapeHtml(d.title)}</strong>`);
        if (d.fields && Object.keys(d.fields).length) {
          parts.push(Object.entries(d.fields).map(([k, v]) => `${escapeHtml(k)}: <strong>${escapeHtml(String(v))}</strong>`).join(' · '));
        } else if (d.content) {
          parts.push(formatDiscordContent(d.content, 300));
        }
        const source = [d.channel ? `#${d.channel}` : null, d.category].filter(Boolean).join(' · ');
        if (source) parts.push(`<span class="muted">(${escapeHtml(source)})</span>`);
        return parts.length ? parts.join(' ') : '<span class="muted">—</span>';
      }
      default:
        return `<span class="muted">${escapeHtml(truncate(JSON.stringify(d), 300))}</span>`;
    }
  }

  // ---- Semnalare suspecte -----------------------------------------------------
  // O listă de motive, fiecare cu nivel: "crit" (roșu — de verificat imediat)
  // sau "warn" (galben — de urmărit). Aceleași reguli pe server (filtrul
  // „Doar suspecte") și în pagini (etichetele de pe rând).
  function flagsFor(log) {
    const d = (log && log.details) || {};
    const out = [];
    const add = (level, text) => out.push({ level, text });
    const big = n => Math.abs(Number(n) || 0);
    const sizeFlag = (n, what) => {
      if (big(n) >= MONEY_HUGE) add('crit', `${what} peste ${fmtSum(MONEY_HUGE)}`);
      else if (big(n) >= MONEY_BIG) add('warn', `${what} peste ${fmtSum(MONEY_BIG)}`);
    };
    switch (log && log.category) {
      case 'money': {
        if (isTraseuMoney(d)) {
          const r = moneyReason(d);
          const m = Math.max(big(d.cashDelta), big(d.bankDelta), big(d.blackDelta), big(d.delta));
          const inflow = (Number(d.delta) || 0) > 0 || (Number(d.cashDelta) || 0) + (Number(d.bankDelta) || 0) + (Number(d.blackDelta) || 0) > 0;
          if (r.kind !== 'move') sizeFlag(m, 'Sumă');
          if (r.kind === 'admin') add(m >= MONEY_BIG ? 'crit' : 'warn', d.cale === 'set' ? 'Sold setat de admin' : 'Bani schimbați de admin');
          if (inflow && r.unknown && !log.explainedSure && m >= 50000) add(m >= MONEY_BIG ? 'crit' : 'warn', 'Bani primiți fără sursă cunoscută');
          if (inflow && r.resOnly && m >= MONEY_BIG) add('warn', 'Sumă mare fără motiv scris');
          if (inflow && r.kind === 'salary' && m >= 100000) add(m >= MONEY_HUGE ? 'crit' : 'warn', '„Salariu” prea mare — de verificat');
          if (inflow && Number(d.blackDelta) >= 50000) add(Number(d.blackDelta) >= MONEY_BIG ? 'crit' : 'warn', 'Bani murdari primiți');
          break;
        }
        const m = Math.max(big(d.cashDelta), big(d.bankDelta));
        const inflow = (Number(d.cashDelta) || 0) > 0 || (Number(d.bankDelta) || 0) > 0;
        const internal = Number(d.cashDelta) !== 0 && Number(d.cashDelta) === -Number(d.bankDelta);
        if (!internal) sizeFlag(m, 'Sumă');
        if (inflow && !log.explainedSure && /^salariu/i.test(String(d.possibleSource || '')) && m >= 100000) add(m >= MONEY_HUGE ? 'crit' : 'warn', '„Salariu” prea mare — de verificat');
        if (inflow && !internal && !d.confirmedSource && !d.possibleSource && !log.explainedBy && m >= 50000) add(m >= MONEY_BIG ? 'crit' : 'warn', 'Bani primiți fără sursă cunoscută');
        break;
      }
      case 'item_primit':
        if (isWeaponItem(d.itemName || d.item)) add('warn', 'Armă primită de la alt jucător');
        break;
      case 'depozit':
        if (d.sens === 'luat' && d.tip === 'vehicul' && d.proprietar && d.proprietar !== log.identifier) add('warn', 'A luat din mașina altcuiva');
        if (d.bani && big(d.count) >= 50000) add(big(d.count) >= MONEY_BIG ? 'crit' : 'warn', d.sens === 'luat' ? 'Bani luați din depozit' : 'Bani puși în depozit');
        if (d.sens === 'luat' && isWeaponItem(d.item) && d.tip !== 'factiune') add('warn', 'Armă luată din depozit');
        break;
      case 'item_transfer':
        if (isMoneyItemName(d.item) || isBlackMoneyItem(d.item)) sizeFlag(d.count, isBlackMoneyItem(d.item) ? 'Transfer de bani murdari' : 'Transfer de bani');
        if (isWeaponItem(d.itemName || d.item)) add('warn', 'Armă dată altui jucător');
        if (d.lootedFromCorpse && (isMoneyItemName(d.item) || isBlackMoneyItem(d.item))) add('warn', 'Bani luați de pe cadavru');
        break;
      case 'item_obtained':
        if (d.adminGrant) add('warn', 'Dat de admin');
        if ((isMoneyItemName(d.item) || isBlackMoneyItem(d.item)) && big(d.count) >= 50000) add(big(d.count) >= MONEY_BIG ? 'crit' : 'warn', 'Bani apăruți în inventar');
        break;
      case 'item_drop':
      case 'item_pickup':
        if ((isMoneyItemName(d.item) || isBlackMoneyItem(d.item)) && big(d.count) >= 50000) add(big(d.count) >= MONEY_BIG ? 'crit' : 'warn', log.category === 'item_drop' ? 'Bani aruncați pe jos' : 'Bani ridicați de jos');
        break;
      case 'money_vehicle_deposit':
        if (big(d.count) >= 50000) add(big(d.count) >= MONEY_BIG ? 'crit' : 'warn', 'Bani ascunși în vehicul');
        break;
      case 'money_vehicle_withdraw':
        if (log.notOwnStash) add('crit', 'A luat bani ascunși de altcineva');
        else if (big(d.count) >= MONEY_BIG) add('warn', 'Sumă mare scoasă din vehicul');
        break;
      case 'transfer':
        sizeFlag(d.suma, d.rol === 'primit' ? 'Primit prin bancă' : 'Trimis prin bancă');
        break;
      case 'schimb': {
        const m = Math.max(big(d.baniDati), big(d.baniPrimiti));
        sizeFlag(m, 'Schimb de bani');
        const oneSided = (big(d.baniDati) > 0 && !big(d.baniPrimiti) && !(d.primit || []).length) || (big(d.baniPrimiti) > 0 && !big(d.baniDati) && !(d.dat || []).length);
        if (oneSided && m >= 50000 && m < MONEY_BIG) add('warn', big(d.baniDati) > 0 ? 'Bani dați fără nimic în schimb' : 'Bani primiți fără să dea nimic');
        break;
      }
      case 'factura':
        sizeFlag(d.suma, 'Factură');
        break;
      case 'fond': {
        const out = d.cale === 'remove' || Number(d.delta) < 0;
        if (out) {
          if (big(d.suma ?? d.delta) >= MONEY_BIG) sizeFlag(d.suma ?? d.delta, 'Scos din fond');
          else if (big(d.suma ?? d.delta) >= 50000) add('warn', 'Bani scoși din fondul facțiunii');
        } else if ((!d.motiv || d.motiv === 'unknown' || /^jg-mechanic:\s*necunoscut/i.test(String(d.motiv))) && big(d.suma ?? d.delta) >= 50000) {
          add(big(d.suma ?? d.delta) >= MONEY_BIG ? 'crit' : 'warn', 'Intrare în fond fără motiv scris');
        } else if (d.legatura === 'nota' && d.tipNota === 'alta_sursa') {
          sizeFlag(d.suma ?? d.delta, 'Bani noi în fond');
        }
        break;
      }
      case 'banda_fond': {
        const dirty = d.murdari === true || /dirty|black/i.test(String(d.fond || ''));
        if (dirty && big(d.delta ?? d.suma) >= 50000) add(big(d.delta ?? d.suma) >= MONEY_BIG ? 'crit' : 'warn', 'Bani murdari în fondul bandei');
        else if (big(d.delta ?? d.suma) >= MONEY_HUGE) add('warn', `Fond bandă: mișcare peste ${fmtSum(MONEY_HUGE)}`);
        break;
      }
      case 'vehicle_acquired':
        if (d.adminGrant) add('warn', 'Vehicul dat de admin');
        break;
      case 'death':
        if (d.adminKill) add('warn', 'Ucis de admin');
        break;
      case 'admin':
        if (/money|cash|bani|bank|account|give|item|vehic|spawn|set/i.test(String(d.action || '') + ' ' + String(d.reason || ''))) add('warn', 'Admin a dat / a modificat ceva');
        break;
      default:
        break;
    }
    return out;
  }
  function flagsHtml(flags) {
    if (!flags || !flags.length) return '';
    return flags.map(f => `<span class="lf-flag lf-${f.level === 'crit' ? 'crit' : 'warn'}">⚠ ${escapeHtml(f.text)}</span>`).join(' ');
  }

  // Stilurile comune (identitate, sigur/posibil, etichete de suspect) — puse o
  // singură dată în pagină, ca fiecare pagină să nu le repete.
  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('lf-styles')) return;
    const st = document.createElement('style');
    st.id = 'lf-styles';
    st.textContent = `
      .lf-sid{font:600 11px/1 ui-monospace,Consolas,monospace;color:var(--orange,#f08a24);background:rgba(240,138,36,.12);border:1px solid rgba(240,138,36,.35);border-radius:5px;padding:2px 5px;margin-left:4px;white-space:nowrap}
      .lf-cfx{font-size:11px}
      .lf-sure,.lf-maybe,.lf-unknown{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:4px;padding:1px 5px;white-space:nowrap}
      .lf-sure{color:#3ccf7e;background:rgba(60,207,126,.12)}
      .lf-maybe{color:#d9b23a;background:rgba(217,178,58,.12)}
      .lf-unknown{color:#ff6b6b;background:rgba(255,107,107,.12)}
      .lf-flag{display:inline-block;font-size:11px;font-weight:700;border-radius:5px;padding:2px 7px;margin:4px 4px 0 0;white-space:nowrap}
      .lf-warn{color:#f3c34b;background:rgba(243,195,75,.13);border:1px solid rgba(243,195,75,.35)}
      .lf-crit{color:#ff6b6b;background:rgba(255,107,107,.13);border:1px solid rgba(255,107,107,.4)}
      tr.lf-row-crit td:first-child{box-shadow:inset 3px 0 0 #ff6b6b}
      tr.lf-row-warn td:first-child{box-shadow:inset 3px 0 0 #f3c34b}
    `;
    document.head.appendChild(st);
  }

  const api = {
    CATEGORY_LABEL, CATEGORY_PILL, MONEY_BIG, MONEY_HUGE,
    humanizeAdminAction, escapeHtml, truncate, fmtDate, fmtMoney, fmtSum,
    isMoneyItemName, isBlackMoneyItem, isWeaponItem,
    playerButton, staticTag, shortId, whoHtml, otherHtml, personHtml, factionLabel, fundReason, moneyReason, isTraseuMoney, resLabel, formatDiscordContent, describeItemMetadata,
    formatDetails, flagsFor, flagsHtml, injectStyles,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LogFormat = api;
})(typeof window !== 'undefined' ? window : globalThis);
