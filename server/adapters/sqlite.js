import { DatabaseSync } from "node:sqlite";
import path from "path";

const dbPath = path.resolve(process.cwd(), "cachou.db");
const db = new DatabaseSync(dbPath);

// Initialize SQLite table
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0
  )
`);

export function getTodos() {
  const stmt = db.prepare("SELECT * FROM todos ORDER BY id ASC");
  const rows = stmt.all();
  return rows.map(r => ({
    id: Number(r.id),
    text: r.text,
    completed: r.completed === 1
  }));
}

export function addTodo(text) {
  const stmt = db.prepare("INSERT INTO todos (text, completed) VALUES (?, 0)");
  const result = stmt.run(text);
  return { id: Number(result.lastInsertRowid), text, completed: false };
}

export function updateTodo(id, completed) {
  const stmt = db.prepare("UPDATE todos SET completed = ? WHERE id = ?");
  stmt.run(completed ? 1 : 0, id);
  return { id: Number(id), completed };
}

export function deleteTodo(id) {
  const stmt = db.prepare("DELETE FROM todos WHERE id = ?");
  stmt.run(id);
  return { id: Number(id) };
}

export function runQuery(sql) {
  // Callers must pass already-sanitized read-only SQL (see server/demo-guard.js).
  const stmt = db.prepare(sql);
  const rows = stmt.all();
  return rows.map(r => ({
    ...r,
    id: r.id !== undefined ? Number(r.id) : undefined,
    completed: r.completed !== undefined ? (r.completed === 1) : undefined
  }));
}

const SAFE_TODO_COLUMNS = new Set(["id", "text", "completed"]);

export function syncTable(tableName, data) {
  if (tableName !== "todos") {
    throw Object.assign(new Error("syncTable only supports the todos table"), { statusCode: 403 });
  }
  if (!Array.isArray(data)) {
    throw Object.assign(new Error("syncTable data must be an array"), { statusCode: 400 });
  }

  const stmt = db.prepare("SELECT id FROM todos");
  const currentRows = stmt.all();
  const currentIds = new Set(currentRows.map(r => Number(r.id)));

  const newIds = new Set(data.map(r => r.id).filter(Boolean).map(Number));

  for (const id of currentIds) {
    if (!newIds.has(id)) {
      db.prepare("DELETE FROM todos WHERE id = ?").run(id);
    }
  }

  for (const row of data) {
    const dbRow = { ...row };
    if (dbRow.completed !== undefined) {
      dbRow.completed = dbRow.completed ? 1 : 0;
    }
    if (dbRow.id !== undefined) {
      dbRow.id = Number(dbRow.id);
    }

    const keys = Object.keys(dbRow).filter(k => k !== "id" && SAFE_TODO_COLUMNS.has(k));
    if (dbRow.id && currentIds.has(dbRow.id)) {
      if (keys.length === 0) continue;
      const setClause = keys.map(k => `${k} = ?`).join(", ");
      const values = keys.map(k => dbRow[k]);
      db.prepare(`UPDATE todos SET ${setClause} WHERE id = ?`).run(...values, dbRow.id);
    } else {
      if (keys.length === 0) continue;
      const columns = keys.join(", ");
      const placeholders = keys.map(() => "?").join(", ");
      const values = keys.map(k => dbRow[k]);
      db.prepare(`INSERT INTO todos (${columns}) VALUES (${placeholders})`).run(...values);
    }
  }

  return runQuery("SELECT * FROM todos ORDER BY id ASC");
}
