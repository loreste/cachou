# Static pre-render (build-time HTML)

**Status:** candidate (`cachoujs/static`) · complements [static SPA](./deploy-static-spa.md) and [Node SSR](./deploy-node-ssr.md)

Related: example [`examples/static-prerender/`](../../examples/static-prerender/) · API below

---

## When to use

| Need | Use |
|------|-----|
| Client-only SPA, no HTML per route | [Static SPA](./deploy-static-spa.md) |
| HTML files at build time for SEO / first paint | **This guide** (`prerenderRoutes` / `prerenderToDir`) |
| Per-request HTML on a server | [Node SSR](./deploy-node-ssr.md) or [Fetch SSR](./deploy-fetch-ssr.md) |

---

## API

```js
import { prerenderRoutes, writePrerendered, prerenderToDir, routeToFilePath } from "cachoujs/static";

// In-memory
const pages = await prerenderRoutes(App, {
  routes: ["/", "/about", { path: "/blog", title: "Blog" }],
  title: ({ path }) => `App ${path}`,
  styles: '<link rel="stylesheet" href="/assets/app.css" />',
  scripts: '<script type="module" src="/assets/client.js"></script>',
  nonce: false,       // static hosts without CSP nonces for inline scripts
  concurrent: false   // set true to render routes in parallel
});
// pages[i].file → "index.html" | "about/index.html" | …

// Write (Node build script)
await writePrerendered(pages, "dist");

// Or one-shot
await prerenderToDir(App, {
  routes: ["/", "/about"],
  outDir: "dist",
  title: "App"
});
```

### Path → file

| Route | File |
|-------|------|
| `/` | `index.html` |
| `/about` | `about/index.html` |
| `/blog/post` | `blog/post/index.html` |

---

## Build sketch (Vite)

1. `vite build` → client assets in `dist/assets/`
2. Run a small prerender script that imports your `App` and writes HTML into `dist/`
3. Deploy `dist/` to any static host

```json
{
  "scripts": {
    "build": "vite build && node scripts/prerender.mjs"
  }
}
```

Ensure the prerender script resolves **`cachoujs`** (full package), not only `cachoujs/browser`, so SSR helpers are available. The **client** entry should still use `cachoujs/browser`.

---

## Hydration

Dehydrate state is included in each document (same as SSR). Pair with a client bundle that `hydrate`s or `mount`s the same tree. For fully static shells with no interactivity, omit client scripts and ignore state.

---

## Limits

- Routes are an **explicit list** — not a crawl of your app graph.
- Dynamic data must be available at build time (`preload` / route `preload`).
- Not a full meta-framework (no automatic image optimization or content pipeline).
