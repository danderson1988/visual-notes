// @vitest-environment jsdom
//
// A small smoke-test layer over real FreeformRenderer instances — drives
// actual pointer/keyboard events through the production code and asserts
// on the resulting board data, rather than testing pure functions in
// isolation like the rest of the suite. Needs the DOM polyfill (createDiv,
// addClass, …) and the Component/Modal/Menu stubs in obsidian-stub.ts —
// see both files' own comments for why those exist at all.
//
// jsdom has no real layout engine: every element's getBoundingClientRect()
// is zeros unless mocked, and elementFromPoint/elementsFromPoint aren't
// implemented. Tests here avoid depending on real layout (drag/resize read
// card data + write inline styles, not measure the DOM) except the
// connection test, which explicitly mocks elementsFromPoint — see its own
// comment.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FreeformRenderer } from '../src/freeform-view';
import { fakeApp } from './fake-app';
import type { VisualNotesFile, StickyCard, TileCard, TableCard, CommentCard } from '../src/file-types';

function setup(cards: VisualNotesFile['cards'], connections: VisualNotesFile['connections'] = []) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const board: VisualNotesFile = {
    version: 3, layout: 'freeform', cards, connections, drawings: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const file = { path: 'Board.canvas', basename: 'Board', name: 'Board.canvas', extension: 'canvas' } as any;
  const renderer = new FreeformRenderer(
    fakeApp(), container, board, file, async () => {}, async () => {},
    30, undefined, 'left', undefined,
    false, // cardDragAnimationEnabled — skip the tilt rAF loop, irrelevant to data assertions
    1, false,
    false, // snapToGridEnabled — off, so drag/resize deltas below are exact rather than grid-snapped
  );
  renderer.render();
  return { renderer, board, container };
}

function pointer(type: string, x: number, y: number, extra: Partial<PointerEventInit> = {}): PointerEvent {
  // buttons: 1 (primary button held) on every event by default — matches a
  // real drag, where the button stays down for pointerdown/pointermove and
  // pointerup fires while it's still logically "the button that's releasing".
  // Tests simulating a release with nothing held can override via `extra`.
  return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, ...extra });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('UI smoke: drag a card', () => {
  it('moving the pointer past the drag threshold updates the card\'s x/y in board data', () => {
    const sticky: StickyCard = { id: 's1', kind: 'sticky', x: 0, y: 0, w: 240, h: 160, text: 'hi', color: '#fff' };
    const { renderer, board, container } = setup([sticky]);
    const el = container.querySelector<HTMLElement>('.visual-notes-freeform-card[data-id="s1"]')!;
    expect(el).toBeTruthy();

    el.dispatchEvent(pointer('pointerdown', 50, 50));
    el.dispatchEvent(pointer('pointermove', 90, 90)); // past DRAG_THRESHOLD (5px)
    el.dispatchEvent(pointer('pointerup', 90, 90));

    const moved = board.cards[0] as StickyCard;
    expect(moved.x).toBe(40); // +40,+40 from the pointer delta
    expect(moved.y).toBe(40);
    expect(renderer).toBeTruthy(); // keep the renderer reachable for lifecycle cleanup below
  });

  it('a tiny move under the drag threshold does not move the card', () => {
    const sticky: StickyCard = { id: 's1', kind: 'sticky', x: 0, y: 0, w: 240, h: 160, text: 'hi', color: '#fff' };
    const { board, container } = setup([sticky]);
    const el = container.querySelector<HTMLElement>('.visual-notes-freeform-card[data-id="s1"]')!;

    el.dispatchEvent(pointer('pointerdown', 50, 50));
    el.dispatchEvent(pointer('pointermove', 52, 52)); // 2.8px — under the 5px threshold
    el.dispatchEvent(pointer('pointerup', 52, 52));

    expect((board.cards[0] as StickyCard).x).toBe(0);
    expect((board.cards[0] as StickyCard).y).toBe(0);
  });

  it('releasing off the card below the drag threshold does not leave it stuck dragging on the next hover', () => {
    // Regression test for a reported bug: pointer capture used to be
    // acquired only after the drag threshold was crossed, so a small
    // below-threshold nudge released off the card left its pointerup
    // listener never firing (never attached to `el` if the release lands
    // elsewhere). The stale pointermove listener then replayed on the very
    // next hover — no button held — and started a "drag" with nothing
    // pressed at all.
    const sticky: StickyCard = { id: 's1', kind: 'sticky', x: 0, y: 0, w: 240, h: 160, text: 'hi', color: '#fff' };
    const { board, container } = setup([sticky]);
    const el = container.querySelector<HTMLElement>('.visual-notes-freeform-card[data-id="s1"]')!;

    el.dispatchEvent(pointer('pointerdown', 50, 50));
    el.dispatchEvent(pointer('pointermove', 52, 52)); // under threshold — no drag started
    // Released somewhere that is not `el` itself.
    container.dispatchEvent(pointer('pointerup', 300, 300));

    // Hovering back over the card afterward, with no button held, must not
    // move it. A trailing pointerup forces the position write (normally
    // rAF-deferred) to flush synchronously so the assertion below can see
    // whether a drag was wrongly started, regardless of this test's own
    // timing — matching how the "past the drag threshold" test above
    // observes its result.
    el.dispatchEvent(pointer('pointermove', 500, 500, { buttons: 0 }));
    el.dispatchEvent(pointer('pointerup', 500, 500, { buttons: 0 }));

    expect((board.cards[0] as StickyCard).x).toBe(0);
    expect((board.cards[0] as StickyCard).y).toBe(0);
  });
});

