# CachouJS Documentation

**Version:** 0.2.0 (experimental 0.x)  
**Package:** `cachoujs`

CachouJS is a fine-grained reactive JavaScript UI framework. Components set up once; signals update exact DOM bindings without a virtual DOM. An optional Go compiler turns `.cachou` single-file components into JS modules. Privileged server features in this repo are demo-only and gated by `CACHOU_DEMO`.

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
import { … } from "cachoujs"           // full runtime
import { … } from "cachoujs/html"
import { … } from "cachoujs/reactivity"
import { … } from "cachoujs/router"
import { … } from "cachoujs/forms"
import { … } from "cachoujs/a11y"
import { … } from "cachoujs/files"
import { cachou } from "cachoujs/vite" // Vite plugin
```

---

## Mental model (30 seconds)

1. **Setup runs once.** Component functions are not re-executed on every state change.
2. **Signals track dependencies.** Reading a signal inside an `effect` or reactive template binding subscribes that computation.
3. **DOM updates are local.** Only the text node, attribute, or list row that depends on a signal changes.
4. **Ownership cleans up.** Effects, resources, and listeners live under roots; disposing the root tears them down.
5. **Privilege stays on the server.** The browser runtime never reads the filesystem or runs SQL; demo endpoints are explicit and gated.

---

## Versioning

CachouJS is **0.x**. APIs may change between minor versions. Pin dependencies in production apps and read the [changelog](../CHANGELOG.md) before upgrading.
