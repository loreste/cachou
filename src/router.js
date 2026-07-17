import { createContext, createResource, onCleanup, useContext, signal, memo, emitFrameworkEvent } from "./reactivity.js";
import { getActiveSSRContext, getRequestEvent } from "./ssr-context.js";
import { html } from "./html.js";
import {
  currentPath,
  currentSearch,
  setSSRPath,
  configureRouter,
  getHistoryMode,
  applyNavigation,
  setHistoryNavigationHandler,
  go,
  back,
  forward
} from "./router-state.js";

const isClient = typeof window !== "undefined";
export { setSSRPath, configureRouter, getHistoryMode, go, back, forward };
const navigationGuards = new Set();
/** @type {Function[]} Global middleware chain (runs before route resolution). */
const globalMiddleware = [];
let navigationSequence = 0;
let activeNavigationController = null;
let activeNavigationSettler = null;
let lastRouteParams = {};
let lastRouteData = undefined;
let lastNotFound = false;

const OutletContext = createContext({
  child: null,
  params: {}
});

const RouteDataContext = createContext({
  data: () => undefined,
  loading: () => false,
  error: () => null,
  refetch: async () => {},
  params: {}
});

const ActionContext = createContext(null);

export function getPath() {
  return currentPath();
}

export function getQueryParams() {
  const params = new URLSearchParams(currentSearch());
  const obj = {};
  for (const [key, value] of params.entries()) {
    obj[key] = value;
  }
  return obj;
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch (err) {
    return segment;
  }
}

export function beforeNavigate(handler) {
  navigationGuards.add(handler);
  return () => navigationGuards.delete(handler);
}

/**
 * Register a global route guard that runs before every route resolution.
 *
 * Guard signature: `async (to, from, next) => {}`
 * - Call `next()` to proceed to the next guard or route.
 * - Call `next('/login')` to redirect to a different path.
 * - Call `next(false)` to cancel the navigation.
 *
 * @param {Function} guardFn
 * @returns {Function} Unregister function.
 */
export function guard(guardFn) {
  globalMiddleware.push(guardFn);
  return () => {
    const idx = globalMiddleware.indexOf(guardFn);
    if (idx !== -1) globalMiddleware.splice(idx, 1);
  };
}

/** @deprecated Use `guard()` instead — will be removed in 1.0. */
export function addMiddleware(guardFn) {
  if (typeof console !== "undefined") console.warn("[cachou] addMiddleware() is deprecated. Use guard() instead.");
  return guard(guardFn);
}

/**
 * Run a chain of middleware functions sequentially.
 *
 * @param {Function[]} chain   Array of middleware functions.
 * @param {string}     to      Target path.
 * @param {string}     from    Current path.
 * @returns {Promise<{ proceed: boolean, redirect: string|null }>}
 * @private
 */
async function runMiddlewareChain(chain, to, from, signal) {
  let index = 0;
  // Fail closed: navigation only proceeds when the chain explicitly calls next()
  // through to the end. Omitting next() cancels (does not open by default).
  let result = { proceed: false, redirect: null };

  async function next(arg) {
    if (signal?.aborted) {
      result = { proceed: false, redirect: null };
      return;
    }
    if (arg === false) {
      result = { proceed: false, redirect: null };
      return;
    }
    if (typeof arg === "string") {
      result = { proceed: false, redirect: arg };
      return;
    }
    if (index < chain.length) {
      const mw = chain[index++];
      await mw(to, from, next, signal);
      if (signal?.aborted) {
        result = { proceed: false, redirect: null };
      }
      return;
    }
    // End of chain — only reachable when every middleware called next() without cancel/redirect.
    result = { proceed: true, redirect: null };
  }

  if (chain.length === 0) {
    return { proceed: true, redirect: null };
  }

  await next();
  return result;
}

function isThenable(value) {
  return value && typeof value.then === "function";
}

function runNavigationGuards(path, from, options, signal, startAt = 0) {
  const guards = Array.from(navigationGuards);
  for (let index = startAt; index < guards.length; index++) {
    if (signal.aborted) return false;
    const result = guards[index]({
      from,
      to: path,
      replace: Boolean(options.replace),
      signal
    });
    if (isThenable(result)) {
      return Promise.resolve(result).then(value => {
        if (value === false || signal.aborted) return false;
        return runNavigationGuards(path, from, options, signal, index + 1);
      });
    }
    if (result === false) return false;
  }
  return true;
}

