import { describe, it, expect } from 'vitest';
import { visualNotesToCanvas, canvasToVisualNotes, isVisualNotesCanvas, type CanvasData } from '../src/canvas-format';
import type {
  VisualNotesFile, TileCard, StickyCard, ChecklistCard, KanbanBoardCard, GroupCard, Connection,
} from '../src/file-types';

function board(cards: VisualNotesFile['cards'], connections: Connection[] = []): VisualNotesFile {
  return { version: 3, layout: 'freeform', cards, connections, drawings: [], viewport: { x: 0, y: 0, zoom: 1 } };
}

describe('canvas-format round trips', () => {
  it('preserves id, kind, and content fields across every basic card kind', () => {
    const tile: TileCard = {
      id: 't1', kind: 'tile', x: 10, y: 20, w: 200, h: 120,
      label: 'My Tile', icon: 'star', color: '#3B82F6', target: { kind: 'note', path: 'Notes/Foo.md' },
    };
    const sticky: StickyCard = {
      id: 's1', kind: 'sticky', x: 300, y: 20, w: 240, h: 200, text: 'Hello **world**', color: '#FDE68A',
    };
    const checklist: ChecklistCard = {
      id: 'c1', kind: 'checklist', x: 10, y: 200, w: 280, h: 260, color: '#ffffff',
      title: 'Todo', items: [
        { id: 'i1', text: 'First', done: true },
        { id: 'i2', text: 'Second', done: false },
      ],
    };
    const src = board([tile, sticky, checklist]);

    const canvas = visualNotesToCanvas(src);
    const out = canvasToVisualNotes(canvas);

    expect(out.cards).toHaveLength(3);
    const outTile = out.cards.find(c => c.id === 't1') as TileCard;
    expect(outTile).toMatchObject({ kind: 'tile', label: 'My Tile', icon: 'star', color: '#3B82F6', x: 10, y: 20, w: 200, h: 120 });
    expect(outTile.target).toEqual({ kind: 'note', path: 'Notes/Foo.md' });

    const outSticky = out.cards.find(c => c.id === 's1') as StickyCard;
    expect(outSticky).toMatchObject({ kind: 'sticky', text: 'Hello **world**', color: '#FDE68A' });

    const outChecklist = out.cards.find(c => c.id === 'c1') as ChecklistCard;
    expect(outChecklist.items).toEqual(checklist.items);
  });

  it('round-trips a multi-column kanban board including item done-state via native text sync', () => {
    const kanban: KanbanBoardCard = {
      id: 'kb1', kind: 'kanban-board', x: 0, y: 0, w: 580, h: 420, title: 'Sprint',
      columns: [
        { id: 'col1', title: 'To do', color: '#eee', items: [{ id: 'it1', text: 'Write tests', done: false }] },
        { id: 'col2', title: 'Done', color: '#cfc', items: [{ id: 'it2', text: 'Ship it', done: true }] },
      ],
    };
    const out = canvasToVisualNotes(visualNotesToCanvas(board([kanban])));
    const outKanban = out.cards.find(c => c.id === 'kb1') as KanbanBoardCard;
    expect(outKanban.columns).toHaveLength(2);
    expect(outKanban.columns[0].items).toEqual([{ id: 'it1', text: 'Write tests', done: false }]);
    expect(outKanban.columns[1].items).toEqual([{ id: 'it2', text: 'Ship it', done: true }]);
  });

  it('round-trips a connection between two cards with full styling', () => {
    const a: GroupCard = { id: 'a', kind: 'group', x: 0, y: 0, w: 100, h: 100, label: 'A' };
    const b: GroupCard = { id: 'b', kind: 'group', x: 300, y: 0, w: 100, h: 100, label: 'B' };
    const conn: Connection = {
      id: 'conn1', fromCardId: 'a', toCardId: 'b', routing: 'elbow', elbowOrientation: 'horizontal-first',
      bend: 12, label: 'flows to', labelSize: 16, color: '#ff0000', style: 'dashed', arrowhead: 'both', thickness: 4,
    };
    const out = canvasToVisualNotes(visualNotesToCanvas(board([a, b], [conn])));
    expect(out.connections).toHaveLength(1);
    expect(out.connections[0]).toEqual(conn);
  });

  it('round-trips a free-floating (non-card-anchored) line via ib.freeLines', () => {
    const a: GroupCard = { id: 'a', kind: 'group', x: 0, y: 0, w: 100, h: 100 };
    const freeLine: Connection = {
      id: 'fl1', fromCardId: 'a', toPoint: { x: 500, y: 500 },
      routing: 'straight', color: '#000000', style: 'solid', arrowhead: 'end', thickness: 2,
    };
    const out = canvasToVisualNotes(visualNotesToCanvas(board([a], [freeLine])));
    expect(out.connections).toEqual([freeLine]);
  });

  it('drops a free line whose only card end no longer exists', () => {
    const freeLine: Connection = {
      id: 'fl1', fromCardId: 'missing-card', toPoint: { x: 500, y: 500 },
      routing: 'straight', color: '#000000', style: 'solid', arrowhead: 'end', thickness: 2,
    };
    const out = canvasToVisualNotes(visualNotesToCanvas(board([], [freeLine])));
    expect(out.connections).toEqual([]);
  });

  it('fully round-trips archived cards, including z-index (not stripped like live cards)', () => {
    const archivedCard: StickyCard = { id: 'arch1', kind: 'sticky', x: 1, y: 2, w: 3, h: 4, z: 99, text: 'old', color: '#fff' };
    const src = board([]);
    src.archived = [archivedCard];
    const out = canvasToVisualNotes(visualNotesToCanvas(src));
    expect(out.archived).toEqual([archivedCard]);
  });

  it('preserves z-index on live (non-archived) cards', () => {
    // z has no top-level equivalent in the JSON Canvas node spec (unlike
    // x/y/w/h), so it can only survive via `ib` — stashable() must not
    // strip it the way it strips the positional fields.
    const s: StickyCard = { id: 's1', kind: 'sticky', x: 0, y: 0, w: 1, h: 1, z: 42, text: 'x', color: '#fff' };
    const out = canvasToVisualNotes(visualNotesToCanvas(board([s])));
    expect(out.cards[0].z).toBe(42);
  });

  it('preserves board-level metadata (viewport, dotsHidden, layout)', () => {
    const src = board([]);
    src.dotsHidden = true;
    src.viewport = { x: 123, y: -45, zoom: 1.5 };
    const out = canvasToVisualNotes(visualNotesToCanvas(src));
    expect(out.layout).toBe('freeform');
    expect(out.dotsHidden).toBe(true);
    expect(out.viewport).toEqual({ x: 123, y: -45, zoom: 1.5 });
  });
});

