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
  await client.executeMultiple(schema);
  console.log("Turso schema is ready. No local records were copied.");
} finally {
  client.close();
}
