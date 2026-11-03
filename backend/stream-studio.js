// ---------------------------------------------------------------------------
// (03.11.2026, cerut de Sergiu) Studio de streaming — platformă gratuită pentru
// streamerii comunității, pe TikTok LIVE: alerte cu sunet, TTS, obiective, top
// susținători, contor de cadouri, chat pe ecran, roata norocului, cronometru
// subathon, puncte pentru spectatori, artificii din cadouri și texte care se rotesc.
//
// Nu are legătură cu serverul de joc: e doar o unealtă de stream.
//
//   • Accesul: jucătorul cere acces din streamer.html, staff-ul (ADMIN_ROLES)
//     aprobă din admin-streameri.html. Conturile cu rangul „streamer" au acces direct.
//   • Conectarea la TikTok LIVE: pachetul „tiktok-live-connector" (neoficial — TikTok
//     nu are o cale oficială pentru cadouri/chat în timp real). E în
//     optionalDependencies: dacă lipsește sau nu merge, tot restul site-ului
//     merge normal, iar Studio-ul spune clar că legătura nu e disponibilă.
//     Opțional, cheia EULER_API_KEY (variabilă pe Railway) ridică limitele.
//   • Overlay-urile (stream-overlay.html?k=CHEIE&w=…) primesc evenimentele
//     prin Server-Sent Events: /api/stream/live/:cheie. Cheia e secretă, dar
//     arată doar date publice de pe live; se poate schimba oricând din Studio.
//   • Starea unei sesiuni (contoare, top, cronometru) e ținută în memorie și
//     salvată la 30 de secunde în stream_profiles.state; punctele spectatorilor
//     în stream_points.
// ---------------------------------------------------------------------------
const crypto = require("crypto");

