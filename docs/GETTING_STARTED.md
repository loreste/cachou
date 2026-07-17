# Get Started with CachouJS

**CachouJS** is a fine-grained reactive JavaScript UI library: components set up **once**, and **signals** update the DOM directly (no virtual DOM).

| | |
|--|--|
| **npm** | [`cachoujs`](https://www.npmjs.com/package/cachoujs) |
| **GitHub** | [github.com/loreste/cachou](https://github.com/loreste/cachou) |
| **Version** | **0.4.9** (experimental 0.x, patch-first) |
| **License / maturity** | 0.x — pin versions; read the [changelog](../CHANGELOG.md) |

This guide takes you from zero to a running app, then the concepts and patterns you’ll use every day. Task recipes live in the [how-to guides](./how-to/README.md).

---

## Requirements

- **Node.js 20+** (LTS recommended)
- **npm** 9+ (or pnpm / yarn / bun)
- A browser

You do **not** need Go for normal app development. The optional [`.cachou` compiler](https://www.npmjs.com/package/@cachoujs/compiler) is pure JavaScript.

---

## Install from npm

CachouJS is on the [npm registry](https://www.npmjs.com/package/cachoujs). You do not need to clone GitHub unless you contribute.

| Package | Command | Role |
|---------|---------|------|
| Runtime + Vite plugin | `npm install cachoujs` | Day-to-day apps |
| Scaffold | `npx @cachoujs/create my-app` | New Vite project |
| SFC compiler (optional) | `npm install -D @cachoujs/compiler` | `.cachou` files |

```bash
npm view cachoujs version
# → 0.4.9 (or newer)

npm install cachoujs
```

Other managers:

```bash
pnpm add cachoujs
yarn add cachoujs
bun add cachoujs
```

More detail: [INSTALL.md](./INSTALL.md) · [Install from npm how-to](./how-to/install-from-npm.md).

---

## Path A — New project (recommended)

```bash
npx @cachoujs/create my-app
cd my-app
npm install
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**).

You get:

- File routes under `src/routes/` (`/`, `/about`, `/users/:id` with `load`)
- `cachoujs@^0.4.9` + Vite 6
- Base CSS, `.gitignore`, optional `.cachou` folder under `src/components/`
- DevTools bridge in development (`Ctrl+Shift+D`)

Stop with `Ctrl+C`.

If `npx @cachoujs/create` cannot resolve the scoped package:

```bash
npx --package=cachoujs create-cachou my-app
```

Scaffold details: [Scaffold a new app](./how-to/scaffold-a-new-app.md).

---

## Path B — Add Cachou to an existing app

```bash
npm install cachoujs
```

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

With Vite:

```bash
npm install -D vite
```

```json
{
  "type": "module",
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
npm run crm:demo    # larger CRM showcase (PostgreSQL or memory)
npm run test:unit   # Node unit tests
```

Monorepo setup: [Set up local development](./how-to/setup-local-development.md).

---

## Core ideas (5 minutes)

### 1. Signals hold state

```js
import { signal } from "cachoujs";

const [count, setCount] = signal(0);

count();              // read → 0
setCount(1);          // write
setCount(n => n + 1); // update from previous
```

### 2. Components run **once**

The component function is **not** re-executed on every change. Setup (creating signals, wiring effects) runs once; the DOM updates through reactive bindings.

### 3. Templates use `html` and reactive functions

Dynamic text and attributes should be **functions** so Cachou can track dependencies:

```js
import { html, signal } from "cachoujs";

const [name, setName] = signal("Ada");

// ✅ updates when name changes
html`<p>Hello ${() => name()}</p>`

// ❌ usually will NOT update (read once at setup)
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

Prefer **`For`** (0.4) or `mapArray` with a stable key:

```js
import { For, html, signal } from "cachoujs";

const [items] = signal([
  { id: 1, text: "One" },
  { id: 2, text: "Two" }
]);

html`
  <ul>
    ${For({
      each: items,
      by: item => item.id,
      children: item => html`<li>${() => item.text}</li>`
    })}
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

### 7. What 0.4 adds (quick map)

| Area | APIs |
|------|------|
| Libraries | `untrack`, `getOwner`, `runWithOwner`, `splitProps`, `mergeProps`, `Dynamic` |
| Lists | `For`, `Index` (plus `mapArray`) |
| Router | `redirect` / `notFound`, `createAction`, history modes, `useParams` / `useSearchParams`, `go` / `back` / `forward` |
| Templates | `directive` / `use:`, `model`, merged `useHead`, `Dialog` |
| Data | `createMutation`, `persist`, nested forms, `virtualList`, `configureResourceCache` |
| SSR | `renderToStream`, `Island`, `hydrateIslands`, `getRequestEvent`, concurrent contexts, `preload` |
| Observability (0.4.6) | `configureLogger` / `createLogger`, W3C tracing, `onFrameworkEvent` |
| Bundling (0.4.6) | `cachoujs/browser` browser-safe entry; Vite plugin aliases it by default |

Recipes: [Use 0.4 framework APIs](./how-to/use-0.4-framework-apis.md) · [SSR](./how-to/ssr-and-hydration.md) · [Debug](./how-to/enable-debug-diagnostics.md).

---

## Code examples

Drop these into `src/main.js` after `npm install cachoujs`.

### Complete counter

```js
import { signal, html, mount } from "cachoujs";

function App() {
  const [count, setCount] = signal(0);

  return html`
    <main style="font-family: system-ui; padding: 2rem; max-width: 24rem">
      <h1>Counter</h1>
      <p>Value: <strong>${() => count()}</strong></p>
      <div style="display: flex; gap: 0.5rem">
        <button type="button" onclick=${() => setCount(n => n - 1)}>-</button>
        <button type="button" onclick=${() => setCount(0)}>Reset</button>
        <button type="button" onclick=${() => setCount(n => n + 1)}>+</button>
      </div>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

### Two-way input with `model` (0.4)

```js
import { signal, memo, html, mount } from "cachoujs";

function App() {
  const [name, setName] = signal("");
  const greeting = memo(() => {
    const n = name().trim();
    return n ? `Hello, ${n}!` : "Type your name…";
  });

  return html`
    <main style="font-family: system-ui; padding: 2rem">
      <label>
        Name
        <input model=${[name, setName]} placeholder="Ada" />
      </label>
      <p>${() => greeting()}</p>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

(`bind:value=${[name, setName]}` still works; `model` is the shorter 0.4 form.)

### Todo list (`For` + signals)

```js
import { signal, html, mount, For } from "cachoujs";

function App() {
  const [todos, setTodos] = signal([
    { id: 1, text: "Install cachoujs", done: true },
    { id: 2, text: "Build something", done: false }
  ]);
  const [draft, setDraft] = signal("");
  let nextId = 3;

  function addTodo() {
    const text = draft().trim();
    if (!text) return;
    setTodos(list => [...list, { id: nextId++, text, done: false }]);
    setDraft("");
  }

  function toggle(id) {
    setTodos(list =>
      list.map(t => (t.id === id ? { ...t, done: !t.done } : t))
    );
  }

  function remove(id) {
    setTodos(list => list.filter(t => t.id !== id));
  }

  return html`
    <main style="font-family: system-ui; padding: 2rem; max-width: 28rem">
      <h1>Todos</h1>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem">
        <input
          model=${[draft, setDraft]}
          onkeydown=${e => e.key === "Enter" && addTodo()}
          placeholder="New todo"
          style="flex: 1"
        />
        <button type="button" onclick=${addTodo}>Add</button>
      </div>
      <ul style="list-style: none; padding: 0; margin: 0">
        ${For({
          each: todos,
          by: todo => todo.id,
          children: todo => html`
            <li style="display: flex; gap: 0.5rem; align-items: center; padding: 0.35rem 0">
              <input
                type="checkbox"
                checked=${() => todo.done}
                onchange=${() => toggle(todo.id)}
              />
              <span style=${() => (todo.done ? "text-decoration: line-through; opacity: 0.6" : "")}>
                ${() => todo.text}
              </span>
              <button type="button" onclick=${() => remove(todo.id)} style="margin-left: auto">
                ×
              </button>
            </li>
          `
        })}
      </ul>
      <p style="color: #666; font-size: 0.9rem">
        ${() => todos().filter(t => !t.done).length} remaining
      </p>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

### Show / Switch (conditional UI)

```js
import { signal, html, mount, Show, Switch, Match } from "cachoujs";

function App() {
  const [loggedIn, setLoggedIn] = signal(false);
  const [tab, setTab] = signal("home");

  return html`
    <main style="font-family: system-ui; padding: 2rem">
      <button type="button" onclick=${() => setLoggedIn(v => !v)}>
        ${() => (loggedIn() ? "Log out" : "Log in")}
      </button>

      ${Show({
        when: loggedIn,
        fallback: () => html`<p>Please log in.</p>`,
        children: () => html`
          <div>
            <nav style="display: flex; gap: 0.5rem; margin: 1rem 0">
              <button type="button" onclick=${() => setTab("home")}>Home</button>
              <button type="button" onclick=${() => setTab("settings")}>Settings</button>
            </nav>
            ${Switch({
              fallback: () => html`<p>Unknown tab</p>`,
              children: [
                Match({
                  when: () => tab() === "home",
                  children: () => html`<h2>Home</h2>`
                }),
                Match({
                  when: () => tab() === "settings",
                  children: () => html`<h2>Settings</h2>`
                })
              ]
            })}
          </div>
        `
      })}
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

### Fetch data (`createResource` + `For`)

```js
import { createResource, html, mount, Show, For } from "cachoujs";

function App() {
  const [posts, { loading, error, refetch }] = createResource(
    async ({ signal, requestId }) => {
      const res = await fetch(
        `https://jsonplaceholder.typicode.com/posts?_limit=5&r=${requestId}`,
        { signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
  );

  return html`
    <main style="font-family: system-ui; padding: 2rem; max-width: 36rem">
      <h1>Posts</h1>
      <button type="button" onclick=${() => refetch()}>Refresh</button>

      ${Show({
        when: () => loading(),
        children: () => html`<p>Loading…</p>`
      })}
      ${Show({
        when: () => error(),
        children: err => html`<p style="color: crimson">${err.message}</p>`
      })}
      <ul>
        ${For({
          each: () => posts() || [],
          by: p => p.id,
          children: p => html`<li><strong>${() => p.title}</strong></li>`
        })}
      </ul>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

### Client router

```js
import { html, mount, Router, Route, Link, NotFound } from "cachoujs";

function Home() {
  return html`<h1>Home</h1><p>Welcome.</p>`;
}

function About() {
  return html`<h1>About</h1><p>Built with CachouJS.</p>`;
}

function User(params) {
  return html`<h1>User</h1><p>id = <code>${params.id}</code></p>`;
}

function App() {
  return html`
    <div style="font-family: system-ui; padding: 2rem">
      <nav style="display: flex; gap: 1rem; margin-bottom: 1.5rem">
        ${Link({ href: "/", children: "Home" })}
        ${Link({ href: "/about", children: "About" })}
        ${Link({ href: "/users/ada", children: "User ada" })}
      </nav>
      ${Router({
        children: [
          Route({ path: "/", component: Home }),
          Route({ path: "/about", component: About }),
          Route({ path: "/users/:id", component: User }),
          NotFound({ component: () => html`<h1>404</h1>` })
        ]
      })}
    </div>
  `;
}

mount(App, document.getElementById("app"));
```

### Route with `load` + `redirect` / `notFound` (0.4)

```js
import {
  html,
  mount,
  Router,
  Route,
  Link,
  Show,
  redirect,
  notFound
} from "cachoujs";

function UserPage(params, state) {
  return html`
    <section>
      <h1>User ${params.id}</h1>
      ${Show({
        when: () => state.loading(),
        children: () => html`<p>Loading…</p>`
      })}
      ${Show({
        when: () => state.data(),
        children: data => html`<pre>${JSON.stringify(data, null, 2)}</pre>`
      })}
    </section>
  `;
}

function App() {
  return html`
    <div style="font-family: system-ui; padding: 2rem">
      <nav style="display: flex; gap: 1rem">
        ${Link({ href: "/users/1", children: "User 1" })}
        ${Link({ href: "/users/2", children: "User 2" })}
      </nav>
      ${Router({
        children: [
          Route({
            path: "/users/:id",
            load: async ({ params, signal }) => {
              if (params.id === "0") redirect("/");
              const res = await fetch(
                `https://jsonplaceholder.typicode.com/users/${params.id}`,
                { signal }
              );
              if (res.status === 404) notFound();
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            },
            fallback: () => html`<p>Loading user…</p>`,
            component: UserPage
          })
        ]
      })}
    </div>
  `;
}

mount(App, document.getElementById("app"));
```

