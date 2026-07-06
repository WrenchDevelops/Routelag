import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { Download, ExternalLink, MonitorOff } from "lucide-react";

import { api } from "../api";
import { useToast } from "../components/Toast";
import {
  dragWidgetPosition,
  parseHudLayout,
  pointerOffsetInElement,
  readLegacyHudLayout,
  siblingBounds,
  type HudDragOffset,
} from "../lib/hudLayout";
import type { HudTelemetryData, HudTelemetrySnapshot, InstallInfo } from "../types";

type HudWidgetId =
  | "ping"
  | "loss"
  | "jitter"
  | "fps"
  | "elims"
  | "health"
  | "shield"
  | "placement"
  | "materials"
  | "zone"
  | "match"
  | "damageDealt"
  | "damageTaken"
  | "deaths"
  | "assists";
type WidgetStyle = "Minimal" | "Glass" | "Compact";
type WidgetSize = "Small" | "Medium" | "Large";

interface HudWidget {
  id: HudWidgetId;
  name: string;
  detail: string;
  label: string;
  value: string;
  tone: string;
}

interface LayoutWidget {
  id: HudWidgetId;
  x: number;
  y: number;
  style: WidgetStyle;
  size: WidgetSize;
  opacity: number;
  showLabel: boolean;
  showIcon: boolean;
}

const defaultLayout: LayoutWidget[] = [];

const baseWidgets: Omit<HudWidget, "value">[] = [
  { id: "ping", name: "Ping", detail: "Live route ping", label: "PING", tone: "purple" },
  { id: "elims", name: "Eliminations", detail: "Match eliminations", label: "ELIMS", tone: "yellow" },
  { id: "health", name: "Health", detail: "Current health", label: "HP", tone: "green" },
  { id: "shield", name: "Shield", detail: "Current shield", label: "SHIELD", tone: "blue" },
  { id: "placement", name: "Placement", detail: "Current match rank", label: "PLACE", tone: "purple" },
  { id: "match", name: "Phase", detail: "Match phase", label: "PHASE", tone: "cyan" },
  { id: "deaths", name: "Deaths", detail: "Match deaths", label: "DEATHS", tone: "orange" },
  { id: "assists", name: "Assists", detail: "Match assists", label: "ASSISTS", tone: "cyan" },
  { id: "fps", name: "FPS", detail: "Current frame rate", label: "FPS", tone: "green" },
  { id: "loss", name: "Packet Loss", detail: "Connection stability", label: "LOSS", tone: "cyan" },
  { id: "jitter", name: "Jitter", detail: "Route consistency", label: "JITTER", tone: "blue" },
  { id: "materials", name: "Materials", detail: "Build inventory", label: "MATS", tone: "orange" },
  { id: "zone", name: "Zone Timer", detail: "Storm timing", label: "ZONE", tone: "blue" },
  { id: "damageDealt", name: "Damage Dealt", detail: "Damage dealt to players", label: "DEALT", tone: "orange" },
  { id: "damageTaken", name: "Damage Taken", detail: "Damage taken from players", label: "TAKEN", tone: "orange" },
];

const FALLBACK_OVERLAY_LAYOUT: LayoutWidget[] = [
  makeLayoutWidget("elims", 4, 8),
  makeLayoutWidget("health", 4, 20),
  makeLayoutWidget("shield", 4, 32),
  makeLayoutWidget("placement", 4, 44),
  makeLayoutWidget("match", 4, 56),
  makeLayoutWidget("ping", 4, 68),
];

