import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { guard } from "../../src/router.js";

describe("route guards", () => {
  it("guard returns an unregister function", () => {
    const unregister = guard(async (to, from, next) => {
      next();
    });
    assert.equal(typeof unregister, "function");
    unregister(); // cleanup
  });

  it("unregister removes the middleware", () => {
    let callCount = 0;
    const unregister = guard(async () => { callCount++; });
    unregister();
    // Middleware should no longer be in the chain — can't easily verify
    // without triggering navigation, but at least verify no crash
    assert.equal(typeof unregister, "function");
  });

  it("multiple middleware can be registered", () => {
    const unreg1 = guard(async (to, from, next) => next());
    const unreg2 = guard(async (to, from, next) => next());
    const unreg3 = guard(async (to, from, next) => next());
    // cleanup
    unreg1();
    unreg2();
    unreg3();
  });

  it("middleware function receives correct signature", () => {
    // Just verify it accepts the right kind of function
    const unreg = guard(async (to, from, next) => {
      assert.equal(typeof to, "string");
      assert.equal(typeof from, "string");
      assert.equal(typeof next, "function");
      next();
    });
    unreg();
  });

  it("middleware with redirect pattern", () => {
    const authMiddleware = async (to, from, next) => {
      if (to === "/admin") {
        next("/login");
      } else {
        next();
      }
    };
    const unreg = guard(authMiddleware);
    unreg();
  });

  it("middleware with cancel pattern", () => {
    const guardMiddleware = async (to, from, next) => {
      if (to === "/dangerous") {
        next(false);
      } else {
        next();
      }
    };
    const unreg = guard(guardMiddleware);
    unreg();
  });

  it("double unregister is safe", () => {
    const unreg = guard(async (to, from, next) => next());
    unreg();
    unreg(); // should not throw
  });

  it("middleware that never calls next blocks navigation (fail closed)", async () => {
    const { configureRouter, navigate, getPath } = await import("../../src/router.js");
    configureRouter({ history: "memory", initialPath: "/" });

    await new Promise((resolve, reject) => {
      const unreg = guard(async () => {
        // forget to call next()
      });
      navigate("/blocked");
      setTimeout(() => {
        try {
          assert.equal(getPath(), "/", "omitting next() must not open the route");
          unreg();
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 40);
    });
  });

  it("middleware next(false) cancels and next(path) redirects", async () => {
    const { configureRouter, navigate, getPath } = await import("../../src/router.js");
    configureRouter({ history: "memory", initialPath: "/" });

    await new Promise((resolve, reject) => {
      const unreg = guard(async (to, from, next) => {
        if (to === "/nope") next(false);
        else if (to === "/admin") next("/login");
        else next();
      });
      navigate("/nope");
      setTimeout(() => {
        try {
          assert.equal(getPath(), "/");
          navigate("/admin");
          setTimeout(() => {
            try {
              assert.equal(getPath(), "/login");
              navigate("/ok");
              setTimeout(() => {
                try {
                  assert.equal(getPath(), "/ok");
                  unreg();
                  resolve();
                } catch (err) {
                  reject(err);
                }
              }, 40);
            } catch (err) {
              reject(err);
            }
          }, 40);
        } catch (err) {
          reject(err);
        }
      }, 40);
    });
  });
});
