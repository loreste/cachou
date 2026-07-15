import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal } from "../../src/reactivity.js";
import { Show, Switch, Match } from "../../src/flow.js";

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
