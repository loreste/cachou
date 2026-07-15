# Scaffold a New App

Create a standalone Vite app that imports `cachoujs` and optionally compiles `.cachou` components.

## Prerequisites

- Node.js 20+
- npm
- For SFCs: Go (to build the compiler) or a prebuilt `bin/cachou-compiler`

## From this monorepo

```bash
node create-cachou/index.js my-app
cd my-app
npm install
npm run dev
```

The scaffold writes:

```text
my-app/
├── index.html
├── package.json          # depends on cachoujs + vite
├── vite.config.js        # cachoujs/vite plugin
├── src/main.js           # counter demo
└── README.md
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Manual setup (no scaffold)

```bash
mkdir my-app && cd my-app
npm init -y
npm install cachoujs
npm install -D vite
```

`package.json`:

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

`vite.config.js`:

```javascript
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

`index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Cachou App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

`src/main.js`:

```javascript
import { signal, html, mount, applyProductionSecurityDefaults } from "cachoujs";

// Optional: tighten URL/style policy for production builds
if (import.meta.env.PROD) {
  applyProductionSecurityDefaults();
}

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

```bash
npx vite
```

## Add a `.cachou` component

`src/components/Greeting.cachou`:

```html
<script>
  const [n, setN] = signal(props.initial ?? 0);
</script>

<style scoped>
  .box { padding: 1rem; border: 1px solid #ccc; border-radius: 8px; }
</style>

<div class="box">
  <p>Hello {props.name}</p>
  <button onclick={() => setN(v => v + 1)}>Clicks: {n()}</button>
</div>
```

Import the **compiled** module (`.js` next to the source after compile):

```javascript
import Greeting from "./components/Greeting.js";

html`${Greeting({ name: "Ada", initial: 0 })}`
```

With the Vite plugin, saving the `.cachou` file recompiles and reloads.

## Production

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder as a static site. Use your own backend for data — do not enable this monorepo’s `CACHOU_DEMO` APIs on a public host.

## Next

- [Create a component](./create-a-component.md)
- [Manage state](./manage-state.md)
- [Work with `.cachou` files](./work-with-cachou-files.md)
- [Build and deploy](./build-and-deploy.md)
