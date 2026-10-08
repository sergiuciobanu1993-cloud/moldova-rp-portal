// Formatarea logurilor, comună (08.10.2026): pagina Loguri, Kill Logs,
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
    item_pickup: 'Ridicat de jos',
    vehicle_acquired: 'Vehicul nou',
    admin: 'Acțiune staff',
    discord: 'Discord',
  };
  const CATEGORY_PILL = {
    chat: 'info', command: 'info', connect: 'on', disconnect: 'off', death: 'warn', money: 'warn',
    money_vehicle_deposit: 'warn', money_vehicle_withdraw: 'warn',
    item_buy: 'info', item_craft: 'info', item_transfer: 'info', item_obtained: 'info', item_drop: 'warn',
    item_pickup: 'info',
    vehicle_acquired: 'info',
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
  function isBlackMoneyItem(name) { return /^(black_?money|dirty_?money|bani_?murdari|marked_?bills|blackmoney)$/i.test(String(name || '').trim()); }
  function plateOf(v) { return String(v || '?').trim().replace(/^(trunk|glovebox|glove)[\s:_-]*/i, '').trim().toUpperCase() || '?'; }
  function stashSpot(v) { return /^trunk/i.test(String(v || '')) ? 'portbagajul' : /^glove/i.test(String(v || '')) ? 'torpedoul' : 'torpedoul/portbagajul'; }
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
      return `${playerButton(name, who.identifier, who.rpName, `<strong>${escapeHtml(who.rpName)}</strong>`)}${staticTag(who.staticId)} <span class="muted lf-cfx">(${escapeHtml(name)})</span>`;
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
          parts.push(`a fost ucis de ${otherHtml(d.killer, log.killerWho)}`);
        } else {
          parts.push('a murit');
        }
        if (d.cause) parts.push(`<span class="muted">(${escapeHtml(String(d.cause))})</span>`);
        return parts.join(' ');
      }
      case 'money': {
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
        const sum = (typeof d.count === 'number') ? fmtSum(d.count) : 'bani';
        return `a ascuns <strong>${sum}</strong> în ${stashSpot(d.vehicle)} vehiculului <strong>${escapeHtml(plateOf(d.vehicle))}</strong>`;
      }
      case 'money_vehicle_withdraw': {
        const sum = (typeof d.count === 'number') ? fmtSum(d.count) : 'bani';
        return `a scos <strong>${sum}</strong> din ${stashSpot(d.vehicle)} vehiculului <strong>${escapeHtml(plateOf(d.vehicle))}</strong>`;
      }
      case 'vehicle_acquired': {
        const label = d.vehicle || 'un vehicul';
        const plate = d.plate ? ` <span class="muted">(${escapeHtml(d.plate)})</span>` : '';
        if (d.adminGrant) {
          return `a primit vehiculul <strong>${escapeHtml(label)}</strong>${plate} de la <strong>admin ${escapeHtml(d.adminGrant.staff || 'necunoscut')}</strong>`;
        }
        return `are un vehicul nou: <strong>${escapeHtml(label)}</strong>${plate} <span class="muted">· nu știm sigur dacă l-a cumpărat, primit sau transferat</span>`;
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
        const m = Math.max(big(d.cashDelta), big(d.bankDelta));
        const inflow = (Number(d.cashDelta) || 0) > 0 || (Number(d.bankDelta) || 0) > 0;
        const internal = Number(d.cashDelta) !== 0 && Number(d.cashDelta) === -Number(d.bankDelta);
        if (!internal) sizeFlag(m, 'Sumă');
        if (inflow && !internal && !d.confirmedSource && !d.possibleSource && !log.explainedBy && m >= 50000) add(m >= MONEY_BIG ? 'crit' : 'warn', 'Bani primiți fără sursă cunoscută');
        break;
      }
      case 'item_transfer':
        if (isMoneyItemName(d.item) || isBlackMoneyItem(d.item)) sizeFlag(d.count, isBlackMoneyItem(d.item) ? 'Transfer de bani murdari' : 'Transfer de bani');
        if (isWeaponItem(d.item)) add('warn', 'Armă dată altui jucător');
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
    playerButton, staticTag, shortId, whoHtml, otherHtml, formatDiscordContent, describeItemMetadata,
    formatDetails, flagsFor, flagsHtml, injectStyles,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LogFormat = api;
})(typeof window !== 'undefined' ? window : globalThis);
