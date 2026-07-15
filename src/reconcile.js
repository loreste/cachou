import { removeNodeWithTransition } from "./html.js";

/**
 * Reconciles child DOM nodes of a parent container from oldNodes to newNodes.
 * Walks backwards to minimize insertions and movements.
 * 
 * @param {HTMLElement} parent The parent element containing the nodes.
 * @param {Node[]} oldNodes Array of existing DOM nodes.
 * @param {Node[]} newNodes Array of target DOM nodes.
 * @param {Node} anchor The reference sibling node (the comment placeholder).
 */
export function reconcile(parent, oldNodes, newNodes, anchor) {
  if (oldNodes === newNodes) return;
  if (oldNodes.length === 0) {
    for (const node of newNodes) {
      parent.insertBefore(node, anchor);
    }
    return;
  }
  if (newNodes.length === 0) {
    for (const node of oldNodes) {
      removeNodeWithTransition(node);
    }
    return;
  }
  if (isFullReverse(oldNodes, newNodes)) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < newNodes.length; i++) {
      fragment.appendChild(newNodes[i]);
    }
    parent.insertBefore(fragment, anchor);
    return;
  }

  const newSet = new Set(newNodes);
  const oldIndex = new Map();

  for (let i = 0; i < oldNodes.length; i++) {
    oldIndex.set(oldNodes[i], i);
  }

  for (const node of oldNodes) {
    if (!newSet.has(node)) {
      removeNodeWithTransition(node);
    }
  }

  const sources = newNodes.map(node => oldIndex.has(node) ? oldIndex.get(node) : -1);
  const stablePositions = getLongestIncreasingSubsequencePositions(sources);
  let stableCursor = stablePositions.length - 1;

  for (let i = newNodes.length - 1; i >= 0; i--) {
    const newNode = newNodes[i];
    const nextNode = newNodes[i + 1] || anchor;
    const isExistingStableNode = sources[i] !== -1 && stablePositions[stableCursor] === i;

    if (isExistingStableNode) {
      stableCursor--;
    } else if (newNode.nextSibling !== nextNode) {
      parent.insertBefore(newNode, nextNode);
    }
  }
}

function isFullReverse(oldNodes, newNodes) {
  if (oldNodes.length !== newNodes.length || oldNodes.length < 2) return false;
  for (let i = 0, j = oldNodes.length - 1; i < oldNodes.length; i++, j--) {
    if (oldNodes[j] !== newNodes[i]) return false;
  }
  return true;
}

function getLongestIncreasingSubsequencePositions(values) {
  const predecessors = new Array(values.length);
  const tails = [];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === -1) continue;

    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo > 0) {
      predecessors[i] = tails[lo - 1];
    }
    tails[lo] = i;
  }

  let cursor = tails[tails.length - 1];
  const result = new Array(tails.length);
  for (let i = tails.length - 1; i >= 0; i--) {
    result[i] = cursor;
    cursor = predecessors[cursor];
  }
  return result;
}
