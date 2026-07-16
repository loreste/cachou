import fs from "fs";
import path from "path";

const textExtensions = new Set([
  ".c", ".cc", ".css", ".csv", ".cxx", ".go", ".h", ".html", ".js", ".json",
  ".jsx", ".log", ".md", ".mjs", ".py", ".rs", ".sh", ".sql", ".svg", ".toml",
  ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml"
]);

const mimeTypes = {
  ".css": "text/css",
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".html": "text/html",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".mjs": "application/javascript",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".xml": "application/xml"
};

export function getFilesRoot() {
  if (process.env.CACHOU_FILES_ROOT) {
    return path.resolve(process.env.CACHOU_FILES_ROOT);
  }
  // Prefer a sandbox directory so demos never expose the full project by default.
  const sandbox = path.resolve(process.cwd(), "sandbox");
  return sandbox;
}

function sendJSON(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function getPathParam(req) {
  const parsedUrl = new URL(req.url, "http://localhost");
  return parsedUrl.searchParams.get("path") || "";
}

function isHiddenName(name) {
  return name.startsWith(".");
}

async function resolveSafePath(root, requestedPath) {
  const rootReal = await fs.promises.realpath(root);
  const target = path.resolve(rootReal, requestedPath || ".");
  const lexicalRel = path.relative(rootReal, target);
  if (lexicalRel.startsWith("..") || path.isAbsolute(lexicalRel)) {
    const err = new Error("Path is outside the configured files root");
    err.statusCode = 403;
    throw err;
  }

  // Check each path segment for symlinks to prevent TOCTOU symlink attacks
  const segments = lexicalRel ? lexicalRel.split(path.sep) : [];
  let current = rootReal;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const lstat = await fs.promises.lstat(current);
      if (lstat.isSymbolicLink()) {
        const err = new Error("Symbolic links are not allowed");
        err.statusCode = 403;
        throw err;
      }
    } catch (e) {
      if (e.statusCode === 403) throw e;
      const err = new Error("Path not found");
      err.statusCode = 404;
      throw err;
    }
  }

  const targetReal = await fs.promises.realpath(target);
  if (targetReal !== rootReal && !targetReal.startsWith(rootReal + path.sep)) {
    const err = new Error("Path is outside the configured files root");
    err.statusCode = 403;
    throw err;
  }
  return { rootReal, targetReal };
}

function toRelativePath(rootReal, absolutePath) {
  const rel = path.relative(rootReal, absolutePath);
  return rel === "" ? "" : rel.split(path.sep).join("/");
}

function getMimeType(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function isTextFile(filePath, mime) {
  if (mime.startsWith("text/")) return true;
  return textExtensions.has(path.extname(filePath).toLowerCase());
}

export async function listFiles(requestedPath = "", options = {}) {
  const root = path.resolve(options.root || getFilesRoot());
  const includeHidden = options.includeHidden === true;
  const { rootReal, targetReal } = await resolveSafePath(root, requestedPath);
  const stat = await fs.promises.stat(targetReal);

  if (!stat.isDirectory()) {
    const err = new Error("Path is not a directory");
    err.statusCode = 400;
    throw err;
  }

  const dirents = await fs.promises.readdir(targetReal, { withFileTypes: true });
  const entries = [];

  for (const dirent of dirents) {
    if (!includeHidden && isHiddenName(dirent.name)) continue;

    const absolutePath = path.join(targetReal, dirent.name);
    let entryStat;
    try {
      entryStat = await fs.promises.stat(absolutePath);
    } catch (err) {
      continue;
    }

    const type = dirent.isDirectory() ? "directory" : dirent.isFile() ? "file" : "other";
    entries.push({
      name: dirent.name,
      path: toRelativePath(rootReal, absolutePath),
      type,
      size: entryStat.size,
      mtimeMs: entryStat.mtimeMs,
      extension: path.extname(dirent.name).toLowerCase()
    });
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const currentPath = toRelativePath(rootReal, targetReal);
  const parentPath = currentPath ? toRelativePath(rootReal, path.dirname(targetReal)) : null;

  return {
    root: path.basename(rootReal),
    path: currentPath,
    parentPath,
    entries
  };
}

export async function readFileContent(requestedPath = "", options = {}) {
  const root = path.resolve(options.root || getFilesRoot());
  const maxBytes = options.maxBytes || Number(process.env.CACHOU_FILES_MAX_BYTES || 1024 * 1024);
  const { rootReal, targetReal } = await resolveSafePath(root, requestedPath);
  const stat = await fs.promises.stat(targetReal);

  if (!stat.isFile()) {
    const err = new Error("Path is not a file");
    err.statusCode = 400;
    throw err;
  }
  if (stat.size > maxBytes) {
    const err = new Error(`File is larger than the ${maxBytes} byte read limit`);
    err.statusCode = 413;
    throw err;
  }

  const mime = getMimeType(targetReal);
  const isText = isTextFile(targetReal, mime);
  const buffer = await fs.promises.readFile(targetReal);

  return {
    name: path.basename(targetReal),
    path: toRelativePath(rootReal, targetReal),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    mime,
    kind: isText ? "text" : "binary",
    content: isText ? buffer.toString("utf8") : buffer.toString("base64"),
    encoding: isText ? "utf8" : "base64"
  };
}

export async function serveFilesApi(req, res, options = {}) {
  if (req.method !== "GET") {
    sendJSON(res, 405, { error: "Method not allowed" });
    return true;
  }

  try {
    const parsedUrl = new URL(req.url, "http://localhost");
    const requestedPath = getPathParam(req);
    const root = options.root || getFilesRoot();
    const includeHidden = parsedUrl.searchParams.get("hidden") === "1";

    if (parsedUrl.pathname === "/api/files") {
      sendJSON(res, 200, await listFiles(requestedPath, { root, includeHidden }));
      return true;
    }

    if (parsedUrl.pathname === "/api/files/content") {
      sendJSON(res, 200, await readFileContent(requestedPath, { root }));
      return true;
    }
  } catch (err) {
    sendJSON(res, err.statusCode || 500, { error: err.message });
    return true;
  }

  return false;
}
