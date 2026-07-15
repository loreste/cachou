import { signal, effect, createRoot, memo, store, batch, html, onCleanup, mapArray, createContext, useContext, onError, ErrorBoundary, Suspense, Portal, createResource, invalidateResource, prefetchResource, onMount, hydrate, lazy, dehydrate, render, mount, unmount, renderToString, renderToStringAsync, listFiles, readFile, enableDebug, disableDebug, getDebugSnapshot, assertNoReactiveLeaks, resetDebugState, FileBrowser, configureSecurityPolicy, getSecurityPolicy, trustedHTML, onFrameworkEvent, scheduleTask, yieldNow, configureScheduler, startTransition, createField, createForm, createLiveRegion, focusFirst, restoreFocusAfter, beforeNavigate, navigate, getPath, Route } from "../src/index.js";
import { addNodeCleanup, cleanupNode } from "../src/html.js";
import { reconcile } from "../src/reconcile.js";

const tests = [];
const results = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEquals(a, b, message) {
  if (a !== b) {
    throw new Error(`${message || "Assertion failed"}: expected ${b}, got ${a}`);
  }
}

function applyDehydratedState(stateScript) {
  const match = stateScript.match(/window\.__CACHOU_STATE__\s*=\s*(.*);<\/script>$/s);
  if (!match) {
    throw new Error("Unable to parse dehydrated CachouJS state script");
  }
  window.__CACHOU_STATE__ = JSON.parse(match[1]);
}

// Reactivity Tests
test("Signal getter/setter and Effect tracking", () => {
  const [count, setCount] = signal(0);
  let value = null;
  
  effect(() => {
    value = count();
  });
  
  assertEquals(value, 0, "Initial effect run");
  setCount(5);
  assertEquals(value, 5, "Effect runs after signal set");
});

test("Memoized computations", () => {
  const [count, setCount] = signal(1);
  let runs = 0;
  
  const double = memo(() => {
    runs++;
    return count() * 2;
  });
  
  assertEquals(double(), 2, "Initial memo value");
  assertEquals(runs, 1, "Initial execution");
  
  // Read again, should cache
  assertEquals(double(), 2, "Cached read");
  assertEquals(runs, 1, "No extra execution");
  
  // Update source signal
  setCount(3);
  assertEquals(double(), 6, "Updated memo value");
  assertEquals(runs, 2, "Second execution after dependency change");
});

test("Memo computations are lazy after dependency updates", () => {
  const [count, setCount] = signal(1);
  let runs = 0;
  const double = memo(() => {
    runs++;
    return count() * 2;
  });

  assertEquals(runs, 0, "Memo does not run until read");
  assertEquals(double(), 2, "Memo computes on first read");
  assertEquals(runs, 1, "Memo ran once after first read");

  setCount(2);
  assertEquals(runs, 1, "Memo does not recompute until read after dependency update");
  assertEquals(double(), 4, "Memo recomputes when read");
  assertEquals(runs, 2, "Memo recomputed once");
});

test("Store deep reactivity", () => {
  const state = store({
    user: { name: "Alice", age: 30 },
    tags: ["a", "b"]
  });
  
  let name = "";
  let age = 0;
  
  effect(() => {
    name = state.user.name;
    age = state.user.age;
  });
  
  assertEquals(name, "Alice");
  assertEquals(age, 30);
  
  state.user.name = "Bob";
  assertEquals(name, "Bob", "Nested store updates track reactively");
  
  state.user.age = 31;
  assertEquals(age, 31);
});

test("Store preserves nested proxy identity", () => {
  const state = store({
    user: { name: "Alice" }
  });

  const firstRead = state.user;
  const secondRead = state.user;

  assertEquals(firstRead, secondRead, "Nested objects return the same reactive proxy across reads");
});

test("Batching multiple signal updates", () => {
  const [a, setA] = signal(1);
  const [b, setB] = signal(2);
  let runs = 0;
  
  effect(() => {
    a();
    b();
    runs++;
  });
  
  assertEquals(runs, 1);
  
  batch(() => {
    setA(10);
    setB(20);
  });
  
  assertEquals(runs, 2, "Effect should run only once after batch finishes");
  assertEquals(a(), 10);
  assertEquals(b(), 20);
});

test("scheduler runs higher priority tasks before background work", async () => {
  const order = [];

  const low = scheduleTask(() => {
    order.push("low");
  }, { priority: "background" });
  const high = scheduleTask(() => {
    order.push("high");
  }, { priority: "userBlocking" });

  await Promise.all([low.finished, high.finished]);

  assertEquals(order.join(","), "high,low", "User-blocking task runs before background task");
});

test("scheduler cancellation prevents stale task commits", async () => {
  let committed = false;
  const task = scheduleTask(({ signal }) => {
    if (!signal.aborted) {
      committed = true;
    }
  }, { priority: "background" });

  task.cancel();
  await task.finished;

  assertEquals(committed, false, "Cancelled scheduled task does not commit");
  assertEquals(task.status, "cancelled", "Cancelled task status is reported");
});

test("scheduler exposes cooperative yielding for long tasks", async () => {
  let resumed = false;
  const task = scheduleTask(async ({ yieldNow }) => {
    await yieldNow();
    resumed = true;
  });

  await task.finished;

  assertEquals(resumed, true, "Scheduled task resumes after yielding");
});

test("startTransition cancels superseded scheduled work", async () => {
  const commits = [];

  const first = startTransition(() => {
    scheduleTask(async ({ signal, yieldNow }) => {
      await yieldNow();
      if (!signal.aborted) {
        commits.push("first");
      }
    });
  });

  const second = startTransition(() => {
    scheduleTask(() => {
      commits.push("second");
    });
  });

  if (first instanceof Promise) await first;
  if (second instanceof Promise) await second;

  assertEquals(commits.join(","), "second", "Only newest transition commits scheduled work");
});

test("startTransition aborts superseded resource requests", async () => {
  const signals = [];

  const first = startTransition(() => {
    createResource(({ signal }) => {
      signals.push(signal);
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        }, { once: true });
      });
    }, {
      key: `transition-abort-${Date.now()}-${Math.random()}`,
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    });
  });

  const second = startTransition(() => {});
  if (second instanceof Promise) await second;

  assertEquals(signals.length, 1, "Transition resource receives an abort signal");
  assertEquals(signals[0].aborted, true, "Superseded transition aborts resource request");
  if (first instanceof Promise) await first;
});

