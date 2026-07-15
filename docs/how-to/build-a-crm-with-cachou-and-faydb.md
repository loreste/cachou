# Build a CRM with Cachou and FayDB

This guide runs the **in-repo CRM proving ground** (`faydb-crm/`). It is a full application used to stress CachouJS — not part of the published `cachoujs` npm package.

Commands below are run from the **repo root** and use only npm scripts.

---

## What you get

- Cachou `.cachou` components with `<style scoped>` and generated CSS imports  
- FayDB / PostgreSQL-wire persistence (plus memory mode for light demos)  
- WebSocket chat and pipeline broadcasts  
- Authenticated sessions with API-enforced RBAC  
- Optimistic writes with version conflict detection  
- Performance / collaboration / security lab views  
- Benchmark claims UI tied to the competitive suite  

---

## Quick demo

One-command local demo (API + UI orchestration as defined in package scripts):

```bash
npm run crm:demo
```

Or split processes:

```bash
# terminal 1 — API (FayDB mode)
npm run crm:api:faydb

# terminal 2 — Vite CRM UI
npm run crm:dev
```

Open:

```text
http://127.0.0.1:5190/
```

### Deep links (hash routes)

```text
http://127.0.0.1:5190/#contacts
http://127.0.0.1:5190/#companies
http://127.0.0.1:5190/#pipeline
http://127.0.0.1:5190/#live-room
http://127.0.0.1:5190/#security
http://127.0.0.1:5190/#performance-lab
http://127.0.0.1:5190/#benchmarks
http://127.0.0.1:5190/#collaboration-lab
```

---

## Database connection

The FayDB API tries common local connection strings. Force one:

```bash
FAYDB_DSN=postgres://user:pass@127.0.0.1:55432/faydb?sslmode=disable npm run crm:api:faydb
```

Other modes (see `faydb-crm/package.json` scripts):

```bash
npm run crm:api              # default API script
npm run crm:api:postgres     # Postgres-oriented
npm run crm:db:postgres:up   # helper to bring Postgres up if defined
```

Reset demo data:

```bash
npm run crm:demo:reset
```

---

## Compile CRM components

After editing `.cachou` sources:

```bash
npm run crm:compile
```

Uses the root compiler with `-runtime cachoujs`.

---

## Quality gates

```bash
npm run crm:check
npm run crm:qa
npm run crm:build
npm run crm:smoke
npm run crm:smoke:faydb
npm run crm:ui:smoke
npm run crm:visual:smoke
npm run crm:visual:baseline
npm run crm:stress
npm run crm:ci              # packages evidence under faydb-crm/artifacts/ci/
npm run crm:bench:report
```

Artifacts under `faydb-crm/artifacts/` are **gitignored** — use CI uploads or local inspection only.

---

## How this relates to the framework

| Piece | Role |
|-------|------|
| `cachoujs` runtime | Signals, `html`, resources, components |
| Go compiler | `.cachou` → JS + scoped CSS |
| `faydb-crm/server.mjs` | Real-ish app server (auth, RBAC, WS) |
| Root demo `server/` | Separate toy todos/files APIs |

When learning Cachou, prefer `/examples/` first; use the CRM when you want an integrated multi-view app.

---

## Learn from the source

Browse:

```text
faydb-crm/src/app.js
faydb-crm/src/components/*.cachou
faydb-crm/server.mjs
faydb-crm/README.md
faydb-crm/SHOWCASE.md
```

Patterns to steal:

- Panel components with scoped CSS  
- Resource loading + optimistic updates  
- Role-gated actions  
- Hash routing for dense demos  

---

## Next

- [Scaffold a new app](./scaffold-a-new-app.md) for a clean project  
- [Work with `.cachou` files](./work-with-cachou-files.md)  
- [Prevent leaks and races](./prevent-leaks-and-races.md)  
- [Deploy](../DEPLOY.md) for production posture (do not ship demo gates publicly)  
