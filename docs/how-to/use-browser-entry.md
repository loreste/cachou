# Use the browser-safe entry (`cachoujs/browser`)

Client bundles should not pull Node-only helpers (content collections, media
pipelines that touch the filesystem, etc.). Cachou ships a **browser entry** for
that.

Related: [Install](../INSTALL.md) · [API](../API.md) · [Vite plugin](../COMPILER.md)

---

## Why it exists

| Import | Safe for browser bundles? | Notes |
|--------|---------------------------|--------|
| `cachoujs` | Usually | Full package surface; some subpaths are Node-oriented |
| `cachoujs/browser` | **Yes** | UI/runtime without server-only content/media graph |
| `cachoujs/content` | No (Node) | Frontmatter / collections — keep on the server |
| `cachoujs/media` | Prefer server / controlled use | Optional heavy helpers |

If a client build externalizes `node:fs` or similar, switch to the browser entry.

---

## With the Vite plugin (default)

The official Vite plugin aliases `cachoujs` → the browser runtime by default:

```js
// vite.config.js
import { defineConfig } from "vite";
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [
    cachou({
      dirs: ["src/components"],
      runtime: "cachoujs"
      // aliasRuntime: true (default)
      // runtimeEntry defaults to the browser-safe file
    })
  ]
});
```

App code can keep writing:

```js
import { signal, html, mount } from "cachoujs";
```

and the client bundle still resolves to the browser graph.

Disable only if you intentionally need the full package on the client:

```js
cachou({ aliasRuntime: false })
```

---

## Explicit import

```js
import { signal, html, mount, createResource } from "cachoujs/browser";
```

Use this in SPA entrypoints, island hydrate scripts, or when you are not using
the Vite plugin.

---

## Server vs client split

```
server.mjs          → import from "cachoujs"          (SSR, content, full surface)
src/main.js         → import from "cachoujs/browser"  (or rely on Vite alias)
src/content/*.md    → loaded only on the server
```

SSR still uses the full entry so `renderToStringAsync`, dehydrate, and head APIs
are available. Hydration on the client should use the same component graph as
the browser entry exports.

---

## Checklist

1. Client Vite/Rollup config aliases `cachoujs` to browser (plugin default) **or**
   imports `cachoujs/browser` explicitly.
2. Do not import `cachoujs/content` from client modules.
3. Keep demo/CRM server adapters out of the published app — they are monorepo examples.

See also [SSR and hydration](./ssr-and-hydration.md) and [Build and deploy](./build-and-deploy.md).
