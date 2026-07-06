export const HUD_LAYOUT_STORAGE_KEY = "routelag.hudOverlayLayout.v2";

export interface HudLayoutWidget {
  id: string;
  x: number;
  y: number;
  style: string;
  size: string;
  opacity: number;
  showLabel: boolean;
  showIcon: boolean;
}

export interface HudDragOffset {
  x: number;
  y: number;
}

export interface HudDragBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SNAP_THRESHOLD_PX = 10;

export function parseHudLayout(raw: string): HudLayoutWidget[] {
  try {
    const parsed = JSON.parse(raw) as HudLayoutWidget[] | null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item.id !== "string") return null;
        if (item.id === "damage") {
          return { ...item, id: "damageDealt" };
        }
        return item;
      })
      .filter((item): item is HudLayoutWidget => item !== null);
  } catch {
    return [];
  }
}

export function readLegacyHudLayout(): HudLayoutWidget[] {
  try {
    return parseHudLayout(window.localStorage.getItem(HUD_LAYOUT_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function pointerOffsetInElement(
  event: { clientX: number; clientY: number },
  element: HTMLElement,
): HudDragOffset {
  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

/** Pixel bounds of sibling widgets relative to the container's top-left. */
export function siblingBounds(
  container: HTMLElement,
  dragging: HTMLElement,
  selector: string,
): HudDragBounds[] {
  const containerRect = container.getBoundingClientRect();
  return Array.from(container.querySelectorAll<HTMLElement>(selector))
    .filter((element) => element !== dragging)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
      };
    });
}

/**
 * Position a dragged widget from the pointer, preserving the grab point and
 * snapping to sibling edges/centers so stacked panels align cleanly.
 */
export function dragWidgetPosition(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  offset: HudDragOffset,
  widgetWidth: number,
  widgetHeight: number,
  siblings: HudDragBounds[],
): { x: number; y: number } {
  let left = clientX - offset.x - containerRect.left;
  let top = clientY - offset.y - containerRect.top;

  const maxLeft = Math.max(0, containerRect.width - widgetWidth);
  const maxTop = Math.max(0, containerRect.height - widgetHeight);
  left = clamp(left, 0, maxLeft);
  top = clamp(top, 0, maxTop);

  const snapped = snapToSiblings(left, top, widgetWidth, widgetHeight, siblings, {
    width: containerRect.width,
    height: containerRect.height,
  });

  return {
    x: (snapped.left / containerRect.width) * 100,
    y: (snapped.top / containerRect.height) * 100,
  };
}

function snapToSiblings(
  left: number,
  top: number,
  width: number,
  height: number,
  siblings: HudDragBounds[],
  container: { width: number; height: number },
): { left: number; top: number } {
  const xTargets: number[] = [0, container.width - width];
  const yTargets: number[] = [0, container.height - height];

  for (const sibling of siblings) {
    xTargets.push(
      sibling.left,
      sibling.left + sibling.width,
      sibling.left - width,
      sibling.left + sibling.width - width,
      sibling.left + sibling.width / 2 - width / 2,
    );
    yTargets.push(
      sibling.top,
      sibling.top + sibling.height,
      sibling.top - height,
      sibling.top + sibling.height - height,
      sibling.top + sibling.height / 2 - height / 2,
    );
  }

  return {
    left: nearestSnap(left, xTargets, 0, Math.max(0, container.width - width)),
    top: nearestSnap(top, yTargets, 0, Math.max(0, container.height - height)),
  };
}

function nearestSnap(value: number, targets: number[], min: number, max: number): number {
  let best = value;
  let bestDistance = SNAP_THRESHOLD_PX;

  for (const target of targets) {
    const clampedTarget = clamp(target, min, max);
    const distance = Math.abs(value - clampedTarget);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = clampedTarget;
    }
  }

  return best;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
