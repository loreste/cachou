import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal, mapArray, createRoot } from "../../src/reactivity.js";

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
});
