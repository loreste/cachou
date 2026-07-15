import http from "node:http";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.CRM_API_PORT || 5191);
// auto | memory | postgres
const MODE = process.env.CRM_DB_MODE || "auto";
const TABLE = "crm_records";
const SCHEMA_VERSION = 2;
const SESSION_TTL_MS = Number(process.env.CRM_SESSION_TTL_MS || 60 * 60 * 1000);
const CRM_KINDS = ["contacts", "companies", "deals", "activities", "messages", "audit"];
const INTERNAL_KINDS = ["users", "sessions"];
const ALL_KINDS = [...CRM_KINDS, ...INTERNAL_KINDS];
const CORS_ALLOW_ORIGINS = (process.env.CRM_CORS_ORIGINS || "http://127.0.0.1:5190,http://localhost:5190")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
const LOGIN_WINDOW_MS = Number(process.env.CRM_LOGIN_WINDOW_MS || 60_000);
const LOGIN_MAX_ATTEMPTS = Number(process.env.CRM_LOGIN_MAX_ATTEMPTS || 8);
const ROLE_PERMISSIONS = {
  Sales: ["read", "contacts:write", "messages:write"],
  Manager: ["read", "contacts:write", "deals:write", "messages:write"],
  Admin: ["read", "contacts:write", "contacts:delete", "deals:write", "deals:delete", "companies:write", "companies:delete", "activities:write", "activities:delete", "messages:write", "messages:delete", "users:write", "admin:reset"]
};
const USERS = loadUsers();
validateProductionConfig();
const TYPED_TABLES = {
  contacts: "crm_contacts",
  companies: "crm_companies",
  deals: "crm_deals",
  activities: "crm_activities",
  messages: "crm_messages"
};
const DEFAULT_DSNS = [
  "postgres://crm:crm@127.0.0.1:55433/crm?sslmode=disable",
  "postgres://postgres@127.0.0.1:5432/crm?sslmode=disable",
  "postgres://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable",
  "postgres://crm:crm@127.0.0.1:5432/crm?sslmode=disable"
];

const seed = {
  companies: [
    { id: "company_izitech", name: "Izitechnologies", segment: "Platform", owner: "L. Oreste" },
    { id: "company_northstar", name: "Northstar Health", segment: "Healthcare", owner: "Sales" },
    { id: "company_apex", name: "Apex Logistics", segment: "Operations", owner: "Sales" },
    { id: "company_helios", name: "Helios Energy", segment: "Energy", owner: "Manager" },
    { id: "company_metro", name: "Metro Finance", segment: "Financial services", owner: "Admin" }
  ],
  contacts: [
    { id: "contact_ada", name: "Ada Martin", email: "ada@northstar.example", phone: "555-0188", companyId: "company_northstar", company: "Northstar Health", status: "Active", owner: "Sales", notes: "Interested in a faster customer portal.", updatedAt: new Date().toISOString() },
    { id: "contact_miles", name: "Miles Chen", email: "miles@apex.example", phone: "555-0142", companyId: "company_apex", company: "Apex Logistics", status: "Nurture", owner: "L. Oreste", notes: "Needs integration notes for Postgres.", updatedAt: new Date().toISOString() },
    { id: "contact_rina", name: "Rina Cole", email: "rina@izitech.example", phone: "555-0164", companyId: "company_izitech", company: "Izitechnologies", status: "At risk", owner: "Platform", notes: "Wants proof the UI stays fast with large lists.", updatedAt: new Date().toISOString() },
    { id: "contact_omar", name: "Omar Reyes", email: "omar@helios.example", phone: "555-0199", companyId: "company_helios", company: "Helios Energy", status: "Active", owner: "Manager", notes: "Evaluating realtime operations dashboard.", updatedAt: new Date().toISOString() },
    { id: "contact_jules", name: "Jules Park", email: "jules@metro.example", phone: "555-0133", companyId: "company_metro", company: "Metro Finance", status: "Nurture", owner: "Admin", notes: "Needs role-based views for audit teams.", updatedAt: new Date().toISOString() }
  ],
  deals: [
    { id: "deal_1", name: "Portal modernization", companyId: "company_northstar", company: "Northstar Health", contactIds: ["contact_ada"], value: 82000, stage: "Qualified" },
    { id: "deal_2", name: "Analytics pilot", companyId: "company_apex", company: "Apex Logistics", contactIds: ["contact_miles"], value: 46000, stage: "Proposal" },
    { id: "deal_3", name: "Framework adoption", companyId: "company_izitech", company: "Izitechnologies", contactIds: ["contact_rina"], value: 125000, stage: "Won" },
    { id: "deal_4", name: "Realtime ops workspace", companyId: "company_helios", company: "Helios Energy", contactIds: ["contact_omar"], value: 96000, stage: "Lead" },
    { id: "deal_5", name: "Compliance CRM rollout", companyId: "company_metro", company: "Metro Finance", contactIds: ["contact_jules"], value: 71000, stage: "Qualified" }
  ],
  activities: [
    { id: "activity_1", title: "Send Postgres schema notes", contactId: "contact_miles", companyId: "company_apex", dealId: "deal_2", contact: "Miles Chen", due: "Today" },
    { id: "activity_2", title: "Benchmark walkthrough", contactId: "contact_rina", companyId: "company_izitech", dealId: "deal_3", contact: "Rina Cole", due: "Tomorrow" },
    { id: "activity_3", title: "Security review", contactId: "contact_ada", companyId: "company_northstar", dealId: "deal_1", contact: "Ada Martin", due: "Friday" }
  ],
  messages: [
    { id: "message_1", author: "Cachou Bot", text: "Realtime room is online.", createdAt: new Date().toISOString() },
    { id: "message_2", author: "Sales", text: "Postgres-backed workspace loaded.", createdAt: new Date().toISOString() }
  ],
  audit: []
};

