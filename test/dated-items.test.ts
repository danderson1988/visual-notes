import { describe, it, expect } from 'vitest';
import {
  isISODate, addDaysISO, daysBetweenISO, todayISO, isoWeekday, startOfWeekISO, monthTitle, shortDate,
  tableDatedItems, collectBoardDatedItems,
} from '../src/dated-items';
import type { VisualNotesFile, TableCard, KanbanBoardCard, KanbanColumnCard, CalendarCard } from '../src/file-types';

describe('todayISO', () => {
  it('matches the local calendar date', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayISO()).toBe(expected);
  });
  it('always returns a valid ISO date string', () => {
    expect(isISODate(todayISO())).toBe(true);
  });
});

describe('isISODate', () => {
  it('accepts valid calendar dates', () => {
    expect(isISODate('2026-07-14')).toBe(true);
    expect(isISODate('2024-02-29')).toBe(true); // leap day
  });
  it('rejects malformed strings and non-existent calendar dates', () => {
    expect(isISODate('not-a-date')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false); // month 13
    expect(isISODate('2025-02-29')).toBe(false); // not a leap year
    expect(isISODate('2026-7-14')).toBe(false); // not zero-padded
    expect(isISODate(undefined)).toBe(false);
    expect(isISODate(12345)).toBe(false);
  });
});

