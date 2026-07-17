import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal } from "../../src/reactivity.js";
import { virtualList } from "../../src/virtual-list.js";

describe("virtualList", () => {
  it("windows items, preserves total height, and follows scroll position", () => {
    const [items] = signal(Array.from({ length: 100 }, (_, id) => ({ id })));
    const list = virtualList({
      each: items,
      itemHeight: 20,
      height: 100,
      overscan: 2,
      children: item => item
    });

    const initial = list.windowed();
    assert.equal(initial.totalHeight, 2000);
    assert.equal(initial.start, 0);
    assert.equal(initial.end, 9);
    assert.deepEqual(initial.items.map(entry => entry.item.id), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(initial.items[8].offset, 160);

    list.setScrollTop(600);
    const scrolled = list.windowed();
    assert.equal(scrolled.start, 28);
    assert.equal(scrolled.end, 37);
    assert.deepEqual(scrolled.items.map(entry => entry.item.id), [28, 29, 30, 31, 32, 33, 34, 35, 36]);
    assert.equal(scrolled.items[0].offset, 560);
  });
});
