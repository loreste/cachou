# Use Resources (Async Data)

`createResource` loads async data with loading/error signals, abort, stale-response suppression, and optional caching.

Related: [Connect to server data](./connect-to-server-data.md), [Prevent leaks](./prevent-leaks-and-races.md), [API: Resources](../API.md#resources).

---

## Basic fetch

```javascript
import { createResource, html } from "cachoujs";

const [todos, { loading, error, refetch, mutate }] = createResource(
  async ({ signal, requestId }) => {
    const res = await fetch(`/api/todos?r=${requestId}`, { signal });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  {
    key: "todos",
    staleTime: 30_000,
    timeoutMs: 10_000,
    dedupe: true,
    revalidateOnFocus: true,
    revalidateOnReconnect: true
  }
);

export function TodoList() {
  return html`
    <section>
      ${() => (loading() ? html`<p>Loading…</p>` : "")}
      ${() =>
        error() ? html`<p role="alert">${String(error().message || error())}</p>` : ""}
      <ul>
        ${() => (todos() || []).map(t => html`<li>${t.text}</li>`)}
      </ul>
      <button type="button" onclick=${() => refetch()}>Refresh</button>
    </section>
  `;
}
```

Prefer `mapArray` for large lists — see [Render keyed lists](./render-keyed-lists.md).

Resources created inside a mounted root are disposed automatically with that
root. If a resource is created outside an owner, call `controls.dispose()` when
the resource is no longer needed so in-flight work and browser revalidation
listeners are released.

---

## Source-driven resources (search, filters)

```javascript
import { signal, createResource } from "cachoujs";

const [query, setQuery] = signal("");

const [result, { loading }] = createResource(
  query,
  async (q, { signal }) => {
    if (!q.trim()) return [];
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
    return res.json();
  },
  {
    key: q => `search:${q}`,
    cancelPrevious: true // default: abort in-flight when query changes
  }
);
```

Typing quickly aborts older requests. Even if abort is ignored, **stale responses cannot overwrite newer data**.

---

## Mutate and invalidate

```javascript
// Optimistic UI
mutate(current => [...(current || []), newItem]);

// Force refetch
await refetch();

// Drop cache by key
import { invalidateResource } from "cachoujs";
invalidateResource("todos");
```

---

## Prefetch

```javascript
import { prefetchResource } from "cachoujs";

await prefetchResource("todos", async ({ signal }) => {
  const res = await fetch("/api/todos", { signal });
  return res.json();
});
```

Useful on `Link` hover or route intent.

---

## Options cheat sheet

| Option | Default | Purpose |
|--------|---------|---------|
| `key` | auto | Cache identity |
| `staleTime` | `0` | ms before cached data is considered stale |
| `cancelPrevious` | `true` | Abort prior in-flight request |
| `timeoutMs` | — | Fail after timeout |
| `dedupe` | — | Share in-flight promises for same key |
| `revalidateOnFocus` | — | Refetch when window focuses |
| `revalidateOnReconnect` | — | Refetch when network returns |

The browser cache keeps at most 256 resolved resource keys using LRU eviction.
For applications with high-cardinality route or search keys, configure a
smaller bound or disable resolved-data retention:

```javascript
import { configureResourceCache } from "cachoujs";

configureResourceCache({ maxEntries: 128 });
```

---

## With Suspense

```javascript
import { Suspense, lazy } from "cachoujs";

// Resources under Suspense can drive fallback UI while loading
Suspense({
  fallback: () => html`<p>Loading page…</p>`,
  children: () => PageWithResources()
});
```

---

## SSR

During `renderToStringAsync`, resolved resources are stored in the SSR context and emitted by `dehydrate()` for client reuse. See [SSR and hydration](./ssr-and-hydration.md).

---

## Anti-patterns

| Avoid | Prefer |
|-------|--------|
| Manual `fetch` in `effect` without abort/id | `createResource` |
| Ignoring `loading` / `error` | Explicit UI states |
| Demo `/api/db-query` in production | Your authenticated API |

## Next

- [Connect to server data](./connect-to-server-data.md)
- [Use forms](./use-forms.md)
