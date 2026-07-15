# Use File-Based Routing

Map a `routes/` folder to `Router` children without hand-writing every `Route`. The **`@cachoujs/create` scaffold** uses this pattern under `src/routes/`.

Related: [Get Started](../GETTING_STARTED.md) · [Route loaders](./use-route-loaders.md) · [Scaffold](./scaffold-a-new-app.md).

## Path conventions

| File | URL |
|------|-----|
| `routes/index.js` | `/` |
| `routes/about.js` | `/about` |
| `routes/users/[id].js` | `/users/:id` |
| `routes/blog/[...slug].js` | `/blog/*` (rest) |
| `routes/(app)/settings.js` | `/settings` (group omitted) |
| `routes/app/layout.js` | Layout for `/app/*` |
| `routes/app/index.js` | `/app` |

## Vite setup

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

## Module exports

```js
// routes/users/[id].js
import { html, Show, notFound } from "cachoujs";

export async function load({ params, signal }) {
  const res = await fetch(`/api/users/${params.id}`, { signal });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function User(params, state) {
  return html`
    <main>
      <h1>User ${params.id}</h1>
      ${Show({
        when: () => state?.loading?.(),
        children: () => html`<p>Loading…</p>`
      })}
      ${Show({
        when: () => state?.data?.(),
        children: data => html`<pre>${JSON.stringify(data, null, 2)}</pre>`
      })}
    </main>
  `;
}
```

Layouts:

```js
// routes/app/layout.js
import { html, Outlet, Link } from "cachoujs";

export default function AppLayout() {
  return html`
    <div class="shell">
      <aside>${Link({ href: "/app", children: "Dashboard" })}</aside>
      <main>${Outlet()}</main>
    </div>
  `;
}
```

## API

| Helper | Role |
|--------|------|
| `filePathToRoutePath(path)` | Convert file path → route pattern |
| `fileRoutes(glob)` | Vite glob → route tree |
| `createFileRoutes(modules)` | Eager module map → route tree |
| `createFileRoutesFromGlob(glob, opts)` | Full control |

Import from `cachoujs` or `cachoujs/file-routes`.

See also [Route loaders](./use-route-loaders.md).
