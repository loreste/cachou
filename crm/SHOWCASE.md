# Cachou CRM Showcase (PostgreSQL)

## Start

```bash
npm run crm:demo
```

Or run API and UI separately:

```bash
npm run crm:api:postgres
npm run crm:dev
```

Open:

```text
http://127.0.0.1:5190/
```

## Demo Script

1. Show the overview cards and scoped SFC output.
   - The overview uses `.cachou` components compiled to generated CSS files.
   - Inspect `src/components/*.css` to see `data-c-*` scoped selectors.

2. Open two browser windows.
   - Switch both to `Pipeline`.
   - Drag or move a deal in one window.
   - Use keyboard focus plus ArrowRight/ArrowLeft to move a deal without the mouse.
   - The other window receives the WebSocket `deal-updated` event.

3. Switch roles.
   - Sign in as `sales` / `sales`, `manager` / `manager`, or `admin` / `admin`.
   - `Sales` can read, edit contacts, and chat.
   - `Manager` can also move deals.
   - `Admin` can manage and delete CRM records.
   - The API enforces these permissions; the smoke test verifies anonymous `401` and Sales deal-write `403`.

4. Open `Live Room`.
   - Send a chat message.
   - It broadcasts over WebSocket and persists through the API adapter.

5. Click `Load 5,000`.
   - This loads a local stress dataset to show large-list rendering and search responsiveness.

6. Open `Security Center`.
   - Show the RBAC matrix and admin user lifecycle controls.
   - Filter the audit timeline by actor, role, or action.
   - Export the audit log through the authenticated backend endpoint.

7. Open `Performance Lab`.
   - Load 5,000 contacts.
   - Run route churn.
   - Use it as the in-app runtime proof surface.

8. Open `Benchmark Claims`.
   - Show the rank targets and the checks backing those claims.
   - Show benchmark history from repeated `npm run crm:bench:report` runs.
   - Point out the trend cards that compare the latest rank and p95 to the previous run.
   - Explain that publishable claims should come from benchmark artifacts, not screenshots.

9. Open `Collaboration Lab`.
   - Run the conflict demo.
   - Show that Editor B's stale write is rejected and the UI recovers from server truth.

10. Run verification.

```bash
npm run crm:qa
npm run crm:check
npm run crm:smoke:postgres
npm run crm:ui:smoke
npm run crm:stress
npm run crm:visual:smoke
npm run crm:visual:baseline
npm run crm:ci
```

## What This Proves

- Cachou single-file components with Vue-style `<style scoped>`.
- Generated component CSS imports.
- PostgreSQL persistence via the `pg` driver.
- WebSocket chat and realtime deal updates.
- Optimistic writes with server-side version conflict detection.
- Authenticated sessions and server-side RBAC.
- Hashed demo passwords, expiring sessions, `/api/auth/me`, and server-side logout invalidation.
- Session records persisted through the same API adapter so restarts can validate bearer tokens when the database is live.
- Role-aware UI behavior backed by API permissions.
- Large-list frontend stress path.
- API schema metadata at `/api/schema`.
- PostgreSQL typed table and index setup where the database supports it, with typed tables used for CRM reads and `crm_records` kept as the compatibility log.
- Direct visual QA routes: `/#overview`, `/#contacts`, `/#pipeline`, `/#live-room`.
- Security Center route: `/#security`.
- Performance Lab route: `/#performance-lab`.
- Benchmark Claims route: `/#benchmarks`.
- Screenshot artifacts from visual smoke in `crm/artifacts/screenshots/`.
- Optional visual baselines in `crm/artifacts/screenshots-baseline/`; visual smoke compares pixels when baselines exist.
- Benchmark report artifacts from `npm run crm:bench:report` in `crm/artifacts/benchmarks/latest.json`.
- Benchmark history in `crm/artifacts/benchmarks/history.json` and timestamped report files.
- Benchmark trend cards in the UI for rank and p95 movement.
- Collaboration Lab route: `/#collaboration-lab`.
- Companies route with relationship views: `/#companies`.
- Contact, deal, and activity records carry relationship IDs such as `companyId`, `contactIds`, and `dealId`.
- Company detail actions write related contacts and deals with the right relationship IDs.
- Accessible modals, reduced-motion handling, and keyboard pipeline movement.
- CI evidence bundles in `crm/artifacts/ci/<timestamp>/`.
- One-command demo launcher: `npm run crm:demo`.

## Schema

The API exposes:

```text
GET /api/schema
```

The schema response declares the CRM kinds, SQL table names, index targets, schema version, and whether typed SQL tables were created successfully. This keeps the demo honest: the app can run on memory, Postgres, or a local Postgres container, and the smoke tests assert the schema contract.

## Auth and RBAC

Demo accounts:

```text
sales / sales
manager / manager
admin / admin
```

Permissions are enforced on the API:

```text
Sales: read, contacts write, messages write
Manager: Sales permissions + deals write
Admin: full CRM management, including deletes
```

WebSocket chat also requires an authenticated token.

Sessions expire after one hour by default. Override with:

```bash
CRM_SESSION_TTL_MS=900000 npm run crm:api:postgres
```

Allowed browser origins default to the local Vite ports. Override for deployed frontends:

```bash
CRM_CORS_ORIGINS=https://crm.example.com npm run crm:api:postgres
```

The frontend disables or explains restricted actions, but the API remains the enforcement point.

Production-like runs can enforce custom auth and reject unsafe demo config:

```bash
CRM_ENV=production CRM_REQUIRE_CUSTOM_AUTH=1 CRM_USERS_JSON='[{"username":"admin","password":"change-me","name":"Admin","role":"Admin"}]' npm run crm:api:postgres
```

## NPM-Only Commands

```bash
npm run crm:api:postgres
npm run crm:dev
npm run crm:demo
npm run crm:check
npm run crm:build
npm run crm:qa
npm run crm:ci
npm run crm:bench:report
npm run crm:smoke:postgres
npm run crm:stress
npm run crm:visual:smoke
```

Developers do not need to run Go, Vite, or node binaries directly for the demo path.
