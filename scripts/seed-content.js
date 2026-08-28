// Default content for every editable block on the public site.
//
// Consumed by scripts/init-db.js, which upserts each row into page_blocks
// with ON CONFLICT (page, block_key) DO NOTHING — so the FIRST deploy after
// this file ships seeds the DB with exactly what's on the site today, and
// any block an admin later edits from Admin → Conținut pagini is never
// touched again by a later redeploy (the seed never runs UPDATE).
//
// type meaning (see database/schema.sql):
//   'text'     — un rând/paragraf simplu, editat ca text simplu în admin.
//   'richtext' — text scurt cu formatare minimă (ex: <br>, <span>), editat
//                cu un mini-toolbar (bold/italic/link/listă) în admin.
//   'html'     — bloc de HTML brut, editat direct ca cod în admin.
//   'list'     — elemente repetate; content e un JSON array de obiecte
//                {icon, title, text, url} (câmpuri neutilizate rămân goale).

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Ghid facțiuni / legislație rutieră — conținutul complet, mutat aici din
// scriptul inline care trăia direct în ghid-factiune.html. Fiecare secțiune
// e randată o singură dată, la seed, ca HTML simplu (h2 + p/ul), stocată în
// page_blocks ca bloc "{slug}_body" de tip 'html' — editabilă direct din
// admin, cu tot cu formatare, fără nicio structură intermediară de reținut.
// ---------------------------------------------------------------------------
const GUIDES = {
  politie: {
    icon: "👮", title: "Poliție", tagline: "Menține ordinea, aplică legea și protejează cetățenii.",
    sections: [
      {
        h: "Principii generale și suspiciunea rezonabilă",
        list: [
          "Toți agenții trebuie să respecte strict procedurile oficiale, indiferent de grad.",
          "O abatere procedurală poate fi invocată în apărare și poate reduce proporțional pedeapsa.",
          "Contravențiile presupun doar amendă și măsuri administrative — fără reținere, cătușe sau citirea drepturilor.",
          "Infracțiunile presupun obligatoriu: identificarea persoanei, anunțarea reținerii, citirea drepturilor, posibil cătușe și transport la sediul IGP.",
          "Pedeapsa cumulată maximă pentru toate faptele dintr-un singur incident: 180 de luni de închisoare și/sau 300.000 lei amendă.",
          "Aprecierea de bună-credință a agentului privind suspiciunea rezonabilă nu poate fi sancționată ulterior dacă fapta suspectată nu se confirmă.",
          "Documentele procedurale sunt valide doar cu semnătura agentului — semnătura persoanei vizate nu este niciodată obligatorie.",
          "Un singur element e suficient pentru legitimare/oprire/percheziție: comportament nervos, zonă cu activitate infracțională recentă, declarații contradictorii, miros de substanțe, obiecte ilegale vizibile, tentativă de evitare, corespondență cu o descriere, necooperare nejustificată, oră târzie în zonă izolată, sau orice altă circumstanță pe care un agent rezonabil ar considera-o suspectă.",
          "Aprecierea suspiciunii se face în timp real de agentul prezent — nu e nevoie de dovezi sau certitudine prealabilă."
        ]
      },
      {
        h: "Oprirea vehiculelor și legitimarea cetățenilor",
        list: [
          "Temeiuri pentru oprirea unui vehicul: încălcare observată, suspiciune rezonabilă de implicare, filtru de rutină legal constituit și semnalizat, vehicul căutat, sau control aleatoriu.",
          "Agentul trebuie să comunice motivul opririi înainte de a solicita alte verificări.",
          "Percheziția vehiculului este interzisă fără justificare documentată.",
          "Refuzul opririi sau fuga constituie infracțiunea de la Art. 203.2.",
          "Temeiuri pentru legitimare: suspiciune rezonabilă, acces în zonă restricționată, corespondență cu o descriere activă, control de rutină (inclusiv aleatoriu, fără autorizare prealabilă), proximitate față de o infracțiune recentă, sau alte situații de bună-credință.",
          "Durata legitimării trebuie să fie rezonabilă — complexitatea situației determină durata.",
          "Refuzul de a coopera întărește suspiciunea și poate justifica verificare, percheziție sau reținere suplimentară."
        ]
      },
      {
        h: "Percheziții",
        list: [
          "Justificare necesară: suspiciune rezonabilă, reținere pentru infracțiune, verificare de siguranță în timpul unei opriri/legitimări legale, consimțământ explicit sau tacit, sau comportament evaziv față de corp/vehicul.",
          "Percheziția corporală necesită anunțarea motivului și, ideal, prezența unui martor.",
          "Fiecare obiect găsit se documentează individual, cu descriere exactă.",
          "Obiectele ilegale (arme, substanțe, bunuri furate, dispozitive de comunicare) se confiscă automat ca probă.",
          "Vehiculele se percheziționează doar cu justificare documentată, ideal cu proprietarul/șoferul prezent.",
          "Ridicarea vehiculului e permisă pentru contravenții care prevăd această măsură (taxă standard 5.000 lei) sau când a fost folosit la comiterea unei infracțiuni (reținut până la finalizarea anchetei).",
          "Validitatea percheziției depinde de motivul consemnat în document — un motiv neconsemnat invalidează doar percheziția, nu și celelalte constatări."
        ]
      },
      {
        h: "Reținerea, arestarea și uzul de forță",
        list: [
          "Agentul comunică motivul reținerii: „Ești reținut pentru infracțiunea de [descriere/articol]\".",
          "Citirea drepturilor este obligatorie înainte de orice interviu pentru infracțiune.",
          "Cătușarea este măsura standard de siguranță pentru toate infracțiunile — poate fi omisă la cazuri minore, la discreția agentului.",
          "Percheziția corporală este obligatorie după reținere, pentru siguranță și conservarea probelor.",
          "Transport la sediul IGP dacă procedura continuă.",
          "Dacă persoana cere avocat, interviul pentru infracțiune se suspendă până la sosirea acestuia — pot continua doar întrebările de identificare; dacă avocatul nu e disponibil, procedura continuă fără el.",
          "Interviul se documentează într-un raport, iar sancțiunea se aplică pe baza gradării articolului, ținând cont de circumstanțe.",
          "Se completează formularul PVCI (8.2), iar persoana este fie eliberată (cu amendă aplicată), fie reținută conform sancțiunii.",
          "Uzul de forță este gradual: prezență/comandă verbală → control fizic minim/cătușare → echipament (spray/tonfa/taser) în caz de rezistență activă → armă de foc doar pentru amenințare iminentă la viață sau siguranță publică.",
          "Fiecare folosire a forței trebuie justificată în document — nivel, motiv și rezultat."
        ]
      },
      {
        h: "Drepturile suspectului și rolul avocatului",
        list: [
          "Citirea drepturilor e obligatorie înainte de interviul pentru infracțiune, imediat după reținere/cătușare, sau înainte de o declarație scrisă a suspectului.",
          "Nu este necesară pentru contravenții.",
          "Formula standard include: notificarea suspiciunii, dreptul la tăcere, avertismentul privind folosirea declarației, dreptul la avocat și confirmarea înțelegerii.",
          "Omiterea citirii drepturilor este o abatere procedurală ce poate reduce pedeapsa cu maximum 10%, fără să afecteze celelalte constatări din document.",
          "Orice persoană reținută pentru infracțiune are dreptul la avocat pe tot parcursul procedurii, din momentul reținerii — nu se aplică la contravenții.",
          "Avocatul verifică documentele și poate semnala: omiterea completă a citirii drepturilor, lipsa justificării pentru percheziție/reținere, forță disproporționată nedocumentată, sau eroare legală vădită, nepotrivită cu faptele descrise.",
          "Avocatul nu poate contesta aprecierea de moment a agentului privind oportunitatea sau suspiciunea.",
          "Abaterile procedurale grave, confirmate, pot reduce pedeapsa cumulată cu maximum 30%, la decizia conducerii IGP."
        ]
      },
      {
        h: "Documentarea procedurilor (formulare oficiale)",
        list: [
          "Contravențiile se documentează prin PVCC (Formular 8.1) — document intern al agentului, cu amendă, zile de suspendare a permisului, puncte de penalizare (din 12) și alte măsuri administrative; nu necesită contrasemnătura persoanei.",
          "Infracțiunile se documentează prin PVCI (Formular 8.2) — trebuie să consemneze citirea drepturilor, anunțarea reținerii, justificarea cătușării, uzul de forță (motiv/nivel/rezultat), cererea/disponibilitatea avocatului, probele ridicate și toate persoanele implicate; se încheie cu eliberare (amendă) sau reținere continuă (luni specificate); nu necesită contrasemnătură.",
          "Declarațiile martorilor se documentează prin Formularul 8.3, valabil indiferent dacă martorul contrasemnează sau nu.",
          "Plângerea penală se depune prin Formularul 8.4 de către reclamant/victimă, cu data/ora/locul exact, descrierea faptei, prejudiciul estimat și dovezile atașate.",
          "Percheziția (corporală sau a vehiculului) se documentează prin PVP (Formularul 8.5), cu data/ora/locul exact, motivul, fiecare obiect găsit individual și statutul confiscării — valid prin semnătura agentului."
        ]
      },
      {
        h: "Reabilitarea cazierului judiciar",
        list: [
          "Reabilitarea restabilește statusul dosarului și elimină mențiunea de „cazier\" — nu șterge faptele din istoricul cazului.",
          "Condiții cumulative: cerere scrisă, minimum 10 zile calendaristice de la rămânerea definitivă a ultimei condamnări (sau finalizarea pedepsei), conduită curată în acest interval, și o taxă de 200.000 lei.",
          "Intervalul se resetează dacă apare o nouă infracțiune, indiferent de statusul acesteia.",
          "Doar ofițerii cu gradul de Comisar sau superior pot prelua cererile; doar Inspectorul General le poate aproba.",
          "Ofițerul verifică condițiile și înaintează cererea Inspectorului General, care are decizia finală, scrisă și motivată.",
          "Reabilitarea aprobată se consemnează ca „Reabilitat [dată], aprobat de Inspectorul General\".",
          "Condamnările anterioare nu mai contează pentru agravarea de recidivă după reabilitare, dar cazurile deschise rămân neafectate, iar faptele nedescoperite înainte de reabilitare pot fi în continuare urmărite.",
          "Reabilitarea acordată verbal sau din oficiu este interzisă, la fel ca reducerile de taxă fără aprobarea conducerii IGP."
        ]
      },
      {
        h: "Cod Penal — Capitolul 1: Contravenții",
        list: [
          "Art. 101 — Trecerea pe roșu — 5.000$ + suspendare 24h",
          "Art. 102 — Parcare ilegală — 5.000$",
          "Art. 103 — Obstrucționarea vehiculelor de urgență — 5.000$ + suspendare 24h",
          "Art. 104 — Condus imprudent — 5.000$ + suspendare 24h",
          "Art. 105 — Accident rutier fără victime — 10.000$",
          "Art. 106.1 — Viteză 11–20 km/h peste limită — 3.000$ + 3 puncte de penalizare",
          "Art. 106.2 — Viteză 21–30 km/h peste limită — 5.000$ + 5 puncte",
          "Art. 106.3 — Viteză 31–40 km/h peste limită — 7.000$ + 7 puncte",
          "Art. 106.4 — Viteză 41–50 km/h peste limită — 9.000$ + 9 puncte",
          "Art. 106.5 — Viteză 51–70 km/h peste limită — 12.000$ + suspendare 24h",
          "Art. 106.6 — Viteză 71–100 km/h peste limită — 15.000$ + suspendare 48h",
          "Art. 106.7 — Viteză peste 100 km/h peste limită — 20.000$ + suspendare 72h",
          "Art. 107 — Purtarea unei măști în timpul condusului — 4.000$",
          "Art. 108 — Nesupunere față de poliție — 3.000$",
          "Art. 109 — Lipsa asigurării auto — 15.000$",
          "Art. 110 — Obscenitate/insulte publice — 5.000$",
          "Art. 111 — Modificări ilegale ale vehiculului — 15.000$ + 5 puncte + ridicarea vehiculului (taxă 10.000$)",
          "Art. 112 — Apel fals de urgență — 5.000$",
          "Art. 113 — Lipsa documentelor obligatorii — 10.000$",
          "Art. 114 — Tulburarea liniștii publice — 3.000$",
          "Art. 115 — Încălcarea regulilor de traversare pentru pietoni — 5.000$",
          "Art. 116 — Încălcarea liniei continue — 15.000$ + suspendare 24h"
        ]
      },
      {
        h: "Cod Penal — Capitolul 2: Infracțiuni la ordinea publică",
        list: [
          "Art. 201 — Condus fără permis — 15 luni + 15.000$",
          "Art. 202 — Părăsirea locului accidentului — 15 luni + 20.000$",
          "Art. 203 — Punerea în pericol a traficului — 18.000$",
          "Art. 203.1 — Sustragerea de la urmărirea poliției — 24.000$",
          "Art. 204 — Condus fără plăcuțe/vehicul neînmatriculat — 12.000$",
          "Art. 205 — Constituirea unui grup infracțional organizat — 50 luni + 50.000$"
        ]
      },
      {
        h: "Cod Penal — Capitolul 3: Infracțiuni contra persoanei și autorității",
        list: [
          "Art. 301 — Omor — 30 luni + 30.000$",
          "Art. 302 — Omor calificat — 60 luni + 60.000$",
          "Art. 303 — Ucidere din culpă — 25 luni + 25.000$",
          "Art. 304 — Amenințări — 5 luni + 7.000$",
          "Art. 305 — Lipsire de libertate în mod ilegal — 20 luni + 20.000$",
          "Art. 306 — Lovire cu vătămare — 15 luni + 15.000$",
          "Art. 307 — Viol — 30 luni + 30.000$",
          "Art. 308 — Participare la altercație — 10 luni + 10.000$",
          "Art. 309 — Șantaj — 20 luni + 20.000$",
          "Art. 310 — Hărțuire — 15 luni + 15.000$",
          "Art. 311 — Agresarea unui oficial public — 60 luni + 60.000$",
          "Art. 312 — Uzurparea autorității oficiale — 30 luni + 30.000$"
        ]
      },
      {
        h: "Cod Penal — Capitolul 4: Infracțiuni contra proprietății",
        list: [
          "Art. 401 — Furt — 20 luni + 20.000$",
          "Art. 402 — Jaf armat — 30 luni + 30.000$",
          "Art. 403 — Jaf calificat — 40 luni + 40.000$",
          "Art. 404 — Abuz de încredere — 15 luni + 15.000$",
          "Art. 405 — Înșelăciune — 20 luni + 20.000$",
          "Art. 406 — Distrugere de bunuri — 15 luni + 10.000$",
          "Art. 407 — Distrugere calificată — 40 luni + 40.000$",
          "Art. 408 — Distrugere din culpă — 15 luni + 10.000$",
          "Art. 409 — Pătrundere fără drept — 15 luni + 15.000$",
          "Art. 410 — Furt calificat — 25 luni + 25.000$",
          "Art. 411 — Furt de vehicul — 15 luni + 20.000$",
          "Art. 412 — Jaf asupra unei entități comerciale — 45 luni + 60.000$"
        ]
      },
      {
        h: "Cod Penal — Capitolul 5: Corupție și abuz în serviciu",
        list: [
          "Art. 501 — Luare de mită — 120 luni + 120.000$",
          "Art. 502 — Dare de mită — 120 luni + 120.000$",
          "Art. 503 — Trafic de influență — 120 luni + 120.000$",
          "Art. 504 — Comportament abuziv al unui oficial — 30 luni + 60.000$",
          "Art. 505 — Abuz în serviciu — 60 luni + 120.000$",
          "Art. 506 — Neglijență în serviciu — 20 luni + 30.000$",
          "Art. 507 — Uzurparea unei funcții oficiale — 40 luni + 60.000$",
          "Art. 508 — Divulgarea secretelor de stat — 240 luni + 300.000$",
          "Art. 509 — Divulgarea secretelor de serviciu — 120 luni + 200.000$"
        ]
      },
      {
        h: "Cod Penal — Capitolul 6: Infracțiuni economice și fals",
        list: [
          "Art. 600 — Prevedere privind confiscarea obligatorie a bunurilor",
          "Art. 601 — Falsificarea de documente oficiale — 50 luni + 60.000$",
          "Art. 602 — Folosirea de documente false — 50 luni + 70.000$",
          "Art. 603 — Spălare de bani — 60 luni + 100.000$ + confiscarea bunurilor",
          "Art. 604 — Evaziune fiscală — 50 luni + 70.000$",
          "Art. 605 — Delapidare — 40 luni + 50.000$"
        ]
      },
      {
        h: "Cod Penal — Capitolul 7: Obstrucționarea justiției",
        list: [
          "Art. 701 — Acuzație falsă — 30 luni + 30.000$",
          "Art. 702 — Ajutorarea făptuitorului — 20 luni + 25.000$",
          "Art. 703 — Tăinuirea unei infracțiuni — 25 luni + 30.000$",
          "Art. 704 — Obstrucționarea justiției — 40 luni + 40.000$",
          "Art. 705 — Mărturie mincinoasă — 25 luni + 25.000$",
          "Art. 706 — Represalii împotriva unui martor — 120 luni + 200.000$",
          "Art. 707 — Evadare din custodie — 70 luni + 100.000$",
          "Art. 708 — Facilitarea unei evadări — 70 luni + 100.000$",
          "Art. 709 — Nedenunțarea unei infracțiuni — 30 luni + 30.000$",
          "Art. 710 — Nedenunțare de către un oficial — 30 luni + 30.000$"
        ]
      },
      {
        h: "Cod Penal — Capitolul 8: Arme, muniție și substanțe",
        list: [
          "Art. 801 — Deținere ilegală de arme Categoria I.1/I.2 — 30 luni + 50.000$",
          "Art. 802 — Deținere ilegală de arme automate/de asalt — 50 luni + 70.000$",
          "Art. 803 — Deținere ilegală de muniție — 20 luni + 40.000$",
          "Art. 804 — Descărcarea neautorizată a unei arme de foc — 40 luni + 50.000$",
          "Art. 805 — Agresiune armată cu vătămare — 60 luni + 100.000$",
          "Art. 806 — Trafic ilegal de arme — 70 luni + 200.000$",
          "Art. 807 — Deținere de substanțe Clasa II (uz personal) — 20 luni + 20.000$",
          "Art. 808 — Deținere de substanțe Clasa I (uz personal) — 30 luni + 30.000$",
          "Art. 809 — Trafic de substanțe Clasa II — 40 luni + 40.000$",
          "Art. 810 — Trafic de substanțe Clasa I — 60 luni + 60.000$"
        ]
      },
      {
        h: "Regimul Armelor — Categoria I (arme permise civililor, cu permis)",
        list: [
          "I.1 — Pistoale semi-automate (Pistol, Combat Pistol, SNS Pistol, Vintage Pistol, Heavy Pistol).",
          "I.2 — Revolvere și pistoale speciale, doar pentru colecție (Heavy Revolver, Double-Action Revolver, Navy Revolver, Marksman Pistol) — portul și folosirea ca armă activă de autoapărare nu sunt permise.",
          "I.3 — Armă lungă pentru apărarea locuinței (Pump Shotgun) — legală exclusiv pentru apărarea proprietății, portul pe stradă este interzis.",
          "Condiții de eligibilitate (comune I.1–I.3): funcție de stat cu expunere reală/demonstrabilă la pericol (poliție, securitate, justiție, intervenție de urgență sau echivalent); fără condamnări anterioare pentru arme/explozivi/substanțe ilegale; capacitate deplină de exercițiu, fără măsuri de tutelă; fără anchete penale în desfășurare; fără antecedente de comportament violent sau amenințări; test psihologic promovat; test scris pe legislația armelor; declararea locului și metodei de păstrare în siguranță.",
          "Documente pentru cerere: copie act de identitate, dovadă scrisă a funcției de la angajator, descrierea atribuțiilor care justifică expunerea la risc, cazier judiciar (dacă e cerut).",
          "Documente pentru înregistrarea armei: document de vânzare de la un dealer autorizat, permisul valid, arma fizică pentru verificarea seriei.",
          "Procesarea cererii durează un termen rezonabil, extensibil dacă verificarea funcției sau a antecedentelor cere timp suplimentar."
        ]
      },
      {
        h: "Regimul Armelor — Categoriile II–IV (unelte, interzise, distructive)",
        list: [
          "II.1 — Unelte și echipament sportiv fără permis (bâtă de baseball, crosă de golf, ciocan, rangă, lanternă, machetă, satâr, cheie țeavă, tac de biliard) — folosirea ca armă împotriva unei persoane constituie agresiune armată.",
          "II.2 — Dispozitive neletale (pistol cu electroșocuri/taser) — permisiunea pentru civili se decide de autorități; uz exclusiv de autoapărare sau rezervat poliției.",
          "Categoria III — interzise complet civililor: pistoale automate, pistoale mitralieră (SMG), arme de asalt, arme de lunetist, puști tactice, mitraliere grele — consecință: arestare imediată, confiscarea armei, deschiderea unui dosar penal.",
          "Categoria IV — arme de distrugere în masă și explozivi: grenade, bombe adezive, mine de proximitate, cocktailuri Molotov, RPG-uri, rachete ghidate, minigun-uri — consecință: infracțiune gravă, trimitere imediată către specialiștii antiteroriști."
        ]
      },
      {
        h: "Omologări Auto — Categoria I (modificări permise, cu aprobare obligatorie)",
        list: [
          "I.1 — Geamuri fumurii/folie solară: parbriz maximum 30% opacitate, geamurile față maximum 50%, geamurile spate/luneta maximum 70%. Taxă: 25.000. Inspecție: măsurarea tehnică a opacității de către ofițerul desemnat.",
          "I.2 — Sisteme de suspensie (sport coborâtă, ridicată/off-road, ajustabilă pe înălțime — coilover). Taxă: 30.000. Inspecție: verificare fizică a înălțimii, cu reverificare periodică la reomologare.",
          "I.3 — Iluminare suplimentară și neon (underglow în culorile albastru, verde, mov, galben, alb; leduri de grilă/bară față doar pentru uz off-road, interzis pe stradă în funcțiune) — roșu și albastru strict interzise, rezervate vehiculelor de urgență. Taxă: 40.000.",
          "I.4 — Sistem de eșapament sport, cu nivel de zgomot certificat obligatoriu — fără certificare, modificarea e respinsă automat. Taxă: 15.000.",
          "Procesul standard de aprobare (10 pași, valabil pentru toate categoriile): 1) depunerea cererii scrise cu act de identitate și înmatriculare; 2) verificarea preliminară a dosarului; 3) programarea la inspecția tehnică; 4) inspecția tehnică și întocmirea referatului; 5) verificarea cazierului; 6) plata taxei; 7) referatul final al ofițerului cu recomandare; 8) decizia conducerii (aprobare/respingere); 9) comunicarea scrisă a deciziei; 10) eliberarea certificatului de omologare (dacă e aprobat).",
          "Taxa de reomologare (la modificarea unui parametru deja aprobat): 10.000."
        ]
      },
      {
        h: "Omologări Auto — Interzise și scutite de aprobare",
        list: [
          "Categoria II — interzise complet, fără posibilitate de aprobare: geamuri complet opace (100%), parbriz peste 30% opacitate, neon/underglow roșu sau albastru, girofaruri/semnale de urgență neautorizate, sisteme de bruiaj radar/comunicații poliție, plăcuțe falsificate/duplicate/mascate electronic, suspensie peste limitele stabilite, blindaj neautorizat al vehiculului/geamurilor. Consecință: imobilizarea imediată a vehiculului.",
          "Categoria III — scutite de aprobare, pur estetice: folie decorativă, autocolante/stickere, huse pentru scaune, sisteme audio interioare fără emisie de lumină spre exterior."
        ]
      }
    ],
    apply: "Aplică pentru Poliție prin Discord"
  },
  smurd: {
    icon: "🚑", title: "SMURD", tagline: "Intervine rapid în situații de urgență și salvează vieți.",
    sections: [
      {
        h: "Regulament — reguli obligatorii",
        list: [
          "Nu se acordă resuscitare persoanelor împușcate în cap.",
          "Este interzisă vânzarea materialelor spitalului.",
          "Este strict interzis să faci parte din găști sau mafii.",
          "Nu sunt permise jignirile sau cuvintele obscene față de pacienți sau colegi.",
          "Ținuta/uniforma trebuie respectată obligatoriu.",
          "Nu este permis refuzul unui apel sau al unui pacient — cu excepția cazului în care ești deja ocupat cu altă intervenție.",
          "Este strict interzis să mergi la apeluri cu mașina personală.",
          "Rămânerea conectat la comunicațiile stației este obligatorie, cu anunțarea plecării și a revenirii.",
          "Nerespectarea cerințelor sau ordinelor unui superior duce la sancționare disciplinară.",
          "Este interzisă primirea de șpagă/atenții.",
          "Elicopterul se folosește începând de la gradul de Asistent Inspector.",
          "Cayo Island și zonele de vânătoare ilegală sunt interzise în timpul serviciului.",
          "Semnalele acustice și luminoase se folosesc exclusiv în timpul intervențiilor/apelurilor.",
          "Ședințele au loc vineri–duminică, în jurul orei 20:00 — absențele necesită motivare."
        ]
      },
      {
        h: "Prețuri",
        list: [
          "Bandaj — 250$",
          "Trusă de prim ajutor (Verde) — 2000$ (–50% cu asigurare medicală)",
          "Trusă Mare Avansată (Roșie) — 500$",
          "Antibiotic — 300$",
          "Cutie Sanitară — 5000$ (–50% cu asigurare medicală)",
          "Calmante — 200$",
          "Set de tablete — 400$",
          "Epinefrină — 2000$/bucată, disponibilă doar celor cu certificat de prim ajutor, plus șefului de poliție, conducerii găștilor/mafiilor sau generalilor armatei",
          "Fără o asigurare medicală validă, nu se vinde niciun produs.",
          "Cursul de prim ajutor nu mai este oferit cetățenilor obișnuiți — e rezervat exclusiv rangurilor de conducere menționate mai sus."
        ]
      }
    ],
    apply: "Aplică pentru SMURD prin Discord"
  },
  armata: {
    icon: "🪖", title: "Armată", tagline: "Asigură securitatea și participă la misiuni speciale.",
    sections: [
      {
        h: "Cerințe generale",
        p: ["Necunoașterea regulilor nu scutește de pedeapsă. Acceptarea regulamentului este obligatorie la intrarea în facțiune."],
        list: [
          "Se cere conduită militară: disciplină, respect și seriozitate.",
          "Comportamentul toxic (jigniri, amenințări, trolling, abuz) este interzis.",
          "Ordinul superiorilor se execută fără discuții.",
          "Prezența la instruiri și ședințe este obligatorie."
        ]
      },
      {
        h: "Reguli de RolePlay",
        list: [
          "Respectarea integrală a regulamentului serverului este obligatorie.",
          "Nu sunt permise încălcări de RP precum FailRP, PowerGaming sau MetaGaming.",
          "Intervențiile necesită identificare corectă: nume, rang și situația raportată.",
          "Ordinele de teren se execută imediat, fără întârziere."
        ]
      },
      {
        h: "Arme și echipament",
        list: [
          "Echipamentul primit de la armată nu se împrumută și nu se vinde.",
          "Armele se folosesc doar la ordin sau cu justificare RP clară.",
          "Pierderea echipamentului din neglijență personală poate atrage sancțiuni."
        ]
      },
      {
        h: "Conduita în cadrul facțiunii",
        list: [
          "Respect total față de colegi și superiori.",
          "Este interzis consumul de droguri.",
          "Este interzisă colaborarea cu găști.",
          "Sunt interzise orice activități ilegale.",
          "Absențele repetate și nejustificate duc la retrogradare sau Faction Warn."
        ]
      },
      {
        h: "Plecare și revenire",
        list: [
          "Plecarea din facțiune fără motiv întemeiat poate duce la blacklist.",
          "Revenirea necesită o cerere nouă și aprobarea staff-ului."
        ]
      },
      {
        h: "Sancțiuni (aplicate de conducerea Armatei)",
        list: ["Avertisment verbal", "Faction Warn", "Retrogradare", "Suspendare", "Concediere cu blacklist"]
      }
    ],
    apply: "Aplică pentru Armată prin Discord"
  },
  moto: {
    icon: "🏍️", tag: "LEGISLAȚIE RUTIERĂ", title: "Categoria A — Moto", tagline: "Permis pentru motociclete și vehicule ușoare.",
    sections: [
      {
        h: "Obligații generale",
        list: [
          "Este obligatorie deținerea unui permis valabil pentru categoria de vehicul condus — condusul fără permis e interzis și penalizat prin lege.",
          "Vehiculul trebuie condus cu prudență, cu respectarea regulamentului de circulație, fără a pune în pericol ceilalți participanți la trafic.",
          "Conducătorul trebuie să rămână atent la condițiile drumului și să păstreze controlul vehiculului.",
          "Folosirea telefonului este interzisă fără sistem hands-free.",
          "La semnalul poliției rutiere, oprirea într-un loc sigur este obligatorie și imediată — refuzul opririi constituie o abatere gravă."
        ]
      },
      {
        h: "Verificări înainte de plecare",
        list: [
          "Sistemul de frânare",
          "Nivelul de ulei",
          "Luminile vehiculului",
          "Direcția și roțile",
          "Oglinzile și vizibilitatea",
          "Centurile de siguranță trebuie purtate de conducător și pasageri pe tot parcursul călătoriei."
        ]
      },
      {
        h: "Reguli de circulație și viteză",
        list: [
          "Semnele, semnalele și instrucțiunile poliției trebuie respectate întocmai.",
          "Oprire completă înainte de linia de oprire la culoarea roșie a semaforului.",
          "La indicatorul STOP, oprire completă și verificarea siguranței înainte de a continua.",
          "Prioritatea se respectă la intersecții și sensuri giratorii — vehiculele aflate deja în giratoriu au prioritate.",
          "Viteza trebuie adaptată traficului — în zone urbane se recomandă aproximativ 50 km/h.",
          "Viteza se reduce pe ploaie, ceață sau carosabil alunecos, cu distanță mai mare față de vehiculul din față.",
          "Pietonii au prioritate la trecerile de pietoni — viteza se reduce și se oprește dacă un pieton încearcă să traverseze.",
          "Luminile sunt obligatorii noaptea sau la vizibilitate redusă.",
          "Vehiculele de urgență (ambulanță, poliție, pompieri) au prioritate cu semnalele active — banda trebuie eliberată pentru acestea."
        ]
      },
      {
        h: "Schimbarea direcției, depășiri și condus defensiv",
        list: [
          "Semnalizarea din timp este obligatorie înainte de schimbarea direcției sau a benzii.",
          "Depășirea este permisă doar unde marcajul rutier o permite — depășirea pe linie continuă este interzisă.",
          "Frânarea trebuie să fie progresivă și controlată, fără mișcări bruște care pot duce la pierderea controlului.",
          "Viteza se adaptează în curbe pentru stabilitate.",
          "Condus defensiv: anticiparea situațiilor periculoase, păstrarea distanței față de vehiculul din față, respectarea limitelor de viteză, evitarea manevrelor periculoase și atenție sporită la pietoni și bicicliști."
        ]
      }
    ]
  },
  auto: {
    icon: "🚗", tag: "LEGISLAȚIE RUTIERĂ", title: "Categoria B — Auto", tagline: "Permis pentru autoturisme și vehicule uzuale.",
    sections: [
      {
        h: "I. Semne și indicatoare de circulație",
        list: [
          "Toți conducătorii trebuie să respecte semnele și semnalele rutiere.",
          "Indicatorul STOP obligă conducătorul auto să oprească complet vehiculul înainte de intersecție.",
          "Indicatorul de cedare a trecerii cere reducerea vitezei și acordarea priorității vehiculelor de pe drumul principal."
        ]
      },
      { h: "II. Semafoare", list: ["Roșu — oprire completă obligatorie.", "Galben — pregătire de oprire.", "Verde — se poate trece doar după confirmarea că intersecția este liberă."] },
      { h: "III. Siguranța în vehicul", list: ["Centurile de siguranță sunt obligatorii pentru conducător și toți pasagerii pe durata deplasării.", "Nerespectarea acestei obligații constituie abatere rutieră cu sancțiuni."] },
      { h: "IV. Prioritatea pietonilor", list: ["Conducătorii trebuie să reducă viteza și să acorde prioritate la trecerile de pietoni.", "Oprirea sau parcarea pe trecerile de pietoni este interzisă."] },
      {
        h: "V. Schimbarea benzii și depășiri",
        list: [
          "Verificarea oglinzilor înainte de orice manevră.",
          "Semnalizarea din timp este obligatorie.",
          "Verificarea siguranței manevrei înainte de execuție.",
          "Depășirea se face legal doar pe partea stângă.",
          "Depășirea periculoasă și trecerea pe trotuar sunt interzise."
        ]
      },
      { h: "VI. Utilizarea telefonului mobil", list: ["Folosirea telefonului în timpul condusului este interzisă, cu excepția sistemelor hands-free."] },
      {
        h: "VII. Adaptarea vitezei",
        list: [
          "Viteza trebuie să corespundă traficului, vizibilității și stării drumului.",
          "Se reduce în curbe, la treceri de pietoni, la indicatoare de avertizare și pe vreme nefavorabilă.",
          "Viteza maximă recomandată în zonele populate: aproximativ 50 km/h."
        ]
      },
      { h: "VIII. Parcarea și oprirea", list: ["Interzisă pe trecerile de pietoni sau în punctele care blochează circulația.", "Parcarea se face doar în zonele desemnate."] },
      { h: "IX. Iluminarea", list: ["Farurile sunt obligatorii noaptea, pe ceață, ploaie puternică sau la vizibilitate scăzută."] },
      { h: "X. Vehicule de urgență", list: ["Viteza se reduce la apropierea vehiculelor de poliție/urgență cu semnale și sirenă active.", "Banda trebuie eliberată; oprire pe partea dreaptă dacă e necesar."] },
      { h: "XI. Documente obligatorii", list: ["Permisul de conducere", "Actul de identitate", "Documentele vehiculului", "Asigurarea vehiculului"] },
      { h: "XII. Luminile de avarie", list: ["Permise la defecțiune, pericol pe drum sau pentru avertizarea altor participanți la trafic.", "Folosirea abuzivă este interzisă."] }
    ]
  },
  camion: {
    icon: "🚛", tag: "LEGISLAȚIE RUTIERĂ", title: "Categoria C — Camion", tagline: "Permis pentru camioane și transport greu.",
    sections: [
      {
        h: "Responsabilitatea conducătorului",
        list: [
          "Conducătorul trebuie să dețină permis valabil pentru categoria vehiculului.",
          "Atenție permanentă la drum, cu păstrarea controlului vehiculului și evitarea manevrelor periculoase.",
          "Conducătorul trebuie să fie odihnit și atent — sunt interzise medicamentele care produc somnolență, consumul de alcool și oboseala excesivă; condusul sub influența alcoolului sau substanțelor e strict interzis."
        ]
      },
      {
        h: "Defecțiuni tehnice și situații de urgență",
        list: [
          "La defecțiune de anvelopă sau componentă, viteza se reduce și vehiculul se trage sigur pe dreapta, cu inspecție înainte de reluarea deplasării.",
          "Dacă frânele cedează pe o pantă: reducerea vitezei, folosirea frânei de motor, deplasare progresivă spre dreapta și aplicarea treptată a frânei de mână — acțiunile bruște riscă pierderea controlului."
        ]
      },
      {
        h: "Transportul mărfii",
        list: [
          "Marfa trebuie fixată corespunzător pentru a preveni deplasarea în timpul transportului, prin chingi omologate, sisteme speciale de fixare sau suporturi de stabilizare.",
          "Marfa care depășește dimensiunile vehiculului trebuie semnalizată cu steaguri sau lumini de avertizare.",
          "Marfa se verifică periodic pe parcursul cursei, în special la fiecare oprire sau pauză."
        ]
      },
      {
        h: "Distanța de frânare și starea conducătorului",
        list: ["Distanța totală de oprire include distanța de percepție, de reacție și de frânare.", "Camioanele necesită o distanță de urmărire mai mare decât autoturismele."]
      },
      {
        h: "Viteză, frâna de motor și depășiri",
        list: [
          "Viteza maximă în afara localităților: aproximativ 110 km/h, cu excepția altor indicatoare.",
          "Viteza se adaptează traficului, stării drumului, vremii și greutății încărcăturii.",
          "Frâna de motor trebuie folosită mai ales la coborâri lungi și abrupte, pentru a preveni supraîncălzirea frânelor și a păstra controlul vehiculului.",
          "Depășirea e permisă doar cu vizibilitate suficientă, marcaj corespunzător și execuție sigură — interzisă în zone cu vizibilitate redusă sau unde e interzisă."
        ]
      },
      {
        h: "Telefonul mobil, parcarea și schimbarea de bandă",
        list: [
          "Telefonul se folosește doar prin sisteme hands-free.",
          "Parcarea camioanelor grele e interzisă lângă treceri de pietoni, intersecții sau zone care blochează vizibilitatea.",
          "Schimbarea benzii necesită semnalizare, verificarea oglinzilor laterale și confirmarea siguranței — esențial din cauza unghiurilor moarte mari ale camioanelor."
        ]
      },
      {
        h: "Verificarea anvelopelor și greutatea maximă",
        list: [
          "Presiunea anvelopelor se verifică la rece, pentru citiri corecte.",
          "Anvelopele uzate sau umflate incorect afectează stabilitatea vehiculului.",
          "Greutatea maximă autorizată trebuie respectată, pentru a preveni deteriorarea drumului, suprasolicitarea sistemului de frânare și pierderea stabilității."
        ]
      }
    ]
  },
  barca: {
    icon: "🚤", tag: "LEGISLAȚIE RUTIERĂ", title: "Categoria N — Barcă", tagline: "Permis pentru bărci și vehicule nautice.",
    sections: [
      {
        h: "Obligațiile conducătorului",
        list: [
          "Conducătorul unei ambarcațiuni este obligat să dețină permis de navigație valabil.",
          "Navigația fără permis este interzisă, cu excepția ambarcațiunilor foarte mici și slab motorizate, unde legislația permite.",
          "Atenție constantă la trafic, condițiile meteo și siguranța tuturor celor aflați la bord."
        ]
      },
      { h: "Echipament de siguranță obligatoriu", list: ["Veste de salvare pentru toate persoanele aflate la bord, în special în larg sau pe vreme nefavorabilă.", "Stingător de incendiu", "Semnale de urgență", "Lumini de navigație", "Ancoră"] },
      {
        h: "Reguli de navigație",
        list: [
          "Prioritate: ambarcațiunile cu manevrabilitate redusă au prioritate.",
          "Apropiere frontală: ambele ambarcațiuni reduc viteza și virează la dreapta pentru a evita coliziunea.",
          "Lumina din dreapta (tribord): verde. Lumina din stânga (babord): roșu."
        ]
      },
      {
        h: "Conduita operatorului",
        list: ["Consumul de alcool în timpul navigării este strict interzis.", "Operarea cu discernământ afectat este interzisă.", "Capacitatea de pasageri nu trebuie depășită — supraîncărcarea riscă instabilitate și răsturnare."]
      },
      { h: "Verificări înainte de plecare", list: ["Starea motorului", "Nivelul de combustibil", "Echipamentul de salvare", "Luminile de navigație", "Starea generală a ambarcațiunii"] },
      {
        h: "Proceduri de urgență",
        list: [
          "Semnale sonore pentru atenție sau schimbarea direcției.",
          "În caz de defecțiune a motorului: ancorarea ambarcațiunii și solicitarea de ajutor.",
          "Folosirea sistemelor de avertizare audio/vizuale în situații de urgență.",
          "Pe vreme severă, deplasarea către cel mai apropiat țărm sigur."
        ]
      }
    ]
  },
  pilot: {
    icon: "✈️", tag: "LEGISLAȚIE RUTIERĂ", title: "Licență PPL — Pilot", tagline: "Licență pentru avioane și pilotaj.",
    sections: [
      {
        h: "Obligații generale",
        list: [
          "Orice persoană care operează o aeronavă trebuie să dețină o licență de pilot valabilă.",
          "Pilotul este responsabil de siguranța aeronavei, a pasagerilor și a persoanelor de la sol.",
          "Respectarea reglementărilor aeronautice și a instrucțiunilor turnului de control este obligatorie.",
          "Zborul fără comunicare cu turnul de control în spațiul aerian controlat este interzis."
        ]
      },
      {
        h: "Verificări înainte de zbor",
        list: ["Verificarea nivelului de combustibil", "Inspecția sistemelor de control ale aeronavei", "Evaluarea stării rotorului sau aripilor", "Verificarea funcționării sistemelor de navigație", "Evaluarea condițiilor meteorologice"]
      },
      {
        h: "Comunicarea cu turnul de control",
        list: [
          "Contact continuu obligatoriu cu turnul de control în zonele controlate.",
          "Instrucțiunile controlului de trafic aerian trebuie respectate.",
          "La defecțiune a sistemului de comunicare: aterizare sigură și semnalizare manuală.",
          "Pilotul trebuie să folosească căști cu microfon pentru contact clar cu turnul de control."
        ]
      },
      {
        h: "Protocoale de siguranță în zbor",
        list: [
          "Pilotul trebuie să păstreze calmul și controlul aeronavei în orice moment.",
          "La defecțiune de echipament: menținerea controlului, reducerea riscului pentru pasageri și tentativa de aterizare de urgență sigură.",
          "Oprirea motorului sau abandonarea aeronavei fără proceduri corespunzătoare este interzisă."
        ]
      },
      {
        h: "Iluminare de navigație și evitarea coliziunilor",
        list: [
          "Lumina din stânga (babord): roșu. Lumina din dreapta (tribord): verde.",
          "Luminile sunt obligatorii pe durata zborului, mai ales noaptea sau la vizibilitate redusă.",
          "Apropiere frontală: ambele aeronave virează la dreapta, menținând altitudinea și controlul."
        ]
      },
      { h: "Restricții privind substanțele și starea pilotului", list: ["Operarea unei aeronave sub influența alcoolului este strict interzisă.", "Pilotul trebuie să mențină o stare fizică și mentală adecvată."] },
      {
        h: "Reguli de aterizare și altitudine",
        list: [
          "Aterizarea se face doar pe piste sau zone autorizate.",
          "Aterizarea pe piste private necesită acordul proprietarului sau al autorității.",
          "Procedurile de apropiere și aterizare stabilite trebuie respectate.",
          "Zborul la altitudine foarte joasă e permis doar pentru antrenament autorizat, operațiuni speciale sau urgențe — zborul sub aproximativ 300 de metri fără justificare prezintă riscuri de siguranță.",
          "Transportul de pasageri necesită licență de pilot valabilă și aeronavă autorizată."
        ]
      },
      {
        h: "Zbor pe timp de noapte și condiții meteo",
        list: [
          "Consultarea prognozei meteo este obligatorie înainte de fiecare zbor.",
          "Condițiile nefavorabile riscă pierderea controlului aeronavei — pe furtună sau condiții periculoase se caută cea mai sigură zonă de aterizare.",
          "Zborul de noapte e permis doar cu sistemele de iluminare ale aeronavei funcționale — zborul nocturn fără lumini este periculos și ilegal."
        ]
      }
    ]
  }
};