test("scheduler can be configured with a frame budget", () => {
  const state = configureScheduler({ budgetMs: 3 });
  assertEquals(state.budgetMs, 3, "Scheduler budget is configurable");
  configureScheduler({ budgetMs: 5 });
});

test("Cleanups and onCleanup registration", () => {
  const [show, setShow] = signal(true);
  let cleanupCount = 0;
  
  effect(() => {
    if (show()) {
      onCleanup(() => {
        cleanupCount++;
      });
    }
  });
  
  assertEquals(cleanupCount, 0, "No cleanup on initial run");
  
  setShow(false);
  assertEquals(cleanupCount, 1, "Cleanup runs when effect dependency changes");
  
  setShow(true);
  assertEquals(cleanupCount, 1, "No extra cleanup");
});

test("Nested effects are disposed when owner re-runs", () => {
  const [enabled, setEnabled] = signal(true);
  const [count, setCount] = signal(0);
  let nestedRuns = 0;

  effect(() => {
    if (enabled()) {
      effect(() => {
        count();
        nestedRuns++;
      });
    }
  });

  assertEquals(nestedRuns, 1, "Nested effect runs initially");

  setCount(1);
  assertEquals(nestedRuns, 2, "Nested effect reacts before owner cleanup");

  setEnabled(false);
  setCount(2);
  assertEquals(nestedRuns, 2, "Nested effect no longer reacts after owner cleanup");
});

test("createRoot disposes owned effects and cleanups", () => {
  const [count, setCount] = signal(0);
  let runs = 0;
  let cleanups = 0;

  const dispose = createRoot((disposeRoot) => {
    effect(() => {
      count();
      runs++;
      onCleanup(() => {
        cleanups++;
      });
    });
    return disposeRoot;
  });

  assertEquals(runs, 1, "Root-owned effect runs initially");
  setCount(1);
  assertEquals(runs, 2, "Root-owned effect reacts before disposal");

  dispose();
  setCount(2);
  assertEquals(runs, 2, "Root-owned effect stops after disposal");
  assert(cleanups >= 1, "Root disposal runs cleanups");
});

test("debug snapshot reports reactive graph counts", () => {
  enableDebug({ slowEffectThresholdMs: 1000 });
  const before = getDebugSnapshot();
  const [count, setCount] = signal(0, { name: "debug-count" });
  const dispose = createRoot((disposeRoot) => {
    effect(() => {
      count();
    });
    return disposeRoot;
  });

  setCount(1);
  const during = getDebugSnapshot();
  dispose();
  const after = getDebugSnapshot();
  disableDebug();

  assertEquals(during.enabled, true, "Debug mode is enabled");
  assert(during.signals >= before.signals + 1, "Debug snapshot tracks new signal");
  assert(during.computations >= before.computations + 1, "Debug snapshot tracks new effect");
  assert(after.disposedRoots >= before.disposedRoots + 1, "Debug snapshot tracks disposed root");
});

test("strict debug mode rejects cleanup outside a reactive scope", () => {
  enableDebug({ strict: true });
  let threw = false;
  try {
    onCleanup(() => {});
  } catch (err) {
    threw = true;
  } finally {
    disableDebug();
  }

  assertEquals(threw, true, "Strict debug mode throws for cleanup outside a scope");
});

test("assertNoReactiveLeaks detects and clears mounted roots", () => {
  resetDebugState();
  enableDebug();
  const root = document.createElement("div");
  const dispose = mount(() => html`<span>Leak check</span>`, root);

  let detected = false;
  try {
    assertNoReactiveLeaks("mounted root");
  } catch (err) {
    detected = true;
  }

  dispose();
  const snapshot = assertNoReactiveLeaks("after unmount");
  disableDebug();

  assertEquals(detected, true, "Live mounted root is detected");
  assertEquals(snapshot.liveRoots, 0, "Unmount clears live roots");
});

// HTML Template Engine Tests
test("HTML basic template rendering", () => {
  const el = html`<div>Hello World</div>`;
  assert(el instanceof HTMLElement, "Returns HTMLElement");
  assertEquals(el.tagName, "DIV");
  assertEquals(el.textContent, "Hello World");
});

test("HTML dynamic attribute and property bindings", () => {
  const [active, setActive] = signal(false);
  const [val, setVal] = signal("test");
  
  const el = html`<input type="text" class=${() => active() ? "active" : "inactive"} .value=${val} />`;
  
  assertEquals(el.className, "inactive", "Initial class attribute binding");
  assertEquals(el.value, "test", "Initial property binding");
  
  setActive(true);
  assertEquals(el.className, "active", "Reactive attribute updates");
  
  setVal("changed");
  assertEquals(el.value, "changed", "Reactive property updates");
});

test("HTML blocks unsafe javascript URLs in attributes", () => {
  const [href, setHref] = signal("javascript:alert(1)");
  const el = html`<a href=${href}>bad</a>`;

  assertEquals(el.hasAttribute("href"), false, "Unsafe initial href is removed");

  setHref("https://example.com");
  assertEquals(el.getAttribute("href"), "https://example.com", "Safe href is allowed");

  setHref("java\nscript:alert(1)");
  assertEquals(el.hasAttribute("href"), false, "Obfuscated unsafe href is removed");
});

test("HTML blocks unsafe style directive values", () => {
  const [styleValue, setStyleValue] = signal("url(javascript:alert(1))");
  const el = html`<div style:color=${styleValue}>bad</div>`;

  assertEquals(el.style.color, "", "Unsafe initial style is blocked");

  setStyleValue("red");
  assertEquals(el.style.color, "red", "Safe style value is allowed");
});

