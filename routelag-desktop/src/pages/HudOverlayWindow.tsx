import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { listen } from "@tauri-apps/api/event";

import { api } from "../api";
import {
  dragWidgetPosition,
  parseHudLayout,
  pointerOffsetInElement,
  siblingBounds,
  type HudDragOffset,
  type HudLayoutWidget,
} from "../lib/hudLayout";
import type { HudTelemetryData, HudTelemetrySnapshot } from "../types";

const FALLBACK_WIDGETS: HudLayoutWidget[] = [
  { id: "elims", x: 4, y: 8, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: true },
  { id: "health", x: 4, y: 20, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: true },
  { id: "shield", x: 4, y: 32, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: true },
  { id: "placement", x: 4, y: 44, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: true },
  { id: "match", x: 4, y: 56, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: true },
  { id: "ping", x: 4, y: 68, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: true },
];

const EMPTY_DATA: HudTelemetryData = {};

export function HudOverlayWindow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<HudDragOffset | null>(null);
  const dragSizeRef = useRef<{ width: number; height: number } | null>(null);
  const layoutSyncRef = useRef(false);
  const [snapshot, setSnapshot] = useState<HudTelemetrySnapshot | null>(null);
  const [layout, setLayout] = useState<HudLayoutWidget[]>(FALLBACK_WIDGETS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadLayout = () => {
      void api.loadHudLayout().then((raw) => {
        if (cancelled) return;
        const parsed = parseHudLayout(raw);
        setLayout(parsed);
      });
    };
    loadLayout();

    let unlistenLayout: (() => void) | undefined;
    void listen<string>("hud-layout-changed", (event) => {
      if (draggingRef.current || layoutSyncRef.current) return;
      const parsed = parseHudLayout(event.payload);
      setLayout(parsed);
    }).then((fn) => {
      unlistenLayout = fn;
    });

    let unlistenEdit: (() => void) | undefined;
    void listen<boolean>("hud-overlay-edit-mode", (event) => {
      setEditMode(Boolean(event.payload));
    }).then((fn) => {
      unlistenEdit = fn;
    });

    return () => {
      cancelled = true;
      unlistenLayout?.();
      unlistenEdit?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadTelemetry = () => {
      void api
        .getHudTelemetrySnapshot()
        .then((next) => {
          if (!cancelled) setSnapshot(next);
        })
        .catch(() => undefined);
    };
    loadTelemetry();
    const interval = window.setInterval(loadTelemetry, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const cards = useMemo(() => {
    const data = snapshot?.latest?.data ?? EMPTY_DATA;
    return layout.map((item) => ({
      ...item,
      label: widgetLabel(item.id),
      value: widgetValue(item.id, data),
    }));
  }, [layout, snapshot]);

  function moveWidget(event: PointerEvent<HTMLElement>, id: string) {
    if (!editMode) return;
    const container = containerRef.current;
    const offset = dragOffsetRef.current;
    const size = dragSizeRef.current;
    if (!container || !offset || !size) return;
    const rect = container.getBoundingClientRect();
    const siblings = siblingBounds(container, event.currentTarget, ".hud-live-widget");
    const { x, y } = dragWidgetPosition(
      event.clientX,
      event.clientY,
      rect,
      offset,
      size.width,
      size.height,
      siblings,
    );
    setLayout((current) =>
      current.map((item) => (item.id === id ? { ...item, x, y } : item)),
    );
  }

  function beginDrag(event: PointerEvent<HTMLElement>, id: string) {
    if (!editMode) return;
    event.preventDefault();
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    dragOffsetRef.current = pointerOffsetInElement(event, target);
    dragSizeRef.current = { width: rect.width, height: rect.height };
    target.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setDraggingId(id);
  }

  function endDrag() {
    if (!editMode) return;
    draggingRef.current = false;
    dragOffsetRef.current = null;
    dragSizeRef.current = null;
    setDraggingId(null);
    setLayout((current) => {
      layoutSyncRef.current = true;
      void api.saveHudLayout(JSON.stringify(current)).finally(() => {
        layoutSyncRef.current = false;
      });
      return current;
    });
  }

  return (
    <main
      ref={containerRef}
      className={`hud-overlay-window${editMode ? " editing" : ""}`}
    >
      {editMode && (
        <div className="hud-overlay-edit-banner" aria-live="polite">
          <span className="hud-overlay-edit-dot" />
          <strong>Editing overlay</strong>
          <span className="hud-overlay-edit-sep" />
          <span>Drag widgets to move them</span>
          <kbd>Ctrl+Shift+H</kbd>
          <span>done</span>
        </div>
      )}

      {cards.map((card) => (
        <article
          key={card.id}
          className={[
            "hud-live-widget",
            `hud-live-${card.style.toLowerCase()}`,
            `hud-live-${card.size.toLowerCase()}`,
            !card.showIcon ? "no-icon" : "",
            editMode ? "editable" : "",
            draggingId === card.id ? "dragging" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            left: `${card.x}%`,
            top: `${card.y}%`,
            opacity: card.opacity / 100,
          }}
          onPointerDown={(event) => beginDrag(event, card.id)}
          onPointerMove={(event) => {
            if (editMode && event.buttons === 1 && draggingId === card.id) {
              moveWidget(event, card.id);
            }
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {card.showIcon && (
            <span className="hud-live-icon" aria-hidden="true">
              {widgetIcon(card.id)}
            </span>
          )}
          <div className="hud-live-copy">
            {card.showLabel && <span className="hud-live-label">{card.label}</span>}
            <strong className="hud-live-value">{card.value}</strong>
          </div>
        </article>
      ))}
    </main>
  );
}

function widgetLabel(id: string) {
  switch (id) {
    case "ping":
      return "Ping";
    case "loss":
      return "Packet Loss";
    case "jitter":
      return "Jitter";
    case "fps":
      return "FPS";
    case "elims":
      return "Eliminations";
    case "health":
      return "Health";
    case "shield":
      return "Shield";
    case "deaths":
      return "Deaths";
    case "assists":
      return "Assists";
    case "placement":
      return "Placement";
    case "materials":
      return "Materials";
    case "zone":
      return "Zone";
    case "match":
      return "Phase";
    case "damageDealt":
      return "Damage Dealt";
    case "damageTaken":
      return "Damage Taken";
    default:
      return id;
  }
}

function widgetValue(id: string, data: HudTelemetryData) {
  switch (id) {
    case "ping":
      return data.ping != null ? `${data.ping} ms` : "--";
    case "loss":
      return "--";
    case "jitter":
      return "--";
    case "fps":
      return data.fps != null ? String(data.fps) : "--";
    case "elims":
      return data.kills != null ? String(data.kills) : "--";
    case "health":
      return data.health != null ? String(data.health) : "--";
    case "shield":
      return data.shield != null ? String(data.shield) : "--";
    case "deaths":
      return data.deaths != null ? String(data.deaths) : "--";
    case "assists":
      return data.assists != null ? String(data.assists) : "--";
    case "placement":
      return data.placement != null ? `#${data.placement}` : "--";
    case "materials":
      return data.materials
        ? `${data.materials.wood ?? "--"} / ${data.materials.stone ?? "--"} / ${data.materials.metal ?? "--"}`
        : "--";
    case "zone":
      return data.storm?.current != null && data.storm.max != null
        ? `${data.storm.current}/${data.storm.max}`
        : "--";
    case "match":
      return data.phase ?? "--";
    case "damageDealt":
      return data.damageDealt != null ? String(data.damageDealt) : "--";
    case "damageTaken":
      return data.damageTaken != null ? String(data.damageTaken) : "--";
    default:
      return "--";
  }
}

function widgetIcon(id: string) {
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
    default:
      return null;
  }
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 12.5a11 11 0 0 1 14 0" />
      <path d="M8.5 16a6 6 0 0 1 7 0" />
      <path d="M12 19h.01" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 3-4 3 2 4-6" />
    </svg>
  );
}
function FpsIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 7h14v10H5z" />
      <path d="M8 15V9h4" />
      <path d="M8 12h3" />
      <path d="M14 15V9h2.5a1.5 1.5 0 0 1 0 3H14" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 4v3" />
      <path d="M12 17v3" />
      <path d="M4 12h3" />
      <path d="M17 12h3" />
      <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    </svg>
  );
}
function PlacementIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
      <path d="M17 6h3v2a3 3 0 0 1-3 3" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}
function MaterialsIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 8h6v4H4z" />
      <path d="M14 8h6v4h-6z" />
      <path d="M7 15h6v4H7z" />
      <path d="M16 15h4v4h-4z" />
    </svg>
  );
}
function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M10 3h4" />
      <path d="M12 8v5l3 2" />
      <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
    </svg>
  );
}
function DamageIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="m13 2-2 7h7L9 22l2-8H5z" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