describe('UI smoke: resize a card', () => {
  it('dragging the se resize handle grows the card\'s w/h in board data', () => {
    const tile: TileCard = {
      id: 't1', kind: 'tile', x: 0, y: 0, w: 200, h: 120, label: 'Tile', icon: 'star', color: '#3B82F6',
      target: { kind: 'note', path: 'X.md' },
    };
    const { board, container } = setup([tile]);
    const handle = container.querySelector<HTMLElement>('.visual-notes-freeform-card[data-id="t1"] .visual-notes-card-resize-handle--se')!;
    expect(handle).toBeTruthy();

    handle.dispatchEvent(pointer('pointerdown', 200, 120));
    handle.dispatchEvent(pointer('pointermove', 260, 170)); // +60 wide, +50 tall
    handle.dispatchEvent(pointer('pointerup', 260, 170));

    // applySnap always rounds to at least a 4px grid, even with
    // snapToGridEnabled off (see canvas.ts's applySnap) — 120+50=170 snaps
    // to 172, the nearest multiple of 4.
    const resized = board.cards[0] as TileCard;
    expect(resized.w).toBe(260);
    expect(resized.h).toBe(172);
  });
});

describe('UI smoke: connect two cards', () => {
  it('dragging from one card\'s connection handle onto another creates a connection', () => {
    const a: StickyCard = { id: 'a', kind: 'sticky', x: 0, y: 0, w: 200, h: 120, text: 'A', color: '#fff' };
    const b: StickyCard = { id: 'b', kind: 'sticky', x: 400, y: 0, w: 200, h: 120, text: 'B', color: '#fff' };
    const { board, container } = setup([a, b]);

    const handle = container.querySelector<HTMLElement>('.visual-notes-freeform-card[data-id="a"] .visual-notes-connection-handle-e')!;
    const targetEl = container.querySelector<HTMLElement>('.visual-notes-freeform-card[data-id="b"]')!;
    expect(handle).toBeTruthy();

    // jsdom has no real layout engine, so elementsFromPoint (used to detect
    // which card the connection is being dropped onto) always returns [] —
    // mock it to report the real target for the duration of this drag,
    // matching what a real browser's hit-test would return at that point.
    const spy = vi.spyOn(document, 'elementsFromPoint').mockReturnValue([targetEl]);

    handle.dispatchEvent(pointer('pointerdown', 200, 60));
    handle.dispatchEvent(pointer('pointermove', 400, 60));
    handle.dispatchEvent(pointer('pointerup', 400, 60));

    spy.mockRestore();

    expect(board.connections).toHaveLength(1);
    expect(board.connections[0]).toMatchObject({ fromCardId: 'a', toCardId: 'b' });
  });
});

