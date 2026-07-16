/**
 * Demo database facade.
 *
 * Supported production-ready adapters: sqlite, memory.
 * Experimental (require optional deps, incomplete): postgres, mysql, mongodb, firebase.
 * Set CACHOU_DB_EXPERIMENTAL=1 to opt into experimental adapters.
 */

const DB_TYPE = process.env.CACHOU_DB_TYPE || "sqlite";
const EXPERIMENTAL = new Set(["postgres", "mysql", "mongodb", "firebase"]);

let adapter;

async function initAdapter() {
  console.log(`[db] Initializing adapter: ${DB_TYPE}`);
  try {
    if (EXPERIMENTAL.has(DB_TYPE) && process.env.CACHOU_DB_EXPERIMENTAL !== "1") {
      console.warn(
        `[db] Adapter "${DB_TYPE}" is experimental. Set CACHOU_DB_EXPERIMENTAL=1 to enable; falling back to memory.`
      );
      adapter = await import("./adapters/memory.js");
      return;
    }
    if (DB_TYPE === "sqlite") {
      adapter = await import("./adapters/sqlite.js");
    } else if (DB_TYPE === "postgres") {
      adapter = await import("./adapters/postgres.js");
    } else if (DB_TYPE === "mysql") {
      adapter = await import("./adapters/mysql.js");
    } else if (DB_TYPE === "firebase") {
      adapter = await import("./adapters/firebase.js");
    } else if (DB_TYPE === "mongodb") {
      adapter = await import("./adapters/mongodb.js");
    } else {
      adapter = await import("./adapters/memory.js");
    }
  } catch (err) {
    console.error(`[db] Failed to load adapter "${DB_TYPE}" (${err.message}). Falling back to in-memory store.`);
    adapter = await import("./adapters/memory.js");
  }
}

const ready = initAdapter();

export async function getTodos() {
  await ready;
  return adapter.getTodos();
}

export async function addTodo(text) {
  await ready;
  return adapter.addTodo(text);
}

export async function updateTodo(id, completed) {
  await ready;
  return adapter.updateTodo(id, completed);
}

export async function deleteTodo(id) {
  await ready;
  return adapter.deleteTodo(id);
}

export async function syncTable(tableName, data) {
  await ready;
  if (typeof adapter.syncTable === "function") {
    return adapter.syncTable(tableName, data);
  }
  throw new Error(`Sync not supported by adapter`);
}

export async function runQuery(sql) {
  await ready;
  const { sanitizeReadOnlySelect } = await import("./demo-guard.js");
  const safeSql = sanitizeReadOnlySelect(sql);
  if (typeof adapter.runQuery === "function") {
    return adapter.runQuery(safeSql);
  }
  throw new Error(`runQuery not supported by adapter`);
}
