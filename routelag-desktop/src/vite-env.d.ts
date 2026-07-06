/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUTELAG_API_URL?: string;
  readonly VITE_PATHGEN_API_URL?: string;
  readonly VITE_ROUTELAG_BETA_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
