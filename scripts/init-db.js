// Applies database/schema.sql and database/seed.sql to DATABASE_URL.
// Safe to run on every deploy: schema.sql uses CREATE TABLE IF NOT EXISTS
// and both files use ON CONFLICT DO NOTHING, so re-running is a no-op once
// the schema/seed already exist.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

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

    console.log("Database init complete.");
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error("Database init failed:", err);
  process.exit(1);
});
