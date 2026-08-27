# MOLDOVA RP — Portal v0.4

Versiunea 0.3 a adăugat fundația backend (API, PostgreSQL, autentificare JWT). Versiunea 0.4 conectează frontend-ul la API-ul real și adaugă primul CRUD administrativ complet: jucători și facțiuni/rank-uri.

## Conține

- Frontend-ul v0.2 și identitatea vizuală Moldova RP.
- API Node.js + Express.
- PostgreSQL.
- Autentificare cu parole hash-uite și JWT.
- Roluri: player, moderator, admin, owner.
- Regulamente.
- Facțiuni și rank-uri.
- Anunțuri.
- Sancțiuni.
- Reclamații.
- Cereri CK.
- Audit logs.
- Admin stats.
- Docker Compose pentru pornire rapidă.

## Pornire cu Docker

```bash
cp .env.example .env
docker compose up -d
```

Portalul/API-ul va fi disponibil pe `http://localhost:3000`.

**Important:** schimbă `JWT_SECRET` și parolele implicite înainte de folosirea pe VPS/producție.

## Noutăți v0.4

- `login.html`, `dashboard.html` și `admin.html` sunt conectate la API-ul real (JWT în `localStorage` prin `auth-client.js`), nu mai afișează date demo statice.
- CRUD complet pentru jucători (căutare, profil complet, actualizare) și pentru facțiuni + rank-uri, cu scriere automată în `audit_logs`.
- `admin.html` își verifică rolul prin `/api/me` și încarcă `/api/admin/stats` + `/api/admin/audit-logs` live.

## Etapa următoare

- CRUD pentru regulamente și anunțuri (publicare/editare din Admin Panel);
- aplicare sancțiuni, gestionare reclamații și decizii pentru cereri CK;
- upload și stocare dovezi;
- ecrane Admin Panel pentru jucători/facțiuni (interfața folosește deja API-ul, dar paginile HTML dedicate încă lipsesc);
- integrarea cu baza de date a serverului de joc;
- Nginx + HTTPS + backup PostgreSQL;
- Discord OAuth / conectare cont Discord.
