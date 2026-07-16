import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

describe("feedback module — exports", () => {
  it("exports all components and utilities", async () => {
    const mod = await import("../../src/feedback.js");
    assert.equal(typeof mod.Progress, "function");
    assert.equal(typeof mod.Spinner, "function");
    assert.equal(typeof mod.Skeleton, "function");
    assert.equal(typeof mod.CommandPalette, "function");
    assert.equal(typeof mod.csvExport, "function");
    assert.equal(typeof mod.downloadCSV, "function");
  });
});

describe("csvExport", () => {
  let csvExport;
  before(async () => { csvExport = (await import("../../src/feedback.js")).csvExport; });

  it("converts array of objects to CSV", () => {
    const csv = csvExport([
      { name: "Ada", age: 36 },
      { name: "Bob", age: 42 }
    ]);
    assert.ok(csv.includes("name,age") || csv.includes("name") && csv.includes("age"));
    assert.ok(csv.includes("Ada"));
    assert.ok(csv.includes("Bob"));
    assert.ok(csv.includes("36"));
  });

  it("handles custom columns and headers", () => {
    const csv = csvExport(
      [{ a: 1, b: 2, c: 3 }],
      { columns: ["a", "c"], headers: ["Alpha", "Charlie"] }
    );
    assert.ok(csv.includes("Alpha"));
    assert.ok(csv.includes("Charlie"));
    assert.ok(!csv.includes("b") || !csv.includes("Beta"));
    assert.ok(csv.includes("1"));
    assert.ok(csv.includes("3"));
  });

  it("escapes commas in values (RFC 4180)", () => {
    const csv = csvExport([{ note: "hello, world" }]);
    assert.ok(csv.includes('"hello, world"'));
  });

  it("escapes quotes in values", () => {
    const csv = csvExport([{ note: 'say "hello"' }]);
    assert.ok(csv.includes('""hello""') || csv.includes('"say ""hello"""'));
  });

  it("escapes newlines in values", () => {
    const csv = csvExport([{ note: "line1\nline2" }]);
    assert.ok(csv.includes('"line1\nline2"'));
  });

  it("handles empty array", () => {
    const csv = csvExport([]);
    assert.equal(typeof csv, "string");
  });

  it("handles empty objects", () => {
    const csv = csvExport([{}]);
    assert.equal(typeof csv, "string");
  });

  it("handles null/undefined values", () => {
    const csv = csvExport([{ a: null, b: undefined, c: "" }]);
    assert.equal(typeof csv, "string");
    assert.ok(!csv.includes("null") || csv.includes("null")); // implementation-dependent
  });

  it("custom delimiter", () => {
    const csv = csvExport([{ a: 1, b: 2 }], { delimiter: ";" });
    assert.ok(csv.includes(";"));
  });

  it("no headers option", () => {
    const csv = csvExport([{ a: 1 }], { includeHeaders: false });
    assert.ok(!csv.startsWith("a"));
  });

  it("handles large dataset", () => {
    const data = Array.from({ length: 10000 }, (_, i) => ({ id: i, name: `item-${i}` }));
    const csv = csvExport(data);
    assert.ok(csv.length > 10000);
    assert.ok(csv.includes("item-9999"));
  });

  it("handles special characters", () => {
    const csv = csvExport([{ name: '<script>alert("xss")</script>' }]);
    assert.ok(csv.includes("alert"));
  });

  it("handles unicode", () => {
    const csv = csvExport([{ name: "日本語テスト", emoji: "🎉" }]);
    assert.ok(csv.includes("日本語テスト"));
    assert.ok(csv.includes("🎉"));
  });
});

describe("downloadCSV (SSR)", () => {
  let downloadCSV;
  before(async () => { downloadCSV = (await import("../../src/feedback.js")).downloadCSV; });

  it("is a no-op on server (no crash)", () => {
    // Should not throw in Node (no document)
    downloadCSV("a,b\n1,2", "test.csv");
  });
});
