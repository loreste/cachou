# Set Up Local Development

Use this when you want to run the demo app, edit framework code, or work on `.cachou` components.

## Requirements

- **Node.js 20+** for Vite, scripts, server APIs, and builds.
- **Go 1.22+** only if you rebuild the compiler binary (`npm run compiler:build`). Day-to-day compile uses the binary if present, else `go run`.
- **Playwright Chromium** for default browser tests: `npx playwright install chromium`.
- Safari remains optional on macOS (`CACHOU_TEST_BROWSER=safari`).

## Install

```bash
npm install
npx playwright install chromium
```

Copy env defaults if useful:

```bash
cp .env.example .env
```

## Start the dev server

```bash
npm run dev
```

This compiles demo `.cachou` components and starts Vite with **demo APIs enabled** (`CACHOU_DEMO=1`).

| URL | Purpose |
|-----|---------|
| `/demo` | Main demo |
| `/examples/` | Runnable examples |
| `/tests/` | Browser test page |
| `/benchmarks/` | Perf harness |

## Change the port

```bash
PORT=8080 npm run dev
# or
CACHOU_PORT=8080 npm run dev
```

## Rebuild the compiler binary

After editing `compiler.go`:

```bash
npm run compiler:build
npm run compile
```

Skip automatic postinstall builds:

```bash
CACHOU_SKIP_COMPILER_BUILD=1 npm install
```

## Scaffold a standalone app

```bash
node create-cachou/index.js my-app
cd my-app && npm install && npm run dev
```

## Verify the workspace

```bash
npm run test:unit
npm run test:browser
npm run check
```

## Next

- [Getting started](../GETTING_STARTED.md)
- [Developer guide](../GUIDE.md)
- [Environment variables](../ENVIRONMENT.md)
