import { createResource, signal } from "./reactivity.js";

function encodePath(path) {
  return encodeURIComponent(path || "");
}

async function readJSON(res) {
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || `Request failed with status ${res.status}`);
  }
  return payload;
}

export async function listFiles(path = "", options = {}) {
  const hidden = options.includeHidden ? "&hidden=1" : "";
  const res = await fetch(`/api/files?path=${encodePath(path)}${hidden}`);
  return readJSON(res);
}

export async function readFile(path = "") {
  const res = await fetch(`/api/files/content?path=${encodePath(path)}`);
  return readJSON(res);
}

export function createFileBrowser(initialPath = "", options = {}) {
  const [path, setPath] = signal(initialPath);
  const [directory, controls] = createResource(() => listFiles(path(), options), {
    key: options.key || "cachou-files-browser",
    staleTime: options.staleTime ?? 0,
    revalidateOnFocus: options.revalidateOnFocus ?? false
  });

  const open = (nextPath = "") => {
    setPath(nextPath);
    return controls.refetch();
  };

  const up = () => {
    const current = directory();
    if (current && current.parentPath !== null) {
      return open(current.parentPath);
    }
    return Promise.resolve();
  };

  return [
    directory,
    {
      ...controls,
      path,
      setPath,
      open,
      up
    }
  ];
}

export function createFileContent(pathSignal, options = {}) {
  return createResource(() => {
    const path = typeof pathSignal === "function" ? pathSignal() : pathSignal;
    if (!path) return null;
    return readFile(path);
  }, {
    key: options.key || "cachou-file-content",
    staleTime: options.staleTime ?? 0,
    revalidateOnFocus: options.revalidateOnFocus ?? false
  });
}
