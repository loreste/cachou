# Deploy SSR on Workers / Deno / Bun (Fetch API)

**Status:** candidate adapters (`cachoujs/ssr-adapters`) · Node remains the primary supported SSR recipe

Related: [Deploy Node SSR](./deploy-node-ssr.md) · [DEPLOY.md](../DEPLOY.md) · example [`examples/fetch-ssr/`](../../examples/fetch-ssr/)

---

## When to use

| Runtime | Entry |
|---------|--------|
| Cloudflare Workers | `export default { fetch: createFetchHandler(App) }` |
| Deno | `Deno.serve(createFetchHandler(App))` |
| Bun | `Bun.serve({ fetch: createFetchHandler(App) })` |
| Local smoke | `node examples/fetch-ssr/server.mjs` |

For classic Node `http.Server`, prefer [`deploy-node-ssr.md`](./deploy-node-ssr.md) and `renderApplication` directly.

---

## Handler

```js
import { createFetchHandler } from "cachoujs/ssr-adapters";
import { html, signal, applyProductionSecurityDefaults } from "cachoujs";

applyProductionSecurityDefaults(); // also applied by the adapter by default

function App() {
  const [n] = signal(1);
  return () => html`<h1>Hello ${() => n()}</h1>`;
}

export const fetch = createFetchHandler(App, {
  title: "My App",
  styles: "<style>body{font-family:system-ui}</style>",
  // stream: true,  // progressive renderToStream
  // security: { connectSrc: ["'self'", "https://api.example.com"] }
});

// Workers:
export default { fetch };

// Deno:
// Deno.serve(fetch);
```

### What the adapter does

1. Builds a **CSP nonce** (or uses `options.nonce`)
2. Calls **`renderApplication`** with an explicit SSR context (concurrency-safe)
3. Assembles **`htmlDocument`** (async mode) or pipes a **ReadableStream** (stream mode)
4. Attaches **`buildSecurityHeaders`** to the `Response`

### Low-level API

```js
import { handleFetchRequest, requestPath, toReadableStream } from "cachoujs/ssr-adapters";

export default {
  async fetch(request, env, ctx) {
    return handleFetchRequest(App, request, {
      path: requestPath(request),
      onError: (err) => new Response("oops", { status: 500 })
    });
  }
};
```

---

## Hydration

Serve a separate client bundle that imports from **`cachoujs/browser`** and `hydrate` / `mount` the same tree (or use islands). The adapter only produces HTML — it does not inject your client JS automatically.

---

## Limits

- No platform-specific bindings (KV, D1, Deno KV) — pass them via `request` / `preload` yourself.
- Streaming depends on the runtime’s `ReadableStream` support.
- Always pin `cachoujs` and test your bundle size; Workers have size limits.
