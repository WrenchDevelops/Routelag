import {
  routeApi,
  type CloudAppPreferences,
  type CloudTesterProfile,
} from "./api";
import {
  defaultPreferences,
  loadAppPreferences,
  saveAppPreferences,
  type AppPreferences,
} from "./appPreferences";
import type { TesterProfile } from "../types";
import { defaultTesterProfile } from "../types";
import { getPreferencesSyncGeneration } from "./preferencesSync";

function isFilledString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function mergeProfile(local: TesterProfile, cloud: CloudTesterProfile | null | undefined): TesterProfile {
  if (!cloud) return local;
  const merged = { ...defaultTesterProfile(), ...local };
  for (const key of Object.keys(cloud) as Array<keyof CloudTesterProfile>) {
    const cloudValue = cloud[key];
    const localValue = merged[key];
    if (cloudValue == null) continue;
    if (typeof cloudValue === "string") {
      if (isFilledString(cloudValue) && !isFilledString(localValue as string)) {
        (merged as Record<string, unknown>)[key] = cloudValue;
      } else if (isFilledString(cloudValue) && isFilledString(localValue as string)) {
        // Prefer cloud when both exist so devices stay aligned.
        (merged as Record<string, unknown>)[key] = cloudValue;
      }
      continue;
    }
    if (typeof cloudValue === "number" && (localValue == null || localValue === "")) {
      (merged as Record<string, unknown>)[key] = cloudValue;
    } else if (typeof cloudValue === "number") {
      (merged as Record<string, unknown>)[key] = cloudValue;
    }
  }
  return merged;
}

export async function pullCloudUserState(localProfile: TesterProfile): Promise<{
  profile: TesterProfile;
  preferences: AppPreferences | null;
}> {
  const user = await routeApi.getCloudUser();
  if (!user) {
    return { profile: localProfile, preferences: null };
  }
  return {
    profile: mergeProfile(localProfile, user.profile),
    preferences: mergePreferences(loadAppPreferences(), user.preferences),
  };
}

export async function pushCloudProfile(profile: TesterProfile): Promise<void> {
  await routeApi.saveCloudProfile(profile);
}

export async function pushCloudPreferences(preferences: AppPreferences): Promise<void> {
  await routeApi.saveCloudPreferences(preferences as CloudAppPreferences);
}

export async function syncClerkIdentityToCloud(input: {
  clerkUserId: string;
  clerkEmail?: string;
  hasProPlan?: boolean;
  planPeriod?: string | null;
  googleConnected?: boolean;
}): Promise<void> {
  await routeApi.syncCloudIdentity({
    clerkUserId: input.clerkUserId,
    clerkEmail: input.clerkEmail,
    connections: {
      google: {
        connected: Boolean(input.googleConnected ?? input.clerkEmail),
        email: input.clerkEmail,
      },
    },
    billingSnapshot: {
      hasProPlan: Boolean(input.hasProPlan),
      planPeriod: input.planPeriod ?? null,
      updatedAt: new Date().toISOString(),
    },
  });
}

function preferenceTimestamp(
  value: Partial<AppPreferences> | Partial<CloudAppPreferences> | null | undefined,
): number {
  if (!value) return 0;
  const raw = (value as { preferencesUpdatedAt?: unknown }).preferencesUpdatedAt;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function mergePreferences(
  local: AppPreferences,
  cloud: Partial<CloudAppPreferences> | null | undefined,
): AppPreferences {
  if (!cloud) return local;

  const localTs = preferenceTimestamp(local);
  const cloudTs = preferenceTimestamp(cloud);
  const cloudTheme =
    cloud.theme === "dark" || cloud.theme === "light" ? cloud.theme : undefined;

  // Last-write-wins. On a tie (or legacy cloud with no timestamp), keep local theme
  // so an in-flight pull can't snap the toggle back after the user just changed it.
  if (localTs >= cloudTs) {
    return {
      ...defaultPreferences,
      ...cloud,
      ...local,
      theme: local.theme,
      preferencesUpdatedAt: localTs || undefined,
    };
  }

  return {
    ...defaultPreferences,
    ...local,
    ...cloud,
    theme: cloudTheme ?? local.theme,
    preferencesUpdatedAt: cloudTs || undefined,
  };
}

export async function pullAndApplyCloudPreferences(): Promise<AppPreferences> {
  const generation = getPreferencesSyncGeneration();
  const local = loadAppPreferences();
  const cloud = await routeApi.getCloudPreferences();
  if (generation !== getPreferencesSyncGeneration()) {
    // A newer local save/push happened while this request was in flight.
    return loadAppPreferences();
  }
  if (!cloud) return local;
  const merged = mergePreferences(local, cloud);
  // Preserve the winning timestamp — don't treat a pull as a user edit.
  saveAppPreferences(merged, { touch: false });
  return merged;
}
