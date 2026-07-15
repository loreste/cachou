# Use SSR and Hydration

## Server render

```javascript
import { renderToStringAsync, dehydrate, getSSRHead, useHead } from "cachoujs";
import App from "./app.js";

export async function handle(req, res) {
  useHead({
    title: "My App",
    meta: [{ name: "description", content: "…" }]
  });

  const appHtml = await renderToStringAsync(App, { path: req.url });
  const stateScript = dehydrate();
  const headHtml = getSSRHead();

  res.setHeader("Content-Type", "text/html");
  res.end(`<!doctype html>
<html>
  <head>
    ${headHtml}
    ${stateScript}
  </head>
  <body>
    <div id="app">${appHtml}</div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`);
}
```

Call `dehydrate()` and `getSSRHead()` **immediately after** the matching `renderToStringAsync` so they use the last completed SSR context.

## Client hydrate

```javascript
import { hydrate } from "cachoujs";
import App from "./app.js";

hydrate(App, document.getElementById("app"));
```

Resources reuse `window.__CACHOU_STATE__` by resource index when present, avoiding duplicate fetches for dehydrated data.

## Isolation

Each `renderToStringAsync` uses a fresh context (resource cache, counters, head). On Node, install AsyncLocalStorage for concurrent requests (this repo’s `server.js` and Vite config do so).

## Streaming and islands (0.4)

```javascript
import { renderToStream, Island, hydrateIslands, html } from "cachoujs";

// Server: ReadableStream / async iterable of HTML chunks
const stream = renderToStream(App, { path: req.url });

// Mark interactive regions for partial hydration
function Page() {
  return html`
    <article>
      <p>Static shell…</p>
      ${Island({ id: "counter", hydrate: "idle", children: () => Counter() })}
    </article>
  `;
}

// Client: hydrate only islands
hydrateIslands(document, { counter: Counter });
```

See [use 0.4 framework APIs](./use-0.4-framework-apis.md).

## Escaping

Dynamic text and attributes are escaped on SSR. Use `trustedHTML` only for sanitized markup.

## Production server in this repo

```bash
npm run build
NODE_ENV=production CACHOU_DEMO=0 npm start
```

See [Deploy](../DEPLOY.md) and [Architecture: SSR](../ARCHITECTURE.md#ssr-pipeline).
