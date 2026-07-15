# Monorepo packages

Cachou publishes multiple npm packages from this repository.

| Package | Path | npm | Role |
|---------|------|-----|------|
| **`cachoujs`** | repo root | [cachoujs](https://www.npmjs.com/package/cachoujs) | Browser runtime, Vite plugin, docs |
| **`@cachoujs/compiler`** | `packages/compiler` | [@cachoujs/compiler](https://www.npmjs.com/package/@cachoujs/compiler) | Pure JS `.cachou` compiler |
| **`@cachoujs/create`** | `packages/create-cachou` | [@cachoujs/create](https://www.npmjs.com/package/@cachoujs/create) | App scaffold CLI |

## Users

See **[docs/INSTALL.md](../docs/INSTALL.md)**:

```bash
npm install cachoujs
npx @cachoujs/create my-app
```

## Maintainers

See **[docs/PUBLISHING.md](../docs/PUBLISHING.md)**.

```bash
# bump patch first (0.4.0 → 0.4.1 → 0.4.2 …) — never republish the same version
# keep cachoujs, @cachoujs/compiler, @cachoujs/create on the same version
npm run publish:prep
npm publish --access public
npm publish -w @cachoujs/compiler --access public
npm publish -w @cachoujs/create --access public
```

## Workspaces

Root `package.json`:

```json
"workspaces": ["packages/compiler", "packages/create-cachou"]
```

## Optional native multi-arch binaries

```bash
npm run compiler:build:multiarch
# → bin/dist/cachou-compiler-<os>-<arch>
```

JS compiler remains the portable default.

## Browser DevTools extension

Load unpacked: `extensions/browser-devtools/`  
See that folder’s README.
