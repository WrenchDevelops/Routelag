import type { HudWidgetId, HudWidgetLayout, RouteLagHudLayout } from "./hudTypes.js";

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

const DESKTOP_TO_HUD_ID: Record<string, HudWidgetId | undefined> = {
  ping: "ping",
  fps: "fps",
  elims: "kills",
  health: "health",
  shield: "shield",
  placement: "placement",
  match: "phase",
  materials: "materials",
  damageDealt: "damageDealt",
  damageTaken: "damageTaken",
};

type DesktopLayoutWidget = {
  id: string;
  x: number;
  y: number;
  size?: string;
  opacity?: number;
};

function toHudSize(size: string | undefined): HudWidgetLayout["size"] {
  switch ((size ?? "").toLowerCase()) {
    case "large":
      return "large";
    case "medium":
      return "medium";
    default:
      return "small";
  }
}

export function desktopLayoutToHudLayout(layout: unknown): RouteLagHudLayout | undefined {
  if (!Array.isArray(layout) || !layout.length) return undefined;

  const widgets: HudWidgetLayout[] = [];
  for (const item of layout as DesktopLayoutWidget[]) {
    if (!item || typeof item.id !== "string") continue;
    const mappedId = DESKTOP_TO_HUD_ID[item.id];
    if (!mappedId) continue;
    if (widgets.some((widget) => widget.id === mappedId)) continue;

    const x = Math.round((Math.max(0, Math.min(100, Number(item.x) || 0)) / 100) * BASE_WIDTH);
    const y = Math.round((Math.max(0, Math.min(100, Number(item.y) || 0)) / 100) * BASE_HEIGHT);
    const opacity = Math.max(0.05, Math.min(1, (Number(item.opacity) || 85) / 100));

    widgets.push({
      id: mappedId,
      x,
      y,
      visible: true,
      opacity,
      size: toHudSize(item.size),
    });
  }

  if (!widgets.length) return undefined;
  return { preset: "desktop", widgets };
}
