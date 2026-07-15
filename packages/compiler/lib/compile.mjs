/**
 * Pure JavaScript .cachou SFC compiler (no Go required).
 * Mirrors the Go compiler subset: script/style/template, {expr}, {{ literal }}, scoped CSS.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, basename, extname, resolve } from "node:path";

function lineCol(content, index) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < content.length && i < index; i++) {
    if (content[i] === "\n") {
      line++;
      col = 1;
    } else col++;
  }
  return { line, col };
}

function uppercaseFirst(str) {
  if (!str) return str;
  return str[0].toUpperCase() + str.slice(1);
}

function sanitizeScopeID(name) {
  const id = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return id || "component";
}

function indentLines(str, indent) {
  return str
    .split("\n")
    .map(line => (line ? indent + line : line))
    .join("\n");
}

function findTagEnd(html, start) {
  let quote = 0;
  let escaped = false;
  let expressionDepth = 0;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = 0;
      continue;
    }
    if (ch === '"' || ch === "'" || (expressionDepth > 0 && ch === "`")) {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      expressionDepth++;
      continue;
    }
    if (ch === "}" && expressionDepth > 0) {
      expressionDepth--;
      continue;
    }
    if (ch === ">" && expressionDepth === 0) return i;
  }
  return -1;
}

function findTopLevelOpenTag(content, tagName) {
  const lowerName = tagName.toLowerCase();
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== "<" || i + 1 >= content.length || content[i + 1] === "/") continue;
    const end = findTagEnd(content, i + 1);
    if (end === -1) return null;
    const tag = content.slice(i, end + 1);
    const name = tag.slice(1).split(/[\s>/]/)[0].toLowerCase();
    if (name === lowerName) return { openStart: i, openEnd: end + 1, openTag: tag };
    i = end;
  }
  return null;
}

function findClosingTag(content, tagName, start) {
  const needle = `</${tagName.toLowerCase()}>`;
  const lower = content.toLowerCase();
  const idx = lower.indexOf(needle, start);
  return idx === -1 ? -1 : idx;
}

function extractTopLevelSection(content, tagName) {
  const open = findTopLevelOpenTag(content, tagName);
  if (!open) return { remaining: content, inner: "", attrs: "" };
  const closeStart = findClosingTag(content, tagName, open.openEnd);
  if (closeStart === -1) {
    const { line, col } = lineCol(content, open.openStart);
    throw new Error(`missing closing </${tagName}> for <${tagName}> at ${line}:${col}`);
  }
  const closeEnd = closeStart + tagName.length + 3;
  const inner = content.slice(open.openEnd, closeStart);
  const attrs = open.openTag.slice(1 + tagName.length, open.openTag.length - 1).trim();
  const remaining = (content.slice(0, open.openStart) + content.slice(closeEnd)).trim();
  return { remaining, inner, attrs };
}

function hasBooleanAttr(attrs, name) {
  return new RegExp(`(^|\\s)${name}(\\s|=|$)`, "i").test(attrs);
}

function parseComponentSections(content) {
  let remaining = content;
  const script = extractTopLevelSection(remaining, "script");
  remaining = script.remaining;
  const style = extractTopLevelSection(remaining, "style");
  remaining = style.remaining;
  return {
    script: script.inner.trim(),
    style: style.inner.trim(),
    styleScoped: hasBooleanAttr(style.attrs, "scoped"),
    template: remaining.trim()
  };
}

function findExpressionEnd(template, start) {
  let depth = 0;
  let quote = 0;
  let escaped = false;
  for (let i = start; i < template.length; i++) {
    const ch = template[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = 0;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0) return i;
      if (depth < 0) break;
    }
  }
  const { line, col } = lineCol(template, start);
  throw new Error(`unclosed template expression at ${line}:${col}`);
}

function compileTemplateExpressions(template) {
  let out = "";
  for (let i = 0; i < template.length; i++) {
    if (template[i] === "{" && template[i + 1] === "{") {
      out += "{";
      i++;
      continue;
    }
    if (template[i] === "}" && template[i + 1] === "}") {
      out += "}";
      i++;
      continue;
    }
    if (template[i] !== "{") {
      out += template[i];
      continue;
    }
    const end = findExpressionEnd(template, i);
    const expr = template.slice(i + 1, end).trim();
    if (!expr) {
      const { line, col } = lineCol(template, i);
      throw new Error(`empty template expression at ${line}:${col} (use {{ and }} for literal braces)`);
    }
    out += "${" + expr + "}";
    i = end;
  }
  return out;
}

function validateTemplateTags(html) {
  for (let i = 0; i < html.length; i++) {
    if (html[i] !== "<" || i + 1 >= html.length || html[i + 1] === "!" || html[i + 1] === "?") continue;
    const end = findTagEnd(html, i + 1);
    if (end === -1) {
      const { line, col } = lineCol(html, i);
      throw new Error(`unclosed HTML tag at ${line}:${col}`);
    }
    i = end;
  }
}

function addScopeAttrToTag(tag, scopeAttr) {
  const m = tag.match(/^<([^\s/>]+)/);
  if (!m) return tag;
  const tagName = m[1].toLowerCase();
  if (tagName === "script" || tagName === "style") return tag;
  if (new RegExp(`\\s${scopeAttr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|=|>|/)`).test(tag)) return tag;
  let insertAt = tag.length - 1;
  if (insertAt > 0 && tag[insertAt - 1] === "/") insertAt--;
  return tag.slice(0, insertAt) + ` ${scopeAttr}` + tag.slice(insertAt);
}

function scopeTemplate(html, scopeAttr) {
  let out = "";
  for (let i = 0; i < html.length; ) {
    if (html[i] !== "<" || i + 1 >= html.length || html[i + 1] === "/" || html[i + 1] === "!" || html[i + 1] === "?") {
      out += html[i];
      i++;
      continue;
    }
    const end = findTagEnd(html, i + 1);
    if (end === -1) {
      const { line, col } = lineCol(html, i);
      throw new Error(`unclosed HTML tag at ${line}:${col}`);
    }
    out += addScopeAttrToTag(html.slice(i, end + 1), scopeAttr);
    i = end + 1;
  }
  return out;
}

function appendScopeAttrToSelector(selector, scopeAttr) {
  const attr = `[${scopeAttr}]`;
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  let insertAt = trimmed.length;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i] === ":") {
      insertAt = i;
      if (i > 0 && trimmed[i - 1] === ":") insertAt = i - 1;
      break;
    }
  }
  if (insertAt === trimmed.length) return trimmed + attr;
  return trimmed.slice(0, insertAt) + attr + trimmed.slice(insertAt);
}

function unwrapGlobalSelector(selector) {
  let out = selector;
  while (true) {
    const start = out.indexOf(":global(");
    if (start === -1) return out;
    const contentStart = start + ":global(".length;
    let depth = 0;
    let end = -1;
    for (let i = contentStart - 1; i < out.length; i++) {
      if (out[i] === "(") depth++;
      else if (out[i] === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) return out;
    out = out.slice(0, start) + out.slice(contentStart, end) + out.slice(end + 1);
  }
}

function splitSelectorList(selectorList) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = 0;
  for (let i = 0; i < selectorList.length; i++) {
    const ch = selectorList[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = 0;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function scopeSelectorList(selectorList, scopeAttr) {
  return splitSelectorList(selectorList)
    .map(sel => sel.trim())
    .filter(Boolean)
    .map(sel => {
      if (sel.includes(":global(")) return unwrapGlobalSelector(sel);
      if (sel.includes(":host")) return sel.replaceAll(":host", `[${scopeAttr}]`);
      return appendScopeAttrToSelector(sel, scopeAttr);
    })
    .join(", ");
}

function findCSSOpenBrace(css, start) {
  let quote = 0;
  let escaped = false;
  for (let i = start; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = 0;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") return i;
  }
  return -1;
}

function findMatchingBrace(css, open) {
  let depth = 0;
  let quote = 0;
  let escaped = false;
  for (let i = open; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = 0;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function scopeCSSBlock(css, scopeAttr) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;
    const headerStart = i;
    const open = findCSSOpenBrace(css, i);
    if (open === -1) {
      if (css.slice(i).trim()) {
        const { line, col } = lineCol(css, i);
        throw new Error(`CSS rule missing opening brace near ${line}:${col}`);
      }
      break;
    }
    const close = findMatchingBrace(css, open);
    if (close === -1) {
      const { line, col } = lineCol(css, open);
      throw new Error(`unclosed CSS block at ${line}:${col}`);
    }
    const header = css.slice(headerStart, open).trim();
    const body = css.slice(open + 1, close).trim();
    const lower = header.toLowerCase();
    if (header.startsWith("@")) {
      if (
        lower.startsWith("@media") ||
        lower.startsWith("@supports") ||
        lower.startsWith("@container") ||
        lower.startsWith("@layer")
      ) {
        out += `${header} { ${scopeCSSBlock(body, scopeAttr)} }\n`;
      } else {
        out += `${header} { ${body} }\n`;
      }
    } else {
      out += `${scopeSelectorList(header, scopeAttr)} { ${body} }\n`;
    }
    i = close + 1;
  }
  return out.trim();
}

function renderExpression(compiledHTML) {
  if (!compiledHTML.includes("${")) {
    return `htmlStatic(${JSON.stringify(compiledHTML)})`;
  }
  return "html`\n" + compiledHTML + "\n`";
}

function writeSourceMap(mapPath, fileName, sourceName, sourceContent, generated) {
  const mappings = generated.split("\n").map(() => "").join(";");
  const payload = {
    version: 3,
    file: fileName,
    sources: [sourceName.replace(/\\/g, "/")],
    sourcesContent: [sourceContent],
    names: [],
    mappings
  };
  writeFileSync(mapPath, JSON.stringify(payload) + "\n", "utf8");
}

/**
 * Compile one .cachou file.
 */
