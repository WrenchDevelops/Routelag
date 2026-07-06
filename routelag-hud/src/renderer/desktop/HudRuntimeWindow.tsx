import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { RouteLagHudState } from "../../shared/hudTypes";
import { HUD_VERSION } from "../../shared/constants";
import "./runtime.css";

const initialState: RouteLagHudState = {
  runtimeRunning: true,
  bridgeConnected: false,
  fortniteDetected: false,
  overlayVisible: false,
  liveDataActive: false,
  version: HUD_VERSION,
  lastUpdateAt: Date.now()
};

function StatusRow({ label, active, on, off }: { label: string; active: boolean; on: string; off: string }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong className={active ? "active" : "waiting"}>{active ? on : off}</strong>
    </div>
  );
}

function App() {
  const [state, setState] = useState<RouteLagHudState>(initialState);
  const [devDemo, setDevDemo] = useState(false);

  useEffect(() => {
    if (!window.routeLagHud) return;
    window.routeLagHud.onState((payload) => {
      setState(payload.state);
      setDevDemo(payload.devDemo);
    });
  }, []);

  return (
    <main className="runtime-shell">
      <header>
        <p>RouteLag HUD</p>
        <h1>RouteLag HUD Runtime</h1>
        {devDemo && <span className="demo-pill">DEMO DATA</span>}
      </header>

      <section className="status-panel">
        <StatusRow label="RouteLag Bridge" active={state.bridgeConnected} on="Connected" off="Waiting" />
        <StatusRow label="Fortnite" active={state.fortniteDetected} on="Detected" off="Not Detected" />
        <StatusRow label="Overlay" active={state.overlayVisible} on="Visible" off="Hidden" />
        <StatusRow label="Live Data" active={state.liveDataActive} on="Active" off="Waiting" />
      </section>

      {state.overlayError && (
        <p className="runtime-error">{state.overlayError}</p>
      )}

      {!state.overlayReady && !state.overlayError && (
        <p className="runtime-hint">Overlay engine is still starting…</p>
      )}

      {!window.routeLagHud && (
        <p className="runtime-error">HUD shell failed to load. Rebuild with npm run package.</p>
      )}

      <section className="actions">
        <button type="button" disabled={!window.routeLagHud} onClick={() => window.routeLagHud?.showOverlay()}>
          Show Overlay
        </button>
        <button type="button" disabled={!window.routeLagHud} onClick={() => window.routeLagHud?.hideOverlay()}>
          Hide Overlay
        </button>
        <button type="button" disabled={!window.routeLagHud} onClick={() => window.routeLagHud?.restartHud()}>
          Restart HUD
        </button>
        <button type="button" className="quiet" disabled={!window.routeLagHud} onClick={() => window.routeLagHud?.quitHud()}>
          Quit HUD
        </button>
      </section>

      <footer>
        <span>Live Fortnite Data</span>
        <span>v{state.version}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
