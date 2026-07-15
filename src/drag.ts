import Sortable from 'sortablejs';

/**
 * Attaches Sortable.js to the grid element so tiles can be dragged
 * to rearrange. The "+" add-tile button is excluded because only
 * `.visual-notes-tile-wrapper` elements match the draggable selector.
 *
 * Generic over T so it works with any item type (TileCard, etc.).
 */
export function initDrag<T>(
  grid: HTMLElement,
  items: T[],
  onReorder: (reordered: T[]) => Promise<void>
): Sortable {
  return Sortable.create(grid, {
    animation: 150,
    draggable: '.visual-notes-tile-wrapper',
    ghostClass: 'visual-notes-tile-ghost',
    chosenClass: 'visual-notes-tile-chosen',
    touchStartThreshold: 5,
    delay: 150,
    delayOnTouchOnly: true,
    onMove: (evt) => !evt.related.classList.contains('visual-notes-add-tile'),
    onEnd: (evt) => {
      const oldIdx = evt.oldDraggableIndex;
      const newIdx = evt.newDraggableIndex;
      if (oldIdx === undefined || newIdx === undefined || oldIdx === newIdx) return;

      const reordered = [...items];
      const [moved] = reordered.splice(oldIdx, 1);
      reordered.splice(newIdx, 0, moved);
      void onReorder(reordered);
    },
  });
}
