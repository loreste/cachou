// Inject page-world bridge (isolated world cannot see page modules).
(function inject() {
  if (document.documentElement.dataset.cachouDt === "1") return;
  document.documentElement.dataset.cachouDt = "1";

  const bridge = document.createElement("script");
  bridge.src = chrome.runtime.getURL("page-bridge.js");
  bridge.async = false;
  (document.head || document.documentElement).appendChild(bridge);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "cachou-toggle-devtools") {
      window.postMessage({ source: "cachou-extension", type: "toggle-devtools" }, "*");
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "cachou-status") {
      window.postMessage({ source: "cachou-extension", type: "request-status" }, "*");
      const onMsg = event => {
        if (event.source !== window) return;
        if (event.data?.source === "cachou-page" && event.data?.type === "status") {
          window.removeEventListener("message", onMsg);
          sendResponse(event.data.payload || {});
        }
      };
      window.addEventListener("message", onMsg);
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        sendResponse({ runtime: false });
      }, 300);
      return true;
    }
    return false;
  });
})();