const initialRecords = { ...seed, users: USERS, sessions: [] };
let store = structuredClone(initialRecords);
let repositoryPromise;
const sessions = new Map();
const failedLogins = new Map();
const metrics = {
  startedAt: new Date().toISOString(),
  requestsTotal: 0,
  inflight: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
  byStatus: {},
  byRoute: {}
};

function loadUsers() {
  if (process.env.CRM_USERS_JSON) {
    const parsed = JSON.parse(process.env.CRM_USERS_JSON);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("CRM_USERS_JSON must be a non-empty array");
    return parsed.map((user, index) => {
      const passwordSalt = user.passwordSalt || `${user.username || index}-custom-salt`;
      const passwordHash = user.passwordHash || hashPassword(String(user.password || ""), passwordSalt);
      if (!user.username || !passwordHash || !ROLE_PERMISSIONS[user.role]) throw new Error(`Invalid CRM user at index ${index}`);
      return {
        id: user.id || `user_${user.username}`,
        username: String(user.username),
        passwordHash,
        passwordSalt,
        name: String(user.name || user.username),
        role: user.role,
        disabled: Boolean(user.disabled)
      };
    });
  }
  if (process.env.CRM_REQUIRE_CUSTOM_AUTH === "1") {
    throw new Error("CRM_REQUIRE_CUSTOM_AUTH=1 requires CRM_USERS_JSON");
  }
  return [
    { id: "user_sales", username: "sales", passwordHash: hashPassword("sales", "sales-demo-salt"), passwordSalt: "sales-demo-salt", name: "Sales User", role: "Sales" },
    { id: "user_manager", username: "manager", passwordHash: hashPassword("manager", "manager-demo-salt"), passwordSalt: "manager-demo-salt", name: "Maya Manager", role: "Manager" },
    { id: "user_admin", username: "admin", passwordHash: hashPassword("admin", "admin-demo-salt"), passwordSalt: "admin-demo-salt", name: "Ari Admin", role: "Admin" }
  ];
}

function validateProductionConfig() {
  if (process.env.CRM_ENV !== "production") return;
  const errors = [];
  if (!process.env.CRM_USERS_JSON) errors.push("CRM_USERS_JSON is required");
  if (CORS_ALLOW_ORIGINS.includes("*")) errors.push("CRM_CORS_ORIGINS cannot include wildcard origins");
  if (SESSION_TTL_MS < 15 * 60 * 1000) errors.push("CRM_SESSION_TTL_MS must be at least 900000");
  if (USERS.some(user => ["sales", "manager", "admin"].includes(user.username) && String(user.passwordSalt || "").includes("demo"))) {
    errors.push("demo users are not allowed");
  }
  if (errors.length) {
    throw new Error(`Unsafe CRM production config: ${errors.join("; ")}`);
  }
}

function schemaInfo(mode, typedSchema = false, typedSchemaError = "") {
  return {
    version: SCHEMA_VERSION,
    mode,
    sourceOfTruth: TABLE,
    typedSchema,
    typedSchemaError,
    kinds: CRM_KINDS,
    tables: {
      records: TABLE,
      ...TYPED_TABLES
    },
    indexes: [
      `${TABLE}(kind,id)`,
      `${TYPED_TABLES.contacts}(owner,status)`,
      `${TYPED_TABLES.deals}(stage,value)`,
      `${TYPED_TABLES.messages}(created_at)`
    ]
  };
}

function corsOrigin(req) {
  const origin = req.headers.origin || "";
  if (CORS_ALLOW_ORIGINS.includes("*")) return "*";
  if (origin && CORS_ALLOW_ORIGINS.includes(origin)) return origin;
  return CORS_ALLOW_ORIGINS[0] || "http://127.0.0.1:5190";
}

function requestId(req) {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  if (/^[a-zA-Z0-9._:-]{8,96}$/.test(incoming)) return incoming;
  return randomUUID();
}

function json(req, res, status, payload) {
  const body = JSON.stringify(payload);
  const durationMs = Math.max(0, Date.now() - (req.crmStartedAt || Date.now()));
  recordMetric(req, status, durationMs);
  res.writeHead(status, {
    "Access-Control-Allow-Origin": corsOrigin(req),
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Referrer-Policy": "no-referrer",
    "Server-Timing": `app;dur=${durationMs}`,
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": req.crmRequestId || requestId(req)
  });
  res.end(body);
}

function routeLabel(req) {
  const path = String(req.url || "").split("?")[0]
    .replace(/\/api\/admin\/users\/[^/]+\/revoke$/, "/api/admin/users/:id/revoke")
    .replace(/\/api\/admin\/users\/[^/]+$/, "/api/admin/users/:id")
    .replace(/\/api\/(contacts|companies|deals|activities|messages)\/[^/]+$/, "/api/$1/:id");
  return `${req.method} ${path}`;
}

