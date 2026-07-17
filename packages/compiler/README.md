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
launcher and Vite plugin use it by default so output is predictable across platforms.

Optional multi-arch native **launchers** (still calling this JS compiler) can be built in the
monorepo with `npm run compiler:build:multiarch` and packaged as GitHub release assets with
`npm run compiler:package-binaries`. They are not part of this npm package. Set
`CACHOU_COMPILER_NATIVE=1` only when you intentionally want those launchers.

## Diagnostics

Compile errors report absolute `file:line:column`, a caret, and an actionable `hint:` for common
SFC mistakes. See the monorepo [COMPILER.md](../../docs/COMPILER.md).
