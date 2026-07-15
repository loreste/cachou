# Build a CRM with Cachou and PostgreSQL

This guide runs the **in-repo CRM proving ground** (`crm/`). It is a full application used to stress CachouJS — not part of the published `cachoujs` npm package.

## What you get

- CachouJS UI (`.cachou` components, scoped CSS)
- Node API with sessions and RBAC
- **PostgreSQL** persistence via `pg` (or in-memory for UI-only demos)
- WebSocket chat and pipeline updates
- Performance / security / collaboration lab views

## Quick demo (no database)

Memory API + UI:

```bash
# from repo root
npm run crm:demo
```

Or separately:

```bash
npm run crm:api          # memory / auto
npm run crm:dev
```

Open http://127.0.0.1:5190/

## PostgreSQL

### 1. Start Postgres (Docker)

```bash
npm run crm:db:postgres:up
```

Default URL:

```text
postgres://crm:crm@127.0.0.1:55433/crm
```

### 2. Run API against Postgres

```bash
npm run crm:api:postgres
```

Or with your own URL:

```bash
CRM_DB_MODE=postgres \
POSTGRES_DSN=postgres://user:pass@127.0.0.1:5432/crm?sslmode=disable \
  npm run crm:api
```

### 3. UI

```bash
npm run crm:dev
```

### Environment

| Variable | Purpose |
|----------|---------|
| `CRM_DB_MODE` | `auto`, `memory`, or `postgres` |
| `POSTGRES_DSN` | PostgreSQL connection string |
| `CRM_API_PORT` | API port (default `5191`) |
| `CRM_CORS_ORIGINS` | Allowed browser origins |

## Quality checks

```bash
npm run crm:check
npm run crm:qa
npm run crm:build
npm run crm:smoke:postgres
npm run crm:ui:smoke
npm run crm:ci
```

Artifacts: `crm/artifacts/` (gitignored).

## Code map

```text
crm/src/app.js
crm/src/components/*.cachou
crm/server.mjs
crm/README.md
crm/SHOWCASE.md
```

## Next

- [Scaffold a new app](./scaffold-a-new-app.md)  
- [Work with `.cachou` files](./work-with-cachou-files.md)  
- [Deploy](../DEPLOY.md)  
