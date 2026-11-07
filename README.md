# menaitech HR Suite

A bilingual (Arabic / English, RTL-aware) HR portal: attendance, leave, requests,
payroll, people and announcements, with live updates across sessions.

```
hr-app-step2/
├── packages/contracts/    zod schemas + types — the contract both sides import
├── services/hr-api/    Hono + Drizzle + PostgreSQL API, SSE stream
└── apps/hr-web/    React + Vite web app
```

The Node API lives in `services/hr-api/`. The residual `server/` retains
`.env`, uploads, the Python voice worker and historical evidence. Runtime commands
preload compatibility paths; the Python worker has not moved.

## Running it

Requires Node 20+ and a PostgreSQL database (Neon works as-is).

```bash
npm install                       # installs all three workspaces

cp services/hr-api/.env.example server/.env
# fill in DATABASE_URL and SESSION_SECRET, then:

npm run db:migrate                # creates the tables
npm run db:seed                   # a working demo organisation

npm run dev:api                   # http://localhost:8787
npm run dev:web                   # http://localhost:5173
```

The web dev server proxies `/api` to the API, so both are same-origin and the
session cookie behaves exactly as it will in production.

### Demo sign-ins

The seed creates one account per role, all with the password printed when it
runs (`Menaitech#2026`). The buttons that fill them in appear **only in
development** — `import.meta.env.DEV` removes that block from the production
bundle.

| Role     | Email                       |
| -------- | --------------------------- |
| Admin    | omar.admin@company.com      |
| HR       | rania.hr@company.com        |
| Manager  | nabil.manager@company.com   |
| Employee | ahmad.employee@company.com  |

`npm run db:seed -- --force` clears and reseeds a database that already has rows.

## How it is put together

**One contract.** `packages/contracts/` holds zod schemas; the server validates requests with
them and the web app types its responses from them. A field cannot change on one
side only.

**Sessions, not tokens.** Signing in sets an httpOnly cookie holding a random
token; the database stores only its SHA-256. A script cannot read the cookie, a
database leak does not hand over live sessions, and signing out or disabling an
account takes effect immediately.

**Passwords** are hashed with scrypt from Node's own `crypto` — memory-hard, no
native build step. The cost parameters live inside each hash, so raising them
later leaves existing hashes verifiable and they upgrade on next sign-in.

Because scrypt is one-way, **no existing password can be displayed to anyone** —
not an administrator, not the database owner. There is deliberately no endpoint
that returns one. What an administrator can do instead is *reset*: `POST
/api/employees/:id/reset-password` generates a temporary password, stores its
hash, drops that account's sessions, and returns the readable value exactly once
in that response. The value is generated rather than chosen by the caller, so a
support reset does not leave an administrator holding a credential they picked
and will remember. The user-roles screen states this in the UI, so nobody has to
guess why there is no "show password" button.

For the same reason `PATCH /api/employees/:id` does not accept a `password`
field: setting one somebody chose is indistinguishable from taking the account.

**Authorisation is server-side.** Route guards in the web app decide what to
*render*; the API decides what may be *read*. Scope comes from the session — a
manager's request returns their own reports, HR's returns everyone — never from a
query parameter a caller could change.

**Real-time is server-sent events.** One `EventSource` per browser tab, opened by
`LiveProvider`. Events carry ids, never rows: a client refetches through the same
authorised endpoint it would have used anyway, so a delivery mistake cannot leak
a record. `useLiveQuery` keeps the previous data on screen while it refreshes, so
a live update never blanks a card.

**The server owns the clock.** Check-in and check-out take no body — a
client-supplied time is the employee's own and trivially editable. Opening the
app records nothing; only pressing a button does.

**Dates.** A calendar day is a `YYYY-MM-DD` string end to end. `date` columns are
read as strings (see `services/hr-api/src/db/client.ts`) and parsed as *local* midnight on
the client, because converting one to a Date and back shifts it a day in any zone
east of UTC.

**Two kinds of text.** What a person wrote (names, departments, announcements) is
stored once per language. What the app wrote (notifications) is stored as a
dictionary key plus variables and translated at render time, so it stays correct
when the reader switches language after the row was written.

## Scripts

| Command                | Does                                           |
| ---------------------- | ---------------------------------------------- |
| `npm run dev:api`      | API with reload                                |
| `npm run dev:web`      | Web app with reload                            |
| `npm run build`        | Type-checks and builds every workspace         |
| `npm run check`        | Type-checks without emitting                   |
| `npm run db:generate`  | New migration from the schema                  |
| `npm run db:migrate`   | Apply pending migrations                       |
| `npm run db:seed`      | Demo data (`-- --force` to overwrite)          |

## Deploying

The API expects to run as one long-lived process (Railway, Render, Fly, a VPS) —
SSE needs a connection that stays open, which serverless functions do not offer.

Set `WEB_ORIGIN` to the site's real origin, `NODE_ENV=production` (this turns on
`Secure` cookies) and a fresh `SESSION_SECRET`. Serving the web build behind the
same domain as the API is the simplest correct setup, and the one the dev proxy
already mirrors.

The event bus is in-process, which is right for a single instance. Running more
than one means moving the transport to Postgres `LISTEN`/`NOTIFY` or Redis;
`publish` in `services/hr-api/src/realtime/bus.ts` is the only function that changes.
