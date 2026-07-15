import { spawn } from "node:child_process";

const port = Number(process.env.CRM_API_PORT || 6200 + Math.floor(Math.random() * 1000));
const API = `http://127.0.0.1:${port}`;
const server = spawn("npm", ["run", "api:faydb"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    CRM_API_PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", chunk => output += chunk);
server.stderr.on("data", chunk => output += chunk);

try {
  await waitForHealth();
  const session = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" })
  }).then(res => res.json());
  const reset = await fetch(`${API}/api/admin/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }
  });
  if (!reset.ok) {
    throw new Error(`Reset failed with ${reset.status}: ${await reset.text()}`);
  }
  console.log("CRM demo data reset");
} finally {
  server.kill("SIGTERM");
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API}/api/health`);
      last = await res.text();
      if (res.ok) return;
    } catch (err) {
      last = err.message;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become healthy. health=${last} ${output}`);
}