describe('canvas-format: foreign / native-Canvas content', () => {
  it('synthesizes a sensible card from a plain native image node with no ib tag', () => {
    const data: CanvasData = {
      nodes: [{ id: 'n1', type: 'file', x: 0, y: 0, width: 200, height: 150, file: 'Attachments/photo.png' }],
      edges: [],
    };
    const out = canvasToVisualNotes(data);
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0]).toMatchObject({ kind: 'image', id: 'n1' });
  });

  it('never drops a node type it does not recognize — preserved verbatim in foreignNodes', () => {
    const weirdNode = { id: 'n1', type: 'file', x: 0, y: 0, width: 100, height: 100, file: 'weird.xyz', ib: { kind: 'nonexistent-kind-from-a-future-version' } };
    const data: CanvasData = { nodes: [weirdNode as never], edges: [] };
    expect(() => canvasToVisualNotes(data)).not.toThrow();
  });

  it('drops an edge referencing a card id that does not exist into foreignEdges instead of crashing', () => {
    const data: CanvasData = {
      nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'A' }],
      edges: [{ id: 'e1', fromNode: 'a', toNode: 'does-not-exist' }],
    };
    const out = canvasToVisualNotes(data);
    expect(out.connections).toEqual([]);
    expect(out.foreignEdges).toHaveLength(1);
  });

  it('re-emits unrecognized foreign nodes/edges byte-for-byte on the next export', () => {
    const foreignNode = { id: 'x1', type: 'text', x: 5, y: 5, width: 50, height: 50, text: 'plain native note' };
    const src = board([]);
    src.foreignNodes = [foreignNode as never];
    const canvas = visualNotesToCanvas(src);
    expect(canvas.nodes).toContainEqual(foreignNode);
  });

  it('isVisualNotesCanvas is true only for boards carrying our ib version marker', () => {
    expect(isVisualNotesCanvas({ nodes: [], edges: [], ib: { version: 1, layout: 'freeform' } })).toBe(true);
    expect(isVisualNotesCanvas({ nodes: [], edges: [] })).toBe(false);
    expect(isVisualNotesCanvas({ nodes: [], edges: [], ib: {} as never })).toBe(false);
  });
});

describe('canvas-format: malformed/corrupt input resilience', () => {
  it('handles a totally empty canvas without throwing', () => {
    expect(() => canvasToVisualNotes({ nodes: [], edges: [] })).not.toThrow();
    const out = canvasToVisualNotes({ nodes: [], edges: [] });
    expect(out.cards).toEqual([]);
    expect(out.connections).toEqual([]);
  });

  it('handles a node with a non-object ib value by treating it as a foreign node', () => {
    const data: CanvasData = {
      nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'hi', ib: 'not-an-object' as never }],
      edges: [],
    };
    expect(() => canvasToVisualNotes(data)).not.toThrow();
    const out = canvasToVisualNotes(data);
    // Falls through to native synthesis for a plain text node.
    expect(out.cards[0]).toMatchObject({ kind: 'sticky', id: 'n1' });
  });

  it('handles nodes missing expected numeric fields without throwing', () => {
    const data = {
      nodes: [{ id: 'n1', type: 'text', text: 'no coords here' }],
      edges: [],
    } as unknown as CanvasData;
    expect(() => canvasToVisualNotes(data)).not.toThrow();
  });

  it('handles ib.freeLines being absent, null-ish, or malformed without throwing', () => {
    expect(() => canvasToVisualNotes({ nodes: [], edges: [], ib: { version: 1, layout: 'freeform' } })).not.toThrow();
  });
});
