"use strict";

const vscode = require("vscode");

const API_ITEMS = [
  { label: "signal", detail: "Create reactive state [get, set]", insert: "signal($0)" },
  { label: "effect", detail: "Run side effects when dependencies change", insert: "effect(() => {\n  $0\n})" },
  { label: "memo", detail: "Lazy derived value", insert: "memo(() => $0)" },
  { label: "store", detail: "Reactive object proxy", insert: "store({$0})" },
  { label: "batch", detail: "Coalesce updates", insert: "batch(() => {\n  $0\n})" },
  { label: "createRoot", detail: "Ownership root", insert: "createRoot(dispose => {\n  $0\n  return dispose;\n})" },
  { label: "onCleanup", detail: "Register cleanup", insert: "onCleanup(() => {\n  $0\n})" },
  { label: "onMount", detail: "Run after mount", insert: "onMount(() => {\n  $0\n})" },
  { label: "html", detail: "Tagged template DOM", insert: "html`$0`" },
  { label: "htmlStatic", detail: "Static markup helper", insert: "htmlStatic($0)" },
  { label: "mapArray", detail: "Keyed list mapping", insert: "mapArray(${1:list}, ${2:item} => $0, ${2} => ${2}.id, { uniqueKeys: true })" },
  { label: "createResource", detail: "Async resource", insert: "createResource(async ({ signal, requestId }) => {\n  $0\n})" },
  { label: "createForm", detail: "Form helper", insert: "createForm({$1}, {\n  fields: {$2},\n  onSubmit: async values => {\n    $0\n  }\n})" },
  { label: "createField", detail: "Single field helper", insert: "createField($1, { validate: v => $0 })" },
  { label: "Router", detail: "Router container", insert: "Router({ children: [$0] })" },
  { label: "Route", detail: "Route match", insert: "Route({ path: \"$1\", component: $0 })" },
  { label: "Layout", detail: "Nested layout", insert: "Layout({ path: \"$1\", component: $2, children: [$0] })" },
  { label: "Outlet", detail: "Layout child outlet", insert: "Outlet()" },
  { label: "Link", detail: "In-app link", insert: "Link({ href: \"$1\", children: \"$2\" })" },
  { label: "navigate", detail: "Programmatic navigation", insert: "navigate(\"$1\")" },
  { label: "ErrorBoundary", detail: "Error boundary", insert: "ErrorBoundary({ children: () => $1, fallback: (err, reset) => $0 })" },
  { label: "Suspense", detail: "Suspense boundary", insert: "Suspense({ fallback: () => $1, children: () => $0 })" },
  { label: "lazy", detail: "Lazy component", insert: "lazy(() => import(\"$0\"))" },
  { label: "createContext", detail: "Context object", insert: "createContext($0)" },
  { label: "useContext", detail: "Read context", insert: "useContext($0)" },
  { label: "scheduleTask", detail: "Cooperative scheduler", insert: "scheduleTask(async ({ signal, yieldNow }) => {\n  $0\n}, { priority: \"background\" })" },
  { label: "startTransition", detail: "Interruptible transition", insert: "startTransition(() => {\n  $0\n})" },
  { label: "useHead", detail: "Document head", insert: "useHead({ title: \"$0\" })" },
  { label: "applyProductionSecurityDefaults", detail: "Stricter security defaults", insert: "applyProductionSecurityDefaults()" },
  { label: "trustedHTML", detail: "Explicit raw HTML", insert: "trustedHTML($0)" },
  { label: "Show", detail: "Conditional render", insert: "Show({ when: () => $1, children: () => $0 })" },
  { label: "Switch", detail: "Multi-branch switch", insert: "Switch({ children: [Match({ when: () => $1, children: () => $0 })] })" },
  { label: "Match", detail: "Switch branch", insert: "Match({ when: () => $1, children: () => $0 })" },
  { label: "useRouteData", detail: "Active route load state", insert: "useRouteData()" },
  { label: "mountDevtools", detail: "Open in-page DevTools", insert: "mountDevtools()" },
  { label: "props", detail: "Component props object", insert: "props" }
];

const DIRECTIVE_ITEMS = [
  { label: "class:", detail: "Toggle class", insert: "class:${1:active}={${2:flag()}}" },
  { label: "style:", detail: "Reactive style property", insert: "style:${1:color}={${2:value()}}" },
  { label: "bind:value", detail: "Two-way value bind", insert: "bind:value={[${1:text}, set${1/(.*)/${1:/capitalize}/}]}" },
  { label: "bind:checked", detail: "Two-way checked bind", insert: "bind:checked={[${1:done}, set${1/(.*)/${1:/capitalize}/}]}" },
  { label: "ref", detail: "Element ref", insert: "ref={el => { ${1:node} = el; }}" },
  { label: "onclick", detail: "Click handler", insert: "onclick={() => ${1:handler}()}" },
  { label: "oninput", detail: "Input handler", insert: "oninput={e => ${1:setValue}(e.target.value)}" },
  { label: "transition", detail: "Enter/leave transition", insert: "transition={{ enter(el, done) { done(); }, leave(el, done) { done(); } }}" }
];

function inScriptSection(document, position) {
  const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const open = text.toLowerCase().lastIndexOf("<script");
  const close = text.toLowerCase().lastIndexOf("</script>");
  return open !== -1 && open > close;
}

function inStyleSection(document, position) {
  const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const open = text.toLowerCase().lastIndexOf("<style");
  const close = text.toLowerCase().lastIndexOf("</style>");
  return open !== -1 && open > close;
}

function registerCompletion(context) {
  const provider = vscode.languages.registerCompletionItemProvider(
    "cachou",
    {
      provideCompletionItems(document, position) {
        const items = [];

        if (inScriptSection(document, position)) {
          for (const api of API_ITEMS) {
            const item = new vscode.CompletionItem(api.label, vscode.CompletionItemKind.Function);
            item.detail = api.detail;
            item.insertText = new vscode.SnippetString(api.insert);
            item.documentation = new vscode.MarkdownString(`CachouJS runtime API: \`${api.label}\``);
            items.push(item);
          }
        } else if (inStyleSection(document, position)) {
          for (const label of [":host", ":global()"]) {
            const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Keyword);
            item.insertText = new vscode.SnippetString(
              label === ":host" ? ":host {\n  $0\n}" : ":global(.${1:class}) {\n  $0\n}"
            );
            items.push(item);
          }
          const scoped = new vscode.CompletionItem("scoped", vscode.CompletionItemKind.Keyword);
          scoped.detail = "Attribute on <style scoped>";
          items.push(scoped);
        } else {
          for (const api of DIRECTIVE_ITEMS) {
            const item = new vscode.CompletionItem(api.label, vscode.CompletionItemKind.Property);
            item.detail = api.detail;
            item.insertText = new vscode.SnippetString(api.insert);
            items.push(item);
          }
          // lightweight expression helpers in template braces context
          for (const name of ["props", "signal", "mapArray", "html"]) {
            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
            items.push(item);
          }
        }

        return items;
      }
    },
    ".",
    ":",
    "{"
  );

  context.subscriptions.push(provider);
}

module.exports = { registerCompletion, API_ITEMS };
