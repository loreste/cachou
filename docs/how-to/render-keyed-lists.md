# Render Keyed Lists

Use `mapArray` for dynamic lists. Always pass a **stable key** when items have IDs so DOM nodes move instead of thrash.

Related: [Templates](./use-templates-and-directives.md), [Resources](./use-resources.md), [API](../API.md#lists).

---

## Basic list (index identity)

```javascript
import { html, mapArray, signal } from "cachoujs";

const [items, setItems] = signal(["A", "B", "C"]);

const view = html`
  <ul>
    ${mapArray(items, item => html`<li>${item}</li>`)}
  </ul>
`;
```

Fine for static/append-only toy lists. **Do not** use bare index identity for sortable or filterable data.

---

## Keyed list (recommended)

```javascript
const [todos, setTodos] = signal([
  { id: 1, text: "Write docs", done: false },
  { id: 2, text: "Ship", done: false }
]);

const view = html`
  <ul>
    ${mapArray(
      todos,
      todo => html`
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
      `,
      todo => todo.id,
      { uniqueKeys: true }
    )}
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
| Rebuilding full arrays of DOM without `mapArray` | Loses moves / harder cleanup |

---

## Next

- [Use resources](./use-resources.md)
- [Prevent leaks and races](./prevent-leaks-and-races.md)
