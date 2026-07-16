/**
 * Authentication primitives for Cachou.
 *
 * @module cachoujs/auth
 */
declare module "cachoujs/auth" {
  /** A signal getter that returns the current value of type T. */
  type SignalGetter<T> = () => T;

  export interface AuthConfig {
    /** POST endpoint for login (default "/api/auth/login"). */
    loginUrl?: string;
    /** POST endpoint for logout (default "/api/auth/logout"). */
    logoutUrl?: string;
    /** GET endpoint to fetch current user (default "/api/auth/me"). */
    userUrl?: string;
    /** Storage key for the auth token (default "auth-token"). */
    tokenKey?: string;
    /** Storage backend (default: localStorage). */
    storage?: Storage;
    /** Callback after successful login. */
    onLogin?: (user: any) => void;
    /** Callback after logout. */
    onLogout?: () => void;
    /** Custom fetch function (default: globalThis.fetch). */
    fetchFn?: typeof fetch;
  }

  export interface RouteGuardContext {
    next: () => any;
    [key: string]: any;
  }

  export interface RouteGuardResult {
    redirect: string;
  }

  export interface AuthController {
    // Reactive state
    /** Signal getter for the current user object (null if not logged in). */
    user: SignalGetter<any | null>;
    /** Whether the user is currently logged in. */
    isLoggedIn(): boolean;
    /** Get the current token from storage. */
    token(): string | null;
    /** Signal getter for loading state. */
    loading: SignalGetter<boolean>;

    // Actions
    /** Log in with credentials. Stores token and fetches user profile. */
    login(credentials: Record<string, any>): Promise<any>;
    /** Log out. Optionally POSTs to logoutUrl, then clears state. */
    logout(): Promise<void>;
    /** Re-fetch the current user from userUrl using the stored token. */
    refresh(): Promise<any | null>;

    // Token management
    /** Store or clear a token. */
    setToken(newToken: string | null): void;
    /** Build an Authorization header object with the Bearer token. */
    getAuthHeaders(): Record<string, string>;

    // Role checks
    /** Check if the current user has a specific role. */
    hasRole(role: string): boolean;
    /** Check if the current user has any of the given roles. */
    hasAnyRole(roles: string[]): boolean;

    // Route guards
    /**
     * Return a guard function that redirects unauthenticated users.
     * @param redirectTo - Path to redirect to (default "/login").
     */
    requireAuth(redirectTo?: string): (ctx: RouteGuardContext) => RouteGuardResult | any;
    /**
     * Return a guard function that requires a specific role.
     * @param role - Required role.
     * @param redirectTo - Redirect path if unauthorized (default "/login").
     */
    requireRole(role: string, redirectTo?: string): (ctx: RouteGuardContext) => RouteGuardResult | any;
  }

  /**
   * Create an auth controller with reactive state and route guards.
   */
  export function createAuth(config?: AuthConfig): AuthController;
}
