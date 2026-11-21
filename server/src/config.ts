import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Precedence: real environment variables > server/.env > the Next.js app's
// ../.env.local. The fallback lets local dev share one DATABASE_URL / SMTP /
// Fitroom config with the website without duplicating secrets.
loadEnv({
  path: [path.join(serverRoot, ".env"), path.join(serverRoot, "..", ".env.local")],
  quiet: true,
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to server/.env (see server/.env.example).`);
  }
  return value;
}

function list(value: string | undefined): string[] | undefined {
  const items = value?.split(",").map((s) => s.trim()).filter(Boolean);
  return items && items.length > 0 ? items : undefined;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: required("DATABASE_URL"),
  corsOrigins: list(process.env.CORS_ORIGIN),
  siteUrl: process.env.SITE_URL || "http://localhost:3000",
  smtp: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  fitroomApiKey: process.env.FITROOM_API_KEY,
};

/** Settings that don't stop the server from starting, but break features. */
export function configWarnings(): string[] {
  const warnings: string[] = [];
  if (process.env.NODE_ENV === "production" && !process.env.SITE_URL) {
    warnings.push("SITE_URL is not set, so links in emails will point to http://localhost:3000.");
  }
  if (!env.smtp.user || !env.smtp.pass) {
    warnings.push("SMTP_USER / SMTP_PASS are not set, so order and password-reset emails won't be sent.");
  }
  if (!env.fitroomApiKey) {
    warnings.push("FITROOM_API_KEY is not set, so virtual try-on requests will fail.");
  }
  return warnings;
}
