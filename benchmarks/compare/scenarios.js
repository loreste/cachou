export const rowCount = 1000;
export const updateCount = 100;
export const formInputCount = 500;
export const mountLoopCount = 100;

export function makeRows(count, offset = 0) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({ id: i + 1 + offset, label: `Row ${i + 1 + offset}` });
  }
  return rows;
}

export const scenarios = [
  {
    name: "initial rows",
    notes: "Render 1,000 keyed rows",
    run(adapter, target) {
      return adapter.initialRows(target, makeRows(rowCount));
    }
  },
  {
    name: "text fanout",
    notes: "1,000 text subscribers x 100 updates",
    run(adapter, target) {
      return adapter.textFanout(target, rowCount, updateCount);
    }
  },
  {
    name: "attribute fanout",
    notes: "1,000 class subscribers x 100 updates",
    run(adapter, target) {
      return adapter.attributeFanout(target, rowCount, updateCount);
    }
  },
  {
    name: "keyed reverse",
    notes: "Reverse 1,000 stable rows",
    run(adapter, target) {
      return adapter.keyedReverse(target, makeRows(rowCount));
    }
  },
  {
    name: "form input latency",
    notes: "500 input-state writes",
    run(adapter, target) {
      return adapter.formInput(target, formInputCount);
    }
  },
  {
    name: "mount unmount loop",
    notes: "100 mount/unmount cycles of 100 nodes",
    run(adapter, target) {
      return adapter.mountUnmount(target, mountLoopCount);
    }
  }
];