export function getRouteParams() {
  const context = getActiveSSRContext();
  return { ...(context ? context.routeParams : lastRouteParams) };
}

/** Reactive route params from the last matched route (snapshot updated on match). */
export function useParams() {
  return memo(() => {
    // depend on path so consumers re-render
    currentPath();
    return getRouteParams();
  });
}

/** Reactive URL search params as a plain object + setter helpers. */
export function useSearchParams() {
  const params = memo(() => getQueryParams());
  function setParams(next, options = {}) {
    const current = { ...getQueryParams() };
    const patch = typeof next === "function" ? next(current) : next;
    const merged = options.replaceAll ? { ...patch } : { ...current, ...patch };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v == null || v === false || v === "") continue;
      sp.set(k, String(v));
    }
    const q = sp.toString();
    const path = currentPath() + (q ? `?${q}` : "");
    navigate(path, { replace: options.replace !== false, scroll: false, focus: false });
  }
  return [params, setParams];
}

/** Data returned by the active matched route's `load` function (if any). */
export function getRouteData() {
  const context = getActiveSSRContext();
  return context ? context.routeData : lastRouteData;
}

function setRouteParams(params) {
  const context = getActiveSSRContext();
  if (context) context.routeParams = { ...params };
  else lastRouteParams = { ...params };
}

function setRouteData(data) {
  const context = getActiveSSRContext();
  if (context) context.routeData = data;
  else lastRouteData = data;
}

function setNotFound(value) {
  const context = getActiveSSRContext();
  if (context) context.notFound = Boolean(value);
  else lastNotFound = Boolean(value);
}

/**
 * Read the nearest route load state (from Route with `load`).
 * @returns {{ data: Function, loading: Function, error: Function, refetch: Function, params: object }}
 */
export function useRouteData() {
  return useContext(RouteDataContext);
}

export function useAction() {
  return useContext(ActionContext);
}

export class RedirectError extends Error {
  constructor(path, options = {}) {
    super(`Redirect to ${path}`);
    this.name = "RedirectError";
    this.path = path;
    this.options = options;
    this.$$cachouRedirect = true;
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not Found") {
    super(message);
    this.name = "NotFoundError";
    this.$$cachouNotFound = true;
  }
}

export function redirect(path, options = {}) {
  throw new RedirectError(path, options);
}

export function notFound(message) {
  throw new NotFoundError(message);
}

export function isRedirectError(err) {
  return Boolean(err && (err.$$cachouRedirect || err instanceof RedirectError));
}

export function isNotFoundError(err) {
  return Boolean(err && (err.$$cachouNotFound || err instanceof NotFoundError));
}

/**
 * Create a route/form action.
 * @param {(formData: FormData | any, ctx: object) => any | Promise<any>} handler
 */
export function createAction(handler) {
  const [pending, setPending] = signal(false);
  const [error, setError] = signal(null);
  const [result, setResult] = signal(undefined);

  async function submit(input, ctx = {}) {
    setPending(true);
    setError(null);
    try {
      let payload = input;
      if (typeof FormData !== "undefined" && input instanceof FormData) {
        payload = input;
      } else if (input && typeof input.preventDefault === "function") {
        input.preventDefault();
        const form = input.currentTarget || input.target;
        payload = form && typeof FormData !== "undefined" ? new FormData(form) : input;
      }
      const value = await handler(payload, ctx);
      setResult(value);
      if (value && value.$$cachouRedirect) {
        navigate(value.path, value.options || {});
      }
      return value;
    } catch (err) {
      if (isRedirectError(err)) {
        navigate(err.path, err.options || {});
        return;
      }
      if (isNotFoundError(err)) {
        setNotFound(true);
        throw err;
      }
      setError(err);
      throw err;
    } finally {
      setPending(false);
    }
  }

  const action = {
    submit,
    pending,
    error,
    result,
    Form(props = {}) {
      return html`<form
        method=${props.method || "post"}
        action=${props.action || "#"}
        onsubmit=${e => submit(e)}
        class=${props.class || ""}
      >${props.children}</form>`;
    }
  };
  return action;
}

