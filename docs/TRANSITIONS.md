# Transitions

Cachou includes built-in transition primitives that use the Web Animations API. They handle mount/unmount animations, FLIP-style swap animations, and custom transitions — all without CSS class juggling.

---

## Table of contents

1. [Built-in transitions](#built-in-transitions)
2. [The `transition` directive](#the-transition-directive)
3. [Swap (FLIP animations)](#swap-flip-animations)
4. [Custom transitions with `defineTransition`](#custom-transitions-with-definetransition)
5. [Easing functions](#easing-functions)
6. [Real-world examples](#real-world-examples)

---

## Built-in transitions

Every transition function takes a DOM node and an options object. It returns `{ enter(), leave(), destroy() }`. Both `enter()` and `leave()` return `{ finished: Promise, cancel() }`.

### `fade`

Opacity from 0 to 1 on enter, 1 to 0 on leave.

```javascript
import { fade } from "cachoujs";

const t = fade(myElement, { duration: 200, easing: easeOut });
t.enter();  // fade in
t.leave();  // fade out
```

### `slide`

Slides the element using height (default) or width, with overflow hidden. Good for accordions and expandable sections.

```javascript
import { slide } from "cachoujs";

const t = slide(myElement, { duration: 300, axis: "y" }); // "x" for horizontal
t.enter();
```

### `fly`

Translate + opacity. The element flies in from an offset position.

```javascript
import { fly } from "cachoujs";

// Fly in from 20px above (default)
const t = fly(myElement, { x: 0, y: -20, duration: 300 });
t.enter();

// Fly in from the right
const t2 = fly(myElement, { x: 100, y: 0, duration: 400 });
t2.enter();
```

### `scale`

Scale transform + opacity. The element grows in from a starting scale.

```javascript
import { scale } from "cachoujs";

const t = scale(myElement, { start: 0.8, duration: 200 });
t.enter();
```

### Common options

All built-in transitions accept:

| Option | Default | Description |
|--------|---------|-------------|
| `duration` | `300` | Animation duration in ms |
| `delay` | `0` | Delay before start |
| `easing` | `easeOut` | Easing function |
| `onStart` | — | Called when animation starts |
| `onEnd` | — | Called when animation finishes |

---

## The `transition` directive

The `transition` function works as a `use:` directive. It runs `enter()` on mount and registers a `leave()` hook for `removeNodeWithTransition`.

```javascript
import { html, transition, fade, fly } from "cachoujs";

// Fade in when this element mounts
html`<div use:transition=${[fade, { duration: 200 }]}>Hello</div>`;

// Fly in from below
html`<div use:transition=${[fly, { y: 30, duration: 400 }]}>Content</div>`;
```

When the element is removed via Cachou's DOM reconciler, the leave animation plays before the node is actually detached. This is what makes list item removal and route changes animate smoothly.

---

## Swap (FLIP animations)

`swap` creates a `[send, receive]` pair for animating elements between two locations. Think of a todo item moving from "active" to "done" — the element appears to fly from one list to the other.

```javascript
import { swap, html, signal, mapArray } from "cachoujs";

const [send, receive] = swap({ duration: 400 });

const [todos, setTodos] = signal([
  { id: 1, text: "Write docs", done: false },
  { id: 2, text: "Ship 0.5", done: false },
  { id: 3, text: "Fix bugs", done: true }
]);

function toggle(id) {
  setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
}

function TodoApp() {
  const active = () => todos().filter(t => !t.done);
  const done = () => todos().filter(t => t.done);

  return html`
    <div>
      <h2>Active</h2>
      <ul>
        ${mapArray(active, todo => {
          const el = html`<li onclick=${() => toggle(todo.id)}>${todo.text}</li>`;
          receive(el, { key: todo.id });
          return el;
        }, t => t.id)}
      </ul>
      <h2>Done</h2>
      <ul>
        ${mapArray(done, todo => {
          const el = html`<li onclick=${() => toggle(todo.id)}>${todo.text}</li>`;
          send(el, { key: todo.id });
          return el;
        }, t => t.id)}
      </ul>
    </div>
  `;
}
```

Elements are matched by the `key` you pass to `send`/`receive`. If no match is found (because the counterpart hasn't rendered yet), the `fallback` transition runs instead. By default that's a fade.

```javascript
const [send, receive] = swap({
  duration: 300,
  easing: easeInOut,
  fallback: (node) => scale(node, { start: 0.9, duration: 200 })
});
```

---

## Custom transitions with `defineTransition`

When the built-ins don't cover your use case, `defineTransition` lets you define enter and leave functions from scratch.

```javascript
import { defineTransition } from "cachoujs";

const blur = defineTransition(
  // enter
  (node, opts) => {
    const duration = opts.duration || 300;
    const anim = node.animate(
      [
        { filter: "blur(10px)", opacity: 0 },
        { filter: "blur(0px)", opacity: 1 }
      ],
      { duration, fill: "both", easing: "ease-out" }
    );
    return {
      finished: anim.finished.then(() => anim.cancel()),
      cancel: () => anim.cancel()
    };
  },
  // leave
  (node, opts) => {
    const duration = opts.duration || 300;
    const anim = node.animate(
      [
        { filter: "blur(0px)", opacity: 1 },
        { filter: "blur(10px)", opacity: 0 }
      ],
      { duration, fill: "both", easing: "ease-in" }
    );
    return {
      finished: anim.finished.then(() => anim.cancel()),
      cancel: () => anim.cancel()
    };
  }
);

// Use it like any built-in transition
const t = blur(myElement, { duration: 400 });
t.enter();
```

The factory returns a function with the same `{ enter, leave, destroy }` shape as the built-ins, so it works with the `transition` directive too:

```javascript
html`<div use:transition=${[blur, { duration: 300 }]}>Content</div>`;
```

---

## Easing functions

Cachou ships these easing functions. They map to CSS equivalents when possible, and fall back to computed keyframes for custom curves.

```javascript
import { linear, easeIn, easeOut, easeInOut, cubicBezier } from "cachoujs";
```

| Function | CSS equivalent | Curve |
|----------|---------------|-------|
| `linear` | `linear` | Constant speed |
| `easeIn` | `ease-in` | Starts slow, accelerates |
| `easeOut` | `ease-out` | Starts fast, decelerates |
| `easeInOut` | `ease-in-out` | Slow start and end |
| `cubicBezier(x1, y1, x2, y2)` | — | Custom bezier curve |

```javascript
import { cubicBezier, fade } from "cachoujs";

const snappy = cubicBezier(0.68, -0.55, 0.265, 1.55);
fade(el, { easing: snappy, duration: 400 });
```

When a built-in easing maps to a CSS string, Cachou passes it directly to the Web Animations API. For custom easing functions (including `cubicBezier`), it generates intermediate keyframes at ~60fps so the curve is respected.

---

## Real-world examples

### Modal open/close

```javascript
import { signal, html, scale, easeOut } from "cachoujs";

const [showModal, setShowModal] = signal(false);

function Modal() {
  return html`
    ${() => {
      if (!showModal()) return null;

      const backdrop = html`<div class="backdrop" onclick=${() => setShowModal(false)}></div>`;
      const dialog = html`
        <div class="modal-content">
          <h2>Confirm action</h2>
          <p>Are you sure you want to proceed?</p>
          <button onclick=${() => setShowModal(false)}>Close</button>
        </div>
      `;

      const t = scale(dialog, { start: 0.9, duration: 200, easing: easeOut });
      t.enter();

      return html`<div class="modal-overlay">${backdrop}${dialog}</div>`;
    }}
  `;
}
```

### List item add/remove

```javascript
import { signal, html, mapArray, fly, transition, easeOut } from "cachoujs";

const [items, setItems] = signal([]);
let nextId = 1;

function addItem() {
  setItems(prev => [...prev, { id: nextId++, text: `Item ${nextId}` }]);
}

function removeItem(id) {
  setItems(prev => prev.filter(i => i.id !== id));
}

function AnimatedList() {
  return html`
    <div>
      <button onclick=${addItem}>Add item</button>
      <ul>
        ${mapArray(items, item => {
          return html`
            <li use:transition=${[fly, { y: -10, duration: 200 }]}>
              ${item.text}
              <button onclick=${() => removeItem(item.id)}>Remove</button>
            </li>
          `;
        }, i => i.id)}
      </ul>
    </div>
  `;
}
```

### Page transitions with the router

```javascript
import { Router, Route, html, fade, transition } from "cachoujs";

function PageWrapper(Component) {
  return (params) => {
    const el = html`
      <div class="page" use:transition=${[fade, { duration: 250 }]}>
        ${Component(params)}
      </div>
    `;
    return el;
  };
}

Router({
  children: [
    Route({ path: "/", component: PageWrapper(Home) }),
    Route({ path: "/about", component: PageWrapper(About) }),
    Route({ path: "/blog/:slug", component: PageWrapper(BlogPost) })
  ]
});
```

---

## Next steps

- [Styling](./STYLING.md) — scoped CSS, themes, and `keyframes`
- [API reference](./API.md) — full transition signatures
