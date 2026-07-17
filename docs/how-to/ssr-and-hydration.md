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

For a sequential server handler, calling `dehydrate()` and `getSSRHead()` immediately after the matching render uses the last completed SSR context.

### Concurrent servers (required pattern)

On Node HTTP servers that handle overlapping requests, **always** pass an explicit
context so one request can never serialize another request's state:

```javascript
import http from "node:http";
import {
  createSSRContext,
  renderToStringAsync,
  dehydrate,
  getSSRHead,
  installSSRAsyncHooks
} from "cachoujs";

// Optional but recommended: request-scoped AsyncLocalStorage on Node.
try {
  const asyncHooks = await import("node:async_hooks");
  installSSRAsyncHooks(asyncHooks);
} catch {
  // environments without async_hooks still work if you pass `context` explicitly
}

http.createServer(async (req, res) => {
  const context = createSSRContext();
  try {
    const appHtml = await renderToStringAsync(App, {
      path: req.url,
      request: req,
      context,
      signal: req.signal // if available — aborts in-flight resources on disconnect
    });
    // Always pass the same context object:
    const stateScript = dehydrate(context);
    const headHtml = getSSRHead(context);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html><head>${headHtml}${stateScript}</head>
<body><div id="app">${appHtml}</div></body></html>`);
  } catch (err) {
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
}).listen(3000);
```

Rules of thumb:

1. **`createSSRContext()` once per request** — never reuse across concurrent handlers.
2. Pass **`context`** into `renderToStringAsync` / `renderToStream` **and** into `dehydrate` / `getSSRHead`.
3. If concurrent renders are detected, implicit `dehydrate()` / `getSSRHead()` (no arg) **fail closed** instead of returning an ambiguous request’s output.
4. Client bundles should use [`cachoujs/browser`](./use-browser-entry.md) (or the Vite plugin default alias).

Minimal starter in this repo: `examples/ssr-starter/server.mjs` (`npm run ssr:starter`).

## Fast route preloading

Pages with known route data can avoid the generic async discovery pass by loading data before rendering:

```javascript
const appHtml = await renderToStringAsync(data => App(data), {
  path: req.url,
  request: req,
  preload: ({ request, signal }) => loadPageData(request, signal)
});
```

The preload function receives the request and abort signal. Its result is passed to the component, which renders once after loading completes. Components that still discover pending resources retain the normal safe fallback behavior.

Enable structured diagnostics during development:

```javascript
import { configureLogger, createLogger } from "cachoujs";

configureLogger({ level: "debug" });
const log = createLogger("checkout");
log.info("starting", { orderId });
```

Framework events include SSR stages, resource failures, navigation errors, hydration mismatches, cleanup errors, timing, and request-local SSR context IDs. Logging is silent by default and never throws into application code.

## OpenTelemetry-compatible tracing

CachouJS tracing follows the OpenTelemetry model and W3C `traceparent` format, but
does not bundle an exporter or SDK. It is disabled by default and can be bridged
to the application's OpenTelemetry SDK:

```javascript
import { configureTracing } from "cachoujs";

configureTracing({
  enabled: process.env.NODE_ENV !== "production",
  sampleRate: 0.1,
  exporter: span => otelTracer.startActiveSpan(span.name, active => {
    active.setAttributes(span.attributes);
    for (const event of span.events) active.addEvent(event.name, event.attributes);
    if (span.status.code === "ERROR") active.recordException(span.status.message);
    active.end();
  })
});
```

SSR spans accept the incoming W3C header and automatically cover SSR stages,
resource fetches, hydration, and framework events. Pass the request through so
concurrent requests retain separate trace IDs:

```javascript
const html = await renderToStringAsync(App, {
  request: req,
  path: req.url,
  traceparent: req.headers.get?.("traceparent") || req.headers.traceparent
});
```

Trace attributes are bounded and redact credentials, cookies, tokens, secrets,
and authorization values. Do not put user payloads or access tokens into custom
span attributes; use stable IDs or application-side correlation fields instead.

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
const stream = renderToStream(App, { path: req.url, signal: req.signal });

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
