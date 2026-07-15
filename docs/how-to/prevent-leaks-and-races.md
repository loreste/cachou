# Prevent Leaks and Race Conditions

Reactive UIs fail in two classic ways: **subscriptions that never die**, and **async results that apply out of order**. This guide is the operational checklist.

Related: [Debug diagnostics](./enable-debug-diagnostics.md), [Resources](./use-resources.md), [Scheduler](./schedule-background-work.md).

---

## 1. Always own work under a root

Prefer:

```javascript
import { mount } from "cachoujs";

const dispose = mount(App, root);
// …
dispose();
```

Avoid:

```javascript
root.appendChild(App()); // easy to leak effects
```

`mount` / `render` / `hydrate` create ownership roots and dispose the previous tree on the same container.

---

## 2. Clean up timers and listeners

```javascript
import { onMount, onCleanup } from "cachoujs";

onMount(() => {
  const onResize = () => { /* … */ };
  window.addEventListener("resize", onResize);
  const id = setInterval(tick, 1000);

  onCleanup(() => {
    window.removeEventListener("resize", onResize);
    clearInterval(id);
  });
});
```

---

## 3. Strict debug + leak asserts

```javascript
import { enableDebug, assertNoReactiveLeaks, mount } from "cachoujs";

enableDebug({ strict: true, slowEffectThresholdMs: 8 });

const dispose = mount(App, root);
dispose();
assertNoReactiveLeaks("after unmount");
```

Strict mode flags `onCleanup` / effects created outside an owner.

---

## 4. Race-safe server reads

`createResource` is race-safe by default:

```javascript
const [data, controls] = createResource(async ({ signal, requestId }) => {
  const res = await fetch(`/api/search?r=${requestId}`, { signal });
  return res.json();
});

controls.refetch(); // aborts previous; ignores stale responses
```

If you must hand-roll fetch:

```javascript
let requestId = 0;

async function search(query) {
  const id = ++requestId;
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (id !== requestId) return; // stale
  setResults(data);
}
```

Forms: async validation/submit also ignore stale completions — see [Use forms](./use-forms.md).

---

## 5. Interruptible heavy work

```javascript
import { scheduleTask, startTransition } from "cachoujs";

startTransition(() => {
  scheduleTask(async ({ signal, yieldNow }) => {
    for (const row of rows) {
      if (signal.aborted) return;
      index(row);
      await yieldNow();
    }
  }, { priority: "background" });
});
```

Newer transitions cancel older transition tasks by default. Details: [Schedule background work](./schedule-background-work.md).

---

## 6. List identity

Unstable keys cause “leaky” UX (wrong row state) even when memory is fine:

```javascript
// good
mapArray(items, renderRow, item => item.id, { uniqueKeys: true });

// bad for sortable data
mapArray(items, renderRow, (_, i) => i);
```

---

## 7. Watch slow effects

With debug enabled, effects slower than `slowEffectThresholdMs` log warnings. Move heavy work to:

- `memo` for pure derives  
- `createResource` for IO  
- `scheduleTask` for CPU batches  
- event handlers for one-shot work  

---

## Checklist

- [ ] UI created via `mount` / `render`  
- [ ] Every timer/listener has `onCleanup`  
- [ ] Async uses resource or sequence ids  
- [ ] Lists use stable keys  
- [ ] Tests call `assertNoReactiveLeaks` after unmount  
- [ ] Production builds do not leave debug strict mode on unintentionally  

## Next

- [Enable debug diagnostics](./enable-debug-diagnostics.md)
- [Run quality checks](./run-quality-checks.md)
