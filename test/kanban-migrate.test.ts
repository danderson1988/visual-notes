import { describe, it, expect } from 'vitest';
import { migrateLegacyKanbanColumns } from '../src/kanban-migrate';
import type { VisualNotesFile, KanbanColumnCard, KanbanBoardCard, StickyCard } from '../src/file-types';

function board(cards: VisualNotesFile['cards']): VisualNotesFile {
  return { version: 3, layout: 'freeform', cards, connections: [], drawings: [] };
}

describe('migrateLegacyKanbanColumns (old-board compatibility)', () => {
  it('returns the same board reference untouched when there is nothing legacy to migrate', () => {
    const src = board([{ id: 's1', kind: 'sticky', text: 'hi', color: '#fff' } as StickyCard]);
    const out = migrateLegacyKanbanColumns(src);
    expect(out).toBe(src);
  });

  it('converts a legacy single-column KanbanColumnCard into a one-column KanbanBoardCard', () => {
    const legacy: KanbanColumnCard = {
      id: 'k1', kind: 'kanban-column', x: 10, y: 20, w: 280, h: 400, z: 3, order: 1,
      title: 'Backlog', color: '#eee', bgColor: '#fafafa', topColor: '#ccc',
      collapsed: false, wipLimit: 5,
      items: [{ id: 'it1', text: 'Do the thing', done: false }],
    };
    const out = migrateLegacyKanbanColumns(board([legacy]));
    expect(out.cards).toHaveLength(1);
    const migrated = out.cards[0] as KanbanBoardCard;

    // Position/size/z/order preserved as-is — this migration never moves
    // anything on the canvas.
    expect(migrated).toMatchObject({ id: 'k1', kind: 'kanban-board', x: 10, y: 20, w: 280, h: 400, z: 3, order: 1 });

    expect(migrated.columns).toHaveLength(1);
    const col = migrated.columns[0];
    expect(col).toMatchObject({
      title: 'Backlog', color: '#eee', bgColor: '#fafafa', topColor: '#ccc', collapsed: false, wipLimit: 5,
    });
    expect(col.items).toEqual(legacy.items);
    // The column needs its own fresh id, distinct from the card's id — it's
    // a new nested object, not a renamed version of the old card.
    expect(col.id).not.toBe(legacy.id);
    expect(typeof col.id).toBe('string');
    expect(col.id.length).toBeGreaterThan(0);
  });

  it('migrates only the legacy cards in a mixed board, leaving everything else untouched', () => {
    const legacy: KanbanColumnCard = {
      id: 'k1', kind: 'kanban-column', color: '#eee', items: [],
    };
    const sticky: StickyCard = { id: 's1', kind: 'sticky', text: 'unrelated', color: '#fff' };
    const out = migrateLegacyKanbanColumns(board([legacy, sticky]));
    expect(out.cards).toHaveLength(2);
    expect(out.cards.find(c => c.id === 's1')).toEqual(sticky);
    expect(out.cards.find(c => c.id === 'k1')?.kind).toBe('kanban-board');
  });

  it('gives each of several legacy cards its own distinct new column id', () => {
    const legacy1: KanbanColumnCard = { id: 'k1', kind: 'kanban-column', color: '#eee', items: [] };
    const legacy2: KanbanColumnCard = { id: 'k2', kind: 'kanban-column', color: '#eee', items: [] };
    const out = migrateLegacyKanbanColumns(board([legacy1, legacy2]));
    const [c1, c2] = out.cards as KanbanBoardCard[];
    expect(c1.columns[0].id).not.toBe(c2.columns[0].id);
  });
});
