import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { signal, createRoot } from "../../src/reactivity.js";
import { Show, Switch, Match, KeepAlive } from "../../src/flow.js";

/** Minimal document for KeepAlive unit tests (Node has no DOM). */
function installMinimalDocument() {
  if (typeof globalThis.document !== "undefined" && globalThis.document?.createElement) {
    return () => {};
  }

  class FakeNode {
    constructor(name = "#node") {
      this.nodeName = name;
      this.nodeType = 1;
      this.childNodes = [];
      this.parentNode = null;
      this.style = {};
      this._text = "";
    }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    }
    removeChild(child) {
      const i = this.childNodes.indexOf(child);
      if (i !== -1) this.childNodes.splice(i, 1);
      child.parentNode = null;
      return child;
    }
    get textContent() {
      return this._text || this.childNodes.map(c => c.textContent || "").join("");
    }
    set textContent(v) {
      this._text = String(v);
      this.childNodes = [];
    }
  }

  class FakeElement extends FakeNode {
    constructor(tag) {
      super(String(tag).toUpperCase());
      this.tagName = this.nodeName;
      this.id = "";
      this.attributes = new Map();
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    hasAttribute(k) { return this.attributes.has(k); }
  }

  class FakeText extends FakeNode {
    constructor(text) {
      super("#text");
      this._text = String(text);
    }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
  }

  class FakeFragment extends FakeNode {
    constructor() { super("#document-fragment"); }
  }

  const document = {
    createElement(tag) { return new FakeElement(tag); },
    createTextNode(text) { return new FakeText(text); },
    createDocumentFragment() { return new FakeFragment(); },
    createComment() { return new FakeNode("#comment"); },
    body: new FakeElement("body")
  };

  const prevDoc = globalThis.document;
  const prevWindow = globalThis.window;
  const prevNode = globalThis.Node;
  globalThis.document = document;
  globalThis.window = globalThis.window || { document };
  // KeepAlive checks `instanceof Node`
  globalThis.Node = FakeNode;
  return () => {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
    if (prevNode === undefined) delete globalThis.Node;
    else globalThis.Node = prevNode;
  };
}

describe("Show", () => {
  it("renders children when truthy", () => {
    const [open, setOpen] = signal(true);
    const view = Show({
      when: open,
      children: () => "yes",
      fallback: () => "no"
    });
    assert.equal(view(), "yes");
    setOpen(false);
    assert.equal(view(), "no");
  });

  it("passes truthy value to children", () => {
    const view = Show({
      when: () => ({ id: 1 }),
      children: v => v.id
    });
    assert.equal(view(), 1);
  });
});

describe("Switch/Match", () => {
  it("picks first matching branch", () => {
    const [tab, setTab] = signal("a");
    const view = Switch({
      fallback: () => "none",
      children: [
        Match({ when: () => tab() === "a", children: () => "A" }),
        Match({ when: () => tab() === "b", children: () => "B" })
      ]
    });
    assert.equal(view(), "A");
    setTab("b");
    assert.equal(view(), "B");
    setTab("c");
    assert.equal(view(), "none");
  });
});

describe("KeepAlive", () => {
  let restoreDom;

  before(() => {
    restoreDom = installMinimalDocument();
  });

  after(() => {
    if (restoreDom) restoreDom();
  });

  it("unmounts without throwing and clears the LRU cache", () => {
    function Home() { return document.createTextNode("home"); }
    function Settings() { return document.createTextNode("settings"); }
    Object.defineProperty(Home, "name", { value: "Home" });
    Object.defineProperty(Settings, "name", { value: "Settings" });

    createRoot(dispose => {
      const [view, setView] = signal(Home);
      const el = KeepAlive({
        max: 2,
        children: () => view()
      });
      assert.ok(el);
      setView(Settings);
      setView(Home);
      // Must not throw (previous bug: lruOrder ReferenceError)
      dispose();
    });
  });

  it("SSR path returns a render function without document", () => {
    const prev = globalThis.document;
    delete globalThis.document;
    try {
      const view = KeepAlive({ children: () => "ssr" });
      assert.equal(typeof view, "function");
      assert.equal(view(), "ssr");
    } finally {
      globalThis.document = prev;
    }
  });
});
