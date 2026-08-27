# Moldova RP API — v0.4

## Pornire locală

1. Copiază `.env.example` în `.env`.
2. Instalează Node.js 20+.
3. Pornește PostgreSQL și execută `database/schema.sql`, apoi `database/seed.sql`.
4. Rulează `npm install`.
5. Rulează `npm start`.

## Endpoint-uri

### Publice
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/regulations`
- `GET /api/regulations/:slug`
- `GET /api/factions`
- `GET /api/announcements`

### Autentificate
- `GET /api/me`

### Admin — stats & audit
- `GET /api/admin/stats` — `moderator`/`admin`/`owner` pentru citire ar fi util, dar rămâne restricționat la `admin`/`owner` ca înainte.
- `GET /api/admin/audit-logs` (`admin`, `owner`)

### Admin — jucători (nou în v0.4)
- `GET /api/admin/players?q=&limit=&offset=` — listă/căutare (`moderator`, `admin`, `owner`)
- `GET /api/admin/players/:id` — profil complet: date jucător, facțiuni/rank-uri, ultimele 20 sancțiuni, reclamații și cereri CK (`moderator`, `admin`, `owner`)
- `PUT /api/admin/players/:id` — actualizează `display_name`, `status` (`online`/`offline`/`banned`), `game_id` (`admin`, `owner`)
- `POST /api/admin/players/:id/faction` — body `{ faction_id, rank_id? }`; înlocuiește orice apartenență existentă a jucătorului (un jucător are o singură facțiune activă) (`admin`, `owner`)
- `DELETE /api/admin/players/:id/faction` — scoate jucătorul din facțiunea curentă (`admin`, `owner`)

### Admin — facțiuni & rank-uri (nou în v0.4)
- `GET /api/admin/factions/:id` — facțiune + rank-uri + membri (`moderator`, `admin`, `owner`)
- `POST /api/admin/factions` — body `{ name, type, description? }` (`admin`, `owner`)
- `PUT /api/admin/factions/:id` — actualizare parțială, inclusiv `is_active` (`admin`, `owner`)
- `POST /api/admin/factions/:id/ranks` — body `{ name, level }` (`admin`, `owner`)
- `PUT /api/admin/factions/ranks/:rankId` — actualizare parțială (`admin`, `owner`)
- `DELETE /api/admin/factions/ranks/:rankId` (`admin`, `owner`)

Toate acțiunile de mai sus (update jucător, creare/editare facțiune și rank, atribuire facțiune) scriu automat în `audit_logs`, la fel ca `auth.login`.

Header:
`Authorization: Bearer <token>`

## Observație

Integrarea cu serverul de joc nu este încă implementată. Tabelele `punishments`, `complaints` și `ck_requests` au acum coloane de citire prin `GET /api/admin/players/:id`, dar încă nu au endpoint-uri proprii de creare/editare (rămân pentru o etapă viitoare — aplicare sancțiuni, gestionare reclamații, decizii CK).

## Frontend conectat (v0.4)

`login.html`, `dashboard.html` și `admin.html` folosesc acum `/api/auth/login` și `/api/me` real, printr-un helper comun (`auth-client.js`) care păstrează tokenul JWT în `localStorage` și redirecționează la `login.html` dacă tokenul lipsește sau expiră. `admin.html` verifică rolul (`admin`/`owner`) prin `/api/me` înainte de a încărca `/api/admin/stats` și `/api/admin/audit-logs`.
