require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..")));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function signUser(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role_name },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Neautentificat" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token invalid sau expirat" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Acces interzis" });
    next();
  };
}

const MOD_ROLES = ["moderator", "admin", "co-fondator", "owner"];
const ADMIN_ROLES = ["admin", "co-fondator", "owner"];
// Rang nou, aproape de owner — acces la tot ce are admin, plus secțiunea
// txAdmin (foarte sensibilă: control total pe serverul de joc). Schimbarea
// rangurilor rămâne totuși restricționată strict la owner (vezi mai jos),
// ca un co-fondator să nu poată promova pe altcineva la owner/co-fondator
// fără acordul proprietarului contului.
const FOUNDER_ROLES = ["co-fondator", "owner"];

async function logAction(actorId, action, entityType, entityId, metadata, ip) {
  await pool.query(
    "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,ip) VALUES($1,$2,$3,$4,$5,$6)",
    [actorId, action, entityType, entityId ?? null, metadata ? JSON.stringify(metadata) : null, ip || null]
  );
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query("SELECT NOW() AS time");
  res.json({ ok: true, service: "moldova-rp-api", database: "online", time: rows[0].time });
}));

// Live FiveM server status. The game server only serves its info/players
// endpoints over plain HTTP, so the browser can't call it directly from our
// HTTPS site (mixed-content is blocked) — this backend fetches it server-side
// instead and exposes the numbers over our own HTTPS API. Cached briefly so a
// burst of homepage visits doesn't hammer the game server on every load, and
// falls back to the last known-good reading (marked stale) if the server is
// temporarily unreachable, so the homepage doesn't flash to zero.
const FIVEM_ADDRESS = process.env.FIVEM_SERVER_ADDRESS || "104.167.24.67:30120";
const FIVEM_MAX_PLAYERS = Number(process.env.FIVEM_MAX_PLAYERS || 2048);
// FXServer redacts players.json by default (every entry comes back as
// name:"Player", id:0) unless the request is authenticated with the token
// set via the server's own `sv_playersToken` convar — a Cfx.re privacy
// change so random visitors can't scrape the full player list. Set the same
// secret in server.cfg (`set sv_playersToken "..."`) and here
// (FIVEM_PLAYERS_TOKEN) to get real names/ids back.
const FIVEM_PLAYERS_TOKEN = process.env.FIVEM_PLAYERS_TOKEN || "";
const FIVEM_CACHE_MS = 20_000;
let fivemCache = { data: null, fetchedAt: 0 };

async function fetchFivemStatus() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url = `http://${FIVEM_ADDRESS}/players.json`;
    const res = await fetch(FIVEM_PLAYERS_TOKEN ? `${url}?token=${encodeURIComponent(FIVEM_PLAYERS_TOKEN)}` : url, {
      headers: FIVEM_PLAYERS_TOKEN ? { "X-Players-Token": FIVEM_PLAYERS_TOKEN } : undefined,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`players.json HTTP ${res.status}`);
    const players = await res.json();
    const rawList = Array.isArray(players)
      // Only the server-slot id and display name are exposed publicly — never
      // identifiers/endpoint/ping, which could be used to target or dox a
      // specific player.
      ? players.map(p => ({ id: p.id, name: (p.name || "Necunoscut").toString().slice(0, 64) }))
      : [];
    // Without a valid sv_playersToken, FXServer sends every entry back as
    // {id:0,name:"Player"} — detect that and don't pass off fake-looking
    // duplicate names as real data.
    const namesRedacted = rawList.length > 0 && rawList.every(p => p.id === 0 && p.name === "Player");
    const list = namesRedacted ? [] : rawList.sort((a, b) => a.name.localeCompare(b.name, "ro"));
    return { online: true, players: rawList.length, maxPlayers: FIVEM_MAX_PLAYERS, list, namesRedacted };
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/server-status", asyncRoute(async (_req, res) => {
  const age = Date.now() - fivemCache.fetchedAt;
  if (fivemCache.data && age < FIVEM_CACHE_MS) return res.json(fivemCache.data);
  try {
    const data = await fetchFivemStatus();
    fivemCache = { data, fetchedAt: Date.now() };
    res.json(data);
  } catch {
    if (fivemCache.data) return res.json({ ...fivemCache.data, stale: true });
    res.json({ online: false, players: 0, maxPlayers: FIVEM_MAX_PLAYERS, list: [] });
  }
}));

// Public roster for the homepage's "Jucători" section. Preferred source is
// our own moldovarp-api resource (getPlayersDetail, defined further below,
// same cache the admin panel uses) — it reads real ESX display names
// directly off the game server and doesn't need FXServer's sv_playersToken
// at all. Only falls back to the plain players.json reading (which FXServer
// redacts to generic "Player" entries without that token — see
// fetchFivemStatus above) when moldovarp-api isn't configured or offline.
app.get("/api/live/players", asyncRoute(async (_req, res) => {
  if (FIVEM_API_SECRET) {
    const detail = await getPlayersDetail();
    if (detail.online) {
      // Staff badge: moldovarp-api reports each player's ESX group
      // (xPlayer.getGroup()) — anything other than the default "user" group
      // is surfaced here as a rank label. Only the group NAME is public
      // (no money/vehicles), same data-minimization rule as the rest of
      // this endpoint.
      const list = (detail.players || [])
        .map(p => ({
          id: p.id,
          name: (p.name || "Necunoscut").toString().slice(0, 64),
          ...(p.group && p.group.toLowerCase() !== "user" ? { group: p.group.toString().slice(0, 24) } : {}),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ro"));
      return res.json({
        online: true,
        players: list.length,
        list,
        namesRedacted: false,
        ...(detail.stale ? { stale: true } : {}),
      });
    }
  }

  const shape = d => ({ online: d.online, players: d.players ?? 0, list: d.list || [], namesRedacted: !!d.namesRedacted });
  const age = Date.now() - fivemCache.fetchedAt;
  if (fivemCache.data && age < FIVEM_CACHE_MS) return res.json(shape(fivemCache.data));
  try {
    const data = await fetchFivemStatus();
    fivemCache = { data, fetchedAt: Date.now() };
    res.json(shape(data));
  } catch {
    if (fivemCache.data) return res.json({ ...shape(fivemCache.data), stale: true });
    res.json({ online: false, players: 0, list: [], namesRedacted: false });
  }
}));

// Live facțiuni + bani, citite din resursa custom "moldovarp-api" instalată
// pe serverul de joc (vezi fivem-resource/moldovarp-api în README-ul livrat
// separat). Nu ne conectăm niciodată direct la baza de date MySQL a
// serverului — doar la acest rezumat securizat cu o cheie. Dacă resursa nu e
// încă instalată/pornită, endpoint-ul răspunde degradat (online:false) în loc
// să crape, ca site-ul să funcționeze normal oricum.
const FIVEM_API_SECRET = process.env.FIVEM_API_SECRET || "";
const FACTIONS_CACHE_MS = 20_000;
let factionCache = { data: null, fetchedAt: 0 };

async function fetchFactionSnapshot() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api/snapshot`, {
      headers: { "x-api-key": FIVEM_API_SECRET },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`moldovarp-api HTTP ${res.status}`);
    const snapshot = await res.json();
    return { online: true, ...snapshot };
  } finally {
    clearTimeout(timeout);
  }
}

async function getFactionSnapshot(force) {
  const age = Date.now() - factionCache.fetchedAt;
  if (!force && factionCache.data && age < FACTIONS_CACHE_MS) return factionCache.data;
  try {
    const data = await fetchFactionSnapshot();
    factionCache = { data, fetchedAt: Date.now() };
    return data;
  } catch {
    if (factionCache.data) return { ...factionCache.data, stale: true };
    return { online: false, factions: [], totals: null };
  }
}

// Banii (societyMoney, totals.cash/bank) rămân doar pentru admin — pe site-ul
// public arătăm doar câți membri sunt online per facțiune.
function stripFactionMoney(data) {
  return {
    online: data.online,
    factions: (data.factions || []).map(f => ({ name: f.name, label: f.label, online: f.online })),
    totals: data.totals ? { onlinePlayers: data.totals.onlinePlayers } : null,
    ...(data.stale ? { stale: true } : {}),
  };
}

app.get("/api/live/factions", asyncRoute(async (_req, res) => {
  res.json(stripFactionMoney(await getFactionSnapshot()));
}));

app.get("/api/admin/live/factions", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  res.json(await getFactionSnapshot(req.query.force === "1"));
}));

// Detaliu per-jucător (bani + vehicule), tot din moldovarp-api — vezi
// /players acolo. Admin-only: aici chiar apar sume individuale ale
// jucătorilor, nu doar totaluri agregate ca la /snapshot.
const PLAYERS_CACHE_MS = 20_000;
let playersDetailCache = { data: null, fetchedAt: 0 };

async function fetchPlayersDetail() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api/players`, {
      headers: { "x-api-key": FIVEM_API_SECRET },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`moldovarp-api HTTP ${res.status}`);
    const data = await res.json();
    return { online: true, players: data.players || [] };
  } finally {
    clearTimeout(timeout);
  }
}

// Shared by the admin route below and by the public /api/live/players route
// above (which strips this down to just id+name — no money/vehicles/job).
async function getPlayersDetail(force) {
  const age = Date.now() - playersDetailCache.fetchedAt;
  if (!force && playersDetailCache.data && age < PLAYERS_CACHE_MS) return playersDetailCache.data;
  try {
    const data = await fetchPlayersDetail();
    playersDetailCache = { data, fetchedAt: Date.now() };
    return data;
  } catch {
    if (playersDetailCache.data) return { ...playersDetailCache.data, stale: true };
    return { online: false, players: [] };
  }
}

app.get("/api/admin/live/players", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  res.json(await getPlayersDetail(req.query.force === "1"));
}));

// "Ultima dată văzut" — la fiecare 60 de secunde, indiferent dacă cineva se
// uită chiar acum în admin panel sau pe homepage, salvăm pentru fiecare
// jucător ONLINE (matching după display_name, doar pentru cei care au deja
// cont pe site) ultimele valori cunoscute — bani, job, vehicule — în
// coloanele last_* din players (vezi migrarea din database/schema.sql).
// Scopul: profilul jucătorului să arate ceva relevant și când e OFFLINE, nu
// doar "nu ești conectat acum" — asta era exact observația care a dus la
// acest sync ("ar fi mult mai profesional" să meargă și offline).
// Best-effort, tăcut: dacă serverul de joc e jos momentan, pur și simplu nu
// actualizăm nimic la acest tur — nu ștergem/stricăm ultima poză bună deja
// salvată.
async function syncPlayerSnapshots() {
  if (!FIVEM_API_SECRET) return;
  try {
    const detail = await fetchPlayersDetail();
    if (!detail.online || !detail.players.length) return;
    for (const pl of detail.players) {
      const name = (pl.name || "").toString().trim();
      if (!name) continue;
      await pool.query(
        `UPDATE players SET
           last_cash = $1, last_bank = $2, last_black_money = $3,
           last_job = $4, last_job_label = $5, last_vehicles = $6,
           last_synced_at = NOW()
         WHERE display_name ILIKE $7`,
        [
          // last_cash/last_bank/last_black_money sunt INTEGER — jocul poate
          // trimite valori cu zecimale (ex: bani murdari calculați ca procent,
          // 333112.75), ceea ce Postgres refuză direct la INSERT/UPDATE cu
          // "invalid input syntax for type integer". Rotunjim aici, nu
          // schimbăm coloana la NUMERIC, pentru că banii din joc sunt oricum
          // afișați ca sumă întreagă peste tot pe site (fmtMoney) — nu pierdem
          // nimic relevant vizual.
          Number.isFinite(pl.cash) ? Math.round(pl.cash) : null,
          Number.isFinite(pl.bank) ? Math.round(pl.bank) : null,
          Number.isFinite(pl.blackMoney) ? Math.round(pl.blackMoney) : null,
          pl.job || null,
          pl.jobLabel || null,
          JSON.stringify(pl.vehicles || []),
          name,
        ]
      );
    }
  } catch (err) {
    console.error("syncPlayerSnapshots a eșuat (ignorat, reîncercăm la următorul tur):", err.message);
  }
}

if (FIVEM_API_SECRET) {
  setInterval(syncPlayerSnapshots, 60_000);
  syncPlayerSnapshots();
}

// Lista COMPLETĂ a joburilor/facțiunilor configurate pe server (tabela ESX
// "jobs"), nu doar cele cu jucători online acum. O folosim ca să vedem toate
// numele existente — inclusiv găști fără niciun membru online în acel moment.
let jobsCache = { data: null, fetchedAt: 0 };
const JOBS_CACHE_MS = 60_000;

// ---------------------------------------------------------------------------
// Proxy de dezvoltare către endpoint-urile "/dev/..." ale resursei
// moldovarp-api (v1.15.0+) de pe serverul de joc.
// ---------------------------------------------------------------------------
// De ce există: sandbox-ul din care developerul (Claude) lucrează nu poate
// deschide conexiuni de rețea directe către IP-ul brut al serverului de joc
// (doar către domenii web obișnuite, prin HTTPS) — dar Railway, unde rulează
// acest site, poate perfect (la fel cum citește deja /snapshot, /players,
// /jobs, /logs mai sus). Așa că site-ul face "puntea": primește o cerere pe
// un domeniu HTTPS normal (acesta), o pasează mai departe către
// http://IP:PORT/moldovarp-api/dev/..., și întoarce rezultatul.
//
// Protejat cu DEV_PROXY_SECRET — o cheie DIFERITĂ de FIVEM_DEV_SECRET (care e
// cea folosită între site și serverul de joc) și diferită de orice cheie
// folosită de site-ul public — nu necesită cont/login, deci trebuie separată
// clar de restul. Nu e nevoie ca cineva să rețină sau să introducă vreo
// cheie aici — o generez și o setez direct pe Railway.
const DEV_PROXY_SECRET = process.env.DEV_PROXY_SECRET || "";
const FIVEM_DEV_SECRET = process.env.FIVEM_DEV_SECRET || "";

