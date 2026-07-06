import type { RouteOption } from "../App";
import { IS_BETA_DALLAS } from "./betaMode";
import type { RouteServer } from "./api";

export const BETA_ROUTE_IDS = new Set(["dallas-beta", "johannesburg-beta"]);

export const fallbackRouteOptions: RouteOption[] = IS_BETA_DALLAS
  ? [
      {
        id: "dallas-beta",
        label: "Dallas Beta",
        name: "Dallas Beta",
        ping: "—",
        available: false,
        meta: "United States",
        region: "NA-Central",
        city: "Dallas",
        country: "US",
        status: "offline",
      },
    ]
  : [
      {
        id: "johannesburg-beta",
        label: "Johannesburg Beta",
        name: "Johannesburg Beta",
        ping: "—",
        available: false,
        meta: "South Africa",
        region: "ZA",
        city: "Johannesburg",
        country: "ZA",
        status: "offline",
      },
      {
        id: "dallas-beta",
        label: "Dallas Beta",
        name: "Dallas Beta",
        ping: "—",
        available: false,
        meta: "United States",
        region: "NA-Central",
        city: "Dallas",
        country: "US",
        status: "offline",
      },
    ];

export function mapRoutingNodeToRouteOption(node: RouteServer): RouteOption {
  const canStart = node.canStart ?? node.available;
  return {
    id: node.id,
    label: node.name,
    name: node.name,
    region: node.region,
    city: node.city,
    country: node.country,
    ip: node.endpointHost ?? node.endpointIp,
    endpoint: node.endpoint,
    meta:
      node.id === "dallas-beta"
        ? "United States"
        : node.id === "johannesburg-beta"
          ? "South Africa"
          : node.notes,
    notes: node.notes,
    available: node.available && canStart,
    status: node.status,
    ping: node.available && canStart ? node.pingEstimate ?? "Test" : "Unavailable",
    qualityLabel: node.debugLabel ?? node.label,
    recommended: node.recommended,
    gameRegion: node.id === "dallas-beta" ? "NA-Central" : undefined,
  };
}

export function mergeRouteOptions(apiRoutes: RouteOption[]): RouteOption[] {
  if (!apiRoutes.length) return fallbackRouteOptions;
  const apiById = new Map(apiRoutes.map((route) => [route.id, route]));
  const ordered = fallbackRouteOptions
    .map((fallback) => apiById.get(fallback.id) ?? null)
    .filter((route): route is RouteOption => route != null);
  const extras = apiRoutes.filter(
    (route) => !fallbackRouteOptions.some((fallback) => fallback.id === route.id),
  );
  return [...ordered, ...extras];
}

export function resolveRouteOption(
  serverId: string,
  routes: RouteOption[],
): RouteOption | undefined {
  if (!serverId?.trim()) return undefined;
  const catalog = mergeRouteOptions(routes);
  return catalog.find((route) => route.id === serverId);
}
