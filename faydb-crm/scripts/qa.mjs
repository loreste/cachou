import { spawn } from "node:child_process";

const steps = [
  ["npm", ["run", "crm:compile"]],
  ["npm", ["run", "crm:build"]],
  ["npm", ["run", "crm:smoke:faydb"]],
  ["npm", ["run", "crm:ui:smoke"]],
  ["npm", ["run", "crm:visual:smoke"]],
  ["npm", ["run", "crm:stress"]],
  ["npm", ["run", "guardrails"]]
];

for (const [command, args] of steps) {
  await run(command, args);
}

console.log("CRM QA passed");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const label = `${command} ${args.join(" ")}`;
    console.log(`$ ${label}`);
    const child = spawn(command, args, {
      cwd: new URL("../..", import.meta.url),
      stdio: "inherit"
    });
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with ${code}`));
    });
  });
}