export function navigate(path, options = {}, internal = null) {
  const navigationId = ++navigationSequence;
  activeNavigationSettler?.("superseded");
  activeNavigationController?.abort();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  activeNavigationController = controller;
  const signal = controller?.signal || { aborted: false };
  const from = currentPath() + currentSearch();
  const isCurrent = () => navigationId === navigationSequence && !signal.aborted;
  let settled = false;
  const settle = status => {
    if (settled) return;
    settled = true;
    if (activeNavigationSettler === settle) activeNavigationSettler = null;
    internal?.onSettled?.(status);
  };
  activeNavigationSettler = typeof internal?.onSettled === "function" ? settle : null;

  const commitNavigation = () => {
    if (!isCurrent()) {
      settle("superseded");
      return;
    }
    const updateDOM = () => {
      if (!isCurrent()) return;
      applyNavigation(path, options);
      if (options.scroll !== false && typeof window !== "undefined" && typeof window.scrollTo === "function") {
        window.scrollTo(0, 0);
      }
      if (options.focus !== false && typeof document !== "undefined") {
        queueMicrotask(() => {
          if (!isCurrent()) return;
          const target = document.querySelector("[data-cachou-route-focus], main, h1");
          if (target && typeof target.focus === "function") {
            if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
            target.focus({ preventScroll: true });
          }
        });
      }
    };

    if (options.viewTransition === true && typeof document !== "undefined" && document.startViewTransition) {
      document.startViewTransition(updateDOM);
    } else {
      updateDOM();
    }
    settle(true);
    if (activeNavigationController === controller) activeNavigationController = null;
  };

  const continueNavigation = () => {
    if (!isCurrent()) return false;

    // Collect route-level middleware for the target path.
    const routeMiddleware = [];
    const normalizedTarget = getNormalizedPath(path.split("?")[0]);
    for (const route of registeredRoutes.values()) {
      const m = matchPath(route.path, normalizedTarget);
      if (m.matches && Array.isArray(route.middleware)) {
        routeMiddleware.push(...route.middleware);
      }
    }

    const chain = [...globalMiddleware, ...routeMiddleware];
    if (chain.length === 0) {
      commitNavigation();
      return true;
    }

    runMiddlewareChain(chain, path, from, signal).then(result => {
      if (!isCurrent()) return;
      if (result.redirect) {
        settle(true);
        navigate(result.redirect, { replace: true });
      } else if (result.proceed) {
        commitNavigation();
      } else if (activeNavigationController === controller) {
        settle(false);
        activeNavigationController = null;
      }
    }, err => {
      if (isCurrent()) {
        settle(false);
        activeNavigationController = null;
        emitFrameworkEvent({ type: "navigation-error", stage: "middleware", path, from, error: err });
      }
    });
    return true;
  };

  const guardResult = runNavigationGuards(path, from, options, signal);
  if (isThenable(guardResult)) {
    guardResult.then(allowed => {
      if (allowed) continueNavigation();
      else {
        settle(false);
        if (activeNavigationController === controller) activeNavigationController = null;
      }
    }, err => {
      if (isCurrent()) {
        settle(false);
        activeNavigationController = null;
        emitFrameworkEvent({ type: "navigation-error", stage: "guard", path, from, error: err });
      }
    });
    return true;
  }
  if (!guardResult) {
    settle(false);
    if (activeNavigationController === controller) activeNavigationController = null;
    return false;
  }
  return continueNavigation();
}

const registeredRoutes = new Map();
let routeIdCounter = 0;

export function Link(props) {
  const handleClick = e => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      navigate(props.href);
    }
  };

  const handleMouseEnter = () => {
    if (typeof window === "undefined") return;
    try {
      const targetPath = getNormalizedPath(new URL(props.href, window.location.origin).pathname);
      for (const route of registeredRoutes.values()) {
        const m = matchPath(route.path, targetPath);
        if (!m.matches) continue;
        if (route.component && typeof route.component.preload === "function") {
          route.component.preload();
        }
        if (typeof route.preloadLoad === "function") {
          route.preloadLoad(m.params, targetPath);
        }
      }
    } catch (err) {
      // ignore
    }
  };

  return html`<a href=${props.href} class=${props.class || ""} onclick=${handleClick} onmouseenter=${handleMouseEnter}>${props.children}</a>`;
}

