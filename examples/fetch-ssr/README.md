# Fetch SSR adapter (Workers / Deno / Bun)

Uses `createFetchHandler` from `cachoujs/ssr-adapters` — the same Fetch `Request` → `Response` shape works on Cloudflare Workers, Deno, Bun, and similar runtimes.

## Node smoke (no Workers account needed)

From the monorepo root:

```bash
node examples/fetch-ssr/server.mjs
# open http://127.0.0.1:8789
```

This boots a tiny `node:http` bridge that calls the Fetch handler so you can verify the adapter locally.

## Cloudflare Worker sketch

```js
import { createFetchHandler } from "cachoujs/ssr-adapters";
import { html, signal } from "cachoujs";

function App() {
  const [n] = signal(1);
  return () => html`<h1>Worker ${() => n()}</h1>`;
}

export default {
  fetch: createFetchHandler(App, {
    title: "Cachou Worker",
    styles: "<style>body{font-family:system-ui}</style>"
  })
};
```

Bundle with Wrangler / esbuild so `cachoujs` resolves. Prefer `cachoujs/browser` only for client hydration bundles.

## Deno sketch

```ts
import { createFetchHandler } from "npm:cachoujs/ssr-adapters";
import { html } from "npm:cachoujs";

function App() {
  return () => html`<h1>Deno SSR</h1>`;
}

Deno.serve(createFetchHandler(App, { title: "Cachou Deno" }));
```

## Options

| Option | Notes |
|--------|--------|
| `stream: true` | Progressive `renderToStream` body |
| `title`, `styles`, `scripts` | Document shell via `htmlDocument` |
| `security` | Passed to `buildSecurityHeaders` |
| `onError` | Custom error `Response` |

See [Deploy Fetch SSR](../../docs/how-to/deploy-fetch-ssr.md).
