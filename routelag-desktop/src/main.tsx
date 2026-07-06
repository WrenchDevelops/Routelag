import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { HudOverlayWindow } from "./pages/HudOverlayWindow";
import "./styles.css";

const isOverlay = new URLSearchParams(window.location.search).get("overlay") === "1";
if (isOverlay) {
  document.documentElement.classList.add("hud-overlay-mode");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOverlay ? <HudOverlayWindow /> : <App />}
  </React.StrictMode>,
);
