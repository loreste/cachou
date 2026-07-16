import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

describe("upload module — exports", () => {
  it("exports createUpload and DropZone", async () => {
    const mod = await import("../../src/upload.js");
    assert.equal(typeof mod.createUpload, "function");
    assert.equal(typeof mod.DropZone, "function");
  });
});

describe("createUpload", () => {
  let createUpload;
  before(async () => { createUpload = (await import("../../src/upload.js")).createUpload; });

  it("returns correct shape", () => {
    const upload = createUpload({ url: "/api/upload" });
    assert.equal(typeof upload.progress, "function");
    assert.equal(typeof upload.uploading, "function");
    assert.equal(typeof upload.files, "function");
    assert.equal(typeof upload.error, "function");
    assert.equal(typeof upload.start, "function");
    assert.equal(typeof upload.abort, "function");
    assert.equal(typeof upload.reset, "function");
    assert.equal(typeof upload.addFiles, "function");
  });

  it("starts with clean state", () => {
    const upload = createUpload({ url: "/api/upload" });
    assert.equal(upload.progress(), 0);
    assert.equal(upload.uploading(), false);
    assert.deepEqual(upload.files(), []);
    assert.equal(upload.error(), null);
  });

  it("reset clears state", () => {
    const upload = createUpload({ url: "/api/upload" });
    upload.reset();
    assert.equal(upload.progress(), 0);
    assert.equal(upload.uploading(), false);
    assert.deepEqual(upload.files(), []);
  });

  it("abort doesn't crash when nothing is uploading", () => {
    const upload = createUpload({ url: "/api/upload" });
    upload.abort(); // should not throw
    assert.equal(upload.uploading(), false);
  });

  it("addFiles accepts file-like objects", () => {
    const upload = createUpload({ url: "/api/upload" });
    const fakeFile = { name: "test.jpg", size: 1024, type: "image/jpeg" };
    upload.addFiles([fakeFile]);
    assert.equal(upload.files().length, 1);
    assert.equal(upload.files()[0].name, "test.jpg");
  });

  it("validates file size", () => {
    const upload = createUpload({ url: "/api/upload", maxSize: 100 });
    const bigFile = { name: "big.bin", size: 200, type: "application/octet-stream" };
    upload.addFiles([bigFile]);
    // Should either reject the file or set an error
    const hasError = upload.error() !== null;
    const fileRejected = upload.files().length === 0;
    assert.ok(hasError || fileRejected, "big file should be rejected or error set");
  });

  it("validates file type", () => {
    const upload = createUpload({ url: "/api/upload", accept: ["image/*"] });
    const textFile = { name: "readme.txt", size: 50, type: "text/plain" };
    upload.addFiles([textFile]);
    const hasError = upload.error() !== null;
    const fileRejected = upload.files().length === 0;
    assert.ok(hasError || fileRejected, "wrong type should be rejected or error set");
  });

  it("handles multiple files", () => {
    const upload = createUpload({ url: "/api/upload", multiple: true });
    upload.addFiles([
      { name: "a.jpg", size: 100, type: "image/jpeg" },
      { name: "b.jpg", size: 200, type: "image/jpeg" }
    ]);
    assert.equal(upload.files().length, 2);
  });
});

describe("mask module — exports", () => {
  it("exports mask and masks", async () => {
    const mod = await import("../../src/mask.js");
    assert.equal(typeof mod.mask, "function");
    assert.equal(typeof mod.masks, "object");
    assert.ok(mod.masks.phone);
    assert.ok(mod.masks.creditCard);
    assert.ok(mod.masks.date);
  });
});
