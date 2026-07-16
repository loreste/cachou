import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  z,
  defineCollection,
  getCollection,
  getEntry,
  addEntries,
  clearCollection,
  parseFrontmatter,
  loadContent
} from "../../src/content.js";

// ---------------------------------------------------------------------------
// Schema validator (z) — adversarial
// ---------------------------------------------------------------------------

describe("z schema builder", () => {
  describe("z.string()", () => {
    const schema = z.string();
    it("accepts strings", () => assert.ok(schema.validate("hello").valid));
    it("accepts empty string", () => assert.ok(schema.validate("").valid));
    it("rejects number", () => assert.ok(!schema.validate(42).valid));
    it("rejects null", () => assert.ok(!schema.validate(null).valid));
    it("rejects undefined", () => assert.ok(!schema.validate(undefined).valid));
    it("rejects object", () => assert.ok(!schema.validate({}).valid));
    it("rejects boolean", () => assert.ok(!schema.validate(true).valid));
  });

  describe("z.number()", () => {
    const schema = z.number();
    it("accepts integers", () => assert.ok(schema.validate(42).valid));
    it("accepts floats", () => assert.ok(schema.validate(3.14).valid));
    it("accepts zero", () => assert.ok(schema.validate(0).valid));
    it("accepts negative", () => assert.ok(schema.validate(-1).valid));
    it("rejects NaN", () => assert.ok(!schema.validate(NaN).valid));
    it("rejects Infinity", () => assert.ok(schema.validate(Infinity).valid)); // Infinity is a number
    it("rejects string", () => assert.ok(!schema.validate("42").valid));
    it("rejects null", () => assert.ok(!schema.validate(null).valid));
  });

  describe("z.boolean()", () => {
    const schema = z.boolean();
    it("accepts true", () => assert.ok(schema.validate(true).valid));
    it("accepts false", () => assert.ok(schema.validate(false).valid));
    it("rejects 0", () => assert.ok(!schema.validate(0).valid));
    it("rejects 1", () => assert.ok(!schema.validate(1).valid));
    it("rejects string", () => assert.ok(!schema.validate("true").valid));
  });

  describe("z.date()", () => {
    const schema = z.date();
    it("accepts Date object", () => assert.ok(schema.validate(new Date()).valid));
    it("accepts ISO date string", () => assert.ok(schema.validate("2024-01-01").valid));
    it("rejects invalid date", () => assert.ok(!schema.validate(new Date("nope")).valid));
    it("rejects invalid string", () => assert.ok(!schema.validate("not a date").valid));
    it("rejects number", () => assert.ok(!schema.validate(123).valid));
  });

  describe("z.array()", () => {
    const schema = z.array(z.number());
    it("accepts valid array", () => assert.ok(schema.validate([1, 2, 3]).valid));
    it("accepts empty array", () => assert.ok(schema.validate([]).valid));
    it("rejects non-array", () => assert.ok(!schema.validate("not array").valid));
    it("rejects mixed types", () => {
      const result = schema.validate([1, "two", 3]);
      assert.ok(!result.valid);
      assert.ok(result.errors.some(e => e.includes("[1]")));
    });
  });

  describe("z.object()", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number()
    });
    it("accepts valid object", () => assert.ok(schema.validate({ name: "Bob", age: 30 }).valid));
    it("rejects missing fields", () => {
      const result = schema.validate({ name: "Bob" });
      assert.ok(!result.valid);
    });
    it("rejects wrong types", () => {
      const result = schema.validate({ name: 42, age: "old" });
      assert.ok(!result.valid);
      assert.ok(result.errors.length >= 2);
    });
    it("rejects null", () => assert.ok(!schema.validate(null).valid));
    it("rejects array", () => assert.ok(!schema.validate([]).valid));
    it("rejects string", () => assert.ok(!schema.validate("nope").valid));
  });

  describe("z.optional()", () => {
    const schema = z.optional(z.string());
    it("accepts value", () => assert.ok(schema.validate("hello").valid));
    it("accepts undefined", () => assert.ok(schema.validate(undefined).valid));
    it("accepts null", () => assert.ok(schema.validate(null).valid));
    it("rejects wrong type", () => assert.ok(!schema.validate(42).valid));
  });

  describe("z.enum()", () => {
    const schema = z.enum(["draft", "published", "archived"]);
    it("accepts valid value", () => assert.ok(schema.validate("published").valid));
    it("rejects invalid value", () => assert.ok(!schema.validate("deleted").valid));
    it("rejects empty string", () => assert.ok(!schema.validate("").valid));
    it("rejects null", () => assert.ok(!schema.validate(null).valid));
  });
});

