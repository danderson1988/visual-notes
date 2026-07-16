// ── Dated items: one data source, many views ─────────────────────
//
// The Calendar card and the table's alternate "database views" all render
// the same underlying facts: things on this board that carry a date.
// Nothing here owns data — a DatedItem is a live view over a kanban item's
// dueDate or a table row's date cell, and move() writes the new date
// straight back into that source object. That's what lets one table
// display as a calendar without duplicating rows anywhere.

import {
  VisualNotesFile, TableCard, TableRow, KanbanItem,
  CalendarCard, CalendarNote, CalendarNoteImportance, CalendarDayStyle,
} from './file-types';
import { setIcon, type App } from 'obsidian';
import { isCustomIconRef, resolveCustomIconSrc } from './custom-icons';
import { resolveThumbnailSrc } from './thumbnail-utils';

// What a DatedItem is a live view over — lets a caller (the Calendar
// card's right-click menu) tell a calendar-native note, which it can fully
// edit and delete, apart from a kanban item or table row, which it can
// only reschedule or jump to (editing those belongs on their own card).
export type DatedItemSource =
  | { kind: 'kanban'; item: KanbanItem }
  | { kind: 'table-row'; row: TableRow; table: TableCard }
  | { kind: 'calendar-note'; note: CalendarNote; card: CalendarCard };

export interface DatedItem {
  key: string;           // unique across the board: `${cardId}:${itemOrRowId}`
  sourceCardId: string;  // owning card — re-rendered after a reschedule
  sourceName: string;    // owning card's display title, for tooltips
  label: string;
  start: string;         // ISO "YYYY-MM-DD"
  end: string;           // ISO, >= start; single-day items have end === start
  color?: string;
  done?: boolean;
  icon?: string;         // Lucide name, single emoji, or a custom asset ref
  iconColor?: string;
  thumbnail?: { type: 'vault'; path: string } | { type: 'external'; url: string };
  importance?: CalendarNoteImportance;
  source: DatedItemSource;
  /** Reschedule so the item starts on newStart, preserving duration. */
  move(newStart: string): void;
}

// ── Date utilities ───────────────────────────────────────────────
// All arithmetic runs on UTC-midnight epochs derived from the ISO string,
// so DST transitions can never make "add one day" produce the same day.

const pad2 = (n: number) => String(n).padStart(2, '0');