function recordMetric(req, status, durationMs) {
  if (req.crmMetricRecorded) return;
  req.crmMetricRecorded = true;
  metrics.requestsTotal += 1;
  metrics.inflight = Math.max(0, metrics.inflight - 1);
  metrics.totalDurationMs += durationMs;
  metrics.maxDurationMs = Math.max(metrics.maxDurationMs, durationMs);
  const statusKey = String(status);
  metrics.byStatus[statusKey] = (metrics.byStatus[statusKey] || 0) + 1;
  const label = routeLabel(req);
  const route = metrics.byRoute[label] || { count: 0, totalDurationMs: 0, maxDurationMs: 0, statuses: {} };
  route.count += 1;
  route.totalDurationMs += durationMs;
  route.maxDurationMs = Math.max(route.maxDurationMs, durationMs);
  route.statuses[statusKey] = (route.statuses[statusKey] || 0) + 1;
  metrics.byRoute[label] = route;
}

async function opsMetrics(repo) {
  const diagnostics = await repo.diagnostics();
  return {
    startedAt: metrics.startedAt,
    uptimeMs: Date.now() - Date.parse(metrics.startedAt),
    requestsTotal: metrics.requestsTotal,
    inflight: metrics.inflight,
    averageDurationMs: metrics.requestsTotal ? Number((metrics.totalDurationMs / metrics.requestsTotal).toFixed(2)) : 0,
    maxDurationMs: metrics.maxDurationMs,
    byStatus: metrics.byStatus,
    byRoute: Object.fromEntries(Object.entries(metrics.byRoute).map(([label, item]) => [label, {
      count: item.count,
      averageDurationMs: Number((item.totalDurationMs / item.count).toFixed(2)),
      maxDurationMs: item.maxDurationMs,
      statuses: item.statuses
    }])),
    sessionsCached: sessions.size,
    loginThrottleBuckets: failedLogins.size,
    websocketClients: typeof wss === "undefined" ? 0 : wss.clients.size,
    rowCounts: diagnostics.rowCounts,
    typedCounts: diagnostics.typedCounts
  };
}

function publicUser(user) {
  return { id: user.id, username: user.username, name: user.name, role: user.role, disabled: Boolean(user.disabled), permissions: ROLE_PERMISSIONS[user.role] || [] };
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString("hex");
}

