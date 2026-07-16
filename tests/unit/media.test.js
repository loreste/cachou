import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("media module", () => {
  it("exports all media processing functions", async () => {
    const mod = await import("../../src/media.js");
    assert.equal(typeof mod.compressImage, "function");
    assert.equal(typeof mod.generateSrcSet, "function");
    assert.equal(typeof mod.blurPlaceholder, "function");
    assert.equal(typeof mod.compressVideo, "function");
    assert.equal(typeof mod.videoPoster, "function");
    assert.equal(typeof mod.generateVideoFormats, "function");
  });

  it("compressImage throws clear error when sharp is not installed", async () => {
    const { compressImage } = await import("../../src/media.js");
    await assert.rejects(
      () => compressImage(Buffer.from("not an image")),
      /sharp.*required|Cannot find package/i
    );
  });

  it("blurPlaceholder throws clear error when sharp is not installed", async () => {
    const { blurPlaceholder } = await import("../../src/media.js");
    await assert.rejects(
      () => blurPlaceholder(Buffer.from("not an image")),
      /sharp.*required|Cannot find package/i
    );
  });

  it("generateSrcSet throws clear error when sharp is not installed", async () => {
    const { generateSrcSet } = await import("../../src/media.js");
    await assert.rejects(
      () => generateSrcSet(Buffer.from("not an image")),
      /sharp.*required|Cannot find package/i
    );
  });
});

describe("media — compressVideo argument validation", () => {
  it("compressVideo rejects missing ffmpeg gracefully", async () => {
    const { compressVideo } = await import("../../src/media.js");
    // With a non-existent input file, ffmpeg should fail
    await assert.rejects(
      () => compressVideo("/nonexistent/input.mp4", "/tmp/out.mp4"),
      /ENOENT|No such file|ffmpeg/i
    );
  });
});

describe("media — videoPoster argument validation", () => {
  it("videoPoster rejects missing input", async () => {
    const { videoPoster } = await import("../../src/media.js");
    await assert.rejects(
      () => videoPoster("/nonexistent/video.mp4", "/tmp/poster.jpg"),
      /ENOENT|No such file|ffmpeg/i
    );
  });
});
