import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { applyAppPreferences } from "./lib/appPreferences";
import { ThemeAwareClerkProvider } from "./lib/ThemeAwareClerkProvider";
import { HudOverlayWindow } from "./pages/HudOverlayWindow";
import "./styles.css";
import "./design-system.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

applyAppPreferences();

const isOverlay = new URLSearchParams(window.location.search).get("overlay") === "1";
if (isOverlay) {
  document.documentElement.classList.add("hud-overlay-mode");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOverlay ? (
      <HudOverlayWindow />
    ) : (
      <ThemeAwareClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        afterSignOutUrl="/"
      >
        <App />
      </ThemeAwareClerkProvider>
    )}
  </React.StrictMode>,
);
