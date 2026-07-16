const dbStore = {
  todos: [
    { id: 1, text: "In-Memory database fallback", completed: true },
    { id: 2, text: "Configure environment variables to use PostgreSQL, MySQL, SQLite, or Firebase", completed: false }
  ]
};

export function getTodos() {
  return dbStore.todos;
}

export function addTodo(text) {
  const nextId = Math.max(0, ...dbStore.todos.map(t => t.id)) + 1;
  const newItem = { id: nextId, text, completed: false };
  dbStore.todos.push(newItem);
  return newItem;
}

export function updateTodo(id, completed) {
  const todo = dbStore.todos.find(t => t.id === Number(id) || t.id === id);
  if (todo) {
    todo.completed = completed;
  }
  return { id: Number(id), completed };
}

export function deleteTodo(id) {
  dbStore.todos = dbStore.todos.filter(t => t.id !== Number(id) && t.id !== id);
  return { id: Number(id) };
}

export function runQuery(sql) {
  const matchSelect = sql.match(/select\s+\*\s+from\s+(\w+)/i);
  if (matchSelect) {
    const tableName = matchSelect[1].toLowerCase();
    const table = dbStore[tableName] || [];
    let result = [...table];
    if (/order\s+by\s+id\s+asc/i.test(sql)) {
      result.sort((a, b) => a.id - b.id);
    } else if (/order\s+by\s+id\s+desc/i.test(sql)) {
      result.sort((a, b) => b.id - a.id);
    }
    return result;
  }
  throw new Error(`Memory query parser only supports simple SELECT * FROM <tableName> queries`);
}

const ALLOWED_TABLES = new Set(["todos"]);

function validateTableName(name) {
  const key = name.toLowerCase();
  if (!ALLOWED_TABLES.has(key)) {
    throw new Error(`Table "${name}" is not allowed`);
  }
  return key;
}

export function syncTable(tableName, data) {
  const tableKey = validateTableName(tableName);
  dbStore[tableKey] = dbStore[tableKey] || [];
  const currentTable = dbStore[tableKey];
  const currentIds = new Set(currentTable.map(r => Number(r.id)));
  const newIds = new Set(data.map(r => r.id).filter(Boolean).map(Number));

  // 1. Delete rows not in newIds
  let updatedTable = currentTable.filter(r => newIds.has(Number(r.id)));

  // Determine next auto-increment ID
  let maxId = Math.max(0, ...updatedTable.map(r => Number(r.id)));

  // 2. Process data rows
  for (const row of data) {
    const dbRow = { ...row };
    if (dbRow.completed !== undefined) {
      dbRow.completed = Boolean(dbRow.completed);
    }
    if (dbRow.id !== undefined) {
      dbRow.id = Number(dbRow.id);
    }

    if (dbRow.id && currentIds.has(dbRow.id)) {
      // Update in-place
      const existingIdx = updatedTable.findIndex(r => Number(r.id) === dbRow.id);
      if (existingIdx !== -1) {
        updatedTable[existingIdx] = { ...updatedTable[existingIdx], ...dbRow };
      }
    } else {
      // Insert
      if (!dbRow.id) {
        maxId++;
        dbRow.id = maxId;
      }
      updatedTable.push(dbRow);
    }
  }

  dbStore[tableKey] = updatedTable;
  return runQuery(`SELECT * FROM ${tableKey} ORDER BY id ASC`);
}