test("security policy emits framework events for blocked bindings", () => {
  const events = [];
  const off = onFrameworkEvent((event) => events.push(event));
  const originalPolicy = getSecurityPolicy();
  configureSecurityPolicy({ allowInlineStyles: false });

  try {
    const el = html`<a href=${"javascript:alert(1)"} style:color=${"red"}>bad</a>`;
    assertEquals(el.hasAttribute("href"), false, "Unsafe URL is removed");
    assertEquals(el.style.color, "", "Inline style is removed by policy");
    assert(events.some(event => event.type === "security-block" && event.attribute === "href"), "URL block event emitted");
    assert(events.some(event => event.type === "security-block" && event.message.includes("inline style")), "Style policy event emitted");
  } finally {
    configureSecurityPolicy(originalPolicy);
    off();
  }
});

test("trustedHTML explicitly opts into raw SSR and DOM markup", () => {
  globalThis.__MOCK_SSR__ = true;
  try {
    const htmlStr = renderToString(() => html`<div>${trustedHTML("<span>safe</span>")}</div>`);
    assertEquals(htmlStr, "<div><span>safe</span></div>", "Trusted SSR markup is not escaped");
  } finally {
    globalThis.__MOCK_SSR__ = false;
  }

  const el = html`<div>${trustedHTML("<span>safe</span>")}</div>`;
  assertEquals(el.querySelector("span").textContent, "safe", "Trusted DOM markup renders as nodes");
});

test("HTML event listener bindings", () => {
  let clicked = 0;
  const el = html`<button onclick=${() => clicked++}>Click Me</button>`;
  
  el.click();
  assertEquals(clicked, 1, "Event handler fired on click");
});

test("HTML dynamic child updating (in-place text nodes)", () => {
  const [msg, setMsg] = signal("Hello");
  const el = html`<div>Msg: ${msg}</div>`;
  
  assertEquals(el.textContent, "Msg: Hello");
  
  const textNode = el.childNodes[1];
  assert(textNode.nodeType === Node.TEXT_NODE, "Child is text node");
  
  setMsg("World");
  assertEquals(el.textContent, "Msg: World");
  assertEquals(el.childNodes[1], textNode, "Text node is updated in-place (same object reference)");
});

test("Keyed list reconciliation", () => {
  const [items, setItems] = signal([1, 2, 3]);
  const el = html`<ul>${mapArray(items, x => html`<li>Item ${x}</li>`)}</ul>`;
  
  const liElements = Array.from(el.querySelectorAll("li"));
  assertEquals(liElements.length, 3);
  assertEquals(liElements[0].textContent, "Item 1");
  
  // Re-order and check if DOM elements are reused (reconciliation test)
  setItems([2, 1, 3]);
  const newLiElements = Array.from(el.querySelectorAll("li"));
  assertEquals(newLiElements.length, 3);
  assertEquals(newLiElements[0], liElements[1], "Second item moved to first position");
  assertEquals(newLiElements[1], liElements[0], "First item moved to second position");
  assertEquals(newLiElements[2], liElements[2], "Third item remained in third position");
});

test("mapArray supports explicit keys for stable item reorders", () => {
  const first = { id: 1, label: "Alpha" };
  const second = { id: 2, label: "Beta" };
  const [items, setItems] = signal([first, second]);
  const el = html`<ul>${mapArray(items, item => html`<li>${item.label}</li>`, item => item.id)}</ul>`;

  const liElements = Array.from(el.querySelectorAll("li"));
  setItems([second, first]);
  const reordered = Array.from(el.querySelectorAll("li"));

  assertEquals(reordered[0], liElements[1], "Keyed second item DOM node moved to first position");
  assertEquals(reordered[1], liElements[0], "Keyed first item DOM node moved to second position");
});

test("mapArray updates keyed object rows in place when object identity changes", () => {
  const [items, setItems] = signal([{ id: 1, label: "Old", extra: "kept" }]);
  const el = html`<ul>${mapArray(items, item => html`<li>${() => `${item.label}:${item.extra ?? "none"}`}</li>`, item => item.id)}</ul>`;
  const oldNode = el.querySelector("li");

  setItems([{ id: 1, label: "New" }]);
  const newNode = el.querySelector("li");

  assertEquals(newNode.textContent, "New:none", "Changed keyed object updates row data reactively");
  assertEquals(oldNode, newNode, "Changed keyed object reuses stable DOM");
});

test("mapArray can skip reactive item proxies for stable keyed objects", () => {
  const [items, setItems] = signal([{ id: 1, label: "Old" }]);
  const el = html`<ul>${mapArray(items, item => html`<li>${item.label}</li>`, item => item.id, { reactiveItems: false })}</ul>`;
  const oldNode = el.querySelector("li");

  setItems([{ id: 1, label: "New" }]);

  assertEquals(el.querySelector("li").textContent, "Old", "Stable mode does not patch changed object identity into mapped rows");
  assertEquals(el.querySelector("li"), oldNode, "Stable mode keeps DOM for the same key");
});

test("mapArray uniqueKeys skips duplicate-key bookkeeping for stable keyed rows", () => {
  const first = { id: 1, label: "Alpha" };
  const second = { id: 2, label: "Beta" };
  const third = { id: 3, label: "Gamma" };
  const [items, setItems] = signal([first, second, third]);
  const el = html`<ul>${mapArray(items, item => html`<li>${item.label}</li>`, item => item.id, { reactiveItems: false, uniqueKeys: true })}</ul>`;
  const initial = Array.from(el.querySelectorAll("li"));

  setItems([third, second, first]);
  const reversed = Array.from(el.querySelectorAll("li"));

  assertEquals(reversed[0], initial[2], "Unique keyed row moved from last to first");
  assertEquals(reversed[1], initial[1], "Unique keyed row kept its middle DOM node");
  assertEquals(reversed[2], initial[0], "Unique keyed row moved from first to last");
});

test("mapArray uniqueKeys warns on duplicate keys in strict debug mode", () => {
  resetDebugState();
  enableDebug({ strict: true });
  const events = [];
  const stop = onFrameworkEvent(event => {
    if (event.type === "debug-warning") {
      events.push(event.message);
    }
  });
  try {
    const [items] = signal([{ id: 1, label: "A" }, { id: 1, label: "B" }]);
    html`<ul>${mapArray(items, item => html`<li>${item.label}</li>`, item => item.id, { uniqueKeys: true })}</ul>`;
  } finally {
    stop();
    disableDebug();
  }

  assert(events.some(message => message.includes("duplicate keys")), "Strict debug mode warns on duplicate unique keys");
});

