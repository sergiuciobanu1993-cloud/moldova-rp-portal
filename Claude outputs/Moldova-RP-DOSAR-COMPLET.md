# 📘 Moldova RP — Dosar complet pentru mutarea pe server

> Un singur document cu **TOT** ce am pregătit, ca să nu se încurce colegul.
> Fișierul de cod al panoului — **`profil-nui.html`** — vine separat (e HTML, se pune direct în resursa FiveM). Aici e tot restul: ce se mută, cum, și ce mai e de reparat.

## Cuprins
- **PARTEA 1 — Recompensele** (VIP Shop, ore jucate, mașină jucător nou, clasament) + cum se trimit în joc
- **PARTEA 2 — Profilul în joc (NUI)** + legătura cu site-ul (endpoint LIVE + cheie)
- **PARTEA 3 — Cum funcționează profilul** (referință: ce vine din joc, ce stă pe site)
- **PARTEA 4 — De rezolvat pe server** (ce nu merge încă pe site)

## Stare la zi
- ✅ Endpoint-ul de legătură `/api/profil-din-joc` e **LIVE și testat** (vezi Partea 2).
- ✅ Cheia `GAME_PROFILE_KEY` e setată pe site (Railway).
- ⏳ De pus pe server: recompensele (Partea 1) + panoul NUI (Partea 2) + punctele din Partea 4.

═══════════════════════════════════════════════════════════════════════
# PARTEA 1 — RECOMPENSELE
═══════════════════════════════════════════════════════════════════════

# Recompense Moldova RP — Date complete pentru mutarea pe server

> Export generat din panoul de admin **moldovarp.md**. Conține **toate recompensele pe care site-ul le dă jucătorilor**, ca să le recreezi direct pe server (jucătorii le primesc automat în joc). Include: cutiile și pachetele VIP, recompensele pe ore jucate și mașina de jucător nou — toate cu coduri de item/spawn, drop-rate, sume și prețuri.
>
> **Ce rămâne pe site:** doar tracking-ul / info că există (ex. questurile de Crăciun și clasamentul, ale căror premii se dau oricum în joc). Vezi secțiunea 7.

## Cum se citește

- **weight** = ponderea recompensei în cutie. **Fiecare cutie are suma weight = 10000**, deci șansa de drop = `weight ÷ 100` (în %). Ex: weight 200 = **2%**, weight 10 = **0,1%**, weight 2159 = **21,59%**.
- **Tipuri de recompensă:** `item` (armă/obiect, cu cod item + gloanțe), `vehicle` (mașină, cu cod de spawn), `cash` (bani în cont `bank` sau `black_money`), `coins`.
- **valoare** = cât primești înapoi la revânzare (sell-back). **Sell-back = 50%** din valoare.
- Mașinile din cutii au valoarea 6000 coins (sell-back = 3000 coins).

---

## Config general

| Setare | Valoare |
|---|---|
| Sell-back (revânzare recompense) | **50%** |
| Premium — consum coins | **1 coin / zi** |
| Suma weight per cutie | **10000** (pentru calculul %) |

---

# 1. CUTIILE (loot boxes)

Format linie: `tip | nume | cod | weight | [cant.] | [gloanțe] | [sumă $] | [valoare revânzare]`

## 🟦 Cutie Rare — `rare` — 1500 coins — 39 recompense

