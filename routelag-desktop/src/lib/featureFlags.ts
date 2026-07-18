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
