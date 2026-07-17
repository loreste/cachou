import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoot, onCleanup } from "../../src/index.js";

describe("ui module", () => {
  it("exports all UI components", async () => {
    const mod = await import("../../src/ui.js");
    assert.equal(typeof mod.createToast, "function");
    assert.equal(typeof mod.Drawer, "function");
    assert.equal(typeof mod.Popover, "function");
    assert.equal(typeof mod.Menu, "function");
    assert.equal(typeof mod.DataTable, "function");
    assert.equal(typeof mod.InfiniteScroll, "function");
  });

  it("createToast is SSR-safe and exposes destroy", async () => {
    const { createToast } = await import("../../src/ui.js");
    const toast = createToast();
    assert.equal(typeof toast.destroy, "function");
    // No document in unit runner — show must not throw
    const id = toast.show("hello");
    assert.equal(typeof id, "string");
    toast.destroy();
  });

  it("createToast destroy is idempotent", async () => {
    const { createToast } = await import("../../src/ui.js");
    const toast = createToast();
    toast.destroy();
    toast.destroy();
  });
});

describe("InfiniteScroll dispose / abort", () => {
  it("is SSR-safe (returns null without document)", async () => {
    const { InfiniteScroll } = await import("../../src/ui.js");
    const node = InfiniteScroll({
      load: async () => ({ items: [], nextCursor: null }),
      children: () => null
    });
    assert.equal(node, null);
  });

  it("aborts in-flight load on owner dispose when DOM is available", async () => {
    if (typeof document === "undefined") {
      // Unit runner is Node — skip DOM-dependent path
      return;
    }
    const { InfiniteScroll } = await import("../../src/ui.js");
    let aborted = false;
    let resolveLoad;
    await createRoot(async dispose => {
      InfiniteScroll({
        load: async (_cursor, ctx = {}) => {
          const signal = ctx.signal;
          if (signal) {
            signal.addEventListener(
              "abort",
              () => {
                aborted = true;
              },
              { once: true }
            );
          }
          await new Promise(resolve => {
            resolveLoad = resolve;
          });
          if (signal?.aborted) {
            const err = new Error("aborted");
            err.name = "AbortError";
            throw err;
          }
          return { items: [{ id: 1 }], nextCursor: null };
        },
        children: items => {
          const el = document.createElement("div");
          el.textContent = String(items().length);
          return el;
        }
      });
      await new Promise(r => setTimeout(r, 5));
      dispose();
    });
    resolveLoad?.();
    await new Promise(r => setTimeout(r, 5));
    assert.equal(aborted, true);
  });
});

describe("ui primitive dispose (SSR-safe surfaces)", () => {
  it("Drawer returns a function that is safe without document", async () => {
    const { Drawer } = await import("../../src/ui.js");
    const view = Drawer({
      open: true,
      onClose: () => {},
      children: () => "panel"
    });
    assert.equal(typeof view, "function");
    const out = view();
    assert.equal(out, "panel");
  });

  it("Tooltip is SSR-safe", async () => {
    const { Tooltip } = await import("../../src/ui.js");
    const out = Tooltip({ content: "hi", children: () => "trigger" });
    assert.equal(out, "trigger");
  });

  it("Accordion returns null without document", async () => {
    const { Accordion } = await import("../../src/ui.js");
    const out = Accordion({
      items: [{ key: "a", title: "A", content: () => "body" }]
    });
    assert.equal(out, null);
  });

  it("registers cleanups under an owner without throwing", async () => {
    const { createToast } = await import("../../src/ui.js");
    createRoot(dispose => {
      const toast = createToast();
      onCleanup(() => toast.destroy());
      toast.show("x");
      dispose();
    });
  });
});

describe("dnd module", () => {
  it("exports createDragDrop", async () => {
    const mod = await import("../../src/dnd.js");
    assert.equal(typeof mod.createDragDrop, "function");
  });

  it("createDragDrop returns directive factories (SSR safe)", async () => {
    const { createDragDrop } = await import("../../src/dnd.js");
    const dnd = createDragDrop();
    assert.equal(typeof dnd.draggable, "function");
    assert.equal(typeof dnd.dropzone, "function");
    assert.equal(typeof dnd.sortable, "function");
  });
});