// Accepta cheia fie ca header (x-dev-proxy-key), fie ca query param (?key=)
// — al doilea exista special pentru ca uneltele mele de citit pagini web nu
// pot trimite header-e custom, doar un URL simplu.
function requireDevProxy(req, res, next) {
  const provided = req.headers["x-dev-proxy-key"] || req.query.key;
  if (!DEV_PROXY_SECRET || provided !== DEV_PROXY_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

async function fetchFromGameDev(path) {
  if (!FIVEM_DEV_SECRET) throw new Error("FIVEM_DEV_SECRET nu e configurat.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api${path}`, {
      headers: { "x-dev-key": FIVEM_DEV_SECRET },
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, contentType: res.headers.get("content-type") || "text/plain", body: text };
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/dev/resources", requireDevProxy, asyncRoute(async (_req, res) => {
  const r = await fetchFromGameDev("/dev/resources");
  res.status(r.status).type(r.contentType).send(r.body);
}));

app.get("/api/dev/file", requireDevProxy, asyncRoute(async (req, res) => {
  const qs = new URLSearchParams();
  if (req.query.resource) qs.set("resource", String(req.query.resource));
  if (req.query.file) qs.set("file", String(req.query.file));
  const r = await fetchFromGameDev(`/dev/file?${qs.toString()}`);
  res.status(r.status).type(r.contentType).send(r.body);
}));

// "/dev/listdir" (io.popen, risc de blocare a firului principal FXServer)
// a fost RETRAS pe partea de joc — vezi server.lua din moldovarp-api. Rutat
// acum către "/dev/checkfiles", varianta sigură (doar LoadResourceFile).
app.get("/api/dev/checkfiles", requireDevProxy, asyncRoute(async (req, res) => {
  const qs = new URLSearchParams();
  if (req.query.resource) qs.set("resource", String(req.query.resource));
  if (req.query.files) qs.set("files", String(req.query.files));
  const r = await fetchFromGameDev(`/dev/checkfiles?${qs.toString()}`);
  res.status(r.status).type(r.contentType).send(r.body);
}));

app.get("/api/dev/db-tables", requireDevProxy, asyncRoute(async (_req, res) => {
  const r = await fetchFromGameDev("/dev/db-tables");
  res.status(r.status).type(r.contentType).send(r.body);
}));

app.get("/api/dev/db-columns", requireDevProxy, asyncRoute(async (req, res) => {
  const qs = new URLSearchParams();
  if (req.query.table) qs.set("table", String(req.query.table));
  const r = await fetchFromGameDev(`/dev/db-columns?${qs.toString()}`);
  res.status(r.status).type(r.contentType).send(r.body);
}));

// Cateva randuri REALE (nu doar numele coloanelor) dintr-o tabela — folosit
// pentru diagnosticul "afacerilor" (v1.26.2): ce contine efectiv coloana
// "creator" din pug_businesses (nume de personaj sau identificator?).
app.get("/api/dev/db-sample", requireDevProxy, asyncRoute(async (req, res) => {
  const qs = new URLSearchParams();
  if (req.query.table) qs.set("table", String(req.query.table));
  if (req.query.columns) qs.set("columns", String(req.query.columns));
  if (req.query.limit) qs.set("limit", String(req.query.limit));
  if (req.query.recent) qs.set("recent", String(req.query.recent));
  const r = await fetchFromGameDev(`/dev/db-sample?${qs.toString()}`);
  res.status(r.status).type(r.contentType).send(r.body);
}));

// Diagnostic pentru "Jaf după moarte" (v1.26.5b) — reface EXACT logica din
// /api/admin/kill-logs (vezi mai jos), dar fără autentificare de admin (gate
// pe DEV_PROXY_SECRET, ca toate rutele /api/dev/*) și cu informații
// suplimentare expuse direct (fereastra de timp calculată, câte transferuri
// s-au găsit în ea, lista lor brută) — ca să nu mai depindem de un staff care
// deschide manual Network tab din browser ca să ne dea răspunsul brut al
// API-ului. Doar citire, nimic nu se schimbă în baza de date.
app.get("/api/dev/kill-logs-debug", requireDevProxy, asyncRoute(async (req, res) => {
  const player = req.query.player ? String(req.query.player).slice(0, 64) : "";

  // "raw=1" — ignora complet mortile/fereastra: ultimele N transferuri de
  // item (implicit 20, orice jucator), FARA nicio conditie de timp (fara
  // beforeAt/afterAt) — folosit ca sa izolam daca problema e STRICT in
  // compararea de timp sau in altceva (ex: transferurile nici nu ajung sa
  // fie citite deloc de "/logs" pentru categoria asta).
  if (req.query.raw === "1") {
    const rawLimit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const r = await fetchGameLogs({ player, category: "item_transfer", pageSize: rawLimit });
    return res.json({ online: r.online, transfersFound: r.logs.length, transfers: r.logs });
  }

  const { online, logs: deaths, total } = await fetchGameLogs({
    player,
    category: "death",
    page: 1,
    pageSize: Math.min(50, Math.max(1, Number(req.query.deathsLimit) || 5)),
    withTotal: true,
  });

  let transfers = [];
  let windowInfo = null;
  if (deaths.length) {
    const times = deaths.map(d => new Date(d.at).getTime());
    const oldest = new Date(Math.min(...times));
    const newest = new Date(Math.max(...times) + 3 * 60 * 1000);
    windowInfo = {
      oldestIso: oldest.toISOString(),
      newestIso: newest.toISOString(),
      oldestMs: oldest.getTime(),
      newestMs: newest.getTime(),
    };
    const r = await fetchGameLogs({ player: "", category: "item_transfer", after: oldest, before: newest, pageSize: 500 });
    transfers = r.logs;
  }

  res.json({ online, deathsTotal: total, deaths, window: windowInfo, transfersFound: transfers.length, transfers });
}));

app.get("/api/admin/live/jobs", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const force = req.query.force === "1";
  const age = Date.now() - jobsCache.fetchedAt;
  if (!force && jobsCache.data && age < JOBS_CACHE_MS) return res.json(jobsCache.data);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const r = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api/jobs`, {
      headers: { "x-api-key": FIVEM_API_SECRET },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`moldovarp-api HTTP ${r.status}`);
    const body = await r.json();
    const data = { online: true, jobs: body.jobs || [] };
    jobsCache = { data, fetchedAt: Date.now() };
    res.json(data);
  } catch {
    if (jobsCache.data) return res.json({ ...jobsCache.data, stale: true });
    res.json({ online: false, jobs: [] });
  } finally {
    clearTimeout(timeout);
  }
}));

// Jurnalul de activitate combină DOUĂ surse:
// 1. moldovarp-api de pe serverul de joc (chat/comenzi, conectări/deconectări,
//    morți/kill-uri, mișcări de bani, cumpărături/crafting/transferuri de
//    iteme din ox_inventory) — categoriile "game" de mai jos.
// 2. Acțiunile de staff trimise direct de panoul cloud Luxu Admin (kill,
//    revive, give/take item, ban etc.) prin webhook-ul lor propriu — vezi
//    POST /api/webhooks/luxu mai jos și tabela admin_action_logs (a noastră,
//    Postgres, nu depinde de serverul de joc fiind online).
// Filtrele (player/category/limit) sunt pasate mai departe. Gated la fel ca
// Sancțiunile (moderator+) — e un instrument de investigație pentru staff,
// nu date publice.
const GAME_LOG_CATEGORIES = ["chat", "command", "connect", "disconnect", "death", "money", "item_buy", "item_craft", "item_transfer", "item_obtained", "item_drop", "item_pickup", "vehicle_acquired"];
const LOG_CATEGORIES = [...GAME_LOG_CATEGORIES, "admin"];

// Cere loguri de joc de la moldovarp-api. `category` poate fi o singura
// categorie sau mai multe separate prin virgula (resursa stie sa le
// interogheze pe toate deodata — vezi Kill Logs mai jos, care are nevoie
// simultan de "death" si "item_transfer" ca sa coreleze o moarte cu ce s-a
// luat din inventarul victimei imediat dupa).
// `after` (created_at > ?) și `page`/`pageSize` (paginare pe număr de pagină,
// OFFSET direct) sunt opționale, adăugate special pentru Kill Logs — vezi
// ruta /api/admin/kill-logs mai jos pentru motivul din spate (mortile erau
// "împinse" din pagini de volumul mare de transferuri de iteme cand foloseam
// doar cursorul "beforeAt" pe categoriile combinate death+item_transfer).
// `withTotal` cere și numărul total de rânduri care s-ar potrivi (fără
// limit/offset), pentru calculul numărului de pagini.
async function fetchGameLogs({ player, category, limit, before, after, page, pageSize, withTotal }) {
  const qs = new URLSearchParams();
  if (player) qs.set("player", player);
  if (category) qs.set("category", category);
  qs.set("limit", String(pageSize || limit));
  // BUG REAL gasit acum (06.09.2026, confirmat direct din "/dev/db-sample"):
  // "created_at" in moldovarp_logs (MySQL) e stocat ca NUMAR (milisecunde de
  // la epoch, ex: 1788709662000), NU ca text/DATETIME. Trimiteam aici
  // before/after.toISOString() (text, ex: "2026-09-06T13:22:13.000Z") — MySQL,
  // comparand text cu o coloana numerica, trunchiaza textul la primul grup de
  // cifre valid ("2026"), deci "created_at < ?" devenea "created_at < 2026",
  // FALS pentru orice valoare reala (milisecunde de la epoch sunt mult mai
  // mari) — filtrul "beforeAt" excludea ABSOLUT TOATE randurile, intotdeauna.
  // Exact de-aia "Jaf dupa moarte" (Kill Logs, singurul loc care foloseste
  // "before") nu arata niciodata nimic, indiferent daca transferul chiar
  // exista in baza de date (confirmat separat ca EXISTA, corect atribuit).
  // Fix: trimitem milisecunde de la epoch (numar, ca text simplu), nu ISO —
  // se compara corect cu coloana numerica.
  if (before) qs.set("beforeAt", String(before.getTime()));
  if (after) qs.set("afterAt", String(after.getTime()));
  if (page) qs.set("page", String(page));
  if (withTotal) qs.set("withTotal", "1");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api/logs?${qs.toString()}`, {
      headers: { "x-api-key": FIVEM_API_SECRET },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`moldovarp-api HTTP ${r.status}`);
    const body = await r.json();
    return { online: true, logs: body.logs || [], total: typeof body.total === "number" ? body.total : null };
  } catch {
    return { online: false, logs: [], total: null };
  } finally {
    clearTimeout(timeout);
  }
}

