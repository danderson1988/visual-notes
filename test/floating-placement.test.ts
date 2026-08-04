import { describe, it, expect } from 'vitest';
import { placeFloatingPanel, Rect } from '../src/floating-placement';

// A 1000x800 viewport at the origin, with a card sitting comfortably in it.
const container: Rect = { top: 0, left: 0, right: 1000, bottom: 800 };
const rect = (left: number, top: number, w: number, h: number): Rect =>
  ({ left, top, right: left + w, bottom: top + h });

const place = (o: Partial<Parameters<typeof placeFloatingPanel>[0]> & { anchor: Rect }) =>
  placeFloatingPanel({ container, panelW: 200, panelH: 40, prefer: 'above', ...o });

describe('placeFloatingPanel', () => {
  it('sits on the preferred side of the anchor', () => {
    const anchor = rect(400, 300, 200, 100);

    const aboveIt = place({ anchor, prefer: 'above' });
    const belowIt = place({ anchor, prefer: 'below' });

    expect(aboveIt.top + 40).toBe(300 - 8);  // panel bottom, one gap above the card
    expect(belowIt.top).toBe(400 + 8);       // card bottom, one gap below
  });

  it('centres on the anchor by default', () => {
    const { left } = place({ anchor: rect(400, 300, 200, 100) });
    expect(left).toBe(500 - 100); // anchor centre minus half the panel
  });

  it('centres on centerOn when given, so it can track a text selection', () => {
    const { left } = place({ anchor: rect(400, 300, 200, 100), centerOn: 420 });
    expect(left).toBe(420 - 100);
  });

  it('flips to the other side when the preferred one has no room', () => {
    // Card hard against the top: nothing fits above it.
    const anchor = rect(400, 0, 200, 100);

    const { top } = place({ anchor, prefer: 'above' });

    expect(top).toBe(100 + 8); // ended up below
  });

  it('flips a below-preferring panel up when it would fall out the bottom', () => {
    const anchor = rect(400, 700, 200, 100);

    const { top } = place({ anchor, prefer: 'below' });

    expect(top + 40).toBe(700 - 8);
  });

  it('clamps inside the container horizontally', () => {
    const wide = place({ anchor: rect(960, 300, 40, 100) });
    expect(wide.left).toBe(1000 - 4 - 200);

    const narrow = place({ anchor: rect(0, 300, 40, 100) });
    expect(narrow.left).toBe(4);
  });

  it('steps clear of an obstacle instead of overlapping it', () => {
    // Panel would land right where the context bar is.
    const anchor = rect(400, 300, 200, 100);
    const bar = rect(400, 240, 200, 40);

    const { top } = place({ anchor, prefer: 'above', avoid: [bar] });

    expect(top + 40).toBeLessThanOrEqual(240);  // fully above the bar
  });

  // A card taller than the viewport can't be avoided — there is no clear
  // space. What matters is that the panel hugs the container edge on its
  // preferred side, covering as little as possible and staying reachable,
  // rather than being clamped to somewhere arbitrary in the middle of it.
  it('hugs the edge when the anchor is too tall for either side to fit', () => {
    const tall = rect(400, -200, 200, 1200);

    const up = place({ anchor: tall, prefer: 'above', avoid: [tall] });
    const down = place({ anchor: tall, prefer: 'below', avoid: [tall] });

    expect(up.top).toBe(4);
    expect(down.top + 40).toBe(800 - 4);
  });

  it('never returns a position outside the container', () => {
    for (const anchor of [rect(400, -500, 200, 100), rect(400, 900, 200, 100), rect(-300, 300, 200, 100)]) {
      const { top, left } = place({ anchor, prefer: 'below' });
      expect(top).toBeGreaterThanOrEqual(4);
      expect(top + 40).toBeLessThanOrEqual(800 - 4);
      expect(left).toBeGreaterThanOrEqual(4);
      expect(left + 200).toBeLessThanOrEqual(1000 - 4);
    }
  });

  it('honours a container that is not at the origin', () => {
    const offset: Rect = { top: 100, left: 50, right: 1050, bottom: 900 };

    const { top, left } = placeFloatingPanel({
      anchor: rect(450, 400, 200, 100), container: offset,
      panelW: 200, panelH: 40, prefer: 'below',
    });

    // Returned coords are container-relative, not viewport.
    expect(top).toBe(500 + 8 - 100);
    expect(left).toBe(550 - 100 - 50);
  });
});
