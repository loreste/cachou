import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const cases = [
  {
    name: "unclosed expression",
    source: "<div>{count</div>",
    expected: "unclosed template expression"
  },
  {
    name: "unclosed tag",
    source: "<div title=\"broken></div>",
    expected: "unclosed HTML tag"
  },
  {
    name: "unclosed css block",
    source: "<style>\n.card { color: red;\n</style>\n<div>Card</div>",
    expected: "unclosed CSS block"
  },
  {
    name: "unclosed css comment",
    source: "<style scoped>/* missing close\n.card { color: red; }</style>\n<div>Card</div>",
    expected: "unclosed CSS comment"
  }
];

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("close", code => resolve({ code, output: stdout + stderr }));
    child.on("error", err => resolve({ code: 1, output: String(err.message || err) }));
  });
}

const root = process.cwd();
const dir = await mkdtemp(join(tmpdir(), "cachou-compiler-diagnostics-"));

try {
  for (const item of cases) {
    const file = join(dir, `${item.name.replaceAll(" ", "-")}.cachou`);
    await writeFile(file, item.source);
    const result = await run("node", ["scripts/run-compiler.mjs", "-file", file, "-out", dir], root);
    if (result.code === 0) {
      throw new Error(`${item.name}: compiler succeeded unexpectedly`);
    }
    if (!result.output.includes(item.expected)) {
      throw new Error(`${item.name}: expected ${JSON.stringify(item.expected)} in compiler output, got ${JSON.stringify(result.output)}`);
    }
  }
  const staticFile = join(dir, "StaticOnly.cachou");
  await writeFile(staticFile, "<section><h1>Static</h1><p>No expressions.</p></section>");
  const staticResult = await run("node", ["scripts/run-compiler.mjs", "-file", staticFile, "-out", dir], root);
  if (staticResult.code !== 0) {
    throw new Error(`static template: compiler failed: ${staticResult.output}`);
  }
  const staticOutput = await readFile(join(dir, "StaticOnly.js"), "utf8");
  if (!staticOutput.includes("createCompiledStatic(")) {
    throw new Error("static template: expected compiler to emit a direct static DOM factory");
  }
  if (!staticOutput.includes('document.createElement("section")')) {
    throw new Error("static template: expected compiler to emit direct DOM creation");
  }
  if (!staticOutput.includes('from "cachoujs"')) {
    throw new Error("static template: expected package import from cachoujs");
  }

  const braceFile = join(dir, "LiteralBraces.cachou");
  await writeFile(braceFile, "<p>Use {{curly}} braces like {{this}}</p>");
  const braceResult = await run("node", ["scripts/run-compiler.mjs", "-file", braceFile, "-out", dir], root);
  if (braceResult.code !== 0) {
    throw new Error(`literal braces: compiler failed: ${braceResult.output}`);
  }
  const braceOutput = await readFile(join(dir, "LiteralBraces.js"), "utf8");
  if (!braceOutput.includes("{curly}") || !braceOutput.includes("{this}")) {
    throw new Error(`literal braces: expected escaped braces in output, got ${JSON.stringify(braceOutput)}`);
  }
  if (!braceOutput.includes("sourceMappingURL=")) {
    throw new Error("literal braces: expected sourceMappingURL comment");
  }

  const scopedFile = join(dir, "ScopedCard.cachou");
  await writeFile(scopedFile, `<style scoped>
/* comments may contain braces: { } */
.card { color: red; }
.commented /* selector note */ { color: purple; }
.card:hover { color: blue; }
:host { display: block; }
:global(.theme) { color: green; }
</style>
<article class="card"><h2>Scoped</h2></article>`);
  const scopedResult = await run("node", ["scripts/run-compiler.mjs", "-file", scopedFile, "-out", dir], root);
  if (scopedResult.code !== 0) {
    throw new Error(`scoped style: compiler failed: ${scopedResult.output}`);
  }
  const scopedJS = await readFile(join(dir, "ScopedCard.js"), "utf8");
  const scopedCSS = await readFile(join(dir, "ScopedCard.css"), "utf8");
  if (!scopedJS.includes('import "./ScopedCard.css";')) {
    throw new Error("scoped style: expected compiled JS to import generated CSS");
  }
  if (!scopedJS.includes("data-c-scopedcard")) {
    throw new Error("scoped style: expected template to include data-c scope attribute");
  }
  if (!scopedCSS.includes(".card[data-c-scopedcard]") || !scopedCSS.includes(".card[data-c-scopedcard]:hover")) {
    throw new Error(`scoped style: expected scoped selectors, got ${JSON.stringify(scopedCSS)}`);
  }
  if (!scopedCSS.includes("[data-c-scopedcard] { display: block; }")) {
    throw new Error("scoped style: expected :host to compile to scope attribute");
  }
  if (!scopedCSS.includes(".theme { color: green; }")) {
    throw new Error("scoped style: expected :global selector to remain global");
  }

  if (!scopedCSS.includes("/* comments may contain braces: { } */")) {
    throw new Error("scoped style: expected CSS comments to survive scanning");
  }
  if (!scopedCSS.includes(".commented[data-c-scopedcard] /* selector note */")) {
    throw new Error("scoped style: expected selector comments to remain after the scope attribute");
  }

  const globalFile = join(dir, "GlobalCard.cachou");
  await writeFile(globalFile, "<style>\n.card { color: red; }\n</style>\n<div class=\"card\">Global</div>");
  const globalResult = await run("node", ["scripts/run-compiler.mjs", "-file", globalFile, "-out", dir], root);
  if (globalResult.code !== 0) {
    throw new Error(`global style: compiler failed: ${globalResult.output}`);
  }
  const globalJS = await readFile(join(dir, "GlobalCard.js"), "utf8");
  const globalCSS = await readFile(join(dir, "GlobalCard.css"), "utf8");
  if (!globalJS.includes('import "./GlobalCard.css";')) {
    throw new Error("global style: expected compiled JS to import generated CSS");
  }
  if (globalJS.includes("data-c-globalcard")) {
    throw new Error("global style: did not expect scope attribute for unscoped style");
  }
  if (!globalCSS.includes(".card { color: red; }")) {
    throw new Error("global style: expected CSS to remain global");
  }

  const arrowFile = join(dir, "ArrowHandlers.cachou");
  await writeFile(arrowFile, `<style scoped>
.action { color: teal; }
</style>
<button
  class="action"
  onclick={event => props.save(event.target.value)}
  title={"a > b"}
>Save</button>`);
  const arrowResult = await run("node", ["scripts/run-compiler.mjs", "-file", arrowFile, "-out", dir], root);
  if (arrowResult.code !== 0) {
    throw new Error(`arrow handler: compiler failed: ${arrowResult.output}`);
  }
  const arrowOutput = await readFile(join(dir, "ArrowHandlers.js"), "utf8");
  if (!arrowOutput.includes("event => props.save(event.target.value)")) {
    throw new Error("arrow handler: expected inline arrow expression to compile");
  }
  if (!arrowOutput.includes("title=${\"a > b\"}")) {
    throw new Error("arrow handler: expected > inside expression string to stay inside the tag");
  }

  console.log(`Compiler diagnostics: ${cases.length + 5}/${cases.length + 5} passed`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
