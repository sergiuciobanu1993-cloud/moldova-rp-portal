# Profil în joc (NUI) + legătură cu site — specificație

> Pentru colegul de server. Scop: același profil al jucătorului, în **două locuri**:
> 1. **În joc** — un panou (NUI) care se deschide **dintr-un buton** (dintr-un meniu/telefon existent în joc).
> 2. **Pe site** — pagina de profil actuală (pentru când jucătorul nu e în joc).
>
> Ambele arată **aceleași date**, legate între ele. Vestea bună: NUI-ul din FiveM e HTML/CSS/JS — deci front-end-ul panoului poate fi făcut identic cu site-ul (îl pot pregăti eu gata, colegul doar îl conectează la date).

---

## 1. Ce afișează profilul (din poza site-ului)

**Header:**
- Banner (imagine) + Avatar (cerc) cu bulină online/offline
- Nume RP (ex. „Ravshan Askerovici") + @username
- Badge **PREMIUM**, rol (ex. „Fondator"), status Online/Offline
- **ID static** (#336), **ID cont** (`char0:106f2e6aff...`) cu buton de copiere
- **Job** (Civil · Șomer), **Ore jucate** (968h), **Cont creat** (27.08.2026), **Ultima conectare**
- Buton **„Setări profil"**

**Carduri (rând de sus):**
- Cash, Bancă, Bani murdari, Vehicule (nr.), Proprietăți (nr.), Premium (status)

**Taburi:**
- Prezentare · Vehiculele mele · Proprietățile mele · Facțiune & rank · Sancțiuni · Activitate

---

## 2. Sursa fiecărui câmp (cine le are)

### A) Vine din JOC — **serverul le are deja local** (NUI-ul le citește direct din server)
| Câmp | Observație |
|---|---|
| Nume RP | firstname/lastname din joc |
| ID static, ID cont (identifier `char…`) | identificatorul personajului |
| Job + grad | jobul curent |
| Ore jucate, Ultima conectare, Online/Offline | playtime + sesiune |
| Cash, Bancă, Bani murdari | conturile jucătorului |
| Vehicule (listă + nr.) | garajul |
| Proprietăți (listă + nr.) | casele/afacerile |
| Facțiune & rank | facțiunea + gradul |
| Premium (activ + până când) | sistemul de premium din joc |
| Activitate (ultimele acțiuni) | logurile serverului |
| Sancțiuni | din sistemul de sancțiuni (joc/staff) |

> **În joc, NUI-ul NU trebuie să ceară astea de la site** — serverul le are deja. E mai rapid și merge chiar dacă site-ul e jos.

### B) Vine de pe SITE — customizarea pe care și-o pune jucătorul
| Câmp | Unde pe site |
|---|---|
| Avatar (poza de profil) | `user_avatars` |
| Banner (+ poziționare/zoom) | `user_banners` + `public_profiles` |
| Bio / descriere | `public_profiles.bio` |
| Mașina favorită afișată | `public_profiles.fav_car` |
| Insignele afișate | `public_profiles.shown_badges[]` |
| @username, rol (Fondator…), „Cont creat" | contul de site (`users`) |
| Insigne (clasament, Crăciun) | sistemele de pe site |

---

## 3. Legătura dintre cele două (partea pe care o fac EU pe site)

Ca NUI-ul din joc să afișeze și customizarea (avatar/banner/bio/mașină favorită/insigne), adaug pe site un **endpoint care întoarce customizarea după identificatorul din joc**:

```
GET /api/profil-din-joc/:identifier      (identifier = char… / license…)
→ { avatar, banner, bannerPos, bannerZoom, bannerZoomY, bio, favCar, shownBadges, username, role, memberSince, badges }
```
- Serverul de joc (sau direct NUI-ul) îl cheamă când se deschide panoul, și completează partea cosmetică.
- Protejat cu o cheie (ca doar serverul vostru să-l poată citi) — stabilim cum.
- Invers nu e nevoie de nimic: **site-ul arată deja profilul când jucătorul e offline** (citește din cache).

Astfel: datele de joc vin din server (rapid, local), customizarea vine de pe site printr-un singur apel. Profilul e identic în ambele locuri.

---

## 4. Designul (ca să arate ca pe site)

NUI = HTML/CSS/JS. **Pot pregăti eu front-end-ul complet** al panoului (HTML + CSS + JS), identic cu site-ul:
- Header cu banner + avatar + badge-uri + carduri de stats
- Bara de taburi și conținutul fiecărui tab
- Tema întunecată + accent portocaliu, ca pe site
- „Locuri goale" pentru date (`{{cash}}`, listă de vehicule etc.) pe care colegul le umple din server

Colegul doar: pune HTML-ul în resursa FiveM, trimite datele din server în NUI (mesaje `SendNUIMessage`), și leagă butonul de deschidere.

---

## 5. Cine face ce

**Eu (pe site):**
- Adaug endpoint-ul `/api/profil-din-joc/:identifier` (customizarea după identifier, cu cheie).
- (Opțional, recomandat) Pregătesc front-end-ul NUI complet (HTML/CSS/JS), gata de pus în resursă.

**Colegul (pe server / FiveM):**
- Construiește resursa NUI: butonul de deschidere, trimiterea datelor de joc în panou.
- Cheamă endpoint-ul de pe site pentru partea cosmetică.
- (Mașinile cu cod de spawn — vezi lista separată — ca pozele să apară corect și în panou.)

---

## Pasul următor
Dacă vrei, **îți fac front-end-ul NUI gata** (o pagină HTML care arată exact ca profilul din poză), ca să i-o dai colegului direct. El doar o umple cu datele din joc. Spune-mi și o pregătesc.

*Specificație generată din config-ul și codul live al site-ului.*
