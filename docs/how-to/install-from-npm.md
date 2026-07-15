# Install from npm

CachouJS is on the **npm registry**. Install it with npm—you do not need to clone GitHub for normal app development.

Full guide: [Install & use](../INSTALL.md) · [Get Started](../GETTING_STARTED.md) (includes many more examples).

## Get the packages

| Goal | Command |
|------|---------|
| Add the library | `npm install cachoujs` |
| Scaffold a new app | `npx @cachoujs/create my-app` |
| Optional SFC compiler | `npm install -D @cachoujs/compiler` |
| See published version | `npm view cachoujs version` |

Links: [cachoujs](https://www.npmjs.com/package/cachoujs) · [@cachoujs/create](https://www.npmjs.com/package/@cachoujs/create) · [@cachoujs/compiler](https://www.npmjs.com/package/@cachoujs/compiler)

## New project

```bash
npx @cachoujs/create my-app
cd my-app
npm install
npm run dev
```

## Existing project

```bash
npm install cachoujs
```

### Counter example

```js
import { signal, html, mount } from "cachoujs";

function App() {
  const [n, setN] = signal(0);
  return html`
    <main style="font-family: system-ui; padding: 2rem">
      <h1>Count: ${() => n()}</h1>
      <button type="button" onclick=${() => setN(n() + 1)}>+1</button>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

### List example

```js
import { signal, html, mount, mapArray } from "cachoujs";

function App() {
  const [items] = signal([
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" }
  ]);

  return html`
    <ul>
      ${mapArray(
        items,
        item => html`<li>${() => item.name}</li>`,
        item => item.id,
        { uniqueKeys: true }
      )}
    </ul>
  `;
}

mount(App, document.getElementById("app"));
```

### Fetch example

```js
import { createResource, html, mount } from "cachoujs";

function App() {
  const [data, { loading, error }] = createResource(async ({ signal }) => {
    const res = await fetch("https://jsonplaceholder.typicode.com/todos/1", { signal });
    return res.json();
  });

  return html`
    <div style="font-family: system-ui; padding: 2rem">
      ${() => (loading() ? "Loading…" : "")}
      ${() => (error() ? error().message : "")}
      ${() => (data() ? html`<pre>${JSON.stringify(data(), null, 2)}</pre>` : "")}
    </div>
  `;
}

mount(App, document.getElementById("app"));
```

### Router example

```js
import { html, mount, Router, Route, Link } from "cachoujs";

function App() {
  return html`
    <div style="font-family: system-ui; padding: 2rem">
      <nav style="display:flex; gap:1rem">
        ${Link({ href: "/", children: "Home" })}
        ${Link({ href: "/about", children: "About" })}
      </nav>
      ${Router({
        children: [
          Route({ path: "/", component: () => html`<h1>Home</h1>` }),
          Route({ path: "/about", component: () => html`<h1>About</h1>` })
        ]
      })}
    </div>
  `;
}

mount(App, document.getElementById("app"));
```

## Compiler (optional)

```bash
npm install -D @cachoujs/compiler
npx cachou-compiler -dir src/components -out src/components -runtime cachoujs
```

Or use the Vite plugin:

```js
import { defineConfig } from "vite";
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [cachou({ dirs: ["src/components"], runtime: "cachoujs" })]
});
```

## Check versions

```bash
npm view cachoujs version              # 0.4.1
npm view @cachoujs/compiler version    # 0.4.1
npm view @cachoujs/create version      # 0.4.1
```
