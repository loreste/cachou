/**
 * PostgreSQL adapter for the Cachou demo server.
 *
 * Requires the `pg` package: npm install pg
 * Set CACHOU_DB_EXPERIMENTAL=1 and CACHOU_DB_TYPE=postgres to enable.
 *
 * Environment variables:
 *   DATABASE_URL      — Full connection string (preferred)
 *   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE — Individual params
 */

let Pool;
try {
  const pg = await import("pg");
  Pool = pg.default?.Pool || pg.Pool;
} catch {
  throw new Error(
    '[cachou] PostgreSQL adapter requires the "pg" package. Install it: npm install pg'
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  max: 10
});

// Initialize table
await pool.query(`
  CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE
  )
`);

export async function getTodos() {
  const { rows } = await pool.query("SELECT * FROM todos ORDER BY id ASC");
  return rows.map(r => ({
    id: Number(r.id),
    text: r.text,
    completed: Boolean(r.completed)
  }));
}

export async function addTodo(text) {
  const { rows } = await pool.query(
    "INSERT INTO todos (text, completed) VALUES ($1, FALSE) RETURNING *",
    [text]
  );
  const r = rows[0];
  return { id: Number(r.id), text: r.text, completed: false };
}

export async function updateTodo(id, completed) {
  await pool.query("UPDATE todos SET completed = $1 WHERE id = $2", [completed, id]);
  return { id: Number(id), completed: Boolean(completed) };
}

export async function deleteTodo(id) {
  await pool.query("DELETE FROM todos WHERE id = $1", [id]);
  return { id: Number(id) };
}

export async function runQuery(sql) {
  // Callers must pass already-sanitized read-only SQL (see server/demo-guard.js).
  const { rows } = await pool.query(sql);
  return rows.map(r => ({
    ...r,
    id: r.id !== undefined ? Number(r.id) : undefined,
    completed: r.completed !== undefined ? Boolean(r.completed) : undefined
  }));
}

const SAFE_TODO_COLUMNS = new Set(["id", "text", "completed"]);

export async function syncTable(tableName, data) {
  if (tableName !== "todos") {
    throw Object.assign(new Error("syncTable only supports the todos table"), { statusCode: 403 });
  }
  if (!Array.isArray(data)) {
    throw Object.assign(new Error("syncTable data must be an array"), { statusCode: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: currentRows } = await client.query("SELECT id FROM todos");
    const currentIds = new Set(currentRows.map(r => Number(r.id)));
    const newIds = new Set(data.map(r => r.id).filter(Boolean).map(Number));

    // Delete rows not in newIds
    for (const id of currentIds) {
      if (!newIds.has(id)) {
        await client.query("DELETE FROM todos WHERE id = $1", [id]);
      }
    }

    // Upsert rows
    for (const row of data) {
      const dbRow = { ...row };
      if (dbRow.completed !== undefined) dbRow.completed = Boolean(dbRow.completed);
      if (dbRow.id !== undefined) dbRow.id = Number(dbRow.id);

      const keys = Object.keys(dbRow).filter(k => k !== "id" && SAFE_TODO_COLUMNS.has(k));
      if (dbRow.id && currentIds.has(dbRow.id)) {
        if (keys.length === 0) continue;
        const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
        const values = keys.map(k => dbRow[k]);
        await client.query(`UPDATE todos SET ${setClause} WHERE id = $${keys.length + 1}`, [...values, dbRow.id]);
      } else {
        if (keys.length === 0) continue;
        const columns = keys.join(", ");
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
        const values = keys.map(k => dbRow[k]);
        await client.query(`INSERT INTO todos (${columns}) VALUES (${placeholders})`, values);
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return runQuery("SELECT * FROM todos ORDER BY id ASC");
}
