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
  CHECKERS_DEFAULT_W, CHECKERS_DEFAULT_H,
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
    disposeCardResources(id: string): void;
    bindCanvasEvents(): void;
    startPan(e: PointerEvent): void;
    cancelLongPress(): void;
    maybeStartTouchMarquee(e: PointerEvent): void;
    startMarquee(e: PointerEvent): void;
    clearMarqueeConnections(): void;
    refreshSelectionVisuals(keepMarqueeConnections?: boolean): void;
    bindDelegatedCardEvents(): void;
    appendResizeHandles(el: HTMLElement): void;
    startCardResize(e: PointerEvent, handle: HTMLElement, el: HTMLElement, card: SupportedCard): void;
    onKeyDown(e: KeyboardEvent): void;
    activateTile(tile: TileCard): Promise<void>;
    activateNoteLink(card: NoteLinkCard): Promise<void>;
    nextZ(): number;
    applySnap(val: number): number;
    toggleSnapToGrid(): void;
    centerPos(w: number, h: number): { x: number; y: number };
    alignCards(mode: 'left' | 'center-h' | 'right' | 'top' | 'middle-v' | 'bottom' | 'distribute-h' | 'distribute-v'): void;
    deleteSelected(): void;
    duplicateSelected(): void;
    activateTool(name: string, btn: HTMLElement): void;
    clearPendingTool(): void;
    placePendingTool(cx: number, cy: number): void;
    isOverTrash(clientX: number, clientY: number): boolean;
    setTrashHover(clientX: number, clientY: number): void;
    clearTrashHover(): void;
    centerOnCard(id: string): void;
    initConnectionLayer(): void;
    initInkLayer(): void;
    renderAllDrawings(): void;
    buildInkPathD(points: { x: number; y: number }[]): string;
    isHighlightStroke(stroke: DrawingStroke): boolean;
    buildStrokePathD(stroke: DrawingStroke): string;
    buildHighlightOutlineD(stroke: DrawingStroke): string;
    renderSingleDrawing(stroke: DrawingStroke): void;
    groupStrokes(groupId: string): DrawingStroke[];
    selectDrawing(groupId: string): void;
    refreshDrawingSelectionVisual(groupId: string): void;
    deselectDrawing(): void;
    computeGroupBBox(groupId: string): { minX: number; minY: number; maxX: number; maxY: number } | null;
    renderDrawingBox(groupId: string, bbox: { minX: number; minY: number; maxX: number; maxY: number }): void;
    removeDrawingBox(): void;
    startDrawingResize(e: PointerEvent, groupId: string, corner: 'nw' | 'ne' | 'sw' | 'se'): void;
    deleteSelectedDrawing(): void;
    rerenderGroup(groupId: string): void;
    showDrawingMenu(e: MouseEvent, groupId: string): void;
    startInkStroke(startEvent: PointerEvent): void;
    autoStraighten(stroke: DrawingStroke): void;
    startEraseScrub(startEvent: PointerEvent): void;
    togglePenMode(): void;
    enterPenMode(): void;
    exitPenMode(): void;
    showPenBanner(): void;
    hidePenBanner(): void;
    showPenColorPicker(): void;
    hidePenColorPicker(): void;
    refreshAllConnections(): void;
    renderSingleConnection(conn: Connection): void;
    removeSingleConnection(id: string): void;
    visibleCanvasBounds(): { x: number; y: number; w: number; h: number };
    isConnectionVisible(conn: Connection, view: { x: number; y: number; w: number; h: number }): boolean;
    scheduleCullingRefresh(): void;
    refreshConnectionCulling(): void;
    buildConnectionPath(conn: Connection): string | null;
    getCardRect(cardId: string): { x: number; y: number; w: number; h: number } | null;
    getConnEndpointRect(
        cardId: string | undefined, point: { x: number; y: number } | undefined,
      ): { x: number; y: number; w: number; h: number } | null;
    connectionLabelPos(conn: Connection): { x: number; y: number } | null;
    renderConnectionLabel(conn: Connection): void;
    updateConnectionsForCard(cardId: string): void;
    getOrCreateMarker(color: string, thickness: number, end: 'end' | 'start'): string;
    enterConnectMode(): void;
    exitConnectMode(): void;
    toggleConnectMode(): void;
    addConnectionHandles(el: HTMLElement, card: SupportedCard): void;
    startHandleDrag(
        e: PointerEvent, handleEl: HTMLElement,
        card: SupportedCard, side: 'n' | 's' | 'e' | 'w'
      ): void;
    getEdgeMidpoint(card: Card, side: 'n' | 's' | 'e' | 'w'): { x: number; y: number };
    updateGhostPath(sx: number, sy: number, tx: number, ty: number): void;
    removeGhostPath(): void;
    startConnectSourceGhost(sourceId: string): void;
    stopConnectSourceGhost(): void;
    cardIdAtPoint(clientX: number, clientY: number): string | null;
    finishConnection(fromId: string, toId: string): void;
    startFreeLineDrag(startEvent: PointerEvent): void;
    addDefaultArrowAt(cx: number, cy: number): void;
    resolveDefaultConnectionColor(): string;
    selectConnection(id: string): void;
    deselectConnection(): void;
    showConnectionEndpointHandles(conn: Connection): void;
    hideConnectionEndpointHandles(): void;
    showConnectionBendHandle(conn: Connection): void;
    rerenderConnection(conn: Connection): void;
    deleteSelectedConnection(): void;
    showConnectionProps(conn: Connection): void;
    hideConnectionProps(): void;
  }
}

