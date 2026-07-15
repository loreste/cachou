# @cachoujs/create

Scaffold a Vite + CachouJS app with file-based routes.

## Create a project

```bash
npx @cachoujs/create my-app
cd my-app
npm install
npm run dev
```

## What you get

- `cachoujs` app entry with `mount`
- `src/routes/` file-based routing (`/`, `/about`, `/users/:id`)
- Vite config ready for optional `.cachou` components
- DevTools bridge (`window.__CACHOU_RUNTIME__` in development)

## Related

- Runtime: [`cachoujs`](https://www.npmjs.com/package/cachoujs)
- Compiler: [`@cachoujs/compiler`](https://www.npmjs.com/package/@cachoujs/compiler)
- Full install guide: [docs/INSTALL.md](../../docs/INSTALL.md)