export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function isoToUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToISO(ms: number): string {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

export function addDaysISO(iso: string, days: number): string {
  return utcToISO(isoToUTC(iso) + days * 86400000);
}

export function daysBetweenISO(a: string, b: string): number {
  return Math.round((isoToUTC(b) - isoToUTC(a)) / 86400000);
}

export function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

/** 0 = Monday … 6 = Sunday (calendar grids are Monday-first). */
export function isoWeekday(iso: string): number {
  return (new Date(isoToUTC(iso)).getUTCDay() + 6) % 7;
}

export function startOfWeekISO(iso: string): string {
  return addDaysISO(iso, -isoWeekday(iso));
}

export function monthTitle(iso: string): string {
  return new Date(isoToUTC(iso)).toLocaleDateString(undefined, {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export function shortDate(iso: string): string {
  return new Date(isoToUTC(iso)).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

// ── Collectors ───────────────────────────────────────────────────

// First markdown-free line of a kanban item's text, for chip labels.
function plainLabel(text: string | undefined): string {
  const first = (text ?? '').split('\n')[0];
  return first
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~#>]/g, '')
    .trim() || 'Untitled';
}

function kanbanItemToDated(
  item: KanbanItem, cardId: string, sourceName: string, fallbackColor?: string,
): DatedItem | null {
  if (!isISODate(item.dueDate)) return null;
  const due = item.dueDate;
  return {
    key: `${cardId}:${item.id}`,
    sourceCardId: cardId,
    sourceName,
    label: plainLabel(item.text),
    start: due,
    end: due,
    color: item.color ?? fallbackColor,
    done: item.done,
    icon: item.icon,
    iconColor: item.iconColor,
    thumbnail: item.thumbnail,
    source: { kind: 'kanban', item },
    move: (newStart) => { item.dueDate = newStart; },
  };
}

function calendarNoteToDated(note: CalendarNote, card: CalendarCard): DatedItem {
  return {
    key: `${card.id}:${note.id}`,
    sourceCardId: card.id,
    sourceName: card.title || 'Calendar',
    label: note.text.trim() || 'Untitled note',
    start: note.date,
    end: note.date,
    color: note.color,
    icon: note.icon,
    iconColor: note.iconColor,
    thumbnail: note.thumbnail,
    importance: note.importance,
    source: { kind: 'calendar-note', note, card },
    move: (newStart) => { note.date = newStart; },
  };
}

/**
 * Live dated views over a table's rows. The first date column is the start
 * (rows without it are skipped); a second date column, if the table has
 * one, is the end, giving each row a date range rather than a single day.
 * Labels come from the first text column, done state from the first
 * checkbox column, and color from the first select column's option.
 */
export function tableDatedItems(t: TableCard): DatedItem[] {
  const dateCols = t.columns.filter(c => c.type === 'date');
  if (dateCols.length === 0) return [];
  const startCol = dateCols[0];
  const endCol: typeof startCol | undefined = dateCols[1];
  const labelCol = t.columns.find(c => (c.type ?? 'text') === 'text') ?? t.columns[0];
  const doneCol = t.columns.find(c => c.type === 'checkbox');
  const selCol = t.columns.find(c => c.type === 'select');
  const sourceName = t.title || 'Table';

  const out: DatedItem[] = [];
  for (const row of t.rows) {
    const start = row.cells[startCol.id];
    if (!isISODate(start)) continue;
    const rawEnd = endCol ? row.cells[endCol.id] : undefined;
    const end = isISODate(rawEnd) && rawEnd >= start ? rawEnd : start;
    const selOpt = selCol
      ? selCol.options?.find(o => o.label === row.cells[selCol.id])
      : undefined;
    out.push({
      key: `${t.id}:${row.id}`,
      sourceCardId: t.id,
      sourceName,
      label: (labelCol ? row.cells[labelCol.id] : '')?.trim() || 'Untitled',
      start,
      end,
      color: row.color ?? selOpt?.color,
      done: doneCol ? row.cells[doneCol.id] === 'true' : undefined,
      source: { kind: 'table-row', row, table: t },
      move: (newStart) => {
        const delta = daysBetweenISO(start, newStart);
        row.cells[startCol.id] = newStart;
        const curEnd = endCol ? row.cells[endCol.id] : undefined;
        if (endCol && isISODate(curEnd)) row.cells[endCol.id] = addDaysISO(curEnd, delta);
      },
    });
  }
  return out;
}

/**
 * Every dated item on the board: kanban due dates, table date columns, and
 * every Calendar card's own notes. Calendar cards intentionally see each
 * other's notes too — same shared-agenda behavior as kanban/table due
 * dates, which already show on every calendar regardless of which board
 * they live on.
 */
export function collectBoardDatedItems(board: VisualNotesFile): DatedItem[] {
  const out: DatedItem[] = [];
  for (const card of board.cards) {
    if (card.kind === 'kanban-board') {
      const b = card;
      const name = b.title || 'Kanban';
      for (const col of b.columns) {
        for (const item of col.items) {
          const d = kanbanItemToDated(item, b.id, name, col.topColor ?? col.color);
          if (d) out.push(d);
        }
      }
    } else if (card.kind === 'kanban-column') {
      const k = card;
      for (const item of k.items) {
        const d = kanbanItemToDated(item, k.id, k.title || 'Kanban', k.topColor ?? k.color);
        if (d) out.push(d);
      }
    } else if (card.kind === 'table') {
      out.push(...tableDatedItems(card));
    } else if (card.kind === 'calendar') {
      const c = card;
      for (const note of c.notes ?? []) out.push(calendarNoteToDated(note, c));
    }
  }
  return out.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : a.label.localeCompare(b.label));
}

// ── Shared month/week grid renderer ──────────────────────────────
// Used by both the Calendar card and the table's calendar view — same
// grid, same drag-to-reschedule, different item sets.

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface CalendarGridOptions {
  app: App; // resolves vault-relative thumbnails on chips and day badges
  onDrop: (item: DatedItem, date: string) => void;
  // Everything below is Calendar-card-only (the table's calendar view
  // passes none of it — plain due-date agenda, no day authoring): the
  // hover "+" button, right-clicking empty day space, right-clicking an
  // existing chip, decorating the day cell itself, and clicking that
  // decoration's badge to open a linked nested board.
  onDayAdd?: (date: string) => void;
  onDayContextMenu?: (date: string, evt: MouseEvent) => void;
  onItemContextMenu?: (item: DatedItem, evt: MouseEvent, chipEl: HTMLElement) => void;
  dayStyle?: (date: string) => CalendarDayStyle | undefined;
  onDayBadgeClick?: (date: string, style: CalendarDayStyle) => void;
}

export function renderCalendarGrid(
  body: HTMLElement,
  anchor: string,
  mode: 'month' | 'week',
  items: DatedItem[],
  opts: CalendarGridOptions,
): void {
  const { app, onDrop, onDayAdd, onDayContextMenu, onItemContextMenu, dayStyle, onDayBadgeClick } = opts;
  const byDay = new Map<string, DatedItem[]>();
  for (const it of items) {
    const list = byDay.get(it.start) ?? [];
    list.push(it);
    byDay.set(it.start, list);
  }

  const head = body.createDiv('visual-notes-cal-weekdays');
  for (const wd of WEEKDAY_LABELS) head.createDiv({ cls: 'visual-notes-cal-weekday', text: wd });

  const grid = body.createDiv('visual-notes-cal-grid');
  grid.toggleClass('is-week', mode === 'week');

  const today = todayISO();
  const anchorMonth = anchor.slice(0, 7);
  const first = mode === 'week'
    ? startOfWeekISO(anchor)
    : startOfWeekISO(`${anchorMonth}-01`);
  const cellCount = mode === 'week' ? 7 : 42;

  for (let i = 0; i < cellCount; i++) {
    const date = addDaysISO(first, i);
    const cell = grid.createDiv('visual-notes-cal-cell');
    cell.dataset.date = date;
    cell.toggleClass('is-today', date === today);
    if (mode === 'month' && date.slice(0, 7) !== anchorMonth) cell.addClass('is-out-month');
    cell.createDiv({ cls: 'visual-notes-cal-daynum', text: String(Number(date.slice(8))) });

    const style = dayStyle?.(date);
    if (style) {
      if (style.color) { cell.style.setProperty('--vn-day-color', style.color); cell.addClass('has-day-color'); }
      if (style.importance) cell.addClass(`is-day-importance-${style.importance}`);

      let badge: HTMLElement | null = null;
      if (style.icon) {
        // A chosen icon is a small identity glyph, not a background — same
        // corner-badge treatment as an item chip's icon.
        badge = appendIconOrThumbBadge(app, cell, 'visual-notes-cal-day-badge', style.icon, undefined);
      } else if (style.thumbnail) {
        // No icon: the image fills the whole cell instead of a tiny corner
        // badge — a scrim gradient keeps the day number and any chips
        // readable on top of it (see .has-day-image in styles.css).
        const src = resolveThumbnailSrc(app, { thumbnail: style.thumbnail });
        if (src) {
          cell.addClass('has-day-image');
          cell.style.backgroundImage =
            `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.55) 100%), url("${src.replace(/"/g, '%22')}")`;
        } else {
          badge = appendIconOrThumbBadge(app, cell, 'visual-notes-cal-day-badge', undefined, style.thumbnail);
        }
      } else if (style.nestedBoardPath) {
        badge = appendIconOrThumbBadge(app, cell, 'visual-notes-cal-day-badge', 'layout-template', undefined);
      }

      if (style.nestedBoardPath && onDayBadgeClick) {
        // With a full-bleed image the icon/nested-board slot is gone, but
        // the link still needs a click target — a small badge floats over
        // the photo instead.
        const target = badge ?? (cell.hasClass('has-day-image')
          ? appendIconOrThumbBadge(app, cell, 'visual-notes-cal-day-badge', 'layout-template', undefined)
          : null);
        if (target) {
          target.addClass('is-clickable');
          if (cell.hasClass('has-day-image')) target.addClass('is-over-image');
          target.setAttribute('aria-label', 'Open nested board');
          target.addEventListener('pointerdown', e => e.stopPropagation());
          target.addEventListener('click', (e) => { e.stopPropagation(); onDayBadgeClick(date, style); });
        }
      }
    }

    if (onDayAdd) {
      const addBtn = cell.createDiv('visual-notes-cal-day-add');
      setIcon(addBtn, 'plus');
      addBtn.setAttribute('aria-label', `Add note on ${date}`);
      addBtn.addEventListener('pointerdown', e => e.stopPropagation());
      addBtn.addEventListener('click', (e) => { e.stopPropagation(); onDayAdd(date); });
    }
    if (onDayContextMenu) {
      cell.addEventListener('contextmenu', (e) => {
        // Only empty cell space opens the day menu — a chip's own handler
        // (below) owns right-clicks that land on it.
        if ((e.target as HTMLElement).closest('.visual-notes-cal-chip')) return;
        e.preventDefault(); e.stopPropagation();
        onDayContextMenu(date, e);
      });
    }

    const dayItems = byDay.get(date) ?? [];
    const maxChips = mode === 'week' ? dayItems.length : 3;
    for (const it of dayItems.slice(0, maxChips)) {
      appendCalendarChip(app, cell, it, grid, onDrop, onItemContextMenu);
    }
    if (dayItems.length > maxChips) {
      cell.createDiv({ cls: 'visual-notes-cal-more', text: `+${dayItems.length - maxChips} more` });
    }
  }
}

// Icon badge shared by chips and day-cell decoration: a custom asset ref
// renders as bare art (no fill), a single emoji as text, anything else as
// a Lucide glyph. An icon-less item with an image renders the actual
// thumbnail — an external URL loads directly, a vault path resolves
// through `app` to a resource URL (falls back to a generic image glyph if
// the file's gone missing). Returns the badge element (so a caller can
// wire a click handler onto it) or null if there was nothing to render.
function appendIconOrThumbBadge(
  app: App, parent: HTMLElement, className: string, icon: string | undefined,
  thumbnail: { type: 'vault'; path: string } | { type: 'external'; url: string } | undefined,
): HTMLElement | null {
  if (icon) {
    const badge = parent.createDiv(className);
    const customSrc = isCustomIconRef(icon) ? resolveCustomIconSrc(icon) : undefined;
    const isSingleEmoji = [...icon].length === 1 && /\p{Emoji_Presentation}/u.test(icon);
    if (customSrc) badge.createEl('img', { attr: { src: customSrc }, cls: `${className}-img` });
    else if (isSingleEmoji) badge.setText(icon);
    else setIcon(badge, icon);
    return badge;
  } else if (thumbnail) {
    const badge = parent.createDiv(className);
    const src = resolveThumbnailSrc(app, { thumbnail });
    if (src) {
      const img = badge.createEl('img', { cls: `${className}-img` });
      img.src = src;
      img.alt = '';
    } else {
      setIcon(badge, 'image');
    }
    return badge;
  }
  return null;
}

function appendCalendarChip(
  app: App,
  cell: HTMLElement,
  item: DatedItem,
  grid: HTMLElement,
  onDrop: (item: DatedItem, date: string) => void,
  onContextMenu?: (item: DatedItem, evt: MouseEvent, chipEl: HTMLElement) => void,
): void {
  const chip = cell.createDiv('visual-notes-cal-chip');
  chip.toggleClass('is-done', !!item.done);
  if (item.color) chip.style.setProperty('--vn-chip-color', item.color);
  if (item.importance) chip.addClass(`is-importance-${item.importance}`);
  appendIconOrThumbBadge(app, chip, 'visual-notes-cal-chip-icon', item.icon, item.thumbnail);
  chip.createSpan({ cls: 'visual-notes-cal-chip-label', text: item.label });
  chip.setAttribute('aria-label', `${item.label} — ${item.sourceName}`);

  if (onContextMenu) {
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      onContextMenu(item, e, chip);
    });
  }

  chip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let ghost: HTMLElement | null = null;
    let hoverCell: HTMLElement | null = null;
    chip.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) {
        ghost = chip.cloneNode(true) as HTMLElement;
        ghost.addClass('visual-notes-cal-chip-ghost');
        ghost.style.width = `${chip.getBoundingClientRect().width}px`;
        activeDocument.body.appendChild(ghost);
        chip.addClass('is-drag-source');
      }
      if (!ghost) return;
      ghost.style.left = `${ev.clientX + 6}px`;
      ghost.style.top = `${ev.clientY + 6}px`;
      const under = activeDocument.elementFromPoint(ev.clientX, ev.clientY);
      const nextCell = (under as HTMLElement | null)?.closest<HTMLElement>('.visual-notes-cal-cell');
      if (nextCell !== hoverCell) {
        hoverCell?.removeClass('is-drop-target');
        // Only cells of this same grid accept the drop — two calendar
        // cards side by side must not steal each other's drags.
        hoverCell = nextCell && grid.contains(nextCell) ? nextCell : null;
        hoverCell?.addClass('is-drop-target');
      }
    };
    const onUp = () => {
      chip.removeEventListener('pointermove', onMove);
      chip.removeEventListener('pointerup', onUp);
      chip.removeClass('is-drag-source');
      ghost?.remove();
      const dropDate = hoverCell?.dataset.date;
      hoverCell?.removeClass('is-drop-target');
      if (ghost && dropDate && dropDate !== item.start) onDrop(item, dropDate);
      ghost = null;
    };
    chip.addEventListener('pointermove', onMove);
    chip.addEventListener('pointerup', onUp);
  });
}
