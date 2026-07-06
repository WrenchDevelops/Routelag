export const APP_PREFS_KEY = "routelag.appPreferences";
export const LAST_VIEW_KEY = "routelag.lastView";

export interface AppPreferences {
  openLastPage: boolean;
  checkEngineOnLaunch: boolean;
  confirmCloseOptimized: boolean;
  reduceAnimations: boolean;
}

export const defaultPreferences: AppPreferences = {
  openLastPage: true,
  checkEngineOnLaunch: true,
  confirmCloseOptimized: true,
  reduceAnimations: false,
};

export function loadAppPreferences(): AppPreferences {
  try {
    const stored = window.localStorage.getItem(APP_PREFS_KEY);
    if (!stored) return { ...defaultPreferences };
    return { ...defaultPreferences, ...JSON.parse(stored) };
  } catch {
    return { ...defaultPreferences };
  }
}

export function saveAppPreferences(preferences: AppPreferences) {
  window.localStorage.setItem(APP_PREFS_KEY, JSON.stringify(preferences));
  applyAppPreferences(preferences);
}

export function applyAppPreferences(preferences: AppPreferences = loadAppPreferences()) {
  document.documentElement.classList.toggle(
    "reduce-animations",
    preferences.reduceAnimations,
  );
}
