# Premium + Pachete de start — ce trebuie făcut pe serverul de joc (moldovarp-api)

Site-ul e gata: pagina **moldovarp.md/premium.html**, setările în **Editor VIP Shop → Premium**. Site-ul doar afișează și trimite cererile de cumpărare. **Coins-urile, zilele de Premium și bonusurile le ține serverul de joc**, la fel ca la cutii.

Toate rutele de mai jos sunt în `moldovarp-api`, protejate cu același `x-api-key` ca restul. Site-ul le detectează singur: cât timp răspund 404, butoanele de cumpărare stau oprite.

---

## 1. Unde se ține Premium

- Premium e pe **cont** (ambele personaje): cheia e licența, adică partea de după `charN:` din identifier (`char1:abc…` și `char2:abc…` → `abc…`).
- Pachetul de start e pe **personaj** (identifier-ul complet `charN:…`), unul singur pe personaj (oricare dintre cele 3).

Tabele propuse (MySQL):

```
moldovarp_premium (
  license      VARCHAR(80) PRIMARY KEY,
  until_ms     BIGINT NULL,               -- până când e activ (ms epoch)
  banked_days  DOUBLE NOT NULL DEFAULT 0, -- zile adunate, calculate până la calc_ms
  calc_ms      BIGINT NOT NULL            -- momentul ultimului calcul
)
moldovarp_starter (
  identifier   VARCHAR(120) PRIMARY KEY,
  pack_id      VARCHAR(20) NOT NULL,
  price        INT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)
moldovarp_premium_requests (
  request_id   VARCHAR(64) PRIMARY KEY,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Zilele adunate (pentru bonusurile care se deblochează în timp)

- Fiecare zi cu Premium activ adaugă 1 zi.
- După expirare, zilele adunate **scad cu 1 pe zi** până reactivează (nu sub 0).

Calcul (la fiecare citire/cumpărare, apoi salvezi `banked_days = days`, `calc_ms = now`):

```
DAY = 86400000
activeEnd   = min(now, until_ms or 0)
activePart  = max(0, activeEnd - calc_ms) / DAY
expiredFrom = max(calc_ms, until_ms or calc_ms)
expiredPart = max(0, now - expiredFrom) / DAY
days = max(0, banked_days + activePart - 1 * expiredPart)
```

---

## 2. Rutele

### GET `/premium?identifier=charN:…`
Răspunde mereu 200 (și pentru cine n-a avut niciodată Premium):
```json
{ "active": true, "until": 1792000000000, "days": 37,
  "starter": { "packId": "bronz", "at": 1791000000000 } }
```
`until` și `starter.at` în milisecunde. `starter` = `null` dacă personajul n-a luat pachet.

### POST `/premium/buy`
Corp: `{ identifier, playerName, planId, days, price, requestId }`
- Dacă lipsește `identifier`/`days`/`price` → **400 `{ "error": "date_lipsa" }` fără să facă nimic** (site-ul trimite din când în când un POST gol ca să vadă dacă ruta există).
- Dacă `requestId` a mai fost folosit → 409 `{ "error": "cerere_dubla" }`.
- Scade coins **atomic**, exact ca la cutii: `UPDATE g_coinshop_users SET coins = coins - ? WHERE identifier = ? AND coins >= ?` → dacă 0 rânduri: 400 `coins_insuficienti`.
- Recalculează zilele (formula de sus), apoi `until_ms = max(now, until_ms) + days * DAY`.
- Răspuns 200: `{ "until": ..., "days": ..., "coins": <sold rămas> }`.

### POST `/starter/buy`
Corp: `{ identifier, playerName, packId, price, premiumDays, cash, skillPct, weaponLicense, businessLicense, requestId }`
- Gol/incomplet → 400 `date_lipsa` (fără efecte, ca mai sus).
- Personajul are deja un pachet → 400 `deja_cumparat`. `packId` necunoscut → 400 `pachet_necunoscut`.
- Scade coins atomic (400 `coins_insuficienti` dacă nu are).
- Salvează în `moldovarp_starter`, adaugă `premiumDays` la Premium (ca la /premium/buy).
- Banii (`cash`, în bancă) îi pune ca recompensă în așteptare în `moldovarp_case_openings` (case_id `starter_<packId>`, reward_type `cash`), ca să se ridice cu `/recompense`.
- Permisele și skill-urile: aplicate la `/recompense` sau la următoarea intrare a personajului (conținutul e la punctul 4).
- Răspuns 200: `{ "coins": <sold rămas> }`.

---

## 3. Bonusurile din joc

Ideal un export comun, folosit de celelalte resurse: `exports['moldovarp-api']:GetPremium(source)` → `{ active = true/false, days = 37 }`.

**Din prima zi (cât e activ):**
- +20% la plata din joburile civile (nu de stat).
- +1.000$ în bancă la fiecare salariu.
- Timpul de așteptare până la „transport la spital” redus la jumătate.
- (insigna de pe site o face site-ul)

**Se deblochează după zilele adunate (și merg doar cât e activ):**

| Zile | Bonus |
|---|---|
| 5 / 45 | Sala: forța și rezistența cresc cu +15% / +25% mai repede |
| 10 / 60 / 150 | Foamea și setea scad cu 20% / 35% / 50% mai încet |
| 15 | −20% la asigurarea și înmatricularea mașinii |
| 20 / 75 / 140 | +2 / +4 / +6 locuri în garaj |
| 25 | +15% la prețul peștelui vândut |
| 30 | Ieși din spital cu viața plină |
| 40 | −10% la magazinele 24/7 |
| 50 / 120 | Pedeapsa la închisoare −10% / −20% |
| 60 | Joburile civile: +25% în total (în loc de +20%) |
| 90 / 180 | Toate skill-urile cresc cu +10% / +20% mai repede |
| 100 | Efectele bune de la mâncare/băutură țin +25% (fără regenerarea vieții) |
| 180 | Alege la ce spital apare după moarte |

---

## 4. Pachetele de start (conținut fix)

| Pachet | Permise | Skill-uri (forță, tragere, rezistență) | Premium | Bani |
|---|---|---|---|---|
| `bronz` | auto B | urcate la 20% | 7 zile | 20.000$ |
| `aur` | auto B + camion C + **permis de port armă** | urcate la 45% | 30 de zile | 45.000$ |
| `platina` | toate permisele de conducere + **permis de port armă** + **licență de afaceri** + asigurare și înmatriculare pentru o mașină | urcate la 80% | 90 de zile | 100.000$ |

„Urcate la X%” = dacă skill-ul e deja peste X, rămâne cum e.

(17.10) `weaponLicense: true` (aur, platina) = permis de port armă; `businessLicense: true` (platina) = licență de afaceri.

Prețurile (în coins) le alege proprietarul din site și vin în cerere (`price`); serverul doar le scade.

---

## 5. Cum verificăm

După ce pui rutele și dai restart la `moldovarp-api`, în Editor VIP Shop → Premium cele două etichete devin verzi („activ în joc”). Apoi facem o cumpărare de test cu un cont de staff.
