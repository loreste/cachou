import { createRoot, effect, emitFrameworkEvent, onCleanup, resetResourceCounter, resetSSRHead, resolvePendingResources, createSSRContext, runWithSSRContext, runWithSSRContextAsync, setLastSSRContext, getSSRHead, dehydrate } from "./reactivity.js";
import { reconcile } from "./reconcile.js";
import { setSSRPath } from "./router-state.js";
import { applyDirective } from "./directives.js";

const templateCache = new WeakMap();
const textElementCache = new WeakMap();
const tableRowCache = new WeakMap();
const nodeCleanups = new WeakMap();
const cleanupParents = new WeakSet();
const rootDisposers = new WeakMap();

class SafeHTML {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const securityPolicy = {
  allowedURLProtocols: ["http:", "https:", "mailto:", "tel:", "blob:", "data:"],
  allowedDataMimeTypes: ["image/", "video/", "audio/", "font/", "application/pdf"],
  // Prefer CSP + class toggles in production apps; demos may re-enable inline styles.
  allowInlineStyles: true
};

/** Safer defaults for production apps. Call once at bootstrap. */
export function applyProductionSecurityDefaults() {
  return configureSecurityPolicy({
    allowInlineStyles: false,
    allowedURLProtocols: ["http:", "https:", "mailto:", "tel:"],
    allowedDataMimeTypes: ["image/", "video/", "audio/", "font/", "application/pdf"]
  });
}

export function configureSecurityPolicy(options = {}) {
  if (Array.isArray(options.allowedURLProtocols)) {
    securityPolicy.allowedURLProtocols = options.allowedURLProtocols.slice();
  }
  if (Array.isArray(options.allowedDataMimeTypes)) {
    securityPolicy.allowedDataMimeTypes = options.allowedDataMimeTypes.slice();
  }
  if (typeof options.allowInlineStyles === "boolean") {
    securityPolicy.allowInlineStyles = options.allowInlineStyles;
  }
  return getSecurityPolicy();
}

export function getSecurityPolicy() {
  return {
    allowedURLProtocols: securityPolicy.allowedURLProtocols.slice(),
    allowedDataMimeTypes: securityPolicy.allowedDataMimeTypes.slice(),
    allowInlineStyles: securityPolicy.allowInlineStyles
  };
}

export function trustedHTML(value) {
  return new SafeHTML(String(value));
}

function warnSecurity(message, details = {}) {
  emitFrameworkEvent({ type: "security-block", message, ...details });
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`⚡ [CachouJS Security]: ${message}`);
  }
}

const delegatedEvents = new Set([
  "click",
  "dblclick",
  "input",
  "change",
  "keydown",
  "keyup",
  "keypress",
  "mousedown",
  "mouseup",
  "mouseover",
  "mouseout",
  "touchstart",
  "touchend"
]);

const registeredEvents = (globalThis.__CACHOU_EVENTS__ = globalThis.__CACHOU_EVENTS__ || new Set());

function rootHasReactiveWork(disposeRoot) {
  const owner = disposeRoot && disposeRoot._owner;
  return Boolean(disposeRoot && (disposeRoot._debugTracked || (owner && ((owner.owned && owner.owned.size > 0) || (owner.cleanups && owner.cleanups.size > 0)))));
}

export function addNodeCleanup(node, cleanupFn) {
  let cleanups = nodeCleanups.get(node);
  if (!cleanups) {
    cleanups = [];
    nodeCleanups.set(node, cleanups);
    markCleanupParents(node);
  }
  cleanups.push(cleanupFn);
}

function markCleanupParents(node) {
  let parent = node.parentNode;
  while (parent) {
    cleanupParents.add(parent);
    parent = parent.parentNode;
  }
}

export function cleanupNode(node) {
  if (mayHaveNestedCleanups(node)) {
    let child = node.firstChild;
    while (child) {
      const next = child.nextSibling;
      cleanupNode(child);
      child = next;
    }
    cleanupParents.delete(node);
  }

  const cleanups = nodeCleanups.get(node);
  if (cleanups) {
    for (const clean of cleanups) {
      clean();
    }
    nodeCleanups.delete(node);
  }
}

function needsCleanup(node) {
  return cleanupParents.has(node) || nodeCleanups.has(node);
}

function mayHaveNestedCleanups(node) {
  if (cleanupParents.has(node)) return true;
  let child = node.firstChild;
  while (child) {
    if (cleanupParents.has(child) || nodeCleanups.has(child)) {
      return true;
    }
    child = child.nextSibling;
  }
  return false;
}

