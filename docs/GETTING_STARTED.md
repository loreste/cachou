# Get Started with CachouJS

**CachouJS** is a fine-grained reactive JavaScript UI library: components set up once, and **signals** update the DOM directly (no virtual DOM).

| | |
|--|--|
| **npm** | [`cachoujs`](https://www.npmjs.com/package/cachoujs) |
| **GitHub** | [github.com/loreste/cachou](https://github.com/loreste/cachou) |
| **Version** | 0.4.1 (experimental 0.x) |

This page takes you from zero to a running app, then the first concepts you’ll use every day.

---

## Get it from npm

CachouJS is published on the **[npm registry](https://www.npmjs.com/package/cachoujs)**. You install it with npm (or pnpm / yarn / bun) like any other package—no need to clone the GitHub repo unless you want to contribute.

### Packages

| Command / package | What you get | npm page |
|-------------------|--------------|----------|
| `npm install cachoujs` | Runtime, Vite plugin, helpers | [cachoujs](https://www.npmjs.com/package/cachoujs) |
| `npx @cachoujs/create my-app` | New Vite project scaffold | [@cachoujs/create](https://www.npmjs.com/package/@cachoujs/create) |
| `npm install -D @cachoujs/compiler` | Optional `.cachou` SFC compiler | [@cachoujs/compiler](https://www.npmjs.com/package/@cachoujs/compiler) |

### Check that npm can see the package

```bash
npm view cachoujs version
# → 0.4.1 (or newer)
```

### Install into a project

```bash
# inside your app folder (with a package.json)
npm install cachoujs
```

Then import it:

```js
import { signal, html, mount } from "cachoujs";
```

### Other package managers

```bash
# pnpm
pnpm add cachoujs

# yarn
yarn add cachoujs

# bun
bun add cachoujs
```

### Requirements

- **Node.js 20+** (LTS recommended)
- **npm** 9+ (ships with Node), or pnpm / yarn / bun
- A browser for the UI

You do **not** need Go to use the runtime from npm. The optional compiler package is pure JavaScript.

More install detail: [INSTALL.md](./INSTALL.md).

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

Scaffold a Vite app from npm (this downloads `@cachoujs/create` and sets up `cachoujs` for you):

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

## Code examples

Copy-paste patterns you can drop into `src/main.js` after `npm install cachoujs`.

### Complete counter app

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

### Two-way input + derived text

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
        <input
          value=${() => name()}
          oninput=${e => setName(e.target.value)}
          placeholder="Ada"
        />
      </label>
      <p>${() => greeting()}</p>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

### Todo list (signals + `mapArray`)

```js
import { signal, html, mount, mapArray } from "cachoujs";

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
          value=${() => draft()}
          oninput=${e => setDraft(e.target.value)}
          onkeydown=${e => e.key === "Enter" && addTodo()}
          placeholder="New todo"
          style="flex: 1"
        />
        <button type="button" onclick=${addTodo}>Add</button>
      </div>
      <ul style="list-style: none; padding: 0; margin: 0">
        ${mapArray(
          todos,
          todo => html`
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
          `,
          todo => todo.id,
          { uniqueKeys: true }
        )}
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

### Fetch data (`createResource`)

```js
import { createResource, html, mount, Show } from "cachoujs";

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
        ${() =>
          (posts() || []).map(
            p => html`<li><strong>${p.title}</strong></li>`
          )}
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

### Route with `load` (data on navigate)

```js
import { html, mount, Router, Route, Link, Show } from "cachoujs";

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
              const res = await fetch(
                `https://jsonplaceholder.typicode.com/users/${params.id}`,
                { signal }
              );
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

### Vite config (with optional `.cachou` components)

```js
// vite.config.js
import { defineConfig } from "vite";
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [
    cachou({
      dirs: ["src/components"], // compile *.cachou here
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
// After compile (or with Vite plugin), import the generated JS:
import Badge from "./components/Badge.js";
import { html, mount } from "cachoujs";

mount(
  () => html`<p>Status: ${Badge({ label: "Live" })}</p>`,
  document.getElementById("app")
);
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