function verifyPassword(user, password) {
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(hashPassword(password, user.passwordSalt), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function loginSession(repo, username, password) {
  const users = await repo.listKind("users");
  const user = users.find(item => item.username === username);
  if (!user || user.disabled || !verifyPassword(user, password)) {
    const err = new Error("Invalid username or password");
    err.status = 401;
    throw err;
  }
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const publicSessionUser = publicUser(user);
  const record = { id: token, user: publicSessionUser, expiresAt, createdAt: new Date().toISOString() };
  sessions.set(token, { user: publicSessionUser, expiresAt });
  await repo.save("sessions", record);
  return { token, expiresAt, user: publicSessionUser };
}

async function refreshSession(repo, token) {
  const session = await loadSession(repo, token);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    if (token) {
      sessions.delete(token);
      await repo.remove("sessions", token).catch(() => {});
    }
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const next = { user: session.user, expiresAt };
  sessions.set(token, next);
  await repo.save("sessions", { id: token, user: session.user, expiresAt, refreshedAt: new Date().toISOString() });
  return { token, expiresAt, user: session.user };
}

function assertLoginAllowed(req, username) {
  const key = `${req.socket.remoteAddress || "local"}:${username}`;
  const now = Date.now();
  const record = failedLogins.get(key);
  if (record && record.until > now && record.count >= LOGIN_MAX_ATTEMPTS) {
    const err = new Error("Too many login attempts. Try again shortly.");
    err.status = 429;
    throw err;
  }
}

function recordLoginFailure(req, username) {
  const key = `${req.socket.remoteAddress || "local"}:${username}`;
  const now = Date.now();
  const current = failedLogins.get(key);
  if (!current || current.until <= now) {
    failedLogins.set(key, { count: 1, until: now + LOGIN_WINDOW_MS });
    return;
  }
  current.count += 1;
}

function recordLoginSuccess(req, username) {
  failedLogins.delete(`${req.socket.remoteAddress || "local"}:${username}`);
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return "";
}

async function loadSession(repo, token) {
  if (!token) return null;
  const cached = sessions.get(token);
  if (cached) return cached;
  const stored = (await repo.listKind("sessions")).find(item => item.id === token);
  if (!stored) return null;
  const session = { user: stored.user, expiresAt: stored.expiresAt };
  sessions.set(token, session);
  return session;
}

async function requireAuth(req, repo) {
  const token = getBearerToken(req);
  const session = await loadSession(repo, token);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    if (token) {
      sessions.delete(token);
      await repo.remove("sessions", token).catch(() => {});
    }
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  return session.user;
}

function requirePermission(user, permission) {
  if (!user.permissions.includes(permission)) {
    const err = new Error(`Forbidden: ${permission} permission required`);
    err.status = 403;
    throw err;
  }
}

async function audit(repo, actor, action, details = {}) {
  try {
    await repo.save("audit", {
      id: randomUUID(),
      actor: actor?.username || actor?.name || "anonymous",
      role: actor?.role || "Guest",
      action,
      details,
      createdAt: new Date().toISOString()
    });
  } catch {}
}

function writePermission(kind) {
  return `${kind}:write`;
}

function deletePermission(kind) {
  return `${kind}:delete`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

async function getRepository() {
  if (!repositoryPromise) repositoryPromise = createRepository();
  return repositoryPromise;
}

async function createRepository() {
  if (MODE === "memory") return memoryRepository("memory");
  try {
    const pg = await import("pg");
    const repo = await postgresRepository(pg.default || pg);
    if (MODE === "auto") return repo;
    return repo;
  } catch (err) {
    if (MODE === "postgres") {
      throw new Error(`Postgres mode failed: ${err.message}`);
    }
    return memoryRepository(`memory-fallback: ${err.message}`);
  }
}

function memoryRepository(mode) {
  return {
    mode,
    schema: schemaInfo(mode, false, "memory adapter does not create SQL tables"),
    async init() {},
    async listAll() {
      return normalizeWorkspace(structuredClone(Object.fromEntries(CRM_KINDS.map(kind => [kind, store[kind] || []]))));
    },
    async listKind(kind) {
      validateKind(kind);
      return structuredClone(store[kind] || []);
    },
    async save(kind, record) {
      if (!store[kind]) throw new Error(`Unknown record kind: ${kind}`);
      const next = versionRecord(store[kind], record);
      store[kind] = upsert(store[kind], next);
      return next;
    },
    async remove(kind, id) {
      if (!store[kind]) throw new Error(`Unknown record kind: ${kind}`);
      store[kind] = store[kind].filter(record => record.id !== id);
    },
    async resetDemo() {
      store = structuredClone(initialRecords);
    },
    async diagnostics() {
      return {
        mode,
        sourceOfTruth: "memory",
        rowCounts: Object.fromEntries(ALL_KINDS.map(kind => [kind, store[kind]?.length || 0])),
        typedCounts: {},
        typedSchema: false
      };
    }
  };
}

async function postgresRepository(pg) {
  const { Client } = pg;
  const attempts = [];
  let client;
  let selectedDsn = "";
  for (const dsn of getCandidateDsns()) {
    const candidate = new Client({ connectionString: dsn, connectionTimeoutMillis: 1200 });
    try {
      await candidate.connect();
      client = candidate;
      selectedDsn = dsn;
      break;
    } catch (err) {
      attempts.push(`${redactDsn(dsn)} -> ${err.message}`);
      try {
        await candidate.end();
      } catch {}
    }
  }
  if (!client) {
    throw new Error(`Could not connect to Postgres. Attempts: ${attempts.join(" | ")}`);
  }
  let queryChain = Promise.resolve();
  const query = (text, params) => {
    const task = queryChain.then(() => client.query(text, params));
    queryChain = task.catch(() => {});
    return task;
  };
  await query(`CREATE TABLE IF NOT EXISTS ${TABLE} (kind TEXT, id TEXT, payload TEXT, updated_at TEXT)`);
  let typedSchema = true;
  let typedSchemaError = "";
  try {
    await setupTypedSchema(query);
  } catch (err) {
    typedSchema = false;
    typedSchemaError = err.message;
  }
  await seedIfEmpty(query);
  return {
    mode: `postgres:${redactDsn(selectedDsn)}`,
    schema: schemaInfo(`postgres:${redactDsn(selectedDsn)}`, typedSchema, typedSchemaError),
    async init() {},
    async listAll() {
      if (typedSchema) {
        try {
          const typed = await listTypedRecords(query);
          const audit = await query(`SELECT payload FROM ${TABLE} WHERE kind = $1`, ["audit"]);
          typed.audit = audit.rows.map(row => JSON.parse(row.payload));
          return normalizeWorkspace(typed);
        } catch {}
      }
      const result = await query(`SELECT kind, payload FROM ${TABLE}`);
      const next = { contacts: [], companies: [], deals: [], activities: [], messages: [], audit: [] };
      for (const row of result.rows) {
        if (next[row.kind]) next[row.kind].push(JSON.parse(row.payload));
      }
      return normalizeWorkspace(next);
    },
    async listKind(kind) {
      validateKind(kind);
      const result = await query(`SELECT payload FROM ${TABLE} WHERE kind = $1`, [kind]);
      return result.rows.map(row => JSON.parse(row.payload));
    },
    async save(kind, record) {
      validateKind(kind);
      const existing = await query(`SELECT payload FROM ${TABLE} WHERE kind = $1 AND id = $2`, [kind, record.id]);
      const current = existing.rows[0] ? JSON.parse(existing.rows[0].payload) : null;
      const next = versionRecord(current ? [current] : [], record);
      await query(`DELETE FROM ${TABLE} WHERE kind = $1 AND id = $2`, [kind, next.id]);
      await query(`INSERT INTO ${TABLE} (kind, id, payload, updated_at) VALUES ($1, $2, $3, $4)`, [
        kind,
        next.id,
        JSON.stringify(next),
        next.updatedAt
      ]);
      await mirrorTypedRecord(query, kind, next);
      return next;
    },
    async remove(kind, id) {
      validateKind(kind);
      await query(`DELETE FROM ${TABLE} WHERE kind = $1 AND id = $2`, [kind, id]);
      await removeTypedRecord(query, kind, id);
    },
    async resetDemo() {
      for (const kind of ALL_KINDS) {
        await query(`DELETE FROM ${TABLE} WHERE kind = $1`, [kind]);
        await removeAllTypedRecords(query, kind);
      }
      await seedIfEmpty(query);
    },
    async diagnostics() {
      return diagnostics(query, `postgres:${redactDsn(selectedDsn)}`, typedSchema, typedSchemaError);
    }
  };
}

function getCandidateDsns() {
  if (process.env.POSTGRES_DSN) return [process.env.POSTGRES_DSN];
  return DEFAULT_DSNS;
}

function redactDsn(dsn) {
  try {
    const url = new URL(dsn);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return dsn.replace(/:\/\/([^:/]+):([^@]+)@/, "://$1:****@");
  }
}

async function seedIfEmpty(query) {
  for (const [kind, records] of Object.entries(initialRecords)) {
    for (const record of records) {
      const existing = await query(`SELECT id FROM ${TABLE} WHERE kind = $1 AND id = $2`, [kind, record.id]);
      const next = {
        ...record,
        version: Number(record.version || 1),
        updatedAt: record.updatedAt || new Date().toISOString()
      };
      if (existing.rows.length === 0) {
        await query(`INSERT INTO ${TABLE} (kind, id, payload, updated_at) VALUES ($1, $2, $3, $4)`, [
          kind,
          next.id,
          JSON.stringify(next),
          next.updatedAt
        ]);
      }
      await mirrorTypedRecord(query, kind, next);
    }
  }
}

async function listTypedRecords(query) {
  const contacts = await query(`SELECT id, name, email, phone, company, company_id, status, owner, version, updated_at FROM ${TYPED_TABLES.contacts}`);
  const companies = await query(`SELECT id, name, segment, owner, version, updated_at FROM ${TYPED_TABLES.companies}`);
  const deals = await query(`SELECT id, name, company, company_id, contact_ids, value, stage, version, updated_at FROM ${TYPED_TABLES.deals}`);
  const activities = await query(`SELECT id, title, contact, contact_id, company_id, deal_id, due, version, updated_at FROM ${TYPED_TABLES.activities}`);
  const messages = await query(`SELECT id, author, text, created_at, version, updated_at FROM ${TYPED_TABLES.messages} ORDER BY created_at ASC`);
  return {
    contacts: contacts.rows.map(row => ({ id: row.id, name: row.name, email: row.email, phone: row.phone, companyId: row.company_id, company: row.company, status: row.status, owner: row.owner, version: Number(row.version || 1), updatedAt: row.updated_at })),
    companies: companies.rows.map(row => ({ id: row.id, name: row.name, segment: row.segment, owner: row.owner, version: Number(row.version || 1), updatedAt: row.updated_at })),
    deals: deals.rows.map(row => ({ id: row.id, name: row.name, companyId: row.company_id, company: row.company, contactIds: parseJsonArray(row.contact_ids), value: Number(row.value || 0), stage: row.stage, version: Number(row.version || 1), updatedAt: row.updated_at })),
    activities: activities.rows.map(row => ({ id: row.id, title: row.title, contactId: row.contact_id, companyId: row.company_id, dealId: row.deal_id, contact: row.contact, due: row.due, version: Number(row.version || 1), updatedAt: row.updated_at })),
    messages: messages.rows.map(row => ({ id: row.id, author: row.author, text: row.text, createdAt: row.created_at, version: Number(row.version || 1), updatedAt: row.updated_at })),
    audit: []
  };
}

async function setupTypedSchema(query) {
  await query(`CREATE INDEX IF NOT EXISTS crm_records_kind_id_idx ON ${TABLE} (kind, id)`);
  await query(`CREATE TABLE IF NOT EXISTS ${TYPED_TABLES.contacts} (id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, company TEXT, status TEXT, owner TEXT, version INTEGER, updated_at TEXT)`);
  await addColumnIfMissing(query, TYPED_TABLES.contacts, "company_id TEXT");
  await query(`CREATE INDEX IF NOT EXISTS crm_contacts_company_idx ON ${TYPED_TABLES.contacts} (company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS crm_contacts_owner_status_idx ON ${TYPED_TABLES.contacts} (owner, status)`);
  await query(`CREATE TABLE IF NOT EXISTS ${TYPED_TABLES.companies} (id TEXT PRIMARY KEY, name TEXT, segment TEXT, owner TEXT, version INTEGER, updated_at TEXT)`);
  await query(`CREATE TABLE IF NOT EXISTS ${TYPED_TABLES.deals} (id TEXT PRIMARY KEY, name TEXT, company TEXT, value INTEGER, stage TEXT, version INTEGER, updated_at TEXT)`);
  await addColumnIfMissing(query, TYPED_TABLES.deals, "company_id TEXT");
  await addColumnIfMissing(query, TYPED_TABLES.deals, "contact_ids TEXT");
  await query(`CREATE INDEX IF NOT EXISTS crm_deals_company_idx ON ${TYPED_TABLES.deals} (company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS crm_deals_stage_value_idx ON ${TYPED_TABLES.deals} (stage, value)`);
  await query(`CREATE TABLE IF NOT EXISTS ${TYPED_TABLES.activities} (id TEXT PRIMARY KEY, title TEXT, contact TEXT, due TEXT, version INTEGER, updated_at TEXT)`);
  await addColumnIfMissing(query, TYPED_TABLES.activities, "contact_id TEXT");
  await addColumnIfMissing(query, TYPED_TABLES.activities, "company_id TEXT");
  await addColumnIfMissing(query, TYPED_TABLES.activities, "deal_id TEXT");
  await query(`CREATE TABLE IF NOT EXISTS ${TYPED_TABLES.messages} (id TEXT PRIMARY KEY, author TEXT, text TEXT, created_at TEXT, version INTEGER, updated_at TEXT)`);
  await query(`CREATE INDEX IF NOT EXISTS crm_messages_created_at_idx ON ${TYPED_TABLES.messages} (created_at)`);
}

async function addColumnIfMissing(query, table, columnDefinition) {
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${columnDefinition}`);
  } catch {}
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeWorkspace(workspace) {
  const companies = workspace.companies || [];
  const contacts = workspace.contacts || [];
  const deals = workspace.deals || [];
  const companyByName = new Map(companies.map(company => [company.name, company]));
  const contactByName = new Map(contacts.map(contact => [contact.name, contact]));

  for (const contact of contacts) {
    if (!contact.companyId && contact.company) contact.companyId = companyByName.get(contact.company)?.id || "";
    if (!contact.company && contact.companyId) contact.company = companies.find(company => company.id === contact.companyId)?.name || "";
  }
  for (const deal of deals) {
    if (!deal.companyId && deal.company) deal.companyId = companyByName.get(deal.company)?.id || "";
    if (!deal.company && deal.companyId) deal.company = companies.find(company => company.id === deal.companyId)?.name || "";
    if (!Array.isArray(deal.contactIds)) deal.contactIds = [];
    if (deal.contact && deal.contactIds.length === 0) {
      const contact = contactByName.get(deal.contact);
      if (contact) deal.contactIds = [contact.id];
    }
  }
  for (const activity of workspace.activities || []) {
    if (!activity.contactId && activity.contact) activity.contactId = contactByName.get(activity.contact)?.id || "";
    const contact = contacts.find(item => item.id === activity.contactId);
    if (!activity.contact && contact) activity.contact = contact.name;
    if (!activity.companyId && contact) activity.companyId = contact.companyId || "";
    if (!activity.dealId && activity.companyId) activity.dealId = deals.find(deal => deal.companyId === activity.companyId)?.id || "";
  }
  return workspace;
}

async function mirrorTypedRecord(query, kind, record) {
  const table = TYPED_TABLES[kind];
  if (!table) return;
  try {
    await query(`DELETE FROM ${table} WHERE id = $1`, [record.id]);
    if (kind === "contacts") {
      await query(`INSERT INTO ${table} (id, name, email, phone, company, company_id, status, owner, version, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
        record.id, record.name || "", record.email || "", record.phone || "", record.company || "", record.companyId || "", record.status || "", record.owner || "", Number(record.version || 1), record.updatedAt || ""
      ]);
    } else if (kind === "companies") {
      await query(`INSERT INTO ${table} (id, name, segment, owner, version, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`, [
        record.id, record.name || "", record.segment || "", record.owner || "", Number(record.version || 1), record.updatedAt || ""
      ]);
    } else if (kind === "deals") {
      await query(`INSERT INTO ${table} (id, name, company, company_id, contact_ids, value, stage, version, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
        record.id, record.name || "", record.company || "", record.companyId || "", JSON.stringify(record.contactIds || []), Number(record.value || 0), record.stage || "", Number(record.version || 1), record.updatedAt || ""
      ]);
    } else if (kind === "activities") {
      await query(`INSERT INTO ${table} (id, title, contact, contact_id, company_id, deal_id, due, version, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
        record.id, record.title || "", record.contact || "", record.contactId || "", record.companyId || "", record.dealId || "", record.due || "", Number(record.version || 1), record.updatedAt || ""
      ]);
    } else if (kind === "messages") {
      await query(`INSERT INTO ${table} (id, author, text, created_at, version, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`, [
        record.id, record.author || "", record.text || "", record.createdAt || "", Number(record.version || 1), record.updatedAt || ""
      ]);
    }
  } catch {}
}