```
item     | HK33 Red VVS              | WEAPON_HK33VVSRED     | w200   | x1 | 500 gloante | val 2000 coins
item     | MP5 Black VVS             | WEAPON_MP5VVSBLACK    | w200   | x1 | 500 gloante
vehicle  | Ford Mustang Boss 429     | boss429               | w10    | val 6000 coins
vehicle  | Nissan Skyline GT-R R34   | r34h                  | w10    | val 6000 coins
vehicle  | Mazda RX-7                | rx7                   | w10    | val 6000 coins
cash     | $45.000 în bancă          | bank          45000   | w2159
cash     | $60.000 în bancă          | bank          60000   | w1215
cash     | $80.000 în bancă          | bank          80000   | w683
cash     | $100.000 bani murdari     | black_money   100000  | w437
cash     | $120.000 în bancă         | bank          120000  | w304
cash     | $170.000 în bancă         | bank          170000  | w151
coins    | 500 coins                 |                       | w7  | sumă 500
vehicle  | BMW M3 E36                | m3e36                 | w10    | val 6000 coins
vehicle  | Mercedes CLS 500 (W219)   | cls500w219            | w10    | val 6000 coins
vehicle  | Chevrolet Monte Carlo 1977| 77monte               | w10    | val 6000 coins
vehicle  | BMW M5 E34                | dlm5e34               | w10    | val 6000 coins
vehicle  | BMW X5 E53                | e53                   | w10    | val 6000 coins
vehicle  | Mercedes-Benz CLS 2019    | cls19                 | w10    | val 6000 coins
vehicle  | Audi RS3 2020             | dl20rs3               | w10    | val 6000 coins
vehicle  | Audi SQ5 2022             | dl22sq5               | w10    | val 6000 coins
vehicle  | Tesla Cybertruck          | dlcyber               | w10    | val 6000 coins
vehicle  | Mercedes E55 AMG          | dle55est              | w10    | val 6000 coins
vehicle  | Mitsubishi Lancer Evo IX  | dlevo9                | w10    | val 6000 coins
vehicle  | Lexus IS300               | dlis300               | w10    | val 6000 coins
vehicle  | Audi SQ7                  | dlsq7tow              | w10    | val 6000 coins
vehicle  | Dodge RAM Off-Road        | dltruckdb             | w10    | val 6000 coins
vehicle  | Mercedes-Benz GLE 450     | fangle450             | w10    | val 6000 coins
vehicle  | Mercedes-AMG GLE Coupé    | gta5rp_veh_gle1       | w10    | val 6000 coins
vehicle  | Hummer H2                 | h2m                   | w10    | val 6000 coins
vehicle  | BMW M135i Widebody        | m135iwb               | w10    | val 6000 coins
vehicle  | Range Rover               | rrab                  | w10    | val 6000 coins
vehicle  | BMW X6                    | x6wz                  | w10    | val 6000 coins
vehicle  | Volvo XC90                | xc90                  | w10    | val 6000 coins
item     | G18 Blue VVS              | WEAPON_G18BLUE        | w400   | x1 | 500 gloante | val 2000 coins
item     | G26 Laser Black VVS       | WEAPON_G26VVSBLACK    | w600   | x1 | 500 gloante
cash     | $50.000 în bancă          | bank          50000   | w1749
cash     | $70.000 în bancă          | bank          70000   | w892
cash     | $90.000 în bancă          | bank          90000   | w540
cash     | $140.000 în bancă         | bank          140000  | w223
```

## 🟪 Cutie Epic — `epic` — 2000 coins — 39 recompense

