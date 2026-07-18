# Static pre-render (SSG-style HTML)

Generate HTML files for a list of routes at build time using `cachoujs/static`.

## Run (monorepo)

```bash
node examples/static-prerender/prerender.mjs
# writes examples/static-prerender/out/**/index.html
```

Or from package root: `npm run ssr:static`

## Consumer app sketch

```js
// scripts/prerender.mjs
import { prerenderToDir } from "cachoujs/static";
import { html } from "cachoujs";
import App from "../src/App.js";

await prerenderToDir(App, {
  routes: ["/", "/about", "/pricing"],
  outDir: "dist",
  title: ({ path }) => `My App${path === "/" ? "" : ` — ${path}`}`,
  styles: '<link rel="stylesheet" href="/assets/app.css" />',
  scripts: '<script type="module" src="/assets/client.js"></script>',
  nonce: false // pure static host; no inline dehydrate nonce needed if you omit state scripts
});
```

Client still hydrates or mounts from `cachoujs/browser`. For pure static shells without hydration, skip client scripts.

See [Deploy static pre-render](../../docs/how-to/deploy-static-prerender.md).
