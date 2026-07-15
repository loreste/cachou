# Connect to Server Data

Prefer **your own authenticated APIs** with `createResource`. Demo endpoints in this repo require `CACHOU_DEMO=1` and are not a production data layer.

## Recommended: `createResource` + fetch

```javascript
import { createResource, html } from "cachoujs";

const [items, { loading, error, refetch }] = createResource(async ({ signal, requestId }) => {
  const res = await fetch(`/api/items?r=${requestId}`, {
    signal,
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
});

export function List() {
  return html`
    <section>
      ${() => (loading() ? "Loading…" : "")}
      ${() => (error() ? error().message : "")}
      <ul>
        ${() => (items() || []).map(item => html`<li>${item.name}</li>`)}
      </ul>
      <button onclick=${() => refetch()}>Refresh</button>
    </section>
  `;
}
```

Source-driven search:

```javascript
const [q, setQ] = signal("");
const [result] = createResource(q, async (query, { signal }) => {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  return res.json();
});
```

## Demo todos API (local only)

With `CACHOU_DEMO=1`:

```http
GET    /api/todos
POST   /api/todos          { "text": "…" }
PUT    /api/todos          { "id": 1, "completed": true }
DELETE /api/todos?id=1
```

## Demo query API (local only)

`GET /api/db-query?query=…` accepts **only** simple allowlisted `SELECT` statements (e.g. `SELECT * FROM todos`). Writes and multi-statements are rejected.

## Experimental `dbSignal`

```javascript
import { dbSignal } from "cachoujs";

const [rows, setRows] = dbSignal("todos");
```

Uses the demo query endpoint and optional WebSocket sync. Treat as experimental; do not build production apps on it.

## Proxy to another backend

```bash
CACHOU_BACKEND_URL=http://localhost:8080 npm run dev
```

Vite proxies `/api` and `/ws-api` to that origin.

## Security checklist

- [ ] Demo mode off in production (`CACHOU_DEMO=0`)
- [ ] Real auth on your APIs
- [ ] Abort signals / timeouts on client fetches
- [ ] No secrets in the browser bundle

See [Security](../SECURITY.md) and [Environment](../ENVIRONMENT.md).