```
item     | Deagle Drum Black VVS     | WEAPON_DEAGLEDRUMBLACK | w600  | x1 | 500 gloante
item     | AUG Black VVS             | WEAPON_AUGVVSBLACK     | w200  | x1 | 500 gloante
vehicle  | BMW M3 E46                | m3e46                  | w10   | val 6000 coins
vehicle  | Mercedes-AMG C63          | c63hr                  | w10   | val 6000 coins
vehicle  | Audi RS7                  | rs7bratwa              | w10   | val 6000 coins
vehicle  | Nissan GT-R50             | gtr50                  | w10   | val 6000 coins
cash     | $80.000 în bancă          | bank          80000    | w2705
cash     | $120.000 în bancă         | bank          120000   | w1203
cash     | $170.000 în bancă         | bank          170000   | w599
cash     | $170.000 bani murdari     | black_money   170000   | w509
cash     | $270.000 în bancă         | bank          270000   | w238
cash     | $420.000 în bancă         | bank          420000   | w98
coins    | 1000 coins                |                        | w7    | sumă 1000
vehicle  | BMW M4 Competition (F82)  | m4c                    | w10   | val 6000 coins
vehicle  | BMW M4 Competition (G82)  | m4cc                   | w10   | val 6000 coins
vehicle  | BMW M5 CS                 | dlm5cs22               | w10   | val 6000 coins
vehicle  | Audi RS7 (C8)             | dlrs7c8                | w10   | val 6000 coins
vehicle  | Audi RS7 2021             | rs721                  | w10   | val 6000 coins
vehicle  | Audi RS6 2020             | dl20rs6                | w10   | val 6000 coins
vehicle  | Audi RS5 Sportback        | dlrs5sp                | w10   | val 6000 coins
vehicle  | Audi RS4 Avant            | dlrs4avant             | w10   | val 6000 coins
vehicle  | Audi RS4 Widebody         | rs4rk                  | w10   | val 6000 coins
vehicle  | Audi S8                   | audirs8                | w10   | val 6000 coins
vehicle  | Mercedes-AMG G63          | g63                    | w10   | val 6000 coins
vehicle  | Mercedes-AMG GLS 63       | dlgls63                | w10   | val 6000 coins
vehicle  | BMW X7 Manhart            | manhartx7              | w10   | val 6000 coins
vehicle  | BMW X7 2022               | dl22x7                 | w10   | val 6000 coins
vehicle  | Cadillac Escalade         | escaladeprime          | w10   | val 6000 coins
vehicle  | Toyota Supra MK4 Widebody | gfuckedsupra           | w10   | val 6000 coins
vehicle  | Mazda RX-7 VeilSide       | rx7veilside            | w10   | val 6000 coins
vehicle  | Jeep Grand Cherokee Trackhawk | demonhawkk         | w10   | val 6000 coins
vehicle  | Ford Mustang „Eleanor”    | eleanor                | w10   | val 6000 coins
vehicle  | Dodge Charger (F&F 8)     | chargerf8              | w10   | val 6000 coins
item     | MP5 Black VVS             | WEAPON_MP5VVSBLACK     | w400  | x1 | 500 gloante
item     | CX9 Gold VVS              | WEAPON_CX9_SMG         | w200  | x1 | 500 gloante | val 2000 coins
cash     | $100.000 în bancă         | bank          100000   | w1732
cash     | $150.000 în bancă         | bank          150000   | w770
cash     | $220.000 în bancă         | bank          220000   | w358
cash     | $350.000 în bancă         | bank          350000   | w141
```

## 🟨 Cutie Legendară — `legendara` — 2500 coins — 39 recompense

