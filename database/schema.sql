CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(40) UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(160) UNIQUE,
  password_hash TEXT,
  role_id UUID REFERENCES roles(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  discord_id VARCHAR(32) UNIQUE,
  discord_username VARCHAR(100),
  discord_avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration guards for databases created before Discord login existed:
-- safe to re-run (IF NOT EXISTS / dropping a constraint that's already gone
-- is a no-op in Postgres), so this runs on every deploy via scripts/init-db.js.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id VARCHAR(32) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_avatar TEXT;

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER UNIQUE,
  display_name VARCHAR(64) NOT NULL,
  avatar_url TEXT,
  playtime_minutes INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'offline',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS factions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  type VARCHAR(30) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS faction_ranks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faction_id UUID NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  level INTEGER NOT NULL,
  UNIQUE(faction_id, level)
);

CREATE TABLE IF NOT EXISTS faction_members (
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  faction_id UUID REFERENCES factions(id) ON DELETE CASCADE,
  rank_id UUID REFERENCES faction_ranks(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(player_id, faction_id)
);

CREATE TABLE IF NOT EXISTS regulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(180) UNIQUE NOT NULL,
  category VARCHAR(80) NOT NULL,
  content TEXT NOT NULL,
  version VARCHAR(30) NOT NULL DEFAULT '1.0',
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(180) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'General',
  author_id UUID REFERENCES users(id),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- category adăugată ulterior (etichetă tip "OFICIAL"/"REGULAMENT" afișată pe
-- homepage) — safe pe baze existente.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS category VARCHAR(40) NOT NULL DEFAULT 'General';

-- image_url — o imagine opțională (link către o poză publică) atașată
-- anunțului, afișată pe card-ul de pe homepage și în embed-ul de Discord.
-- NULL = fără imagine, nimic nu se afișează. Safe pe baze existente.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS punishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  target_name VARCHAR(64),
  type VARCHAR(40) NOT NULL,
  reason TEXT NOT NULL,
  duration_minutes INTEGER,
  issued_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- target_name ține numele jucătorului din joc direct (nu toți jucătorii de
-- pe server au și cont pe site) — coloană adăugată ulterior, safe pe baze
-- existente.
ALTER TABLE punishments ADD COLUMN IF NOT EXISTS target_name VARCHAR(64);

CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  subject VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ck_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  evidence TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES users(id),
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(60),
  entity_id TEXT,
  metadata JSONB,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tichete de suport deschise de jucători din portal. Dovezile (poze/filmări)
-- se atașează ca link extern (Streamable/YouTube/Discord etc.), nu ca fișier
-- încărcat direct — evită complet nevoia de stocare persistentă pe Railway.
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(180) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'general',
  description TEXT NOT NULL,
  evidence_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Acțiuni de staff trimise direct de panoul cloud Luxu Admin (kill, revive,
-- give/take item, ban etc.), via webhook-ul propriu al lor (tab "Webhooks"),
-- NU prin resursa moldovarp-api de pe serverul de joc — de-asta e tabelă
-- separată, în baza noastră Postgres, nu în MySQL-ul jocului. Structura
-- exactă a payload-ului Luxu nu e documentată public, deci păstrăm mereu
-- răspunsul brut (raw) ca să nu pierdem nimic dacă extragerea câmpurilor
-- (staff_name/target_name/action/reason) nu reușește pentru un anumit tip
-- de eveniment.
CREATE TABLE IF NOT EXISTS admin_action_logs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(30) NOT NULL DEFAULT 'luxu',
  staff_name VARCHAR(120),
  target_name VARCHAR(120),
  action VARCHAR(120),
  reason TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at ON admin_action_logs(created_at DESC);

-- Conținut editabil din Admin → Conținut pagini. Fiecare "bloc" e o bucată
-- numită de conținut a unei pagini publice (titlu, paragraf, listă de
-- elemente sau bucată de HTML), identificată unic prin (page, block_key).
-- type controlează cum se editează/randează: 'text' (simplu), 'richtext'
-- (text formatat, salvat ca HTML simplu), 'html' (HTML brut, editat direct),
-- 'list' (elemente repetate — content e un JSON array de {icon,title,text,url}).
-- Rândurile inițiale sunt populate de scripts/seed-content.js cu ON CONFLICT
-- DO NOTHING, deci editările din admin nu sunt niciodată suprascrise la
-- redeploy.
CREATE TABLE IF NOT EXISTS page_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page VARCHAR(60) NOT NULL,
  block_key VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'text',
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page, block_key)
);
CREATE INDEX IF NOT EXISTS idx_page_blocks_page ON page_blocks(page, sort_order);

INSERT INTO roles(name, description) VALUES
('player', 'Jucator standard'),
('moderator', 'Moderator'),
('admin', 'Administrator'),
('co-fondator', 'Co-fondator'),
('owner', 'Proprietar')
ON CONFLICT (name) DO NOTHING;

INSERT INTO factions(name, type, description) VALUES
('Poliție', 'legal', 'Organizație legală'),
('SMURD', 'legal', 'Serviciu medical'),
('Avocatură', 'legal', 'Serviciu juridic'),
('Sindicat', 'ilegal', 'Organizație ilegală'),
('Ganguri', 'ilegal', 'Organizații criminale'),
('Mafii', 'ilegal', 'Organizații criminale')
ON CONFLICT (name) DO NOTHING;
