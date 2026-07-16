import {
  App, TFile, TFolder, TAbstractFile, Menu, Notice, Modal, setIcon,
  MarkdownRenderer, Component, FuzzySuggestModal, requestUrl, sanitizeHTMLToDom,
} from 'obsidian';
import {
  VisualNotesFile, TileCard, TileTarget, StickyCard, ChecklistCard, ChecklistItem, NoteLinkCard,
  ImageCard, AudioCard, BookmarkCard, KanbanColumnCard, KanbanBoardCard, KanbanColumn,
  KanbanItem, Card, Connection, ColumnCard, ColumnChildCard, CommentCard, CommentReply,
  TableCard, TableColumn, TableRow, TableColumnType, TableSelectOption, TableViewMode,
  MapCard, SwatchCard, FileCard, CalloutCard, GroupCard, KanbanSubtask,
  CalendarCard, CalendarNote, CalendarNoteImportance, CalendarDayStyle,
  DrawingStroke, TILE_DRAG_MIME, DraggedTilePayload,
} from './file-types';
import {
  DatedItem, collectBoardDatedItems, tableDatedItems, renderCalendarGrid,
  addDaysISO, todayISO, startOfWeekISO, monthTitle, shortDate,
} from './dated-items';
import {
  straightAnchors, elbowAnchors, buildStraightPath, buildElbowPath, resolveOrientation, rectExitPoint,
  buildCurvedPath, curveThroughPoint, perpendicularOffset,
} from './canvas/geometry';
import { contrastColor } from './color-utils';
import {
  resolveThumbnailSrc, parseYouTubeId, youTubeThumbnailUrl,
  isGoogleMapsUrl, isGoogleMapsShortLink, googleMapsEmbedSrc,
} from './thumbnail-utils';
import { nearestColorName, randomNamedColor, COLOR_PALETTES, NamedColor } from './named-colors';
import { TileModal, NamePromptModal } from './tile-modal';
import { IconPickerModal } from './icon-picker';
import { isCustomIconRef, resolveCustomIconSrc, CUSTOM_ICONS, customIconRef } from './custom-icons';
import { LabelPromptModal, ReactionPickerModal } from './card-badges';
import { TextFormatToolbar } from './text-format-toolbar';
import { snap } from './canvas/snap';
import {
  Viewport, applyWheelZoom, applyPinchZoom,
  viewportTransform, screenToCanvas, clampZoom,
} from './canvas/pan-zoom';
import { SelectionManager } from './canvas/selection';
import { ContextBar, CtxEvent } from './context-bar';
import { sortAssetFile, saveNewAsset } from './asset-manager';
import { CropImageModal } from './crop-modal';
import { isVisualNotesOwnedFile, createBoardFile, writeBoardFile } from './file-io';
import {
  TILE_DEFAULT_W, TILE_DEFAULT_H, TILE_MIN_W, TILE_MIN_H, STICKY_DEFAULT_W, STICKY_DEFAULT_H,
  STICKY_MIN_W, STICKY_MIN_H, CHECKLIST_DEFAULT_W, CHECKLIST_DEFAULT_H, CHECKLIST_MIN_W, CHECKLIST_MIN_H,
  COMMENT_DEFAULT_W, COMMENT_DEFAULT_H, COMMENT_MIN_W, COMMENT_MIN_H, TABLE_DEFAULT_W, TABLE_DEFAULT_H,
  TABLE_MIN_W, TABLE_MIN_H, NOTELINK_DEFAULT_W, NOTELINK_DEFAULT_H, NOTELINK_TITLE_W, NOTELINK_TITLE_H,
  NOTELINK_MIN_W, NOTELINK_MIN_H, IMAGE_DEFAULT_W, IMAGE_DEFAULT_H, IMAGE_MIN_W, IMAGE_MIN_H,
  BOOKMARK_DEFAULT_W, BOOKMARK_DEFAULT_H, BOOKMARK_MIN_W, BOOKMARK_MIN_H, AUDIO_DEFAULT_W, AUDIO_DEFAULT_H,
  MAP_DEFAULT_W, MAP_DEFAULT_H, MAP_MIN_W, MAP_MIN_H, SWATCH_DEFAULT_W, SWATCH_DEFAULT_H,
  SWATCH_MIN_W, SWATCH_MIN_H, FILE_DEFAULT_W, FILE_DEFAULT_H, FILE_MIN_W, FILE_MIN_H,
  CALLOUT_DEFAULT_W, CALLOUT_DEFAULT_H, CALLOUT_MIN_W, CALLOUT_MIN_H, GROUP_DEFAULT_W, GROUP_DEFAULT_H,
  GROUP_MIN_W, GROUP_MIN_H, GROUP_PAD, AUDIO_MIN_W, AUDIO_MIN_H, AUDIO_EXTS,
  KANBAN_DEFAULT_W, KANBAN_DEFAULT_H, KANBAN_MIN_W, KANBAN_MIN_H, COLUMN_DEFAULT_W, COLUMN_DEFAULT_H,
  COLUMN_MIN_W, COLUMN_MIN_H, CALENDAR_DEFAULT_W, CALENDAR_DEFAULT_H, CALENDAR_MIN_W, CALENDAR_MIN_H,
  DOT_SPACING, MAX_UNDO, DRAG_THRESHOLD, IMAGE_EXTS, CALENDAR_IMPORTANCE_OPTIONS, CONN_COLOR_PRESETS,
  STICKY_COLORS, KANBAN_COLORS, COLUMN_CHILD_KINDS, isColumnChildKind, commentInitial, formatCommentTime,
  DragManager, AppWithPrivateAPIs, SupportedCard, KANBAN_BOARD_MIN_W, cardMinSize, KanbanItemsOwner,
  isValidURL, NoteLinkPickerModal, VaultImagePickerModal, VaultAudioPickerModal, VaultAnyFilePickerModal, formatDueDate,
  dueUrgency, DueDateModal, ArchiveModal, CALLOUT_ICON_CHOICES, CalloutIconPickerModal, QuickAddEntry,
  QuickAddModal, KanbanItemUrlModal, CalendarNoteTextModal, KANBAN_THUMB_IMAGE_EXTS, KanbanItemImageSuggestModal, KANBAN_ITEM_COLORS,
  KanbanItemColorModal, WipLimitModal, MediaSourceModal, TagInputModal, BookmarkInputModal,
} from './freeform-view-shared';
import type { FreeformRenderer } from './freeform-view';

