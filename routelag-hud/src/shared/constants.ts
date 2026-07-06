export const HUD_VERSION = "0.1.0";
export const FORTNITE_GAME_ID = 21216;
export const FORTNITE_CLASS_ID = 21216;

export function isFortniteGameId(gameId: number | undefined): boolean {
  if (gameId == null) return false;
  return gameId === FORTNITE_GAME_ID || gameId === FORTNITE_CLASS_ID || Math.floor(gameId / 10) === FORTNITE_GAME_ID;
}
export const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:17389/hud";
export const LOCALHOST_NAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
export const LIVE_DATA_STALE_MS = 5000;
export const HUD_STATUS_INTERVAL_MS = 2000;

export const ERROR_CODES = {
  BRIDGE_CONNECT_FAILED: "HUD_BRIDGE_CONNECT_FAILED",
  INVALID_TOKEN: "HUD_INVALID_TOKEN",
  FORTNITE_NOT_DETECTED: "HUD_FORTNITE_NOT_DETECTED",
  GEP_FEATURE_REGISTRATION_FAILED: "HUD_GEP_FEATURE_REGISTRATION_FAILED",
  OVERLAY_CREATE_FAILED: "HUD_OVERLAY_CREATE_FAILED",
  OVERLAY_DEV_MODE_REQUIRED: "HUD_OVERLAY_DEV_MODE_REQUIRED",
  ALREADY_RUNNING: "HUD_ALREADY_RUNNING"
} as const;

export const OVERLAY_DEV_MODE_HELP =
  "Overwolf overlay requires Dev Mode credentials (OW_CLI_EMAIL + OW_CLI_API_KEY) when running unsigned, or a signed production build. Run from routelag-hud with npm run start after ow config, not the packaged exe.";