describe('UI smoke: connection arrowhead pull-back (bug #6)', () => {
  // A filled arrowhead triangle's tip sits exactly at the connection's raw
  // endpoint, but tapers to zero width right there — a line as thick as
  // the shaft pokes out past the triangle's narrowing sides unless the
  // VISIBLE stroke (not the true geometry other things rely on) is
  // shortened first. buildConnectionPath (hit-testing, selection halo,
  // labels, bend handle) must stay exactly at the true endpoints;
  // buildVisibleConnectionPath (the colored stroke only) is what shortens;
  // computeArrowheadPolygons draws the triangle with its tip at the true
  // endpoint regardless of how short the visible stroke is.
  const from = { x: -300, y: -300 };
  const to = { x: 300, y: 300 }; // length 600√2 ≈ 848.5, comfortably longer than any arrowhead

  it('buildConnectionPath always returns the true, unshortened endpoints', () => {
    const { renderer } = setup([]);
    for (const arrowhead of ['none', 'end', 'both'] as const) {
      const d = renderer.buildConnectionPath({
        id: `t-${arrowhead}`, fromPoint: from, toPoint: to,
        routing: 'straight' as const, color: '#fff', style: 'solid' as const,
        arrowhead, thickness: 4 as const,
      });
      expect(d).toBe(`M ${from.x} ${from.y} L ${to.x} ${to.y}`);
    }
  });

  it('buildVisibleConnectionPath shortens the end with an arrowhead, leaves a no-arrowhead end untouched', () => {
    const { renderer } = setup([]);
    const conn = {
      id: 'c1', fromPoint: from, toPoint: to,
      routing: 'straight' as const, color: '#fff', style: 'solid' as const,
      arrowhead: 'end' as const, thickness: 4 as const,
    };
    const d = renderer.buildVisibleConnectionPath(conn)!;
    const [, x1, y1, x2, y2] = d.match(/M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)/)!.map(Number);

    expect(x1).toBe(from.x); expect(y1).toBe(from.y); // start (no arrowhead): untouched
    // end (has the arrowhead): pulled back toward `from`, not sitting at `to`
    expect(x2).toBeLessThan(to.x);
    expect(y2).toBeLessThan(to.y);
  });

  it('buildVisibleConnectionPath shortens both ends when arrowhead is "both"', () => {
    const { renderer } = setup([]);
    const conn = {
      id: 'c2', fromPoint: from, toPoint: to,
      routing: 'straight' as const, color: '#fff', style: 'solid' as const,
      arrowhead: 'both' as const, thickness: 4 as const,
    };
    const d = renderer.buildVisibleConnectionPath(conn)!;
    const [, x1, y1, x2, y2] = d.match(/M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)/)!.map(Number);

    expect(x1).toBeGreaterThan(from.x); expect(y1).toBeGreaterThan(from.y);
    expect(x2).toBeLessThan(to.x); expect(y2).toBeLessThan(to.y);
  });

  it('buildVisibleConnectionPath leaves both ends untouched when there is no arrowhead at all', () => {
    const { renderer } = setup([]);
    const conn = {
      id: 'c3', fromPoint: from, toPoint: to,
      routing: 'straight' as const, color: '#fff', style: 'solid' as const,
      arrowhead: 'none' as const, thickness: 4 as const,
    };
    const d = renderer.buildVisibleConnectionPath(conn)!;
    expect(d).toBe(`M ${from.x} ${from.y} L ${to.x} ${to.y}`);
  });

  it('buildVisibleConnectionPath pulls back further for a thicker line', () => {
    const { renderer } = setup([]);
    const thin = renderer.buildVisibleConnectionPath({
      id: 'c4', fromPoint: from, toPoint: to,
      routing: 'straight' as const, color: '#fff', style: 'solid' as const,
      arrowhead: 'end' as const, thickness: 2 as const,
    })!;
    const thick = renderer.buildVisibleConnectionPath({
      id: 'c5', fromPoint: from, toPoint: to,
      routing: 'straight' as const, color: '#fff', style: 'solid' as const,
      arrowhead: 'end' as const, thickness: 6 as const,
    })!;
    const endX = (d: string) => Number(d.match(/L ([\d.-]+)/)![1]);
    // Thicker line -> longer arrowhead -> pulled back further from `to`.
    expect(to.x - endX(thick)).toBeGreaterThan(to.x - endX(thin));
  });

  it('computeArrowheadPolygons puts the tip exactly at the true endpoint, base pulled back toward the approach point', () => {
    const { renderer } = setup([]);
    const conn = {
      id: 'c6', fromPoint: from, toPoint: to,
      routing: 'straight' as const, color: '#fff', style: 'solid' as const,
      arrowhead: 'both' as const, thickness: 4 as const,
    };
    const arrows = renderer.computeArrowheadPolygons(conn)!;
    expect(arrows.end).toBeTruthy();
    expect(arrows.start).toBeTruthy();
    const [endTip] = arrows.end!;
    const [startTip] = arrows.start!;
    // Tips land exactly on the connection's real endpoints...
    expect(endTip).toEqual(to);
    expect(startTip).toEqual(from);
    // ...while the two base corners (indices 1 and 2) sit strictly inside
    // the segment, not on top of the tip.
    expect(arrows.end![1]).not.toEqual(to);
    expect(arrows.end![2]).not.toEqual(to);
  });

  it('computeArrowheadPolygons returns null when there is no arrowhead', () => {
    const { renderer } = setup([]);
    const conn = {
      id: 'c7', fromPoint: from, toPoint: to,
      routing: 'straight' as const, color: '#fff', style: 'solid' as const,
      arrowhead: 'none' as const, thickness: 4 as const,
    };
    expect(renderer.computeArrowheadPolygons(conn)).toBeNull();
  });

  it('a bent connection\'s visible stroke lies exactly on the true curve (no separation from the hit path)', () => {
    // Regression: the first polygon-arrowhead fix rebuilt the shortened
    // stroke as a NEW curve from pulled-back endpoints with the same bend
    // value — a different curve, whose middle drifted away from the true
    // geometry that the hit area, selection outline, and bend handle all
    // follow. Reported as "the outline no longer follows the line, and
    // clicking the center at extreme bends misses". The visible stroke
    // must be an exact sub-segment of the true curve.
    const { renderer } = setup([]);
    const conn = {
      id: 'c8', fromPoint: from, toPoint: to,
      routing: 'straight' as const, bend: 250, color: '#fff', style: 'solid' as const,
      arrowhead: 'both' as const, thickness: 6 as const,
    };
    const quad = (d: string) => {
      const m = d.match(/M ([\d.-]+) ([\d.-]+) Q ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/)!;
      const n = m.slice(1).map(Number);
      return [{ x: n[0], y: n[1] }, { x: n[2], y: n[3] }, { x: n[4], y: n[5] }] as const;
    };
    const bez = (p: readonly { x: number; y: number }[], t: number) => {
      const mt = 1 - t;
      return {
        x: mt * mt * p[0].x + 2 * mt * t * p[1].x + t * t * p[2].x,
        y: mt * mt * p[0].y + 2 * mt * t * p[1].y + t * t * p[2].y,
      };
    };
    const truePts = quad(renderer.buildConnectionPath(conn)!);
    const visPts = quad(renderer.buildVisibleConnectionPath(conn)!);
    // Every sampled point of the visible stroke must sit on the true
    // curve (within rounding), including its exact middle — the spot the
    // user aims at to select the connection.
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const p = bez(visPts, u);
      let minDist = Infinity;
      // Dense sampling so the measured distance reflects the geometry,
      // not the gap between adjacent samples on this ~1100px curve.
      for (let t = 0; t <= 1.0001; t += 1 / 8000) {
        const b = bez(truePts, t);
        minDist = Math.min(minDist, Math.hypot(p.x - b.x, p.y - b.y));
      }
      expect(minDist).toBeLessThan(0.5);
    }
  });
});