describe('addDaysISO / daysBetweenISO', () => {
  it('adds days, including across month and year boundaries', () => {
    expect(addDaysISO('2026-07-14', 1)).toBe('2026-07-15');
    expect(addDaysISO('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('subtracts days with a negative delta', () => {
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('is immune to DST — always exactly one calendar day regardless of the date', () => {
    // Fixed UTC-midnight epoch arithmetic (see the file's own comment) —
    // this would drift by an hour around a DST transition if it used local
    // time instead.
    expect(addDaysISO('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDaysISO('2026-11-01', 1)).toBe('2026-11-02');
  });
  it('daysBetweenISO is the inverse of addDaysISO', () => {
    expect(daysBetweenISO('2026-07-01', '2026-07-14')).toBe(13);
    expect(daysBetweenISO('2026-07-14', '2026-07-01')).toBe(-13);
    expect(daysBetweenISO('2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('isoWeekday / startOfWeekISO (Monday-first grids)', () => {
  it('reports 0 for Monday and 6 for Sunday', () => {
    expect(isoWeekday('2026-07-13')).toBe(0); // a Monday
    expect(isoWeekday('2026-07-19')).toBe(6); // the following Sunday
  });
  it('startOfWeekISO always resolves to that same week\'s Monday', () => {
    for (const day of ['2026-07-13', '2026-07-14', '2026-07-19']) {
      expect(startOfWeekISO(day)).toBe('2026-07-13');
    }
  });
});

describe('monthTitle / shortDate (locale formatting stays UTC-anchored)', () => {
  it('does not shift to an adjacent month/day due to local timezone', () => {
    expect(monthTitle('2026-07-01')).toContain('2026');
    expect(monthTitle('2026-07-01')).toContain('July');
    expect(shortDate('2026-07-01')).toContain('Jul');
  });
});

describe('tableDatedItems', () => {
  function tableWithDateCol(overrides: Partial<TableCard> = {}): TableCard {
    return {
      id: 't1', kind: 'table', color: '#fff',
      columns: [
        { id: 'name', label: 'Name', type: 'text' },
        { id: 'due', label: 'Due', type: 'date' },
      ],
      rows: [],
      ...overrides,
    };
  }

  it('skips rows with no (or an invalid) date in the date column', () => {
    const t = tableWithDateCol({ rows: [
      { id: 'r1', cells: { name: 'A', due: '' } },
      { id: 'r2', cells: { name: 'B', due: 'not-a-date' } },
    ] });
    expect(tableDatedItems(t)).toEqual([]);
  });

  it('produces one DatedItem per validly-dated row, labeled from the first text column', () => {
    const t = tableWithDateCol({ rows: [
      { id: 'r1', cells: { name: 'Ship release', due: '2026-08-01' } },
    ] });
    const items = tableDatedItems(t);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: 'Ship release', start: '2026-08-01', end: '2026-08-01' });
  });

  it('treats a second date column as the range end, falling back to a single day if invalid/out of order', () => {
    const t = tableWithDateCol({
      columns: [
        { id: 'name', label: 'Name', type: 'text' },
        { id: 'start', label: 'Start', type: 'date' },
        { id: 'end', label: 'End', type: 'date' },
      ],
      rows: [
        { id: 'r1', cells: { name: 'Multi-day', start: '2026-08-01', end: '2026-08-05' } },
        { id: 'r2', cells: { name: 'Bad range', start: '2026-08-01', end: '2026-07-01' } }, // end before start
      ],
    });
    const items = tableDatedItems(t);
    expect(items.find(i => i.label === 'Multi-day')).toMatchObject({ start: '2026-08-01', end: '2026-08-05' });
    expect(items.find(i => i.label === 'Bad range')).toMatchObject({ start: '2026-08-01', end: '2026-08-01' });
  });

  it('colors an item from its select column\'s matching option when the row has no explicit color', () => {
    const t = tableWithDateCol({
      columns: [
        { id: 'name', label: 'Name', type: 'text' },
        { id: 'due', label: 'Due', type: 'date' },
        { id: 'status', label: 'Status', type: 'select', options: [
          { label: 'Urgent', color: '#ff0000' }, { label: 'Later', color: '#00ff00' },
        ] },
      ],
      rows: [{ id: 'r1', cells: { name: 'X', due: '2026-08-01', status: 'Urgent' } }],
    });
    const [item] = tableDatedItems(t);
    expect(item.color).toBe('#ff0000');
  });

  it('move() reschedules the start and shifts a valid end by the same delta', () => {
    const t = tableWithDateCol({
      columns: [
        { id: 'name', label: 'Name', type: 'text' },
        { id: 'start', label: 'Start', type: 'date' },
        { id: 'end', label: 'End', type: 'date' },
      ],
      rows: [{ id: 'r1', cells: { name: 'X', start: '2026-08-01', end: '2026-08-05' } }],
    });
    const [item] = tableDatedItems(t);
    item.move('2026-08-03'); // +2 days
    expect(t.rows[0].cells.start).toBe('2026-08-03');
    expect(t.rows[0].cells.end).toBe('2026-08-07'); // shifted by the same +2
  });

  it('returns nothing for a table with no date column at all', () => {
    const t: TableCard = {
      id: 't1', kind: 'table', color: '#fff',
      columns: [{ id: 'name', label: 'Name', type: 'text' }],
      rows: [{ id: 'r1', cells: { name: 'no dates here' } }],
    };
    expect(tableDatedItems(t)).toEqual([]);
  });
});

describe('collectBoardDatedItems', () => {
  it('gathers kanban due dates, table date rows, and calendar notes from across the whole board, sorted by date', () => {
    const kanban: KanbanBoardCard = {
      id: 'kb1', kind: 'kanban-board', title: 'Sprint',
      columns: [{ id: 'col1', color: '#eee', items: [
        { id: 'it1', text: 'Later task', dueDate: '2026-09-01' },
        { id: 'it2', text: 'No date task' }, // no dueDate — must be skipped
      ] }],
    };
    const table: TableCard = {
      id: 't1', kind: 'table', color: '#fff',
      columns: [{ id: 'name', label: 'Name', type: 'text' }, { id: 'due', label: 'Due', type: 'date' }],
      rows: [{ id: 'r1', cells: { name: 'Earlier row', due: '2026-07-01' } }],
    };
    const cal: CalendarCard = {
      id: 'cal1', kind: 'calendar',
      notes: [{ id: 'n1', date: '2026-08-01', text: 'Mid note' }],
    };
    const board: VisualNotesFile = { version: 3, layout: 'freeform', cards: [kanban, table, cal], connections: [], drawings: [] };

    const items = collectBoardDatedItems(board);
    expect(items).toHaveLength(3); // "No date task" excluded
    expect(items.map(i => i.label)).toEqual(['Earlier row', 'Mid note', 'Later task']); // sorted by start date
  });

  it('a kanban item\'s move() writes straight back into the board\'s own data', () => {
    const kanban: KanbanBoardCard = {
      id: 'kb1', kind: 'kanban-board',
      columns: [{ id: 'col1', color: '#eee', items: [{ id: 'it1', text: 'Task', dueDate: '2026-07-01' }] }],
    };
    const board: VisualNotesFile = { version: 3, layout: 'freeform', cards: [kanban], connections: [], drawings: [] };
    const [item] = collectBoardDatedItems(board);
    item.move('2026-07-15');
    expect(kanban.columns[0].items[0].dueDate).toBe('2026-07-15');
  });

  it('a calendar note\'s move() writes straight back into the card\'s own notes array', () => {
    const cal: CalendarCard = { id: 'cal1', kind: 'calendar', notes: [{ id: 'n1', date: '2026-08-01', text: 'Note' }] };
    const board: VisualNotesFile = { version: 3, layout: 'freeform', cards: [cal], connections: [], drawings: [] };
    const [item] = collectBoardDatedItems(board);
    item.move('2026-08-10');
    expect(cal.notes![0].date).toBe('2026-08-10');
  });

  it('also collects due dates from a legacy (pre-migration) single-column kanban card', () => {
    const legacy: KanbanColumnCard = {
      id: 'kc1', kind: 'kanban-column', title: 'Old-style board', color: '#eee',
      items: [{ id: 'it1', text: 'Task', dueDate: '2026-07-01' }],
    };
    const board: VisualNotesFile = { version: 3, layout: 'freeform', cards: [legacy], connections: [], drawings: [] };
    const items = collectBoardDatedItems(board);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: 'Task', sourceName: 'Old-style board' });
  });
});
