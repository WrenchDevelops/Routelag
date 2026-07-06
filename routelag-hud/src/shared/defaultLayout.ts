import type { RouteLagHudLayout } from "./hudTypes";

export const DEFAULT_COMPETITIVE_LAYOUT: RouteLagHudLayout = {
  preset: "competitive",
  widgets: [
    { id: "ping", x: 24, y: 24, visible: true, opacity: 0.9, size: "small" },
    { id: "fps", x: 24, y: 72, visible: true, opacity: 0.9, size: "small" },
    { id: "placement", x: 850, y: 24, visible: true, opacity: 0.9, size: "small" },
    { id: "kills", x: 1640, y: 24, visible: true, opacity: 0.9, size: "small" },
    { id: "phase", x: 850, y: 76, visible: true, opacity: 0.9, size: "small" },
    { id: "health", x: 24, y: 900, visible: true, opacity: 0.92, size: "medium" },
    { id: "shield", x: 24, y: 960, visible: true, opacity: 0.92, size: "medium" },
    { id: "materials", x: 1570, y: 900, visible: true, opacity: 0.92, size: "medium" }
  ]
};
