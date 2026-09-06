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

-- Confirmare prin email la "Setează parola" (contul de staff creat inițial
-- doar prin Discord) — cerut explicit: emailul și parola nu se salvează
-- direct pe cont, stau "în așteptare" până jucătorul introduce codul de 6
-- cifre primit pe email; abia atunci trec în email/password_hash de mai sus.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(160);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_code VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ;

-- "Am uitat parola" — cod de 6 cifre trimis pe emailul contului (funcționează
-- doar pentru conturi care au deja un email+parolă reale, nu pentru conturi
-- doar-Discord, care nu au un email verificat de care să ne putem folosi).
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_code VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMPTZ;

-- Legătura cont de site <-> personaj din joc, pentru pagina "Cazuri" (coins).
-- Site-ul se loghează cu Discord — nu are nicio legătură nativă, verificată,
-- cu identifier-ul (licența) din joc. Populat DOAR prin comanda din joc
-- "/leagacont" + codul de 6 cifre verificat de POST /api/cont/leaga-joc —
-- niciodată introdus liber de utilizator (ar putea vedea/cheltui coins-urile
-- altcuiva doar tastând un nume). game_identifier_name e strict informativ
-- (afișat pe pagina de cont), NU folosit pentru nicio verificare de identitate.
ALTER TABLE users ADD COLUMN IF NOT EXISTS game_identifier VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS game_identifier_name VARCHAR(64);

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

-- "Ultima dată văzut" — o poză (snapshot) a banilor/jobului/vehiculelor unui
-- jucător, salvată automat de backend din moldovarp-api la fiecare ~60s cât
-- timp e online (vezi syncPlayerSnapshots în server.js). Scopul: profilul
-- unui jucător (pagina "Profilul meu" / profilul din admin) să arate ceva
-- relevant și când jucătorul e OFFLINE, nu doar "nu e conectat acum" — un
-- portal "profesional" ține minte ultima stare cunoscută, nu doar live.
-- last_synced_at = NULL înseamnă "nu am prins încă nicio poză" (cont nou,
-- sau jucătorul nu a fost încă online de când există această coloană).
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_cash INTEGER;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_bank INTEGER;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_black_money INTEGER;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_job VARCHAR(60);
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_job_label VARCHAR(100);
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_vehicles JSONB;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

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

-- video_url — un link opțional (YouTube etc.) atașat anunțului. Afișat pe
-- homepage ca buton "▶ Vezi videoclipul" sub titlu, doar cand e completat.
-- NULL = fără video, butonul nu apare. Safe pe baze existente.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS video_url TEXT;

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

-- Marcaje pentru seed-uri "o singură dată" (ex: un anunț creat automat la
-- primul deploy după ce a fost adăugat în scripts/init-db.js). Diferă de
-- page_blocks (care ține conținut editabil permanent): aici doar reținem CĂ
-- o anumită acțiune s-a întâmplat deja, ca să nu se repete la fiecare
-- redeploy — inclusiv dacă rândul creat de ea (ex: anunțul) e ulterior șters
-- manual din admin. O dată bifat un key, rămâne bifat definitiv.
CREATE TABLE IF NOT EXISTS seed_flags (
  key VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