function renderBody(guide) {
  return guide.sections.map(s => {
    const p = (s.p || []).map(par => `<p>${esc(par)}</p>`).join("");
    const list = s.list ? `<ul>${s.list.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
    return `<h2>${esc(s.h)}</h2>${p}${list}`;
  }).join("\n");
}

const guideBlocks = [];
{
  let order = 0;
  for (const [slug, g] of Object.entries(GUIDES)) {
    guideBlocks.push(
      { page: "ghid-factiune", block_key: `${slug}_icon`, label: `[${g.title}] Iconiță`, type: "text", content: g.icon, sort_order: order },
      { page: "ghid-factiune", block_key: `${slug}_tag`, label: `[${g.title}] Etichetă`, type: "text", content: g.tag || "GHID FACȚIUNI", sort_order: order + 1 },
      { page: "ghid-factiune", block_key: `${slug}_title`, label: `[${g.title}] Titlu`, type: "text", content: g.title, sort_order: order + 2 },
      { page: "ghid-factiune", block_key: `${slug}_tagline`, label: `[${g.title}] Descriere scurtă`, type: "text", content: g.tagline, sort_order: order + 3 },
      { page: "ghid-factiune", block_key: `${slug}_body`, label: `[${g.title}] Conținut complet`, type: "html", content: renderBody(g), sort_order: order + 4 }
    );
    if (g.apply) {
      guideBlocks.push({ page: "ghid-factiune", block_key: `${slug}_apply`, label: `[${g.title}] Text buton aplicare`, type: "text", content: g.apply, sort_order: order + 5 });
    }
    order += 10;
  }
}

const list = (arr) => JSON.stringify(arr);

const PAGE_BLOCKS = [
  // --- index (Acasă) --------------------------------------------------------
  { page: "index", block_key: "hero_eyebrow", label: "Hero — etichetă mică", type: "text", content: "MOLDOVA ROLEPLAY", sort_order: 0 },
  { page: "index", block_key: "hero_title", label: "Hero — titlu principal", type: "richtext", content: "Comunitatea ta.<br><span>RolePlay-ul tău.</span>", sort_order: 1 },
  { page: "index", block_key: "hero_text", label: "Hero — text descriptiv", type: "richtext", content: "Portalul oficial Moldova RP pentru regulamente, jucători, facțiuni, anunțuri și toate informațiile importante ale serverului.", sort_order: 2 },
  { page: "index", block_key: "hero_status_text", label: "Hero — text sub „SERVER ONLINE”", type: "text", content: "Conectează-te și începe povestea.", sort_order: 3 },
  { page: "index", block_key: "highlights_eyebrow", label: "Bară animată — etichetă mică", type: "text", content: "MOLDOVA RP", sort_order: 4 },
  { page: "index", block_key: "highlights_title", label: "Bară animată — titlu", type: "text", content: "De ce Moldova RP?", sort_order: 5 },
  {
    page: "index", block_key: "highlights_items", label: "Bară animată — elemente", type: "list", sort_order: 6,
    content: list([
      { icon: "🎮", title: "RolePlay real", text: "", url: "" },
      { icon: "👮", title: "14 facțiuni active", text: "", url: "" },
      { icon: "💼", title: "+20 meserii", text: "", url: "" },
      { icon: "🏦", title: "Economie funcțională", text: "", url: "" },
      { icon: "🎧", title: "Discord activ 24/7", text: "", url: "" },
      { icon: "🚗", title: "Vehicule personalizabile", text: "", url: "" },
      { icon: "🏛️", title: "Comunitate serioasă", text: "", url: "" },
      { icon: "🎰", title: "Cazinouri & afaceri", text: "", url: "" },
      { icon: "📜", title: "Regulament transparent", text: "", url: "" },
      { icon: "🛠️", title: "Update-uri constante", text: "", url: "" },
      { icon: "🏗️", title: "Proprietăți & terenuri", text: "", url: "" },
      { icon: "✈️", title: "Școală de zbor", text: "", url: "" }
    ])
  },
  { page: "index", block_key: "factions_callout_title", label: "Card „Ghid Facțiuni” — titlu", type: "text", content: "Ghid Facțiuni", sort_order: 7 },
  { page: "index", block_key: "factions_callout_text", label: "Card „Ghid Facțiuni” — text", type: "text", content: "Proceduri, reguli, prețuri și pașii de aplicare pentru Poliție, SMURD și Armată — totul explicat direct pe site.", sort_order: 8 },
  { page: "index", block_key: "about_title", label: "Despre — titlu", type: "text", content: "Un univers RolePlay construit de comunitate, pentru comunitate.", sort_order: 9 },
  {
    page: "index", block_key: "about_text", label: "Despre — text", type: "richtext", sort_order: 10,
    content: "<p>Moldova RP este un server de RolePlay pe FiveM, construit în jurul propriului gamemode — Advanced Roleplay — cu o economie funcțională, zeci de meserii (minerit, pescuit, tăiat lemne, transport, construcții și multe altele), sistem de crafting, proprietăți, vehicule personalizabile, bănci și cazinouri. De la Poliție, SMURD și Armată, până la ganguri, mafii și sindicate, fiecare facțiune are proceduri, ierarhii și povești proprii, explicate direct pe acest portal.</p><p>Suntem o comunitate activă, cu evenimente constante, o echipă de administrare implicată zi de zi și un Discord mereu în mișcare. Aici găsești regulamentele, ghidul facțiunilor, legislația rutieră și tot ce ai nevoie ca să te integrezi rapid în poveste.</p>"
  },
  { page: "index", block_key: "callout_title", label: "Card final — titlu", type: "text", content: "Tot ce ai nevoie, într-un singur loc.", sort_order: 11 },
  { page: "index", block_key: "callout_text", label: "Card final — text", type: "text", content: "Regulamentele și informațiile comunității vor fi gestionate centralizat, rapid și transparent.", sort_order: 12 },

  // --- joburi -----------------------------------------------------------
  { page: "joburi", block_key: "page_eyebrow", label: "Etichetă mică", type: "text", content: "ECONOMIE", sort_order: 0 },
  { page: "joburi", block_key: "page_title", label: "Titlu pagină", type: "text", content: "Joburi", sort_order: 1 },
  { page: "joburi", block_key: "page_intro", label: "Text introductiv", type: "richtext", content: "Peste 20 de meserii legale te așteaptă pe server — de la industrie și transport, până la construcții, servicii publice și afaceri proprii.", sort_order: 2 },
  { page: "joburi", block_key: "videos_eyebrow", label: "Video — etichetă mică", type: "text", content: "PREZENTARE VIDEO", sort_order: 3 },
  { page: "joburi", block_key: "videos_title", label: "Video — titlu", type: "text", content: "Cum arată pe server", sort_order: 4 },
  {
    page: "joburi", block_key: "videos", label: "Video — carduri", type: "list", sort_order: 5,
    content: list([
      { icon: "", title: "🚕 Taxi", text: "Preiei curse din peste 80 de locații de pe hartă, cu mai multe tipuri de misiuni și un sistem de rating al clienților. Există și variante de curse cu risc mai mare, pentru cei care vor mai multă acțiune.", url: "https://www.youtube.com/embed/-k1xXa8Lm_4" },
      { icon: "", title: "🗑️ Gunoier", text: "Formezi o echipă de până la 4 persoane și alegi între mai multe tipuri de rute — containere, căutare sau curățarea străzii. Poți găsi obiecte de valoare ascunse prin gunoaie, iar cei mai activi din echipă primesc bonusuri.", url: "https://www.youtube.com/embed/TFEmlrYqx3E" },
      { icon: "", title: "🚛 Camionagiu", text: "Lucrezi dintr-un depou logistic dedicat și alegi între mai multe tipuri de livrări — marfă paletizată, containere din port sau transport de vehicule. Urci în rang pe măsură ce faci curse, pentru livrări din ce în ce mai bine plătite.", url: "https://www.youtube.com/embed/-Owr5kznK5w" },
      { icon: "", title: "🌾 Fermier", text: "Cultivi mai multe tipuri de culturi diferite, de la plantat și udat, până la recoltat cu utilaje agricole. Poți crește și animale — le hrănești, le mulgi — iar livrarea produselor se poate face inclusiv cu drona.", url: "https://www.youtube.com/embed/eI8imGEHgoE" },
      { icon: "", title: "🏹 Vânător", text: "Vânezi în zone dedicate, cu animale de rarități diferite, apoi jupoi prada cu cuțitul. Sistemul de nivel și experiență crește recompensele pe măsură ce avansezi. Se joacă solo sau în grupuri de până la 4.", url: "https://www.youtube.com/embed/LDi63eVRS0s" },
      { icon: "", title: "📦 Operator stivuitor", text: "Transporți marfă cu stivuitorul între rafturile depozitului. Poți lucra în tură de zi sau de noapte — noaptea plătește mai bine — solo sau împreună cu alți jucători.", url: "https://www.youtube.com/embed/2Ahq3SYcyms" }
    ])
  },
  {
    page: "joburi", block_key: "jobs_grid", label: "Grilă categorii + joburi (HTML)", type: "html", sort_order: 6,
    content:
`<div class="reg-group">
  <h2>Industrie &amp; Resurse Naturale</h2>
  <div class="job-card-grid">
    <div class="job-card"><div class="job-card-icon">⛏️</div><h3>Miner</h3><p>Extrage minereuri din mine și le vinde la topitorie pentru procesare.</p></div>
    <div class="job-card"><div class="job-card-icon">🎣</div><h3>Pescar</h3><p>Pescuiește pe chei și în larg, apoi vinde recolta la piață.</p></div>
    <div class="job-card"><div class="job-card-icon">🪓</div><h3>Pădurar</h3><p>Taie lemne în pădure și le transportă spre procesare.</p></div>
    <div class="job-card"><div class="job-card-icon">🌾</div><h3>Fermier</h3><p>Cultivă și recoltează pe câmp, de la legume la culturi de fermă.</p></div>
    <div class="job-card"><div class="job-card-icon">🏹</div><h3>Vânător</h3><p>Vânează în zone dedicate și jupoaie prada pentru a o vinde.</p></div>
  </div>
</div>

<div class="reg-group">
  <h2>Transport &amp; Logistică</h2>
  <div class="job-card-grid">
    <div class="job-card"><div class="job-card-icon">🚛</div><h3>Camionagiu</h3><p>Transportă marfă între depozite și orașe cu camionul.</p></div>
    <div class="job-card"><div class="job-card-icon">🚕</div><h3>Taximetrist</h3><p>Transportă pasageri prin oraș contra unei curse plătite.</p></div>
    <div class="job-card"><div class="job-card-icon">📦</div><h3>Operator stivuitor</h3><p>Manipulează și organizează marfa în depozite.</p></div>
    <div class="job-card"><div class="job-card-icon">🚗</div><h3>Închirieri auto</h3><p>Administrează o flotă de mașini de închiriat pentru jucători.</p></div>
  </div>
</div>

<div class="reg-group">
  <h2>Construcții &amp; Mecanică</h2>
  <div class="job-card-grid">
    <div class="job-card"><div class="job-card-icon">🏗️</div><h3>Constructor</h3><p>Ridică și renovează clădiri pe șantierele orașului.</p></div>
    <div class="job-card"><div class="job-card-icon">🔧</div><h3>Mecanic</h3><p>Repară, întreține și tunează vehicule într-un service auto.</p></div>
    <div class="job-card"><div class="job-card-icon">🚜</div><h3>Excavatorist</h3><p>Operează utilaje grele pe șantiere de construcții.</p></div>
    <div class="job-card"><div class="job-card-icon">⛽</div><h3>Angajat benzinărie</h3><p>Deservește o stație de combustibil și gestionează vânzările.</p></div>
  </div>
</div>

<div class="reg-group">
  <h2>Servicii Publice</h2>
  <div class="job-card-grid">
    <div class="job-card"><div class="job-card-icon">🗑️</div><h3>Gunoier</h3><p>Colectează gunoiul din oraș pe rute stabilite.</p></div>
    <div class="job-card"><div class="job-card-icon">🛃</div><h3>Vameș</h3><p>Verifică mărfurile și călătorii la aeroport și vamă.</p></div>
    <div class="job-card"><div class="job-card-icon">🏛️</div><h3>Funcționar Primărie</h3><p>Gestionează acte, taxe și cereri ale cetățenilor.</p></div>
  </div>
</div>

<div class="reg-group">
  <h2>Afaceri &amp; Divertisment</h2>
  <div class="job-card-grid">
    <div class="job-card"><div class="job-card-icon">✈️</div><h3>Pilot</h3><p>Obține licența PPL și zboară cu aeronave între destinații.</p></div>
    <div class="job-card"><div class="job-card-icon">🎰</div><h3>Crupier</h3><p>Lucrează la mesele de cazinou și găzduiește jocuri de noroc.</p></div>
    <div class="job-card"><div class="job-card-icon">💰</div><h3>Agent de asigurări</h3><p>Vinde polițe și gestionează despăgubirile jucătorilor.</p></div>
    <div class="job-card"><div class="job-card-icon">🏦</div><h3>Amanetar</h3><p>Cumpără și revinde obiecte second-hand la amanet.</p></div>
    <div class="job-card"><div class="job-card-icon">🎧</div><h3>DJ</h3><p>Animă seri tematice și evenimente în cluburile din oraș.</p></div>
  </div>
</div>`
  },

  // --- ghid-factiuni ------------------------------------------------------
  { page: "ghid-factiuni", block_key: "page_eyebrow", label: "Etichetă mică", type: "text", content: "ORGANIZAȚII", sort_order: 0 },
  { page: "ghid-factiuni", block_key: "page_title", label: "Titlu pagină", type: "text", content: "Ghid Facțiuni", sort_order: 1 },
  { page: "ghid-factiuni", block_key: "page_intro", label: "Text introductiv", type: "richtext", content: "Alege o facțiune pentru a vedea proceduri, reguli, prețuri și pașii de aplicare — totul explicat direct pe site.", sort_order: 2 },
  {
    page: "ghid-factiuni", block_key: "guide_list", label: "Listă facțiuni", type: "list", sort_order: 3,
    content: list([
      { icon: "👮", title: "Poliție", text: "Menține ordinea, aplică legea și protejează cetățenii.", url: "ghid-factiune.html?slug=politie" },
      { icon: "🚑", title: "SMURD", text: "Intervine rapid în situații de urgență și salvează vieți.", url: "ghid-factiune.html?slug=smurd" },
      { icon: "🪖", title: "Armată", text: "Asigură securitatea și participă la misiuni speciale.", url: "ghid-factiune.html?slug=armata" }
    ])
  },

  // --- legislatie-rutiera ----------------------------------------------
  { page: "legislatie-rutiera", block_key: "page_eyebrow", label: "Etichetă mică", type: "text", content: "CATEGORII DE PERMIS", sort_order: 0 },
  { page: "legislatie-rutiera", block_key: "page_title", label: "Titlu pagină", type: "text", content: "Legislație Rutieră", sort_order: 1 },
  { page: "legislatie-rutiera", block_key: "page_intro", label: "Text introductiv", type: "richtext", content: "Alege o categorie de permis pentru a vedea obligațiile conducătorului, verificările necesare și regulile complete de circulație — totul explicat direct pe site.", sort_order: 2 },
  {
    page: "legislatie-rutiera", block_key: "license_list", label: "Listă categorii de permis", type: "list", sort_order: 3,
    content: list([
      { icon: "🏍️", title: "Categoria A — Moto", text: "Motociclete și vehicule ușoare.", url: "ghid-factiune.html?slug=moto" },
      { icon: "🚗", title: "Categoria B — Auto", text: "Autoturisme și vehicule uzuale.", url: "ghid-factiune.html?slug=auto" },
      { icon: "🚛", title: "Categoria C — Camion", text: "Camioane și transport greu.", url: "ghid-factiune.html?slug=camion" },
      { icon: "🚤", title: "Categoria N — Barcă", text: "Bărci și vehicule nautice.", url: "ghid-factiune.html?slug=barca" },
      { icon: "✈️", title: "Licență PPL — Pilot", text: "Avioane și licență de pilot.", url: "ghid-factiune.html?slug=pilot" }
    ])
  },

  // --- ghid-factiune (detaliu per facțiune/categorie), generate mai sus ---
  ...guideBlocks
];

module.exports = { PAGE_BLOCKS };
