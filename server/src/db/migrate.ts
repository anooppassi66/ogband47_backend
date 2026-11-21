import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./index.js";

// `npm run db:migrate`: applies every server/migrations/*.sql file, in name
// order, in one transaction. There's no tracking table, so every file runs on
// every invocation and must be idempotent (CREATE TABLE IF NOT EXISTS, …).
// Migrations here only ever add things; the website's lib/db/schema.ts stays
// the source of truth for the schema as a whole.

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const file of files) {
    console.log(`Applying ${file}`);
    await client.query(await readFile(path.join(dir, file), "utf8"));
  }
  await client.query("COMMIT");
  console.log(`Done: ${files.length} migration(s) applied.`);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
  await pool.end();
}
