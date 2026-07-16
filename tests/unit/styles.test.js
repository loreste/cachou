import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cx } from "../../src/styles.js";

// Note: css(), cssVar(), createTheme(), injectGlobalStyles(), keyframes()
// require a DOM (document). We test cx() which is pure logic, and verify
// the module imports without crashing in Node.

describe("cx — conditional class joiner", () => {
  it("joins simple strings", () => {
    assert.equal(cx("a", "b", "c"), "a b c");
  });

  it("filters falsy values", () => {
    assert.equal(cx("a", null, undefined, false, 0, "", "b"), "a b");
  });

  it("handles object conditionals", () => {
    assert.equal(cx({ active: true, disabled: false, large: true }), "active large");
  });

  it("handles mixed args", () => {
    assert.equal(cx("base", { active: true }, ["extra", { hidden: false }]), "base active extra");
  });

  it("handles nested arrays", () => {
    assert.equal(cx(["a", ["b", ["c"]]]), "a b c");
  });

  it("handles all falsy", () => {
    assert.equal(cx(null, false, undefined, 0, ""), "");
  });

  it("handles no args", () => {
    assert.equal(cx(), "");
  });

  it("handles single string", () => {
    assert.equal(cx("only"), "only");
  });

  it("ignores numeric truthy values in objects", () => {
    assert.equal(cx({ a: 1, b: 0 }), "a");
  });

  it("handles objects with special characters in keys", () => {
    assert.equal(cx({ "my-class": true, "another.class": false }), "my-class");
  });

  it("does not treat numbers as class names", () => {
    // 42 is truthy but not a string — should be skipped by the falsy check...
    // Actually 42 is truthy and typeof !== "string", !== Array, typeof === "number"
    // It's not falsy, not a string, not an array, not an object → should be ignored
    const result = cx(42, "valid");
    // 42 doesn't match any branch, so it's ignored
    assert.equal(result, "valid");
  });

  it("handles very large input", () => {
    const classes = Array.from({ length: 1000 }, (_, i) => `class-${i}`);
    const result = cx(...classes);
    assert.equal(result.split(" ").length, 1000);
  });

  it("handles deeply nested arrays", () => {
    let nested = "deep";
    for (let i = 0; i < 50; i++) nested = [nested];
    const result = cx(nested);
    assert.equal(result, "deep");
  });

  it("handles empty objects", () => {
    assert.equal(cx({}), "");
  });

  it("handles empty arrays", () => {
    assert.equal(cx([]), "");
  });
});
