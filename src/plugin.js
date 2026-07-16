/**
 * Application bootstrap and plugin system for CachouJS.
 *
 * `launch()` creates an app instance. Plugins are installed with `app.plug()`.
 * Global components, directives, and provided values are registered before
 * mounting to the DOM.
 */

import { createContext, useContext, createRoot, onCleanup } from "./reactivity.js";
import { mount, unmount } from "./html.js";

/** @type {import("./reactivity.js").Context<App|null>} */
const AppContext = createContext(null);

/**
 * Return the current app instance from inside a component tree.
 * Must be called during component execution within an app mounted via `launch`.
 *
 * @returns {App|null}
 */
export function getApp() {
  return useContext(AppContext);
}

/** @deprecated Use `getApp()` instead — will be removed in 1.0. */
export function useApp() {
  if (typeof console !== "undefined") console.warn("[cachou] useApp() is deprecated. Use getApp() instead.");
  return getApp();
}

/**
 * Create an application instance.
 *
 * @param {Function} rootComponent  Root component function.
 * @param {object}   [rootProps={}] Props forwarded to the root component.
 * @returns {App}
 *
 * @example
 * const app = launch(App, { title: "Hello" });
 * app.plug(myPlugin);
 * app.provide("theme", "dark");
 * app.mount("#app");
 */
export function launch(rootComponent, rootProps = {}) {
  /** @type {Set<object|Function>} Installed plugins (de-duplicate). */
  const installedPlugins = new Set();

  /** @type {Map<string, Function>} Global component registry. */
  const globalComponents = new Map();

  /** @type {Map<string, Function>} Global directive registry. */
  const globalDirectives = new Map();

  /** @type {Map<any, any>} Provided values (key -> value). */
  const provides = new Map();

  /** @type {Function|null} Disposer returned by mount(). */
  let disposer = null;

  /** @type {Element|null} Current mount target. */
  let mountTarget = null;

  /** @type {boolean} */
  let isMounted = false;

  /**
   * App configuration object.
   * App configuration surface.
   *
   * @type {{ errorHandler: Function|null, warnHandler: Function|null, globalProperties: object }}
   */
  const config = {
    /** Custom global error handler. Receives `(err, instance, info)`. */
    errorHandler: null,
    /** Custom warning handler. Receives `(msg, instance, trace)`. */
    warnHandler: null,
    /**
     * Properties merged onto every component's props.
     * Use sparingly — prefer provide/inject for DI.
     */
    globalProperties: {}
  };

  /** @type {App} */
  const app = {
    config,

    /**
     * Install a plugin.
     *
     * A plugin is either an object with an `install(app, ...options)` method,
     * or a bare function treated as the install function itself.
     * Each plugin is installed at most once.
     *
     * @param {object|Function} plugin
     * @param {...any} options  Forwarded to the plugin's install function.
     * @returns {App} The app instance for chaining.
     */
    plug(plugin, ...options) {
      if (installedPlugins.has(plugin)) return app;
      installedPlugins.add(plugin);

      if (typeof plugin === "function") {
        plugin(app, ...options);
      } else if (plugin && typeof plugin.install === "function") {
        plugin.install(app, ...options);
      } else {
        if (typeof console !== "undefined" && typeof console.warn === "function") {
          console.warn("⚡ [CachouJS Plugin]: plugin must be a function or have an install() method.");
        }
      }
      return app;
    },

    /**
     * Provide a value that can be injected by any descendant component
     * via `useContext`.
     *
     * Internally creates a context object and wraps the root with its
     * Provider. Values are accumulated until `mount()` is called.
     *
     * @param {any} key   Arbitrary key (string, symbol, context object).
     * @param {any} value Value to provide.
     * @returns {App}
     */
    provide(key, value) {
      provides.set(key, value);
      return app;
    },

    /**
     * Register a global component by name.
     *
     * @param {string}   name      Component name.
     * @param {Function} [component] Component function. Omit to look up.
     * @returns {App|Function|undefined}
     */
    component(name, component) {
      if (component === undefined) {
        return globalComponents.get(name);
      }
      globalComponents.set(name, component);
      return app;
    },

    /**
     * Register a global directive by name.
     *
     * @param {string}   name        Directive name.
     * @param {Function} [directiveFn] Directive function. Omit to look up.
     * @returns {App|Function|undefined}
     */
    directive(name, directiveFn) {
      if (directiveFn === undefined) {
        return globalDirectives.get(name);
      }
      globalDirectives.set(name, directiveFn);
      return app;
    },

    /**
     * Mount the application to a DOM element.
     *
     * @param {string|Element} selectorOrElement  CSS selector or DOM element.
     * @returns {App}
     */
    mount(selectorOrElement) {
      if (isMounted) {
        if (typeof console !== "undefined" && typeof console.warn === "function") {
          console.warn("⚡ [CachouJS Plugin]: app is already mounted. Call app.unmount() first.");
        }
        return app;
      }

      const root = typeof selectorOrElement === "string"
        ? document.querySelector(selectorOrElement)
        : selectorOrElement;

      if (!root) {
        throw new Error(`⚡ [CachouJS Plugin]: mount target "${selectorOrElement}" not found.`);
      }

      mountTarget = root;

      // Build provider wrapper chain for all provide() calls
      const RootWrapper = () => {
        // Wrap children in AppContext provider
        return AppContext.Provider({
          value: app,
          children: () => {
            // Build nested providers for user-supplied provide() calls
            let inner = () => rootComponent(rootProps);
            for (const [key, value] of provides) {
              // If key is a context object (has .Provider), wrap with it
              if (key && typeof key === "object" && typeof key.Provider === "function") {
                const ctx = key;
                const val = value;
                const prev = inner;
                inner = () => ctx.Provider({ value: val, children: prev });
              }
            }
            return inner();
          }
        });
      };

      disposer = mount(RootWrapper, root);
      isMounted = true;
      return app;
    },

    /**
     * Unmount the application and run all cleanup.
     */
    unmount() {
      if (!isMounted) return;
      if (disposer) {
        disposer();
        disposer = null;
      } else if (mountTarget) {
        unmount(mountTarget);
      }
      isMounted = false;
      mountTarget = null;
    },

    /**
     * Check whether the app is currently mounted.
     * @returns {boolean}
     */
    get isMounted() {
      return isMounted;
    },

    /**
     * Access the global component registry.
     * @returns {Map<string, Function>}
     */
    get _components() {
      return globalComponents;
    },

    /**
     * Access the global directive registry.
     * @returns {Map<string, Function>}
     */
    get _directives() {
      return globalDirectives;
    },

    /**
     * Access the provide map (for plugins that need to inspect/extend).
     * @returns {Map<any, any>}
     */
    get _provides() {
      return provides;
    }
  };

  return app;
}

/** @deprecated Use `launch()` instead — will be removed in 1.0. */
export function createApp(rootComponent, rootProps = {}) {
  if (typeof console !== "undefined") console.warn("[cachou] createApp() is deprecated. Use launch() instead.");
  return launch(rootComponent, rootProps);
}
