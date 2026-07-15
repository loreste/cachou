# Use Routing and Lazy Pages

CachouJS includes a small reactive router. Full concepts: [Developer guide § Routing](../GUIDE.md#8-routing).

## Define routes

```javascript
import { html, Router, Route, Link, NotFound } from "cachoujs";

function Home() {
  return html`<h1>Home</h1>`;
}

function Settings() {
  return html`<h1>Settings</h1>`;
}

export default function App() {
  return html`
    <nav>
      ${Link({ href: "/", children: "Home" })}
      ${Link({ href: "/settings", children: "Settings" })}
    </nav>

    ${Router({
      children: [
        Route({ path: "/", component: Home }),
        Route({ path: "/settings", component: Settings }),
        NotFound({ component: () => html`<h1>Not found</h1>` })
      ]
    })}
  `;
}
```

## Nested layouts

```javascript
import { html, Router, Route, Layout, Outlet, Link } from "cachoujs";

function AppShell() {
  return html`
    <div class="shell">
      <nav>
        ${Link({ href: "/app", children: "Home" })}
        ${Link({ href: "/app/settings", children: "Settings" })}
      </nav>
      <main data-cachou-route-focus>${Outlet()}</main>
    </div>
  `;
}

export default function App() {
  return Router({
    children: [
      Layout({
        path: "/app",
        component: AppShell,
        children: [
          Route({ path: "/app", component: () => html`<h1>Dashboard</h1>` }),
          Route({ path: "/app/settings", component: () => html`<h1>Settings</h1>` }),
          Route({ path: "/app/users/:id", component: params => html`<h1>User ${params.id}</h1>` })
        ]
      })
    ]
  });
}
```

## Navigate programmatically

```javascript
import { navigate, beforeNavigate, getPath, getQueryParams, getRouteParams } from "cachoujs";

navigate("/settings");
navigate("/", { replace: true, scroll: true, focus: true, viewTransition: false });

beforeNavigate(({ from, to }) => {
  if (dirty()) return confirm(`Leave ${from} for ${to}?`);
});
```

## Lazy pages

```javascript
import { lazy, Suspense, html } from "cachoujs";

const Admin = lazy(() => import("./pages/Admin.js"));

const page = html`
  ${Suspense({
    fallback: () => html`<span>Loading...</span>`,
    children: () => Admin({ title: "Admin" })
  })}
`;
```

`Link` preloads lazy route components on mouse enter when the matched route component exposes `preload()`.
