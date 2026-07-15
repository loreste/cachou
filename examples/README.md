# CachouJS Examples

Runnable copy-paste examples for the browser runtime.

## Run

From the repo root:

```bash
npm install
npm run dev
```

Open [http://localhost:5173/examples/](http://localhost:5173/examples/).

## Included

| Example | Path | Concepts |
|---------|------|----------|
| Counter | `/examples/counter` | `signal`, direct DOM updates |
| Resource | `/examples/resource` | `createResource`, abort/stale protection |
| Forms | `/examples/forms` | `createForm` validation + submit |
| Nested router | `/examples/router` | `Layout`, `Outlet`, `Route`, `Link` |
| Security | `/examples/security` | URL sanitization, `onFrameworkEvent` |

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
