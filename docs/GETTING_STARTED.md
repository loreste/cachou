# Get Started with CachouJS

**CachouJS** is a fine-grained reactive JavaScript UI library: components set up once, and **signals** update the DOM directly (no virtual DOM).

| | |
|--|--|
| **npm** | [`cachoujs`](https://www.npmjs.com/package/cachoujs) |
| **GitHub** | [github.com/loreste/cachou](https://github.com/loreste/cachou) |
| **Version** | 0.3.x (experimental 0.x) |

This page takes you from zero to a running app, then the first concepts you’ll use every day.

---

## What you need

- **Node.js 20+**
- **npm** (or pnpm / yarn)
- A browser

Optional later:

- [Vite](https://vitejs.dev/) for a modern dev server (recommended)
- [VS Code / Cursor extension](../vscode-cachou/README.md) for `.cachou` files

---

## Path A — New project in 1 minute (recommended)

Scaffold a Vite app with routes already set up:

```bash
npx @cachoujs/create my-app
cd my-app
npm install
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**).

You get:

- Home / About / dynamic user routes under `src/routes/`
- `cachoujs` installed and ready
- Optional place for `.cachou` components (`src/components/`)

Stop with `Ctrl+C`.

If `npx @cachoujs/create` cannot resolve the package, try:

```bash
npx --package=cachoujs create-cachou my-app
```

---

## Path B — Add Cachou to an existing app

```bash
npm install cachoujs
```

### 1. Create an entry file

`src/main.js`:

```js
import { signal, html, mount } from "cachoujs";

function App() {
  const [count, setCount] = signal(0);

  return html`
    <main style="font-family: system-ui; padding: 2rem">
      <h1>Hello CachouJS</h1>
      <button type="button" onclick=${() => setCount(c => c + 1)}>
        Count: ${() => count()}
      </button>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

### 2. HTML shell

`index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Cachou app</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

### 3. Run with Vite (recommended)

```bash
npm install -D vite
```

`package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

```bash
npm run dev
```

---

## Path C — Clone this repository (contributors / demos)

```bash
git clone https://github.com/loreste/cachou.git
cd cachou
npm install
npm run dev
```

| URL | What |
|-----|------|
| http://localhost:5173/demo | Framework demo |
| http://localhost:5173/examples/ | Copy-paste examples |
| http://localhost:5173/tests/ | Browser tests page |

```bash
npm run crm:demo    # larger CRM showcase
npm run test:unit   # Node unit tests
```

---

## Core ideas (5 minutes)

### 1. Signals hold state

```js
import { signal } from "cachoujs";

const [count, setCount] = signal(0);

count();           // read → 0
setCount(1);       // write
setCount(n => n + 1); // update from previous
```

### 2. Components run **once**

Unlike React, the component function is **not** re-executed on every change. Setup (creating signals, wiring effects) runs once; the DOM updates through reactive bindings.

### 3. Templates use `html` and reactive functions

Dynamic text and attributes should be functions so Cachou can track dependencies:

```js
import { html, signal } from "cachoujs";

const [name, setName] = signal("Ada");

// ✅ updates when name changes
html`<p>Hello ${() => name()}</p>`

// ❌ usually will NOT update
html`<p>Hello ${name()}</p>`
```

Events:

```js
html`<button type="button" onclick=${() => setName("Grace")}>Rename</button>`
```

### 4. Mount into the page

```js
import { mount } from "cachoujs";

const dispose = mount(App, document.getElementById("app"));
// later: dispose() to unmount and clean up
```

### 5. Lists need keys

```js
import { mapArray, html, signal } from "cachoujs";

const [items, setItems] = signal([
  { id: 1, text: "One" },
  { id: 2, text: "Two" }
]);

html`
  <ul>
    ${mapArray(
      items,
      item => html`<li>${() => item.text}</li>`,
      item => item.id,
      { uniqueKeys: true }
    )}
  </ul>
`
```

### 6. Async data with resources

```js
import { createResource, html } from "cachoujs";

const [data, { loading, error, refetch }] = createResource(async ({ signal }) => {
  const res = await fetch("/api/items", { signal });
  return res.json();
});

html`
  <div>
    ${() => (loading() ? "Loading…" : "")}
    ${() => (error() ? error().message : "")}
    ${() => JSON.stringify(data() || [])}
  </div>
`
```

---

## Optional: `.cachou` single-file components

```html
<!-- src/components/Counter.cachou -->
<script>
  const [n, setN] = signal(props.initial ?? 0);
</script>

<style scoped>
  :host { display: block; }
  button { font: inherit; }
</style>

<button type="button" onclick={() => setN(v => v + 1)}>
  {n()}
</button>
```

`vite.config.js`:

```js
import { defineConfig } from "vite";
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [
    cachou({
      dirs: ["src/components"],
      runtime: "cachoujs"
    })
  ]
});
```

Manual compile:

```bash
npm install -D @cachoujs/compiler
npx cachou-compiler -dir src/components -out src/components -runtime cachoujs
```

Literal braces in templates: write `{{` and `}}` for `{` and `}`.  
Details: [Compiler](./COMPILER.md).

---

## Optional: routing

```js
import { html, Router, Route, Link, navigate } from "cachoujs";

function App() {
  return html`
    <nav>
      ${Link({ href: "/", children: "Home" })}
      ${Link({ href: "/about", children: "About" })}
    </nav>
    ${Router({
      children: [
        Route({ path: "/", component: () => html`<h1>Home</h1>` }),
        Route({ path: "/about", component: () => html`<h1>About</h1>` })
      ]
    })}
  `;
}
```

File-based routes: [Use file-based routing](./how-to/use-file-based-routing.md)  
Loaders: [Use route loaders](./how-to/use-route-loaders.md)

---

## Production checklist

```js
import { applyProductionSecurityDefaults, mount } from "cachoujs";

applyProductionSecurityDefaults();
mount(App, document.getElementById("app"));
```

```bash
npm run build    # in a Vite app
npm run preview
```

- Use your own APIs and auth (not monorepo demo endpoints).  
- Deploy static `dist/` to any host: [Deploy](./DEPLOY.md).  
- Security notes: [Security](./SECURITY.md).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| UI doesn’t update | Use `${() => count()}` (function), not `${count()}` alone |
| `Cannot find package 'cachoujs'` | Run `npm install cachoujs` in the app folder |
| Scaffold / scoped package 404 | Retry later, or `npx --package=cachoujs create-cachou my-app` |
| Effects / timers leak | Use `mount` and `onCleanup`; see [Prevent leaks](./how-to/prevent-leaks-and-races.md) |
| Want DevTools | `installDevtoolsHotkey()` or [use DevTools](./how-to/use-devtools.md) |

---

## Where to go next

| Goal | Doc |
|------|-----|
| Task recipes | [How-to guides](./how-to/README.md) |
| Full mental model | [Developer guide](./GUIDE.md) |
| API lookup | [API reference](./API.md) |
| Templates & directives | [Templates](./TEMPLATES.md) |
| Install details | [Install](./INSTALL.md) |
| Contribute to the framework | Clone [loreste/cachou](https://github.com/loreste/cachou) · [setup](./how-to/setup-local-development.md) |

### Suggested order of how-tos

1. [Create a component](./how-to/create-a-component.md)  
2. [Manage state](./how-to/manage-state.md)  
3. [Templates & directives](./how-to/use-templates-and-directives.md)  
4. [Keyed lists](./how-to/render-keyed-lists.md)  
5. [Resources](./how-to/use-resources.md)  
6. [Routing](./how-to/routing-and-lazy-pages.md)  

---

## Packages at a glance

```bash
npm install cachoujs                 # runtime + vite plugin
npm install -D @cachoujs/compiler    # optional SFC compiler
npx @cachoujs/create my-app          # scaffold
```