// Sancțiuni date direct din Luxu Admin (resursa lor separată, instalată pe
// serverul de joc) — ban-uri, avertismente și perioade de închisoare, citite
// direct din tabelele lor MySQL (bans/warnings/jail) prin noul endpoint
// "/moderation" al moldovarp-api (vezi getModeration() în server.lua).
// `player` opțional: fără el, vin ultimele sancțiuni de pe tot serverul
// (pagina Sancțiuni); cu el, doar ale unui singur jucător (fereastra de
// profil). La fel ca fetchGameLogs, degradăm silențios la "offline" dacă
// serverul de joc nu răspunde — nu blocăm restul paginii pentru asta.
async function fetchLuxuModeration({ player } = {}) {
  const qs = new URLSearchParams();
  if (player) qs.set("player", player);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api/moderation?${qs.toString()}`, {
      headers: { "x-api-key": FIVEM_API_SECRET },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`moldovarp-api HTTP ${r.status}`);
    const body = await r.json();
    return { online: true, bans: body.bans || [], warnings: body.warnings || [], jail: body.jail || [] };
  } catch {
    return { online: false, bans: [], warnings: [], jail: [] };
  } finally {
    clearTimeout(timeout);
  }
}

// Case, business-uri și apartenența la găști (op-crime) — citite direct din
// tabelele resurselor deja instalate pe serverul de joc (0resmon_ph_houses/
// 0resmon_ph_owned_houses, pug_businesses, opcrime_players/opcrime_orgs/
// opcrime_ranks) prin noul endpoint "/assets" al moldovarp-api (vezi
// getHouses()/getBusinesses()/getGangs() în server.lua). La fel ca la
// moderare: `player` opțional filtrează după numele proprietarului/porecla
// din op-crime; fără el, vin listele nefiltrate pentru pagina Jucători.
// `identifier` e opțional — dat DOAR când știm deja identificatorul ESX
// exact (jucătorul e online chiar acum, vezi buildPlayerProfile mai jos) —
// atunci case+găști se potrivesc EXACT pe el (mult mai sigur decât numele:
// owner_name/customnick din joc pot să nu semene deloc cu numele CFX
// folosit peste tot pe site — asta era motivul pentru care un jucător
// online, cu vehicule afișate corect, putea totuși ieși fără casă/gașcă
// găsită, chiar dacă avea).
async function fetchAssets({ player, identifier, rpName } = {}) {
  const qs = new URLSearchParams();
  if (player) qs.set("player", player);
  if (identifier) qs.set("identifier", identifier);
  // Business-urile (pug_businesses) nu au identificator de proprietar —
  // rămân căutate după nume în coloana "creator". Diagnostic (v1.26.2, cerut
  // explicit după ce afacerile ieșeau mereu goale): valorile reale din
  // "creator" (ex: "Jora", "Misa") sunt prenume/porecle de personaj RP, NU
  // numele CFX de pe site (gen "BluntCat2951") — deci căutarea după numele
  // CFX nu avea NICIODATĂ șansa să găsească ceva. Cand știm și numele de
  // personaj RP (jucătorul online chiar acum, vezi buildPlayerProfile), îl
  // trimitem separat, ca a doua variantă de căutare — vezi getBusinesses.
  if (rpName) qs.set("rpName", rpName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api/assets?${qs.toString()}`, {
      headers: { "x-api-key": FIVEM_API_SECRET },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`moldovarp-api HTTP ${r.status}`);
    const body = await r.json();
    return { online: true, houses: body.houses || [], businesses: body.businesses || [], gangs: body.gangs || [] };
  } catch {
    return { online: false, houses: [], businesses: [], gangs: [] };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// "Cazuri" (coins) — jucătorul cheltuie coins-uri deja cumpărate (prin fluxul
// care există deja în g-coin-shop: "Cumpără coins" -> Tebex -> "Enter TBX
// Transaction ID" -> Claim, NEATINS de noi) pe un caz cu șansă. Recompensa se
// ridică din joc cu "/recompense" — vezi comentariile din server.lua
// (moldovarp-api) pentru toată logica și motivele deciziilor de siguranță.
// ---------------------------------------------------------------------------

// Verifică codul de 6 cifre generat de comanda din joc "/leagacont" — dacă e
// valid, moldovarp-api ne dă identifier-ul (licența) real al jucătorului.
// Codul se consumă la prima verificare reușită (nu poate fi refolosit).
async function fetchLinkVerify(code) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api/link/verify?code=${encodeURIComponent(code)}`, {
      headers: { "x-api-key": FIVEM_API_SECRET },
      signal: controller.signal,
    });
    if (!r.ok) return { ok: false, error: r.status === 404 ? "cod_invalid" : "eroare" };
    const body = await r.json();
    return { ok: true, identifier: body.identifier, name: body.name };
  } catch {
    return { ok: false, error: "server_offline" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCoins(identifier) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api/coins?identifier=${encodeURIComponent(identifier)}`, {
      headers: { "x-api-key": FIVEM_API_SECRET },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`moldovarp-api HTTP ${r.status}`);
    const body = await r.json();
    return { online: true, coins: body.coins || 0, pending: body.pending || [] };
  } catch {
    return { online: false, coins: 0, pending: [] };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCasesList() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api/cases`, {
      headers: { "x-api-key": FIVEM_API_SECRET },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`moldovarp-api HTTP ${r.status}`);
    const body = await r.json();
    return { online: true, cases: body.cases || [] };
  } catch {
    return { online: false, cases: [] };
  } finally {
    clearTimeout(timeout);
  }
}

// Deschide efectiv un caz — POST către moldovarp-api, care scade coins ATOMIC
// și alege recompensa după șanse (vezi openCase() în server.lua). Se apelează
// o singură dată per clic — orice retry din partea clientului ar trebui să
// vină ca o cerere nouă, nu o repetare automată de aici.
async function postOpenCase({ identifier, playerName, caseId }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`http://${FIVEM_ADDRESS}/moldovarp-api/cases/open`, {
      method: "POST",
      headers: { "x-api-key": FIVEM_API_SECRET, "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, playerName, caseId }),
      signal: controller.signal,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: body.error || "eroare" };
    return { ok: true, result: body };
  } catch {
    return { ok: false, error: "server_offline" };
  } finally {
    clearTimeout(timeout);
  }
}

// Acțiunile de staff (Luxu), sursa separata (Postgres) folosita atat pentru
// categoria "admin" din Loguri cat si pentru corelarile best-effort de mai
// jos (kill/revive/item de admin etc.) si pentru Kill Logs.
async function fetchStaffLogs({ player, before, after, limit }) {
  const conditions = [];
  const params = [];
  if (player) {
    params.push(`%${player}%`);
    conditions.push(`(staff_name ILIKE $${params.length} OR target_name ILIKE $${params.length})`);
  }
  if (before) {
    params.push(before.toISOString());
    conditions.push(`created_at < $${params.length}`);
  }
  if (after) {
    params.push(after.toISOString());
    conditions.push(`created_at > $${params.length}`);
  }
  params.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT staff_name, target_name, action, reason, raw, created_at
     FROM admin_action_logs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows.map(r => ({
    category: "admin",
    player: r.staff_name || r.target_name || "necunoscut",
    details: { staff: r.staff_name, target: r.target_name, action: r.action, reason: r.reason, raw: r.raw },
    at: r.created_at,
  }));
}

// Varianta paginata pe NUMĂR de pagină (OFFSET direct în Postgres) a
// funcției de mai sus — folosită DOAR când staff-ul alege explicit categoria
// "Acțiuni staff (Luxu)" în Loguri, unde acțiunile de admin sunt chiar
// conținutul principal al paginii, nu doar context atașat altor rânduri (vezi
// GET /api/admin/logs mai jos). Are propriul total/totalPages, la fel ca
// paginarea de pe Kill Logs.
async function fetchStaffLogsPage({ player, page, pageSize }) {
  const conditions = [];
  const params = [];
  if (player) {
    params.push(`%${player}%`);
    conditions.push(`(staff_name ILIKE $${params.length} OR target_name ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM admin_action_logs ${where}`, params);
  const total = countRes.rows[0]?.total || 0;

  const limitParams = [...params, pageSize, (page - 1) * pageSize];
  const { rows } = await pool.query(
    `SELECT staff_name, target_name, action, reason, raw, created_at
     FROM admin_action_logs ${where} ORDER BY created_at DESC LIMIT $${limitParams.length - 1} OFFSET $${limitParams.length}`,
    limitParams
  );
  const logs = rows.map(r => ({
    category: "admin",
    player: r.staff_name || r.target_name || "necunoscut",
    details: { staff: r.staff_name, target: r.target_name, action: r.action, reason: r.reason, raw: r.raw },
    at: r.created_at,
  }));
  return { logs, total };
}

// Corelare best-effort: cand un log de joc (item obtinut generic, moarte,
// vehicul nou aparut) se intampla FOARTE aproape in timp de o actiune de
// staff din Luxu care pare potrivita (dupa un cuvant-cheie in actiune/motiv)
// si vizeaza acelasi jucator, marcam intrarea ca fiind rezultatul acelei
// actiuni de admin — ca sa nu para ceva organic din joc (item "gasit",
// moarte "de la un jucator necunoscut", vehicul "cumparat"). Schema exactă
// a payload-ului Luxu nu e documentată public (vezi comentariul de la
// /api/webhooks/luxu mai jos), deci potrivirea e doar dupa cuvinte-cheie —
// dacă observați intrări nepotrivite sau cazuri reale ratate, spuneți-mi
// exact ce ați văzut (categoria + ce ar fi trebuit să scrie) și ajustez.
function correlateStaffAction(gameLogs, staffLogs, gameCategory, keywordRegex, detailsField) {
  if (!gameLogs.length || !staffLogs.length) return;
  const matches = staffLogs.filter(s =>
    keywordRegex.test(s.details.action || "") || keywordRegex.test(s.details.reason || "")
  );
  if (!matches.length) return;
  for (const log of gameLogs) {
    if (log.category !== gameCategory || !log.player) continue;
    const logTime = new Date(log.at).getTime();
    const match = matches.find(s => {
      const target = (s.details.target || "").toLowerCase().trim();
      if (!target || target !== log.player.toLowerCase().trim()) return false;
      return Math.abs(new Date(s.at).getTime() - logTime) <= 8000;
    });
    if (match) {
      log.details = { ...log.details, [detailsField]: { staff: match.details.staff || "admin" } };
    }
  }
}

// Fix (2026-09): paginarea veche ("Încarcă mai vechi", cursor pe timp) avea
// EXACT bug-ul găsit inițial la Kill Logs — cand nu era ales niciun filtru de
// categorie ("Toate categoriile", vizualizarea implicită), interogam TOATE
// categoriile de joc laolaltă cu o singură limită comună; pe un server activ,
// categoriile foarte frecvente (chat/comenzi/transfer de iteme) umpleau
// aproape toată pagina, iar cursorul ("mai vechi decat X") abia se mișca in
// timp real — staff a raportat că "Încarcă mai vechi" părea să reîncarce
// loguri din aceeași zi la nesfârșit. Rezolvare: paginare pe NUMĂR de pagină
// (OFFSET direct), la fel ca la Kill Logs — o pagină avansează mereu exact
// `pageSize` rânduri, indiferent de amestecul de categorii, deci nu se mai
// poate "bloca" pe același interval de timp.
app.get("/api/admin/logs", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const player = req.query.player ? String(req.query.player).slice(0, 64) : "";
  const category = LOG_CATEGORIES.includes(req.query.category) ? req.query.category : "";
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
  const page = Math.max(1, Number(req.query.page) || 1);

  // Categoria "Acțiuni staff (Luxu)" e o sursă unică (Postgres, a noastră) —
  // paginăm direct pe ea, cu total/totalPages proprii.
  if (category === "admin") {
    const { logs, total } = await fetchStaffLogsPage({ player, page, pageSize });
    const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
    return res.json({ online: true, logs, page, pageSize, total, totalPages });
  }

  // "Toate categoriile" sau o singură categorie de joc aleasă — o singură
  // sursă (moldovarp-api, de pe serverul de joc), paginată pe OFFSET direct
  // (vezi getLogs în server.lua) — total/totalPages calculate de acolo.
  const { online: gameOnline, logs: gameLogs, total: gameTotal } = await fetchGameLogs({
    player, category, page, pageSize, withTotal: true,
  });

  // Acțiunile de staff se ATAȘEAZĂ (ca rânduri proprii + ca sursă de corelare
  // pentru "adminKill"/"adminGrant") doar cand se vede "Toate categoriile",
  // și doar în fereastra de timp acoperită STRICT de rândurile din pagina
  // curentă — la fel ca jaful de cadavru de la Kill Logs — ca să nu
  // reintroducem o a doua sursă paginată separat, cu propriul ei cursor, care
  // ar putea din nou "aluneca" independent de prima. Cine vrea DOAR acțiunile
  // de staff alege categoria dedicată de mai sus, unde sunt paginate exact.
  let staffLogs = [];
  if (!category && gameLogs.length) {
    const times = gameLogs.map(l => new Date(l.at).getTime());
    const oldest = new Date(Math.min(...times));
    const newest = new Date(Math.max(...times) + 1000);
    staffLogs = await fetchStaffLogs({ player, after: oldest, before: newest, limit: 200 });
  }

  correlateStaffAction(gameLogs, staffLogs, "item_obtained", /item/i, "adminGrant");
  correlateStaffAction(gameLogs, staffLogs, "death", /kill/i, "adminKill");
  correlateStaffAction(gameLogs, staffLogs, "vehicle_acquired", /vehic|masin/i, "adminGrant");

  const merged = [...gameLogs, ...staffLogs].sort((a, b) => new Date(b.at) - new Date(a.at));

  const totalPages = gameTotal != null ? Math.max(1, Math.ceil(gameTotal / pageSize)) : null;
  res.json({ online: gameOnline, logs: merged, page, pageSize, total: gameTotal, totalPages });
}));

// Pagina separata "Kill Logs" — cerută explicit: cine pe cine a ucis, și ce
// s-a luat din inventarul victimei imediat după (jaf de cadavru).
//
// Aproximare, nu certitudine: nu știm dacă cel care a luat itemele chiar e
// ucigașul (poate fi oricine ajunge primul la cadavru) — de-aia arătăm
// explicit cine a luat, nu presupunem că e ucigașul. Fereastra e de 3 minute
// după moarte.
//
// Paginare pe NUMĂR de pagină (1, 2, 3...), nu pe cursor — cerut explicit de
// staff, după ce cursorul vechi ("Încarcă mai vechi") s-a dovedit nefiabil:
// cerea mortile ȘI transferurile de iteme din ACELEAȘI moldovarp_logs cu o
// singură limită comună, iar pe un server activ transferurile (mult mai
// frecvente decât mortile) "împingeau" mortile vechi în afara ferestrei
// paginate — uneori o pagină întreagă nu mai conținea nicio moarte nouă,
// deși mai existau, mult mai vechi. Acum cerem mortile SINGURE, paginate
// direct pe numărul cerut (offset în baza de date, vezi getLogs în
// server.lua), independent de volumul de transferuri — și abia apoi cerem
// transferurile relevante într-o fereastră de timp STRICT delimitată de
// mortile de pe pagina curentă (de la cea mai veche până la cea mai nouă +3
// minute), deci un query mult mai mic și mai țintit, nu concurează deloc cu
// paginarea mortilor. Asta garantează și cerința de "cel puțin 72h în urmă"
// pentru tichete/anchete — fiind acum independentă de traficul de iteme,
// paginarea ajunge oricât de departe în istoric (până la limita de păstrare
// de 30 de zile), fără ca vreo pagină să "sară" morti.
app.get("/api/admin/kill-logs", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const player = req.query.player ? String(req.query.player).slice(0, 64) : "";
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const page = Math.max(1, Number(req.query.page) || 1);

  const { online, logs: deaths, total } = await fetchGameLogs({
    player,
    category: "death",
    page,
    pageSize,
    withTotal: true,
  });

  let kills = [];
  if (deaths.length) {
    const times = deaths.map(d => new Date(d.at).getTime());
    const oldest = new Date(Math.min(...times));
    const newest = new Date(Math.max(...times) + 3 * 60 * 1000); // +3 minute (fereastra de jaf)

    // Transferurile relevante — DOAR în fereastra de timp a acestei pagini,
    // nu din tot istoricul. Limita de 500 e doar o plasă de siguranță pentru
    // un interval neobișnuit de aglomerat — fereastra fiind deja restrânsă la
    // mortile paginii curente, în practică e mult sub atât.
    const { logs: transfers } = await fetchGameLogs({
      player,
      category: "item_transfer",
      after: oldest,
      before: newest,
      pageSize: 500,
    });

    const staffLogs = await fetchStaffLogs({ after: oldest, before: newest, limit: 500 });
    correlateStaffAction(deaths, staffLogs, "death", /kill/i, "adminKill");

    function lootedAfterDeath(victim, deathAt) {
      const deathTime = new Date(deathAt).getTime();
      return transfers
        .filter(t => (t.player || "").toLowerCase().trim() === (victim || "").toLowerCase().trim())
        .filter(t => {
          const dt = new Date(t.at).getTime() - deathTime;
          return dt >= 0 && dt <= 3 * 60 * 1000;
        })
        .map(t => ({ item: t.details.item, count: t.details.count, to: t.details.to, at: t.at }));
    }

    kills = deaths
      .map(d => ({
        victim: d.player,
        victimRpName: d.rpName || null,
        killer: d.details.killer || null,
        adminKill: d.details.adminKill || null,
        cause: d.details.cause || null,
        job: d.details.job || null,
        detectedBy: d.details.detectedBy || "event",
        at: d.at,
        looted: lootedAfterDeath(d.player, d.at),
      }))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  }

  const totalPages = total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;
  res.json({ online, kills, page, pageSize, total, totalPages });
}));

