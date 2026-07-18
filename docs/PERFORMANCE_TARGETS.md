# Performance Targets

CachouJS should optimize for fast real UI updates and low developer overhead.

## Benchmark Contract

The competitive suite lives in `benchmarks/compare`.

Run it with:

```bash
npm run bench:compare
```

The runner builds and serves a production bundle by default, then drives it with
the selected browser. Use `CACHOU_COMPARE_SAMPLES=30 npm run bench:compare` for
statistically stronger reports. Set `CACHOU_COMPARE_MODE=dev` only when
debugging the comparison page interactively; development-server numbers are not
release measurements.

Memory and leak stress:

```bash
npm run bench:memory
```

The memory gate currently exercises 1,000 mount/unmount cycles, 1,000 keyed
reversals, 2,000 seeded arbitrary keyed permutations with DOM-order checks,
1,000 conditional teardown cycles with event handlers, 200 cancelled async
resources, and 512 unique resource-cache keys under a 64-entry bound. It must
finish with no live reactive owners, an empty target DOM, and no cache growth
beyond the configured bound.

SSR throughput and isolation paths:

```bash
npm run bench:ssr
```

The SSR suite measures static string rendering, one-pass route preload, the
two-pass async resource path, streaming resources, and concurrent request
isolation with warmup and repeated median samples.

### Latest reference medians (local, 2026-07-17)

These are local regression baselines for the listed machine and workload, not
cross-machine throughput guarantees or independent framework rankings. See
[Benchmark Results](./BENCHMARK_RESULTS.md) for the comparison metadata and
interpretation requirements.

| Scenario | Median | Notes |
|----------|--------|--------|
| Static `renderToString` ×1000 | ~1.7ms | High ops/s string path |
| One-pass preload ×500 | ~1.6ms | |
| Async resource rerender ×250 | ~2.8ms | Two-pass discovery |
| Streaming resource ×250 | ~12ms | Shell + body |
| Concurrent isolation ×20 | ~50ms | Overlapping contexts |

Competitive browser numbers live in [BENCHMARK_RESULTS.md](./BENCHMARK_RESULTS.md).
Refresh both docs when release-relevant numbers move for real reasons (not noise).

Current built-in adapters:

- `DOM floor`: imperative DOM baseline. This is not a framework competitor.
- `CachouJS`: the framework runtime under test.
- `React`
- `Vue`
- `Preact`
- `Solid`
- `Svelte`

## Required Scenarios

- Initial render of 1,000 keyed rows.
- Text update fanout: 1,000 subscribers x 100 writes.
- Attribute/class update fanout: 1,000 subscribers x 100 writes.
- Keyed list reverse: 1,000 stable rows.
- Form input latency: 500 input events with state writes.
- Mount/unmount loop: 100 cycles.
- Dashboard refresh: 200 nested metric cards x 50 committed updates.
- Conditional teardown: remove 1,000 reactive children in one committed update.
- Concurrent SSR: 32 overlapping requests with async data, head metadata, and
  per-request serialized state.
- Rapid navigation: 256 superseding memory-history navigations with async guards.

The compiled CRM proving ground adds an application-shaped browser gate:

```bash
npm run crm:perf
```

It signs into the compiled CRM, loads 5,000 contacts, verifies the complete
list, measures search down to one result, churns through 40 views, and fails on
page errors or failed requests. Run `CRM_PERF_SAMPLES=10 npm run crm:perf` for a
stronger local baseline. The runner serves a production bundle by default;
`CRM_PERF_MODE=dev` is available for interactive debugging and is diagnostic
only. The workload is diagnostic rather than a release threshold until it has
been collected across representative machines.

## Rules for Fair Comparisons

- Each adapter should use idiomatic framework APIs.
- Do not use artificial wrappers or hidden imperative shortcuts unless that is the framework's normal recommendation.
- Initial-render timings include creation and attachment only; adapter cleanup runs after the timed sample.
- The mount/unmount scenario includes both creation and teardown by design.
- All non-lifecycle adapters clear their target during the sample so the DOM baseline does not omit cleanup work.
- Run production builds when comparing final numbers.
- Record browser, machine, Node version, framework versions, and bundle mode.
- Treat project-run measurements as evidence for regression tracking, not as
  universal performance claims or independent validation.
- `CACHOU_COMPARE_REPORT_PATH` records that comparison metadata with the
  measurements, including the sample and cleanup contract.
- Treat the imperative DOM adapter as a lower bound, not a target framework.
- Every application-shaped update workload must assert that the final visible
  value committed before the adapter disposes, so stale-render bugs cannot win
  the timing comparison.

The DOM runtime may specialize templates whose interpolations are proven
primitive text values. These paths must preserve text escaping, cleanup, and
hydration behavior; arbitrary values continue through the general binding
path.

The canonical compiler may emit direct DOM factories for a conservative subset
of fully static templates. Markup with entities, namespaces, raw-text elements,
or ambiguous HTML structure must remain on `htmlStatic` so browser parsing
semantics stay identical.

## Optimization Policy

Optimize only when a benchmark, profile, or real application trace shows a loss.

Priority order:

1. Correctness.
2. Memory safety and cleanup.
3. Input/update latency.
4. Initial render.
5. Bundle size.
6. API convenience.

The goal is not to win a synthetic benchmark by making the API worse. CachouJS should stay fast while staying simple to write.

Application-shaped workloads are the performance gate. A change is worthwhile
when it improves dashboard/input latency, navigation cancellation, SSR
throughput, or retained-memory behavior without weakening correctness. Synthetic
initial-render wins are secondary and must not justify extra ownership or
cancellation complexity.

Observability is opt-in on the hot path: with no framework-event listeners,
logger sink, or sampled trace, event emission must return without normalizing
request context or allocating diagnostic payloads. Listener-enabled logging and
tracing are measured separately because they are deliberate operational costs.
