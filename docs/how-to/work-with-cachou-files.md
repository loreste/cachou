# Work with `.cachou` Files

`.cachou` files are single-file components compiled by the Go compiler into JavaScript modules. Full details: [Compiler reference](../COMPILER.md).

## Create a component

```html
<script>
  const value = props.value;
</script>

<style scoped>
  :host {
    display: block;
  }

  .card {
    padding: 16px;
  }

  :global(.external) {
    font-weight: bold;
  }
</style>

<div class="card">
  <h3>{props.title}</h3>
  <span>{value}</span>
</div>
```

## Compile components

```bash
npm run compile
```

Or explicitly:

```bash
node scripts/run-compiler.mjs -dir demo/components -out demo/components -runtime cachoujs
```

Single file:

```bash
npm run compiler -- -file demo/components/StatCard.cachou -out demo/components
```

Generated modules import from **`cachoujs`** (not relative `src/` paths). The Vite alias resolves that in this monorepo.

Static templates (no expressions) compile to `htmlStatic(...)`.

Scoped CSS becomes a sibling file:

```javascript
import "./MyCard.css";
```

```css
.card[data-c-mycard] {
  padding: 16px;
}
```

## Vite watch mode

```javascript
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [cachou({ dirs: ["src/components"], runtime: "cachoujs" })]
});
```

## Rebuild the compiler

```bash
npm run compiler:build
```

## Supported syntax (summary)

- Top-level `<script>` and `<style>` / `<style scoped>`
- Template expressions with nested braces
- `:host`, `:global(...)`, nested CSS at-rules
- Quoted `>` inside attributes

Not a full JS/TS parser — keep script sections straightforward. See [COMPILER.md](../COMPILER.md) for limitations and diagnostics.
