/**
 * Shared stub for unfinished multi-database adapters.
 * Enable only with CACHOU_DB_EXPERIMENTAL=1 and implement real drivers in your app.
 */

export function unsupported(name) {
  const msg = `[cachou] The "${name}" adapter is not implemented. Supported adapters: sqlite, postgres, memory. ` +
    `To use ${name}, build a custom adapter or contribute one at github.com/loreste/cachou.`;

  function fail() {
    throw Object.assign(new Error(msg), { statusCode: 501 });
  }

  return {
    getTodos: fail,
    addTodo: fail,
    updateTodo: fail,
    deleteTodo: fail,
    runQuery: fail,
    syncTable: fail
  };
}
