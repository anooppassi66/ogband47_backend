# OG BANDITS 47 — Mobile API

REST API for the mobile app: Express 5, TypeScript, PostgreSQL via Drizzle ORM.
It uses **the same database as the website**, so products, accounts and orders are shared.

## Run it

```bash
cd server
npm install
npm run dev        # http://localhost:4000/api, restarts on file changes
```

### Configuration

Settings come from environment variables first, then `server/.env`. On a developer machine
the server also falls back to the website's `../.env.local`, so a `server/.env` is usually
unnecessary there. **On the VPS that file doesn't exist, so `server/.env` must contain
everything.** See [.env.example](.env.example) for every variable. On start-up the server
logs a `[config]` warning for each missing setting that breaks a feature.

## Deploying to a VPS

The `server/` folder deploys on its own. It doesn't need the website code beside it. You
need Node 20 or newer.

```bash
# 1. Put the folder on the server: copy just server/ (rsync/scp), or clone the repo and cd into server/
cd server

# 2. Install and build. The build needs devDependencies, so don't export NODE_ENV=production in this shell.
npm ci
npm run build

# 3. Configure
cp .env.example .env    # then fill it in (see below)

# 4. Create or upgrade database tables. Safe to run on every deploy.
npm run db:migrate

# 5. Run it under a process manager
npm install -g pm2
pm2 start dist/index.js --name clothing-api
pm2 save && pm2 startup  # restart on reboot
```

In `.env` on the VPS, set:

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Same Neon URL as the website. Use `sslmode=verify-full` |
| `SITE_URL` | The live website, e.g. `https://ogbandits47.com`. Emails link to it |
| `SMTP_USER`, `SMTP_PASS` | Without these, password-reset codes can't be delivered |
| `FITROOM_API_KEY` | For virtual try-on |
| `PORT` | Defaults to `4000` |

Deploying an update: `git pull` (or copy the folder again), then `npm ci && npm run build && npm run db:migrate && pm2 restart clothing-api`.

### HTTPS with nginx

The mobile app needs HTTPS (iOS blocks plain HTTP). Put nginx in front and get a certificate with `certbot --nginx`. Two settings matter for this API:

```nginx
server {
    server_name api.yourdomain.com;

    client_max_body_size 10m;   # try-on photo uploads (nginx's default is 1 MB)
    proxy_read_timeout 180s;    # try-on can take up to 2 min (nginx's default is 60 s)

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If you see a `SECURITY WARNING: The SSL modes 'prefer', 'require'…` message on start-up,
change `sslmode=require` to `sslmode=verify-full` in the server's `DATABASE_URL`. Nothing
changes in practice: `pg` already treats `require` as `verify-full`.

## Database schema

The website and this API share one database, so they must agree on its schema.

- **[`../lib/db/schema.ts`](../lib/db/schema.ts) (website) is the source of truth.**
  [`src/db/schema.ts`](src/db/schema.ts) is a copy of it. The shared business rules in
  [`src/lib/constants.ts`](src/lib/constants.ts) (shipping fee, order statuses) are also copies.
- **`npm run db:migrate` creates every table** by running the idempotent SQL files in
  [`migrations/`](migrations/) in name order. `0000_core_tables.sql` holds the website's
  tables, so the API can also start from an empty database. On a database the website
  already set up, those statements do nothing. The files only ever add things. Every table
  they create must also be defined in the website's `lib/db/schema.ts`.
- ⚠️ **Deploy the website's `lib/db/schema.ts` together with any API change that adds a
  table.** The website's `npm run db:push` makes the database match the website's schema
  exactly. If website code with an old schema runs it, the API's tables are **dropped**:
  without the `password_resets` definition, the push runs `DROP TABLE "password_resets"`.

To add a table: define it in `lib/db/schema.ts`, copy that file into `src/db/schema.ts`, and
add a `migrations/000N_*.sql` file with `CREATE TABLE IF NOT EXISTS`. Use the constraint
names drizzle-kit would generate, so a later `db:push` sees no difference.

## Conventions

**Auth.** Signing in returns a `token`. Send it with every protected request:

```
Authorization: Bearer <token>
```

Tokens last 7 days, the same as website sessions. Logging out revokes the token. Customer and
admin tokens are separate: a customer token on an admin route gets `403`, and the reverse
also gets `403`.

**Errors.** Every error has the same shape:

```json
{ "error": "Your bag is empty.", "fields": { "items": ["Your bag is empty."] } }
```

`error` is always a message you can show to the user. `fields` appears only on validation
errors (`400`). Status codes: `400` invalid input · `401` not signed in or token expired ·
`403` wrong account type · `404` not found · `409` duplicate (e.g. email taken) · `502`
try-on provider failed.

**Money** is in whole rupees (INR) as integers. **Dates** are ISO-8601 strings.

**Images.** Products include a ready-to-use `imageUrl` (800×1000). They also include
`imageId`, so you can request other sizes:
`https://images.unsplash.com/photo-{imageId}?auto=format&fit=crop&w={width}&h={height}&q=80`

## Endpoints

All paths start with `/api`. 🔒 = customer token required. 🛡 = admin token required.

### Store & catalog (public)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{ status: "ok" }`, also checks the database |
| GET | `/config` | Currency, shipping rules (`freeShippingThreshold`, `flatShippingFee`), sections, order statuses |
| GET | `/products?section=` | `{ products }`. `section` is optional: `trending` `new` `picked` `men` `women` `sale` |
| GET | `/products/:id` | `{ product, related }` |
| GET | `/categories` | `{ categories }` |

