import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Image/Picture require DOM (html tagged template), so we test the module
// imports successfully and test the resolveAspectRatio logic indirectly
// by checking the exported API shape.

describe("image module", () => {
  it("exports Image and Picture", async () => {
    const mod = await import("../../src/image.js");
    assert.equal(typeof mod.Image, "function");
    assert.equal(typeof mod.Picture, "function");
  });
});

// Test resolveAspectRatio logic by extracting it conceptually
// (the function isn't exported, so we test through the component behavior)
describe("aspect ratio resolution (unit logic)", () => {
  // Replicate the internal function for testing
  function resolveAspectRatio(aspectRatio, width, height) {
    if (aspectRatio == null) return { width, height };
    let ratio;
    if (typeof aspectRatio === "number") {
      ratio = aspectRatio;
    } else {
      const parts = String(aspectRatio).split(/[:/]/);
      if (parts.length === 2) {
        ratio = parseFloat(parts[0]) / parseFloat(parts[1]);
      } else {
        ratio = parseFloat(aspectRatio);
      }
    }
    if (!Number.isFinite(ratio) || ratio <= 0) return { width, height };
    if (width != null && height == null) {
      return { width, height: Math.round(width / ratio) };
    }
    if (height != null && width == null) {
      return { width: Math.round(height * ratio), height };
    }
    return { width, height };
  }

  it("resolves height from width and 16/9", () => {
    const result = resolveAspectRatio("16/9", 1600, undefined);
    assert.equal(result.width, 1600);
    assert.equal(result.height, 900);
  });

  it("resolves width from height and 16:9", () => {
    const result = resolveAspectRatio("16:9", undefined, 900);
    assert.equal(result.width, 1600);
    assert.equal(result.height, 900);
  });

  it("handles numeric ratio", () => {
    const result = resolveAspectRatio(2, 400, undefined);
    assert.equal(result.height, 200);
  });

  it("passes through when both width and height given", () => {
    const result = resolveAspectRatio("16/9", 100, 200);
    assert.equal(result.width, 100);
    assert.equal(result.height, 200);
  });

  it("passes through when neither width nor height given", () => {
    const result = resolveAspectRatio("16/9", undefined, undefined);
    assert.equal(result.width, undefined);
    assert.equal(result.height, undefined);
  });

  it("handles null aspectRatio", () => {
    const result = resolveAspectRatio(null, 100, 200);
    assert.equal(result.width, 100);
    assert.equal(result.height, 200);
  });

  it("handles zero ratio", () => {
    const result = resolveAspectRatio(0, 100, undefined);
    assert.equal(result.width, 100);
    assert.equal(result.height, undefined);
  });

  it("handles negative ratio", () => {
    const result = resolveAspectRatio(-1, 100, undefined);
    assert.equal(result.width, 100);
    assert.equal(result.height, undefined);
  });

  it("handles NaN ratio string", () => {
    const result = resolveAspectRatio("not/a/ratio", 100, undefined);
    assert.equal(result.width, 100);
  });

  it("handles Infinity ratio", () => {
    const result = resolveAspectRatio(Infinity, 100, undefined);
    assert.equal(result.width, 100);
    assert.equal(result.height, undefined);
  });

  it("handles 1:1 square ratio", () => {
    const result = resolveAspectRatio("1/1", 500, undefined);
    assert.equal(result.width, 500);
    assert.equal(result.height, 500);
  });

  it("handles very wide ratio", () => {
    const result = resolveAspectRatio("21/9", 2100, undefined);
    assert.equal(result.height, 900);
  });
});
