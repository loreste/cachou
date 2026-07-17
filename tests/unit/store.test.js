import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { store, effect, createRoot, batch } from "../../src/reactivity.js";

describe("store", () => {
  it("tracks nested property reads", () => {
    createRoot(dispose => {
      const state = store({ user: { name: "Ada" } });
      let seen = "";
      effect(() => {
        seen = state.user.name;
      });
      assert.equal(seen, "Ada");
      state.user.name = "Grace";
      assert.equal(seen, "Grace");
      dispose();
    });
  });

  it("batches nested writes", () => {
    createRoot(dispose => {
      const state = store({ a: 1, b: 2 });
      let runs = 0;
      effect(() => {
        void state.a;
        void state.b;
        runs++;
      });
      assert.equal(runs, 1);
      batch(() => {
        state.a = 3;
        state.b = 4;
      });
      assert.equal(runs, 2);
      dispose();
    });
  });

  it("tracks array length and batches mutating methods", () => {
    createRoot(dispose => {
      const state = store({ items: [] });
      let runs = 0;
      effect(() => {
        state.items.length;
        runs++;
      });

      assert.equal(state.items.push("a"), 1);
      assert.equal(state.items.length, 1);
      assert.equal(runs, 2);

      state.items.unshift("b");
      assert.deepEqual([...state.items], ["b", "a"]);
      assert.equal(runs, 3);
      dispose();
    });
  });

  it("invalidates subscribers for indices removed by length truncation", () => {
    createRoot(dispose => {
      const state = store({ items: ["a", "b"] });
      let seen;
      effect(() => {
        seen = state.items[1];
      });
      assert.equal(seen, "b");
      state.items.length = 1;
      assert.equal(seen, undefined);
      dispose();
    });
  });
});
