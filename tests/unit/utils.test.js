import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal, effect, createRoot } from "../../src/reactivity.js";
import {
  debounce,
  throttle,
  useMedia,
  useBreakpoint,
  useColorMode,
  useClipboard,
  useOnline,
  useIdle
} from "../../src/utils.js";

describe("debounce", () => {
  it("returns initial value immediately", () => {
    createRoot(dispose => {
      const [val] = signal(42);
      const debounced = debounce(val, 100);
      assert.equal(debounced(), 42);
      dispose();
    });
  });

  it("returns a function", () => {
    createRoot(dispose => {
      const [val] = signal(0);
      const debounced = debounce(val, 50);
      assert.equal(typeof debounced, "function");
      dispose();
    });
  });

  it("debounces updates", async () => {
    await new Promise(resolve => {
      createRoot(dispose => {
        const [val, setVal] = signal(0);
        const debounced = debounce(val, 30);

        // Initial value should be 0
        assert.equal(debounced(), 0);

        // Rapid updates
        setVal(1);
        setVal(2);
        setVal(3);

        // Should still be 0 (not yet debounced)
        assert.equal(debounced(), 0);

        setTimeout(() => {
          assert.equal(debounced(), 3);
          dispose();
          resolve();
        }, 60);
      });
    });
  });

  it("handles leading option", () => {
    createRoot(dispose => {
      const [val, setVal] = signal(0);
      const debounced = debounce(val, 100, { leading: true });
      // Leading fires immediately with initial value
      assert.equal(debounced(), 0);
      dispose();
    });
  });

  it("handles zero delay", async () => {
    await new Promise(resolve => {
      createRoot(dispose => {
        const [val, setVal] = signal("a");
        const debounced = debounce(val, 0);
        setVal("b");
        setTimeout(() => {
          assert.equal(debounced(), "b");
          dispose();
          resolve();
        }, 10);
      });
    });
  });
});

describe("throttle", () => {
  it("returns initial value immediately", () => {
    createRoot(dispose => {
      const [val] = signal(42);
      const throttled = throttle(val, 100);
      assert.equal(throttled(), 42);
      dispose();
    });
  });

  it("emits latest value after interval", async () => {
    await new Promise(resolve => {
      createRoot(dispose => {
        const [val, setVal] = signal(0);
        const throttled = throttle(val, 30);
        setVal(1);
        // After interval, the value should be captured
        setTimeout(() => {
          assert.equal(throttled(), 1);
          dispose();
          resolve();
        }, 50);
      });
    });
  });

  it("throttles rapid changes", async () => {
    await new Promise(resolve => {
      createRoot(dispose => {
        const [val, setVal] = signal(0);
        const throttled = throttle(val, 50);

        setVal(1); // goes through (first)
        setVal(2); // throttled
        setVal(3); // throttled

        // Latest should be captured after interval
        setTimeout(() => {
          assert.equal(throttled(), 3);
          dispose();
          resolve();
        }, 80);
      });
    });
  });
});

// --- SSR-safe tests (these run in Node without a window) ---

describe("useMedia (SSR)", () => {
  it("returns false on server", () => {
    createRoot(dispose => {
      const matches = useMedia("(min-width: 768px)");
      assert.equal(matches(), false);
      dispose();
    });
  });

  it("returns a function", () => {
    createRoot(dispose => {
      const matches = useMedia("(max-width: 1024px)");
      assert.equal(typeof matches, "function");
      dispose();
    });
  });
});

