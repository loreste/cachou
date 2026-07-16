import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
