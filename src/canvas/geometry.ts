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

/**
 * The quadratic bezier control point for a curved connection bending
 * through curveThroughPoint(src, tgt, offset) at its t=0.5 midpoint.
 * Exposed separately from buildCurvedPath so callers that need the
 * curve's tangent near an endpoint (e.g. pulling an arrowhead-bearing
 * endpoint back along the curve rather than the straight src-tgt line)
 * can get it without re-deriving the same math.
 */
export function curveControlPoint(src: Point, tgt: Point, offset: number): Point {
  const mid = { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 };
  const dx = tgt.x - src.x, dy = tgt.y - src.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  return { x: mid.x + px * offset * 2, y: mid.y + py * offset * 2 };
}

/** Build SVG path string for a curved connection bending through curveThroughPoint(src, tgt, offset). */
export function buildCurvedPath(src: Point, tgt: Point, offset: number): string {
  if (offset === 0) return buildStraightPath(src, tgt);
  const ctrl = curveControlPoint(src, tgt, offset);
  return `M ${r(src.x)} ${r(src.y)} Q ${r(ctrl.x)} ${r(ctrl.y)} ${r(tgt.x)} ${r(tgt.y)}`;
}

/**
 * Point `dist` px back from `to`, along the straight line from `from`
 * toward `to` — i.e. moved `dist` px toward `from`. Used to shorten a
 * connection's endpoint so its arrowhead marker (tip anchored exactly at
 * the original endpoint) has room to taper to a point without the line's
 * own stroke width poking out past the narrowing triangle. Degenerates to
 * `from` itself if the segment is shorter than `dist` (arrowhead longer
 * than the whole connection), which collapses the line to nothing rather
 * than overshooting past the other end.
 */
export function pullBackPoint(from: Point, to: Point, dist: number): Point {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len <= dist || len === 0) return { x: from.x, y: from.y };
  const t = dist / len;
  return { x: to.x - dx * t, y: to.y - dy * t };
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

// ── Trimmed variants ─────────────────────────────────────────────
//
// Used for the VISIBLE stroke of an arrowhead-bearing connection, which
// must stop short of the endpoint so the shaft never reaches into the
// arrowhead's tapering tip. The critical invariant, learned the hard way:
// the trimmed path must be an EXACT SUB-SEGMENT of the untrimmed path.
// Rebuilding a curve/elbow from pulled-back endpoints yields a *different*
// shape whose middle separates from everything derived from the true path
// (hit area, selection outline, bend handle) — subtle on gentle curves,
// obvious and click-breaking at extreme bends.

/** Quadratic bezier point at parameter t. */
export function quadBezierPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * buildStraightPath, minus `trimStart` px at the src end and `trimEnd` px
 * at the tgt end. Returns null when the trims consume the whole segment
 * (nothing left to draw — the arrowheads alone cover it).
 */
export function buildTrimmedStraightPath(src: Point, tgt: Point, trimStart: number, trimEnd: number): string | null {
  if (Math.hypot(tgt.x - src.x, tgt.y - src.y) <= trimStart + trimEnd) return null;
  const s = trimStart > 0 ? pullBackPoint(tgt, src, trimStart) : src;
  const t = trimEnd > 0 ? pullBackPoint(src, tgt, trimEnd) : tgt;
  return buildStraightPath(s, t);
}

/**
 * buildCurvedPath, trimmed by ~`trimStart`/`trimEnd` px of arc length at
 * each end — computed as a true sub-curve of the original quadratic (de
 * Casteljau restriction to [a, b]), so every point of the result lies
 * exactly on the untrimmed curve. The arc-length→parameter conversion uses
 * the curve's endpoint speeds (|B'(0)| = 2·|ctrl−src|, |B'(1)| =
 * 2·|tgt−ctrl|) — exact in the limit, and plenty accurate for the ≤ 22px
 * trims arrowheads need. Returns null when the trims meet in the middle.
 */
