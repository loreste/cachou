# Competitive Benchmark Adapters

Each adapter exports an object with this shape:

```javascript
export const myAdapter = {
  name: "Framework Name",
  initialRows(target, rows) {},
  textFanout(target, count, updates) {},
  attributeFanout(target, count, updates) {},
  keyedReverse(target, rows) {},
  formInput(target, count) {},
  mountUnmount(target, loops) {}
};
```

Keep adapters intentionally direct. Do not add artificial wrappers that a real application would not use.

The built-in `DOM floor` adapter is not a framework competitor. It is the lower-level imperative browser baseline that shows how close CachouJS is to direct DOM operations.

Current framework adapters:

- CachouJS
- React
- Vue
- Preact
- Solid
- Svelte
