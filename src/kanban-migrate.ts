import { Card, VisualNotesFile, KanbanBoardCard } from './file-types';

/**
 * Converts any legacy KanbanColumnCard (one column = one whole card) into a
 * one-column KanbanBoardCard, in place. Runs on every read so old boards —
 * and any board that was last saved before this migration existed — always
 * end up on the new multi-column model going forward. New columns then get
 * added via KanbanBoardCard.columns rather than as new sibling cards.
 *
 * Position/size/z are preserved as-is; only the kind and internal shape
 * change, so this never moves anything on the canvas.
 */
export function migrateLegacyKanbanColumns(board: VisualNotesFile): VisualNotesFile {
  const hasLegacy = board.cards.some(c => c.kind === 'kanban-column');
  if (!hasLegacy) return board;

  const cards: Card[] = board.cards.map(card => {
    if (card.kind !== 'kanban-column') return card;
    const legacy = card;
    const migrated: KanbanBoardCard = {
      id: legacy.id,
      x: legacy.x, y: legacy.y, w: legacy.w, h: legacy.h, z: legacy.z, order: legacy.order,
      kind: 'kanban-board',
      columns: [{
        id: crypto.randomUUID(),
        title: legacy.title,
        titleHidden: legacy.titleHidden,
        color: legacy.color,
        bgColor: legacy.bgColor,
        topColor: legacy.topColor,
        collapsed: legacy.collapsed,
        wipLimit: legacy.wipLimit,
        items: legacy.items,
      }],
    };
    return migrated;
  });

  return { ...board, cards };
}
