/* global overwolf */

const FALLBACK_LAYOUT = [
  { id: "kills", x: 4, y: 8, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: false },
  { id: "health", x: 4, y: 20, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: false },
  { id: "shield", x: 4, y: 32, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: false },
  { id: "placement", x: 4, y: 44, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: false },
  { id: "phase", x: 4, y: 56, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: false },
  { id: "ping", x: 4, y: 68, style: "Glass", size: "Medium", opacity: 92, showLabel: true, showIcon: false },
];

let layout = FALLBACK_LAYOUT.slice();
let state = {};

function display(value) {
  return value == null || value === "" ? "--" : String(value);
}

function widgetLabel(id) {
  switch (id) {
    case "ping":
      return "Ping";
    case "kills":
    case "elims":
      return "Eliminations";
    case "health":
      return "Health";
    case "shield":
      return "Shield";
    case "placement":
      return "Placement";
    case "phase":
    case "match":
      return "Phase";
    case "deaths":
      return "Deaths";
    case "assists":
      return "Assists";
    case "fps":
      return "FPS";
    case "materials":
      return "Materials";
    default:
      return id;
  }
}

function widgetValue(id) {
  switch (id) {
    case "ping":
      return display(state.ping);
    case "kills":
    case "elims":
      return display(state.kills);
    case "health":
      return display(state.health);
    case "shield":
      return display(state.shield);
    case "placement":
      return state.placement != null ? `#${state.placement}` : "--";
    case "phase":
    case "match":
      return display(state.phase);
    case "deaths":
      return display(state.deaths);
    case "assists":
      return display(state.assists);
    case "fps":
      return display(state.fps);
    case "materials":
      if (!state.materials) return "--";
      return `${display(state.materials.wood)} / ${display(state.materials.stone)} / ${display(state.materials.metal)}`;
    default:
      return "--";
  }
}

function render() {
  const root = document.getElementById("hud-root");
  if (!root) return;

  const activeLayout = layout.length ? layout : FALLBACK_LAYOUT;
  root.innerHTML = activeLayout
    .map((item) => {
      const style = String(item.style || "Glass").toLowerCase();
      const size = String(item.size || "Medium").toLowerCase();
      const opacity = Number(item.opacity != null ? item.opacity : 92) / 100;
      const label = item.showLabel === false ? "" : `<span class="hud-live-label">${widgetLabel(item.id)}</span>`;
      return `
        <article
          class="hud-live-widget hud-live-${style} hud-live-${size}"
          style="left:${Number(item.x) || 0}%;top:${Number(item.y) || 0}%;opacity:${opacity}"
        >
          <div class="hud-live-copy">
            ${label}
            <strong class="hud-live-value">${widgetValue(item.id)}</strong>
          </div>
        </article>
      `;
    })
    .join("");
}

overwolf.windows.onMessageReceived.addListener((message) => {
  if (message.id === "ROUTELAG_HUD_UPDATE") {
    state = message.content || {};
    render();
    return;
  }
  if (message.id === "ROUTELAG_HUD_LAYOUT") {
    layout = Array.isArray(message.content) ? message.content : FALLBACK_LAYOUT;
    render();
  }
});

render();
