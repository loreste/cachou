import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { cachou } from "../plugin/vite.js";

const crmRoot = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(crmRoot, "..");

export default defineConfig({
  plugins: [
    cachou({
      dirs: ["src/components"],
      runtime: "cachoujs",
      runtimeEntry: path.join(packageRoot, "src/browser.js")
    })
  ]
});
