# Manage State with Signals and Stores

Use **signals** for discrete values, **memos** for derived data, **stores** for nested objects, and **batch** to coalesce updates. In **0.4**, use **`untrack`** and **owner** APIs when building libraries or avoiding accidental subscriptions.

Related: [Create a component](./create-a-component.md), [Resources](./use-resources.md), [0.4 APIs](./use-0.4-framework-apis.md), [API: Reactivity](../API.md#reactivity).

---

## Signals

```javascript
import { signal, effect } from "cachoujs";

const [count, setCount] = signal(0);

effect(() => {
  console.log("count is", count());
});

setCount(1);
setCount(value => value + 1);
```

| API | Role |
|-----|------|
| `count()` | Read; tracks dependency if inside an effect/binding |
| `setCount(x)` | Write if not equal (`===` by default) |
| `setCount(fn)` | Functional update |

### Options

```javascript
const [user, setUser] = signal(
  { id: 1, name: "Ada" },
  {
    name: "user", // debug label
    equals: (a, b) => a.id === b.id && a.name === b.name
  }
);
```

Pass `equals: false` (if supported by your version’s options) or a custom comparator when you need always-notify or deep compare.

---

## Lazy memos

```javascript
import { memo, signal } from "cachoujs";

const [items, setItems] = signal([
  { price: 10 },
  { price: 5 }
]);

const total = memo(() => items().reduce((sum, item) => sum + item.price, 0));

total(); // computes now
total(); // cached until items() changes
```

Memos are **lazy**: no work until first read. Put pure expensive derives here instead of inside every template binding. A memo only notifies downstream effects when its result changes; use `equals: false` when every dependency change must propagate.

---

## Stores

```javascript
import { store, effect } from "cachoujs";

const state = store({
  user: { name: "Ada", active: true },
  filters: { q: "" }
});

effect(() => {
  console.log(state.user.name, state.filters.q);
});

state.user.name = "Grace";
state.filters.q = "pipeline";
```

Use stores when you prefer nested mutation. For a single boolean/number/string, a signal is simpler and clearer.

---

## Batch updates

```javascript
import { batch, signal, effect } from "cachoujs";

const [first, setFirst] = signal("A");
const [last, setLast] = signal("B");

effect(() => {
  console.log(first(), last()); // would run twice without batch
});

batch(() => {
  setFirst("Ada");
  setLast("Lovelace");
}); // dependent effects flush once
```

Batch multi-field form commits, list + selection updates, etc.

---

## Ownership roots

```javascript
import { createRoot, effect, onCleanup } from "cachoujs";

const dispose = createRoot(dispose => {
  effect(() => {
    /* subscriptions */
  });
  onCleanup(() => {
    /* teardown */
  });
  return dispose;
});

dispose();
```

In UI code, prefer `mount(App, root)` which creates a root for you. Use `createRoot` for reactive work outside the DOM (tests, headless services).

### `untrack` and owners (0.4)

```javascript
import { signal, effect, untrack, getOwner, runWithOwner, onCleanup, createRoot } from "cachoujs";

const [n, setN] = signal(0);

createRoot(() => {
  effect(() => {
    // Read without registering a dependency
    const snapshot = untrack(() => n());
    console.log("setup peek", snapshot);
  });

  const owner = getOwner();
  queueWithOwner(owner, () => {
    onCleanup(() => console.log("cleaned with owner"));
  });
});
```

Use `untrack` when logging, measuring, or reading “current” state without re-running the effect. Use `runWithOwner` when registering cleanups from callbacks that run outside the current reactive scope (library code, async).

---

## Patterns

### Derived UI flags

```javascript
const [email, setEmail] = signal("");
const valid = memo(() => email().includes("@"));
```

### Shared module state

```javascript
// state/session.js
import { signal } from "cachoujs";
export const [token, setToken] = signal(null);
export const [user, setUser] = signal(null);
```

Import from multiple components — same signal instance, shared graph.

### Reset on navigation

```javascript
import { effect, getPath } from "cachoujs";

effect(() => {
  getPath(); // depend on path
  setQuery(""); // reset local search when route changes
});
```

---

## Anti-patterns

| Avoid | Prefer |
|-------|--------|
| Mutating a signal’s object in place without `set` | `setUser({ ...user(), name })` or a `store` |
| Huge computations inside every `effect` | `memo` + thin effects |
| Global `setInterval` without cleanup | `onCleanup` under a root |
| Appending components without `mount` | `mount` / `render` |

---

## Next

- [Use resources](./use-resources.md) for server state  
- [Prevent leaks and races](./prevent-leaks-and-races.md)  
- [Render keyed lists](./render-keyed-lists.md)  
