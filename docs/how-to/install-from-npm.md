# Install from npm

Short recipe. Full guide: [Install & use](../INSTALL.md).

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

```js
import { signal, html, mount } from "cachoujs";

function App() {
  const [n, setN] = signal(0);
  return html`
    <button type="button" onclick=${() => setN(n() + 1)}>
      ${() => n()}
    </button>
  `;
}

mount(App, document.getElementById("app"));
```

## Compiler (optional)

```bash
npm install -D @cachoujs/compiler
npx cachou-compiler -dir src/components -out src/components -runtime cachoujs
```

Or use the Vite plugin: `import { cachou } from "cachoujs/vite"`.

## Check versions

```bash
npm view cachoujs version              # 0.3.0
npm view @cachoujs/compiler version    # 0.3.1
npm view @cachoujs/create version      # 0.3.1
```
