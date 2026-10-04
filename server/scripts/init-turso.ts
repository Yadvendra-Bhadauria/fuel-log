import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the root .env first.");
}

const schema = await readFile(new URL("../prisma/turso-schema.sql", import.meta.url), "utf8");
const client = createClient({ url, authToken });

try {
  const existingTables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  if (existingTables.rows.length > 0) {
    throw new Error("Turso database must be empty before Fuel log initializes it. Use a new empty database rather than overwriting existing data.");
  }
  await client.executeMultiple(schema);
  console.log("Turso schema is ready. No local records were copied.");
} finally {
  client.close();
}
