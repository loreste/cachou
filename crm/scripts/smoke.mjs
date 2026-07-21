import { spawn } from "node:child_process";
import net from "node:net";

const port = Number(process.env.CRM_API_PORT || await freePort(5200, 6400));
const API = `http://127.0.0.1:${port}`;
const server = spawn("npm", ["run", "api"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    CRM_DB_MODE: process.env.CRM_DB_MODE || "memory",
    CRM_API_PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let stderr = "";
let stdout = "";
let lastHealthError = "";
server.stdout.on("data", chunk => {
  stdout += chunk;
});
server.stderr.on("data", chunk => {
  stderr += chunk;
});

async function waitForHealth() {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API}/api/health`);
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      lastHealthError = text;
    } catch (err) {
      lastHealthError = err.message;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become healthy. health=${lastHealthError} stdout=${stdout} stderr=${stderr}`);
}

try {
  await waitForHealth();
  const health = await fetch(`${API}/api/health`, { headers: { "X-Request-Id": "smoke-health-request" } });
  if (health.headers.get("x-request-id") !== "smoke-health-request") {
    throw new Error(`Expected health request id echo, got ${health.headers.get("x-request-id")}`);
  }
  if (!health.headers.get("server-timing")?.startsWith("app;dur=")) {
    throw new Error(`Expected Server-Timing header, got ${health.headers.get("server-timing")}`);
  }
  if (health.headers.get("x-content-type-options") !== "nosniff" || health.headers.get("cache-control") !== "no-store") {
    throw new Error("Expected API security headers on health response");
  }
  const status = await health.json();
  if (status.schemaVersion !== 2) {
    throw new Error(`Expected schemaVersion 2, got ${status.schemaVersion}`);
  }
  const preflight = await fetch(`${API}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://127.0.0.1:5190",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Authorization, Content-Type"
    }
  });
  if (preflight.status !== 204 || !/Authorization/i.test(preflight.headers.get("access-control-allow-headers") || "")) {
    throw new Error(`Expected CORS preflight to allow Authorization, got ${preflight.status} ${preflight.headers.get("access-control-allow-headers")}`);
  }
  const schema = await fetch(`${API}/api/schema`).then(res => res.json());
  if (!schema.kinds?.includes("contacts") || !schema.kinds?.includes("deals") || schema.tables?.records !== "crm_records") {
    throw new Error(`Unexpected schema metadata: ${JSON.stringify(schema)}`);
  }
  const anonymousWorkspace = await fetch(`${API}/api/workspace`);
  if (anonymousWorkspace.status !== 401) {
    throw new Error(`Expected anonymous workspace request to return 401, got ${anonymousWorkspace.status}`);
  }
  const anonymousWorkspaceBody = await anonymousWorkspace.json();
  if (!anonymousWorkspace.headers.get("x-request-id") || !anonymousWorkspaceBody.requestId) {
    throw new Error("Expected request id on anonymous workspace error");
  }
  const badJson = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5190" },
    body: "{not-json"
  });
  if (badJson.status !== 400) {
    throw new Error(`Expected invalid JSON body to return 400, got ${badJson.status}`);
  }
  const badJsonBody = await badJson.json();
  if (!/Invalid JSON/i.test(badJsonBody.error || "")) {
    throw new Error(`Expected Invalid JSON body error, got ${JSON.stringify(badJsonBody)}`);
  }
  const admin = await login("admin", "admin");
  const sales = await login("sales", "sales");
  if (!admin.expiresAt || Date.parse(admin.expiresAt) <= Date.now()) {
    throw new Error("Login did not return a future session expiry");
  }
  const me = await authFetch(`${API}/api/auth/me`, admin.token).then(res => res.json());
  if (me.user?.role !== "Admin") {
    throw new Error(`Expected /api/auth/me to return Admin, got ${JSON.stringify(me)}`);
  }
  const refreshedAdmin = await authFetch(`${API}/api/auth/refresh`, admin.token, { method: "POST" }).then(res => res.json());
  if (refreshedAdmin.token !== admin.token || Date.parse(refreshedAdmin.expiresAt) < Date.parse(admin.expiresAt)) {
    throw new Error(`Expected refresh to preserve token and extend expiry, got ${JSON.stringify(refreshedAdmin)}`);
  }
  admin.expiresAt = refreshedAdmin.expiresAt;
  const workspace = await authFetch(`${API}/api/workspace`, admin.token).then(res => res.json());
  if (!Array.isArray(workspace.contacts) || workspace.contacts.length === 0) {
    throw new Error("Expected seeded contacts");
  }
  const diagnostics = await authFetch(`${API}/api/db/diagnostics`, admin.token).then(res => res.json());
  if (!diagnostics.rowCounts || diagnostics.rowCounts.users < 1) {
    throw new Error(`Expected diagnostics row counts, got ${JSON.stringify(diagnostics)}`);
  }
  const anonymousMetrics = await fetch(`${API}/api/ops/metrics`);
  if (anonymousMetrics.status !== 401) {
    throw new Error(`Expected anonymous metrics request to return 401, got ${anonymousMetrics.status}`);
  }
  const opsMetrics = await authFetch(`${API}/api/ops/metrics`, admin.token).then(res => res.json());
  if (!opsMetrics.startedAt || opsMetrics.requestsTotal < 1 || !opsMetrics.byRoute?.["GET /api/health"] || opsMetrics.rowCounts?.users < 1) {
    throw new Error(`Expected populated ops metrics, got ${JSON.stringify(opsMetrics)}`);
  }

  const qaUserId = `user_smoke_${Date.now()}`;
  const qaUsername = `smoke_${Date.now()}`;
  const createdUser = await authFetch(`${API}/api/admin/users`, admin.token, {
    method: "POST",
    body: JSON.stringify({ id: qaUserId, username: qaUsername, name: "Smoke User", role: "Sales", password: "first-pass" })
  }).then(res => res.json());
  if (createdUser.role !== "Sales") throw new Error(`User create failed: ${JSON.stringify(createdUser)}`);
  const qaSession = await login(qaUsername, "first-pass");
  const disabledUser = await authFetch(`${API}/api/admin/users`, admin.token, {
    method: "POST",
    body: JSON.stringify({ ...createdUser, disabled: true })
  }).then(res => res.json());
  if (!disabledUser.disabled) throw new Error("User disable failed");
  const disabledLogin = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: qaUsername, password: "first-pass" })
  });
  if (disabledLogin.status !== 401) throw new Error(`Expected disabled user login 401, got ${disabledLogin.status}`);
  const enabledUser = await authFetch(`${API}/api/admin/users`, admin.token, {
    method: "POST",
    body: JSON.stringify({ ...createdUser, disabled: false, role: "Manager", password: "second-pass" })
  }).then(res => res.json());
  if (enabledUser.role !== "Manager" || enabledUser.disabled) throw new Error("User enable/role update failed");
  const qaSession2 = await login(qaUsername, "second-pass");
  const revoke = await authFetch(`${API}/api/admin/users/${encodeURIComponent(qaUserId)}/revoke`, admin.token, { method: "POST" }).then(res => res.json());
  if (!revoke.ok || revoke.revoked < 1) throw new Error(`Expected user session revoke, got ${JSON.stringify(revoke)}`);
  const revokedWorkspace = await authFetch(`${API}/api/workspace`, qaSession2.token);
  if (revokedWorkspace.status !== 401) throw new Error(`Expected revoked session to return 401, got ${revokedWorkspace.status}`);
  await authFetch(`${API}/api/admin/users/${encodeURIComponent(qaUserId)}`, admin.token, { method: "DELETE" });
  await authFetch(`${API}/api/auth/logout`, qaSession.token, { method: "POST" }).catch(() => {});

  const contact = {
    id: `smoke_${Date.now()}`,
    name: "Smoke Test",
    email: "smoke@example.test",
    phone: "555-0000",
    company: "Izitechnologies",
    status: "Active",
    owner: "QA",
    notes: `mode=${status.mode}`
  };
  const saved = await authFetch(`${API}/api/contacts`, admin.token, {
    method: "POST",
    body: JSON.stringify(contact)
  }).then(res => res.json());
  if (saved.id !== contact.id) throw new Error("Save did not echo the contact id");

  const afterSave = await authFetch(`${API}/api/workspace`, admin.token).then(res => res.json());
  if (!afterSave.contacts.some(item => item.id === contact.id)) {
    throw new Error("Saved contact was not returned by workspace");
  }

  await authFetch(`${API}/api/contacts/${encodeURIComponent(contact.id)}`, admin.token, { method: "DELETE" });
  const afterDelete = await authFetch(`${API}/api/workspace`, admin.token).then(res => res.json());
  if (afterDelete.contacts.some(item => item.id === contact.id)) {
    throw new Error("Deleted contact was still returned by workspace");
  }

  const salesDealWrite = await authFetch(`${API}/api/deals`, sales.token, {
    method: "POST",
    body: JSON.stringify({ id: `sales_forbidden_${Date.now()}`, name: "Forbidden", company: "Izitechnologies", value: 1, stage: "Lead" })
  });
  if (salesDealWrite.status !== 403) {
    throw new Error(`Expected Sales deal write to return 403, got ${salesDealWrite.status}`);
  }
  const salesCompanyWrite = await authFetch(`${API}/api/companies`, sales.token, {
    method: "POST",
    body: JSON.stringify({ id: `sales_company_forbidden_${Date.now()}`, name: "Forbidden Company", segment: "QA", owner: "Sales" })
  });
  if (salesCompanyWrite.status !== 403) {
    throw new Error(`Expected Sales company write to return 403, got ${salesCompanyWrite.status}`);
  }

  const auditAnonymous = await fetch(`${API}/api/audit/export`);
  if (auditAnonymous.status !== 401) {
    throw new Error(`Expected anonymous audit export to return 401, got ${auditAnonymous.status}`);
  }

  const relationshipId = `relationship_${Date.now()}`;
  const relationshipCompany = await authFetch(`${API}/api/companies`, admin.token, {
    method: "POST",
    body: JSON.stringify({ id: relationshipId, name: "Relationship Smoke Co", segment: "QA", owner: "Admin" })
  }).then(res => res.json());
  const relationshipContact = await authFetch(`${API}/api/contacts`, admin.token, {
    method: "POST",
    body: JSON.stringify({
      id: `${relationshipId}_contact`,
      name: "Relationship Contact",
      email: "relationship@example.test",
      phone: "555-0101",
      companyId: relationshipCompany.id,
      company: relationshipCompany.name,
      status: "Active",
      owner: "Admin",
      notes: "Smoke relationship coverage"
    })
  }).then(res => res.json());
  const relationshipDeal = await authFetch(`${API}/api/deals`, admin.token, {
    method: "POST",
    body: JSON.stringify({
      id: `${relationshipId}_deal`,
      name: "Relationship Deal",
      companyId: relationshipCompany.id,
      company: relationshipCompany.name,
      contactIds: [relationshipContact.id],
      value: 1234,
      stage: "Lead"
    })
  }).then(res => res.json());
  const relationshipWorkspace = await authFetch(`${API}/api/workspace`, admin.token).then(res => res.json());
  if (!relationshipWorkspace.contacts.some(item => item.id === relationshipContact.id && item.companyId === relationshipCompany.id)) {
    throw new Error("Relationship contact did not retain companyId");
  }
  if (!relationshipWorkspace.deals.some(item => item.id === relationshipDeal.id && item.companyId === relationshipCompany.id && item.contactIds?.includes(relationshipContact.id))) {
    throw new Error("Relationship deal did not retain company/contact IDs");
  }
  const auditExport = await authFetch(`${API}/api/audit/export`, admin.token).then(res => res.json());
  if (auditExport.actor !== "admin" || !Array.isArray(auditExport.audit) || !auditExport.audit.some(item => item.action === "companies.write")) {
    throw new Error(`Unexpected audit export payload: ${JSON.stringify(auditExport).slice(0, 400)}`);
  }
  await authFetch(`${API}/api/deals/${encodeURIComponent(relationshipDeal.id)}`, admin.token, { method: "DELETE" });
  await authFetch(`${API}/api/contacts/${encodeURIComponent(relationshipContact.id)}`, admin.token, { method: "DELETE" });
  await authFetch(`${API}/api/companies/${encodeURIComponent(relationshipCompany.id)}`, admin.token, { method: "DELETE" });

  const wsUrl = API.replace("http://", "ws://").replace("https://", "wss://") + `/ws/chat?token=${encodeURIComponent(admin.token)}`;
  const socket = new WebSocket(wsUrl);
  const received = [];
  socket.addEventListener("message", event => {
    received.push(JSON.parse(event.data));
  });
  await waitFor(() => socket.readyState === WebSocket.OPEN, "WebSocket did not open");
  await waitFor(() => received.some(item => item.type === "snapshot"), "WebSocket snapshot was not received");

  const firstDeal = {
    id: `smoke_deal_${Date.now()}`,
    name: "Smoke Pipeline Move",
    company: "Izitechnologies",
    value: 1000,
    stage: "Qualified"
  };
  await authFetch(`${API}/api/deals`, admin.token, {
    method: "POST",
    body: JSON.stringify(firstDeal)
  }).then(res => res.json());
  const movedDeal = { ...firstDeal, stage: "Proposal" };
  await authFetch(`${API}/api/deals`, admin.token, {
    method: "POST",
    body: JSON.stringify(movedDeal)
  }).then(res => res.json());
  const afterDealMove = await authFetch(`${API}/api/workspace`, admin.token).then(res => res.json());
  if (!afterDealMove.deals.some(item => item.id === movedDeal.id && item.stage === movedDeal.stage)) {
    throw new Error("Moved deal stage was not persisted");
  }
  await waitFor(() => received.some(item => item.type === "deal-updated" && item.deal?.id === movedDeal.id && item.deal.stage === movedDeal.stage), "WebSocket deal update was not broadcast");

  const stale = await authFetch(`${API}/api/deals`, admin.token, {
    method: "POST",
    body: JSON.stringify({ ...firstDeal, stage: "Won", version: 1 })
  });
  if (stale.status !== 409) {
    throw new Error(`Expected stale deal write to return 409, got ${stale.status}`);
  }
  await authFetch(`${API}/api/deals/${encodeURIComponent(firstDeal.id)}`, admin.token, { method: "DELETE" });

  socket.send(JSON.stringify({ author: "Smoke QA", text: "websocket smoke" }));
  await waitFor(() => received.some(item => item.type === "message" && item.message?.text === "websocket smoke"), "WebSocket broadcast was not received");
  const wsMessage = received.find(item => item.type === "message" && item.message?.text === "websocket smoke").message;
  socket.close();
  await authFetch(`${API}/api/messages/${encodeURIComponent(wsMessage.id)}`, admin.token, { method: "DELETE" });

  await authFetch(`${API}/api/auth/logout`, admin.token, { method: "POST" });
  const meAfterLogout = await authFetch(`${API}/api/auth/me`, admin.token).then(res => res.json());
  if (meAfterLogout.user !== null) {
    throw new Error(`Expected /api/auth/me to return null after logout, got ${JSON.stringify(meAfterLogout)}`);
  }
  const refreshAfterLogout = await authFetch(`${API}/api/auth/refresh`, admin.token, { method: "POST" });
  if (refreshAfterLogout.status !== 401) {
    throw new Error(`Expected refresh after logout to return 401, got ${refreshAfterLogout.status}`);
  }
  const afterLogout = await authFetch(`${API}/api/workspace`, admin.token);
  if (afterLogout.status !== 401) {
    throw new Error(`Expected logged out token to return 401, got ${afterLogout.status}`);
  }

  console.log(`CRM smoke passed (${status.mode})`);
} finally {
  server.kill("SIGTERM");
}

async function login(username, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error(`Login failed for ${username}: ${res.status}`);
  return res.json();
}

function authFetch(url, token, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
}

function freePort(start, end) {
  return new Promise((resolve, reject) => {
    let port = start;
    const tryPort = () => {
      if (port > end) {
        reject(new Error(`No free port found from ${start} to ${end}`));
        return;
      }
      const probe = net.createServer();
      probe.once("error", () => {
        port += 1;
        tryPort();
      });
      probe.once("listening", () => {
        const selected = port;
        probe.close(() => resolve(selected));
      });
      probe.listen(port, "127.0.0.1");
    };
    tryPort();
  });
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(message);
}
