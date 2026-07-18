/**
 * Public API stability labels for CachouJS 0.5+.
 *
 * - stable: core contract; prefer no breaking changes without a major bump (after 1.0 freeze)
 * - candidate: shipped and documented; may refine in minors with changelog
 * - experimental: usable primitives; API may change in patches — pin versions
 *
 * This module is documentation-as-data for tooling and humans. Runtime behavior
 * does not gate exports.
 */

/** @typedef {"stable" | "candidate" | "experimental" | "unlisted"} StabilityLabel */

/** Core surface intended for production apps. */
export const STABLE_EXPORTS = Object.freeze([
  // Reactivity
  "signal",
  "effect",
  "createRoot",
  "memo",
  "store",
  "batch",
  "onCleanup",
  "onMount",
  "untrack",
  "getOwner",
  "runWithOwner",
  "mapArray",
  // Resources
  "createResource",
  "configureResourceCache",
  "invalidateResource",
  "prefetchResource",
  // DOM / templates
  "html",
  "htmlStatic",
  "createCompiledStatic",
  "mount",
  "unmount",
  "render",
  "hydrate",
  "cleanupNode",
  // Control flow
  "Show",
  "Switch",
  "Match",
  "For",
  "Index",
  // Composition
  "splitProps",
  "mergeProps",
  "Dynamic",
  "createContext",
  "useContext",
  // Security
  "configureSecurityPolicy",
  "getSecurityPolicy",
  "applyProductionSecurityDefaults",
  "trustedHTML",
  "sanitizeHTML",
  "sanitizeAuthToken",
  "createCSPNonce",
  "buildContentSecurityPolicy",
  "buildSecurityHeaders",
  "applySecurityHeaders",
  // Router core
  "Router",
  "Route",
  "Layout",
  "Outlet",
  "Link",
  "navigate",
  "beforeNavigate",
  "matchPath",
  "guard",
  "configureRouter",
  "getHistoryMode",
  "go",
  "back",
  "forward",
  "getPath",
  "getQueryParams",
  "getRouteParams",
  "getRouteData",
  "useRouteData",
  "useParams",
  "useSearchParams",
  "redirect",
  "notFound",
  "isRedirectError",
  "isNotFoundError",
  "RedirectError",
  "NotFoundError",
  "lazy",
  // SSR
  "renderToString",
  "renderToStringAsync",
  "createSSRContext",
  "runWithSSRContext",
  "runWithSSRContextAsync",
  "installSSRAsyncHooks",
  "dehydrate",
  "getSSRHead",
  "useHead",
  "setSSRPath",
  "getRequestEvent",
  "setRequestEvent",
  "renderApplication",
  "htmlDocument",
  // Forms
  "createField",
  "createForm",
  // Mutations / query cache helpers
  "createMutation",
  "getQueryData",
  "setQueryData",
  "subscribeQuery",
  "invalidateQuery",
  "optimisticUpdate",
  // File routes
  "fileRoutes",
  "createFileRoutes",
  "createFileRoutesFromGlob",
  "filePathToRoutePath",
  "normalizeGlobModules",
  // Stability introspection
  "getExportStability",
  "listExportsByStability",
  "STABLE_EXPORTS",
  "CANDIDATE_EXPORTS",
  "EXPERIMENTAL_EXPORTS"
]);