describe('UI smoke: toolbar tool selection is exclusive', () => {
  // Regression test for a reported bug: Pen, Line (connect mode), and a
  // pending placement tool (Note/Sticky/Column/…) are three independent
  // state flags, each with its own toolbar highlight. Pen mode already
  // tore down the other two on entry; Line and the placement tools didn't
  // tear down Pen (or each other), so activating one could leave a
  // previous tool's button stuck showing "active" underneath it.
  it('activating a placement tool exits pen mode and connect mode', () => {
    const { renderer } = setup([]);
    renderer.togglePenMode();
    expect(renderer.penModeActive).toBe(true);

    const btn = document.createElement('div');
    renderer.activateTool('sticky', btn);

    expect(renderer.penModeActive).toBe(false);
    expect(renderer.connectMode).toBe(false);
    expect(renderer.pendingTool).toBe('sticky');
    expect(renderer.penToolBtn?.hasClass('is-active')).toBe(false);
  });

  it('entering connect mode (Line) exits pen mode and any pending tool', () => {
    const { renderer } = setup([]);
    renderer.togglePenMode();
    expect(renderer.penModeActive).toBe(true);

    renderer.toggleConnectMode();

    expect(renderer.connectMode).toBe(true);
    expect(renderer.penModeActive).toBe(false);
    expect(renderer.pendingTool).toBe(null);
    expect(renderer.penToolBtn?.hasClass('is-active')).toBe(false);
  });

  it('entering pen mode exits connect mode and any pending tool', () => {
    const { renderer } = setup([]);
    renderer.toggleConnectMode();
    expect(renderer.connectMode).toBe(true);

    renderer.togglePenMode();

    expect(renderer.penModeActive).toBe(true);
    expect(renderer.connectMode).toBe(false);
    expect(renderer.connectToolBtn?.hasClass('is-active')).toBe(false);
  });
});

