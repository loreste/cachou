/** @experimental */
import { unsupported } from "./experimental.js";
const api = unsupported("postgres");
export const getTodos = (...a) => api.getTodos(...a);
export const addTodo = (...a) => api.addTodo(...a);
export const updateTodo = (...a) => api.updateTodo(...a);
export const deleteTodo = (...a) => api.deleteTodo(...a);
export const runQuery = (...a) => api.runQuery(...a);
export const syncTable = (...a) => api.syncTable(...a);
