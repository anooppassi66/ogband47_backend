-- Table for forgot-password codes. Safe to run more than once.
-- Must match `passwordResets` in ../lib/db/schema.ts (the website's Drizzle
-- schema). The names below are the ones drizzle-kit generates, so a later
-- `npm run db:push` from the website sees no difference.
CREATE TABLE IF NOT EXISTS "password_resets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "code_hash" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "password_resets_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