```
cash     | $3.000.000 în bancă       | bank          3000000  | w40
cash     | $3.500.000 bani murdari   | black_money   3500000  | w29
item     | Draco Black VVS           | WEAPON_DRACOVVSBLACK   | w600  | x1 | 500 gloante | val 2000 coins
item     | 300 Blackout Black VVS    | WEAPON_300BOVVSBLACK   | w200  | x1 | 500 gloante
item     | Deagle Drum Black VVS     | WEAPON_DEAGLEDRUMBLACK | w200  | x1 | 500 gloante
vehicle  | Bugatti Chiron 2019       | 2019chiron             | w10   | val 6000 coins
vehicle  | Pagani Huayra             | rmodpagani             | w10   | val 6000 coins
vehicle  | Ferrari 812 Superfast     | f812                   | w10   | val 6000 coins
vehicle  | Lamborghini Huracán       | huracanpriorbeast      | w10   | val 6000 coins
vehicle  | Koenigsegg Jesko          | jesko                  | w10   | val 6000 coins
vehicle  | Bugatti Chiron Super Sport| chironsupersport22     | w10   | val 6000 coins
cash     | $3.800.000 în bancă       | bank          3800000  | w25
cash     | $370.000 în bancă         | bank          370000   | w2605
cash     | $470.000 în bancă         | bank          470000   | w1614
cash     | $570.000 în bancă         | bank          570000   | w1098
cash     | $670.000 în bancă         | bank          670000   | w794
cash     | $770.000 în bancă         | bank          770000   | w601
cash     | $870.000 în bancă         | bank          870000   | w471
cash     | $970.000 în bancă         | bank          970000   | w379
coins    | 1500 coins                |                        | w11   | sumă 1500
vehicle  | Dodge Challenger SRT Demon| demon                  | w10   | val 6000 coins
vehicle  | Lamborghini Huracán EVO RWD | 1016rwdevo           | w10   | val 6000 coins
vehicle  | Lamborghini Huracán Performante LB | lbperfs       | w10   | val 6000 coins
vehicle  | Lamborghini Urus Mansory  | mansurus               | w10   | val 6000 coins
vehicle  | Lamborghini Urus Hycade   | hycadeurus             | w10   | val 6000 coins
vehicle  | Porsche 911 Speedhunter   | porche911speedhunter   | w10   | val 6000 coins
vehicle  | Porsche 911 GT3           | gt3demon               | w10   | val 6000 coins
vehicle  | Brabus Rocket G900        | dl_g900                | w10   | val 6000 coins
vehicle  | Rolls-Royce Cullinan 6x6  | rolls6x6               | w10   | val 6000 coins
vehicle  | RAM TRX 6x6               | godzramtrx6x6          | w10   | val 6000 coins
vehicle  | Mercedes-Maybach GLS 600  | dlgls600mb             | w10   | val 6000 coins
vehicle  | Mercedes-AMG GT R         | amggtrlight            | w10   | val 6000 coins
item     | AUG Black VVS             | WEAPON_AUGVVSBLACK     | w200  | x1 | 500 gloante
item     | HK33 Red VVS              | WEAPON_HK33VVSRED      | w200  | x1 | 500 gloante | val 2000 coins
item     | AKV9 VVS                  | WEAPON_AKV9            | w200  | x1 | 500 gloante | val 2000 coins
cash     | $1.200.000 în bancă       | bank          1200000  | w248
cash     | $1.500.000 în bancă       | bank          1500000  | w159
cash     | $2.000.000 în bancă       | bank          2000000  | w89
cash     | $2.500.000 în bancă       | bank          2500000  | w57
```

## 🟥 Cutie Ganguri & Familii — `cutie-ganguri-familii` — 2000 coins — 32 recompense

```
cash     | $200.000 bani murdari     | black_money   200000   | w3691
cash     | $300.000 bani murdari     | black_money   300000   | w1616
cash     | $400.000 bani murdari     | black_money   400000   | w909
cash     | $600.000 bani murdari     | black_money   600000   | w404
cash     | $900.000 bani murdari     | black_money   900000   | w150
cash     | $1.200.000 bani murdari   | black_money   1200000  | w80
cash     | $2.000.000 bani murdari   | black_money   2000000  | w30
item     | AK74U VVS                 | WEAPON_HAHA74U         | w40   | x1 | 500 gloante | val 2000 coins
item     | ARP Skeleton Black VVS    | WEAPON_SKELETONARPBLACK| w40   | x1 | 500 gloante
item     | Pump VVS                  | WEAPON_SOS             | w40   | x1 | 500 gloante | val 2000 coins
item     | Renetti VVS               | WEAPON_RKVVS           | w40   | x1 | 500 gloante | val 2000 coins
item     | MPX Gold VVS              | WEAPON_MPXVVS          | w40   | x1 | 500 gloante | val 2000 coins
item     | G Switch Black VVS        | WEAPON_SWITCHBLACK     | w40   | x1 | 500 gloante
item     | G Switch Drum VVS         | WEAPON_GDRUMVVS        | w40   | x1 | 500 gloante | val 2000 coins
item     | M10 VVS                   | WEAPON_M10             | w40   | x1 | 500 gloante | val 2000 coins
item     | Scorpion VVS              | WEAPON_SCORPIONVVS     | w40   | x1 | 500 gloante | val 2000 coins
item     | Draco Black VVS           | WEAPON_DRACOVVSBLACK   | w40   | x1 | 500 gloante | val 2000 coins
item     | 10x Vestă antiglonț       | armour                 | w500  | x10
item     | 15x Vestă antiglonț       | armour                 | w80   | x15
item     | 1000x Materiale de armă   | materiale_arme         | w100  | x1000
item     | 250x Adrenalină expirată  | adrenalina_expirata    | w600  | x250
item     | 2000x Materiale de armă   | materiale_arme         | w20   | x2000
item     | 5x Tactical Rifle         | WEAPON_TACTICALRIFLE   | w20   | x5 | 500 gloante
item     | 2x Defibrilator casat     | defibrilator_casat     | w600  | x2
item     | 5x Tactical Suppressor    | at_suppressor_heavy    | w100  | x5
item     | 5x Suppressor             | at_suppressor_light    | w100  | x5
item     | 5x Grip                   | at_grip                | w100  | x5
item     | 5x Flashlight             | at_flashlight          | w100  | x5
item     | 5x Extended Rifle Clip    | at_clip_extended_rifle | w100  | x5
item     | 5x Extended Pistol Clip   | at_clip_extended_pistol| w100  | x5
item     | 5x Extended SMG Clip      | at_clip_extended_smg   | w100  | x5
item     | 5x Extended Shotgun Clip  | at_clip_extended_shotgun| w100 | x5
```

