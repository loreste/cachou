import { signal } from "./reactivity.js";

const isClient = typeof window !== "undefined";

export const [currentPath, setCurrentPath] = signal(isClient ? window.location.pathname : "/");
export const [currentSearch, setCurrentSearch] = signal(isClient ? window.location.search : "");

/** @type {'browser' | 'hash' | 'memory'} */
let historyMode = "browser";
let memoryPath = "/";
let memorySearch = "";
let hashListenerAttached = false;
let popstateAttached = false;

function readHashLocation() {
  if (!isClient) return { path: "/", search: "" };
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const q = raw.indexOf("?");
  if (q === -1) return { path: raw.startsWith("/") ? raw : `/${raw}`, search: "" };
  const path = raw.slice(0, q);
  return {
    path: path.startsWith("/") ? path : `/${path}`,
    search: raw.slice(q)
  };
}

function ensurePopstate() {
  if (!isClient || popstateAttached) return;
  popstateAttached = true;
  window.addEventListener("popstate", () => {
    if (historyMode !== "browser") return;
    setCurrentPath(window.location.pathname);
    setCurrentSearch(window.location.search);
  });
}

function ensureHashListener() {
  if (!isClient || hashListenerAttached) return;
  hashListenerAttached = true;
  window.addEventListener("hashchange", () => {
    if (historyMode !== "hash") return;
    const loc = readHashLocation();
    setCurrentPath(loc.path);
    setCurrentSearch(loc.search);
  });
}

/**
 * Configure router history strategy.
 * @param {{ history?: 'browser'|'hash'|'memory', initialPath?: string }} options
 */
export function configureRouter(options = {}) {
  const mode = options.history || "browser";
  historyMode = mode === "hash" || mode === "memory" ? mode : "browser";

  if (options.initialPath) {
    try {
      const url = new URL(options.initialPath, "http://local.invalid");
      memoryPath = url.pathname;
      memorySearch = url.search;
      setCurrentPath(url.pathname);
      setCurrentSearch(url.search);
    } catch {
      setCurrentPath(options.initialPath);
      setCurrentSearch("");
    }
  }

  if (historyMode === "browser") {
    ensurePopstate();
    if (isClient) {
      setCurrentPath(window.location.pathname);
      setCurrentSearch(window.location.search);
    }
  } else if (historyMode === "hash") {
    ensureHashListener();
    if (isClient) {
      const loc = readHashLocation();
      setCurrentPath(loc.path);
      setCurrentSearch(loc.search);
    }
  } else if (historyMode === "memory") {
    setCurrentPath(memoryPath);
    setCurrentSearch(memorySearch);
  }

  return { history: historyMode };
}

export function getHistoryMode() {
  return historyMode;
}

export function applyNavigation(path, options = {}) {
  let pathname = path;
  let search = "";
  try {
    const base =
      isClient && historyMode === "browser"
        ? window.location.origin
        : "http://local.invalid";
    const url = new URL(path, base);
    pathname = url.pathname;
    search = url.search;
  } catch {
    const q = path.indexOf("?");
    if (q !== -1) {
      pathname = path.slice(0, q);
      search = path.slice(q);
    }
  }

  if (historyMode === "memory") {
    memoryPath = pathname;
    memorySearch = search;
    setCurrentPath(pathname);
    setCurrentSearch(search);
    return { pathname, search };
  }

  if (!isClient) {
    setCurrentPath(pathname);
    setCurrentSearch(search);
    return { pathname, search };
  }

  if (historyMode === "hash") {
    const hash = `#${pathname}${search}`;
    if (options.replace) {
      window.location.replace(hash);
    } else {
      window.location.hash = hash.slice(1);
    }
    setCurrentPath(pathname);
    setCurrentSearch(search);
    return { pathname, search };
  }

  // browser
  if (options.replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
  setCurrentPath(pathname);
  setCurrentSearch(search);
  return { pathname, search };
}

export function setSSRPath(path) {
  try {
    const url = new URL(path, "http://local.invalid");
    setCurrentPath(url.pathname);
    setCurrentSearch(url.search);
  } catch {
    setCurrentPath(path);
    setCurrentSearch("");
  }
}

// Default browser wiring
if (isClient) {
  ensurePopstate();
}
