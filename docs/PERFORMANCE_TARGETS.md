# Performance Targets

CachouJS should optimize for fast real UI updates and low developer overhead.

## Benchmark Contract

The competitive suite lives in `benchmarks/compare`.

Run it with:

```bash
npm run bench:compare
```

Use `CACHOU_COMPARE_SAMPLES=30 npm run bench:compare` for statistically stronger reports.

Memory and leak stress:

```bash
npm run bench:memory
```

Current built-in adapters:

- `DOM floor`: imperative DOM baseline. This is not a framework competitor.
- `CachouJS`: the framework runtime under test.
- `Framework A`
- `Framework B`
- `Framework C`
- `Framework D`
- `Framework E`

## Required Scenarios

- Initial render of 1,000 keyed rows.
- Text update fanout: 1,000 subscribers x 100 writes.
- Attribute/class update fanout: 1,000 subscribers x 100 writes.
- Keyed list reverse: 1,000 stable rows.
- Form input latency: 500 input events with state writes.
- Mount/unmount loop: 100 cycles.

## Rules for Fair Comparisons

- Each adapter should use idiomatic framework APIs.
- Do not use artificial wrappers or hidden imperative shortcuts unless that is the framework's normal recommendation.
- Run production builds when comparing final numbers.
- Record browser, machine, Node version, framework versions, and bundle mode.
- Treat the imperative DOM adapter as a lower bound, not a target framework.

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
