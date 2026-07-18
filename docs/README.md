# CachouJS Documentation

**Version:** 1.0.1 (stable core)  
**Package:** `cachoujs`

Fine-grained reactive JavaScript UI library. Components set up once; signals update exact DOM bindings (no virtual DOM). Optional `.cachou` SFC compiler (JS by default; native Go binary optional). Privileged server features in this monorepo are demo-only and gated by `CACHOU_DEMO`.

---

## Start here

| Audience | Read |
|----------|------|
| **Everyone (start here)** | **[Get Started](./GETTING_STARTED.md)** |
| Install details | [INSTALL.md](./INSTALL.md) · [how-to](./how-to/install-from-npm.md) |
| Building features | [Developer guide](./GUIDE.md) |
| Maintainers releasing | [PUBLISHING.md](./PUBLISHING.md) |
| Editor support | [VS Code extension](../vscode-cachou/README.md) · [how-to](./how-to/use-vscode-extension.md) |
| Looking up an API | [API reference](./API.md) |
| Template syntax | [Templates & directives](./TEMPLATES.md) |
| `.cachou` files | [Compiler reference](./COMPILER.md) |
| How it works inside | [Architecture](./ARCHITECTURE.md) |
| Shipping an app | [Deploy](./DEPLOY.md) |
| Threat model | [Security](./SECURITY.md) |
| Task recipes | [How-to guides](./how-to/README.md) |

---

## Documentation map

### Concepts & guides

- [Getting started](./GETTING_STARTED.md) — install, first app, repo tour, examples
- [Developer guide](./GUIDE.md) — reactivity, rendering, lists, resources, routing, SSR, forms, a11y, scheduler, debug
- [Templates & directives](./TEMPLATES.md) — `html` tagged templates, events, bind, class, style, ref
- [Compiler](./COMPILER.md) — `.cachou` SFC format, CLI flags, Vite plugin, scoping rules
- [Architecture](./ARCHITECTURE.md) — ownership, cleanup, SSR isolation, package layers
- [Roadmap](./ROADMAP.md) — current state, 0.6 ecosystem line / 1.0
- [1.0 commitment](./ONE_POINT_OH.md) — what is frozen at 1.0
- [Stability](./STABILITY.md) — stable / candidate / experimental export labels
- [Experimental surface](./EXPERIMENTAL.md) — subpath kits that may change
- [Deprecations](./DEPRECATIONS.md) — aliases kept in 1.x
- [TypeScript](./how-to/use-typescript.md) — `.d.ts` surface and subpath types
- [Environment variables](./ENVIRONMENT.md) — all supported env vars

### Reference

- [API reference](./API.md) — every public export with signatures and notes
- [Security](./SECURITY.md) — demo mode, sanitization, production checklist
- [Deploy](./DEPLOY.md) — static SPA vs Node SSR
- [Known limitations](./KNOWN_LIMITATIONS.md)
- [Performance targets](./PERFORMANCE_TARGETS.md)
- [Benchmark results](./BENCHMARK_RESULTS.md)

### How-to recipes

See **[how-to/README.md](./how-to/README.md)** for the full catalog (20+ guides), including:

- Setup, scaffold, quality checks, deploy, CRM  
- Components, state, templates, lists, resources, forms, routing, SSR  
- Security, a11y, debug, leaks/races, scheduler  
- `.cachou` compiler and demo file browser  

Suggested path: setup → components → state → templates → lists → resources → routing → security → deploy.

### Repo extras

- [Examples](../examples/README.md) — runnable `/examples/` app
- [Changelog](../CHANGELOG.md)
- [Root README](../README.md) — project overview
- [Server adapters](../server/adapters/README.md) — demo DB adapters

---

## Package entry points

```text
import { … } from "cachoujs"           // full runtime (Node + browser; includes content/media)
import { … } from "cachoujs/browser" // browser-safe entry (no server-only content/media graph)
import { … } from "cachoujs/html"
import { … } from "cachoujs/reactivity"
import { … } from "cachoujs/router"
import { … } from "cachoujs/forms"
import { … } from "cachoujs/a11y"
import { … } from "cachoujs/files"
import { … } from "cachoujs/styles"
import { … } from "cachoujs/transitions"
import { … } from "cachoujs/plugin"
import { … } from "cachoujs/content"   // Node-oriented content collections
import { … } from "cachoujs/image"
import { … } from "cachoujs/media"
import { … } from "cachoujs/ui"
import { … } from "cachoujs/utils"
import { cachou } from "cachoujs/vite" // Vite plugin (aliases to browser entry by default)
```

Prefer `cachoujs/browser` (or the Vite plugin’s default alias) for client bundles so
Node-only helpers stay out of the browser graph.

---

## Mental model (30 seconds)

1. **Setup runs once.** Component functions are not re-executed on every state change.
2. **Signals track dependencies.** Reading a signal inside an `effect` or reactive template binding subscribes that computation.
3. **DOM updates are local.** Only the text node, attribute, or list row that depends on a signal changes.
4. **Ownership cleans up.** Effects, resources, and listeners live under roots; disposing the root tears them down.
5. **Privilege stays on the server.** The browser runtime never reads the filesystem or runs SQL; demo endpoints are explicit and gated.

---

## Versioning

CachouJS **1.0** freezes the **stable** core. Published line is **1.0.x** (current: **1.0.1**, next: **1.0.1**). Experimental kits may still change — pin tightly. Read the [changelog](../CHANGELOG.md) and [ONE_POINT_OH.md](./ONE_POINT_OH.md).
