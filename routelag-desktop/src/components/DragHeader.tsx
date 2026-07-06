import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PointerEvent } from "react";

import { api } from "../api";

interface DragHeaderProps {
  onSettings?: () => void;
}

function stopWindowDrag(event: PointerEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}

export function DragHeader(_props: DragHeaderProps) {
  const minimizeWindow = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {
      // Best effort only.
    }
  };

  const closeWindow = async () => {
    try {
      await api.exitApp();
      return;
    } catch {
      // Fall back to window close if the exit command is unavailable.
    }
    try {
      await getCurrentWindow().close();
    } catch {
      // Best effort only.
    }
  };

  return (
    <header className="drag-header">
      <div className="header-spacer" data-tauri-drag-region aria-hidden="true" />
      <div className="window-actions" aria-label="Window controls">
        <button
          type="button"
          className="minimize-btn"
          aria-label="Minimize RouteLag"
          onPointerDown={stopWindowDrag}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void minimizeWindow();
          }}
        >
          &minus;
        </button>
        <button
          type="button"
          className="close-btn"
          aria-label="Close RouteLag"
          onPointerDown={stopWindowDrag}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void closeWindow();
          }}
        >
          &times;
        </button>
      </div>
    </header>
  );
}