File-based routes (what the scaffold uses): [Use file-based routing](./how-to/use-file-based-routing.md).

### Search params (filters)

```js
import { html, mount, useSearchParams } from "cachoujs";

function Catalog() {
  const [params, setParams] = useSearchParams();

  return html`
    <main style="font-family: system-ui; padding: 2rem">
      <label>
        Search
        <input
          value=${() => params().q || ""}
          oninput=${e => setParams({ q: e.target.value })}
          placeholder="Filter…"
        />
      </label>
      <p>Query: <code>${() => params().q || "(empty)"}</code></p>
    </main>
  `;
}

mount(Catalog, document.getElementById("app"));
```

### Simple form validation

```js
import { createForm, html, mount } from "cachoujs";

function App() {
  const form = createForm(
    { email: "" },
    {
      fields: {
        email: {
          validate: v => (String(v).includes("@") ? null : "Enter a valid email"),
          validateOnChange: true
        }
      },
      onSubmit: async values => {
        alert(`Submitted: ${values.email}`);
      }
    }
  );

  const email = form.fields.email;

  return html`
    <form
      style="font-family: system-ui; padding: 2rem; max-width: 20rem"
      onsubmit=${form.handleSubmit()}
    >
      <label>
        Email
        <input
          type="email"
          value=${() => email.value()}
          oninput=${e => email.setValue(e.target.value)}
          onblur=${() => email.setTouched(true)}
        />
      </label>
      ${() =>
        email.touched() && email.error()
          ? html`<p style="color: crimson">${email.error()}</p>`
          : ""}
      <button type="submit" disabled=${() => form.submitting()}>
        ${() => (form.submitting() ? "Saving…" : "Save")}
      </button>
    </form>
  `;
}

mount(App, document.getElementById("app"));
```

