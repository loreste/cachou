# Use Templates and Directives

How to write `html` templates in day-to-day UI work. Full reference: [Templates](../TEMPLATES.md).

---

## Basics

```javascript
import { html, signal } from "cachoujs";

const [label, setLabel] = signal("Save");

const button = html`
  <button type="button" class="primary" onclick=${() => setLabel("Saved")}>
    ${() => label()}
  </button>
`;
```

- Template strings are **cached** by identity — keep `html\`...\`` as a stable expression site.
- Dynamic **children** should be functions: `${() => value()}`.
- Static text can be plain strings in the markup.

---

## Events

```javascript
html`
  <form onsubmit=${e => { e.preventDefault(); save(); }}>
    <input oninput=${e => setText(e.target.value)} />
    <button type="submit">Save</button>
  </form>
`;
```

Common events (`click`, `input`, `change`, `keydown`, …) are **delegated** on `document`. Others use per-node listeners and clean up with the node.

Each DOM event handler runs inside one synchronous reactive transaction. Multiple
signal or store writes from the same handler are coalesced and committed before
the event dispatch returns; use `batch()` explicitly when coordinating work
outside an event handler.

---

## Attributes and properties

```javascript
html`
  <img src=${() => url()} alt="Preview" />
  <input disabled=${() => !ready()} value=${() => text()} />
  <div .scrollTop=${() => scroll()}>…</div>
`;
```

- `value` / `checked` / `disabled` often map to DOM **properties**.
- Prefix `.name` to force a property write.
- URL attributes (`href`, `src`, …) are sanitized — `javascript:` is blocked.

---

## Class and style toggles

```javascript
html`
  <div
    class:active=${() => isActive()}
    class:busy=${() => loading()}
    style:opacity=${() => (loading() ? "0.5" : "1")}
  >
    …
  </div>
`;
```

Prefer `class:` over rebuilding full class strings. Inline styles can be disabled via security policy — see [Configure security](./configure-security-policy.md).

---

## Two-way bind

```javascript
const [text, setText] = signal("");
const [done, setDone] = signal(false);

html`
  <input bind:value=${[text, setText]} />
  <input type="checkbox" bind:checked=${[done, setDone]} />
`;
```

### `model` (0.4 shorthand)

```javascript
html`
  <input model=${[text, setText]} />
  <textarea model=${[notes, setNotes]}></textarea>
`;
```

`model` wires value + input for common form controls. Prefer it for new code; `bind:` remains supported.

---

## Custom directives (`use:`, 0.4)

```javascript
import { directive, html, signal } from "cachoujs";

directive("tooltip", (el, accessor) => {
  const update = () => {
    el.title = typeof accessor === "function" ? accessor() : accessor;
  };
  update();
  // return a cleanup if you attach listeners
});

html`<button use:tooltip=${() => "Save changes"}>Save</button>`;
```

Register once at app start. Directives receive the element and the reactive value (function or static).

---

## Refs

```javascript
let inputEl;

html`
  <input
    ref=${el => {
      inputEl = el;
    }}
  />
`;

// focus later
inputEl?.focus();
```

If you store refs on a global/module, clear them in `onCleanup`.

---

## Conditionals and fragments

```javascript
html`
  <div>
    ${() =>
      loading()
        ? html`<span>Loading…</span>`
        : error()
          ? html`<span role="alert">${error().message}</span>`
          : html`<span>${data()}</span>`}
  </div>
`;
```

---

## Nested components

```javascript
function Badge(props) {
  return html`<span class="badge">${props.children}</span>`;
}

html`
  <h1>
    Title ${Badge({ children: "New" })}
  </h1>
`;
```

---

## `.cachou` brace syntax

In SFCs, write JSX-like braces; the compiler rewrites them:

```html
<button onclick={() => setN(n() + 1)}>{n()}</button>
```

See [Work with `.cachou` files](./work-with-cachou-files.md).

---

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `${count}` never updates | `${() => count()}` |
| Building HTML with strings | Use `html` / `trustedHTML` (sanitized only) |
| Index keys on sortable lists | Stable ids with `For` / `mapArray` |
| `javascript:` hrefs | Use `onclick` + `navigate` / buttons |

## Next

- [Render keyed lists](./render-keyed-lists.md)
- [Create a component](./create-a-component.md)
- [Use 0.4 framework APIs](./use-0.4-framework-apis.md)
