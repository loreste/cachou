# Node SSR recipe (supported)

Production-oriented concurrent SSR using public CachouJS APIs only.

```bash
# from monorepo root
node examples/node-ssr/server.mjs
# open http://127.0.0.1:8788
```

## What it demonstrates

| Concern | API |
|---------|-----|
| Per-request isolation | `renderApplication` → internal `createSSRContext` |
| Concurrent Node | `installSSRAsyncHooks` (AsyncLocalStorage) |
| Head + state | `head` + `state` from `renderApplication` / `htmlDocument` |
| CSP | `createCSPNonce` + `buildSecurityHeaders` + `dehydrate` nonce |
| Security defaults | `applyProductionSecurityDefaults` |
| Control flow on SSR | `Show` unwrapped correctly (0.4.12+) |

## Minimal app code

```js
import {
  renderApplication,
  htmlDocument,
  createCSPNonce,
  buildSecurityHeaders,
  applySecurityHeaders,
  applyProductionSecurityDefaults
} from "cachoujs";

applyProductionSecurityDefaults();

const nonce = createCSPNonce();
const { html, head, state } = await renderApplication(App, {
  path: req.url,
  request: req,
  nonce
});
applySecurityHeaders(res, buildSecurityHeaders({ nonce, allowInlineStyles: false }));
res.end(htmlDocument({ html, head, state, title: "App", styles: `<style nonce="${nonce}">…</style>` }));
```

Full details: [Deploy — Node SSR](../../docs/DEPLOY.md) · [Stability](../../docs/STABILITY.md).
