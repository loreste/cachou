# Enable Debug Diagnostics

Debug mode is **opt-in**. Use it locally (and in tests) to inspect the reactive graph, catch ownership mistakes, and listen to framework events.

Related: [Prevent leaks](./prevent-leaks-and-races.md), [API: Diagnostics](../API.md#diagnostics).

---

## Enable / disable

```javascript
import { enableDebug, disableDebug } from "cachoujs";

enableDebug({
  slowEffectThresholdMs: 8,
  strict: true
});

// …
disableDebug();
```

| Option | Meaning |
|--------|---------|
| `slowEffectThresholdMs` | Warn when an effect run exceeds this duration |
| `strict` | Warn/throw on patterns like cleanup outside an owner |

Debug mode records bookkeeping; keep it off in production builds unless diagnosing a specific issue.

---

## Snapshots

```javascript
import { getDebugSnapshot } from "cachoujs";

console.table(getDebugSnapshot());
```

Typical fields:

| Field | Meaning |
|-------|---------|
| `enabled` / `strict` | Flags |
| `signals` | Tracked signal count |
| `computations` / `liveComputations` | Effects/memos |
| `roots` / `liveRoots` | Ownership roots |
| `disposedComputations` / `disposedRoots` | Already disposed |
| `orphanComputations` | Live computations without an owner |

---

## Assert no leaks (tests)

```javascript
import { mount, assertNoReactiveLeaks, resetDebugState, enableDebug } from "cachoujs";

enableDebug({ strict: true });
resetDebugState();

const dispose = mount(App, root);
dispose();

assertNoReactiveLeaks("after unmount");
```

Fails if live roots or orphan computations remain. Call `resetDebugState()` between cases when needed.

---

## Framework events

```javascript
import { onFrameworkEvent, emitFrameworkEvent } from "cachoujs";

const stop = onFrameworkEvent(event => {
  console.log(event.type, event);
  // security-block, resource-error, resource-stale-response,
  // slow-effect, reactive-leak, debug-warning, error, …
});

emitFrameworkEvent({ type: "app-custom", detail: { route: "/x" } });

stop();
```

Use this for observability bridges (analytics, logging sinks) without hard-wiring the framework to your vendor SDK.

---

## Practical workflow

1. Enable debug + strict in local main.  
2. Reproduce the bug.  
3. `getDebugSnapshot()` before/after navigation.  
4. `assertNoReactiveLeaks` around mount/unmount in a unit or browser test.  
5. Watch for `slow-effect` and `security-block` events.  

## Next

- [Prevent leaks and races](./prevent-leaks-and-races.md)
- [Run quality checks](./run-quality-checks.md)
