import { batch, createRoot, effect, emitFrameworkEvent, getOwner, onCleanup, resetResourceCounter, resetSSRHead, resolvePendingResources, createSSRContext, runWithSSRContext, runWithSSRContextAsync, setLastSSRContext, getSSRHead, dehydrate } from "./reactivity.js";
import { reconcile } from "./reconcile.js";
import { setSSRPath } from "./router-state.js";
import { applyDirective } from "./directives.js";
import { takeRequestEvent, beginSSRRender, endSSRRender } from "./ssr-context.js";
import { extractTraceparent, isTracingEnabled, runWithSpan, startSpan } from "./tracing.js";
import { addNodeCleanup, cleanupNode, activateCleanupTracking, hasActiveCleanupRegistrations, markAttachedChildrenCleanup, markAttachedNodeCleanup, markCleanupParents, needsCleanup, setCleanupEventReporter } from "./dom-cleanup.js";

setCleanupEventReporter(emitFrameworkEvent);

export { addNodeCleanup, cleanupNode } from "./dom-cleanup.js";

const templateShapeCache = new WeakMap();
const templateCaches = new WeakMap();
const ssrStaticTemplateCache = new WeakMap();
const weakMapFactory = () => new WeakMap();
const rootDisposers = new WeakMap();

function getDocumentCache(caches, doc, factory = weakMapFactory) {
  let cache = caches.get(doc);
  if (!cache) {
    cache = factory();
    caches.set(doc, cache);
  }
  return cache;
}

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
const blockedDataMimeTypes = new Set(["image/svg+xml", "text/html", "application/xhtml+xml", "text/javascript", "application/javascript"]);

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

function isNearestDisconnectedHandler(event, node, property) {
  let current = event.target;
  while (current && current !== node) {
    if (current[property]) return false;
    current = current.parentNode;
  }
  return current === node;
}

const urlAttributes = new Set([
  "href",
  "src",
  "srcset",
  "action",
  "formaction",
  "xlink:href",
  "data",
  "poster",
  "cite",
  "background",
  "manifest"
]);

const registeredEventsByDocument = new WeakMap();
const documentEventRegistryKey = typeof Symbol === "function" ? Symbol("cachouDelegatedEvents") : "__cachouDelegatedEvents";

function getRegisteredEvents(doc) {
  let events = doc[documentEventRegistryKey] || registeredEventsByDocument.get(doc);
  if (!events) {
    events = new Set();
    registeredEventsByDocument.set(doc, events);
    try {
      Object.defineProperty(doc, documentEventRegistryKey, { value: events, configurable: true });
    } catch {
      // Some host documents do not allow expando properties; WeakMap is enough there.
    }
  }
  return events;
}

function rootHasReactiveWork(disposeRoot) {
  const owner = disposeRoot && disposeRoot._owner;
  return Boolean(disposeRoot && (disposeRoot._debugTracked || (owner && ((owner.owned && owner.owned.size > 0) || (owner.cleanups && owner.cleanups.size > 0)))));
}

function clearContainer(root) {
  if (!root?.firstChild) return;
  if (typeof root.replaceChildren === "function") {
    root.replaceChildren();
  } else {
    root.textContent = "";
  }
}

const transitions = new WeakMap();

export function registerTransition(node, options) {
  activateCleanupTracking();
  transitions.set(node, options);
  markCleanupParents(node);
}

export function removeNodeWithTransition(node, onDone = null) {
  cleanupNode(node);
  removeNodeAfterCleanup(node, onDone);
}

function removeNodeAfterCleanup(node, onDone = null) {
  const trans = transitions.get(node);
  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    if (node.parentNode) node.remove();
    if (typeof onDone === "function") onDone();
  };
  if (trans && trans.leave) {
    try {
      const result = trans.leave(node, finish);
      const finished = result?.finished || result;
      if (finished && typeof finished.then === "function") {
        finished.then(finish, err => {
          emitFrameworkEvent({ type: "transition-error", node, error: err });
          finish();
        });
      }
    } catch (err) {
      emitFrameworkEvent({ type: "transition-error", node, error: err });
      finish();
    }
  } else {
    finish();
  }
}

/**
 * Dispose a group of removed siblings before applying the smallest possible
 * number of DOM mutations. Transitioned nodes remain on their individual
 * leave path; ordinary contiguous nodes can be deleted with one Range.
 */
export function removeNodesWithTransition(nodes) {
  const immediate = [];
  for (const node of nodes) {
    if (!node) continue;
    cleanupNode(node);
    if (transitions.get(node)?.leave) {
      removeNodeAfterCleanup(node);
    } else if (node.parentNode) {
      immediate.push(node);
    }
  }

  let first = null;
  let last = null;
  let parent = null;
  const flush = () => {
    if (!first) return;
    if (first === last) {
      first.remove();
    } else if (parent?.ownerDocument?.createRange) {
      const range = parent.ownerDocument.createRange();
      range.setStartBefore(first);
      range.setEndAfter(last);
      range.deleteContents();
    } else {
      let current = first;
      while (current) {
        const next = current.nextSibling;
        current.remove();
        if (current === last) break;
        current = next;
      }
    }
    first = null;
    last = null;
    parent = null;
  };

  for (const node of immediate) {
    const nodeParent = node.parentNode;
    if (!nodeParent || (parent && (nodeParent !== parent || last.nextSibling !== node))) {
      flush();
    }
    if (!nodeParent) continue;
    if (!first) {
      first = node;
      last = node;
      parent = nodeParent;
    } else {
      last = node;
    }
  }
  flush();
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
  if (val instanceof SafeHTML) {
    const template = document.createElement("template");
    template.innerHTML = val.toString();
    return Array.from(template.content.childNodes);
  }
  if (val instanceof DocumentFragment) {
    return Array.from(val.childNodes);
  }
  if (val instanceof Node) {
    return [val];
  }
  if (Array.isArray(val)) {
    // mapArray commonly returns a flat array of DOM nodes. Reusing it avoids
    // recursive normalization and a second allocation on every render.
    let isFlatNodeArray = true;
    for (let i = 0; i < val.length; i++) {
      const item = val[i];
      if (!(i in val) || !(item instanceof Node) || item.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        isFlatNodeArray = false;
        break;
      }
    }
    if (isFlatNodeArray) return val;

    const nodes = [];
    for (const item of val) {
      const normalized = normalizeVal(item);
      for (let i = 0; i < normalized.length; i++) nodes.push(normalized[i]);
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
  return urlAttributes.has(name.toLowerCase());
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
      if (blockedDataMimeTypes.has(mime)) return false;
      return securityPolicy.allowedDataMimeTypes.some(allowed => mime.startsWith(allowed));
    }
    return true;
  } catch (err) {
    return false;
  }
}

function sanitizeAttributeValue(name, value) {
  if (name.toLowerCase() === "srcset" && !isSafeSrcsetValue(value)) {
    warnSecurity("blocked unsafe srcset URL.", { attribute: name, value: String(value) });
    return null;
  }
  if (isURLAttribute(name) && !isSafeURLValue(value)) {
    warnSecurity(`blocked unsafe ${name} URL.`, { attribute: name, value: String(value) });
    return null;
  }
  return value;
}

