import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

function currentWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function TitleBar({ title }: { title: string }) {
  const startDragging = async (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    await currentWindow()?.startDragging();
  };

  return (
    <header className="title-bar" data-tauri-drag-region onMouseDown={(e) => void startDragging(e)}>
      <div className="title-bar-brand" data-tauri-drag-region>
        <span className="title-bar-logo" aria-hidden="true">
          RL
        </span>
        <span className="title-bar-text">{title}</span>
      </div>
      <div className="title-bar-actions">
        <button
          type="button"
          className="title-bar-btn"
          aria-label="Minimize"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => void currentWindow()?.minimize()}
        >
          &minus;
        </button>
        <button
          type="button"
          className="title-bar-btn title-bar-btn-close"
          aria-label="Close"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => void currentWindow()?.close()}
        >
          &times;
        </button>
      </div>
    </header>
  );
}