test("mapArray handles duplicate primitive items independently", () => {
  const [items, setItems] = signal(["x", "x", "y"]);
  const el = html`<ul>${mapArray(items, (item, index) => html`<li>${item}-${index}</li>`)}</ul>`;
  const initial = Array.from(el.querySelectorAll("li"));

  setItems(["x", "y", "x"]);
  const reordered = Array.from(el.querySelectorAll("li"));

  assertEquals(reordered.length, 3, "Duplicate primitive list keeps all rows");
  assertEquals(reordered[0], initial[0], "First duplicate keeps its own DOM node");
  assertEquals(reordered[1], initial[2], "Unique item moves between duplicates");
  assertEquals(reordered[2], initial[1], "Second duplicate keeps its own DOM node");
});

test("mapArray handles duplicate explicit keys independently", () => {
  const first = { group: "a", label: "first" };
  const second = { group: "a", label: "second" };
  const third = { group: "b", label: "third" };
  const [items, setItems] = signal([first, second, third]);
  const el = html`<ul>${mapArray(items, item => html`<li>${item.label}</li>`, item => item.group)}</ul>`;
  const initial = Array.from(el.querySelectorAll("li"));

  setItems([second, third, first]);
  const reordered = Array.from(el.querySelectorAll("li"));

  assertEquals(reordered[0], initial[1], "First duplicate-key bucket entry moves independently");
  assertEquals(reordered[1], initial[2], "Different key moves between duplicates");
  assertEquals(reordered[2], initial[0], "Second duplicate-key bucket entry moves independently");
});

test("reconcile avoids moving nodes already in stable order", () => {
  const parent = document.createElement("div");
  const a = document.createElement("span");
  const b = document.createElement("span");
  const c = document.createElement("span");
  const d = document.createElement("span");
  const anchor = document.createComment("anchor");
  parent.append(a, b, c, d, anchor);

  let insertions = 0;
  const originalInsertBefore = parent.insertBefore.bind(parent);
  parent.insertBefore = (node, before) => {
    insertions++;
    return originalInsertBefore(node, before);
  };

  reconcile(parent, [a, b, c, d], [a, c, b, d], anchor);

  assertEquals(insertions, 1, "Only the out-of-sequence node moved");
  const finalNodes = Array.from(parent.childNodes).slice(0, 4);
  assertEquals(finalNodes[0], a, "First node remains a");
  assertEquals(finalNodes[1], c, "Second node is c");
  assertEquals(finalNodes[2], b, "Third node is b");
  assertEquals(finalNodes[3], d, "Fourth node remains d");
});

test("reconcile appends new nodes without moving stable old nodes", () => {
  const parent = document.createElement("div");
  const a = document.createElement("span");
  const b = document.createElement("span");
  const c = document.createElement("span");
  const anchor = document.createComment("anchor");
  parent.append(a, b, anchor);

  let insertions = 0;
  const originalInsertBefore = parent.insertBefore.bind(parent);
  parent.insertBefore = (node, before) => {
    insertions++;
    return originalInsertBefore(node, before);
  };

  reconcile(parent, [a, b], [a, b, c], anchor);

  assertEquals(insertions, 1, "Only appended node is inserted");
  assertEquals(parent.childNodes[0], a, "Existing first node stays in place");
  assertEquals(parent.childNodes[1], b, "Existing second node stays in place");
  assertEquals(parent.childNodes[2], c, "New node inserted before anchor");
});

test("reconcile removes deleted nodes and keeps survivors ordered", () => {
  const parent = document.createElement("div");
  const a = document.createElement("span");
  const b = document.createElement("span");
  const c = document.createElement("span");
  const anchor = document.createComment("anchor");
  parent.append(a, b, c, anchor);

  reconcile(parent, [a, b, c], [a, c], anchor);

  assertEquals(parent.contains(b), false, "Deleted node is removed");
  assertEquals(parent.childNodes[0], a, "First survivor remains first");
  assertEquals(parent.childNodes[1], c, "Second survivor remains second");
});

test("cleanupNode visits siblings even when cleanup removes a child", () => {
  const parent = document.createElement("div");
  const first = document.createElement("span");
  const second = document.createElement("span");
  let secondCleanupRan = false;

  parent.appendChild(first);
  parent.appendChild(second);

  addNodeCleanup(first, () => first.remove());
  addNodeCleanup(second, () => {
    secondCleanupRan = true;
  });

  cleanupNode(parent);

  assertEquals(secondCleanupRan, true, "Cleanup traversal continues to the next sibling");
});

test("removed dynamic children dispose their reactive bindings", () => {
  const [show, setShow] = signal(true);
  const [value, setValue] = signal(0);
  let childRuns = 0;

  const Child = () => html`<span>${() => {
    childRuns++;
    return value();
  }}</span>`;

  const el = html`<div>${() => show() ? Child() : null}</div>`;

  assertEquals(el.textContent, "0", "Child renders initial value");
  assertEquals(childRuns, 1, "Child binding runs initially");

  setValue(1);
  assertEquals(el.textContent, "1", "Child binding reacts while mounted");
  assertEquals(childRuns, 2, "Child binding reruns while mounted");

  setShow(false);
  setValue(2);
  assertEquals(el.textContent, "", "Removed child stays removed");
  assertEquals(childRuns, 2, "Removed child binding no longer reacts");
});

test("render disposes the previous root before mounting a new one", () => {
  const root = document.createElement("div");
  const [count, setCount] = signal(0);
  let firstRuns = 0;
  let secondRuns = 0;

  const First = () => html`<span>${() => {
    firstRuns++;
    return count();
  }}</span>`;
  const Second = () => html`<strong>${() => {
    secondRuns++;
    return count();
  }}</strong>`;

  render(First, root);
  assertEquals(firstRuns, 1, "First root renders");

  render(Second, root);
  setCount(1);

  assertEquals(firstRuns, 1, "Previous render root no longer reacts");
  assertEquals(secondRuns, 2, "Current render root reacts");
});

