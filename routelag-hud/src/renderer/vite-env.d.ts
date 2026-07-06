/// <reference types="vite/client" />

import type { RouteLagHudLayout, RouteLagHudState } from "../shared/hudTypes";

declare global {
  interface Window {
    routeLagHud: {
      onState(callback: (payload: { state: RouteLagHudState; devDemo: boolean }) => void): void;
      onLayout(callback: (layout: RouteLagHudLayout) => void): void;
      showOverlay(): Promise<void>;
      hideOverlay(): Promise<void>;
      restartHud(): Promise<void>;
      quitHud(): Promise<void>;
    };
  }
}
