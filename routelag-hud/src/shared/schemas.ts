import type { HudWidgetId, HudWidgetLayout, RouteLagHudLayout, RouteLagToHudMessage } from "./hudTypes.js";

const WIDGET_IDS: HudWidgetId[] = [
  "ping",
  "fps",
  "kills",
  "health",
  "shield",
  "placement",
  "materials",
  "phase",
  "damageDealt",
  "damageTaken",
];
const WIDGET_SIZES = new Set(["small", "medium", "large"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isWidgetLayout(value: unknown): value is HudWidgetLayout {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    WIDGET_IDS.includes(value.id as HudWidgetId) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    typeof value.visible === "boolean" &&
    isFiniteNumber(value.opacity) &&
    typeof value.size === "string" &&
    WIDGET_SIZES.has(value.size)
  );
}

export function isRouteLagHudLayout(value: unknown): value is RouteLagHudLayout {
  if (!isRecord(value)) return false;
  return typeof value.preset === "string" && Array.isArray(value.widgets) && value.widgets.every(isWidgetLayout);
}

export function parseRouteLagMessage(raw: string): RouteLagToHudMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") return undefined;

  switch (parsed.type) {
    case "SET_LAYOUT":
      return isRouteLagHudLayout(parsed.data) ? { type: "SET_LAYOUT", data: parsed.data } : undefined;
    case "SHOW_OVERLAY":
    case "HIDE_OVERLAY":
    case "STOP_HUD":
    case "PING":
      return { type: parsed.type };
    default:
      return undefined;
  }
}

export function sanitizeLayout(layout: RouteLagHudLayout): RouteLagHudLayout {
  return {
    preset: layout.preset.slice(0, 64),
    widgets: layout.widgets.map((widget) => ({
      ...widget,
      x: Math.max(0, Math.min(3840, widget.x)),
      y: Math.max(0, Math.min(2160, widget.y)),
      opacity: Math.max(0.05, Math.min(1, widget.opacity))
    }))
  };
}