---

# 2. PACHETELE VIP

Fiecare pachet dă: Premium pe X zile, mașini temporare (pe durata pachetului), bonus de skill, cash, sloturi de garaj și extra-uri.

| Pachet | id | Preț (coins) | Premium | Cash | Skill | Sloturi garaj | Doar newbie |
|---|---|---|---|---|---|---|---|
| Start | `start` | 1000 | 10 zile | 0 $ | +10% | +0 | DA |
| Bronz | `bronz` | 3500 | 7 zile | 20.000 $ | +20% | +1 | nu |
| Aur | `aur` | 7000 | 30 zile | 45.000 $ | +45% | +2 | nu |
| Platină | `platina` | 15000 | 90 zile | 100.000 $ | +80% | +3 | nu |

### Start — 1000 coins
- Premium **10 zile** · Cash **0 $** · Skill **+10%** · Sloturi garaj **+0**
- **Mașini (2, pe 10 zile):**
  - Volvo XC90 — spawn `xc90`
  - BMW M3 E36 — spawn `m3e36`
- **Reguli:** Doar pentru jucătorii noi: în primele 7 zile de la înregistrarea contului pe site, o singură dată pe cont. După el poți lua oricând Bronz, Aur sau Platină.
- Extra-uri: skills2, cars

### Bronz — 3500 coins
- Premium **7 zile** · Cash **20.000 $** · Skill **+20%** · Sloturi garaj **+1**
- **Mașini (3, pe 7 zile):**
  - BMW X5 E53 — spawn `e53`
  - Audi RS3 2020 — spawn `dl20rs3`
  - Mercedes-Benz CLS 2019 — spawn `cls19`
- Extra-uri: skills2, garage, cars

### Aur — 7000 coins
- Premium **30 zile** · Cash **45.000 $** · Skill **+45%** · Sloturi garaj **+2**
- **Mașini (4, pe 30 zile):**
  - BMW M4 Competition (G82) — spawn `m4cc`
  - Mercedes-AMG G63 — spawn `g63`
  - Audi SQ7 — spawn `dlsq7tow`
  - Mitsubishi Lancer Evo IX — spawn `dlevo9`
- **Reguli:** Nu îl poate lua un personaj urmărit de Poliție, cu cazier activ sau căruia Poliția i-a luat permisul de armă. Acela poate lua doar Bronz.
- Extra-uri: weapon, skills2, garage, cars

### Platină — 15000 coins
- Premium **90 zile** · Cash **100.000 $** · Skill **+80%** · Sloturi garaj **+3**
- **Mașini (5, pe 90 zile):**
  - Mercedes-Maybach GLS 600 — spawn `dlgls600mb`
  - Audi RS6 2020 — spawn `dl20rs6`
  - Cadillac Escalade — spawn `escaladeprime`
  - Range Rover — spawn `rrab`
  - Nissan Skyline GT-R R34 — spawn `r34h`
