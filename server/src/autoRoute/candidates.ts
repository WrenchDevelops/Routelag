import { enabledTargets, targetCidrs, type RouteNode } from "../nodes.js";
import type { RouteCandidate } from "./types.js";

export function buildCandidates(nodes: RouteNode[], game: string): RouteCandidate[] {
  const gameNodes = nodes.filter((node) => node.gameId === game);

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
      gameRouteCidrs: [],
      routeTargets: [],
    },
  ];

  for (const node of gameNodes) {
    candidates.push({
      id: node.id,
      type: "single",
      label: node.name,
      hopCount: 1,
      serverId: node.id,
      status: node.available ? "online" : node.status ?? "coming soon",
      canStart: node.available && node.provisioner.mode !== "disabled",
      estimateOnly: false,
      chainSupported: false,
      gameRouteCidrs: targetCidrs(node),
      routeTargets: enabledTargets(node).map((target) => ({ ...target, nodeId: node.id })),
    });
  }

  // Chain candidates: Johannesburg as entry, each non-Johannesburg node as exit.
  // Multi-hop is not yet implemented — all chain candidates are estimate-only.
  const entryNode = gameNodes.find((node) => node.id === "johannesburg-beta");
  if (entryNode) {
    const exitNodes = gameNodes.filter((node) => node.id !== "johannesburg-beta");
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
        gameRouteCidrs: targetCidrs(exitNode),
        routeTargets: enabledTargets(exitNode).map((target) => ({ ...target, nodeId: exitNode.id })),
      });
    }
  }

  return candidates;
}

export function listRouteTargetsForGame(nodes: RouteNode[], game: string) {
  return nodes
    .filter((node) => node.gameId === game)
    .flatMap((node) => enabledTargets(node).map((target) => ({ ...target, nodeId: node.id })));
}
