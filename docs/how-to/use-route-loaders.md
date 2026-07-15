# Use Route Loaders

`Route` accepts an optional **`load`** function that runs when the route matches. Previous in-flight loads are aborted when the match changes.

## Basic loader

```javascript
import { Route, useRouteData, html, Show } from "cachoujs";

Route({
  path: "/users/:id",
  load: async ({ params, signal, query }) => {
    const res = await fetch(`/api/users/${params.id}`, { signal });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  fallback: () => html`<p>Loading…</p>`,
  error: (err, retry) => html`
    <p role="alert">${err.message}</p>
    <button type="button" onclick=${retry}>Retry</button>
  `,
  component: (params, state) => html`
    <article>
      <h1>User ${params.id}</h1>
      ${Show({
        when: () => state.data(),
        children: user => html`<pre>${JSON.stringify(user, null, 2)}</pre>`
      })}
    </article>
  `
});
```

## `load` context

| Field | Meaning |
|-------|---------|
| `params` | Path params (`:id`, …) |
| `path` | Normalized pathname |
| `query` | Query string object |
| `signal` | `AbortSignal` for the current request |
| `requestId` | Monotonic request id |

## Reading data deeper in the tree

```javascript
import { useRouteData } from "cachoujs";

function UserHeader() {
  const { data, loading } = useRouteData();
  return html`<h2>${() => (loading() ? "…" : data()?.name)}</h2>`;
}
```

Or `getRouteData()` for the last applied payload snapshot.

## Layouts

`load` works on routes nested under `Layout` the same way; the matched child provides `RouteDataContext` to the component tree.

## Tips

- Prefer your own authenticated APIs — not demo `/api/*`.  
- Combine with `lazy()` for code-split pages.  
- Use `fallback` / `error` for UX; still handle empty data.  

See [Routing how-to](./routing-and-lazy-pages.md) and [API: Router](../API.md#router).
