-- Date demo. NU folosi parolele de aici în producție.
-- Parola contului demo: DemoPass123!
INSERT INTO users(username,email,password_hash,role_id)
SELECT 'Admin_Demo','admin@moldova-rp.local',
       '$2a$10$7QJ5Qf1u2QeJxQm9WcJxAOH8L7k9yYJ6s4w4mWqXw4b8gkX3m0mQe',
       id
FROM roles WHERE name='admin'
ON CONFLICT (username) DO NOTHING;

-- Cele 3 anunțuri-placeholder inițiale (rândurile 000...001/002/003) au fost
-- scoase de aici intenționat — erau conținut demonstrativ, iar staff-ul le-a
-- șters din Admin → Anunțuri. Nu le mai readăugăm ca să nu "învie" la fiecare
-- deploy (asta e exact motivul pentru care reapăreau: ON CONFLICT (id) DO
-- NOTHING nu mai are ce rând să găsească după ce a fost șters, deci seedul
-- îl reintroduce). Dacă vreodată chiar trebuie repuse, se pot rescrie din
-- istoricul git al acestui fișier.
--
-- Anunțuri reale, adăugate direct aici ca developerul să nu mai aștepte să
-- fie introduse manual din panou — ID-uri fixe, ca reluarea seedului să nu
-- le dubleze. Editabile/ștergibile normal din Admin → Anunțuri de-aici
-- încolo (dar reține avertismentul de mai sus: dacă le ștergi din panou,
-- vor reapărea la următorul deploy cât timp rămân în acest fișier — scoate-le
-- de-aici, la fel ca mai sus, când chiar vrei să dispară definitiv).
INSERT INTO announcements(id,title,content,category,image_url,video_url,is_published,published_at)
VALUES
('00000000-0000-0000-0000-000000000004','În curând pe server: Sistem K9 & Pet Shop!',
 'Vești bune pentru toți iubitorii de patrupede din Moldova RP! Lucrăm la implementarea unui sistem complet de K9 și Pet Shop, care va aduce companionii patrupezi la un nivel realist de interacțiune.

Ce va putea face fiecare jucător:
Va putea adopta și îngriji un cățel propriu, cu o creștere realistă bazată pe hrană și vârstă — de la pui la câine matur. Prin meniul dedicat va putea să-l scoată la plimbare cu lesa, să-i dea comenzi de tip "stai" sau "vino", să se joace cu el (inclusiv aport cu mingea) și să-i monitorizeze constant sănătatea, foamea și starea de hidratare. Va exista și un pet shop în joc, de unde se vor putea cumpăra mâncare, accesorii, zgărzi și veste pentru companion.

Pentru forțele de ordine (Poliție/Șerif): unitățile K9 vor putea depista substanțe interzise și obiecte ilegale asupra jucătorilor, în vehicule sau în obiecte, plus intervenție la roțile vehiculelor în scenarii avansate de urmărire — un instrument nou și realist pentru operațiunile de teren.

Sistemul va include și un parcurs de antrenament cu puncte de control, pentru cei care vor să-și pregătească temeinic partenerul de patru labe.

Vă vom anunța aici, pe portal, imediat ce sistemul este activ pe server. Rămâneți aproape!',
 'NOUTĂȚI', NULL, 'https://youtu.be/bA4faKYiFww', true, '2026-09-05 09:00:00+00'),
('00000000-0000-0000-0000-000000000005','Noutate: Sistem de Rent-a-Car pe server!',
 'Pregătim un sistem complet de închiriere auto pentru Moldova RP! Cei care dețin o afacere de tip rent-a-car vor putea gestiona propria flotă direct dintr-un panou dedicat — adaugă mașini, urmărește starea lor și stabilește condițiile de închiriere.

Pentru jucători, procesul devine simplu și rapid: alegi mașina dorită, durata închirierii și limita de kilometri, iar restul e automat. Sistemul urmărește realist consumul de combustibil și kilometrajul parcurs, iar la predarea mașinii primești un cost final calculat automat, în funcție de distanța parcursă, combustibilul folosit și eventualele daune provocate vehiculului.

Un plus de realism pentru toți cei care vor să facă bani cinstit dintr-o afacere de închirieri auto — sau pentru cei care au nevoie rapid de o mașină fără să și-o cumpere. Detalii complete imediat ce sistemul e activ pe server!',
 'NOUTĂȚI', NULL, 'https://www.youtube.com/watch?v=ftP-uB6sv5k', true, '2026-09-05 09:05:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO regulations(title,slug,category,content,version)
VALUES
('Regulament Oficial — Poliție','regulament-oficial-politie','Poliție',
 'Document oficial. Conținutul complet se va administra din panoul de administrare.',
 '1.0'),
('Sancțiuni Oficiale','sanctiuni-oficiale','Sancțiuni',
 'Tabelul oficial de sancțiuni se va administra centralizat din portal.',
 '1.0')
ON CONFLICT (slug) DO NOTHING;
