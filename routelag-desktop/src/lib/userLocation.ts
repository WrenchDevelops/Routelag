import type { TesterProfile } from "../types";
import { IS_BETA_DALLAS } from "./betaMode";

interface IpGeoResponse {
  status?: string;
  country?: string;
  regionName?: string;
  city?: string;
}

const AMERICAS_COUNTRIES = new Set([
  "united states",
  "usa",
  "canada",
  "mexico",
  "puerto rico",
  "brazil",
  "argentina",
  "chile",
  "colombia",
]);

const AFRICA_ME_COUNTRIES = new Set([
  "south africa",
  "egypt",
  "saudi arabia",
  "united arab emirates",
  "israel",
  "qatar",
  "kuwait",
  "bahrain",
  "oman",
  "jordan",
  "lebanon",
  "iraq",
  "iran",
  "turkey",
  "kenya",
  "nigeria",
  "morocco",
  "tunisia",
  "algeria",
  "zimbabwe",
  "botswana",
  "namibia",
]);

export function formatProfileLocation(profile: Pick<TesterProfile, "country_city" | "state_country">) {
  const city = profile.country_city.trim();
  const country = profile.state_country.trim();
  if (city && country) return `${city}, ${country}`;
  return city || country || "";
}

export function parseCountryFromLocation(label: string) {
  const trimmed = label.trim();
  if (!trimmed || trimmed === "Detecting location...") return "";
  const parts = trimmed.split(",").map((part) => part.trim());
  return (parts[parts.length - 1] ?? trimmed).toLowerCase();
}

export function resolveAutoRouteRegion(userLocation: string) {
  const country = parseCountryFromLocation(userLocation);
  if (AMERICAS_COUNTRIES.has(country) || country.includes("united states")) {
    return "na-central";
  }
  if (AFRICA_ME_COUNTRIES.has(country)) {
    return "middle-east";
  }
  return "middle-east";
}

const NA_EAST_HINTS = [
  "virginia",
  "ashburn",
  "new york",
  "new jersey",
  "pennsylvania",
  "maryland",
  "dc",
  "washington",
  "florida",
  "georgia",
  "north carolina",
  "massachusetts",
  "connecticut",
];

export function recommendRouteId(
  userLocation: string,
  routeIds: string[],
  autoRecommendedId?: string | null,
  startableRouteIds?: string[],
) {
  if (IS_BETA_DALLAS) {
    const startable = new Set(startableRouteIds?.length ? startableRouteIds : routeIds);
    const normalizedLocation = userLocation.toLowerCase();
    if (
      startable.has("ashburn-beta") &&
      NA_EAST_HINTS.some((hint) => normalizedLocation.includes(hint))
    ) {
      return "ashburn-beta";
    }
    if (startable.has("dallas-beta")) return "dallas-beta";
    if (startable.has("ashburn-beta")) return "ashburn-beta";
    return routeIds[0] ?? "dallas-beta";
  }

  const startable = new Set(
    startableRouteIds?.length ? startableRouteIds : routeIds,
  );
  const available = startable;
  if (autoRecommendedId && autoRecommendedId !== "direct" && available.has(autoRecommendedId)) {
    return autoRecommendedId;
  }

  const country = parseCountryFromLocation(userLocation);
  const normalizedLocation = userLocation.toLowerCase();

  if (
    AMERICAS_COUNTRIES.has(country) ||
    normalizedLocation.includes("united states") ||
    normalizedLocation.includes("usa")
  ) {
    if (
      available.has("ashburn-beta") &&
      NA_EAST_HINTS.some((hint) => normalizedLocation.includes(hint))
    ) {
      return "ashburn-beta";
    }
    if (available.has("dallas-beta")) return "dallas-beta";
    if (available.has("ashburn-beta")) return "ashburn-beta";
  }

  if (AFRICA_ME_COUNTRIES.has(country) || normalizedLocation.includes("south africa")) {
    if (available.has("johannesburg-beta")) return "johannesburg-beta";
  }

  if (available.has("dallas-beta")) return "dallas-beta";
  if (available.has("ashburn-beta")) return "ashburn-beta";
  if (available.has("johannesburg-beta")) return "johannesburg-beta";
  return routeIds[0] ?? "dallas-beta";
}

export async function detectPublicIpLocation(): Promise<string | null> {
  try {
    const response = await fetch(
      "http://ip-api.com/json/?fields=status,country,regionName,city",
      { signal: AbortSignal.timeout(4500) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as IpGeoResponse;
    if (data.status !== "success" || !data.country) return null;
    if (data.city) return `${data.city}, ${data.country}`;
    if (data.regionName) return `${data.regionName}, ${data.country}`;
    return data.country;
  } catch {
    return null;
  }
}

export async function resolveUserLocationLabel(
  profile: Pick<TesterProfile, "country_city" | "state_country">,
): Promise<string> {
  const fromProfile = formatProfileLocation(profile);
  if (fromProfile) return fromProfile;
  const detected = await detectPublicIpLocation();
  return detected ?? "Detecting location...";
}

export function fortniteRegionLabel(routeId: string, gameRegion?: string) {
  if (routeId === "dallas-beta") return "NA-Central";
  if (routeId === "ashburn-beta" || routeId === "virginia-beta") return "NA-East";
  if (gameRegion) return gameRegion;
  if (routeId === "johannesburg-beta") return "Middle East";
  return "NA-Central";
}