### Customer account

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/auth/signup` | `{ name, email, password, gender? }` (`"male"` / `"female"`) | `201 { token, expiresAt, user }` |
| POST | `/auth/login` | `{ email, password }` | `{ token, expiresAt, user }` |
| POST | `/auth/logout` 🔒 | — | `204` |
| GET | `/auth/me` 🔒 | — | `{ user }` |

### Forgot password

The customer gets a 6-digit code by email and enters it in the app. No links or deep links are involved.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/auth/forgot-password` | `{ email }` | `{ message }`. The response is the same whether or not the email has an account |
| POST | `/auth/verify-reset-code` | `{ email, code }` | `{ valid: true }`. Optional: lets the app check the code before showing the new-password screen |
| POST | `/auth/reset-password` | `{ email, code, password }` | `{ token, expiresAt, user }`. The user is signed in on this device and signed out everywhere else (website included) |

Wrong or expired codes return `400` with a message to display, e.g. `"That code is incorrect. 3 attempts left."`.

Rules:
- A code expires after 15 minutes.
- Each code allows 5 tries. Both verify and reset count as a try.
- Only the newest code works.
- A new code can be requested once a minute, at most 5 times an hour. Requests over the limit still get the normal response but send no email, so the app's "Resend code" button should wait 60 seconds.
- After a reset, the customer gets a "your password was changed" email.
- Admin accounts can't use this flow.

When SMTP isn't configured and `NODE_ENV` isn't `production`, the code is printed to the
server console so you can test without email. Set `NODE_ENV=production` in production.

### Addresses 🔒

Address body: `{ fullName, phone, line1, line2?, city, state, postalCode, country? }`. `country` defaults to `"India"`.

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/addresses` | `{ addresses }`, newest first |
| GET | `/addresses/:id` | `{ address }` |
| POST | `/addresses` | `201 { address }` |
| PUT | `/addresses/:id` | `{ address }` |
| DELETE | `/addresses/:id` | `204`. Past orders keep their own copy of the address |

### Orders 🔒

| Method | Path | Body / Returns |
| --- | --- | --- |
| GET | `/orders` | `{ orders }`, newest first, each with `items` |
| GET | `/orders/:id` | `{ order }` |
| POST | `/orders` | Body below → `201 { order }` |

```json
{
  "items": [{ "id": "m1", "qty": 1 }, { "id": "t6", "qty": 2 }],
  "addressId": 12
}
```

Send `addressId` for a saved address, or send `newAddress: { …address body… }` to save one and use it.
`qty` must be 1–99. The server calculates prices, shipping and totals from the database and
ignores any prices the client sends. The bag is kept on the device (as on the website), so
there is no cart endpoint. Use `/config` to show shipping before checkout. The customer gets
an order confirmation email.

An `order` contains `id`, `displayId` (e.g. `OGB-10042`), `status`, `subtotal`, `shipping`,
`total`, the `shipping*` address fields, `createdAt` and `items[]`. Each item has `productId`,
`name`, `category`, `price`, `qty` and `imageUrl`.

### Virtual try-on (public)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/tryon/outfits` | `{ men, women }`, the products you can try on |
| POST | `/tryon` | `multipart/form-data` → `{ imageUrl }`. Can take up to about 2 minutes |

Form fields for `POST /tryon`:

- **The garment:** `productId` (recommended; the image and cloth type come from the product), or `clothImageUrl` plus optional `clothType` (`upper` / `lower` / `full`).
- **The person:** a `person` image file (10 MB max), or `personImageUrl`.

Image URLs must be `https://images.unsplash.com/...`.

### Admin 🛡

Admins sign in with a username (the seeded account is `admin`), not an email.

| Method | Path | Body / Returns |
| --- | --- | --- |
| POST | `/admin/auth/login` | `{ username, password }` → `{ token, expiresAt, user }` |
| POST | `/admin/auth/logout` | `204` |
| GET | `/admin/auth/me` | `{ user }` |
| GET | `/admin/dashboard` | `{ stats, revenueLast14Days, statusBreakdown, recentOrders, topProducts, lowStockProducts }` |
| GET | `/admin/products` | `{ products }`, including `stock` and `status` |
| GET | `/admin/products/:id` | `{ product }` |
| POST | `/admin/products` | `{ name, category, price, stock, section, label?, imageId? }` → `201 { product }`. Emails matching customers |
| PUT | `/admin/products/:id` | `{ name, category, price, stock, section, label? }` → `{ product }` |
| DELETE | `/admin/products/:id` | `204` |
| GET | `/admin/orders` | `{ orders }`, a summary list |
| GET | `/admin/orders/:id` | `{ order }`, including `customer: { name, email }` |
| PATCH | `/admin/orders/:id/status` | `{ status }` (`Processing` / `Shipped` / `Delivered` / `Cancelled`) → `{ order }`. Emails the customer |
| GET | `/admin/reports/product-sales` | `{ report }`, per-product sales, including discontinued products |
| GET | `/admin/customers` | `{ customers }`, each with `orderCount` and `totalSpent` |

`label` is `"NEW"`, `"BESTSELLER"` or `null`.

## Project layout

```
migrations/          idempotent SQL files applied by `npm run db:migrate`
src/
  index.ts            start-up and graceful shutdown
  app.ts              Express app: middleware and route mounting
  config.ts           environment loading
  db/                 pg pool, Drizzle client, schema copy, migration runner
  lib/                auth/sessions, validation, mail, Fitroom client, constants
  middleware/         requireCustomer / requireAdmin, error handler
  services/           database operations (ported from ../lib/*.ts)
  routes/             HTTP endpoints (ported from ../app/actions/*.ts)
```
