# Scaffold a New App

Create a standalone Vite app that imports `cachoujs` with file-based routes and optional `.cachou` components.

## Prerequisites

- Node.js 20+
- npm (or pnpm / yarn / bun)

## From npm (recommended)

```bash
npx @cachoujs/create my-app
cd my-app
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## From this monorepo

```bash
node create-cachou/index.js my-app
# or
node packages/create-cachou/index.js my-app
cd my-app
npm install
npm run dev
```

## What you get

```text
my-app/
├── index.html
├── package.json          # cachoujs@^0.4.5 + vite
├── vite.config.js        # cachoujs/vite plugin
├── .gitignore
├── README.md
└── src/
    ├── main.js           # shell + Router + fileRoutes
    ├── styles.css        # base light/dark styles
    ├── routes/
    │   ├── index.js      # /
    │   ├── about.js      # /about
    │   └── users/[id].js # /users/:id + load()
    └── components/       # optional .cachou SFCs
```

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production client build |
| `npm run preview` | Preview build |
| `npm run compile` | Compile `.cachou` under `src/components` |

## Manual setup (no scaffold)

```bash
mkdir my-app && cd my-app
npm init -y
npm install cachoujs@^0.4.5
npm install -D vite @cachoujs/compiler
```

`package.json` scripts:

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
    // Defaults: aliases `cachoujs` → browser-safe entry for client builds
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
import { signal, html, mount } from "cachoujs";

function App() {
  const [count, setCount] = signal(0);
  return html`
    <main>
      <button type="button" onclick=${() => setCount(c => c + 1)}>
        Count: ${() => count()}
      </button>
    </main>
  `;
}

mount(App, document.getElementById("app"));
```

## Next

- [Get Started](../GETTING_STARTED.md)
- [0.4 framework APIs](./use-0.4-framework-apis.md)
- [File-based routing](./use-file-based-routing.md)
