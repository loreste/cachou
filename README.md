# CachouJS

**v1.0.10** · stable core (experimental kits still opt-in)

[npm](https://www.npmjs.com/package/cachoujs) · [GitHub](https://github.com/loreste/cachou) · [Docs](./docs/README.md) · [Get started](./docs/GETTING_STARTED.md) · [Changelog](./CHANGELOG.md)

Fine-grained reactive UI library for JavaScript. Components set up once; signals update specific DOM bindings. No virtual DOM.

Optional pieces: `.cachou` SFC compiler, Vite plugin, router, SSR helpers, styles/transitions, and a set of app primitives. The **stable core** has an API compatibility commitment at 1.0. Experimental kits may still change — pin tightly. See [docs/ONE_POINT_OH.md](./docs/ONE_POINT_OH.md).

## Install

```bash
npm install cachoujs
# scaffold (optional)
npx @cachoujs/create my-app
```

Node.js 20+. Packages: [`cachoujs`](https://www.npmjs.com/package/cachoujs) · [`@cachoujs/create`](https://www.npmjs.com/package/@cachoujs/create) · [`@cachoujs/compiler`](https://www.npmjs.com/package/@cachoujs/compiler)

## Example

```js
import { signal, html, mount } from "cachoujs";

function App() {
  const [count, setCount] = signal(0);
  return html`
    <button type="button" onclick=${() => setCount(c => c + 1)}>
      Count: ${() => count()}
    </button>
  `;
}

mount(App, document.getElementById("app"));
```

More: [docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md).

## What ships

### Solid core

| Area | What you get |
|------|----------------|
| Reactivity | `signal`, `effect`, `memo`, `store`, `batch`, roots, `onCleanup`, optional equality |
| Templates | `html` tagged templates; events, class/style, bind, refs |
| Lists | Keyed `mapArray`; `For` / `Index` |
| Data | `createResource` (abort, stale-safe, cache bounds, `dispose`) |
| DOM lifecycle | `mount` / `unmount` / `render` / `hydrate`; ownership-based cleanup |
| Errors | `ErrorBoundary`, `Suspense`, `onError` |
| Control flow | `Show`, `Switch`, `Match`, `KeepAlive` |
| Router | routes, layouts, `Link`, guards, loaders, lazy, file routes, history modes, `go`/`back`/`forward` |
| SSR | `renderToString` / `renderToStringAsync` / `renderToStream`, dehydrate, islands, per-request context |
| Forms | `createField`, `createForm` |
| Security basics | URL/style policy, `trustedHTML`, production defaults; application review still required |
| Browser entry | `cachoujs/browser` — avoids pulling Node-oriented modules into client bundles |

### Tooling (usable today)

| Area | What you get |
|------|----------------|
| Compiler | `.cachou` SFC → JS (portable JS compiler; optional native Go binary) |
| Vite | `cachoujs/vite` plugin; defaults client alias to the browser entry |
| Scaffold | `npx @cachoujs/create` |
| Checks | unit + Playwright browser tests, benches, `npm run check` |
| Editor | VS Code extension in-repo (not Marketplace-published) |
| DevTools | in-page panel + optional browser extension (not store-published) |

### Also included (experimental — pin versions)

See [docs/EXPERIMENTAL.md](./docs/EXPERIMENTAL.md) and [docs/STABILITY.md](./docs/STABILITY.md).

- Styles / transitions (`cachoujs/styles`, `cachoujs/transitions`) — **candidate**
- UI kit, auth, i18n, machine, DnD, SEO, validate, mask, upload — **experimental**
- Content / media (Node-oriented; not in `cachoujs/browser`) — **experimental**
- Plugins, DevTools, test-utils — **experimental**
- Logger + W3C-style tracing (off by default; sample OTel bridge in docs) — **candidate**

Details and signatures: [docs/API.md](./docs/API.md). Limits: [docs/KNOWN_LIMITATIONS.md](./docs/KNOWN_LIMITATIONS.md).

## Package exports

```
cachoujs            full runtime (includes Node-oriented content/media)
cachoujs/browser    client-oriented entry (Vite default alias)
cachoujs/html
cachoujs/reactivity
cachoujs/router
cachoujs/forms
cachoujs/a11y
cachoujs/styles
cachoujs/transitions
cachoujs/plugin
cachoujs/content    Node-oriented
cachoujs/image
cachoujs/media      Node-oriented helpers
cachoujs/ui
cachoujs/utils
cachoujs/vite
```

Prefer `cachoujs/browser` (or the Vite plugin default) for client apps.

## Docs

| | |
|--|--|
| [Get started](./docs/GETTING_STARTED.md) | Install, first app |
| [Guide](./docs/GUIDE.md) | Concepts |
| [API](./docs/API.md) | Public exports |
| [Roadmap](./docs/ROADMAP.md) | What’s next (0.4 → 1.0) |
| [How-tos](./docs/how-to/README.md) | Short recipes |
| [Deploy](./docs/DEPLOY.md) · [Security](./docs/SECURITY.md) | Ship carefully |
| [Changelog](./CHANGELOG.md) | What changed |

## Repo layout (not all published)

| Path | Role |
|------|------|
| `src/`, `plugin/`, `packages/` | Published runtime + compiler + scaffold |
| `demo/`, `examples/` | Local demos |
| `crm/` | In-repo CRM sample (Postgres/SQLite) — not the npm package |
| `server/` | Demo HTTP/WS host — gated, not a production backend |

```bash
git clone https://github.com/loreste/cachou.git
cd cachou && npm install && npx playwright install chromium
npm run test:unit
npm run check   # full local CI-ish pipeline
```

## Status

- **1.0.10** on npm. The stable core is API-frozen; patch releases are the default. This is an API compatibility commitment, not evidence of broad production adoption.
- The project has a substantial implementation and test suite, but production readiness is not established. Long-running production usage, independent security review, broad device coverage, and ecosystem maturity remain unproven.
- Performance figures in [Benchmark Results](./docs/BENCHMARK_RESULTS.md) are project-run local regression measurements tied to a specific browser, machine, version, and workload; they are not universal framework comparisons.
- Before treating a release as fully validated, confirm that the required Linux/Chromium GitHub Actions workflow completed successfully for the exact release commit.
- Not a meta-framework: no hosted deploy adapters; small ecosystem. Optional Marketplace/Web Store listings not required for 1.0.
- Demo server APIs are for local demos only (`CACHOU_DEMO`); do not expose them publicly.

## License

MIT
