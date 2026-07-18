# Create a Component

CachouJS components are **functions**. Setup runs once; reactive bindings update the DOM without re-running the whole function.

Related: [Templates](./use-templates-and-directives.md), [Manage state](./manage-state.md), [Framework APIs](./use-framework-apis.md) (`splitProps` / `Dynamic`), [`.cachou` files](./work-with-cachou-files.md).

---

## Function component

```javascript
import { html, signal } from "cachoujs";

export function Counter() {
  const [count, setCount] = signal(0);

  return html`
    <button type="button" onclick=${() => setCount(value => value + 1)}>
      Count: ${() => count()}
    </button>
  `;
}
```

**Important:** use `${() => count()}` (or another reactive function) for dynamic children. A bare `${count}` without calling/tracking will not update.

---

## Mount and unmount

```javascript
import { mount, unmount } from "cachoujs";
import { Counter } from "./Counter.js";

const root = document.getElementById("app");
const dispose = mount(Counter, root);

// later
dispose();
// or
unmount(root);
```

`mount` creates a reactive **root**, owns effects/cleanups, and returns a disposer. Prefer `mount` over `root.appendChild(Component())`.

---

## Props

Pass a plain object. For reactive values, pass **getters** (or signal getters) so the child can re-read them inside bindings:

```javascript
function StatCard(props) {
  return html`
    <section class="stat">
      <h2>${() => props.title}</h2>
      <strong>${() =>
        typeof props.value === "function" ? props.value() : props.value
      }</strong>
    </section>
  `;
}

// parent
const [users, setUsers] = signal(0);

StatCard({
  title: "Active users",
  value: users // signal getter works as a function
});
```

Children / slots are just props:

```javascript
function Card(props) {
  return html`
    <article>
      <header>${props.title}</header>
      <div class="body">${props.children}</div>
    </article>
  `;
}

Card({
  title: "Notes",
  children: html`<p>Body content</p>`
});
```

There is no special JSX transform outside `.cachou` — call components as functions.

---

## Lifecycle and cleanup

```javascript
import { html, onMount, onCleanup, signal } from "cachoujs";

function Clock() {
  const [now, setNow] = signal(new Date().toLocaleTimeString());

  onMount(() => {
    const id = setInterval(() => {
      setNow(new Date().toLocaleTimeString());
    }, 1000);
    onCleanup(() => clearInterval(id));
  });

  return html`<time>${() => now()}</time>`;
}
```

Rules of thumb:

- Pair every `setInterval` / `addEventListener` with `onCleanup`.
- Create effects under `mount` / `createRoot` so disposal is automatic.
- In strict debug mode, cleanup outside an owner warns/throws.

See [Prevent leaks and races](./prevent-leaks-and-races.md).

---

## Conditional UI

```javascript
function Panel(props) {
  const [open, setOpen] = signal(true);

  return html`
    <div>
      <button type="button" onclick=${() => setOpen(v => !v)}>
        Toggle
      </button>
      ${() => (open() ? html`<div class="body">${props.children}</div>` : null)}
    </div>
  `;
}
```

Return `null` to remove nodes; prefer that over leaving empty placeholders when the whole block should go away.

---

## Compose with lists and resources

```javascript
import { mapArray, createResource, html } from "cachoujs";

function UserList() {
  const [users, { loading, error }] = createResource(async ({ signal }) => {
    const res = await fetch("/api/users", { signal });
    return res.json();
  });

  return html`
    <section>
      ${() => (loading() ? html`<p>Loading…</p>` : "")}
      ${() => (error() ? html`<p role="alert">${error().message}</p>` : "")}
      <ul>
        ${mapArray(
          () => users() || [],
          user => html`<li>${user.name}</li>`,
          user => user.id,
          { uniqueKeys: true }
        )}
      </ul>
    </section>
  `;
}
```

---

## Single-file components

For HTML + scoped CSS + script in one file, use `.cachou` — see [Work with `.cachou` files](./work-with-cachou-files.md) and [Compiler](../COMPILER.md).

---

## Checklist

- [ ] Component is a function that returns `html` / DOM  
- [ ] Dynamic children use `${() => …}`  
- [ ] Mounted via `mount` / `render`  
- [ ] Timers and listeners cleaned up  
- [ ] Lists use `mapArray` with stable keys  

## Next

- [Manage state](./manage-state.md)
- [Use templates and directives](./use-templates-and-directives.md)
- [Render keyed lists](./render-keyed-lists.md)
