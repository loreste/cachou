# Environment Variables

All environment variables recognized by this repository and the demo server.

---

## Server & ports

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5173` | Preferred listen port for Vite and production server |
| `CACHOU_PORT` | (falls back to `PORT` / `5173`) | Alternate port for production `npm start` |
| `NODE_ENV` | unset / `production` on `npm start` | When `production`, demo mode defaults **off** unless overridden |

---

## Demo & security

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHOU_DEMO` | Dev: effectively on via Vite; Prod start: off | `1` / `true` / `yes` enables privileged demo APIs. **Keep off in production.** |
| `CACHOU_FILES_ROOT` | `./sandbox` | Root directory for the files API (resolved absolute) |
| `CACHOU_FILES_MAX_BYTES` | `1048576` (1 MB) | Max file size for `/api/files/content` |

---

## Database (demo)

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHOU_DB_TYPE` | `sqlite` | `sqlite`, `memory`, or experimental: `postgres`, `mysql`, `mongodb`, `firebase` |
| `CACHOU_DB_EXPERIMENTAL` | unset | Must be `1` to load experimental adapters |
| `CACHOU_DATABASE_URL` | — | Connection string for postgres/mysql/mongodb adapters |
| `FIREBASE_SERVICE_ACCOUNT` | — | JSON service account for Firebase adapter |

SQLite file path is `cachou.db` in the process working directory (gitignored).

---

## Vite / dev proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHOU_BACKEND_URL` | unset | If set, Vite proxies `/api` and `/ws-api` to this origin |

---

## Compiler

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHOU_SKIP_COMPILER_BUILD` | unset | `1` skips `postinstall` / ensure-compiler native build |

---

## Tests & benchmarks

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHOU_TEST_PORT` | `5177` | Port for the browser test Vite instance |
| `CACHOU_TEST_BROWSER` | auto | `chromium` / `playwright` forces Playwright; `safari` forces Safari osascript runner |
| `CACHOU_COMPARE_SAMPLES` | harness default | Number of samples per competitive benchmark scenario (use `30` for publishable runs) |
| `CACHOU_SSR_BENCH_SAMPLES` | `5` | Repeated samples for SSR throughput benchmarks |
| `CACHOU_SSR_BENCH_SCALE` | `1` | Multiplier for SSR benchmark iterations |
| `CACHOU_COMPARE_RESULTS_PATH` | OS temp file | Where the compare harness POSTs JSON results |

---

## Example `.env`

Copy from [`.env.example`](../.env.example):

```bash
PORT=5173
CACHOU_DEMO=1
CACHOU_DB_TYPE=sqlite
CACHOU_FILES_ROOT=./sandbox
CACHOU_FILES_MAX_BYTES=1048576
```

Production:

```bash
NODE_ENV=production
CACHOU_DEMO=0
PORT=8080
```
