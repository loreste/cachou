import { signal } from "./reactivity.js";
import { getActiveSSRContext } from "./ssr-context.js";

const isClient = typeof window !== "undefined";

const [basePath, setBasePath] = signal(isClient ? window.location.pathname : "/");
const [baseSearch, setBaseSearch] = signal(isClient ? window.location.search : "");

// Browser navigation is shared state; an active SSR render gets request-local
// values so overlapping requests cannot observe one another's URL.
export function currentPath() {
  const context = getActiveSSRContext();
  return context ? context.path : basePath();
}

export function setCurrentPath(value) {
  const context = getActiveSSRContext();
  if (context) context.path = value;
  else setBasePath(value);
}

export function currentSearch() {
  const context = getActiveSSRContext();
  return context ? context.search : baseSearch();
}

export function setCurrentSearch(value) {
  const context = getActiveSSRContext();
  if (context) context.search = value;
  else setBaseSearch(value);
}

/** @type {'browser' | 'hash' | 'memory'} */
let historyMode = "browser";
let memoryPath = "/";
let memorySearch = "";
let memoryEntries = [{ path: "/", search: "" }];
let memoryIndex = 0;
let hashListenerAttached = false;
let popstateAttached = false;
let historyNavigationHandler = null;
let browserHistoryIndex = null;
let browserHistoryState = null;
let restoringBrowserHistory = null;

const HISTORY_INDEX_KEY = "__cachouHistoryIndex";

function getHistoryIndex(state) {
  const index = state && typeof state === "object" ? state[HISTORY_INDEX_KEY] : null;
  return Number.isInteger(index) ? index : null;
}

function addHistoryIndex(state, index) {
  if (state && typeof state === "object" && !Array.isArray(state)) {
    return { ...state, [HISTORY_INDEX_KEY]: index };
  }
  return { __cachouHistoryState: state ?? null, [HISTORY_INDEX_KEY]: index };
}

function ensureBrowserHistoryIndex() {
  if (!isClient) return null;
  const existing = getHistoryIndex(window.history.state);
  if (existing !== null) {
    browserHistoryIndex = existing;
    browserHistoryState = window.history.state;
    return existing;
  }
  browserHistoryIndex = 0;
  browserHistoryState = addHistoryIndex(window.history.state, 0);
  window.history.replaceState(browserHistoryState, "", window.location.href);
  return browserHistoryIndex;
}

function setBrowserLocation(path, search) {
  setCurrentPath(path);
  setCurrentSearch(search);
}

export function setHistoryNavigationHandler(handler) {
  historyNavigationHandler = typeof handler === "function" ? handler : null;
  return () => {
    if (historyNavigationHandler === handler) historyNavigationHandler = null;
  };
}

function handleBrowserHistoryChange(event) {
  if (historyMode !== "browser") return;
  const path = window.location.pathname;
  const search = window.location.search;
  const targetIndex = getHistoryIndex(event?.state ?? window.history.state);

  if (restoringBrowserHistory) {
    const previous = restoringBrowserHistory;
    restoringBrowserHistory = null;
    browserHistoryIndex = previous.index;
    browserHistoryState = previous.state;
    setBrowserLocation(previous.path, previous.search);
    return;
  }

  const previous = {
    path: basePath(),
    search: baseSearch(),
    index: browserHistoryIndex,
    state: browserHistoryState
  };

  // Entries created outside CachouJS have no recoverable position. Updating
  // them directly is safer than running a guard that could leave the URL and
  // reactive route state disagreeing.
  if (targetIndex === null || previous.index === null || !historyNavigationHandler) {
    browserHistoryIndex = targetIndex ?? browserHistoryIndex;
    browserHistoryState = window.history.state;
    setBrowserLocation(path, search);
    return;
  }

  const settle = status => {
    if (status === "superseded") return;
    if (status !== false) {
      browserHistoryIndex = targetIndex;
      browserHistoryState = window.history.state;
      setBrowserLocation(path, search);
      return;
    }

    const delta = previous.index - targetIndex;
    if (delta !== 0 && typeof window.history.go === "function") {
      restoringBrowserHistory = previous;
      window.history.go(delta);
      return;
    }

    browserHistoryIndex = previous.index;
    browserHistoryState = previous.state;
    window.history.replaceState(browserHistoryState, "", `${previous.path}${previous.search}`);
    setBrowserLocation(previous.path, previous.search);
  };

  let result;
  try {
    result = historyNavigationHandler({
      event,
      mode: "browser",
      path,
      search,
      from: `${previous.path}${previous.search}`,
      targetIndex,
      previousIndex: previous.index
    });
  } catch {
    settle(false);
    return;
  }
  if (result && typeof result.then === "function") {
    result.then(settle, () => settle(false));
  } else {
    settle(result);
  }
}