- **Reguli:** Nu îl poate lua un personaj urmărit de Poliție, cu cazier activ sau căruia Poliția i-a luat permisul de armă. Acela poate lua doar Bronz.
- Extra-uri: weapon, business, skills2, skillTree, garage, cars

---

# 3. ABONAMENT PREMIUM (planuri pe zile)

| Plan | id | Durată | Preț (coins) | Activ |
|---|---|---|---|---|
| 7 zile | `p7` | 7 zile | 1500 | DA |
| 30 zile | `p30` | 30 zile | 5000 | DA |
| 90 zile | `p90` | 90 zile | 12500 | DA |

Consum: **1 coin / zi** (burnPerDay).

---

# 4. BENEFICII PREMIUM

**Din prima zi:**
- [Transport] **+1 loc în garaj** — Din prima zi de Premium ții o mașină în plus în garaj.
- [Personaj] **Sala merge cu 10% mai repede** — Forța și rezistența cresc mai repede la antrenament, din prima zi.
- [Personaj] **Aștepți la jumătate până la spital** — Când ești inconștient, poți cere transportul la spital după jumătate din timpul obișnuit.
- [Site] **Insigna Premium pe site** — Apare lângă numele tău în contul de pe moldovarp.md.

**Pe toată durata:**
- [Personaj] **Sala merge mai repede** — Forța și rezistența cresc mai repede la antrenament.
- [Personaj] **Foamea și setea scad mai încet** — Mănânci și bei mai rar.
- [Transport] **Locuri în plus în garaj** — Ții mai multe mașini în garaj.
- [Personaj] **Peștele se vinde mai scump** — Primești mai mult pe peștele vândut.
- [Personaj] **Bani înapoi la magazinele 24/7** — Primești înapoi 10% din fiecare cumpărătură de la 24/7, cel mult 3.000 $ pe zi.
- [Transport] **Reducere la asigurare și înmatriculare** — Actele mașinii te costă mai puțin.
- [Personaj] **Câștig mai mare la joburile civile** — Taxi, pescuit, livrări, mecanic: câștigi mai mult muncind.
- [Facțiuni] **Pedeapsa la închisoare mai scurtă** — Stai mai puțin după gratii.
- [Personaj] **Toate skill-urile cresc mai repede** — Forță, tragere, rezistență, condus: progres mai rapid peste tot.

---

# 5. RECOMPENSE PE ORE JUCATE (eveniment)

Jucătorul primește automat premiul când atinge pragul de ore jucate. Eveniment activ: **05.11.2026 – 30.11.2026**, revendicare până la **07.12.2026**.

| Prag ore | Premiu | Grant (pe server) |
|---|---|---|
| 25 ore | $75.000 în bancă | cash · cont `bank` · 75.000 |
| 50 ore | $150.000 în bancă | cash · cont `bank` · 150.000 |
| 100 ore | 1.500 coins | coins · 1.500 |

> Pragurile și premiile se setează pe server. Site-ul le poate afișa ca info, dar acordarea se mută în joc.

---

# 6. MAȘINA DE JUCĂTOR NOU

Mașină gratuită pentru jucătorii noi care ating un prag de ore în primele zile.

| Setare | Valoare |
|---|---|
| Mașină | BMW M3 E46 — spawn `m3e46` |
| Prag ore | 50 ore jucate |
| Condiție | doar conturi noi (sub 10 ore la înregistrare) |
| Stare acum | **dezactivat** (ultimul eveniment s-a încheiat pe 05.11.2026) |

---

# 7. PREMIILE CLASAMENTULUI SĂPTĂMÂNAL

Clasamentul se face **după orele jucate** (luni 00:00 → duminică 23:59, ora Chișinăului). La final de săptămână, premiile se **trimit automat în joc** prin `/rewards/grant` (vezi secțiunea 8). Valori live:

