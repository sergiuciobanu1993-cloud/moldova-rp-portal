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

const MOD_ROLES = ["moderator", "admin", "owner"];
const ADMIN_ROLES = ["admin", "owner"];

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

    const roleRow = await pool.query(
      "SELECT r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1",
      [user.id]
    );
    const token = signUser({ id: user.id, username: user.username, role_name: roleRow.rows[0].role_name });
    await logAction(user.id, "auth.discord_login", "user", user.id, null, req.ip);

    res.redirect(`/auth-callback.html#token=${encodeURIComponent(token)}`);
  } catch (e) {
    console.error("Discord OAuth error:", e);
    res.redirect("/auth-callback.html?error=discord_failed");
  }
}));

app.get("/api/me", auth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.email,r.name role,
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
  res.json(rows[0]);
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
    `SELECT a.id,a.title,a.content,a.published_at,u.username author
     FROM announcements a LEFT JOIN users u ON u.id=a.author_id
     WHERE a.is_published=true ORDER BY a.published_at DESC LIMIT 30`
  );
  res.json(rows);
}));

app.get("/api/admin/stats", auth, requireRole("admin", "owner"), asyncRoute(async (_req, res) => {
  const q = async sql => (await pool.query(sql)).rows[0].count;
  res.json({
    players: await q("SELECT COUNT(*) FROM players"),
    online: await q("SELECT COUNT(*) FROM players WHERE status='online'"),
    complaints: await q("SELECT COUNT(*) FROM complaints WHERE status NOT IN ('closed','resolved')"),
    punishments: await q("SELECT COUNT(*) FROM punishments WHERE created_at >= date_trunc('month', NOW())")
  });
}));

app.get("/api/admin/audit-logs", auth, requireRole("admin", "owner"), asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT l.*,u.username actor FROM audit_logs l
     LEFT JOIN users u ON u.id=l.actor_id
     ORDER BY l.created_at DESC LIMIT 100`
  );
  res.json(rows);
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

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Eroare internă a serverului." });
});

app.listen(port, () => console.log(`Moldova RP API: http://localhost:${port}`));
