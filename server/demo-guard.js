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
 * Rejects multi-statement, writes, UNION/subquery smuggling, and anything
 * that is not a plain `SELECT cols FROM table [ORDER BY …] [LIMIT n]`.
 */
const ALLOWED_TABLES = new Set(["todos"]);

/** Identifiers only — no functions, keywords, or expressions. */
const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Columns: `*` or comma-separated bare identifiers (optionally `AS alias`).
 * Intentionally rejects expressions, strings, and nested keywords so a
 * second `FROM` cannot be smuggled into the column list.
 */
function parseSelectColumns(columnsRaw) {
  const columns = columnsRaw.trim();
  if (!columns) {
    throw Object.assign(new Error("Only simple SELECT queries against allowlisted tables are permitted"), {
      statusCode: 400
    });
  }
  if (columns === "*") return "*";

  const parts = columns.split(",").map(p => p.trim());
  if (parts.length === 0 || parts.some(p => !p)) {
    throw Object.assign(new Error("Only simple SELECT queries against allowlisted tables are permitted"), {
      statusCode: 400
    });
  }

  const normalized = [];
  for (const part of parts) {
    // col | col AS alias | col alias
    const tokens = part.split(/\s+/);
    if (tokens.length === 1) {
      if (!IDENT.test(tokens[0])) {
        throw Object.assign(new Error("Only simple SELECT queries against allowlisted tables are permitted"), {
          statusCode: 400
        });
      }
      normalized.push(tokens[0]);
      continue;
    }
    if (tokens.length === 2 && IDENT.test(tokens[0]) && IDENT.test(tokens[1])) {
      // implicit alias: col alias
      normalized.push(`${tokens[0]} AS ${tokens[1]}`);
      continue;
    }
    if (
      tokens.length === 3 &&
      IDENT.test(tokens[0]) &&
      /^as$/i.test(tokens[1]) &&
      IDENT.test(tokens[2])
    ) {
      normalized.push(`${tokens[0]} AS ${tokens[2]}`);
      continue;
    }
    throw Object.assign(new Error("Only simple SELECT queries against allowlisted tables are permitted"), {
      statusCode: 400
    });
  }
  return normalized.join(", ");
}

/**
 * ORDER BY: comma-separated `col` or `col ASC|DESC` only.
 * Rejects expressions, UNION smuggling, OFFSET, COLLATE, CASE, etc.
 */
function parseOrderBy(orderRaw) {
  const parts = orderRaw.split(",").map(p => p.trim());
  if (parts.length === 0 || parts.some(p => !p)) {
    throw Object.assign(new Error("Only simple SELECT queries against allowlisted tables are permitted"), {
      statusCode: 400
    });
  }
  const normalized = [];
  for (const part of parts) {
    const tokens = part.split(/\s+/);
    if (tokens.length === 1 && IDENT.test(tokens[0])) {
      normalized.push(tokens[0]);
      continue;
    }
    if (tokens.length === 2 && IDENT.test(tokens[0]) && /^(asc|desc)$/i.test(tokens[1])) {
      normalized.push(`${tokens[0]} ${tokens[1].toUpperCase()}`);
      continue;
    }
    throw Object.assign(new Error("Only simple SELECT queries against allowlisted tables are permitted"), {
      statusCode: 400
    });
  }
  return normalized.join(", ");
}

export function sanitizeReadOnlySelect(sql) {
  if (typeof sql !== "string" || !sql.trim()) {
    throw Object.assign(new Error("Query is required"), { statusCode: 400 });
  }

  const cleaned = sql
    .replace(/--.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();

  if (cleaned.includes(";")) {
    throw Object.assign(new Error("Multiple statements are not allowed"), { statusCode: 400 });
  }

  // Reject quotes / backticks — no string literals or quoted identifiers in demo SQL.
  if (/['"`]/.test(cleaned)) {
    throw Object.assign(
      new Error("Only simple SELECT queries against allowlisted tables are permitted"),
      { statusCode: 400 }
    );
  }

  const normalized = cleaned.replace(/\s+/g, " ").trim();

  // Hard reject write / union / pragma / extension keywords before structural parse.
  if (
    /\b(into|insert|update|delete|drop|alter|create|grant|exec|execute|union|except|intersect|pragma|attach|detach|replace|upsert|truncate|call|load_extension|with|join|where|group|having|window|offset|collate|case|cast|exists|like|glob|regexp|match|between|isnull|is\s+not|not\s+null|sqlite_)\b/i.test(
      normalized
    )
  ) {
    throw Object.assign(
      new Error("Only simple SELECT queries against allowlisted tables are permitted"),
      { statusCode: 400 }
    );
  }

  // Exactly one FROM — prevents column-list smuggling of a second FROM.
  const fromSplit = normalized.split(/\bFROM\b/i);
  if (fromSplit.length !== 2) {
    throw Object.assign(
      new Error("Only simple SELECT queries against allowlisted tables are permitted"),
      { statusCode: 400 }
    );
  }

  const selectPart = fromSplit[0].trim();
  const restPart = fromSplit[1].trim();
  if (!/^SELECT\s+/i.test(selectPart)) {
    throw Object.assign(
      new Error("Only simple SELECT queries against allowlisted tables are permitted"),
      { statusCode: 400 }
    );
  }

  const columnsRaw = selectPart.replace(/^SELECT\s+/i, "").trim();
  const columns = parseSelectColumns(columnsRaw);

  // table [ORDER BY ...] [LIMIT n]
  const restMatch = restPart.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?\s*$/i
  );
  if (!restMatch) {
    throw Object.assign(
      new Error("Only simple SELECT queries against allowlisted tables are permitted"),
      { statusCode: 400 }
    );
  }

  const table = restMatch[1].toLowerCase();
  if (!ALLOWED_TABLES.has(table)) {
    throw Object.assign(new Error(`Table "${table}" is not allowlisted`), { statusCode: 403 });
  }

  let orderClause = "";
  if (restMatch[2]) {
    // If ORDER BY captured text still contains LIMIT (non-greedy failed edge), re-split.
    let orderRaw = restMatch[2].trim();
    let limitFromOrder = null;
    const limitInOrder = orderRaw.match(/^(.*?)\s+LIMIT\s+(\d+)\s*$/i);
    if (limitInOrder) {
      orderRaw = limitInOrder[1].trim();
      limitFromOrder = limitInOrder[2];
    }
    orderClause = ` ORDER BY ${parseOrderBy(orderRaw)}`;
    if (limitFromOrder && !restMatch[3]) {
      return `SELECT ${columns} FROM ${table}${orderClause} LIMIT ${limitFromOrder}`;
    }
  }

  const limitClause = restMatch[3] ? ` LIMIT ${restMatch[3]}` : "";
  return `SELECT ${columns} FROM ${table}${orderClause}${limitClause}`;
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
