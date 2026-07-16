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
    undoSnapshot(): string;
    applyUndoSnapshot(json: string): void;
    pushUndo(): void;
    undo(): void;
    redo(): void;
    rebuildCards(): void;
    archiveSelected(): void;
    openArchiveBrowser(): void;
    scheduleSave(): void;
    saveNow(): Promise<void>;
  }
}

export const persistenceMethods = {
  undoSnapshot(this: FreeformRenderer): string {
    return JSON.stringify({ cards: this.board.cards, connections: this.board.connections, archived: this.board.archived });
  },

  applyUndoSnapshot(this: FreeformRenderer, json: string): void {
    const snap = JSON.parse(json) as { cards: VisualNotesFile['cards']; connections: VisualNotesFile['connections']; archived?: VisualNotesFile['archived'] };
    this.board.cards = snap.cards;
    this.board.connections = snap.connections ?? [];
    this.board.archived = snap.archived;
    this.scheduleSave(); this.rebuildCards();
  },

  pushUndo(this: FreeformRenderer): void {
    this.undoStack.push(this.undoSnapshot());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  },

  undo(this: FreeformRenderer): void {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.undoSnapshot());
    this.applyUndoSnapshot(this.undoStack.pop()!);
  },

  redo(this: FreeformRenderer): void {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.undoSnapshot());
    this.applyUndoSnapshot(this.redoStack.pop()!);
  },

  rebuildCards(this: FreeformRenderer): void {
    this.exitConnectMode();
    this.deselectDrawing();
    this.inner.empty(); this.cardEls.clear(); this.connectionPaths.clear(); this.selection.clear();
    this.inkPaths.clear(); this.inkHitPaths.clear();
    this.initConnectionLayer();
    for (const card of this.board.cards) this.createCardEl(card);
    this.refreshAllConnections();
    // inner.empty() also tore down the ink SVG layer — rebuild it so
    // existing pen strokes (unaffected by undo/redo, which only snapshots
    // cards/connections) still render afterward.
    this.initInkLayer();
    this.renderAllDrawings();
  },

  archiveSelected(this: FreeformRenderer): void {
    const ids = new Set(this.selection.getIds());
    if (ids.size === 0) return;
    this.pushUndo();
    const toArchive = this.board.cards.filter(c => ids.has(c.id));
    this.board.cards = this.board.cards.filter(c => !ids.has(c.id));
    (this.board.archived ??= []).push(...toArchive);
    // Connections to an archived card can't survive (both ends must be
    // live canvas nodes); dropping them is undoable along with the archive.
    this.board.connections = this.board.connections.filter(c =>
      !(c.fromCardId && ids.has(c.fromCardId)) && !(c.toCardId && ids.has(c.toCardId)));
    for (const id of ids) { this.cardEls.get(id)?.remove(); this.cardEls.delete(id); this.disposeCardResources(id); }
    this.selection.clear();
    this.refreshSelectionVisuals();
    this.refreshAllConnections();
    this.scheduleSave();
    new Notice(`Archived ${toArchive.length} card${toArchive.length === 1 ? '' : 's'}.`);
  },

  openArchiveBrowser(this: FreeformRenderer): void {
    new ArchiveModal(
      this.app,
      () => this.board.archived ?? [],
      (c) => this.cardDisplayName(c),
      (c) => {
        this.pushUndo();
        this.board.archived = (this.board.archived ?? []).filter(a => a.id !== c.id);
        this.board.cards.push(c);
        this.createCardEl(c);
        this.selection.select(c.id);
        this.refreshSelectionVisuals();
        this.centerOnCard(c.id);
        this.scheduleSave();
      },
      (c) => {
        this.pushUndo();
        this.board.archived = (this.board.archived ?? []).filter(a => a.id !== c.id);
        this.scheduleSave();
      },
    ).open();
  },

  scheduleSave(this: FreeformRenderer): void {
    this.board.viewport = { ...this.vp };
    // Minimap redraw and filter re-scan are real work on a large board (full
    // dot teardown/rebuild, full card rescan) — coalesce bursts of edits
    // (e.g. dragging several cards, rapid typing) into one refresh shortly
    // after they settle, rather than repeating the work on every single call.
    if (this.minimapFilterTimer) window.clearTimeout(this.minimapFilterTimer);
    this.minimapFilterTimer = window.setTimeout(() => {
      this.minimapFilterTimer = null;
      if (this.minimapOpen) this.updateMinimapCards();
      // Card edits rebuild elements, wiping dim classes — reapply.
      if (this.activeFilters.size) this.applyFilters();
      // Calendar cards mirror dates owned by other cards — keep them
      // current after any edit settles.
      this.refreshPassiveDataViews();
    }, 200);
    this.saveQueue.schedule();
  },

  // Debouncing/serialization/failure-handling all live in SaveQueue (see
  // save-queue.ts, and its own tests) — this just keeps the board's
  // viewport current before handing off to it, same as scheduleSave above.
  async saveNow(this: FreeformRenderer): Promise<void> {
    this.board.viewport = { ...this.vp };
    await this.saveQueue.flush();
  },
};
