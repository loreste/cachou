import { signal } from "./reactivity.js";

const isClient = typeof window !== "undefined";

export const [currentPath, setCurrentPath] = signal(isClient ? window.location.pathname : "/");
export const [currentSearch, setCurrentSearch] = signal(isClient ? window.location.search : "");

export function setSSRPath(path) {
  setCurrentPath(path);
  setCurrentSearch("");
}
