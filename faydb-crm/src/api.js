const API_BASE = import.meta.env.VITE_CRM_API_URL || "http://127.0.0.1:5191";
const SESSION_KEY = "cachou_crm_session";
let authSession = loadStoredSession();
let unauthorizedHandler = null;

async function request(path, options = {}) {
  const usesAuth = options.auth !== false && Boolean(authSession?.token);
  const headers = {
    "Content-Type": "application/json",
    ...(usesAuth ? { Authorization: `Bearer ${authSession.token}` } : {}),
    ...(options.headers || {})
  };
  delete options.auth;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    err.current = payload.current;
    err.requestId = payload.requestId || res.headers.get("x-request-id") || "";
    if (res.status === 401 && usesAuth) {
      setAuthSession(null);
      unauthorizedHandler?.(err);
    }
    throw err;
  }
  return payload;
}

function loadStoredSession() {
  if (typeof localStorage === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function getAuthSession() {
  return authSession;
}

export function setAuthSession(session) {
  authSession = session;
  if (typeof localStorage !== "undefined") {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }
}

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export function hasPermission(permission) {
  return Boolean(authSession?.user?.permissions?.includes(permission));
}

export async function login(username, password) {
  const session = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    auth: false
  });
  setAuthSession(session);
  return session;
}

export async function logout() {
  if (authSession?.token) {
    await request("/api/auth/logout", { method: "POST" }).catch(() => {});
  }
  setAuthSession(null);
}

export async function refreshSession() {
  if (!authSession?.token) return null;
  const session = await request("/api/auth/refresh", { method: "POST" });
  setAuthSession(session);
  return session;
}

export async function validateStoredSession(context = {}) {
  if (!authSession?.token) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const signal = context.signal || controller.signal;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authSession.token}`
      }
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.user) {
      setAuthSession(null);
      return null;
    }
    const next = { ...authSession, user: payload.user };
    setAuthSession(next);
    return next;
  } catch {
    setAuthSession(null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function fetchWorkspace(context = {}) {
  return request("/api/workspace", { signal: context.signal });
}

export function saveRecord(kind, record) {
  return request(`/api/${kind}`, {
    method: "POST",
    body: JSON.stringify(record)
  });
}

export function removeRecord(kind, id) {
  return request(`/api/${kind}/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function health(context = {}) {
  return request("/api/health", { signal: context.signal });
}

export function fetchSecurity(context = {}) {
  return request("/api/security", { signal: context.signal });
}

export function fetchDiagnostics(context = {}) {
  return request("/api/db/diagnostics", { signal: context.signal });
}

export function fetchOpsMetrics(context = {}) {
  return request("/api/ops/metrics", { signal: context.signal });
}

export function fetchAuditExport(context = {}) {
  return request("/api/audit/export", { signal: context.signal });
}

export function resetDemoData() {
  return request("/api/admin/reset", { method: "POST" });
}

export function saveUser(user) {
  return request("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(user)
  });
}

export function revokeUserSessions(userId) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}/revoke`, { method: "POST" });
}

export async function fetchBenchmarkReport(context = {}) {
  const res = await fetch("/artifacts/benchmarks/latest.json", { signal: context.signal }).catch(() => null);
  if (!res?.ok) return { summary: [] };
  return res.json();
}

export async function fetchBenchmarkHistory(context = {}) {
  const res = await fetch("/artifacts/benchmarks/history.json", { signal: context.signal }).catch(() => null);
  if (!res?.ok) return [];
  return res.json();
}

export function chatSocketUrl() {
  const url = new URL(API_BASE);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/chat";
  url.search = authSession?.token ? `?token=${encodeURIComponent(authSession.token)}` : "";
  return url.toString();
}
