import { spawn } from "node:child_process";
import net from "node:net";
import { WebSocket } from "ws";

const port = Number(process.env.CRM_API_PORT || await freePort(7100, 7800));
const API = `http://127.0.0.1:${port}`;
const contactCount = Number(process.env.CRM_STRESS_CONTACTS || 5000);
const wsMessages = Number(process.env.CRM_STRESS_MESSAGES || 25);

const server = spawn("npm", ["run", "api"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    CRM_DB_MODE: process.env.CRM_DB_MODE || "memory",
    CRM_API_PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", chunk => output += chunk);
server.stderr.on("data", chunk => output += chunk);

try {
  const health = await waitForJson(`${API}/api/health`, 8000);
  const admin = await login("admin", "admin");
  const schema = await waitForJson(`${API}/api/schema`, 4000);
  if (!schema.kinds?.includes("contacts") || !schema.kinds?.includes("deals")) {
    throw new Error(`Unexpected schema payload: ${JSON.stringify(schema)}`);
  }

  const started = performance.now();
  const contacts = Array.from({ length: contactCount }, (_, index) => ({
    id: `stress_contact_${Date.now()}_${index}`,
    name: `Stress Contact ${index + 1}`,
    email: `stress${index + 1}@example.test`,
    phone: `555-${String(index).padStart(4, "0")}`,
    company: index % 2 === 0 ? "Izitechnologies" : "Northstar Health",
    status: index % 3 === 0 ? "At risk" : "Active",
    owner: index % 4 === 0 ? "Manager" : "Sales",
    notes: "CRM stress write"
  }));

  for (const contact of contacts) {
    const res = await authFetch(`${API}/api/contacts`, admin.token, {
      method: "POST",
      body: JSON.stringify(contact)
    });
    if (!res.ok) throw new Error(`Failed writing ${contact.id}: ${res.status}`);
  }

  const workspace = await waitForJson(`${API}/api/workspace`, 4000, admin.token);
  const matched = workspace.contacts.filter(contact => contact.id.startsWith("stress_contact_")).length;
  if (matched < contactCount) {
    throw new Error(`Expected ${contactCount} stress contacts, found ${matched}`);
  }

  const socket = new WebSocket(API.replace("http://", "ws://") + `/ws/chat?token=${encodeURIComponent(admin.token)}`);
  const received = [];
  socket.on("message", raw => received.push(JSON.parse(raw.toString())));
  await waitFor(() => socket.readyState === WebSocket.OPEN, "WebSocket did not open");
  for (let i = 0; i < wsMessages; i++) {
    socket.send(JSON.stringify({ author: "Stress QA", text: `burst ${i}` }));
  }
  await waitFor(() => received.filter(item => item.type === "message" && item.message?.author === admin.user.name).length >= wsMessages, "WebSocket burst did not broadcast");
  socket.close();

  await eachLimit(contacts, 25, contact => authFetch(`${API}/api/contacts/${encodeURIComponent(contact.id)}`, admin.token, { method: "DELETE" }));
  const duration = performance.now() - started;
  console.log(`CRM stress passed (${health.mode}; ${contactCount} contacts, ${wsMessages} ws messages, ${duration.toFixed(0)}ms)`);
} catch (err) {
  console.error(err.message);
  if (output.trim()) console.error(output.trim());
  process.exitCode = 1;
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

async function waitForJson(url, timeoutMs, token = "") {
  let last = "";
  await waitFor(async () => {
    try {
      const res = token ? await authFetch(url, token) : await fetch(url);
      last = await res.text();
      return res.ok;
    } catch (err) {
      last = err.message;
      return false;
    }
  }, `Timed out waiting for ${url}: ${last}`, timeoutMs);
  return JSON.parse(last);
}

async function waitFor(predicate, message, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(message);
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

async function eachLimit(items, limit, task) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await task(item);
    }
  });
  await Promise.all(workers);
}
