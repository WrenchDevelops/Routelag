/* global overwolf, RouteLagBridge */

async function refreshPairing() {
  const status = document.getElementById("pair-status");
  const preview = document.getElementById("token-preview");
  try {
    const payload = await RouteLagBridge.pairWithRouteLag();
    const token = payload.token || RouteLagBridge.getStoredToken();
    status.textContent = "Connected to RouteLag desktop.";
    preview.textContent = `Token: ${token.slice(0, 8)}...${token.slice(-6)}`;
  } catch {
    const token = RouteLagBridge.getStoredToken();
    status.textContent = "RouteLag desktop not reachable. Open RouteLag and try again.";
    preview.textContent = token
      ? `Token: ${token.slice(0, 8)}...${token.slice(-6)} (cached)`
      : "Token: not paired";
  }
}

document.getElementById("pair-btn").addEventListener("click", () => {
  void refreshPairing();
});

document.getElementById("overlay-btn").addEventListener("click", () => {
  overwolf.windows.obtainDeclaredWindow("overlay", (result) => {
    if (!result.success || !result.window) return;
    overwolf.windows.restore(result.window.id, () => {});
  });
});

void refreshPairing();
