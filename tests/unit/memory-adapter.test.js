import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  runQuery,
  syncTable
} from "../../server/adapters/memory.js";

describe("memory adapter — CRUD", () => {
  it("getTodos returns initial data", () => {
    const todos = getTodos();
    assert.ok(Array.isArray(todos));
    assert.ok(todos.length >= 1);
  });

  it("addTodo creates a new item with incremented id", () => {
    const before = getTodos();
    const maxId = Math.max(0, ...before.map(t => t.id));
    const item = addTodo("Test item");
    assert.equal(item.text, "Test item");
    assert.equal(item.completed, false);
    assert.ok(item.id > maxId);
  });

  it("addTodo handles empty string text", () => {
    const item = addTodo("");
    assert.equal(item.text, "");
    assert.equal(item.completed, false);
  });

  it("addTodo handles very long text", () => {
    const longText = "x".repeat(100_000);
    const item = addTodo(longText);
    assert.equal(item.text.length, 100_000);
  });

  it("addTodo handles special characters", () => {
    const special = '<script>alert("xss")</script>';
    const item = addTodo(special);
    assert.equal(item.text, special);
  });

  it("updateTodo updates completion status", () => {
    const item = addTodo("Update test");
    const updated = updateTodo(item.id, true);
    assert.equal(updated.completed, true);
  });

  it("updateTodo handles string id", () => {
    const item = addTodo("String id test");
    const updated = updateTodo(String(item.id), true);
    assert.equal(updated.id, item.id);
  });

  it("updateTodo with non-existent id doesn't crash", () => {
    const result = updateTodo(999999, true);
    assert.equal(result.id, 999999);
  });

  it("deleteTodo removes the item", () => {
    const item = addTodo("Delete me");
    deleteTodo(item.id);
    const todos = getTodos();
    assert.ok(!todos.find(t => t.id === item.id));
  });

  it("deleteTodo with non-existent id doesn't crash", () => {
    const before = getTodos().length;
    deleteTodo(999999);
    const after = getTodos().length;
    assert.equal(before, after);
  });
});

describe("memory adapter — runQuery", () => {
  it("simple SELECT * FROM todos works", () => {
    const result = runQuery("SELECT * FROM todos ORDER BY id ASC");
    assert.ok(Array.isArray(result));
  });

  it("case insensitive SELECT", () => {
    const result = runQuery("select * from todos order by id asc");
    assert.ok(Array.isArray(result));
  });

  it("ORDER BY id DESC sorts descending", () => {
    addTodo("sort test 1");
    addTodo("sort test 2");
    const result = runQuery("SELECT * FROM todos ORDER BY id DESC");
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].id >= result[i].id);
    }
  });

  it("rejects unknown query patterns", () => {
    assert.throws(
      () => runQuery("INSERT INTO todos VALUES (1, 'hack', 0)"),
      /only supports simple SELECT/
    );
  });

  it("returns empty array for unknown table", () => {
    const result = runQuery("SELECT * FROM nonexistent");
    assert.deepEqual(result, []);
  });
});

describe("memory adapter — syncTable", () => {
  it("rejects non-allowed tables", () => {
    assert.throws(
      () => syncTable("users", []),
      /not allowed/
    );
  });

  it("rejects SQL injection in table name", () => {
    assert.throws(
      () => syncTable("todos; DROP TABLE todos", []),
      /not allowed/
    );
  });

  it("syncs data correctly", () => {
    const initial = addTodo("sync test");
    const synced = syncTable("todos", [
      { id: initial.id, text: "synced", completed: true }
    ]);
    assert.ok(Array.isArray(synced));
    const found = synced.find(t => t.id === initial.id);
    assert.ok(found);
    assert.equal(found.text, "synced");
    assert.equal(found.completed, true);
  });

  it("handles empty data array", () => {
    const result = syncTable("todos", []);
    assert.ok(Array.isArray(result));
  });

  it("inserts new rows without id", () => {
    const before = runQuery("SELECT * FROM todos ORDER BY id ASC");
    syncTable("todos", [...before, { text: "new row", completed: false }]);
    const after = runQuery("SELECT * FROM todos ORDER BY id ASC");
    assert.ok(after.length > before.length);
  });

  it("handles case-insensitive table name", () => {
    const result = syncTable("Todos", [{ id: 1, text: "test", completed: false }]);
    assert.ok(Array.isArray(result));
  });
});
