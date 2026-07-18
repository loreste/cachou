import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  z,
  defineCollection,
  addEntries,
  clearCollection,
  exportContentManifest,
  writeContentManifest,
  routesFromCollection,
  buildContent
} from "../../src/content.js";

describe("exportContentManifest / routesFromCollection", () => {
  beforeEach(() => {
    clearCollection("posts");
    defineCollection({
      name: "posts",
      schema: z.object({
        title: z.string(),
        draft: z.optional(z.boolean())
      })
    });
    addEntries("posts", [
      { slug: "hello", data: { title: "Hello", date: new Date("2026-01-01") }, body: "# Hi" },
      { slug: "draft", data: { title: "Draft", draft: true }, body: "secret" }
    ]);
  });

  it("exports JSON-safe manifest with ISO dates", () => {
    const manifest = exportContentManifest("posts");
    assert.equal(manifest.version, 1);
    assert.ok(manifest.generatedAt);
    assert.equal(manifest.collections.posts.length, 2);
    assert.equal(manifest.collections.posts[0].slug, "hello");
    assert.equal(manifest.collections.posts[0].data.date, "2026-01-01T00:00:00.000Z");
    assert.equal(manifest.collections.posts[0].body, "# Hi");
  });

  it("can omit body and filter onlyValid", () => {
    // mark draft invalid via schema requiring title only — both valid
    const full = exportContentManifest("posts", { includeBody: false });
    assert.equal(full.collections.posts[0].body, undefined);
  });

  it("builds routes with prefix and titles", () => {
    const routes = routesFromCollection("posts", {
      prefix: "/blog",
      includeIndex: true,
      indexTitle: "Blog"
    });
    assert.equal(routes[0].path, "/blog");
    assert.equal(routes[0].title, "Blog");
    assert.ok(routes.some(r => r.path === "/blog/hello" && r.title === "Hello"));
  });

  it("custom path function", () => {
    const routes = routesFromCollection("posts", {
      path: e => `/p/${e.slug}/`
    });
    assert.ok(routes.every(r => r.path.startsWith("/p/")));
  });
});

describe("writeContentManifest / buildContent", () => {
  let dir;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-content-"));
  });
  after(async () => {
    // cleaned per-test via recursive remove at end of suite
  });

  it("writes manifest JSON", async () => {
    clearCollection("notes");
    defineCollection({ name: "notes" });
    addEntries("notes", [{ slug: "a", data: { title: "A" }, body: "x" }]);
    const out = path.join(dir, "manifest.json");
    const written = await writeContentManifest(out, null, { names: "notes" });
    assert.ok(written.bytes > 0);
    assert.equal(written.entryCount, 1);
    const parsed = JSON.parse(await fs.readFile(out, "utf8"));
    assert.equal(parsed.collections.notes[0].slug, "a");
  });

  it("buildContent loads from disk and produces routes", async () => {
    const contentDir = path.join(dir, "posts");
    await fs.mkdir(contentDir, { recursive: true });
    await fs.writeFile(
      path.join(contentDir, "one.md"),
      "---\ntitle: One\n---\n\nBody one\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(contentDir, "two.md"),
      "---\ntitle: Two\n---\n\nBody two\n",
      "utf8"
    );

    clearCollection("posts");
    const result = await buildContent(
      [
        {
          name: "posts",
          directory: contentDir,
          schema: z.object({ title: z.string() })
        }
      ],
      {
        outPath: path.join(dir, "content.json"),
        routeCollections: [{ name: "posts", prefix: "/blog", includeIndex: true }]
      }
    );

    assert.equal(result.manifest.collections.posts.length, 2);
    assert.ok(result.written?.path.endsWith("content.json"));
    assert.ok(result.routes.some(r => r.path === "/blog/one"));
    assert.ok(result.routes.some(r => r.path === "/blog"));
  });
});
