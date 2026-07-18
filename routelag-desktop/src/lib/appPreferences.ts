import { bumpPreferencesSyncGeneration } from "./preferencesSync";

export const APP_PREFS_KEY = "routelag.appPreferences";
export const LAST_VIEW_KEY = "routelag.lastView";

export type AppTheme = "light" | "dark";

export interface AppPreferences {
  openLastPage: boolean;
  checkEngineOnLaunch: boolean;
  confirmCloseOptimized: boolean;
  reduceAnimations: boolean;
  showBetaRoutes: boolean;
  theme: AppTheme;
  /** Epoch ms of last local user edit — used to beat stale cloud pulls. */
  preferencesUpdatedAt?: number;
}

export const defaultPreferences: AppPreferences = {
  openLastPage: true,
  checkEngineOnLaunch: true,
  confirmCloseOptimized: true,
  reduceAnimations: false,
  showBetaRoutes: true,
  theme: "dark",
};

function normalizeTheme(value: unknown): AppTheme {
  if (value === "light") return "light";
  if (value === "dark") return "dark";
  return "dark";
}

export function loadAppPreferences(): AppPreferences {
  try {
    const stored = window.localStorage.getItem(APP_PREFS_KEY);
    if (!stored) return { ...defaultPreferences };
    const parsed = JSON.parse(stored) as Partial<AppPreferences>;
    return {
      ...defaultPreferences,
      ...parsed,
      theme: normalizeTheme(parsed.theme),
      preferencesUpdatedAt:
        typeof parsed.preferencesUpdatedAt === "number" ? parsed.preferencesUpdatedAt : undefined,
    };
  } catch {
    return { ...defaultPreferences };
  }
}

export function saveAppPreferences(
  preferences: AppPreferences,
  options?: { touch?: boolean },
) {
  const touch = options?.touch !== false;
  const next: AppPreferences = touch
    ? { ...preferences, preferencesUpdatedAt: Date.now() }
    : preferences;
  if (touch) {
    // Invalidate in-flight cloud pulls so they can't snap the theme back.
    bumpPreferencesSyncGeneration();
  }
  window.localStorage.setItem(APP_PREFS_KEY, JSON.stringify(next));
  applyAppPreferences(next);
  window.dispatchEvent(new CustomEvent("routelag:preferences"));
  return next;
}

export function applyAppPreferences(preferences: AppPreferences = loadAppPreferences()) {
  const theme = normalizeTheme(preferences.theme);
  document.documentElement.classList.toggle(
    "reduce-animations",
    preferences.reduceAnimations,
  );
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
  document.documentElement.classList.toggle("theme-light", theme === "light");
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
