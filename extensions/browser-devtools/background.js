chrome.action.onClicked?.addListener?.(() => {
  // popup handles UI
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "cachou-ping") {
    sendResponse({ ok: true, version: "0.4.5" });
  }
  return false;
});