// Sancțiuni Luxu Admin, pentru pagina Sancțiuni de pe site — cerută explicit,
// ca staff-ul nostru să vadă și ban-urile/avertismentele/închisorile date
// prin panoul Luxu, fără să deschidă separat panoul lor. Fără filtru de
// jucător = ultimele de pe tot serverul.
app.get("/api/admin/live/moderation", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const player = req.query.player ? String(req.query.player).trim().slice(0, 64) : "";
  const result = await fetchLuxuModeration({ player });
  res.json(result);
}));

// Case, business-uri și găști — pagina Jucători, secțiunea "Proprietăți" (fără
// filtru de jucător = tot ce există pe server, pentru răsfoire).
app.get("/api/admin/live/assets", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const player = req.query.player ? String(req.query.player).trim().slice(0, 64) : "";
  const result = await fetchAssets({ player });
  res.json(result);
}));

// ---------------------------------------------------------------------------
// Profilul unui jucător — pagina cerută explicit ("apesi pe player și se
// deschide pagina cu toată informația lui"). Combină TOATE sursele deja
// folosite separat în alte pagini, într-un singur rezumat:
//   - date live din moldovarp-api (bani, vehicule, job) — doar dacă jucătorul
//     e online chiar acum, altfel `live` rămâne null (nu inventăm date vechi
//     aici — pentru asta există deja Loguri, care arată istoricul)
//   - contul de pe site, dacă jucătorul din joc are și cont (majoritatea
//     jucătorilor pot să nu aibă — potrivirea e după numele afișat)
//   - sancțiuni (după target_name, la fel ca pagina de Sancțiuni)
//   - tichetele contului, dacă are cont
//   - activitate recentă (aceleași loguri ca la pagina Loguri, filtrate pe
//     acest jucător)
//   - kill-uri, ATÂT ca victimă CÂT ȘI ca ucigaș (pentru "ca ucigaș" nu putem
//     filtra la sursă — moldovarp-api filtrează după victimă — deci citim un
//     lot mai mare de morți recente și filtrăm aici după numele ucigașului;
//     acceptabil pentru un rezumat de profil, nu pentru un istoric complet)
// Găsită după NUME (case-insensitive), nu după un id din baza noastră —
// pentru că jucătorul din joc poate să nu aibă deloc cont pe site.
// ---------------------------------------------------------------------------
async function buildPlayerProfile(name) {
  const cleanName = (name || "").toString().trim().slice(0, 64);
  if (!cleanName) return null;
  const lower = cleanName.toLowerCase();

  const [liveDetail, accountResult, punishmentResult, activityResult, staffActivity, deathsResult, moderationResult] = await Promise.all([
    getPlayersDetail(),
    pool.query(
      `SELECT p.id, p.game_id, p.display_name, p.playtime_minutes, p.status, p.created_at,
              p.last_cash, p.last_bank, p.last_black_money, p.last_job, p.last_job_label,
              p.last_vehicles, p.last_synced_at,
              u.id AS user_id, u.username, u.email,
              f.name AS faction_name, fr.name AS rank_name
       FROM players p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN faction_members fm ON fm.player_id = p.id
       LEFT JOIN factions f ON f.id = fm.faction_id
       LEFT JOIN faction_ranks fr ON fr.id = fm.rank_id
       WHERE p.display_name ILIKE $1
       LIMIT 1`, [cleanName]
    ),
    pool.query(
      `SELECT pu.id, pu.type, pu.reason, pu.duration_minutes, pu.created_at, u.username AS issued_by,
              CASE WHEN pu.duration_minutes IS NOT NULL
                   THEN pu.created_at + (pu.duration_minutes || ' minutes')::interval
                   ELSE NULL END AS expires_at
       FROM punishments pu LEFT JOIN users u ON u.id = pu.issued_by
       WHERE pu.target_name ILIKE $1
       ORDER BY pu.created_at DESC LIMIT 20`, [cleanName]
    ),
    fetchGameLogs({ player: cleanName, limit: 25 }),
    fetchStaffLogs({ player: cleanName, limit: 25 }),
    fetchGameLogs({ category: "death", limit: 300 }),
    fetchLuxuModeration({ player: cleanName }),
  ]);

  const live = liveDetail.online
    ? (liveDetail.players || []).find(p => (p.name || "").toLowerCase().trim() === lower) || null
    : null;

  // Cerută separat, DUPĂ ce știm `live` — dacă jucătorul e online chiar
  // acum, moldovarp-api ne-a dat deja identificatorul lui ESX exact (vezi
  // /players), pe care îl trimitem mai departe la /assets pentru un match
  // sigur pe casă/gașcă (owner/identificator), în loc de potrivire de nume
  // (owner_name/customnick — pot să nu semene deloc cu numele CFX). Fără el
  // (jucător offline), rămâne căutarea după nume, cu limitările știute.
  const assetsResult = await fetchAssets({ player: cleanName, identifier: live?.license, rpName: live?.serverName });

  const account = accountResult.rows[0] || null;
  let tickets = [];
  if (account) {
    const t = await pool.query(
      `SELECT id, subject, category, status, created_at FROM tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [account.user_id]
    );
    tickets = t.rows;
  }

  const recentActivity = [...activityResult.logs, ...staffActivity]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 25);

  const allDeaths = deathsResult.logs;
  correlateStaffAction(allDeaths, staffActivity, "death", /kill/i, "adminKill");

  const killsAsVictim = allDeaths
    .filter(d => (d.player || "").toLowerCase().trim() === lower)
    .map(d => ({ killer: d.details.killer || null, adminKill: d.details.adminKill || null, cause: d.details.cause || null, at: d.at }))
    .slice(0, 20);

  const killsAsKiller = allDeaths
    .filter(d => (d.details.killer || "").toLowerCase().trim() === lower)
    .map(d => ({ victim: d.player, cause: d.details.cause || null, at: d.at }))
    .slice(0, 20);

  // Cand jucatorul e offline ACUM, dar avem o poza salvata de cand a fost
  // ultima data online (vezi syncPlayerSnapshots, la fiecare 60s), o
  // aratam clar etichetata cu "ultima data vazut" — nu o confundam cu date
  // live. Fara asta, un jucator offline nu vedea absolut nimic despre
  // banii/vehiculele lui, ceea ce nu parea profesional.
  // player-profile-modal.js (moderationHtml) așteaptă un singur obiect
  // "jail", nu o listă — arătăm cea mai relevantă intrare: una activă acum,
  // altfel cea mai recentă (istoric), altfel deloc dacă n-a stat niciodată.
  const moderation = moderationResult.online ? {
    bans: moderationResult.bans,
    warnings: moderationResult.warnings,
    jail: moderationResult.jail.find(j => j.active) || moderationResult.jail[0] || null,
  } : null;

  // Un jucător poate avea mai multe case (houses e listă întreagă), dar de
  // obicei o singură gașcă activă — luăm prima găsită după porecla din
  // op-crime (vezi comentariul din fetchAssets/getGangs despre limitările
  // acelei potriviri).
  const houses = assetsResult.online ? assetsResult.houses : [];
  const businesses = assetsResult.online ? assetsResult.businesses : [];
  const gang = assetsResult.online ? (assetsResult.gangs[0] || null) : null;

  const lastKnown = (!live && account && account.last_synced_at) ? {
    cash: account.last_cash, bank: account.last_bank, blackMoney: account.last_black_money,
    job: account.last_job, jobLabel: account.last_job_label,
    vehicles: account.last_vehicles || [], syncedAt: account.last_synced_at,
  } : null;

  return {
    name: cleanName,
    online: !!live,
    live: live ? {
      serverId: live.id, job: live.job, jobLabel: live.jobLabel, group: live.group,
      cash: live.cash, bank: live.bank, blackMoney: live.blackMoney, vehicles: live.vehicles || [],
      // cfxName = numele raportat de platformă (Steam/Rockstar), serverName =
      // numele personajului RP din baza jocului (users.firstname/lastname) —
      // pot diferi complet; license = identificatorul stabil (license:...).
      // Doar cât jucătorul e online (`live`) — quando offline, folosim doar
      // numele cu care a fost găsit profilul (cleanName), fără să inventăm.
      cfxName: live.name || null,
      serverName: live.serverName || null,
      license: live.license || null,
    } : null,
    lastKnown,
    account: account ? {
      id: account.id, game_id: account.game_id, display_name: account.display_name,
      playtime_minutes: account.playtime_minutes, status: account.status, created_at: account.created_at,
      username: account.username, faction_name: account.faction_name, rank_name: account.rank_name,
    } : null,
    punishments: punishmentResult.rows,
    moderation,
    houses,
    businesses,
    gang,
    tickets,
    recentActivity,
    killsAsVictim,
    killsAsKiller,
  };
}

app.get("/api/admin/player-profile", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const name = String(req.query.name || "").trim();
  if (!name) return res.status(400).json({ error: "Parametrul name este obligatoriu." });
  const profile = await buildPlayerProfile(name);
  if (!profile) return res.status(400).json({ error: "Nume invalid." });
  res.json(profile);
}));

// Profilul PROPRIU al jucătorului logat — aceeași agregare ca mai sus, dar
// legată strict de contul autentificat (nu poate cere profilul altcuiva).
// Necesită un cont de site cu display_name setat (vine din players.display_name,
// populat la prima sincronizare cu jocul) — dacă nu există încă, răspundem
// degradat, nu cu eroare.
app.get("/api/me/profile", auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`SELECT display_name FROM players WHERE user_id = $1 LIMIT 1`, [req.user.sub]);
  const displayName = rows[0]?.display_name;
  if (!displayName) return res.json({ hasGameProfile: false });
  const profile = await buildPlayerProfile(displayName);
  res.json({ hasGameProfile: true, ...profile });
}));

// Leagă contul de site (Discord) de personajul din joc — jucătorul scrie
// "/leagacont" în joc, primește un cod de 6 cifre valabil 5 minute, îl
// introduce aici o singură dată. Verificat DIRECT de moldovarp-api (vezi
// fetchLinkVerify) — site-ul nu are cum să inventeze o legătură validă fără
// codul real generat în joc, deci nu se poate lega contul altcuiva.
//
// TEMPORAR (06.09.2026): restricționat la ADMIN_ROLES, cerut explicit — VIP
// Shop-ul e încă în testare reală și nu trebuie să fie accesibil jucătorilor
// obișnuiți. Legarea de cont există doar ca să poți deschide cutii, deci
// merge sub aceeași restricție. Scoateți `requireRole(...ADMIN_ROLES)` de pe
// toate cele 4 rute de mai jos (astea + /api/vip-shop + /api/vip-shop/deschide)
// când VIP Shop e gata de lansare publică.
app.post("/api/cont/leaga-joc", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const code = String(req.body?.code || "").trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Codul trebuie să aibă 6 cifre." });
  const result = await fetchLinkVerify(code);
  if (!result.ok) {
    const messages = {
      cod_invalid: "Cod invalid sau deja folosit.",
      server_offline: "Serverul de joc nu răspunde momentan — încearcă din nou puțin mai târziu.",
      eroare: "Nu am putut verifica codul.",
    };
    return res.status(400).json({ error: messages[result.error] || messages.eroare });
  }
  await pool.query(
    `UPDATE users SET game_identifier = $1, game_identifier_name = $2 WHERE id = $3`,
    [result.identifier, result.name || null, req.user.sub]
  );
  res.json({ ok: true, name: result.name || null });
}));

app.post("/api/cont/dezleaga-joc", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  await pool.query(`UPDATE users SET game_identifier = NULL, game_identifier_name = NULL WHERE id = $1`, [req.user.sub]);
  res.json({ ok: true });
}));

// Pagina "VIP Shop" — lista recompenselor (cu prețuri și șanse) e publică
// pentru orice cont logat, ca jucătorii să vadă din prima ce oferim, fără să
// fie nevoiți să lege contul mai întâi. Soldul de coins și recompensele "în
// așteptare" necesită cont legat de joc — fără el răspundem "linked: false"
// și lăsăm frontend-ul să ceară legarea abia când chiar încearcă să deschidă
// o cutie (nu e o eroare, doar jucătorul nu a parcurs încă acel pas).
app.get("/api/vip-shop", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`SELECT game_identifier, game_identifier_name FROM users WHERE id = $1`, [req.user.sub]);
  const identifier = rows[0]?.game_identifier;

  if (!identifier) {
    const casesResult = await fetchCasesList();
    return res.json({ linked: false, online: casesResult.online, cases: casesResult.cases });
  }

  const [coinsResult, casesResult] = await Promise.all([fetchCoins(identifier), fetchCasesList()]);
  res.json({
    linked: true,
    name: rows[0].game_identifier_name,
    online: coinsResult.online && casesResult.online,
    coins: coinsResult.coins,
    pending: coinsResult.pending,
    cases: casesResult.cases,
  });
}));

app.post("/api/vip-shop/deschide", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`SELECT game_identifier, game_identifier_name FROM users WHERE id = $1`, [req.user.sub]);
  const identifier = rows[0]?.game_identifier;
  if (!identifier) return res.status(400).json({ error: "Leagă-ți mai întâi contul de personajul din joc." });

  const caseId = String(req.body?.caseId || "").trim();
  if (!caseId) return res.status(400).json({ error: "Lipsește caseId." });

  const outcome = await postOpenCase({ identifier, playerName: rows[0].game_identifier_name, caseId });
  if (!outcome.ok) {
    const messages = {
      coins_insuficienti: "Nu ai suficienți coins pentru această recompensă.",
      caz_necunoscut: "Recompensa nu mai există.",
      server_offline: "Serverul de joc nu răspunde momentan.",
    };
    return res.status(400).json({ error: messages[outcome.error] || "Nu am putut deschide recompensa." });
  }
  res.json({ ok: true, ...outcome.result });
}));

// Webhook primit direct de la Luxu Admin (panoul lor cloud, tab "Webhooks"),
// de fiecare dată când un membru staff face o acțiune (kill, revive, dă/ia
// item, ban etc.). Fără autentificare per-user (nu e un admin logat pe site,
// e Luxu care ne cheamă) — protejat printr-un secret în query string, pentru
// că Luxu nu oferă header-e custom / semnătură configurabile.
// Structura exactă a payload-ului Luxu nu e documentată public, deci
// încercăm mai multe nume de câmp posibile și, indiferent de rezultat,
// păstrăm payload-ul brut (raw) ca să nu pierdem nimic dacă extragerea unui
// câmp anume eșuează pentru un tip de eveniment pe care nu l-am prevăzut.
const LUXU_WEBHOOK_SECRET = process.env.LUXU_WEBHOOK_SECRET || "";

function pickField(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim().slice(0, 500);
  }
  return null;
}

app.post("/api/webhooks/luxu", asyncRoute(async (req, res) => {
  if (!LUXU_WEBHOOK_SECRET || req.query.key !== LUXU_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const staff = pickField(body, ["admin", "staff", "moderator", "executor", "by", "source_name", "adminName", "staffName", "username", "author"]);
  const target = pickField(body, ["target", "player", "target_name", "targetName", "victim", "targetPlayer"]);
  const action = pickField(body, ["action", "type", "event", "command", "title"]);
  const reason = pickField(body, ["reason", "note", "notes", "details", "description"]);
  await pool.query(
    "INSERT INTO admin_action_logs(source, staff_name, target_name, action, reason, raw) VALUES ($1,$2,$3,$4,$5,$6)",
    ["luxu", staff, target, action, reason, JSON.stringify(body)]
  );
  res.json({ ok: true });
}));

// Curățare periodică a acțiunilor de staff (Luxu) — păstrăm doar ultimele 30
// de zile, la fel ca tabela moldovarp_logs de pe serverul de joc.
setInterval(() => {
  pool.query("DELETE FROM admin_action_logs WHERE created_at < NOW() - INTERVAL '30 days'")
    .catch(err => console.error("Curățarea admin_action_logs a eșuat:", err.message));
}, 6 * 60 * 60 * 1000);

// URL-ul panoului txAdmin al serverului de joc — NU e hardcodat în fișierele
// statice (oricine ar putea deschide admin-txadmin.html și vedea sursa),
// vine dintr-o variabilă de mediu și e servit doar către co-fondator/owner,
// autentificați. txAdmin are oricum propriul login separat — asta doar evită
// să afișăm public adresa panoului către vizitatori neautentificați.
const TXADMIN_URL = process.env.TXADMIN_URL || "";

app.get("/api/admin/txadmin-url", auth, requireRole(...FOUNDER_ROLES), asyncRoute(async (_req, res) => {
  res.json({ url: TXADMIN_URL || null });
}));

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password || password.length < 8)
    return res.status(400).json({ error: "Username, email și parolă de minimum 8 caractere sunt obligatorii." });

  const role = await pool.query("SELECT id FROM roles WHERE name='player'");
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      "INSERT INTO users(username,email,password_hash,role_id) VALUES($1,$2,$3,$4) RETURNING id,username,email",
      [username.trim(), email.trim().toLowerCase(), hash, role.rows[0].id]
    );
    res.status(201).json({ user: rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Username sau email deja folosit." });
    throw e;
  }
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const { login, password } = req.body;
  const { rows } = await pool.query(
    `SELECT u.*, r.name AS role_name
     FROM users u JOIN roles r ON r.id=u.role_id
     WHERE u.username=$1 OR u.email=$1 LIMIT 1`, [login?.trim()]
  );
  const user = rows[0];
  if (!user || !user.is_active || !user.password_hash || !(await bcrypt.compare(password || "", user.password_hash)))
    return res.status(401).json({ error: "Date de autentificare incorecte." });

  const token = signUser(user);
  await logAction(user.id, "auth.login", "user", user.id, null, req.ip);
  res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role_name }
  });
}));

// ---------------------------------------------------------------------------
// Email de confirmare (cod de 6 cifre) — folosit la "Setează parola"
// ---------------------------------------------------------------------------
// Trimitem prin API-ul HTTP al Brevo (nu prin SMTP!) — Railway blochează
// traficul SMTP ieșit (porturile 465/587) pe planurile Free/Trial/Hobby, ceea
// ce făcea ca trimiterea prin nodemailer să rămână agățată la infinit fără
// nicio eroare vizibilă. API-ul e peste HTTPS normal, deci nu e blocat.
// Variabile de mediu necesare: BREVO_API_KEY (din Brevo → SMTP & API → API
// Keys, NU cheia SMTP) și EMAIL_FROM (adresa de expeditor — de obicei
// adresa cu care te-ai înregistrat pe Brevo, care e verificată automat).
function emailApiConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

// intro = propoziția care apare deasupra codului, adaptată la context (email
// de confirmare la setarea parolei, vs. cod de resetare parolă uitată etc).
async function sendCodeEmail(to, code, { subject, intro }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_FROM, name: "Moldova RP" },
      to: [{ email: to }],
      subject,
      textContent: `${intro} ${code}\n\nCodul expiră în 15 minute. Dacă nu ai cerut tu asta, ignoră acest email.`,
      htmlContent: `<p>${intro}</p>
           <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>
           <p>Codul expiră în 15 minute. Dacă nu ai cerut tu asta, ignoră acest email.</p>`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API a răspuns cu ${res.status}: ${body.slice(0, 300)}`);
  }
}

