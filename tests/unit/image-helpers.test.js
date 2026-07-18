import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSrcSet,
  buildSizes,
  responsiveImageProps,
  resolveAspectRatio
} from "../../src/image.js";

describe("resolveAspectRatio", () => {
  it("fills height from width and ratio", () => {
    assert.deepEqual(resolveAspectRatio("16/9", 1600, undefined), {
      width: 1600,
      height: 900
    });
  });

  it("fills width from height and ratio", () => {
    assert.deepEqual(resolveAspectRatio("1:1", undefined, 100), {
      width: 100,
      height: 100
    });
  });
});

describe("buildSrcSet / buildSizes", () => {
  it("builds width descriptors from template", () => {
    const s = buildSrcSet("/img/{w}.webp", [400, 800]);
    assert.equal(s, "/img/400.webp 400w, /img/800.webp 800w");
  });

  it("accepts a formatter function", () => {
    const s = buildSrcSet(w => `https://cdn/x?w=${w}`, [320]);
    assert.equal(s, "https://cdn/x?w=320 320w");
  });

  it("supports density mode", () => {
    const s = buildSrcSet("/a.png", [1, 2], { density: true });
    assert.equal(s, "/a.png 1x, /a.png 2x");
  });

  it("builds sizes from breakpoints", () => {
    const s = buildSizes([
      { max: 600, size: "100vw" },
      { size: "50vw" }
    ]);
    assert.equal(s, "(max-width: 600px) 100vw, 50vw");
  });

  it("rejects empty widths", () => {
    assert.throws(() => buildSrcSet("/x", []), /widths/);
  });
});

describe("responsiveImageProps", () => {
  it("returns src, srcset, sizes for Image()", () => {
    const props = responsiveImageProps({
      src: "https://cdn.example/photo-{w}.jpg",
      widths: [400, 800],
      defaultWidth: 800,
      alt: "Photo",
      sizes: [{ max: 640, size: "100vw" }, { size: "50vw" }]
    });
    assert.equal(props.src, "https://cdn.example/photo-800.jpg");
    assert.match(props.srcset, /400w/);
    assert.match(props.srcset, /800w/);
    assert.match(props.sizes, /100vw/);
    assert.equal(props.alt, "Photo");
  });
});