async function removeTypedRecord(query, kind, id) {
  const table = TYPED_TABLES[kind];
  if (!table) return;
  try {
    await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  } catch {}
}

async function removeAllTypedRecords(query, kind) {
  const table = TYPED_TABLES[kind];
  if (!table) return;
  try {
    await query(`DELETE FROM ${table}`);
  } catch {}
}

async function diagnostics(query, mode, typedSchema, typedSchemaError) {
  const rowCounts = {};
  for (const kind of ALL_KINDS) {
    const result = await query(`SELECT COUNT(*) AS count FROM ${TABLE} WHERE kind = $1`, [kind]);
    rowCounts[kind] = Number(result.rows[0]?.count || 0);
  }
  const typedCounts = {};
  for (const [kind, table] of Object.entries(TYPED_TABLES)) {
    try {
      const result = await query(`SELECT COUNT(*) AS count FROM ${table}`);
      typedCounts[kind] = Number(result.rows[0]?.count || 0);
    } catch {
      typedCounts[kind] = null;
    }
  }
  return {
    mode,
    sourceOfTruth: TABLE,
    rowCounts,
    typedCounts,
    typedSchema,
    typedSchemaError,
    indexes: schemaInfo(mode, typedSchema, typedSchemaError).indexes
  };
}

function upsert(items, next) {
  const found = items.some(item => item.id === next.id);
  return found ? items.map(item => item.id === next.id ? next : item) : [next, ...items];
}

