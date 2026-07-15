import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createSSRContext,
  runWithSSRContextAsync,
  renderToStringAsync,
  dehydrate
} from "../../src/index.js";

describe("SSR concurrent isolation", () => {
  it("keeps separate caches under overlapping async work", async () => {
    const a = createSSRContext();
    const b = createSSRContext();

    await Promise.all([
      runWithSSRContextAsync(a, async () => {
        a.ssrCache[0] = "from-a";
        await new Promise(r => setTimeout(r, 15));
        assert.equal(a.ssrCache[0], "from-a");
      }),
      runWithSSRContextAsync(b, async () => {
        b.ssrCache[0] = "from-b";
        await new Promise(r => setTimeout(r, 5));
        assert.equal(b.ssrCache[0], "from-b");
      })
    ]);

    assert.equal(a.ssrCache[0], "from-a");
    assert.equal(b.ssrCache[0], "from-b");
  });

  it("dehydrate works after renderToStringAsync", async () => {
    const html = await renderToStringAsync(() => "page");
    assert.equal(html, "page");
    const script = dehydrate();
    assert.match(script, /__CACHOU_STATE__/);
  });
});
