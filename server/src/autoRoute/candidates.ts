import type { RouteServerConfig } from "../config.js";
import type { RouteCandidate } from "./types.js";

export function buildCandidates(
  servers: RouteServerConfig[],
  game: string,
): RouteCandidate[] {
  const gameServers = servers.filter((server) => server.gameId === game);

  const candidates: RouteCandidate[] = [
    {
      id: "direct",
      type: "direct",
      label: "Direct (RouteLag OFF)",
      hopCount: 0,
      status: "available",
      canStart: false,
      estimateOnly: false,
      chainSupported: false,
    },
  ];

  for (const server of gameServers) {
    candidates.push({
      id: server.id,
      type: "single",
      label: server.name,
      hopCount: 1,
      serverId: server.id,
      status: server.status,
      canStart: server.status === "online",
      estimateOnly: false,
      chainSupported: false,
    });
  }

  // Chain candidates: Johannesburg as entry, each non-Johannesburg node as exit.
  // Multi-hop is not yet implemented — all chain candidates are estimate-only.
  const entryNode = gameServers.find((server) => server.id === "johannesburg-beta");
  if (entryNode) {
    const exitNodes = gameServers.filter((server) => server.id !== "johannesburg-beta");
    for (const exitNode of exitNodes) {
      candidates.push({
        id: `${entryNode.id}--${exitNode.id}`,
        type: "chain",
        label: `${entryNode.city} → ${exitNode.city}`,
        hopCount: 2,
        entryServerId: entryNode.id,
        exitServerId: exitNode.id,
        status: "estimate-only",
        canStart: false,
        estimateOnly: true,
        chainSupported: false,
      });
    }
  }

  return candidates;
}
