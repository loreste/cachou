# Templates & Directives

CachouJS renders UI with the `html` tagged template. Templates are compiled once (cached by template strings identity) and bound with fine-grained effects.

```javascript
import { html, signal } from "cachoujs";

const [label, setLabel] = signal("Save");

const el = html`
  <button class="primary" onclick=${() => setLabel("Saved")}>
    ${() => label()}
  </button>
`;
```

In `.cachou` files, `{expression}` is compiled to `${expression}` inside an `html` template. See [Compiler](./COMPILER.md).

---

## Children (text and nodes)

| Value | Behavior |
|-------|----------|
| `string` / `number` / `boolean` | Text node (escaped on SSR) |
| `null` / `undefined` / `false` | Nothing |
| `HTMLElement` / `Node` | Inserted as-is |
| `Array` | Flattened and inserted |
| `function` | Reactive: re-run when dependencies change |
| `signal getter` used as child | Treated as a function read |
| `trustedHTML(...)` | Raw HTML (explicit; not escaped) |

```javascript
html`<p>${() => count()}</p>`
html`<div>${() => show() ? Child() : null}</div>`
html`<ul>${mapArray(items, item => html`<li>${item.name}</li>`, i => i.id)}</ul>`
```

Static compiler output may use `htmlStatic(markup)` for templates with no expressions.

---

## Attributes and properties

### Plain attributes

```javascript
html`<img src=${() => url()} alt=${"photo"} />`
html`<input disabled=${() => !ready()} />`
```

Special cases:

- `value`, `checked`, `disabled` are applied as **DOM properties** when appropriate.
- Prefix with `.` to force a property: `.value=${...}`, `.scrollTop=${...}`.

### URL attributes

`href`, `src`, `srcset`, `action`, `formaction`, and `xlink:href` are sanitized. Disallowed protocols are blocked and emit a `security-block` framework event.

Allowed by default: `http:`, `https:`, `mailto:`, `tel:`, `blob:`, `data:` (with allowed MIME prefixes). Relative URLs and `#` fragments are allowed.

### `class:` toggles

```javascript
html`<div class:active=${() => isActive()} class:busy=${loading}>…</div>`
```

Adds/removes the class name based on truthiness.

### `style:` properties

```javascript
html`<div style:color=${() => color()} style:opacity=${() => opacity()}>…</div>`
```

Values are sanitized (blocks `javascript:` and `expression(`). If `allowInlineStyles` is `false` in the security policy, inline styles are blocked.

### `ref`

```javascript
let inputEl;
html`<input ref=${el => { inputEl = el; }} />`
// or
html`<input ref=${setNode} />`
```

Called with the element when bound. Use `onCleanup` if you store global references.

### `bind:` two-way

```javascript
const [text, setText] = signal("");
// Pass the signal tuple or compatible getter/setter pair:
html`<input bind:value=${[text, setText]} />`
html`<input type="checkbox" bind:checked=${[done, setDone]} />`
```

### `transition`

```javascript
html`<div transition=${{
  enter(el, done) { /* animate in */ done(); },
  leave(el, done) { /* animate out */ done(); }
}}>…</div>`
```

Used when nodes are removed via framework cleanup paths (`removeNodeWithTransition`).

### Events

```javascript
html`<button onclick=${() => save()}>Save</button>`
html`<input oninput=${e => setText(e.target.value)} />`
```

Common events are **delegated** on `document` for efficiency: `click`, `dblclick`, `input`, `change`, `keydown`, `keyup`, `keypress`, `mousedown`, `mouseup`, `mouseover`, `mouseout`, `touchstart`, `touchend`.

Other events use direct `addEventListener` on the node and are cleaned up with the node.

Handler values may be reactive (effect reassigns the handler when dependencies change).

---

## Conditional rendering

```javascript
html`
  <div>
    ${() => loading() ? html`<span>Loading…</span>` : html`<span>${data()}</span>`}
  </div>
`
```

Prefer returning `null` rather than empty strings when removing nodes entirely.

---

## Components as functions

```javascript
function Card(props) {
  return html`
    <article>
      <h2>${props.title}</h2>
      ${props.children}
    </article>
  `;
}

html`${Card({ title: "Hi", children: html`<p>Body</p>` })}`
```

There is no special JSX transform for function components outside `.cachou` / manual composition. Call components as functions and pass props objects.

---

## SSR behavior

On the server (or when `__MOCK_SSR__` is set in tests):

- Dynamic text and attributes are **escaped** by default.
- `trustedHTML` inserts raw markup intentionally.
- `htmlStatic` returns a safe markup wrapper string path.

See [Guide: SSR](./GUIDE.md#ssr-and-hydration) and [Security](./SECURITY.md).

---

## Performance notes

- Template string objects are cached in a `WeakMap` — reuse the same `html\`...\`` site; do not build template strings dynamically.
- Prefer `mapArray` over mapping to arrays of nodes manually when lists change often.
- Use `htmlStatic` (or compiler static path) for pure static markup.
- Avoid putting large pure computations inside every child function; use `memo` when needed.

---

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `${count}` without calling / reactive wrapper | Use `${() => count()}` or ensure the binding tracks |
| Building HTML with string concatenation | Use `html` or `trustedHTML` only with sanitized content |
| `javascript:` links | Blocked by policy; use real routes or handlers |
| Forgetting keys on lists | Pass `keyFn` to `mapArray` |
| Creating effects outside roots in strict debug | Wrap with `createRoot` / `mount` |
