# Render Keyed Lists

Use **`For`** (0.4, recommended) or **`mapArray`** for dynamic lists. Always pass a **stable key** when items have IDs so DOM nodes move instead of thrash. Use **`Index`** when identity is by position (fixed slots).

Related: [Templates](./use-templates-and-directives.md), [Resources](./use-resources.md), [0.4 APIs](./use-0.4-framework-apis.md), [API](../API.md#lists).

---

## `For` (recommended in 0.4)

```javascript
import { html, For, signal } from "cachoujs";

const [todos, setTodos] = signal([
  { id: 1, text: "Write docs", done: false },
  { id: 2, text: "Ship", done: false }
]);

const view = html`
  <ul>
    ${For({
      each: todos,
      by: todo => todo.id,
      children: todo => html`
        <li>
          <label>
            <input
              type="checkbox"
              checked=${() => todo.done}
              onchange=${e => toggle(todo.id, e.target.checked)}
            />
            ${() => todo.text}
          </label>
        </li>
      `
    })}
  </ul>
`;

function toggle(id, done) {
  setTodos(list => list.map(t => (t.id === id ? { ...t, done } : t)));
}
```

Keys let CachouJS:

- Move existing row DOM on reorder  
- Dispose only removed keys  
- Create only new keys  

### `Index` (position-stable)

```javascript
import { Index, signal, html } from "cachoujs";

const [rows] = signal(["a", "b", "c"]);

html`
  <ol>
    ${Index({
      each: rows,
      children: (item, i) => html`<li>${() => item()} @ ${i}</li>`
    })}
  </ol>
`;
```

`item` is an accessor that updates when the value at that index changes (row DOM stays put).

---

## `mapArray` (lower-level)

```javascript
import { html, mapArray, signal } from "cachoujs";

const [items, setItems] = signal(["A", "B", "C"]);

// Index identity — fine only for static/append-only toy lists
html`<ul>${mapArray(items, item => html`<li>${item}</li>`)}</ul>`;

// Keyed (same behavior as For)
html`
  <ul>
    ${mapArray(
      todos,
      todo => html`<li>${() => todo.text}</li>`,
      todo => todo.id,
      { uniqueKeys: true }
    )}
  </ul>
`;
```

**Do not** use bare index identity for sortable or filterable data.  

---

## Fresh API objects, same keys

When a refetch returns **new object instances** with the same ids, keyed rows can update in place. Read fields through functions if they must react to patched row objects:

```javascript
const [users] = createResource(fetchUsers);

const rows = mapArray(
  () => users() || [],
  user => html`
    <tr>
      <td>${() => user.name}</td>
      <td>${() => user.email}</td>
    </tr>
  `,
  user => user.id
);
```

---

## Immutable / benchmark hot path

When rows are immutable, every key is unique, and you do not need in-place field patching:

```javascript
const rows = mapArray(
  users,
  user => html`
    <tr>
      <td>${user.name}</td>
      <td>${user.email}</td>
    </tr>
  `,
  user => user.id,
  { reactiveItems: false, uniqueKeys: true }
);
```

| Option | Use when |
|--------|----------|
| `uniqueKeys: true` | You guarantee no duplicate keys (faster) |
| `reactiveItems: false` | Items are immutable snapshots |

For immutable keyed lists, keep the array identity stable between reads when
the contents have not changed. `mapArray` can then reuse the mapped result;
publish a new array for any list change.

---

## Empty, loading, and errors

```javascript
html`
  <section>
    ${() => {
      if (loading()) return html`<p>Loading…</p>`;
      if (error()) return html`<p role="alert">${error().message}</p>`;
      const list = items() || [];
      if (list.length === 0) return html`<p>No items</p>`;
      return html`
        <ul>
          ${mapArray(list, item => html`<li>${item.name}</li>`, i => i.id, {
            uniqueKeys: true
          })}
        </ul>
      `;
    }}
  </section>
`;
```

---

## Avoid

| Pattern | Why |
|---------|-----|
| `keyFn: (_, i) => i` on reorderable lists | Rows “change identity” when sorted |
| Duplicate keys with `uniqueKeys: true` | Incorrect reuse |
| Rebuilding full arrays of DOM without `For` / `mapArray` | Loses moves / harder cleanup |

---

## Next

- [Use resources](./use-resources.md)
- [Use 0.4 framework APIs](./use-0.4-framework-apis.md)
- [Prevent leaks and races](./prevent-leaks-and-races.md)
