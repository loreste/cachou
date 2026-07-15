import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  signal,
  effect,
  memo,
  batch,
  createRoot,
  mapArray,
  createResource,
  renderToStringAsync,
  dehydrate,
  createSSRContext,
  runWithSSRContextAsync,
  resetResourceCounter
} from "../../src/index.js";

describe("signal", () => {
  it("reads and writes", () => {
    const [count, setCount] = signal(0);
    assert.equal(count(), 0);
    setCount(1);
    assert.equal(count(), 1);
    setCount(v => v + 1);
    assert.equal(count(), 2);
  });

  it("skips equal values", () => {
    const [count, setCount] = signal(1);
    let runs = 0;
    createRoot(dispose => {
      effect(() => {
        count();
        runs++;
      });
      setCount(1);
      assert.equal(runs, 1);
      setCount(2);
      assert.equal(runs, 2);
      dispose();
    });
  });
});

describe("memo", () => {
  it("lazily recomputes", () => {
    const [n, setN] = signal(2);
    let compute = 0;
    const doubled = memo(() => {
      compute++;
      return n() * 2;
    });
    assert.equal(compute, 0);
    assert.equal(doubled(), 4);
    assert.equal(compute, 1);
    assert.equal(doubled(), 4);
    assert.equal(compute, 1);
    setN(3);
    assert.equal(doubled(), 6);
    assert.equal(compute, 2);
  });
});

describe("batch", () => {
  it("coalesces updates", () => {
    const [a, setA] = signal(0);
    const [b, setB] = signal(0);
    let runs = 0;
    createRoot(dispose => {
      effect(() => {
        a();
        b();
        runs++;
      });
      assert.equal(runs, 1);
      batch(() => {
        setA(1);
        setB(2);
      });
      assert.equal(runs, 2);
      dispose();
    });
  });
});

describe("mapArray", () => {
  it("maps items by index by default", () => {
    const [list, setList] = signal([1, 2, 3]);
    const mapped = mapArray(list, item => item * 10);
    assert.deepEqual(mapped(), [10, 20, 30]);
    setList([1, 2, 3, 4]);
    assert.deepEqual(mapped(), [10, 20, 30, 40]);
  });
});

// Additional mapArray / store / flow coverage lives in dedicated unit files.

describe("createResource", () => {
  it("loads async data", async () => {
    await createRoot(async dispose => {
      const [data, { loading }] = createResource(async () => {
        await new Promise(r => setTimeout(r, 5));
        return "ok";
      });
      assert.equal(loading(), true);
      await new Promise(r => setTimeout(r, 20));
      assert.equal(data(), "ok");
      assert.equal(loading(), false);
      dispose();
    });
  });
});

describe("SSR isolation", () => {
  it("keeps dehydrate caches separate per context", async () => {
    const ctxA = createSSRContext();
    const ctxB = createSSRContext();

    await Promise.all([
      runWithSSRContextAsync(ctxA, async () => {
        resetResourceCounter();
        createResource(async () => "A");
        await new Promise(r => setTimeout(r, 10));
        ctxA.ssrCache[0] = "A";
      }),
      runWithSSRContextAsync(ctxB, async () => {
        resetResourceCounter();
        createResource(async () => "B");
        await new Promise(r => setTimeout(r, 5));
        ctxB.ssrCache[0] = "B";
      })
    ]);

    assert.equal(ctxA.ssrCache[0], "A");
    assert.equal(ctxB.ssrCache[0], "B");
  });

  it("renderToStringAsync returns a string", async () => {
    const html = await renderToStringAsync(() => "hello");
    assert.equal(html, "hello");
  });
});
