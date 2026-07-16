# Styling

Cachou ships a built-in CSS system that handles scoped styles, reactive bindings, theming, and animations without pulling in a third-party library. Everything lives in `cachoujs` — no extra install.

---

## Table of contents

1. [Scoped styles with `css`](#scoped-styles-with-css)
2. [Reactive CSS with signals](#reactive-css-with-signals)
3. [Binding CSS custom properties with `cssVar`](#binding-css-custom-properties-with-cssvar)
4. [Design tokens with `theme`](#design-tokens-with-theme)
5. [Global styles](#global-styles)
6. [Conditional classes with `cx`](#conditional-classes-with-cx)
7. [Animations with `keyframes`](#animations-with-keyframes)
8. [SFC scoped styles and `bind()`](#sfc-scoped-styles-and-bind)
9. [Putting it together: themed button component](#putting-it-together-themed-button-component)
10. [Theming a SaaS app](#theming-a-saas-app)

---

## Scoped styles with `css`

The `css` tagged template creates a `<style>` element, injects it into `<head>`, and returns a scoping class name. Use `.self` in your CSS to refer to the scoped class.

```javascript
import { css, html } from "cachoujs";

const buttonClass = css`
  .self {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    background: #3b82f6;
    color: white;
    cursor: pointer;
  }
  .self:hover {
    background: #2563eb;
  }
`;

function Button(props) {
  return html`<button class=${buttonClass}>${props.label}</button>`;
}
```

Every `.self` in the template gets replaced with a deterministic class name like `.c-a1b2c3`. Two components that use the same CSS text share the same class — no duplicates.

---

## Reactive CSS with signals

Pass a signal getter as an interpolation and Cachou sets up a reactive CSS custom property behind the scenes. When the signal changes, the style updates. No re-render.

```javascript
import { signal, css, html } from "cachoujs";

const [accent, setAccent] = signal("#3b82f6");

const cardClass = css`
  .self {
    border-left: 4px solid ${accent};
    padding: 16px;
    background: white;
  }
`;

function ColorPicker() {
  return html`
    <div class=${cardClass}>
      <p>Pick an accent color:</p>
      <input type="color" value=${accent} oninput=${e => setAccent(e.target.value)} />
    </div>
  `;
}
```

Under the hood, `${accent}` gets compiled to `var(--_cv0)` in the CSS text, and an effect keeps `--_cv0` in sync with the signal value on `document.documentElement`. This means you can use reactive values anywhere in your CSS — gradients, shadows, transforms, whatever.

---

## Binding CSS custom properties with `cssVar`

For more targeted control, `cssVar` binds a specific CSS custom property to a signal on a specific element. This is useful when you need the variable scoped to a container rather than `:root`.

```javascript
import { signal, cssVar, html, onMount } from "cachoujs";

const [progress, setProgress] = signal(0);

function ProgressBar() {
  let barEl;

  onMount(() => {
    cssVar("--progress", progress, barEl);
  });

  return html`
    <div ref=${el => barEl = el} style="
      width: calc(var(--progress) * 1%);
      height: 4px;
      background: #3b82f6;
      transition: width 0.3s;
    "></div>
  `;
}
```

`cssVar` returns a cleanup function if you need to remove the binding manually. If you omit the third argument, it defaults to `document.documentElement`.

You don't need the `--` prefix either — `cssVar("progress", getter)` and `cssVar("--progress", getter)` do the same thing.

---

## Design tokens with `theme`

`theme` takes a flat object of tokens and turns them into CSS custom properties prefixed with `--cachou-`. It returns an object with:

- `vars` — a map of token names to `var(--cachou-<name>)` strings you can use in your CSS
- `className` — a generated class to apply to a container
- `apply(el)` — shorthand for `el.classList.add(className)`

```javascript
import { theme, css, html } from "cachoujs";

const myTheme = theme({
  primary: "#3b82f6",
  primaryHover: "#2563eb",
  surface: "#ffffff",
  text: "#1e293b",
  radius: "6px",
  spacing: "8px",
  shadow: "0 2px 4px rgba(0,0,0,.1)"
});

const cardClass = css`
  .self {
    background: ${myTheme.vars.surface};
    color: ${myTheme.vars.text};
    border-radius: ${myTheme.vars.radius};
    padding: calc(${myTheme.vars.spacing} * 2);
    box-shadow: ${myTheme.vars.shadow};
  }
`;

function App() {
  return html`
    <div class=${myTheme.className}>
      <div class=${cardClass}>
        <h2>Dashboard</h2>
      </div>
    </div>
  `;
}
```

The theme class gets injected into `<head>` as a `<style>` block. Any element with that class (or inside one) picks up the custom properties through normal CSS inheritance.

---

## Global styles

`globalCSS` injects raw CSS once. Repeated calls with the same content are de-duplicated by hash, so you can call it from multiple components without worrying about duplicates.

```javascript
import { globalCSS } from "cachoujs";

globalCSS(`
  *, *::before, *::after {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    font-family: Inter, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  ::selection {
    background: #3b82f6;
    color: white;
  }
`);
```

Good for resets, font imports, and base styles you want everywhere.

---

## Conditional classes with `cx`

`cx` is a class name joiner, similar to `clsx`. It accepts strings, objects, arrays, and falsy values.

```javascript
import { signal, cx, html } from "cachoujs";

const [isActive, setActive] = signal(false);
const [size, setSize] = signal("md");

function Button(props) {
  return html`
    <button class=${() => cx(
      "btn",
      { active: isActive(), disabled: props.disabled },
      size() === "lg" && "btn-lg",
      size() === "sm" && "btn-sm"
    )}>
      ${props.label}
    </button>
  `;
}
```

Wrap it in an arrow function when the inputs are reactive, so the binding re-evaluates when signals change.

---

## Animations with `keyframes`

`keyframes` registers a `@keyframes` rule and returns the animation name. Duplicate registrations are skipped.

```javascript
import { keyframes, css, html } from "cachoujs";

const spin = keyframes("spin", {
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" }
});

const pulse = keyframes("pulse", {
  "0%": { opacity: "1" },
  "50%": { opacity: "0.5" },
  "100%": { opacity: "1" }
});

const spinnerClass = css`
  .self {
    width: 24px;
    height: 24px;
    border: 3px solid #e2e8f0;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
  }
`;

function Spinner() {
  return html`<div class=${spinnerClass}></div>`;
}
```

Frame values can be objects (camelCase keys get converted to kebab-case) or raw CSS strings:

```javascript
keyframes("slideIn", {
  from: "transform: translateX(-100%); opacity: 0",
  to: "transform: translateX(0); opacity: 1"
});
```

---

## SFC scoped styles and `bind()`

When you use `.cachou` single-file components, the compiler handles scoping automatically. Every component gets a unique scope attribute, and selectors in `<style>` are prefixed with it.

```html
<!-- Card.cachou -->
<script>
  import { signal } from "cachoujs";
  const [borderColor, setBorderColor] = signal("#3b82f6");
</script>

<template>
  <div class="card">
    <input type="color" value={borderColor()} oninput={e => setBorderColor(e.target.value)} />
    <p>This card has a reactive border.</p>
  </div>
</template>

<style>
  .card {
    padding: 16px;
    border: 2px solid bind(borderColor);
    border-radius: 8px;
  }
</style>
```

`bind(borderColor)` in the style block gets compiled to a reactive CSS custom property. The compiler generates code equivalent to calling `cssVar` — so when `borderColor` changes, the style updates without touching the DOM or re-rendering the component.

This works for any expression, not just signal names:

```css
.progress-bar {
  width: bind(progress() + '%');
  background: bind(isError() ? '#ef4444' : '#22c55e');
}
```

---

## Putting it together: themed button component

Here's a practical button component that uses themes, conditional classes, and keyframes together.

```javascript
import { signal, css, cx, keyframes, theme, html } from "cachoujs";

const btnTheme = theme({
  btnPrimary: "#3b82f6",
  btnPrimaryHover: "#2563eb",
  btnDanger: "#ef4444",
  btnDangerHover: "#dc2626",
  btnRadius: "6px",
  btnPadding: "8px 16px"
});

const ripple = keyframes("ripple", {
  "0%": { transform: "scale(0)", opacity: "0.5" },
  "100%": { transform: "scale(2.5)", opacity: "0" }
});

const btnClass = css`
  .self {
    position: relative;
    overflow: hidden;
    border: none;
    border-radius: var(--cachou-btnRadius);
    padding: var(--cachou-btnPadding);
    color: white;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }
  .self.primary {
    background: var(--cachou-btnPrimary);
  }
  .self.primary:hover {
    background: var(--cachou-btnPrimaryHover);
  }
  .self.danger {
    background: var(--cachou-btnDanger);
  }
  .self.danger:hover {
    background: var(--cachou-btnDangerHover);
  }
  .self.loading {
    opacity: 0.7;
    pointer-events: none;
  }
`;

function Button({ variant = "primary", loading = false, label, onClick }) {
  return html`
    <div class=${btnTheme.className}>
      <button
        class=${() => cx(btnClass, variant, { loading })}
        onclick=${onClick}
        disabled=${loading}
      >
        ${label}
      </button>
    </div>
  `;
}
```

---

## Theming a SaaS app

A common pattern: define a light and dark theme, swap between them with a signal.

```javascript
import { signal, theme, css, html, effect } from "cachoujs";

const lightTheme = theme({
  bg: "#ffffff",
  surface: "#f8fafc",
  text: "#1e293b",
  textMuted: "#64748b",
  border: "#e2e8f0",
  primary: "#3b82f6",
  sidebar: "#f1f5f9"
});

const darkTheme = theme({
  bg: "#0f172a",
  surface: "#1e293b",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  border: "#334155",
  primary: "#60a5fa",
  sidebar: "#1e293b"
});

const [isDark, setIsDark] = signal(false);

const shellClass = css`
  .self {
    min-height: 100vh;
    background: var(--cachou-bg);
    color: var(--cachou-text);
    transition: background 0.2s, color 0.2s;
  }
  .self .sidebar {
    width: 240px;
    background: var(--cachou-sidebar);
    border-right: 1px solid var(--cachou-border);
  }
  .self .card {
    background: var(--cachou-surface);
    border: 1px solid var(--cachou-border);
    border-radius: 8px;
    padding: 16px;
  }
`;

function App() {
  return html`
    <div class=${() => `${shellClass} ${isDark() ? darkTheme.className : lightTheme.className}`}>
      <button onclick=${() => setIsDark(d => !d)}>
        ${() => isDark() ? "Light mode" : "Dark mode"}
      </button>
      <div class="card">
        <p>Your SaaS dashboard content here.</p>
      </div>
    </div>
  `;
}
```

Both themes inject their CSS once. Swapping the class on the container switches every custom property instantly. No JavaScript runs to update individual styles — CSS inheritance does the work.

---

## Next steps

- [Transitions](./TRANSITIONS.md) — animate elements on mount/unmount
- [API reference](./API.md) — full signatures for all style utilities
- [Compiler](./COMPILER.md) — how `.cachou` SFC scoped styles work under the hood
