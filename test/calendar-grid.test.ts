// @vitest-environment jsdom
//
// Regression tests for the reported calendar bug: a month cell caps its chip
// list and offered the remainder as a "+N more" line that was plain text —
// no click handler, no hover, and the cell clips its overflow, so the items
// past the cap could not be seen or reached by any route at all. The same cap
// is why adding or deleting a note on a full day read as doing nothing: the
// new note rendered out of sight, and deleting a visible one pulled a hidden
// one up into the gap, leaving the same three chips on screen either way.
import { describe, it, expect } from 'vitest';
import { renderCalendarGrid, collectBoardDatedItems, type DatedItem } from '../src/dated-items';
import { fakeApp } from './fake-app';
import type { VisualNotesFile, CalendarCard } from '../src/file-types';

const DAY = '2026-07-15';
const OTHER_DAY = '2026-07-16';

// Real DatedItems, built the way the card builds them, rather than hand-rolled
// literals — this keeps the tests honest if the collector's shape ever moves.
function itemsOn(counts: Record<string, number>): DatedItem[] {
  const card: CalendarCard = {
    id: 'cal1', kind: 'calendar', x: 0, y: 0, w: 400, h: 400, z: 1,
    anchor: '2026-07-01', mode: 'month',
    notes: Object.entries(counts).flatMap(([date, n]) =>
      Array.from({ length: n }, (_, i) => ({ id: `${date}-${i}`, date, text: `test ${i + 1}` })),
    ),
  };
  const board: VisualNotesFile = {
    version: 3, layout: 'freeform', cards: [card], connections: [], drawings: [],
  };
  return collectBoardDatedItems(board);
}

function render(items: DatedItem[], expandDay?: string) {
  const body = document.createElement('div');
  document.body.appendChild(body);
  renderCalendarGrid(body, '2026-07-01', 'month', items, {
    app: fakeApp(), onDrop: () => {}, expandDay,
  });
  const cellFor = (date: string) => {
    const cell = body.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (!cell) throw new Error(`no cell rendered for ${date}`);
    return cell;
  };
  const chipCount = (date: string) => cellFor(date).querySelectorAll('.visual-notes-cal-chip').length;
  const moreEl = (date: string) => cellFor(date).querySelector<HTMLElement>('.visual-notes-cal-more');
  return { body, cellFor, chipCount, moreEl };
}

describe('calendar month grid: reaching the items past "+N more"', () => {
  it('caps the visible chips and reports how many are hidden', () => {
    const { chipCount, moreEl } = render(itemsOn({ [DAY]: 5 }));
    expect(chipCount(DAY)).toBe(3);
    expect(moreEl(DAY)?.textContent).toBe('+2 more');
  });

  it('offers no "+N more" when the whole day already fits', () => {
    const { chipCount, moreEl } = render(itemsOn({ [DAY]: 3 }));
    expect(chipCount(DAY)).toBe(3);
    expect(moreEl(DAY)).toBe(null);
  });

  it('exposes "+N more" as a real control, not a label', () => {
    // The original bug in one assertion: it rendered, but nothing about it
    // was operable.
    const { moreEl } = render(itemsOn({ [DAY]: 5 }));
    const more = moreEl(DAY)!;
    expect(more.hasClass('is-clickable')).toBe(true);
    expect(more.getAttribute('role')).toBe('button');
    expect(more.getAttribute('tabindex')).toBe('0');
    expect(more.getAttribute('aria-label')).toBe(`Show all 5 items on ${DAY}`);
  });

  it('clicking it reveals every item on the day', () => {
    const { chipCount, moreEl, cellFor } = render(itemsOn({ [DAY]: 5 }));
    moreEl(DAY)!.click();
    expect(chipCount(DAY)).toBe(5);
    expect(cellFor(DAY).hasClass('is-day-expanded')).toBe(true);
    expect(moreEl(DAY)?.textContent).toBe('Show less');
  });

  it('clicking again collapses back to the capped list', () => {
    const { chipCount, moreEl, cellFor } = render(itemsOn({ [DAY]: 5 }));
    moreEl(DAY)!.click();
    // Asserted mid-way so a dead click handler fails here rather than
    // letting the test pass on a list that was never expanded at all.
    expect(chipCount(DAY)).toBe(5);

    moreEl(DAY)!.click();
    expect(chipCount(DAY)).toBe(3);
    expect(cellFor(DAY).hasClass('is-day-expanded')).toBe(false);
    expect(moreEl(DAY)?.textContent).toBe('+2 more');
  });

  it('opens on Enter and Space, for a keyboard user', () => {
    for (const key of ['Enter', ' ']) {
      const { chipCount, moreEl } = render(itemsOn({ [DAY]: 5 }));
      moreEl(DAY)!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      expect(chipCount(DAY)).toBe(5);
    }
  });

  it('keeps only one day open at a time', () => {
    // Two expanded panels overlap, and the one underneath is unreachable —
    // which would look exactly like the bug this fixes.
    const { chipCount, moreEl } = render(itemsOn({ [DAY]: 5, [OTHER_DAY]: 6 }));
    moreEl(DAY)!.click();
    expect(chipCount(DAY)).toBe(5);

    moreEl(OTHER_DAY)!.click();
    expect(chipCount(OTHER_DAY)).toBe(6);
    expect(chipCount(DAY)).toBe(3);
  });
});

describe('calendar month grid: expandDay, so an edit lands in view', () => {
  it('renders the named day already open', () => {
    // What the add and delete paths set, so a change to a full day is visible
    // instead of landing past the cap.
    const { chipCount, cellFor } = render(itemsOn({ [DAY]: 5 }), DAY);
    expect(chipCount(DAY)).toBe(5);
    expect(cellFor(DAY).hasClass('is-day-expanded')).toBe(true);
  });

  it('leaves every other day capped', () => {
    const { chipCount } = render(itemsOn({ [DAY]: 5, [OTHER_DAY]: 5 }), DAY);
    expect(chipCount(DAY)).toBe(5);
    expect(chipCount(OTHER_DAY)).toBe(3);
  });

  it('is inert for a day that has nothing hidden', () => {
    const { chipCount, cellFor } = render(itemsOn({ [DAY]: 2 }), DAY);
    expect(chipCount(DAY)).toBe(2);
    expect(cellFor(DAY).hasClass('is-day-expanded')).toBe(false);
  });
});

describe('calendar week grid', () => {
  it('lists a whole day without capping, since its cells are tall enough', () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    renderCalendarGrid(body, DAY, 'week', itemsOn({ [DAY]: 5 }), {
      app: fakeApp(), onDrop: () => {},
    });
    const cell = body.querySelector<HTMLElement>(`[data-date="${DAY}"]`)!;
    expect(cell.querySelectorAll('.visual-notes-cal-chip').length).toBe(5);
    expect(cell.querySelector('.visual-notes-cal-more')).toBe(null);
  });
});