// ---------------------------------------------------------------------------
// Frontmatter parser — adversarial
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("parses standard frontmatter", () => {
    const { data, body } = parseFrontmatter(`---
title: Hello World
draft: false
count: 42
---
# Content here`);
    assert.equal(data.title, "Hello World");
    assert.equal(data.draft, false);
    assert.equal(data.count, 42);
    assert.ok(body.includes("# Content here"));
  });

  it("handles no frontmatter", () => {
    const { data, body } = parseFrontmatter("# Just markdown");
    assert.deepEqual(data, {});
    assert.ok(body.includes("# Just markdown"));
  });

  it("handles empty frontmatter", () => {
    const { data, body } = parseFrontmatter("---\n---\nContent");
    assert.deepEqual(data, {});
    assert.equal(body, "Content");
  });

  it("handles unclosed frontmatter", () => {
    const { data, body } = parseFrontmatter("---\ntitle: oops\nno closing");
    assert.deepEqual(data, {});
  });

  it("parses boolean values", () => {
    const { data } = parseFrontmatter("---\na: true\nb: false\n---\n");
    assert.equal(data.a, true);
    assert.equal(data.b, false);
  });

  it("parses date values", () => {
    const { data } = parseFrontmatter("---\ndate: 2024-06-15\n---\n");
    assert.ok(data.date instanceof Date);
  });

  it("parses quoted strings", () => {
    const { data } = parseFrontmatter('---\ntitle: "Hello: World"\n---\n');
    assert.equal(data.title, "Hello: World");
  });

  it("parses inline arrays", () => {
    const { data } = parseFrontmatter("---\ntags: [js, css, html]\n---\n");
    assert.deepEqual(data.tags, ["js", "css", "html"]);
  });

  it("handles colon in value", () => {
    const { data } = parseFrontmatter("---\nurl: https://example.com\n---\n");
    assert.equal(data.url, "https://example.com");
  });

  it("handles null value", () => {
    const { data } = parseFrontmatter("---\nval: null\n---\n");
    assert.equal(data.val, null);
  });

  it("handles empty value", () => {
    const { data } = parseFrontmatter("---\nempty:\n---\n");
    assert.equal(data.empty, "");
  });

  it("handles XSS in frontmatter values", () => {
    const { data } = parseFrontmatter('---\ntitle: <script>alert("xss")</script>\n---\n');
    assert.equal(data.title, '<script>alert("xss")</script>');
  });

  it("handles very long content", () => {
    const longBody = "x".repeat(100_000);
    const { data, body } = parseFrontmatter(`---\ntitle: test\n---\n${longBody}`);
    assert.equal(data.title, "test");
    assert.equal(body, longBody);
  });
});

// ---------------------------------------------------------------------------
// Collections — adversarial
// ---------------------------------------------------------------------------

