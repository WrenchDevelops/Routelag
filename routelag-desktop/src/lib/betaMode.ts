export const IS_BETA_DALLAS =
  (import.meta.env.VITE_ZER0_BETA_MODE || import.meta.env.VITE_ROUTELAG_BETA_MODE) === "dallas";

export const BETA_BUILD_LABEL = IS_BETA_DALLAS
  ? "Zer0 Beta Dallas Build"
  : "Zer0 Beta";