declare module './freeform-view' {
  interface FreeformRenderer {
    refreshAfterDateChange(sourceCardId: string): void;
    refreshPassiveDataViews(): void;
    dataViewNavBtn(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLElement;
    dataViewTextBtn(parent: HTMLElement, text: string, onClick: () => void): HTMLElement;
    editSimpleTitle(
        span: HTMLElement, current: string | undefined,
        apply: (v: string | undefined) => void, cardEl: HTMLElement, card: SupportedCard,
      ): void;
    addCalendarAt(x: number, y: number): void;
    renderCalendarContent(el: HTMLElement, card: CalendarCard): void;
    quickAddCalendarNote(el: HTMLElement, card: CalendarCard, date: string): void;
    ensureDayStyle(card: CalendarCard, date: string): CalendarDayStyle;
    pruneDayStyleIfEmpty(card: CalendarCard, date: string): void;
    showCalendarDayMenu(e: MouseEvent, el: HTMLElement, card: CalendarCard, date: string): void;
    showCalendarItemMenu(e: MouseEvent, el: HTMLElement, card: CalendarCard, item: DatedItem): void;
  }
}

export const cardsCalendarMethods = {
  refreshAfterDateChange(this: FreeformRenderer, sourceCardId: string): void {
    for (const c of this.board.cards) {
      const showsDates = c.kind === 'calendar'
        || (c.kind === 'table' && (c.view ?? 'table') !== 'table');
      if (!showsDates && c.id !== sourceCardId) continue;
      const cel = this.cardEls.get(c.id);
      if (cel) this.rerenderCard(cel, c);
    }
  },

  refreshPassiveDataViews(this: FreeformRenderer): void {
    for (const c of this.board.cards) {
      if (c.kind !== 'calendar') continue;
      const cel = this.cardEls.get(c.id);
      if (cel) this.rerenderCard(cel, c);
    }
  },

  dataViewNavBtn(this: FreeformRenderer, parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLElement {
    const btn = parent.createDiv('visual-notes-dataview-btn');
    setIcon(btn, icon);
    btn.setAttribute('aria-label', label);
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  },

  dataViewTextBtn(this: FreeformRenderer, parent: HTMLElement, text: string, onClick: () => void): HTMLElement {
    const btn = parent.createDiv({ cls: 'visual-notes-dataview-btn visual-notes-dataview-btn-text', text });
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  },

  editSimpleTitle(this: FreeformRenderer, 
    span: HTMLElement, current: string | undefined,
    apply: (v: string | undefined) => void, cardEl: HTMLElement, card: SupportedCard,
  ): void {
    const input = createEl('input');
    input.type = 'text';
    input.value = current ?? '';
    input.className = 'visual-notes-dataview-title-input';
    input.addEventListener('pointerdown', e => e.stopPropagation());
    span.replaceWith(input);
    const commit = () => {
      const v = input.value.trim() || undefined;
      if (v !== current) { this.pushUndo(); apply(v); this.scheduleSave(); }
      this.rerenderCard(cardEl, card);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.removeEventListener('blur', commit); this.rerenderCard(cardEl, card); }
    });
    window.requestAnimationFrame(() => { input.focus(); input.select(); });
  },