function sendVerificationEmail(to, code) {
  return sendCodeEmail(to, code, {
    subject: `Codul tău de confirmare: ${code}`,
    intro: "Codul tău de confirmare pentru contul de pe moldovarp.md este:",
  });
}

function sendResetCodeEmail(to, code) {
  return sendCodeEmail(to, code, {
    subject: `Codul tău de resetare a parolei: ${code}`,
    intro: "Cineva (probabil tu) a cerut resetarea parolei pentru contul de pe moldovarp.md. Codul tău este:",
  });
}

function generateVerifyCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 cifre, 100000-999999
}

// Auto-service, în DOI PAȘI — cerut explicit, ca simpla deținere a unui cont
// (chiar și prin Discord plafonat la "player", mai sus) să nu fie de-ajuns
// ca să-ți pui o parolă pe un email pe care nu-l deții cu adevărat:
//
// Pasul 1 (acest endpoint): primește email+parolă, dar NU le salvează încă
// pe cont — le ține "în așteptare" (pending_email/pending_password_hash) și
// trimite un cod de 6 cifre pe emailul dat. Dacă emailul e deja folosit de
// ALT cont, refuzăm aici (altfel am da acces la parola altcuiva, aparent).
// Apelat a doua oară (ex: codul a expirat), pur și simplu suprascrie cererea
// în așteptare și retrimite un cod nou — funcționează și ca "retrimite codul".
//
// Pasul 2 (endpoint-ul de mai jos, /confirm): abia după codul corect, emailul
// și parola devin reale pe cont. Până atunci, contul rămâne exact cum era
// (fără parolă utilizabilă), deci accesul de admin tot nu se poate obține
// decât prin login.html cu email+parolă, DUPĂ confirmare.
app.post("/api/auth/set-password", auth, asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
    return res.status(400).json({ error: "Email invalid." });
  if (!password || password.length < 8)
    return res.status(400).json({ error: "Parola trebuie să aibă minimum 8 caractere." });
  if (!emailApiConfigured())
    return res.status(503).json({ error: "Trimiterea de email-uri nu este configurată încă pe server." });

  const existing = await pool.query("SELECT id FROM users WHERE email=$1 AND id<>$2", [cleanEmail, req.user.sub]);
  if (existing.rows[0]) return res.status(409).json({ error: "Acest email este deja folosit de alt cont." });

  const hash = await bcrypt.hash(password, 12);
  const code = generateVerifyCode();
  await pool.query(
    `UPDATE users SET pending_email=$1, pending_password_hash=$2,
            email_verify_code=$3, email_verify_expires=NOW() + INTERVAL '15 minutes', updated_at=NOW()
     WHERE id=$4`,
    [cleanEmail, hash, code, req.user.sub]
  );

  try {
    await sendVerificationEmail(cleanEmail, code);
  } catch (e) {
    console.error("Trimiterea emailului de confirmare a eșuat:", e.message);
    return res.status(502).json({ error: "Nu am putut trimite emailul de confirmare. Încearcă din nou." });
  }

  res.json({ ok: true, message: "Cod trimis pe email." });
}));

