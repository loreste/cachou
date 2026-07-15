# Cachou CRM (PostgreSQL)

Proving-ground CRM for **CachouJS**. It keeps the UI fast while exercising real app concerns: list rendering, search, optimistic writes, CRUD, dashboard metrics, RBAC, realtime chat, benchmark claims, and a **PostgreSQL** backend.

This app is **not** part of the published `cachoujs` npm package.

## Stack

- CachouJS UI (`.cachou` components, scoped CSS)
- Node API (`server.mjs`) with sessions + RBAC
- **PostgreSQL** via the `pg` driver (or in-memory mode for UI-only work)
- WebSockets for live room / deal updates

## Quick start (memory API — no database)

```bash
# from repo root
npm run crm:api
npm run crm:dev
```

Open http://127.0.0.1:5190/

## PostgreSQL

Start a local Postgres (Docker):

```bash
npm run crm:db:postgres:up
# default: postgres://crm:crm@127.0.0.1:55433/crm
```

Run the API against Postgres:

```bash
npm run crm:api:postgres
# or
POSTGRES_DSN=postgres://crm:crm@127.0.0.1:55433/crm?sslmode=disable \
  CRM_DB_MODE=postgres \
  npm run crm:api
```

Smoke test:

```bash
npm run crm:smoke:postgres
```

### Connection string

| Variable | Purpose |
|----------|---------|
| `CRM_DB_MODE` | `auto` (default), `memory`, or `postgres` |
| `POSTGRES_DSN` | PostgreSQL URL for `postgres` / `auto` modes |

Example:

```bash
POSTGRES_DSN="postgres://user:password@127.0.0.1:5432/crm?sslmode=disable" \
  CRM_DB_MODE=postgres \
  npm --prefix crm run api
```

## Quality

```bash
npm run crm:check
npm run crm:qa
npm run crm:build
npm run crm:ui:smoke
npm run crm:visual:smoke
npm run crm:stress
npm run crm:ci
```

Artifacts land under `crm/artifacts/` (gitignored).

## Demo flow

1. `npm run crm:api` or `npm run crm:api:postgres`
2. `npm run crm:dev`
3. Sign in with seeded demo users (see API seed / login panel)
4. Exercise contacts, pipeline, live room, security, performance lab

## Production-ish env

```bash
CRM_ENV=production \
CRM_REQUIRE_CUSTOM_AUTH=1 \
CRM_USERS_JSON='[{"username":"admin","password":"change-me","name":"Admin","role":"Admin"}]' \
CRM_CORS_ORIGINS=https://crm.example.com \
CRM_DB_MODE=postgres \
POSTGRES_DSN=postgres://… \
  npm run crm:api
```

See [SHOWCASE.md](./SHOWCASE.md) and the root how-to: [docs/how-to/build-a-crm-with-cachou-and-postgres.md](../docs/how-to/build-a-crm-with-cachou-and-postgres.md).