  addCalendarAt(this: FreeformRenderer, x: number, y: number): void {
    const card: CalendarCard = {
      id: crypto.randomUUID(), kind: 'calendar',
      x, y, w: CALENDAR_DEFAULT_W, h: CALENDAR_DEFAULT_H, z: this.nextZ(),
    };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
  },

  renderCalendarContent(this: FreeformRenderer, el: HTMLElement, card: CalendarCard): void {
    el.addClass('visual-notes-freeform-calendar-card');
    const mode = card.mode ?? 'month';
    const anchor = card.anchor ?? todayISO();
    const items = collectBoardDatedItems(this.board);
    const rerender = () => this.rerenderCard(el, card);
    const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;

    const header = el.createDiv('visual-notes-calendar-header');
    if (!card.titleHidden) {
      const titleEl = header.createDiv({ cls: 'visual-notes-dataview-title', text: card.title || 'Calendar' });
      titleEl.toggleClass('is-untitled', !card.title);
      titleEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.editSimpleTitle(titleEl, card.title, v => { card.title = v; }, el, card);
      });
    }
    const weekStart = startOfWeekISO(anchor);
    header.createDiv({
      cls: 'visual-notes-calendar-month-label',
      text: mode === 'month' ? monthTitle(anchor) : `${shortDate(weekStart)} – ${shortDate(addDaysISO(weekStart, 6))}`,
    });
    const nav = header.createDiv('visual-notes-dataview-nav');
    this.dataViewNavBtn(nav, 'chevron-left', 'Previous', () => {
      card.anchor = mode === 'month' ? firstOfMonth(addDaysISO(firstOfMonth(anchor), -1)) : addDaysISO(anchor, -7);
      this.scheduleSave(); rerender();
    });
    this.dataViewTextBtn(nav, 'Today', () => { card.anchor = undefined; this.scheduleSave(); rerender(); });
    this.dataViewNavBtn(nav, 'chevron-right', 'Next', () => {
      card.anchor = mode === 'month' ? firstOfMonth(addDaysISO(firstOfMonth(anchor), 32)) : addDaysISO(anchor, 7);
      this.scheduleSave(); rerender();
    });
    const modeWrap = header.createDiv('visual-notes-calendar-mode');
    for (const m of ['month', 'week'] as const) {
      const b = this.dataViewTextBtn(modeWrap, m === 'month' ? 'Month' : 'Week', () => {
        if (card.mode !== m) { card.mode = m; this.scheduleSave(); rerender(); }
      });
      b.toggleClass('is-active', mode === m);
    }

    const body = el.createDiv('visual-notes-calendar-body');
    renderCalendarGrid(body, anchor, mode, items, {
      app: this.app,
      onDrop: (item, date) => {
        this.pushUndo();
        item.move(date);
        this.scheduleSave();
        this.refreshAfterDateChange(item.sourceCardId);
      },
      onDayAdd: (date) => this.quickAddCalendarNote(el, card, date),
      onDayContextMenu: (date, evt) => this.showCalendarDayMenu(evt, el, card, date),
      onItemContextMenu: (item, evt) => this.showCalendarItemMenu(evt, el, card, item),
      dayStyle: (date) => card.dayStyles?.[date],
      onDayBadgeClick: (date, style) => {
        if (style.nestedBoardPath) {
          this.openNestedBoard(style.nestedBoardPath, (p) => { style.nestedBoardPath = p; this.scheduleSave(); });
        }
      },
    });

    this.appendResizeHandles(el);
  },

  quickAddCalendarNote(this: FreeformRenderer, el: HTMLElement, card: CalendarCard, date: string): void {
    new CalendarNoteTextModal(this.app, '', (text) => {
      this.pushUndo();
      const note: CalendarNote = { id: crypto.randomUUID(), date, text };
      card.notes = [...(card.notes ?? []), note];
      this.scheduleSave();
      this.rerenderCard(el, card);
    }).open();
  },

  ensureDayStyle(this: FreeformRenderer, card: CalendarCard, date: string): CalendarDayStyle {
    if (!card.dayStyles) card.dayStyles = {};
    if (!card.dayStyles[date]) card.dayStyles[date] = {};
    return card.dayStyles[date];
  },

  pruneDayStyleIfEmpty(this: FreeformRenderer, card: CalendarCard, date: string): void {
    const s = card.dayStyles?.[date];
    if (s && !s.color && !s.icon && !s.thumbnail && !s.importance && !s.nestedBoardPath) {
      delete card.dayStyles![date];
    }
  },

  showCalendarDayMenu(this: FreeformRenderer, e: MouseEvent, el: HTMLElement, card: CalendarCard, date: string): void {
    const menu = this.newMenu();
    const style = card.dayStyles?.[date];
    const commit = () => { this.scheduleSave(); this.rerenderCard(el, card); };
    const mutate = (fn: (s: CalendarDayStyle) => void) => {
      this.pushUndo();
      fn(this.ensureDayStyle(card, date));
      this.pruneDayStyleIfEmpty(card, date);
      commit();
    };

    menu.addItem(i => i.setTitle(`Add note on ${shortDate(date)}…`).setIcon('plus').onClick(() => {
      this.quickAddCalendarNote(el, card, date);
    }));

    menu.addSeparator();
    if (style?.nestedBoardPath) {
      menu.addItem(i => i.setTitle('Open nested board').setIcon('layout-template').onClick(() => {
        this.openNestedBoard(style.nestedBoardPath!, (p) => {
          this.ensureDayStyle(card, date).nestedBoardPath = p;
          this.scheduleSave();
        });
      }));
      menu.addItem(i => i.setTitle('Unlink nested board').setIcon('unlink').onClick(() => {
        mutate(s => { s.nestedBoardPath = undefined; s.nestedBoardIcon = undefined; });
      }));
    } else {
      menu.addItem(i => i.setTitle('Create nested board…').setIcon('layout-template').onClick(() => {
        this.createNestedBoardFrom(shortDate(date), (path, icon) => {
          mutate(s => { s.nestedBoardPath = path; s.nestedBoardIcon = icon; });
        });
      }));
    }

    menu.addSeparator();
    if (!style?.thumbnail) {
      menu.addItem(i => i.setTitle(style?.icon ? 'Change day icon…' : 'Set day icon…').setIcon('image').onClick(() => {
        new IconPickerModal(this.app, style?.iconColor ?? '#3B82F6', (selected, color) => {
          mutate(s => { s.icon = selected; s.iconColor = color; });
        }).open();
      }));
      if (style?.icon) {
        menu.addItem(i => i.setTitle('Remove day icon').setIcon('x').onClick(() => {
          mutate(s => { s.icon = undefined; s.iconColor = undefined; });
        }));
      }
    }
    if (!style?.icon) {
      menu.addItem(i => i.setTitle(style?.thumbnail ? 'Change day image…' : 'Set day image…').setIcon('image-plus').onClick(() => {
        new KanbanItemImageSuggestModal(this.app, (file) => {
          mutate(s => { s.thumbnail = { type: 'vault', path: file.path }; });
        }).open();
      }));
      menu.addItem(i => i.setTitle('Use day image URL…').setIcon('link').onClick(() => {
        new KanbanItemUrlModal(this.app, '', (url) => {
          if (!url) return;
          mutate(s => { s.thumbnail = { type: 'external', url }; });
        }).open();
      }));
      if (style?.thumbnail) {
        menu.addItem(i => i.setTitle('Remove day image').setIcon('x').onClick(() => {
          mutate(s => { s.thumbnail = undefined; });
        }));
      }
    }

    menu.addSeparator();
    menu.addItem(i => i.setTitle(style?.color ? 'Change day color…' : 'Set day color…').setIcon('palette').onClick(() => {
      new KanbanItemColorModal(this.app, style?.color, (hex) => {
        mutate(s => { s.color = hex; });
      }).open();
    }));

    menu.addSeparator();
    for (const { v, label } of CALENDAR_IMPORTANCE_OPTIONS) {
      menu.addItem(i => i.setTitle(label).setChecked(style?.importance === v).onClick(() => {
        mutate(s => { s.importance = v; });
      }));
    }

    menu.showAtMouseEvent(e);
  },

  showCalendarItemMenu(this: FreeformRenderer, e: MouseEvent, el: HTMLElement, card: CalendarCard, item: DatedItem): void {
    const menu = this.newMenu();
    const src = item.source;

    menu.addItem(i => i.setTitle('Change date…').setIcon('calendar').onClick(() => {
      new DueDateModal(this.app, item.start, (date) => {
        if (!date) return;
        this.pushUndo();
        item.move(date);
        this.scheduleSave();
        this.refreshAfterDateChange(item.sourceCardId);
      }).open();
    }));

    if (src.kind === 'calendar-note') {
      const note = src.note;
      const commit = () => { this.scheduleSave(); this.rerenderCard(el, card); };

      menu.addItem(i => i.setTitle('Edit text…').setIcon('pencil').onClick(() => {
        new CalendarNoteTextModal(this.app, note.text, (text) => {
          this.pushUndo(); note.text = text; commit();
        }).open();
      }));

      menu.addSeparator();
      if (note.nestedBoardPath) {
        menu.addItem(i => i.setTitle('Open nested board').setIcon('layout-template').onClick(() => {
          this.openNestedBoard(note.nestedBoardPath!, (p) => { note.nestedBoardPath = p; });
        }));
        menu.addItem(i => i.setTitle('Unlink nested board').setIcon('unlink').onClick(() => {
          this.pushUndo(); note.nestedBoardPath = undefined; note.nestedBoardIcon = undefined; commit();
        }));
      } else {
        menu.addItem(i => i.setTitle('Create nested board…').setIcon('layout-template').onClick(() => {
          this.createNestedBoardFrom(note.text || 'Note', (path, icon) => {
            this.pushUndo(); note.nestedBoardPath = path; note.nestedBoardIcon = icon; commit();
          });
        }));
      }

      menu.addSeparator();
      if (!note.thumbnail) {
        menu.addItem(i => i.setTitle(note.icon ? 'Change icon…' : 'Set icon…').setIcon('image').onClick(() => {
          new IconPickerModal(this.app, note.iconColor ?? '#3B82F6', (selected, color) => {
            this.pushUndo(); note.icon = selected; note.iconColor = color; commit();
          }).open();
        }));
        if (note.icon) {
          menu.addItem(i => i.setTitle('Remove icon').setIcon('x').onClick(() => {
            this.pushUndo(); note.icon = undefined; note.iconColor = undefined; commit();
          }));
        }
      }
      if (!note.icon) {
        menu.addItem(i => i.setTitle(note.thumbnail ? 'Change image…' : 'Set image…').setIcon('image-plus').onClick(() => {
          new KanbanItemImageSuggestModal(this.app, (file) => {
            this.pushUndo(); note.thumbnail = { type: 'vault', path: file.path }; commit();
          }).open();
        }));
        menu.addItem(i => i.setTitle('Use image URL…').setIcon('link').onClick(() => {
          new KanbanItemUrlModal(this.app, '', (url) => {
            if (!url) return;
            this.pushUndo(); note.thumbnail = { type: 'external', url }; commit();
          }).open();
        }));
        if (note.thumbnail) {
          menu.addItem(i => i.setTitle('Remove image').setIcon('x').onClick(() => {
            this.pushUndo(); note.thumbnail = undefined; commit();
          }));
        }
      }

      menu.addSeparator();
      menu.addItem(i => i.setTitle(note.color ? 'Change color…' : 'Set color…').setIcon('palette').onClick(() => {
        new KanbanItemColorModal(this.app, note.color, (hex) => {
          this.pushUndo(); note.color = hex; commit();
        }).open();
      }));

      menu.addSeparator();
      for (const { v, label } of CALENDAR_IMPORTANCE_OPTIONS) {
        menu.addItem(i => i.setTitle(label).setChecked(note.importance === v).onClick(() => {
          this.pushUndo(); note.importance = v; commit();
        }));
      }

      menu.addSeparator();
      menu.addItem(i => i.setTitle('Delete note').setIcon('trash').onClick(() => {
        this.pushUndo();
        card.notes = (card.notes ?? []).filter(n => n.id !== note.id);
        commit();
      }));
    } else {
      menu.addSeparator();
      menu.addItem(i => i.setTitle(`Open on ${item.sourceName}`).setIcon('arrow-up-right').onClick(() => {
        this.selection.select(item.sourceCardId);
        this.refreshSelectionVisuals();
        this.centerOnCard(item.sourceCardId);
      }));
    }

    menu.showAtMouseEvent(e);
  },
};