app.post("/api/auth/set-password/confirm", auth, asyncRoute(async (req, res) => {
  const { code } = req.body;
  const { rows } = await pool.query(
    `SELECT pending_email, pending_password_hash, email_verify_code, email_verify_expires
     FROM users WHERE id=$1`, [req.user.sub]
  );
  const row = rows[0];
  if (!row || !row.pending_email || !row.email_verify_code)
    return res.status(400).json({ error: "Nu există nicio confirmare în așteptare — cere din nou codul." });
  if (new Date(row.email_verify_expires) < new Date())
    return res.status(400).json({ error: "Codul a expirat. Cere unul nou." });
  if (String(code || "").trim() !== row.email_verify_code)
    return res.status(400).json({ error: "Cod incorect." });

  await pool.query(
    `UPDATE users SET email=$1, password_hash=$2,
            pending_email=NULL, pending_password_hash=NULL, email_verify_code=NULL, email_verify_expires=NULL,
            updated_at=NOW()
     WHERE id=$3`,
    [row.pending_email, row.pending_password_hash, req.user.sub]
  );
  await logAction(req.user.sub, "auth.set_password", "user", req.user.sub, null, req.ip);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// "Am uitat parola" — cod de 6 cifre pe email, apoi parolă nouă
// ---------------------------------------------------------------------------
// Merge DOAR pentru conturi care au deja un email+parolă reale (adică au
// trecut prin înregistrare directă sau prin "Setează parola" de mai sus) —
// un cont creat doar prin Discord nu are un email verificat de care să ne
// putem folosi aici, deci îl tratăm la fel ca "email inexistent".
//
// Ca să nu dăm de gol cine are cont pe site (enumerare de emailuri), acest
// endpoint răspunde mereu cu același mesaj de succes, indiferent dacă
// emailul există sau nu — codul chiar pleacă doar dacă există un cont
// potrivit, dar cel care întreabă nu poate distinge cele două cazuri.
app.post("/api/auth/forgot-password", asyncRoute(async (req, res) => {
  const cleanEmail = (req.body.email || "").trim().toLowerCase();
  const genericOk = { ok: true, message: "Dacă adresa există în baza noastră de date, a fost trimis un cod pe email." };
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.json(genericOk);
  if (!emailApiConfigured())
    return res.status(503).json({ error: "Trimiterea de email-uri nu este configurată încă pe server." });

  const { rows } = await pool.query(
    "SELECT id FROM users WHERE email=$1 AND password_hash IS NOT NULL", [cleanEmail]
  );
  const user = rows[0];
  if (!user) return res.json(genericOk);

  const code = generateVerifyCode();
  await pool.query(
    `UPDATE users SET reset_password_code=$1, reset_password_expires=NOW() + INTERVAL '15 minutes', updated_at=NOW()
     WHERE id=$2`,
    [code, user.id]
  );
  try {
    await sendResetCodeEmail(cleanEmail, code);
  } catch (e) {
    console.error("Trimiterea emailului de resetare a eșuat:", e.message);
    // Tot răspuns generic — nu vrem să confirmăm existența contului prin
    // diferența dintre "a mers" și "n-a mers să trimită".
  }
  res.json(genericOk);
}));

app.post("/api/auth/reset-password/confirm", asyncRoute(async (req, res) => {
  const cleanEmail = (req.body.email || "").trim().toLowerCase();
  const { code, password } = req.body;
  if (!password || password.length < 8)
    return res.status(400).json({ error: "Parola trebuie să aibă minimum 8 caractere." });

  const { rows } = await pool.query(
    "SELECT id, reset_password_code, reset_password_expires FROM users WHERE email=$1", [cleanEmail]
  );
  const user = rows[0];
  if (!user || !user.reset_password_code)
    return res.status(400).json({ error: "Cod invalid sau expirat. Cere unul nou." });
  if (new Date(user.reset_password_expires) < new Date())
    return res.status(400).json({ error: "Codul a expirat. Cere unul nou." });
  if (String(code || "").trim() !== user.reset_password_code)
    return res.status(400).json({ error: "Cod incorect." });

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `UPDATE users SET password_hash=$1, reset_password_code=NULL, reset_password_expires=NULL, updated_at=NOW()
     WHERE id=$2`,
    [hash, user.id]
  );
  await logAction(user.id, "auth.reset_password", "user", user.id, null, req.ip);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Discord OAuth login (v0.5)
// ---------------------------------------------------------------------------

function discordConfigured() {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_REDIRECT_URI);
}

app.get("/api/auth/discord", (req, res) => {
  if (!discordConfigured()) return res.status(503).send("Conectarea cu Discord nu este configurată.");
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify"
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

app.get("/api/auth/discord/callback", asyncRoute(async (req, res) => {
  if (!discordConfigured()) return res.status(503).send("Conectarea cu Discord nu este configurată.");
  const { code, error: discordError } = req.query;
  if (discordError || !code) return res.redirect("/auth-callback.html?error=discord_denied");

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      })
    });
    if (!tokenRes.ok) throw new Error(`Discord token exchange failed: ${tokenRes.status}`);
    const { access_token } = await tokenRes.json();

    const profileRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    if (!profileRes.ok) throw new Error(`Discord profile fetch failed: ${profileRes.status}`);
    const profile = await profileRes.json();

    const roleRes = await pool.query("SELECT id FROM roles WHERE name='player'");
    const baseUsername = (profile.username || `player_${profile.id}`).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 28) || "player";

    let user;
    const existing = await pool.query("SELECT * FROM users WHERE discord_id=$1", [profile.id]);
    if (existing.rows[0]) {
      const updated = await pool.query(
        `UPDATE users SET discord_username=$1, discord_avatar=$2, updated_at=NOW()
         WHERE id=$3 RETURNING *`,
        [profile.username, profile.avatar, existing.rows[0].id]
      );
      user = updated.rows[0];
    } else {
      let attemptUsername = baseUsername;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const inserted = await pool.query(
            `INSERT INTO users(username, role_id, discord_id, discord_username, discord_avatar)
             VALUES($1,$2,$3,$4,$5) RETURNING *`,
            [attemptUsername, roleRes.rows[0].id, profile.id, profile.username, profile.avatar]
          );
          user = inserted.rows[0];
          break;
        } catch (e) {
          if (e.code === "23505" && attempt < 4) {
            attemptUsername = `${baseUsername}_${profile.id.slice(-4)}`;
            continue;
          }
          throw e;
        }
      }
      await pool.query(
        `INSERT INTO players(user_id, display_name) VALUES($1,$2)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id, profile.username || attemptUsername]
      );
      await logAction(user.id, "auth.discord_signup", "user", user.id, { discordId: profile.id }, req.ip);
    }

    // SECURITATE (cerut explicit): un login prin Discord acordă în acest
    // token MEREU doar rolul de jucător obișnuit, INDIFERENT ce rol are
    // contul cu adevărat în baza de date. Motivul: dacă cineva fură contul
    // de Discord al unui admin, autentificarea prin OAuth de mai sus tot ar
    // reuși (Discord confirmă identitatea corect) — dar tokenul rezultat nu
    // va avea niciodată voie să treacă de requireRole(...) pe rutele de
    // admin, pentru că verificarea aia se uită STRICT la rolul din acest
    // token (vezi funcția requireRole), nu la rolul din baza de date. Adminii
    // trebuie să folosească întotdeauna email+parolă (/api/auth/login) ca
    // să primească tokenul cu rolul lor real. Vezi și /api/me, care separă
    // explicit rolul EFECTIV al sesiunii (din token) de rolul contului din
    // baza de date, ca dashboard-ul să poată totuși recunoaște un admin fără
    // parolă încă și să-i ceară să-și seteze una.
    const token = signUser({ id: user.id, username: user.username, role_name: 'player' });
    await logAction(user.id, "auth.discord_login", "user", user.id, null, req.ip);

    res.redirect(`/auth-callback.html#token=${encodeURIComponent(token)}`);
  } catch (e) {
    console.error("Discord OAuth error:", e);
    res.redirect("/auth-callback.html?error=discord_failed");
  }
}));

app.get("/api/me", auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.email,r.name db_role,(u.password_hash IS NOT NULL) has_password,
            u.discord_id, u.discord_username, u.discord_avatar,
            p.id player_id,p.game_id,p.display_name,p.playtime_minutes,p.status,
            f.id faction_id, f.name faction_name, fr.id rank_id, fr.name rank_name
     FROM users u JOIN roles r ON r.id=u.role_id
     LEFT JOIN players p ON p.user_id=u.id
     LEFT JOIN faction_members fm ON fm.player_id=p.id
     LEFT JOIN factions f ON f.id=fm.faction_id
     LEFT JOIN faction_ranks fr ON fr.id=fm.rank_id
     WHERE u.id=$1
     LIMIT 1`, [req.user.sub]
  );
  if (!rows[0]) return res.status(404).json({ error: "Cont inexistent." });
  const row = rows[0];
  // "role" e rolul EFECTIV al sesiunii curente (vine din token — pentru un
  // login prin Discord e mereu "player", vezi /api/auth/discord/callback),
  // NU neapărat rolul contului din baza de date — acesta din urmă rămâne
  // disponibil separat ca "dbRole", exact ca dashboard-ul să poată recunoaște
  // "acest cont e de admin, dar sesiunea asta (prin Discord) nu are voie să
  // acționeze ca admin" și să arate un buton de "Setează parolă" în loc să
  // pretindă pur și simplu că userul n-are rang.
  res.json({ ...row, role: req.user.role, dbRole: row.db_role, hasPassword: row.has_password });
}));

app.get("/api/regulations", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id,title,slug,category,version,updated_at FROM regulations WHERE is_published=true ORDER BY category,title"
  );
  res.json(rows);
}));

app.get("/api/regulations/:slug", asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM regulations WHERE slug=$1 AND is_published=true LIMIT 1", [req.params.slug]
  );
  if (!rows[0]) return res.status(404).json({ error: "Regulamentul nu există." });
  res.json(rows[0]);
}));

app.get("/api/factions", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id,name,type,description,is_active FROM factions ORDER BY type,name"
  );
  res.json(rows);
}));

app.get("/api/announcements", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id,a.title,a.content,a.category,a.image_url,a.video_url,a.published_at,u.username author
     FROM announcements a LEFT JOIN users u ON u.id=a.author_id
     WHERE a.is_published=true ORDER BY a.published_at DESC LIMIT 30`
  );
  res.json(rows);
}));

// Conținut editabil al paginilor publice (Admin → Conținut pagini — vezi
// scripts/seed-content.js pentru valorile inițiale). Public: doar
// block_key/type/content dintr-o singură pagină, ca hartă { block_key:
// {type,content} } — cel mai simplu de consumat direct din scriptul fiecărei
// pagini publice (index.html, joburi.html etc.), fără alt procesare.
app.get("/api/content/:page", asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT block_key, type, content FROM page_blocks WHERE page=$1 ORDER BY sort_order", [req.params.page]
  );
  const map = {};
  for (const r of rows) map[r.block_key] = { type: r.type, content: r.content };
  res.json(map);
}));

// Tichete — orice utilizator autentificat își poate deschide și vedea
// propriile tichete. Dovezile (poze/filmări) se atașează ca LINK (Streamable,
// YouTube, Discord etc.), nu ca fișier încărcat direct — evită complet
// problema stocării persistente de fișiere mari pe Railway.
app.get("/api/tickets", auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id,subject,category,status,evidence_url,created_at,updated_at
     FROM tickets WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.user.sub]
  );
  res.json(rows);
}));

app.post("/api/tickets", auth, asyncRoute(async (req, res) => {
  const { subject, category, description, evidence_url } = req.body;
  if (!subject?.trim() || !description?.trim())
    return res.status(400).json({ error: "Subiectul și descrierea sunt obligatorii." });
  const link = evidence_url?.trim() || null;
  if (!link)
    return res.status(400).json({ error: "Linkul dovezii este obligatoriu." });
  if (!/^https?:\/\/\S+$/i.test(link))
    return res.status(400).json({ error: "Linkul trebuie să înceapă cu http:// sau https://." });
  const { rows } = await pool.query(
    `INSERT INTO tickets(user_id, subject, category, description, evidence_url)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.sub, subject.trim(), (category || "general").trim(), description.trim(), link]
  );
  await logAction(req.user.sub, "ticket.create", "ticket", rows[0].id, { subject: subject.trim() }, req.ip);
  res.status(201).json(rows[0]);
}));

app.get("/api/tickets/:id", auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM tickets WHERE id=$1 AND user_id=$2 LIMIT 1",
    [req.params.id, req.user.sub]
  );
  if (!rows[0]) return res.status(404).json({ error: "Tichetul nu există." });
  const replies = await pool.query(
    `SELECT tr.id, tr.message, tr.created_at, u.username author, r.name author_role
     FROM ticket_replies tr
     JOIN users u ON u.id = tr.author_id
     JOIN roles r ON r.id = u.role_id
     WHERE tr.ticket_id = $1 ORDER BY tr.created_at ASC`,
    [req.params.id]
  );
  res.json({ ...rows[0], replies: replies.rows });
}));

app.post("/api/tickets/:id/replies", auth, asyncRoute(async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Mesajul nu poate fi gol." });
  const ticket = await pool.query(
    "SELECT status FROM tickets WHERE id=$1 AND user_id=$2 LIMIT 1",
    [req.params.id, req.user.sub]
  );
  if (!ticket.rows[0]) return res.status(404).json({ error: "Tichetul nu există." });
  if (["resolved", "closed"].includes(ticket.rows[0].status))
    return res.status(400).json({ error: "Acest tichet este închis — nu mai poți adăuga răspunsuri." });
  const { rows } = await pool.query(
    "INSERT INTO ticket_replies(ticket_id, author_id, message) VALUES($1,$2,$3) RETURNING *",
    [req.params.id, req.user.sub, message.trim()]
  );
  await pool.query("UPDATE tickets SET updated_at=NOW() WHERE id=$1", [req.params.id]);
  res.status(201).json(rows[0]);
}));

app.get("/api/admin/stats", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (_req, res) => {
  const q = async sql => (await pool.query(sql)).rows[0].count;
  res.json({
    players: await q("SELECT COUNT(*) FROM players"),
    online: await q("SELECT COUNT(*) FROM players WHERE status='online'"),
    complaints: await q("SELECT COUNT(*) FROM complaints WHERE status NOT IN ('closed','resolved')"),
    punishments: await q("SELECT COUNT(*) FROM punishments WHERE created_at >= date_trunc('month', NOW())")
  });
}));

app.get("/api/admin/audit-logs", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT l.*,u.username actor FROM audit_logs l
     LEFT JOIN users u ON u.id=l.actor_id
     ORDER BY l.created_at DESC LIMIT 100`
  );
  res.json(rows);
}));

// ---------------------------------------------------------------------------
// Utilizatori — listă + schimbare rang (player/moderator/admin/owner).
// Vizibilă pentru admin/owner; schimbarea rangului e restricționată la owner,
// ca să nu poată un admin să se auto-promoveze sau să promoveze pe altcineva
// la owner/admin fără acordul proprietarului contului.
// ---------------------------------------------------------------------------

const VALID_ROLES = ["player", "moderator", "admin", "co-fondator", "owner"];

app.get("/api/admin/users", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.discord_id, u.discord_username, u.discord_avatar,
            u.is_active, u.created_at, r.name AS role, (u.password_hash IS NOT NULL) AS has_password
     FROM users u
     JOIN roles r ON r.id = u.role_id
     ORDER BY u.created_at DESC`
  );
  res.json(rows);
}));

app.put("/api/admin/users/:id/role", auth, requireRole("owner"), asyncRoute(async (req, res) => {
  const { role } = req.body;
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ error: "Rang invalid." });

  const roleRow = await pool.query("SELECT id FROM roles WHERE name=$1", [role]);
  if (!roleRow.rows[0]) return res.status(400).json({ error: "Rang invalid." });

  const { rows } = await pool.query(
    `UPDATE users SET role_id=$1, updated_at=NOW() WHERE id=$2
     RETURNING id, username, discord_username`,
    [roleRow.rows[0].id, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Utilizatorul nu există." });

  await logAction(req.user.sub, "user.role_change", "user", req.params.id, { role }, req.ip);
  res.json({ ...rows[0], role });
}));

// ---------------------------------------------------------------------------
// Players (v0.4)
// ---------------------------------------------------------------------------

app.get("/api/admin/players", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const q = (req.query.q || "").trim();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const params = [];
  let where = "";
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE p.display_name ILIKE $${params.length} OR CAST(p.game_id AS TEXT) ILIKE $${params.length} OR u.username ILIKE $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT p.id, p.game_id, p.display_name, p.playtime_minutes, p.status,
            u.username, u.email,
            f.name AS faction_name, fr.name AS rank_name
     FROM players p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN faction_members fm ON fm.player_id = p.id
     LEFT JOIN factions f ON f.id = fm.faction_id
     LEFT JOIN faction_ranks fr ON fr.id = fm.rank_id
     ${where}
     ORDER BY p.display_name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows);
}));

app.get("/api/admin/players/:id", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT p.*, u.username, u.email
     FROM players p JOIN users u ON u.id = p.user_id
     WHERE p.id = $1`, [id]
  );
  const player = rows[0];
  if (!player) return res.status(404).json({ error: "Jucătorul nu există." });

  const [factions, punishments, complaints, ckRequests] = await Promise.all([
    pool.query(
      `SELECT f.id, f.name, f.type, fr.id rank_id, fr.name rank_name, fm.joined_at
       FROM faction_members fm
       JOIN factions f ON f.id = fm.faction_id
       LEFT JOIN faction_ranks fr ON fr.id = fm.rank_id
       WHERE fm.player_id = $1`, [id]
    ),
    pool.query(
      `SELECT pu.id, pu.type, pu.reason, pu.duration_minutes, pu.created_at, u.username issued_by
       FROM punishments pu LEFT JOIN users u ON u.id = pu.issued_by
       WHERE pu.player_id = $1 ORDER BY pu.created_at DESC LIMIT 20`, [id]
    ),
    pool.query(
      `SELECT id, subject, status, created_at, updated_at
       FROM complaints WHERE player_id = $1 ORDER BY created_at DESC LIMIT 20`, [id]
    ),
    pool.query(
      `SELECT id, status, reason, created_at, decided_at
       FROM ck_requests WHERE player_id = $1 ORDER BY created_at DESC LIMIT 20`, [id]
    )
  ]);

  res.json({
    ...player,
    factions: factions.rows,
    punishments: punishments.rows,
    complaints: complaints.rows,
    ck_requests: ckRequests.rows
  });
}));

