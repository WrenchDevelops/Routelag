export const IS_BETA_DALLAS = import.meta.env.VITE_ROUTELAG_BETA_MODE === "dallas";

export const BETA_BUILD_LABEL = IS_BETA_DALLAS
  ? "RouteLag Beta Dallas Build"
  : "RouteLag Beta";
