-- Date demo. NU folosi parolele de aici în producție.
-- Parola contului demo: DemoPass123!
INSERT INTO users(username,email,password_hash,role_id)
SELECT 'Admin_Demo','admin@moldova-rp.local',
       '$2a$10$7QJ5Qf1u2QeJxQm9WcJxAOH8L7k9yYJ6s4w4mWqXw4b8gkX3m0mQe',
       id
FROM roles WHERE name='admin'
ON CONFLICT (username) DO NOTHING;

INSERT INTO regulations(title,slug,category,content,version)
VALUES
('Regulament Oficial — Poliție','regulament-oficial-politie','Poliție',
 'Document oficial. Conținutul complet se va administra din panoul de administrare.',
 '1.0'),
('Sancțiuni Oficiale','sanctiuni-oficiale','Sancțiuni',
 'Tabelul oficial de sancțiuni se va administra centralizat din portal.',
 '1.0')
ON CONFLICT (slug) DO NOTHING;
