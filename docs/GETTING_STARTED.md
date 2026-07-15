# Getting Started

This guide covers the **monorepo** (contributors and demos).

**If you only want to build an app with the published package**, use:

→ **[Install from npm](./INSTALL.md)** (`npm install cachoujs` / `npx @cachoujs/create`)

## Prerequisites

| Tool | Required for |
|------|----------------|
| Node.js 20+ | Runtime, Vite, scripts, SSR server |
| npm | Install dependencies |
| Go 1.22+ | Optional native compiler binary (JS compiler needs no Go) |
| Playwright Chromium | Browser tests in this repo (`npx playwright install chromium`) |

## Option A — Use this repository

Clone or open the monorepo and install:

```bash
npm install
npx playwright install chromium   # once, for tests
npm run dev
```

Vite starts with demo APIs enabled (`CACHOU_DEMO=1`).

| URL | Purpose |
|-----|---------|
| http://localhost:5173/demo | Main demo application |
| http://localhost:5173/examples/ | Runnable copy-paste examples |
| http://localhost:5173/tests/ | In-browser test harness |
| http://localhost:5173/benchmarks/ | Perf harness |

CRM proving ground (separate app under `faydb-crm/`):

```bash
npm run crm:demo
```

Change port:

```bash
PORT=8080 npm run dev
# or
CACHOU_PORT=8080 npm run dev
```

## Option B — Scaffold a new app

**From npm (recommended):**

```bash
npx @cachoujs/create my-app
cd my-app
npm install
npm run dev
```

**From this monorepo:**

```bash
node packages/create-cachou/index.js my-app
cd my-app
npm install
npm run dev
```

Full user install guide: [INSTALL.md](./INSTALL.md).


### Minimal app (no scaffold)

```html
<!-- index.html -->
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
```

```javascript
// src/main.js
import { signal, html, mount } from "cachoujs";

function App() {
  const [count, setCount] = signal(0);

  return html`
    <main>
      <h1>Hello CachouJS</h1>
      <button onclick=${() => setCount(c => c + 1)}>
        Count: ${() => count()}
      </button>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

```javascript
// vite.config.js
import { defineConfig } from "vite";
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [cachou({ dirs: ["src/components"] })]
});
```

In this monorepo, Vite already aliases `cachoujs` → `./src/index.js`. In a published install, resolve comes from `node_modules/cachoujs`.

## First concepts

### Signals

```javascript
const [name, setName] = signal("Ada");
name();        // read
setName("Grace");
setName(n => n + "!");
```

### Effects and roots

```javascript
import { effect, createRoot, onCleanup } from "cachoujs";

const dispose = createRoot(() => {
  effect(() => {
    console.log(name());
    onCleanup(() => console.log("cleanup"));
  });
});
dispose(); // runs cleanups, disposes owned effects
```

### Templates

Reactive interpolations are functions (or signals used as children/attrs). See [Templates](./TEMPLATES.md).

```javascript
html`<p>Hello ${() => name()}</p>`
```

### Mounting

```javascript
import { mount, unmount } from "cachoujs";

const stop = mount(App, document.getElementById("app"));
stop(); // or unmount(root)
```

## Working with `.cachou` files

```html
<!-- src/components/Greeting.cachou -->
<script>
  const [n, setN] = signal(props.initial ?? 0);
</script>

<style scoped>
  .box { padding: 1rem; }
</style>

<div class="box">
  <button onclick={() => setN(v => v + 1)}>Hi {props.name}: {n()}</button>
</div>
```

Compile:

```bash
npm run compile
# or
node scripts/run-compiler.mjs -dir src/components -out src/components -runtime cachoujs
```

With the Vite plugin, `.cachou` files recompile on change. Generated modules import from `"cachoujs"`. Details: [Compiler](./COMPILER.md).

## Production build (this repo)

```bash
npm run build
NODE_ENV=production CACHOU_DEMO=0 npm start
```

Demo APIs are **disabled** unless you explicitly set `CACHOU_DEMO=1`. Do not enable that on public hosts. See [Deploy](./DEPLOY.md) and [Security](./SECURITY.md).

## Quality checks

```bash
npm run test:unit      # Node tests (no browser)
npm run test:browser   # Playwright Chromium by default
npm run check          # full CI-style pipeline
```

## Where to go next

1. [How-to guides](./how-to/README.md) — task recipes (start with [create a component](./how-to/create-a-component.md))  
2. [Developer guide](./GUIDE.md) — full mental model and feature tour  
3. [API reference](./API.md) — lookup table for every export  
4. [Examples](../examples/README.md) — live patterns at `/examples/`  
5. [Scaffold a new app](./how-to/scaffold-a-new-app.md) — standalone Vite project  

## Project map (this monorepo)

```text
src/            Published browser runtime
plugin/         Vite plugin (cachoujs/vite)
compiler.go     .cachou compiler
create-cachou/  App scaffold
server/         Demo APIs (gated)
sandbox/        Default files API root
demo/           Demo application
examples/       Runnable examples
tests/          Browser + unit tests
benchmarks/     Perf suites
docs/           This documentation
faydb-crm/      CRM proving ground (not published with the package)
```
