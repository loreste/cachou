import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../../src/reactivity.js";
import { createAuth } from "../../src/auth.js";

function mockStorage() {
  const store = {};
  return {
    getItem(k) { return store[k] ?? null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    _store: store
  };
}

describe("createAuth", () => {
  it("exports createAuth function", () => {
    assert.equal(typeof createAuth, "function");
  });

  it("returns correct shape", () => {
    createRoot(dispose => {
      const auth = createAuth({ storage: mockStorage() });
      assert.equal(typeof auth.user, "function");
      assert.equal(typeof auth.isLoggedIn, "function");
      assert.equal(typeof auth.token, "function");
      assert.equal(typeof auth.loading, "function");
      assert.equal(typeof auth.login, "function");
      assert.equal(typeof auth.logout, "function");
      assert.equal(typeof auth.setToken, "function");
      assert.equal(typeof auth.getAuthHeaders, "function");
      dispose();
    });
  });

  it("starts logged out", () => {
    createRoot(dispose => {
      const auth = createAuth({ storage: mockStorage() });
      assert.equal(auth.isLoggedIn(), false);
      assert.equal(auth.user(), null);
      assert.equal(auth.token(), null);
      dispose();
    });
  });

  it("setToken stores token", () => {
    createRoot(dispose => {
      const storage = mockStorage();
      const auth = createAuth({ storage });
      auth.setToken("abc123");
      assert.equal(auth.token(), "abc123");
      assert.ok(Object.values(storage._store).some(v => v === "abc123"));
      dispose();
    });
  });

  it("getAuthHeaders returns bearer token", () => {
    createRoot(dispose => {
      const auth = createAuth({ storage: mockStorage() });
      auth.setToken("mytoken");
      const headers = auth.getAuthHeaders();
      assert.ok(headers.Authorization);
      assert.ok(headers.Authorization.includes("mytoken"));
      dispose();
    });
  });

  it("getAuthHeaders returns empty when no token", () => {
    createRoot(dispose => {
      const auth = createAuth({ storage: mockStorage() });
      const headers = auth.getAuthHeaders();
      assert.ok(!headers.Authorization || headers.Authorization === "");
      dispose();
    });
  });

  it("requireAuth returns a function", () => {
    createRoot(dispose => {
      const auth = createAuth({ storage: mockStorage() });
      const guardFn = auth.requireAuth("/login");
      assert.equal(typeof guardFn, "function");
      dispose();
    });
  });

  it("requireAuth uses guard(to, from, next) and redirects when logged out", async () => {
    const { configureRouter, navigate, getPath, guard } = await import("../../src/router.js");
    configureRouter({ history: "memory", initialPath: "/" });

    await new Promise((resolve, reject) => {
      createRoot(dispose => {
        const auth = createAuth({ storage: mockStorage() });
        const unreg = guard(auth.requireAuth("/login"));
        navigate("/secret");
        setTimeout(() => {
          try {
            assert.equal(auth.isLoggedIn(), false);
            assert.equal(getPath(), "/login", "anonymous traffic must redirect");
            unreg();
            dispose();
            resolve();
          } catch (err) {
            reject(err);
          }
        }, 40);
      });
    });
  });

  it("requireAuth allows navigation when logged in", async () => {
    const { configureRouter, navigate, getPath, guard } = await import("../../src/router.js");
    configureRouter({ history: "memory", initialPath: "/" });

    await new Promise((resolve, reject) => {
      createRoot(async dispose => {
        try {
          const auth = createAuth({
            storage: mockStorage(),
            fetchFn: async () => ({
              ok: true,
              text: async () => JSON.stringify({ token: "t", user: { id: 1, role: "user" } }),
              json: async () => ({ token: "t", user: { id: 1, role: "user" } })
            })
          });
          await auth.login({ email: "a@b.c", password: "x" });
          assert.equal(auth.isLoggedIn(), true);

          const unreg = guard(auth.requireAuth("/login"));
          navigate("/app");
          setTimeout(() => {
            try {
              assert.equal(getPath(), "/app");
              unreg();
              dispose();
              resolve();
            } catch (err) {
              reject(err);
            }
          }, 40);
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  it("requireRole redirects when role is missing", async () => {
    const { configureRouter, navigate, getPath, guard } = await import("../../src/router.js");
    configureRouter({ history: "memory", initialPath: "/" });

    await new Promise((resolve, reject) => {
      createRoot(async dispose => {
        try {
          const auth = createAuth({
            storage: mockStorage(),
            fetchFn: async () => ({
              ok: true,
              text: async () => JSON.stringify({ token: "t", user: { id: 1, role: "user" } }),
              json: async () => ({ token: "t", user: { id: 1, role: "user" } })
            })
          });
          await auth.login({ email: "a@b.c", password: "x" });
          const unreg = guard(auth.requireRole("admin", "/unauthorized"));
          navigate("/admin");
          setTimeout(() => {
            try {
              assert.equal(getPath(), "/unauthorized");
              unreg();
              dispose();
              resolve();
            } catch (err) {
              reject(err);
            }
          }, 40);
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  it("requireRole returns a function", () => {
    createRoot(dispose => {
      const auth = createAuth({ storage: mockStorage() });
      const guardFn = auth.requireRole("admin", "/unauthorized");
      assert.equal(typeof guardFn, "function");
      dispose();
    });
  });

  it("hasRole returns false when not logged in", () => {
    createRoot(dispose => {
      const auth = createAuth({ storage: mockStorage() });
      assert.equal(auth.hasRole("admin"), false);
      dispose();
    });
  });

  it("hasAnyRole returns false when not logged in", () => {
    createRoot(dispose => {
      const auth = createAuth({ storage: mockStorage() });
      assert.equal(auth.hasAnyRole(["admin", "editor"]), false);
      dispose();
    });
  });

  it("loading starts false", () => {
    createRoot(dispose => {
      const auth = createAuth({ storage: mockStorage() });
      assert.equal(auth.loading(), false);
      dispose();
    });
  });

  it("restores token from storage on init", () => {
    createRoot(dispose => {
      const storage = mockStorage();
      storage.setItem("auth-token", "stored-token");
      const auth = createAuth({ storage, tokenKey: "auth-token" });
      assert.equal(auth.token(), "stored-token");
      dispose();
    });
  });

  it("logout clears token and user", () => {
    createRoot(dispose => {
      const auth = createAuth({ storage: mockStorage() });
      auth.setToken("abc");
      // Logout should clear
      auth.logout().catch(() => {}); // may fail without real endpoint
      // Token should be cleared synchronously by logout
      setTimeout(() => {
        assert.equal(auth.token(), null);
        dispose();
      }, 10);
    });
  });
});