function isSafeSrcsetValue(value) {
  const compact = String(value || "").replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
  if (!compact) return true;
  // srcset contains multiple URL candidates and optional descriptors. Scan
  // every explicit scheme so a later candidate cannot bypass the configured
  // protocol and data-MIME policy without pretending to fully parse the format.
  const protocols = compact.match(/[a-z][a-z0-9+.-]*:/g) || [];
  for (const protocol of protocols) {
    if (!securityPolicy.allowedURLProtocols.includes(protocol)) return false;
    if (protocol === "data:") {
      const dataMatch = compact.match(/data:([^,;]*)/);
      const mime = dataMatch?.[1] || "";
      if (blockedDataMimeTypes.has(mime) || !securityPolicy.allowedDataMimeTypes.some(allowed => mime.startsWith(allowed))) {
        return false;
      }
    }
  }
  return true;
}

function sanitizeStyleValue(value) {
  if (value === null || value === undefined) return "";
  if (!securityPolicy.allowInlineStyles) {
    warnSecurity("blocked inline style because the security policy disables inline styles.");
    return "";
  }
  const raw = String(value);
  const compact = raw.replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
  // Block classic CSS-based script gadgets and data: URLs in style sheets.
  if (
    compact.includes("javascript:") ||
    compact.includes("expression(") ||
    compact.includes("-moz-binding") ||
    compact.includes("behavior:") ||
    compact.includes("@import") ||
    /url\(\s*['"]?data:/i.test(compact)
  ) {
    warnSecurity("blocked unsafe style value.", { value: raw });
    return "";
  }
  return raw;
}

function isRawHTMLSink(name) {
  return name === "innerHTML" || name === "innerhtml" ||
    name === "outerHTML" || name === "outerhtml" || name === "srcdoc";
}

function sanitizeRawHTMLSink(name, value) {
  if (value === null || value === undefined || value === false) return value;
  if (value instanceof SafeHTML) return value.toString();
  warnSecurity(`blocked untrusted ${name} HTML sink; use trustedHTML() after sanitizing the value.`, { attribute: name });
  return null;
}

function normalizePropertyName(name) {
  if (name === "innerhtml") return "innerHTML";
  if (name === "outerhtml") return "outerHTML";
  return name;
}

function getSSRAttributeName(source) {
  const match = source.match(/(?:^|[\s<])([^\s"'=<>/]+)\s*=\s*$/);
  return match ? match[1].replace(/^\./, "").toLowerCase() : "";
}

/**
 * Unwrap nested view functions produced by Show/For/Switch/components for SSR.
 * Signals are read once (snapshot). Match markers are left alone.
 */
function unwrapSSRView(value, depth = 0) {
  if (depth > 64) return value;
  let current = value;
  for (let i = 0; i < 64; i++) {
    if (current == null || current === false || current === true) return current;
    if (typeof current !== "function") break;
    if (current.$$cachouMatch) return current;
    // Signal getters: snapshot once, then keep unwrapping if they returned a view.
    if (current.$$cachouSignal) {
      current = current();
      continue;
    }
    current = current();
  }
  if (Array.isArray(current)) {
    return current.map(item => unwrapSSRView(item, depth + 1));
  }
  return current;
}

function stringifySSRValue(value, isAttrValue) {
  const resolved = unwrapSSRView(value);
  if (resolved === null || resolved === undefined || resolved === false) {
    return "";
  }
  if (resolved instanceof SafeHTML) {
    return isAttrValue ? escapeAttribute(resolved.toString()) : resolved.toString();
  }
  if (Array.isArray(resolved)) {
    return resolved.map(item => stringifySSRValue(item, isAttrValue)).join("");
  }
  return isAttrValue ? escapeAttribute(resolved) : escapeHTML(resolved);
}

/**
 * Serialize a component tree to an HTML string for SSR.
 * Handles nested view functions (Show/For/Switch) and SafeHTML.
 */
function serializeSSRView(value) {
  const resolved = unwrapSSRView(value);
  if (resolved === null || resolved === undefined || resolved === false || resolved === true) {
    return "";
  }
  if (resolved instanceof SafeHTML) {
    return resolved.toString();
  }
  if (Array.isArray(resolved)) {
    return resolved.map(serializeSSRView).join("");
  }
  // Avoid printing function source if unwrap failed
  if (typeof resolved === "function") {
    return "";
  }
  if (typeof resolved === "object" && resolved !== null && resolved.nodeType) {
    // DOM nodes are not valid pure-SSR output
    return "";
  }
  return String(resolved);
}

/**
 * Mount a component/view into a DOM root. If the component returns a reactive
 * view function (Show/For/Switch style), keep it live with an effect.
 */
function insertRootView(root, view) {
  if (view == null || view === false) return null;

  // Reactive view function (not a bare signal — signals are read via unwrap once)
  if (
    typeof view === "function" &&
    !view.$$cachouSignal &&
    !view.$$cachouMatch
  ) {
    const anchor = document.createComment("cachou-root");
    root.appendChild(anchor);
    let currentNodes = [];
    effect(() => {
      currentNodes = updateChild(anchor, view(), currentNodes);
    });
    return anchor;
  }

  if (view.$$cachouSignal) {
    const anchor = document.createComment("cachou-root");
    root.appendChild(anchor);
    let currentNodes = [];
    effect(() => {
      currentNodes = updateChild(anchor, view(), currentNodes);
    });
    return anchor;
  }

  const nodes = normalizeVal(view);
  if (nodes.length === 0) return null;
  if (nodes.length === 1) {
    root.appendChild(nodes[0]);
    return nodes[0];
  }
  const fragment = document.createDocumentFragment();
  for (const node of nodes) fragment.appendChild(node);
  root.appendChild(fragment);
  return nodes[0] || null;
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
    removeNodesWithTransition(oldNodes);
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
    markAttachedNodeCleanup(newNodes[0]);
    return;
  }
  if (isOnlyChildAnchor(anchor) && typeof parent.replaceChildren === "function") {
    parent.replaceChildren(...newNodes);
    if (hasActiveCleanupRegistrations()) markAttachedChildrenCleanup(parent);
    return;
  }
  if (typeof anchor.replaceWith === "function") {
    anchor.replaceWith(...newNodes);
    if (hasActiveCleanupRegistrations()) markAttachedChildrenCleanup(parent);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const n of newNodes) {
    fragment.appendChild(n);
  }
  parent.insertBefore(fragment, anchor);
  if (hasActiveCleanupRegistrations()) markAttachedChildrenCleanup(parent);
  anchor.remove();
}

function isOnlyChildAnchor(anchor) {
  const parent = anchor.parentNode;
  return parent && parent.firstChild === anchor && parent.lastChild === anchor;
}

function bindValue(node, binding, values) {
  if (binding.type === "event") {
    const eventName = binding.name;
    const rawHandler = values[binding.index];
    // Only functions (or signal getters that yield functions) may be event handlers.
    // String "handlers" would become XSS if ever written as HTML attributes.
    if (
      rawHandler != null &&
      typeof rawHandler !== "function" &&
      !(rawHandler && rawHandler.$$cachouSignal)
    ) {
      warnSecurity("ignored non-function event handler.", { event: eventName });
      return;
    }
    if (delegatedEvents.has(eventName)) {
      // Static handlers are immutable for this node. Avoid an effect and its
      // cleanup allocation; signal-backed handlers retain reactive updates.
      const prop = "$$" + eventName;
      const handler = rawHandler;
      if (handler?.$$cachouSignal) {
        const current = handler();
        if (typeof current !== "function" && current != null) {
          warnSecurity("ignored non-function event handler from signal.", { event: eventName });
          node[prop] = null;
        } else {
          node[prop] = current;
        }
        const subscriber = value => {
          node[prop] = typeof value === "function" ? value : null;
        };
        handler.$$cachouSignal.subscribe(subscriber);
        addNodeCleanup(node, () => handler.$$cachouSignal.unsubscribe(subscriber));
      } else {
        node[prop] = typeof handler === "function" ? handler : null;
      }

      // 2. Local fallback listener to support event execution in disconnected DOM trees
      const disconnectedListener = (e) => {
        if (!node.isConnected && isNearestDisconnectedHandler(e, node, prop)) {
          batch(() => {
            let curr = e.target;
            while (curr) {
              const fn = curr[prop];
              if (fn) {
                fn.call(curr, e);
                if (e.cancelBubble) break;
              }
              curr = curr.parentNode;
            }
          });
        }
      };
      node.addEventListener(eventName, disconnectedListener);
      addNodeCleanup(node, () => node.removeEventListener(eventName, disconnectedListener));

      // 3. Set up global document listener if not yet registered
      const ownerDocument = node.ownerDocument || document;
      const eventDocument = ownerDocument.defaultView?.document || ownerDocument;
      const eventDocuments = new Set([eventDocument]);
      if (typeof document !== "undefined" && document !== eventDocument) {
        eventDocuments.add(document);
      }
      for (const targetDocument of eventDocuments) {
        const registeredEvents = getRegisteredEvents(targetDocument);
        if (!registeredEvents.has(eventName)) {
          registeredEvents.add(eventName);
          targetDocument.addEventListener(eventName, (e) => {
            const prop = "$$" + eventName;
            const path = typeof e.composedPath === "function"
              ? e.composedPath()
              : (() => {
                  const nodes = [];
                  let curr = e.target;
                  while (curr) {
                    nodes.push(curr);
                    if (curr === targetDocument) break;
                    curr = curr.parentNode;
                  }
                  return nodes;
                })();
            batch(() => {
              for (const curr of path) {
                if (curr === targetDocument) break;
                const handler = curr[prop];
                if (handler) {
                  handler.call(curr, e);
                  if (e.cancelBubble) break;
                }
              }
            });
          });
        }
      }
    } else {
      // Non-delegating fallback (e.g. scroll, play, load)
      const listener = (e) => {
        const handler = values[binding.index];
        if (typeof handler === "function") {
          batch(() => handler(e));
        }
      };
      node.addEventListener(eventName, listener);
      addNodeCleanup(node, () => node.removeEventListener(eventName, listener));
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
          assignValue(get());
          const subscriber = value => assignValue(value);
          get.$$cachouSignal.subscribe(subscriber);
          addNodeCleanup(node, () => {
            get.$$cachouSignal.unsubscribe(subscriber);
          });
        } else {
          const stop = effect(assignValue);
          addNodeCleanup(node, stop);
        }
        const eventName = prop === "checked" ? "change" : "input";
        const onInput = (e) => {
          set(prop === "checked" ? e.target.checked : e.target.value);
        };
        node.addEventListener(eventName, onInput);
        addNodeCleanup(node, () => node.removeEventListener(eventName, onInput));
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
        setClass(initialVal);
        return;
      }
      if (initialVal.$$cachouSignal) {
        setClass(initialVal());
        if (canAssignClassName && initialVal.$$cachouSignal.subscribeClass) {
          const binding = initialVal.$$cachouSignal.subscribeClass(node, className);
          addNodeCleanup(node, () => initialVal.$$cachouSignal.unsubscribeClass(binding));
        } else {
          initialVal.$$cachouSignal.subscribe(setClass);
          addNodeCleanup(node, () => initialVal.$$cachouSignal.unsubscribe(setClass));
        }
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
        addNodeCleanup(node, () => refVal(null, node));
      } else if (refVal && typeof refVal === "object") {
        refVal.current = node;
        addNodeCleanup(node, () => {
          if (refVal.current === node) refVal.current = null;
        });
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
      const subscriber = value => setAttributeBinding(node, name, isProp, value);
      initialVal.$$cachouSignal.subscribe(subscriber);
      addNodeCleanup(node, () => {
        initialVal.$$cachouSignal.unsubscribe(subscriber);
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
        const subscriber = value => {
          textNode.nodeValue = value ?? "";
        };
        initialVal.$$cachouSignal.subscribe(subscriber);
        addNodeCleanup(textOnlyParent, () => {
          initialVal.$$cachouSignal.unsubscribe(subscriber);
        });
        return;
      }
      currentNodes = updateChild(node, initialVal(), currentNodes);
      const subscriber = value => {
        currentNodes = updateChild(node, value, currentNodes);
      };
      initialVal.$$cachouSignal.subscribe(subscriber);
      addNodeCleanup(node, () => {
        initialVal.$$cachouSignal.unsubscribe(subscriber);
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
  const propertyName = isProp ? normalizePropertyName(name) : name;
  // Never materialize on* attributes as strings — they execute as JS in the DOM.
  if (/^on[a-z]/i.test(String(name).replace(/^\./, ""))) {
    warnSecurity("blocked inline on* attribute binding; use onclick=${fn} handlers instead.", {
      attribute: name
    });
    return;
  }
  if (isRawHTMLSink(name) || isRawHTMLSink(propertyName)) {
    const safeVal = sanitizeRawHTMLSink(name, val);
    if (safeVal === null || safeVal === undefined || safeVal === false) {
      if (isProp) node[propertyName] = "";
      else node.removeAttribute(name);
      return;
    }
    val = safeVal;
  }
  if (isProp) {
    if (propertyName.toLowerCase() === "style") {
      node[propertyName] = sanitizeStyleValue(val);
    } else if (isURLAttribute(propertyName) || isURLAttribute(name)) {
      node[propertyName] = sanitizeAttributeValue(propertyName, val) ?? "";
    } else {
      node[propertyName] = val;
    }
  } else if (name === "class") {
    node.className = val === null || val === undefined || val === false ? "" : String(val);
  } else {
    if (val === null || val === undefined || val === false) {
      node.removeAttribute(name);
    } else {
      const safeVal = name.toLowerCase() === "style"
        ? sanitizeStyleValue(val)
        : sanitizeAttributeValue(name, val);
      if (safeVal === null) {
        node.removeAttribute(name);
      } else {
        node.setAttribute(name, safeVal);
      }
    }
  }
}

export function html(strings) {
  const valueCount = strings.length - 1;
  if (typeof window === "undefined" || typeof document === "undefined" || !!globalThis.__MOCK_SSR__) {
    // Server-Side Rendering (SSR) mode
    if (valueCount === 0) {
      let cached = ssrStaticTemplateCache.get(strings);
      if (!cached) {
        cached = Object.freeze(new SafeHTML(strings[0]));
        ssrStaticTemplateCache.set(strings, cached);
      }
      return cached;
    }
    let htmlString = "";
    for (let i = 0; i < valueCount; i++) {
      const str = strings[i];
      htmlString += str;
      let val = arguments[i + 1];
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
          const attrName = getSSRAttributeName(str);
          if (isRawHTMLSink(attrName)) {
            val = sanitizeRawHTMLSink(attrName, val);
          } else if (isURLAttribute(attrName)) {
            val = sanitizeAttributeValue(attrName, val);
          } else if (attrName === "style") {
            val = sanitizeStyleValue(val);
          }
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

  const shape = getTemplateShape(strings);
  const tableRowRecord = shape.tableRowRecord;
  if (tableRowRecord && arePrimitiveTextArguments(arguments, valueCount)) {
    const tr = document.createElement("tr");
    if (tableRowRecord.emptyAffixes && valueCount === 2) {
      const firstCell = document.createElement("td");
      const secondCell = document.createElement("td");
      firstCell.textContent = arguments[1] ?? "";
      secondCell.textContent = arguments[2] ?? "";
      tr.append(firstCell, secondCell);
      return tr;
    }
    if (tableRowRecord.emptyAffixes) {
      for (let i = 0; i < valueCount; i++) {
        const cell = document.createElement("td");
        cell.textContent = arguments[i + 1] ?? "";
        tr.appendChild(cell);
      }
    } else {
      for (let i = 0; i < valueCount; i++) {
        const cell = document.createElement("td");
        cell.textContent = `${tableRowRecord.prefixes[i]}${arguments[i + 1] ?? ""}${tableRowRecord.suffixes[i]}`;
        tr.appendChild(cell);
      }
    }
    return tr;
  }

  let textElementRecord = shape.textElementRecord;
  if (textElementRecord === undefined) {
    textElementRecord = compileTextElementRecord(strings);
    shape.textElementRecord = textElementRecord;
  }
  if (textElementRecord && arePrimitiveTextArguments(arguments, valueCount)) {
    const el = document.createElement(textElementRecord.tagName);
    let text = textElementRecord.parts[0];
    for (let i = 0; i < valueCount; i++) {
      text += arguments[i + 1] ?? "";
      text += textElementRecord.parts[i + 1];
    }
    el.textContent = text;
    return el;
  }

  const simpleChildRecord = shape.simpleChildRecord;
  if (simpleChildRecord && !isHydrating) {
    const value = arguments[1];
    if (typeof value !== "function") {
      const el = document.createElement(simpleChildRecord.tagName);
      const nodes = normalizeVal(value);
      for (let i = 0; i < nodes.length; i++) {
        el.appendChild(nodes[i]);
        if (hasActiveCleanupRegistrations()) markAttachedNodeCleanup(nodes[i]);
      }
      return el;
    }
  }

  const templateCache = getDocumentCache(templateCaches, document);
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

  // A common compiled shape is one static child array inside an otherwise
  // static shell. Avoid the generic binding setup when no reactive value is
  // present; dynamic and hydrating paths retain the full machinery below.
  if (!isHydrating && record.bindings.length === 1 && record.bindings[0].type === "child") {
    const binding = record.bindings[0];
    const value = arguments[binding.index + 1];
    if (typeof value !== "function") {
      replaceStaticChild(getNodeByPath(fragment, binding.path), value);
      if (fragment.childNodes.length === 1) {
        return fragment.firstChild;
      }
      return fragment;
    }
  }

  const values = new Array(valueCount);
  for (let i = 0; i < valueCount; i++) {
    values[i] = arguments[i + 1];
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

const staticHTMLCaches = new WeakMap();

export function htmlStatic(markup) {
  if (typeof window === "undefined" || typeof document === "undefined" || !!globalThis.__MOCK_SSR__) {
    return new SafeHTML(String(markup));
  }
  const staticHTMLCache = getDocumentCache(staticHTMLCaches, document, () => new Map());
  let template = staticHTMLCache.get(markup);
  const templateDocument = template?.ownerDocument;
  if (!template || templateDocument?.URL !== document.URL) {
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

/**
 * Runtime boundary for compiler-emitted static DOM factories. The factory is
 * deliberately only evaluated in a browser; SSR still returns the exact
 * source markup so request rendering and hydration keep one representation.
 */
export function createCompiledStatic(markup, factory) {
  if (typeof window === "undefined" || typeof document === "undefined" || !!globalThis.__MOCK_SSR__) {
    return new SafeHTML(String(markup));
  }
  return typeof factory === "function" ? factory() : htmlStatic(markup);
}

function compileTableRowRecord(strings) {
  if (!strings[0].match(/^<tr><td>$/i) || !strings[strings.length - 1].match(/^<\/td><\/tr>$/i)) {
    return null;
  }
  const prefixes = [""];
  const suffixes = [];
  for (let i = 1; i < strings.length - 1; i++) {
    const match = strings[i].match(/^(.*)<\/td><td>(.*)$/i);
    if (!match || match[1].includes("<") || match[2].includes(">")) {
      return null;
    }
    suffixes.push(match[1]);
    prefixes.push(match[2]);
  }
  suffixes.push("");
  const emptyAffixes = prefixes.every(prefix => prefix === "") && suffixes.every(suffix => suffix === "");
  return { prefixes, suffixes, emptyAffixes };
}

function arePrimitiveTextArguments(args, valueCount) {
  for (let i = 0; i < valueCount; i++) {
    const value = args[i + 1];
    if (value === null || value === undefined) continue;
    const type = typeof value;
    if (type !== "string" && type !== "number" && type !== "boolean" && type !== "bigint") {
      return false;
    }
  }
  return true;
}

function compileTextElementRecord(strings) {
  const first = strings[0];
  const last = strings[strings.length - 1];
  const open = first.match(/^<([a-z][a-z0-9-]*)>$/i);
  const close = last.match(new RegExp(`^(.*)</${open ? open[1] : ""}>$`, "i"));
  if (!open || !close) {
    return null;
  }
  const tagName = open[1];
  const parts = [""];
  for (let i = 1; i < strings.length - 1; i++) {
    if (strings[i].includes("<") || strings[i].includes(">")) {
      return null;
    }
    parts.push(strings[i]);
  }
  if (close[1].includes("<") || close[1].includes(">")) {
    return null;
  }
  parts.push(close[1]);
  return { tagName, parts };
}

function compileSimpleChildRecord(strings) {
  if (strings.length !== 2) return null;
  const open = strings[0].match(/^<([a-z][a-z0-9-]*)>$/i);
  if (!open || strings[1].toLowerCase() !== `</${open[1].toLowerCase()}>`) return null;
  return { tagName: open[1] };
}

function getTemplateShape(strings) {
  let shape = templateShapeCache.get(strings);
  if (!shape) {
    shape = {
      tableRowRecord: compileTableRowRecord(strings),
      textElementRecord: undefined,
      simpleChildRecord: compileSimpleChildRecord(strings)
    };
    templateShapeCache.set(strings, shape);
  }
  return shape;
}

let isHydrating = false;

function warnHydration(message) {
  emitFrameworkEvent({ type: "hydration-mismatch", message });
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`⚡ [CachouJS Hydration]: ${message}`);
  }
}

function hydrateMergedTextBinding(clientNode, serverParent, existingServerText = null) {
  const deferred = clientNode?.$$deferredBindings;
  if (!deferred || deferred.length !== 1 || deferred[0].binding.type !== "child") return false;

  const previous = clientNode.previousSibling;
  const next = clientNode.nextSibling;
  const hasTextBoundary = previous?.nodeType === Node.TEXT_NODE || next?.nodeType === Node.TEXT_NODE;
  if (!hasTextBoundary) return false;

  const prefix = previous?.nodeType === Node.TEXT_NODE ? previous.nodeValue : "";
  const suffix = next?.nodeType === Node.TEXT_NODE ? next.nodeValue : "";
  const candidates = existingServerText
    ? [existingServerText]
    : Array.from(serverParent.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
  const matches = candidates.filter(node => {
    const value = node.nodeValue || "";
    return value.length >= prefix.length + suffix.length && value.startsWith(prefix) && value.endsWith(suffix);
  });
  if (matches.length !== 1) return false;
  const serverText = matches[0];

  const raw = serverText.nodeValue || "";
  const dynamicText = raw.slice(prefix.length, raw.length - suffix.length);
  const fragment = serverParent.ownerDocument.createDocumentFragment();
  if (prefix) fragment.appendChild(serverParent.ownerDocument.createTextNode(prefix));
  const dynamicNode = serverParent.ownerDocument.createTextNode(dynamicText);
  fragment.appendChild(dynamicNode);
  if (suffix) fragment.appendChild(serverParent.ownerDocument.createTextNode(suffix));
  serverText.replaceWith(fragment);

  const { binding, values } = deferred[0];
  bindValue(dynamicNode, binding, values);
  delete clientNode.$$deferredBindings;
  return dynamicNode;
}

function invokeSSRComponent(Component, data, hasPreload) {
  if (typeof Component !== "function") return Component;
  return hasPreload ? Component(data) : Component();
}

function startSSRSpan(mode, context, options = {}) {
  if (!isTracingEnabled()) return startSpan(`cachou.ssr.${mode}`);
  return startSpan(`cachou.ssr.${mode}`, {
    traceparent: options.traceparent || extractTraceparent(context.request),
    attributes: {
      mode,
      path: options.path || context.path || "/"
    }
  });
}

export function hydrate(Component, root) {
  const traceSpan = startSpan("cachou.hydration", {
    attributes: { hasServerRoot: Boolean(root?.firstChild) }
  });
  const prevDispose = rootDisposers.get(root);
  if (prevDispose) {
    prevDispose();
    rootDisposers.delete(root);
  }
  if (needsCleanup(root)) {
    cleanupNode(root);
  }

  resetResourceCounter();
  isHydrating = true;
  let clientRoot;
  let disposeRoot;
  try {
    clientRoot = runWithSpan(traceSpan, () => createRoot((dispose) => {
      disposeRoot = dispose;
      let view = typeof Component === "function" ? Component() : Component;
      // Unwrap Show/For/Switch view functions so the client tree is real DOM
      // for structural comparison with the server markup.
      view = unwrapSSRView(view);
      if (Array.isArray(view)) {
        const frag = document.createDocumentFragment();
        for (const node of normalizeVal(view)) frag.appendChild(node);
        return frag;
      }
      if (view instanceof SafeHTML) {
        const template = document.createElement("template");
        template.innerHTML = view.toString();
        return template.content;
      }
      return view;
    }));
  } catch (error) {
    traceSpan.recordException(error).setStatus({ code: "ERROR", message: "hydration setup failed" }).end();
    throw error;
  } finally {
    isHydrating = false;
  }
  if (rootHasReactiveWork(disposeRoot)) {
    rootDisposers.set(root, disposeRoot);
    // Hydrated roots can be removed by a parent keyed/conditional update, so
    // their owner must be tied to the same node cleanup path as bindings.
    addNodeCleanup(root, () => {
      if (rootDisposers.get(root) === disposeRoot) {
        rootDisposers.delete(root);
      }
      disposeRoot();
    });
  }
  let mismatchDetected = false;
  const reportHydrationMismatch = (message) => {
    mismatchDetected = true;
    warnHydration(message);
  };

  function walkAndHydrate(clientNode, serverNode) {
    if (!clientNode || !serverNode) {
      reportHydrationMismatch("Client and server DOM structure differ.");
      return;
    }

    if (
      clientNode.nodeType === Node.COMMENT_NODE &&
      clientNode.$$deferredBindings &&
      serverNode.nodeType === Node.TEXT_NODE &&
      serverNode.parentNode &&
      hydrateMergedTextBinding(clientNode, serverNode.parentNode, serverNode)
    ) {
      return;
    }

    if (clientNode.nodeType !== serverNode.nodeType) {
      reportHydrationMismatch(`Node type mismatch: expected ${clientNode.nodeType}, found ${serverNode.nodeType}.`);
      return;
    } else if (
      clientNode.nodeType === Node.ELEMENT_NODE &&
      serverNode.nodeType === Node.ELEMENT_NODE &&
      clientNode.nodeName !== serverNode.nodeName
    ) {
      reportHydrationMismatch(`Element mismatch: expected <${clientNode.nodeName.toLowerCase()}>, found <${serverNode.nodeName.toLowerCase()}>.`);
      return;
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
              delete clientNode.$$deferredBindings;
              return;
            } else {
              for (const n of newNodes) {
                parent.insertBefore(n, serverNode);
              }
              serverNode.remove();
              for (const n of newNodes) {
                walkAndHydrate(n, n);
              }
              delete clientNode.$$deferredBindings;
              return;
            }
          }
        }
      }

      for (const { binding, values } of clientNode.$$deferredBindings) {
        bindValue(serverNode, binding, values);
      }
      delete clientNode.$$deferredBindings;
    }

    let clientChild = clientNode.firstChild;
    let serverChild = serverNode.firstChild;

    while (clientChild) {
      if (clientChild.$$deferredBindings && serverChild?.nodeType === Node.TEXT_NODE) {
        const dynamicNode = hydrateMergedTextBinding(clientChild, serverNode, serverChild);
        if (dynamicNode) {
          serverChild = dynamicNode.nextSibling;
          clientChild = clientChild.nextSibling;
          continue;
        }
      }
      if (!serverChild) {
        const dynamicNode = hydrateMergedTextBinding(clientChild, serverNode);
        if (dynamicNode) {
          serverChild = dynamicNode.nextSibling;
          clientChild = clientChild.nextSibling;
          continue;
        }
      }
      walkAndHydrate(clientChild, serverChild);
      clientChild = clientChild.nextSibling;
      serverChild = serverChild ? serverChild.nextSibling : null;
    }

    if (serverChild) {
      reportHydrationMismatch("Server DOM contains extra nodes not present in the client template.");
    }
  }

  let serverStart = root.firstChild || root;
  if (clientRoot instanceof Element) {
    serverStart = root.firstElementChild || serverStart;
  }
  try {
    runWithSpan(traceSpan, () => walkAndHydrate(clientRoot, serverStart));
    if (mismatchDetected) {
      if (rootDisposers.get(root) === disposeRoot) {
        rootDisposers.delete(root);
      }
      disposeRoot?.();
      if (needsCleanup(root)) cleanupNode(root);
      clearContainer(root);
      mount(Component, root);
    }
    traceSpan.setStatus({ code: "OK" });
  } catch (error) {
    if (rootDisposers.get(root) === disposeRoot) {
      rootDisposers.delete(root);
    }
    disposeRoot?.();
    if (needsCleanup(root)) {
      cleanupNode(root);
    }
    traceSpan.recordException(error).setStatus({ code: "ERROR", message: "hydration failed" });
    throw error;
  } finally {
    traceSpan.end();
  }
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
  clearContainer(root);
  let disposeRoot;
  createRoot((dispose) => {
    disposeRoot = dispose;
    const view = typeof Component === "function" ? Component() : Component;
    insertRootView(root, view);
  });
  if (rootHasReactiveWork(disposeRoot)) {
    rootDisposers.set(root, disposeRoot);
  }
  markAttachedChildrenCleanup(root);
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
  clearContainer(root);

  let disposeRoot;
  createRoot((dispose) => {
    disposeRoot = dispose;
    const view = typeof Component === "function" ? Component() : Component;
    insertRootView(root, view);
  });
  const hasReactiveWork = rootHasReactiveWork(disposeRoot);
  if (hasReactiveWork) {
    rootDisposers.set(root, disposeRoot);
  }
  markAttachedChildrenCleanup(root);

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
    clearContainer(root);
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
  clearContainer(root);
}

function throwIfSSRAborted(signal, stage) {
  if (!signal?.aborted) return;
  const error = new Error(`SSR render aborted during ${stage}.`);
  error.name = "AbortError";
  throw error;
}

export function renderToString(Component, options = {}) {
  const context = options.context || createSSRContext();
  context.request = options.request !== undefined ? options.request : (context.request ?? takeRequestEvent());
  beginSSRRender(context);
  const traceSpan = startSSRSpan("string", context, options);
  let disposeRoot;
  let completed = false;
  const startedAt = Date.now();
  try {
    const html = runWithSpan(traceSpan, () => runWithSSRContext(context, () => {
      emitFrameworkEvent({ type: "ssr-start", mode: "string" });
      resetResourceCounter();
      resetSSRHead();
      const output = serializeSSRView(createRoot(dispose => {
        disposeRoot = dispose;
        return typeof Component === "function" ? Component() : Component;
      }));
      emitFrameworkEvent({ type: "ssr-complete", mode: "string", durationMs: Date.now() - startedAt, bytes: output.length, passes: 1 });
      return output;
    }));
    traceSpan.setStatus({ code: "OK" }).setAttributes({ bytes: html.length, passes: 1 });
    completed = true;
    return html;
  } catch (error) {
    traceSpan.recordException(error).setStatus({ code: "ERROR", message: "SSR render failed" });
    runWithSpan(traceSpan, () => runWithSSRContext(context, () => emitFrameworkEvent({ type: "ssr-error", mode: "string", stage: "render", durationMs: Date.now() - startedAt, error })));
    throw error;
  } finally {
    endSSRRender(context);
    if (completed) setLastSSRContext(context);
    disposeRoot?.();
    traceSpan.end();
  }
}

export async function renderToStringAsync(Component, options = {}) {
  const context = options.context || createSSRContext();
  if (options.signal !== undefined) context.signal = options.signal || null;
  if (options.request !== undefined) {
    context.request = options.request;
  } else if (context.request === null || context.request === undefined) {
    context.request = takeRequestEvent();
  }
  beginSSRRender(context);
  const traceSpan = startSSRSpan("string-async", context, options);
  let disposeRoot;
  let completed = false;
  const startedAt = Date.now();
  const hasPreload = typeof options.preload === "function";
  let stage = "setup";
  try {
    const html = await runWithSpan(traceSpan, () => runWithSSRContextAsync(context, async () => {
      emitFrameworkEvent({ type: "ssr-start", mode: "string-async" });
      throwIfSSRAborted(context.signal, "render");
      resetSSRHead();
      if (options.path) {
        setSSRPath(options.path);
      }
      resetResourceCounter();
      stage = hasPreload ? "preload" : "render-initial";
      const preloadedData = hasPreload
        ? await options.preload({ request: context.request, signal: context.signal })
        : undefined;
      throwIfSSRAborted(context.signal, hasPreload ? "preload" : "render");
      resetResourceCounter();
      const firstPass = serializeSSRView(createRoot(dispose => {
        disposeRoot = dispose;
        return invokeSSRComponent(Component, preloadedData, hasPreload);
      }));
      throwIfSSRAborted(context.signal, "render-initial");

      // Static pages and cache hits are complete after one pass. This is the
      // common fast path and avoids executing the component tree twice.
      if (context.pendingResources.size === 0 && context.resourcesStarted === 0) {
        emitFrameworkEvent({ type: "ssr-complete", mode: "string-async", durationMs: Date.now() - startedAt, bytes: firstPass.length, passes: 1 });
        return firstPass;
      }

      stage = "resources";
      emitFrameworkEvent({ type: "ssr-resources", mode: "string-async", pending: context.pendingResources.size });
      await resolvePendingResources(context.signal);
      if (context.signal?.aborted) {
        emitFrameworkEvent({ type: "ssr-abort", mode: "string-async", stage: "resources", durationMs: Date.now() - startedAt });
        throwIfSSRAborted(context.signal, "resources");
      }
      // The initial tree only exists to discover async resources. Dispose it
      // before the final pass so its effects, subscriptions, and cleanups do
      // not overlap the output tree or extend request retention.
      disposeRoot?.();
      disposeRoot = null;
      stage = "render-final";
      resetSSRHead();
      resetResourceCounter();
      const output = serializeSSRView(createRoot(dispose => {
        disposeRoot = dispose;
        return invokeSSRComponent(Component, preloadedData, hasPreload);
      }));
      throwIfSSRAborted(context.signal, "render-final");
      emitFrameworkEvent({ type: "ssr-complete", mode: "string-async", durationMs: Date.now() - startedAt, bytes: output.length, passes: 2 });
      return output;
    }));
    traceSpan.setStatus({ code: "OK" }).setAttributes({ bytes: html.length });
    completed = true;
    return html;
  } catch (error) {
    traceSpan.recordException(error).setStatus({ code: "ERROR", message: `SSR ${stage} failed` });
    runWithSpan(traceSpan, () => runWithSSRContext(context, () => emitFrameworkEvent({ type: "ssr-error", mode: "string-async", stage, durationMs: Date.now() - startedAt, error })));
    throw error;
  } finally {
    endSSRRender(context);
    if (completed) setLastSSRContext(context);
    disposeRoot?.();
    traceSpan.end();
  }
}

/**
 * Streaming SSR.
 *
 * Default (`progressive: true`): stream a first-paint shell with the discovery
 * pass body (loading UI), then after resources resolve stream a final body swap
 * via a nonced template + small script so TTFB stays low without out-of-order
 * chunk protocols.
 *
 * Set `progressive: false` for the classic two-pass document (open head → wait
 * → final head+body) used by older callers.
 *
 * Returns a ReadableStream of UTF-8 text chunks when available, else async iterable.
 */
export function renderToStream(Component, options = {}) {
  const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  const streamAbortController = typeof AbortController !== "undefined" ? new AbortController() : null;
  const streamContext = options.context || createSSRContext();
  const externalSignal = options.signal !== undefined ? options.signal : streamContext.signal;
  streamContext.signal = streamAbortController?.signal || externalSignal || null;
  if (options.request !== undefined) {
    streamContext.request = options.request;
  } else if (streamContext.request === null || streamContext.request === undefined) {
    streamContext.request = takeRequestEvent();
  }

  async function* generate() {
    const context = streamContext;
    let disposeRoot;
    let completed = false;
    let initialBody = "";
    const startedAt = Date.now();
    const traceSpan = startSSRSpan("stream", context, options);
    const hasPreload = typeof options.preload === "function";
    let preloadedData;
    let stage = "setup";
    let abortLogged = false;
    let removeExternalAbortListener = null;
    if (externalSignal && streamAbortController) {
      const abortStream = () => streamAbortController.abort();
      if (externalSignal.aborted) {
        streamAbortController.abort();
      } else {
        externalSignal.addEventListener("abort", abortStream, { once: true });
        removeExternalAbortListener = () => externalSignal.removeEventListener("abort", abortStream);
      }
    }
    beginSSRRender(context);
    try {
      await runWithSpan(traceSpan, () => runWithSSRContextAsync(context, async () => {
        emitFrameworkEvent({ type: "ssr-start", mode: "stream" });
        throwIfSSRAborted(context.signal, "render");
        resetSSRHead();
        if (options.path) setSSRPath(options.path);
        resetResourceCounter();
        stage = hasPreload ? "preload" : "render-initial";
        if (hasPreload) {
          preloadedData = await options.preload({ request: context.request, signal: context.signal });
          if (context.signal?.aborted) {
            const error = new Error("SSR stream aborted during preload.");
            error.name = "AbortError";
            throw error;
          }
        }
        resetResourceCounter();
        initialBody = serializeSSRView(createRoot(dispose => {
          disposeRoot = dispose;
          return invokeSSRComponent(Component, preloadedData, hasPreload);
        }));
        throwIfSSRAborted(context.signal, "render-initial");
      }));

      const headHtml = runWithSpan(traceSpan, () => runWithSSRContext(context, () => getSSRHead()));
      const hasPendingResources = context.pendingResources.size > 0 || context.resourcesStarted > 0;
      const progressive = options.progressive !== false;
      const nonce =
        typeof options.nonce === "string" && /^[A-Za-z0-9+/=_-]+$/.test(options.nonce)
          ? options.nonce
          : "";
      const nonceAttr = nonce ? ` nonce="${nonce}"` : "";

      if (!hasPendingResources) {
        if (options.shell !== false) {
          yield `<!DOCTYPE html><html><head>${headHtml}</head><body><div id="app">`;
          yield initialBody;
          yield `</div>${runWithSSRContext(context, () => dehydrate(context, { nonce }))}</body></html>`;
        } else {
          yield initialBody;
        }
        completed = true;
        traceSpan.setStatus({ code: "OK" }).setAttributes({ bytes: initialBody.length, passes: 1 });
        runWithSpan(traceSpan, () => runWithSSRContext(context, () => emitFrameworkEvent({ type: "ssr-complete", mode: "stream", durationMs: Date.now() - startedAt, bytes: initialBody.length, passes: 1 })));
        return;
      }

      // Progressive path: stream first-paint shell (loading UI + islands SSR) ASAP.
      if (options.shell !== false && progressive) {
        yield `<!DOCTYPE html><html><head>${headHtml}</head><body><div id="app">${initialBody}</div>`;
      } else if (options.shell !== false) {
        yield `<!DOCTYPE html><html><head>`;
      }

      stage = "resources";
      runWithSpan(traceSpan, () => runWithSSRContext(context, () => emitFrameworkEvent({ type: "ssr-resources", mode: "stream", pending: context.pendingResources.size })));
      await runWithSSRContextAsync(context, async () => {
        await resolvePendingResources(context.signal);
      });
      if (context.signal?.aborted) {
        abortLogged = true;
        traceSpan.setStatus({ code: "UNSET", message: "stream aborted" });
        runWithSpan(traceSpan, () => runWithSSRContext(context, () => emitFrameworkEvent({ type: "ssr-abort", mode: "stream", stage: "resources", durationMs: Date.now() - startedAt })));
        return;
      }

      stage = "render-final";
      disposeRoot?.();
      disposeRoot = null;
      const body = await runWithSpan(traceSpan, () => runWithSSRContextAsync(context, async () => {
        resetSSRHead();
        resetResourceCounter();
        return serializeSSRView(createRoot(dispose => {
          disposeRoot = dispose;
          return invokeSSRComponent(Component, preloadedData, hasPreload);
        }));
      }));
      const stateScript = runWithSSRContext(context, () => dehydrate(context, { nonce }));
      const finalHeadHtml = runWithSpan(traceSpan, () => runWithSSRContext(context, () => getSSRHead()));
      if (options.shell !== false && progressive) {
        // Progressive swap: first paint already streamed; replace #app and refresh head.
        // JSON encoding avoids breaking out of the script context.
        yield `<script${nonceAttr}>(function(){var a=document.getElementById("app");if(a)a.innerHTML=${JSON.stringify(body)};var h=${JSON.stringify(finalHeadHtml)};if(h){var d=document.createElement("div");d.innerHTML=h;Array.prototype.forEach.call(d.childNodes,function(n){if(n.nodeName==="TITLE"){document.title=n.textContent||"";}else if(n.nodeType===1){var sel=n.getAttribute&&n.getAttribute("name")?"meta[name=\\""+n.getAttribute("name")+"\\"]":n.getAttribute&&n.getAttribute("property")?"meta[property=\\""+n.getAttribute("property")+"\\"]":null;if(sel){var old=document.head.querySelector(sel);if(old)old.remove();}document.head.appendChild(n);}});}})();</script>`;
        yield `${stateScript}</body></html>`;
      } else if (options.shell !== false) {
        yield `${finalHeadHtml}</head><body><div id="app">${body}</div>${stateScript}</body></html>`;
      } else {
        yield body;
      }
      completed = true;
      traceSpan.setStatus({ code: "OK" }).setAttributes({ bytes: body.length, passes: 2, progressive: progressive === true });
      runWithSpan(traceSpan, () => runWithSSRContext(context, () => emitFrameworkEvent({ type: "ssr-complete", mode: "stream", durationMs: Date.now() - startedAt, bytes: body.length, passes: 2 })));
    } catch (error) {
      traceSpan.recordException(error).setStatus({ code: "ERROR", message: `SSR ${stage} failed` });
      runWithSpan(traceSpan, () => runWithSSRContext(context, () => emitFrameworkEvent({ type: "ssr-error", mode: "stream", stage: context.signal?.aborted ? "abort" : stage, durationMs: Date.now() - startedAt, error })));
      throw error;
    } finally {
      endSSRRender(context);
      if (completed) setLastSSRContext(context);
      removeExternalAbortListener?.();
      if (!completed && context.signal?.aborted && !abortLogged) {
        traceSpan.setStatus({ code: "UNSET", message: "stream cancelled" });
        runWithSpan(traceSpan, () => runWithSSRContext(context, () => emitFrameworkEvent({ type: "ssr-abort", mode: "stream", stage: "cancelled", durationMs: Date.now() - startedAt })));
      }
      disposeRoot?.();
      streamAbortController?.abort();
      traceSpan.end();
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
      async cancel() {
        streamAbortController?.abort();
        await iterator.return?.();
      }
    });
  }

  return generate();
}

let islandSeq = 0;
const islandHydrateModes = new Set(["load", "idle", "visible", "false"]);

function normalizeIslandMode(value) {
  if (value === false || value === "false") return "false";
  return islandHydrateModes.has(value) ? value : "load";
}

/**
 * Island boundary for partial hydration.
 * @param {{
 *   hydrate?: 'load'|'idle'|'visible'|'false',
 *   id?: string,
 *   children: any,
 *   fallback?: any
 * }} props
 * `fallback` is rendered on the server (and as static content before client hydrate)
 * when you want a lightweight placeholder distinct from the interactive children.
 */
export function Island(props) {
  const mode = normalizeIslandMode(props.hydrate);
  const id = props.id || `island-${++islandSeq}`;

  if (typeof window === "undefined") {
    const hasFallback = props.fallback != null;
    const children = hasFallback
      ? (typeof props.fallback === "function" ? props.fallback() : props.fallback)
      : (typeof props.children === "function" ? props.children() : props.children);
    // Route metadata and children through the normal SSR escaping rules. A
    // SafeHTML child remains trusted, while strings and attributes do not.
    return html`<div data-cachou-island=${id} data-hydrate=${mode}>${children}</div>`;
  }

  const container = document.createElement("div");
  container.setAttribute("data-cachou-island", id);
  container.setAttribute("data-hydrate", mode);

  let currentNodes = [];
  let disposeIslandRoot = null;
  let idleHandle = null;
  let idleTimer = null;
  let observer = null;
  let disposed = false;

  const renderChildren = () => {
    if (disposed) return;
    let val = typeof props.children === "function" ? props.children() : props.children;
    const nextNodes = normalizeVal(val);
    reconcile(container, currentNodes, nextNodes, null);
    currentNodes = nextNodes;
    markAttachedChildrenCleanup(container);
  };

  const disposeIsland = () => {
    if (disposed) return;
    disposed = true;
    if (idleHandle !== null && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(idleHandle);
      idleHandle = null;
    }
    if (idleTimer != null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    observer?.disconnect();
    observer = null;
    disposeIslandRoot?.();
    disposeIslandRoot = null;
    for (const node of currentNodes) cleanupNode(node);
    currentNodes = [];
  };

  addNodeCleanup(container, disposeIsland);
  if (getOwner()) onCleanup(disposeIsland);

  const startReactiveIsland = () => {
    if (disposed || disposeIslandRoot) return;
    createRoot(dispose => {
      disposeIslandRoot = dispose;
      effect(renderChildren);
    });
  };

  if (mode === "false" || mode === false) {
    // static — no client bindings beyond first paint content if SSR
    renderChildren();
    return container;
  }

  if (mode === "idle") {
    if (typeof requestIdleCallback === "function") {
      idleHandle = requestIdleCallback(() => {
        idleHandle = null;
        startReactiveIsland();
      }, { timeout: 2000 });
    } else {
      idleTimer = setTimeout(() => {
        idleTimer = null;
        startReactiveIsland();
      }, 1);
    }
  } else if (mode === "visible" && typeof IntersectionObserver === "function") {
    observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          observer?.disconnect();
          observer = null;
          startReactiveIsland();
        }
      },
      { root: null, rootMargin: "100px", threshold: 0 }
    );
    observer.observe(container);
  } else {
    startReactiveIsland();
  }

  return container;
}

/**
 * Hydrate only marked islands within root (or document).
 * @param {ParentNode | null} [root]
 * @param {Record<string, Function>} [ComponentMap] id → component
 * @param {{
 *   onError?: (err: Error, id: string, node: Element) => void,
 *   rootMargin?: string
 * }} [options]
 * @returns {() => void} disposer
 */
export function hydrateIslands(
  root = typeof document !== "undefined" ? document : null,
  ComponentMap = {},
  options = {}
) {
  if (!root || typeof root.querySelectorAll !== "function") return () => {};
  const nodes = root.querySelectorAll("[data-cachou-island]");
  const records = new Set();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const cancel of records) cancel();
  };
  for (const node of nodes) {
    const id = node.getAttribute("data-cachou-island");
    const Comp = ComponentMap[id];
    if (typeof Comp !== "function") continue;
    const mode = normalizeIslandMode(node.getAttribute("data-hydrate"));
    let hydrated = false;
    let observer = null;
    let idleHandle = null;
    let idleTimer = null;
    const cancel = () => {
      if (idleHandle !== null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleHandle);
        idleHandle = null;
      }
      if (idleTimer != null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      observer?.disconnect();
      observer = null;
      if (hydrated) {
        const disposeRoot = rootDisposers.get(node);
        disposeRoot?.();
        rootDisposers.delete(node);
        cleanupNode(node);
      }
    };
    records.add(cancel);
    addNodeCleanup(node, cancel);
    const run = () => {
      if (disposed || hydrated || (!node.isConnected && !root.contains?.(node))) {
        cancel();
        return;
      }
      hydrated = true;
      try {
        hydrate(Comp, node);
      } catch (err) {
        if (typeof options.onError === "function") {
          try {
            options.onError(err, id, node);
          } catch {
            // never throw from island error reporter
          }
        } else if (typeof console !== "undefined" && typeof console.error === "function") {
          console.error(`⚡ [CachouJS Island]: failed to hydrate "${id}"`, err);
        }
      }
    };
    if (mode === "idle") {
      if (typeof requestIdleCallback === "function") {
        idleHandle = requestIdleCallback(() => {
          idleHandle = null;
          run();
        }, { timeout: 2000 });
      } else {
        idleTimer = setTimeout(() => {
          idleTimer = null;
          run();
        }, 1);
      }
    } else if (mode === "visible" && typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(
        entries => {
          if (entries.some(e => e.isIntersecting)) {
            observer?.disconnect();
            observer = null;
            run();
          }
        },
        { rootMargin: options.rootMargin || "100px", threshold: 0 }
      );
      observer.observe(node);
    } else {
      run();
    }
  }
  return dispose;
}
