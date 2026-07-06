/* global RouteLagBridge */
(function (global) {
  const PAIR_URL = "http://127.0.0.1:17389/hud/pair";
  const TELEMETRY_URL = "http://127.0.0.1:17389/hud/telemetry";
  const LAYOUT_URL = "http://127.0.0.1:17389/hud/layout";
  const TOKEN_KEY = "ROUTELAG_HUD_TOKEN";

  function getStoredToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  function setStoredToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  }

  async function pairWithRouteLag() {
    const response = await fetch(PAIR_URL, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Pairing failed (${response.status})`);
    }
    const payload = await response.json();
    if (!payload || !payload.token) {
      throw new Error("Pairing response missing token");
    }
    setStoredToken(payload.token);
    return payload;
  }

  async function ensureToken() {
    let token = getStoredToken();
    if (token) return token;
    const paired = await pairWithRouteLag();
    return paired.token;
  }

  async function sendTelemetry(payload) {
    const token = await ensureToken();
    const response = await fetch(TELEMETRY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RouteLag-HUD-Token": token,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      setStoredToken("");
      const retryToken = await ensureToken();
      const retry = await fetch(TELEMETRY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RouteLag-HUD-Token": retryToken,
        },
        body: JSON.stringify(payload),
      });
      if (!retry.ok) throw new Error(`Telemetry rejected (${retry.status})`);
      return;
    }

    if (!response.ok) {
      throw new Error(`Telemetry rejected (${response.status})`);
    }
  }

  async function loadLayout() {
    const token = await ensureToken();
    const response = await fetch(LAYOUT_URL, {
      method: "GET",
      headers: {
        "X-RouteLag-HUD-Token": token,
      },
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload.layout) ? payload.layout : [];
  }

  global.RouteLagBridge = {
    pairWithRouteLag,
    sendTelemetry,
    loadLayout,
    getStoredToken,
    setStoredToken,
  };
})(this);