app.put("/api/admin/players/:id", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { display_name, status, game_id } = req.body;
  const allowedStatus = ["online", "offline", "banned"];
  if (status && !allowedStatus.includes(status))
    return res.status(400).json({ error: `Status invalid. Valori acceptate: ${allowedStatus.join(", ")}.` });

  const { rows } = await pool.query(
    `UPDATE players SET
       display_name = COALESCE($1, display_name),
       status = COALESCE($2, status),
       game_id = COALESCE($3, game_id),
       updated_at = NOW()
     WHERE id = $4
     RETURNING id, game_id, display_name, playtime_minutes, status`,
    [display_name || null, status || null, game_id || null, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Jucătorul nu există." });

  await logAction(req.user.sub, "player.update", "player", id, req.body, req.ip);
  res.json(rows[0]);
}));

app.post("/api/admin/players/:id/faction", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { faction_id, rank_id } = req.body;
  if (!faction_id) return res.status(400).json({ error: "faction_id este obligatoriu." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM faction_members WHERE player_id = $1", [id]);
    const { rows } = await client.query(
      "INSERT INTO faction_members(player_id,faction_id,rank_id) VALUES($1,$2,$3) RETURNING *",
      [id, faction_id, rank_id || null]
    );
    await client.query("COMMIT");
    await logAction(req.user.sub, "player.faction_assign", "player", id, { faction_id, rank_id }, req.ip);
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23503") return res.status(404).json({ error: "Jucătorul sau facțiunea nu există." });
    throw e;
  } finally {
    client.release();
  }
}));

app.delete("/api/admin/players/:id/faction", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query("DELETE FROM faction_members WHERE player_id = $1", [id]);
  await logAction(req.user.sub, "player.faction_remove", "player", id, null, req.ip);
  res.json({ removed: rowCount });
}));

// ---------------------------------------------------------------------------
// Sancțiuni — listă (active/toate) + emitere. Ținta e numele jucătorului din
// JOC (target_name), nu un cont de site — majoritatea jucătorilor de pe
// server nu au și cont pe site, deci nu poate fi obligatoriu un player_id.
// player_id rămâne opțional, doar pentru cazul în care jucătorul chiar are
// și profil pe site. Site-ul nu aplică singur banul pe serverul de FiveM,
// e doar un jurnal vizibil pentru staff.
// ---------------------------------------------------------------------------

const PUNISHMENT_TYPES = ["ban", "mute", "kick", "warn"];

app.get("/api/admin/punishments", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const activeOnly = req.query.status !== "all";
  const { rows } = await pool.query(
    `SELECT pu.id, pu.type, pu.reason, pu.duration_minutes, pu.created_at,
            u.username AS issued_by,
            p.id AS player_id, COALESCE(p.display_name, pu.target_name) AS display_name, p.game_id,
            CASE WHEN pu.duration_minutes IS NOT NULL
                 THEN pu.created_at + (pu.duration_minutes || ' minutes')::interval
                 ELSE NULL END AS expires_at
     FROM punishments pu
     LEFT JOIN players p ON p.id = pu.player_id
     LEFT JOIN users u ON u.id = pu.issued_by
     ${activeOnly ? "WHERE pu.duration_minutes IS NULL OR pu.created_at + (pu.duration_minutes || ' minutes')::interval > NOW()" : ""}
     ORDER BY pu.created_at DESC
     LIMIT 200`
  );
  res.json(rows);
}));

app.post("/api/admin/punishments", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const { target_name, player_id, type, reason, duration_minutes } = req.body;
  const name = target_name?.trim();
  if (!name || !type || !reason?.trim())
    return res.status(400).json({ error: "Numele jucătorului, tipul și motivul sunt obligatorii." });
  if (!PUNISHMENT_TYPES.includes(type))
    return res.status(400).json({ error: `Tip invalid. Valori acceptate: ${PUNISHMENT_TYPES.join(", ")}.` });

  let linkedPlayerId = null;
  if (player_id) {
    const player = await pool.query("SELECT id FROM players WHERE id=$1", [player_id]);
    if (player.rows[0]) linkedPlayerId = player.rows[0].id;
  }

  const minutes = duration_minutes ? Math.max(1, Number(duration_minutes)) : null;
  if (duration_minutes && !Number.isFinite(minutes))
    return res.status(400).json({ error: "Durata trebuie să fie un număr de minute." });

  const { rows } = await pool.query(
    `INSERT INTO punishments(player_id, target_name, type, reason, duration_minutes, issued_by)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id, type, reason, duration_minutes, created_at`,
    [linkedPlayerId, name, type, reason.trim(), minutes, req.user.sub]
  );
  await logAction(req.user.sub, "punishment.create", "player", linkedPlayerId, { target_name: name, type, reason: reason.trim(), duration_minutes: minutes }, req.ip);
  res.status(201).json({ ...rows[0], display_name: name });
}));

// ---------------------------------------------------------------------------
// Factions & ranks (v0.4)
// ---------------------------------------------------------------------------

app.get("/api/admin/factions/:id", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query("SELECT * FROM factions WHERE id=$1", [id]);
  const faction = rows[0];
  if (!faction) return res.status(404).json({ error: "Facțiunea nu există." });
  const ranks = await pool.query("SELECT * FROM faction_ranks WHERE faction_id=$1 ORDER BY level", [id]);
  const members = await pool.query(
    `SELECT p.id, p.display_name, fr.name rank_name
     FROM faction_members fm JOIN players p ON p.id=fm.player_id
     LEFT JOIN faction_ranks fr ON fr.id=fm.rank_id
     WHERE fm.faction_id=$1`, [id]
  );
  res.json({ ...faction, ranks: ranks.rows, members: members.rows });
}));

app.post("/api/admin/factions", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { name, type, description } = req.body;
  if (!name || !type) return res.status(400).json({ error: "Numele și tipul facțiunii sunt obligatorii." });
  try {
    const { rows } = await pool.query(
      "INSERT INTO factions(name,type,description) VALUES($1,$2,$3) RETURNING *",
      [name.trim(), type.trim(), description || null]
    );
    await logAction(req.user.sub, "faction.create", "faction", rows[0].id, req.body, req.ip);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Există deja o facțiune cu acest nume." });
    throw e;
  }
}));

app.put("/api/admin/factions/:id", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { name, type, description, is_active } = req.body;
  const { rows } = await pool.query(
    `UPDATE factions SET
       name = COALESCE($1, name),
       type = COALESCE($2, type),
       description = COALESCE($3, description),
       is_active = COALESCE($4, is_active)
     WHERE id = $5 RETURNING *`,
    [name || null, type || null, description ?? null, is_active ?? null, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Facțiunea nu există." });
  await logAction(req.user.sub, "faction.update", "faction", id, req.body, req.ip);
  res.json(rows[0]);
}));

app.post("/api/admin/factions/:id/ranks", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { name, level } = req.body;
  if (!name || level === undefined) return res.status(400).json({ error: "Numele și nivelul rank-ului sunt obligatorii." });
  try {
    const { rows } = await pool.query(
      "INSERT INTO faction_ranks(faction_id,name,level) VALUES($1,$2,$3) RETURNING *",
      [id, name.trim(), Number(level)]
    );
    await logAction(req.user.sub, "faction_rank.create", "faction_rank", rows[0].id, { faction_id: id, ...req.body }, req.ip);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Există deja un rank cu acest nivel în facțiune." });
    if (e.code === "23503") return res.status(404).json({ error: "Facțiunea nu există." });
    throw e;
  }
}));

app.put("/api/admin/factions/ranks/:rankId", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { rankId } = req.params;
  const { name, level } = req.body;
  const { rows } = await pool.query(
    `UPDATE faction_ranks SET
       name = COALESCE($1, name),
       level = COALESCE($2, level)
     WHERE id = $3 RETURNING *`,
    [name || null, level ?? null, rankId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Rank-ul nu există." });
  await logAction(req.user.sub, "faction_rank.update", "faction_rank", rankId, req.body, req.ip);
  res.json(rows[0]);
}));

app.delete("/api/admin/factions/ranks/:rankId", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { rankId } = req.params;
  const { rowCount } = await pool.query("DELETE FROM faction_ranks WHERE id = $1", [rankId]);
  if (!rowCount) return res.status(404).json({ error: "Rank-ul nu există." });
  await logAction(req.user.sub, "faction_rank.delete", "faction_rank", rankId, null, req.ip);
  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Regulations content management (v0.5)
// ---------------------------------------------------------------------------

function slugify(text) {
  return text
    .toString()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

app.get("/api/admin/regulations", auth, requireRole(...MOD_ROLES), asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM regulations ORDER BY category, title"
  );
  res.json(rows);
}));

app.get("/api/admin/regulations/:id", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM regulations WHERE id=$1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Regulamentul nu există." });
  res.json(rows[0]);
}));

app.post("/api/admin/regulations", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { title, category, content, version, is_published, slug } = req.body;
  if (!title || !category || !content)
    return res.status(400).json({ error: "Titlu, categorie și conținut sunt obligatorii." });
  const finalSlug = (slug && slug.trim()) || slugify(title);
  try {
    const { rows } = await pool.query(
      `INSERT INTO regulations(title, slug, category, content, version, is_published)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title.trim(), finalSlug, category.trim(), content, version || "1.0", is_published ?? true]
    );
    await logAction(req.user.sub, "regulation.create", "regulation", rows[0].id, { title, category }, req.ip);
    if (rows[0].is_published) notifyDiscordRegulation(rows[0], "adăugat", { editedBy: req.user.username });
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Există deja un regulament cu acest slug." });
    throw e;
  }
}));

app.put("/api/admin/regulations/:id", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { title, category, content, version, is_published, slug } = req.body;
  try {
    // Citim starea dinainte de update, ca să putem trimite pe Discord exact
    // ce s-a schimbat (titlu + diff de conținut), nu tot textul din nou.
    const before = await pool.query("SELECT title, content FROM regulations WHERE id=$1", [id]);
    const { rows } = await pool.query(
      `UPDATE regulations SET
         title = COALESCE($1, title),
         slug = COALESCE($2, slug),
         category = COALESCE($3, category),
         content = COALESCE($4, content),
         version = COALESCE($5, version),
         is_published = COALESCE($6, is_published),
         updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [title || null, slug || null, category || null, content || null, version || null, is_published ?? null, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Regulamentul nu există." });
    await logAction(req.user.sub, "regulation.update", "regulation", id, req.body, req.ip);
    if (rows[0].is_published) {
      const prev = before.rows[0];
      const { added, removed } = prev ? diffLines(prev.content, rows[0].content) : { added: [], removed: [] };
      notifyDiscordRegulation(rows[0], "modificat", {
        editedBy: req.user.username,
        addedLines: added,
        removedLines: removed,
        titleChanged: !!(prev && prev.title !== rows[0].title),
        oldTitle: prev?.title,
      });
    }
    res.json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Există deja un regulament cu acest slug." });
    throw e;
  }
}));