export function Router(props) {
  return html`<div class="cachou-router">${props.children}</div>`;
}

export function Layout(props) {
  const layoutPath = props.path || "";
  const children = Array.isArray(props.children) ? props.children : props.children != null ? [props.children] : [];

  return () => {
    const path = getNormalizedPath(currentPath());
    const layoutMatch = matchPath(layoutPath.endsWith("/*") ? layoutPath : layoutPath + "/*", path);
    const exactLayout = matchPath(layoutPath, path);

    if (!layoutMatch.matches && !exactLayout.matches) {
      return null;
    }

    const params = { ...(exactLayout.params || {}), ...(layoutMatch.params || {}) };
    setRouteParams(params);

    let childView = null;
    let childParams = params;
    let bestScore = -1;
    let childRouteData = null;

    for (const child of children) {
      if (!child || typeof child !== "function") continue;
      if (child.$$cachouRoute) {
        const m = matchPath(child.$$cachouRoute.path, path);
        if (!m.matches) continue;
        const score = child.$$cachouRoute.path.length;
        if (score > bestScore) {
          bestScore = score;
          childParams = { ...params, ...(m.params || {}) };
          setRouteParams(childParams);
          const routeMeta = child.$$cachouRoute;
          childView = () => {
            if (routeMeta.getLoadState) {
              const state = routeMeta.getLoadState(childParams);
              childRouteData = state;
              setRouteData(state.data());
              return RouteDataContext.Provider({
                value: { ...state, params: childParams },
                children: () => {
                  const Comp = routeMeta.component;
                  if (typeof Comp === "function") {
                    return Comp(childParams, state);
                  }
                  return Comp;
                }
              });
            }
            const Comp = routeMeta.component;
            if (typeof Comp === "function") return Comp(childParams);
            return Comp;
          };
        }
      }
    }

    if (childView == null) {
      for (const child of children) {
        if (typeof child === "function" && !child.$$cachouRoute) {
          const result = child();
          if (result != null) {
            childView = () => result;
            break;
          }
        }
      }
    }

    const outletValue = {
      child: childView,
      params: childParams
    };

    return OutletContext.Provider({
      value: outletValue,
      children: () => {
        const Comp = props.component;
        if (typeof Comp === "function") {
          return Comp({ ...props, params: childParams, routeData: childRouteData });
        }
        return Comp;
      }
    });
  };
}

export function Outlet() {
  const ctx = useContext(OutletContext);
  return () => {
    if (!ctx || !ctx.child) return null;
    const view = typeof ctx.child === "function" ? ctx.child() : ctx.child;
    return view;
  };
}

function getNormalizedPath(p) {
  let pathVal = p;
  if (pathVal.endsWith("/index.html")) {
    pathVal = pathVal.slice(0, -10);
  } else if (pathVal.endsWith("/index.htm")) {
    pathVal = pathVal.slice(0, -9);
  }
  if (pathVal.startsWith("/demo")) {
    pathVal = pathVal.slice(5);
  }
  if (!pathVal.startsWith("/")) {
    pathVal = "/" + pathVal;
  }
  if (pathVal.length > 1 && pathVal.endsWith("/")) {
    pathVal = pathVal.slice(0, -1);
  }
  return pathVal;
}

/**
 * Match route patterns:
 * - /users/:id
 * - /files/* (prefix wildcard)
 * - /blog/:slug? (optional segment)
 * - /docs/:path* (rest param)
 * - * (catch-all)
 */
const _splitCache = new Map();
function splitCached(path) {
  let parts = _splitCache.get(path);
  if (!parts) {
    parts = path.split("/").filter(Boolean);
    if (_splitCache.size < 500) _splitCache.set(path, parts);
  }
  return parts;
}

