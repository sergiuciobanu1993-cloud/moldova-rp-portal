# Profilul jucătorului — cum funcționează (site ↔ joc)

> Referință pentru colegul de server. Explică ce conține profilul jucătorului pe site, **ce date vin din joc** și **ce stă pe site**. Concluzie: profilul e deja aproape complet alimentat din joc — nu e nevoie să mutăm nimic. Site-ul păstrează doar customizarea cosmetică (poză, banner, bio, mașina favorită, insigne).

## Legătura dintre cont și personaj

Totul se leagă prin **`game_identifier`** (identificatorul stabil din joc, de forma `license:...`). Când jucătorul își leagă contul de site de personajul din joc, site-ul salvează acest identifier. De aici încolo, site-ul citește datele live din joc după el.

---

## 1. Profilul PUBLIC (`profil.html?u=<slug>`)

Ruta API: `GET /api/profil/:slug`

### Vine din JOC (site-ul doar afișează)
| Câmp | Sursă |
|---|---|
| Nume personaj (`name`) | numele RP din joc (serverName) |
| Facțiune + grad (`faction`) | jobul din joc → nume facțiune + grad |
| Ore jucate (`hours`) | playtime din joc |
| Online / offline (`online`, `lastSeen`) | starea live din joc |
| Loc în clasamentul săptămânii (`week`) | orele jucate în săptămâna curentă |
| Premium (`premium`) | ruta `/premium` din joc |
| Istoricul de câștiguri clasament (`wins`) | weekly_winners |

### Stă pe SITE (customizare, setată de jucător în „Setări cont")
| Câmp | Unde |
|---|---|
| Bio / descriere (`bio`, `bioLocked`) | tabela `public_profiles` |
| Banner (`banner`, `bannerImg`, `bannerPos`, `bannerZoom`, `bannerZoomY`) | `public_profiles` + imaginea în `user_banners` |
| Mașina favorită (`favCar`) | `public_profiles.fav_car` |
| Insignele afișate (`shownBadges`) | `public_profiles.shown_badges[]` |
| Poza de profil (`avatar`) | tabela `user_avatars` (sau, dacă nu are, avatarul de Discord) |
| Membru din (`memberSince`) | data creării contului de site |
| Insigne de Crăciun (`xmas.badges`) | din progresul la questuri (pe site) |

> Profilul public se vede doar dacă jucătorul l-a activat (`public_profiles.enabled`) și are contul legat de joc.

---

## 2. Contul meu / Dashboard (`dashboard.html`)

Vederea privată a jucătorului. Rute: `GET /api/me`, `GET /api/me/profile`.

- **Date de joc** (din joc, prin `game_identifier`): mașini, proprietăți, afaceri, facțiune, ore, bani (cash/bancă), log de activitate, celelalte personaje.
- **Setări cont** (pe site): customizarea de mai sus (bio, poză, banner, mașina favorită, insigne) + setări notificări (`/api/me/notificari`: Discord/email).
- **Legare cont ↔ joc**: aici jucătorul leagă contul de site de personaj.

### Rutele de customizare (pe site)
| Acțiune | Rută |
|---|---|
| Vezi/salvează setările de profil public | `GET` / `PUT /api/me/profil-public`, `PUT /api/me/profil-setari` |
| Pune/șterge poza de profil | `PUT` / `DELETE /api/me/avatar` |
| Pune/șterge bannerul | `PUT` / `DELETE /api/me/banner` |

---

## 3. Tabela `public_profiles` (customizarea pe site)

Astea sunt singurele date de profil care NU vin din joc:

```
user_id          — contul de site
slug             — adresa profilului public (profil.html?u=slug)
enabled          — profilul public e vizibil sau nu
bio              — descrierea
bio_locked       — staff-ul a blocat descrierea (abuz)
banner           — tema de banner ("portocaliu", "auriu", "personal"…)
fav_car          — mașina favorită afișată
shown_badges[]   — insignele alese spre afișare
banner_pos       — poziționarea bannerului „personal"
banner_zoom      — zoom banner pe lățime
banner_zoom_y    — zoom banner pe înălțime
```
Plus imaginile: `user_avatars` (poza de profil) și `user_banners` (bannerul „personal"), stocate ca BYTEA.

---

## Concluzie / ce e de făcut

- **Profilul e deja game-driven.** Datele reale (mașini, proprietăți, facțiune, ore, bani, clasament, premium) vin toate din joc, prin `game_identifier`.
- **Pe site rămâne doar customizarea cosmetică** (poză, banner, bio, mașina favorită, insigne) — pe care și-o pune jucătorul singur din „Setări cont".
- **Nu mutăm nimic acum** (decizie: lăsăm așa). Dacă, mai târziu, vreți ca și customizarea (ex. avatar / mașină favorită / insigne) să vină din joc, se poate — dar cere cod nou (de stabilit de unde o setează jucătorul în joc și cum ajunge pe site).
- **Accesul rapid** la profil rămâne ca acum: meniul din dreapta-sus („Profilul meu" / „Setări cont"), disponibil pe tot site-ul.

---

*Referință generată din config-ul și codul live al site-ului. Nimic nu a fost modificat.*
