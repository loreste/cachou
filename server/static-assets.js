/**
 * Safe static file resolution under a single dist root.
 * Blocks path traversal, absolute escapes, and null bytes.
 */
import path from "node:path";
import fs from "node:fs";

/**
 * Resolve an existing candidate and reject symlink escapes from the root.
 * @param {string} distRoot
 * @param {string} candidatePath
 * @returns {string | null} Real path when it remains under distRoot
 */
export function resolveSafeExistingAssetPath(distRoot, candidatePath) {
  try {
    const rootReal = fs.realpathSync(path.resolve(distRoot));
    const candidateReal = fs.realpathSync(path.resolve(candidatePath));
    const rel = path.relative(rootReal, candidateReal);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return candidateReal;
  } catch {
    return null;
  }
}

/**
 * @param {string} distRoot Absolute path to the dist directory
 * @param {string} requestUrl Raw request path (may include query/hash)
 * @returns {string | null} Resolved absolute path under distRoot, or null if unsafe
 */
export function resolveSafeAssetPath(distRoot, requestUrl) {
  if (typeof requestUrl !== "string" || !requestUrl) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(String(requestUrl).split("?")[0].split("#")[0]);
  } catch {
    return null;
  }

  if (decoded.includes("\0")) return null;

  // Map /demo/* and /* onto dist/
  let relative = decoded;
  if (relative.startsWith("/demo")) {
    relative = relative.slice("/demo".length) || "/";
  }
  relative = relative.replace(/^\/+/, "");

  // Reject Windows drive / UNC style absolute paths after decode
  if (path.isAbsolute(relative) || /^[a-zA-Z]:[\\/]/.test(relative) || relative.startsWith("\\\\")) {
    return null;
  }

  // Normalize separators and collapse ".."
  const root = path.resolve(distRoot);
  const candidate = path.resolve(root, relative);
  const rel = path.relative(root, candidate);

  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    // Empty rel means the root itself (directory) — allowed
    if (candidate === root) return candidate;
    return null;
  }

  if (fs.existsSync(candidate) && !resolveSafeExistingAssetPath(root, candidate)) {
    return null;
  }

  // rel === "" when candidate === root
  return candidate;
}
