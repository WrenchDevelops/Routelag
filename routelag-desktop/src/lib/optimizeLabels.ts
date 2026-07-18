import type { OptimizeState } from "../types";

export function optimizeStateLabel(state: OptimizeState): string {
  switch (state) {
    case "preflight":
      return "Checking your PC and Zer0 API";
    case "creating_server_session":
      return "Creating WireGuard session on server";
    case "writing_profile":
      return "Writing WireGuard profile locally";
    case "starting_engine":
      return "Starting Zer0 Engine";
    case "verifying_connection":
      return "Verifying handshake, routes, and tunnel reachability";
    case "stopping":
      return "Ending optimization";
    case "rollback":
      return "Restoring your internet";
    case "degraded":
      return "Route active — reconnecting to Zer0 servers";
    default:
      return "Working...";
  }
}

export const OPTIMIZE_PROGRESS_STEPS: OptimizeState[] = [
  "preflight",
  "creating_server_session",
  "writing_profile",
  "starting_engine",
  "verifying_connection",
];
