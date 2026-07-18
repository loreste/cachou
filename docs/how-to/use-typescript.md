# Use TypeScript with CachouJS

**Status:** runtime stays JavaScript; types ship as `.d.ts` (0.6+)

Related: [API](../API.md) · [STABILITY](../STABILITY.md) · [Install](./install-from-npm.md)

---

## Setup

```bash
npm install cachoujs
# optional: TypeScript in your app
npm install -D typescript
```

`tsconfig.json` (NodeNext / bundler resolution):

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "target": "ES2022"
  }
}
```

Import from the package root or typed subpaths:

```ts
import { signal, For, Show, createResource } from "cachoujs";
// or deep imports (also typed in 0.6+)
import { createForm } from "cachoujs/forms";
import { navigate, guard } from "cachoujs/router";
import type { Accessor, Signal, Component } from "cachoujs";
```

Browser-only apps:

```ts
import { mount, signal } from "cachoujs/browser";
```

---

## Core types

| Type | Meaning |
|------|---------|
| `Accessor<T>` | `() => T` reactive read |
| `MaybeAccessor<T>` | `T \| Accessor<T>` |
| `Signal<T>` | `[getter, setter]` pair |
| `CachouChild` | DOM / view tree node(s) |
| `Component<P>` | `(props: P) => CachouChild` |
| `MiddlewareHandler` | router `guard()` callback |

### Inference examples

```ts
const [count, setCount] = signal(0); // Signal<number>

const doubled = () => count() * 2; // number when called

For({
  each: () => items(), // items: Accessor<Todo[]>
  children: (item /* Todo */, i) => /* … */
});

Show({
  when: () => user(),
  children: (u /* User */) => /* … */,
  fallback: () => "Sign in"
});
```

---

## Subpath modules

Experimental kits (`auth`, `ui`, `i18n`, …) and core deep imports (`forms`, `router`, `flow`, …) declare `types` in `package.json` `exports`. Prefer:

```ts
import { createAuth } from "cachoujs/auth";
import { css, cx } from "cachoujs/styles";
```

If a subpath has no types yet (e.g. `devtools`, `files`), import from `"cachoujs"` or add ambient modules in your app.

---

## `.cachou` SFCs

The compiler **does not** type-check TypeScript in `<script>`. Simple annotations may strip; run `tsc` on generated or hand-written `.ts` modules for real checking.

---

## Limits

- No JSX transform — use `html` templates or function components returning DOM.
- Generics improve editor help; the runtime remains untyped JS.
- Stability of experimental subpaths is **not** covered by the same bar as core types — pin versions tightly.
