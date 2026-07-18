# @cachoujs/create

Scaffold a Vite + **CachouJS** app with file-based routes.

## Create a project

```bash
npx @cachoujs/create my-app
npx @cachoujs/create my-app --template spa      # default: browser history SPA
npx @cachoujs/create my-app --template static   # hash history + optional prerender
npx @cachoujs/create my-app --template ssr      # SPA client + Node SSR entry
cd my-app
npm install
npm run dev
```

## Templates

| Template | Client | Extra |
|----------|--------|--------|
| **spa** (default) | `cachoujs/browser`, browser history | File routes |
| **static** | hash history | `public/_redirects`, `npm run prerender` |
| **ssr** | browser client | `server.mjs` + `npm run ssr` (`renderApplication`) |

## What you get

- Current `cachoujs` line + Vite 6
- App shell with `Router` + `fileRoutes` via **`cachoujs/browser`**
- Routes: `/`, `/about`, `/users/:id` (with `load`)
- Base CSS (light/dark), `.gitignore`
- Optional `.cachou` compile script + Vite plugin
- DevTools bridge (`window.__CACHOU_RUNTIME__` in development)

## Related

- Runtime: [`cachoujs`](https://www.npmjs.com/package/cachoujs)
- Compiler: [`@cachoujs/compiler`](https://www.npmjs.com/package/@cachoujs/compiler)
- Full install guide: [docs/INSTALL.md](../../docs/INSTALL.md)
- Scaffold how-to: [docs/how-to/scaffold-a-new-app.md](../../docs/how-to/scaffold-a-new-app.md)
