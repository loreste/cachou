import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal, mapArray, createRoot, onCleanup } from "../../src/reactivity.js";

describe("mapArray", () => {
  it("maps and grows", () => {
    const [list, setList] = signal([1, 2]);
    const mapped = mapArray(list, n => n * 2);
    assert.deepEqual(mapped(), [2, 4]);
    setList([1, 2, 3]);
    assert.deepEqual(mapped(), [2, 4, 6]);
  });

  it("reorders by key without losing mapped identity shape", () => {
    createRoot(dispose => {
      const [list, setList] = signal([
        { id: "a", v: 1 },
        { id: "b", v: 2 },
        { id: "c", v: 3 }
      ]);
      const mapped = mapArray(
        list,
        item => ({ key: item.id, v: item.v }),
        item => item.id,
        { uniqueKeys: true }
      );
      assert.deepEqual(
        mapped().map(x => x.key),
        ["a", "b", "c"]
      );
      setList([
        { id: "c", v: 3 },
        { id: "a", v: 1 },
        { id: "b", v: 2 }
      ]);
      assert.deepEqual(
        mapped().map(x => x.key),
        ["c", "a", "b"]
      );
      dispose();
    });
  });

  it("reuses unique entries through repeated full reversals", () => {
    const rows = Array.from({ length: 32 }, (_, id) => ({ id }));
    const [list, setList] = signal(rows);
    const mapped = mapArray(
      list,
      item => ({ id: item.id }),
      item => item.id,
      { reactiveItems: false, uniqueKeys: true }
    );
    const initial = mapped();

    for (let cycle = 1; cycle <= 2000; cycle++) {
      const reversed = cycle % 2 === 1;
      setList(reversed ? rows.slice().reverse() : rows);
      const result = mapped();
      for (let index = 0; index < rows.length; index++) {
        const sourceIndex = reversed ? rows.length - index - 1 : index;
        assert.equal(result[index], initial[sourceIndex]);
        assert.equal(result[index].id, rows[sourceIndex].id);
      }
    }
  });

  it("skips key recomputation for immutable identity reversals", () => {
    const rows = Array.from({ length: 16 }, (_, id) => ({ id }));
    let keyCalls = 0;
    const [list, setList] = signal(rows);
    const mapped = mapArray(
      list,
      item => item.id,
      item => {
        keyCalls++;
        return item.id;
      },
      { reactiveItems: false, uniqueKeys: true }
    );

    mapped();
    keyCalls = 0;
    setList(rows.slice().reverse());
    assert.deepEqual(mapped(), rows.map(row => row.id).reverse());
    assert.equal(keyCalls, 0);
  });

  it("builds the unique lookup lazily for arbitrary updates", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const [list, setList] = signal(rows);
    const mapped = mapArray(
      list,
      item => ({ id: item.id }),
      item => item.id,
      { reactiveItems: false, uniqueKeys: true }
    );
    const initial = mapped();

    assert.deepEqual(mapped(), initial, "Repeated reads preserve initial mapped identity");
    setList([rows[2], rows[0], rows[1]]);
    const reordered = mapped();
    assert.equal(reordered[0], initial[2]);
    assert.equal(reordered[1], initial[0]);
    assert.equal(reordered[2], initial[1]);
  });

  it("reuses immutable keyed results when the list identity is unchanged", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    let keyCalls = 0;
    const [list, setList] = signal(rows);
    const mapped = mapArray(
      list,
      item => ({ id: item.id }),
      item => {
        keyCalls++;
        return item.id;
      },
      { reactiveItems: false, uniqueKeys: true }
    );

    const initial = mapped();
    keyCalls = 0;
    assert.equal(mapped(), initial);
    assert.equal(keyCalls, 0);

    setList(rows.slice());
    mapped();
    assert.equal(keyCalls, rows.length, "A new array identity still validates its keys");
  });

  it("handles empty lists", () => {
    const [list, setList] = signal([]);
    const mapped = mapArray(list, x => x, x => x);
    assert.deepEqual(mapped(), []);
    setList([1]);
    assert.deepEqual(mapped(), [1]);
    setList([]);
    assert.deepEqual(mapped(), []);
  });

  it("prepends items", () => {
    const [list, setList] = signal([{ id: 2 }]);
    const mapped = mapArray(list, i => i.id, i => i.id, { uniqueKeys: true });
    assert.deepEqual(mapped(), [2]);
    setList([{ id: 1 }, { id: 2 }]);
    assert.deepEqual(mapped(), [1, 2]);
  });

  it("disposes per-item ownership when rows leave the list", () => {
    createRoot(dispose => {
      const [list, setList] = signal([
        { id: "a" },
        { id: "b" },
        { id: "c" }
      ]);
      const disposed = [];
      const mapped = mapArray(
        list,
        item => {
          onCleanup(() => disposed.push(item.id));
          return item.id;
        },
        item => item.id,
        { uniqueKeys: true, reactiveItems: false }
      );
      assert.deepEqual(mapped(), ["a", "b", "c"]);
      setList([{ id: "a" }, { id: "c" }]);
      assert.deepEqual(mapped(), ["a", "c"]);
      assert.deepEqual(disposed, ["b"], "Removed keyed row disposes its root");
      dispose();
      assert.deepEqual(disposed.sort(), ["a", "b", "c"], "Owner dispose tears down surviving rows");
    });
  });

  it("reorders without disposing reused unique rows", () => {
    createRoot(dispose => {
      const [list, setList] = signal([{ id: "a" }, { id: "b" }]);
      const disposed = [];
      const mapped = mapArray(
        list,
        item => {
          onCleanup(() => disposed.push(item.id));
          return item.id;
        },
        item => item.id,
        { uniqueKeys: true, reactiveItems: false }
      );
      assert.deepEqual(mapped(), ["a", "b"]);
      setList([{ id: "b" }, { id: "a" }]);
      assert.deepEqual(mapped(), ["b", "a"]);
      assert.deepEqual(disposed, [], "Reorder must not dispose reused unique rows");
      setList([{ id: "a" }]);
      assert.deepEqual(mapped(), ["a"]);
      assert.deepEqual(disposed, ["b"]);
      dispose();
    });
  });

  it("disposes non-unique rows when they leave", () => {
    createRoot(dispose => {
      const [list, setList] = signal(["x", "y"]);
      const disposed = [];
      const mapped = mapArray(list, (item, index) => {
        onCleanup(() => disposed.push(`${item}:${index}`));
        return item;
      });
      assert.deepEqual(mapped(), ["x", "y"]);
      setList(["x"]);
      assert.deepEqual(mapped(), ["x"]);
      assert.equal(disposed.length, 1, "One row root disposed on shrink");
      dispose();
    });
  });
});
