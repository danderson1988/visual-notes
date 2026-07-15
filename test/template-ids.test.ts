import { describe, it, expect } from 'vitest';
import { withFreshIds } from '../src/file-io';
import type { VisualNotesFile, ColumnCard, KanbanBoardCard, KanbanColumnCard, StickyCard, Connection, DrawingStroke } from '../src/file-types';

function board(partial: Partial<VisualNotesFile>): VisualNotesFile {
  return { version: 3, layout: 'freeform', cards: [], connections: [], drawings: [], ...partial };
}

describe('withFreshIds (template ID regeneration)', () => {
  it('assigns every top-level card a new id, distinct from the original', () => {
    const sticky: StickyCard = { id: 'orig-1', kind: 'sticky', text: 'hi', color: '#fff' };
    const out = withFreshIds(board({ cards: [sticky] }));
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0].id).not.toBe('orig-1');
    expect(typeof out.cards[0].id).toBe('string');
  });

  it('does not mutate the original board (template stays untouched for next time)', () => {
    const sticky: StickyCard = { id: 'orig-1', kind: 'sticky', text: 'hi', color: '#fff' };
    const src = board({ cards: [sticky] });
    withFreshIds(src);
    expect(src.cards[0].id).toBe('orig-1');
  });

  it('gives Column children fresh ids too', () => {
    const col: ColumnCard = {
      id: 'col-1', kind: 'column', children: [
        { id: 'child-1', kind: 'sticky', text: 'a', color: '#fff' } as StickyCard,
        { id: 'child-2', kind: 'sticky', text: 'b', color: '#fff' } as StickyCard,
      ],
    };
    const out = withFreshIds(board({ cards: [col] })).cards[0] as ColumnCard;
    expect(out.id).not.toBe('col-1');
    expect(out.children.map(c => c.id)).not.toContain('child-1');
    expect(out.children.map(c => c.id)).not.toContain('child-2');
    // still two distinct children, each with its own new id
    expect(new Set(out.children.map(c => c.id)).size).toBe(2);
  });

  it('gives kanban-board items (nested inside columns) fresh ids too', () => {
    const kb: KanbanBoardCard = {
      id: 'kb-1', kind: 'kanban-board', columns: [
        { id: 'col-1', color: '#eee', items: [{ id: 'item-1', text: 'x', done: false }] },
      ],
    };
    const out = withFreshIds(board({ cards: [kb] })).cards[0] as KanbanBoardCard;
    expect(out.columns[0].items[0].id).not.toBe('item-1');
  });

  it('gives legacy kanban-column items fresh ids too', () => {
    const kc: KanbanColumnCard = { id: 'kc-1', kind: 'kanban-column', color: '#eee', items: [{ id: 'item-1', text: 'x', done: false }] };
    const out = withFreshIds(board({ cards: [kc] })).cards[0] as KanbanColumnCard;
    expect(out.items[0].id).not.toBe('item-1');
  });

  it('remaps connection endpoints to follow the same id mapping as their cards', () => {
    const a: StickyCard = { id: 'a', kind: 'sticky', text: 'A', color: '#fff' };
    const b: StickyCard = { id: 'b', kind: 'sticky', text: 'B', color: '#fff' };
    const conn: Connection = {
      id: 'conn-1', fromCardId: 'a', toCardId: 'b',
      routing: 'straight', color: '#000', style: 'solid', arrowhead: 'end', thickness: 2,
    };
    const out = withFreshIds(board({ cards: [a, b], connections: [conn] }));
    const [outA, outB] = out.cards;
    const outConn = out.connections[0];
    expect(outConn.id).not.toBe('conn-1');
    // The connection must point at the SAME (new) ids its endpoints were
    // remapped to — not just any fresh id of its own.
    expect(outConn.fromCardId).toBe(outA.id);
    expect(outConn.toCardId).toBe(outB.id);
  });

  it('leaves a free-floating connection endpoint (fromPoint/toPoint) alone', () => {
    const a: StickyCard = { id: 'a', kind: 'sticky', text: 'A', color: '#fff' };
    const conn: Connection = {
      id: 'conn-1', fromCardId: 'a', toPoint: { x: 10, y: 20 },
      routing: 'straight', color: '#000', style: 'solid', arrowhead: 'end', thickness: 2,
    };
    const out = withFreshIds(board({ cards: [a], connections: [conn] }));
    expect(out.connections[0].toPoint).toEqual({ x: 10, y: 20 });
    expect(out.connections[0].toCardId).toBeUndefined();
  });

  it('remaps archived cards (and their children) too', () => {
    const archived: StickyCard = { id: 'arch-1', kind: 'sticky', text: 'old', color: '#fff' };
    const out = withFreshIds(board({ cards: [], archived: [archived] }));
    expect(out.archived).toHaveLength(1);
    expect(out.archived![0].id).not.toBe('arch-1');
  });

  it('gives drawing strokes fresh ids while preserving shared groupId membership', () => {
    const strokeA1: DrawingStroke = { id: 'd1', groupId: 'g1', points: [{ x: 0, y: 0 }], color: '#000', width: 2 };
    const strokeA2: DrawingStroke = { id: 'd2', groupId: 'g1', points: [{ x: 1, y: 1 }], color: '#000', width: 2 };
    const strokeB: DrawingStroke = { id: 'd3', groupId: 'g2', points: [{ x: 2, y: 2 }], color: '#000', width: 2 };
    const out = withFreshIds(board({ drawings: [strokeA1, strokeA2, strokeB] }));

    const ids = out.drawings.map(d => d.id);
    expect(new Set(ids).size).toBe(3); // every stroke id is unique
    expect(ids).not.toContain('d1');
    expect(ids).not.toContain('d2');
    expect(ids).not.toContain('d3');

    // Strokes that shared a groupId before still share one afterward...
    expect(out.drawings[0].groupId).toBe(out.drawings[1].groupId);
    // ...but the group that was originally distinct is still distinct.
    expect(out.drawings[2].groupId).not.toBe(out.drawings[0].groupId);
    // The new groupId isn't just the literal old one carried over unchanged.
    expect(out.drawings[0].groupId).not.toBe('g1');
  });

  it('produces a fully disjoint id set across two independent spawns from the same template', () => {
    const template = board({
      cards: [{ id: 'a', kind: 'sticky', text: 'A', color: '#fff' } as StickyCard],
    });
    const spawn1 = withFreshIds(template);
    const spawn2 = withFreshIds(template);
    expect(spawn1.cards[0].id).not.toBe(spawn2.cards[0].id);
  });
});
