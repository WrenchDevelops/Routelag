import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { RouteLagHudLayout, RouteLagHudState } from "../../shared/hudTypes";
import { HUD_VERSION } from "../../shared/constants";
import { DEFAULT_COMPETITIVE_LAYOUT } from "../../shared/defaultLayout";
import { OverlayWidget } from "./OverlayWidget";
import "./overlay.css";

const initialState: RouteLagHudState = {
  runtimeRunning: true,
  bridgeConnected: false,
  fortniteDetected: false,
  overlayVisible: false,
  liveDataActive: false,
  version: HUD_VERSION,
  lastUpdateAt: Date.now()
};

function App() {
  const [state, setState] = useState<RouteLagHudState>(initialState);
  const [layout, setLayout] = useState<RouteLagHudLayout>(DEFAULT_COMPETITIVE_LAYOUT);
  const [devDemo, setDevDemo] = useState(false);

  useEffect(() => {
    window.routeLagHud.onState((payload) => {
      setState(payload.state);
      setDevDemo(payload.devDemo);
    });
    window.routeLagHud.onLayout(setLayout);
  }, []);

  return (
    <main className="overlay-root">
      {layout.widgets.map((widget) => (
        <OverlayWidget key={widget.id} widget={widget} state={state} />
      ))}
      {devDemo && <div className="demo-watermark">DEMO DATA</div>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
