// Applies database/schema.sql and database/seed.sql to DATABASE_URL.
// Safe to run on every deploy: schema.sql uses CREATE TABLE IF NOT EXISTS
// and both files use ON CONFLICT DO NOTHING, so re-running is a no-op once
// the schema/seed already exist.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");
 
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
 
    console.log(`Fixing up ${DEMO_USERNAME}'s demo password hash...`);
    const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const { rowCount } = await client.query(
      "UPDATE users SET password_hash = $1 WHERE username = $2",
      [hash, DEMO_USERNAME]
    );
    console.log(rowCount ? "Demo password fixed." : `No user named ${DEMO_USERNAME} found — skipped.`);
 
    console.log("Database init complete.");
  } finally {
    await client.end();
  }
}
 
run().catch(err => {
  console.error("Database init failed:", err);
  process.exit(1);
});
 