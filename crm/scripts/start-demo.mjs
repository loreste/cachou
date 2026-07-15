import { spawn } from "node:child_process";

const children = [
  // Default demo uses memory API so no Postgres install is required.
  // For Postgres: CRM_DB_MODE=postgres POSTGRES_DSN=... npm run crm:api:postgres
  spawn("npm", ["run", "api"], {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
    env: { ...process.env, CRM_DB_MODE: process.env.CRM_DB_MODE || "memory" }
  }),
  spawn("npm", ["run", "dev"], { cwd: new URL("..", import.meta.url), stdio: "inherit" })
];

function stop() {
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stop();
  process.exit(143);
});

for (const child of children) {
  child.on("exit", code => {
    if (code && code !== 130 && code !== 143) {
      stop();
      process.exit(code);
    }
  });
}
