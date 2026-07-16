import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listFiles, readFileContent } from "../server/files.js";

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-files-"));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "README.md"), "# Hello\n", "utf8");
  await fs.writeFile(path.join(root, "src", "app.js"), "console.log('ok');\n", "utf8");
  await fs.writeFile(path.join(root, ".hidden"), "secret\n", "utf8");
  return root;
}

test("listFiles lists visible entries sorted with directories first", async () => {
  const root = await makeFixture();
  const dir = await listFiles("", { root });

  assert.equal(dir.path, "");
  assert.deepEqual(dir.entries.map(entry => entry.name), ["src", "README.md"]);
  assert.equal(dir.entries[0].type, "directory");
});

test("listFiles can include hidden files explicitly", async () => {
  const root = await makeFixture();
  const dir = await listFiles("", { root, includeHidden: true });

  assert(dir.entries.some(entry => entry.name === ".hidden"));
});

test("readFileContent reads text files with metadata", async () => {
  const root = await makeFixture();
  const file = await readFileContent("README.md", { root });

  assert.equal(file.name, "README.md");
  assert.equal(file.kind, "text");
  assert.equal(file.content, "# Hello\n");
});

test("readFileContent blocks traversal outside root", async () => {
  const root = await makeFixture();

  await assert.rejects(
    () => readFileContent("../package.json", { root }),
    /outside the configured files root|ENOENT/
  );
});

test("readFileContent blocks symlinks that resolve outside root", async () => {
  const root = await makeFixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-outside-"));
  await fs.writeFile(path.join(outside, "secret.txt"), "secret\n", "utf8");
  await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "linked-secret.txt"));

  await assert.rejects(
    () => readFileContent("linked-secret.txt", { root }),
    /outside the configured files root|Symbolic links are not allowed/
  );
});

test("readFileContent enforces max byte limit", async () => {
  const root = await makeFixture();

  await assert.rejects(
    () => readFileContent("README.md", { root, maxBytes: 2 }),
    /larger than/
  );
});
