# FoodFacts Explorer

Search packaged food products from [Open Food Facts](https://world.openfoodfacts.org) in
English, Dutch, German and French. Product name, brand and photo are free; detailed
nutritional values are behind a Stripe subscription.

Built for a technical test. Everything below that says "simplification" is a deliberate
choice, not an oversight — the reasoning is given so it can be argued with.

---

## Table of contents

- [Stack](#stack)
- [Quick start](#quick-start)
- [Stripe setup](#stripe-setup)
- [Testing](#testing)
- [Project layout](#project-layout)
- [API reference](#api-reference)
- [Technical decisions](#technical-decisions)
- [Internationalization approach](#internationalization-approach)
- [Known limitations](#known-limitations)

---

## Stack

| Frontend | Backend |
| --- | --- |
| TypeScript | TypeScript |
| Next.js 15 (App Router) | Express 4 |
| React 19 | Prisma 6 |
| Tailwind CSS 3 | MySQL 8 / MariaDB 11 |
| | Open Food Facts API |
| | Stripe subscriptions (test mode) |
| | Vitest + Supertest |

Two independent apps: `backend/` (API, port 4000) and `frontend/` (UI, port 3000). The
browser never calls Open Food Facts or Stripe directly — everything goes through the API.

---

## Quick start

**Prerequisites:** Node 20.11+ (24 recommended) and a MySQL-compatible database.

```bash
git clone <this repo>
cd foodfacts-app
```

### 1. Database

Any MySQL 8 or MariaDB 10.6+ will do. Create a database and note the connection string.

<details>
<summary>No MySQL and no Docker? Use the bundled script.</summary>

This project was developed on a machine with neither, so `scripts/db.sh` runs MariaDB from
an unpacked tarball with its data directory inside the repo (`.devdb/`, gitignored). No
root, no system packages.

```bash
# One-time: download MariaDB's generic Linux tarball
mkdir -p ~/.local/share/toolchain && cd ~/.local/share/toolchain
wget https://archive.mariadb.org/mariadb-11.4.5/bintar-linux-systemd-x86_64/mariadb-11.4.5-linux-systemd-x86_64.tar.gz
tar xzf mariadb-11.4.5-linux-systemd-x86_64.tar.gz
cd -

scripts/db.sh init     # initializes, starts, creates both databases and the user
scripts/db.sh stop     # when you are done
```

It prints the `DATABASE_URL` to paste into `backend/.env`. Nothing in the application
depends on this script; it only exists so the project can be run without Docker.

</details>

### 2. Backend

```bash
cd backend
cp .env.example .env          # then edit: DATABASE_URL and the three Stripe values
npm install
npm run prisma:generate
npm run prisma:deploy         # applies prisma/migrations
npm run seed                  # creates the demo user
npm run dev                   # http://localhost:4000
```

Check it: `curl http://localhost:4000/api/health/ready` → `{"status":"ready","database":"up"}`

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

Open <http://localhost:3000> — it redirects to `/en`. Search for `chocolate`, open a
product, and you will see the nutrition panel locked.

### 4. Unlock the paywall

Either run the real Stripe flow ([below](#stripe-setup)), or skip straight to the result:

```bash
cd backend
npm run dev:subscribe      # writes the same row the webhook would
npm run dev:unsubscribe    # lock it again
```

`dev:subscribe` exists so the paywall can be reviewed without configuring Stripe. It is a
dev script and is never imported by the server.

---

## Stripe setup

All in **test mode**. Nothing here touches real money.

1. **Price** — Stripe Dashboard → Products → create a product with a *recurring monthly*
   price. Copy the price id (`price_…`) into `STRIPE_PRICE_ID`.
2. **Secret key** — Developers → API keys → copy the secret key (`sk_test_…`) into
   `STRIPE_SECRET_KEY`.
3. **Webhook** — with the [Stripe CLI](https://stripe.com/docs/stripe-cli):

   ```bash
   stripe listen --forward-to localhost:4000/api/webhooks/stripe
   ```

   It prints a signing secret (`whsec_…`). Put it in `STRIPE_WEBHOOK_SECRET` and restart
   the backend.

Now click **Subscribe** in the UI and pay with `4242 4242 4242 4242`, any future expiry,
any CVC. The webhook writes the subscription and the nutrition panel unlocks.

Events handled: `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`.

---

## Testing

```bash
cd backend
npm test                  # 97 tests
npm run test:unit         # 49, no database needed
npm run test:integration  # 48, needs a scratch database
```

The integration tests use a **real MySQL schema** rather than a mocked Prisma client,
because the bugs worth catching here are the ones a mock cannot have: a unique constraint
that does not fire, a transaction that does not roll back, an enum MySQL rejects.

```bash
cp .env.test.example .env.test
# point DATABASE_URL at a database whose name contains "test"
DATABASE_URL="mysql://foodfacts:foodfacts@127.0.0.1:3307/foodfacts_test" npx prisma migrate deploy
npm test
```

`resetDatabase()` refuses to run against a URL without `test` in it — the suite empties
every table between tests and that guard is what stops it eating a development database.

**What is stubbed and what is not.** Open Food Facts is stubbed at `fetch`, so URL
construction, the `User-Agent` header, the field projection and response parsing all still
execute — only the network is replaced. Stripe webhook signatures are *real*, generated
with `stripe.webhooks.generateTestHeaderString` against the same secret the app verifies
with, so the genuine verification path runs. Only outbound Stripe API calls are mocked.

**Coverage of the interesting parts:**

| Area | Examples |
| --- | --- |
| Language fallback | requested language present; falls back and reports which language it used; reaches a non-default language; blank string treated as absent |
| Incomplete data | string numbers with comma decimals; `""` and `"unknown"` skipped rather than read as `0`; products with no barcode dropped; out-of-range Nutri-Score rejected |
| Paywall | free fields served while nutrition withheld; values absent from the payload entirely, not nulled; each non-entitling status; expired period re-locks |
| Webhooks | forged signature rejected; tampered body rejected; redelivered event processed once; failed handling releases its claim so the retry works |
| Billing | customer created once then reused; language reaches Stripe and the return URLs; double-subscribe refused with 409 |
| History | newest first; same term in two languages kept separately; capped at 10; not recorded when validation fails |

---

## Project layout

```
backend/
  prisma/
    schema.prisma            User, Subscription, Search, ProcessedWebhookEvent
    migrations/              committed SQL migration
    seed.ts                  demo user
    dev-subscription.ts      grant/revoke without Stripe
  src/
    config/env.ts            zod-validated environment, fails fast at startup
    lib/                     prisma, stripe, TTL cache, logger, HttpError
    services/
      openfoodfacts/
        client.ts            HTTP: URLs, User-Agent, field projection, caching
        normalize.ts         crowd-sourced JSON -> predictable types
        locales.ts           the four languages and the fallback chain
      subscription.service.ts  entitlement
      billing.service.ts       calls to Stripe
      webhook.service.ts       calls from Stripe
      search.service.ts        recent-search history
    middleware/              demo user, error handler, async wrapper
    routes/                  health, me, products, searches, billing, webhooks
  tests/
    unit/                    pure, no I/O
    integration/             Express + Prisma + MySQL, OFF stubbed
  tsconfig.json              editor + typecheck (includes tests)
  tsconfig.build.json        production emit (src only -> dist/server.js)
frontend/
  src/
    middleware.ts            locale detection and redirect
    i18n/
      config.ts              locales, labels, BCP 47 tags
      index.ts               translator, Intl formatters
      messages/{en,nl,de,fr}.ts
    lib/api.ts               server-only client for the Express API
    components/              header, search form, product card, nutrition panel
    app/[locale]/            search, product detail, billing success/cancel
scripts/db.sh                local MariaDB, no root required
```

---

## API reference

All responses are JSON. Errors are `{ "error": { "code": string, "message": string } }`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | liveness, touches nothing |
| `GET` | `/api/health/ready` | readiness, round-trips to MySQL |
| `GET` | `/api/me` | demo user + subscription state |
| `GET` | `/api/products/search?q=&lang=&page=&pageSize=` | `q` min 2 chars; records the search |
| `GET` | `/api/products/:barcode?lang=` | **nutrition gated here** |
| `GET` | `/api/searches/recent` | last 10, newest first |
| `DELETE` | `/api/searches` | clears history |
| `POST` | `/api/billing/checkout-session` | `{ language }` → Stripe Checkout URL |
| `POST` | `/api/billing/portal-session` | `{ language }` → Stripe billing portal |
| `POST` | `/api/webhooks/stripe` | signature-verified, idempotent |

Product detail response, unsubscribed:

```jsonc
{
  "hasSubscription": false,
  "product": {
    "code": "3017624010701",
    "name": { "value": "Nutella", "language": "de", "isFallback": false },
    "brands": ["Ferrero"],
    "imageUrl": "https://images.openfoodfacts.org/…",
    "nutritionLocked": true,     // withheld because unsubscribed
    "nutritionAvailable": true,  // …but data does exist, so the upsell is honest
    "nutrition": null            // never populated without entitlement
  }
}
```

---

## Technical decisions

### Search uses Search-a-licious, not `/cgi/search.pl`

Nearly every Open Food Facts tutorial shows `/cgi/search.pl?search_terms=…`. **That
endpoint now returns 503** for anonymous full-text queries; it was retired in favour of an
Elasticsearch-backed service at `search.openfoodfacts.org`. This project used it first and
had to be changed — verified against the live API on 2 September 2026.

`/api/v2/search` is not an alternative: it filters on structured tags and has no free-text
parameter at all. So the app talks to **two** Open Food Facts hosts — search for queries,
`world.openfoodfacts.org/api/v2` for barcode lookups — which is why there are two base
URLs in `.env`. The two endpoints also disagree on shape (`hits` vs `products`, `brands`
as an array vs a comma-separated string), and `normalize.ts` absorbs both.

### The paywall is enforced by omission, not by hiding

`toProductDetail(raw, language, hasSubscription)` takes entitlement as an argument and
simply does not build the nutrition object when it is false. Unpaid responses do not carry
the numbers under a flag the client could ignore — the values never leave the server. A
test asserts the literal string `539` is absent from an unsubscribed payload.

Entitlement is read from our own `subscriptions` table, never from Stripe, on the request
path. Stripe is the source of truth and the webhook keeps the mirror current; the trade-off
is a few seconds of staleness between payment and access, which is why the success page
says so rather than pretending to be instant.

The `/billing/success` page does **not** grant anything. Trusting a redirect the user's own
browser performed would let anyone unlock the paywall by visiting a URL.

### Webhooks: authentic, idempotent, order-insensitive

- **Authentic** — `express.raw()` is mounted for the webhook path *before* `express.json()`,
  because signature verification needs the exact bytes Stripe signed. Swapping those two
  lines in `app.ts` breaks verification silently; there is a comment there saying so.
- **Idempotent** — every event id is inserted into `processed_webhook_events` first. The
  primary key rejects the duplicate, so a redelivery is a no-op. Critically, a *failed*
  handler releases its claim, otherwise Stripe's retry would be swallowed as a duplicate
  and the subscription would never sync. Both paths are tested.
- **Order-insensitive** — subscription writes are upserts of the full state, so events
  arriving out of order converge.

`extractCurrentPeriodEnd` reads both `subscription.current_period_end` and
`subscription.items.data[0].current_period_end`, because Stripe moved that field in its
2025 API versions and webhooks are delivered using the *account's* version, not the one the
SDK pins.

### Unknown Stripe statuses fail closed

`mapStripeStatus` maps anything it does not recognise to `INCOMPLETE`, which does not
entitle. A status Stripe adds in future locks the paywall rather than opening it.

### Entitlement double-checks the period

`isSubscriptionActive` requires `ACTIVE`/`TRIALING` *and* an unexpired
`currentPeriodEnd`. If a `customer.subscription.deleted` webhook is ever missed, access
still lapses instead of lasting forever.

### Everything from Open Food Facts is optional

It is crowd-sourced. A product may have a name but no brand, a photo but no nutriments, or
nutriments where values are `""`, `"unknown"`, or `"14,5"`. `normalize.ts` is the only place
allowed to assume anything, and it enforces two rules: a field is either a usable value or
`null` (never `""`, never `NaN`), and when a substituted language is used the response says
which one. Each product also carries a `completeness` score, which sorts threadbare entries
down the results rather than hiding them.

### Fail fast on configuration

`config/env.ts` validates the whole environment with zod at import time. A missing
`STRIPE_PRICE_ID` is a startup error with a readable message, not a 500 three screens into
a demo.

### Errors are typed at the boundary

Only `HttpError` and `ZodError` produce a message the client sees. Anything else is a bug:
logged with its stack, returned as a bare 500. A Stripe outage is wrapped as 502 and an
Open Food Facts timeout as 503, so whoever is debugging is sent to the right logs.

### Server Components, almost no client JavaScript

Search results are server-rendered from `?q=`, so a results page is a real URL —
shareable, bookmarkable, correct under the back button — with no client-side fetching.
Only three components are client-side: the search input, the language buttons and the
subscribe button. `lib/api.ts` is marked `server-only`, which makes importing it from a
Client Component a *build* error — that is the mechanism guaranteeing the browser cannot
route around the backend's gate.

### Caching sits in front of Open Food Facts, not in Next

A small in-process TTL cache (`OFF_CACHE_TTL_SECONDS`, default 300s) fronts both upstream
endpoints, including negative lookups. Open Food Facts is donation-funded and asks clients
not to hammer it. Next's own fetch cache is disabled (`cache: 'no-store'`) because the
subscription flag must not survive a checkout.

### Demo user is shaped like real auth

`attachDemoUser` populates `req.user` and everything downstream reads only that, so
replacing it with session or JWT verification touches one file.

---

## Internationalization approach

**Four languages** — English, Dutch, German, French — selected manually, never
automatically overridden.

### Routing

Every page lives under `/{locale}/…`. The locale is in the URL, so a page is shareable in
the language it was read in and `<html lang>` is always correct.

`middleware.ts` only handles paths with no locale segment, and resolves in this order:

1. the `preferred-locale` cookie — an explicit choice the user made
2. `Accept-Language`, parsed with q-weights — a reasonable guess for a first visit
3. English

The cookie always beats the browser header. The assignment asks for a *manual* selector, so
automatic detection must never override a choice the user made. A hand-typed unsupported
locale like `/es` 404s rather than silently rendering English.

### Switching language

The selector rewrites only the locale segment and keeps the rest of the path and the query
string. Changing language on a results page re-runs the same search in the new language
instead of dumping you on the home page.

### Message catalogues, not a library

`src/i18n/messages/{en,nl,de,fr}.ts`. English is the reference; its shape becomes the
`Messages` type, so a missing key in another catalogue is a **compile error**.

`en.ts` uses `as const` to pin the key structure, and a `Widen<T>` mapped type turns the
string literals back into `string` — otherwise the German file would be required to contain
the English words. Callers write `t(m.search.resultsFor, { term })`, passing the resolved
string rather than a `t('search.resultsFor')` key, which keeps full type-checking on the
path and makes an unused or misspelled key visible.

**Why not next-intl or react-intl.** The app needs three things: a locale in the URL, a
typed catalogue, and a selector. That is about 80 lines here, runs entirely in Server
Components with no provider and no client bundle, and there is nothing in it I cannot
explain line by line. The cost is no ICU plural rules and no formatting helpers — where
those are needed the code uses `Intl.NumberFormat` and `Intl.DateTimeFormat` directly,
bound to a BCP 47 tag per locale, which is what those libraries wrap anyway. Numbers and
dates therefore render as `10.000` in German and Dutch and `10 000` in French. If the app
grew real pluralisation or a translator handoff, next-intl would be the right move.

### Product data, not just the interface

The interface is fully translated; product data is translated **where possible**, which is
the honest limit of a crowd-sourced dataset.

- Search passes `langs={locale}`, which is what makes `chocolade` return Dutch products and
  `schokolade` German ones.
- Detail requests ask for every language variant in one call, so the fallback chain runs
  without a second round-trip.
- The chain is: requested language → the product's own primary field → English → any other
  supported language. Returning something readable beats returning nothing.
- Whenever a fallback is used, the response carries which language was actually used, and
  the UI labels it: *"Shown in French; no Dutch version has been contributed."* The app
  never silently pretends a French ingredient list is Dutch.

### Errors are translated by code, not by message

The API returns `{ error: { code, message } }` and the frontend renders a string chosen from
its own catalogue based on `code` — it never prints `error.message`. That message is written
in English on the server, and rendering it would put English text inside an otherwise fully
translated French page. It was doing exactly that until an Open Food Facts timeout made it
visible.

Stripe Checkout is opened in the selected language too, and its success and cancel URLs
return the user to the locale they left from.

---

## Known limitations

Ordered by how much they would matter in production.

1. **No authentication.** One demo user resolved from `DEMO_USER_EMAIL`; every request is
   attributed to it. Anyone who can reach the API can start a checkout as that user. This
   is the assignment's framing, and `attachDemoUser` is shaped so real auth replaces it in
   one file — but it is the largest gap between this and a deployable app.
2. **No rate limiting on our own API.** A caller could loop `/api/products/search` and push
   our traffic onto Open Food Facts. The TTL cache blunts repeats but is not a limiter;
   `express-rate-limit` keyed by user would be the fix.
3. **Category and label names are only partly localized.** Open Food Facts tags carry the
   language they were *entered* in (`en:breakfast-cereals`, `fr:biscuits-secs`). The app
   strips the prefix and humanizes the slug, so a French-entered tag stays French in the
   German UI. Proper localization needs a call to the taxonomy endpoint per tag.
4. **Some Open Food Facts data is wrong at the source.** For example, Nutella's
   `ingredients_text_de` currently contains English text. The app faithfully reports it as
   German because that is the field it came from. Detecting that would mean language
   identification on the text, which is out of scope.
5. **The result count is approximate.** The search index reports at most 10 000 and flags
   whether that is exact; the API forwards this as `isCountExact`. "10,000 products found"
   means "at least".
6. **In-process cache.** Fine for one instance; it does not survive a restart and is not
   shared across instances. Redis is the obvious replacement, and `TtlCache` is small
   enough to swap.
7. **Entitlement can be a few seconds stale** between payment and the webhook landing. The
   success page says so instead of pretending otherwise.
8. **No pagination in the UI.** The API accepts `page` and returns `hasMore`; the frontend
   only ever shows the first 24 results.
9. **Search history is not deduplicated across languages** by design — the same term in
   Dutch and German is two entries, because they produced different results.
10. **No end-to-end browser tests.** The suite covers the API thoroughly and the UI not at
    all. Playwright against the two dev servers would be the next thing I would add.
11. **`prisma.config.ts` migration pending.** Prisma 6 warns that the `package.json#prisma`
    key is deprecated in favour of a config file; harmless today, a required change for
    Prisma 7.

---

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the annotated list. No secret is
read anywhere except `backend/src/config/env.ts`. The only variable exposed to the browser
is `NEXT_PUBLIC_BACKEND_URL`, which is a public URL by definition.

## Licence and attribution

Product data comes from [Open Food Facts](https://world.openfoodfacts.org) under the
[Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Their terms ask
every client to identify itself with a descriptive `User-Agent`; ours is configurable via
`OFF_USER_AGENT`.