describe("useBreakpoint (SSR)", () => {
  it("returns object with expected shape", () => {
    createRoot(dispose => {
      const bp = useBreakpoint();
      assert.equal(typeof bp.current, "function");
      assert.equal(typeof bp.between, "function");
      assert.equal(typeof bp.sm, "function");
      assert.equal(typeof bp.md, "function");
      assert.equal(typeof bp.lg, "function");
      assert.equal(typeof bp.xl, "function");
      assert.equal(typeof bp.xxl, "function");
      dispose();
    });
  });

  it("current returns xs on server (nothing matches)", () => {
    createRoot(dispose => {
      const bp = useBreakpoint();
      assert.equal(bp.current(), "xs");
      dispose();
    });
  });

  it("all breakpoints false on server", () => {
    createRoot(dispose => {
      const bp = useBreakpoint();
      assert.equal(bp.sm(), false);
      assert.equal(bp.md(), false);
      assert.equal(bp.lg(), false);
      dispose();
    });
  });

  it("accepts custom breakpoints", () => {
    createRoot(dispose => {
      const bp = useBreakpoint({ mobile: 320, tablet: 768, desktop: 1200 });
      assert.equal(typeof bp.mobile, "function");
      assert.equal(typeof bp.tablet, "function");
      assert.equal(typeof bp.desktop, "function");
      assert.equal(bp.current(), "xs");
      dispose();
    });
  });

  it("between returns a getter", () => {
    createRoot(dispose => {
      const bp = useBreakpoint();
      const getter = bp.between("sm", "lg");
      assert.equal(typeof getter, "function");
      assert.equal(getter(), false); // server
      dispose();
    });
  });

  it("between with invalid names returns false", () => {
    createRoot(dispose => {
      const bp = useBreakpoint();
      const getter = bp.between("nope", "also-nope");
      assert.equal(getter(), false);
      dispose();
    });
  });
});

describe("useColorMode (SSR)", () => {
  it("returns correct shape", () => {
    createRoot(dispose => {
      const cm = useColorMode();
      assert.equal(typeof cm.mode, "function");
      assert.equal(typeof cm.setMode, "function");
      assert.equal(typeof cm.isDark, "function");
      assert.equal(typeof cm.isLight, "function");
      assert.equal(typeof cm.toggle, "function");
      dispose();
    });
  });

  it("defaults to system mode", () => {
    createRoot(dispose => {
      const cm = useColorMode();
      assert.equal(cm.mode(), "system");
      dispose();
    });
  });

  it("isDark follows system (false on server since media query returns false)", () => {
    createRoot(dispose => {
      const cm = useColorMode();
      // On server, prefers-color-scheme returns false, so isDark is false
      assert.equal(cm.isDark(), false);
      assert.equal(cm.isLight(), true);
      dispose();
    });
  });

  it("setMode updates mode signal", () => {
    createRoot(dispose => {
      const cm = useColorMode();
      cm.setMode("dark");
      assert.equal(cm.mode(), "dark");
      assert.equal(cm.isDark(), true);
      dispose();
    });
  });

  it("toggle switches between dark and light", () => {
    createRoot(dispose => {
      const cm = useColorMode();
      cm.setMode("light");
      assert.equal(cm.isDark(), false);
      cm.toggle();
      assert.equal(cm.mode(), "dark");
      assert.equal(cm.isDark(), true);
      cm.toggle();
      assert.equal(cm.mode(), "light");
      dispose();
    });
  });

  it("accepts initial option", () => {
    createRoot(dispose => {
      const cm = useColorMode({ initial: "dark" });
      assert.equal(cm.mode(), "dark");
      dispose();
    });
  });
});

describe("useClipboard (SSR)", () => {
  it("returns correct shape", () => {
    const { copy, copied, text } = useClipboard();
    assert.equal(typeof copy, "function");
    assert.equal(typeof copied, "function");
    assert.equal(typeof text, "function");
  });

  it("initially not copied", () => {
    const { copied, text } = useClipboard();
    assert.equal(copied(), false);
    assert.equal(text(), "");
  });
});

describe("useOnline (SSR)", () => {
  it("returns true on server", () => {
    createRoot(dispose => {
      const online = useOnline();
      assert.equal(online(), true);
      dispose();
    });
  });

  it("returns a function", () => {
    createRoot(dispose => {
      const online = useOnline();
      assert.equal(typeof online, "function");
      dispose();
    });
  });
});

describe("useIdle (SSR)", () => {
  it("returns correct shape", () => {
    createRoot(dispose => {
      const { idle, lastActive } = useIdle();
      assert.equal(typeof idle, "function");
      assert.equal(typeof lastActive, "function");
      dispose();
    });
  });

  it("not idle initially", () => {
    createRoot(dispose => {
      const { idle } = useIdle();
      assert.equal(idle(), false);
      dispose();
    });
  });

  it("accepts custom timeout", () => {
    createRoot(dispose => {
      const { idle } = useIdle(1000);
      assert.equal(idle(), false);
      dispose();
    });
  });

  it("lastActive is 0 on server (no window)", () => {
    createRoot(dispose => {
      const { lastActive } = useIdle();
      // On server (no window), lastActive initializes to 0
      assert.equal(lastActive(), 0);
      dispose();
    });
  });
});
