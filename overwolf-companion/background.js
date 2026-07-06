/* global overwolf, RouteLagNormalizer, RouteLagBridge */

const FORTNITE_GAME_ID = 21216;

const FEATURES = [
  "game_info",
  "kill",
  "killed",
  "killer",
  "revived",
  "death",
  "assist",
  "match",
  "match_info",
  "rank",
  "me",
  "phase",
  "location",
  "team",
  "items",
  "counters",
  "map",
];

let latestHudState = {
  connected: false,
  fortniteDetected: false,
  matchActive: false,
  kills: undefined,
  deaths: undefined,
  assists: undefined,
  placement: undefined,
  health: undefined,
  shield: undefined,
  phase: undefined,
  materials: undefined,
  inventory: undefined,
  location: undefined,
  matchMode: undefined,
  totalPlayers: undefined,
  totalTeams: undefined,
  ping: undefined,
  lastUpdateAt: Date.now(),
};

let featuresRegistered = false;
let overlayOpen = false;

function logSanitized(message) {
  console.log(`[RouteLag HUD] ${message}`);
}

function startFortniteEvents() {
  overwolf.games.events.onInfoUpdates2.removeListener(onInfoUpdate);
  overwolf.games.events.onNewEvents.removeListener(onNewEvents);

  overwolf.games.events.onInfoUpdates2.addListener(onInfoUpdate);
  overwolf.games.events.onNewEvents.addListener(onNewEvents);

  overwolf.games.events.setRequiredFeatures(FEATURES, (result) => {
    if (!result.success) {
      featuresRegistered = false;
      latestHudState.connected = false;
      logSanitized(`feature registration failed: ${result.error || "unknown"}`);
      sendStateToOverlay();
      sendStateToRouteLag();
      return;
    }

    featuresRegistered = true;
    latestHudState.connected = true;
    latestHudState.fortniteDetected = true;
    logSanitized("Fortnite features registered");
    sendStateToOverlay();
    sendStateToRouteLag();

    overwolf.games.events.getInfo((info) => {
      if (!info.success) return;
      latestHudState = RouteLagNormalizer.normalizeInfoUpdate(latestHudState, info.res);
      latestHudState.lastUpdateAt = Date.now();
      sendStateToOverlay();
      sendStateToRouteLag();
    });
  });
}

function onInfoUpdate(info) {
  latestHudState = RouteLagNormalizer.normalizeInfoUpdate(latestHudState, info.info);
  latestHudState.connected = true;
  latestHudState.fortniteDetected = true;
  latestHudState.lastUpdateAt = Date.now();
  sendStateToOverlay();
  sendStateToRouteLag();
}

function onNewEvents(eventPayload) {
  latestHudState = RouteLagNormalizer.normalizeGameEvents(
    latestHudState,
    eventPayload.events,
  );
  latestHudState.connected = true;
  latestHudState.fortniteDetected = true;
  latestHudState.lastUpdateAt = Date.now();
  sendStateToOverlay();
  sendStateToRouteLag();
}

function ensureOverlayOpen() {
  overwolf.windows.obtainDeclaredWindow("overlay", (result) => {
    if (!result.success || !result.window) return;
    if (result.window.isVisible) {
      overlayOpen = true;
      return;
    }
    overwolf.windows.restore(result.window.id, () => {
      overlayOpen = true;
      sendStateToOverlay();
      refreshOverlayLayout();
    });
  });
}

function sendStateToOverlay() {
  overwolf.windows.obtainDeclaredWindow("overlay", (result) => {
    if (!result.success || !result.window) return;
    overwolf.windows.sendMessage(
      result.window.id,
      "ROUTELAG_HUD_UPDATE",
      latestHudState,
      () => {},
    );
  });
}

function sendStateToRouteLag() {
  const payload = RouteLagNormalizer.toTelemetryPayload(latestHudState);
  RouteLagBridge.sendTelemetry(payload).catch(() => {
    // RouteLag desktop may be closed.
  });
}

function refreshOverlayLayout() {
  RouteLagBridge.loadLayout()
    .then((layout) => {
      overwolf.windows.obtainDeclaredWindow("overlay", (result) => {
        if (!result.success || !result.window) return;
        overwolf.windows.sendMessage(
          result.window.id,
          "ROUTELAG_HUD_LAYOUT",
          layout,
          () => {},
        );
      });
    })
    .catch(() => {});
}

function onGameInfoUpdated(event) {
  const gameInfo = event && event.gameInfo;
  if (!gameInfo) return;

  const classId = gameInfo.classId || Math.floor(gameInfo.id / 10);
  if (classId !== FORTNITE_GAME_ID) return;

  if (gameInfo.isRunning) {
    latestHudState.fortniteDetected = true;
    ensureOverlayOpen();
    if (!featuresRegistered) startFortniteEvents();
    sendStateToOverlay();
    sendStateToRouteLag();
    return;
  }

  latestHudState.fortniteDetected = false;
  latestHudState.matchActive = false;
  latestHudState.connected = false;
  featuresRegistered = false;
  latestHudState.lastUpdateAt = Date.now();
  sendStateToOverlay();
  sendStateToRouteLag();
}

function bootstrap() {
  RouteLagBridge.pairWithRouteLag()
    .then(() => logSanitized("paired with RouteLag desktop"))
    .catch(() => logSanitized("RouteLag desktop not reachable yet"));

  overwolf.games.onGameInfoUpdated.addListener(onGameInfoUpdated);
  overwolf.games.getRunningGameInfo((gameInfo) => {
    if (!gameInfo) return;
    onGameInfoUpdated({ gameInfo });
  });

  // Keep layout in sync while RouteLag editor is open.
  setInterval(refreshOverlayLayout, 3000);
  // Heartbeat so RouteLag can show companion connected even between GEP updates.
  setInterval(() => {
    if (!latestHudState.fortniteDetected) {
      latestHudState.connected = Boolean(RouteLagBridge.getStoredToken());
    }
    sendStateToRouteLag();
  }, 2000);
}

bootstrap();