function handleHashHistoryChange(event) {
  if (historyMode !== "hash") return;
  const { path, search } = readHashLocation();

  // A manually edited hash has no separate history position to restore.
  if (event?.type === "hashchange") {
    setCurrentPath(path);
    setCurrentSearch(search);
    return;
  }

  const targetIndex = getHistoryIndex(event?.state ?? window.history.state);
  if (restoringBrowserHistory) {
    const previous = restoringBrowserHistory;
    restoringBrowserHistory = null;
    browserHistoryIndex = previous.index;
    browserHistoryState = previous.state;
    setBrowserLocation(previous.path, previous.search);
    return;
  }

  const previous = {
    path: basePath(),
    search: baseSearch(),
    index: browserHistoryIndex,
    state: browserHistoryState
  };
  if (targetIndex === null || previous.index === null || !historyNavigationHandler) {
    browserHistoryIndex = targetIndex ?? browserHistoryIndex;
    browserHistoryState = window.history.state;
    setBrowserLocation(path, search);
    return;
  }

  const settle = status => {
    if (status === "superseded") return;
    if (status !== false) {
      browserHistoryIndex = targetIndex;
      browserHistoryState = window.history.state;
      setBrowserLocation(path, search);
      return;
    }

    const delta = previous.index - targetIndex;
    if (delta !== 0 && typeof window.history.go === "function") {
      restoringBrowserHistory = previous;
      window.history.go(delta);
      return;
    }

    browserHistoryIndex = previous.index;
    browserHistoryState = previous.state;
    window.history.replaceState(
      browserHistoryState,
      "",
      `${window.location.pathname}${window.location.search}#${previous.path}${previous.search}`
    );
    setBrowserLocation(previous.path, previous.search);
  };

  let result;
  try {
    result = historyNavigationHandler({
      event,
      mode: "hash",
      path,
      search,
      from: `${previous.path}${previous.search}`,
      targetIndex,
      previousIndex: previous.index
    });
  } catch {
    settle(false);
    return;
  }
  if (result && typeof result.then === "function") {
    result.then(settle, () => settle(false));
  } else {
    settle(result);
  }
}

function activeContext() {
  return getActiveSSRContext();
}

function getMemoryEntries(context) {
  if (context) {
    if (!Array.isArray(context.memoryEntries) || context.memoryEntries.length === 0) {
      context.memoryEntries = [{ path: context.memoryPath || "/", search: context.memorySearch || "" }];
      context.memoryIndex = 0;
    }
    return context.memoryEntries;
  }
  if (!Array.isArray(memoryEntries) || memoryEntries.length === 0) {
    memoryEntries = [{ path: memoryPath || "/", search: memorySearch || "" }];
    memoryIndex = 0;
  }
  return memoryEntries;
}

function getMemoryIndex(context) {
  const entries = getMemoryEntries(context);
  const index = context ? context.memoryIndex : memoryIndex;
  return Math.max(0, Math.min(Number.isInteger(index) ? index : 0, entries.length - 1));
}

function setMemoryIndex(context, index) {
  if (context) context.memoryIndex = index;
  else memoryIndex = index;
}

function setMemoryLocation(context, location) {
  if (context) {
    context.memoryPath = location.path;
    context.memorySearch = location.search;
  } else {
    memoryPath = location.path;
    memorySearch = location.search;
  }
}

function resetMemoryHistory(context, location) {
  const entries = [{ path: location.path, search: location.search }];
  if (context) context.memoryEntries = entries;
  else memoryEntries = entries;
  setMemoryIndex(context, 0);
  setMemoryLocation(context, location);
}

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
  window.addEventListener("popstate", event => {
    if (historyMode === "browser") handleBrowserHistoryChange(event);
    else if (historyMode === "hash") handleHashHistoryChange(event);
  });
}

function ensureHashListener() {
  if (!isClient || hashListenerAttached) return;
  hashListenerAttached = true;
  window.addEventListener("hashchange", event => {
    if (historyMode !== "hash") return;
    handleHashHistoryChange(event);
  });
}

/**
 * Configure router history strategy.
 * @param {{ history?: 'browser'|'hash'|'memory', initialPath?: string }} options
 */