export function compileFile(inputPath, { outDir = "", runtime = "cachoujs" } = {}) {
  const content = readFileSync(inputPath, "utf8");
  const base = basename(inputPath);
  const nameWithoutExt = basename(inputPath, extname(inputPath));
  const componentName = uppercaseFirst(nameWithoutExt);

  let outputPath;
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    outputPath = join(outDir, nameWithoutExt + ".js");
  } else {
    outputPath = join(dirname(inputPath), nameWithoutExt + ".js");
  }

  const sections = parseComponentSections(content);
  const scopeID = "data-c-" + sanitizeScopeID(nameWithoutExt);
  validateTemplateTags(sections.template);

  let scopedHTML = sections.template;
  let scopedCSS = "";
  if (sections.style) {
    if (sections.styleScoped) {
      scopedHTML = scopeTemplate(sections.template, scopeID);
      scopedCSS = scopeCSSBlock(sections.style, scopeID);
    } else {
      scopeCSSBlock(sections.style, "data-c-validate"); // validate
      scopedCSS = sections.style.trim();
    }
  }

  const compiledHTML = compileTemplateExpressions(scopedHTML);
  let styleImport = "";
  if (scopedCSS) {
    const cssPath = join(dirname(outputPath), nameWithoutExt + ".css");
    writeFileSync(cssPath, scopedCSS + "\n", "utf8");
    styleImport = `import "./${nameWithoutExt}.css";\n`;
  }

  const mapFile = nameWithoutExt + ".js.map";
  const outputJS = `// Generated by CachouJS Compiler (JS) - DO NOT EDIT
// Source: ${base.replace(/\\/g, "/")}
import * as Cachou from "${runtime}";
${styleImport}
const {
  signal,
  effect,
  createRoot,
  memo,
  store,
  batch,
  onCleanup,
  onMount,
  html,
  mapArray,
  createResource,
  htmlStatic,
  Router,
  Route,
  Layout,
  Outlet,
  Link,
  navigate,
  getPath,
  getQueryParams,
  getRouteData,
  useRouteData,
  useHead,
  Show,
  Switch,
  Match
} = Cachou;

export default function ${componentName}(props = {}) {
  // --- Component Setup ---
${indentLines(sections.script, "  ")}

  // --- Render ---
  return ${renderExpression(compiledHTML)};
}
//# sourceMappingURL=${mapFile}
`;

  writeFileSync(outputPath, outputJS, "utf8");
  writeSourceMap(outputPath + ".map", basename(outputPath), base, content, outputJS);
  return { outputPath, componentName };
}

