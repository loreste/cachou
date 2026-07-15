import test from "node:test";
import assert from "node:assert";
import * as memoryAdapter from "../server/adapters/memory.js";
import * as sqliteAdapter from "../server/adapters/sqlite.js";

test("Memory Adapter CRUD and Sync", () => {
  // 1. Initial State
  const initial = memoryAdapter.getTodos();
  assert.equal(initial.length, 2);
  assert.equal(initial[0].text, "In-Memory database fallback");

  // 2. Add Todo
  const newItem = memoryAdapter.addTodo("Test Item");
  assert.equal(newItem.text, "Test Item");
  assert.equal(newItem.completed, false);
  assert.equal(typeof newItem.id, "number");

  // 3. Update Todo
  const updated = memoryAdapter.updateTodo(newItem.id, true);
  assert.equal(updated.id, newItem.id);
  assert.equal(updated.completed, true);

  // 4. Delete Todo
  const deleted = memoryAdapter.deleteTodo(newItem.id);
  assert.equal(deleted.id, newItem.id);
  const remaining = memoryAdapter.getTodos();
  assert.equal(remaining.find(t => t.id === newItem.id), undefined);

  // 5. runQuery select
  const selectRes = memoryAdapter.runQuery("SELECT * FROM todos ORDER BY id ASC");
  assert.equal(selectRes.length, 2);

  // 6. syncTable
  const syncData = [
    { id: 1, text: "Keep this", completed: false },
    { text: "Add this new one", completed: true }
  ];
  const synced = memoryAdapter.syncTable("todos", syncData);
  assert.equal(synced.length, 2);
  assert.equal(synced[0].id, 1);
  assert.equal(synced[0].text, "Keep this");
  assert.equal(synced[1].text, "Add this new one");
  assert.equal(synced[1].completed, true);
  assert.equal(typeof synced[1].id, "number");
});

test("SQLite Adapter CRUD and Sync", () => {
  // 1. Initial State
  const initial = sqliteAdapter.getTodos();
  assert.ok(Array.isArray(initial));

  // 2. Add Todo
  const newItem = sqliteAdapter.addTodo("SQLite Test Item");
  assert.equal(newItem.text, "SQLite Test Item");
  assert.equal(newItem.completed, false);
  assert.equal(typeof newItem.id, "number");

  // 3. Update Todo
  const updated = sqliteAdapter.updateTodo(newItem.id, true);
  assert.equal(updated.id, newItem.id);
  assert.equal(updated.completed, true);

  // 4. Delete Todo
  const deleted = sqliteAdapter.deleteTodo(newItem.id);
  assert.equal(deleted.id, newItem.id);

  // 5. runQuery select
  const selectRes = sqliteAdapter.runQuery("SELECT * FROM todos ORDER BY id ASC");
  assert.ok(Array.isArray(selectRes));

  // 6. syncTable
  const syncData = [
    { text: "Sync SQLite Row", completed: false }
  ];
  const synced = sqliteAdapter.syncTable("todos", syncData);
  assert.equal(synced.length, 1);
  assert.equal(synced[0].text, "Sync SQLite Row");
  assert.equal(synced[0].completed, false);
  assert.equal(typeof synced[0].id, "number");

  // Clean up SQLite table for subsequent runs
  sqliteAdapter.deleteTodo(synced[0].id);
});
