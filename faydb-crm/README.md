# Cachou FayDB CRM

This is a proving-ground CRM for CachouJS. It keeps the UI fast and small while exercising real application concerns: list rendering, search, optimistic writes, CRUD, dashboard metrics, RBAC, realtime chat, benchmark claims, and a backend boundary for FayDB.

## What It Uses

- CachouJS frontend from the parent repo.
- FayDB through the documented PostgreSQL wire protocol.
- A thin Node API adapter so browser code never talks directly to the database.
- Cachou single-file components with scoped component CSS generated at compile time.
- A small Mako health-probe example in `mako/api.mko` for backend experiments.

## Commands

All commands are npm commands:

```bash
npm --prefix faydb-crm run check
npm --prefix faydb-crm run build
npm --prefix faydb-crm run qa
npm --prefix faydb-crm run ci
npm --prefix faydb-crm run bench:report
npm --prefix faydb-crm run api
npm --prefix faydb-crm run dev
```

Use FayDB explicitly:

```bash
npm --prefix faydb-crm run api:faydb
npm --prefix faydb-crm run smoke:faydb
```

The default API mode is `auto`: it tries FayDB first and falls back to memory only when FayDB or the `pg` package is unavailable. `api:faydb` fails loudly if FayDB is not reachable.

## FayDB Settings

The adapter defaults to the Docker quick-start connection from the local FayDB docs:

```text
postgres://admin:admin@127.0.0.1:5432/faydb?sslmode=disable
```

Override it with:

```bash
FAYDB_DSN="postgres://user:password@127.0.0.1:5433/faydb?sslmode=disable" npm --prefix faydb-crm run api:faydb
```

The app stores a compatibility copy of every record in one conservative SQL table:

```sql
CREATE TABLE IF NOT EXISTS crm_records (
  kind TEXT,
  id TEXT,
  payload TEXT,
  updated_at TEXT
)
```

The API also creates typed CRM tables and indexes when the database supports them. CRM reads use those typed tables; `crm_records` remains a compatibility and recovery path for mixed adapters.

## Development Flow

1. Run `npm --prefix faydb-crm run api:faydb`.
2. Run `npm --prefix faydb-crm run dev`.
3. Open `http://127.0.0.1:5190`.
4. Run `npm --prefix faydb-crm run smoke:faydb` to verify API CRUD against FayDB.

For frontend-only work, `npm --prefix faydb-crm run api` is acceptable because auto mode can fall back to seeded memory data.

## Postgres Docker Fallback

The CRM API uses PostgreSQL wire semantics. To compare behavior against a plain Postgres container:

```bash
npm run crm:db:postgres:up
npm run crm:smoke:postgres
npm run crm:api:postgres
```

If the container already exists:

```bash
npm run crm:db:postgres:start
```

The Postgres DSN used by these scripts is:

```text
postgres://crm:crm@127.0.0.1:55433/faydb?sslmode=disable
```

## UI QA

Run a browser smoke test that verifies the CRM leaves the loading state and renders the overview:

```bash
npm run crm:ui:smoke
```

For end-to-end showcase QA, also run:

```bash
npm run crm:qa
npm run crm:visual:smoke
npm run crm:stress
```

`crm:visual:smoke` writes route screenshots to `faydb-crm/artifacts/screenshots/`. `crm:bench:report` writes the latest competitive benchmark JSON to `faydb-crm/artifacts/benchmarks/latest.json`, which the Benchmark Claims screen reads at runtime.

Repeated `crm:bench:report` runs append summarized rank movement to `faydb-crm/artifacts/benchmarks/history.json` and write timestamped report files beside `latest.json`. The Benchmark Claims screen renders those history files as trend cards so regressions and wins are visible in the UI.

Create or refresh visual baselines with:

```bash
npm run crm:visual:baseline
```

When baselines exist, `crm:visual:smoke` compares PNG pixels and fails on regressions above the configured thresholds.

Package a local CI evidence bundle with:

```bash
npm run crm:ci
```

The bundle writes logs, screenshots, visual baselines, benchmark reports, and the production build to `faydb-crm/artifacts/ci/<timestamp>/`.

## Security and Deployment

Demo accounts are `sales / sales`, `manager / manager`, and `admin / admin`. Passwords are verified from server-side hashes, sessions expire, logout invalidates the persisted bearer token, and RBAC is enforced by the API for REST and WebSocket writes.

Use `CRM_USERS_JSON` for custom users or `CRM_REQUIRE_CUSTOM_AUTH=1` to fail startup unless custom users are configured. `CRM_ENV=production` also rejects demo users, wildcard CORS, and short session TTLs. Login attempts are rate-limited with `CRM_LOGIN_WINDOW_MS` and `CRM_LOGIN_MAX_ATTEMPTS`.

Admins can create users, change roles, disable/enable users, reset passwords, revoke sessions, and reset demo data from Security Center.

## CRM Model

The demo now uses relationship IDs in addition to readable names:

- Contacts include `companyId`.
- Deals include `companyId` and `contactIds`.
- Activities include `contactId`, `companyId`, and `dealId`.

Open `/#companies` to inspect company detail pages with related contacts, deals, and activities. Managers and admins can create company-linked deals from that page, and users with contact write access can create company-linked contacts without retyping the relationship.

Security Center includes a filterable audit timeline and JSON export for audit demos. The export button calls `GET /api/audit/export`, so the downloadable evidence comes from the authenticated backend boundary instead of only the current browser state.

The CRM also includes keyboard and accessibility hardening for the showcase paths: modal focus trapping, Escape-to-close, focus restoration, keyboard deal movement in the pipeline, labels for editor controls, and reduced-motion CSS handling.

Every API response includes `X-Request-Id`, `Server-Timing`, no-store caching, and basic content/referrer hardening headers. Clients may pass `X-Request-Id`; otherwise the server generates one and includes it in error bodies for support triage.

Security Center also reads `GET /api/ops/metrics`, an authenticated operations endpoint with request totals, per-route latency, inflight requests, cached sessions, WebSocket clients, and adapter row counts.

For deployed frontends, restrict CORS to your UI origin:

```bash
CRM_CORS_ORIGINS=https://crm.example.com npm run crm:api:faydb
```
