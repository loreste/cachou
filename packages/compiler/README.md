# @cachoujs/compiler

Cross-platform **`.cachou` → JS** compiler for CachouJS (pure JavaScript — no Go required).

## Install

```bash
npm install -D @cachoujs/compiler
```

Also available via the main package in many setups; this package is the standalone compiler.

## CLI

```bash
npx cachou-compiler -file src/Button.cachou -out src
npx cachou-compiler -dir src/components -out src/components -runtime cachoujs
```

## API

```js
import { compileFile, compileDir } from "@cachoujs/compiler";

compileFile("src/Hi.cachou", { outDir: "src", runtime: "cachoujs" });
compileDir("src/components", { outDir: "src/components", runtime: "cachoujs" });
```

## Engine

This package ships the **canonical pure JavaScript** implementation (no Go required). The root
launcher and Vite plugin use it first so output is predictable across platforms. The older Go
implementation can still be built for investigation with `npm run compiler:build`, but it is not
the supported compilation path.