| Categorie | Loc | Premiu | Grant (pe server) |
|---|---|---|---|
| Jucători (ore) | 1 | 1.500 coins | coins · 1.500 |
| Jucători (ore) | 2 | 1.000 coins | coins · 1.000 |
| Jucători (ore) | 3 | 500 coins | coins · 500 |
| Questuri | 1 | 1.500 coins | coins · 1.500 |
| Questuri | 2 | 1.000 coins | coins · 1.000 |
| Questuri | 3 | 500 coins | coins · 500 |
| Facțiunea săptămânii | — | 500.000 $ în bancă (la lider) | cash · cont `bank` · 500.000 |

- Câștigătorii primesc și **insigna „🏆 Top al săptămânii"** pe profil (pe site).
- Acordarea e **automată** (`auto: true`) — se trimite singură în joc. Dacă liderul facțiunii nu e găsit sau serverul e oprit, staff-ul dă premiul manual.
- Valorile se schimbă din **Admin → Clasament**.

---

# 8. CUM TRIMITE SITE-UL RECOMPENSELE ÎN JOC (`/rewards/grant`)

Site-ul **are deja** mecanismul de a da recompense automat în joc — ruta de joc **`POST /rewards/grant`** (confirmată activă pe server). Prin ea se dau acum premiile pe ore jucate și premiile de clasament. Formatul `grant` trimis jocului, pe tipuri:

```
coins    → { type: "coins",   amount: N }
bani bancă → { type: "cash",  account: "bank", amount: N }
bani cash  → { type: "cash",  account: "money", amount: N }
item     → { type: "item",    item: "COD_ITEM", amount: N }
vehicle  → { type: "vehicle", model: "cod_spawn" }
```
Plus `identifier` (personajul) și un `ref` unic (ca jocul să nu dea de două ori aceeași recompensă). **Același format acoperă TOT** ce e în acest fișier (cutii, pachete, ore jucate, clasament) — colegul poate folosi aceeași rută pentru toate.

---

# 9. QUESTURILE DE CRĂCIUN (rămân pe site — doar tombola intră în joc)

Questurile sunt **activități pe site** (nu se mută): Vânător de cadouri (12 cadouri ascunse pe pagini), Calendarul de Advent (18 căsuțe), Spiriduș harnic (10 zile cu sarcini), Cunoscător al regulamentului (100 răspunsuri corecte). Perioadă: **01.12.2026 – 07.01.2027**.

