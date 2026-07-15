/**
 * Shared stub for unfinished multi-database adapters.
 * Enable only with CACHOU_DB_EXPERIMENTAL=1 and implement real drivers in your app.
 */

export function unsupported(name) {
  return {
    async getTodos() {
      throw new Error(
        `Cachou adapter "${name}" is experimental and not implemented for production use. ` +
          `Use sqlite/memory, or build your own API. Set CACHOU_DB_EXPERIMENTAL=1 only for local experiments.`
      );
    },
    async addTodo() {
      return this.getTodos();
    },
    async updateTodo() {
      return this.getTodos();
    },
    async deleteTodo() {
      return this.getTodos();
    },
    async runQuery() {
      return this.getTodos();
    },
    async syncTable() {
      return this.getTodos();
    }
  };
}
