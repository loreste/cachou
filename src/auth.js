/**
 * CachouJS Authentication Primitives
 *
 * Lightweight auth state management and route protection
 * built on reactive signals.
 *
 * @module cachoujs/auth
 */

import { signal, batch } from "./reactivity.js";
import { sanitizeAuthToken } from "./security.js";

/* ------------------------------------------------------------------ */
/*  SSR-safe storage                                                  */
/* ------------------------------------------------------------------ */

const noopStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

/**
 * @param {Storage | null | undefined} storage
 * @param {"local" | "session" | "none"} [persist]
 */
function getStorage(storage, persist = "local") {
  if (storage) return storage;
  if (persist === "none") return noopStorage;
  if (persist === "session" && typeof sessionStorage !== "undefined") return sessionStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  if (typeof sessionStorage !== "undefined") return sessionStorage;
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
 * @param {"local"|"session"|"none"} [config.persist="local"] - Prefer sessionStorage for XSS resilience.
 * @param {RequestCredentials} [config.credentials] - Fetch credentials mode (e.g. "same-origin" for cookie sessions).
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
  const persist = config.persist === "session" || config.persist === "none" ? config.persist : "local";
  const storage = getStorage(config.storage, persist);
  const credentials = config.credentials;
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
      return sanitizeAuthToken(storage.getItem(tokenKey));
    } catch (_) {
      return null;
    }
  }

  /**
   * Store a new token (control characters / oversized values are rejected).
   * @param {string|null} newToken
   */
  function setToken(newToken) {
    try {
      const safe = sanitizeAuthToken(newToken);
      if (safe) {
        storage.setItem(tokenKey, safe);
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

    const response = await fetchFn(url, {
      ...options,
      headers,
      ...(credentials ? { credentials } : {})
    });

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
   * Compatible with the router's `guard(fn)` signature: `(to, from, next, signal?)`.
   *
   * @param {string} [redirectTo="/login"] - Path to redirect to.
   * @returns {Function} Guard function compatible with `guard(fn)`.
   */
  function pathOnly(path) {
    return String(path || "").split("?")[0];
  }

  function requireAuth(redirectTo = "/login") {
    return (to, from, next) => {
      if (!isLoggedIn()) {
        // Allow the redirect target itself so middleware redirects do not loop.
        if (pathOnly(to) === pathOnly(redirectTo)) {
          next();
          return;
        }
        next(redirectTo);
        return;
      }
      next();
    };
  }

  /**
   * Return a guard function that requires a specific role.
   * Compatible with `guard(fn)`: `(to, from, next, signal?)`.
   *
   * @param {string} role - Required role.
   * @param {string} [redirectTo="/login"] - Redirect path if unauthorized.
   * @returns {Function} Guard function compatible with `guard(fn)`.
   */
  function requireRole(role, redirectTo = "/login") {
    return (to, from, next) => {
      if (!isLoggedIn() || !hasRole(role)) {
        if (pathOnly(to) === pathOnly(redirectTo)) {
          next();
          return;
        }
        next(redirectTo);
        return;
      }
      next();
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
