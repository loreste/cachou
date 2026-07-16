import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../../src/reactivity.js";
import { machine } from "../../src/machine.js";

function trafficLight() {
  return machine({
    initial: "red",
    states: {
      red: { on: { NEXT: "green" } },
      green: { on: { NEXT: "yellow" } },
      yellow: { on: { NEXT: "red" } }
    }
  });
}

describe("machine — basics", () => {
  it("starts in initial state", () => {
    createRoot(dispose => {
      const m = trafficLight();
      assert.equal(m.state(), "red");
      dispose();
    });
  });

  it("transitions on send", () => {
    createRoot(dispose => {
      const m = trafficLight();
      m.send("NEXT");
      assert.equal(m.state(), "green");
      m.send("NEXT");
      assert.equal(m.state(), "yellow");
      m.send("NEXT");
      assert.equal(m.state(), "red");
      dispose();
    });
  });

  it("ignores invalid events", () => {
    createRoot(dispose => {
      const m = trafficLight();
      m.send("INVALID");
      assert.equal(m.state(), "red");
      dispose();
    });
  });

  it("can() returns whether event is valid", () => {
    createRoot(dispose => {
      const m = trafficLight();
      assert.equal(m.can("NEXT"), true);
      assert.equal(m.can("INVALID"), false);
      dispose();
    });
  });

  it("matches() checks current state", () => {
    createRoot(dispose => {
      const m = trafficLight();
      assert.equal(m.matches("red"), true);
      assert.equal(m.matches("green"), false);
      m.send("NEXT");
      assert.equal(m.matches("green"), true);
      assert.equal(m.matches("red"), false);
      dispose();
    });
  });

  it("reset() returns to initial state", () => {
    createRoot(dispose => {
      const m = trafficLight();
      m.send("NEXT");
      m.send("NEXT");
      assert.equal(m.state(), "yellow");
      m.reset();
      assert.equal(m.state(), "red");
      dispose();
    });
  });
});

describe("machine — context", () => {
  it("maintains context", () => {
    createRoot(dispose => {
      const m = machine({
        initial: "idle",
        states: {
          idle: { on: { START: "running" } },
          running: { on: { STOP: "idle" } }
        },
        context: { count: 0 }
      });
      assert.deepEqual(m.context(), { count: 0 });
      dispose();
    });
  });

  it("setContext merges into context", () => {
    createRoot(dispose => {
      const m = machine({
        initial: "idle",
        states: { idle: { on: { GO: "done" } }, done: {} },
        context: { a: 1, b: 2 }
      });
      m.setContext({ b: 99, c: 3 });
      const ctx = m.context();
      assert.equal(ctx.a, 1);
      assert.equal(ctx.b, 99);
      assert.equal(ctx.c, 3);
      dispose();
    });
  });
});

describe("machine — guards", () => {
  it("blocks transition when guard returns false", () => {
    createRoot(dispose => {
      const m = machine({
        initial: "idle",
        states: {
          idle: {
            on: {
              SUBMIT: { target: "submitting", guard: (ctx) => ctx.valid }
            }
          },
          submitting: {}
        },
        context: { valid: false }
      });
      m.send("SUBMIT");
      assert.equal(m.state(), "idle"); // blocked
      m.setContext({ valid: true });
      m.send("SUBMIT");
      assert.equal(m.state(), "submitting"); // allowed
      dispose();
    });
  });
});

describe("machine — final states", () => {
  it("prevents transitions out of final state", () => {
    createRoot(dispose => {
      const m = machine({
        initial: "active",
        states: {
          active: { on: { FINISH: "done" } },
          done: { final: true, on: { RESTART: "active" } }
        }
      });
      m.send("FINISH");
      assert.equal(m.state(), "done");
      m.send("RESTART"); // should be blocked
      assert.equal(m.state(), "done");
      dispose();
    });
  });
});

describe("machine — onTransition", () => {
  it("fires callback on transition", () => {
    createRoot(dispose => {
      const m = trafficLight();
      const transitions = [];
      m.onTransition((from, to, event) => {
        transitions.push({ from, to, event });
      });
      m.send("NEXT");
      m.send("NEXT");
      assert.equal(transitions.length, 2);
      assert.equal(transitions[0].from, "red");
      assert.equal(transitions[0].to, "green");
      assert.equal(transitions[0].event, "NEXT");
      assert.equal(transitions[1].from, "green");
      assert.equal(transitions[1].to, "yellow");
      dispose();
    });
  });
});

describe("machine — actions", () => {
  it("runs action on transition", () => {
    createRoot(dispose => {
      let actionRan = false;
      const m = machine({
        initial: "off",
        states: {
          off: {
            on: {
              TOGGLE: { target: "on", action: () => { actionRan = true; } }
            }
          },
          on: { on: { TOGGLE: "off" } }
        }
      });
      m.send("TOGGLE");
      assert.ok(actionRan);
      assert.equal(m.state(), "on");
      dispose();
    });
  });
});

describe("machine — edge cases", () => {
  it("handles single-state machine", () => {
    createRoot(dispose => {
      const m = machine({
        initial: "only",
        states: { only: {} }
      });
      assert.equal(m.state(), "only");
      m.send("ANYTHING");
      assert.equal(m.state(), "only");
      dispose();
    });
  });

  it("handles rapid sends", () => {
    createRoot(dispose => {
      const m = trafficLight();
      for (let i = 0; i < 100; i++) m.send("NEXT");
      // 100 transitions: 100 % 3 = 1, so state should be green (1 past red)
      assert.equal(m.state(), "green");
      dispose();
    });
  });

  it("send with unknown state in config is safe", () => {
    createRoot(dispose => {
      const m = machine({
        initial: "a",
        states: {
          a: { on: { GO: "b" } },
          b: {}
        }
      });
      m.send("GO");
      assert.equal(m.state(), "b");
      m.send("GO"); // no transitions defined for b
      assert.equal(m.state(), "b");
      dispose();
    });
  });
});
