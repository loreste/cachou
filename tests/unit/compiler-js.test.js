import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compileFile } from "../../packages/compiler/lib/compile.mjs";

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
});