export function compileDir(inputDir, { outDir = "", runtime = "cachoujs" } = {}) {
  const results = [];
  const errors = [];

  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith(".cachou")) {
        try {
          let out = outDir;
          if (outDir) {
            const rel = relative(inputDir, dirname(full));
            out = join(outDir, rel);
          }
          results.push(compileFile(full, { outDir: out || dirname(full), runtime }));
        } catch (err) {
          errors.push({ file: full, error: err });
        }
      }
    }
  }

  walk(resolve(inputDir));
  return { results, errors };
}

export function runCli(argv = process.argv.slice(2)) {
  let file = "";
  let dir = "";
  let out = "";
  let runtime = "cachoujs";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-file") file = argv[++i];
    else if (argv[i] === "-dir") dir = argv[++i];
    else if (argv[i] === "-out") out = argv[++i];
    else if (argv[i] === "-runtime") runtime = argv[++i];
  }
  if (!file && !dir) {
    console.error("Usage: cachou-compiler -file <file.cachou> | -dir <directory> [-out <dir>] [-runtime cachoujs]");
    process.exit(1);
  }
  let failed = false;
  if (file) {
    try {
      const r = compileFile(file, { outDir: out, runtime });
      console.log(`Compiled: ${file} -> ${r.outputPath} (Component: ${r.componentName})`);
    } catch (err) {
      console.error(`Error compiling file ${file}: ${err.message || err}`);
      failed = true;
    }
  }
  if (dir) {
    const { results, errors } = compileDir(dir, { outDir: out || dir, runtime });
    for (const r of results) {
      console.log(`Compiled: -> ${r.outputPath} (Component: ${r.componentName})`);
    }
    for (const e of errors) {
      console.error(`Error compiling file ${e.file}: ${e.error.message || e.error}`);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}
