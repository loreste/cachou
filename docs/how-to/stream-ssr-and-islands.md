# Stream SSR and islands

**Status:** candidate (`renderToStream`, `Island`, `hydrateIslands`)

Related: [Deploy Node SSR](./deploy-node-ssr.md) · [SSR](./ssr-and-hydration.md) · [STABILITY](../STABILITY.md)

---

## Progressive streaming (default)

`renderToStream` with `progressive: true` (default):

1. **First chunk** — full head + first-pass body (loading UI, island SSR HTML)
2. **After resources** — small script swaps `#app` with the final body, refreshes head title/meta, then dehydrate state

```js
import { renderToStream, createSSRContext, createCSPNonce } from "cachoujs";

const context = createSSRContext();
const nonce = createCSPNonce();
const stream = renderToStream(App, {
  context,
  path: req.url,
  request: req,
  nonce,
  progressive: true // default
});
// pipe stream to the response
```

Use `progressive: false` for a classic single final document (open head → wait → head+body).

---

## Islands

Mark interactive regions; ship static HTML for the rest.

```js
import { Island, html, hydrateIslands } from "cachoujs";

// Server / universal
function Page() {
  return html`
    <article>
      <h1>Docs</h1>
      ${Island({
        id: "counter",
        hydrate: "idle", // load | idle | visible | false
        fallback: () => html`<button disabled>…</button>`,
        children: () => Counter({})
      })}
    </article>
  `;
}

// Client
hydrateIslands(document, {
  counter: Counter
}, {
  onError(err, id) { console.error(id, err); },
  rootMargin: "120px" // for hydrate: "visible"
});
```

| `hydrate` | Behavior |
|-----------|----------|
| `load` | Hydrate immediately |
| `idle` | `requestIdleCallback` (2s timeout fallback) |
| `visible` | `IntersectionObserver` (+ rootMargin) |
| `false` | Never hydrate (static only) |

`fallback` (optional) is what SSR emits inside the island when you want a lighter placeholder than the interactive tree.

---

## Combining with `renderApplication`

```js
const { stream } = await renderApplication(App, {
  path: req.url,
  mode: "stream",
  nonce
});
```
