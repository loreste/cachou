/**
 * Runs in the page context. Hooks window.__CACHOU_RUNTIME__ if the app exposes it:
 *
 *   import * as Cachou from "cachoujs";
 *   window.__CACHOU_RUNTIME__ = Cachou;
 */
(function () {
  if (window.__CACHOU_PAGE_BRIDGE__) return;
  window.__CACHOU_PAGE_BRIDGE__ = true;

  function getRuntime() {
    return window.__CACHOU_RUNTIME__ || window.Cachou || window.cachoujs || null;
  }

  function status() {
    const rt = getRuntime();
    let snapshot = null;
    try {
      if (rt?.getDebugSnapshot) snapshot = rt.getDebugSnapshot();
    } catch {
      // ignore
    }
    return {
      runtime: Boolean(rt),
      hasDevtools: Boolean(rt?.mountDevtools),
      snapshot
    };
  }

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    if (event.data?.source !== "cachou-extension") return;

    if (event.data.type === "request-status") {
      window.postMessage({ source: "cachou-page", type: "status", payload: status() }, "*");
      return;
    }

    if (event.data.type === "toggle-devtools") {
      const rt = getRuntime();
      if (!rt?.mountDevtools) {
        console.warn(
          "[Cachou DevTools] Expose the runtime on the page:\n" +
            "  import * as Cachou from \"cachoujs\";\n" +
            "  window.__CACHOU_RUNTIME__ = Cachou;"
        );
        window.postMessage(
          {
            source: "cachou-page",
            type: "status",
            payload: { runtime: false, error: "no-runtime" }
          },
          "*"
        );
        return;
      }
      try {
        if (rt.isDevtoolsOpen?.()) rt.unmountDevtools?.();
        else rt.mountDevtools?.();
      } catch (err) {
        console.error("[Cachou DevTools]", err);
      }
    }
  });
})();
