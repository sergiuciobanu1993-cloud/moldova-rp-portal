-- Date demo. NU folosi parolele de aici în producție.
-- Parola contului demo: DemoPass123!
INSERT INTO users(username,email,password_hash,role_id)
SELECT 'Admin_Demo','admin@moldova-rp.local',
       '$2a$10$7QJ5Qf1u2QeJxQm9WcJxAOH8L7k9yYJ6s4w4mWqXw4b8gkX3m0mQe',
       id
FROM roles WHERE name='admin'
ON CONFLICT (username) DO NOTHING;

-- Cele 3 anunțuri afișate inițial static pe homepage, mutate acum ca rânduri
-- reale în tabel (secțiunea a devenit dinamică) — ID-uri fixe, ca reluarea
-- acestui seed la fiecare deploy să nu le dubleze. Editabile/ștergibile
-- normal din Admin → Anunțuri de aici încolo.
INSERT INTO announcements(id,title,content,category,is_published,published_at)
VALUES
('00000000-0000-0000-0000-000000000001','Portalul Moldova RP este în dezvoltare',
 'Construim noua platformă centrală pentru comunitate și administrație.',
 'OFICIAL', true, '2026-08-27 12:00:00+00'),
('00000000-0000-0000-0000-000000000002','Actualizări pentru sistemul juridic',
 'Regulamentele Poliției și Avocaturii primesc proceduri mai clare.',
 'REGULAMENT', true, '2026-08-26 12:00:00+00'),
('00000000-0000-0000-0000-000000000003','Noi secțiuni pentru jucători și facțiuni',
 'În următoarea etapă vor fi disponibile profilurile și istoricul organizațiilor.',
 'COMUNITATE', true, '2026-08-25 12:00:00+00')
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
