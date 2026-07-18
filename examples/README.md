# CachouJS Examples

Runnable copy-paste examples for the browser runtime.

## Run

From the repo root:

```bash
npm install
npm run dev
```

Open [http://localhost:5173/examples/](http://localhost:5173/examples/).

## Primary recipes (start here)

| Recipe | Path | When |
|--------|------|------|
| **Static SPA** | Vite `npm run build` + [deploy-static-spa](../docs/how-to/deploy-static-spa.md) | CDN / static host, no Node SSR |
| **Node SSR (supported)** | [`examples/node-ssr/`](./node-ssr/) | Concurrent SSR, CSP nonces, `renderApplication` |
| **Fetch SSR (Workers/Deno)** | [`examples/fetch-ssr/`](./fetch-ssr/) | `createFetchHandler` — candidate adapter |
| **CRM-like app** | [`crm/`](../crm/) (monorepo proving ground) | Full app patterns — not the npm package |

## Included demos

| Example | Path | Concepts |
|---------|------|----------|
| Counter | `/examples/counter` | `signal`, direct DOM updates |
| Resource | `/examples/resource` | `createResource`, abort/stale protection |
| Forms | `/examples/forms` | `createForm` validation + submit |
| Nested router | `/examples/router` | `Layout`, `Outlet`, `Route`, `Link` |
| Security | `/examples/security` | URL sanitization, `onFrameworkEvent` |
| SSR starter | `examples/ssr-starter/` | Minimal Node SSR shell |

## Docs

Task recipes: [docs/how-to/README.md](../docs/how-to/README.md)  
Full guide: [docs/GUIDE.md](../docs/GUIDE.md)

## Using as a template

1. Copy the pattern you need into your app.
2. Import from `cachoujs` (the Vite plugin aliases this package in monorepo/dev).
3. For `.cachou` SFCs, use the Vite plugin:

```js
import { defineConfig } from "vite";
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [cachou({ dirs: ["src/components"] })]
});
```

## Scaffold

```bash
npm create cachou@latest my-app
# or locally:
node create-cachou/index.js my-app
```
