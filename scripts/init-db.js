// Applies database/schema.sql and database/seed.sql to DATABASE_URL.
// Safe to run on every deploy: schema.sql uses CREATE TABLE IF NOT EXISTS
// and both files use ON CONFLICT DO NOTHING, so re-running is a no-op once
// the schema/seed already exist.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");
const { PAGE_BLOCKS } = require("./seed-content");

// The password hash originally shipped in database/seed.sql was a placeholder
// that never actually matched the documented demo password. Re-hashing it
// here on every boot keeps the demo login working without hand-editing SQL.
const DEMO_USERNAME = "Admin_Demo";
const DEMO_PASSWORD = "DemoPass123!";

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set — skipping DB init.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const schema = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
    console.log("Applying database/schema.sql...");
    await client.query(schema);

    const seed = fs.readFileSync(path.join(__dirname, "..", "database", "seed.sql"), "utf8");
    console.log("Applying database/seed.sql...");
    await client.query(seed);

    // Conținutul editabil al paginilor publice (Admin → Conținut pagini).
    // ON CONFLICT DO NOTHING pe fiecare rând: prima aplicare a acestui
    // deploy seedează exact ce e azi pe site; orice bloc editat ulterior
    // din admin nu mai e niciodată atins de un redeploy ulterior.
    console.log(`Seeding ${PAGE_BLOCKS.length} page_blocks rows (skipping any already customized)...`);
    let seededBlocks = 0;
    for (const b of PAGE_BLOCKS) {
      const { rowCount } = await client.query(
        `INSERT INTO page_blocks(page, block_key, label, type, content, sort_order)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT (page, block_key) DO NOTHING`,
        [b.page, b.block_key, b.label, b.type, b.content, b.sort_order]
      );
      seededBlocks += rowCount;
    }
    console.log(`page_blocks: ${seededBlocks} new row(s) inserted, ${PAGE_BLOCKS.length - seededBlocks} already existed.`);

    console.log(`Fixing up ${DEMO_USERNAME}'s demo password hash...`);
    const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const { rowCount } = await client.query(
      "UPDATE users SET password_hash = $1 WHERE username = $2",
      [hash, DEMO_USERNAME]
    );
    console.log(rowCount ? "Demo password fixed." : `No user named ${DEMO_USERNAME} found — skipped.`);

    // One-off admin bootstrap: set BOOTSTRAP_ADMIN on Railway to a username
    // (matches either the login username or the Discord username) to
    // promote that account to 'owner' on next boot. Safe to leave set —
    // re-promoting an existing owner every deploy is a harmless no-op.
    // Matching is case-insensitive and tries three forms of the value:
    //   1. as given
    //   2. with any trailing "#..." tag stripped (people often paste their
    //      Discord handle with a discriminator/id suffix that isn't part of
    //      the stored discord_username)
    //   3. as an account-id prefix, when the value contains "#" — the
    //      dashboard shows "Cont #<first 8 chars of id>" for accounts with
    //      no in-game name yet, and people copy that whole label thinking
    //      it's their handle, e.g. "santtaklaus Cont #78ef2c17".
    const bootstrapAdmin = process.env.BOOTSTRAP_ADMIN;
    if (bootstrapAdmin) {
      const raw = bootstrapAdmin.trim();
      const stripped = raw.split("#")[0].trim();
      const idFragment = raw.includes("#") ? raw.split("#").pop().trim().toLowerCase() : "";
      const { rowCount: promoted } = await client.query(
        `UPDATE users SET role_id = (SELECT id FROM roles WHERE name='owner')
         WHERE LOWER(username) = LOWER($1)
            OR LOWER(discord_username) = LOWER($1)
            OR LOWER(username) = LOWER($2)
            OR LOWER(discord_username) = LOWER($2)
            OR ($3 <> '' AND LEFT(LOWER(id::text), LENGTH($3)) = $3)`,
        [raw, stripped, idFragment]
      );
      console.log(promoted
        ? `Promoted "${bootstrapAdmin}" to owner.`
        : `BOOTSTRAP_ADMIN is set to "${bootstrapAdmin}" but no matching user was found yet.`);
    }

    // Rulează `fn` o singură dată, indiferent de câte ori se repetă deploy-ul,
    // folosind tabela seed_flags ca "bifă" permanentă (vezi comentariul din
    // database/schema.sql). Spre deosebire de PAGE_BLOCKS mai sus (care
    // reînsămânțează rândurile lipsă din page_blocks la fiecare deploy),
    // aici bifa rămâne pusă chiar dacă rândul creat de `fn` e șters ulterior
    // manual din admin — deci e potrivit pentru lucruri de tipul "un anunț
    // trimis o dată", nu pentru conținut permanent editabil.
    async function seedOnce(key, fn) {
      const { rowCount } = await client.query(
        "INSERT INTO seed_flags(key) VALUES ($1) ON CONFLICT (key) DO NOTHING",
        [key]
      );
      if (rowCount === 0) {
        console.log(`seed_flags: "${key}" deja aplicat — se sare peste.`);
        return;
      }
      await fn();
      console.log(`seed_flags: "${key}" aplicat acum.`);
    }

    // 06.09.2026 — anunț automat pentru lansarea (viitoare) a VIP Shop-ului.
    // Poate fi editat sau șters oricând din Admin → Anunțuri ca orice alt
    // anunț — odată creat aici, un redeploy ulterior nu-l mai recreează
    // (vezi seedOnce mai sus), deci o ștergere manuală rămâne definitivă.
    await seedOnce("announcement_vip_shop_2026_09_06", async () => {
      await client.query(
        `INSERT INTO announcements(title, content, category, is_published, image_url, video_url)
         VALUES ($1, $2, $3, true, $4, NULL)`,
        [
          "🎁 VIP Shop — vine în curând!",
          "Pregătim un magazin nou pentru comunitate: VIP Shop.\n\n" +
          "Vei putea deschide cutii cu recompense — de la vehicule și obiecte exclusive, până la resurse utile — în trei categorii: Rare, Epic și Legendară.\n\n" +
          "Am pregătit deja o pagină cu toate detaliile și imaginile reale ale celor 3 cutii: https://moldovarp.md/vip-shop-curand.html\n\n" +
          "Rămâi pe fază — anunțăm data exactă de lansare tot aici, la Anunțuri!",
          "VIP SHOP",
          "/assets/vip-shop-teaser.webp",
        ]
      );
    });

    console.log("Database init complete.");
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error("Database init failed:", err);
  process.exit(1);
});
