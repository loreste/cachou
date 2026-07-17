import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  compileFile,
  stripTypeScript,
  CompilerDiagnostic,
  DIAGNOSTIC_CODES
} from "../../packages/compiler/lib/compile.mjs";

describe("JS compiler", () => {
  it("compiles a simple component with expressions and scoped css", () => {
    const dir = mkdtempSync(join(tmpdir(), "cachou-js-compiler-"));
    try {
      const src = join(dir, "Hello.cachou");
      writeFileSync(
        src,
        `<script>
  const [n, setN] = signal(0);
</script>
<style scoped>
:host { display: block; }
.box { color: red; }
</style>
<div class="box">
  <button onclick={() => setN(n() + 1)}>{n()}</button>
  <span>{{literal}}</span>
</div>
`
      );
      const { outputPath, componentName } = compileFile(src, { outDir: dir, runtime: "cachoujs" });
      assert.equal(componentName, "Hello");
      const js = readFileSync(outputPath, "utf8");
      assert.match(js, /from "cachoujs"/);
      assert.match(js, /export default function Hello/);
      assert.match(js, /\$\{n\(\)\}/);
      assert.match(js, /\{literal\}/);
      assert.match(js, /sourceMappingURL=/);
      const css = readFileSync(join(dir, "Hello.css"), "utf8");
      assert.match(css, /data-c-hello/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits a direct static DOM factory for safe static markup", () => {
    const dir = mkdtempSync(join(tmpdir(), "cachou-js-static-compiler-"));
    try {
      const src = join(dir, "Static.cachou");
      writeFileSync(src, `<section class="card"><h1>Static</h1><p>Fast path</p></section>`);
      const { outputPath } = compileFile(src, { outDir: dir, runtime: "cachoujs" });
      const js = readFileSync(outputPath, "utf8");
      assert.match(js, /createCompiledStatic/);
      assert.match(js, /document\.createElement\("section"\)/);
      assert.match(js, /document\.createTextNode\("Fast path"\)/);
      assert.doesNotMatch(js, /return htmlStatic\(/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to htmlStatic when HTML decoding or namespaces could change semantics", () => {
    const dir = mkdtempSync(join(tmpdir(), "cachou-js-static-fallback-"));
    try {
      const entitySource = join(dir, "Entity.cachou");
      writeFileSync(entitySource, `<p>Fish &amp; chips</p>`);
      const entityOutput = compileFile(entitySource, { outDir: dir, runtime: "cachoujs" }).outputPath;
      assert.match(readFileSync(entityOutput, "utf8"), /return htmlStatic\(/);

      const svgSource = join(dir, "Svg.cachou");
      writeFileSync(svgSource, `<svg><circle></circle></svg>`);
      const svgOutput = compileFile(svgSource, { outDir: dir, runtime: "cachoujs" }).outputPath;
      assert.match(readFileSync(svgOutput, "utf8"), /return htmlStatic\(/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("compiles nested reactive CSS bind expressions and attaches them to the component root", () => {
    const dir = mkdtempSync(join(tmpdir(), "cachou-js-vbind-"));
    try {
      const src = join(dir, "Theme.cachou");
      writeFileSync(src, `<script>
  const [color] = signal("red");
</script>
<style scoped>
.box { color: bind(color); width: bind(Math.max(1, color().length) + "px"); }
</style>
<div class="box">Theme</div>
`);
      const { outputPath } = compileFile(src, { outDir: dir, runtime: "cachoujs" });
      const js = readFileSync(outputPath, "utf8");
      const css = readFileSync(join(dir, "Theme.css"), "utf8");
      assert.match(css, /var\(--cachou-v-color\)/);
      assert.match(css, /var\(--cachou-v-Math-max-1-color-length-px\)/);
      assert.match(js, /__cachouVBindRef/);
      assert.match(js, /node\.style\.setProperty\("--cachou-v-color", String\(color\(\)\)\)/);
      assert.match(js, /node\.style\.setProperty\("--cachou-v-Math-max-1-color-length-px", String\(Math\.max\(1, color\(\)\.length\) \+ "px"\)\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps colliding bind names distinct and binds every top-level root", () => {
    const dir = mkdtempSync(join(tmpdir(), "cachou-js-vbind-collision-"));
    try {
      const src = join(dir, "Collision.cachou");
      writeFileSync(src, `<script>
  const theme = { color: "red" };
</script>
<style scoped>
.a { color: bind(theme.color); }
.b { color: bind(theme["color"]); }
</style>
<div class="a">A</div><div class="b">B</div>
`);
      const { outputPath } = compileFile(src, { outDir: dir, runtime: "cachoujs" });
      const js = readFileSync(outputPath, "utf8");
      const css = readFileSync(join(dir, "Collision.css"), "utf8");
      assert.match(css, /var\(--cachou-v-theme-color\)/);
      assert.match(css, /var\(--cachou-v-theme-color-[a-z0-9]+\)/);
      assert.equal((js.match(/setProperty\(/g) || []).length, 2);
      assert.equal((js.match(/ref=\$\{\$__cachouVBindRef\}/g) || []).length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not strip TypeScript-looking text from strings or comments", () => {
    const source = `const label = " as User"; // as Comment\n/* as Block */\nconst value = input as User;`;
    assert.equal(
      stripTypeScript(source),
      `const label = " as User"; // as Comment\n/* as Block */\nconst value = input;`
    );
  });

  it("reports absolute file locations for errors after script/style sections", () => {
    const dir = mkdtempSync(join(tmpdir(), "cachou-js-diag-"));
    try {
      const src = join(dir, "Bad.cachou");
      writeFileSync(
        src,
        `<!-- header -->
<script>
const [n] = signal(0);
</script>
<style scoped>
.box { color: red;
</style>
<div>{n()}</div>
`
      );
      assert.throws(
        () => compileFile(src, { outDir: dir, runtime: "cachoujs" }),
        err => {
          assert.ok(err instanceof CompilerDiagnostic);
          assert.equal(err.line, 6);
          assert.match(err.message, /unclosed CSS block/i);
          assert.match(err.hint || "", /closing `\}`/);
          return true;
        }
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports empty template expressions with an actionable hint", () => {
    const dir = mkdtempSync(join(tmpdir(), "cachou-js-empty-expr-"));
    try {
      const src = join(dir, "Empty.cachou");
      writeFileSync(
        src,
        `<script>
const x = 1;
</script>
<div>{}</div>
`
      );
      assert.throws(
        () => compileFile(src, { outDir: dir, runtime: "cachoujs" }),
        err => {
          assert.ok(err instanceof CompilerDiagnostic);
          assert.equal(err.line, 4);
          assert.equal(err.code, "CACHOU002");
          assert.match(err.message, /empty template expression/i);
          assert.match(err.hint || "", /literal braces/);
          return true;
        }
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects empty templates and duplicate script sections with codes", () => {
    assert.ok(DIAGNOSTIC_CODES.CACHOU013);
    const dir = mkdtempSync(join(tmpdir(), "cachou-js-diag-codes-"));
    try {
      const empty = join(dir, "OnlyScript.cachou");
      writeFileSync(empty, `<script>const x = 1;</script>\n`);
      assert.throws(
        () => compileFile(empty, { outDir: dir }),
        err => err.code === "CACHOU013"
      );

      const dup = join(dir, "DupScript.cachou");
      writeFileSync(dup, `<script>a</script>\n<script>b</script>\n<div>x</div>\n`);
      assert.throws(
        () => compileFile(dup, { outDir: dir }),
        err => err.code === "CACHOU011"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