/** Shipped, documented, may still refine before 1.0. */
export const CANDIDATE_EXPORTS = Object.freeze([
  "renderToStream",
  "Island",
  "hydrateIslands",
  "KeepAlive",
  "ErrorBoundary",
  "Suspense",
  "SuspenseContext",
  "Portal",
  "onError",
  "createAction",
  "useAction",
  "addMiddleware",
  "persist",
  "virtualList",
  // Fetch adapters are subpath-only (`cachoujs/ssr-adapters`); listed for docs parity
  "createFetchHandler",
  "handleFetchRequest",
  "createLogger",
  "configureLogger",
  "getLoggerConfig",
  "configureTracing",
  "getTracingConfig",
  "createTracer",
  "startSpan",
  "runWithSpan",
  "getActiveSpan",
  "getSpanTraceparent",
  "parseTraceparent",
  "formatTraceparent",
  "extractTraceparent",
  "onFrameworkEvent",
  "emitFrameworkEvent",
  "scheduleTask",
  "yieldNow",
  "configureScheduler",
  "startTransition",
  "useTransition",
  "directive",
  "applyDirective",
  "getDirective",
  "listDirectives",
  "css",
  "cssVar",
  "theme",
  "globalCSS",
  "cx",
  "keyframes",
  "fade",
  "slide",
  "fly",
  "scale",
  "swap",
  "transition",
  "defineTransition",
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "cubicBezier",
  "createLiveRegion",
  "focusFirst",
  "restoreFocusAfter",
  "trapFocus",
  "Dialog",
  "NotFound",
  "removeNodeWithTransition",
  "resetResourceCounter",
  "resolvePendingResources"
]);

/** Usable primitives — expect API churn; not part of the core trust surface. */
export const EXPERIMENTAL_EXPORTS = Object.freeze([
  // App kits
  "createToast",
  "Drawer",
  "Popover",
  "Menu",
  "DataTable",
  "InfiniteScroll",
  "Tabs",
  "Accordion",
  "Breadcrumbs",
  "Tooltip",
  "Avatar",
  "Badge",
  "createAuth",
  "createI18n",
  "machine",
  "createDragDrop",
  "hotkey",
  "holdKey",
  "generateSitemap",
  "generateRobots",
  "ogTags",
  "structuredData",
  "canonicalUrl",
  "Progress",
  "Spinner",
  "Skeleton",
  "CommandPalette",
  "csvExport",
  "downloadCSV",
  "validators",
  "compose",
  "createValidator",
  "mask",
  "masks",
  "createUpload",
  "DropZone",
  "debounce",
  "throttle",
  "useMedia",
  "useBreakpoint",
  "useColorMode",
  "useClipboard",
  "useOnline",
  "useIdle",
  "Image",
  "Picture",
  "Video",
  // Content / server-leaning
  "z",
  "defineCollection",
  "getCollection",
  "getEntry",
  "parseFrontmatter",
  "loadContent",
  "addEntries",
  "clearCollection",
  // Plugins / dev / demos
  "launch",
  "getApp",
  "createApp",
  "useApp",
  "mountDevtools",
  "unmountDevtools",
  "isDevtoolsOpen",
  "installDevtoolsHotkey",
  "enableDebug",
  "disableDebug",
  "getDebugSnapshot",
  "assertNoReactiveLeaks",
  "resetDebugState",
  "renderTest",
  "act",
  "fireEvent",
  "waitFor",
  "listFiles",
  "readFile",
  "createFileBrowser",
  "createFileContent",
  "FileBrowser",
  "webSocketSignal",
  "dbSignal"
]);

const stableSet = new Set(STABLE_EXPORTS);
const candidateSet = new Set(CANDIDATE_EXPORTS);
const experimentalSet = new Set(EXPERIMENTAL_EXPORTS);

/**
 * @param {string} name Export name (e.g. "signal", "createAuth")
 * @returns {StabilityLabel}
 */
export function getExportStability(name) {
  if (typeof name !== "string" || !name) return "unlisted";
  if (stableSet.has(name)) return "stable";
  if (candidateSet.has(name)) return "candidate";
  if (experimentalSet.has(name)) return "experimental";
  return "unlisted";
}

/**
 * @param {StabilityLabel} [label]
 * @returns {string[]}
 */
export function listExportsByStability(label) {
  if (label === "stable") return [...STABLE_EXPORTS];
  if (label === "candidate") return [...CANDIDATE_EXPORTS];
  if (label === "experimental") return [...EXPERIMENTAL_EXPORTS];
  return [
    ...STABLE_EXPORTS.map(n => ({ name: n, stability: "stable" })),
    ...CANDIDATE_EXPORTS.map(n => ({ name: n, stability: "candidate" })),
    ...EXPERIMENTAL_EXPORTS.map(n => ({ name: n, stability: "experimental" }))
  ];
}
