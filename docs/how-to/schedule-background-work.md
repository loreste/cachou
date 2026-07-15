# Schedule Background Work

Use the cooperative scheduler for expensive work that should not block typing or animations.

Related: [Prevent leaks and races](./prevent-leaks-and-races.md), [API: Scheduler](../API.md#scheduler).

---

## `scheduleTask`

```javascript
import { scheduleTask, yieldNow, configureScheduler } from "cachoujs";

configureScheduler({ budgetMs: 5 });

const task = scheduleTask(
  async ({ signal, shouldYield, yieldNow, priority }) => {
    for (const row of bigList) {
      if (signal.aborted) return;
      indexRow(row);
      if (shouldYield()) await yieldNow();
    }
    return "done";
  },
  { priority: "background" }
);

task.finished.then(result => console.log(result));
task.cancel();
```

### Priorities

| Input | Normalized |
|-------|------------|
| `userBlocking`, `user-blocking`, `high` | `userBlocking` |
| `normal` (default) | `normal` |
| `background`, `low` | `background` |
| `idle` | `idle` |

Higher-priority work is preferred when the frame budget elapses.

### Task fields

- `status`: `queued` | `running` | `completed` | `cancelled` | `failed`  
- `cancelled`, `signal`, `finished`, `cancel()`  

Pass an external `AbortSignal` via `options.signal` to cancel from parent scopes.

---

## Transitions

Mark UI updates that may be interrupted when newer work supersedes them:

```javascript
import { startTransition, useTransition, scheduleTask } from "cachoujs";

// imperative
startTransition(() => {
  setFilter(next);
  scheduleTask(() => recomputeVisibleRows(), { priority: "background" });
});

// with pending flag
const [pending, start] = useTransition();

html`
  <button
    type="button"
    disabled=${() => pending()}
    onclick=${() => start(() => setTab("reports"))}
  >
    ${() => (pending() ? "Loading…" : "Reports")}
  </button>
`;
```

By default a new transition cancels previous transition tasks (`cancelPrevious: false` to keep them).

---

## When to use what

| Work | Tool |
|------|------|
| Server fetch | `createResource` |
| Pure derive from signals | `memo` |
| Long CPU loop | `scheduleTask` + `yieldNow` |
| Navigating / filter that can be superseded | `startTransition` |
| DOM binding updates | signals + `html` (not the scheduler) |

---

## Next

- [Prevent leaks and races](./prevent-leaks-and-races.md)
- [Use resources](./use-resources.md)
