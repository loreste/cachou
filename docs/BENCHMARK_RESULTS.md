# Benchmark Results

Run the project’s local comparison benchmarks with:

```bash
npm run bench:compare
```

Current adapters:

- DOM floor
- CachouJS
- React
- Vue
- Preact
- Solid
- Svelte

The comparison runner records multiple samples per adapter/scenario and reports median, p95, min/max, mean, and standard deviation. It builds a production bundle by default; set `CACHOU_COMPARE_SAMPLES=30` for publishable local runs. Development-server comparisons require the explicit `CACHOU_COMPARE_MODE=dev` opt-in and are diagnostic only.

These are project-run regression measurements, not independent validation or universal framework performance claims. Results depend on the browser, hardware, runtime, framework versions, bundle mode, sample count, and workload construction. Keep every published comparison attached to that metadata and avoid generalizing a rank from one local run.

Set `CACHOU_COMPARE_REPORT_PATH=/tmp/cachou-compare-report.json` to persist a
reproducible report. Reports include the sample and cleanup contract, browser
details, host/runtime details, installed framework versions, and tooling
versions alongside the measurements. The historical summary keeps the same
metadata so runs from different environments are not compared anonymously.

Latest project-run production Chromium sample (`CACHOU_COMPARE_SAMPLES=10`, 2026-07-17, local macOS / Playwright Chromium):

```text
Competitive benchmarks (playwright-chromium, production): 49/49 completed

initial rows: CachouJS 0.90ms, rank 3/7 (Solid 0.60ms, DOM 0.70ms)
text fanout: CachouJS 5.20ms, rank 1/7
attribute fanout: CachouJS 7.60ms, rank 2/7 (DOM floor 5.40ms)
keyed reverse: CachouJS 1.20ms, rank 2/7 (DOM floor 0.80ms)
form input latency: CachouJS 0.10ms, rank 2/7 (tied with DOM floor at 0.10ms)
mount unmount loop: CachouJS 3.00ms, rank 2/7 (DOM floor 2.50ms)
dashboard refresh: CachouJS 1.10ms, rank 1/7
```

SSR suite (`npm run bench:ssr`, same machine):

```text
static string: 1.67ms median / 1000 iters (≈597k ops/s)
one-pass preload: 1.62ms median / 500 iters
async resource rerender: 2.80ms median / 250 iters
streaming resource: 12.35ms median / 250 iters
concurrent request isolation: 49.70ms median / 20 iters (32-way isolation workload)
SSR benchmarks: 5/5 passed
```

Memory suite (`npm run bench:memory`): **8/8 passed** (mount/unmount, keyed reverse/permute, conditional teardown, cancelled resources, cache bound).

Historical Safari smoke run (`CACHOU_COMPARE_SAMPLES=3`, bundle mode not recorded):

```text
initial rows: CachouJS 1.00ms, rank 2/7
text fanout: CachouJS 5.00ms, rank 1/7
attribute fanout: CachouJS 6.00ms, rank 2/7
keyed reverse: CachouJS 1.00ms, rank 2/7
form input latency: CachouJS 0.00ms, rank 2/7
mount unmount loop: CachouJS 3.00ms, rank 2/7
dashboard refresh: CachouJS 1.00ms, rank 3/7
```

Interpretation:

- Initial render measures creation and attachment only. Its disposer runs after the sample; the separate mount/unmount scenario measures teardown in the timed interval.
- The DOM adapter clears its target for non-lifecycle scenarios, so it pays the same cleanup cost as the framework adapters.
- In this specific production Chromium run, CachouJS ranked first on **text fanout** and **dashboard refresh**, and was close to the framework leaders on initial rows, keyed reverse, attributes, forms, and lifecycle. The DOM floor remains faster on most creation-heavy scenarios, as expected for an imperative lower bound. This is a local result, not a universal claim that CachouJS is faster than other frameworks.
- Direct DOM signal subscribers use a dense no-copy notification lane with churn-safe compaction; batched notifications retain the latest value for property and attribute bindings, and DOM event handlers coalesce synchronous writes into one commit.
- Signal-backed `class:` bindings use a dedicated dense update lane when all subscribers are class bindings; mixed subscriber graphs retain the generic mutation-safe dispatch path.
- Template shape classification is cached separately from document-owned template clones, and class directives subscribe directly without an update wrapper.
- Single attribute-free elements with one non-reactive child bypass template cloning, and multi-node child replacement uses the parent's `replaceChildren` path when the placeholder is its only child, with variadic `replaceWith` as the fallback.
- `render`/`mount` skip cleanup-tree traversal for roots that were never marked with node cleanups, and `cleanupNode` returns before static subtree scans when no marker exists; post-attachment marker propagation keeps detached child listeners disposable.
- Grouped child attachment marks a common cleanup parent once while retaining
  detached descendant markers, reducing repeated ancestor walks without changing
  disposal order.
