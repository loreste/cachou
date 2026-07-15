import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeReadOnlySelect, assertSafeIdentifier } from "../../server/demo-guard.js";

describe("sanitizeReadOnlySelect", () => {
  it("allows simple select from todos", () => {
    const sql = sanitizeReadOnlySelect("SELECT * FROM todos ORDER BY id ASC");
    assert.match(sql, /SELECT \* FROM todos/i);
  });

  it("rejects writes", () => {
    assert.throws(() => sanitizeReadOnlySelect("DELETE FROM todos"), /Only simple SELECT/);
  });

  it("rejects multi-statement", () => {
    assert.throws(() => sanitizeReadOnlySelect("SELECT * FROM todos; DROP TABLE todos"), /Multiple statements/);
  });

  it("rejects unknown tables", () => {
    assert.throws(() => sanitizeReadOnlySelect("SELECT * FROM users"), /not allowlisted/);
  });
});

describe("assertSafeIdentifier", () => {
  it("accepts todos", () => {
    assert.equal(assertSafeIdentifier("todos"), "todos");
  });

  it("rejects injection-ish names", () => {
    assert.throws(() => assertSafeIdentifier("todos; drop"), /Invalid/);
  });
});
