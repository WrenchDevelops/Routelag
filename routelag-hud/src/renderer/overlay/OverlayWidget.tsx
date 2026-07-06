import type { HudWidgetLayout, RouteLagHudState } from "../../shared/hudTypes";

function valueOrDash(value: unknown): string {
  if (value === undefined || value === null || value === "") return "--";
  return String(value);
}

function widgetValue(id: HudWidgetLayout["id"], state: RouteLagHudState): string {
  switch (id) {
    case "ping":
      return state.ping === undefined ? "--" : `${state.ping} ms`;
    case "fps":
      return valueOrDash(state.fps);
    case "kills":
      return valueOrDash(state.kills);
    case "health":
      return valueOrDash(state.health);
    case "shield":
      return valueOrDash(state.shield);
    case "placement":
      return state.placement === undefined ? "--" : `#${state.placement}`;
    case "materials":
      return `${valueOrDash(state.materials?.wood)} / ${valueOrDash(state.materials?.stone)} / ${valueOrDash(state.materials?.metal)}`;
    case "phase":
      return valueOrDash(state.phase);
    case "damageDealt":
      return valueOrDash(state.damageDealt);
    case "damageTaken":
      return valueOrDash(state.damageTaken);
  }
}

function widgetLabel(id: HudWidgetLayout["id"]): string {
  switch (id) {
    case "fps":
      return "FPS";
    case "kills":
      return "Elims";
    case "damageDealt":
      return "Dealt";
    case "damageTaken":
      return "Taken";
    case "phase":
      return "Phase";
    default:
      return id.charAt(0).toUpperCase() + id.slice(1);
  }
}

export function OverlayWidget({ widget, state }: { widget: HudWidgetLayout; state: RouteLagHudState }) {
  if (!widget.visible) return null;
  const sizeClass = `widget-${widget.size}`;
  return (
    <section
      className={`hud-widget ${sizeClass}`}
      style={{
        left: `calc(${widget.x} / 1920 * 100vw)`,
        top: `calc(${widget.y} / 1080 * 100vh)`,
        opacity: widget.opacity
      }}
    >
      <span className="hud-label">{widgetLabel(widget.id)}</span>
      <strong className="hud-value">{widgetValue(widget.id, state)}</strong>
    </section>
  );
}
