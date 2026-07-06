export type HudWidgetId =
  | "ping"
  | "fps"
  | "kills"
  | "health"
  | "shield"
  | "placement"
  | "materials"
  | "phase"
  | "damageDealt"
  | "damageTaken";

export type HudWidgetSize = "small" | "medium" | "large";

export interface HudWidgetLayout {
  id: HudWidgetId;
  x: number;
  y: number;
  visible: boolean;
  opacity: number;
  size: HudWidgetSize;
}

export interface RouteLagHudLayout {
  preset: string;
  widgets: HudWidgetLayout[];
}

export interface RouteLagHudState {
  runtimeRunning: boolean;
  bridgeConnected: boolean;
  fortniteDetected: boolean;
  overlayVisible: boolean;
  overlayReady?: boolean;
  overlayError?: string;
  liveDataActive: boolean;
  matchActive?: boolean;
  phase?: string;
  health?: number;
  shield?: number;
  overShield?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  damageDealt?: number;
  damageTaken?: number;
  placement?: number;
  totalPlayers?: number;
  ping?: number;
  fps?: number;
  materials?: {
    wood?: number;
    stone?: number;
    metal?: number;
  };
  inventory?: Array<{
    slot?: number;
    name?: string;
    rarity?: string;
    count?: number;
    ammo?: number;
  }>;
  version: string;
  lastUpdateAt: number;
}

export type HudToRouteLagMessage =
  | { type: "HUD_STATUS"; data: RouteLagHudState }
  | { type: "FORTNITE_TELEMETRY"; data: RouteLagHudState }
  | { type: "PONG"; data: { version: string; runtimeRunning: true } };

export type RouteLagToHudMessage =
  | { type: "SET_LAYOUT"; data: RouteLagHudLayout }
  | { type: "SHOW_OVERLAY" }
  | { type: "HIDE_OVERLAY" }
  | { type: "STOP_HUD" }
  | { type: "PING" };
