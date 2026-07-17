const nodeCleanups = new WeakMap();
const cleanupParents = new WeakSet();
const cleaningNodes = new WeakSet();
let cleanupTrackingActivated = false;
let activeCleanupCount = 0;
let reportCleanupEvent = null;

export function setCleanupEventReporter(reporter) {
  reportCleanupEvent = typeof reporter === "function" ? reporter : null;
}

export function activateCleanupTracking() {
  cleanupTrackingActivated = true;
}

export function isCleanupTrackingActivated() {
  return cleanupTrackingActivated;
}

export function hasActiveCleanupRegistrations() {
  return activeCleanupCount > 0;
}

export function addNodeCleanup(node, cleanupFn) {
  activateCleanupTracking();
  let cleanups = nodeCleanups.get(node);
  if (!cleanups) {
    cleanups = [];
    nodeCleanups.set(node, cleanups);
    markCleanupParents(node);
  }
  cleanups.push(cleanupFn);
  activeCleanupCount++;
}

export function markCleanupParents(node) {
  let parent = node?.parentNode;
  while (parent) {
    cleanupParents.add(parent);
    parent = parent.parentNode;
  }
}

export function markAttachedNodeCleanup(node) {
  if (activeCleanupCount === 0) return;
  if (nodeCleanups.has(node) || cleanupParents.has(node)) {
    markCleanupParents(node);
  }
}

export function markAttachedChildrenCleanup(parent) {
  if (activeCleanupCount === 0) return;
  let child = parent?.firstChild;
  let hasChildCleanup = false;
  while (child) {
    if (nodeCleanups.has(child) || cleanupParents.has(child)) {
      hasChildCleanup = true;
      break;
    }
    child = child.nextSibling;
  }
  if (hasChildCleanup) {
    cleanupParents.add(parent);
    markCleanupParents(parent);
  }
}

export function needsCleanup(node) {
  return cleanupParents.has(node) || nodeCleanups.has(node);
}

export function cleanupNode(node) {
  if (!node || cleaningNodes.has(node) || !needsCleanup(node)) return;
  cleaningNodes.add(node);
  try {
    if (cleanupParents.has(node)) {
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
      nodeCleanups.delete(node);
      activeCleanupCount -= cleanups.length;
      for (const clean of cleanups) {
        try {
          clean();
        } catch (err) {
          reportCleanupEvent?.({ type: "cleanup-error", node, error: err });
          if (typeof console !== "undefined" && typeof console.error === "function") {
            console.error("⚡ [CachouJS Cleanup]: cleanup callback failed.", err);
          }
        }
      }
    }
  } finally {
    const remaining = nodeCleanups.get(node);
    if (remaining) activeCleanupCount -= remaining.length;
    cleaningNodes.delete(node);
    nodeCleanups.delete(node);
  }
}