function matchPath(routePath, pathValue) {
  if (routePath === "*") return { matches: true, params: {} };

  const routeParts = splitCached(routePath).slice();
  const currentParts = splitCached(pathValue);

  // trailing /* => prefix match
  let prefixWildcard = false;
  if (routeParts.length && routeParts[routeParts.length - 1] === "*") {
    prefixWildcard = true;
    routeParts.pop();
  }

  // Optional segments can be omitted even when the next route segment is a
  // literal (for example `/docs/:lang?/guide`). Try the consuming branch
  // first, then the omitted branch, while keeping the common route shape on
  // the allocation-free loop below.
  if (routeParts.some(part => part.startsWith(":") && part.endsWith("?"))) {
    const matchOptional = (ri, ci, params) => {
      if (ri >= routeParts.length) {
        if (prefixWildcard || ci === currentParts.length) return params;
        return null;
      }

      const rPart = routeParts[ri];
      if (rPart.startsWith(":") && rPart.endsWith("?")) {
        const name = rPart.slice(1, -1);
        if (ci < currentParts.length) {
          const consumed = matchOptional(ri + 1, ci + 1, {
            ...params,
            [name]: decodePathSegment(currentParts[ci])
          });
          if (consumed) return consumed;
        }
        return matchOptional(ri + 1, ci, params);
      }

      if (rPart.startsWith(":") && rPart.endsWith("*")) {
        const name = rPart.slice(1, -1);
        return {
          ...params,
          [name]: currentParts.slice(ci).map(decodePathSegment).join("/")
        };
      }
      if (rPart.startsWith(":")) {
        if (ci >= currentParts.length) return null;
        return matchOptional(ri + 1, ci + 1, {
          ...params,
          [rPart.slice(1)]: decodePathSegment(currentParts[ci])
        });
      }
      if (ci >= currentParts.length || rPart !== currentParts[ci]) return null;
      return matchOptional(ri + 1, ci + 1, params);
    };

    const optionalMatch = matchOptional(0, 0, {});
    return optionalMatch ? { matches: true, params: optionalMatch } : { matches: false };
  }

  const params = {};
  let ri = 0;
  let ci = 0;

  while (ri < routeParts.length) {
    const rPart = routeParts[ri];

    // rest param :path*
    if (rPart.startsWith(":") && rPart.endsWith("*")) {
      const name = rPart.slice(1, -1);
      params[name] = currentParts.slice(ci).map(decodePathSegment).join("/");
      return { matches: true, params };
    }

    // optional :id?
    if (rPart.startsWith(":") && rPart.endsWith("?")) {
      const name = rPart.slice(1, -1);
      if (ci < currentParts.length) {
        params[name] = decodePathSegment(currentParts[ci]);
        ci++;
      }
      ri++;
      continue;
    }

    // required param
    if (rPart.startsWith(":")) {
      if (ci >= currentParts.length) return { matches: false };
      params[rPart.slice(1)] = decodePathSegment(currentParts[ci]);
      ri++;
      ci++;
      continue;
    }

    // literal
    if (ci >= currentParts.length || rPart !== currentParts[ci]) {
      return { matches: false };
    }
    ri++;
    ci++;
  }

  if (prefixWildcard) {
    return { matches: true, params };
  }

  if (ci !== currentParts.length) {
    return { matches: false };
  }

  return { matches: true, params };
}

/**
 * @param {object} props
 * @param {string} props.path
 * @param {any} props.component
 * @param {(ctx: { params: object, path: string, query: object, signal?: AbortSignal, requestId?: number }) => any | Promise<any>} [props.load]
 * @param {any} [props.fallback] Shown while load is pending and no data yet
 * @param {any} [props.error] Error UI: node or (err, retry) => node
 */
