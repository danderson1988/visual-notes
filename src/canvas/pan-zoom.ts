export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/** Convert a screen point (relative to the canvas outer rect) to canvas space. */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  vp: Viewport
): { x: number; y: number } {
  return {
    x: (screenX - vp.x) / vp.zoom,
    y: (screenY - vp.y) / vp.zoom,
  };
}

/**
 * Zoom in/out around the mouse position.
 * `rect` is the bounding rect of the outer container.
 */
export function applyWheelZoom(
  e: WheelEvent,
  vp: Viewport,
  rect: DOMRect
): Viewport {
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newZoom = clampZoom(vp.zoom * factor);
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  return {
    zoom: newZoom,
    x: mouseX - (mouseX - vp.x) * (newZoom / vp.zoom),
    y: mouseY - (mouseY - vp.y) * (newZoom / vp.zoom),
  };
}

/** Zoom around a pinch midpoint (canvas-outer-relative coordinates). */
export function applyPinchZoom(
  midX: number,
  midY: number,
  newZoom: number,
  vp: Viewport
): Viewport {
  const clamped = clampZoom(newZoom);
  return {
    zoom: clamped,
    x: midX - (midX - vp.x) * (clamped / vp.zoom),
    y: midY - (midY - vp.y) * (clamped / vp.zoom),
  };
}

/** Returns the CSS transform string for the inner canvas div. */
export function viewportTransform(vp: Viewport): string {
  return `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`;
}