module.exports = function registerStreamStudio(app, { pool, auth, requireRole, asyncRoute, logAction, notifyUser, ADMIN_ROLES }) {
  const MAX_CONNECTIONS = Number(process.env.STREAM_MAX_CONNECTIONS || 40);
  const MAX_CLIENTS_PER_STREAMER = 40;
  const RETRY_OFFLINE_MS = 60_000;          // live oprit → încercăm din nou la un minut
  const GIVE_UP_AFTER_MS = 3 * 3600_000;    // după 3 ore fără live, nu mai încercăm
  const TIKTOK_RE = /^[a-zA-Z0-9_.]{2,24}$/;

  // ---------------------------------------------------------------- tabele
  let tablesP = null;
  const tables = () => tablesP ||= pool.query(`
    CREATE TABLE IF NOT EXISTS stream_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tiktok VARCHAR(40) NOT NULL,
      motiv TEXT,
      status VARCHAR(12) NOT NULL DEFAULT 'pending',
      note TEXT,
      overlay_key VARCHAR(64) UNIQUE,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS stream_points (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewer VARCHAR(64) NOT NULL,
      name VARCHAR(64),
      points BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, viewer));
    CREATE INDEX IF NOT EXISTS stream_points_top ON stream_points(user_id, points DESC);
    CREATE TABLE IF NOT EXISTS stream_media (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(120),
      kind VARCHAR(10) NOT NULL,
      mime VARCHAR(60) NOT NULL,
      bytes INT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS stream_media_user ON stream_media(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS stream_gifts (
      id BIGINT PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      diamonds INT NOT NULL DEFAULT 0,
      img TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`).catch(err => { tablesP = null; throw err; });

  // ---------------------------------------------------------------- setări
  const clampN = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
  const str = (v, max, def = "") => { const s = String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim(); return (s || def).slice(0, max); };
  const bool = (v, def) => typeof v === "boolean" ? v : def;
  const color = (v, def) => /^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v).toLowerCase() : def;
  const SOUNDS = ["coin", "pop", "whoosh", "fanfare", "laser", "bell", "drum", "magic", "none"];
  const sound = (v, def) => SOUNDS.includes(v) ? v : def;
  const THEMES = ["neon", "glass", "minimal", "arcade"];
  const GOAL_TYPES = ["likes", "diamonds", "follows", "shares", "gifts"];
  const WHEEL_COLORS = ["#ff8a1f", "#3ddc84", "#4aa3ff", "#f25f8b", "#b57bff", "#ffd23f", "#2ee6d6", "#ff5a4e"];

  const MAX_ACTIONS = 60, MAX_EVENTS = 60;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const mediaRef = v => UUID_RE.test(String(v || "")) ? String(v).toLowerCase() : null;
  const KINDS = ["image", "video", "audio"];
  const EFFECTS = ["none", "confetti", "hearts", "shake", "flash"];
  const POSITIONS = ["center", "top", "bottom", "left", "right"];
  const TRIGGERS = ["gift", "follow", "share", "like", "command", "member", "subscribe"];
  const safeId = (v, pre) => String(v || "").replace(/[^\w-]/g, "").slice(0, 16) || pre + crypto.randomBytes(4).toString("hex");
  function normAction(x = {}, i = 0) {
    const media = mediaRef(x.media), audio = mediaRef(x.audio);
    return {
      id: safeId(x.id, "a"), name: str(x.name, 40, `Acțiune ${i + 1}`),
      media, mediaKind: media && KINDS.includes(x.mediaKind) ? x.mediaKind : null,
      audio: audio && x.audio !== media ? audio : null,
      sound: sound(x.sound, "none"),
      text: str(x.text, 140), tts: str(x.tts, 200),
      duration: clampN(x.duration, 0, 60, 6), volume: clampN(x.volume, 0, 100, 80),
      screen: Math.round(clampN(x.screen, 1, 8, 1)), position: POSITIONS.includes(x.position) ? x.position : "center",
      size: clampN(x.size, 10, 100, 45), effect: EFFECTS.includes(x.effect) ? x.effect : "none",
      wheel: bool(x.wheel, false), timer: Math.round(clampN(x.timer, -3600, 3600, 0)), points: Math.round(clampN(x.points, -1_000_000, 1_000_000, 0)),
    };
  }
  function normEvent(x = {}, i = 0, actionIds = new Set()) {
    let cmd = str(x.command, 30).toLowerCase().replace(/\s+/g, "");
    if (cmd && !cmd.startsWith("!")) cmd = "!" + cmd;
    return {
      id: safeId(x.id, "e"), on: bool(x.on, true),
      trigger: TRIGGERS.includes(x.trigger) ? x.trigger : "gift",
      gift: str(x.gift, 60), min: Math.round(clampN(x.min, 1, 1_000_000, 1)), perGift: bool(x.perGift, false),
      likes: Math.round(clampN(x.likes, 10, 1_000_000, 100)),
      command: cmd || "!dans", cost: Math.round(clampN(x.cost, 0, 10_000_000, 0)),
      cooldown: clampN(x.cooldown, 0, 3600, 0), userCooldown: clampN(x.userCooldown, 0, 3600, 0),
      random: bool(x.random, false),
      actions: (Array.isArray(x.actions) ? x.actions : []).map(String).filter(id => actionIds.has(id)).slice(0, 6),
    };
  }

  function normSound(x = {}, i = 0) {
    let cmd = str(x.command, 30).toLowerCase().replace(/\s+/g, "");
    if (cmd && !cmd.startsWith("!")) cmd = "!" + cmd;
    const src = String(x.src || "");
    return {
      id: safeId(x.id, "s"), on: bool(x.on, true), trigger: TRIGGERS.includes(x.trigger) ? x.trigger : "gift",
      gift: str(x.gift, 60), min: Math.round(clampN(x.min, 1, 1_000_000, 1)), likes: Math.round(clampN(x.likes, 10, 1_000_000, 100)), command: cmd || "!sunet",
      src: /^m:[0-9a-f-]{36}$/i.test(src) ? src.toLowerCase() : /^s:\w+$/.test(src) && SOUNDS.includes(src.slice(2)) ? src : "s:coin",
      volume: Math.round(clampN(x.volume, 0, 100, 80)), key: str(x.key, 12).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10),
    };
  }
  function normCommands(c = {}) {
    const one = (x, def, extra = {}) => {
      let cmd = str(x?.cmd, 24).toLowerCase().replace(/\s+/g, "");
      if (cmd && !cmd.startsWith("!")) cmd = "!" + cmd;
      return { on: bool(x?.on, true), cmd: cmd || def, ...extra };
    };
    return {
      points: one(c?.points, "!puncte"),
      send: one(c?.send, "!trimite", { min: Math.round(clampN(c?.send?.min, 1, 1_000_000, 10)) }),
      spin: one(c?.spin, "!roata", { cost: Math.round(clampN(c?.spin?.cost, 0, 10_000_000, 100)) }),
      drop: one(c?.drop, "!ia"),
      list: one(c?.list, "!comenzi"),
    };
  }
  const JAR_SHAPES = ["borcan", "butoi", "ulcior"];
  const TEAM_COLORS = ["#ff4d6a", "#4aa3ff", "#3ddc84", "#ffd23f"];
  function normBattle(b = {}) {
    const def = [{ name: "Roșii", command: "!rosu", gifts: "Rose" }, { name: "Albaștrii", command: "!albastru", gifts: "TikTok" }];
    const teams = (Array.isArray(b?.teams) ? b.teams : def).slice(0, 4).map((t, i) => {
      let cmd = str(t?.command, 24).toLowerCase().replace(/\s+/g, "");
      if (cmd && !cmd.startsWith("!")) cmd = "!" + cmd;
      return { name: str(t?.name, 30, `Echipa ${i + 1}`), color: color(t?.color, TEAM_COLORS[i]), command: cmd, gifts: str(t?.gifts, 200) };
    });
    while (teams.length < 2) teams.push({ name: `Echipa ${teams.length + 1}`, color: TEAM_COLORS[teams.length], command: "", gifts: "" });
    return {
      title: str(b?.title, 60, "Bătălia echipelor"), minutes: clampN(b?.minutes, 0.5, 180, 5), teams,
      cmdPoints: Math.round(clampN(b?.cmdPoints, 0, 1000, 1)), likePoints: Math.round(clampN(b?.likePoints, 0, 1000, 0)),
      anyGift: bool(b?.anyGift, false),
    };
  }

  function normalizeSettings(s = {}) {
    const a = s.alerts || {};
    const alert = (x = {}, d) => ({ on: bool(x.on, d.on), sound: sound(x.sound, d.sound), text: str(x.text, 120, d.text), tts: bool(x.tts, false), min: clampN(x.min, 1, 100000, d.min ?? 1), every: clampN(x.every, 50, 1000000, d.every ?? 1000) });
    const t = s.tts || {};
    const tm = s.timer || {};
    const p = s.points || {};
    const w = s.wheel || {};
    const segs = (Array.isArray(w.segments) ? w.segments : []).map((x, i) => ({ label: str(x?.label ?? x, 40), color: color(x?.color, WHEEL_COLORS[i % WHEEL_COLORS.length]) })).filter(x => x.label).slice(0, 16);
    const goals = (Array.isArray(s.goals) ? s.goals : []).slice(0, 4).map((g, i) => ({
      id: str(g?.id, 12, `g${i + 1}`).replace(/[^\w-]/g, "") || `g${i + 1}`,
      type: GOAL_TYPES.includes(g?.type) ? g.type : "likes",
      title: str(g?.title, 60, "Obiectiv"),
      target: clampN(g?.target, 1, 100_000_000, 1000),
    }));
    const lines = (Array.isArray(s.rotator?.lines) ? s.rotator.lines : []).map(x => str(x, 120)).filter(Boolean).slice(0, 12);
    // (03.11.2026) Acțiuni (ce se întâmplă: clip, imagine, muzică, text, voce, efect) și
    // evenimente (când: un anumit cadou, follow, share, like-uri, comandă în chat…)
    const seen = new Set();
    const actions = (Array.isArray(s.actions) ? s.actions : []).slice(0, MAX_ACTIONS).map((x, i) => normAction(x, i)).filter(a => !seen.has(a.id) && seen.add(a.id));
    const ids = new Set(actions.map(a => a.id)), seenE = new Set();
    const events = (Array.isArray(s.events) ? s.events : []).slice(0, MAX_EVENTS).map((x, i) => normEvent(x, i, ids)).filter(e => !seenE.has(e.id) && seenE.add(e.id));
    return {
      alerts: {
        gift: alert(a.gift, { on: true, sound: "coin", text: "{user} a trimis {count}× {gift}!", min: 1 }),
        follow: alert(a.follow, { on: true, sound: "pop", text: "{user} te urmărește acum!" }),
        share: alert(a.share, { on: true, sound: "whoosh", text: "{user} a distribuit live-ul!" }),
        member: alert(a.member, { on: false, sound: "none", text: "{user} a intrat pe live" }),
        likes: alert(a.likes, { on: true, sound: "fanfare", text: "Am ajuns la {total} de like-uri!", every: 1000 }),
        duration: clampN(a.duration, 2, 20, 5),
        volume: clampN(a.volume, 0, 100, 70),
      },
      tts: {
        on: bool(t.on, false),
        mode: ["all", "command", "gifters"].includes(t.mode) ? t.mode : "command",
        voice: str(t.voice, 120),
        rate: clampN(t.rate, 0.5, 2, 1),
        pitch: clampN(t.pitch, 0.5, 2, 1),
        volume: clampN(t.volume, 0, 100, 80),
        maxLen: clampN(t.maxLen, 20, 300, 150),
        readName: bool(t.readName, true),
        cooldown: clampN(t.cooldown, 0, 120, 5),
        banned: str(t.banned, 600),
      },
      goals: goals.length || Array.isArray(s.goals) ? goals : [{ id: "g1", type: "likes", title: "Obiectiv like-uri", target: 10000 }, { id: "g2", type: "follows", title: "Urmăritori noi", target: 50 }],
      top: { title: str(s.top?.title, 60, "Top susținători"), count: clampN(s.top?.count, 3, 10, 5) },
      counter: { title: str(s.counter?.title, 60, "Cadouri pe live") },
      chat: { max: clampN(s.chat?.max, 3, 20, 8), showGifts: bool(s.chat?.showGifts, true), hideCommands: bool(s.chat?.hideCommands, true), fade: clampN(s.chat?.fade, 0, 300, 60) },
      wheel: {
        title: str(w.title, 60, "Roata norocului"),
        trigger: ["manual", "gift"].includes(w.trigger) ? w.trigger : "gift",
        minDiamonds: clampN(w.minDiamonds, 1, 100000, 99),
        segments: segs.length >= 2 ? segs : ["10 flotări", "Cântă un refren", "Shoutout", "Mai joci o tură", "Accent rusesc 1 min", "Încă o dată!"].map((label, i) => ({ label, color: WHEEL_COLORS[i] })),
      },
      timer: {
        title: str(tm.title, 60, "Subathon"),
        startMin: clampN(tm.startMin, 1, 1440, 60),
        perDiamond: clampN(tm.perDiamond, 0, 600, 5),
        perFollow: clampN(tm.perFollow, 0, 3600, 30),
        perShare: clampN(tm.perShare, 0, 3600, 10),
        perLikes100: clampN(tm.perLikes100, 0, 600, 5),
        maxHours: clampN(tm.maxHours, 1, 168, 24),
      },
      points: {
        on: bool(p.on, true),
        title: str(p.title, 60, "Cei mai fideli spectatori"),
        count: clampN(p.count, 3, 10, 5),
        perChat: clampN(p.perChat, 0, 1000, 1),
        perLikes100: clampN(p.perLikes100, 0, 1000, 5),
        perDiamond: clampN(p.perDiamond, 0, 1000, 10),
        perFollow: clampN(p.perFollow, 0, 10000, 25),
        perShare: clampN(p.perShare, 0, 10000, 10),
        currency: str(p.currency, 20, "puncte"),
        levelBase: Math.round(clampN(p.levelBase, 1, 1_000_000, 50)),
        levelMult: clampN(p.levelMult, 1, 3, 1.25),
      },
      // (03.11.2026) sunete rapide (fără overlay), comenzi de chat, likeathon
      sounds: {
        simultaneous: bool(s.sounds?.simultaneous, true), maxQueue: Math.round(clampN(s.sounds?.maxQueue, 1, 200, 50)),
        list: (Array.isArray(s.sounds?.list) ? s.sounds.list : []).slice(0, 60).map((x, i) => normSound(x, i)),
      },
      commands: normCommands(s.commands),
      intervals: (Array.isArray(s.intervals) ? s.intervals : []).slice(0, 20).map(x => ({ id: safeId(x?.id, "t"), on: bool(x?.on, true), minutes: clampN(x?.minutes, 1, 240, 10), action: safeId(x?.action, "a"), onlyLive: bool(x?.onlyLive, true) })).filter(x => ids.has(x.action)),
      likeathon: { title: str(s.likeathon?.title, 60, "Cine dă cele mai multe like-uri"), count: Math.round(clampN(s.likeathon?.count, 3, 15, 8)), decay: bool(s.likeathon?.decay, false), decayPct: Math.round(clampN(s.likeathon?.decayPct, 1, 50, 10)) },
      fireworks: { on: bool(s.fireworks?.on, true), maxIcons: clampN(s.fireworks?.maxIcons, 5, 80, 30) },
      // (03.11.2026) jocuri și widgeturi noi: bătălia echipelor, borcanul, fântâna, tunul, ultimii, emoji din chat
      battle: normBattle(s.battle),
      jar: { title: str(s.jar?.title, 60, "Borcanul cu cadouri"), shape: JAR_SHAPES.includes(s.jar?.shape) ? s.jar.shape : "borcan", max: Math.round(clampN(s.jar?.max, 20, 250, 120)), min: Math.round(clampN(s.jar?.min, 1, 100000, 1)) },
      fountain: { emoji: str(s.fountain?.emoji, 8, "❤️"), perLikes: Math.round(clampN(s.fountain?.perLikes, 1, 500, 5)), avatars: bool(s.fountain?.avatars, true), max: Math.round(clampN(s.fountain?.max, 10, 400, 160)) },
      cannon: { side: ["left", "right", "both"].includes(s.cannon?.side) ? s.cannon.side : "both", min: Math.round(clampN(s.cannon?.min, 1, 100000, 1)), names: bool(s.cannon?.names, true) },
      last: { follower: bool(s.last?.follower, true), gifter: bool(s.last?.gifter, true), sharer: bool(s.last?.sharer, true), subscriber: bool(s.last?.subscriber, false), layout: ["row", "column"].includes(s.last?.layout) ? s.last.layout : "column" },
      emoji: { size: Math.round(clampN(s.emoji?.size, 24, 160, 64)), max: Math.round(clampN(s.emoji?.max, 1, 10, 4)) },
      rotator: { lines: lines.length || Array.isArray(s.rotator?.lines) ? lines : ["Dă follow ca să nu pierzi live-ul!", "Trimite un cadou și învârte roata!", "Scrie !tts mesaj și îl citesc cu voce"], every: clampN(s.rotator?.every, 3, 120, 8) },
      actions, events,
      theme: { style: THEMES.includes(s.theme?.style) ? s.theme.style : "neon", accent: color(s.theme?.accent, "#ff8a1f"), scale: clampN(s.theme?.scale, 0.6, 2, 1) },
    };
  }

  // ---------------------------------------------------------------- starea live (în memorie)
  // hubs: user_id → { uid, key, tiktok, settings, state, clients:Set, conn, status, ... }
  const hubs = new Map();
  const keyToUid = new Map();

  const emptyState = () => ({
    since: Date.now(), likes: 0, diamonds: 0, gifts: 0, follows: 0, shares: 0, viewers: 0, peakViewers: 0,
    top: {}, gifters: {}, timer: { running: false, endsAt: 0, left: 0 }, likeMilestone: 0,
    last: {}, jar: [], battle: { running: false, endsAt: 0, scores: [], winner: null, team: {} },
    likers: {}, drop: null,
  });
  function cleanState(s) {
    const st = { ...emptyState(), ...(s && typeof s === "object" ? s : {}) };
    st.top = st.top && typeof st.top === "object" ? st.top : {};
    st.gifters = st.gifters && typeof st.gifters === "object" ? st.gifters : {};
    st.timer = { running: !!st.timer?.running, endsAt: Number(st.timer?.endsAt) || 0, left: Number(st.timer?.left) || 0 };
    st.last = st.last && typeof st.last === "object" ? st.last : {};
    st.jar = Array.isArray(st.jar) ? st.jar.slice(-250) : [];
    st.likers = st.likers && typeof st.likers === "object" ? st.likers : {};
    st.drop = st.drop && st.drop.until > Date.now() ? st.drop : null;
    const b = st.battle || {};
    st.battle = { running: !!b.running, endsAt: Number(b.endsAt) || 0, scores: Array.isArray(b.scores) ? b.scores.map(Number) : [], winner: b.winner ?? null, team: b.team && typeof b.team === "object" ? b.team : {} };
    return st;
  }

  async function loadHub(uid) {
    let h = hubs.get(uid);
    if (h) return h;
    await tables();
    const { rows } = await pool.query(`SELECT user_id, tiktok, status, overlay_key, settings, state FROM stream_profiles WHERE user_id = $1`, [uid]);
    const r = rows[0];
    if (!r || r.status !== "approved") return null;
    h = hubs.get(uid);   // între timp, altă cerere l-a creat
    if (h) return h;
    h = {
      uid, key: r.overlay_key, tiktok: r.tiktok, settings: normalizeSettings(r.settings), state: cleanState(r.state),
      clients: new Set(), conn: null, status: "off", statusMsg: "", wanted: false, wantedSince: 0, retryT: null, gen: 0,
      dirty: false, pointsQ: new Map(), likeAcc: new Map(), chatCd: new Map(), ttsCd: new Map(), wheelQ: [], wheelBusyUntil: 0, pushT: null,
      roomId: null, lastEventAt: 0, evLast: new Map(), evUser: new Map(), likeUser: new Map(), battleT: null, battleCd: new Map(),
    };
    hubs.set(uid, h);
    if (h.key) keyToUid.set(h.key, uid);
    if (h.state.battle.running) battleSchedule(h);
    return h;
  }

  function send(res, ev) { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { /* clientul a plecat */ } }
  function broadcast(h, ev) { for (const res of h.clients) send(res, ev); }

  const publicTop = h => Object.entries(h.state.top).map(([id, v]) => ({ id, name: v.name, avatar: v.avatar, diamonds: v.diamonds }))
    .sort((a, b) => b.diamonds - a.diamonds).slice(0, 10);
  const timerView = h => {
    const t = h.state.timer;
    return { running: t.running, endsAt: t.running ? t.endsAt : 0, left: t.running ? Math.max(0, t.endsAt - Date.now()) : t.left };
  };
  const battleView = h => {
    const b = h.state.battle, n = h.settings.battle.teams.length;
    return { running: b.running, left: b.running ? Math.max(0, b.endsAt - Date.now()) : 0, scores: Array.from({ length: n }, (_, i) => Number(b.scores[i]) || 0), winner: b.winner };
  };
  const snapshot = h => ({
    since: h.state.since, likes: h.state.likes, diamonds: h.state.diamonds, gifts: h.state.gifts, follows: h.state.follows,
    shares: h.state.shares, viewers: h.state.viewers, peakViewers: h.state.peakViewers, top: publicTop(h), timer: timerView(h),
    last: h.state.last, battle: battleView(h), likers: topLikers(h), drop: dropView(h),
  });
  const topLikers = h => Object.entries(h.state.likers).map(([id, v]) => ({ id, name: v.name, avatar: v.avatar, likes: Math.round(v.likes) }))
    .filter(x => x.likes > 0).sort((a, b) => b.likes - a.likes).slice(0, 15);
  const dropView = h => { const d = h.state.drop; return d && d.until > Date.now() ? { amount: d.amount, left: d.until - Date.now(), max: d.max, claimed: d.claimed.length } : null; };
  // temporizatoare: o acțiune la fiecare N minute (implicit doar cât e conectat la live)
  setInterval(() => {
    const now = Date.now();
    for (const h of hubs.values()) {
      for (const t of h.settings.intervals || []) {
        if (!t.on || (t.onlyLive && h.status !== "live")) continue;
        h.ivLast ||= new Map();
        const last = h.ivLast.get(t.id) || 0;
        if (!last) { h.ivLast.set(t.id, now); continue; }
        if (now - last >= t.minutes * 60_000) { h.ivLast.set(t.id, now); runAction(h, h.settings.actions.find(a => a.id === t.action), { user: { id: "", name: "", avatar: "" } }); }
      }
    }
  }, 15_000).unref?.();
  // likeathon: scorul scade cu X% la 10 secunde, dacă streamerul a pornit asta
  setInterval(() => {
    for (const h of hubs.values()) {
      const c = h.settings.likeathon;
      if (!c?.decay) continue;
      let any = false;
      for (const [id, v] of Object.entries(h.state.likers)) { v.likes *= 1 - c.decayPct / 100; if (v.likes < 1) delete h.state.likers[id]; any = true; }
      if (any) pushState(h);
    }
  }, 10_000).unref?.();

  // nivelul spectatorului după puncte: fiecare nivel cere de „levelMult" ori mai mult decât precedentul
  function levelOf(h, pts) {
    const { levelBase, levelMult } = h.settings.points;
    let lvl = 1, need = levelBase, total = 0;
    while (pts >= total + need && lvl < 999) { total += need; lvl++; need = Math.ceil(need * levelMult); }
    return { level: lvl, toNext: total + need - pts };
  }

  // ---------------------------------------------------------------- bătălia echipelor
  function battleSchedule(h) {
    clearTimeout(h.battleT);
    const b = h.state.battle;
    if (!b.running) return;
    h.battleT = setTimeout(() => battleEnd(h), Math.max(0, b.endsAt - Date.now()));
  }
  function battleEnd(h) {
    const b = h.state.battle;
    if (!b.running) return;
    clearTimeout(h.battleT);
    b.running = false;
    const sc = battleView(h).scores, best = Math.max(...sc);
    const winners = sc.map((v, i) => v === best ? i : -1).filter(i => i >= 0);
    b.winner = best > 0 && winners.length === 1 ? winners[0] : -1;   // -1 = egalitate
    broadcast(h, { t: "battle", battle: battleView(h), ended: true });
    pushState(h);
  }
  function battleAction(h, a) {
    const b = h.state.battle, n = h.settings.battle.teams.length;
    if (a === "start") { b.running = true; b.endsAt = Date.now() + h.settings.battle.minutes * 60_000; b.scores = Array(n).fill(0); b.winner = null; b.team = {}; battleSchedule(h); }
    else if (a === "stop") battleEnd(h);
    else if (a === "add1") b.endsAt = Math.max(Date.now(), b.endsAt + 60_000);
    else if (a === "reset") { clearTimeout(h.battleT); b.running = false; b.scores = Array(n).fill(0); b.winner = null; b.team = {}; }
    if (a === "add1") battleSchedule(h);
    if (a !== "stop") broadcast(h, { t: "battle", battle: battleView(h) });
    pushState(h);
  }
  const giftList = v => String(v || "").split(/[,;\n]/).map(x => giftKey(x)).filter(Boolean);
  function battleScore(h, team, pts, u) {
    const b = h.state.battle;
    if (!b.running || !(pts > 0) || team < 0) return;
    if (Date.now() > b.endsAt) return battleEnd(h);
    b.scores[team] = (Number(b.scores[team]) || 0) + pts;
    if (u?.id) { b.team[u.id] = team; if (Object.keys(b.team).length > 20000) b.team = {}; }
    broadcast(h, { t: "battle", battle: battleView(h), team, pts, user: u?.name || "" });
    pushState(h);
  }
  function battleGift(h, u, gift, diamonds) {
    const cfg = h.settings.battle, k = giftKey(gift);
    let team = cfg.teams.findIndex(t => giftList(t.gifts).includes(k));
    // orice alt cadou merge la echipa aleasă de spectator (cu comanda) — dacă e pornit
    if (team < 0 && cfg.anyGift && u?.id && h.state.battle.team[u.id] != null) team = h.state.battle.team[u.id];
    battleScore(h, team, diamonds, u);
  }
  const statusView = h => ({ status: h.status, msg: h.statusMsg, tiktok: h.tiktok, wanted: h.wanted, lib: libState.ok, since: h.wantedSince || null });

  // un singur „state" la câteva sute de ms, chiar dacă vin sute de like-uri pe secundă
  function pushState(h) {
    h.dirty = true;
    if (h.pushT) return;
    h.pushT = setTimeout(() => { h.pushT = null; broadcast(h, { t: "state", state: snapshot(h) }); }, 350);
  }

  // ---------------------------------------------------------------- puncte
  async function flushPoints(h) {
    if (!h.pointsQ.size) return false;
    const batch = [...h.pointsQ.entries()];
    h.pointsQ.clear();
    try {
      await pool.query(
        `INSERT INTO stream_points(user_id, viewer, name, points)
         SELECT $1, v, n, p FROM UNNEST($2::text[], $3::text[], $4::bigint[]) AS x(v, n, p)
         ON CONFLICT (user_id, viewer) DO UPDATE SET points = stream_points.points + EXCLUDED.points, name = EXCLUDED.name, updated_at = NOW()`,
        [h.uid, batch.map(b => b[0]), batch.map(b => b[1].name), batch.map(b => Math.round(b[1].pts))]);
      return true;
    } catch (err) { console.error("Studio: puncte nesalvate:", err.message); return false; }
  }
  async function pointsTop(uid, n = 10) {
    const { rows } = await pool.query(`SELECT viewer AS id, name, points FROM stream_points WHERE user_id = $1 AND points > 0 ORDER BY points DESC LIMIT $2`, [uid, n]);
    return rows.map(r => ({ id: r.id, name: r.name || r.id, points: Number(r.points) }));
  }
  function addPointsRaw(h, user, pts) {
    if (!pts || !user?.id || user.test) return;
    const q = h.pointsQ.get(user.id) || { name: user.name, pts: 0 };
    q.pts += pts; q.name = user.name;
    h.pointsQ.set(user.id, q);
  }
  function addPoints(h, user, pts) {
    if (!h.settings.points.on || !(pts > 0) || !user.id || user.test) return;
    const q = h.pointsQ.get(user.id) || { name: user.name, pts: 0 };
    q.pts += pts; q.name = user.name;
    h.pointsQ.set(user.id, q);
  }

  async function saveState(h) {
    if (!h.dirty) return;
    h.dirty = false;
    try { await pool.query(`UPDATE stream_profiles SET state = $2, updated_at = NOW() WHERE user_id = $1`, [h.uid, JSON.stringify(h.state)]); }
    catch (err) { h.dirty = true; console.error("Studio: stare nesalvată:", err.message); }
  }
  setInterval(async () => {
    for (const h of hubs.values()) {
      await saveState(h);
      if (await flushPoints(h)) broadcast(h, { t: "points", list: await pointsTop(h.uid).catch(() => []) });
      // fără clienți, fără conexiune, fără nimic de salvat → îl scoatem din memorie
      if (!h.clients.size && !h.conn && !h.wanted && !h.dirty && !h.pointsQ.size) { hubs.delete(h.uid); if (h.key) keyToUid.delete(h.key); }
    }
  }, 30_000).unref?.();

  // ---------------------------------------------------------------- cronometru, roată
  function timerAdd(h, sec) {
    if (!(sec > 0)) return;
    const t = h.state.timer, maxMs = h.settings.timer.maxHours * 3600_000;
    if (t.running) t.endsAt = Math.min(Date.now() + maxMs, Math.max(t.endsAt, Date.now()) + sec * 1000);
    else if (t.left > 0) t.left = Math.min(maxMs, t.left + sec * 1000);
    else return;   // cronometrul nu e pornit — cadourile nu-l pornesc singure
    broadcast(h, { t: "timer", timer: timerView(h), added: sec });
    pushState(h);
  }
  function timerShift(h, sec) {
    if (sec > 0) return timerAdd(h, sec);
    const t = h.state.timer;
    if (t.running) t.endsAt = Math.max(Date.now(), t.endsAt + sec * 1000);
    else if (t.left > 0) t.left = Math.max(0, t.left + sec * 1000);
    else return;
    broadcast(h, { t: "timer", timer: timerView(h), added: sec });
    pushState(h);
  }
  function timerAction(h, a, minutes) {
    const t = h.state.timer, now = Date.now();
    if (a === "start") { t.running = true; t.endsAt = now + h.settings.timer.startMin * 60_000; t.left = 0; }
    else if (a === "pause" && t.running) { t.left = Math.max(0, t.endsAt - now); t.running = false; t.endsAt = 0; }
    else if (a === "resume" && !t.running && t.left > 0) { t.running = true; t.endsAt = now + t.left; t.left = 0; }
    else if (a === "reset") { t.running = false; t.endsAt = 0; t.left = 0; }
    else if (a === "add") { const m = clampN(minutes, -600, 600, 0); if (t.running) t.endsAt = Math.max(now, t.endsAt + m * 60_000); else t.left = Math.max(0, t.left + m * 60_000); }
    broadcast(h, { t: "timer", timer: timerView(h) });
    pushState(h);
  }
  const WHEEL_SPIN_MS = 6500, WHEEL_HOLD_MS = 3500;
  function wheelSpin(h, by) {
    if (h.wheelQ.length >= 20) return false;
    h.wheelQ.push(by || "");
    runWheel(h);
    return true;
  }
  function runWheel(h) {
    if (h.wheelT || !h.wheelQ.length) return;
    const wait = Math.max(0, h.wheelBusyUntil - Date.now());
    h.wheelT = setTimeout(() => {
      h.wheelT = null;
      const by = h.wheelQ.shift();
      const segs = h.settings.wheel.segments;
      const idx = crypto.randomInt(segs.length);
      h.wheelBusyUntil = Date.now() + WHEEL_SPIN_MS + WHEEL_HOLD_MS;
      broadcast(h, { t: "wheel", idx, label: segs[idx].label, by, spinMs: WHEEL_SPIN_MS, holdMs: WHEEL_HOLD_MS, queue: h.wheelQ.length, n: segs.length });
      runWheel(h);
    }, wait);
  }

  // ---------------------------------------------------------------- TTS
  const URL_RE = /(https?:\/\/|www\.)\S+|\b\S+\.(com|md|ro|ru|net|org|gg|io|tv|me|link|ly)\b\S*/gi;
  function ttsText(h, user, text, { gift = false } = {}) {
    const c = h.settings.tts;
    if (!c.on) return null;
    let msg = String(text || "");
    if (!gift) {
      if (c.mode === "command") {
        const m = /^\s*!(tts|spune|zi)\s+(.+)/i.exec(msg);
        if (!m) return null;
        msg = m[2];
      } else if (c.mode === "gifters" && !h.state.gifters[user.id]) return null;
      const last = h.ttsCd.get(user.id) || 0;
      if (c.cooldown && Date.now() - last < c.cooldown * 1000) return null;
      h.ttsCd.set(user.id, Date.now());
    }
    msg = msg.replace(URL_RE, " ").replace(/\s+/g, " ").trim();
    if (!msg || /^[\W_]+$/.test(msg)) return null;
    const banned = c.banned.toLowerCase().split(/[,;\n]/).map(x => x.trim()).filter(x => x.length >= 2);
    const low = msg.toLowerCase();
    if (banned.some(b => low.includes(b))) return null;
    msg = msg.slice(0, c.maxLen);
    return !gift && c.readName ? `${user.name} spune: ${msg}` : msg;
  }

  // ---------------------------------------------------------------- evenimente
  const fill = (tpl, v) => String(tpl).replace(/\{(user|gift|count|diamonds|total|text)\}/g, (_, k) => String(v[k] ?? ""));
  function alertOf(h, kind, vars, extra = {}) {
    const a = h.settings.alerts[kind];
    if (!a?.on) return null;
    const text = fill(a.text, vars);
    return { kind, text, sound: a.sound, duration: h.settings.alerts.duration, volume: h.settings.alerts.volume, tts: a.tts ? text.replace(URL_RE, " ").slice(0, 200) : null, ...extra };
  }

  // ---------------------------------------------------------------- acțiuni și evenimente
  const giftKey = v => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  function runAction(h, a, ctx = {}) {
    if (!a) return;
    const u = ctx.user || { id: "", name: "", avatar: "" };
    const vars = { user: u.name, gift: ctx.gift || "", count: ctx.count || 1, diamonds: ctx.diamonds || 0, total: "", text: ctx.args || "" };
    broadcast(h, {
      t: "action", id: a.id, name: a.name, screen: a.screen,
      media: a.media ? { url: `/api/stream/media/${a.media}`, kind: a.mediaKind || "image" } : null,
      audio: a.audio ? `/api/stream/media/${a.audio}` : null,
      sound: a.sound, text: fill(a.text, vars), tts: a.tts ? fill(a.tts, vars).replace(URL_RE, " ").slice(0, 220) : null,
      duration: a.duration, volume: a.volume, position: a.position, size: a.size, effect: a.effect,
      user: u, img: ctx.img || "", test: !!u.test,
    });
    if (a.wheel) wheelSpin(h, u.name);
    if (a.timer) timerShift(h, a.timer);
    if (a.points && u.id && !u.test) addPointsRaw(h, u, a.points);
  }
  function runEvent(h, e, ctx, times = 1) {
    const acts = e.actions.map(id => h.settings.actions.find(a => a.id === id)).filter(Boolean);
    if (!acts.length) return false;
    for (let i = 0; i < times; i++) {
      if (e.random) runAction(h, acts[crypto.randomInt(acts.length)], ctx);
      else for (const a of acts) runAction(h, a, ctx);
    }
    return true;
  }
  function fireEvents(h, trigger, ctx) {
    const now = Date.now(), uid = ctx.user?.id || "";
    for (const e of h.settings.events) {
      if (!e.on || e.trigger !== trigger || !e.actions.length) continue;
      let times = 1;
      if (trigger === "gift") {
        if (e.gift && giftKey(e.gift) !== giftKey(ctx.gift) && String(e.gift) !== String(ctx.giftId || "")) continue;
        if ((e.perGift ? ctx.diamonds / Math.max(1, ctx.count) : ctx.diamonds) < e.min) continue;
        times = e.perGift ? Math.min(ctx.count || 1, 10) : 1;
      } else if (trigger === "like") {
        times = Math.min(3, Math.floor(ctx.after / e.likes) - Math.floor(ctx.before / e.likes));
        if (times <= 0) continue;
      } else if (trigger === "command") {
        if (ctx.cmd !== e.command) continue;
      }
      if (e.cooldown && now - (h.evLast.get(e.id) || 0) < e.cooldown * 1000) continue;
      const uk = e.id + "|" + uid;
      if (e.userCooldown && uid && now - (h.evUser.get(uk) || 0) < e.userCooldown * 1000) continue;
      const go = () => {
        h.evLast.set(e.id, Date.now());
        if (uid) { h.evUser.set(uk, Date.now()); if (h.evUser.size > 10000) h.evUser.clear(); }
        runEvent(h, e, ctx, times);
      };
      if (trigger === "command" && e.cost > 0 && !ctx.user?.test) {
        // comandă cu preț în puncte: verificăm și scădem punctele spectatorului
        viewerPoints(h, uid).then(have => {
          if (have < e.cost) { broadcast(h, { t: "notice", text: `${ctx.user.name} are ${have} puncte, iar ${e.command} costă ${e.cost}.` }); return; }
          addPointsRaw(h, ctx.user, -e.cost);
          go();
        }).catch(() => {});
      } else go();
    }
  }
  // sunete rapide: ca la evenimente, dar fără overlay — se aud din Studio (sau din overlay-ul „Sunete”).
  // Mai multe sunete pe același declanșator = se alege unul la întâmplare.
  function fireSounds(h, trigger, ctx) {
    const groups = new Map();
    for (const x of h.settings.sounds.list) {
      if (!x.on || x.trigger !== trigger) continue;
      if (trigger === "gift") {
        if (x.gift && giftKey(x.gift) !== giftKey(ctx.gift) && String(x.gift) !== String(ctx.giftId || "")) continue;
        if (ctx.diamonds < x.min) continue;
      } else if (trigger === "like") {
        if (Math.floor(ctx.after / x.likes) - Math.floor(ctx.before / x.likes) <= 0) continue;
      } else if (trigger === "command" && ctx.cmd !== x.command) continue;
      const k = [x.trigger, giftKey(x.gift), x.min, x.likes, x.command].join("|");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    for (const list of groups.values()) {
      const x = list[crypto.randomInt(list.length)];
      broadcast(h, { t: "sound", src: x.src.startsWith("m:") ? `/api/stream/media/${x.src.slice(2)}` : x.src, volume: x.volume, user: ctx.user?.name || "" });
    }
  }
  // comenzile de chat gata făcute: !puncte, !trimite, !roata, !ia, !comenzi
  function info(h, text) { broadcast(h, { t: "cmdinfo", text }); }
  async function builtinCommand(h, u, cmd, args) {
    const c = h.settings.commands, cur = h.settings.points.currency;
    if (!u.id) return;
    if (c.points.on && cmd === c.points.cmd) {
      const pts = await viewerPoints(h, u.id), lv = levelOf(h, pts);
      return info(h, `${u.name}: ${pts.toLocaleString("ro-RO")} ${cur} · nivelul ${lv.level} (încă ${lv.toNext.toLocaleString("ro-RO")} până la ${lv.level + 1})`);
    }
    if (c.send.on && cmd === c.send.cmd) {
      const m = /^@?(\S+)\s+(\d{1,9})/.exec(args || "");
      if (!m) return info(h, `${u.name}: scrie ${c.send.cmd} @nume suma`);
      const amount = Number(m[2]), who = m[1].toLowerCase();
      if (amount < c.send.min) return info(h, `${u.name}: poți trimite cel puțin ${c.send.min} ${cur}.`);
      const { rows } = await pool.query(`SELECT viewer, name FROM stream_points WHERE user_id = $1 AND (LOWER(viewer) = $2 OR LOWER(name) = $2) LIMIT 1`, [h.uid, who]);
      if (!rows[0]) return info(h, `${u.name}: nu-l găsesc pe ${m[1]} printre spectatori.`);
      if (rows[0].viewer === u.id) return;
      const have = await viewerPoints(h, u.id);
      if (have < amount) return info(h, `${u.name}: ai doar ${have.toLocaleString("ro-RO")} ${cur}.`);
      addPointsRaw(h, u, -amount);
      addPointsRaw(h, { id: rows[0].viewer, name: rows[0].name || rows[0].viewer }, amount);
      return info(h, `${u.name} i-a trimis ${amount.toLocaleString("ro-RO")} ${cur} lui ${rows[0].name || rows[0].viewer} 🎁`);
    }
    if (c.spin.on && cmd === c.spin.cmd) {
      if (c.spin.cost) {
        const have = await viewerPoints(h, u.id);
        if (have < c.spin.cost) return info(h, `${u.name}: roata costă ${c.spin.cost} ${cur}, ai ${have}.`);
        addPointsRaw(h, u, -c.spin.cost);
      }
      wheelSpin(h, u.name);
      return info(h, `${u.name} învârte roata! 🎡`);
    }
    if (c.drop.on && cmd === c.drop.cmd) {
      const d = h.state.drop;
      if (!d || d.until < Date.now() || d.claimed.length >= d.max || d.claimed.includes(u.id)) return;
      d.claimed.push(u.id);
      addPointsRaw(h, u, d.amount);
      info(h, `${u.name} a prins ${d.amount.toLocaleString("ro-RO")} ${cur}! (${d.claimed.length}/${d.max})`);
      return pushState(h);
    }
    if (c.list.on && cmd === c.list.cmd) {
      const own = [c.points, c.send, c.spin, c.drop].filter(x => x.on).map(x => x.cmd);
      const custom = [...new Set(h.settings.events.filter(e => e.on && e.trigger === "command").map(e => e.command + (e.cost ? ` (${e.cost})` : "")))];
      return info(h, `Comenzi: ${[...own, ...custom].join(" · ")}`);
    }
  }
  async function viewerPoints(h, viewer) {
    if (!viewer) return 0;
    const { rows } = await pool.query(`SELECT points FROM stream_points WHERE user_id = $1 AND viewer = $2`, [h.uid, viewer]);
    return Number(rows[0]?.points || 0) + Math.round(h.pointsQ.get(viewer)?.pts || 0);
  }

  function handle(h, ev) {
    h.lastEventAt = Date.now();
    const st = h.state, cfg = h.settings, u = ev.user || { id: "", name: "", avatar: "" };
    if (ev.type === "chat") {
      let tts = ttsText(h, u, ev.text);
      broadcast(h, { t: "chat", user: u, text: ev.text, tts });
      const m = /^\s*(![^\s]{1,29})\s*(.*)$/.exec(ev.text || "");
      if (m) {
        const ctx = { user: u, cmd: m[1].toLowerCase(), args: m[2].slice(0, 120) };
        fireEvents(h, "command", ctx); fireSounds(h, "command", ctx);
        if (!u.test || /^test_/.test(u.id)) builtinCommand(h, u, ctx.cmd, ctx.args).catch(() => {});
      }
      if (m && h.state.battle.running) {
        const team = cfg.battle.teams.findIndex(t => t.command && t.command === m[1].toLowerCase());
        if (team >= 0) {
          if (u.id) h.state.battle.team[u.id] = team;
          const k = u.id || u.name, last = h.battleCd.get(k) || 0;
          if (Date.now() - last > 5000) { h.battleCd.set(k, Date.now()); if (h.battleCd.size > 20000) h.battleCd.clear(); battleScore(h, team, cfg.battle.cmdPoints, u); }
        }
      }
      const last = h.chatCd.get(u.id) || 0;
      if (Date.now() - last > 10_000) { h.chatCd.set(u.id, Date.now()); addPoints(h, u, cfg.points.perChat); }
      if (h.chatCd.size > 5000) h.chatCd.clear();
      return;
    }
    if (ev.type === "gift") {
      if (!ev.final) { broadcast(h, { t: "giftcombo", user: u, gift: ev.gift, img: ev.img, count: ev.count }); return; }
      const total = ev.diamonds * ev.count;
      st.diamonds += total; st.gifts += ev.count;
      st.gifters[u.id] = 1;
      const tp = st.top[u.id] || { name: u.name, avatar: u.avatar, diamonds: 0 };
      tp.name = u.name; tp.avatar = u.avatar || tp.avatar; tp.diamonds += total;
      st.top[u.id] = tp;
      // topul nu crește la nesfârșit: păstrăm cei mai buni 300
      const ids = Object.keys(st.top);
      if (ids.length > 400) for (const [id] of Object.entries(st.top).sort((a, b) => a[1].diamonds - b[1].diamonds).slice(0, ids.length - 300)) delete st.top[id];
      if (Object.keys(st.gifters).length > 5000) st.gifters = {};
      const alert = total >= cfg.alerts.gift.min ? alertOf(h, "gift", { user: u.name, gift: ev.gift, count: ev.count, diamonds: total }, { img: ev.img, avatar: u.avatar, user: u.name }) : null;
      broadcast(h, { t: "gift", user: u, gift: ev.gift, img: ev.img, count: ev.count, diamonds: total, alert });
      const gctx = { user: u, gift: ev.gift, giftId: ev.giftId, diamonds: total, count: ev.count, img: ev.img };
      fireEvents(h, "gift", gctx); fireSounds(h, "gift", gctx);
      if (ev.giftId && !u.test) rememberGift(ev.giftId, ev.gift, ev.diamonds, ev.img);
      st.last.gifter = { name: u.name, avatar: u.avatar, gift: ev.gift, img: ev.img, count: ev.count, diamonds: total, at: Date.now() };
      if (total >= cfg.jar.min) { st.jar.push({ img: ev.img, n: Math.min(ev.count, 20), d: ev.diamonds }); if (st.jar.length > 250) st.jar.splice(0, st.jar.length - 250); }
      battleGift(h, u, ev.gift, total);
      addPoints(h, u, total * cfg.points.perDiamond);
      timerAdd(h, total * cfg.timer.perDiamond);
      if (cfg.wheel.trigger === "gift" && total >= cfg.wheel.minDiamonds) wheelSpin(h, u.name);
      pushState(h);
      return;
    }
    if (ev.type === "follow") {
      st.follows++;
      st.last.follower = { name: u.name, avatar: u.avatar, at: Date.now() };
      broadcast(h, { t: "follow", user: u, alert: alertOf(h, "follow", { user: u.name }, { avatar: u.avatar, user: u.name }) });
      fireEvents(h, "follow", { user: u }); fireSounds(h, "follow", { user: u });
      addPoints(h, u, cfg.points.perFollow);
      timerAdd(h, cfg.timer.perFollow);
      pushState(h);
      return;
    }
    if (ev.type === "share") {
      st.shares++;
      st.last.sharer = { name: u.name, avatar: u.avatar, at: Date.now() };
      broadcast(h, { t: "share", user: u, alert: alertOf(h, "share", { user: u.name }, { avatar: u.avatar, user: u.name }) });
      fireEvents(h, "share", { user: u }); fireSounds(h, "share", { user: u });
      addPoints(h, u, cfg.points.perShare);
      timerAdd(h, cfg.timer.perShare);
      pushState(h);
      return;
    }
    if (ev.type === "member") {
      broadcast(h, { t: "member", user: u, alert: alertOf(h, "member", { user: u.name }, { avatar: u.avatar, user: u.name }) });
      fireEvents(h, "member", { user: u }); fireSounds(h, "member", { user: u });
      return;
    }
    if (ev.type === "subscribe") {
      st.last.subscriber = { name: u.name, avatar: u.avatar, at: Date.now() };
      pushState(h);
      broadcast(h, { t: "subscribe", user: u });
      fireEvents(h, "subscribe", { user: u }); fireSounds(h, "subscribe", { user: u });
      return;
    }
    if (ev.type === "like") {
      const before = st.likes;
      st.likes = ev.total > st.likes ? ev.total : st.likes + ev.count;
      // puncte și timp pe like-uri: le adunăm pe fiecare spectator și dăm la fiecare 100
      if (u.id) {
        const acc = (h.likeAcc.get(u.id) || 0) + ev.count;
        const hundreds = Math.floor(acc / 100);
        h.likeAcc.set(u.id, acc % 100);
        if (hundreds) { addPoints(h, u, hundreds * cfg.points.perLikes100); timerAdd(h, hundreds * cfg.timer.perLikes100); }
        if (h.likeAcc.size > 5000) h.likeAcc.clear();
      }
      const every = cfg.alerts.likes.every;
      const reached = Math.floor(st.likes / every) * every;
      if (reached > before && reached > st.likeMilestone && reached > 0) {
        st.likeMilestone = reached;
        const alert = alertOf(h, "likes", { total: reached.toLocaleString("ro-RO") }, {});
        if (alert) broadcast(h, { t: "milestone", total: reached, alert });
      }
      broadcast(h, { t: "like", user: u, count: ev.count });
      if (u.id) {
        const b = h.likeUser.get(u.id) || 0;
        h.likeUser.set(u.id, b + ev.count);
        if (h.likeUser.size > 20000) h.likeUser.clear();
        fireEvents(h, "like", { user: u, before: b, after: b + ev.count }); fireSounds(h, "like", { user: u, before: b, after: b + ev.count });
        const lk = st.likers[u.id] || { name: u.name, avatar: u.avatar, likes: 0 };
        lk.name = u.name; lk.avatar = u.avatar || lk.avatar; lk.likes += ev.count; st.likers[u.id] = lk;
        if (Object.keys(st.likers).length > 3000) { const keep = topLikers(h).map(x => x.id); for (const id of Object.keys(st.likers)) if (!keep.includes(id)) delete st.likers[id]; }
        if (cfg.battle.likePoints && h.state.battle.running && h.state.battle.team[u.id] != null) battleScore(h, h.state.battle.team[u.id], Math.round(ev.count * cfg.battle.likePoints / 10), u);
      }
      pushState(h);
      return;
    }
    if (ev.type === "viewers") {
      st.viewers = ev.count;
      st.peakViewers = Math.max(st.peakViewers, ev.count);
      pushState(h);
    }
  }

  // ---------------------------------------------------------------- TikTok (pachet neoficial)
  const libState = { ok: null, err: "", lib: null };
  let libP = null;
  function loadLib() {
    return libP ||= import("tiktok-live-connector").then(m => {
      const pick = name => m[name] || m.default?.[name];
      const Conn = pick("TikTokLiveConnection") || pick("WebcastPushConnection");
      if (!Conn) throw new Error("Pachetul tiktok-live-connector nu are clasa de conectare așteptată.");
      libState.ok = true; libState.lib = Conn;
      return Conn;
    }).catch(err => {
      libState.ok = false; libState.err = err.message;
      libP = null;   // poate apare la următorul deploy; nu reîncercăm în buclă
      throw err;
    });
  }
  loadLib().catch(err => console.warn("Studio de streaming: legătura cu TikTok LIVE nu e disponibilă:", err.message));

  // TikTok schimbă des forma datelor între versiuni — citim prudent ambele variante
  const first = (...xs) => xs.find(x => x !== undefined && x !== null && x !== "");
  const urlOf = p => {
    if (!p) return "";
    if (typeof p === "string") return p;
    const list = p.url || p.urls || p.urlList || p.url_list || p.urlListList;
    return Array.isArray(list) ? String(list[0] || "") : "";
  };
  function nUser(d) {
    const u = d?.user || d || {};
    const id = String(first(u.uniqueId, u.unique_id, d?.uniqueId, u.userId, d?.userId, "") || "").slice(0, 60);
    const name = String(first(u.nickname, d?.nickname, id, "spectator")).replace(/[\u0000-\u001f]/g, "").slice(0, 40);
    const avatar = first(u.profilePictureUrl, d?.profilePictureUrl, urlOf(u.profilePicture), urlOf(u.avatarThumb), "");
    return { id, name, avatar: /^https:\/\//.test(avatar) ? avatar.slice(0, 600) : "" };
  }
  function nGift(d) {
    const g = d.giftDetails || d.gift || {}, ex = d.extendedGiftInfo || {};
    const type = Number(first(d.giftType, g.giftType, g.type, ex.type, 0));
    const count = Math.max(1, Number(first(d.repeatCount, d.comboCount, 1)) || 1);
    const ended = Boolean(Number(first(d.repeatEnd, d.repeat_end, 0)));
    const img = first(d.giftPictureUrl, urlOf(g.giftImage?.giftPictureUrl), urlOf(g.giftImage), urlOf(g.image), urlOf(g.icon), urlOf(ex.image), urlOf(ex.icon), "");
    return {
      type: "gift", user: nUser(d), giftId: Number(first(d.giftId, g.id, g.giftId, ex.id, 0)) || 0,
      gift: String(first(d.giftName, g.giftName, g.name, ex.name, "cadou")).slice(0, 40),
      img: /^https:\/\//.test(img) ? img.slice(0, 600) : "",
      diamonds: Math.max(0, Number(first(d.diamondCount, g.diamondCount, g.diamond_count, ex.diamond_count, 0)) || 0),
      count,
      // cadourile „în serie" (tip 1) vin de mai multe ori; numărăm doar la sfârșitul seriei
      final: type !== 1 || ended,
    };
  }

  function setStatus(h, status, msg = "") {
    if (h.status === status && h.statusMsg === msg) return;
    h.status = status; h.statusMsg = msg;
    broadcast(h, { t: "status", ...statusView(h) });
  }
  function scheduleRetry(h, ms) {
    clearTimeout(h.retryT);
    if (!h.wanted) return;
    if (Date.now() - h.wantedSince > GIVE_UP_AFTER_MS && Date.now() - h.lastEventAt > GIVE_UP_AFTER_MS) {
      h.wanted = false;
      setStatus(h, "off", "Am oprit încercările: n-a fost niciun live în ultimele 3 ore. Apasă din nou pe Conectează când intri live.");
      return;
    }
    h.retryT = setTimeout(() => connect(h).catch(() => {}), ms);
  }
  function dropConn(h) {
    const c = h.conn;
    h.conn = null;
    if (c) { try { c.removeAllListeners?.(); } catch { /* */ } try { c.disconnect?.(); } catch { /* */ } }
  }
  const liveCount = () => [...hubs.values()].filter(x => x.conn).length;

  async function connect(h) {
    if (!h.wanted) return;
    let Conn;
    try { Conn = await loadLib(); }
    catch { setStatus(h, "error", "Legătura cu TikTok LIVE nu e încă instalată pe server. Alertele de test și overlay-urile merg deja."); h.wanted = false; return; }
    if (!h.conn && liveCount() >= MAX_CONNECTIONS) { setStatus(h, "error", "Prea mulți streameri conectați acum. Încearcă din nou în câteva minute."); scheduleRetry(h, 5 * 60_000); return; }
    dropConn(h);
    const gen = ++h.gen;
    const opts = { processInitialData: false, enableExtendedGiftInfo: true, fetchRoomInfoOnConnect: true };
    if (process.env.EULER_API_KEY) opts.signApiKey = process.env.EULER_API_KEY;
    let c;
    try { c = new Conn(h.tiktok, opts); }
    catch (err) { setStatus(h, "error", "Nu am putut porni conexiunea: " + err.message); h.wanted = false; return; }
    h.conn = c;
    setStatus(h, "connecting", `Mă conectez la @${h.tiktok}…`);
    const on = (name, fn) => c.on(name, d => { if (gen !== h.gen) return; try { fn(d || {}); } catch (err) { console.error("Studio: eveniment", name, err.message); } });
    on("chat", d => handle(h, { type: "chat", user: nUser(d), text: String(first(d.comment, d.content, "")).slice(0, 300) }));
    on("gift", d => handle(h, nGift(d)));
    on("like", d => handle(h, { type: "like", user: nUser(d), count: Math.max(1, Number(first(d.likeCount, d.count, 1)) || 1), total: Number(first(d.totalLikeCount, d.total, 0)) || 0 }));
    on("follow", d => handle(h, { type: "follow", user: nUser(d) }));
    on("share", d => handle(h, { type: "share", user: nUser(d) }));
    on("member", d => handle(h, { type: "member", user: nUser(d) }));
    on("subscribe", d => handle(h, { type: "subscribe", user: nUser(d) }));
    on("roomUser", d => handle(h, { type: "viewers", count: Math.max(0, Number(first(d.viewerCount, d.totalUser, d.total, 0)) || 0) }));
    const lost = why => {
      if (gen !== h.gen) return;
      dropConn(h);
      setStatus(h, h.wanted ? "waiting" : "off", h.wanted ? `${why} Încerc din nou singur.` : why);
      scheduleRetry(h, 30_000);
    };
    on("streamEnd", () => lost("Live-ul s-a terminat."));
    on("disconnected", () => lost("Legătura cu TikTok s-a întrerupt."));
    on("error", d => console.warn(`Studio @${h.tiktok}:`, d?.info || d?.message || d?.exception?.message || "eroare"));
    try {
      const state = await Promise.race([c.connect(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 30_000))]);
      if (gen !== h.gen) return;
      h.roomId = state?.roomId || null;
      h.lastEventAt = Date.now();
      setStatus(h, "live", `Conectat la live-ul lui @${h.tiktok}.`);
      loadGiftCatalog(c).catch(() => {});
    } catch (err) {
      if (gen !== h.gen) return;
      dropConn(h);
      const m = String(err?.message || err || "");
      const offline = /offline|not.*live|isn.t online|live has ended|LIVE_NOT_FOUND|user_not_found|19881007|room ?id/i.test(m);
      const limited = /rate|limit|429|captcha|sign/i.test(m);
      setStatus(h, "waiting", offline ? `@${h.tiktok} nu e live acum. Te conectez singur când pornești live-ul.`
        : limited ? "TikTok ne limitează conexiunile acum. Încerc din nou peste câteva minute."
        : m === "timeout" ? "TikTok nu a răspuns. Încerc din nou." : "Nu m-am putut conecta. Încerc din nou.");
      scheduleRetry(h, limited ? 5 * 60_000 : RETRY_OFFLINE_MS);
    }
  }
  function stop(h, msg = "Deconectat.") {
    h.wanted = false;
    clearTimeout(h.retryT);
    h.gen++;
    dropConn(h);
    setStatus(h, "off", msg);
  }

  // ---------------------------------------------------------------- simulator (Studio → „Testează")
  const TEST_NAMES = ["Andrei_md", "Cristina.22", "Vlad_Chisinau", "Mihaela", "Dorin_RP", "Ionela.b", "Sasha_77", "Nicu_Balti"];
  const TEST_GIFTS = [["Trandafir", 1], ["TikTok", 1], ["Inimă cu degete", 5], ["Gogoașă", 30], ["Confetti", 100], ["Leu", 29999], ["Univers", 44999]];
  function testEvent(h, type, opts = {}) {
    const nm = TEST_NAMES[crypto.randomInt(TEST_NAMES.length)];
    const user = { id: "test_" + nm.toLowerCase(), name: nm, avatar: "", test: true };
    if (type === "gift") {
      const g = opts.gift != null ? TEST_GIFTS[clampN(opts.gift, 0, TEST_GIFTS.length - 1, 0)] : TEST_GIFTS[crypto.randomInt(5)];
      handle(h, { type: "gift", user, gift: g[0], img: "", diamonds: g[1], count: clampN(opts.count, 1, 99, 1 + crypto.randomInt(3)), final: true });
    } else if (type === "chat") handle(h, { type: "chat", user, text: str(opts.text, 200) || ["Salut din Chișinău! 👋", "!tts Ce live frumos azi", "Bravo, continuă tot așa!", "De unde ești?"][crypto.randomInt(4)] });
    else if (type === "like") handle(h, { type: "like", user, count: clampN(opts.count, 1, 5000, 50), total: 0 });
    else if (type === "viewers") handle(h, { type: "viewers", count: 20 + crypto.randomInt(300) });
    else if (["follow", "share", "member", "subscribe"].includes(type)) handle(h, { type, user });
  }

  // ---------------------------------------------------------------- acces
  const keyNew = () => crypto.randomBytes(18).toString("base64url");
  async function dbRole(uid) {
    const { rows } = await pool.query(`SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [uid]);
    return rows[0]?.name || null;
  }
  const cleanTiktok = v => String(v || "").trim().replace(/^https?:\/\/(www\.|m\.)?tiktok\.com\//i, "").replace(/^@/, "").split(/[/?#\s]/)[0];

  async function myProfile(uid) {
    await tables();
    const { rows } = await pool.query(`SELECT * FROM stream_profiles WHERE user_id = $1`, [uid]);
    return rows[0] || null;
  }
  async function requireApproved(req, res) {
    const h = await loadHub(req.user.sub);
    if (!h) { res.status(403).json({ error: "Studio-ul e doar pentru streamerii aprobați. Cere acces din pagina Studio." }); return null; }
    return h;
  }

  // ---------------------------------------------------------------- rute pentru streamer
  app.get("/api/stream/me", auth, asyncRoute(async (req, res) => {
    let p = await myProfile(req.user.sub);
    const role = await dbRole(req.user.sub);
    // rangul „streamer" de pe site are acces direct, fără cerere
    if (role === "streamer" && (!p || p.status === "pending")) {
      if (!p) {
        res.json({ status: "none", autoApprove: true, lib: libState.ok });
        return;
      }
      await pool.query(`UPDATE stream_profiles SET status = 'approved', overlay_key = COALESCE(overlay_key, $2), decided_at = NOW(), updated_at = NOW() WHERE user_id = $1`, [req.user.sub, keyNew()]);
      p = await myProfile(req.user.sub);
    }
    if (!p) return res.json({ status: "none", lib: libState.ok });
    if (p.status !== "approved") return res.json({ status: p.status, tiktok: p.tiktok, note: p.note, createdAt: p.created_at, lib: libState.ok });
    const h = await loadHub(req.user.sub);
    res.json({
      status: "approved", tiktok: h.tiktok, key: h.key, settings: h.settings, state: snapshot(h), live: statusView(h),
      points: await pointsTop(h.uid, 10).catch(() => []), lib: libState.ok, defaults: normalizeSettings({}),
    });
  }));

  const reqHits = new Map();
  app.post("/api/stream/cerere", auth, asyncRoute(async (req, res) => {
    const now = Date.now(), last = reqHits.get(req.user.sub) || 0;
    if (now - last < 10_000) return res.status(429).json({ error: "Așteaptă câteva secunde și încearcă din nou." });
    reqHits.set(req.user.sub, now);
    const tiktok = cleanTiktok(req.body?.tiktok);
    if (!TIKTOK_RE.test(tiktok)) return res.status(400).json({ error: "Scrie numele tău de TikTok, de exemplu @nume_streamer (litere, cifre, punct și _)." });
    const motiv = str(req.body?.motiv, 600);
    const p = await myProfile(req.user.sub);
    if (p?.status === "approved") return res.status(400).json({ error: "Ai deja acces la Studio." });
    if (p?.status === "revoked") return res.status(403).json({ error: "Accesul tău la Studio a fost retras. Scrie-ne pe Discord, la Tichete." });
    if (p?.status === "pending" && p.tiktok === tiktok && (p.motiv || "") === motiv) return res.json({ ok: true, status: "pending" });
    const role = await dbRole(req.user.sub);
    const status = role === "streamer" ? "approved" : "pending";
    await pool.query(
      `INSERT INTO stream_profiles(user_id, tiktok, motiv, status, overlay_key) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET tiktok = EXCLUDED.tiktok, motiv = EXCLUDED.motiv, status = EXCLUDED.status, note = NULL,
         overlay_key = COALESCE(stream_profiles.overlay_key, EXCLUDED.overlay_key), created_at = NOW(), updated_at = NOW()`,
      [req.user.sub, tiktok, motiv || null, status, keyNew()]);
    await logAction(req.user.sub, "stream.request", "stream_profiles", req.user.sub, { tiktok, status }, req.ip);
    res.json({ ok: true, status });
  }));

  app.put("/api/stream/setari", auth, asyncRoute(async (req, res) => {
    const h = await requireApproved(req, res); if (!h) return;
    const s = normalizeSettings(req.body?.settings || {});
    // fișierele din acțiuni trebuie să fie ale streamerului; tipul (imagine/clip/sunet) îl știe serverul
    const refs = [...new Set([...s.actions.flatMap(a => [a.media, a.audio]), ...s.sounds.list.filter(x => x.src.startsWith("m:")).map(x => x.src.slice(2))].filter(Boolean))];
    const kinds = new Map();
    if (refs.length) {
      const { rows } = await pool.query(`SELECT id::text AS id, kind FROM stream_media WHERE user_id = $1 AND id = ANY($2::uuid[])`, [h.uid, refs]);
      rows.forEach(r => kinds.set(r.id, r.kind));
    }
    for (const a of s.actions) {
      a.mediaKind = kinds.get(a.media) || null; if (!a.mediaKind) a.media = null;
      if (a.audio && kinds.get(a.audio) !== "audio") a.audio = null;
    }
    for (const x of s.sounds.list) if (x.src.startsWith("m:") && !["audio", "video"].includes(kinds.get(x.src.slice(2)))) x.src = "s:coin";
    const tiktok = req.body?.tiktok != null ? cleanTiktok(req.body.tiktok) : h.tiktok;
    if (!TIKTOK_RE.test(tiktok)) return res.status(400).json({ error: "Numele de TikTok nu e valid." });
    await pool.query(`UPDATE stream_profiles SET settings = $2, tiktok = $3, updated_at = NOW() WHERE user_id = $1`, [h.uid, JSON.stringify(s), tiktok]);
    const changedUser = tiktok !== h.tiktok;
    h.settings = s; h.tiktok = tiktok;
    broadcast(h, { t: "settings", settings: s });
    if (changedUser && h.wanted) { stop(h, "Ai schimbat contul de TikTok."); }
    res.json({ ok: true, settings: s, tiktok });
  }));

  app.post("/api/stream/conectare", auth, asyncRoute(async (req, res) => {
    const h = await requireApproved(req, res); if (!h) return;
    h.wanted = true; h.wantedSince = Date.now(); h.lastEventAt = 0;
    setStatus(h, "connecting", `Mă conectez la @${h.tiktok}…`);
    connect(h).catch(err => console.error("Studio connect:", err.message));
    res.json({ ok: true, live: statusView(h) });
  }));
  app.post("/api/stream/deconectare", auth, asyncRoute(async (req, res) => {
    const h = await requireApproved(req, res); if (!h) return;
    stop(h);
    res.json({ ok: true, live: statusView(h) });
  }));

  const testHits = new Map();
  app.post("/api/stream/test", auth, asyncRoute(async (req, res) => {
    const h = await requireApproved(req, res); if (!h) return;
    const now = Date.now(), list = (testHits.get(h.uid) || []).filter(t => now - t < 10_000);
    if (list.length >= 15) return res.status(429).json({ error: "Prea multe teste deodată. Mai așteaptă puțin." });
    list.push(now); testHits.set(h.uid, list);
    const type = String(req.body?.type || "");
    if (!["gift", "chat", "follow", "share", "like", "member", "viewers", "subscribe"].includes(type)) return res.status(400).json({ error: "Tip de test necunoscut." });
    testEvent(h, type, req.body || {});
    res.json({ ok: true });
  }));

  app.post("/api/stream/actiune", auth, asyncRoute(async (req, res) => {
    const h = await requireApproved(req, res); if (!h) return;
    const a = String(req.body?.action || "");
    if (a === "wheel") { if (!wheelSpin(h, str(req.body?.by, 40, "streamer"))) return res.status(429).json({ error: "Sunt deja 20 de învârtiri la rând." }); }
    else if (a.startsWith("timer-")) timerAction(h, a.slice(6), req.body?.minutes);
    else if (a === "session-new") {
      const keepTimer = h.state.timer;
      h.state = emptyState(); h.state.timer = keepTimer;
      h.likeAcc.clear(); h.likeUser.clear();
      clearTimeout(h.battleT);
      pushState(h);
      broadcast(h, { t: "reset" });
    } else if (a.startsWith("battle-")) {
      battleAction(h, a.slice(7));
    } else if (a === "drop-start") {
      const amount = Math.round(clampN(req.body?.amount, 1, 1_000_000, 100)), max = Math.round(clampN(req.body?.max, 1, 1000, 10)), sec = Math.round(clampN(req.body?.seconds, 10, 600, 60));
      h.state.drop = { amount, max, until: Date.now() + sec * 1000, claimed: [] };
      info(h, `🎁 Ploaie de ${h.settings.points.currency}! Primii ${max} care scriu ${h.settings.commands.drop.cmd} primesc ${amount.toLocaleString("ro-RO")}.`);
      pushState(h);
    } else if (a === "drop-stop") {
      h.state.drop = null; pushState(h);
    } else if (a === "likeathon-reset") {
      h.state.likers = {}; pushState(h);
    } else if (a === "sound-test") {
      const x = h.settings.sounds.list.find(y => y.id === String(req.body?.id || ""));
      if (!x) return res.status(404).json({ error: "Salvează întâi sunetul." });
      broadcast(h, { t: "sound", src: x.src.startsWith("m:") ? `/api/stream/media/${x.src.slice(2)}` : x.src, volume: x.volume, user: "test" });
    } else if (a === "jar-reset") {
      h.state.jar = []; pushState(h); broadcast(h, { t: "jar-reset" });
    } else if (a === "points-reset") {
      h.pointsQ.clear();
      await pool.query(`DELETE FROM stream_points WHERE user_id = $1`, [h.uid]);
      broadcast(h, { t: "points", list: [] });
    } else if (a === "test-alert-clear") broadcast(h, { t: "clear" });
    else if (a === "run") {
      // „Testează" la o acțiune
      const act = h.settings.actions.find(x => x.id === String(req.body?.id || ""));
      if (!act) return res.status(404).json({ error: "Salvează întâi acțiunea, apoi testeaz-o." });
      runAction(h, act, { user: { id: "", name: "Spectator_test", avatar: "", test: true }, gift: "Trandafir", count: 1, diamonds: 1, args: "mesaj de test" });
    } else if (a === "event-test") {
      // „Testează" la un eveniment: ca și cum s-ar fi întâmplat acum (fără pauză între ele)
      const e = h.settings.events.find(x => x.id === String(req.body?.id || ""));
      if (!e) return res.status(404).json({ error: "Salvează întâi evenimentul, apoi testează-l." });
      if (!runEvent(h, e, { user: { id: "", name: "Spectator_test", avatar: "", test: true }, gift: e.gift || "Trandafir", count: 1, diamonds: Math.max(1, e.min), args: "mesaj de test" })) return res.status(400).json({ error: "Evenimentul nu are nicio acțiune aleasă." });
    }
    else return res.status(400).json({ error: "Acțiune necunoscută." });
    res.json({ ok: true, state: snapshot(h) });
  }));

  app.post("/api/stream/cheie-noua", auth, asyncRoute(async (req, res) => {
    const h = await requireApproved(req, res); if (!h) return;
    const key = keyNew();
    await pool.query(`UPDATE stream_profiles SET overlay_key = $2, updated_at = NOW() WHERE user_id = $1`, [h.uid, key]);
    if (h.key) keyToUid.delete(h.key);
    h.key = key; keyToUid.set(key, h.uid);
    for (const r of h.clients) { send(r, { t: "revoked" }); try { r.end(); } catch { /* */ } }
    h.clients.clear();
    await logAction(req.user.sub, "stream.new_key", "stream_profiles", h.uid, {}, req.ip);
    res.json({ ok: true, key });
  }));

  // ---------------------------------------------------------------- fișierele streamerului (clipuri, imagini, muzică)
  // Stau în baza de date (Railway nu păstrează fișierele de pe disc între deploy-uri).
  // Tipul îl aflăm din primii octeți ai fișierului, nu din ce spune browserul.
  const MEDIA_MAX = 15 * 1024 * 1024, MEDIA_QUOTA = 120 * 1024 * 1024, MEDIA_FILES = 80;
  function sniff(b) {
    const hex = b.subarray(0, 12).toString("hex"), asc = b.subarray(0, 12).toString("latin1");
    if (hex.startsWith("89504e470d0a1a0a")) return { kind: "image", mime: "image/png" };
    if (hex.startsWith("ffd8ff")) return { kind: "image", mime: "image/jpeg" };
    if (asc.startsWith("GIF87a") || asc.startsWith("GIF89a")) return { kind: "image", mime: "image/gif" };
    if (asc.startsWith("RIFF") && asc.slice(8, 12) === "WEBP") return { kind: "image", mime: "image/webp" };
    if (asc.slice(4, 8) === "ftyp") return /^(M4A |M4B )/.test(asc.slice(8, 12)) ? { kind: "audio", mime: "audio/mp4" } : { kind: "video", mime: "video/mp4" };
    if (hex.startsWith("1a45dfa3")) return { kind: "video", mime: "video/webm" };
    if (asc.startsWith("ID3") || /^ff(fb|f3|f2|fa)/.test(hex)) return { kind: "audio", mime: "audio/mpeg" };
    if (asc.startsWith("OggS")) return { kind: "audio", mime: "audio/ogg" };
    if (asc.startsWith("RIFF") && asc.slice(8, 12) === "WAVE") return { kind: "audio", mime: "audio/wav" };
    return null;
  }
  const rawBody = require("express").raw({ type: () => true, limit: MEDIA_MAX + 1024 });
  const rawUpload = (req, res, next) => rawBody(req, res, err => err ? res.status(413).json({ error: "Fișierul e prea mare. Maxim 15 MB." }) : next());
  const upHits = new Map();
  app.post("/api/stream/media", auth, asyncRoute(async (req, res, next) => {
    // verificăm accesul înainte să primim tot fișierul
    const h = await requireApproved(req, res); if (!h) return;
    const now = Date.now(), list = (upHits.get(h.uid) || []).filter(t => now - t < 60_000);
    if (list.length >= 20) return res.status(429).json({ error: "Prea multe fișiere într-un minut." });
    list.push(now); upHits.set(h.uid, list);
    req.studioHub = h;
    next();
  }), rawUpload, asyncRoute(async (req, res) => {
    const h = req.studioHub, buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: "Alege un fișier." });
    if (buf.length > MEDIA_MAX) return res.status(413).json({ error: "Fișierul e prea mare. Maxim 15 MB." });
    const t = sniff(buf);
    if (!t) return res.status(415).json({ error: "Tipul fișierului nu e acceptat. Merg: PNG, JPG, GIF, WEBP, MP4, WEBM, MP3, OGG, WAV." });
    const { rows: [q] } = await pool.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(bytes), 0)::bigint AS used FROM stream_media WHERE user_id = $1`, [h.uid]);
    if (q.n >= MEDIA_FILES) return res.status(400).json({ error: `Ai deja ${MEDIA_FILES} fișiere. Șterge din cele vechi.` });
    if (Number(q.used) + buf.length > MEDIA_QUOTA) return res.status(400).json({ error: "Nu mai ai loc (maxim 120 MB în total). Șterge din fișierele vechi." });
    let name = String(req.get("x-file-name") || "");
    try { name = decodeURIComponent(name); } catch { /* */ }
    name = str(name, 120, t.kind === "audio" ? "sunet" : t.kind === "video" ? "clip" : "imagine");
    const id = crypto.randomUUID();
    await pool.query(`INSERT INTO stream_media(id, user_id, name, kind, mime, bytes, data) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, h.uid, name, t.kind, t.mime, buf.length, buf]);
    res.json({ ok: true, item: { id, name, kind: t.kind, mime: t.mime, bytes: buf.length } });
  }));
  app.get("/api/stream/media", auth, asyncRoute(async (req, res) => {
    const h = await requireApproved(req, res); if (!h) return;
    const { rows } = await pool.query(`SELECT id::text AS id, name, kind, mime, bytes, created_at FROM stream_media WHERE user_id = $1 ORDER BY created_at DESC`, [h.uid]);
    res.json({ items: rows.map(r => ({ ...r, bytes: Number(r.bytes) })), used: rows.reduce((x, r) => x + Number(r.bytes), 0), quota: MEDIA_QUOTA, maxFile: MEDIA_MAX, maxFiles: MEDIA_FILES });
  }));
  const mediaCache = new Map(); let mediaCacheBytes = 0;
  app.delete("/api/stream/media/:id", auth, asyncRoute(async (req, res) => {
    const h = await requireApproved(req, res); if (!h) return;
    const id = mediaRef(req.params.id);
    if (!id) return res.status(400).json({ error: "Fișier necunoscut." });
    const { rowCount } = await pool.query(`DELETE FROM stream_media WHERE id = $1 AND user_id = $2`, [id, h.uid]);
    if (!rowCount) return res.status(404).json({ error: "Fișierul nu există." });
    const c = mediaCache.get(id); if (c) { mediaCacheBytes -= c.data.length; mediaCache.delete(id); }
    res.json({ ok: true });
  }));
  // servit public (id-ul e aleator, ca un link secret), cu cache lung și „Range" pentru clipuri
  app.get("/api/stream/media/:id", asyncRoute(async (req, res) => {
    const id = mediaRef(req.params.id);
    if (!id) return res.status(404).end();
    let m = mediaCache.get(id);
    if (!m) {
      await tables();
      const { rows } = await pool.query(`SELECT mime, data FROM stream_media WHERE id = $1`, [id]);
      if (!rows[0]) return res.status(404).end();
      m = { mime: rows[0].mime, data: rows[0].data };
      mediaCache.set(id, m); mediaCacheBytes += m.data.length;
      while (mediaCacheBytes > 150 * 1024 * 1024 && mediaCache.size > 1) { const [k, v] = mediaCache.entries().next().value; mediaCache.delete(k); mediaCacheBytes -= v.data.length; }
    } else { mediaCache.delete(id); mediaCache.set(id, m); }
    const etag = `"${id}"`;
    res.set({ "Content-Type": m.mime, "Cache-Control": "public, max-age=31536000, immutable", ETag: etag, "Accept-Ranges": "bytes" });
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    const total = m.data.length, r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (r && (r[1] || r[2])) {
      let start = r[1] ? Number(r[1]) : total - Number(r[2]), end = r[1] && r[2] ? Number(r[2]) : total - 1;
      if (!r[1]) end = total - 1;
      if (start < 0) start = 0;
      if (start >= total || end < start) { res.set("Content-Range", `bytes */${total}`); return res.status(416).end(); }
      end = Math.min(end, total - 1);
      res.status(206).set({ "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) });
      return res.end(m.data.subarray(start, end + 1));
    }
    res.set("Content-Length", String(total));
    res.end(m.data);
  }));

  // ---------------------------------------------------------------- catalogul de cadouri TikTok
  // Se umple singur: din lista pe care o dă TikTok la conectare și din cadourile primite pe live.
  const knownGifts = new Map();
  let giftsCache = null, giftsCacheAt = 0;
  function rememberGift(id, name, diamonds, img) {
    if (!id || !name) return;
    const k = knownGifts.get(id);
    if (k && k.name === name && (k.img || !img)) return;
    knownGifts.set(id, { name, img });
    tables().then(() => pool.query(
      `INSERT INTO stream_gifts(id, name, diamonds, img) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, diamonds = EXCLUDED.diamonds, img = COALESCE(EXCLUDED.img, stream_gifts.img), updated_at = NOW()`,
      [id, String(name).slice(0, 80), Math.max(0, Math.round(diamonds || 0)), img || null])).then(() => { giftsCache = null; }).catch(() => {});
  }
  let catalogLoadedAt = 0;
  async function loadGiftCatalog(c) {
    if (Date.now() - catalogLoadedAt < 6 * 3600_000) return;
    const fn = c.fetchAvailableGifts || c.getAvailableGifts;
    if (typeof fn !== "function") return;
    const list = await fn.call(c);
    if (!Array.isArray(list) || !list.length) return;
    catalogLoadedAt = Date.now();
    const rows = list.map(g => ({ id: Number(first(g.id, g.giftId, 0)) || 0, name: String(first(g.name, g.giftName, "")).slice(0, 80), diamonds: Number(first(g.diamond_count, g.diamondCount, 0)) || 0, img: urlOf(g.image) || urlOf(g.icon) || null }))
      .filter(g => g.id && g.name).slice(0, 2000);
    if (!rows.length) return;
    await tables();
    await pool.query(
      `INSERT INTO stream_gifts(id, name, diamonds, img)
       SELECT * FROM UNNEST($1::bigint[], $2::text[], $3::int[], $4::text[])
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, diamonds = EXCLUDED.diamonds, img = COALESCE(EXCLUDED.img, stream_gifts.img), updated_at = NOW()`,
      [rows.map(g => g.id), rows.map(g => g.name), rows.map(g => g.diamonds), rows.map(g => /^https:\/\//.test(g.img || "") ? g.img : null)]);
    giftsCache = null;
  }
  // lista de cadouri și fără live: cerem catalogul TikTok cu numele streamerului (fără conectare)
  let standaloneAt = 0;
  async function catalogWithoutLive(username) {
    if (Date.now() - standaloneAt < 3600_000) return;
    standaloneAt = Date.now();
    let Conn; try { Conn = await loadLib(); } catch { return; }
    const opts = { processInitialData: false, enableExtendedGiftInfo: true };
    if (process.env.EULER_API_KEY) opts.signApiKey = process.env.EULER_API_KEY;
    try { const c = new Conn(username, opts); catalogLoadedAt = 0; await loadGiftCatalog(c); try { c.disconnect?.(); } catch { /* */ } }
    catch (err) { console.warn("Studio: catalogul de cadouri nu s-a putut lua fără live:", err.message); }
  }
  app.get("/api/stream/cadouri", auth, asyncRoute(async (req, res) => {
    if (giftsCache && giftsCache.length < 30) { const h = hubs.get(req.user.sub); if (h?.tiktok) catalogWithoutLive(h.tiktok).catch(() => {}); }
    if (!giftsCache || Date.now() - giftsCacheAt > 300_000) {
      await tables();
      const { rows } = await pool.query(`SELECT id::text AS id, name, diamonds, img FROM stream_gifts ORDER BY diamonds, name LIMIT 2000`);
      giftsCache = rows; giftsCacheAt = Date.now();
    }
    res.json({ gifts: giftsCache });
  }));

  // ---------------------------------------------------------------- overlay-uri (fără cont, cu cheia)
  async function hubByKey(key) {
    if (!/^[\w-]{16,64}$/.test(key)) return null;
    let uid = keyToUid.get(key);
    if (!uid) {
      await tables();
      const { rows } = await pool.query(`SELECT user_id FROM stream_profiles WHERE overlay_key = $1 AND status = 'approved'`, [key]);
      uid = rows[0]?.user_id;
      if (!uid) return null;
    }
    const h = await loadHub(uid);
    return h && h.key === key ? h : null;
  }

  app.get("/api/stream/live/:key", asyncRoute(async (req, res) => {
    const h = await hubByKey(String(req.params.key || ""));
    if (!h) return res.status(404).json({ error: "Cheia overlay-ului nu e validă. Ia linkul nou din Studio." });
    if (h.clients.size >= MAX_CLIENTS_PER_STREAMER) return res.status(429).json({ error: "Prea multe overlay-uri deschise deodată." });
    res.set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" });
    res.flushHeaders?.();
    res.write("retry: 3000\n\n");
    h.clients.add(res);
    send(res, { t: "hello", settings: h.settings, state: snapshot(h), jar: h.state.jar, live: statusView(h), points: await pointsTop(h.uid, 10).catch(() => []), tiktok: h.tiktok });
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* */ } }, 20_000);
    req.on("close", () => { clearInterval(ping); h.clients.delete(res); });
  }));

  // ---------------------------------------------------------------- administrare
  app.get("/api/admin/streameri", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (_req, res) => {
    await tables();
    const { rows } = await pool.query(
      `SELECT sp.user_id, sp.tiktok, sp.motiv, sp.status, sp.note, sp.created_at, sp.decided_at,
              u.username, u.discord_username, r.name AS role, d.username AS decided_by_name
       FROM stream_profiles sp JOIN users u ON u.id = sp.user_id JOIN roles r ON r.id = u.role_id
       LEFT JOIN users d ON d.id = sp.decided_by
       ORDER BY (sp.status = 'pending') DESC, sp.created_at DESC LIMIT 500`);
    res.json({
      lib: libState.ok, libError: libState.ok === false ? libState.err : null,
      streamers: rows.map(r => {
        const h = hubs.get(r.user_id);
        return { ...r, live: h ? { status: h.status, overlays: h.clients.size } : null };
      }),
    });
  }));

  app.put("/api/admin/streameri/:uid", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
    const uid = String(req.params.uid || "");
    if (!/^[0-9a-f-]{36}$/i.test(uid)) return res.status(400).json({ error: "Cont invalid." });
    const status = String(req.body?.status || "");
    if (!["approved", "rejected", "revoked", "pending"].includes(status)) return res.status(400).json({ error: "Stare invalidă." });
    const note = str(req.body?.note, 300) || null;
    await tables();
    const { rows } = await pool.query(
      `UPDATE stream_profiles SET status = $2::text, note = $3, decided_by = $4, decided_at = NOW(), updated_at = NOW(),
              overlay_key = CASE WHEN $2::text = 'approved' THEN COALESCE(overlay_key, $5) ELSE $5 END
       WHERE user_id = $1 RETURNING tiktok`, [uid, status, note, req.user.sub, keyNew()]);
    if (!rows[0]) return res.status(404).json({ error: "Cererea nu există." });
    const h = hubs.get(uid);
    if (h && status !== "approved") {
      stop(h, "Accesul la Studio a fost oprit.");
      for (const r of h.clients) { send(r, { t: "revoked" }); try { r.end(); } catch { /* */ } }
      hubs.delete(uid); if (h.key) keyToUid.delete(h.key);
    }
    await logAction(req.user.sub, "stream.decide", "stream_profiles", uid, { status, note, tiktok: rows[0].tiktok }, req.ip);
    if (status === "approved") notifyUser(uid, { type: "studio", title: "🎥 Ai acces la Studio de streaming", message: "Cererea ta a fost aprobată. Intră în Studio, conectează-ți TikTok-ul și pune overlay-urile în TikTok LIVE Studio sau OBS.", link: "/streamer.html", external: true, emailFallback: false, dedupeKey: `studio-ok-${uid}` }).catch(() => {});
    if (status === "rejected") notifyUser(uid, { type: "studio", title: "Cererea pentru Studio a fost respinsă", message: note ? `Motiv: ${note}` : "Poți încerca din nou mai târziu.", link: "/streamer.html", external: true, emailFallback: false, dedupeKey: `studio-no-${uid}-${Date.now()}` }).catch(() => {});
    res.json({ ok: true });
  }));

  // la oprirea serverului (deploy), salvăm ce avem
  const onExit = async () => { for (const h of hubs.values()) { await flushPoints(h); await saveState(h); } };
  process.once("SIGTERM", () => { onExit().finally(() => process.exit(0)); });

  return { hubs, normalizeSettings, handle, _test: { nGift, nUser, ttsText, loadHub, testEvent } };
};