export function Route(props) {
  if (typeof window !== "undefined") {
    const routeId = ++routeIdCounter;
    registeredRoutes.set(routeId, props);
    onCleanup(() => {
      registeredRoutes.delete(routeId);
    });
  }

  const match = () => matchPath(props.path, getNormalizedPath(currentPath()));

  let loadControls = null;
  let getData = null;

  if (typeof props.load === "function") {
    const source = () => {
      const m = match();
      if (!m.matches) return null;
      return {
        params: m.params || {},
        path: getNormalizedPath(currentPath()),
        search: currentSearch()
      };
    };

    const resource = createResource(
      source,
      async (src, ctx) => {
        if (!src) return undefined;
        try {
          setNotFound(false);
          return await props.load({
            params: src.params,
            path: src.path,
            query: Object.fromEntries(new URLSearchParams(src.search || "")),
            signal: ctx && ctx.signal,
            requestId: ctx && ctx.requestId,
            request: ctx.request || getRequestEventSafe()
          });
        } catch (err) {
          if (isRedirectError(err)) {
            if (typeof window !== "undefined") {
              navigate(err.path, { ...err.options, replace: err.options?.replace !== false });
            } else {
              // SSR: rethrow for server adapters
              throw err;
            }
            return undefined;
          }
          if (isNotFoundError(err)) {
            setNotFound(true);
            throw err;
          }
          throw err;
        }
      },
      {
        key: src =>
          src ? `${props.path}::${src.path}::${src.search}::${JSON.stringify(src.params)}` : `${props.path}::idle`,
        cancelPrevious: true
      }
    );
    getData = resource[0];
    loadControls = resource[1];

    props.preloadLoad = (params, path) => {
      // Warm by navigating source; resource tracks path signal so hover preload
      // of lazy components is separate. Optional explicit prefetch:
      if (loadControls && typeof loadControls.refetch === "function") {
        // no-op until matched; Link still preloads lazy components
      }
    };
  }

  function getLoadState(params) {
    return {
      data: getData || (() => undefined),
      loading: loadControls ? loadControls.loading : () => false,
      error: loadControls ? loadControls.error : () => null,
      refetch: loadControls ? loadControls.refetch : async () => {},
      params: params || {}
    };
  }

  const render = () => {
    const m = match();
    if (!m.matches) {
      return null;
    }
    setRouteParams(m.params || {});

    // No loader: preserve direct component return (compatible with existing call sites/tests).
    if (!loadControls) {
      if (typeof props.component === "function") {
        return props.component(m.params || {});
      }
      return props.component;
    }

    const state = getLoadState(m.params || {});
    if (getData) {
      setRouteData(getData());
    }

    // Pending first load
    if (loadControls.loading() && getData() === undefined && !loadControls.error()) {
      if (props.fallback != null) {
        return typeof props.fallback === "function" ? props.fallback() : props.fallback;
      }
    }

    if (loadControls.error()) {
      if (props.error != null) {
        return typeof props.error === "function"
          ? props.error(loadControls.error(), () => loadControls.refetch())
          : props.error;
      }
    }

    const provided = RouteDataContext.Provider({
      value: { ...state, params: m.params || {} },
      children: () => {
        if (typeof props.component === "function") {
          return props.component(m.params, state);
        }
        return props.component;
      }
    });
    // Provider returns a reactive function — evaluate so nested html gets real nodes.
    return typeof provided === "function" ? provided() : provided;
  };

  render.$$cachouRoute = {
    path: props.path,
    component: props.component,
    load: props.load,
    getLoadState: typeof props.load === "function" ? getLoadState : null,
    preloadLoad: props.preloadLoad
  };

  // Keep registry entry rich for Link preload
  if (typeof window !== "undefined") {
    for (const [id, route] of registeredRoutes.entries()) {
      if (route === props) {
        registeredRoutes.set(id, { ...props, preloadLoad: props.preloadLoad });
      }
    }
  }

  return render;
}

export function NotFound(props = {}) {
  return Route({
    path: "*",
    component: props.component || props.children || (() => html`<h1>Not found</h1>`)
  });
}

export function lazy(loader) {
  let resolvedComponent = null;
  let resource = null;

  const lazyComponent = props => {
    if (!resolvedComponent && !resource) {
      lazyComponent.preload();
    }

    return () => {
      if (resolvedComponent) {
        return resolvedComponent(props);
      }
      const [module] = resource;
      const Comp = module();
      if (Comp) {
        return Comp(props);
      }
      return null;
    };
  };

  lazyComponent.preload = () => {
    if (!resolvedComponent && !resource) {
      resource = createResource(async () => {
        const res = await loader();
        resolvedComponent = res.default || res;
        return resolvedComponent;
      });
    }
  };

  return lazyComponent;
}

function getRequestEventSafe() {
  try {
    return getRequestEvent();
  } catch {
    return null;
  }
}

// Browser history has already moved the address bar when popstate fires. Run
// the normal guard/middleware pipeline against that target, then let
// router-state either commit it or restore the indexed history entry.
if (isClient) {
  setHistoryNavigationHandler(({ path, search }) => new Promise(resolve => {
    const result = navigate(`${path}${search}`, { replace: true, scroll: false, focus: false }, {
      onSettled: resolve
    });
    if (result === false) resolve(false);
  }));
}

export { matchPath, getNormalizedPath, lastNotFound };