export function configureRouter(options = {}) {
  const mode = options.history || "browser";
  const normalizedMode = mode === "hash" || mode === "memory" ? mode : "browser";
  const context = activeContext();
  if (context) context.historyMode = normalizedMode;
  else historyMode = normalizedMode;

  if (options.initialPath) {
    try {
      const url = new URL(options.initialPath, "http://local.invalid");
      if (context) {
        context.memoryPath = url.pathname;
        context.memorySearch = url.search;
        context.memoryEntries = [{ path: url.pathname, search: url.search }];
        context.memoryIndex = 0;
      } else {
        memoryPath = url.pathname;
        memorySearch = url.search;
        memoryEntries = [{ path: url.pathname, search: url.search }];
        memoryIndex = 0;
      }
      setCurrentPath(url.pathname);
      setCurrentSearch(url.search);
    } catch {
      resetMemoryHistory(context, { path: options.initialPath, search: "" });
      setCurrentPath(options.initialPath);
      setCurrentSearch("");
    }
  }

  if (normalizedMode === "browser") {
    ensurePopstate();
    if (isClient) {
      ensureBrowserHistoryIndex();
      setCurrentPath(window.location.pathname);
      setCurrentSearch(window.location.search);
    }
  } else if (normalizedMode === "hash") {
    ensureHashListener();
    if (isClient) {
      ensureBrowserHistoryIndex();
      const loc = readHashLocation();
      setCurrentPath(loc.path);
      setCurrentSearch(loc.search);
    }
  } else if (normalizedMode === "memory") {
    const entries = getMemoryEntries(context);
    const entry = entries[getMemoryIndex(context)];
    setMemoryLocation(context, entry);
    setCurrentPath(entry.path);
    setCurrentSearch(entry.search);
  }

  return { history: normalizedMode };
}

export function getHistoryMode() {
  return activeContext()?.historyMode || historyMode;
}

export function applyNavigation(path, options = {}) {
  let pathname = path;
  let search = "";
  const mode = getHistoryMode();
  try {
    const base =
      isClient && mode === "browser"
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

  const context = activeContext();
  if (mode === "memory") {
    const entries = getMemoryEntries(context);
    let index = getMemoryIndex(context);
    const entry = { path: pathname, search };
    if (options.replace) {
      entries[index] = entry;
    } else {
      entries.splice(index + 1);
      entries.push(entry);
      index = entries.length - 1;
    }
    setMemoryIndex(context, index);
    setMemoryLocation(context, entries[index]);
    setCurrentPath(entries[index].path);
    setCurrentSearch(entries[index].search);
    return { pathname, search };
  }

  if (!isClient) {
    setCurrentPath(pathname);
    setCurrentSearch(search);
    return { pathname, search };
  }

  if (mode === "hash") {
    ensureBrowserHistoryIndex();
    const currentState = window.history.state;
    const currentIndex = getHistoryIndex(currentState) ?? browserHistoryIndex ?? 0;
    const hashUrl = `${window.location.pathname}${window.location.search}#${pathname}${search}`;
    if (options.replace) {
      browserHistoryIndex = getHistoryIndex(currentState) ?? currentIndex;
      browserHistoryState = addHistoryIndex(currentState, browserHistoryIndex);
      window.history.replaceState(browserHistoryState, "", hashUrl);
    } else {
      browserHistoryIndex = currentIndex + 1;
      browserHistoryState = addHistoryIndex(currentState, browserHistoryIndex);
      window.history.pushState(browserHistoryState, "", hashUrl);
    }
    setBrowserLocation(pathname, search);
    return { pathname, search };
  }

  // browser
  ensureBrowserHistoryIndex();
  const currentState = window.history.state;
  const currentIndex = getHistoryIndex(currentState) ?? browserHistoryIndex ?? 0;
  if (options.replace) {
    browserHistoryIndex = getHistoryIndex(currentState) ?? currentIndex;
    browserHistoryState = addHistoryIndex(currentState, browserHistoryIndex);
    window.history.replaceState(browserHistoryState, "", path);
  } else {
    browserHistoryIndex = currentIndex + 1;
    browserHistoryState = addHistoryIndex(currentState, browserHistoryIndex);
    window.history.pushState(browserHistoryState, "", path);
  }
  setBrowserLocation(pathname, search);
  return { pathname, search };
}

/** Move through the configured history implementation. */
export function go(delta = 0) {
  const amount = Number(delta);
  if (!Number.isInteger(amount)) return false;

  const mode = getHistoryMode();
  if (mode === "memory") {
    const context = activeContext();
    const entries = getMemoryEntries(context);
    const currentIndex = getMemoryIndex(context);
    const nextIndex = currentIndex + amount;
    if (nextIndex < 0 || nextIndex >= entries.length || nextIndex === currentIndex) return false;
    const entry = entries[nextIndex];
    setMemoryIndex(context, nextIndex);
    setMemoryLocation(context, entry);
    setCurrentPath(entry.path);
    setCurrentSearch(entry.search);
    return true;
  }

  if (!isClient || typeof window.history?.go !== "function") return false;
  window.history.go(amount);
  return true;
}

export function back() {
  return go(-1);
}

export function forward() {
  return go(1);
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