- **Fiecare quest terminat = 1 insignă + 1 bilet la tombolă**; toate 4 = încă o insignă („Crăciun 2026") + încă un bilet → **maxim 5 bilete / cont**.
- La tombolă intră doar conturile legate de personajul din joc.
- **Premiile tombolei se dau în joc de staff** (nu sunt pre-configurate pe site — se completează la tragere). Tragerea: un fondator, din Admin → Crăciun, aleator ponderat după bilete.

---

*Export complet și verificat. VIP Shop: 4 cutii (149 recompense), 4 pachete VIP, 3 planuri de abonament. Ore jucate: 3 praguri. Mașina de jucător nou. Clasament: premii pe locuri (jucători, questuri, facțiune). Toate valorile și codurile sunt exact cele din config-ul live. Site-ul trimite deja recompense în joc prin `/rewards/grant`.*

═══════════════════════════════════════════════════════════════════════
# PARTEA 2 — PROFILUL ÎN JOC (NUI) + LEGĂTURA CU SITE-UL
═══════════════════════════════════════════════════════════════════════

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

## 3. Legătura dintre cele două — endpoint LIVE ✅

Endpoint-ul care întoarce customizarea după identificatorul din joc **e deja pe site, pornit și testat** (401 fără cheie, 200 cu date corecte):

```
GET https://moldovarp.md/api/profil-din-joc/<identifier>
Header:  x-game-key: <GAME_PROFILE_KEY>
→ { linked, username, role, memberSince, bio, bioLocked, banner, bannerImg,
    bannerPos, bannerZoom, bannerZoomY, avatar, favCar, shownBadges, profilePublic }
```
- `<identifier>` = ID-ul contului din joc (ex. `char0:106f2e6aff...`).
- Serverul de joc îl cheamă când se deschide panoul și completează partea cosmetică peste datele de joc pe care le are deja local.
- **Protejat cu cheia `GAME_PROFILE_KEY`** (setată pe site; aceeași valoare o are serverul de joc — cheia o dă Sergiu). Fără cheie → 401. Cont nelegat de joc → 404 (`linked: false`).
- Mapări: `role` vine ca nume brut (ex. `owner`) → etichetă afișată; `favCar` vine ca cod de spawn (ex. `chargerf8`) → nume frumos cu lista de mașini; `avatar` e `null` dacă jucătorul n-a pus poză pe site.
- ⚠️ Ține cheia secretă: doar server-side, niciodată în client/NUI sau repo public.
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

**Eu (pe site) — GATA ✅:**
- Endpoint-ul `/api/profil-din-joc/:identifier` e **live și testat** (cheia `GAME_PROFILE_KEY` e setată pe site).
- Front-end-ul NUI complet (`profil-nui.html`) e **gata**, de pus în resursă.

**Colegul (pe server / FiveM):**
- Construiește resursa NUI: butonul de deschidere, trimiterea datelor de joc în panou.
- Cheamă endpoint-ul de pe site pentru partea cosmetică.
- (Mașinile cu cod de spawn — vezi lista separată — ca pozele să apară corect și în panou.)

---

## Pasul următor
Dacă vrei, **îți fac front-end-ul NUI gata** (o pagină HTML care arată exact ca profilul din poză), ca să i-o dai colegului direct. El doar o umple cu datele din joc. Spune-mi și o pregătesc.

*Specificație generată din config-ul și codul live al site-ului.*

═══════════════════════════════════════════════════════════════════════
# PARTEA 3 — CUM FUNCȚIONEAZĂ PROFILUL (referință)
═══════════════════════════════════════════════════════════════════════

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

═══════════════════════════════════════════════════════════════════════
# PARTEA 4 — DE REZOLVAT PE SERVER (ce nu merge încă pe site)
═══════════════════════════════════════════════════════════════════════

Puncte tehnice de pe server care încă nu ajung corect pe site (verificate pe datele live):

**1. Mașinile cu cod de spawn**
La vehiculele jucătorului (în `/players/search` și fișa personajului), câmpul `name` vine ca `model #123456789` (hash). Trimite și codul de spawn într-un câmp `model` (ex. `"model":"rx7veilside"`). Fără el, site-ul nu găsește poza mașinii. Acum ~**346 de mașini fără cod** (din 416 verificate).

**2. Banii afacerilor în `/assets`**
La benzinării și magazine (24/7 etc.), trimite și câmpul `money` (cât e în casa afacerii), ca proprietarul să-l vadă în Contul meu. Acum niciuna din afaceri nu trimite suma.

**3. Logurile pentru afaceri (categoria `afacere`)**
Trimite logurile despre afaceri (cumpărare, vânzare, bani scoși/puși, angajați) cu categoria `afacere`. Site-ul are deja filtrul pregătit în Admin → Loguri. Momentan nu vine niciun log cu categoria asta.

**4. Mașinile din pachetele de start (Bronz, Aur, Platină, Start)**
Pe site apar „în curând". În joc trebuie să meargă `vehicles: true` la pachet, plus lista de modele (sunt în Partea 1 → Pachete). Mașini temporare pe durata pachetului: 7 / 30 / 90 de zile, iar la Start 10 zile.

**5. Pachetul Start — skill-urile**
Forța, tragerea și rezistența la 10%, iar plămânii și condusul tot la 10%, când jucătorul cumpără pachetul.

---

*Dosar complet generat din config-ul și codul live al site-ului. Toate valorile și codurile sunt verificate. Fișierul de cod al panoului de profil este separat: `profil-nui.html`.*
