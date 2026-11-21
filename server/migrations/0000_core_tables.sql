-- Core tables shared by the website and this API. Safe to run more than once.
-- Runs before 0001_password_resets.sql, which references "users".
-- Must match ../lib/db/schema.ts (the website's Drizzle schema). The names
-- below are the ones drizzle-kit generates, so a later `npm run db:push` from
-- the website sees no difference.

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'customer' NOT NULL,
  "gender" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE ("email")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "expires_at" timestamp NOT NULL,
  CONSTRAINT "sessions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "addresses" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "full_name" text NOT NULL,
  "phone" text NOT NULL,
  "line1" text NOT NULL,
  "line2" text,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "postal_code" text NOT NULL,
  "country" text DEFAULT 'India' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "addresses_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "status" text DEFAULT 'Processing' NOT NULL,
  "subtotal" integer NOT NULL,
  "shipping" integer NOT NULL,
  "total" integer NOT NULL,
  "shipping_name" text NOT NULL,
  "shipping_phone" text NOT NULL,
  "shipping_line1" text NOT NULL,
  "shipping_line2" text,
  "shipping_city" text NOT NULL,
  "shipping_state" text NOT NULL,
  "shipping_postal_code" text NOT NULL,
  "shipping_country" text DEFAULT 'India' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "orders_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

-- product_id has no foreign key on purpose: an order keeps its own copy of
-- each product's name, image, category and price, so it survives the product
-- being edited or deleted.
CREATE TABLE IF NOT EXISTS "order_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL,
  "product_id" text NOT NULL,
  "name" text NOT NULL,
  "image_id" text NOT NULL,
  "category" text NOT NULL,
  "price" integer NOT NULL,
  "qty" integer NOT NULL,
  CONSTRAINT "order_items_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "products" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "price" integer NOT NULL,
  "original_price" integer,
  "image_id" text NOT NULL,
  "label" text,
  "section" text NOT NULL,
  "stock" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "categories" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "image_id" text NOT NULL,
  "focal" text NOT NULL,
  "href" text NOT NULL
);