### Dialog

```js
import { signal, html, mount, Dialog } from "cachoujs";

function App() {
  const [open, setOpen] = signal(false);

  return html`
    <main style="font-family: system-ui; padding: 2rem">
      <button type="button" onclick=${() => setOpen(true)}>Open dialog</button>
      ${Dialog({
        open,
        onClose: () => setOpen(false),
        title: "Hello",
        children: () => html`
          <p>Focus trap + Esc + backdrop are built in.</p>
          <button type="button" onclick=${() => setOpen(false)}>Close</button>
        `
      })}
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

### Vite + optional `.cachou` components

```js
// vite.config.js
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

```html
<!-- src/components/Badge.cachou -->
<script>
  const label = props.label ?? "New";
</script>

<style scoped>
  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: #0d9488;
    color: white;
    font-size: 0.85rem;
  }
</style>

<span class="badge">{label}</span>
```

```js
import Badge from "./components/Badge.js";
import { html, mount } from "cachoujs";

mount(
  () => html`<p>Status: ${Badge({ label: "Live" })}</p>`,
  document.getElementById("app")
);
```

Manual compile:

```bash
npm install -D @cachoujs/compiler
npx cachou-compiler -dir src/components -out src/components -runtime cachoujs
```

Literal braces in templates: write `{{` and `}}` for `{` and `}`. Details: [Compiler](./COMPILER.md) · [Work with `.cachou` files](./how-to/work-with-cachou-files.md).

---

## Production checklist

```js
import { applyProductionSecurityDefaults, mount } from "cachoujs";

