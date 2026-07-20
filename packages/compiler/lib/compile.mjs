/**
 * Pure JavaScript .cachou SFC compiler (no Go required).
 * Canonical compiler for script/style/template, {expr}, {{ literal }}, scoped CSS, and bind().
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, basename, extname, resolve } from "node:path";

/**
 * Structured compiler diagnostic with absolute file location, optional hint, and code.
 * Codes are documented in docs/COMPILER.md (Diagnostics catalog).
 */
export class CompilerDiagnostic extends Error {
  /**
   * @param {string} message
   * @param {{ offset?: number, line?: number, col?: number, hint?: string, source?: string, code?: string }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = "CompilerDiagnostic";
    this.offset = opts.offset ?? null;
    this.line = opts.line ?? null;
    this.col = opts.col ?? null;
    this.hint = opts.hint || null;
    this.source = opts.source || null;
    this.code = opts.code || null;
  }
}

/** Catalog of diagnostic codes for actionable SFC errors. */
export const DIAGNOSTIC_CODES = Object.freeze({
  CACHOU001: "Unclosed template expression `{…}`",
  CACHOU002: "Empty template expression `{}`",
  CACHOU003: "Unclosed HTML tag (missing `>` or quote)",
  CACHOU004: "Missing closing section tag (`</script>` / `</style>`)",
  CACHOU005: "Unclosed CSS block",
  CACHOU006: "Unclosed CSS comment",
  CACHOU007: "CSS rule missing `{`",
  CACHOU008: "Unclosed CSS bind() expression",
  CACHOU009: "Empty CSS bind() expression",
  CACHOU010: "CSS bind() requires an element root",
  CACHOU011: "Duplicate top-level <script> section",
  CACHOU012: "Duplicate top-level <style> section",
  CACHOU013: "Template is empty (no markup after script/style)"
});

function lineCol(content, index) {
  let line = 1;
  let col = 1;
  const end = Math.max(0, Math.min(index, content.length));
  for (let i = 0; i < end; i++) {
    if (content[i] === "\n") {
      line++;
      col = 1;
    } else col++;
  }
  return { line, col };
}

/**
 * Throw a diagnostic at an absolute offset in the original source.
 * @param {string} source
 * @param {number} absoluteIndex
 * @param {string} message
 * @param {string} [hint]
 * @param {string} [code]
 */
function throwAt(source, absoluteIndex, message, hint, code) {
  const safeIndex = Math.max(0, Math.min(absoluteIndex, source.length));
  const { line, col } = lineCol(source, safeIndex);
  throw new CompilerDiagnostic(message, {
    offset: safeIndex,
    line,
    col,
    hint,
    source,
    code: code || null
  });
}

/**
 * @param {string} file
 * @param {Error | CompilerDiagnostic} error
 */
function formatCompilerError(file, error) {
  const message = error?.message || String(error);
  let line = typeof error?.line === "number" ? error.line : null;
  let column = typeof error?.col === "number" ? error.col : null;
  let sourceText = typeof error?.source === "string" ? error.source : null;

  if ((line == null || column == null) && typeof error?.offset === "number" && sourceText) {
    ({ line, col: column } = lineCol(sourceText, error.offset));
  }

  if (line == null || column == null) {
    const position = message.match(/(?:at|near) (\d+):(\d+)/i);
    if (position) {
      line = Number(position[1]);
      column = Number(position[2]);
    }
  }

  if (line == null || column == null) {
    return `${file}: ${message}${error?.hint ? `\n  hint: ${error.hint}` : ""}`;
  }

  if (!sourceText) {
    try {
      sourceText = readFileSync(file, "utf8");
    } catch {
      // Keep the positional diagnostic when the source cannot be reread.
    }
  }

  const sourceLine = sourceText ? sourceText.split(/\r?\n/)[line - 1] || "" : "";
  const caret = `${" ".repeat(Math.max(0, column - 1))}^`;
  const code = error?.code ? `[${error.code}] ` : "";
  const hint = error?.hint ? `\n  hint: ${error.hint}` : "";
  return `${file}:${line}:${column}\n${sourceLine}\n${caret} ${code}${message}${hint}`;
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

function findTopLevelOpenTag(content, tagName, fromIndex = 0) {
  const lowerName = tagName.toLowerCase();
  for (let i = fromIndex; i < content.length; i++) {
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

function hasBooleanAttr(attrs, name) {
  return new RegExp(`(^|\\s)${name}(\\s|=|$)`, "i").test(attrs);
}

function indexInRanges(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * Extract a top-level SFC section with absolute offsets into the original file.
 * @returns {{ text: string, offset: number, attrs: string, range: [number, number] } | null}
 */
function extractSection(content, tagName, occupiedRanges) {
  let searchFrom = 0;
  let first = null;
  while (searchFrom < content.length) {
    const open = findTopLevelOpenTag(content, tagName, searchFrom);
    if (!open) return first;
    if (indexInRanges(open.openStart, occupiedRanges)) {
      searchFrom = open.openEnd;
      continue;
    }
    const closeStart = findClosingTag(content, tagName, open.openEnd);
    if (closeStart === -1) {
      throwAt(
        content,
        open.openStart,
        `missing closing </${tagName}> for <${tagName}>`,
        `Add </${tagName}> after the ${tagName} section body.`,
        "CACHOU004"
      );
    }
    const closeEnd = closeStart + tagName.length + 3;
    if (first) {
      const code = tagName === "script" ? "CACHOU011" : tagName === "style" ? "CACHOU012" : null;
      throwAt(
        content,
        open.openStart,
        `duplicate top-level <${tagName}> section`,
        `Only one top-level <${tagName}> is allowed per .cachou file. Merge the sections.`,
        code
      );
    }
    let textStart = open.openEnd;
    while (textStart < closeStart && /\s/.test(content[textStart])) textStart++;
    let textEnd = closeStart;
    while (textEnd > textStart && /\s/.test(content[textEnd - 1])) textEnd--;
    const attrs = open.openTag.slice(1 + tagName.length, open.openTag.length - 1).trim();
    first = {
      text: content.slice(textStart, textEnd),
      offset: textStart,
      attrs,
      range: [open.openStart, closeEnd]
    };
    // Keep scanning to detect a second top-level section of the same kind.
    searchFrom = closeEnd;
    occupiedRanges = [...occupiedRanges, first.range];
  }
  return first;
}

/**
 * Build the template by removing section ranges, preserving a map from
 * template-local indices to absolute source offsets.
 */
function buildTemplate(content, ranges) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  /** @type {number[]} */
  const map = [];
  let text = "";
  let cursor = 0;
  for (const [start, end] of sorted) {
    for (let i = cursor; i < start; i++) {
      map.push(i);
      text += content[i];
    }
    cursor = end;
  }
  for (let i = cursor; i < content.length; i++) {
    map.push(i);
    text += content[i];
  }

  let trimStart = 0;
  while (trimStart < text.length && /\s/.test(text[trimStart])) trimStart++;
  let trimEnd = text.length;
  while (trimEnd > trimStart && /\s/.test(text[trimEnd - 1])) trimEnd--;

  const trimmed = text.slice(trimStart, trimEnd);
  const trimmedMap = map.slice(trimStart, trimEnd);
  const toAbsolute = localIndex => {
    if (trimmedMap.length === 0) return 0;
    if (localIndex < 0) return trimmedMap[0];
    if (localIndex >= trimmedMap.length) return trimmedMap[trimmedMap.length - 1];
    return trimmedMap[localIndex];
  };
  return { text: trimmed, toAbsolute, offset: trimmedMap[0] ?? 0 };
}

function parseComponentSections(content) {
  /** @type {Array<[number, number]>} */
  const occupied = [];
  const scriptSection = extractSection(content, "script", occupied);
  if (scriptSection) occupied.push(scriptSection.range);
  const styleSection = extractSection(content, "style", occupied);
  if (styleSection) occupied.push(styleSection.range);
  const template = buildTemplate(content, occupied);

  return {
    source: content,
    script: scriptSection?.text || "",
    scriptOffset: scriptSection?.offset ?? 0,
    style: styleSection?.text || "",
    styleOffset: styleSection?.offset ?? 0,
    styleScoped: hasBooleanAttr(styleSection?.attrs || "", "scoped"),
    template: template.text,
    templateToAbsolute: template.toAbsolute,
    templateOffset: template.offset
  };
}

/**
 * @param {string} template
 * @param {number} start
 * @param {{ source?: string, toAbsolute?: (i: number) => number }} [loc]
 */
function findExpressionEnd(template, start, loc = {}) {
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
  if (loc.source && typeof loc.toAbsolute === "function") {
    throwAt(
      loc.source,
      loc.toAbsolute(start),
      "unclosed template expression",
      "Close the expression with `}`, or write literal braces as `{{` and `}}`.",
      "CACHOU001"
    );
  }
  const { line, col } = lineCol(template, start);
  throw new CompilerDiagnostic(`unclosed template expression at ${line}:${col}`, {
    line,
    col,
    hint: "Close the expression with `}`, or write literal braces as `{{` and `}}`.",
    code: "CACHOU001"
  });
}

/**
 * @param {string} template
 * @param {{ source?: string, toAbsolute?: (i: number) => number }} [loc]
 */
function compileTemplateExpressions(template, loc = {}) {
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
    const end = findExpressionEnd(template, i, loc);
    const expr = template.slice(i + 1, end).trim();
    if (!expr) {
      if (loc.source && typeof loc.toAbsolute === "function") {
        throwAt(
          loc.source,
          loc.toAbsolute(i),
          "empty template expression",
          "Put a JavaScript expression inside `{…}`, or use `{{` / `}}` for literal braces.",
          "CACHOU002"
        );
      }
      const { line, col } = lineCol(template, i);
      throw new CompilerDiagnostic(
        `empty template expression at ${line}:${col} (use {{ and }} for literal braces)`,
        {
          line,
          col,
          hint: "Put a JavaScript expression inside `{…}`, or use `{{` / `}}` for literal braces.",
          code: "CACHOU002"
        }
      );
    }
    out += "${" + expr + "}";
    i = end;
  }
  return out;
}

/**
 * @param {string} html
 * @param {{ source?: string, toAbsolute?: (i: number) => number }} [loc]
 */
function validateTemplateTags(html, loc = {}) {
  for (let i = 0; i < html.length; i++) {
    if (html[i] !== "<" || i + 1 >= html.length || html[i + 1] === "!" || html[i + 1] === "?") continue;
    const end = findTagEnd(html, i + 1);
    if (end === -1) {
      if (loc.source && typeof loc.toAbsolute === "function") {
        throwAt(
          loc.source,
          loc.toAbsolute(i),
          "unclosed HTML tag",
          "Check for a missing `>` or an unclosed quote in an attribute value.",
          "CACHOU003"
        );
      }
      const { line, col } = lineCol(html, i);
      throw new CompilerDiagnostic(`unclosed HTML tag at ${line}:${col}`, {
        line,
        col,
        hint: "Check for a missing `>` or an unclosed quote in an attribute value.",
        code: "CACHOU003"
      });
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

function scopeTemplate(html, scopeAttr, loc = {}) {
  let out = "";
  for (let i = 0; i < html.length; ) {
    if (html[i] !== "<" || i + 1 >= html.length || html[i + 1] === "/" || html[i + 1] === "!" || html[i + 1] === "?") {
      out += html[i];
      i++;
      continue;
    }
    const end = findTagEnd(html, i + 1);
    if (end === -1) {
      if (loc.source && typeof loc.toAbsolute === "function") {
        throwAt(
          loc.source,
          loc.toAbsolute(i),
          "unclosed HTML tag",
          "Check for a missing `>` or an unclosed quote in an attribute value."
        );
      }
      const { line, col } = lineCol(html, i);
      throw new CompilerDiagnostic(`unclosed HTML tag at ${line}:${col}`, {
        line,
        col,
        hint: "Check for a missing `>` or an unclosed quote in an attribute value."
      });
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

  // Keep trailing selector comments after the scoped compound. Placing the
  // attribute after a comment would turn `.card /* note */` into a descendant
  // selector once CSS comments are removed.
  const trailingComment = trimmed.match(/^([\s\S]*?)(\s+\/\*[\s\S]*\*\/\s*)$/);
  if (trailingComment) {
    return `${appendScopeAttrToSelector(trailingComment[1], scopeAttr)}${trailingComment[2]}`;
  }

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
    if (!quote && css[i] === "/" && css[i + 1] === "*") {
      const close = css.indexOf("*/", i + 2);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
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
    if (!quote && css[i] === "/" && css[i + 1] === "*") {
      const close = css.indexOf("*/", i + 2);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
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

/**
 * @param {string} css
 * @param {string} scopeAttr
 * @param {{ source?: string, baseOffset?: number }} [loc]
 */
function scopeCSSBlock(css, scopeAttr, loc = {}) {
  const abs = localIndex => {
    if (loc.source && typeof loc.baseOffset === "number") {
      return loc.baseOffset + localIndex;
    }
    return null;
  };

  let out = "";
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;

    // Consume standalone comments before scanning the next rule so braces in
    // comments cannot become CSS block delimiters.
    if (css[i] === "/" && css[i + 1] === "*") {
      const close = css.indexOf("*/", i + 2);
      if (close === -1) {
        const absolute = abs(i);
        if (absolute != null) {
          throwAt(loc.source, absolute, "unclosed CSS comment", "Close the comment with `*/`.", "CACHOU006");
        }
        const { line, col } = lineCol(css, i);
        throw new CompilerDiagnostic(`unclosed CSS comment at ${line}:${col}`, {
          line,
          col,
          hint: "Close the comment with `*/`.",
          code: "CACHOU006"
        });
      }
      out += css.slice(i, close + 2) + "\n";
      i = close + 2;
      continue;
    }

    const headerStart = i;
    const open = findCSSOpenBrace(css, i);
    if (open === -1) {
      if (css.slice(i).trim()) {
        const absolute = abs(i);
        if (absolute != null) {
          throwAt(
            loc.source,
            absolute,
            "CSS rule missing opening brace",
            "A selector or at-rule is missing `{`.",
            "CACHOU007"
          );
        }
        const { line, col } = lineCol(css, i);
        throw new CompilerDiagnostic(`CSS rule missing opening brace near ${line}:${col}`, {
          line,
          col,
          hint: "A selector or at-rule is missing `{`.",
          code: "CACHOU007"
        });
      }
      break;
    }
    const close = findMatchingBrace(css, open);
    if (close === -1) {
      const absolute = abs(open);
      if (absolute != null) {
        throwAt(
          loc.source,
          absolute,
          "unclosed CSS block",
          "Add a closing `}` for this rule or at-rule.",
          "CACHOU005"
        );
      }
      const { line, col } = lineCol(css, open);
      throw new CompilerDiagnostic(`unclosed CSS block at ${line}:${col}`, {
        line,
        col,
        hint: "Add a closing `}` for this rule or at-rule.",
        code: "CACHOU005"
      });
    }
    const header = css.slice(headerStart, open).trim();
    const body = css.slice(open + 1, close).trim();
    // Nested @media bodies lose precise offsets; report relative to the open brace.
    const nestedLoc =
      loc.source && typeof loc.baseOffset === "number"
        ? { source: loc.source, baseOffset: loc.baseOffset + open + 1 }
        : {};
    const lower = header.toLowerCase();
    if (header.startsWith("@")) {
      if (
        lower.startsWith("@media") ||
        lower.startsWith("@supports") ||
        lower.startsWith("@container") ||
        lower.startsWith("@layer")
      ) {
        out += `${header} { ${scopeCSSBlock(body, scopeAttr, nestedLoc)} }\n`;
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

function findMatchingParen(input, open) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = open; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function sanitizeVBindName(expr) {
  const name = String(expr)
    .replace(/[^a-zA-Z0-9_.[\]()]/g, "-")
    .replace(/[.()[\]]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return name || "binding";
}

function hashVBindExpression(expr) {
  let hash = 2166136261;
  for (let i = 0; i < expr.length; i++) {
    hash ^= expr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isSimpleIdentifier(expr) {
  return /^[A-Za-z_$][\w$]*$/.test(expr);
}

/**
 * @param {string} css
 * @param {{ source?: string, baseOffset?: number }} [loc]
 */
function compileVBindCSS(css, loc = {}) {
  const bindings = [];
  const seen = new Map();
  let output = "";
  let cursor = 0;
  const abs = localIndex =>
    loc.source && typeof loc.baseOffset === "number" ? loc.baseOffset + localIndex : null;

  while (cursor < css.length) {
    const start = css.indexOf("bind(", cursor);
    if (start === -1) {
      output += css.slice(cursor);
      break;
    }
    const before = start === 0 ? "" : css[start - 1];
    if (before && /[\w-]/.test(before)) {
      output += css.slice(cursor, start + 5);
      cursor = start + 5;
      continue;
    }
    const close = findMatchingParen(css, start + 4);
    if (close === -1) {
      const absolute = abs(start);
      if (absolute != null) {
        throwAt(
          loc.source,
          absolute,
          "unclosed CSS bind() expression",
          "Close the bind() call with `)`, e.g. `color: bind(color)`.",
          "CACHOU008"
        );
      }
      const { line, col } = lineCol(css, start);
      throw new CompilerDiagnostic(`unclosed CSS bind() expression at ${line}:${col}`, {
        line,
        col,
        hint: "Close the bind() call with `)`, e.g. `color: bind(color)`.",
        code: "CACHOU008"
      });
    }
    const expr = css.slice(start + 5, close).trim();
    if (!expr) {
      const absolute = abs(start);
      if (absolute != null) {
        throwAt(
          loc.source,
          absolute,
          "empty CSS bind() expression",
          'Provide an expression, e.g. `bind(color)` or `bind(count() + "px")`.',
          "CACHOU009"
        );
      }
      const { line, col } = lineCol(css, start);
      throw new CompilerDiagnostic(`empty CSS bind() expression at ${line}:${col}`, {
        line,
        col,
        hint: 'Provide an expression, e.g. `bind(color)` or `bind(count() + "px")`.',
        code: "CACHOU009"
      });
    }
    const baseName = sanitizeVBindName(expr);
    let name = baseName;
    if (seen.has(name) && seen.get(name) !== expr) {
      name = `${baseName}-${hashVBindExpression(expr)}`;
      while (seen.has(name) && seen.get(name) !== expr) {
        name += "-x";
      }
    }
    if (!seen.has(name)) {
      seen.set(name, expr);
      bindings.push({ expr, name });
    }
    output += css.slice(cursor, start) + `var(--cachou-v-${name})`;
    cursor = close + 1;
  }

  if (bindings.length === 0) return { css, setup: "" };
  const lines = [
    "const $__cachouVBindOwner = getOwner();",
    "const $__cachouVBindDisposers = new WeakMap();",
    "const $__cachouVBindRef = (node, disposedNode) => {",
    "  if (!node) {",
    "    const dispose = $__cachouVBindDisposers.get(disposedNode);",
    "    dispose?.();",
    "    if (disposedNode) $__cachouVBindDisposers.delete(disposedNode);",
    "    return;",
    "  }",
    "  if ($__cachouVBindOwner?.disposed) return;",
    "  const dispose = runWithOwner($__cachouVBindOwner, () => effect(() => {"
  ];
  for (const binding of bindings) {
    const expression = isSimpleIdentifier(binding.expr) ? `${binding.expr}()` : binding.expr;
    lines.push(`    node.style.setProperty("--cachou-v-${binding.name}", String(${expression}));`);
  }
  lines.push("  }));", "  $__cachouVBindDisposers.set(node, dispose);", "};");
  return { css: output, setup: lines.join("\n") };
}

function injectVBindRefs(html) {
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  let output = "";
  let cursor = 0;
  let depth = 0;
  let injected = false;
  for (let i = 0; i < html.length; i++) {
    if (html[i] !== "<" || !/[A-Za-z/]/.test(html[i + 1] || "")) continue;
    const end = findTagEnd(html, i + 1);
    if (end === -1) return { html, injected: false };
    const closing = html[i + 1] === "/";
    const tagSource = closing ? html.slice(i + 2, end) : html.slice(i + 1, end);
    const tagMatch = tagSource.match(/^([A-Za-z][\w:-]*)/);
    if (!tagMatch) continue;
    const tagName = tagMatch[1].toLowerCase();
    const tagText = html.slice(i, end + 1);
    if (closing) {
      output += html.slice(cursor, i) + tagText;
      cursor = end + 1;
      depth = Math.max(0, depth - 1);
      i = end;
      continue;
    }
    const selfClosing = /\/\s*>$/.test(tagText) || voidTags.has(tagName);
    output += html.slice(cursor, i);
    if (depth === 0) {
      const insertAt = tagText.length - (selfClosing ? tagText.match(/\/\s*>$/)[0].length : 1);
      output += tagText.slice(0, insertAt) + " ref={$__cachouVBindRef}" + tagText.slice(insertAt);
      injected = true;
    } else {
      output += tagText;
    }
    cursor = end + 1;
    if (!selfClosing) depth++;
    i = end;
  }
  output += html.slice(cursor);
  return { html: output, injected };
}

const staticVoidTags = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"
]);
const staticUnsupportedTags = new Set([
  "html", "head", "body", "base", "script", "style", "template", "textarea", "title", "select", "option",
  "table", "caption", "colgroup", "col", "tbody", "thead", "tfoot", "tr", "td", "th", "svg", "math"
]);

function parseStaticAttributes(source) {
  const attrs = [];
  const names = new Set();
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index++;
    if (index >= source.length) break;
    if (source[index] === "/" && /^\s*$/.test(source.slice(index))) break;

    const nameMatch = source.slice(index).match(/^([^\s=/>]+)/);
    if (!nameMatch) return null;
    const name = nameMatch[1];
    const normalizedName = name.toLowerCase();
    if (names.has(normalizedName) || name.includes("{") || name.includes("}")) return null;
    names.add(normalizedName);
    index += name.length;
    while (index < source.length && /\s/.test(source[index])) index++;

    let value = "";
    if (source[index] === "=") {
      index++;
      while (index < source.length && /\s/.test(source[index])) index++;
      const quote = source[index];
      if (quote === '"' || quote === "'") {
        index++;
        const end = source.indexOf(quote, index);
        if (end === -1) return null;
        value = source.slice(index, end);
        index = end + 1;
      } else {
        const valueMatch = source.slice(index).match(/^[^\s>]+/);
        if (!valueMatch) return null;
        value = valueMatch[0].replace(/\/$/, (match, offset, whole) => offset === whole.length - 1 ? "" : match);
        index += valueMatch[0].length;
      }
    }

    // Entity decoding and namespace/property semantics are intentionally left
    // to htmlStatic until the compiler has a dedicated implementation for them.
    if (value.includes("&") || name.startsWith(".") || name.startsWith("#")) return null;
    attrs.push({ name, value });
  }
  return attrs;
}

function parseStaticDOM(template) {
  if (!template || template.includes("${") || template.includes("&")) return null;
  const root = { type: "root", children: [] };
  const stack = [root];
  let index = 0;

  const append = node => stack[stack.length - 1].children.push(node);

  while (index < template.length) {
    if (template.startsWith("<!--", index)) {
      const end = template.indexOf("-->", index + 4);
      if (end === -1) return null;
      const value = template.slice(index + 4, end);
      if (value.includes("--") || value.endsWith("-")) return null;
      append({ type: "comment", value });
      index = end + 3;
      continue;
    }

    if (template[index] !== "<") {
      const end = template.indexOf("<", index);
      const value = template.slice(index, end === -1 ? template.length : end);
      if (value) append({ type: "text", value });
      index = end === -1 ? template.length : end;
      continue;
    }

    if (template.startsWith("</", index)) {
      const end = template.indexOf(">", index + 2);
      if (end === -1 || stack.length === 1) return null;
      const name = template.slice(index + 2, end).trim().toLowerCase();
      const current = stack[stack.length - 1];
      if (current.type !== "element" || current.tagName !== name) return null;
      stack.pop();
      index = end + 1;
      continue;
    }

    if (template[index + 1] === "!" || template[index + 1] === "?") return null;
    const end = findTagEnd(template, index + 1);
    if (end === -1) return null;
    const source = template.slice(index + 1, end);
    const match = source.match(/^([A-Za-z][\w:-]*)([\s\S]*)$/);
    if (!match) return null;
    const tagName = match[1].toLowerCase();
    if (staticUnsupportedTags.has(tagName)) return null;
    const remainder = match[2];
    const selfClosing = /\/\s*$/.test(remainder);
    if (selfClosing && !staticVoidTags.has(tagName)) return null;
    const attrSource = selfClosing ? remainder.replace(/\/\s*$/, "") : remainder;
    const attrs = parseStaticAttributes(attrSource);
    if (!attrs) return null;
    const node = { type: "element", tagName, attrs, children: [] };
    append(node);
    if (!selfClosing && !staticVoidTags.has(tagName)) stack.push(node);
    index = end + 1;
  }

  return stack.length === 1 && root.children.length > 0 ? root : null;
}

function emitStaticDOMNode(node, lines, parentName, counter) {
  if (node.type === "text") {
    const name = `text${counter.value++}`;
    lines.push(`const ${name} = document.createTextNode(${JSON.stringify(node.value)});`);
    lines.push(`${parentName}.appendChild(${name});`);
    return;
  }
  if (node.type === "comment") {
    const name = `comment${counter.value++}`;
    lines.push(`const ${name} = document.createComment(${JSON.stringify(node.value)});`);
    lines.push(`${parentName}.appendChild(${name});`);
    return;
  }

  const name = `node${counter.value++}`;
  lines.push(`const ${name} = document.createElement(${JSON.stringify(node.tagName)});`);
  for (const attr of node.attrs) {
    lines.push(`${name}.setAttribute(${JSON.stringify(attr.name)}, ${JSON.stringify(attr.value)});`);
  }
  for (const child of node.children) emitStaticDOMNode(child, lines, name, counter);
  lines.push(`${parentName}.appendChild(${name});`);
}

function compileStaticDOMFactory(template) {
  const ast = parseStaticDOM(template);
  if (!ast) return null;
  const lines = ["() => {"];
  const counter = { value: 0 };
  const roots = [];
  for (const child of ast.children) {
    if (child.type === "element") {
      const name = `root${counter.value++}`;
      lines.push(`const ${name} = document.createElement(${JSON.stringify(child.tagName)});`);
      for (const attr of child.attrs) {
        lines.push(`${name}.setAttribute(${JSON.stringify(attr.name)}, ${JSON.stringify(attr.value)});`);
      }
      for (const nested of child.children) emitStaticDOMNode(nested, lines, name, counter);
      roots.push(name);
    } else if (child.type === "text") {
      const name = `rootText${counter.value++}`;
      lines.push(`const ${name} = document.createTextNode(${JSON.stringify(child.value)});`);
      roots.push(name);
    } else {
      const name = `rootComment${counter.value++}`;
      lines.push(`const ${name} = document.createComment(${JSON.stringify(child.value)});`);
      roots.push(name);
    }
  }
  if (roots.length === 1) {
    lines.push(`return ${roots[0]};`);
  } else {
    lines.push("const fragment = document.createDocumentFragment();");
    for (const root of roots) lines.push(`fragment.appendChild(${root});`);
    lines.push("return fragment;");
  }
  lines.push("}");
  return lines.join("\n");
}

function renderExpression(compiledHTML, staticFactory = null) {
  if (staticFactory) {
    return `(typeof Cachou.createCompiledStatic === "function" ? Cachou.createCompiledStatic(${JSON.stringify(compiledHTML)}, ${staticFactory}) : htmlStatic(${JSON.stringify(compiledHTML)}))`;
  }
  if (!compiledHTML.includes("${")) {
    return `htmlStatic(${JSON.stringify(compiledHTML)})`;
  }
  return "html`\n" + compiledHTML + "\n`";
}

/** Minimal base64 VLQ for section-aware source maps (line-level). */
function encodeVLQ(value) {
  let vlq = value < 0 ? (-value << 1) + 1 : value << 1;
  let encoded = "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    encoded += alphabet[digit];
  } while (vlq > 0);
  return encoded;
}

function writeSourceMap(mapPath, fileName, sourceName, sourceContent, generated, sectionHints = {}) {
  // Map each generated line: script body lines → script section start; rest → template or file start
  const genLines = generated.split("\n");
  const scriptStart = sectionHints.scriptLine || 0;
  const templateStart = sectionHints.templateLine || 0;
  let lastGenCol = 0;
  let lastSourceLine = 0;
  let lastSourceCol = 0;
  let lastName = 0;
  const segments = [];
  for (let i = 0; i < genLines.length; i++) {
    // Heuristic: component setup block uses script lines sequentially when we see "Component Setup"
    let sourceLine = 0;
    if (genLines[i].includes("--- Component Setup ---") || (i > 0 && segments.length && genLines[i - 1]?.includes("Component Setup"))) {
      sourceLine = scriptStart;
    } else if (genLines[i].includes("--- Render ---") || genLines[i].includes("html`") || genLines[i].includes("htmlStatic")) {
      sourceLine = templateStart;
    } else if (scriptStart && i > 10 && i < genLines.length - 5) {
      sourceLine = Math.min(scriptStart + Math.max(0, i - 12), sourceContent.split("\n").length - 1);
    }
    const relLine = sourceLine - lastSourceLine;
    // generated column 0, source index 0, source line, source col 0
    const seg =
      encodeVLQ(0 - lastGenCol) +
      encodeVLQ(0) +
      encodeVLQ(relLine) +
      encodeVLQ(0 - lastSourceCol);
    lastGenCol = 0;
    lastSourceLine = sourceLine;
    lastSourceCol = 0;
    segments.push(seg);
  }
  const payload = {
    version: 3,
    file: fileName,
    sources: [sourceName.replace(/\\/g, "/")],
    sourcesContent: [sourceContent],
    names: [],
    mappings: segments.join(";")
  };
  writeFileSync(mapPath, JSON.stringify(payload) + "\n", "utf8");
}

/** Pragmatic TS strip for simple annotations in <script> (not a full parser). */
export function stripTypeScript(script) {
  const masked = maskTypeScriptNonCode(script);
  let out = masked.code;
  // remove interface / type blocks
  out = out.replace(/^\s*interface\s+\w+[\s\S]*?\{[\s\S]*?\}\s*$/gm, "");
  out = out.replace(/^\s*type\s+\w+\s*=\s*[^;]+;/gm, "");
  // strip `as Type` assertions
  out = out.replace(/\s+as\s+[A-Za-z0-9_.<>,\s|&[\]"']+/g, "");
  // strip simple param types: (x: number) and property types in destructuring limited
  out = out.replace(/(\(|,)\s*([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z0-9_<>|\[\]\s.,]+(?=[,)=])/g, "$1$2");
  // strip return types on functions: ): Type {
  out = out.replace(/\)\s*:\s*[A-Za-z0-9_<>|\[\]\s.,]+\s*\{/g, ") {");
  // strip variable annotations: const x: Type =
  out = out.replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z0-9_<>|\[\]\s.,]+\s*=/g, "$1 $2 =");
  return masked.restore(out);
}

function maskTypeScriptNonCode(input) {
  const tokens = [];
  let code = "";
  let index = 0;

  while (index < input.length) {
    const start = index;
    const quote = input[index];
    if (quote === "'" || quote === '"' || quote === "`") {
      index++;
      let escaped = false;
      while (index < input.length) {
        const ch = input[index++];
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          break;
        }
      }
    } else if (input.startsWith("//", index)) {
      index += 2;
      while (index < input.length && input[index] !== "\n" && input[index] !== "\r") index++;
    } else if (input.startsWith("/*", index)) {
      index += 2;
      while (index < input.length && !input.startsWith("*/", index)) index++;
      if (index < input.length) index += 2;
    } else {
      code += input[index++];
      continue;
    }

    const raw = input.slice(start, index);
    const marker = `__CACHOU_TS_TOKEN_${tokens.length}__`;
    const newlines = raw.replace(/[^\r\n]/g, "");
    const masked = marker + newlines;
    tokens.push({ masked, raw });
    code += masked;
  }

  return {
    code,
    restore(value) {
      let restored = value;
      for (const token of tokens) restored = restored.replace(token.masked, token.raw);
      return restored;
    }
  };
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
  const templateLoc = {
    source: content,
    toAbsolute: sections.templateToAbsolute
  };
  if (!sections.template || !sections.template.trim()) {
    throwAt(
      content,
      Math.max(0, content.length - 1),
      "template is empty",
      "Add markup after optional <script> / <style> sections (at least one HTML element).",
      "CACHOU013"
    );
  }
  // Validate tags + expressions on the unscoped template so locations map to the file.
  validateTemplateTags(sections.template, templateLoc);
  compileTemplateExpressions(sections.template, templateLoc);
  // Pragmatic TS support: strip simple annotations in script
  sections.script = stripTypeScript(sections.script || "");

  // Section line hints for source maps (0-based line index)
  const scriptLine = sections.script
    ? lineCol(content, sections.scriptOffset).line - 1
    : 0;
  const templateLine = sections.template
    ? lineCol(content, sections.templateOffset).line - 1
    : 0;

  const styleLoc = { source: content, baseOffset: sections.styleOffset };
  let scopedHTML = sections.template;
  let scopedCSS = "";
  let vBindSetup = "";
  if (sections.style) {
    // Diagnostic pass on original style text (absolute file locations).
    if (/\bbind\s*\(/.test(sections.style)) {
      compileVBindCSS(sections.style, styleLoc);
    }
    if (sections.styleScoped) {
      scopedHTML = scopeTemplate(sections.template, scopeID, templateLoc);
      scopedCSS = scopeCSSBlock(sections.style, scopeID, styleLoc);
    } else {
      scopeCSSBlock(sections.style, "data-c-validate", styleLoc); // validate braces/comments
      scopedCSS = sections.style.trim();
    }
  }

  if (scopedCSS) {
    const compiledVBind = compileVBindCSS(scopedCSS);
    scopedCSS = compiledVBind.css;
    if (compiledVBind.setup) {
      const injected = injectVBindRefs(scopedHTML);
      if (!injected.injected) {
        throwAt(
          content,
          sections.styleOffset,
          "CSS bind() requires a template with an element root",
          "Wrap the template in a single HTML element so reactive CSS can attach.",
          "CACHOU010"
        );
      }
      scopedHTML = injected.html;
      vBindSetup = compiledVBind.setup;
    }
  }

  // Expressions already validated; second pass emits ${...} on possibly scoped HTML.
  const compiledHTML = compileTemplateExpressions(scopedHTML);
  const staticFactory = compiledHTML.includes("${") ? null : compileStaticDOMFactory(compiledHTML);
  let styleImport = "";
  if (scopedCSS) {
    const cssPath = join(dirname(outputPath), nameWithoutExt + ".css");
    writeFileSync(cssPath, scopedCSS + "\n", "utf8");
    // Keep generated components importable by raw Node SSR. Vite/browser
    // builds still load the sibling CSS, while Node never evaluates it.
    styleImport = `if (typeof document !== "undefined") import("./${nameWithoutExt}.css");\n`;
  }

  const mapFile = nameWithoutExt + ".js.map";
  const setup = [sections.script, vBindSetup].filter(Boolean).join("\n\n");
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
  untrack,
  getOwner,
  runWithOwner,
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
  useParams,
  useSearchParams,
  useHead,
  Show,
  Switch,
  Match,
  For,
  Index,
  splitProps,
  mergeProps,
  Dynamic,
  createAction,
  redirect,
  notFound,
  createMutation,
  persist,
  Dialog
} = Cachou;

export default function ${componentName}(props = {}) {
  // --- Component Setup ---
${indentLines(setup, "  ")}

  // --- Render ---
  return ${renderExpression(compiledHTML, staticFactory)};
}
//# sourceMappingURL=${mapFile}
`;

  writeFileSync(outputPath, outputJS, "utf8");
  writeSourceMap(outputPath + ".map", basename(outputPath), base, content, outputJS, {
    scriptLine,
    templateLine
  });
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
      console.error(`Error compiling file ${formatCompilerError(file, err)}`);
      failed = true;
    }
  }
  if (dir) {
    const { results, errors } = compileDir(dir, { outDir: out || dir, runtime });
    for (const r of results) {
      console.log(`Compiled: -> ${r.outputPath} (Component: ${r.componentName})`);
    }
    for (const e of errors) {
      console.error(`Error compiling file ${formatCompilerError(e.file, e.error)}`);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}
