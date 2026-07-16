import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  cubicBezier,
  defineTransition
} from "../../src/transitions.js";

describe("easing functions", () => {
  it("linear is identity", () => {
    assert.equal(linear(0), 0);
    assert.equal(linear(0.5), 0.5);
    assert.equal(linear(1), 1);
  });

  it("easeIn starts slow", () => {
    assert.equal(easeIn(0), 0);
    assert.ok(easeIn(0.25) < 0.25); // slower than linear
    assert.equal(easeIn(1), 1);
  });

  it("easeOut starts fast", () => {
    assert.equal(easeOut(0), 0);
    assert.ok(easeOut(0.25) > 0.25); // faster than linear
    assert.equal(easeOut(1), 1);
  });

  it("easeInOut is symmetric", () => {
    assert.equal(easeInOut(0), 0);
    assert.equal(easeInOut(1), 1);
    // At 0.5, should be 0.5
    assert.ok(Math.abs(easeInOut(0.5) - 0.5) < 0.001);
    // First half slower, second half faster
    assert.ok(easeInOut(0.25) < 0.25);
    assert.ok(easeInOut(0.75) > 0.75);
  });

  it("all easings handle boundary values", () => {
    for (const fn of [linear, easeIn, easeOut, easeInOut]) {
      assert.equal(fn(0), 0, `${fn.name}(0) should be 0`);
      assert.equal(fn(1), 1, `${fn.name}(1) should be 1`);
    }
  });

  it("all easings return values in [0, 1] range for inputs in [0, 1]", () => {
    for (const fn of [linear, easeIn, easeOut, easeInOut]) {
      for (let t = 0; t <= 1; t += 0.05) {
        const result = fn(t);
        assert.ok(result >= -0.001 && result <= 1.001, `${fn.name}(${t}) = ${result} out of range`);
      }
    }
  });
});

describe("cubicBezier", () => {
  it("returns identity-ish for linear params", () => {
    const ease = cubicBezier(0, 0, 1, 1);
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
    // Should be approximately linear
    assert.ok(Math.abs(ease(0.5) - 0.5) < 0.05);
  });

  it("handles ease-in params (0.42, 0, 1, 1)", () => {
    const ease = cubicBezier(0.42, 0, 1, 1);
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
    // Ease-in: value at 0.5 should be < 0.5
    assert.ok(ease(0.5) < 0.55);
  });

  it("handles ease-out params (0, 0, 0.58, 1)", () => {
    const ease = cubicBezier(0, 0, 0.58, 1);
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
  });

  it("handles zero duration gracefully", () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
  });

  it("returns monotonically increasing for standard curves", () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      const val = ease(t);
      assert.ok(val >= prev - 0.001, `not monotonic at t=${t}: ${val} < ${prev}`);
      prev = val;
    }
  });

  it("handles extreme values", () => {
    const ease = cubicBezier(0, 0, 0, 0);
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
  });
});

describe("defineTransition", () => {
  it("returns a factory function", () => {
    const factory = defineTransition(
      () => ({ finished: Promise.resolve(), cancel() {} }),
      () => ({ finished: Promise.resolve(), cancel() {} })
    );
    assert.equal(typeof factory, "function");
  });

  it("factory returns enter/leave/destroy", () => {
    const factory = defineTransition(
      () => ({ finished: Promise.resolve(), cancel() {} }),
      () => ({ finished: Promise.resolve(), cancel() {} })
    );
    // Pass a fake node
    const t = factory({}, {});
    assert.equal(typeof t.enter, "function");
    assert.equal(typeof t.leave, "function");
    assert.equal(typeof t.destroy, "function");
  });

  it("enter calls enterFn with node and options", () => {
    let receivedNode, receivedOpts;
    const factory = defineTransition(
      (node, opts) => {
        receivedNode = node;
        receivedOpts = opts;
        return { finished: Promise.resolve(), cancel() {} };
      },
      () => ({ finished: Promise.resolve(), cancel() {} })
    );
    const fakeNode = { id: "test" };
    const fakeOpts = { duration: 500 };
    const t = factory(fakeNode, fakeOpts);
    t.enter();
    assert.equal(receivedNode, fakeNode);
    assert.equal(receivedOpts, fakeOpts);
  });

  it("leave calls leaveFn with node and options", () => {
    let leaveCalled = false;
    const factory = defineTransition(
      () => ({ finished: Promise.resolve(), cancel() {} }),
      () => { leaveCalled = true; return { finished: Promise.resolve(), cancel() {} }; }
    );
    const t = factory({}, {});
    t.leave();
    assert.ok(leaveCalled);
  });

  it("cancels previous animation on new enter/leave", () => {
    let cancelCount = 0;
    const factory = defineTransition(
      () => ({ finished: Promise.resolve(), cancel() { cancelCount++; } }),
      () => ({ finished: Promise.resolve(), cancel() { cancelCount++; } })
    );
    const t = factory({}, {});
    t.enter();
    t.enter(); // should cancel previous
    assert.equal(cancelCount, 1);
    t.leave(); // should cancel previous
    assert.equal(cancelCount, 2);
  });

  it("destroy cancels current animation", () => {
    let cancelled = false;
    const factory = defineTransition(
      () => ({ finished: Promise.resolve(), cancel() { cancelled = true; } }),
      () => ({ finished: Promise.resolve(), cancel() {} })
    );
    const t = factory({}, {});
    t.enter();
    t.destroy();
    assert.ok(cancelled);
  });
});