const transitions = new WeakMap();

export function registerTransition(node, options) {
  transitions.set(node, options);
  markCleanupParents(node);
}

export function removeNodeWithTransition(node, onDone = () => node.remove()) {
  cleanupNode(node);
  const trans = transitions.get(node);
  if (trans && trans.leave) {
    trans.leave(node, () => {
      node.remove();
      onDone();
    });
  } else {
    node.remove();
    onDone();
  }
}

function getNodeByPath(root, path) {
  let current = root;
  for (const idx of path) {
    current = current.childNodes[idx];
  }
  return current;
}

function compileTemplate(strings) {
  let htmlString = "";
  
  for (let i = 0; i < strings.length - 1; i++) {
    htmlString += strings[i];
    
    // Determine if placeholder is inside a tag or is a child/text block
    const lastOpen = htmlString.lastIndexOf("<");
    const lastClose = htmlString.lastIndexOf(">");
    const isInsideTag = lastOpen > lastClose;
    
    if (isInsideTag) {
      htmlString += `__c_attr_${i}__`;
    } else {
      htmlString += `<!--__c_child_${i}__-->`;
    }
  }
  htmlString += strings[strings.length - 1];

  const template = document.createElement("template");
  template.innerHTML = htmlString.trim();

  const bindings = [];
  walk(template.content, [], bindings);

  return { template, bindings };
}

function walk(node, path, bindings) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const attrs = Array.from(node.attributes);
    for (const attr of attrs) {
      const match = attr.value.match(/__c_attr_(\d+)__/);
      if (match) {
        const index = parseInt(match[1], 10);
        const isEvent = attr.name.startsWith("on");
        bindings.push({
          type: isEvent ? "event" : "attribute",
          path: [...path],
          name: isEvent ? attr.name.slice(2).toLowerCase() : attr.name,
          index
        });
        node.removeAttribute(attr.name);
      }
    }
  } else if (node.nodeType === Node.COMMENT_NODE) {
    const match = node.nodeValue.match(/__c_child_(\d+)__/);
    if (match) {
      const index = parseInt(match[1], 10);
      bindings.push({
        type: "child",
        path: [...path],
        index
      });
    }
  }

  let child = node.firstChild;
  let childIndex = 0;
  while (child) {
    walk(child, [...path, childIndex], bindings);
    child = child.nextSibling;
    childIndex++;
  }
}

