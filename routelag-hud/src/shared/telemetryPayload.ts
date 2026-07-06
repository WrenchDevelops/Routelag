import type { RouteLagHudState } from "./hudTypes.js";

export function toTelemetryPayload(state: RouteLagHudState) {
  return {
    source: "routelag-hud-companion",
    game: "fortnite",
    type: state.liveDataActive ? "hud_update" : "connection_status",
    timestamp: Date.now(),
    data: {
      connected: state.bridgeConnected,
      fortniteDetected: state.fortniteDetected,
      matchActive: state.matchActive,
      phase: state.phase,
      ping: state.ping,
      health: state.health,
      shield: state.shield,
      overShield: state.overShield,
      kills: state.kills,
      deaths: state.deaths,
      assists: state.assists,
      placement: state.placement,
      totalPlayers: state.totalPlayers,
      materials: state.materials,
      inventory: state.inventory,
      fps: state.fps,
      damageDealt: state.damageDealt,
      damageTaken: state.damageTaken,
      lastUpdateAt: state.lastUpdateAt,
    },
  };
}
