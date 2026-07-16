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
    renderImageContent(el: HTMLElement, card: ImageCard): void;
    renderAudioContent(el: HTMLElement, card: AudioCard): void;
    renderBookmarkContent(el: HTMLElement, card: BookmarkCard): void;
    renderMapContent(el: HTMLElement, card: MapCard): void;
    resolveMapShortLink(card: MapCard, el: HTMLElement): Promise<void>;
    createMapCard(x: number, y: number, url: string): void;
    runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void>;
    fetchAndUpdateBookmark(card: BookmarkCard, el: HTMLElement): Promise<void>;
    openImageSource(card: ImageCard): void;
    addImage(): void;
    addImageAt(x: number, y: number): void;
    addAudio(): void;
    addAudioAt(x: number, y: number): void;
    addBookmark(): void;
    addBookmarkAt(x: number, y: number, url?: string): void;
    addMapAt(x: number, y: number, url?: string): void;
    createBookmarkCard(x: number, y: number, url: string): void;
    measureImageH(fileOrSrc: File | string): Promise<number>;
    ensureFolder(path: string): Promise<void>;
    handlePastedImage(file: File): Promise<void>;
    handleDroppedImage(file: File, x: number, y: number): Promise<void>;
    isDropAccepted(e: DragEvent): boolean;
    handleDroppedAudio(file: File, x: number, y: number): Promise<void>;
  }
}

