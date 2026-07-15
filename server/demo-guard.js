/**
 * Demo API guardrails.
 *
 * Privileged endpoints (raw SQL, todos CRUD, filesystem browse) are disabled
 * unless CACHOU_DEMO=1. Production deploys should leave this unset/false.
 */

export function isDemoMode() {
  const value = process.env.CACHOU_DEMO;
  if (value === undefined || value === "") {
    // Dev servers default to demo mode; production `npm start` defaults off.
    return process.env.NODE_ENV !== "production";
  }
  return value === "1" || value === "true" || value === "yes";
}

export function denyUnlessDemo(res, feature = "demo API") {
  if (isDemoMode()) return false;
  res.statusCode = 403;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      error: `${feature} is disabled outside demo mode. Set CACHOU_DEMO=1 for local demos only.`
    })
  );
  return true;
}

/**
 * Allow only simple read-only SELECT statements against known demo tables.
 * Rejects multi-statement, writes, and anything that is not a plain SELECT.
 */
const ALLOWED_TABLES = new Set(["todos"]);

export function sanitizeReadOnlySelect(sql) {
  if (typeof sql !== "string" || !sql.trim()) {
    throw Object.assign(new Error("Query is required"), { statusCode: 400 });
  }

  const cleaned = sql
    .replace(/--.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim();

  if (cleaned.includes(";")) {
    throw Object.assign(new Error("Multiple statements are not allowed"), { statusCode: 400 });
  }

  const normalized = cleaned.replace(/\s+/g, " ");
  const match = normalized.match(/^select\s+([\w\s.*,]+)\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)(\s+order\s+by\s+[\w\s,]+)?(\s+limit\s+\d+)?$/i);
  if (!match) {
    throw Object.assign(
      new Error("Only simple SELECT queries against allowlisted tables are permitted"),
      { statusCode: 400 }
    );
  }

  const table = match[2].toLowerCase();
  if (!ALLOWED_TABLES.has(table)) {
    throw Object.assign(new Error(`Table "${table}" is not allowlisted`), { statusCode: 403 });
  }

  return `SELECT ${match[1].trim()} FROM ${table}${match[3] || ""}${match[4] || ""}`;
}

export function assertSafeIdentifier(name, label = "identifier") {
  if (typeof name !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw Object.assign(new Error(`Invalid ${label}`), { statusCode: 400 });
  }
  if (!ALLOWED_TABLES.has(name.toLowerCase())) {
    throw Object.assign(new Error(`${label} is not allowlisted`), { statusCode: 403 });
  }
  return name;
}