function normalizeVal(val) {
  if (typeof val === "function") {
    val = val();
  }
  if (val === null || val === undefined || val === false) {
    return [];
  }
  if (val instanceof Node) {
    return [val];
  }
  if (val instanceof SafeHTML) {
    const template = document.createElement("template");
    template.innerHTML = val.toString();
    return Array.from(template.content.childNodes);
  }
  if (val instanceof DocumentFragment) {
    return Array.from(val.childNodes);
  }
  if (Array.isArray(val)) {
    const nodes = [];
    for (const item of val) {
      nodes.push(...normalizeVal(item));
    }
    return nodes;
  }
  return [document.createTextNode(String(val))];
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeHTML(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isURLAttribute(name) {
  return ["href", "src", "action", "formaction", "xlink:href"].includes(name.toLowerCase());
}

function isSafeURLValue(value) {
  const raw = String(value || "").trim().replace(/[\u0000-\u001F\u007F\s]+/g, "");
  if (raw === "" || raw.startsWith("#") || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
    return true;
  }
  try {
    const parsed = new URL(raw, "http://localhost");
    if (!securityPolicy.allowedURLProtocols.includes(parsed.protocol)) {
      return false;
    }
    if (parsed.protocol === "data:") {
      const mime = raw.slice(5, raw.indexOf(",") === -1 ? raw.length : raw.indexOf(",")).split(";")[0].toLowerCase();
      return securityPolicy.allowedDataMimeTypes.some(allowed => mime.startsWith(allowed));
    }
    return true;
  } catch (err) {
    return false;
  }
}

function sanitizeAttributeValue(name, value) {
  if (isURLAttribute(name) && !isSafeURLValue(value)) {
    warnSecurity(`blocked unsafe ${name} URL.`, { attribute: name, value: String(value) });
    return null;
  }
  return value;
}

function sanitizeStyleValue(value) {
  if (value === null || value === undefined) return "";
  if (!securityPolicy.allowInlineStyles) {
    warnSecurity("blocked inline style because the security policy disables inline styles.");
    return "";
  }
  const raw = String(value);
  const compact = raw.replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
  if (compact.includes("javascript:") || compact.includes("expression(")) {
    warnSecurity("blocked unsafe style value.", { value: raw });
    return "";
  }
  return raw;
}

function stringifySSRValue(value, isAttrValue) {
  if (value === null || value === undefined || value === false) {
    return "";
  }
  if (value instanceof SafeHTML) {
    return isAttrValue ? escapeAttribute(value.toString()) : value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(item => stringifySSRValue(typeof item === "function" ? item() : item, isAttrValue)).join("");
  }
  return isAttrValue ? escapeAttribute(value) : escapeHTML(value);
}

export function updateChild(anchor, val, oldNodes) {
  const isPrimitive = val !== null && val !== undefined && typeof val !== "object" && typeof val !== "function";
  
  if (isPrimitive && oldNodes.length === 1 && oldNodes[0].nodeType === Node.TEXT_NODE) {
    oldNodes[0].nodeValue = String(val);
    return oldNodes;
  }

  const newNodes = normalizeVal(val);
  const parent = anchor.parentNode;
  
  if (!parent) return oldNodes;

  if (oldNodes.length === 0) {
    for (const n of newNodes) {
      parent.insertBefore(n, anchor);
    }
  } else if (newNodes.length === 0) {
    for (const n of oldNodes) {
      removeNodeWithTransition(n);
    }
  } else {
    reconcile(parent, oldNodes, newNodes, anchor);
  }

  return newNodes;
}

function replaceStaticChild(anchor, val) {
  const parent = anchor.parentNode;
  if (!parent) return;
  if (val !== null && val !== undefined && typeof val !== "object" && typeof val !== "function") {
    if (isOnlyChildAnchor(anchor)) {
      parent.textContent = String(val);
      return;
    }
    anchor.replaceWith(document.createTextNode(String(val)));
    return;
  }
  const newNodes = normalizeVal(val);
  if (newNodes.length === 0) {
    anchor.remove();
    return;
  }
  if (newNodes.length === 1) {
    anchor.replaceWith(newNodes[0]);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const n of newNodes) {
    fragment.appendChild(n);
  }
  parent.insertBefore(fragment, anchor);
  anchor.remove();
}

function isOnlyChildAnchor(anchor) {
  const parent = anchor.parentNode;
  return parent && parent.firstChild === anchor && parent.lastChild === anchor;
}

function bindValue(node, binding, values) {
  if (binding.type === "event") {
    const eventName = binding.name;
    if (delegatedEvents.has(eventName)) {
      // 1. Assign dynamic handler to node property reactively
      const stop = effect(() => {
        node["$$" + eventName] = values[binding.index];
      });
      addNodeCleanup(node, stop);

      // 2. Local fallback listener to support event execution in disconnected DOM trees
      node.addEventListener(eventName, (e) => {
        if (!node.isConnected) {
          let curr = e.target;
          const prop = "$$" + eventName;
          while (curr) {
            const fn = curr[prop];
            if (fn) {
              fn.call(curr, e);
              if (e.cancelBubble) break;
            }
            curr = curr.parentNode;
          }
        }
      });

      // 3. Set up global document listener if not yet registered
      if (!registeredEvents.has(eventName)) {
        registeredEvents.add(eventName);
        document.addEventListener(eventName, (e) => {
          let curr = e.target;
          const prop = "$$" + eventName;
          while (curr && curr !== document) {
            const handler = curr[prop];
            if (handler) {
              handler.call(curr, e);
              if (e.cancelBubble) break;
            }
            curr = curr.parentNode;
          }
        });
      }
    } else {
      // Non-delegating fallback (e.g. scroll, play, load)
      node.addEventListener(eventName, (e) => {
        const handler = values[binding.index];
        if (typeof handler === "function") {
          handler(e);
        }
      });
    }
  } else if (binding.type === "attribute") {
    // Custom directives: use:name=${value}
    if (binding.name.startsWith("use:")) {
      const dirName = binding.name.slice(4);
      const cleanup = applyDirective(node, dirName, values[binding.index]);
      if (typeof cleanup === "function") addNodeCleanup(node, cleanup);
      return;
    }

    // model=${[get,set]} alias for two-way binding on form controls
    if (binding.name === "model") {
      const signalPair = values[binding.index];
      if (Array.isArray(signalPair) && signalPair.length >= 2) {
        const [get, set] = signalPair;
        const assignValue = () => {
          if (node.type === "checkbox") node.checked = Boolean(get());
          else node.value = get() ?? "";
        };
        const stop = effect(assignValue);
        addNodeCleanup(node, stop);
        const eventName = node.type === "checkbox" || node.type === "radio" || node.tagName === "SELECT" ? "change" : "input";
        const onInput = (e) => {
          set(node.type === "checkbox" ? e.target.checked : e.target.value);
        };
        node.addEventListener(eventName, onInput);
        addNodeCleanup(node, () => node.removeEventListener(eventName, onInput));
      }
      return;
    }

    // Handle Two-way Data Binding
    if (binding.name.startsWith("bind:")) {
      const prop = binding.name.slice(5);
      const signalPair = values[binding.index];
      if (Array.isArray(signalPair) && signalPair.length >= 2) {
        const [get, set] = signalPair;
        const assignValue = () => {
          if (prop === "checked") {
            node.checked = Boolean(get());
          } else {
            node.value = get() ?? "";
          }
        };
        if (get.$$cachouSignal) {
          assignValue();
          const subscriber = assignValue;
          get.$$cachouSignal.subscribers.add(subscriber);
          addNodeCleanup(node, () => {
            get.$$cachouSignal.subscribers.delete(subscriber);
          });
        } else {
          const stop = effect(assignValue);
          addNodeCleanup(node, stop);
        }
        const eventName = prop === "checked" ? "change" : "input";
        node.addEventListener(eventName, (e) => {
          set(prop === "checked" ? e.target.checked : e.target.value);
        });
      }
      return;
    }

    // Handle Class Toggling Directive: class:name=${signal}
    if (binding.name.startsWith("class:")) {
      const className = binding.name.slice(6);
      const initialVal = values[binding.index];
      const canAssignClassName = node.className === "";
      const setClass = canAssignClassName
        ? (val) => node.className = val ? className : ""
        : (val) => node.classList.toggle(className, Boolean(val));
      if (typeof initialVal !== "function") {
        setClass(Boolean(initialVal));
        return;
      }
      if (initialVal.$$cachouSignal) {
        setClass(Boolean(initialVal()));
        const subscriber = () => setClass(Boolean(initialVal()));
        initialVal.$$cachouSignal.subscribers.add(subscriber);
        addNodeCleanup(node, () => {
          initialVal.$$cachouSignal.subscribers.delete(subscriber);
        });
        return;
      }
      const stop = effect(() => {
        let val = values[binding.index];
        if (typeof val === "function") {
          val = val();
        }
        setClass(Boolean(val));
      });
      addNodeCleanup(node, stop);
      return;
    }

    // Handle Style Setting Directive: style:property=${signal}
    if (binding.name.startsWith("style:")) {
      const styleName = binding.name.slice(6);
      const stop = effect(() => {
        let val = values[binding.index];
        if (typeof val === "function") {
          val = val();
        }
        node.style[styleName] = sanitizeStyleValue(val);
      });
      addNodeCleanup(node, stop);
      return;
    }

    // Handle Animation Transitions
    if (binding.name === "transition") {
      const trans = values[binding.index];
      if (trans && typeof trans === "object") {
        registerTransition(node, trans);
        if (trans.enter) {
          requestAnimationFrame(() => {
            trans.enter(node);
          });
        }
      }
      return;
    }

    // Handle Refs
    if (binding.name === "ref") {
      const refVal = values[binding.index];
      if (typeof refVal === "function") {
        refVal(node);
      } else if (refVal && typeof refVal === "object") {
        refVal.current = node;
      }
      return;
    }

    const isProp = ["value", "checked", "disabled"].includes(binding.name) || binding.name.startsWith(".");
    const name = binding.name.startsWith(".") ? binding.name.slice(1) : binding.name;
    const initialVal = values[binding.index];

    if (typeof initialVal !== "function") {
      setAttributeBinding(node, name, isProp, initialVal);
      return;
    }
    if (initialVal.$$cachouSignal) {
      setAttributeBinding(node, name, isProp, initialVal());
      const subscriber = () => setAttributeBinding(node, name, isProp, initialVal());
      initialVal.$$cachouSignal.subscribers.add(subscriber);
      addNodeCleanup(node, () => {
        initialVal.$$cachouSignal.subscribers.delete(subscriber);
      });
      return;
    }

    const stop = effect(() => {
      let val = values[binding.index];
      if (typeof val === "function") {
        val = val();
      }

      setAttributeBinding(node, name, isProp, val);
    });

    addNodeCleanup(node, stop);
  } else if (binding.type === "child") {
    let currentNodes = node.nodeType === Node.TEXT_NODE ? [node] : [];
    const initialVal = values[binding.index];
    const textOnlyParent = isOnlyChildAnchor(node) ? node.parentNode : null;

    if (typeof initialVal !== "function") {
      replaceStaticChild(node, initialVal);
      return;
    }
    if (initialVal.$$cachouSignal) {
      if (textOnlyParent) {
        const textNode = document.createTextNode(initialVal() ?? "");
        node.replaceWith(textNode);
        const subscriber = () => {
          textNode.nodeValue = initialVal() ?? "";
        };
        initialVal.$$cachouSignal.subscribers.add(subscriber);
        addNodeCleanup(textOnlyParent, () => {
          initialVal.$$cachouSignal.subscribers.delete(subscriber);
        });
        return;
      }
      currentNodes = updateChild(node, initialVal(), currentNodes);
      const subscriber = () => {
        currentNodes = updateChild(node, initialVal(), currentNodes);
      };
      initialVal.$$cachouSignal.subscribers.add(subscriber);
      addNodeCleanup(node, () => {
        initialVal.$$cachouSignal.subscribers.delete(subscriber);
        for (const n of currentNodes) {
          cleanupNode(n);
        }
      });
      return;
    }

    const stop = effect(() => {
      let val = values[binding.index];
      if (typeof val === "function") {
        val = val();
      }
      currentNodes = updateChild(node, val, currentNodes);
    });

    addNodeCleanup(node, stop);
    addNodeCleanup(node, () => {
      for (const n of currentNodes) {
        cleanupNode(n);
      }
    });
  }
}

function setAttributeBinding(node, name, isProp, val) {
  if (isProp) {
    node[name] = isURLAttribute(name) ? sanitizeAttributeValue(name, val) ?? "" : val;
  } else if (name === "class") {
    node.className = val === null || val === undefined || val === false ? "" : String(val);
  } else {
    if (val === null || val === undefined || val === false) {
      node.removeAttribute(name);
    } else {
      const safeVal = sanitizeAttributeValue(name, val);
      if (safeVal === null) {
        node.removeAttribute(name);
      } else {
        node.setAttribute(name, safeVal);
      }
    }
  }
}

export function html(strings, ...values) {
  if (typeof window === "undefined" || typeof document === "undefined" || !!globalThis.__MOCK_SSR__) {
    // Server-Side Rendering (SSR) mode
    let htmlString = "";
    for (let i = 0; i < strings.length - 1; i++) {
      const str = strings[i];
      htmlString += str;
      let val = values[i];
      const eventMatch = str.match(/on[a-z]+=\s*(["'])?$/i);
      if (eventMatch) {
        const quote = eventMatch[1];
        val = quote ? "" : '""';
      } else {
        const isSignal = Array.isArray(val) && val.length === 2 && typeof val[0] === "function" && typeof val[1] === "function";
        if (isSignal) {
          val = val[0]();
        } else if (typeof val === "function") {
          val = val();
        }
        const isAttrValue = str.trim().endsWith("=");
        if (isAttrValue) {
          val = '"' + stringifySSRValue(val, true) + '"';
        } else {
          val = stringifySSRValue(val, false);
        }
      }
      if (val === null || val === undefined || val === false) {
        // Concatenate nothing
      } else if (Array.isArray(val)) {
        htmlString += stringifySSRValue(val, false);
      } else {
        htmlString += String(val);
      }
    }
    htmlString += strings[strings.length - 1];
    return new SafeHTML(htmlString);
  }

  const tableRowRecord = getTableRowRecord(strings);
  if (tableRowRecord && arePrimitiveTextValues(values)) {
    const tr = document.createElement("tr");
    for (let i = 0; i < values.length; i++) {
      const td = tr.insertCell();
      td.textContent = `${tableRowRecord.prefixes[i]}${values[i] ?? ""}${tableRowRecord.suffixes[i]}`;
    }
    return tr;
  }

  const textElementRecord = getTextElementRecord(strings);
  if (textElementRecord && arePrimitiveTextValues(values)) {
    const el = document.createElement(textElementRecord.tagName);
    let text = textElementRecord.parts[0];
    for (let i = 0; i < values.length; i++) {
      text += values[i] ?? "";
      text += textElementRecord.parts[i + 1];
    }
    el.textContent = text;
    return el;
  }

  let record = templateCache.get(strings);
  if (!record) {
    record = compileTemplate(strings);
    templateCache.set(strings, record);
  }

  const fragment = record.template.content.cloneNode(true);
  if (record.bindings.length === 0) {
    if (fragment.childNodes.length === 1) {
      return fragment.firstChild;
    }
    return fragment;
  }

  // Resolve node targets first while the DOM structure is untouched and stable
  const targetNodes = new Array(record.bindings.length);
  for (let i = 0; i < record.bindings.length; i++) {
    targetNodes[i] = getNodeByPath(fragment, record.bindings[i].path);
  }

  // Bind values after all targets are resolved to prevent mutation index shifts
  for (let i = 0; i < record.bindings.length; i++) {
    const node = targetNodes[i];
    const binding = record.bindings[i];
    if (isHydrating) {
      if (!node.$$deferredBindings) {
        node.$$deferredBindings = [];
      }
      node.$$deferredBindings.push({ binding, values });
    } else {
      bindValue(node, binding, values);
    }
  }

  if (fragment.childNodes.length === 1) {
    return fragment.firstChild;
  }
  return fragment;
}

const staticHTMLCache = new Map();

export function htmlStatic(markup) {
  if (typeof window === "undefined" || typeof document === "undefined" || !!globalThis.__MOCK_SSR__) {
    return new SafeHTML(String(markup));
  }
  let template = staticHTMLCache.get(markup);
  if (!template) {
    template = document.createElement("template");
    template.innerHTML = String(markup).trim();
    staticHTMLCache.set(markup, template);
  }
  const fragment = template.content.cloneNode(true);
  if (fragment.childNodes.length === 1) {
    return fragment.firstChild;
  }
  return fragment;
}

function getTableRowRecord(strings) {
  if (tableRowCache.has(strings)) {
    return tableRowCache.get(strings);
  }
  if (!strings[0].match(/^<tr><td>$/i) || !strings[strings.length - 1].match(/^<\/td><\/tr>$/i)) {
    tableRowCache.set(strings, null);
    return null;
  }
  const prefixes = [""];
  const suffixes = [];
  for (let i = 1; i < strings.length - 1; i++) {
    const match = strings[i].match(/^(.*)<\/td><td>(.*)$/i);
    if (!match || match[1].includes("<") || match[2].includes(">")) {
      tableRowCache.set(strings, null);
      return null;
    }
    suffixes.push(match[1]);
    prefixes.push(match[2]);
  }
  suffixes.push("");
  const record = { prefixes, suffixes };
  tableRowCache.set(strings, record);
  return record;
}

function arePrimitiveTextValues(values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const type = typeof value;
    if (type !== "string" && type !== "number" && type !== "boolean" && type !== "bigint") {
      return false;
    }
  }
  return true;
}

function getTextElementRecord(strings) {
  if (textElementCache.has(strings)) {
    return textElementCache.get(strings);
  }
  const first = strings[0];
  const last = strings[strings.length - 1];
  const open = first.match(/^<([a-z][a-z0-9-]*)>$/i);
  const close = last.match(new RegExp(`^(.*)</${open ? open[1] : ""}>$`, "i"));
  if (!open || !close) {
    textElementCache.set(strings, null);
    return null;
  }
  const tagName = open[1];
  const parts = [""];
  for (let i = 1; i < strings.length - 1; i++) {
    if (strings[i].includes("<") || strings[i].includes(">")) {
      textElementCache.set(strings, null);
      return null;
    }
    parts.push(strings[i]);
  }
  if (close[1].includes("<") || close[1].includes(">")) {
    textElementCache.set(strings, null);
    return null;
  }
  parts.push(close[1]);
  const record = { tagName, parts };
  textElementCache.set(strings, record);
  return record;
}

let isHydrating = false;

function warnHydration(message) {
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`⚡ [CachouJS Hydration]: ${message}`);
  }
}

export function hydrate(Component, root) {
  const prevDispose = rootDisposers.get(root);
  if (prevDispose) {
    prevDispose();
    rootDisposers.delete(root);
  }

  resetResourceCounter();
  isHydrating = true;
  let clientRoot;
  let disposeRoot;
  try {
    clientRoot = createRoot((dispose) => {
      disposeRoot = dispose;
      return typeof Component === "function" ? Component() : Component;
    });
  } finally {
    isHydrating = false;
  }
  if (rootHasReactiveWork(disposeRoot)) {
    rootDisposers.set(root, disposeRoot);
  }

  function walkAndHydrate(clientNode, serverNode) {
    if (!clientNode || !serverNode) {
      warnHydration("Client and server DOM structure differ.");
      return;
    }

    if (clientNode.nodeType !== serverNode.nodeType) {
      warnHydration(`Node type mismatch: expected ${clientNode.nodeType}, found ${serverNode.nodeType}.`);
    } else if (
      clientNode.nodeType === Node.ELEMENT_NODE &&
      serverNode.nodeType === Node.ELEMENT_NODE &&
      clientNode.nodeName !== serverNode.nodeName
    ) {
      warnHydration(`Element mismatch: expected <${clientNode.nodeName.toLowerCase()}>, found <${serverNode.nodeName.toLowerCase()}>.`);
    }

    if (clientNode.$$deferredBindings) {
      const childBinding = clientNode.$$deferredBindings.find(b => b.binding.type === "child");
      if (childBinding) {
        let val = childBinding.values[childBinding.binding.index];
        if (typeof val === "function") {
          val = val();
        }
        const newNodes = normalizeVal(val);
        const isElement = serverNode.nodeType === Node.ELEMENT_NODE && newNodes.length === 1 && newNodes[0].nodeType === Node.ELEMENT_NODE;
        
        if (isElement) {
          const parent = serverNode.parentNode;
          if (parent) {
            if (serverNode.nodeName === newNodes[0].nodeName) {
              walkAndHydrate(newNodes[0], serverNode);
              childBinding.binding.node = serverNode;
              return;
            } else {
              for (const n of newNodes) {
                parent.insertBefore(n, serverNode);
              }
              serverNode.remove();
              for (const n of newNodes) {
                walkAndHydrate(n, n);
              }
              return;
            }
          }
        }
      }

      for (const { binding, values } of clientNode.$$deferredBindings) {
        bindValue(serverNode, binding, values);
      }
    }

    let clientChild = clientNode.firstChild;
    let serverChild = serverNode.firstChild;

    while (clientChild) {
      walkAndHydrate(clientChild, serverChild);
      clientChild = clientChild.nextSibling;
      serverChild = serverChild ? serverChild.nextSibling : null;
    }

    if (serverChild) {
      warnHydration("Server DOM contains extra nodes not present in the client template.");
    }
  }

  let serverStart = root.firstChild || root;
  if (clientRoot instanceof Element) {
    serverStart = root.firstElementChild || serverStart;
  }
  walkAndHydrate(clientRoot, serverStart);
}

export function render(Component, root) {
  const prevDispose = rootDisposers.get(root);
  if (prevDispose) {
    prevDispose();
    rootDisposers.delete(root);
  }
  if (needsCleanup(root)) {
    cleanupNode(root);
  }
  root.textContent = "";
  let disposeRoot;
  const el = createRoot((dispose) => {
    disposeRoot = dispose;
    return typeof Component === "function" ? Component() : Component;
  });
  if (rootHasReactiveWork(disposeRoot)) {
    rootDisposers.set(root, disposeRoot);
  }
  if (el) {
    root.appendChild(el);
  }
}

export function mount(Component, root) {
  const prevDispose = rootDisposers.get(root);
  if (prevDispose) {
    prevDispose();
    rootDisposers.delete(root);
  }
  if (needsCleanup(root)) {
    cleanupNode(root);
  }
  root.textContent = "";

  let disposeRoot;
  const el = createRoot((dispose) => {
    disposeRoot = dispose;
    return typeof Component === "function" ? Component() : Component;
  });
  const hasReactiveWork = rootHasReactiveWork(disposeRoot);
  if (hasReactiveWork) {
    rootDisposers.set(root, disposeRoot);
  }
  if (el) {
    root.appendChild(el);
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (hasReactiveWork) {
      if (rootDisposers.get(root) === disposeRoot) {
        rootDisposers.delete(root);
      }
      disposeRoot();
    }
    if (needsCleanup(root)) {
      cleanupNode(root);
    }
    root.textContent = "";
  };
}

export function unmount(root) {
  const prevDispose = rootDisposers.get(root);
  if (prevDispose) {
    prevDispose();
    rootDisposers.delete(root);
  }
  if (needsCleanup(root)) {
    cleanupNode(root);
  }
  root.textContent = "";
}

export function renderToString(Component) {
  const context = createSSRContext();
  const html = runWithSSRContext(context, () => {
    resetResourceCounter();
    resetSSRHead();
    return String(typeof Component === "function" ? Component() : Component);
  });
  setLastSSRContext(context);
  return html;
}

export async function renderToStringAsync(Component, options = {}) {
  const context = createSSRContext();
  if (options.request) {
    context.request = options.request;
    if (typeof globalThis !== "undefined") globalThis.__CACHOU_REQUEST_EVENT__ = options.request;
  }
  const html = await runWithSSRContextAsync(context, async () => {
    resetSSRHead();
    if (options.path) {
      setSSRPath(options.path);
    }
    resetResourceCounter();
    typeof Component === "function" ? Component() : Component;
    await resolvePendingResources();
    resetResourceCounter();
    return String(typeof Component === "function" ? Component() : Component);
  });
  // Preserve context for sequential dehydrate()/getSSRHead() after await.
  setLastSSRContext(context);
  return html;
}

/**
 * Streaming SSR: yields head shell then body after resources resolve.
 * Returns a ReadableStream of UTF-8 text chunks when available, else async iterable.
 */
export function renderToStream(Component, options = {}) {
  const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

  async function* generate() {
    const context = createSSRContext();
    if (options.request) {
      context.request = options.request;
      if (typeof globalThis !== "undefined") globalThis.__CACHOU_REQUEST_EVENT__ = options.request;
    }
    await runWithSSRContextAsync(context, async () => {
      resetSSRHead();
      if (options.path) setSSRPath(options.path);
      resetResourceCounter();
      // kick render for resource registration
      typeof Component === "function" ? Component() : Component;
      await resolvePendingResources();
    });
    setLastSSRContext(context);

    const headHtml = runWithSSRContext(context, () => getSSRHead());
    if (options.shell !== false) {
      yield `<!DOCTYPE html><html><head>${headHtml}</head><body><div id="app">`;
    }
    const body = await runWithSSRContextAsync(context, async () => {
      resetResourceCounter();
      return String(typeof Component === "function" ? Component() : Component);
    });
    yield body;
    if (options.shell !== false) {
      yield `</div>${runWithSSRContext(context, () => dehydrate())}</body></html>`;
    }
  }

  if (typeof ReadableStream !== "undefined") {
    const iterator = generate();
    return new ReadableStream({
      async pull(controller) {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder ? encoder.encode(String(value)) : value);
      },
      cancel() {
        iterator.return?.();
      }
    });
  }

  return generate();
}

let islandSeq = 0;

/**
 * Island boundary for partial hydration.
 * @param {{ hydrate?: 'load'|'idle'|'visible'|'false', id?: string, children: any }} props
 */
export function Island(props) {
  const mode = props.hydrate || "load";
  const id = props.id || `island-${++islandSeq}`;

  if (typeof window === "undefined") {
    const children = typeof props.children === "function" ? props.children() : props.children;
    const inner = children instanceof SafeHTML ? children.toString() : String(children ?? "");
    return trustedHTML(
      `<div data-cachou-island="${id}" data-hydrate="${mode}">${inner}</div>`
    );
  }

  const container = document.createElement("div");
  container.setAttribute("data-cachou-island", id);
  container.setAttribute("data-hydrate", mode);

  const renderChildren = () => {
    let val = typeof props.children === "function" ? props.children() : props.children;
    const nodes = normalizeVal(val);
    container.replaceChildren(...nodes);
  };

  if (mode === "false" || mode === false) {
    // static — no client bindings beyond first paint content if SSR
    renderChildren();
    return container;
  }

  if (mode === "idle" && typeof requestIdleCallback === "function") {
    requestIdleCallback(() => {
      createRoot(() => {
        effect(renderChildren);
      });
    });
  } else if (mode === "visible" && typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect();
        createRoot(() => {
          effect(renderChildren);
        });
      }
    });
    io.observe(container);
  } else {
    createRoot(() => {
      effect(renderChildren);
    });
  }

  return container;
}

/**
 * Hydrate only marked islands within root (or document).
 */
export function hydrateIslands(root = typeof document !== "undefined" ? document : null, ComponentMap = {}) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const nodes = root.querySelectorAll("[data-cachou-island]");
  for (const node of nodes) {
    const id = node.getAttribute("data-cachou-island");
    const Comp = ComponentMap[id];
    if (typeof Comp !== "function") continue;
    const mode = node.getAttribute("data-hydrate") || "load";
    const run = () => {
      hydrate(Comp, node);
    };
    if (mode === "idle" && typeof requestIdleCallback === "function") {
      requestIdleCallback(run);
    } else if (mode === "visible" && typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      });
      io.observe(node);
    } else {
      run();
    }
  }
}