function versionRecord(items, record) {
  const current = items.find(item => item.id === record.id);
  if (current && record.version !== undefined && Number(record.version) !== Number(current.version || 1)) {
    const err = new Error("Conflict: record changed on the server");
    err.status = 409;
    err.current = current;
    throw err;
  }
  return {
    ...record,
    id: record.id || randomUUID(),
    version: current ? Number(current.version || 1) + 1 : Number(record.version || 0) + 1,
    updatedAt: new Date().toISOString()
  };
}

function validateKind(kind) {
  if (!ALL_KINDS.includes(kind)) {
    throw new Error(`Unknown record kind: ${kind}`);
  }
}

const server = http.createServer(async (req, res) => {
  req.crmStartedAt = Date.now();
  req.crmRequestId = requestId(req);
  metrics.inflight += 1;
  if (req.method === "OPTIONS") {
    json(req, res, 204, {});
    return;
  }

  try {
    const repo = await getRepository();
    await repo.init();
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      json(req, res, 200, { ok: true, mode: repo.mode, schemaVersion: repo.schema.version, typedSchema: repo.schema.typedSchema });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/schema") {
      json(req, res, 200, repo.schema);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(req);
      const username = String(body.username || "");
      assertLoginAllowed(req, username);
      let next;
      try {
        next = await loginSession(repo, username, String(body.password || ""));
        recordLoginSuccess(req, username);
      } catch (err) {
        recordLoginFailure(req, username);
        throw err;
      }
      await audit(repo, next.user, "auth.login", { username: next.user.username });
      json(req, res, 200, next);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const token = getBearerToken(req);
      const stored = await loadSession(repo, token);
      if (!stored || Date.parse(stored.expiresAt) <= Date.now()) {
        if (token) {
          sessions.delete(token);
          await repo.remove("sessions", token).catch(() => {});
        }
        json(req, res, 200, { user: null });
        return;
      }
      json(req, res, 200, { user: stored.user });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/refresh") {
      const token = getBearerToken(req);
      const next = await refreshSession(repo, token);
      await audit(repo, next.user, "auth.refresh", {});
      json(req, res, 200, next);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const user = sessions.get(getBearerToken(req))?.user;
      const token = getBearerToken(req);
      if (token) sessions.delete(token);
      if (token) await repo.remove("sessions", token).catch(() => {});
      await audit(repo, user, "auth.logout", {});
      json(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/security") {
      const user = await requireAuth(req, repo);
      requirePermission(user, "read");
      const all = await repo.listAll();
      const users = await repo.listKind("users");
      const persistedSessions = await repo.listKind("sessions");
      const sessionCounts = {};
      for (const item of persistedSessions) {
        const userId = item.user?.id || "unknown";
        sessionCounts[userId] = (sessionCounts[userId] || 0) + 1;
      }
      json(req, res, 200, {
        users: users.map(item => ({ ...publicUser(item), sessionCount: sessionCounts[item.id] || 0 })),
        audit: (all.audit || []).slice(-50).reverse(),
        sessionTtlMs: SESSION_TTL_MS,
        permissions: ROLE_PERMISSIONS
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/audit/export") {
      const user = await requireAuth(req, repo);
      requirePermission(user, "read");
      const all = await repo.listAll();
      await audit(repo, user, "audit.export", { count: (all.audit || []).length });
      json(req, res, 200, {
        exportedAt: new Date().toISOString(),
        actor: user.username,
        audit: (all.audit || []).slice().reverse()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/db/diagnostics") {
      const user = await requireAuth(req, repo);
      requirePermission(user, "read");
      json(req, res, 200, await repo.diagnostics());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ops/metrics") {
      const user = await requireAuth(req, repo);
      requirePermission(user, "read");
      json(req, res, 200, await opsMetrics(repo));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/reset") {
      const user = await requireAuth(req, repo);
      requirePermission(user, "admin:reset");
      const token = getBearerToken(req);
      const preservedSession = token ? sessions.get(token) : null;
      sessions.clear();
      await repo.resetDemo();
      if (token && preservedSession) {
        sessions.set(token, preservedSession);
        await repo.save("sessions", { id: token, user: preservedSession.user, expiresAt: preservedSession.expiresAt, createdAt: new Date().toISOString() });
      }
      await audit(repo, user, "admin.reset", {});
      json(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/users") {
      const user = await requireAuth(req, repo);
      requirePermission(user, "users:write");
      const body = await readBody(req);
      if (!ROLE_PERMISSIONS[body.role]) {
        const err = new Error("Invalid role");
        err.status = 400;
        throw err;
      }
      const existingUsers = await repo.listKind("users");
      const existing = existingUsers.find(item => item.id === body.id || item.username === body.username);
      const passwordSalt = body.password || !existing ? (body.passwordSalt || `${body.username}-${randomUUID().slice(0, 8)}`) : existing.passwordSalt;
      const record = {
        ...existing,
        id: body.id || existing?.id || `user_${String(body.username || "").replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`,
        username: String(body.username || existing?.username || "").trim(),
        name: String(body.name || existing?.name || body.username || "").trim(),
        role: body.role,
        disabled: Boolean(body.disabled),
        passwordSalt,
        passwordHash: body.passwordHash || (body.password ? hashPassword(String(body.password), passwordSalt) : existing?.passwordHash),
        version: existing?.version
      };
      if (!record.username || !record.name || !record.passwordHash) {
        const err = new Error("username, name, role, and password are required");
        err.status = 400;
        throw err;
      }
      const saved = await repo.save("users", record);
      if (saved.disabled) await revokeUserSessions(repo, saved.id);
      await audit(repo, user, "users.write", { id: saved.id, role: saved.role, disabled: saved.disabled });
      json(req, res, 200, publicUser(saved));
      return;
    }

    const userAdminMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/revoke$/);
    if (userAdminMatch && req.method === "POST") {
      const user = await requireAuth(req, repo);
      requirePermission(user, "users:write");
      const targetId = decodeURIComponent(userAdminMatch[1]);
      const revoked = await revokeUserSessions(repo, targetId);
      await audit(repo, user, "users.sessions.revoke", { id: targetId, revoked });
      json(req, res, 200, { ok: true, revoked });
      return;
    }

    const userDeleteMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userDeleteMatch && req.method === "DELETE") {
      const user = await requireAuth(req, repo);
      requirePermission(user, "users:write");
      const targetId = decodeURIComponent(userDeleteMatch[1]);
      await revokeUserSessions(repo, targetId);
      await repo.remove("users", targetId);
      await audit(repo, user, "users.delete", { id: targetId });
      json(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/workspace") {
      const user = await requireAuth(req, repo);
      requirePermission(user, "read");
      json(req, res, 200, await repo.listAll());
      return;
    }

    const match = url.pathname.match(/^\/api\/(contacts|companies|deals|activities|messages)(?:\/([^/]+))?$/);
    if (match && req.method === "POST") {
      const user = await requireAuth(req, repo);
      const permission = writePermission(match[1]);
      if (!user.permissions.includes(permission)) {
        await audit(repo, user, "rbac.denied", { permission, kind: match[1], method: req.method });
        const err = new Error(`Forbidden: ${permission} permission required`);
        err.status = 403;
        throw err;
      }
      const record = await readBody(req);
      const saved = await repo.save(match[1], record);
      await audit(repo, user, `${match[1]}.write`, { id: saved.id });
      if (match[1] === "deals") {
        broadcast({ type: "deal-updated", deal: saved });
      }
      json(req, res, 200, saved);
      return;
    }

    if (match && req.method === "DELETE" && match[2]) {
      const user = await requireAuth(req, repo);
      const permission = deletePermission(match[1]);
      if (!user.permissions.includes(permission)) {
        await audit(repo, user, "rbac.denied", { permission, kind: match[1], method: req.method });
        const err = new Error(`Forbidden: ${permission} permission required`);
        err.status = 403;
        throw err;
      }
      const id = decodeURIComponent(match[2]);
      await repo.remove(match[1], id);
      await audit(repo, user, `${match[1]}.delete`, { id });
      json(req, res, 200, { ok: true });
      return;
    }

    json(req, res, 404, { error: "Not found" });
  } catch (err) {
    json(req, res, err.status || 500, { error: err.message, current: err.current, requestId: req.crmRequestId });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`CRM API listening on http://127.0.0.1:${PORT}`);
});

const wss = new WebSocketServer({ server, path: "/ws/chat" });

wss.on("connection", async (socket, req) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const repo = await getRepository();
  const token = url.searchParams.get("token") || "";
  const session = await loadSession(repo, token);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    if (token) await repo.remove("sessions", token).catch(() => {});
    socket.send(JSON.stringify({ type: "error", error: "Authentication required" }));
    socket.close(1008, "Authentication required");
    return;
  }
  const user = session.user;
  try {
    const snapshot = await repo.listAll();
    socket.send(JSON.stringify({ type: "snapshot", messages: snapshot.messages || [], deals: snapshot.deals || [] }));
  } catch (err) {
    socket.send(JSON.stringify({ type: "error", error: err.message }));
  }

  socket.on("message", async (raw) => {
    try {
      if (raw.length > 4096) {
        socket.send(JSON.stringify({ type: "error", error: "Message too large" }));
        return;
      }
      const payload = JSON.parse(raw.toString());
      const text = String(payload.text || "").trim();
      requirePermission(user, "messages:write");
      const author = user.name.slice(0, 48);
      if (!text) return;
      const repo = await getRepository();
      const message = await repo.save("messages", {
        id: randomUUID(),
        author,
        text: text.slice(0, 500),
        createdAt: new Date().toISOString()
      });
      await audit(repo, user, "messages.websocket", { id: message.id });
      broadcast({ type: "message", message });
    } catch (err) {
      socket.send(JSON.stringify({ type: "error", error: err.message }));
    }
  });
});

function broadcast(payload) {
  const body = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(body);
    }
  }
}

async function revokeUserSessions(repo, userId) {
  let revoked = 0;
  for (const [token, session] of sessions) {
    if (session.user?.id === userId) {
      sessions.delete(token);
      revoked += 1;
    }
  }
  const persisted = await repo.listKind("sessions").catch(() => []);
  for (const session of persisted) {
    if (session.user?.id === userId) {
      await repo.remove("sessions", session.id).catch(() => {});
      revoked += 1;
    }
  }
  return revoked;
}
