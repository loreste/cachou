# Install from npm

CachouJS is on the **npm registry**. Install it with npm—you do not need to clone GitHub for normal app development.

| | |
|--|--|
| Full install | [INSTALL.md](../INSTALL.md) |
| Tutorial + examples | [Get Started](../GETTING_STARTED.md) |
| Current line | **0.4.x** (published: **0.4.1**) |

## Get the packages

| Goal | Command |
|------|---------|
| Add the library | `npm install cachoujs` |
| Scaffold a new app | `npx @cachoujs/create my-app` |
| Optional SFC compiler | `npm install -D @cachoujs/compiler` |
| See published version | `npm view cachoujs version` |

Links: [cachoujs](https://www.npmjs.com/package/cachoujs) · [@cachoujs/create](https://www.npmjs.com/package/@cachoujs/create) · [@cachoujs/compiler](https://www.npmjs.com/package/@cachoujs/compiler)

### Other package managers

```bash
pnpm add cachoujs
yarn add cachoujs
bun add cachoujs
```

### Requirements

- Node.js **20+**
- npm 9+ (or pnpm / yarn / bun)

## New project

```bash
npx @cachoujs/create my-app
cd my-app
npm install
npm run dev
```

Scaffold pins `cachoujs@^0.4.1`, file routes, and Vite 6. Details: [Scaffold a new app](./scaffold-a-new-app.md).

If the scoped package 404s briefly after a release:

```bash
npx --package=cachoujs create-cachou my-app
```

## Existing project

```bash
npm install cachoujs
```

```js
import { signal, html, mount } from "cachoujs";

function App() {
  const [n, setN] = signal(0);
  return html`
    <main style="font-family: system-ui; padding: 2rem">
      <h1>Count: ${() => n()}</h1>
      <button type="button" onclick=${() => setN(c => c + 1)}>+1</button>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

### List (`For`)

```js
import { signal, html, mount, For } from "cachoujs";

function App() {
  const [items] = signal([
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" }
  ]);

  return html`
    <ul>
      ${For({
        each: items,
        by: item => item.id,
        children: item => html`<li>${() => item.name}</li>`
      })}
    </ul>
  `;
}

mount(App, document.getElementById("app"));
```

### Fetch (`createResource`)

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

### Router

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

More examples: [Get Started](../GETTING_STARTED.md) · [0.4 APIs](./use-0.4-framework-apis.md).

## Compiler (optional)

```bash
npm install -D @cachoujs/compiler
npx cachou-compiler -dir src/components -out src/components -runtime cachoujs
```

Or the Vite plugin:

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

Pin in apps when you care about stability:

```json
{
  "dependencies": {
    "cachoujs": "0.4.1"
  }
}
```

## Next

- [Get Started](../GETTING_STARTED.md)
- [Scaffold a new app](./scaffold-a-new-app.md)
- [Create a component](./create-a-component.md)
- [How-to index](./README.md)
