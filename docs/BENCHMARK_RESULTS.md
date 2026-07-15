# Benchmark Results

Run competitive benchmarks with:

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

The competitive runner records multiple samples per adapter/scenario and reports median, p95, min/max, mean, and standard deviation. Set `CACHOU_COMPARE_SAMPLES=30` for publishable local runs.

Latest local run:

```text
Competitive benchmarks: 42/42 completed

initial rows: CachouJS rank 2/7
text fanout: CachouJS rank 1/7
attribute fanout: CachouJS rank 2/7
keyed reverse: CachouJS rank 3/7
form input latency: CachouJS rank 2/7
mount unmount loop: CachouJS rank 3/7
```

Interpretation:

- CachouJS is leading or tied for the framework lead on initial rows, text fanout, class/attribute fanout, and form input latency in the latest local run.
- CachouJS is within 1ms of the leading framework on keyed reverse and mount/unmount in the latest local run.
- `render`/`mount` skip cleanup-tree traversal for roots that were never marked with node cleanups, and static `mount` disposers avoid the root-disposer map.
- CachouJS now uses `mapArray(..., { reactiveItems: false, uniqueKeys: true })` for stable unique benchmark rows, plus a full-reverse list fast path.
- Solid is the strongest framework competitor in these local scenarios.
- React is consistently slower on these synchronous update-heavy cases.
- DOM floor is included as a lower bound, not as a framework competitor.

Next optimization targets:

1. Push keyed reverse from framework-tied to consistently faster than framework competitors.
2. Push class/attribute fanout closer to the DOM floor.
3. Keep mount/unmount ahead of framework competitors under repeated median runs.
