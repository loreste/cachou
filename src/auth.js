/**
 * CachouJS Authentication Primitives
 *
 * Lightweight auth state management and route protection
 * built on reactive signals.
 *
 * @module cachoujs/auth
 */

import { signal, batch } from "./reactivity.js";

/* ------------------------------------------------------------------ */
/*  SSR-safe storage                                                  */
/* ------------------------------------------------------------------ */

const noopStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

function getStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== "undefined") return localStorage;
  return noopStorage;
}

/* ------------------------------------------------------------------ */
/*  createAuth                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create an auth controller with reactive state and route guards.
 *
 * @param {Object} config
 * @param {string} [config.loginUrl="/api/auth/login"] - POST endpoint for login.
 * @param {string} [config.logoutUrl="/api/auth/logout"] - POST endpoint for logout.
 * @param {string} [config.userUrl="/api/auth/me"] - GET endpoint to fetch current user.
 * @param {string} [config.tokenKey="auth-token"] - Storage key for the auth token.
 * @param {Storage} [config.storage] - Storage backend (default: localStorage).
 * @param {Function} [config.onLogin] - Callback after successful login.
 * @param {Function} [config.onLogout] - Callback after logout.
 * @param {Function} [config.fetchFn] - Custom fetch function (default: globalThis.fetch).
 * @returns {Object} Auth controller
 */
export function createAuth(config = {}) {
  const loginUrl = config.loginUrl || "/api/auth/login";
  const logoutUrl = config.logoutUrl || "/api/auth/logout";
  const userUrl = config.userUrl || "/api/auth/me";
  const tokenKey = config.tokenKey || "auth-token";
  const storage = getStorage(config.storage);
  const fetchFn = config.fetchFn || (typeof fetch !== "undefined" ? fetch : null);

  /* ---- Reactive state ---- */
  const [user, setUser] = signal(null);
  const [loading, setLoading] = signal(false);

  /* ---- Token management ---- */

  /**
   * Get the current token from storage.
   * @returns {string|null}
   */
  function token() {
    try {
      return storage.getItem(tokenKey) || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Store a new token.
   * @param {string|null} newToken
   */
  function setToken(newToken) {
    try {
      if (newToken) {
        storage.setItem(tokenKey, newToken);
      } else {
        storage.removeItem(tokenKey);
      }
    } catch (_) {
      // Storage may be unavailable (SSR, private browsing, etc.)
    }
  }

  /**
   * Whether the user is currently logged in.
   * @returns {boolean}
   */
  function isLoggedIn() {
    return user() !== null;
  }

  /**
   * Build an Authorization header object with the Bearer token.
   * @returns {Object}
   */
  function getAuthHeaders() {
    const t = token();
    if (!t) return {};
    return { Authorization: `Bearer ${t}` };
  }

  /* ---- Internal fetch helper ---- */

  async function authFetch(url, options = {}) {
    if (!fetchFn) {
      throw new Error("fetch is not available. Provide a custom fetchFn in createAuth config.");
    }

    const headers = {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(options.headers || {}),
    };

    const response = await fetchFn(url, { ...options, headers });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const err = new Error(body.message || body.error || `Auth request failed (${response.status})`);
      err.status = response.status;
      err.body = body;
      throw err;
    }

    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  /* ---- Actions ---- */

  /**
   * Log in with credentials. Stores token and fetches user profile.
   *
   * @param {Object} credentials - e.g. { email, password }
   * @returns {Promise<Object>} The user object
   */
  async function login(credentials) {
    setLoading(true);
    try {
      const result = await authFetch(loginUrl, {
        method: "POST",
        body: JSON.stringify(credentials),
      });

      const newToken = result && (result.token || result.access_token);
      if (newToken) {
        setToken(newToken);
      }

      const userData = result && (result.user || result);
      batch(() => {
        setUser(userData);
        setLoading(false);
      });

      if (typeof config.onLogin === "function") {
        config.onLogin(userData);
      }

      return userData;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  }

  /**
   * Log out. Optionally POSTs to logoutUrl, then clears state.
   * @returns {Promise<void>}
   */
  async function logout() {
    setLoading(true);
    try {
      if (logoutUrl) {
        await authFetch(logoutUrl, { method: "POST" }).catch(() => {});
      }
    } finally {
      batch(() => {
        setToken(null);
        setUser(null);
        setLoading(false);
      });

      if (typeof config.onLogout === "function") {
        config.onLogout();
      }
    }
  }

  /**
   * Re-fetch the current user from userUrl using the stored token.
   * @returns {Promise<Object|null>}
   */
  async function refresh() {
    const t = token();
    if (!t) {
      setUser(null);
      return null;
    }

    setLoading(true);
    try {
      const userData = await authFetch(userUrl, { method: "GET" });
      batch(() => {
        setUser(userData);
        setLoading(false);
      });
      return userData;
    } catch (err) {
      batch(() => {
        setToken(null);
        setUser(null);
        setLoading(false);
      });
      return null;
    }
  }

  /* ---- Role checks ---- */

  /**
   * Extract roles from user object. Supports `roles` array or `role` string.
   * @returns {string[]}
   */
  function getUserRoles() {
    const u = user();
    if (!u) return [];
    if (Array.isArray(u.roles)) return u.roles;
    if (typeof u.role === "string") return [u.role];
    if (Array.isArray(u.role)) return u.role;
    return [];
  }

  /**
   * Check if the current user has a specific role.
   * @param {string} role
   * @returns {boolean}
   */
  function hasRole(role) {
    return getUserRoles().includes(role);
  }

  /**
   * Check if the current user has any of the given roles.
   * @param {string[]} roles
   * @returns {boolean}
   */
  function hasAnyRole(roles) {
    const userRoles = getUserRoles();
    return roles.some((r) => userRoles.includes(r));
  }

  /* ---- Route guards ---- */

  /**
   * Return a guard function that redirects unauthenticated users.
   * For use with the router's `guard()` function.
   *
   * @param {string} [redirectTo="/login"] - Path to redirect to.
   * @returns {Function} Guard function compatible with `guard(fn)`.
   */
  function requireAuth(redirectTo = "/login") {
    return (ctx) => {
      if (!isLoggedIn()) {
        if (typeof ctx.next === "function") {
          // Prevent navigation and redirect
        }
        return { redirect: redirectTo };
      }
      return ctx.next();
    };
  }

  /**
   * Return a guard function that requires a specific role.
   *
   * @param {string} role - Required role.
   * @param {string} [redirectTo="/login"] - Redirect path if unauthorized.
   * @returns {Function} Guard function compatible with `guard(fn)`.
   */
  function requireRole(role, redirectTo = "/login") {
    return (ctx) => {
      if (!isLoggedIn() || !hasRole(role)) {
        return { redirect: redirectTo };
      }
      return ctx.next();
    };
  }

  /* ---- Auto-refresh on init ---- */

  if (typeof window !== "undefined" && token()) {
    // Auto-fetch user profile if a token exists
    refresh().catch(() => {});
  }

  /* ---- Public API ---- */

  return {
    // Reactive state
    user,
    isLoggedIn,
    token,
    loading,

    // Actions
    login,
    logout,
    refresh,

    // Token management
    setToken,
    getAuthHeaders,

    // Role checks
    hasRole,
    hasAnyRole,

    // Route guards
    requireAuth,
    requireRole,
  };
}
