"use strict";

const vscode = require("vscode");
const { API_ITEMS } = require("./completion");

const DOCS = Object.fromEntries(
  API_ITEMS.map(item => [
    item.label,
    `**\`${item.label}\`** — ${item.detail}\n\nSee [API reference](https://github.com/cachoujs/cachou/blob/main/docs/API.md) and local \`docs/API.md\`.`
  ])
);

Object.assign(DOCS, {
  props: "**`props`** — Component props object passed into the default export function generated from this `.cachou` file.",
  scoped: "**`scoped`** — On `<style scoped>`, component CSS is rewritten with a `data-c-*` attribute. `:host` and `:global(...)` are supported.",
  ":host": "**`:host`** — In scoped CSS, targets the component scope attribute.",
  ":global": "**`:global(selector)`** — Leaves the inner selector unscoped inside a scoped stylesheet.",
  "class:": "**`class:name={expr}`** — Toggles a class from a truthy expression.",
  "style:": "**`style:prop={expr}`** — Sets one CSS property reactively (subject to security policy).",
  "bind:value": "**`bind:value={[get, set]}`** — Two-way binding for input values.",
  ref: "**`ref={fn}`** — Receives the DOM element when bound."
});

function wordAt(document, position) {
  const range = document.getWordRangeAtPosition(position, /[:@.]?[\w:-]+/);
  if (!range) return null;
  return { range, word: document.getText(range) };
}

function registerHover(context) {
  const provider = vscode.languages.registerHoverProvider("cachou", {
    provideHover(document, position) {
      const hit = wordAt(document, position);
      if (!hit) return null;

      let key = hit.word;
      if (key.startsWith("class:")) key = "class:";
      if (key.startsWith("style:") && key !== "style") key = "style:";
      if (key.startsWith("bind:")) key = key === "bind:checked" ? "bind:value" : key;

      const md = DOCS[key] || DOCS[key.replace(/^on/, "on")] || null;
      if (!md) return null;
      return new vscode.Hover(new vscode.MarkdownString(md, true), hit.range);
    }
  });

  context.subscriptions.push(provider);
}

module.exports = { registerHover };
