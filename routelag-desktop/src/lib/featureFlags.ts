/** Build-time feature toggles (Vite env). Defaults to enabled when unset. */
function envFlag(zer0Key: string | undefined, legacyKey: string | undefined): boolean {
  const raw = zer0Key ?? legacyKey;
  return raw !== "false";
}

export const HUD_ENABLED = envFlag(
  import.meta.env.VITE_ZER0_ENABLE_HUD,
  import.meta.env.VITE_ROUTELAG_ENABLE_HUD,
);
export const REPLAY_ENABLED = envFlag(
  import.meta.env.VITE_ZER0_ENABLE_REPLAY,
  import.meta.env.VITE_ROUTELAG_ENABLE_REPLAY,
);

/**
 * Tournament / competitive queue testing. Keep false until the full-session
 * test matrix passes (login → match completion with stable egress IP).
 * When false, Optimize requires an integrity acknowledgment and UI warns
 * that competitive use is suspended.
 */
export const TOURNAMENT_TESTING_ENABLED =
  import.meta.env.VITE_ZER0_ENABLE_TOURNAMENT_TESTING === "true" ||
  import.meta.env.VITE_ROUTELAG_ENABLE_TOURNAMENT_TESTING === "true";

