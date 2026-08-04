// Shared placement maths for the canvas's floating panels — the context bar
// and the text formatting popover.
//
// Pulled out of both for two reasons. It's the same problem twice (sit beside
// a card without covering it), and while it lived inline it was untestable:
// jsdom has no layout engine, so every rect a browser would supply reads back
// as zero. As plain arithmetic over rects the caller passes in, all of it can
// be checked.

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface PlaceOptions {
  /** What the panel should sit beside — usually the card. Viewport coords. */
  anchor: Rect;
  /** The positioning context the returned top/left are relative to. */
  container: Rect;
  panelW: number;
  panelH: number;
  /** Which side of the anchor to try first; flips when there's no room. */
  prefer: 'above' | 'below';
  /** Horizontal centre to aim for, in viewport coords. Defaults to the
   *  anchor's centre. The formatting popover passes the text selection's
   *  centre instead, so it stays near where you're typing. */
  centerOn?: number;
  /** Rects the panel must not overlap — the card itself, the other floating
   *  panel, the trash zone. Tried in order. */
  avoid?: Rect[];
  gap?: number;
  margin?: number;
}

const overlaps = (a: Rect, b: Rect, pad: number): boolean =>
  a.left < b.right + pad && a.right > b.left - pad
  && a.top < b.bottom + pad && a.bottom > b.top - pad;

/**
 * Returns container-relative `{ top, left }` for a panel of the given size.
 *
 * Order of business: take the preferred side, flip if it doesn't fit, clamp
 * into the container, then step away from anything in `avoid`. The clamp comes
 * before the avoidance on purpose — clamping a panel back inside the container
 * is exactly what used to park it on top of a card taller than the viewport,
 * so the avoidance pass has to run last and win.
 */
export function placeFloatingPanel(o: PlaceOptions): { top: number; left: number } {
  const gap = o.gap ?? 8;
  const margin = o.margin ?? 4;
  const contW = o.container.right - o.container.left;
  const contH = o.container.bottom - o.container.top;

  const above = o.anchor.top - o.container.top - o.panelH - gap;
  const below = o.anchor.bottom - o.container.top + gap;
  const fits = (t: number) => t >= margin && t + o.panelH <= contH - margin;

  let top = o.prefer === 'above' ? above : below;
  if (!fits(top)) {
    const other = o.prefer === 'above' ? below : above;
    // Only take the other side if it's genuinely better — when neither fits,
    // staying put and letting the clamp+avoid pass sort it out is less jarring
    // than flipping to something equally bad.
    if (fits(other)) top = other;
  }

  const center = o.centerOn ?? (o.anchor.left + o.anchor.right) / 2;
  let left = center - o.container.left - o.panelW / 2;

  left = Math.max(margin, Math.min(left, contW - margin - o.panelW));
  top = Math.max(margin, Math.min(top, contH - margin - o.panelH));

  for (const zone of o.avoid ?? []) {
    const asViewport: Rect = {
      left: left + o.container.left,
      right: left + o.container.left + o.panelW,
      top: top + o.container.top,
      bottom: top + o.container.top + o.panelH,
    };
    if (!overlaps(asViewport, zone, margin)) continue;

    // Move to whichever side of the obstacle has room, preferring the one the
    // panel was already heading for.
    const clearAbove = zone.top - o.container.top - o.panelH - gap;
    const clearBelow = zone.bottom - o.container.top + gap;
    const order = o.prefer === 'above' ? [clearAbove, clearBelow] : [clearBelow, clearAbove];
    const pick = order.find(fits);
    // Nothing fits either side — keep the clamped position rather than
    // shoving the panel off-screen chasing a gap that isn't there.
    if (pick !== undefined) top = pick;
  }

  return { top, left };
}
