/**
 * Lightweight in-page DevTools for CachouJS.
 * Not a full browser extension — a floating panel for local debugging.
 */
import {
  enableDebug,
  disableDebug,
  getDebugSnapshot,
  onFrameworkEvent,
  emitFrameworkEvent
} from "./reactivity.js";

const MAX_EVENTS = 80;
let panelEl = null;
let stopEvents = null;
let refreshTimer = null;
const eventLog = [];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function renderPanel() {
  if (!panelEl) return;
  const snap = getDebugSnapshot();
  const body = panelEl.querySelector("[data-cachou-dt-body]");
  if (!body) return;

  body.replaceChildren();

  const statsGrid = el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "8px", fontSize: "12px" } }, [
    el("div", {}, [document.createTextNode("Signals "), el("strong", { text: String(snap.signals) })]),
    el("div", {}, [document.createTextNode("Live computations "), el("strong", { text: String(snap.liveComputations) })]),
    el("div", {}, [document.createTextNode("Live roots "), el("strong", { text: String(snap.liveRoots) })]),
    el("div", {}, [document.createTextNode("Orphans "), el("strong", { text: String(snap.orphanComputations), style: { color: snap.orphanComputations ? "#f87171" : "inherit" } })])
  ]);
  body.appendChild(statsGrid);

  body.appendChild(el("div", { text: "Recent framework events", style: { fontSize: "11px", color: "#94a3b8", marginBottom: "4px" } }));

  const eventsContainer = el("div", { style: { maxHeight: "180px", overflow: "auto" } });
  const reversed = eventLog.slice().reverse();
  if (reversed.length === 0) {
    eventsContainer.appendChild(el("em", { text: "No events yet" }));
  } else {
    for (const e of reversed) {
      const t = new Date(e.time || Date.now()).toLocaleTimeString();
      eventsContainer.appendChild(
        el("div", { style: { padding: "4px 0", borderBottom: "1px solid #333", fontSize: "11px" } }, [
          el("span", { text: t, style: { color: "#94a3b8" } }),
          document.createTextNode(" "),
          el("strong", { text: e.type || "?", style: { color: "#5eead4" } }),
          document.createTextNode(" "),
          el("span", { text: summarize(e).slice(0, 120), style: { color: "#cbd5e1" } })
        ])
      );
    }
  }
  body.appendChild(eventsContainer);
}

function summarize(e) {
  if (e.message) return e.message;
  if (e.label) return e.label;
  if (e.error && e.error.message) return e.error.message;
  if (e.key) return String(e.key);
  if (e.duration != null) return `${Number(e.duration).toFixed(1)}ms`;
  return "";
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .slice(0, 120);
}

/**
 * Mount a floating debug panel.
 * @param {{ parent?: HTMLElement, enableDebugMode?: boolean, position?: string }} options
 * @returns {() => void} dispose
 */
export function mountDevtools(options = {}) {
  if (typeof document === "undefined") return () => {};
  if (panelEl) return () => unmountDevtools();

  if (options.enableDebugMode !== false) {
    enableDebug({ strict: false, slowEffectThresholdMs: 8 });
  }

  stopEvents = onFrameworkEvent(event => {
    eventLog.push(event);
    if (eventLog.length > MAX_EVENTS) eventLog.shift();
    renderPanel();
  });

  panelEl = el("div", {
    id: "cachou-devtools",
    style: {
      position: "fixed",
      zIndex: "2147483646",
      right: "12px",
      bottom: "12px",
      width: "320px",
      maxWidth: "calc(100vw - 24px)",
      background: "#0f172a",
      color: "#e2e8f0",
      border: "1px solid #334155",
      borderRadius: "10px",
      boxShadow: "0 12px 40px rgba(0,0,0,.45)",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      overflow: "hidden"
    }
  });

  const header = el("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 10px",
      background: "#134e4a",
      cursor: "move",
      userSelect: "none"
    }
  });
  header.appendChild(el("strong", { text: "Cachou DevTools", style: { fontSize: "12px" } }));
  const actions = el("div", { style: { display: "flex", gap: "6px" } });
  actions.appendChild(
    el("button", {
      type: "button",
      text: "Refresh",
      style: btnStyle(),
      onclick: () => renderPanel()
    })
  );
  actions.appendChild(
    el("button", {
      type: "button",
      text: "Clear",
      style: btnStyle(),
      onclick: () => {
        eventLog.length = 0;
        renderPanel();
      }
    })
  );
  actions.appendChild(
    el("button", {
      type: "button",
      text: "×",
      style: btnStyle(),
      onclick: () => unmountDevtools()
    })
  );
  header.appendChild(actions);
  panelEl.appendChild(header);
  panelEl.appendChild(
    el("div", {
      "data-cachou-dt-body": "1",
      style: { padding: "10px" }
    })
  );

  makeDraggable(panelEl, header);
  (options.parent || document.body).appendChild(panelEl);
  renderPanel();
  refreshTimer = setInterval(renderPanel, 1000);

  emitFrameworkEvent({ type: "devtools-open" });
  return () => unmountDevtools();
}

export function unmountDevtools() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (stopEvents) {
    stopEvents();
    stopEvents = null;
  }
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
  }
  emitFrameworkEvent({ type: "devtools-close" });
}

export function isDevtoolsOpen() {
  return Boolean(panelEl);
}

function btnStyle() {
  return {
    background: "#0f766e",
    color: "#fff",
    border: "0",
    borderRadius: "4px",
    padding: "2px 6px",
    fontSize: "11px",
    cursor: "pointer"
  };
}

function makeDraggable(panel, handle) {
  let ox = 0;
  let oy = 0;
  let dragging = false;
  handle.addEventListener("pointerdown", e => {
    dragging = true;
    ox = e.clientX - panel.getBoundingClientRect().left;
    oy = e.clientY - panel.getBoundingClientRect().top;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", e => {
    if (!dragging) return;
    panel.style.left = `${e.clientX - ox}px`;
    panel.style.top = `${e.clientY - oy}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  });
  handle.addEventListener("pointerup", () => {
    dragging = false;
  });
}

/** Keyboard helper: Ctrl+Shift+D toggles the panel */
export function installDevtoolsHotkey() {
  if (typeof window === "undefined") return () => {};
  const onKey = e => {
    if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
      e.preventDefault();
      if (isDevtoolsOpen()) unmountDevtools();
      else mountDevtools();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