app.delete("/api/admin/regulations/:id", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query("DELETE FROM regulations WHERE id = $1", [id]);
  if (!rowCount) return res.status(404).json({ error: "Regulamentul nu există." });
  await logAction(req.user.sub, "regulation.delete", "regulation", id, null, req.ip);
  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Announcements content management (v0.5)
// ---------------------------------------------------------------------------

// Trimite anunțul pe Discord printr-un Webhook (Server Settings > Integrations
// > Webhooks — nu necesită bot). "Fire and forget": dacă Discord e jos sau
// webhook-ul nu e configurat, publicarea anunțului tot reușește — doar
// notificarea eșuează silențios (logată în consolă, nu blocată/afișată userului).
const DISCORD_ANNOUNCE_WEBHOOK = process.env.DISCORD_ANNOUNCE_WEBHOOK || "";
const SITE_URL = process.env.SITE_URL || "https://web-production-4fd88.up.railway.app";

// Discord cere un URL absolut pentru imaginile din embed (nu acceptă căi
// relative de genul "assets/poza.jpg", care merg perfect pe site-ul nostru
// unde browserul le rezolvă față de domeniu, dar Discord le respinge cu 400).
// Adminul poate lipi orice formă în panou — o facem absolută aici, o singură
// dată, indiferent unde e folosită.
function toAbsoluteUrl(url) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${SITE_URL}/${trimmed.replace(/^\/+/, "")}`;
}

async function notifyDiscordAnnouncement(announcement) {
  if (!DISCORD_ANNOUNCE_WEBHOOK) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    // image_url e opțional — dacă adminul a atașat o poză/banner anunțului,
    // apare mare, jos în embed; logo-ul site-ului rămâne mic, sus (thumbnail).
    const embed = {
      author: { name: "Moldova RP — Anunțuri", icon_url: `${SITE_URL}/assets/logo.png` },
      title: announcement.title,
      description: announcement.content.length > 800
        ? announcement.content.slice(0, 800).trim() + "…"
        : announcement.content,
      color: 0xff8a1f,
      thumbnail: { url: `${SITE_URL}/assets/logo.png` },
      fields: [
        { name: "Categorie", value: announcement.category || "General", inline: true },
        { name: "Autor", value: announcement.author || "Administrație", inline: true },
      ],
      footer: { text: "Moldova RP Portal · vezi anunțul complet pe site" },
      url: `${SITE_URL}/index.html#anunturi`,
      timestamp: new Date().toISOString(),
    };
    const absImageUrl = toAbsoluteUrl(announcement.image_url);
    if (absImageUrl) embed.image = { url: absImageUrl };

    const res = await fetch(DISCORD_ANNOUNCE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        content: "📢 **Anunț nou pe Moldova RP!** @everyone",
        allowed_mentions: { parse: ["everyone"] },
        embeds: [embed],
      }),
    });
    if (!res.ok) console.error(`Discord webhook a răspuns cu ${res.status}: ${await res.text().catch(() => "")}`);
  } catch (err) {
    console.error("Trimiterea anunțului pe Discord a eșuat:", err.message);
  } finally {
    clearTimeout(timeout);
  }
}

// Diff simplu, linie cu linie (LCS), între conținutul vechi și cel nou al unui
// regulament — ca notificarea de pe Discord la o modificare să arate exact ce
// s-a adăugat/eliminat, nu tot textul din nou. Plafonat: pentru texte foarte
// lungi (rar cazul unui regulament) sărim diff-ul in loc să riscăm un calcul
// O(n*m) prea mare — funcția apelantă cade atunci pe un preview simplu.
function diffLines(oldText, newText) {
  const a = (oldText || "").split(/\r?\n/);
  const b = (newText || "").split(/\r?\n/);
  if (a.join("\n") === b.join("\n")) return { added: [], removed: [] };

  // Tăiem întâi prefixul și sufixul comune, în O(n) — pentru un regulament
  // lung unde s-a adăugat/modificat o singură secțiune (cazul obișnuit),
  // asta reduce diff-ul costisitor (LCS) doar la porțiunea care chiar
  // diferă, indiferent cât de mare e restul documentului neschimbat. Fără
  // asta, un regulament de mii de linii lovea mereu plafonul de siguranță
  // de mai jos și notificarea cădea pe un preview generic de la început,
  // nu pe textul chiar adăugat.
  let start = 0;
  const maxStart = Math.min(a.length, b.length);
  while (start < maxStart && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length * midB.length > 250000) return { added: [], removed: [], skipped: true };

  const n = midA.length, m = midB.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const removed = [], added = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { removed.push(midA[i]); i++; }
    else { added.push(midB[j]); j++; }
  }
  while (i < n) { removed.push(midA[i]); i++; }
  while (j < m) { added.push(midB[j]); j++; }
  return { added: added.filter(l => l.trim()), removed: removed.filter(l => l.trim()) };
}

// Randează o listă de linii ca text pentru un field Discord (max 1024 caractere
// per field), plafonat și ca număr de linii afișate.
function formatDiffLines(lines, maxLines = 10, maxChars = 1000) {
  if (!lines || !lines.length) return null;
  const shown = lines.slice(0, maxLines).map(l => `• ${l.length > 200 ? l.slice(0, 200).trim() + "…" : l}`);
  let text = shown.join("\n");
  if (text.length > maxChars) text = text.slice(0, maxChars).trim() + "…";
  if (lines.length > maxLines) text += `\n… și încă ${lines.length - maxLines} linii`;
  return text;
}

// Aceeași logică ca la anunțuri, dar pentru regulamente — mesajul spune clar
// dacă regulamentul a fost adăugat sau modificat, cum a cerut Sergiu, iar la
// modificare arată exact ce s-a adăugat/eliminat din text (nu tot conținutul
// din nou). Folosește același webhook (DISCORD_ANNOUNCE_WEBHOOK) — un singur
// canal pentru toate notificările site-ului, nu unul separat per tip de conținut.
async function notifyDiscordRegulation(regulation, action, extra = {}) {
  if (!DISCORD_ANNOUNCE_WEBHOOK) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const { editedBy, addedLines = [], removedLines = [], titleChanged, oldTitle, skipped } = extra;
    const hasDiff = addedLines.length > 0 || removedLines.length > 0;

    const fields = [
      { name: "Categorie", value: regulation.category || "General", inline: true },
      { name: "Versiune", value: regulation.version || "1.0", inline: true },
    ];
    if (editedBy) fields.push({ name: action === "adăugat" ? "Adăugat de" : "Modificat de", value: editedBy, inline: true });
    if (titleChanged) fields.push({ name: "Titlu schimbat", value: `${oldTitle} → ${regulation.title}`, inline: false });
    const removedText = formatDiffLines(removedLines);
    const addedText = formatDiffLines(addedLines);
    if (removedText) fields.push({ name: "➖ Eliminat din text", value: removedText, inline: false });
    if (addedText) fields.push({ name: "➕ Adăugat în text", value: addedText, inline: false });
    if (action === "modificat" && !hasDiff && skipped) {
      fields.push({ name: "Modificare", value: "Textul a fost rescris integral — prea mare pentru un rezumat linie-cu-linie.", inline: false });
    }

    // La adăugare, sau la o modificare fără diff de text (doar categorie/versiune
    // schimbate), arătăm un preview din conținut — altfel embed-ul ar rămâne gol.
    const description = (action === "adăugat" || (!hasDiff && !titleChanged))
      ? (regulation.content.length > 800 ? regulation.content.slice(0, 800).trim() + "…" : regulation.content)
      : undefined;

    const res = await fetch(DISCORD_ANNOUNCE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        content: `📘 **Regulament ${action} pe Moldova RP!** @everyone`,
        allowed_mentions: { parse: ["everyone"] },
        embeds: [{
          author: { name: "Moldova RP — Regulamente", icon_url: `${SITE_URL}/assets/logo.png` },
          title: regulation.title,
          description,
          color: action === "adăugat" ? 0x2f81f7 : 0xf7b32f,
          fields,
          footer: { text: "Moldova RP Portal · vezi regulamentul complet pe site" },
          url: `${SITE_URL}/regulament.html?slug=${encodeURIComponent(regulation.slug)}`,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    if (!res.ok) console.error(`Discord webhook (regulament) a răspuns cu ${res.status}: ${await res.text().catch(() => "")}`);
  } catch (err) {
    console.error("Trimiterea regulamentului pe Discord a eșuat:", err.message);
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/admin/announcements", auth, requireRole(...MOD_ROLES), asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, u.username author FROM announcements a
     LEFT JOIN users u ON u.id = a.author_id
     ORDER BY a.published_at DESC`
  );
  res.json(rows);
}));

app.get("/api/admin/announcements/:id", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM announcements WHERE id=$1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Anunțul nu există." });
  res.json(rows[0]);
}));

app.post("/api/admin/announcements", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { title, content, category, is_published, image_url, video_url } = req.body;
  if (!title || !content)
    return res.status(400).json({ error: "Titlu și conținut sunt obligatorii." });
  const { rows } = await pool.query(
    `INSERT INTO announcements(title, content, category, author_id, is_published, image_url, video_url)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [title.trim(), content, category?.trim() || "General", req.user.sub, is_published ?? true, image_url?.trim() || null, video_url?.trim() || null]
  );
  await logAction(req.user.sub, "announcement.create", "announcement", rows[0].id, { title }, req.ip);
  if (rows[0].is_published) notifyDiscordAnnouncement({ ...rows[0], author: req.user.username });
  res.status(201).json(rows[0]);
}));

app.put("/api/admin/announcements/:id", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { title, content, category, is_published, image_url, video_url } = req.body;
  const before = await pool.query("SELECT is_published FROM announcements WHERE id=$1", [id]);
  if (!before.rows[0]) return res.status(404).json({ error: "Anunțul nu există." });
  const wasPublished = before.rows[0].is_published;

  const { rows } = await pool.query(
    `UPDATE announcements SET
       title = COALESCE($1, title),
       content = COALESCE($2, content),
       category = COALESCE($3, category),
       is_published = COALESCE($4, is_published),
       image_url = COALESCE($5, image_url),
       video_url = COALESCE($6, video_url)
     WHERE id = $7 RETURNING *`,
    [title || null, content || null, category?.trim() || null, is_published ?? null, image_url?.trim() || null, video_url?.trim() || null, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Anunțul nu există." });
  await logAction(req.user.sub, "announcement.update", "announcement", id, req.body, req.ip);
  // Notifică pe Discord doar când anunțul TREE de la ciornă la publicat —
  // nu la fiecare editare ulterioară a unuia deja publicat, ca să nu spamăm.
  if (!wasPublished && rows[0].is_published) notifyDiscordAnnouncement({ ...rows[0], author: req.user.username });
  res.json(rows[0]);
}));

app.delete("/api/admin/announcements/:id", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query("DELETE FROM announcements WHERE id = $1", [id]);
  if (!rowCount) return res.status(404).json({ error: "Anunțul nu există." });
  await logAction(req.user.sub, "announcement.delete", "announcement", id, null, req.ip);
  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Conținut pagini (Admin → Conținut pagini) — editare "câmpuri" pentru
// paginile publice. Blocurile sunt pre-definite la seed (scripts/seed-content.js)
// pentru fiecare pagină — aici doar se listează/editează, nu se creează sau
// șterg (structura paginilor rămâne stabilă; doar conținutul e editabil).
// ---------------------------------------------------------------------------

const CONTENT_TYPES = ["text", "richtext", "html", "list"];

app.get("/api/admin/content/:page", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM page_blocks WHERE page=$1 ORDER BY sort_order", [req.params.page]
  );
  res.json(rows);
}));

app.put("/api/admin/content/:id", auth, requireRole(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { type, content } = req.body;
  if (!CONTENT_TYPES.includes(type))
    return res.status(400).json({ error: "Tip de conținut invalid." });
  if (type === "list") {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) throw new Error();
    } catch {
      return res.status(400).json({ error: "Conținutul unei liste trebuie să fie un JSON valid (array)." });
    }
  }
  const { rows } = await pool.query(
    `UPDATE page_blocks SET type=$1, content=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
    [type, content ?? "", id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Blocul de conținut nu există." });
  await logAction(req.user.sub, "content.update", "page_block", id, { page: rows[0].page, block_key: rows[0].block_key }, req.ip);
  res.json(rows[0]);
}));

app.get("/api/admin/tickets", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const status = req.query.status;
  const { rows } = await pool.query(
    `SELECT t.*, u.username submitted_by, a.username assigned_username
     FROM tickets t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN users a ON a.id = t.assigned_to
     ${status ? "WHERE t.status = $1" : ""}
     ORDER BY t.created_at DESC`,
    status ? [status] : []
  );
  res.json(rows);
}));

app.get("/api/admin/tickets/:id", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, u.username submitted_by, a.username assigned_username
     FROM tickets t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN users a ON a.id = t.assigned_to
     WHERE t.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Tichetul nu există." });
  const replies = await pool.query(
    `SELECT tr.id, tr.message, tr.created_at, u.username author, r.name author_role
     FROM ticket_replies tr
     JOIN users u ON u.id = tr.author_id
     JOIN roles r ON r.id = u.role_id
     WHERE tr.ticket_id = $1 ORDER BY tr.created_at ASC`,
    [req.params.id]
  );
  res.json({ ...rows[0], replies: replies.rows });
}));

app.put("/api/admin/tickets/:id", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { status, assigned_to } = req.body;
  const allowedStatuses = ["open", "in_progress", "resolved", "closed"];
  if (status && !allowedStatuses.includes(status))
    return res.status(400).json({ error: "Status invalid." });
  const { rows } = await pool.query(
    `UPDATE tickets SET
       status = COALESCE($1, status),
       assigned_to = COALESCE($2, assigned_to),
       updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [status || null, assigned_to || null, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Tichetul nu există." });
  await logAction(req.user.sub, "ticket.update", "ticket", id, req.body, req.ip);
  res.json(rows[0]);
}));

app.post("/api/admin/tickets/:id/replies", auth, requireRole(...MOD_ROLES), asyncRoute(async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Mesajul nu poate fi gol." });
  const ticket = await pool.query("SELECT id FROM tickets WHERE id=$1", [req.params.id]);
  if (!ticket.rows[0]) return res.status(404).json({ error: "Tichetul nu există." });
  const { rows } = await pool.query(
    "INSERT INTO ticket_replies(ticket_id, author_id, message) VALUES($1,$2,$3) RETURNING *",
    [req.params.id, req.user.sub, message.trim()]
  );
  await pool.query(
    "UPDATE tickets SET updated_at=NOW(), status = CASE WHEN status='open' THEN 'in_progress' ELSE status END WHERE id=$1",
    [req.params.id]
  );
  await logAction(req.user.sub, "ticket.reply", "ticket", req.params.id, null, req.ip);
  res.status(201).json(rows[0]);
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Eroare internă a serverului." });
});

app.listen(port, () => console.log(`Moldova RP API: http://localhost:${port}`));
