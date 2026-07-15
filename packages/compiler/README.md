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

This package ships a **pure JavaScript** implementation (no Go required).  
The monorepo may also build native `bin/cachou-compiler` binaries via Go for speed; the root wrapper prefers native, then JS.
