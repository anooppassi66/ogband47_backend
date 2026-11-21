import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config.js";
import * as schema from "./schema.js";

// A long-running server uses a regular connection pool (the website uses
// Neon's HTTP driver, which suits serverless). The pool also gives us real
// transactions, which placeOrder relies on.
export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });

// Hosted Postgres (Neon) closes idle connections; without this listener an
// idle-client error would crash the process.
pool.on("error", (err) => {
  console.error("[db] Idle client error:", err.message);
});

export const db = drizzle(pool, { schema });

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Either the pool-backed db or an open transaction. */
export type Executor = typeof db | Tx;
