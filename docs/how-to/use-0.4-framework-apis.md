# How to: use 0.4 framework APIs

Quick recipes for the **0.4** library surface (current: **0.4.1**).  
Full tutorial: [Get Started](../GETTING_STARTED.md) · Reference: [API.md](../API.md) · Status: [ROADMAP.md](../ROADMAP.md).

---

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

Also: [Manage state](./manage-state.md).

---

## Composition: splitProps / mergeProps / Dynamic

```js
import { splitProps, mergeProps, Dynamic, html } from "cachoujs";

function Button(props) {
  const [local, rest] = splitProps(props, ["variant", "children"]);
  const merged = mergeProps({ type: "button" }, rest);
  return html`
    <button
      type=${() => merged.type}
      class=${() => `btn btn-${local.variant || "default"}`}
      onclick=${() => merged.onclick?.()}
    >
      ${local.children}
    </button>
  `;
}

// Render a component chosen at runtime
html`${Dynamic({ component: Tab, props: { id: "a" } })}`;
```

---

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

Details: [Render keyed lists](./render-keyed-lists.md).

---

## Route load control flow

```js
import { Route, redirect, notFound, html } from "cachoujs";

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

Also: [Route loaders](./use-route-loaders.md) · [Routing](./routing-and-lazy-pages.md).

---

## Actions and mutations

```js
import { createAction, createMutation, optimisticUpdate, setQueryData } from "cachoujs";

const addToCart = createMutation(
  async item =>
    fetch("/api/cart", { method: "POST", body: JSON.stringify(item) }).then(r => r.json()),
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

---

## Search / path params

```js
import { useSearchParams, useParams, html } from "cachoujs";

function Catalog() {
  const [params, setParams] = useSearchParams();
  return html`
    <input
      value=${() => params().q || ""}
      oninput=${e => setParams({ q: e.target.value })}
    />
  `;
}

function Product() {
  const params = useParams();
  return html`<h1>${() => params().id}</h1>`;
}
```

---

## History modes

```js
import { configureRouter } from "cachoujs";

configureRouter({ history: "memory", initialPath: "/" }); // tests
// configureRouter({ history: "hash" }); // static hosts without server rewrites
// configureRouter({ history: "browser" }); // default
```

---

## Streaming SSR and islands

```js
import { renderToStream, Island, hydrateIslands, setRequestEvent, html } from "cachoujs";

setRequestEvent({ headers: req.headers /* … */ });
const stream = renderToStream(App, { path: req.url });
// pipe stream to the response

// In the tree:
html`${Island({ id: "cart-badge", hydrate: "idle", children: () => CartBadge() })}`;

// Client:
// hydrateIslands(document, { "cart-badge": CartBadge });
```

Also: [SSR and hydration](./ssr-and-hydration.md).

---

## Dialog and model

```js
import { signal, Dialog, html } from "cachoujs";

const [open, setOpen] = signal(false);
const [name, setName] = signal("");

html`
  <input model=${[name, setName]} />
  <button type="button" onclick=${() => setOpen(true)}>Open</button>
  ${Dialog({
    open,
    onClose: () => setOpen(false),
    title: "Cart",
    children: () => html`<p>Hello ${() => name()}</p>`
  })}
`;
```

Also: [Templates](./use-templates-and-directives.md) · [Accessibility](./use-accessibility.md).

---

## persist and virtualList

```js
import { signal, persist, virtualList, html } from "cachoujs";

const [theme, setTheme] = signal("light");
persist("theme", theme, setTheme); // localStorage (browser)

const [rows] = signal(Array.from({ length: 10000 }, (_, i) => ({ id: i, label: `Row ${i}` })));
const list = virtualList({
  items: rows,
  itemHeight: 32,
  height: 400,
  renderItem: row => html`<div>${() => row.label}</div>`
});
```

---

## Next

- [Get Started](../GETTING_STARTED.md)  
- [How-to index](./README.md)  
- [Known limitations](../KNOWN_LIMITATIONS.md)  