describe('UI smoke: edit a table cell', () => {
  it('double-click to edit, typing, then blur writes the new value into the row data', () => {
    const table: TableCard = {
      id: 'tb1', kind: 'table', x: 0, y: 0, w: 340, h: 240, color: '#fff', title: 'T',
      columns: [{ id: 'c1', label: 'Name' }],
      rows: [{ id: 'r1', cells: { c1: 'old value' } }],
    };
    const { board, container } = setup([table]);

    const cellText = container.querySelector<HTMLElement>(
      '.visual-notes-freeform-card[data-id="tb1"] .visual-notes-table-cell[data-row="1"][data-col="0"] .visual-notes-table-cell-text'
    )!;
    expect(cellText).toBeTruthy();

    cellText.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    // jsdom doesn't compute the derived isContentEditable boolean from the
    // contentEditable attribute, so check the attribute production code
    // actually sets instead.
    expect(cellText.contentEditable).toBe('true');

    cellText.textContent = 'new value';
    cellText.dispatchEvent(new InputEvent('input', { bubbles: true }));
    cellText.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    const row = (board.cards[0] as TableCard).rows[0];
    expect(row.cells.c1).toBe('new value');
    expect(cellText.contentEditable).toBe('false'); // demoted back on blur
  });
});

describe('UI smoke: un-resolving a comment restores full opacity (bug #9)', () => {
  it('toggling resolved off removes the is-resolved class, not just skips adding it', () => {
    // Regression test: renderCommentContent only ever did
    // `if (card.resolved) el.addClass('is-resolved')` — a one-way toggle
    // that added the class (driving the 0.6 opacity in styles.css) but
    // never removed it, so once a comment was marked resolved it stayed
    // visually transparent forever, even after toggling "Resolved" back off.
    const comment: CommentCard = {
      id: 'c1', kind: 'comment', x: 0, y: 0, w: 240, h: 160,
      text: 'hi', createdAt: Date.now(), replies: [], resolved: true,
    };
    const { renderer, container } = setup([comment]);
    const el = container.querySelector<HTMLElement>('.visual-notes-freeform-card[data-id="c1"]')!;
    expect(el.hasClass('is-resolved')).toBe(true);

    renderer.selection.select('c1');
    (renderer as any).handleCtxEvent({ type: 'comment-resolve' });

    expect((comment as CommentCard).resolved).toBe(false);
    expect(el.hasClass('is-resolved')).toBe(false);
  });
});

