async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshStatus() {
  const statusEl = document.getElementById("status");
  const btn = document.getElementById("toggle");
  try {
    const tab = await activeTab();
    if (!tab?.id) {
      statusEl.textContent = "No active tab.";
      btn.disabled = true;
      return;
    }
    const res = await chrome.tabs.sendMessage(tab.id, { type: "cachou-status" });
    if (res?.runtime) {
      statusEl.innerHTML = `Runtime detected.${res.snapshot ? ` Signals: <strong>${res.snapshot.signals}</strong>` : ""}`;
      btn.disabled = false;
    } else {
      statusEl.innerHTML =
        "No <code>window.__CACHOU_RUNTIME__</code> on this page. Expose Cachou from your app bootstrap.";
      btn.disabled = false; // still allow toggle attempt (shows console hint)
    }
  } catch (err) {
    statusEl.textContent = "Cannot reach page (restricted URL or not loaded).";
    btn.disabled = true;
  }
}

document.getElementById("toggle").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab?.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: "cachou-toggle-devtools" });
  setTimeout(refreshStatus, 200);
});

refreshStatus();