export const cardsMediaMethods = {
  renderImageContent(this: FreeformRenderer, el: HTMLElement, card: ImageCard): void {
    el.addClass('visual-notes-freeform-image-card');

    const wrap = el.createDiv('visual-notes-image-wrap');
    const img = wrap.createEl('img', { cls: 'visual-notes-image-img' });

    if (card.source.type === 'vault') {
      const vf = this.app.vault.getAbstractFileByPath(card.source.path);
      if (vf instanceof TFile) {
        img.src = this.app.vault.getResourcePath(vf);
      } else {
        wrap.addClass('visual-notes-image-missing');
        wrap.createDiv({ cls: 'visual-notes-image-missing-label', text: 'Image not found' });
        img.remove();
      }
    } else {
      img.src = card.source.url;
    }

    img.addEventListener('error', () => {
      img.remove(); wrap.addClass('visual-notes-image-missing');
      wrap.createDiv({ cls: 'visual-notes-image-missing-label', text: 'Failed to load' });
    });

    // wrap's own background is a visible placeholder while loading (and
    // stays for the missing/failed states above) — but a successfully
    // loaded image needs it cleared, otherwise it shows solid through any
    // transparent (alpha) areas of a PNG instead of true transparency.
    const clearPlaceholderBg = () => wrap.addClass('is-loaded');
    img.addEventListener('load', clearPlaceholderBg);
    if (img.complete) clearPlaceholderBg();

    const fixAspect = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const correctH = Math.max(IMAGE_MIN_H, snap((card.w ?? IMAGE_DEFAULT_W) * img.naturalHeight / img.naturalWidth));
        if (correctH !== card.h) {
          card.h = correctH;
          el.style.height = `${correctH}px`;
          this.scheduleSave();
        }
      }
    };
    img.addEventListener('load', fixAspect);
    if (img.complete) fixAspect();

    // Caption — render/edit two-state with TextFormatToolbar
    const captionWrap = el.createDiv('visual-notes-image-caption-wrap');
    if (card.captionHidden) captionWrap.addClass('is-hidden');

    const captionViewEl = captionWrap.createDiv('visual-notes-image-caption-view');
    if (card.captionScale) captionViewEl.addClass(`text-scale-${card.captionScale}`);
    if (card.captionColor) captionViewEl.style.color = card.captionColor;
    const renderCaptionView = () => {
      captionViewEl.empty();
      if (card.caption) {
        void MarkdownRenderer.render(this.app, card.caption, captionViewEl, '', this);
      } else {
        captionViewEl.createSpan({ cls: 'visual-notes-caption-placeholder', text: 'Add caption…' });
      }
    };
    renderCaptionView();

    const captionEditor = captionWrap.createDiv('visual-notes-image-caption-editor') as HTMLElement;
    captionEditor.contentEditable = 'true';
    captionEditor.hide();
    captionEditor.addEventListener('pointerdown', e => e.stopPropagation());

    let captionFmtToolbar: TextFormatToolbar | null = null;

    const enterCaptionEdit = () => {
      captionViewEl.hide();
      captionEditor.show();
      captionEditor.empty();
      if (card.caption) captionEditor.appendChild(sanitizeHTMLToDom(captionViewEl.innerHTML));
      captionEditor.focus();
      const r = activeDocument.createRange();
      r.selectNodeContents(captionEditor); r.collapse(false);
      const s = window.getSelection();
      s?.removeAllRanges(); s?.addRange(r);
      captionFmtToolbar = new TextFormatToolbar(captionEditor, captionWrap, this.container);
    };

    const exitCaptionEdit = () => {
      captionFmtToolbar?.destroy(); captionFmtToolbar = null;
      card.caption = captionEditor.innerHTML;
      captionEditor.hide();
      captionViewEl.show();
      renderCaptionView();
      this.scheduleSave();
    };

    captionViewEl.addEventListener('click', (e) => { e.stopPropagation(); enterCaptionEdit(); });
    captionViewEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    captionEditor.addEventListener('blur', exitCaptionEdit);
    captionEditor.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        captionFmtToolbar?.destroy(); captionFmtToolbar = null;
        captionEditor.removeEventListener('blur', exitCaptionEdit);
        captionEditor.hide();
        captionViewEl.show();
        renderCaptionView();
      }
    });

    this.appendResizeHandles(el);
  },

  renderAudioContent(this: FreeformRenderer, el: HTMLElement, card: AudioCard): void {
    el.addClass('visual-notes-freeform-audio-card');
    const header = el.createDiv('visual-notes-audio-header');
    const iconEl = header.createDiv('visual-notes-audio-icon');
    setIcon(iconEl, 'music');
    const name = card.title ?? card.source.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Audio';
    header.createDiv({ cls: 'visual-notes-audio-title', text: name });
    const vf = this.app.vault.getAbstractFileByPath(card.source.path);
    if (vf instanceof TFile) {
      const audio = el.createEl('audio');
      audio.src = this.app.vault.getResourcePath(vf);
      audio.controls = true;
      audio.addClass('visual-notes-audio-player');
      audio.addEventListener('pointerdown', (e) => e.stopPropagation());
      audio.addEventListener('click', (e) => e.stopPropagation());
    } else {
      el.createDiv({ cls: 'visual-notes-audio-missing', text: 'File not found' });
    }
    this.appendResizeHandles(el);
  },

  renderBookmarkContent(this: FreeformRenderer, el: HTMLElement, card: BookmarkCard): void {
    el.addClass('visual-notes-freeform-bookmark-card');

    const youTubeId = parseYouTubeId(card.url);
    if (youTubeId) {
      el.addClass('is-youtube-embed');
      // Optional header strip — a fixed drag handle regardless of whether
      // the body overlay below is currently passing clicks through to the
      // iframe. Hidden by default (bare 16:9 video look); toggled via the
      // card's right-click menu.
      if (card.youtubeHeaderShown) {
        const header = el.createDiv('visual-notes-bookmark-youtube-header');
        const iconEl = header.createDiv('visual-notes-bookmark-youtube-icon');
        setIcon(iconEl, 'play');
        header.createDiv({ cls: 'visual-notes-bookmark-youtube-title', text: card.title || 'YouTube' });
      }

      // A live iframe swallows every pointer event over it (it's a separate
      // browsing context), so the card underneath never sees a drag start.
      // `body` wraps the iframe with an invisible overlay on top of it —
      // the overlay is a normal element, so pointerdown on it bubbles to
      // the card's own drag handler exactly like clicking anywhere else on
      // the card ("draggable via the main body"). Double-click the overlay
      // to punch through it and interact with the video (play/seek/
      // fullscreen); clicking anywhere outside the card restores the
      // overlay so the body is draggable again.
      const body = el.createDiv('visual-notes-bookmark-youtube-body');
      const iframe = body.createEl('iframe', { cls: 'visual-notes-bookmark-youtube-iframe' });
      // enablejsapi lets the overlay start playback with a postMessage
      // command instead of needing the user to reach the player's own
      // play button underneath it.
      iframe.src = `https://www.youtube.com/embed/${youTubeId}?enablejsapi=1`;
      iframe.setAttribute('title', card.title || 'YouTube video player');
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
      iframe.setAttribute('allowfullscreen', 'true');
      iframe.setAttribute('frameborder', '0');

      const overlay = body.createDiv('visual-notes-bookmark-youtube-overlay');
      overlay.setAttribute('title', 'Click to play. Drag to move.');
      // A plain click (no drag movement) punches through the overlay AND
      // starts playback in one go via the iframe API — no hunting for the
      // player's own play button. A click that was actually a drag (card
      // move) is ignored. Clicking outside the card restores the overlay
      // so the body is draggable again; the video keeps playing.
      let downAt: { x: number; y: number } | null = null;
      overlay.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
      overlay.addEventListener('click', (e) => {
        if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return; // was a drag
        e.stopPropagation();
        el.addClass('is-embed-interactive');
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
        const onOutside = (ev: PointerEvent) => {
          if (el.contains(ev.target as Node)) return;
          el.removeClass('is-embed-interactive');
          activeDocument.removeEventListener('pointerdown', onOutside, true);
        };
        window.setTimeout(() => activeDocument.addEventListener('pointerdown', onOutside, true), 0);
      });

      this.appendResizeHandles(el);
      return;
    }

    if (card.fetchFailed) {
      const fail = el.createDiv('visual-notes-bookmark-fail');
      fail.createDiv({ cls: 'visual-notes-bookmark-fail-url', text: card.url });
      const retry = fail.createEl('button', { cls: 'visual-notes-bookmark-retry', text: 'Retry' });
      retry.addEventListener('click', (e) => {
        e.stopPropagation(); e.preventDefault();
        card.fetchFailed = false;
        this.renderCardContent(el, card);
        void this.fetchAndUpdateBookmark(card, el);
      });
    } else if (!card.title && !card.fetchedAt) {
      const loading = el.createDiv('visual-notes-bookmark-loading');
      const spinnerEl = loading.createDiv('visual-notes-bookmark-spinner');
      setIcon(spinnerEl, 'loader');
      loading.createDiv({ cls: 'visual-notes-bookmark-loading-text', text: 'Fetching preview…' });
      try { el.createDiv({ cls: 'visual-notes-bookmark-domain', text: new URL(card.url).hostname }); } catch { /* ignore */ }
    } else {
      if (card.imageUrl) {
        const imgWrap = el.createDiv('visual-notes-bookmark-image-wrap');
        const img = imgWrap.createEl('img', { cls: 'visual-notes-bookmark-img' });
        img.src = card.imageUrl;
        img.addEventListener('error', () => imgWrap.remove());
      }
      const content = el.createDiv('visual-notes-bookmark-content');
      if (card.title) content.createDiv({ cls: 'visual-notes-bookmark-title', text: card.title });
      if (card.description) content.createDiv({ cls: 'visual-notes-bookmark-desc', text: card.description });

      const footer = el.createDiv('visual-notes-bookmark-footer');
      if (card.favicon) {
        const fav = footer.createEl('img', { cls: 'visual-notes-bookmark-favicon' });
        fav.src = card.favicon; fav.addEventListener('error', () => fav.remove());
      }
      try { footer.createDiv({ cls: 'visual-notes-bookmark-domain', text: new URL(card.url).hostname }); } catch { /* ignore */ }
    }

    this.appendResizeHandles(el);
  },

  renderMapContent(this: FreeformRenderer, el: HTMLElement, card: MapCard): void {
    el.addClass('visual-notes-freeform-map-card');

    const src = googleMapsEmbedSrc(card.resolvedUrl ?? card.url);

    if (!src) {
      // Short links carry no location in the URL — resolve once over HTTP.
      if (isGoogleMapsShortLink(card.url) && !card.resolveFailed) {
        const loading = el.createDiv('visual-notes-map-loading');
        const spinnerEl = loading.createDiv('visual-notes-bookmark-spinner');
        setIcon(spinnerEl, 'loader');
        loading.createDiv({ cls: 'visual-notes-bookmark-loading-text', text: 'Resolving map link…' });
        void this.resolveMapShortLink(card, el);
      } else {
        const fail = el.createDiv('visual-notes-map-fail');
        setIcon(fail.createDiv('visual-notes-map-fail-icon'), 'map-pin-off');
        fail.createDiv({ cls: 'visual-notes-bookmark-fail-url', text: card.url });
        fail.createDiv({ cls: 'visual-notes-bookmark-loading-text', text: 'Couldn’t read a location from this link.' });
        const retry = fail.createEl('button', { cls: 'visual-notes-bookmark-retry', text: 'Retry' });
        retry.addEventListener('click', (e) => {
          e.stopPropagation(); e.preventDefault();
          card.resolveFailed = false; card.resolvedUrl = undefined;
          this.renderCardContent(el, card);
        });
      }
      this.appendResizeHandles(el);
      return;
    }

    // The map is fully live — scroll to zoom, drag to pan, click markers —
    // with no punch-through step. That means the iframe (a separate
    // browsing context) swallows every pointer event over it, so unlike
    // every other card kind, the card itself can't be dragged by its body.
    // A permanent header strip above the map is the drag handle instead:
    // it's a plain sibling element, so its pointerdown bubbles up to the
    // card's own drag handler exactly like any other card's body would.
    const header = el.createDiv('visual-notes-map-header');
    setIcon(header.createDiv('visual-notes-map-header-icon'), 'map-pin');
    header.createDiv({ cls: 'visual-notes-map-header-title', text: 'Google Maps' });
    header.setAttribute('title', 'Drag here to move. The map below is fully interactive.');

    const body = el.createDiv('visual-notes-map-body');
    const iframe = body.createEl('iframe', { cls: 'visual-notes-map-iframe' });
    iframe.src = src;
    iframe.setAttribute('title', 'Google Maps');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

    this.appendResizeHandles(el);
  },

  async resolveMapShortLink(this: FreeformRenderer, card: MapCard, el: HTMLElement): Promise<void> {
    let resolved: string | null = null;
    try {
      const resp = await requestUrl({ url: card.url });
      const html = resp.text;
      const m = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/)
        ?? html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)
        ?? html.match(/https:\/\/www\.google\.com\/maps\/place\/[^"'\s<>\\]+/);
      if (m) resolved = (m[1] ?? m[0]).replace(/&amp;/g, '&');
    } catch { /* fall through to failed state */ }

    if (resolved && googleMapsEmbedSrc(resolved)) {
      card.resolvedUrl = resolved;
      card.resolveFailed = false;
    } else {
      card.resolveFailed = true;
    }
    if (el.isConnected) {
      this.renderCardContent(el, card);
      await this.saveNow();
    }
  },

  createMapCard(this: FreeformRenderer, x: number, y: number, url: string): void {
    const card: MapCard = { id: crypto.randomUUID(), kind: 'map', x, y, w: MAP_DEFAULT_W, h: MAP_DEFAULT_H, z: this.nextZ(), url };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
  },

  async runWithConcurrency<T>(this: FreeformRenderer, items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await fn(item);
      }
    });
    await Promise.all(workers);
  },

  async fetchAndUpdateBookmark(this: FreeformRenderer, card: BookmarkCard, el: HTMLElement): Promise<void> {
    if (parseYouTubeId(card.url)) {
      // YouTube gets a clean thumbnail-and-play-button card (matching native
      // Canvas's own embed look) derived straight from the video ID — no
      // metadata fetch needed, so there's nothing to do here at all.
      card.fetchedAt = Date.now(); card.fetchFailed = false;
      if (el.isConnected) { this.renderCardContent(el, card); await this.saveNow(); }
      return;
    }
    try {
      const resp = await requestUrl({ url: card.url });
      const doc = new DOMParser().parseFromString(resp.text, 'text/html');
      const getMeta = (sel: string) => doc.querySelector(sel)?.getAttribute('content') ?? undefined;

      card.title = getMeta('meta[property="og:title"]') || getMeta('meta[name="twitter:title"]') || doc.title || undefined;
      card.description = getMeta('meta[property="og:description"]') || getMeta('meta[name="description"]') || undefined;

      const ogImg = getMeta('meta[property="og:image"]') || getMeta('meta[name="twitter:image"]');
      if (ogImg) { try { card.imageUrl = new URL(ogImg, card.url).href; } catch { card.imageUrl = ogImg; } }

      const origin = new URL(card.url).origin;
      const favEl = doc.querySelector<HTMLLinkElement>('link[rel~="icon"]');
      const favHref = favEl?.getAttribute('href');
      if (favHref) { try { card.favicon = new URL(favHref, card.url).href; } catch { card.favicon = `${origin}/favicon.ico`; } }
      else { card.favicon = `${origin}/favicon.ico`; }

      card.fetchedAt = Date.now(); card.fetchFailed = false;
    } catch {
      card.fetchFailed = true; card.fetchedAt = Date.now();
    }

    if (el.isConnected) {
      this.renderCardContent(el, card);
      await this.saveNow();
    }
  },

  openImageSource(this: FreeformRenderer, card: ImageCard): void {
    if (card.source.type === 'vault') {
      const file = this.app.vault.getAbstractFileByPath(card.source.path);
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf('tab');
        void leaf.openFile(file); void this.app.workspace.revealLeaf(leaf);
      }
    } else {
      window.open(card.source.url, '_blank');
    }
  },

  addImage(this: FreeformRenderer): void { const p = this.centerPos(IMAGE_DEFAULT_W, IMAGE_DEFAULT_H); this.addImageAt(p.x, p.y); },

  addImageAt(this: FreeformRenderer, x: number, y: number): void {
    const createCard = (path: string, h: number) => {
      const card: ImageCard = { id: crypto.randomUUID(), kind: 'image', x, y, w: IMAGE_DEFAULT_W, h, z: this.nextZ(), source: { type: 'vault', path }, captionHidden: true };
      this.pushUndo(); this.board.cards.push(card); void this.saveNow();
      this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
    };
    const fromVault = () => new VaultImagePickerModal(this.app, (f) => { void (async () => {
      const newPath = await sortAssetFile(this.app, f);
      const newFile = this.app.vault.getAbstractFileByPath(newPath);
      if (!(newFile instanceof TFile)) return;
      const h = await this.measureImageH(this.app.vault.getResourcePath(newFile));
      createCard(newPath, h);
    })(); }).open();
    const fromUpload = () => {
      const input = createEl('input');
      input.type = 'file'; input.accept = IMAGE_EXTS.map(e => `.${e}`).join(',');
      input.addEventListener('change', () => { void (async () => {
        const file = input.files?.[0]; if (!file) return;
        const ext = file.type.includes('png') ? 'png' : file.type.includes('gif') ? 'gif' : file.type.includes('webp') ? 'webp' : 'jpg';
        const base = file.name.replace(/\.[^.]+$/, '');
        let path: string;
        try { path = await saveNewAsset(this.app, await file.arrayBuffer(), `${base}.${ext}`); }
        catch { new Notice(`Failed to save ${file.name}.`); return; }
        const h = await this.measureImageH(file);
        createCard(path, h);
      })(); });
      input.click();
    };
    new MediaSourceModal(this.app, 'Add image', fromVault, fromUpload).open();
  },

  addAudio(this: FreeformRenderer): void { const p = this.centerPos(AUDIO_DEFAULT_W, AUDIO_DEFAULT_H); this.addAudioAt(p.x, p.y); },

  addAudioAt(this: FreeformRenderer, x: number, y: number): void {
    const createCard = (path: string) => {
      const card: AudioCard = { id: crypto.randomUUID(), kind: 'audio', x, y, w: AUDIO_DEFAULT_W, h: AUDIO_DEFAULT_H, z: this.nextZ(), source: { type: 'vault', path } };
      this.pushUndo(); this.board.cards.push(card); void this.saveNow();
      this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
    };
    const fromVault = () => new VaultAudioPickerModal(this.app, (f) => { void (async () => {
      const newPath = await sortAssetFile(this.app, f);
      createCard(newPath);
    })(); }).open();
    const fromUpload = () => {
      const input = createEl('input');
      input.type = 'file'; input.accept = AUDIO_EXTS.map(e => `.${e}`).join(',');
      input.addEventListener('change', () => { void (async () => {
        const file = input.files?.[0]; if (!file) return;
        const ext = file.name.toLowerCase().endsWith('.mp3') ? 'mp3' : file.name.toLowerCase().endsWith('.ogg') ? 'ogg' : 'wav';
        const base = file.name.replace(/\.[^.]+$/, '');
        let path: string;
        try { path = await saveNewAsset(this.app, await file.arrayBuffer(), `${base}.${ext}`); }
        catch { new Notice(`Failed to save ${file.name}.`); return; }
        createCard(path);
      })(); });
      input.click();
    };
    new MediaSourceModal(this.app, 'Add audio', fromVault, fromUpload).open();
  },

  addBookmark(this: FreeformRenderer): void { const p = this.centerPos(BOOKMARK_DEFAULT_W, BOOKMARK_DEFAULT_H); this.addBookmarkAt(p.x, p.y); },

  addBookmarkAt(this: FreeformRenderer, x: number, y: number, url?: string): void {
    if (url) { this.createBookmarkCard(x, y, url); return; }
    new BookmarkInputModal(this.app, (u) => this.createBookmarkCard(x, y, u)).open();
  },

  addMapAt(this: FreeformRenderer, x: number, y: number, url?: string): void {
    if (url) { this.createMapCard(x, y, url); return; }
    new BookmarkInputModal(this.app, (u) => {
      if (!isGoogleMapsUrl(u)) { new Notice('That doesn’t look like a Google Maps link.'); return; }
      this.createMapCard(x, y, u);
    }, 'Add map — paste a Google Maps link').open();
  },

  createBookmarkCard(this: FreeformRenderer, x: number, y: number, url: string): void {
    // YouTube embeds open as a bare 16:9 video at watchable size (960×540)
    // rather than the small link-preview footprint other bookmarks get.
    const isYouTube = !!parseYouTubeId(url);
    const w = isYouTube ? 960 : BOOKMARK_DEFAULT_W;
    const h = isYouTube ? Math.round(w * 9 / 16) : BOOKMARK_DEFAULT_H;
    const card: BookmarkCard = { id: crypto.randomUUID(), kind: 'bookmark', x, y, w, h, z: this.nextZ(), url };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    const el = this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
    void this.fetchAndUpdateBookmark(card, el);
  },

  measureImageH(this: FreeformRenderer, fileOrSrc: File | string): Promise<number> {
    let src: string;
    let revoke = false;
    if (typeof fileOrSrc !== 'string') {
      src = URL.createObjectURL(fileOrSrc); revoke = true;
    } else { src = fileOrSrc; }
    return new Promise<number>((resolve) => {
      const img = new Image();
      const done = (ok: boolean) => {
        if (revoke) URL.revokeObjectURL(src);
        resolve(ok && img.naturalWidth > 0
          ? Math.max(IMAGE_MIN_H, snap(IMAGE_DEFAULT_W * img.naturalHeight / img.naturalWidth))
          : IMAGE_DEFAULT_H);
      };
      img.onload  = () => done(true);
      img.onerror = () => done(false);
      img.src = src;
    });
  },

  async ensureFolder(this: FreeformRenderer, path: string): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(path)) {
      try { await this.app.vault.createFolder(path); } catch { /* ignore */ }
    }
  },

  async handlePastedImage(this: FreeformRenderer, file: File): Promise<void> {
    const ext = file.type.includes('png') ? 'png' : file.type.includes('gif') ? 'gif' : 'jpg';
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `Pasted Image ${ts}.${ext}`;
    let path: string;
    try { path = await saveNewAsset(this.app, await file.arrayBuffer(), filename); }
    catch { new Notice('Failed to save pasted image.'); return; }
    const pastedFile = this.app.vault.getAbstractFileByPath(path);
    if (!(pastedFile instanceof TFile)) return;
    const h = await this.measureImageH(this.app.vault.getResourcePath(pastedFile));
    const { x, y } = this.centerPos(IMAGE_DEFAULT_W, h);
    const card: ImageCard = { id: crypto.randomUUID(), kind: 'image', x, y, w: IMAGE_DEFAULT_W, h, z: this.nextZ(), source: { type: 'vault', path }, captionHidden: true };
    this.pushUndo(); this.board.cards.push(card); await this.saveNow();
    this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
  },

  async handleDroppedImage(this: FreeformRenderer, file: File, x: number, y: number): Promise<void> {
    const ext = file.type.includes('png') ? 'png' : file.type.includes('gif') ? 'gif' : file.type.includes('webp') ? 'webp' : 'jpg';
    const base = file.name.replace(/\.[^.]+$/, '');
    let path: string;
    try { path = await saveNewAsset(this.app, await file.arrayBuffer(), `${base}.${ext}`); }
    catch { new Notice(`Failed to save ${file.name}.`); return; }
    const h = await this.measureImageH(file);
    const card: ImageCard = { id: crypto.randomUUID(), kind: 'image', x, y, w: IMAGE_DEFAULT_W, h, z: this.nextZ(), source: { type: 'vault', path }, captionHidden: true };
    this.pushUndo(); this.board.cards.push(card); await this.saveNow();
    this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
  },

  isDropAccepted(this: FreeformRenderer, e: DragEvent): boolean {
    if (e.dataTransfer?.types.includes('Files')) return true;
    if (e.dataTransfer?.types.includes(TILE_DRAG_MIME)) return true;
    const dragMgr = (this.app as AppWithPrivateAPIs).dragManager;
    const draggable = dragMgr?.draggable;
    if (draggable?.type === 'folder' && draggable.file instanceof TFolder) return true;
    if (draggable?.type !== 'file' || !(draggable.file instanceof TFile)) return false;
    const ext = draggable.file.extension.toLowerCase();
    return IMAGE_EXTS.includes(ext) || AUDIO_EXTS.includes(ext) || ext === 'canvas' || ext === 'md';
  },

  async handleDroppedAudio(this: FreeformRenderer, file: File, x: number, y: number): Promise<void> {
    const ext = file.name.toLowerCase().endsWith('.mp3') ? 'mp3' : file.name.toLowerCase().endsWith('.ogg') ? 'ogg' : 'wav';
    const base = file.name.replace(/\.[^.]+$/, '');
    let path: string;
    try { path = await saveNewAsset(this.app, await file.arrayBuffer(), `${base}.${ext}`); }
    catch { new Notice(`Failed to save ${file.name}.`); return; }
    const card: AudioCard = { id: crypto.randomUUID(), kind: 'audio', x, y, w: AUDIO_DEFAULT_W, h: AUDIO_DEFAULT_H, z: this.nextZ(), source: { type: 'vault', path } };
    this.pushUndo(); this.board.cards.push(card); await this.saveNow();
    this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
  },
};
