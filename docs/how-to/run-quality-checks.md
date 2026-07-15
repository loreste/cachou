# Run Tests, Benchmarks, and Checks

## Unit tests (Node, no browser)

```bash
npm run test:unit
```

Covers reactivity basics, SSR context isolation helpers, demo-guard SQL sanitization, and filesystem adapter path safety.

## Browser tests

Default: **Playwright Chromium**.

```bash
npx playwright install chromium   # once
npm run test:browser
```

Force engine:

```bash
CACHOU_TEST_BROWSER=chromium npm run test:browser
CACHOU_TEST_BROWSER=safari npm run test:browser    # macOS only
```

Combined:

```bash
npm test   # unit + browser
```

## Guardrails

Static heuristics for cleanup, fetch abort patterns, and generated template artifacts:

```bash
npm run guardrails
```

## Compiler diagnostics

Negative cases (unclosed braces, CSS, tags) plus golden static/scoped compile:

```bash
node scripts/check-compiler-diagnostics.mjs
```

## Benchmarks

```bash
npm run bench              # regression vs benchmarks/baselines.json
npm run bench:memory       # leak / memory stress
npm run bench:compare      # vs React, Vue, Preact, Solid, Svelte, DOM floor
```

Publishable competitive runs:

```bash
CACHOU_COMPARE_SAMPLES=30 npm run bench:compare
```

See [Performance targets](../PERFORMANCE_TARGETS.md) and [Benchmark results](../BENCHMARK_RESULTS.md).

## Full pipeline (CI local)

```bash
npm run check
```

Includes syntax checks, unit tests, guardrails, compiler build/fixtures/diagnostics, Vite production build, browser tests, and benchmark smoke runs.

## Package contents

```bash
npm run pack:dry
```

Published tarball should stay small (runtime + compiler source + plugin + docs).

## CRM evidence

```bash
npm run crm:ci
```

Runs CRM QA and packages artifacts under `faydb-crm/artifacts/ci/<timestamp>/` (gitignored).
