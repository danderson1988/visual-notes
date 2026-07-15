// Pure geometry utilities for connection routing.
// All coordinates are in canvas-space pixels.

export interface Rect  { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

/**
 * Given a ray that starts INSIDE rect (at cx, cy) and points toward (tx, ty),
 * returns the point where the ray exits the rect boundary.
 */
export function rectExitPoint(cx: number, cy: number, tx: number, ty: number, rect: Rect): Point {
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const { x: rx, y: ry, w: rw, h: rh } = rect;
  const ts: number[] = [];
  if (dx !== 0) { ts.push((rx - cx) / dx); ts.push((rx + rw - cx) / dx); }
  if (dy !== 0) { ts.push((ry - cy) / dy); ts.push((ry + rh - cy) / dy); }

  let best = Infinity;
  for (const t of ts) {
    if (t <= 0.0001) continue;
    const ix = cx + t * dx, iy = cy + t * dy;
    if (ix >= rx - 0.5 && ix <= rx + rw + 0.5 && iy >= ry - 0.5 && iy <= ry + rh + 0.5) {
      if (t < best) best = t;
    }
  }
  if (!isFinite(best)) return { x: cx, y: cy };
  return { x: cx + best * dx, y: cy + best * dy };
}

/** Compute source and target anchor points for a straight-routed connection. */
export function straightAnchors(from: Rect, to: Rect): { src: Point; tgt: Point } {
  const fcx = from.x + from.w / 2, fcy = from.y + from.h / 2;
  const tcx = to.x + to.w / 2,   tcy = to.y + to.h / 2;
  return {
    src: rectExitPoint(fcx, fcy, tcx, tcy, from),
    tgt: rectExitPoint(tcx, tcy, fcx, fcy, to),
  };
}

/** Resolve 'auto' elbow orientation based on relative card positions. */
export function resolveOrientation(
  from: Rect, to: Rect,
  hint: 'auto' | 'horizontal-first' | 'vertical-first'
): 'horizontal-first' | 'vertical-first' {
  if (hint !== 'auto') return hint;
  const dx = Math.abs((to.x + to.w / 2) - (from.x + from.w / 2));
  const dy = Math.abs((to.y + to.h / 2) - (from.y + from.h / 2));
  return dx >= dy ? 'horizontal-first' : 'vertical-first';
}

/** Compute source and target anchor points for an elbow-routed connection. */
export function elbowAnchors(
  from: Rect, to: Rect,
  orientation: 'horizontal-first' | 'vertical-first'
): { src: Point; tgt: Point } {
  const fcx = from.x + from.w / 2, fcy = from.y + from.h / 2;
  const tcx = to.x + to.w / 2,   tcy = to.y + to.h / 2;

  if (orientation === 'horizontal-first') {
    return tcx >= fcx
      ? { src: { x: from.x + from.w, y: fcy }, tgt: { x: to.x, y: tcy } }
      : { src: { x: from.x, y: fcy },           tgt: { x: to.x + to.w, y: tcy } };
  } else {
    return tcy >= fcy
      ? { src: { x: fcx, y: from.y + from.h }, tgt: { x: tcx, y: to.y } }
      : { src: { x: fcx, y: from.y },           tgt: { x: tcx, y: to.y + to.h } };
  }
}

/** Build SVG path string for a straight connection. */
export function buildStraightPath(src: Point, tgt: Point): string {
  return `M ${r(src.x)} ${r(src.y)} L ${r(tgt.x)} ${r(tgt.y)}`;
}

/**
 * The point a curved connection passes through, given a perpendicular
 * `offset` (px) from the straight-line midpoint. offset = 0 is a straight
 * line; positive/negative bends to either side. Also used to position the
 * draggable bend handle.
 */
export function curveThroughPoint(src: Point, tgt: Point, offset: number): Point {
  const mid = { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 };
  const dx = tgt.x - src.x, dy = tgt.y - src.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  return { x: mid.x + px * offset, y: mid.y + py * offset };
}

/**
 * Signed perpendicular distance of `point` from the src→tgt line, i.e. the
 * inverse of curveThroughPoint — used while dragging the bend handle to
 * convert the pointer's canvas-space position back into an offset.
 */
export function perpendicularOffset(src: Point, tgt: Point, point: Point): number {
  const dx = tgt.x - src.x, dy = tgt.y - src.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const mid = { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 };
  return (point.x - mid.x) * px + (point.y - mid.y) * py;
}

/** Build SVG path string for a curved connection bending through curveThroughPoint(src, tgt, offset). */
export function buildCurvedPath(src: Point, tgt: Point, offset: number): string {
  if (offset === 0) return buildStraightPath(src, tgt);
  const mid = { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 };
  const dx = tgt.x - src.x, dy = tgt.y - src.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  // Quadratic bezier control point: chosen so the curve passes through
  // curveThroughPoint (mid + perp*offset) at its t=0.5 midpoint.
  const ctrl = { x: mid.x + px * offset * 2, y: mid.y + py * offset * 2 };
  return `M ${r(src.x)} ${r(src.y)} Q ${r(ctrl.x)} ${r(ctrl.y)} ${r(tgt.x)} ${r(tgt.y)}`;
}

/** Build SVG path string for an elbow connection (two right-angle segments). */
export function buildElbowPath(
  src: Point, tgt: Point,
  orientation: 'horizontal-first' | 'vertical-first'
): string {
  if (orientation === 'horizontal-first') {
    const midX = r((src.x + tgt.x) / 2);
    return `M ${r(src.x)} ${r(src.y)} H ${midX} V ${r(tgt.y)} H ${r(tgt.x)}`;
  } else {
    const midY = r((src.y + tgt.y) / 2);
    return `M ${r(src.x)} ${r(src.y)} V ${midY} H ${r(tgt.x)} V ${r(tgt.y)}`;
  }
}

/** Round to 2 decimal places to keep SVG output tidy. */
function r(n: number): number { return Math.round(n * 100) / 100; }
