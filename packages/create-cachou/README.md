# @cachoujs/create

Scaffold a Vite + **CachouJS 0.4** app with file-based routes.

## Create a project

```bash
npx @cachoujs/create my-app
cd my-app
npm install
npm run dev
```

## What you get

- `cachoujs@^0.4.3` + Vite 6
- App shell with `Router` + `fileRoutes`
- Routes: `/`, `/about`, `/users/:id` (with `load`)
- Base CSS (light/dark), `.gitignore`
- Optional `.cachou` compile script + Vite plugin
- DevTools bridge (`window.__CACHOU_RUNTIME__` in development)

## Related

- Runtime: [`cachoujs`](https://www.npmjs.com/package/cachoujs)
- Compiler: [`@cachoujs/compiler`](https://www.npmjs.com/package/@cachoujs/compiler)
- Full install guide: [docs/INSTALL.md](../../docs/INSTALL.md)
- Scaffold how-to: [docs/how-to/scaffold-a-new-app.md](../../docs/how-to/scaffold-a-new-app.md)
