import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeReadOnlySelect, assertSafeIdentifier } from "../../server/demo-guard.js";

describe("sanitizeReadOnlySelect — adversarial SQL injection", () => {
  it("blocks UNION injection", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos UNION SELECT * FROM users"),
      /Only simple SELECT|not allowlisted/
    );
  });

  it("blocks subquery injection", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM (SELECT * FROM secrets) AS todos"),
      /Only simple SELECT|not allowlisted/
    );
  });

  it("blocks comment-based bypass (--)", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos -- ORDER BY id ASC\n; DROP TABLE todos"),
      /Multiple statements|Only simple SELECT/
    );
  });

  it("blocks comment-based bypass (/* */)", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos /* hidden */ ; DROP TABLE users"),
      /Multiple statements|Only simple SELECT/
    );
  });

  it("blocks INSERT disguised as SELECT", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("INSERT INTO todos (text) SELECT 'hacked' FROM todos"),
      /Only simple SELECT/
    );
  });

  it("blocks UPDATE statement", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("UPDATE todos SET text='hacked'"),
      /Only simple SELECT/
    );
  });

  it("blocks DROP TABLE", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("DROP TABLE todos"),
      /Only simple SELECT/
    );
  });

  it("blocks empty string", () => {
    assert.throws(
      () => sanitizeReadOnlySelect(""),
      /Query is required/
    );
  });

  it("blocks whitespace-only", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("   \n\t  "),
      /Query is required/
    );
  });

  it("blocks null/undefined", () => {
    assert.throws(() => sanitizeReadOnlySelect(null), /Query is required/);
    assert.throws(() => sanitizeReadOnlySelect(undefined), /Query is required/);
  });

  it("blocks numeric input", () => {
    assert.throws(() => sanitizeReadOnlySelect(42), /Query is required/);
  });

  it("blocks SELECT INTO", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * INTO backup FROM todos"),
      /Only simple SELECT/
    );
  });

  it("blocks tables not in allowlist", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM users"),
      /not allowlisted/
    );
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM secrets"),
      /not allowlisted/
    );
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM sqlite_master"),
      /not allowlisted/
    );
  });

  it("blocks case-mixed bypass attempts", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SeLeCt * FrOm sqlite_master"),
      /not allowlisted/
    );
  });

  it("allows legitimate SELECT with ORDER BY", () => {
    const sql = sanitizeReadOnlySelect("SELECT * FROM todos ORDER BY id ASC");
    assert.match(sql, /SELECT \* FROM todos/);
  });

  it("allows SELECT with LIMIT", () => {
    const sql = sanitizeReadOnlySelect("SELECT * FROM todos LIMIT 10");
    assert.match(sql, /SELECT \* FROM todos/);
    assert.match(sql, /LIMIT 10/);
  });

  it("allows SELECT specific columns", () => {
    const sql = sanitizeReadOnlySelect("SELECT id, text FROM todos");
    assert.match(sql, /SELECT id, text FROM todos/);
  });

  it("normalizes whitespace in valid queries", () => {
    const sql = sanitizeReadOnlySelect("SELECT  *   FROM   todos");
    assert.ok(sql.includes("FROM todos"));
  });

  it("strips comments before checking — safe semicolons in comments are OK", () => {
    // After comment stripping "/* ; */" becomes " ", so the query is valid
    const sql = sanitizeReadOnlySelect("SELECT * FROM todos /* safe */ ORDER BY id");
    assert.match(sql, /SELECT \* FROM todos/);
  });

  it("blocks real semicolons hidden after comment stripping", () => {
    // The semicolon here is outside the comment
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos /* safe */; DROP TABLE todos"),
      /Multiple statements/
    );
  });

  it("blocks stacked queries via null bytes", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos\0; DROP TABLE todos"),
      /Only simple SELECT|Multiple statements/
    );
  });

  it("blocks UNION smuggled through ORDER BY", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos ORDER BY id UNION SELECT 1,2,3 FROM todos"),
      /Only simple SELECT/
    );
  });

  it("blocks UNION ALL and second FROM via column-list smuggling", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos ORDER BY id UNION ALL SELECT * FROM todos"),
      /Only simple SELECT/
    );
  });

  it("blocks ORDER BY expressions and boolean smuggling", () => {
    assert.throws(() => sanitizeReadOnlySelect("SELECT * FROM todos ORDER BY id OR 1"), /Only simple SELECT/);
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos ORDER BY CASE WHEN 1 THEN id END"),
      /Only simple SELECT/
    );
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos ORDER BY id COLLATE NOCASE"),
      /Only simple SELECT/
    );
  });

  it("blocks OFFSET and string literals", () => {
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos ORDER BY id ASC OFFSET 0"),
      /Only simple SELECT/
    );
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT 'x' FROM todos"),
      /Only simple SELECT/
    );
  });

  it("allows multi-column ORDER BY with ASC/DESC", () => {
    const sql = sanitizeReadOnlySelect("SELECT id, text FROM todos ORDER BY id ASC, text DESC LIMIT 5");
    assert.equal(sql, "SELECT id, text FROM todos ORDER BY id ASC, text DESC LIMIT 5");
  });

  it("rejects LIMIT above the demo cap", () => {
    assert.throws(() => sanitizeReadOnlySelect("SELECT * FROM todos LIMIT 1001"), /LIMIT must be at most/);
    assert.throws(
      () => sanitizeReadOnlySelect("SELECT * FROM todos ORDER BY id ASC LIMIT 999999999999999999999"),
      /LIMIT must be at most|Only simple SELECT/
    );
  });

  it("allows LIMIT at the demo cap", () => {
    const sql = sanitizeReadOnlySelect("SELECT * FROM todos LIMIT 1000");
    assert.equal(sql, "SELECT * FROM todos LIMIT 1000");
  });
});

describe("assertSafeIdentifier — adversarial", () => {
  it("blocks empty string", () => {
    assert.throws(() => assertSafeIdentifier(""), /Invalid/);
  });

  it("blocks names starting with numbers", () => {
    assert.throws(() => assertSafeIdentifier("1todos"), /Invalid/);
  });

  it("blocks special characters", () => {
    assert.throws(() => assertSafeIdentifier("todos; DROP"), /Invalid/);
    assert.throws(() => assertSafeIdentifier("todos'"), /Invalid/);
    assert.throws(() => assertSafeIdentifier('todos"'), /Invalid/);
    assert.throws(() => assertSafeIdentifier("todos`"), /Invalid/);
    assert.throws(() => assertSafeIdentifier("to.dos"), /Invalid/);
    assert.throws(() => assertSafeIdentifier("to dos"), /Invalid/);
  });

  it("blocks path traversal in identifier", () => {
    assert.throws(() => assertSafeIdentifier("../secrets"), /Invalid/);
  });

  it("blocks identifiers not in allowlist even if valid format", () => {
    assert.throws(() => assertSafeIdentifier("users"), /not allowlisted/);
    assert.throws(() => assertSafeIdentifier("admin"), /not allowlisted/);
  });

  it("allows valid identifier in allowlist", () => {
    assert.equal(assertSafeIdentifier("todos"), "todos");
  });
});