describe('UI smoke: context menu commits pending inline edits (bug #5)', () => {
  it('opening a context menu blurs whatever is currently focused, before any menu builds', () => {
    // Regression test for a reported bug: right-click (unlike left-click)
    // never blurs a focused input/contenteditable, so a card could still be
    // mid-edit when its context menu opens. Choosing "Delete" then removed
    // the card's element from the DOM, which force-blurred the still-focused
    // editor — reentrantly running its blur-commit handler against a card
    // already spliced out of the board, deep enough in the call stack
    // (undo push, markdown re-render) to throw. Obsidian's Menu only calls
    // hide() *after* the clicked item's callback returns, so a throw there
    // left the menu stuck open — reportedly for other cards' menus too,
    // since the same inline-edit-then-blur-commit pattern is used
    // throughout (checklist items, kanban items, table cells, …).
    //
    // jsdom doesn't support focus() on contenteditable elements (real
    // sticky/checklist/kanban editors), so a plain <input> stands in here
    // to prove the actual mechanism under test: a capture-phase listener
    // blurs activeElement before any bubble-phase per-card contextmenu
    // handler runs, so by the time a menu item's onClick can remove a
    // card's DOM, any pending edit has already committed safely — no
    // reentrant blur during the removal itself.
    const sticky: StickyCard = { id: 's1', kind: 'sticky', x: 0, y: 0, w: 240, h: 160, text: 'hi', color: '#fff' };
    const { container } = setup([sticky]);
    const el = container.querySelector<HTMLElement>('.visual-notes-freeform-card[data-id="s1"]')!;

    const input = document.createElement('input');
    el.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(document.activeElement).not.toBe(input);
  });
});

describe('UI smoke: deleting a card resets the floating format bar (bug #5)', () => {
  it('the context bar deactivates immediately on delete, without needing a click on the canvas', () => {
    // Regression test: archiveSelected() and duplicateSelected() both call
    // refreshSelectionVisuals() after clearing the selection, which is what
    // tells the floating per-card format bar (Bold/Italic/…) to hide itself
    // — but deleteSelected() cleared the selection directly and skipped that
    // call, so the bar (and its now-stale Bold/Italic buttons for the
    // just-deleted card) stayed visible until something else — e.g. clicking
    // the empty canvas — happened to refresh it.
    const sticky: StickyCard = { id: 's1', kind: 'sticky', x: 0, y: 0, w: 240, h: 160, text: 'hi', color: '#fff' };
    const { renderer, board } = setup([sticky]);

    renderer.selection.select('s1');
    renderer.refreshSelectionVisuals();
    expect(renderer.toolbarEl.hasClass('ib-ctx-active')).toBe(true);

    renderer.deleteSelected();

    expect(board.cards).toHaveLength(0);
    expect(renderer.toolbarEl.hasClass('ib-ctx-active')).toBe(false);
  });
});

describe('UI smoke: keyboard shortcut', () => {
  it('Delete removes the selected card from board data', () => {
    const sticky: StickyCard = { id: 's1', kind: 'sticky', x: 0, y: 0, w: 240, h: 160, text: 'hi', color: '#fff' };
    const { renderer, board } = setup([sticky]);

    renderer.selection.select('s1');
    renderer.refreshSelectionVisuals();

    renderer.outer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    expect(board.cards).toHaveLength(0);
  });

  it('Escape clears the selection without deleting anything', () => {
    const sticky: StickyCard = { id: 's1', kind: 'sticky', x: 0, y: 0, w: 240, h: 160, text: 'hi', color: '#fff' };
    const { renderer, board } = setup([sticky]);

    renderer.selection.select('s1');
    renderer.outer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(board.cards).toHaveLength(1);
    expect(renderer.selection.isEmpty()).toBe(true);
  });
});

