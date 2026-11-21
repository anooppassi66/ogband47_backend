import cors from "cors";
import express from "express";
import { sql } from "drizzle-orm";
import { env } from "./config.js";
import { db } from "./db/index.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { addressesRouter } from "./routes/addresses.js";
import { adminRouter } from "./routes/admin/index.js";
import { authRouter } from "./routes/auth.js";
import { catalogRouter } from "./routes/catalog.js";
import { ordersRouter } from "./routes/orders.js";
import { tryOnRouter } from "./routes/tryon.js";

export const app = express();

app.disable("x-powered-by");
// Auth is a bearer token, not a cookie, so allowing any origin by default is safe.
app.use(cors({ origin: env.corsOrigins ?? true }));
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  const start = performance.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(performance.now() - start)}ms`);
  });
  next();
});

app.get("/api/health", async (_req, res) => {
  await db.execute(sql`select 1`);
  res.json({ status: "ok" });
});

app.use("/api", catalogRouter);
app.use("/api/auth", authRouter);
app.use("/api/addresses", addressesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/tryon", tryOnRouter);
app.use("/api/admin", adminRouter);

app.use(notFound);
app.use(errorHandler);