export const canvasMethods = {
  disposeCardResources(this: FreeformRenderer, id: string): void {
    this.tableGridResizeObs.get(id)?.disconnect();
    this.tableGridResizeObs.delete(id);
  },

  bindCanvasEvents(this: FreeformRenderer): void {
    // Passive position tracking so "/" quick-add can drop the new card
    // under the cursor rather than always at the viewport center.
    this.outer.addEventListener('pointermove', (e) => {
      this.lastPointerClient = { x: e.clientX, y: e.clientY };
    }, { passive: true });

    this.outer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.outer.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        this.vp = applyWheelZoom(e, this.vp, rect);
      } else {
        this.vp = { ...this.vp, x: this.vp.x - e.deltaX, y: this.vp.y - e.deltaY };
      }
      this.applyViewport(); this.scheduleSave();
    }, { passive: false });

    this.outer.addEventListener('touchstart', (e) => {
      this.activeTouches = e.touches.length;
      // A second finger landing mid-drag means what looked like a one-
      // finger marquee gesture just became a pinch — abort the marquee so
      // it doesn't stick around fighting with the pinch-zoom transform.
      if (this.activeTouches >= 2) { this.cancelActiveMarquee?.(); this.cancelLongPress(); }
    }, { passive: true });

    // Manual long-press-to-contextmenu (see the field comments above for
    // why the native gesture doesn't fire here). Capture phase so this runs
    // before any card/item's own bubble-phase pointerdown handler — meaning
    // it starts the timer regardless of what that handler does afterward
    // (preventDefault, stopPropagation, starting its own drag).
    this.outer.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || e.button !== 0) return;
      if (this.penModeActive || this.connectMode) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"], button, a, .visual-notes-card-resize-handle, .visual-notes-connection-handle')) return;
      this.cancelLongPress();
      this.longPressPointerId = e.pointerId;
      this.longPressStartX = e.clientX; this.longPressStartY = e.clientY;
      this.longPressTarget = target;
      target.addClass('ib-longpress-active');
      const clientX = e.clientX, clientY = e.clientY;
      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = null;
        target.removeClass('ib-longpress-active');
        this.longPressTarget = null;
        if (!target.isConnected) return;
        target.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, clientX, clientY, view: window,
        }));
      }, 500);
    }, { capture: true });
    this.outer.addEventListener('pointermove', (e) => {
      if (this.longPressPointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - this.longPressStartX, e.clientY - this.longPressStartY) > DRAG_THRESHOLD) this.cancelLongPress();
    }, { capture: true });
    this.outer.addEventListener('pointerup', (e) => {
      if (this.longPressPointerId === e.pointerId) this.cancelLongPress();
    }, { capture: true });
    this.outer.addEventListener('pointercancel', (e) => {
      if (this.longPressPointerId === e.pointerId) this.cancelLongPress();
    }, { capture: true });
    this.outer.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const rect = this.outer.getBoundingClientRect();
        const t1 = e.touches[0]; const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = ((t1.clientX + t2.clientX) / 2) - rect.left;
        const midY = ((t1.clientY + t2.clientY) / 2) - rect.top;
        if (this.pinchDist !== null) {
          const factor = dist / this.pinchDist;
          this.vp = applyPinchZoom(midX, midY, clampZoom(this.vp.zoom * factor), this.vp);
          this.vp.x += midX - this.pinchMidX; this.vp.y += midY - this.pinchMidY;
          this.applyViewport();
        }
        this.pinchDist = dist; this.pinchMidX = midX; this.pinchMidY = midY;
      }
    }, { passive: false });

    this.outer.addEventListener('touchend', (e) => { this.activeTouches = e.touches.length; this.pinchDist = null; this.scheduleSave(); });
    this.outer.addEventListener('touchcancel', (e) => { this.activeTouches = e.touches.length; this.pinchDist = null; });
    this.outer.addEventListener('keydown', (e) => this.onKeyDown(e));

    this.docKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && activeDocument.activeElement === this.outer) {
        e.preventDefault(); this.spaceDown = true;
        if (!this.isPanning) this.setCursor('grab');
      }
      // Ctrl/Cmd+F opens board search when focus is on the canvas itself
      // (not while typing in a card) — Obsidian has no in-view search for
      // this custom view type, so this doesn't shadow anything.
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && activeDocument.activeElement === this.outer) {
        e.preventDefault();
        this.openSearch();
      }
      // "/" opens the quick-add palette (Notion-style slash command).
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && activeDocument.activeElement === this.outer) {
        e.preventDefault();
        this.openQuickAdd();
      }
    };
    this.docKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        if (!this.isPanning) this.setCursor('');
      }
    };
    activeDocument.addEventListener('keydown', this.docKeyDown);
    activeDocument.addEventListener('keyup', this.docKeyUp);

    // Capture-phase listeners: intercept middle-click / space-drag over any child
    // element before its stopPropagation can block panning.
    // The mousedown guard prevents Chrome autoscroll on scrollable/image targets.
    this.outer.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    }, { capture: true });
    this.outer.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
        e.preventDefault(); e.stopPropagation(); this.startPan(e);
      }
    }, { capture: true });

    this.outer.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      const isBackground = target === this.outer || target === this.inner;
      if (!isBackground) return;
      this.closeFab();
      if (this.penModeActive) {
        if (e.button !== 0) return;
        e.preventDefault();
        this.startInkStroke(e);
        return;
      }
      if (this.connectMode) {
        if (this.connectSourceId) {
          this.cardEls.get(this.connectSourceId)?.removeClass('is-connect-source');
          this.connectSourceId = null;
          this.stopConnectSourceGhost();
          return;
        }
        // No card selected as a source yet — drag on open canvas drops a
        // free-floating line instead of connecting two cards.
        if (e.button !== 0) return;
        e.preventDefault();
        this.startFreeLineDrag(e);
        return;
      }
      if (this.selectedConnectionId) this.deselectConnection();
      if (this.selectedDrawingId) this.deselectDrawing();
      if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
        e.preventDefault(); this.startPan(e);
      } else if (e.button === 0 && this.pendingTool) {
        e.preventDefault();
        const rect = this.outer.getBoundingClientRect();
        const cp = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top, this.vp);
        this.placePendingTool(cp.x, cp.y);
      } else if (e.button === 0) {
        this.closeOverflow();
        if (!e.shiftKey) { this.selection.clear(); this.refreshSelectionVisuals(); }
        if (e.pointerType === 'touch') this.maybeStartTouchMarquee(e);
        else this.startMarquee(e);
      }
    });

    // Canvas right-click
    this.outer.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement;
      if (target !== this.outer && target !== this.inner) return;
      e.preventDefault();
      const rect = this.outer.getBoundingClientRect();
      const cp = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top, this.vp);
      const menu = this.newMenu();

      // Grouped with non-clickable label headers (Obsidian's Menu has no
      // public submenu API — see the swatch palette-grid menu for the same
      // pattern) rather than one 14-item flat list.
      menu.addItem(i => i.setTitle('Write').setIsLabel(true));
      menu.addItem(i => i.setTitle('Sticky note').setIcon('sticky-note').onClick(() =>
        this.addStickyAt(this.applySnap(cp.x - STICKY_DEFAULT_W / 2), this.applySnap(cp.y - STICKY_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('To-do list').setIcon('check-square').onClick(() =>
        this.addChecklistAt(this.applySnap(cp.x - CHECKLIST_DEFAULT_W / 2), this.applySnap(cp.y - CHECKLIST_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Comment').setIcon('message-square').onClick(() =>
        this.addCommentAt(this.applySnap(cp.x - COMMENT_DEFAULT_W / 2), this.applySnap(cp.y - COMMENT_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Callout').setIcon('megaphone').onClick(() =>
        this.addCalloutAt(this.applySnap(cp.x - CALLOUT_DEFAULT_W / 2), this.applySnap(cp.y - CALLOUT_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Table').setIcon('table').onClick(() =>
        this.addTableAt(this.applySnap(cp.x - TABLE_DEFAULT_W / 2), this.applySnap(cp.y - TABLE_DEFAULT_H / 2))));

      menu.addSeparator();
      menu.addItem(i => i.setTitle('Media & links').setIsLabel(true));
      menu.addItem(i => i.setTitle('Image').setIcon('image').onClick(() =>
        this.addImageAt(this.applySnap(cp.x - IMAGE_DEFAULT_W / 2), this.applySnap(cp.y - IMAGE_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Audio').setIcon('music').onClick(() =>
        this.addAudioAt(this.applySnap(cp.x - AUDIO_DEFAULT_W / 2), this.applySnap(cp.y - AUDIO_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('File').setIcon('paperclip').onClick(() =>
        this.addFileAt(this.applySnap(cp.x - FILE_DEFAULT_W / 2), this.applySnap(cp.y - FILE_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Bookmark').setIcon('bookmark').onClick(() =>
        this.addBookmarkAt(this.applySnap(cp.x - BOOKMARK_DEFAULT_W / 2), this.applySnap(cp.y - BOOKMARK_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Map').setIcon('map-pin').onClick(() =>
        this.addMapAt(this.applySnap(cp.x - MAP_DEFAULT_W / 2), this.applySnap(cp.y - MAP_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Note link').setIcon('file-text').onClick(() =>
        this.addNoteLinkAt(this.applySnap(cp.x - NOTELINK_DEFAULT_W / 2), this.applySnap(cp.y - NOTELINK_DEFAULT_H / 2))));

      menu.addSeparator();
      menu.addItem(i => i.setTitle('Organize').setIsLabel(true));
      menu.addItem(i => i.setTitle('Tile').setIcon('layout-grid').onClick(() =>
        this.addTileAt(this.applySnap(cp.x - TILE_DEFAULT_W / 2), this.applySnap(cp.y - TILE_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Kanban board').setIcon('columns-3').onClick(() =>
        this.addKanbanBoardAt(this.applySnap(cp.x - (KANBAN_DEFAULT_W * 2 + 12) / 2), this.applySnap(cp.y - KANBAN_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Column').setIcon('rows-3').onClick(() =>
        this.addColumnCardAt(this.applySnap(cp.x - COLUMN_DEFAULT_W / 2), this.applySnap(cp.y - COLUMN_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Group frame').setIcon('frame').onClick(() =>
        this.addGroupAt(this.applySnap(cp.x - GROUP_DEFAULT_W / 2), this.applySnap(cp.y - GROUP_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Swatch').setIcon('pipette').onClick(() =>
        this.addSwatchAt(this.applySnap(cp.x - SWATCH_DEFAULT_W / 2), this.applySnap(cp.y - SWATCH_DEFAULT_H / 2))));
      menu.addItem(i => i.setTitle('Checkers').setIcon('crown').onClick(() =>
        this.addCheckersAt(this.applySnap(cp.x - CHECKERS_DEFAULT_W / 2), this.applySnap(cp.y - CHECKERS_DEFAULT_H / 2))));

      menu.addSeparator();
      menu.addItem(i => i.setTitle('Archived cards…').setIcon('archive').onClick(() => this.openArchiveBrowser()));
      menu.addItem(i => i.setTitle('Reset view').setIcon('maximize').onClick(() => {
        this.vp = { x: 0, y: 0, zoom: 1 }; this.applyViewport(); this.scheduleSave();
      }));
      menu.showAtMouseEvent(e);
    });

    // Clipboard paste
    this.outer.addEventListener('paste', (e) => { void (async () => {
      const active = activeDocument.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
        || (active instanceof HTMLElement && active.getAttribute('contenteditable'))) return;
      e.preventDefault();
      const data = e.clipboardData; if (!data) return;
      // Image?
      for (const item of Array.from(data.items)) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile(); if (f) { await this.handlePastedImage(f); return; }
        }
      }
      // Text?
      const text = data.getData('text/plain').trim(); if (!text) return;
      if (isValidURL(text) && isGoogleMapsUrl(text)) {
        const { x, y } = this.centerPos(MAP_DEFAULT_W, MAP_DEFAULT_H);
        this.createMapCard(x, y, text);
      } else if (isValidURL(text)) {
        const { x, y } = this.centerPos(BOOKMARK_DEFAULT_W, BOOKMARK_DEFAULT_H);
        this.createBookmarkCard(x, y, text);
      } else {
        const { x, y } = this.centerPos(STICKY_DEFAULT_W, STICKY_DEFAULT_H);
        this.addStickyAt(x, y, text);
      }
    })(); });

    // Drag-and-drop from Finder or vault sidebar
    this.outer.addEventListener('dragover', (e) => {
      if (this.isDropAccepted(e)) { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; }
    });
    this.outer.addEventListener('drop', (e) => { void (async () => {
      e.preventDefault();

      // A grid-mode board's tile, dragged in from another pane (see
      // GridRenderer.renderTile) — recreate it here as an equivalent Tile
      // card, same icon/color/label/thumbnail/target, rather than treating
      // it like a generic external file drop.
      const tileData = e.dataTransfer?.getData(TILE_DRAG_MIME);
      if (tileData) {
        let payload: DraggedTilePayload;
        try { payload = JSON.parse(tileData); } catch { return; }
        const rect = this.outer.getBoundingClientRect();
        const cp = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top, this.vp);
        const card: TileCard = {
          id: crypto.randomUUID(), kind: 'tile',
          x: this.applySnap(cp.x - TILE_DEFAULT_W / 2), y: this.applySnap(cp.y - TILE_DEFAULT_H / 2),
          w: TILE_DEFAULT_W, h: TILE_DEFAULT_H, z: this.nextZ(),
          label: payload.label, subtitle: payload.subtitle, icon: payload.icon,
          color: payload.color, thumbnail: payload.thumbnail, target: payload.target,
        };
        this.pushUndo(); this.board.cards.push(card); await this.saveNow();
        this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
        return;
      }

      const files = e.dataTransfer?.files;
      if (files?.length) {
        const rect = this.outer.getBoundingClientRect();
        let offsetX = 0;
        for (const f of Array.from(files)) {
          if (f.type.startsWith('image/')) {
            const cp = screenToCanvas(e.clientX - rect.left + offsetX, e.clientY - rect.top, this.vp);
            await this.handleDroppedImage(f, this.applySnap(cp.x - IMAGE_DEFAULT_W / 2), this.applySnap(cp.y - IMAGE_DEFAULT_H / 2));
            offsetX += IMAGE_DEFAULT_W + 16;
          } else if (f.type.startsWith('audio/')) {
            const cp = screenToCanvas(e.clientX - rect.left + offsetX, e.clientY - rect.top, this.vp);
            await this.handleDroppedAudio(f, this.applySnap(cp.x - AUDIO_DEFAULT_W / 2), this.applySnap(cp.y - AUDIO_DEFAULT_H / 2));
            offsetX += AUDIO_DEFAULT_W + 16;
          } else {
            // Anything else from the OS becomes a generic file card,
            // saved into _Assets/ like every other imported binary.
            const cp = screenToCanvas(e.clientX - rect.left + offsetX, e.clientY - rect.top, this.vp);
            let path: string;
            try { path = await saveNewAsset(this.app, await f.arrayBuffer(), f.name); }
            catch { new Notice(`Failed to save ${f.name}.`); continue; }
            const isPdf = path.toLowerCase().endsWith('.pdf');
            const card: FileCard = {
              id: crypto.randomUUID(), kind: 'file',
              x: this.applySnap(cp.x - FILE_DEFAULT_W / 2), y: this.applySnap(cp.y - FILE_DEFAULT_H / 2),
              w: FILE_DEFAULT_W, h: isPdf ? FILE_DEFAULT_H : 150, z: this.nextZ(), path,
            };
            this.pushUndo(); this.board.cards.push(card); await this.saveNow();
            this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
            offsetX += FILE_DEFAULT_W + 16;
          }
        }
        return;
      }
      // Vault sidebar file drag
      const dragMgr = (this.app as AppWithPrivateAPIs).dragManager;
      const draggable = dragMgr?.draggable;
      if (draggable?.type === 'file' && draggable.file instanceof TFile) {
        const vf = draggable.file;
        const ext = vf.extension.toLowerCase();
        const rect = this.outer.getBoundingClientRect();
        const cp = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top, this.vp);
        if (IMAGE_EXTS.includes(ext)) {
          const newPath = await sortAssetFile(this.app, vf);
          const newFile = this.app.vault.getAbstractFileByPath(newPath);
          if (!(newFile instanceof TFile)) return;
          const h = await this.measureImageH(this.app.vault.getResourcePath(newFile));
          const card: ImageCard = {
            id: crypto.randomUUID(), kind: 'image',
            x: this.applySnap(cp.x - IMAGE_DEFAULT_W / 2), y: this.applySnap(cp.y - h / 2),
            w: IMAGE_DEFAULT_W, h, z: this.nextZ(),
            source: { type: 'vault', path: newPath }, captionHidden: true,
          };
          this.pushUndo(); this.board.cards.push(card); await this.saveNow();
          this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
        } else if (AUDIO_EXTS.includes(ext)) {
          const newPath = await sortAssetFile(this.app, vf);
          const card: AudioCard = {
            id: crypto.randomUUID(), kind: 'audio',
            x: this.applySnap(cp.x - AUDIO_DEFAULT_W / 2), y: this.applySnap(cp.y - AUDIO_DEFAULT_H / 2),
            w: AUDIO_DEFAULT_W, h: AUDIO_DEFAULT_H, z: this.nextZ(),
            source: { type: 'vault', path: newPath },
          };
          this.pushUndo(); this.board.cards.push(card); await this.saveNow();
          this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
        } else if (ext === 'canvas' || ext === 'md') {
          // Note / canvas link, dropped the same way native Canvas turns a
          // dragged file into a file node — here it becomes a tile that
          // navigates to (or opens) the dropped file. A dropped .canvas
          // file that's itself a Visual Notes board becomes a "nested
          // board" tile (kind 'board'); a plain native canvas becomes a
          // "canvas" tile (kind 'canvas') that just opens it directly.
          const isBoard = ext === 'canvas' && await isVisualNotesOwnedFile(this.app, vf);
          const targetKind: TileTarget['kind'] = ext === 'md' ? 'note' : (isBoard ? 'board' : 'canvas');
          const card: TileCard = {
            id: crypto.randomUUID(), kind: 'tile',
            x: this.applySnap(cp.x - TILE_DEFAULT_W / 2), y: this.applySnap(cp.y - TILE_DEFAULT_H / 2),
            w: TILE_DEFAULT_W, h: TILE_DEFAULT_H, z: this.nextZ(),
            label: vf.basename,
            icon: targetKind === 'board' ? 'layout-dashboard' : ext === 'md' ? 'file-text' : 'layout-grid',
            color: '#3B82F6',
            target: { kind: targetKind, path: vf.path },
          };
          this.pushUndo(); this.board.cards.push(card); await this.saveNow();
          this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
        } else {
          // Any other vault file (PDF, zip, spreadsheet, …) → generic file card.
          const newPath = await sortAssetFile(this.app, vf);
          const isPdf = ext === 'pdf';
          const card: FileCard = {
            id: crypto.randomUUID(), kind: 'file',
            x: this.applySnap(cp.x - FILE_DEFAULT_W / 2), y: this.applySnap(cp.y - FILE_DEFAULT_H / 2),
            w: FILE_DEFAULT_W, h: isPdf ? FILE_DEFAULT_H : 150, z: this.nextZ(), path: newPath,
          };
          this.pushUndo(); this.board.cards.push(card); await this.saveNow();
          this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
        }
      } else if (draggable?.type === 'folder' && draggable.file instanceof TFolder) {
        const folder = draggable.file;
        const rect = this.outer.getBoundingClientRect();
        const cp = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top, this.vp);
        const card: TileCard = {
          id: crypto.randomUUID(), kind: 'tile',
          x: this.applySnap(cp.x - TILE_DEFAULT_W / 2), y: this.applySnap(cp.y - TILE_DEFAULT_H / 2),
          w: TILE_DEFAULT_W, h: TILE_DEFAULT_H, z: this.nextZ(),
          label: folder.name || folder.path,
          icon: 'folder', color: '#3B82F6',
          target: { kind: 'folder', path: folder.path },
        };
        this.pushUndo(); this.board.cards.push(card); await this.saveNow();
        this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
      }
    })(); });
  },

  startPan(this: FreeformRenderer, e: PointerEvent): void {
    this.isPanning = true; this.setCursor('grabbing');
    const sx = e.clientX, sy = e.clientY, svx = this.vp.x, svy = this.vp.y;
    const pid = e.pointerId;
    // Use window capture-phase listeners so autoscroll or child stopPropagation
    // can't block move/up events (e.g. middle-click over <img> or scrollable kanban).
    const onMove = (me: PointerEvent) => {
      if (me.pointerId !== pid) return;
      this.vp = { ...this.vp, x: svx + (me.clientX - sx), y: svy + (me.clientY - sy) };
      this.applyViewport();
    };
    const onUp = (ue: PointerEvent) => {
      if (ue.pointerId !== pid) return;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      this.isPanning = false; this.setCursor(this.spaceDown ? 'grab' : ''); this.scheduleSave();
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  },

  cancelLongPress(this: FreeformRenderer): void {
    if (this.longPressTimer !== null) { window.clearTimeout(this.longPressTimer); this.longPressTimer = null; }
    this.longPressTarget?.removeClass('ib-longpress-active');
    this.longPressTarget = null;
    this.longPressPointerId = null;
  },

  maybeStartTouchMarquee(this: FreeformRenderer, e: PointerEvent): void {
    const pointerId = e.pointerId;
    let released = false;
    const onEarlyUp = (ue: PointerEvent) => { if (ue.pointerId === pointerId) released = true; };
    this.outer.addEventListener('pointerup', onEarlyUp, { once: true });
    this.outer.addEventListener('pointercancel', onEarlyUp, { once: true });
    window.setTimeout(() => {
      this.outer.removeEventListener('pointerup', onEarlyUp);
      this.outer.removeEventListener('pointercancel', onEarlyUp);
      if (released || this.activeTouches >= 2) return;
      this.startMarquee(e);
    }, 60);
  },

  startMarquee(this: FreeformRenderer, e: PointerEvent): void {
    const rect = this.outer.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    this.marqueeEl.style.left = `${sx}px`;
    this.marqueeEl.style.top = `${sy}px`;
    this.marqueeEl.setCssProps({ '--ib-marquee-w': '0px', '--ib-marquee-h': '0px' });
    this.marqueeEl.show();
    this.outer.setPointerCapture(e.pointerId);
    const onMove = (e: PointerEvent) => {
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      this.marqueeEl.style.left = `${Math.min(sx, cx)}px`;
      this.marqueeEl.style.top  = `${Math.min(sy, cy)}px`;
      this.marqueeEl.setCssProps({ '--ib-marquee-w': `${Math.abs(cx - sx)}px`, '--ib-marquee-h': `${Math.abs(cy - sy)}px` });
    };
    const onUp = (e: PointerEvent) => {
      this.outer.removeEventListener('pointermove', onMove); this.outer.removeEventListener('pointerup', onUp);
      this.cancelActiveMarquee = null;
      this.marqueeEl.hide();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const mL = Math.min(sx, cx), mT = Math.min(sy, cy), mR = Math.max(sx, cx), mB = Math.max(sy, cy);
      if (mR - mL < 4 && mB - mT < 4) return;
      for (const [id, el] of this.cardEls) {
        const er = el.getBoundingClientRect();
        const eL = er.left - rect.left, eT = er.top - rect.top;
        if (eL < mR && eL + er.width > mL && eT < mB && eT + er.height > mT) this.selection.add(id);
      }
      // Arrows caught in the box get marked for deletion alongside whatever
      // cards were selected — otherwise deleting a marquee-selected section
      // left every connection through it dangling on screen.
      for (const [id, path] of this.connectionPaths) {
        const pr = path.getBoundingClientRect();
        const pL = pr.left - rect.left, pT = pr.top - rect.top;
        if (pL < mR && pL + pr.width > mL && pT < mB && pT + pr.height > mT) {
          this.marqueeConnectionIds.add(id);
          path.addClass('is-marquee-selected');
        }
      }
      this.refreshSelectionVisuals(true);
    };
    this.outer.addEventListener('pointermove', onMove); this.outer.addEventListener('pointerup', onUp);
    // Lets a second finger landing mid-drag (touchstart handler above)
    // abort this marquee instead of leaving it stuck fighting the pinch
    // transform for the rest of the gesture.
    this.cancelActiveMarquee = () => {
      this.outer.removeEventListener('pointermove', onMove); this.outer.removeEventListener('pointerup', onUp);
      this.cancelActiveMarquee = null;
      this.marqueeEl.hide();
    };
  },

  clearMarqueeConnections(this: FreeformRenderer): void {
    for (const id of this.marqueeConnectionIds) this.connectionPaths.get(id)?.removeClass('is-marquee-selected');
    this.marqueeConnectionIds.clear();
  },

  refreshSelectionVisuals(this: FreeformRenderer, keepMarqueeConnections = false): void {
    if (!keepMarqueeConnections) this.clearMarqueeConnections();
    for (const [id, el] of this.cardEls) el.toggleClass('is-selected', this.selection.has(id));
    this.alignBarEl?.toggleClass('is-visible', this.selection.getIds().length > 1);

    const ids = this.selection.getIds();
    if (ids.length === 1) {
      const card = this.board.cards.find(c => c.id === ids[0]);
      if (card) this.contextBar?.show(card as SupportedCard);
      else this.contextBar?.hide();
    } else {
      this.contextBar?.hide();
    }
  },

  // Single delegated listener set on the canvas content container instead
  // of one pointerdown/dblclick/contextmenu (+ 4 resize-handle pointerdowns)
  // per card — with hundreds of cards that's thousands of idle listeners.
  // Resolving the card via closest()/dataset on each event keeps identical
  // behavior at a fraction of the standing listener count, and as a side
  // effect no longer needs rebinding after an in-place re-render (event
  // delegation covers new DOM automatically) — see the many now-removed
  // "renderCardContent(...); bindCardEvents(...)" call-site pairs.
  bindDelegatedCardEvents(this: FreeformRenderer): void {
    this.inner.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;

      // Resize handles take priority over everything below — even pen mode
      // (matches the old per-handle listener, which stopped propagation
      // before a card's own pointerdown handler, incl. its pen-mode check,
      // ever ran).
      const handle = target.closest<HTMLElement>('.visual-notes-card-resize-handle');
      if (handle) {
        const handleCardEl = handle.closest<HTMLElement>('.visual-notes-freeform-card');
        const handleCard = handleCardEl && this.board.cards.find(c => c.id === handleCardEl.dataset.id);
        if (handleCardEl && handleCard) this.startCardResize(e, handle, handleCardEl, handleCard);
        return;
      }
      // Connection handles stop propagation in their own listener before
      // this ever runs — kept as a defensive no-op for parity.
      if (target.classList.contains('visual-notes-connection-handle')) return;

      const el = target.closest<HTMLElement>('.visual-notes-freeform-card');
      if (!el) return; // not a card — let the background canvas handlers process it
      const card = this.board.cards.find(c => c.id === el.dataset.id);
      if (!card) return;

      // While drawing, a click on a card should never select/drag/edit it —
      // draw right over it instead. Stopping propagation keeps the canvas's
      // own background pointerdown handler from also trying to act on it.
      if (this.penModeActive) {
        if (e.button !== 0) return;
        e.stopPropagation(); e.preventDefault();
        this.startInkStroke(e);
        return;
      }
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
      if (target.closest('[contenteditable="true"]')) return;
      if (target.closest('a')) return;
      if (e.button !== 0) return;

      let dragMoved = false;

      if (this.connectMode) {
        e.stopPropagation(); e.preventDefault();
        if (!this.connectSourceId) {
          this.connectSourceId = card.id;
          el.addClass('is-connect-source');
          this.startConnectSourceGhost(card.id);
        } else if (this.connectSourceId !== card.id) {
          const fromId = this.connectSourceId;
          this.exitConnectMode();
          this.finishConnection(fromId, card.id);
        }
        return;
      }

      // Skip preventDefault on kanban titles so dblclick rename still fires (drag still works via capture)
      const isKanbanTitle = (card.kind === 'kanban-column' || card.kind === 'kanban-board')
        && !!target.closest('.visual-notes-kanban-title, .visual-notes-kanban-board-title');
      e.stopPropagation();
      if (!isKanbanTitle) e.preventDefault();

      if (this.selectedConnectionId) this.deselectConnection();

      // Legacy single-column kanban: body area never drags the card — only
      // the column header does, so clicking around the items list can't
      // accidentally move it. Multi-column boards drag from anywhere that
      // isn't an interactive child (items stop their own pointerdown, and
      // drag only engages past the movement threshold, so header buttons
      // still click fine).
      const isKanbanColumnBody = card.kind === 'kanban-column' && !target.closest('.visual-notes-kanban-header');
      if (isKanbanColumnBody) {
        if (e.shiftKey) { this.selection.toggle(card.id); this.refreshSelectionVisuals(); }
        else if (!this.selection.has(card.id)) { this.selection.select(card.id); this.refreshSelectionVisuals(); }
        return;
      }

      if (e.shiftKey) { this.selection.toggle(card.id); this.refreshSelectionVisuals(); return; }
      if (!this.selection.has(card.id)) { this.selection.select(card.id); this.refreshSelectionVisuals(); }

      dragMoved = false;
      const sc = { x: e.clientX, y: e.clientY };
      const startPos = new Map<string, { x: number; y: number }>();
      // Snapshotted once here instead of `board.cards.find()` per selected
      // card on every pointermove frame during the drag.
      const dragCardsById = new Map<string, SupportedCard>();
      const captureId = e.pointerId;
      for (const id of this.selection.getIds()) {
        const c = this.board.cards.find(c => c.id === id);
        if (c) { startPos.set(id, { x: c.x ?? 0, y: c.y ?? 0 }); dragCardsById.set(id, c); }
      }
      // Dragging a lone group frame carries along everything geometrically
      // inside it, native-Canvas-style — not just the frame itself.
      if (card.kind === 'group' && this.selection.getIds().length === 1) {
        for (const id of this.cardsContainedInGroup(card)) {
          if (startPos.has(id)) continue;
          const c = this.board.cards.find(c => c.id === id);
          if (c) { startPos.set(id, { x: c.x ?? 0, y: c.y ?? 0 }); dragCardsById.set(id, c); }
        }
      }

      let hoveredCardId: string | null = null;
      let hoveredKind: 'kanban' | 'column' | null = null;

      // Candidate kanban/column drop targets are snapshotted once here
      // (id, kind, and its rect) instead of re-scanning every card on the
      // board and re-measuring every candidate's getBoundingClientRect() on
      // every pointermove frame. Safe because this absorb-into-container
      // logic only ever runs when exactly one card is selected/dragged
      // (`startPos.size === 1` below), so no candidate container is itself
      // moving mid-drag and its rect can't go stale.
      const isKanbanEligible = card.kind === 'image' || card.kind === 'audio' || card.kind === 'sticky';
      const isColumnEligible = isColumnChildKind(card.kind);
      const dropCandidates: { id: string; kind: 'kanban' | 'column'; rect: DOMRect }[] = [];
      if ((isKanbanEligible || isColumnEligible) && startPos.size === 1) {
        for (const kc of this.board.cards) {
          const isKanbanContainer = kc.kind === 'kanban-column' || kc.kind === 'kanban-board';
          const isColumnContainer = kc.kind === 'column';
          if (!(isKanbanEligible && isKanbanContainer) && !(isColumnEligible && isColumnContainer)) continue;
          if ((kc as KanbanColumnCard | KanbanBoardCard | ColumnCard).locked) continue; // padlocked: not a drop target
          const kEl = this.cardEls.get(kc.id);
          if (!kEl) continue;
          dropCandidates.push({ id: kc.id, kind: isKanbanContainer ? 'kanban' : 'column', rect: kEl.getBoundingClientRect() });
        }
      }

      // ── Lift / tilt / settle animation state ──
      // Velocity is exponentially smoothed and mapped to a small rotation
      // + counter-drift, so the card "leans back" against the direction of
      // motion with a bit of lag — the Milanote hover-with-weight feel.
      // Driven by a rAF loop (not per-pointermove) so the tilt keeps
      // easing back to rest even when the pointer pauses mid-drag.
      let tiltVX = 0, tiltVY = 0;
      let lastMoveX = e.clientX, lastMoveY = e.clientY, lastMoveT = performance.now();
      let tiltRafId = 0;
      const draggedEls: HTMLElement[] = [];
      const intensity = this.cardDragAnimationIntensity;
      const tiltLoop = () => {
        // Ease velocity back toward zero continuously
        tiltVX *= 0.88; tiltVY *= 0.88;
        const rot = Math.max(-7 * intensity, Math.min(7 * intensity, tiltVX * 0.012 * intensity));
        const liftScale = 1 + 0.03 * intensity;
        for (const cel of draggedEls) {
          cel.style.transform = `scale(${liftScale}) rotate(${rot.toFixed(2)}deg) translate(${(-tiltVX * 0.006 * intensity).toFixed(2)}px, ${(-tiltVY * 0.006 * intensity).toFixed(2)}px)`;
        }
        tiltRafId = requestAnimationFrame(tiltLoop);
      };
      const startLift = () => {
        if (!this.cardDragAnimationEnabled) return;
        for (const id of startPos.keys()) {
          const cel = this.cardEls.get(id);
          if (cel) { cel.addClass('is-lifted'); draggedEls.push(cel); }
        }
        tiltRafId = requestAnimationFrame(tiltLoop);
      };
      const endLift = (settled: boolean) => {
        if (!this.cardDragAnimationEnabled) return;
        cancelAnimationFrame(tiltRafId);
        for (const cel of draggedEls) {
          cel.removeClass('is-lifted');
          cel.style.transform = '';
          if (settled) {
            cel.addClass('is-settling');
            window.setTimeout(() => cel.removeClass('is-settling'), 260);
          }
        }
      };

      // The per-move work below (position writes, connection path rebuilds
      // for every dragged card, trash/drop-target hit-testing) involves
      // getBoundingClientRect() reads right after style writes — doing it
      // once per raw pointermove forces a synchronous layout flush on every
      // event, which on a high-polling-rate input fires far more often than
      // the screen can even repaint. Coalesce into a single rAF flush per
      // frame: onMove just records the latest position; flushMoveFrame does
      // the actual (expensive) work using whatever the latest position was
      // by the time the frame is ready to paint.
      let latestX = sc.x, latestY = sc.y;
      let moveFrameId = 0;
      let moveFramePending = false;
      const flushMoveFrame = () => {
        moveFramePending = false;
        const dx = latestX - sc.x, dy = latestY - sc.y;
        // Snap the anchor card (the one under the pointer) to the grid, then
        // move every other selected card by that same snapped delta —
        // snapping each card's absolute position independently would drift
        // a multi-card selection out of its original relative layout.
        const anchorStart = startPos.get(card.id);
        const moveDx = anchorStart ? this.applySnap(anchorStart.x + dx / this.vp.zoom) - anchorStart.x : dx / this.vp.zoom;
        const moveDy = anchorStart ? this.applySnap(anchorStart.y + dy / this.vp.zoom) - anchorStart.y : dy / this.vp.zoom;
        for (const [id, start] of startPos) {
          const c = dragCardsById.get(id); const cel = this.cardEls.get(id);
          if (!c || !cel) continue;
          c.x = start.x + moveDx; c.y = start.y + moveDy;
          cel.style.left = `${c.x}px`; cel.style.top = `${c.y}px`;
          this.updateConnectionsForCard(id);
        }
        this.setTrashHover(latestX, latestY);
        if (dropCandidates.length) {
          const elRect = el.getBoundingClientRect();
          let foundId: string | null = null;
          let foundKind: 'kanban' | 'column' | null = null;
          for (const dc of dropCandidates) {
            if (elRect.left < dc.rect.right && elRect.right > dc.rect.left && elRect.top < dc.rect.bottom && elRect.bottom > dc.rect.top) {
              foundId = dc.id; foundKind = dc.kind; break;
            }
          }
          if (foundId !== hoveredCardId) {
            if (hoveredCardId) this.cardEls.get(hoveredCardId)?.removeClass('is-kanban-drop-target');
            hoveredCardId = foundId; hoveredKind = foundKind;
            if (foundId) this.cardEls.get(foundId)?.addClass('is-kanban-drop-target');
          }
        }
      };

      const onMove = (e: PointerEvent) => {
        const dx = e.clientX - sc.x, dy = e.clientY - sc.y;
        if (!dragMoved) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          dragMoved = true; this.pushUndo();
          el.setPointerCapture(captureId);
          startLift();
        }
        // Update smoothed velocity from instantaneous pointer speed — kept
        // per-event (cheap, no layout access) rather than batched below.
        const now = performance.now();
        const dt = Math.max(1, now - lastMoveT);
        const ivx = (e.clientX - lastMoveX) / dt * 100;
        const ivy = (e.clientY - lastMoveY) / dt * 100;
        tiltVX = tiltVX * 0.7 + ivx * 0.3;
        tiltVY = tiltVY * 0.7 + ivy * 0.3;
        lastMoveX = e.clientX; lastMoveY = e.clientY; lastMoveT = now;

        latestX = e.clientX; latestY = e.clientY;
        if (!moveFramePending) {
          moveFramePending = true;
          moveFrameId = requestAnimationFrame(flushMoveFrame);
        }
      };
      const onUp = (ue: PointerEvent) => {
        el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp);
        if (moveFramePending) { cancelAnimationFrame(moveFrameId); latestX = ue.clientX; latestY = ue.clientY; flushMoveFrame(); }
        if (hoveredCardId) this.cardEls.get(hoveredCardId)?.removeClass('is-kanban-drop-target');
        this.clearTrashHover();
        const trashing = dragMoved && this.isOverTrash(ue.clientX, ue.clientY);
        // No settle animation when the card is about to be absorbed into a
        // kanban/column container or dropped on the trash — its element gets
        // removed immediately, so animating it would just flash. Settle only
        // on a normal canvas drop.
        const absorbing = !!(dragMoved && hoveredCardId) || trashing;
        endLift(dragMoved && !absorbing);
        if (trashing) {
          // pushUndo already ran when the drag crossed its threshold, so a
          // single undo restores the cards at their pre-drag positions.
          for (const id of startPos.keys()) {
            this.board.cards = this.board.cards.filter(c => c.id !== id);
            this.cardEls.get(id)?.remove(); this.cardEls.delete(id);
            this.disposeCardResources(id);
            this.board.connections = this.board.connections.filter(
              c => c.fromCardId !== id && c.toCardId !== id
            );
          }
          this.selection.clear();
          this.refreshSelectionVisuals();
          this.refreshAllConnections();
          this.scheduleSave();
          return;
        }
        if (dragMoved && hoveredCardId && hoveredKind === 'kanban' && (card.kind === 'image' || card.kind === 'audio' || card.kind === 'sticky')) {
          const targetEl = this.cardEls.get(hoveredCardId);
          const elRect = el.getBoundingClientRect();
          // A legacy single-column card has exactly one items list; a board
          // has one per column — pick whichever column's items list is
          // horizontally closest to where the dropped card ended up.
          const itemsEls = targetEl ? Array.from(targetEl.querySelectorAll<HTMLElement>('.visual-notes-kanban-items')) : [];
          const cx = (elRect.left + elRect.right) / 2;
          let bestItemsEl: HTMLElement | null = null; let bestDist = Infinity;
          for (const ie of itemsEls) {
            const ir = ie.getBoundingClientRect();
            const d = Math.abs((ir.left + ir.right) / 2 - cx);
            if (d < bestDist) { bestDist = d; bestItemsEl = ie; }
          }
          const owner = bestItemsEl ? this.resolveKanbanItemsOwner(bestItemsEl) : null;
          // Sticky notes carry the inverse of kanbanItemToStickyText's
          // markdown so a previously-extracted item round-trips back into
          // its structured fields; image/audio cards keep their prior
          // one-field mapping.
          let item: KanbanItem | null = null;
          if (card.kind === 'sticky') {
            item = this.stickyTextToKanbanItem(card);
          } else if (card.source.type === 'vault') {
            const path = card.source.path;
            item = card.kind === 'image'
              ? { id: crypto.randomUUID(), text: '', imagePath: path }
              : { id: crypto.randomUUID(), text: '', audioPath: path };
          }
          if (owner && bestItemsEl && item) {
            owner.setItems([...owner.getItems(), item]);
            this.appendKanbanItem(bestItemsEl, owner, item);
            owner.updateCount();
            this.board.cards = this.board.cards.filter(c => c.id !== card.id);
            el.remove(); this.cardEls.delete(card.id);
            this.refreshSelectionVisuals();
          }
          this.scheduleSave();
          return;
        }
        if (dragMoved && hoveredCardId && hoveredKind === 'column' && isColumnChildKind(card.kind)) {
          const targetColumn = this.board.cards.find(c => c.id === hoveredCardId && c.kind === 'column') as ColumnCard | undefined;
          if (targetColumn) {
            this.board.cards = this.board.cards.filter(c => c.id !== card.id);
            targetColumn.children.push(card as unknown as ColumnChildCard);
            this.rebuildKanbanCard(targetColumn);
            el.remove(); this.cardEls.delete(card.id);
            this.disposeCardResources(card.id);
            this.refreshSelectionVisuals();
          }
          this.scheduleSave();
          return;
        }
        if (dragMoved) this.scheduleSave();
      };
      el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp);
    });

    this.inner.addEventListener('dblclick', (e) => { void (async () => {
      if (this.penModeActive) return;
      const target = e.target as HTMLElement;
      const el = target.closest<HTMLElement>('.visual-notes-freeform-card');
      if (!el) return;
      const card = this.board.cards.find(c => c.id === el.dataset.id);
      if (!card) return;
      e.stopPropagation();
      switch (card.kind) {
        case 'tile':      await this.activateTile(card); break;
        case 'sticky':    this.editStickyInline(el, card); break;
        case 'note-link': await this.activateNoteLink(card); break;
        case 'image':
          if (target.closest('.visual-notes-image-caption-wrap')) break;
          this.openImageSource(card); break;
        case 'bookmark':
          // YouTube cards are live iframes now — they handle play/pause/
          // fullscreen themselves. Only non-YouTube bookmarks open externally.
          if (!parseYouTubeId(card.url)) window.open(card.url, '_blank');
          break;
        case 'swatch':
          el.querySelector<HTMLInputElement>('.visual-notes-swatch-color-input')?.click();
          break;
        case 'file':
          await this.openFileCard(card);
          break;
        case 'callout':
          this.editCalloutInline(el, card);
          break;
      }
    })(); });

    this.inner.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement;
      const el = target.closest<HTMLElement>('.visual-notes-freeform-card');
      if (!el) return;
      const card = this.board.cards.find(c => c.id === el.dataset.id);
      if (!card) return;
      e.preventDefault(); e.stopPropagation();
      if (!this.selection.has(card.id)) { this.selection.select(card.id); this.refreshSelectionVisuals(); }
      const menu = this.newMenu();
      this.populateCardMenu(menu, el, card);
      menu.showAtMouseEvent(e);
    });
  },

  appendResizeHandles(this: FreeformRenderer, el: HTMLElement): void {
    for (const corner of ['nw', 'ne', 'sw', 'se'] as const)
      el.createDiv(`visual-notes-card-resize-handle visual-notes-card-resize-handle--${corner}`);
  },

  startCardResize(this: FreeformRenderer, e: PointerEvent, handle: HTMLElement, el: HTMLElement, card: SupportedCard): void {
    const corner = (['nw','ne','sw','se'] as const).find(c => handle.classList.contains(`visual-notes-card-resize-handle--${c}`)) ?? 'se';

    e.stopPropagation(); e.preventDefault(); this.pushUndo();
    const sc = { x: e.clientX, y: e.clientY };
    const startX = card.x ?? 0, startY = card.y ?? 0;
    const startW = card.w ?? TILE_DEFAULT_W, startH = card.h ?? TILE_DEFAULT_H;
    const { w: minW, h: minH } = cardMinSize(card.kind);
    el.setPointerCapture(e.pointerId);

    let imgAspect: number | null = null;
    if (card.kind === 'image') {
      const imgEl = el.querySelector<HTMLImageElement>('.visual-notes-image-img');
      imgAspect = (imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0)
        ? imgEl.naturalHeight / imgEl.naturalWidth
        : startH / startW;
    } else if (card.kind === 'bookmark' && parseYouTubeId(card.url) && !card.youtubeHeaderShown) {
      // Headerless YouTube embed is a bare video — keep it 16:9 while
      // resizing. With the header strip shown the extra height makes a
      // fixed ratio feel wrong, so resize stays free in that case.
      imgAspect = 9 / 16;
    }

    // Same rAF-coalescing as card drag above: the resize math + style
    // writes + connection path rebuild only need to happen once per painted
    // frame, not once per raw pointermove.
    let latestEv = e;
    let moveFrameId = 0;
    let moveFramePending = false;
    const applyResize = (ev: PointerEvent) => {
      const cdx = (ev.clientX - sc.x) / this.vp.zoom;
      const cdy = (ev.clientY - sc.y) / this.vp.zoom;
      const wSign = (corner === 'se' || corner === 'ne') ? 1 : -1;
      const hSign = (corner === 'se' || corner === 'sw') ? 1 : -1;
      const newW = Math.max(minW, this.applySnap(startW + wSign * cdx));

      if (card.kind === 'sticky' && !card.blank) {
        card.w = newW;
        if (corner === 'sw' || corner === 'nw') card.x = this.applySnap(startX + startW - newW);
        el.style.width = `${card.w}px`;
        el.style.left = `${card.x ?? startX}px`;
      } else if (imgAspect !== null) {
        card.w = newW;
        card.h = Math.max(minH, snap(newW * imgAspect));
        if (corner === 'sw' || corner === 'nw') card.x = this.applySnap(startX + startW - card.w);
        if (corner === 'nw' || corner === 'ne') card.y = this.applySnap(startY + startH - card.h);
        el.style.width = `${card.w}px`; el.style.height = `${card.h}px`;
        el.style.left = `${card.x ?? startX}px`; el.style.top = `${card.y ?? startY}px`;
      } else {
        card.w = newW;
        card.h = Math.max(minH, this.applySnap(startH + hSign * cdy));
        if (corner === 'sw' || corner === 'nw') card.x = this.applySnap(startX + startW - card.w);
        if (corner === 'nw' || corner === 'ne') card.y = this.applySnap(startY + startH - card.h);
        el.style.width = `${card.w}px`; el.style.height = `${card.h}px`;
        el.style.left = `${card.x ?? startX}px`; el.style.top = `${card.y ?? startY}px`;
      }

      if (card.kind === 'tile') {
        const tileSize = Math.max(40, Math.min((card.w ?? minW) - 20, (card.h ?? minH) - 50 - 16));
        const sq = el.querySelector<HTMLElement>('.visual-notes-freeform-tile-square');
        const ic = el.querySelector<HTMLElement>('.visual-notes-tile-icon');
        if (sq) { sq.style.width = `${tileSize}px`; sq.style.height = `${tileSize}px`; sq.style.borderRadius = `${Math.round(tileSize * 0.2)}px`; }
        if (ic) {
          const is = Math.round(tileSize * 0.55);
          ic.style.width = `${is}px`; ic.style.height = `${is}px`;
          if (ic.classList.contains('visual-notes-tile-emoji')) ic.style.fontSize = `${Math.round(is * 0.9)}px`;
        }
      }
      this.updateConnectionsForCard(card.id);
    };
    const onMove = (ev: PointerEvent) => {
      latestEv = ev;
      if (moveFramePending) return;
      moveFramePending = true;
      moveFrameId = requestAnimationFrame(() => { moveFramePending = false; applyResize(latestEv); });
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp);
      if (moveFramePending) { cancelAnimationFrame(moveFrameId); moveFramePending = false; applyResize(latestEv); }
      this.renderCardContent(el, card);
      this.updateConnectionsForCard(card.id);
      this.scheduleSave();
    };
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp);
  },

  onKeyDown(this: FreeformRenderer, e: KeyboardEvent): void {
    // Checked before the isTyping guard below, and unconditionally: an
    // accidental click on a card while drawing can leave some input or
    // contenteditable element focused (e.g. entering a sticky's inline
    // editor), which used to make isTyping swallow Escape/Enter before they
    // ever reached the pen-mode check — leaving the user stuck in pen mode
    // with no apparent way out. Exiting pen mode always wins over whatever
    // else happens to have focus.
    if (this.penModeActive && (e.key === 'Escape' || e.key === 'Enter')) {
      e.preventDefault(); this.exitPenMode(); return;
    }

    const active = activeDocument.activeElement;
    const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      || (active instanceof HTMLElement && active.getAttribute('contenteditable') != null);
    if (isTyping) return;

    const meta = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (this.pendingTool) { this.clearPendingTool(); return; }
      if (this.overflowPopover) { this.closeOverflow(); return; }
      if (this.connectMode) { this.exitConnectMode(); return; }
      if (this.selectedConnectionId) { this.deselectConnection(); return; }
      if (this.selectedDrawingId) { this.deselectDrawing(); return; }
      this.selection.clear(); this.refreshSelectionVisuals(); return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!this.selection.isEmpty() || this.marqueeConnectionIds.size > 0) { e.preventDefault(); this.deleteSelected(); return; }
      if (this.selectedConnectionId) { e.preventDefault(); this.deleteSelectedConnection(); return; }
      if (this.selectedDrawingId) { e.preventDefault(); this.deleteSelectedDrawing(); return; }
    }
    if (meta && e.key === 'a') { e.preventDefault(); for (const c of this.board.cards) this.selection.add(c.id); this.refreshSelectionVisuals(); return; }
    if (meta && e.key === 'd') { e.preventDefault(); this.duplicateSelected(); return; }
    if (meta && e.key === 'g' && this.selection.getIds().length > 0) { e.preventDefault(); this.groupSelected(); return; }
    if (meta && !e.shiftKey && e.key === 'z') { e.preventDefault(); this.undo(); return; }
    if ((meta && e.shiftKey && e.key === 'z') || (meta && e.key === 'y')) { e.preventDefault(); this.redo(); return; }
    if (meta && e.shiftKey && e.key.toLowerCase() === 'c') {
      const imageCards = this.selection.getIds()
        .map(id => this.board.cards.find(c => c.id === id))
        .filter((c): c is ImageCard => !!c && c.kind === 'image');
      if (imageCards.length > 0) {
        e.preventDefault();
        this.pushUndo();
        for (const card of imageCards) {
          card.captionHidden = !card.captionHidden;
          const cardEl = this.cardEls.get(card.id);
          if (cardEl) {
            const wrap = cardEl.querySelector<HTMLElement>('.visual-notes-image-caption-wrap');
            if (wrap) wrap.toggleClass('is-hidden', !!card.captionHidden);
          }
        }
        this.scheduleSave();
        return;
      }
    }
  },

  async activateTile(this: FreeformRenderer, tile: TileCard): Promise<void> {
    const { target } = tile;
    if (!target.path) { new Notice('This tile has no target set.'); return; }
    if (target.kind === 'board') { await this.onNavigate(target.path); return; }
    const file = this.app.vault.getAbstractFileByPath(target.path);
    if (!file) { new Notice(`Target no longer exists: ${target.path}`); return; }
    if (target.kind === 'note' || target.kind === 'canvas') {
      if (!(file instanceof TFile)) return;
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.openFile(file); void this.app.workspace.revealLeaf(leaf); return;
    }

    if (target.kind === 'kanban') {
      if (!(file instanceof TFile)) return;
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.openFile(file); void this.app.workspace.revealLeaf(leaf);
      const isInstalled = (this.app as AppWithPrivateAPIs).plugins?.enabledPlugins?.has('obsidian-kanban') ?? false;
      if (!isInstalled) new Notice('Install the community "Kanban" plugin to view this as a board.');
      return;
    }
    if (target.kind === 'folder') {
      if (!(file instanceof TFolder)) return;
      const ex = this.app.workspace.getLeavesOfType('file-explorer');
      if (ex.length > 0) { const v = ex[0].view as { revealInFolder?: (f: TFolder) => void }; v.revealInFolder?.(file); }
      const firstNote = file.children?.find((f): f is TFile => f instanceof TFile && f.extension === 'md');
      if (firstNote) { const leaf = this.app.workspace.getLeaf('tab'); await leaf.openFile(firstNote); void this.app.workspace.revealLeaf(leaf); }
    }
  },

  async activateNoteLink(this: FreeformRenderer, card: NoteLinkCard): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(card.path);
    if (!(file instanceof TFile)) { new Notice(`Note no longer exists: ${card.path}`); return; }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file); void this.app.workspace.revealLeaf(leaf);
  },

  nextZ(this: FreeformRenderer): number { return Math.max(0, ...this.board.cards.map(c => c.z ?? 0)) + 1; },

  applySnap(this: FreeformRenderer, val: number): number {
    return snap(val, this.snapToGridEnabled ? this.snapGridSize : 4);
  },

  toggleSnapToGrid(this: FreeformRenderer): void {
    this.snapToGridEnabled = !this.snapToGridEnabled;
    this.snapToggleBtn?.toggleClass('is-active', this.snapToGridEnabled);
    this.onToggleSnapToGrid?.(this.snapToGridEnabled);
  },

  centerPos(this: FreeformRenderer, w: number, h: number): { x: number; y: number } {
    const rect = this.outer.getBoundingClientRect();
    const c = screenToCanvas(rect.width / 2, rect.height / 2, this.vp);
    return { x: this.applySnap(c.x - w / 2), y: this.applySnap(c.y - h / 2) };
  },

  alignCards(this: FreeformRenderer, mode: 'left' | 'center-h' | 'right' | 'top' | 'middle-v' | 'bottom' | 'distribute-h' | 'distribute-v'): void {
    const ids = this.selection.getIds();
    const cards = ids.map(id => this.board.cards.find(c => c.id === id)).filter((c): c is Card => !!c);
    if (cards.length < 2) return;
    this.pushUndo();
    if (mode === 'left') {
      const ref = Math.min(...cards.map(c => c.x ?? 0));
      for (const c of cards) c.x = ref;
    } else if (mode === 'center-h') {
      const cx = cards.reduce((s, c) => s + (c.x ?? 0) + (c.w ?? 0) / 2, 0) / cards.length;
      for (const c of cards) c.x = cx - (c.w ?? 0) / 2;
    } else if (mode === 'right') {
      const ref = Math.max(...cards.map(c => (c.x ?? 0) + (c.w ?? 0)));
      for (const c of cards) c.x = ref - (c.w ?? 0);
    } else if (mode === 'top') {
      const ref = Math.min(...cards.map(c => c.y ?? 0));
      for (const c of cards) c.y = ref;
    } else if (mode === 'middle-v') {
      const cy = cards.reduce((s, c) => s + (c.y ?? 0) + (c.h ?? 0) / 2, 0) / cards.length;
      for (const c of cards) c.y = cy - (c.h ?? 0) / 2;
    } else if (mode === 'bottom') {
      const ref = Math.max(...cards.map(c => (c.y ?? 0) + (c.h ?? 0)));
      for (const c of cards) c.y = ref - (c.h ?? 0);
    } else if (mode === 'distribute-h') {
      const sorted = [...cards].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
      const left = sorted[0].x ?? 0;
      const right = (sorted[sorted.length - 1].x ?? 0) + (sorted[sorted.length - 1].w ?? 0);
      const totalW = cards.reduce((s, c) => s + (c.w ?? 0), 0);
      const gap = (right - left - totalW) / (cards.length - 1);
      let x = left;
      for (const c of sorted) { c.x = x; x += (c.w ?? 0) + gap; }
    } else if (mode === 'distribute-v') {
      const sorted = [...cards].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
      const top = sorted[0].y ?? 0;
      const bottom = (sorted[sorted.length - 1].y ?? 0) + (sorted[sorted.length - 1].h ?? 0);
      const totalH = cards.reduce((s, c) => s + (c.h ?? 0), 0);
      const gap = (bottom - top - totalH) / (cards.length - 1);
      let y = top;
      for (const c of sorted) { c.y = y; y += (c.h ?? 0) + gap; }
    }
    for (const c of cards) {
      const cardEl = this.cardEls.get(c.id);
      if (cardEl) { cardEl.style.left = `${c.x}px`; cardEl.style.top = `${c.y}px`; }
    }
    this.refreshAllConnections();
    this.scheduleSave();
  },

  deleteSelected(this: FreeformRenderer): void {
    const ids = this.selection.getIds();
    const connectionIds = this.marqueeConnectionIds;
    if (!ids.length && !connectionIds.size) return;
    this.pushUndo();
    for (const id of ids) {
      this.board.cards = this.board.cards.filter(c => c.id !== id);
      this.cardEls.get(id)?.remove(); this.cardEls.delete(id);
      this.disposeCardResources(id);
      // Cascade: remove any connection that references the deleted card
      this.board.connections = this.board.connections.filter(
        c => c.fromCardId !== id && c.toCardId !== id
      );
    }
    // Arrows caught by a marquee (drag-box) selection, including
    // free-floating ones with no card at either end to cascade from.
    if (connectionIds.size) {
      this.board.connections = this.board.connections.filter(c => !connectionIds.has(c.id));
      connectionIds.clear();
    }
    this.selection.clear();
    this.refreshAllConnections();
    this.scheduleSave();
  },

  duplicateSelected(this: FreeformRenderer): void {
    const ids = this.selection.getIds(); if (!ids.length) return;
    this.pushUndo();
    const maxZ = Math.max(0, ...this.board.cards.map(c => c.z ?? 0));
    this.selection.clear(); let zOff = 1;
    for (const id of ids) {
      const orig = this.board.cards.find(c => c.id === id); if (!orig) continue;
      const copy = { ...JSON.parse(JSON.stringify(orig)), id: crypto.randomUUID(), x: snap((orig.x ?? 0) + 20), y: snap((orig.y ?? 0) + 20), z: maxZ + zOff++ } as SupportedCard;
      if (copy.kind === 'kanban-column') {
        copy.items = copy.items.map(item => ({ ...item, id: crypto.randomUUID(), done: false }));
      }
      this.board.cards.push(copy); this.createCardEl(copy); this.selection.add(copy.id);
    }
    this.refreshSelectionVisuals(); this.scheduleSave();
  },

  activateTool(this: FreeformRenderer, name: string, btn: HTMLElement): void {
    if (this.pendingTool === name) { this.clearPendingTool(); return; }
    this.clearPendingTool();
    this.pendingTool = name;
    this.pendingToolBtn = btn;
    btn.addClass('is-active');
    this.setCursor('crosshair');
  },

  clearPendingTool(this: FreeformRenderer): void {
    this.pendingToolBtn?.removeClass('is-active');
    this.pendingTool = null;
    this.pendingToolBtn = null;
    if (!this.connectMode) this.setCursor('');
  },

  placePendingTool(this: FreeformRenderer, cx: number, cy: number): void {
    const tool = this.pendingTool;
    this.clearPendingTool();
    this.closeOverflow();
    if (!tool) return;
    const s = snap;
    switch (tool) {
      case 'connect':
        this.addDefaultArrowAt(cx, cy); break;
      case 'blank-card':
        this.addBlankCardAt(s(cx - STICKY_DEFAULT_W / 2), s(cy - STICKY_DEFAULT_H / 2)); break;
      case 'sticky':
        this.addStickyAt(s(cx - STICKY_DEFAULT_W / 2), s(cy - STICKY_DEFAULT_H / 2)); break;
      case 'checklist':
        this.addChecklistAt(s(cx - CHECKLIST_DEFAULT_W / 2), s(cy - CHECKLIST_DEFAULT_H / 2)); break;
      case 'comment':
        this.addCommentAt(s(cx - COMMENT_DEFAULT_W / 2), s(cy - COMMENT_DEFAULT_H / 2)); break;
      case 'table':
        this.addTableAt(s(cx - TABLE_DEFAULT_W / 2), s(cy - TABLE_DEFAULT_H / 2)); break;
      case 'kanban':
        this.addKanbanBoardAt(s(cx - (KANBAN_DEFAULT_W * 2 + 12) / 2), s(cy - KANBAN_DEFAULT_H / 2)); break;
      case 'column':
        this.addColumnCardAt(s(cx - COLUMN_DEFAULT_W / 2), s(cy - COLUMN_DEFAULT_H / 2)); break;
      case 'image':
        this.addImageAt(s(cx - IMAGE_DEFAULT_W / 2), s(cy - IMAGE_DEFAULT_H / 2)); break;
      case 'audio':
        this.addAudioAt(s(cx - AUDIO_DEFAULT_W / 2), s(cy - AUDIO_DEFAULT_H / 2)); break;
      case 'bookmark':
        this.addBookmarkAt(s(cx - BOOKMARK_DEFAULT_W / 2), s(cy - BOOKMARK_DEFAULT_H / 2)); break;
      case 'map':
        this.addMapAt(s(cx - MAP_DEFAULT_W / 2), s(cy - MAP_DEFAULT_H / 2)); break;
      case 'swatch':
        this.addSwatchAt(s(cx - SWATCH_DEFAULT_W / 2), s(cy - SWATCH_DEFAULT_H / 2)); break;
      case 'file':
        this.addFileAt(s(cx - FILE_DEFAULT_W / 2), s(cy - FILE_DEFAULT_H / 2)); break;
      case 'callout':
        this.addCalloutAt(s(cx - CALLOUT_DEFAULT_W / 2), s(cy - CALLOUT_DEFAULT_H / 2)); break;
      case 'group':
        this.addGroupAt(s(cx - GROUP_DEFAULT_W / 2), s(cy - GROUP_DEFAULT_H / 2)); break;
      case 'calendar':
        this.addCalendarAt(s(cx - CALENDAR_DEFAULT_W / 2), s(cy - CALENDAR_DEFAULT_H / 2)); break;
      case 'checkers':
        this.addCheckersAt(s(cx - CHECKERS_DEFAULT_W / 2), s(cy - CHECKERS_DEFAULT_H / 2)); break;
      case 'notelink':
        this.addNoteLinkAt(s(cx - NOTELINK_DEFAULT_W / 2), s(cy - NOTELINK_DEFAULT_H / 2)); break;
      case 'tile':
        this.addTileAt(s(cx - TILE_DEFAULT_W / 2), s(cy - TILE_DEFAULT_H / 2)); break;
      case 'tile-folder':
        new TileModal(this.app, null, (t) => {
          t.x = s(cx - TILE_DEFAULT_W / 2); t.y = s(cy - TILE_DEFAULT_H / 2);
          t.w = TILE_DEFAULT_W; t.h = TILE_DEFAULT_H; t.z = this.nextZ();
          this.pushUndo(); this.board.cards.push(t); void this.saveNow();
          this.createCardEl(t); this.selection.select(t.id); this.refreshSelectionVisuals();
        }, this.file, 'folder').open(); break;
      case 'tile-canvas':
        new TileModal(this.app, null, (t) => {
          t.x = s(cx - TILE_DEFAULT_W / 2); t.y = s(cy - TILE_DEFAULT_H / 2);
          t.w = TILE_DEFAULT_W; t.h = TILE_DEFAULT_H; t.z = this.nextZ();
          this.pushUndo(); this.board.cards.push(t); void this.saveNow();
          this.createCardEl(t); this.selection.select(t.id); this.refreshSelectionVisuals();
        }, this.file, 'canvas').open(); break;
      case 'tile-board':
        new TileModal(this.app, null, (t) => {
          t.x = s(cx - TILE_DEFAULT_W / 2); t.y = s(cy - TILE_DEFAULT_H / 2);
          t.w = TILE_DEFAULT_W; t.h = TILE_DEFAULT_H; t.z = this.nextZ();
          this.pushUndo(); this.board.cards.push(t); void this.saveNow();
          this.createCardEl(t); this.selection.select(t.id); this.refreshSelectionVisuals();
        }, this.file, 'board').open(); break;
    }
  },

  isOverTrash(this: FreeformRenderer, clientX: number, clientY: number): boolean {
    if (!this.trashZoneEl) return false;
    const r = this.trashZoneEl.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  },

  setTrashHover(this: FreeformRenderer, clientX: number, clientY: number): void {
    this.trashZoneEl?.toggleClass('is-drag-over', this.isOverTrash(clientX, clientY));
  },

  clearTrashHover(this: FreeformRenderer): void {
    this.trashZoneEl?.removeClass('is-drag-over');
  },

  centerOnCard(this: FreeformRenderer, id: string): void {
    const card = this.board.cards.find(c => c.id === id);
    if (!card) return;
    const rect = this.outer.getBoundingClientRect();
    const cx = (card.x ?? 0) + (card.w ?? TILE_DEFAULT_W) / 2;
    const cy = (card.y ?? 0) + (card.h ?? TILE_DEFAULT_H) / 2;
    this.vp = {
      x: rect.width / 2 - cx * this.vp.zoom,
      y: rect.height / 2 - cy * this.vp.zoom,
      zoom: this.vp.zoom,
    };
    this.applyViewport();
    this.scheduleSave();
  },

  initConnectionLayer(this: FreeformRenderer): void {
    const ns = 'http://www.w3.org/2000/svg';

    // Visual layer — behind cards (first child of inner)
    const svg = activeDocument.createElementNS(ns, 'svg');
    svg.classList.add('visual-notes-connections-svg');
    this.svgDefs = activeDocument.createElementNS(ns, 'defs');
    svg.appendChild(this.svgDefs);
    if (this.inner.firstChild) this.inner.insertBefore(svg, this.inner.firstChild);
    else this.inner.appendChild(svg);
    this.svgEl = svg;

    // Hit layer — above all cards so connection lines are always clickable
    const hitSvg = activeDocument.createElementNS(ns, 'svg');
    hitSvg.classList.add('visual-notes-connections-hit-svg');
    this.inner.appendChild(hitSvg);
    this.hitSvgEl = hitSvg;
  },

  initInkLayer(this: FreeformRenderer): void {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = activeDocument.createElementNS(ns, 'svg');
    svg.classList.add('visual-notes-ink-svg');
    this.inner.appendChild(svg);
    this.inkSvgEl = svg;
  },

  renderAllDrawings(this: FreeformRenderer): void {
    this.inkPaths.forEach(p => p.remove()); this.inkPaths.clear();
    this.inkHitPaths.forEach(p => p.remove()); this.inkHitPaths.clear();
    for (const stroke of this.board.drawings) this.renderSingleDrawing(stroke);
  },

  buildInkPathD(this: FreeformRenderer, points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    const r = (n: number) => Math.round(n * 100) / 100;
    if (points.length < 3) {
      let d = `M ${r(points[0].x)} ${r(points[0].y)}`;
      for (let i = 1; i < points.length; i++) d += ` L ${r(points[i].x)} ${r(points[i].y)}`;
      return d;
    }
    let d = `M ${r(points[0].x)} ${r(points[0].y)}`;
    let i = 1;
    for (; i < points.length - 2; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      d += ` Q ${r(points[i].x)} ${r(points[i].y)}, ${r(midX)} ${r(midY)}`;
    }
    d += ` Q ${r(points[i].x)} ${r(points[i].y)}, ${r(points[i + 1].x)} ${r(points[i + 1].y)}`;
    return d;
  },

  isHighlightStroke(this: FreeformRenderer, stroke: DrawingStroke): boolean {
    return stroke.opacity != null;
  },

  buildStrokePathD(this: FreeformRenderer, stroke: DrawingStroke): string {
    return this.isHighlightStroke(stroke)
      ? this.buildHighlightOutlineD(stroke)
      : this.buildInkPathD(stroke.points);
  },

  buildHighlightOutlineD(this: FreeformRenderer, stroke: DrawingStroke): string {
    // Resample first: straight-line strokes (Shift-drawn or auto-straightened)
    // are stored as just two points, which would outline as a perfect
    // rectangle — no hand-drawn character at all. Inserting points every
    // ~12px along long segments gives the wobble something to grip.
    const pts: { x: number; y: number }[] = [];
    const SAMPLE = 12;
    for (let i = 0; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      if (pts.length) {
        const prev = pts[pts.length - 1];
        const segLen = Math.hypot(p.x - prev.x, p.y - prev.y);
        const steps = Math.floor(segLen / SAMPLE);
        for (let s = 1; s <= steps; s++) {
          const t = s / (steps + 1);
          pts.push({ x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t });
        }
      }
      pts.push({ ...p });
    }
    if (pts.length < 2) return '';

    let seed = 0;
    for (let i = 0; i < stroke.id.length; i++) seed = (seed * 31 + stroke.id.charCodeAt(i)) >>> 0;
    const rand = (i: number): number => {
      let x = (seed ^ Math.imul(i + 1, 2654435761)) >>> 0;
      x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
      return ((x >>> 8) / 0xffffff) * 2 - 1; // -1..1
    };

    const r = (n: number) => Math.round(n * 100) / 100;
    const half = stroke.width / 2;
    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const nx = -dy, ny = dx;
      // Independent wobble per side so the two edges don't move in lockstep
      // (which would read as the whole line wiggling, not a rough edge).
      const wobA = 1 + rand(i) * 0.13;
      const wobB = 1 + rand(i + 7919) * 0.13;
      left.push({ x: pts[i].x + nx * half * wobA, y: pts[i].y + ny * half * wobA });
      right.push({ x: pts[i].x - nx * half * wobB, y: pts[i].y - ny * half * wobB });
    }
    let d = `M ${r(left[0].x)} ${r(left[0].y)}`;
    for (let i = 1; i < left.length; i++) d += ` L ${r(left[i].x)} ${r(left[i].y)}`;
    for (let i = right.length - 1; i >= 0; i--) d += ` L ${r(right[i].x)} ${r(right[i].y)}`;
    return d + ' Z';
  },

  renderSingleDrawing(this: FreeformRenderer, stroke: DrawingStroke): void {
    const ns = 'http://www.w3.org/2000/svg';
    const d = this.buildInkPathD(stroke.points);

    const path = activeDocument.createElementNS(ns, 'path') as SVGPathElement;
    if (this.isHighlightStroke(stroke)) {
      path.setAttribute('d', this.buildHighlightOutlineD(stroke));
      path.setAttribute('fill', stroke.color);
      path.setAttribute('fill-opacity', String(stroke.opacity));
      path.setAttribute('stroke', 'none');
      path.classList.add('ib-highlight-stroke');
    } else {
      path.setAttribute('d', d);
      path.setAttribute('stroke', stroke.color);
      path.setAttribute('stroke-width', String(stroke.width));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    path.setAttribute('pointer-events', 'none');
    this.inkSvgEl.appendChild(path);
    this.inkPaths.set(stroke.id, path);

    // Invisible, much thicker hit path so a thin stroke is still easy to
    // click for selection — same trick used for connection lines.
    const hit = activeDocument.createElementNS(ns, 'path') as SVGPathElement;
    hit.setAttribute('d', d);
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', String(Math.max(16, stroke.width + 12)));
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke-linecap', 'round');
    hit.setAttribute('stroke-linejoin', 'round');
    hit.style.cursor = 'pointer';
    hit.style.pointerEvents = this.penModeActive ? 'none' : 'stroke';
    hit.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const groupId = stroke.groupId;
      this.selectDrawing(groupId);

      const groupStrokes = this.groupStrokes(groupId);
      const startPoints = groupStrokes.map(s => s.points.map(p => ({ ...p })));
      const sx = e.clientX, sy = e.clientY;
      let moved = false;

      const onMove = (e2: PointerEvent) => {
        if (!moved && Math.hypot(e2.clientX - sx, e2.clientY - sy) < DRAG_THRESHOLD) return;
        if (!moved) { moved = true; this.pushUndo(); }
        const dx = (e2.clientX - sx) / this.vp.zoom;
        const dy = (e2.clientY - sy) / this.vp.zoom;
        groupStrokes.forEach((s, i) => {
          s.points = startPoints[i].map(p => ({ x: p.x + dx, y: p.y + dy }));
          this.inkPaths.get(s.id)?.setAttribute('d', this.buildStrokePathD(s));
          this.inkHitPaths.get(s.id)?.setAttribute('d', this.buildInkPathD(s.points));
        });
        this.refreshDrawingSelectionVisual(groupId);
        this.setTrashHover(e2.clientX, e2.clientY);
      };
      const onUp = (e2: PointerEvent) => {
        activeDocument.removeEventListener('pointermove', onMove);
        activeDocument.removeEventListener('pointerup', onUp);
        this.clearTrashHover();
        // Dropped on the trash zone: delete the whole sketch group. The
        // drag's own pushUndo (on first movement) already covers this, so
        // one undo brings the sketch back where it started.
        if (moved && this.isOverTrash(e2.clientX, e2.clientY)) {
          const toRemove = this.groupStrokes(groupId);
          this.board.drawings = this.board.drawings.filter(s => s.groupId !== groupId);
          for (const s of toRemove) {
            this.inkPaths.get(s.id)?.remove(); this.inkPaths.delete(s.id);
            this.inkHitPaths.get(s.id)?.remove(); this.inkHitPaths.delete(s.id);
          }
          this.deselectDrawing();
          this.scheduleSave();
          return;
        }
        if (moved) this.scheduleSave();
      };
      activeDocument.addEventListener('pointermove', onMove);
      activeDocument.addEventListener('pointerup', onUp);
    });
    hit.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.selectDrawing(stroke.groupId);
      this.showDrawingMenu(e as unknown as MouseEvent, stroke.groupId);
    });
    this.inkSvgEl.appendChild(hit);
    this.inkHitPaths.set(stroke.id, hit);
  },

  groupStrokes(this: FreeformRenderer, groupId: string): DrawingStroke[] {
    return this.board.drawings.filter(s => s.groupId === groupId);
  },

  selectDrawing(this: FreeformRenderer, groupId: string): void {
    if (this.selectedDrawingId === groupId) return;
    this.deselectDrawing();
    this.selection.clear(); this.refreshSelectionVisuals();
    this.deselectConnection();
    this.selectedDrawingId = groupId;
    this.refreshDrawingSelectionVisual(groupId);
    this.outer.focus();
  },

  refreshDrawingSelectionVisual(this: FreeformRenderer, groupId: string): void {
    this.inkSelectGroup?.remove();
    this.inkSelectGroup = null;
    const strokes = this.groupStrokes(groupId);
    if (!strokes.length) { this.removeDrawingBox(); return; }

    const ns = 'http://www.w3.org/2000/svg';
    const g = activeDocument.createElementNS(ns, 'g') as SVGGElement;
    g.setAttribute('pointer-events', 'none');
    for (const stroke of strokes) {
      const p = activeDocument.createElementNS(ns, 'path');
      p.setAttribute('d', this.buildInkPathD(stroke.points));
      p.setAttribute('stroke', 'var(--interactive-accent)');
      p.setAttribute('stroke-width', String(stroke.width + 8));
      p.setAttribute('stroke-opacity', '0.3');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      g.appendChild(p);
    }
    this.inkSvgEl.insertBefore(g, this.inkSvgEl.firstChild);
    this.inkSelectGroup = g;

    const bbox = this.computeGroupBBox(groupId);
    if (bbox) this.renderDrawingBox(groupId, bbox);
    else this.removeDrawingBox();
  },

  deselectDrawing(this: FreeformRenderer): void {
    this.inkSelectGroup?.remove();
    this.inkSelectGroup = null;
    this.selectedDrawingId = null;
    this.removeDrawingBox();
  },

  computeGroupBBox(this: FreeformRenderer, groupId: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const strokes = this.groupStrokes(groupId);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) {
      const pad = s.width / 2;
      for (const p of s.points) {
        minX = Math.min(minX, p.x - pad); maxX = Math.max(maxX, p.x + pad);
        minY = Math.min(minY, p.y - pad); maxY = Math.max(maxY, p.y + pad);
      }
    }
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  },

  renderDrawingBox(this: FreeformRenderer, groupId: string, bbox: { minX: number; minY: number; maxX: number; maxY: number }): void {
    this.removeDrawingBox();
    const box = this.inner.createDiv('visual-notes-drawing-select-box');
    box.style.left = `${bbox.minX}px`;
    box.style.top = `${bbox.minY}px`;
    box.style.width = `${Math.max(1, bbox.maxX - bbox.minX)}px`;
    box.style.height = `${Math.max(1, bbox.maxY - bbox.minY)}px`;
    for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
      const handle = box.createDiv(`visual-notes-drawing-resize-handle visual-notes-drawing-resize-handle--${corner}`);
      handle.addEventListener('pointerdown', (e) => this.startDrawingResize(e, groupId, corner));
    }
    this.drawingBoxEl = box;
  },

  removeDrawingBox(this: FreeformRenderer): void {
    this.drawingBoxEl?.remove();
    this.drawingBoxEl = null;
  },

  startDrawingResize(this: FreeformRenderer, e: PointerEvent, groupId: string, corner: 'nw' | 'ne' | 'sw' | 'se'): void {
    e.stopPropagation(); e.preventDefault();
    const strokes = this.groupStrokes(groupId);
    const bbox = this.computeGroupBBox(groupId);
    if (!bbox || !strokes.length) return;
    this.pushUndo();

    const startPoints = strokes.map(s => s.points.map(p => ({ ...p })));
    const startWidths = strokes.map(s => s.width);
    const anchorX = corner.includes('w') ? bbox.maxX : bbox.minX;
    const anchorY = corner.includes('n') ? bbox.maxY : bbox.minY;
    const dragStartX = corner.includes('w') ? bbox.minX : bbox.maxX;
    const dragStartY = corner.includes('n') ? bbox.minY : bbox.maxY;
    const spanX = dragStartX - anchorX;
    const spanY = dragStartY - anchorY;
    const sx = e.clientX, sy = e.clientY;
    const MIN_SCALE = 0.15;

    const clampScale = (scale: number): number => {
      if (Math.abs(scale) < MIN_SCALE) return scale < 0 ? -MIN_SCALE : MIN_SCALE;
      return scale;
    };

    const onMove = (e2: PointerEvent) => {
      const dx = (e2.clientX - sx) / this.vp.zoom;
      const dy = (e2.clientY - sy) / this.vp.zoom;
      const scaleX = clampScale(spanX !== 0 ? (spanX + dx) / spanX : 1);
      const scaleY = clampScale(spanY !== 0 ? (spanY + dy) / spanY : 1);
      const widthScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;

      strokes.forEach((s, i) => {
        s.points = startPoints[i].map(p => ({
          x: anchorX + (p.x - anchorX) * scaleX,
          y: anchorY + (p.y - anchorY) * scaleY,
        }));
        s.width = Math.max(1, startWidths[i] * widthScale);
        // Highlight strokes bake the width into their filled outline, so
        // regenerating d covers them; stroke-width only matters for pen ink.
        this.inkPaths.get(s.id)?.setAttribute('d', this.buildStrokePathD(s));
        if (!this.isHighlightStroke(s)) this.inkPaths.get(s.id)?.setAttribute('stroke-width', String(s.width));
        this.inkHitPaths.get(s.id)?.setAttribute('d', this.buildInkPathD(s.points));
        this.inkHitPaths.get(s.id)?.setAttribute('stroke-width', String(Math.max(16, s.width + 12)));
      });
      this.refreshDrawingSelectionVisual(groupId);
    };
    const onUp = () => {
      activeDocument.removeEventListener('pointermove', onMove);
      activeDocument.removeEventListener('pointerup', onUp);
      this.scheduleSave();
    };
    activeDocument.addEventListener('pointermove', onMove);
    activeDocument.addEventListener('pointerup', onUp);
  },

  deleteSelectedDrawing(this: FreeformRenderer): void {
    if (!this.selectedDrawingId) return;
    const groupId = this.selectedDrawingId;
    this.pushUndo();
    const toRemove = this.groupStrokes(groupId);
    this.board.drawings = this.board.drawings.filter(s => s.groupId !== groupId);
    for (const s of toRemove) {
      this.inkPaths.get(s.id)?.remove(); this.inkPaths.delete(s.id);
      this.inkHitPaths.get(s.id)?.remove(); this.inkHitPaths.delete(s.id);
    }
    this.deselectDrawing();
    this.scheduleSave();
  },

  rerenderGroup(this: FreeformRenderer, groupId: string): void {
    const wasSelected = this.selectedDrawingId === groupId;
    for (const s of this.groupStrokes(groupId)) {
      this.inkPaths.get(s.id)?.remove(); this.inkPaths.delete(s.id);
      this.inkHitPaths.get(s.id)?.remove(); this.inkHitPaths.delete(s.id);
      this.renderSingleDrawing(s);
    }
    if (wasSelected) { this.deselectDrawing(); this.selectDrawing(groupId); }
  },

  showDrawingMenu(this: FreeformRenderer, e: MouseEvent, groupId: string): void {
    const strokes = this.groupStrokes(groupId);
    if (!strokes.length) return;
    const menu = this.newMenu();
    menu.addItem(i => i.setTitle('Change color…').setIcon('palette').onClick(() => {
      new KanbanItemColorModal(this.app, strokes[0].color, (hex) => {
        if (!hex) return;
        this.pushUndo();
        for (const s of strokes) s.color = hex;
        this.rerenderGroup(groupId); this.scheduleSave();
      }).open();
    }));
    // Highlighter strokes carry the marker's 3.5× width scale, so the same
    // Thin/Medium/Thick labels map to proportionally broader ink for them.
    const setWidth = (w: number) => {
      this.pushUndo();
      for (const s of strokes) s.width = w * (this.isHighlightStroke(s) ? 3.5 : 1);
      this.rerenderGroup(groupId); this.scheduleSave();
    };
    menu.addItem(i => i.setTitle('Thin').setIcon('minus').onClick(() => setWidth(2)));
    menu.addItem(i => i.setTitle('Medium').setIcon('minus').onClick(() => setWidth(4)));
    menu.addItem(i => i.setTitle('Thick').setIcon('minus').onClick(() => setWidth(8)));
    menu.addSeparator();
    menu.addItem(i => i.setTitle('Delete').setIcon('trash').onClick(() => this.deleteSelectedDrawing()));
    menu.showAtMouseEvent(e);
  },

  startInkStroke(this: FreeformRenderer, startEvent: PointerEvent): void {
    // Every pen-mode pointerdown funnels through here (canvas, cards, kanban
    // items, column children all call it), so the eraser branch lives at the
    // top rather than being re-checked at each call site.
    if (this.penTool === 'eraser') { this.startEraseScrub(startEvent); return; }

    const isHighlighter = this.penTool === 'highlighter';
    const rect = this.outer.getBoundingClientRect();
    const stroke: DrawingStroke = {
      id: crypto.randomUUID(),
      // Pen strokes share the session's group so a multi-stroke sketch acts
      // as one unit — but each highlighter swipe marks its own word or
      // area, so every one gets a fresh group and stays independently
      // selectable, movable, and deletable.
      groupId: isHighlighter
        ? crypto.randomUUID()
        : (this.currentPenGroupId ?? (this.currentPenGroupId = crypto.randomUUID())),
      points: [],
      color: isHighlighter ? this.currentHighlightColor : this.currentInkColor,
      // A real highlighter is a broad chisel of translucent ink — scale the
      // chosen pen width up rather than asking for a separate width setting.
      width: isHighlighter ? this.currentInkWidth * 3.5 : this.currentInkWidth,
      opacity: isHighlighter ? 0.45 : undefined,
    };
    // Drop pointermove samples closer together than ~4 screen px — high
    // sampling rates otherwise feed the smoother a cluster of near-duplicate
    // points that reintroduces jitter into the curve. Fewer, more spread-out
    // points read as a single confident line rather than a dense polyline.
    const MIN_POINT_DIST = 4 / this.vp.zoom;
    // Trailing (exponential) smoothing on top of that — each raw sample
    // only pulls the drawn point partway toward it, so the line lags
    // slightly behind the actual pointer and rounds through hand/mouse
    // micro-jitter instead of tracing it exactly. This is what gives the
    // stroke a fluid, inked feel rather than a faceted mouse-trace; lower
    // TRAIL = smoother but laggier, higher = snappier but more jagged.
    const TRAIL = 0.35;
    let smoothed: { x: number; y: number } | null = null;
    const addPoint = (clientX: number, clientY: number) => {
      const cp = screenToCanvas(clientX - rect.left, clientY - rect.top, this.vp);
      smoothed = smoothed
        ? { x: smoothed.x + (cp.x - smoothed.x) * TRAIL, y: smoothed.y + (cp.y - smoothed.y) * TRAIL }
        : { x: cp.x, y: cp.y };
      const last = stroke.points[stroke.points.length - 1];
      if (last && Math.hypot(smoothed.x - last.x, smoothed.y - last.y) < MIN_POINT_DIST) return;
      stroke.points.push({ x: smoothed.x, y: smoothed.y });
    };
    addPoint(startEvent.clientX, startEvent.clientY);
    // Anchor for Shift-drawn straight lines: the true (unsmoothed) start.
    const firstPoint = { ...stroke.points[0] };

    const ns = 'http://www.w3.org/2000/svg';
    const livePath = activeDocument.createElementNS(ns, 'path') as SVGPathElement;
    if (isHighlighter) {
      livePath.setAttribute('fill', stroke.color);
      livePath.setAttribute('fill-opacity', String(stroke.opacity));
      livePath.setAttribute('stroke', 'none');
      livePath.classList.add('ib-highlight-stroke');
    } else {
      livePath.setAttribute('stroke', stroke.color);
      livePath.setAttribute('stroke-width', String(stroke.width));
      livePath.setAttribute('fill', 'none');
      livePath.setAttribute('stroke-linecap', 'round');
      livePath.setAttribute('stroke-linejoin', 'round');
    }
    livePath.setAttribute('pointer-events', 'none');
    livePath.setAttribute('d', this.buildStrokePathD(stroke));
    this.inkSvgEl.appendChild(livePath);

    let shiftLine = false;
    const onMove = (e2: PointerEvent) => {
      if (e2.shiftKey) {
        // Ruler mode: while Shift is held the stroke is just anchor →
        // pointer, redrawn live as a perfectly straight segment. Releasing
        // Shift mid-stroke resumes freehand from wherever the line ended.
        shiftLine = true;
        const cp = screenToCanvas(e2.clientX - rect.left, e2.clientY - rect.top, this.vp);
        stroke.points = [{ ...firstPoint }, { x: cp.x, y: cp.y }];
        smoothed = { x: cp.x, y: cp.y };
      } else {
        shiftLine = false;
        addPoint(e2.clientX, e2.clientY);
      }
      livePath.setAttribute('d', this.buildStrokePathD(stroke));
    };
    const onUp = (e2: PointerEvent) => {
      activeDocument.removeEventListener('pointermove', onMove);
      activeDocument.removeEventListener('pointerup', onUp);
      // Snap the very last point to the true release position — the
      // trailing smoothing in addPoint intentionally lags a bit behind the
      // live pointer for a fluid line, so without this the stroke would
      // stop just short of wherever the pointer was actually lifted.
      const cp = screenToCanvas(e2.clientX - rect.left, e2.clientY - rect.top, this.vp);
      const last = stroke.points[stroke.points.length - 1];
      if (!last || Math.hypot(cp.x - last.x, cp.y - last.y) > 0.01) stroke.points.push({ x: cp.x, y: cp.y });
      livePath.remove();
      if (stroke.points.length < 2) return;
      if (!shiftLine) this.autoStraighten(stroke);
      this.pushUndo();
      this.board.drawings.push(stroke);
      this.renderSingleDrawing(stroke);
      this.scheduleSave();
    };
    activeDocument.addEventListener('pointermove', onMove);
    activeDocument.addEventListener('pointerup', onUp);
  },

  autoStraighten(this: FreeformRenderer, stroke: DrawingStroke): void {
    const pts = stroke.points;
    if (pts.length < 3) return;
    const a = pts[0], b = pts[pts.length - 1];
    const chordLen = Math.hypot(b.x - a.x, b.y - a.y);
    // Too short to judge intent — a small squiggle isn't a failed line.
    if (chordLen < 40) return;
    let maxDev = 0;
    for (const p of pts) {
      // Perpendicular distance from p to the infinite line through a→b.
      const dev = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / chordLen;
      if (dev > maxDev) maxDev = dev;
    }
    if (maxDev <= Math.max(4, chordLen * 0.035)) {
      stroke.points = [{ ...a }, { ...b }];
    }
  },

  startEraseScrub(this: FreeformRenderer, startEvent: PointerEvent): void {
    const rect = this.outer.getBoundingClientRect();
    let erasedAny = false;

    const eraseAt = (clientX: number, clientY: number) => {
      const cp = screenToCanvas(clientX - rect.left, clientY - rect.top, this.vp);
      const radius = 10 / this.vp.zoom;
      const hits = this.board.drawings.filter(s => {
        const reach = radius + s.width / 2;
        return s.points.some(p => Math.hypot(p.x - cp.x, p.y - cp.y) <= reach);
      });
      if (!hits.length) return;
      if (!erasedAny) { erasedAny = true; this.pushUndo(); }
      const ids = new Set(hits.map(s => s.id));
      this.board.drawings = this.board.drawings.filter(s => !ids.has(s.id));
      for (const s of hits) {
        this.inkPaths.get(s.id)?.remove(); this.inkPaths.delete(s.id);
        this.inkHitPaths.get(s.id)?.remove(); this.inkHitPaths.delete(s.id);
      }
    };
    eraseAt(startEvent.clientX, startEvent.clientY);

    const onMove = (e2: PointerEvent) => eraseAt(e2.clientX, e2.clientY);
    const onUp = () => {
      activeDocument.removeEventListener('pointermove', onMove);
      activeDocument.removeEventListener('pointerup', onUp);
      if (erasedAny) this.scheduleSave();
    };
    activeDocument.addEventListener('pointermove', onMove);
    activeDocument.addEventListener('pointerup', onUp);
  },

  togglePenMode(this: FreeformRenderer): void {
    if (this.penModeActive) this.exitPenMode(); else this.enterPenMode();
  },

  enterPenMode(this: FreeformRenderer): void {
    this.exitConnectMode();
    this.clearPendingTool();
    this.deselectConnection();
    this.deselectDrawing();
    this.penModeActive = true;
    this.currentPenGroupId = crypto.randomUUID();
    this.outer.addClass('is-pen-mode');
    // penTool persists across sessions, so re-entering pen mode with the
    // eraser still selected needs the eraser cursor back immediately.
    this.outer.toggleClass('is-eraser-mode', this.penTool === 'eraser');
    this.penToolBtn?.addClass('is-active');
    this.inkHitPaths.forEach(p => { p.style.pointerEvents = 'none'; });
    this.showPenColorPicker();
    this.showPenBanner();
  },

  exitPenMode(this: FreeformRenderer): void {
    this.penModeActive = false;
    // Ends the session — the next stroke (from either a fresh enterPenMode
    // or, defensively, a stray call) starts a new group rather than
    // silently joining whatever was just finished.
    this.currentPenGroupId = null;
    this.outer.removeClass('is-pen-mode');
    this.outer.removeClass('is-eraser-mode');
    this.penToolBtn?.removeClass('is-active');
    this.inkHitPaths.forEach(p => { p.style.pointerEvents = 'stroke'; });
    this.hidePenColorPicker();
    this.hidePenBanner();
  },

  showPenBanner(this: FreeformRenderer): void {
    this.hidePenBanner();
    const banner = this.container.createDiv('visual-notes-pen-banner');
    const iconEl = banner.createDiv('visual-notes-pen-banner-icon');
    setIcon(iconEl, 'pencil');
    banner.createSpan({ cls: 'visual-notes-pen-banner-text', text: 'Drawing — hold Shift for straight lines' });
    const doneBtn = banner.createDiv('visual-notes-pen-banner-done');
    doneBtn.setText('Done (Enter)');
    doneBtn.addEventListener('click', (e) => { e.stopPropagation(); this.exitPenMode(); });
    this.penBanner = banner;
  },

  hidePenBanner(this: FreeformRenderer): void {
    this.penBanner?.remove();
    this.penBanner = null;
  },

  showPenColorPicker(this: FreeformRenderer): void {
    this.hidePenColorPicker();
    const picker = this.toolbarEl.createDiv('visual-notes-pen-picker');
    this.penColorPicker = picker;

    // Instrument row: pen / highlighter / eraser.
    const toolRow = picker.createDiv('visual-notes-pen-picker-row');
    const tools: [typeof this.penTool, string, string][] = [
      ['pen', 'pencil', 'Pen'],
      ['highlighter', 'highlighter', 'Highlighter'],
      ['eraser', 'eraser', 'Eraser'],
    ];
    for (const [tool, icon, label] of tools) {
      const btn = toolRow.createDiv('visual-notes-pen-tool-btn');
      btn.setAttribute('aria-label', label);
      setIcon(btn, icon);
      btn.toggleClass('is-selected', tool === this.penTool);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.penTool = tool;
        this.outer.toggleClass('is-eraser-mode', tool === 'eraser');
        // Rebuild the whole picker: the swatch palette swaps between pen
        // and highlighter colors, and the eraser has no rows at all.
        this.showPenColorPicker();
      });
    }

    // The eraser has no color or width — just the instrument row.
    if (this.penTool === 'eraser') return;

    const isHl = this.penTool === 'highlighter';
    const swatchRow = picker.createDiv('visual-notes-pen-picker-row');
    const PEN_COLORS = ['#1f2937', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ffffff'];
    // The colors an actual highlighter set comes in — fluoro yellow first.
    const HIGHLIGHT_COLORS = ['#ffeb3b', '#b2ff59', '#ff80ab', '#ffb74d', '#81d4fa', '#ce93d8'];
    const palette = isHl ? HIGHLIGHT_COLORS : PEN_COLORS;
    const currentColor = isHl ? this.currentHighlightColor : this.currentInkColor;
    for (const hex of palette) {
      const sw = swatchRow.createDiv('visual-notes-pen-swatch');
      sw.style.backgroundColor = hex;
      sw.toggleClass('is-selected', hex === currentColor);
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isHl) this.currentHighlightColor = hex; else this.currentInkColor = hex;
        swatchRow.querySelectorAll<HTMLElement>('.visual-notes-pen-swatch').forEach(s => s.removeClass('is-selected'));
        sw.addClass('is-selected');
      });
    }

    const widthRow = picker.createDiv('visual-notes-pen-picker-row');
    const widths: [number, string][] = [[2, 'Thin'], [4, 'Medium'], [8, 'Thick']];
    for (const [w, label] of widths) {
      const btn = widthRow.createDiv('visual-notes-pen-width-btn');
      btn.setText(label);
      btn.toggleClass('is-selected', w === this.currentInkWidth);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.currentInkWidth = w;
        widthRow.querySelectorAll<HTMLElement>('.visual-notes-pen-width-btn').forEach(b => b.removeClass('is-selected'));
        btn.addClass('is-selected');
      });
    }
  },

  hidePenColorPicker(this: FreeformRenderer): void {
    this.penColorPicker?.remove();
    this.penColorPicker = null;
  },

  refreshAllConnections(this: FreeformRenderer): void {
    this.connectionPaths.forEach(p => p.remove());
    this.connectionPaths.clear();
    this.connectionHitPaths.forEach(p => p.remove());
    this.connectionHitPaths.clear();
    this.connectionLabelEls.forEach(g => g.remove());
    this.connectionLabelEls.clear();
    this.connectionSelectPath?.remove(); this.connectionSelectPath = null;
    this.connectionBendHandle?.remove(); this.connectionBendHandle = null;
    this.hideConnectionEndpointHandles();
    this.selectedConnectionId = null;
    this.hideConnectionProps();
    // On a board with hundreds of connections, building the (potentially
    // curved/elbow-routed) path for every one of them up front — most of
    // which are nowhere near the visible viewport — is real, avoidable
    // work. Only construct DOM/paths for connections visible now; panning/
    // zooming promotes and demotes the rest via refreshConnectionCulling
    // (scheduled from applyViewport).
    const view = this.visibleCanvasBounds();
    for (const conn of this.board.connections) {
      if (this.isConnectionVisible(conn, view)) this.renderSingleConnection(conn);
    }
  },

  // Canvas-space rect of the area actually on screen right now, expanded by
  // a screen-space margin so connections don't visibly pop in/out right at
  // the viewport edge.
  visibleCanvasBounds(this: FreeformRenderer): { x: number; y: number; w: number; h: number } {
    const rect = this.outer.getBoundingClientRect();
    const margin = 300;
    const topLeft = screenToCanvas(-margin, -margin, this.vp);
    const bottomRight = screenToCanvas(rect.width + margin, rect.height + margin, this.vp);
    return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
  },

  // A connection is worth rendering if EITHER endpoint is anywhere near the
  // visible area — cheap data-only check (card.x/y/w/h or a free point),
  // no DOM measurement, safe to run for every connection on every viewport
  // change.
  isConnectionVisible(this: FreeformRenderer, conn: Connection, view: { x: number; y: number; w: number; h: number }): boolean {
    const from = this.getConnEndpointRect(conn.fromCardId, conn.fromPoint);
    const to = this.getConnEndpointRect(conn.toCardId, conn.toPoint);
    const intersects = (r: { x: number; y: number; w: number; h: number } | null) =>
      !!r && r.x < view.x + view.w && r.x + r.w > view.x && r.y < view.y + view.h && r.y + r.h > view.y;
    return intersects(from) || intersects(to);
  },

  removeSingleConnection(this: FreeformRenderer, id: string): void {
    this.connectionPaths.get(id)?.remove(); this.connectionPaths.delete(id);
    this.connectionHitPaths.get(id)?.remove(); this.connectionHitPaths.delete(id);
    this.connectionLabelEls.get(id)?.remove(); this.connectionLabelEls.delete(id);
    if (this.selectedConnectionId === id) this.deselectConnection();
  },

  // rAF-batched: applyViewport fires on every raw wheel/pointermove event
  // during a pan/zoom gesture, but re-checking a few hundred connections'
  // visibility doesn't need to happen more often than once per painted
  // frame — same reasoning as the drag/resize batching in bindCanvasEvents.
  scheduleCullingRefresh(this: FreeformRenderer): void {
    if (this.cullFramePending) return;
    this.cullFramePending = true;
    requestAnimationFrame(() => {
      this.cullFramePending = false;
      this.refreshConnectionCulling();
    });
  },

  refreshConnectionCulling(this: FreeformRenderer): void {
    const view = this.visibleCanvasBounds();
    for (const conn of this.board.connections) {
      const visible = this.isConnectionVisible(conn, view);
      const rendered = this.connectionPaths.has(conn.id);
      if (visible && !rendered) this.renderSingleConnection(conn);
      else if (!visible && rendered) this.removeSingleConnection(conn.id);
    }
  },

  renderSingleConnection(this: FreeformRenderer, conn: Connection): void {
    const d = this.buildConnectionPath(conn); if (!d) return;
    const ns = 'http://www.w3.org/2000/svg';

    // Wide transparent hit area for easy clicking
    const hit = activeDocument.createElementNS(ns, 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('stroke', '#000000');
    hit.setAttribute('stroke-opacity', '0');
    hit.setAttribute('stroke-width', '12');
    hit.setAttribute('fill', 'none');
    hit.setAttribute('cursor', 'pointer');
    hit.setAttribute('pointer-events', 'stroke');
    hit.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this.selectConnection(conn.id);
      // A fully card-anchored connection already follows its cards — only
      // one with at least one free end can be dragged as a whole; grabbing
      // the line body (rather than an endpoint handle) moves every free end
      // together, card-anchored ends (if any) staying put.
      if (conn.fromCardId && conn.toCardId) return;
      const startFrom = conn.fromPoint ? { ...conn.fromPoint } : null;
      const startTo = conn.toPoint ? { ...conn.toPoint } : null;
      const sx = e.clientX, sy = e.clientY;
      let moved = false;
      const onMove = (e2: PointerEvent) => {
        if (!moved) {
          if (Math.hypot(e2.clientX - sx, e2.clientY - sy) < DRAG_THRESHOLD) return;
          moved = true; this.pushUndo();
        }
        const dx = (e2.clientX - sx) / this.vp.zoom;
        const dy = (e2.clientY - sy) / this.vp.zoom;
        if (startFrom && !conn.fromCardId) conn.fromPoint = { x: startFrom.x + dx, y: startFrom.y + dy };
        if (startTo && !conn.toCardId) conn.toPoint = { x: startTo.x + dx, y: startTo.y + dy };
        this.rerenderConnection(conn);
      };
      const onUp = () => {
        activeDocument.removeEventListener('pointermove', onMove);
        activeDocument.removeEventListener('pointerup', onUp);
        if (moved) this.scheduleSave();
      };
      activeDocument.addEventListener('pointermove', onMove);
      activeDocument.addEventListener('pointerup', onUp);
    });
    hit.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.selectConnection(conn.id);
      const menu = this.newMenu();
      menu.addItem(i => i.setTitle('Delete connection').setIcon('trash-2').onClick(() => this.deleteSelectedConnection()));
      menu.showAtMouseEvent(e);
    });
    this.hitSvgEl.appendChild(hit);
    this.connectionHitPaths.set(conn.id, hit);

    // Visible path (pointer-events:none so hit area handles all events)
    const path = activeDocument.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', conn.color);
    path.setAttribute('stroke-width', String(conn.thickness));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'butt');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('pointer-events', 'none');
    if (conn.style === 'dashed') {
      path.setAttribute('stroke-dasharray', `${conn.thickness * 5} ${conn.thickness * 4}`);
    }
    if (conn.arrowhead === 'end' || conn.arrowhead === 'both') {
      path.setAttribute('marker-end', `url(#${this.getOrCreateMarker(conn.color, conn.thickness, 'end')})`);
    }
    if (conn.arrowhead === 'both') {
      path.setAttribute('marker-start', `url(#${this.getOrCreateMarker(conn.color, conn.thickness, 'start')})`);
    }
    this.svgEl.appendChild(path);
    this.connectionPaths.set(conn.id, path);
    this.renderConnectionLabel(conn);
  },

  buildConnectionPath(this: FreeformRenderer, conn: Connection): string | null {
    const from = this.getConnEndpointRect(conn.fromCardId, conn.fromPoint);
    const to   = this.getConnEndpointRect(conn.toCardId, conn.toPoint);
    if (!from || !to) return null;
    if (conn.routing === 'elbow') {
      const ori = resolveOrientation(from, to, conn.elbowOrientation ?? 'auto');
      const { src, tgt } = elbowAnchors(from, to, ori);
      return buildElbowPath(src, tgt, ori);
    }
    const { src, tgt } = straightAnchors(from, to);
    if (conn.bend) return buildCurvedPath(src, tgt, conn.bend);
    return buildStraightPath(src, tgt);
  },

  getCardRect(this: FreeformRenderer, cardId: string): { x: number; y: number; w: number; h: number } | null {
    const card = this.board.cards.find(c => c.id === cardId);
    if (!card) return null;
    return { x: card.x ?? 0, y: card.y ?? 0, w: card.w ?? TILE_DEFAULT_W, h: card.h ?? TILE_DEFAULT_H };
  },

  getConnEndpointRect(this: FreeformRenderer, 
    cardId: string | undefined, point: { x: number; y: number } | undefined,
  ): { x: number; y: number; w: number; h: number } | null {
    if (cardId) return this.getCardRect(cardId);
    if (point) return { x: point.x, y: point.y, w: 0, h: 0 };
    return null;
  },

  connectionLabelPos(this: FreeformRenderer, conn: Connection): { x: number; y: number } | null {
    const from = this.getConnEndpointRect(conn.fromCardId, conn.fromPoint);
    const to   = this.getConnEndpointRect(conn.toCardId, conn.toPoint);
    if (!from || !to) return null;
    const { src, tgt } = conn.routing === 'elbow'
      ? elbowAnchors(from, to, resolveOrientation(from, to, conn.elbowOrientation ?? 'auto'))
      : straightAnchors(from, to);
    if (conn.routing !== 'elbow' && conn.bend) return curveThroughPoint(src, tgt, conn.bend);
    return { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 };
  },

  renderConnectionLabel(this: FreeformRenderer, conn: Connection): void {
    if (!conn.label) return;
    const pos = this.connectionLabelPos(conn); if (!pos) return;
    const ns = 'http://www.w3.org/2000/svg';
    const g = activeDocument.createElementNS(ns, 'g');
    g.setAttribute('pointer-events', 'none');
    const bg = getComputedStyle(activeDocument.body).getPropertyValue('--background-primary').trim() || '#ffffff';
    const size = conn.labelSize ?? 14;
    const addText = (strokeColor: string | null, fillColor: string) => {
      const t = activeDocument.createElementNS(ns, 'text');
      t.setAttribute('x', String(pos.x)); t.setAttribute('y', String(pos.y));
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
      t.setAttribute('font-size', String(size));
      // Halo stroke scales with the font so the knockout stays proportionate.
      if (strokeColor) { t.setAttribute('stroke', strokeColor); t.setAttribute('stroke-width', String(Math.round(size * 0.45))); t.setAttribute('stroke-linejoin', 'round'); }
      t.setAttribute('fill', fillColor);
      t.textContent = conn.label ?? '';
      g.appendChild(t);
    };
    addText(bg, bg);
    addText(null, conn.color);
    this.svgEl.appendChild(g);
    this.connectionLabelEls.set(conn.id, g);
  },

  updateConnectionsForCard(this: FreeformRenderer, cardId: string): void {
    for (const conn of this.board.connections) {
      if (conn.fromCardId !== cardId && conn.toCardId !== cardId) continue;
      // Culled (off-screen, no DOM) — nothing to update. Its data-derived
      // path gets rebuilt correctly if/when it's promoted back into view.
      if (!this.connectionPaths.has(conn.id)) continue;
      const d = this.buildConnectionPath(conn); if (!d) continue;
      this.connectionPaths.get(conn.id)?.setAttribute('d', d);
      this.connectionHitPaths.get(conn.id)?.setAttribute('d', d);
      if (this.selectedConnectionId === conn.id && this.connectionSelectPath) {
        this.connectionSelectPath.setAttribute('d', d);
        this.showConnectionBendHandle(conn);
      }
      const labelPos = this.connectionLabelPos(conn);
      const labelG = this.connectionLabelEls.get(conn.id);
      if (labelPos && labelG) {
        labelG.querySelectorAll('text').forEach(t => {
          t.setAttribute('x', String(labelPos.x));
          t.setAttribute('y', String(labelPos.y));
        });
      }
    }
  },

  getOrCreateMarker(this: FreeformRenderer, color: string, thickness: number, end: 'end' | 'start'): string {
    const id = `ibm-${end === 'end' ? 'e' : 's'}-${color.replace('#', '')}-${thickness}`;
    if (!this.svgDefs.querySelector(`#${id}`)) {
      const ns = 'http://www.w3.org/2000/svg';
      const size = 10 + thickness * 2;
      const mid  = Math.round(size * 0.42);
      const h    = mid * 2;
      const marker = activeDocument.createElementNS(ns, 'marker');
      marker.setAttribute('id', id);
      marker.setAttribute('markerUnits', 'userSpaceOnUse');
      marker.setAttribute('markerWidth', String(size));
      marker.setAttribute('markerHeight', String(h));
      marker.setAttribute('refX', end === 'end' ? String(size) : '0');
      marker.setAttribute('refY', String(mid));
      marker.setAttribute('orient', end === 'end' ? 'auto' : 'auto-start-reverse');
      const poly = activeDocument.createElementNS(ns, 'polygon');
      poly.setAttribute('points', `0 0, ${size} ${mid}, 0 ${h}`);
      poly.setAttribute('fill', color);
      marker.appendChild(poly);
      this.svgDefs.appendChild(marker);
    }
    return id;
  },

  enterConnectMode(this: FreeformRenderer): void {
    this.connectMode = true;
    this.outer.addClass('is-connect-mode');
    this.connectToolBtn?.addClass('is-active');
  },

  exitConnectMode(this: FreeformRenderer): void {
    this.connectMode = false;
    this.outer?.removeClass('is-connect-mode');
    this.connectToolBtn?.removeClass('is-active');
    if (this.connectSourceId) {
      this.cardEls.get(this.connectSourceId)?.removeClass('is-connect-source');
      this.connectSourceId = null;
    }
    this.stopConnectSourceGhost();
  },

  toggleConnectMode(this: FreeformRenderer): void {
    if (this.connectMode) this.exitConnectMode(); else this.enterConnectMode();
  },

  addConnectionHandles(this: FreeformRenderer, el: HTMLElement, card: SupportedCard): void {
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const handle = el.createDiv(`visual-notes-connection-handle visual-notes-connection-handle-${side}`);
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        this.startHandleDrag(e, handle, card, side);
      });
    }
  },

  startHandleDrag(this: FreeformRenderer, 
    e: PointerEvent, handleEl: HTMLElement,
    card: SupportedCard, side: 'n' | 's' | 'e' | 'w'
  ): void {
    const outerRect = this.outer.getBoundingClientRect();
    const srcEdge = this.getEdgeMidpoint(card, side);
    let hoveredId: string | null = null;

    // cardIdAtPoint (elementsFromPoint) and the ghost-path rebuild are
    // layout-dependent — same rAF coalescing as card drag/resize above, so
    // a fast mouse doesn't run them more often than the screen repaints.
    let latestEv: PointerEvent | null = null;
    let moveFrameId = 0;
    let moveFramePending = false;
    const applyHandleMove = (ev: PointerEvent) => {
      const cp = screenToCanvas(ev.clientX - outerRect.left, ev.clientY - outerRect.top, this.vp);
      this.updateGhostPath(srcEdge.x, srcEdge.y, cp.x, cp.y);
      const id = this.cardIdAtPoint(ev.clientX, ev.clientY);
      const newHover = (id && id !== card.id) ? id : null;
      if (newHover !== hoveredId) {
        if (hoveredId) this.cardEls.get(hoveredId)?.removeClass('is-connect-target');
        hoveredId = newHover;
        if (hoveredId) this.cardEls.get(hoveredId)?.addClass('is-connect-target');
      }
    };
    const onMove = (ev: PointerEvent) => {
      latestEv = ev;
      if (moveFramePending) return;
      moveFramePending = true;
      moveFrameId = requestAnimationFrame(() => { moveFramePending = false; if (latestEv) applyHandleMove(latestEv); });
    };

    const onUp = (ev: PointerEvent) => {
      handleEl.removeEventListener('pointermove', onMove);
      handleEl.removeEventListener('pointerup', onUp);
      if (moveFramePending) { cancelAnimationFrame(moveFrameId); moveFramePending = false; }
      this.removeGhostPath();
      if (hoveredId) this.cardEls.get(hoveredId)?.removeClass('is-connect-target');
      const targetId = this.cardIdAtPoint(ev.clientX, ev.clientY);
      if (targetId && targetId !== card.id) this.finishConnection(card.id, targetId);
    };

    handleEl.addEventListener('pointermove', onMove);
    handleEl.addEventListener('pointerup', onUp);
  },

  getEdgeMidpoint(this: FreeformRenderer, card: Card, side: 'n' | 's' | 'e' | 'w'): { x: number; y: number } {
    const cx = (card.x ?? 0) + (card.w ?? TILE_DEFAULT_W) / 2;
    const cy = (card.y ?? 0) + (card.h ?? TILE_DEFAULT_H) / 2;
    switch (side) {
      case 'n': return { x: cx, y: card.y ?? 0 };
      case 's': return { x: cx, y: (card.y ?? 0) + (card.h ?? TILE_DEFAULT_H) };
      case 'e': return { x: (card.x ?? 0) + (card.w ?? TILE_DEFAULT_W), y: cy };
      case 'w': return { x: card.x ?? 0, y: cy };
    }
  },

  updateGhostPath(this: FreeformRenderer, sx: number, sy: number, tx: number, ty: number): void {
    if (!this.ghostPath) {
      const ns = 'http://www.w3.org/2000/svg';
      this.ghostPath = activeDocument.createElementNS(ns, 'path');
      this.ghostPath.setAttribute('fill', 'none');
      this.ghostPath.setAttribute('stroke', 'var(--interactive-accent)');
      this.ghostPath.setAttribute('stroke-width', '1.5');
      this.ghostPath.setAttribute('stroke-dasharray', '6 4');
      this.ghostPath.setAttribute('stroke-linecap', 'round');
      this.ghostPath.setAttribute('pointer-events', 'none');
      this.svgEl.appendChild(this.ghostPath);
    }
    this.ghostPath.setAttribute('d', `M ${sx} ${sy} L ${tx} ${ty}`);
  },

  removeGhostPath(this: FreeformRenderer): void {
    if (this.ghostPath) { this.ghostPath.remove(); this.ghostPath = null; }
  },

  startConnectSourceGhost(this: FreeformRenderer, sourceId: string): void {
    const sourceCard = this.board.cards.find(c => c.id === sourceId);
    if (!sourceCard) return;
    this.connectMoveListener = (ev: PointerEvent) => {
      const rect = this.outer.getBoundingClientRect();
      const cursor = screenToCanvas(ev.clientX - rect.left, ev.clientY - rect.top, this.vp);
      const rect2 = this.getCardRect(sourceId);
      if (!rect2) return;
      const fcx = rect2.x + rect2.w / 2, fcy = rect2.y + rect2.h / 2;
      const src = rectExitPoint(fcx, fcy, cursor.x, cursor.y, rect2);
      this.updateGhostPath(src.x, src.y, cursor.x, cursor.y);
    };
    this.outer.addEventListener('pointermove', this.connectMoveListener);
  },

  stopConnectSourceGhost(this: FreeformRenderer): void {
    if (this.connectMoveListener) {
      this.outer.removeEventListener('pointermove', this.connectMoveListener);
      this.connectMoveListener = null;
    }
    this.removeGhostPath();
  },

  cardIdAtPoint(this: FreeformRenderer, clientX: number, clientY: number): string | null {
    const els = activeDocument.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const cardEl = el.closest<HTMLElement>('[data-id]');
      if (cardEl?.dataset.id && this.cardEls.has(cardEl.dataset.id)) return cardEl.dataset.id;
    }
    return null;
  },

  finishConnection(this: FreeformRenderer, fromId: string, toId: string): void {
    if (fromId === toId) return;
    const exists = this.board.connections.some(
      c => (c.fromCardId === fromId && c.toCardId === toId) ||
           (c.fromCardId === toId   && c.toCardId === fromId)
    );
    if (exists) return;
    const conn: Connection = {
      id: crypto.randomUUID(),
      fromCardId: fromId,
      toCardId: toId,
      routing: 'straight',
      color: this.resolveDefaultConnectionColor(),
      style: 'solid',
      arrowhead: 'end',
      thickness: 2,
    };
    this.pushUndo();
    this.board.connections.push(conn);
    this.renderSingleConnection(conn);
    this.scheduleSave();
  },

  startFreeLineDrag(this: FreeformRenderer, startEvent: PointerEvent): void {
    const rect = this.outer.getBoundingClientRect();
    const startCp = screenToCanvas(startEvent.clientX - rect.left, startEvent.clientY - rect.top, this.vp);

    const ns = 'http://www.w3.org/2000/svg';
    const livePath = activeDocument.createElementNS(ns, 'path');
    livePath.setAttribute('fill', 'none');
    livePath.setAttribute('stroke', 'var(--interactive-accent)');
    livePath.setAttribute('stroke-width', '1.5');
    livePath.setAttribute('stroke-dasharray', '6 4');
    livePath.setAttribute('stroke-linecap', 'round');
    livePath.setAttribute('pointer-events', 'none');
    livePath.setAttribute('d', `M ${startCp.x} ${startCp.y} L ${startCp.x} ${startCp.y}`);
    this.svgEl.appendChild(livePath);

    let endCp = { ...startCp };
    const onMove = (e: PointerEvent) => {
      endCp = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top, this.vp);
      livePath.setAttribute('d', `M ${startCp.x} ${startCp.y} L ${endCp.x} ${endCp.y}`);
    };
    const onUp = () => {
      activeDocument.removeEventListener('pointermove', onMove);
      activeDocument.removeEventListener('pointerup', onUp);
      livePath.remove();
      this.exitConnectMode();
      // A plain click (no real drag) still drops a default straight arrow —
      // same as dragging the Line button straight from the toolbar does —
      // rather than requiring the user to drag one out by hand every time.
      if (Math.hypot(endCp.x - startCp.x, endCp.y - startCp.y) < 8) {
        this.addDefaultArrowAt(startCp.x, startCp.y);
        return;
      }
      const conn: Connection = {
        id: crypto.randomUUID(),
        fromPoint: { x: startCp.x, y: startCp.y },
        toPoint: { x: endCp.x, y: endCp.y },
        routing: 'straight',
        color: this.resolveDefaultConnectionColor(),
        style: 'solid',
        arrowhead: 'end',
        thickness: 2,
      };
      this.pushUndo();
      this.board.connections.push(conn);
      this.renderSingleConnection(conn);
      this.selectConnection(conn.id);
      this.scheduleSave();
    };
    activeDocument.addEventListener('pointermove', onMove);
    activeDocument.addEventListener('pointerup', onUp);
  },

  addDefaultArrowAt(this: FreeformRenderer, cx: number, cy: number): void {
    const half = 80;
    const conn: Connection = {
      id: crypto.randomUUID(),
      fromPoint: { x: snap(cx - half), y: snap(cy) },
      toPoint: { x: snap(cx + half), y: snap(cy) },
      routing: 'straight',
      color: this.resolveDefaultConnectionColor(),
      style: 'solid',
      arrowhead: 'end',
      thickness: 2,
    };
    this.pushUndo();
    this.board.connections.push(conn);
    this.renderSingleConnection(conn);
    this.selectConnection(conn.id);
    this.scheduleSave();
  },

  resolveDefaultConnectionColor(this: FreeformRenderer): string {
    const tmp = activeDocument.body.createDiv('ib-color-probe');
    const computed = getComputedStyle(tmp).color;
    tmp.remove();
    const m = computed.match(/\d+/g);
    if (!m || m.length < 3) return '#888888';
    return '#' + [m[0], m[1], m[2]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  },

  selectConnection(this: FreeformRenderer, id: string): void {
    if (this.selectedConnectionId === id) return;
    this.deselectConnection();
    this.selection.clear(); this.refreshSelectionVisuals();
    this.selectedConnectionId = id;
    const conn = this.board.connections.find(c => c.id === id); if (!conn) return;
    const d = this.buildConnectionPath(conn); if (!d) return;

    const ns = 'http://www.w3.org/2000/svg';
    this.connectionSelectPath = activeDocument.createElementNS(ns, 'path');
    this.connectionSelectPath.setAttribute('d', d);
    this.connectionSelectPath.setAttribute('stroke', 'var(--interactive-accent)');
    this.connectionSelectPath.setAttribute('stroke-width', String(conn.thickness + 6));
    this.connectionSelectPath.setAttribute('stroke-opacity', '0.3');
    this.connectionSelectPath.setAttribute('fill', 'none');
    this.connectionSelectPath.setAttribute('stroke-linecap', 'round');
    this.connectionSelectPath.setAttribute('pointer-events', 'none');
    this.hitSvgEl.appendChild(this.connectionSelectPath);
    this.showConnectionBendHandle(conn);
    this.showConnectionEndpointHandles(conn);
    this.showConnectionProps(conn);
  },

  deselectConnection(this: FreeformRenderer): void {
    if (!this.selectedConnectionId) return;
    this.connectionSelectPath?.remove(); this.connectionSelectPath = null;
    this.connectionBendHandle?.remove(); this.connectionBendHandle = null;
    this.hideConnectionEndpointHandles();
    this.selectedConnectionId = null;
    this.hideConnectionProps();
    this.contextBar?.hide();
  },

  showConnectionEndpointHandles(this: FreeformRenderer, conn: Connection): void {
    this.hideConnectionEndpointHandles();
    const ns = 'http://www.w3.org/2000/svg';

    const addHandle = (getPoint: () => { x: number; y: number } | undefined, setPoint: (p: { x: number; y: number }) => void) => {
      const p = getPoint();
      if (!p) return;
      const handle = activeDocument.createElementNS(ns, 'circle') as SVGCircleElement;
      handle.setAttribute('cx', String(p.x));
      handle.setAttribute('cy', String(p.y));
      handle.setAttribute('r', '6');
      handle.setAttribute('fill', 'var(--interactive-accent)');
      handle.setAttribute('stroke', 'var(--background-primary)');
      handle.setAttribute('stroke-width', '2');
      handle.classList.add('visual-notes-connection-bend-handle');
      this.hitSvgEl.appendChild(handle);
      this.connectionEndpointHandles.push(handle);

      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        this.pushUndo();
        const rect = this.outer.getBoundingClientRect();
        const onMove = (e2: PointerEvent) => {
          const cp = screenToCanvas(e2.clientX - rect.left, e2.clientY - rect.top, this.vp);
          setPoint({ x: cp.x, y: cp.y });
          this.rerenderConnection(conn);
        };
        const onUp = () => {
          activeDocument.removeEventListener('pointermove', onMove);
          activeDocument.removeEventListener('pointerup', onUp);
          this.scheduleSave();
        };
        activeDocument.addEventListener('pointermove', onMove);
        activeDocument.addEventListener('pointerup', onUp);
      });
    };

    if (!conn.fromCardId) addHandle(() => conn.fromPoint, (p) => { conn.fromPoint = p; });
    if (!conn.toCardId) addHandle(() => conn.toPoint, (p) => { conn.toPoint = p; });
  },

  hideConnectionEndpointHandles(this: FreeformRenderer): void {
    this.connectionEndpointHandles.forEach(h => h.remove());
    this.connectionEndpointHandles = [];
  },

  showConnectionBendHandle(this: FreeformRenderer, conn: Connection): void {
    this.connectionBendHandle?.remove();
    this.connectionBendHandle = null;
    if (conn.routing === 'elbow') return; // bending only applies to straight routing

    const from = this.getConnEndpointRect(conn.fromCardId, conn.fromPoint);
    const to = this.getConnEndpointRect(conn.toCardId, conn.toPoint);
    if (!from || !to) return;
    const { src, tgt } = straightAnchors(from, to);
    const pt = curveThroughPoint(src, tgt, conn.bend ?? 0);

    const ns = 'http://www.w3.org/2000/svg';
    const handle = activeDocument.createElementNS(ns, 'circle') as SVGCircleElement;
    handle.setAttribute('cx', String(pt.x));
    handle.setAttribute('cy', String(pt.y));
    handle.setAttribute('r', '6');
    handle.setAttribute('fill', 'var(--interactive-accent)');
    handle.setAttribute('stroke', 'var(--background-primary)');
    handle.setAttribute('stroke-width', '2');
    handle.classList.add('visual-notes-connection-bend-handle');
    this.hitSvgEl.appendChild(handle);
    this.connectionBendHandle = handle;

    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = this.outer.getBoundingClientRect();
      let dragged = false;
      const onMove = (e2: PointerEvent) => {
        dragged = true;
        const cp = screenToCanvas(e2.clientX - rect.left, e2.clientY - rect.top, this.vp);
        const from2 = this.getConnEndpointRect(conn.fromCardId, conn.fromPoint);
        const to2 = this.getConnEndpointRect(conn.toCardId, conn.toPoint);
        if (!from2 || !to2) return;
        const anchors = straightAnchors(from2, to2);
        conn.bend = Math.round(perpendicularOffset(anchors.src, anchors.tgt, cp));
        this.rerenderConnection(conn);
      };
      const onUp = () => {
        activeDocument.removeEventListener('pointermove', onMove);
        activeDocument.removeEventListener('pointerup', onUp);
        if (dragged) { this.scheduleSave(); }
      };
      this.pushUndo();
      activeDocument.addEventListener('pointermove', onMove);
      activeDocument.addEventListener('pointerup', onUp);
    });

    handle.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (!conn.bend) return;
      this.pushUndo();
      conn.bend = undefined;
      this.rerenderConnection(conn);
      this.scheduleSave();
    });
  },

  rerenderConnection(this: FreeformRenderer, conn: Connection): void {
    this.connectionPaths.get(conn.id)?.remove();
    this.connectionHitPaths.get(conn.id)?.remove();
    this.connectionPaths.delete(conn.id);
    this.connectionHitPaths.delete(conn.id);
    this.connectionLabelEls.get(conn.id)?.remove();
    this.connectionLabelEls.delete(conn.id);
    this.renderSingleConnection(conn);
    if (this.selectedConnectionId === conn.id && this.connectionSelectPath) {
      const d = this.buildConnectionPath(conn);
      if (d) {
        this.connectionSelectPath.setAttribute('d', d);
        this.connectionSelectPath.setAttribute('stroke-width', String(conn.thickness + 6));
      }
      // Halo stays in hitSvgEl — just update its path data above
      this.showConnectionBendHandle(conn);
      this.showConnectionEndpointHandles(conn);
    }
  },

  deleteSelectedConnection(this: FreeformRenderer): void {
    if (!this.selectedConnectionId) return;
    const id = this.selectedConnectionId;
    this.pushUndo();
    this.deselectConnection();
    this.board.connections = this.board.connections.filter(c => c.id !== id);
    this.connectionPaths.get(id)?.remove(); this.connectionPaths.delete(id);
    this.connectionHitPaths.get(id)?.remove(); this.connectionHitPaths.delete(id);
    this.connectionLabelEls.get(id)?.remove(); this.connectionLabelEls.delete(id);
    this.scheduleSave();
  },

  showConnectionProps(this: FreeformRenderer, conn: Connection): void {
    this.hideConnectionProps();
    const panel = this.container.createDiv('visual-notes-conn-props');
    // Both this panel and the card toolbar default to bottom-center — when
    // the toolbar is docked there, shift this panel up above it.
    if (this.toolbarPosition === 'bottom') panel.addClass('is-above-toolbar');
    this.connPropsEl = panel;

    // ── Label ────────────────────────────────────────────────────
    const labelWrap = panel.createDiv('visual-notes-conn-props-label-wrap');
    const labelInput = labelWrap.createEl('input');
    labelInput.type = 'text'; labelInput.placeholder = 'Add label…';
    labelInput.addClass('visual-notes-conn-props-label-input');
    labelInput.value = conn.label ?? '';
    const origLabel = conn.label;
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') labelInput.blur();
      else if (e.key === 'Escape') { labelInput.value = origLabel ?? ''; labelInput.blur(); }
      e.stopPropagation();
    });
    labelInput.addEventListener('blur', () => {
      const val = labelInput.value.trim() || undefined;
      if (val === conn.label) return;
      this.pushUndo(); conn.label = val;
      this.rerenderConnection(conn); this.scheduleSave();
    });

    panel.createDiv('visual-notes-conn-props-sep');

    // ── Label size ──────────────────────────────────────────────
    const sizeGroup = panel.createDiv('visual-notes-conn-props-group visual-notes-conn-props-size-group');
    sizeGroup.createSpan({ text: 'Aa', cls: 'visual-notes-conn-props-size-hint' });
    const sizeSlider = sizeGroup.createEl('input');
    sizeSlider.type = 'range';
    sizeSlider.min = '10'; sizeSlider.max = '32'; sizeSlider.step = '1';
    sizeSlider.value = String(conn.labelSize ?? 14);
    sizeSlider.addClass('visual-notes-conn-props-size-slider');
    sizeSlider.setAttribute('aria-label', 'Label text size');
    sizeSlider.addEventListener('pointerdown', e => e.stopPropagation());
    const sizeReadout = sizeGroup.createSpan({ text: `${sizeSlider.value}`, cls: 'visual-notes-conn-props-size-value' });
    sizeReadout.setAttribute('title', 'Double-click to reset');
    // The slider fires continuously while dragging — snapshot undo once per
    // gesture (detected by a pause), not once per pixel of movement.
    let sizeUndoAt = 0;
    const applySize = (size: number) => {
      const now = Date.now();
      if (now - sizeUndoAt > 600) this.pushUndo();
      sizeUndoAt = now;
      conn.labelSize = size;
      this.rerenderConnection(conn);
      this.scheduleSave();
    };
    sizeSlider.addEventListener('input', () => {
      sizeReadout.setText(sizeSlider.value);
      applySize(Number(sizeSlider.value));
    });
    sizeReadout.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      sizeSlider.value = '14';
      sizeReadout.setText('14');
      applySize(14);
    });

    panel.createDiv('visual-notes-conn-props-sep');

    // ── Color swatches ──────────────────────────────────────────
    const colorGroup = panel.createDiv('visual-notes-conn-props-group');
    for (const hex of CONN_COLOR_PRESETS) {
      const swatch = colorGroup.createDiv('visual-notes-conn-props-swatch');
      swatch.style.background = hex;
      swatch.setAttribute('aria-label', hex);
      swatch.toggleClass('is-active', conn.color.toLowerCase() === hex);
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pushUndo(); conn.color = hex;
        this.rerenderConnection(conn);
        colorGroup.querySelectorAll<HTMLElement>('.visual-notes-conn-props-swatch').forEach(s => s.removeClass('is-active'));
        swatch.addClass('is-active');
        this.scheduleSave();
      });
    }

    panel.createDiv('visual-notes-conn-props-sep');

    // ── Thickness ───────────────────────────────────────────────
    const thickGroup = panel.createDiv('visual-notes-conn-props-group');
    for (const t of [2, 4, 6] as const) {
      const btn = thickGroup.createDiv('visual-notes-conn-props-btn');
      btn.setAttribute('aria-label', `Thickness ${t}`);
      btn.toggleClass('is-active', conn.thickness === t);
      const svg = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '20'); svg.setAttribute('height', '16');
      svg.setAttribute('viewBox', '0 0 20 16');
      const line = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '2'); line.setAttribute('y1', '8');
      line.setAttribute('x2', '18'); line.setAttribute('y2', '8');
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', String(t));
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line); btn.appendChild(svg);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pushUndo(); conn.thickness = t;
        this.rerenderConnection(conn);
        thickGroup.querySelectorAll<HTMLElement>('.visual-notes-conn-props-btn').forEach(b => b.removeClass('is-active'));
        btn.addClass('is-active');
        this.scheduleSave();
      });
    }

    panel.createDiv('visual-notes-conn-props-sep');

    // ── Style: solid / dashed ───────────────────────────────────
    const styleGroup = panel.createDiv('visual-notes-conn-props-group');
    for (const style of ['solid', 'dashed'] as const) {
      const btn = styleGroup.createDiv('visual-notes-conn-props-btn');
      btn.setAttribute('aria-label', style);
      btn.toggleClass('is-active', conn.style === style);
      const svg = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '22'); svg.setAttribute('height', '16');
      svg.setAttribute('viewBox', '0 0 22 16');
      const line = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '2'); line.setAttribute('y1', '8');
      line.setAttribute('x2', '20'); line.setAttribute('y2', '8');
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-linecap', 'round');
      if (style === 'dashed') line.setAttribute('stroke-dasharray', '4 3');
      svg.appendChild(line); btn.appendChild(svg);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pushUndo(); conn.style = style;
        this.rerenderConnection(conn);
        styleGroup.querySelectorAll<HTMLElement>('.visual-notes-conn-props-btn').forEach(b => b.removeClass('is-active'));
        btn.addClass('is-active');
        this.scheduleSave();
      });
    }

    panel.createDiv('visual-notes-conn-props-sep');

    // ── Arrowhead ───────────────────────────────────────────────
    const arrowGroup = panel.createDiv('visual-notes-conn-props-group');
    const arrowOpts: Array<{ val: Connection['arrowhead']; label: string; icon: string }> = [
      { val: 'none', label: 'No arrowheads', icon: 'minus'           },
      { val: 'end',  label: 'Arrow at end',  icon: 'arrow-right'     },
      { val: 'both', label: 'Both ends',     icon: 'arrow-left-right' },
    ];
    for (const { val, label, icon } of arrowOpts) {
      const btn = arrowGroup.createDiv('visual-notes-conn-props-btn');
      btn.setAttribute('aria-label', label);
      btn.toggleClass('is-active', conn.arrowhead === val);
      setIcon(btn, icon);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pushUndo(); conn.arrowhead = val;
        this.rerenderConnection(conn);
        arrowGroup.querySelectorAll<HTMLElement>('.visual-notes-conn-props-btn').forEach(b => b.removeClass('is-active'));
        btn.addClass('is-active');
        this.scheduleSave();
      });
    }

    panel.createDiv('visual-notes-conn-props-sep');

    // ── Routing ─────────────────────────────────────────────────
    const routeGroup = panel.createDiv('visual-notes-conn-props-group');
    const routeOpts: Array<{ val: Connection['routing']; label: string; icon: string }> = [
      { val: 'straight', label: 'Straight line', icon: 'minus'            },
      { val: 'elbow',    label: 'Elbow route',   icon: 'corner-down-right' },
    ];
    for (const { val, label, icon } of routeOpts) {
      const btn = routeGroup.createDiv('visual-notes-conn-props-btn');
      btn.setAttribute('aria-label', label);
      btn.toggleClass('is-active', conn.routing === val);
      setIcon(btn, icon);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pushUndo(); conn.routing = val;
        this.rerenderConnection(conn);
        routeGroup.querySelectorAll<HTMLElement>('.visual-notes-conn-props-btn').forEach(b => b.removeClass('is-active'));
        btn.addClass('is-active');
        this.scheduleSave();
      });
    }

    panel.createDiv('visual-notes-conn-props-sep');

    // ── Delete ──────────────────────────────────────────────────
    const delBtn = panel.createDiv('visual-notes-conn-props-btn visual-notes-conn-props-delete');
    delBtn.setAttribute('aria-label', 'Delete connection');
    setIcon(delBtn, 'trash-2');
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteSelectedConnection(); });
  },

  hideConnectionProps(this: FreeformRenderer): void {
    this.connPropsEl?.remove();
    this.connPropsEl = null;
  },
};