test("mount returns an unmount disposer", () => {
  const root = document.createElement("div");
  const [count, setCount] = signal(0);
  let runs = 0;

  const dispose = mount(() => html`<span>${() => {
    runs++;
    return count();
  }}</span>`, root);

  assertEquals(root.textContent, "0", "Mounted component renders");
  setCount(1);
  assertEquals(root.textContent, "1", "Mounted component reacts");

  dispose();
  setCount(2);
  assertEquals(root.textContent, "", "Unmount clears DOM");
  assertEquals(runs, 2, "Unmounted component no longer reacts");
});

test("mount disposes static roots without registering reactive work", () => {
  const root = document.createElement("div");
  const dispose = mount(() => html`<div><span>Static</span></div>`, root);

  assertEquals(root.textContent, "Static", "Static mount renders");
  dispose();
  assertEquals(root.textContent, "", "Static mount disposer clears DOM");
});

test("unmount disposes an explicitly rendered root", () => {
  const root = document.createElement("div");
  const [count, setCount] = signal(0);
  let runs = 0;

  render(() => html`<span>${() => {
    runs++;
    return count();
  }}</span>`, root);
  unmount(root);
  setCount(1);

  assertEquals(root.textContent, "", "Unmounted rendered root is empty");
  assertEquals(runs, 1, "Unmounted rendered root no longer reacts");
});

test("Context API value propagation", () => {
  const ThemeContext = createContext("light");
  
  const ChildComponent = () => {
    const theme = useContext(ThemeContext);
    return html`<span>Theme: ${theme}</span>`;
  };
  
  const App = ThemeContext.Provider({
    value: "dark",
    children: () => ChildComponent()
  });
  
  const el = App();
  assertEquals(el.textContent, "Theme: dark", "Context propagates value correctly");
});

test("Two-way form binding directive (bind:value)", () => {
  const msgSignal = signal("initial");
  
  const el = html`<input type="text" bind:value=${msgSignal} />`;
  assertEquals(el.value, "initial", "Initial value binds to input");
  
  // Set value from input event
  el.value = "user-typed";
  el.dispatchEvent(new Event("input"));
  assertEquals(msgSignal[0](), "user-typed", "Input updates signal reactively");
  
  // Set value from signal setter
  msgSignal[1]("set-programmatically");
  assertEquals(el.value, "set-programmatically", "Signal updates input reactively");
});