export function HudOverlayPage() {
  const { showToast } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<HudDragOffset | null>(null);
  const dragSizeRef = useRef<{ width: number; height: number } | null>(null);
  const layoutReadyRef = useRef(false);
  const layoutSyncRef = useRef(false);
  const [layout, setLayout] = useState<LayoutWidget[]>(defaultLayout);
  const [selectedWidget, setSelectedWidget] = useState<HudWidgetId | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [telemetry, setTelemetry] = useState<HudTelemetrySnapshot | null>(null);
  const [overlayEditMode, setOverlayEditMode] = useState(false);
  const [installInfo, setInstallInfo] = useState<InstallInfo | null>(null);
  const [installingHud, setInstallingHud] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void api.getHudTelemetrySnapshot().then((snapshot) => {
        if (!cancelled) setTelemetry(snapshot);
      }).catch(() => undefined);
    };
    load();
    const interval = window.setInterval(load, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    void api.getInstallInfo().then(setInstallInfo).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api.loadHudLayout().then(async (raw) => {
      let parsed = parseHudLayout(raw) as LayoutWidget[];
      if (!parsed.length) {
        const legacy = readLegacyHudLayout() as LayoutWidget[];
        if (legacy.length) {
          parsed = legacy;
          await api.saveHudLayout(JSON.stringify(legacy));
        }
      }
      if (cancelled) return;
      if (parsed.length) {
        setLayout(parsed);
        setSelectedWidget(parsed[0]?.id ?? null);
      }
      layoutReadyRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!layoutReadyRef.current) return;
    const timer = window.setTimeout(() => {
      layoutSyncRef.current = true;
      void api.saveHudLayout(JSON.stringify(layout)).finally(() => {
        layoutSyncRef.current = false;
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [layout]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>("hud-layout-changed", (event) => {
      if (layoutSyncRef.current) return;
      const parsed = parseHudLayout(event.payload) as LayoutWidget[];
      setLayout(parsed);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("hud-overlay-closed", () => {
      setRunning(false);
      setPreviewing(false);
      setOverlayEditMode(false);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<boolean>("hud-overlay-edit-mode", (event) => {
      setOverlayEditMode(Boolean(event.payload));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const widgets = useMemo(() => makeWidgets(telemetry?.latest?.data), [telemetry]);
  const activeIds = useMemo(() => new Set(layout.map((item) => item.id)), [layout]);
  const selectedLayout = layout.find((item) => item.id === selectedWidget) ?? null;
  const selected = widgets.find((widget) => widget.id === selectedWidget) ?? widgets[0];
  const companionConnected = Boolean(telemetry?.status.connected);
  const fortniteDetected = Boolean(
    telemetry?.status.fortniteDetected || telemetry?.latest?.data?.fortniteDetected,
  );
  const liveDataActive = companionConnected && telemetry?.status.stale === false;
  const overlayRunning = running || Boolean(telemetry?.status.matchActive && fortniteDetected);
  const hudRuntimeMissing = Boolean(installInfo && !installInfo.hudInstalled);
  const hudRuntimeCorrupt = Boolean(installInfo?.hudCorrupt);
  const hudRuntimeHeadline = hudRuntimeCorrupt
    ? "HUD Runtime needs a reinstall"
    : "Install the HUD Runtime to unlock this page";
  const hudRuntimeDescription = hudRuntimeCorrupt
    ? "The RouteLag HUD Runtime installation looks damaged. Reinstall it to restore live Fortnite overlays and widget publishing."
    : "The HUD Runtime connects RouteLag to your live Fortnite match so in-game overlays can receive ping, eliminations, and other stats.";
  const hudRuntimeFootnote =
    "Routing and Replay Engine continue to work without the HUD Runtime.";

  const visibleWidgets = showMore
    ? widgets
    : widgets.filter((widget) =>
        ["ping", "elims", "health", "shield", "placement", "match", "deaths", "assists"].includes(
          widget.id,
        ),
      );

  function addWidget(id: HudWidgetId) {
    setLayout((current) => {
      if (current.some((item) => item.id === id)) return current;
      const next = [...current, makeLayoutWidget(id, 12 + current.length * 6, 12 + current.length * 5)];
      return next;
    });
    setSelectedWidget(id);
  }

  function toggleWidget(id: HudWidgetId) {
    if (activeIds.has(id)) {
      setLayout((current) => {
        const next = current.filter((item) => item.id !== id);
        setSelectedWidget(next[0]?.id ?? null);
        return next;
      });
      return;
    }
    addWidget(id);
  }

  function removeSelected() {
    if (!selectedLayout) return;
    setLayout((current) => {
      const next = current.filter((item) => item.id !== selectedLayout.id);
      setSelectedWidget(next[0]?.id ?? null);
      return next;
    });
  }

  function updateSelected(patch: Partial<LayoutWidget>) {
    if (!selectedLayout) return;
    setLayout((current) =>
      current.map((item) => (item.id === selectedLayout.id ? { ...item, ...patch } : item)),
    );
  }

  function moveWidget(event: PointerEvent<HTMLDivElement>, id: HudWidgetId) {
    const container = previewRef.current;
    const offset = dragOffsetRef.current;
    const size = dragSizeRef.current;
    if (!container || !offset || !size) return;
    const rect = container.getBoundingClientRect();
    const siblings = siblingBounds(container, event.currentTarget, ".hud-preview-widget");
    const { x, y } = dragWidgetPosition(
      event.clientX,
      event.clientY,
      rect,
      offset,
      size.width,
      size.height,
      siblings,
    );
    setLayout((current) => current.map((item) => (item.id === id ? { ...item, x, y } : item)));
  }

  function beginDrag(event: PointerEvent<HTMLDivElement>, id: HudWidgetId) {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    dragOffsetRef.current = pointerOffsetInElement(event, target);
    dragSizeRef.current = { width: rect.width, height: rect.height };
    target.setPointerCapture(event.pointerId);
    setSelectedWidget(id);
  }

  function saveLayout() {
    void api.saveHudLayout(JSON.stringify(layout));
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  }

  function resetLayout() {
    setLayout(defaultLayout);
    setSelectedWidget(null);
    setPreviewing(false);
    setRunning(false);
    void api.saveHudLayout(JSON.stringify(defaultLayout));
    void api.closeHudOverlayWindow().catch(() => undefined);
  }

  async function retryConnection() {
    try {
      const snapshot = await api.getHudTelemetrySnapshot();
      setTelemetry(snapshot);
      showToast(
        snapshot.status.connected
          ? "Overwolf HUD runtime is connected."
          : "Overwolf HUD runtime is not connected yet.",
        snapshot.status.connected ? "success" : "info",
      );
    } catch (error) {
      showToast(`Could not refresh companion status: ${String(error)}`, "error");
    }
  }

  async function installHudRuntime() {
    if (installingHud) return;
    setInstallingHud(true);
    try {
      await api.launchHudInstaller();
      setInstallInfo(await api.getInstallInfo());
      showToast("HUD Runtime launched.", "success");
    } catch (error) {
      showToast(`Could not launch HUD installer: ${String(error)}`, "error");
    } finally {
      setInstallingHud(false);
    }
  }

  async function copyPairingToken() {
    try {
      const snapshot = await api.getHudTelemetrySnapshot();
      const token = snapshot.status.token;
      if (!token) {
        showToast("No pairing token available.", "error");
        return;
      }
      await navigator.clipboard.writeText(token);
      showToast("Companion pairing token copied.", "success");
    } catch (error) {
      showToast(`Could not copy pairing token: ${String(error)}`, "error");
    }
  }

  async function launchOverlay() {
    if (launching) return;
    setLaunching(true);
    const safetyTimer = window.setTimeout(() => setLaunching(false), 5000);
    try {
      if (!installInfo?.hudInstalled) {
        await installHudRuntime();
      }

      const layoutToSave = layout.length ? layout : FALLBACK_OVERLAY_LAYOUT;
      if (!layout.length) setLayout(layoutToSave);
      await api.saveHudLayout(JSON.stringify(layoutToSave));
      await api.requestHudOverlayShow();

      // Desktop preview window for layout checks. Live Fortnite overlay is rendered by the Overwolf HUD runtime.
      await Promise.race([
        api.openHudOverlayWindow(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("HUD launch timed out")), 20000);
        }),
      ]);

      setRunning(true);
      setPreviewing(true);
      showToast(
        companionConnected
          ? "Layout published to HUD runtime. Overlay will appear in Fortnite once injected."
          : "Desktop preview opened. Start the HUD Runtime, then click Launch Overlay again for in-game HUD.",
        "success",
      );
    } catch (error) {
      setRunning(false);
      showToast(`Could not launch overlay: ${String(error)}`, "error");
    } finally {
      window.clearTimeout(safetyTimer);
      setLaunching(false);
    }
  }

  async function stopOverlay() {
    try {
      await api.closeHudOverlayWindow();
      setRunning(false);
      setOverlayEditMode(false);
      showToast("HUD overlay stopped.", "info");
    } catch (error) {
      showToast(`Could not stop overlay: ${String(error)}`, "error");
    }
  }

  async function toggleOverlayEditMode() {
    try {
      const next = await api.toggleHudOverlayEditMode();
      setOverlayEditMode(next);
      showToast(next ? "In-game HUD editing enabled." : "In-game HUD editing disabled.", "info");
    } catch (error) {
      showToast(`Could not toggle HUD edit mode: ${String(error)}`, "error");
    }
  }

  return (
    <main className={`hud-builder-main${hudRuntimeMissing ? " is-locked" : ""}`}>
      <header className="hud-builder-header" aria-hidden={hudRuntimeMissing}>
        <div>
          <div className="hud-title-row">
            <h1>HUD Overlay</h1>
          </div>
          <p>Design the in-game HUD that receives live stats from the Overwolf runtime.</p>
          <div className="hud-runtime-card">
            <StatusPill
              label="Runtime"
              value={companionConnected ? "Connected" : "Waiting"}
              active={companionConnected}
            />
            <StatusPill
              label="Game"
              value={fortniteDetected ? "Detected" : "Waiting"}
              active={fortniteDetected}
            />
            <StatusPill
              label="Live stats"
              value={liveDataActive ? "Receiving" : "--"}
              active={liveDataActive}
            />
            <StatusPill
              label="Overlay"
              value={overlayRunning ? "Running" : "Ready"}
              active={overlayRunning}
            />
            <span className="hud-runtime-time">Updated {formatLastUpdate(telemetry?.status.lastEventAt)}</span>
            <div className="hud-runtime-actions">
              <button type="button" className="hud-link-button" onClick={() => void retryConnection()}>
                Refresh
              </button>
              <button type="button" className="hud-link-button" onClick={() => void copyPairingToken()}>
                Pair Runtime
              </button>
            </div>
          </div>
          {running && (
            <div className="hud-shortcut-strip">
              <span>
                <kbd>Ctrl+Shift+H</kbd> {overlayEditMode ? "finish editing" : "edit desktop preview"}
              </span>
              <span>
                <kbd>Ctrl+Shift+`</kbd> close desktop preview
              </span>
            </div>
          )}
        </div>
        <div className="hud-header-actions">
          {running && (
            <button
              type="button"
              className={`hud-secondary-action${overlayEditMode ? " active" : ""}`}
              onClick={() => void toggleOverlayEditMode()}
            >
              <EditIcon />
              {overlayEditMode ? "Finish Editing" : "Edit In-Game"}
            </button>
          )}
          <button type="button" className="hud-secondary-action" onClick={() => setPreviewing((value) => !value)}>
            <EyeIcon />
            {previewing ? "Editing Overlay" : "Preview Overlay"}
          </button>
          <button
            type="button"
            className="hud-primary-action"
            disabled={launching}
            onClick={() => void (running ? stopOverlay() : launchOverlay())}
          >
            <RocketIcon />
            {launching ? "Launching..." : running ? "Stop Overlay" : "Launch Overlay"}
          </button>
        </div>
      </header>

      <section className="hud-builder-layout" aria-hidden={hudRuntimeMissing}>
        <aside className="hud-panel hud-widget-library">
          <PanelHeading title="Widgets" subtitle="Unsupported stats stay hidden as --." />
          <div className="hud-widget-list">
            {visibleWidgets.map((widget) => (
              <div
                key={widget.id}
                className={`hud-widget-row ${selectedWidget === widget.id ? "selected" : ""} ${activeIds.has(widget.id) ? "added" : ""}`}
              >
                <button
                  type="button"
                  className="hud-widget-main"
                  onClick={() =>
                    activeIds.has(widget.id)
                      ? setSelectedWidget(widget.id)
                      : addWidget(widget.id)
                  }
                >
                  <span className="hud-widget-icon">
                    {widgetIcon(widget.id)}
                  </span>
                  <span>
                    <strong>{widget.name}</strong>
                    <small>{widget.detail}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="hud-add-indicator"
                  aria-label={
                    activeIds.has(widget.id)
                      ? `Disable ${widget.name}`
                      : `Enable ${widget.name}`
                  }
                  onClick={() => toggleWidget(widget.id)}
                >
                  {activeIds.has(widget.id) ? "On" : <PlusIcon />}
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="hud-more-widgets" onClick={() => setShowMore((value) => !value)}>
            {showMore ? "Core Widgets" : "More Widgets"}
          </button>
        </aside>

        <section className="hud-panel hud-preview-panel">
          <PanelHeading title="Overlay Preview" subtitle="Matches the live HUD style." />
          <div ref={previewRef} className={`hud-game-preview ${previewing ? "previewing" : ""}`}>
            {layout.length ? (
              layout.map((item) => {
                const widget = widgets.find((candidate) => candidate.id === item.id);
                if (!widget) return null;
                return (
                  <div
                    key={item.id}
                    className={`hud-preview-widget hud-style-${item.style.toLowerCase()} hud-size-${item.size.toLowerCase()} ${!item.showIcon ? "no-icon" : ""} ${selectedWidget === item.id ? "selected" : ""}`}
                    style={{ left: `${item.x}%`, top: `${item.y}%`, opacity: item.opacity / 100 }}
                    onPointerDown={(event) => beginDrag(event, item.id)}
                    onPointerMove={(event) => {
                      if (event.buttons === 1) moveWidget(event, item.id);
                    }}
                  >
                    <WidgetCard widget={widget} layout={item} />
                  </div>
                );
              })
            ) : (
              <div className="hud-empty-preview">
                <strong>No widgets added yet.</strong>
                <p>Add widgets from the left to build your overlay.</p>
                <button type="button" onClick={() => addWidget("ping")}>Add Ping Widget</button>
              </div>
            )}
          </div>
        </section>

        <aside className="hud-panel hud-settings-panel">
          <PanelHeading title="Widget Settings" subtitle={selectedLayout ? "Configure the selected widget." : "Select a widget to customize it."} />
          {selectedLayout ? (
            <>
              <div className="hud-selected-widget">
                <span className="hud-widget-icon">{widgetIcon(selected.id)}</span>
                <strong>{selected.name}</strong>
                <button type="button" onClick={removeSelected}>Remove</button>
              </div>
              <SettingRow label="Style">
                <SegmentedControl
                  values={["Minimal", "Glass", "Compact"]}
                  active={selectedLayout.style}
                  onChange={(style) => updateSelected({ style: style as WidgetStyle })}
                />
              </SettingRow>
              <SettingRow label="Size">
                <SegmentedControl
                  values={["Small", "Medium", "Large"]}
                  active={selectedLayout.size}
                  onChange={(size) => updateSelected({ size: size as WidgetSize })}
                />
              </SettingRow>
              <SettingRow label="Opacity">
                <div className="hud-slider-row">
                  <input
                    type="range"
                    min="35"
                    max="100"
                    value={selectedLayout.opacity}
                    onChange={(event) => updateSelected({ opacity: Number(event.target.value) })}
                  />
                  <strong>{selectedLayout.opacity}%</strong>
                </div>
              </SettingRow>
              <SettingRow label="Position">
                <select
                  className="hud-select-button"
                  value={positionName(selectedLayout)}
                  onChange={(event) => updateSelected(positionPreset(event.target.value))}
                >
                  <option>Custom</option>
                  <option>Top Left</option>
                  <option>Top Right</option>
                  <option>Bottom Left</option>
                  <option>Bottom Right</option>
                </select>
              </SettingRow>
              <SettingRow label="Show Label">
                <Toggle checked={selectedLayout.showLabel} onChange={() => updateSelected({ showLabel: !selectedLayout.showLabel })} />
              </SettingRow>
              <SettingRow label="Show Icon">
                <Toggle checked={selectedLayout.showIcon} onChange={() => updateSelected({ showIcon: !selectedLayout.showIcon })} />
              </SettingRow>
            </>
          ) : (
            <div className="hud-settings-empty">Select a widget from the preview or library.</div>
          )}
        </aside>
      </section>

      <footer className="hud-bottom-bar" aria-hidden={hudRuntimeMissing}>
        <div className={`hud-status ${running ? "running" : ""}`}>
          <span />
          Overlay Status:
          <strong>
            {running
              ? overlayEditMode
                ? "Editing In-Game"
                : "Running"
              : savedFlash
                ? "Saved"
                : "Ready"}
          </strong>
        </div>
        <div className="hud-bottom-actions">
          <button type="button" onClick={saveLayout}><SaveIcon />Save Layout</button>
          <button type="button" onClick={resetLayout}><ResetIcon />Reset Layout</button>
          <button type="button" onClick={() => setPreviewing((value) => !value)}><EyeIcon />{previewing ? "Edit Overlay" : "Preview Overlay"}</button>
          <button
            type="button"
            className="hud-primary-action"
            disabled={launching}
            onClick={() => void (running ? stopOverlay() : launchOverlay())}
          >
            <RocketIcon />
            {launching ? "Launching..." : running ? "Stop Overlay" : "Launch Overlay"}
          </button>
        </div>
      </footer>

      {hudRuntimeMissing && (
        <div className="hud-runtime-lock" role="dialog" aria-modal="true" aria-labelledby="hud-runtime-lock-title">
          <div className="hud-runtime-lock-card">
            <div className="hud-runtime-lock-top">
              <span className="hud-runtime-lock-kicker">HUD Runtime</span>
              <div className="hud-runtime-lock-icon" aria-hidden="true">
                <MonitorOff size={24} strokeWidth={2.1} />
              </div>
            </div>

            <div className="hud-runtime-lock-copy">
              <h2 id="hud-runtime-lock-title">HUD Runtime Not Installed</h2>
              <p className="hud-runtime-lock-lead">{hudRuntimeHeadline}</p>
              <p className="hud-runtime-lock-body">{hudRuntimeDescription}</p>
            </div>

            <div className="hud-runtime-lock-footnote">{hudRuntimeFootnote}</div>

            <div className="hud-runtime-lock-actions">
              <button
                type="button"
                className="hud-runtime-lock-primary"
                disabled={installingHud}
                onClick={() => void installHudRuntime()}
              >
                <Download size={17} strokeWidth={2.2} aria-hidden />
                {installingHud
                  ? "Opening Installer..."
                  : hudRuntimeCorrupt
                    ? "Reinstall HUD Runtime"
                    : "Install HUD Runtime"}
              </button>
              <a
                href="https://routelag.com/hud"
                target="_blank"
                rel="noreferrer"
                className="hud-runtime-lock-secondary"
              >
                <ExternalLink size={15} strokeWidth={2.2} aria-hidden />
                Learn More
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function makeWidgets(data: HudTelemetryData | undefined): HudWidget[] {
  return baseWidgets.map((widget) => ({ ...widget, value: widgetValue(widget.id, data) }));
}

function widgetValue(id: HudWidgetId, data: HudTelemetryData | undefined) {
  switch (id) {
    case "ping":
      return data?.ping != null ? `${data.ping} ms` : "--";
    case "loss":
      return "--";
    case "jitter":
      return "--";
    case "fps":
      return data?.fps != null ? String(data.fps) : "--";
    case "elims":
      return data?.kills != null ? String(data.kills) : "--";
    case "health":
      return data?.health != null ? String(data.health) : "--";
    case "shield":
      return data?.shield != null ? String(data.shield) : "--";
    case "deaths":
      return data?.deaths != null ? String(data.deaths) : "--";
    case "assists":
      return data?.assists != null ? String(data.assists) : "--";
    case "placement":
      return data?.placement != null ? `#${data.placement}` : "--";
    case "materials":
      return data?.materials
        ? `${data.materials.wood ?? "--"} / ${data.materials.stone ?? "--"} / ${data.materials.metal ?? "--"}`
        : "--";
    case "zone":
      return data?.storm?.current != null && data.storm.max != null
        ? `${data.storm.current}/${data.storm.max}`
        : "--";
    case "match":
      return data?.phase ?? "--";
    case "damageDealt":
      return data?.damageDealt != null ? String(data.damageDealt) : "--";
    case "damageTaken":
      return data?.damageTaken != null ? String(data.damageTaken) : "--";
  }
}

function StatusPill({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <span className={`hud-status-pill ${active ? "active" : ""}`}>
      {label}: <strong>{value}</strong>
    </span>
  );
}

function formatLastUpdate(value: number | null | undefined) {
  if (!value) return "Never";
  const age = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (age < 2) return "just now";
  return `${age}s ago`;
}

function makeLayoutWidget(id: HudWidgetId, x: number, y: number): LayoutWidget {
  return { id, x, y, style: "Glass", size: "Medium", opacity: 85, showLabel: true, showIcon: true };
}

function positionPreset(value: string): Pick<LayoutWidget, "x" | "y"> {
  switch (value) {
    case "Top Left":
      return { x: 4, y: 5 };
    case "Top Right":
      return { x: 68, y: 5 };
    case "Bottom Left":
      return { x: 4, y: 78 };
    case "Bottom Right":
      return { x: 58, y: 78 };
    default:
      return { x: 40, y: 42 };
  }
}

function positionName(item: LayoutWidget) {
  if (item.x <= 8 && item.y <= 10) return "Top Left";
  if (item.x >= 64 && item.y <= 10) return "Top Right";
  if (item.x <= 8 && item.y >= 74) return "Bottom Left";
  if (item.x >= 54 && item.y >= 74) return "Bottom Right";
  return "Custom";
}

function PanelHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="hud-panel-heading">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function WidgetCard({ widget, layout }: { widget: HudWidget; layout: LayoutWidget }) {
  return (
    <>
      {layout.showIcon && <span className="hud-widget-icon">{widgetIcon(widget.id)}</span>}
      <div>
        {layout.showLabel && <small>{widget.label}</small>}
        <strong>{widget.value}</strong>
      </div>
      <MenuIcon />
    </>
  );
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="hud-setting-row">
      <span>{label}</span>
      {children}
    </div>
  );
}

function SegmentedControl({ values, active, onChange }: { values: string[]; active: string; onChange: (value: string) => void }) {
  return (
    <div className="hud-segmented-control">
      {values.map((value) => (
        <button type="button" className={value === active ? "active" : ""} key={value} onClick={() => onChange(value)}>
          {value}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return <button type="button" className={`hud-toggle ${checked ? "checked" : ""}`} onClick={onChange}><i /></button>;
}

function widgetIcon(id: HudWidgetId) {
  switch (id) {
    case "ping":
      return <WifiIcon />;
    case "loss":
    case "jitter":
      return <ChartIcon />;
    case "fps":
      return <FpsIcon />;
    case "elims":
    case "deaths":
    case "assists":
      return <TargetIcon />;
    case "health":
    case "shield":
      return <ShieldIcon />;
    case "placement":
      return <PlacementIcon />;
    case "materials":
      return <MaterialsIcon />;
    case "zone":
    case "match":
      return <TimerIcon />;
    case "damageDealt":
    case "damageTaken":
      return <DamageIcon />;
  }
}

function WifiIcon() { return <svg viewBox="0 0 24 24"><path d="M5 12.5a11 11 0 0 1 14 0" /><path d="M8.5 16a6 6 0 0 1 7 0" /><path d="M12 19h.01" /></svg>; }
function ChartIcon() { return <svg viewBox="0 0 24 24"><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 3-4 3 2 4-6" /></svg>; }
function FpsIcon() { return <svg viewBox="0 0 24 24"><path d="M5 7h14v10H5z" /><path d="M8 15V9h4" /><path d="M8 12h3" /><path d="M14 15V9h2.5a1.5 1.5 0 0 1 0 3H14" /></svg>; }
function TargetIcon() { return <svg viewBox="0 0 24 24"><path d="M12 4v3" /><path d="M12 17v3" /><path d="M4 12h3" /><path d="M17 12h3" /><path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" /><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>; }
function PlacementIcon() { return <svg viewBox="0 0 24 24"><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0Z" /><path d="M17 6h3v2a3 3 0 0 1-3 3" /><path d="M7 6H4v2a3 3 0 0 0 3 3" /></svg>; }
function MaterialsIcon() { return <svg viewBox="0 0 24 24"><path d="M4 8h6v4H4z" /><path d="M14 8h6v4h-6z" /><path d="M7 15h6v4H7z" /><path d="M16 15h4v4h-4z" /></svg>; }
function TimerIcon() { return <svg viewBox="0 0 24 24"><path d="M10 3h4" /><path d="M12 8v5l3 2" /><path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" /></svg>; }
function DamageIcon() { return <svg viewBox="0 0 24 24"><path d="m13 2-2 7h7L9 22l2-8H5z" /></svg>; }
function ShieldIcon() { return <svg viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></svg>; }
function MenuIcon() { return <svg viewBox="0 0 24 24"><path d="M12 5h.01" /><path d="M12 12h.01" /><path d="M12 19h.01" /></svg>; }
function EyeIcon() { return <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>; }
function EditIcon() { return <svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>; }
function RocketIcon() { return <svg viewBox="0 0 24 24"><path d="M13 2 5 14h6l-1 8 9-13h-6l1-7Z" /><path d="M6 20h4" /></svg>; }
function SaveIcon() { return <svg viewBox="0 0 24 24"><path d="M5 4h12l2 2v14H5z" /><path d="M8 4v6h8" /><path d="M8 20v-6h8v6" /></svg>; }
function ResetIcon() { return <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 5v5h5" /></svg>; }
