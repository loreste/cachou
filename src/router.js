import { createContext, createResource, onCleanup, useContext } from "./reactivity.js";
import { html } from "./html.js";
import { currentPath, currentSearch, setCurrentPath, setCurrentSearch, setSSRPath } from "./router-state.js";

const isClient = typeof window !== "undefined";
export { setSSRPath };
const navigationGuards = new Set();
let lastRouteParams = {};
let lastRouteData = undefined;

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

// Global history listener
if (isClient) {
  window.addEventListener("popstate", () => {
    setCurrentPath(window.location.pathname);
    setCurrentSearch(window.location.search);
  });
}

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

export function getRouteParams() {
  return { ...lastRouteParams };
}

/** Data returned by the active matched route's `load` function (if any). */
export function getRouteData() {
  return lastRouteData;
}

/**
 * Read the nearest route load state (from Route with `load`).
 * @returns {{ data: Function, loading: Function, error: Function, refetch: Function, params: object }}
 */
export function useRouteData() {
  return useContext(RouteDataContext);
}

export function navigate(path, options = {}) {
  const from = typeof window !== "undefined" ? window.location.pathname + window.location.search : currentPath() + currentSearch();
  for (const guard of Array.from(navigationGuards)) {
    const result = guard({ from, to: path, replace: Boolean(options.replace) });
    if (result === false) {
      return false;
    }
  }

  const updateDOM = () => {
    if (options.replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    const url = new URL(window.location.href, window.location.origin);
    setCurrentPath(url.pathname);
    setCurrentSearch(url.search);
    if (options.scroll !== false && typeof window.scrollTo === "function") {
      window.scrollTo(0, 0);
    }
    if (options.focus !== false && typeof document !== "undefined") {
      queueMicrotask(() => {
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
  return true;
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
    lastRouteParams = params;

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
          lastRouteParams = childParams;
          const routeMeta = child.$$cachouRoute;
          childView = () => {
            if (routeMeta.getLoadState) {
              const state = routeMeta.getLoadState(childParams);
              childRouteData = state;
              lastRouteData = state.data();
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

function matchPath(routePath, currentPath) {
  if (routePath === "*") return { matches: true, params: {} };

  const routeParts = routePath.split("/").filter(Boolean);
  const currentParts = currentPath.split("/").filter(Boolean);

  const isWildcard = routePath.endsWith("/*");
  if (isWildcard) {
    routeParts.pop();
  }

  if (!isWildcard && routeParts.length !== currentParts.length) {
    return { matches: false };
  }

  if (isWildcard && currentParts.length < routeParts.length) {
    return { matches: false };
  }

  const params = {};
  for (let i = 0; i < routeParts.length; i++) {
    const rPart = routeParts[i];
    if (rPart.startsWith(":")) {
      params[rPart.slice(1)] = decodePathSegment(currentParts[i]);
    } else if (rPart !== currentParts[i]) {
      return { matches: false };
    }
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
        return props.load({
          params: src.params,
          path: src.path,
          query: Object.fromEntries(new URLSearchParams(src.search || "")),
          signal: ctx && ctx.signal,
          requestId: ctx && ctx.requestId
        });
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
    lastRouteParams = m.params || {};

    // No loader: preserve direct component return (compatible with existing call sites/tests).
    if (!loadControls) {
      if (typeof props.component === "function") {
        return props.component(m.params || {});
      }
      return props.component;
    }

    const state = getLoadState(m.params || {});
    if (getData) {
      lastRouteData = getData();
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

export { matchPath, getNormalizedPath };