describe('UI smoke: connection culling on large boards', () => {
  // jsdom has no layout engine, so getBoundingClientRect() is zeros by
  // default — mock a realistic viewport size so visibleCanvasBounds() has
  // something meaningful to compute against. Patches the shared prototype
  // (not the specific `outer` instance, which doesn't exist until render()
  // creates it) so it's already in effect for render()'s own initial cull.
  function mockViewportSize(w: number, h: number) {
    return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: w, height: h, top: 0, left: 0, right: w, bottom: h, toJSON: () => undefined,
    } as DOMRect);
  }

  function straightConn(id: string, fromCardId: string, toCardId: string) {
    return { id, fromCardId, toCardId, routing: 'straight' as const, color: '#000', style: 'solid' as const, arrowhead: 'end' as const, thickness: 2 as const };
  }

  it('only builds DOM for connections near the visible viewport at initial render', () => {
    const n1: StickyCard = { id: 'n1', kind: 'sticky', x: 0, y: 0, w: 200, h: 120, text: 'A', color: '#fff' };
    const n2: StickyCard = { id: 'n2', kind: 'sticky', x: 300, y: 0, w: 200, h: 120, text: 'B', color: '#fff' };
    const f1: StickyCard = { id: 'f1', kind: 'sticky', x: 10000, y: 10000, w: 200, h: 120, text: 'C', color: '#fff' };
    const f2: StickyCard = { id: 'f2', kind: 'sticky', x: 10300, y: 10000, w: 200, h: 120, text: 'D', color: '#fff' };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const board: VisualNotesFile = {
      version: 3, layout: 'freeform', cards: [n1, n2, f1, f2],
      connections: [straightConn('c-near', 'n1', 'n2'), straightConn('c-far', 'f1', 'f2')],
      drawings: [], viewport: { x: 0, y: 0, zoom: 1 },
    };
    const file = { path: 'Board.canvas', basename: 'Board', name: 'Board.canvas', extension: 'canvas' } as any;
    const spy = mockViewportSize(800, 600);
    const renderer = new FreeformRenderer(fakeApp(), container, board, file, async () => {}, async () => {});
    renderer.render();
    spy.mockRestore();

    expect(renderer.connectionPaths.has('c-near')).toBe(true);
    expect(renderer.connectionPaths.has('c-far')).toBe(false);
  });

  it('refreshConnectionCulling promotes an off-screen connection once the viewport pans over it, and demotes it again on panning away', () => {
    // Both endpoints start far from the origin — isConnectionVisible is an
    // OR of the two ends, so if either one were near (0,0) it would already
    // be visible inside the initial mocked viewport regardless of the other.
    const a: StickyCard = { id: 'a', kind: 'sticky', x: 10000, y: 0, w: 200, h: 120, text: 'A', color: '#fff' };
    const b: StickyCard = { id: 'b', kind: 'sticky', x: 10300, y: 0, w: 200, h: 120, text: 'B', color: '#fff' };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const board: VisualNotesFile = {
      version: 3, layout: 'freeform', cards: [a, b], connections: [straightConn('c1', 'a', 'b')],
      drawings: [], viewport: { x: 0, y: 0, zoom: 1 },
    };
    const file = { path: 'Board.canvas', basename: 'Board', name: 'Board.canvas', extension: 'canvas' } as any;
    const spy = mockViewportSize(800, 600);
    const renderer = new FreeformRenderer(fakeApp(), container, board, file, async () => {}, async () => {});
    renderer.render();

    expect(renderer.connectionPaths.has('c1')).toBe(false); // b is 10000px away — culled at load

    // Pan so both cards (and the connection between them) are on screen.
    // scheduleCullingRefresh's real trigger is rAF-batched (see canvas.ts);
    // calling the underlying refresh directly here tests its logic without
    // depending on jsdom's async rAF timing.
    renderer.vp = { x: -10000, y: 0, zoom: 1 };
    renderer.refreshConnectionCulling();
    expect(renderer.connectionPaths.has('c1')).toBe(true);

    // Pan back away — should be demoted (DOM removed) again.
    renderer.vp = { x: 0, y: 0, zoom: 1 };
    renderer.refreshConnectionCulling();
    expect(renderer.connectionPaths.has('c1')).toBe(false);

    spy.mockRestore();
  });

  it('updateConnectionsForCard is a no-op for a culled connection (no wasted path rebuild)', () => {
    // Both cards far from the origin: with the real (unmocked, all-zero)
    // jsdom rect, visibleCanvasBounds() is only the small margin around
    // (0,0) — a card actually AT the origin would still fall inside that
    // margin and not be culled, so both endpoints need to be well outside it.
    const a: StickyCard = { id: 'a', kind: 'sticky', x: 9000, y: 0, w: 200, h: 120, text: 'A', color: '#fff' };
    const b: StickyCard = { id: 'b', kind: 'sticky', x: 10000, y: 0, w: 200, h: 120, text: 'B', color: '#fff' };
    const { renderer } = setup([a, b], [straightConn('c1', 'a', 'b')]);
    expect(renderer.connectionPaths.has('c1')).toBe(false);

    expect(() => renderer.updateConnectionsForCard('a')).not.toThrow();
    expect(renderer.connectionPaths.has('c1')).toBe(false); // still not (re-)created
  });
});
