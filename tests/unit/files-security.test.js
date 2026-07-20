import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { listFiles, readFileContent } from "../../server/files.js";

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-sec-"));
  await fs.writeFile(path.join(root, "readme.txt"), "hello\n", "utf8");
  await fs.mkdir(path.join(root, "sub"));
  await fs.writeFile(path.join(root, "sub", "nested.txt"), "nested\n", "utf8");
  return root;
}

describe("files API — path traversal attacks", () => {
  it("blocks ../ traversal", async () => {
    const root = await makeFixture();
    await assert.rejects(
      () => readFileContent("../../../etc/passwd", { root }),
      /outside|not found/i
    );
  });

  it("blocks encoded ../ traversal", async () => {
    const root = await makeFixture();
    await assert.rejects(
      () => readFileContent("..%2F..%2Fetc%2Fpasswd", { root }),
      /outside|not found|ENOENT/i
    );
  });

  it("blocks absolute path escape", async () => {
    const root = await makeFixture();
    await assert.rejects(
      () => readFileContent("/etc/passwd", { root }),
      /outside|not found|ENOENT/i
    );
  });

  it("blocks symlink to file outside root", async () => {
    const root = await makeFixture();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-outside-"));
    await fs.writeFile(path.join(outside, "secret.txt"), "secret\n", "utf8");
    await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "evil-link.txt"));

    await assert.rejects(
      () => readFileContent("evil-link.txt", { root }),
      /Symbolic links|outside/i
    );
  });

  it("blocks symlink directory to outside root", async () => {
    const root = await makeFixture();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-outside-"));
    await fs.writeFile(path.join(outside, "secret.txt"), "secret\n", "utf8");
    await fs.symlink(outside, path.join(root, "evil-dir"));

    await assert.rejects(
      () => listFiles("evil-dir", { root }),
      /Symbolic links|outside/i
    );
  });

  it("blocks nested symlink attack", async () => {
    const root = await makeFixture();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-outside-"));
    await fs.writeFile(path.join(outside, "secret.txt"), "secret\n", "utf8");
    await fs.symlink(outside, path.join(root, "sub", "escape"));

    await assert.rejects(
      () => readFileContent("sub/escape/secret.txt", { root }),
      /Symbolic links|outside/i
    );
  });

  it("does not disclose metadata for symlinks in directory listings", async () => {
    const root = await makeFixture();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-outside-"));
    await fs.writeFile(path.join(outside, "secret.txt"), "secret\n", "utf8");
    await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "listed-secret.txt"));

    const result = await listFiles("", { root, includeHidden: true });
    assert.equal(result.entries.some(entry => entry.name === "listed-secret.txt"), false);
  });

  it("allows legitimate nested reads", async () => {
    const root = await makeFixture();
    const result = await readFileContent("sub/nested.txt", { root });
    assert.equal(result.content.trim(), "nested");
  });

  it("allows listing root directory", async () => {
    const root = await makeFixture();
    const result = await listFiles("", { root });
    assert.ok(result.entries.length > 0);
  });

  it("blocks null byte injection in path", async () => {
    const root = await makeFixture();
    await assert.rejects(
      () => readFileContent("readme.txt\0../../etc/passwd", { root }),
      /ENOENT|outside|not found/i
    );
  });
});

describe("files API — size limits", () => {
  it("enforces maxBytes limit", async () => {
    const root = await makeFixture();
    await assert.rejects(
      () => readFileContent("readme.txt", { root, maxBytes: 1 }),
      /larger than/
    );
  });

  it("allows files under maxBytes", async () => {
    const root = await makeFixture();
    const result = await readFileContent("readme.txt", { root, maxBytes: 1024 });
    assert.ok(result.content);
  });
});

describe("files API — hidden files", () => {
  it("hides dotfiles by default", async () => {
    const root = await makeFixture();
    await fs.writeFile(path.join(root, ".env"), "SECRET=x", "utf8");
    const result = await listFiles("", { root });
    assert.ok(!result.entries.find(e => e.name === ".env"));
  });

  it("shows dotfiles when includeHidden is true", async () => {
    const root = await makeFixture();
    await fs.writeFile(path.join(root, ".env"), "SECRET=x", "utf8");
    const result = await listFiles("", { root, includeHidden: true });
    assert.ok(result.entries.find(e => e.name === ".env"));
  });
});
