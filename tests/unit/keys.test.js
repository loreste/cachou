import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hotkey, holdKey } from "../../src/keys.js";

describe("hotkey (SSR)", () => {
  it("exports hotkey function", () => {
    assert.equal(typeof hotkey, "function");
  });

  it("returns a dispose function on server (no-op)", () => {
    const dispose = hotkey("mod+k", () => {});
    assert.equal(typeof dispose, "function");
    dispose(); // should not throw
  });

  it("handles various combo strings without crashing", () => {
    const combos = [
      "mod+k", "ctrl+shift+a", "escape", "mod+enter",
      "ctrl+alt+delete", "shift+?", "mod+s", "f1",
      "a", "enter", "space", "tab"
    ];
    for (const combo of combos) {
      const dispose = hotkey(combo, () => {});
      assert.equal(typeof dispose, "function");
      dispose();
    }
  });

  it("handles chord notation", () => {
    const dispose = hotkey("g then d", () => {});
    assert.equal(typeof dispose, "function");
    dispose();
  });

  it("handles empty handler", () => {
    // Should not crash even with an odd handler
    const dispose = hotkey("a", null);
    assert.equal(typeof dispose, "function");
    dispose();
  });

  it("double dispose is safe", () => {
    const dispose = hotkey("mod+k", () => {});
    dispose();
    dispose(); // should not throw
  });
});

describe("holdKey (SSR)", () => {
  it("exports holdKey function", () => {
    assert.equal(typeof holdKey, "function");
  });

  it("returns a signal getter (false on server)", () => {
    const isHolding = holdKey("shift");
    assert.equal(typeof isHolding, "function");
    assert.equal(isHolding(), false);
  });

  it("handles various key names", () => {
    const keys = ["shift", "ctrl", "alt", "meta", "a", "escape", "space"];
    for (const key of keys) {
      const getter = holdKey(key);
      assert.equal(getter(), false);
    }
  });
});
