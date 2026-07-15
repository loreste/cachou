import { spawn } from "node:child_process";

const children = [
  spawn("npm", ["run", "api:faydb"], { cwd: new URL("..", import.meta.url), stdio: "inherit" }),
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
