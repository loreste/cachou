# How to: use 0.4 framework APIs

Quick recipes for the 0.4 library surface. Full reference: [API.md](../API.md), status: [ROADMAP.md](../ROADMAP.md).

## untrack and owners

```js
import { signal, effect, untrack, getOwner, runWithOwner, onCleanup, createRoot } from "cachoujs";

const [n, setN] = signal(0);

createRoot(() => {
  effect(() => {
    // Peek without re-subscribing
    const snapshot = untrack(() => n());
    console.log("once per effect setup", snapshot);
  });

  const owner = getOwner();
  runWithOwner(owner, () => {
    onCleanup(() => console.log("torn down with owner"));
  });
});
```

## For / Index

```js
import { For, Index, signal, html } from "cachoujs";

const [items] = signal([{ id: 1, name: "Tea" }]);

html`<ul>${For({
  each: items,
  by: i => i.id,
  children: item => html`<li>${() => item.name}</li>`
})}</ul>`;
```

## Route load control flow

```js
import { Route, redirect, notFound } from "cachoujs";

Route({
  path: "/account",
  load: async ({ request }) => {
    if (!request?.user) redirect("/login");
    const user = await loadUser(request.user.id);
    if (!user) notFound();
    return user;
  },
  component: (params, { data }) => html`<div>${() => data()?.name}</div>`
});
```

## Actions and mutations

```js
import { createAction, createMutation, optimisticUpdate, setQueryData } from "cachoujs";

const addToCart = createMutation(
  async item => fetch("/api/cart", { method: "POST", body: JSON.stringify(item) }).then(r => r.json()),
  {
    onMutate(item) {
      return optimisticUpdate("cart", cart => [...(cart || []), item]);
    },
    onSuccess(cart) {
      setQueryData("cart", cart);
    }
  }
);

const checkout = createAction(async formData => {
  // form POST body
  return { orderId: "…" };
});
```

## Search params (catalog filters)

```js
import { useSearchParams, html } from "cachoujs";

function Catalog() {
  const [params, setParams] = useSearchParams();
  return html`
    <input
      value=${() => params().q || ""}
      oninput=${e => setParams({ q: e.target.value })}
    />
  `;
}
```

## History modes

```js
import { configureRouter } from "cachoujs";

configureRouter({ history: "memory", initialPath: "/" }); // tests
// configureRouter({ history: "hash" }); // static hosts without server rewrites
```

## Streaming SSR and islands

```js
import { renderToStream, Island, hydrateIslands, setRequestEvent } from "cachoujs";

setRequestEvent({ headers: req.headers, cookies: parse(req) });
const stream = renderToStream(App, { path: req.url, request: event });
// pipe stream to response

// Client:
// hydrateIslands(document, { "cart-badge": CartBadge });
```

## Dialog and model

```js
import { signal, Dialog, html, directive } from "cachoujs";

const [open, setOpen] = signal(false);
const [name, setName] = signal("");

html`
  <input model=${[name, setName]} />
  <button type="button" onclick=${() => setOpen(true)}>Open</button>
  ${Dialog({
    open,
    onClose: () => setOpen(false),
    title: "Cart",
    children: () => html`<p>Hello ${name}</p>`
  })}
`;
```