- CachouJS uses direct safe table-cell construction for primitive row templates,
  including a two-cell row fast path, and the keyed benchmark uses
  `mapArray(..., { reactiveItems: false, uniqueKeys: true })` for stable unique
  rows. Reordering still goes through the general cleanup-aware reconciliation
  path.
- Unique keyed initial mapping batches its detached ownership boundary, avoiding one owner switch per row while preserving the same tracking and disposal behavior.
- DOM floor is included as a lower bound, not as a framework competitor.

The dashboard workload is the first application-shaped comparison: all
adapters mount 200 nested metric cards, commit 50 visible refreshes, assert the
last committed value, and dispose the tree inside the measured operation. In
the latest production Chromium run (10 samples) CachouJS measured **1.10ms** median on
dashboard refresh, compared with the DOM floor at 1.20ms and Solid at 1.40ms. In the
Safari smoke run, CachouJS measured 1.00ms, matching the DOM floor and Solid;
Safari's millisecond timer resolution makes close ranks noisy.

Last refreshed: **2026-07-17** (v1.0.6 line).

Compiler static DOM microbenchmark (Chromium, 7 samples, 10,000 renders):

```text
compiler-shaped createElement factory: 5.70ms median
htmlStatic cached template clone:      6.10ms median
generic html template:                 5.80ms median
```

This workload is intentionally narrow: it measures safe static markup that the
compiler can prove does not need HTML entity decoding, namespaces, raw-text
handling, or reactive bindings. The direct factory is currently about 6.6%
faster than `htmlStatic` here, while generic `html` is effectively tied. It is
an initial-render optimization, not evidence that every component should bypass
the runtime.

SSR throughput (5 samples, local Node run; concurrent isolation is measured as
32 overlapping requests per iteration):

```text
static string: 1,012,402 ops/s median
one-pass preload: 631,646 ops/s median
async resource rerender: 254,076 ops/s median
streaming resource: 43,521 ops/s median
concurrent request isolation: 451 batches/s median
```

Each concurrent batch contains 32 overlapping requests and verifies isolated
body output, head metadata, and serialized state. This is a local regression
baseline, not a cross-machine throughput claim.

Compiled CRM workflow (Chromium, 30 local production samples):

```text
overview readiness: 62.59ms median, 73.14ms p95
load 5,000 contacts: 5.50ms median, 6.90ms p95
search 5,000 -> 1: 27.60ms median, 29.00ms p95
40-view route churn: 2.30ms median, 4.00ms p95
```

The workload verifies the complete 5,000-record scroll height, reaches contact
5,000, returns to the top, and keeps the rendered contact window bounded before
timing search. Windowed rendering uses the shipped `virtualList` helper, so
large datasets remain searchable without mounting thousands of interactive DOM
rows at once. The route-churn measurement benefits from event-boundary batching;
search remains intentionally background-scheduled and should be compared with
the full sample distribution rather than one median alone.

Scheduler change smoke comparison (Chromium, 5 production samples on the same
host; rerun with `CRM_PERF_SAMPLES=10 npm run crm:perf` before publishing):

```text
                         before     after
load 5,000 contacts      7.20ms     6.90ms
search 5,000 -> 1       25.10ms    13.80ms
40-view route churn      3.10ms     2.90ms
```

The after run passed the complete workload. Search p95 remained `28.10ms`, so
the median improvement is directional evidence rather than a cross-machine
performance claim.

Latest CRM verification (Chromium, 10 local production samples, 2026-07-17):

```text
overview readiness: 62.02ms median, 69.78ms p95
load 5,000 contacts: 6.00ms median, 6.70ms p95
search 5,000 -> 1: 28.00ms median, 30.30ms p95
40-view route churn: 2.40ms median, 2.80ms p95
```

This run passed the complete scroll, search, and route-churn assertions. The
values are a same-host regression sample, not a universal latency guarantee.

Next optimization targets:

1. Repeat the CRM scheduler/search run with 10 or more samples across representative machines.
2. Keep dashboard and form/input latency near the DOM floor without weakening cleanup ownership.
3. Expand route-loader cancellation and retained-memory traces before changing router or resource scheduling.
