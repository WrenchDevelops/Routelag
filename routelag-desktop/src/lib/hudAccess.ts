/**
 * Product policy: Zer0 HUD is free and independent of paid routing.
 * Pure helpers — no Clerk / Tauri — so they can be unit-tested.
 */

export type HudAccessContext = {
  /** Build-time feature flag (VITE_ROUTELAG_ENABLE_HUD). */
  hudFeatureEnabled: boolean;
  /** Signed-in free or paid Clerk account (auth is optional for standalone HUD exe). */
  isSignedIn: boolean;
  hasProPlan: boolean;
  hasUnlimitedRouting: boolean;
  hasReplays: boolean;
  hudInstalled: boolean;
};

const HUD_FEATURE_LABELS = new Set([
  "hud",
  "hud overlay",
  "free hud",
  "free hud overlay",
  "overlay hud",
]);

export function isHudPlanFeatureLabel(name: string): boolean {
  return HUD_FEATURE_LABELS.has(name.trim().toLowerCase());
}

/** Free users may open the desktop HUD page whenever the feature flag is on. */
export function canOpenHudPage(ctx: Pick<HudAccessContext, "hudFeatureEnabled" | "isSignedIn">): boolean {
  return ctx.hudFeatureEnabled && ctx.isSignedIn;
}

/** Launching the Overwolf/ow-electron HUD never requires Pro or routing. */
export function canLaunchInstalledHud(
  ctx: Pick<HudAccessContext, "hudFeatureEnabled" | "hudInstalled" | "hasProPlan">,
): boolean {
  void ctx.hasProPlan;
  return ctx.hudFeatureEnabled && ctx.hudInstalled;
}

/** Paid routing must stay gated; free/HUD state must not unlock it. */
export function canUsePaidRouting(
  ctx: Pick<HudAccessContext, "hasProPlan" | "hasUnlimitedRouting">,
): boolean {
  return ctx.hasProPlan || ctx.hasUnlimitedRouting;
}

/** Replay remains a Pro feature (unchanged by free-HUD policy). */
export function canUseReplays(ctx: Pick<HudAccessContext, "hasProPlan" | "hasReplays">): boolean {
  return ctx.hasProPlan || ctx.hasReplays;
}

/** Strip legacy Clerk "hud" features from Pro plan marketing lists. */
export function filterHudOutOfProFeatures<T extends string | { name: string }>(features: T[]): T[] {
  return features.filter((feature) => {
    const name = typeof feature === "string" ? feature : feature.name;
    return !isHudPlanFeatureLabel(name);
  });
}

/** Ensure Free plan marketing lists advertise the free HUD. */
export function ensureFreeHudFeature(features: string[]): string[] {
  const withoutHud = features.filter((f) => !isHudPlanFeatureLabel(f));
  return ["Free HUD Overlay", ...withoutHud];
}

export function formatHudLaunchError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (lower.includes("not found") || lower.includes("hud runtime not found")) {
    return "HUD Runtime is not installed. Use Install HUD Runtime, or install the separate Zer0 HUD (Overwolf) app.";
  }
  if (lower.includes("overwolf")) {
    return `Could not start the HUD via Overwolf: ${raw}`;
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return "HUD launch timed out. If Overwolf is not running, start it first, then try again.";
  }
  if (lower.includes("access is denied") || lower.includes("elevation") || lower.includes("administrator")) {
    return `HUD launch was blocked by Windows permissions: ${raw}`;
  }
  return `Could not launch HUD: ${raw}`;
}