export function buildTrimmedCurvedPath(src: Point, tgt: Point, offset: number, trimStart: number, trimEnd: number): string | null {
  if (offset === 0) return buildTrimmedStraightPath(src, tgt, trimStart, trimEnd);
  const ctrl = curveControlPoint(src, tgt, offset);
  const a = trimStart > 0 ? Math.min(1, trimStart / (2 * (Math.hypot(ctrl.x - src.x, ctrl.y - src.y) || 1))) : 0;
  const b = 1 - (trimEnd > 0 ? Math.min(1, trimEnd / (2 * (Math.hypot(tgt.x - ctrl.x, tgt.y - ctrl.y) || 1))) : 0);
  if (a >= b) return null;
  const q0 = quadBezierPoint(src, ctrl, tgt, a);
  const q2 = quadBezierPoint(src, ctrl, tgt, b);
  // Restriction of B to [a, b] is itself a quadratic; its control point
  // follows from matching the start tangent: C'(0) = (b−a)·B'(a) and
  // C'(0) = 2(Q1−Q0)  ⇒  Q1 = Q0 + (b−a)·B'(a)/2.
  const q1 = {
    x: q0.x + (b - a) * ((1 - a) * (ctrl.x - src.x) + a * (tgt.x - ctrl.x)),
    y: q0.y + (b - a) * ((1 - a) * (ctrl.y - src.y) + a * (tgt.y - ctrl.y)),
  };
  return `M ${r(q0.x)} ${r(q0.y)} Q ${r(q1.x)} ${r(q1.y)} ${r(q2.x)} ${r(q2.y)}`;
}

/**
 * buildElbowPath, trimmed by `trimStart`/`trimEnd` px along the first/last
 * segment. The corner coordinate (midX/midY) is computed from the ORIGINAL
 * endpoints, so the trimmed elbow's corners coincide exactly with the
 * untrimmed path's — only the outermost segment tips retract. (Each trim
 * clamps at its corner for segments shorter than the trim.)
 */
export function buildTrimmedElbowPath(
  src: Point, tgt: Point,
  orientation: 'horizontal-first' | 'vertical-first',
  trimStart: number, trimEnd: number,
): string {
  if (orientation === 'horizontal-first') {
    const midX = (src.x + tgt.x) / 2;
    const s = trimStart > 0 ? pullBackPoint({ x: midX, y: src.y }, src, trimStart) : src;
    const t = trimEnd > 0 ? pullBackPoint({ x: midX, y: tgt.y }, tgt, trimEnd) : tgt;
    return `M ${r(s.x)} ${r(s.y)} H ${r(midX)} V ${r(t.y)} H ${r(t.x)}`;
  } else {
    const midY = (src.y + tgt.y) / 2;
    const s = trimStart > 0 ? pullBackPoint({ x: src.x, y: midY }, src, trimStart) : src;
    const t = trimEnd > 0 ? pullBackPoint({ x: tgt.x, y: midY }, tgt, trimEnd) : tgt;
    return `M ${r(s.x)} ${r(s.y)} V ${r(midY)} H ${r(t.x)} V ${r(t.y)}`;
  }
}

/**
 * The three corner points of a filled arrowhead triangle: `tip` exactly
 * where the arrow should point to, with its base `length` px back toward
 * `from` (the adjacent point along the connection — src/ctrl/an elbow's
 * axis-approach point, whichever applies) and `halfWidth` px to each side
 * of that base's center. Used instead of SVG's `<marker>` orient=auto/refX
 * mechanism: computing the triangle explicitly means the tip's position
 * and the base's width are both things this code derives and controls
 * directly, rather than something to reverse-engineer from marker
 * auto-orientation semantics (an earlier fix attempt got exactly this
 * wrong for marker-start, without a way to visually verify it).
 */
export function arrowheadPoints(tip: Point, from: Point, length: number, halfWidth: number): [Point, Point, Point] {
  const dx = tip.x - from.x, dy = tip.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len; // unit vector from `from` toward `tip`
  const baseX = tip.x - ux * length, baseY = tip.y - uy * length;
  const px = -uy * halfWidth, py = ux * halfWidth; // perpendicular to the tip direction
  return [
    { x: tip.x, y: tip.y },
    { x: baseX + px, y: baseY + py },
    { x: baseX - px, y: baseY - py },
  ];
}

/** Round to 2 decimal places to keep SVG output tidy. */
function r(n: number): number { return Math.round(n * 100) / 100; }