test("filesystem frontend helpers call the server file API", async () => {
  const originalFetch = window.fetch;
  const requests = [];
  window.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).startsWith("/api/files/content")) {
      return new Response(JSON.stringify({
        name: "README.md",
        path: "README.md",
        size: 10,
        mtimeMs: 1,
        mime: "text/markdown",
        kind: "text",
        content: "# Cachou",
        encoding: "utf8"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      root: "cachou",
      path: "",
      parentPath: null,
      entries: [{ name: "README.md", path: "README.md", type: "file", size: 10, mtimeMs: 1, extension: ".md" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const dir = await listFiles("", { includeHidden: true });
    const file = await readFile("README.md");

    assertEquals(dir.entries[0].name, "README.md", "listFiles returns directory entries");
    assertEquals(file.content, "# Cachou", "readFile returns file content");
    assert(requests[0].includes("/api/files?path=&hidden=1"), "listFiles includes encoded path and hidden option");
    assert(requests[1].includes("/api/files/content?path=README.md"), "readFile calls content endpoint");
  } finally {
    window.fetch = originalFetch;
  }
});

test("FileBrowser renders entries and previews selected text files", async () => {
  const originalFetch = window.fetch;
  window.fetch = async (url) => {
    const str = String(url);
    if (str.startsWith("/api/files/content")) {
      return new Response(JSON.stringify({
        name: "README.md",
        path: "README.md",
        size: 9,
        mtimeMs: 1,
        mime: "text/markdown",
        kind: "text",
        content: "# Preview",
        encoding: "utf8"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      root: "root",
      path: "",
      parentPath: null,
      entries: [
        { name: "docs", path: "docs", type: "directory", size: 0, mtimeMs: 1, extension: "" },
        { name: "README.md", path: "README.md", type: "file", size: 9, mtimeMs: 1, extension: ".md" }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  let el;
  try {
    el = FileBrowser();
    document.body.appendChild(el);
    await new Promise(resolve => setTimeout(resolve, 50));

    assert(el.textContent.includes("README.md"), "FileBrowser renders file entries");

    const buttons = Array.from(el.querySelectorAll("button"));
    const fileButton = buttons.find(button => button.textContent.includes("README.md"));
    fileButton.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    assert(el.textContent.includes("# Preview"), "FileBrowser previews selected text file");
  } finally {
    if (el) el.remove();
    window.fetch = originalFetch;
  }
});

test("onError catches errors in reactive effects", () => {
  let caughtError = null;
  const triggerError = signal(false);
  
  onError((err) => {
    caughtError = err.message;
  });
  
  effect(() => {
    if (triggerError[0]()) {
      throw new Error("reactive failure");
    }
  });
  
  assertEquals(caughtError, null);
  
  triggerError[1](true);
  assertEquals(caughtError, "reactive failure", "onError catches reactive errors successfully");
});

test("ref directive assigns DOM node", () => {
  const refObj = { current: null };
  const el = html`<input type="text" ref=${refObj} />`;
  assertEquals(el, refObj.current, "Ref correctly holds the generated DOM element");
});

test("Portal renders children out-of-tree", () => {
  const portalContainer = document.createElement("div");
  portalContainer.id = "portal-mount";
  document.body.appendChild(portalContainer);
  
  const [showPortal, setShowPortal] = signal(true);
  
  const App = () => html`
    <div>
      ${() => showPortal() ? Portal({
        mount: portalContainer,
        children: () => html`<span class="portal-child">Portaled!</span>`
      }) : ""}
    </div>
  `;
  
  const el = App();
  
  const portaledEl = portalContainer.querySelector(".portal-child");
  assertEquals(portaledEl !== null, true, "Element rendered inside portal container");
  assertEquals(portaledEl.textContent, "Portaled!", "Element content is correct");
  assertEquals(el.querySelector(".portal-child"), null, "Element not present inside root component tree");
  
  setShowPortal(false);
  assertEquals(portalContainer.querySelector(".portal-child"), null, "Portal content is cleaned up on unmount");
  
  portalContainer.remove();
});

test("Suspense coordinates loading states", async () => {
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = () => resolve("Success");
  });
  
  const App = () => Suspense({
    fallback: () => html`<span class="loading-state">Loading...</span>`,
    children: () => {
      const [res] = createResource(() => promise);
      return () => html`<span class="content-state">${res() || "Empty"}</span>`;
    }
  });
  
  const el = App();
  
  await new Promise(resolve => setTimeout(resolve, 0));
  
  const fallbackEl = el.querySelector(".loading-state") || el;
  assertEquals(fallbackEl.textContent.trim(), "Loading...", "Suspense displays loading fallback initially");
  
  resolvePromise();
  await promise;
  await new Promise(resolve => setTimeout(resolve, 50));
  
  const contentEl = el.querySelector(".content-state") || el;
  assertEquals(contentEl.textContent.trim(), "Success", "Suspense switches to children when resource resolves");
});

test("createResource ignores stale responses from older requests", async () => {
  const resolvers = [];
  const [data, controls] = createResource(() => new Promise(resolve => {
    resolvers.push(resolve);
  }), {
    key: `race-${Date.now()}-${Math.random()}`,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });

  assertEquals(controls.getRequestId(), 1, "Initial request starts");
  const secondRequest = controls.refetch();
  assertEquals(controls.getRequestId(), 2, "Second request starts");

  resolvers[1]("second");
  await secondRequest;
  assertEquals(data(), "second", "Newest request applies first");

  resolvers[0]("first");
  await new Promise(resolve => setTimeout(resolve, 0));
  assertEquals(data(), "second", "Older response cannot overwrite newer data");
});

test("createResource aborts previous requests when refetching", async () => {
  const signals = [];
  const resolvers = [];
  const [data, controls] = createResource(({ signal }) => {
    signals.push(signal);
    return new Promise(resolve => {
      resolvers.push(resolve);
    });
  }, {
    key: `abort-${Date.now()}-${Math.random()}`,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });

  const secondRequest = controls.refetch();
  assertEquals(signals[0].aborted, true, "Previous request signal is aborted");

  resolvers[1]("fresh");
  await secondRequest;
  assertEquals(data(), "fresh", "Fresh request applies after aborting stale request");

  resolvers[0]("stale");
  await new Promise(resolve => setTimeout(resolve, 0));
  assertEquals(data(), "fresh", "Resolved aborted request stays ignored");
});

test("createResource supports source-driven refetching and invalidation", async () => {
  const [id, setId] = signal("a");
  const calls = [];
  const [data, controls] = createResource(id, async (value) => {
    calls.push(value);
    return `item-${value}`;
  }, {
    key: value => `source-${value}`,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });

  await new Promise(resolve => setTimeout(resolve, 20));
  assertEquals(data(), "item-a", "Initial source value is loaded");

  setId("b");
  await new Promise(resolve => setTimeout(resolve, 20));
  assertEquals(data(), "item-b", "Changing the source refetches");
  assertEquals(calls.join(","), "a,b", "Fetcher receives source values");

  controls.invalidate();
  invalidateResource("source-a");
});

test("createResource supports deduped prefetch and timeout errors", async () => {
  let calls = 0;
  const first = prefetchResource("dedupe-test", async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return "prefetched";
  }, { dedupe: true, force: true });
  const second = prefetchResource("dedupe-test", async () => {
    calls++;
    return "duplicate";
  }, { dedupe: true, force: true });

  assertEquals(await first, "prefetched", "First prefetch resolves");
  assertEquals(await second, "prefetched", "Second prefetch reuses inflight result");
  assertEquals(calls, 1, "Only one deduped fetcher ran");

  const [, controls] = createResource(() => new Promise(() => {}), {
    key: `timeout-${Date.now()}-${Math.random()}`,
    timeoutMs: 5,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });
  await new Promise(resolve => setTimeout(resolve, 30));
  assertEquals(controls.error().name, "TimeoutError", "Timeout reports a resource error");
});

test("ErrorBoundary renders fallback for sync child failures", () => {
  const Boundary = ErrorBoundary({
    children: () => {
      throw new Error("boom");
    },
    fallback: (err) => html`<span class="boundary">${err.message}</span>`
  });

  const el = Boundary();
  assertEquals(el.textContent, "boom", "Boundary fallback receives the error");
});

test("form helpers validate fields and guard async submit races", async () => {
  const name = createField("", { validate: value => value ? null : "Required" });
  assertEquals(await name.validate(), false, "Empty required field is invalid");
  assertEquals(name.error(), "Required", "Field error is set");
  name.setValue("Ada");
  assertEquals(await name.validate(), true, "Filled field is valid");

  let submitted = "";
  const form = createForm({ email: "" }, {
    fields: {
      email: { validate: value => value.includes("@") ? null : "Invalid email" }
    },
    onSubmit: async (values) => {
      submitted = values.email;
    }
  });
  const failed = await form.handleSubmit()();
  assertEquals(failed, false, "Invalid form does not submit");
  form.fields.email.setValue("ada@example.com");
  const passed = await form.handleSubmit()();
  assertEquals(passed, true, "Valid form submits");
  assertEquals(submitted, "ada@example.com", "Submit receives values");

  const crossField = createForm({ password: "one", confirm: "two" }, {
    validate: values => values.password === values.confirm ? null : { confirm: "Passwords must match" }
  });
  assertEquals(await crossField.validate(), false, "Form-level validation can reject");
  assertEquals(crossField.fields.confirm.error(), "Passwords must match", "Form-level errors attach to fields");
});

test("accessibility helpers manage live regions and focus", async () => {
  const [announce, region] = createLiveRegion();
  document.body.appendChild(region);
  announce("Saved");
  await new Promise(resolve => setTimeout(resolve, 0));
  assertEquals(region.textContent, "Saved", "Live region announces text");

  const wrapper = html`<div><button>Focus me</button></div>`;
  document.body.appendChild(wrapper);
  assertEquals(focusFirst(wrapper), true, "focusFirst focuses a control");
  assertEquals(document.activeElement, wrapper.querySelector("button"), "Button received focus");

  const previous = document.activeElement;
  restoreFocusAfter(() => {
    document.body.focus();
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assertEquals(document.activeElement, previous, "restoreFocusAfter restores focus");

  wrapper.remove();
  region.remove();
});

test("router navigation guards can cancel route changes", () => {
  const original = window.location.pathname + window.location.search;
  const off = beforeNavigate(({ to }) => to !== "/blocked");
  try {
    const blocked = navigate("/blocked", { scroll: false, focus: false });
    assertEquals(blocked, false, "Guard cancels navigation");
    assertEquals(getPath(), window.location.pathname, "Path remains unchanged after cancel");

    const allowed = navigate("/allowed?tab=1", { scroll: false, focus: false });
    assertEquals(allowed, true, "Guard allows navigation");
    assertEquals(getPath(), "/allowed", "Path updates after allowed navigation");
  } finally {
    off();
    window.history.replaceState(null, "", original);
  }
});

test("Route decodes params before passing them to components", () => {
  const original = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", "/users/Ada%20Lovelace");
  window.dispatchEvent(new PopStateEvent("popstate"));

  try {
    const View = Route({
      path: "/users/:name",
      component: params => html`<span>${params.name}</span>`
    });
    const el = View();
    assertEquals(el.textContent, "Ada Lovelace", "Route param is decoded");
  } finally {
    window.history.replaceState(null, "", original);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
});

test("class directive toggles CSS classes reactively", () => {
  const [isActive, setIsActive] = signal(false);
  const el = html`<div class:active=${isActive}>Class Toggle</div>`;
  assertEquals(el.classList.contains("active"), false, "Class is not active initially");
  
  setIsActive(true);
  assertEquals(el.classList.contains("active"), true, "Class toggles on");
  
  setIsActive(false);
  assertEquals(el.classList.contains("active"), false, "Class toggles off");
});

test("style directive assigns style values reactively", () => {
  const [color, setColor] = signal("red");
  const el = html`<div style:color=${color}>Style set</div>`;
  assertEquals(el.style.color, "red", "Style color set initially");
  
  setColor("blue");
  assertEquals(el.style.color, "blue", "Style color updates reactively");
});

test("onMount runs callback after painting", async () => {
  let mounted = false;
  
  const Component = () => {
    onMount(() => {
      mounted = true;
    });
    return html`<div>Mount test</div>`;
  };
  
  Component();
  assertEquals(mounted, false, "onMount has not run synchronously");
  
  await new Promise(resolve => requestAnimationFrame(resolve));
  assertEquals(mounted, true, "onMount executed in the next paint cycle");
});

test("global event delegation coordinates bubble events", () => {
  let clicked = false;
  let clickedChild = false;
  
  const App = () => html`
    <div onclick=${() => clicked = true}>
      <button class="child-btn" onclick=${() => {
        clickedChild = true;
      }}>Click Child</button>
    </div>
  `;
  
  const el = App();
  document.body.appendChild(el);
  
  const button = el.querySelector(".child-btn");
  button.click();
  
  assertEquals(clickedChild, true, "Child handler triggered via delegation");
  assertEquals(clicked, true, "Parent handler triggered via bubbling delegation");
  
  el.remove();
});

test("hydrate adopts existing server-rendered HTML nodes", () => {
  const container = document.createElement("div");
  container.innerHTML = `
    <div class="hydrated-container">
      <h1 class="title">Server Rendered Title</h1>
      <p class="desc">Counter: <span class="count-val">10</span></p>
      <button class="click-btn">Increment</button>
    </div>
  `;
  document.body.appendChild(container);

  const [count, setCount] = signal(10);
  const App = () => html`
    <div class="hydrated-container">
      <h1 class="title">Server Rendered Title</h1>
      <p class="desc">Counter: <span class="count-val">${count}</span></p>
      <button class="click-btn" onclick=${() => setCount(count() + 1)}>Increment</button>
    </div>
  `;

  hydrate(App, container);

  const countSpan = container.querySelector(".count-val");
  const button = container.querySelector(".click-btn");
  
  assertEquals(countSpan.textContent, "10", "Initial server-rendered value preserved");
  
  button.click();
  assertEquals(countSpan.textContent, "11", "Click handler added via hydration and reactive update fires");
  
  setCount(15);
  assertEquals(countSpan.textContent, "15", "Reactive update propagates via hydration");

  container.remove();
});

test("hydrate warns when server markup is missing a client node", () => {
  const container = document.createElement("div");
  container.innerHTML = `<div><span>Only child</span></div>`;
  document.body.appendChild(container);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));

  try {
    const App = () => html`<div><span>Only child</span><strong>Missing</strong></div>`;
    hydrate(App, container);
  } finally {
    console.warn = originalWarn;
    container.remove();
  }

  assert(warnings.some(message => message.includes("Hydration")), "Hydration mismatch warning was emitted");
});

test("hydrate warns when server markup has extra nodes", () => {
  const container = document.createElement("div");
  container.innerHTML = `<div><span>Client child</span><em>Extra</em></div>`;
  document.body.appendChild(container);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));

  try {
    const App = () => html`<div><span>Client child</span></div>`;
    hydrate(App, container);
  } finally {
    console.warn = originalWarn;
    container.remove();
  }

  assert(warnings.some(message => message.includes("extra nodes")), "Extra server node warning was emitted");
});

test("lazy components resolve dynamically and integrate with Suspense", async () => {
  let resolveComponent;
  const promise = new Promise((resolve) => {
    resolveComponent = resolve;
  });
  
  const LazyComponent = lazy(() => promise);
  
  const App = () => Suspense({
    fallback: () => html`<div class="loading">Loading...</div>`,
    children: () => LazyComponent({ title: "Dynamic Page" })
  });
  
  const el = App();
  document.body.appendChild(el);
  
  const loading = el.querySelector(".loading");
  assert(loading !== null, "Suspense loading fallback is visible initially");
  
  const MockPage = (props) => html`<h1 class="resolved">${props.title}</h1>`;
  resolveComponent(MockPage);
  
  await promise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  
  const resolved = el.querySelector(".resolved");
  assert(resolved !== null, "Resolved component is rendered");
  assertEquals(resolved.textContent, "Dynamic Page", "Resolved component props matched");
  assertEquals(el.querySelector(".loading"), null, "Suspense fallback was removed");
  
  const nextContainer = document.createElement("div");
  const nextEl = LazyComponent({ title: "Cached Page" })();
  nextContainer.appendChild(nextEl);
  
  const cachedHeader = nextContainer.querySelector(".resolved");
  assert(cachedHeader !== null, "Cached component renders synchronously");
  assertEquals(cachedHeader.textContent, "Cached Page", "Cached component props matched");
  
  el.remove();
  nextContainer.remove();
});

test("SSR State Dehydration & Rehydration transfer", async () => {
  globalThis.__MOCK_SSR__ = true;
  let scriptEl, clientContainer;
  try {
    let fetcherCalled = 0;
    const App = () => {
      const [data] = createResource(async () => {
        fetcherCalled++;
        return "server-data";
      });
      return html`<div>Data: ${data}</div>`;
    };
    
    const htmlStr = await renderToStringAsync(App);
    const stateScript = dehydrate();
    
    globalThis.__MOCK_SSR__ = false;
    
    assertEquals(htmlStr, "<div>Data: server-data</div>", "Server-side template evaluated successfully");
    assert(stateScript.includes("server-data"), "Serialized state includes resolved server-data");
    
    // Apply serialized state manually because innerHTML script tags do not execute in browser DOM insertions
    applyDehydratedState(stateScript);
    
    scriptEl = document.createElement("div");
    scriptEl.innerHTML = stateScript;
    document.body.appendChild(scriptEl.firstChild);
    
    clientContainer = document.createElement("div");
    clientContainer.innerHTML = "<div>Data: server-data</div>";
    document.body.appendChild(clientContainer);
    
    let clientFetcherCalled = 0;
    const ClientApp = () => {
      const [data] = createResource(async () => {
        clientFetcherCalled++;
        return "client-fetched-data";
      });
      return html`<div>Data: ${data}</div>`;
    };
    
    hydrate(ClientApp, clientContainer);
    
    const target = clientContainer.querySelector("div");
    assertEquals(target.textContent, "Data: server-data", "Client rehydrated value matches server state");
    assertEquals(clientFetcherCalled, 0, "Duplicate dynamic database fetch was skipped");
  } finally {
    globalThis.__MOCK_SSR__ = false;
    if (document.getElementById("__CACHOU_STATE__")) {
      document.getElementById("__CACHOU_STATE__").remove();
    }
    if (clientContainer) clientContainer.remove();
    if (scriptEl) scriptEl.remove();
    delete window.__CACHOU_STATE__;
  }
});

test("SSR escapes dynamic text and attributes while preserving nested framework markup", () => {
  globalThis.__MOCK_SSR__ = true;
  try {
    const unsafe = `<img src=x onerror="window.__bad=true">`;
    const nested = html`<span>${unsafe}</span>`;
    const htmlStr = renderToString(() => html`<div title=${unsafe}>${nested}</div>`);

    assert(htmlStr.includes("&lt;img src=x onerror=&quot;window.__bad=true&quot;&gt;"), "Attribute value is escaped");
    assert(htmlStr.includes("<span>&lt;img src=x onerror=\"window.__bad=true\"&gt;</span>"), "Nested text is escaped");
    assert(htmlStr.includes("<span>"), "Framework-generated nested markup is preserved");
  } finally {
    globalThis.__MOCK_SSR__ = false;
  }
});

test("SSR dehydrate escapes script-breaking resource content", async () => {
  globalThis.__MOCK_SSR__ = true;
  try {
    const App = () => {
      const [data] = createResource(async () => "</script><script>window.__bad = true</script>\u2028\u2029");
      return html`<div>${data}</div>`;
    };

    await renderToStringAsync(App);
    const stateScript = dehydrate();

    assert(stateScript.includes("\\u003c/script>"), "Closing script tag is escaped in dehydrated state");
    assert(stateScript.includes("\\u2028"), "Unicode line separator is escaped in dehydrated state");
    assert(stateScript.includes("\\u2029"), "Unicode paragraph separator is escaped in dehydrated state");
    assertEquals(stateScript.includes("</script><script>"), false, "Serialized resource cannot create a second script tag");
  } finally {
    globalThis.__MOCK_SSR__ = false;
  }
});

export async function runTestsAndRender() {
  const root = document.getElementById("test-results");
  if (!root) return;
  root.replaceChildren();
  results.length = 0;
  window.__CACHOU_TEST_DONE__ = false;
  window.__CACHOU_TEST_RESULTS__ = null;
  
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, passed: true });
    } catch (err) {
      results.push({ name: t.name, passed: false, error: `${err.message || err}\n${err.stack || ""}` });
    }
  }
  
  let passedCount = 0;
  let failedCount = 0;
  
  const testItems = results.map(res => {
    if (res.passed) passedCount++;
    else failedCount++;
    
    return html`
      <div class="test-item ${res.passed ? "passed" : "failed"}">
        <span class="status-badge">${res.passed ? "PASS" : "FAIL"}</span>
        <span class="test-name">${res.name}</span>
        ${res.error ? html`<pre class="error-log">${res.error}</pre>` : ""}
      </div>
    `;
  });
  
  const summary = html`
    <div class="test-summary">
      <div class="summary-stat passed">Passed: ${passedCount}</div>
      <div class="summary-stat failed">Failed: ${failedCount}</div>
    </div>
  `;
  
  root.appendChild(summary);
  for (const item of testItems) {
    root.appendChild(item);
  }

  window.__CACHOU_TEST_RESULTS__ = {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    results
  };
  window.__CACHOU_TEST_DONE__ = true;
  const failedNames = results
    .filter(result => !result.passed)
    .map(result => encodeURIComponent(`${result.name}::${result.error || ""}`.slice(0, 300)))
    .join(",");
  document.title = `CACHOU_TESTS_DONE:${passedCount}:${failedCount}:${results.length}:${failedNames}`;
}