applyProductionSecurityDefaults();
mount(App, document.getElementById("app"));
```

```bash
npm run build
npm run preview
```

- Use your own APIs and auth (not monorepo demo endpoints).
- Deploy static `dist/` to any host: [Deploy](./DEPLOY.md).
- SSR path: [SSR & hydration](./how-to/ssr-and-hydration.md).
- Security: [Security](./SECURITY.md).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| UI doesn’t update | Use `${() => count()}` (function), not `${count()}` alone |
| `Cannot find package 'cachoujs'` | Run `npm install cachoujs` in the app folder |
| Scaffold / scoped package 404 | Retry later, or `npx --package=cachoujs create-cachou my-app` |
| Effects / timers leak | Use `mount` and `onCleanup`; see [Prevent leaks](./how-to/prevent-leaks-and-races.md) |
| Want DevTools | `installDevtoolsHotkey()` or [use DevTools](./how-to/use-devtools.md) |
| Version mismatch | `npm view cachoujs version` should show **0.4.x** |

---

## Where to go next

| Goal | Doc |
|------|-----|
| Task recipes | [How-to guides](./how-to/README.md) |
| 0.4 API recipes | [Use 0.4 framework APIs](./how-to/use-0.4-framework-apis.md) |
| Full mental model | [Developer guide](./GUIDE.md) |
| API lookup | [API reference](./API.md) |
| Templates & directives | [Templates](./TEMPLATES.md) |
| Install details | [Install](./INSTALL.md) |
| Roadmap / limits | [Roadmap](./ROADMAP.md) · [Known limitations](./KNOWN_LIMITATIONS.md) |
| Contribute | Clone [loreste/cachou](https://github.com/loreste/cachou) · [setup](./how-to/setup-local-development.md) |

### Suggested learning path

1. [Create a component](./how-to/create-a-component.md)  
2. [Manage state](./how-to/manage-state.md)  
3. [Templates & directives](./how-to/use-templates-and-directives.md)  
4. [Keyed lists](./how-to/render-keyed-lists.md) (`For` / `mapArray`)  
5. [Resources](./how-to/use-resources.md)  
6. [Routing](./how-to/routing-and-lazy-pages.md) + [file routes](./how-to/use-file-based-routing.md)  
7. [0.4 APIs](./how-to/use-0.4-framework-apis.md) · [SSR](./how-to/ssr-and-hydration.md) · [Deploy](./how-to/build-and-deploy.md)

---

## Packages at a glance

```bash
npm install cachoujs                 # runtime + vite plugin  (0.4.9)
npm install -D @cachoujs/compiler    # optional SFC compiler
npx @cachoujs/create my-app          # scaffold
```
