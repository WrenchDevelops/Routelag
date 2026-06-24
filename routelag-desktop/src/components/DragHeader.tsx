import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

const appWindow = getCurrentWindow();

interface DragHeaderProps {
  onSettings: () => void;
}

export function DragHeader({ onSettings }: DragHeaderProps) {
  const startDragging = async (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    await appWindow.startDragging();
  };

  const minimizeWindow = async () => {
    await appWindow.minimize();
  };

  const closeWindow = async () => {
    await appWindow.close();
  };

  return (
    <header
      className="drag-header"
      data-tauri-drag-region
      onMouseDown={(event) => void startDragging(event)}
    >
      <button
        type="button"
        className="settings-btn"
        aria-label="Open account settings"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onSettings}
      >
        &#9881;
      </button>
      <div className="window-actions">
        <button
          type="button"
          className="minimize-btn"
          aria-label="Minimize RouteLag"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void minimizeWindow()}
        >
          &minus;
        </button>
        <button
          type="button"
          className="close-btn"
          aria-label="Close RouteLag"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void closeWindow()}
        >
          &times;
        </button>
      </div>
    </header>
  );
}
