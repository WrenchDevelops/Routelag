/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ZER0_API_URL?: string;
  readonly VITE_ROUTELAG_API_URL?: string;
  readonly VITE_PATHGEN_API_URL?: string;
  readonly VITE_ZER0_BETA_MODE?: string;
  readonly VITE_ROUTELAG_BETA_MODE?: string;
  readonly VITE_ZER0_ENABLE_HUD?: string;
  readonly VITE_ROUTELAG_ENABLE_HUD?: string;
  readonly VITE_ZER0_ENABLE_REPLAY?: string;
  readonly VITE_ROUTELAG_ENABLE_REPLAY?: string;
  readonly VITE_ZER0_SUPPORT_BASE_URL?: string;
  readonly VITE_SUPPORT_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
