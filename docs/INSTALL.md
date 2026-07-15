# Install & use CachouJS (from npm)

CachouJS is distributed on the **public npm registry**. You do not need to download a zip from GitHub to use it in an app—install from npm like React, Vue, or Vite.

## Get it from npm

### 1. Have Node and npm

Install Node.js 20+ from [nodejs.org](https://nodejs.org/) (includes `npm`).

Check:

```bash
node -v   # v20 or higher
npm -v
```

### 2. Install the package

**Into an existing project** (folder with `package.json`):

```bash
npm install cachoujs
```

**Create a new project** (scaffold + install):

```bash
npx @cachoujs/create my-app
cd my-app
npm install
npm run dev
```

**Optional compiler** for `.cachou` single-file components:

```bash
npm install -D @cachoujs/compiler
```

### 3. Confirm install

```bash
npm view cachoujs version
npm ls cachoujs
```

Package pages:

- https://www.npmjs.com/package/cachoujs  
- https://www.npmjs.com/package/@cachoujs/create  
- https://www.npmjs.com/package/@cachoujs/compiler  

### Published packages

| Package | Version | What it is |
|---------|---------|------------|
| [`cachoujs`](https://www.npmjs.com/package/cachoujs) | **0.4.1** | Runtime, Vite plugin, helpers |
| [`@cachoujs/compiler`](https://www.npmjs.com/package/@cachoujs/compiler) | **0.4.1** | Pure-JS `.cachou` compiler |
| [`@cachoujs/create`](https://www.npmjs.com/package/@cachoujs/create) | **0.4.1** | `npx` app scaffold |

Requirements: **Node.js 20+** and npm (or pnpm/yarn/bun).

---

## 1. Fastest: scaffold a new app

```bash
npx @cachoujs/create my-app
cd my-app
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

This creates a Vite project with:

- `cachoujs` dependency  
- file-based routes under `src/routes/`  
- optional `.cachou` components under `src/components/`  
- DevTools bridge (`window.__CACHOU_RUNTIME__` in dev)

If `npx @cachoujs/create` fails to resolve (registry lag), use the bin from the main package:

```bash
npm create cachou@latest my-app
# or
npx --package=cachoujs create-cachou my-app
```

---

## 2. Add Cachou to an existing project

```bash
npm install cachoujs
```

### Minimal app

`src/main.js`:

```js
import { signal, html, mount } from "cachoujs";

function App() {
  const [count, setCount] = signal(0);
  return html`
    <main style="font-family: system-ui; padding: 2rem">
      <h1>Hello CachouJS</h1>
      <p>Count: <strong>${() => count()}</strong></p>
      <button type="button" onclick=${() => setCount(c => c + 1)}>+1</button>
      <button type="button" onclick=${() => setCount(0)}>Reset</button>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

### More examples

See **[Get Started → Code examples](./GETTING_STARTED.md#code-examples)** for:

- Todo list  
- Show / Switch  
- `createResource` fetch  
- Client router + `load`  
- Forms  
- `.cachou` components  

`index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cachou app</title>
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
npx vite
```

### Vite + `.cachou` components

```bash
npm install cachoujs
npm install -D vite @cachoujs/compiler
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

Compile SFCs manually (optional; the plugin does this on dev/build):

```bash
npx cachou-compiler -dir src/components -out src/components -runtime cachoujs
# or
npx @cachoujs/compiler -dir src/components -out src/components
```

---

## 3. Import map (what to import)

```js
// Full runtime
import { signal, html, mount, createResource, Router, Route } from "cachoujs";

// Subpaths (smaller / clearer)
import { signal, effect } from "cachoujs/reactivity";
import { html, mount } from "cachoujs/html";
import { Router, Route, Layout, Outlet, fileRoutes } from "cachoujs/router";
// note: fileRoutes is also on main entry:
import { fileRoutes } from "cachoujs";
import { Show, Switch, Match } from "cachoujs/flow";
import { mountDevtools } from "cachoujs/devtools";
import { cachou } from "cachoujs/vite";
```

| Subpath | Contents |
|---------|----------|
| `cachoujs` | Everything |
| `cachoujs/html` | `html`, mount, SSR |
| `cachoujs/reactivity` | signals, resources, scheduler |
| `cachoujs/router` | router (+ re-export loaders as used from main) |
| `cachoujs/flow` | Show / Switch / Match |
| `cachoujs/devtools` | In-page DevTools |
| `cachoujs/file-routes` | File-based routing helpers |
| `cachoujs/forms` | Forms |
| `cachoujs/a11y` | Accessibility helpers |
| `cachoujs/files` | Demo file browser helpers |
| `cachoujs/vite` | Vite plugin |

---

## 4. File-based routing (optional)

```js
import { html, mount, Router, Link, fileRoutes } from "cachoujs";

const pages = import.meta.glob("./routes/**/*.{js,jsx}");

function App() {
  return html`
    <div>
      <nav>
        ${Link({ href: "/", children: "Home" })}
        ${Link({ href: "/about", children: "About" })}
      </nav>
      ${Router({ children: fileRoutes(pages) })}
    </div>
  `;
}

mount(App, document.getElementById("app"));
```

See [Use file-based routing](./how-to/use-file-based-routing.md).

---

## 5. DevTools (optional)

**In-page panel:**

```js
import * as Cachou from "cachoujs";

if (import.meta.env.DEV) {
  window.__CACHOU_RUNTIME__ = Cachou; // for browser extension
  Cachou.installDevtoolsHotkey();   // Ctrl+Shift+D
  // Cachou.mountDevtools();
}
```

**Chrome / Edge extension (unpacked):** load  
`https://github.com/cachoujs/cachou` → folder `extensions/browser-devtools`  
(see that folder’s README).

---

## 6. Production tips

```js
import { applyProductionSecurityDefaults, mount } from "cachoujs";

applyProductionSecurityDefaults();
mount(App, document.getElementById("app"));
```

- Do **not** enable monorepo demo APIs (`CACHOU_DEMO`) on public hosts.  
- Use your own backend + auth.  
- Deploy guide: [DEPLOY.md](./DEPLOY.md).

---

## 7. Verify install

```bash
npm view cachoujs version
npm view @cachoujs/compiler version
npm view @cachoujs/create version

node -e "import('cachoujs').then(m => console.log('ok', !!m.signal, !!m.html))"
```

If a scoped package 404s briefly after first publish, wait a few minutes or install via the version that search shows (`npm view @cachoujs/create versions`).

---

## 8. Next reading

| Doc | Topic |
|-----|--------|
| [Getting started](./GETTING_STARTED.md) | Monorepo + local demos |
| [How-to guides](./how-to/README.md) | Recipes |
| [Developer guide](./GUIDE.md) | Concepts |
| [API reference](./API.md) | Full API |
| [Publishing](./PUBLISHING.md) | How maintainers release new versions |