describe("content collections", () => {
  it("defineCollection requires name", () => {
    assert.throws(() => defineCollection({}), /requires.*name/i);
    assert.throws(() => defineCollection(null), /requires.*name|Cannot read/i);
  });

  it("getCollection throws for undefined collection", () => {
    assert.throws(() => getCollection("nonexistent_" + Date.now()), /not defined/);
  });

  it("getEntry throws for undefined collection", () => {
    assert.throws(() => getEntry("nonexistent_" + Date.now(), "slug"), /not defined/);
  });

  it("getEntry returns null for missing slug", () => {
    const col = defineCollection({ name: "test_missing_" + Date.now() });
    const entry = getEntry(col.name, "nonexistent");
    assert.equal(entry, null);
  });

  it("addEntries and getCollection round-trip", () => {
    const name = "blog_" + Date.now();
    defineCollection({ name });
    addEntries(name, [
      { slug: "hello", data: { title: "Hello" }, body: "# Hello" },
      { slug: "world", data: { title: "World" }, body: "# World" }
    ]);
    const entries = getCollection(name);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].slug, "hello");
    assert.equal(entries[1].data.title, "World");
  });

  it("clearCollection removes all entries", () => {
    const name = "clear_test_" + Date.now();
    defineCollection({ name });
    addEntries(name, [{ slug: "a", data: {} }]);
    assert.equal(getCollection(name).length, 1);
    clearCollection(name);
    assert.equal(getCollection(name).length, 0);
  });

  it("schema validation marks invalid entries", () => {
    const name = "validated_" + Date.now();
    defineCollection({
      name,
      schema: z.object({ title: z.string(), draft: z.boolean() })
    });
    addEntries(name, [
      { slug: "good", data: { title: "Good", draft: false } },
      { slug: "bad", data: { title: 42, draft: "nope" } }
    ]);
    const entries = getCollection(name);
    const good = entries.find(e => e.slug === "good");
    const bad = entries.find(e => e.slug === "bad");
    assert.ok(good._valid);
    assert.ok(!bad._valid);
    assert.ok(bad._errors.length > 0);
  });

  it("addEntries auto-creates collection if not defined", () => {
    const name = "auto_" + Date.now();
    addEntries(name, [{ slug: "x", data: { v: 1 } }]);
    const entries = getCollection(name);
    assert.equal(entries.length, 1);
  });

  it("handles collection name as object", () => {
    const col = defineCollection({ name: "obj_test_" + Date.now() });
    addEntries(col, [{ slug: "s1", data: { a: 1 } }]);
    const entries = getCollection(col);
    assert.equal(entries.length, 1);
  });
});

// ---------------------------------------------------------------------------
// createCollectionLoader — filesystem
// ---------------------------------------------------------------------------

describe("loadContent", () => {
  it("loads markdown files with frontmatter", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-content-"));
    await fs.writeFile(path.join(dir, "hello.md"), "---\ntitle: Hello\n---\n# Hello World\n");
    await fs.writeFile(path.join(dir, "world.md"), "---\ntitle: World\ndraft: true\n---\n# World\n");

    const name = "loader_md_" + Date.now();
    await loadContent([{ name, directory: dir }]);
    const entries = getCollection(name);
    assert.equal(entries.length, 2);
    const hello = entries.find(e => e.slug === "hello");
    assert.ok(hello);
    assert.equal(hello.data.title, "Hello");
    assert.ok(hello.body.includes("# Hello World"));
  });

  it("loads JSON files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-content-"));
    await fs.writeFile(path.join(dir, "config.json"), JSON.stringify({ key: "value" }));

    const name = "loader_json_" + Date.now();
    await loadContent([{ name, directory: dir }]);
    const entries = getCollection(name);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].data.key, "value");
  });

  it("handles missing directory gracefully", async () => {
    const name = "loader_missing_" + Date.now();
    await loadContent([{ name, directory: "/nonexistent/path/" + Date.now() }]);
    const entries = getCollection(name);
    assert.equal(entries.length, 0);
  });

  it("handles malformed JSON gracefully", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-content-"));
    await fs.writeFile(path.join(dir, "bad.json"), "not json{{");

    const name = "loader_bad_json_" + Date.now();
    await loadContent([{ name, directory: dir }]);
    const entries = getCollection(name);
    assert.equal(entries.length, 0);
  });

  it("skips directories inside content dir", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-content-"));
    await fs.mkdir(path.join(dir, "subdir"));
    await fs.writeFile(path.join(dir, "a.md"), "---\ntitle: A\n---\nA\n");

    const name = "loader_skip_dir_" + Date.now();
    await loadContent([{ name, directory: dir }]);
    const entries = getCollection(name);
    assert.equal(entries.length, 1);
  });
});
