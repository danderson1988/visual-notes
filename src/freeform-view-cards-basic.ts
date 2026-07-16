import {
  App, TFile, Notice, setIcon,
  MarkdownRenderer, sanitizeHTMLToDom,
} from 'obsidian';
import {
  TileCard, StickyCard, ChecklistCard, ChecklistItem, NoteLinkCard,
  Card, CommentCard, CommentReply,
  SwatchCard, FileCard, CalloutCard, GroupCard,
} from './file-types';
import { contrastColor } from './color-utils';
import {
  resolveThumbnailSrc,
} from './thumbnail-utils';
import { nearestColorName, randomNamedColor, NamedColor } from './named-colors';
import { TileModal } from './tile-modal';
import { isCustomIconRef, resolveCustomIconSrc } from './custom-icons';
import { TextFormatToolbar } from './text-format-toolbar';
import { sortAssetFile, saveNewAsset } from './asset-manager';
import {
  TILE_DEFAULT_W, TILE_DEFAULT_H, STICKY_DEFAULT_W, STICKY_DEFAULT_H,
  CHECKLIST_DEFAULT_W, CHECKLIST_DEFAULT_H,
  COMMENT_DEFAULT_W, COMMENT_DEFAULT_H,
  NOTELINK_DEFAULT_W, NOTELINK_DEFAULT_H, NOTELINK_TITLE_W, NOTELINK_TITLE_H,
  SWATCH_DEFAULT_W, SWATCH_DEFAULT_H,
  FILE_DEFAULT_W, FILE_DEFAULT_H,
  CALLOUT_DEFAULT_W, CALLOUT_DEFAULT_H, GROUP_DEFAULT_W, GROUP_DEFAULT_H,
  GROUP_PAD, AUDIO_EXTS,
  IMAGE_EXTS,
  STICKY_COLORS, commentInitial, formatCommentTime,
  NoteLinkPickerModal, VaultAnyFilePickerModal,
  MediaSourceModal,
} from './freeform-view-shared';
import type { FreeformRenderer } from './freeform-view';

declare module './freeform-view' {
  interface FreeformRenderer {
    renderTileContent(el: HTMLElement, tile: TileCard): void;
    renderTileIcon(square: HTMLElement, tile: TileCard, iconColor: string, iconSize: number): void;
    renderStickyContent(el: HTMLElement, card: StickyCard): void;
    editStickyInline(el: HTMLElement, card: StickyCard): void;
    renderChecklistContent(el: HTMLElement, card: ChecklistCard): void;
    appendChecklistItem(listEl: HTMLElement, card: ChecklistCard, item: ChecklistItem): HTMLElement;
    appendChecklistGhost(listEl: HTMLElement, card: ChecklistCard): HTMLElement;
    rebuildChecklistList(listEl: HTMLElement, card: ChecklistCard): void;
    startChecklistItemDrag(
        startEvent: PointerEvent,
        listEl: HTMLElement,
        card: ChecklistCard,
        item: ChecklistItem,
        itemEl: HTMLElement,
      ): void;
    setHeaderCheckboxState(cb: HTMLInputElement, card: ChecklistCard, headerId: string): void;
    refreshHeaderCheckbox(listEl: HTMLElement, card: ChecklistCard, headerId: string): void;
    renderCommentContent(el: HTMLElement, card: CommentCard): void;
    appendCommentReply(listEl: HTMLElement, card: CommentCard, reply: CommentReply): HTMLElement;
    appendCommentReplyGhost(listEl: HTMLElement, card: CommentCard): HTMLElement;
    renderNoteLinkContent(el: HTMLElement, card: NoteLinkCard): void;
    renderSwatchContent(el: HTMLElement, card: SwatchCard): void;
    addSwatchAt(x: number, y: number): void;
    fileTypeIcon(ext: string): string;
    formatFileSize(bytes: number): string;
    renderFileContent(el: HTMLElement, card: FileCard): void;
    openFileCard(card: FileCard): Promise<void>;
    renderCalloutContent(el: HTMLElement, card: CalloutCard): void;
    editCalloutInline(el: HTMLElement, _card: CalloutCard): void;
    addCalloutAt(x: number, y: number): void;
    renderGroupContent(el: HTMLElement, card: GroupCard): void;
    editGroupLabel(el: HTMLElement, card: GroupCard): void;
    cardsContainedInGroup(group: GroupCard): string[];
    groupSelected(): void;
    addGroupAt(x: number, y: number): void;
    addFileAt(x: number, y: number): void;
    createSwatchGrid(x: number, y: number, colors: NamedColor[]): void;
    rebuildChecklistCard(card: ChecklistCard): void;
    addTile(): void;
    addTileAt(x: number, y: number): void;
    addSticky(): void;
    addStickyAt(x: number, y: number, initialText?: string): void;
    addBlankCard(): void;
    addBlankCardAt(x: number, y: number): void;
    addChecklist(): void;
    addChecklistAt(x: number, y: number): void;
    addComment(): void;
    addCommentAt(x: number, y: number): void;
    addNoteLink(): void;
    addNoteLinkAt(x: number, y: number): void;
  }
}

export const cardsBasicMethods = {
  renderTileContent(this: FreeformRenderer, el: HTMLElement, tile: TileCard): void {
    el.addClass('visual-notes-freeform-tile-card');
    const w = parseFloat(el.style.width) || (tile.w ?? TILE_DEFAULT_W);
    const h = parseFloat(el.style.height) || (tile.h ?? TILE_DEFAULT_H);
    const tileSize = Math.max(40, Math.min(w - 20, h - 50 - 16));
    const radius = Math.round(tileSize * 0.2);

    const square = el.createDiv('visual-notes-freeform-tile-square');
    // Neutral background behind thumbnails and custom icon images — see
    // matching comment in grid-view.ts. The accent color is only
    // appropriate as a backdrop for the small centered Lucide/emoji glyph,
    // not behind a full image that may have transparent or padded margins
    // (a custom asset icon shows its own art edge-to-edge, same as a
    // thumbnail, so the accent square would otherwise show through as an
    // unwanted colored ring around it).
    const hasThumbForBg = !!tile.thumbnail || isCustomIconRef(tile.icon);
    square.style.backgroundColor = hasThumbForBg ? 'transparent' : tile.color;
    square.style.width = `${tileSize}px`; square.style.height = `${tileSize}px`;
    square.style.borderRadius = `${radius}px`;

    const iconColor = contrastColor(tile.color);
    const thumbSrc = resolveThumbnailSrc(this.app, tile);
    const iconSize = Math.round(tileSize * 0.55);

    if (thumbSrc) {
      const img = square.createEl('img', { cls: 'visual-notes-tile-thumbnail-img' });
      img.src = thumbSrc;
      img.alt = tile.label;
      img.addEventListener('error', () => {
        img.remove();
        square.style.backgroundColor = tile.color;
        this.renderTileIcon(square, tile, iconColor, iconSize);
      });
    } else {
      this.renderTileIcon(square, tile, iconColor, iconSize);
    }

    if (tile.target.kind === 'board') {
      const chevron = square.createDiv('visual-notes-tile-board-indicator');
      setIcon(chevron, 'chevron-right'); chevron.style.color = iconColor;
    }

    if (tile.target.kind === 'kanban') {
      const indicator = square.createDiv('visual-notes-tile-board-indicator');
      setIcon(indicator, 'columns-3'); indicator.style.color = iconColor;
    }

    el.createDiv({ cls: 'visual-notes-tile-label', text: tile.label });
    if (tile.subtitle) el.createDiv({ cls: 'visual-notes-tile-subtitle', text: tile.subtitle });
    this.appendResizeHandles(el);
  },

  renderTileIcon(this: FreeformRenderer, square: HTMLElement, tile: TileCard, iconColor: string, iconSize: number): void {
    const iconEl = square.createDiv('visual-notes-tile-icon');
    iconEl.style.color = iconColor;
    iconEl.style.width = `${iconSize}px`; iconEl.style.height = `${iconSize}px`;
    const customSrc = isCustomIconRef(tile.icon) ? resolveCustomIconSrc(tile.icon) : undefined;
    const isSingleEmoji = [...tile.icon].length === 1 && /\p{Emoji_Presentation}/u.test(tile.icon);
    if (customSrc) {
      iconEl.createEl('img', { attr: { src: customSrc }, cls: 'visual-notes-tile-custom-icon-img' });
    } else if (isSingleEmoji) {
      iconEl.setText(tile.icon); iconEl.addClass('visual-notes-tile-emoji');
      iconEl.style.fontSize = `${Math.round(iconSize * 0.9)}px`;
    } else { setIcon(iconEl, tile.icon); }
  },

  renderStickyContent(this: FreeformRenderer, el: HTMLElement, card: StickyCard): void {
    el.addClass('visual-notes-freeform-sticky-card');
    if (card.blank) el.addClass('is-blank-card');
    if (card.shape === 'round') el.addClass('is-shape-round');
    else if (card.shape === 'triangle') el.addClass('is-shape-triangle');

    // The colored/shaped fill lives on its own layer behind the content,
    // separate from `el` itself — so a triangle's clip-path only clips the
    // visual fill, never the resize handles (which are children of `el`
    // and would otherwise land in the corners a triangle cuts away).
    const shapeFill = el.createDiv('visual-notes-sticky-shape-fill');
    shapeFill.style.backgroundColor = card.color;
    if (card.shape === 'round') shapeFill.addClass('is-shape-round');
    else if (card.shape === 'triangle') shapeFill.addClass('is-shape-triangle');

    if (card.topColor) {
      const strip = el.createDiv('ib-card-top-strip');
      strip.style.backgroundColor = card.topColor;
    }
    const inner = el.createDiv('visual-notes-sticky-inner');
    const textEl = inner.createDiv('visual-notes-sticky-text');
    if (card.textScale) textEl.addClass(`text-scale-${card.textScale}`);
    if (card.textColor) textEl.style.color = card.textColor;
    if (card.textAlign) textEl.style.textAlign = card.textAlign;
    const placeholder = card.blank ? '*Start Typing…*' : '*Double-click to edit…*';
    void MarkdownRenderer.render(this.app, card.text || placeholder, textEl, '', this);
    this.appendResizeHandles(el);
  },

  editStickyInline(this: FreeformRenderer, el: HTMLElement, card: StickyCard): void {
    const textEl = el.querySelector<HTMLElement>('.visual-notes-sticky-text');
    if (!textEl || el.querySelector('.visual-notes-sticky-editor')) return;
    const inner = el.querySelector<HTMLElement>('.visual-notes-sticky-inner') ?? el;

    const editor = inner.createDiv('visual-notes-sticky-editor');
    editor.contentEditable = 'true';
    editor.empty();
    if (card.text) editor.appendChild(sanitizeHTMLToDom(textEl.innerHTML));
    textEl.hide();

    editor.focus();
    const r = activeDocument.createRange();
    r.selectNodeContents(editor);
    r.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);

    editor.addEventListener('pointerdown', e => e.stopPropagation());

    // ── Inline tag toggle ─────────────────────────────────────────
    let savedRange: Range | null = null;

    const applyTag = (tag: string) => {
      // Keep editor focused throughout — sel.removeAllRanges() can move focus to body
      editor.focus();
      const sel = window.getSelection();
      if (savedRange) { sel?.removeAllRanges(); sel?.addRange(savedRange.cloneRange()); }
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return;

      const ancestor = range.commonAncestorContainer;
      const existing = (ancestor.nodeType === Node.ELEMENT_NODE
        ? ancestor as Element : ancestor.parentElement)?.closest(tag);
      if (existing && editor.contains(existing)) {
        // Unwrap — move children out, then re-select them
        const children = Array.from(existing.childNodes);
        const p = existing.parentNode!;
        while (existing.firstChild) p.insertBefore(existing.firstChild, existing);
        existing.remove();
        if (children.length > 0 && p.contains(children[0]) && p.contains(children[children.length - 1])) {
          const nr = activeDocument.createRange();
          nr.setStartBefore(children[0]);
          nr.setEndAfter(children[children.length - 1]);
          sel.removeAllRanges(); sel.addRange(nr);
          savedRange = nr.cloneRange();
        } else {
          sel.removeAllRanges(); savedRange = null;
        }
      } else {
        // Wrap — re-select the new wrapper's contents
        const wrapper = createEl(tag as keyof HTMLElementTagNameMap);
        const extracted = range.extractContents();
        const tmp = createDiv();
        tmp.appendChild(extracted);
        tmp.querySelectorAll(tag).forEach(n => n.replaceWith(...Array.from(n.childNodes)));
        while (tmp.firstChild) wrapper.appendChild(tmp.firstChild);
        range.insertNode(wrapper);
        wrapper.parentElement?.normalize();
        const nr = activeDocument.createRange();
        nr.selectNodeContents(wrapper);
        sel.removeAllRanges(); sel.addRange(nr);
        savedRange = nr.cloneRange();
      }
      // Re-focus after selection manipulation in case browser moved focus away
      editor.focus();
    };

    this.activeStickyApplyTag = applyTag;

    // Track selection so context-bar buttons can restore it after stealing focus
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) { savedRange = null; return; }
      savedRange = sel.getRangeAt(0).cloneRange();
    };
    activeDocument.addEventListener('selectionchange', onSelChange);

    // Register on window (not document) so we fire before Obsidian's document-level
    // capture handlers, which intercept CMD+B/I/U before we ever see them.
    const onFormatKey = (e: KeyboardEvent) => {
      if (activeDocument.activeElement !== editor) return;
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (!e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); applyTag('strong'); return; }
      if (!e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); applyTag('em'); return; }
      if (!e.shiftKey && e.key.toLowerCase() === 'u') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); applyTag('u'); return; }
      if (e.shiftKey  && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); applyTag('s'); return; }
    };
    window.addEventListener('keydown', onFormatKey, true);

    const cleanup = () => {
      activeDocument.removeEventListener('selectionchange', onSelChange);
      window.removeEventListener('keydown', onFormatKey, true);
      this.activeStickyApplyTag = null;
    };

    const commit = () => {
      if (!el.contains(editor)) return;
      cleanup();
      this.pushUndo();
      card.text = editor.innerHTML;
      editor.remove(); textEl.show();
      textEl.empty();
      const placeholder = card.blank ? '*Start Typing…*' : '*Double-click to edit…*';
      void MarkdownRenderer.render(this.app, card.text || placeholder, textEl, '', this);
      this.scheduleSave();
    };
    editor.addEventListener('blur', commit);
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); cleanup();
        editor.removeEventListener('blur', commit);
        editor.remove(); textEl.show();
      }
    });
  },

  renderChecklistContent(this: FreeformRenderer, el: HTMLElement, card: ChecklistCard): void {
    el.addClass('visual-notes-freeform-checklist-card');
    el.toggleClass('is-title-hidden', !!card.titleHidden);
    el.style.backgroundColor = card.color;

    // Top strip (optional — only shown if accentColor is set)
    if (card.accentColor) {
      const accentBar = el.createDiv('visual-notes-checklist-accent');
      accentBar.style.backgroundColor = card.accentColor;
    }

    // Title (hidden when titleHidden is true)
    if (!card.titleHidden) {
      const titleEl = el.createEl('input', { cls: 'visual-notes-checklist-title' });
      titleEl.type = 'text'; titleEl.value = card.title || ''; titleEl.placeholder = 'Checklist';
      titleEl.addEventListener('pointerdown', e => e.stopPropagation());
      titleEl.addEventListener('input', () => { card.title = titleEl.value; });
      titleEl.addEventListener('blur', () => this.scheduleSave());
    }

    // List
    const listEl = el.createDiv('visual-notes-checklist-list');
    for (const item of card.items) this.appendChecklistItem(listEl, card, item);
    this.appendChecklistGhost(listEl, card);

    this.appendResizeHandles(el);
  },

  appendChecklistItem(this: FreeformRenderer, listEl: HTMLElement, card: ChecklistCard, item: ChecklistItem): HTMLElement {
    const row = listEl.createDiv('visual-notes-checklist-item');
    row.dataset.id = item.id;
    if (item.done) row.addClass('is-done');
    if (item.isHeader) row.addClass('is-header');
    if (item.parentId) row.addClass('is-child');

    const handle = row.createDiv('visual-notes-checklist-drag-handle');
    setIcon(handle, 'grip-vertical');
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      this.startChecklistItemDrag(e, listEl, card, item, row);
    });

    const cb = row.createEl('input');
    cb.type = 'checkbox'; cb.checked = item.done; cb.className = 'visual-notes-checklist-cb';
    if (item.isHeader) this.setHeaderCheckboxState(cb, card, item.id);

    cb.addEventListener('pointerdown', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      // Cascade to any children of this item
      const children = card.items.filter(i => i.parentId === item.id);
      for (const child of children) {
        child.done = cb.checked;
        const childRow = listEl.querySelector<HTMLElement>(`[data-id="${child.id}"]`);
        if (childRow) {
          childRow.toggleClass('is-done', child.done);
          const childCb = childRow.querySelector<HTMLInputElement>('.visual-notes-checklist-cb');
          if (childCb) { childCb.checked = cb.checked; childCb.indeterminate = false; }
        }
      }
      item.done = cb.checked;
      row.toggleClass('is-done', item.done);
      if (item.parentId) this.refreshHeaderCheckbox(listEl, card, item.parentId);
      this.scheduleSave();
    });

    const textDiv = row.createDiv('visual-notes-checklist-item-input') as HTMLElement;
    textDiv.contentEditable = 'true';
    textDiv.dataset.placeholder = item.isHeader ? 'Section…' : 'Add a task…';
    if (item.text) textDiv.appendChild(sanitizeHTMLToDom(item.text));
    textDiv.addEventListener('pointerdown', e => e.stopPropagation());

    let fmtToolbar: TextFormatToolbar | null = null;
    textDiv.addEventListener('focus', () => {
      if (!fmtToolbar) fmtToolbar = new TextFormatToolbar(textDiv, row, this.container);
    });
    textDiv.addEventListener('blur', () => {
      fmtToolbar?.destroy(); fmtToolbar = null;
      item.text = textDiv.innerHTML;
      this.scheduleSave();
    });
    textDiv.addEventListener('input', () => { item.text = textDiv.innerHTML; });
    textDiv.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        const idx = card.items.indexOf(item);
        const ni: ChecklistItem = { id: crypto.randomUUID(), text: '', done: false, parentId: item.parentId };
        card.items.splice(idx + 1, 0, ni);
        const nr = this.appendChecklistItem(listEl, card, ni);
        row.after(nr);
        window.setTimeout(() => nr.querySelector<HTMLElement>('.visual-notes-checklist-item-input')?.focus(), 0);
      }
      if (e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        if (e.shiftKey) {
          if (item.parentId) {
            item.parentId = undefined;
            row.removeClass('is-child');
            this.scheduleSave();
          }
        } else if (!item.parentId && !item.isHeader) {
          const idx = card.items.indexOf(item);
          for (let i = idx - 1; i >= 0; i--) {
            const above = card.items[i];
            if (above.isHeader || !above.parentId) {
              item.parentId = above.id;
              row.addClass('is-child');
              this.scheduleSave();
              break;
            }
          }
        }
      }
      if (e.key === 'Backspace' && (textDiv.innerHTML === '' || textDiv.innerHTML === '<br>')) {
        const idx = card.items.indexOf(item);
        if (idx > 0) {
          e.preventDefault(); e.stopPropagation();
          card.items.splice(idx, 1);
          const prev = row.previousElementSibling as HTMLElement | null;
          row.remove();
          prev?.querySelector<HTMLElement>('.visual-notes-checklist-item-input')?.focus();
          this.scheduleSave();
        }
      }
    });
    return row;
  },

  appendChecklistGhost(this: FreeformRenderer, listEl: HTMLElement, card: ChecklistCard): HTMLElement {
    const row = listEl.createDiv('visual-notes-checklist-item visual-notes-checklist-ghost');

    const cb = row.createEl('input');
    cb.type = 'checkbox'; cb.className = 'visual-notes-checklist-cb'; cb.disabled = true;
    cb.addEventListener('pointerdown', e => e.stopPropagation());

    const input = row.createEl('input');
    input.type = 'text'; input.placeholder = 'Add a task…';
    input.className = 'visual-notes-checklist-item-input';
    input.addEventListener('pointerdown', e => e.stopPropagation());

    let committed = false;
    const commit = () => {
      if (committed) return;
      const text = input.value.trim();
      if (!text) return;
      committed = true;
      const newItem: ChecklistItem = { id: crypto.randomUUID(), text, done: false };
      this.pushUndo(); card.items.push(newItem);
      row.remove();
      this.appendChecklistItem(listEl, card, newItem);
      this.appendChecklistGhost(listEl, card);
      this.scheduleSave();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!input.value.trim()) return;
        commit();
        window.setTimeout(() => listEl.querySelector<HTMLInputElement>('.visual-notes-checklist-ghost .visual-notes-checklist-item-input')?.focus(), 0);
      } else if (e.key === 'Escape') {
        e.preventDefault(); input.value = ''; input.blur();
      }
    });

    return row;
  },

  rebuildChecklistList(this: FreeformRenderer, listEl: HTMLElement, card: ChecklistCard): void {
    listEl.empty();
    for (const item of card.items) this.appendChecklistItem(listEl, card, item);
    this.appendChecklistGhost(listEl, card);
  },

  startChecklistItemDrag(this: FreeformRenderer, 
    startEvent: PointerEvent,
    listEl: HTMLElement,
    card: ChecklistCard,
    item: ChecklistItem,
    itemEl: HTMLElement,
  ): void {
    const itemRect = itemEl.getBoundingClientRect();

    const ghost = itemEl.cloneNode(true) as HTMLElement;
    ghost.addClass('visual-notes-checklist-drag-ghost');
    ghost.style.width = `${itemRect.width}px`;
    ghost.style.left = `${itemRect.left}px`;
    ghost.style.top = `${itemRect.top}px`;
    ghost.addClass('ib-no-pointer');
    activeDocument.body.appendChild(ghost);

    itemEl.addClass('is-dragging');

    let dropIndicator: HTMLElement | null = null;
    let insertBeforeId: string | null = null;
    let hasValidTarget = false;
    const removeIndicator = () => { dropIndicator?.remove(); dropIndicator = null; };

    const onMove = (e: PointerEvent) => {
      ghost.style.left = `${itemRect.left + (e.clientX - startEvent.clientX)}px`;
      ghost.style.top = `${itemRect.top + (e.clientY - startEvent.clientY)}px`;
      removeIndicator();
      insertBeforeId = null;
      hasValidTarget = false;

      const listRect = listEl.getBoundingClientRect();
      const overList = e.clientX >= listRect.left && e.clientX <= listRect.right &&
                       e.clientY >= listRect.top && e.clientY <= listRect.bottom;
      if (!overList) return;
      hasValidTarget = true;

      const rows = Array.from(listEl.querySelectorAll<HTMLElement>(
        '.visual-notes-checklist-item:not(.is-dragging):not(.visual-notes-checklist-ghost)'
      ));
      dropIndicator = createDiv();
      dropIndicator.className = 'visual-notes-checklist-drop-indicator';

      let placed = false;
      for (const r of rows) {
        const rr = r.getBoundingClientRect();
        if (e.clientY < rr.top + rr.height / 2) {
          insertBeforeId = r.dataset.id ?? null;
          listEl.insertBefore(dropIndicator, r);
          placed = true;
          break;
        }
      }
      if (!placed) {
        insertBeforeId = null;
        const addGhostRow = listEl.querySelector('.visual-notes-checklist-ghost');
        if (addGhostRow) listEl.insertBefore(dropIndicator, addGhostRow);
        else listEl.appendChild(dropIndicator);
      }
    };

    const onUp = () => {
      activeDocument.removeEventListener('pointermove', onMove);
      activeDocument.removeEventListener('pointerup', onUp);
      ghost.remove();
      removeIndicator();
      itemEl.removeClass('is-dragging');

      if (hasValidTarget) {
        const idx = card.items.indexOf(item);
        if (idx !== -1) {
          const without = card.items.slice(0, idx).concat(card.items.slice(idx + 1));
          const insertIdx = insertBeforeId ? without.findIndex(i => i.id === insertBeforeId) : -1;
          const finalIdx = insertIdx === -1 ? without.length : insertIdx;
          if (finalIdx !== idx) {
            this.pushUndo();
            without.splice(finalIdx, 0, item);
            card.items = without;
            this.rebuildChecklistList(listEl, card);
            this.scheduleSave();
          }
        }
      }
    };

    activeDocument.addEventListener('pointermove', onMove);
    activeDocument.addEventListener('pointerup', onUp);
  },

  setHeaderCheckboxState(this: FreeformRenderer, cb: HTMLInputElement, card: ChecklistCard, headerId: string): void {
    const children = card.items.filter(i => i.parentId === headerId);
    const doneCount = children.filter(i => i.done).length;
    if (children.length === 0) { cb.indeterminate = false; return; }
    if (doneCount === children.length) { cb.checked = true; cb.indeterminate = false; }
    else if (doneCount > 0) { cb.indeterminate = true; }
    else { cb.checked = false; cb.indeterminate = false; }
  },

  refreshHeaderCheckbox(this: FreeformRenderer, listEl: HTMLElement, card: ChecklistCard, headerId: string): void {
    const headerItem = card.items.find(i => i.id === headerId);
    if (!headerItem) return;
    const headerRow = listEl.querySelector<HTMLElement>(`[data-id="${headerId}"]`);
    const headerCb = headerRow?.querySelector<HTMLInputElement>('.visual-notes-checklist-cb');
    if (!headerCb) return;
    const children = card.items.filter(i => i.parentId === headerId);
    const doneCount = children.filter(i => i.done).length;
    if (children.length === 0) return;
    if (doneCount === children.length) {
      headerCb.checked = true; headerCb.indeterminate = false;
    } else if (doneCount > 0) {
      headerCb.indeterminate = true;
    } else {
      headerCb.checked = false; headerCb.indeterminate = false;
    }
  },

  renderCommentContent(this: FreeformRenderer, el: HTMLElement, card: CommentCard): void {
    el.addClass('visual-notes-freeform-comment-card');
    if (card.resolved) el.addClass('is-resolved');
    el.style.setProperty('--ib-comment-accent', card.color ?? '#eab308');

    const header = el.createDiv('visual-notes-comment-header');
    const avatar = header.createDiv('visual-notes-comment-avatar');
    avatar.setText(commentInitial(card.author));
    // Author + timestamp share one compact line instead of stacking into
    // two — same metadata, a lot less header height.
    const headMeta = header.createDiv('visual-notes-comment-head-meta');
    headMeta.createSpan({ cls: 'visual-notes-comment-author', text: card.author || 'Anonymous' });
    headMeta.createSpan({ cls: 'visual-notes-comment-time-sep', text: '·' });
    headMeta.createSpan({ cls: 'visual-notes-comment-time', text: formatCommentTime(card.createdAt) });
    if (card.resolved) {
      const badge = header.createDiv('visual-notes-comment-resolved-badge');
      setIcon(badge.createSpan(), 'check');
      badge.createSpan({ text: 'Resolved' });
    }

    const body = el.createDiv('visual-notes-comment-body');
    const textEl = body.createDiv('visual-notes-comment-text');
    textEl.contentEditable = 'true';
    textEl.dataset.placeholder = 'Write a comment…';
    if (card.text) textEl.appendChild(sanitizeHTMLToDom(card.text));
    textEl.addEventListener('pointerdown', e => e.stopPropagation());
    textEl.addEventListener('input', () => { card.text = textEl.innerHTML; });
    textEl.addEventListener('blur', () => this.scheduleSave());

    const repliesEl = el.createDiv('visual-notes-comment-replies');
    for (const reply of card.replies) this.appendCommentReply(repliesEl, card, reply);
    this.appendCommentReplyGhost(repliesEl, card);

    this.appendResizeHandles(el);
  },

  appendCommentReply(this: FreeformRenderer, listEl: HTMLElement, card: CommentCard, reply: CommentReply): HTMLElement {
    const row = listEl.createDiv('visual-notes-comment-reply');
    row.dataset.id = reply.id;

    const head = row.createDiv('visual-notes-comment-reply-head');
    head.createSpan({ cls: 'visual-notes-comment-reply-author', text: reply.author || 'Anonymous' });
    head.createSpan({ cls: 'visual-notes-comment-reply-time', text: formatCommentTime(reply.createdAt) });

    const delBtn = head.createDiv('visual-notes-comment-reply-delete');
    setIcon(delBtn, 'x');
    delBtn.setAttribute('aria-label', 'Delete reply');
    delBtn.setAttribute('tabindex', '0');
    delBtn.addEventListener('pointerdown', e => e.stopPropagation());
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pushUndo();
      card.replies = card.replies.filter(r => r.id !== reply.id);
      row.remove();
      this.scheduleSave();
    });

    const textEl = row.createDiv('visual-notes-comment-reply-text');
    textEl.contentEditable = 'true';
    if (reply.text) textEl.appendChild(sanitizeHTMLToDom(reply.text));
    textEl.addEventListener('pointerdown', e => e.stopPropagation());
    textEl.addEventListener('input', () => { reply.text = textEl.innerHTML; });
    textEl.addEventListener('blur', () => this.scheduleSave());

    return row;
  },

  appendCommentReplyGhost(this: FreeformRenderer, listEl: HTMLElement, card: CommentCard): HTMLElement {
    const row = listEl.createDiv('visual-notes-comment-reply visual-notes-comment-reply-ghost');
    const input = row.createEl('input');
    input.type = 'text'; input.placeholder = 'Reply…';
    input.className = 'visual-notes-comment-reply-ghost-input';
    input.addEventListener('pointerdown', e => e.stopPropagation());

    let committed = false;
    const commit = () => {
      if (committed) return;
      const text = input.value.trim();
      if (!text) return;
      committed = true;
      const reply: CommentReply = { id: crypto.randomUUID(), text, author: this.commentAuthorName, createdAt: Date.now() };
      this.pushUndo(); card.replies.push(reply);
      row.remove();
      this.appendCommentReply(listEl, card, reply);
      this.appendCommentReplyGhost(listEl, card);
      this.scheduleSave();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!input.value.trim()) return;
        commit();
        window.setTimeout(() => listEl.querySelector<HTMLInputElement>('.visual-notes-comment-reply-ghost-input')?.focus(), 0);
      } else if (e.key === 'Escape') {
        e.preventDefault(); input.value = ''; input.blur();
      }
    });

    return row;
  },

  renderNoteLinkContent(this: FreeformRenderer, el: HTMLElement, card: NoteLinkCard): void {
    el.addClass('visual-notes-freeform-notelink-card');

    const titleBar = el.createDiv('visual-notes-notelink-titlebar');
    setIcon(titleBar.createDiv('visual-notes-notelink-icon'), 'file-text');

    const file = this.app.vault.getAbstractFileByPath(card.path);
    const title = file ? file.name.replace(/\.md$/, '') : (card.path || 'Note Link');
    titleBar.createDiv({ cls: 'visual-notes-notelink-title', text: title });

    const modeBtn = titleBar.createEl('button', { cls: 'visual-notes-notelink-mode-btn' });
    modeBtn.setAttribute('title', card.displayMode === 'preview' ? 'Switch to title-only' : 'Switch to preview');
    setIcon(modeBtn, card.displayMode === 'preview' ? 'minimize-2' : 'eye');
    modeBtn.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault(); this.pushUndo();
      card.displayMode = card.displayMode === 'preview' ? 'title-only' : 'preview';
      if (card.displayMode === 'preview') {
        card.w = Math.max(card.w ?? NOTELINK_DEFAULT_W, NOTELINK_DEFAULT_W);
        card.h = Math.max(card.h ?? NOTELINK_DEFAULT_H, NOTELINK_DEFAULT_H);
      } else { card.w = card.w ?? NOTELINK_TITLE_W; card.h = NOTELINK_TITLE_H; }
      el.style.width = `${card.w}px`; el.style.height = `${card.h}px`;
      this.renderCardContent(el, card); this.scheduleSave();
    });

    if (card.displayMode === 'preview' && file instanceof TFile) {
      const previewEl = el.createDiv('visual-notes-notelink-preview');
      const loadPreview = (f: TFile) => {
        if (!el.contains(previewEl)) return;
        void this.app.vault.cachedRead(f).then(content => {
          if (!el.contains(previewEl)) return;
          previewEl.empty();
          void MarkdownRenderer.render(this.app, content, previewEl, f.path, this);
        });
      };
      loadPreview(file);

      const reloadBtn = titleBar.createEl('button', { cls: 'visual-notes-notelink-mode-btn' });
      reloadBtn.setAttribute('title', 'Reload note content'); setIcon(reloadBtn, 'refresh-cw');
      reloadBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); loadPreview(file); });

      this.registerEvent(this.app.vault.on('modify', (modified) => {
        if (modified instanceof TFile && modified.path === card.path) loadPreview(modified);
      }));
    }

    this.appendResizeHandles(el);
  },

  renderSwatchContent(this: FreeformRenderer, el: HTMLElement, card: SwatchCard): void {
    el.addClass('visual-notes-freeform-swatch-card');

    const colorArea = el.createDiv('visual-notes-swatch-color-area');
    colorArea.style.backgroundColor = card.color;

    const hexLabel = colorArea.createDiv({ cls: 'visual-notes-swatch-hex', text: card.color.toUpperCase() });
    hexLabel.style.color = contrastColor(card.color);

    // Native <input type="color"> — the browser's own picker gives a full
    // gradient/wheel + hex/RGB fields + eyedropper for free. Kept invisible
    // and triggered by a small pipette button so the swatch face itself
    // stays a clean color block rather than a form control.
    const colorInput = colorArea.createEl('input', { cls: 'visual-notes-swatch-color-input' });
    colorInput.type = 'color';
    colorInput.value = card.color;
    colorInput.addEventListener('pointerdown', e => e.stopPropagation());
    colorInput.addEventListener('input', () => {
      card.color = colorInput.value;
      colorArea.style.backgroundColor = card.color;
      hexLabel.setText(card.color.toUpperCase());
      hexLabel.style.color = contrastColor(card.color);
      nameLabel.setText(nearestColorName(card.color));
    });
    colorInput.addEventListener('change', () => { this.pushUndo(); this.scheduleSave(); });

    const editBtn = colorArea.createDiv('visual-notes-swatch-edit-btn');
    setIcon(editBtn, 'pipette');
    editBtn.setAttribute('aria-label', 'Change color');
    editBtn.addEventListener('pointerdown', e => e.stopPropagation());
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); colorInput.click(); });

    const nameBar = el.createDiv('visual-notes-swatch-name-bar');
    const nameLabel = nameBar.createDiv({ cls: 'visual-notes-swatch-name', text: nearestColorName(card.color) });

    const randomBtn = nameBar.createDiv('visual-notes-swatch-random-btn');
    setIcon(randomBtn, 'shuffle');
    randomBtn.setAttribute('aria-label', 'Randomize color');
    randomBtn.setAttribute('tabindex', '0');
    randomBtn.addEventListener('pointerdown', e => e.stopPropagation());
    const randomize = () => {
      this.pushUndo();
      card.color = randomNamedColor().hex;
      colorArea.style.backgroundColor = card.color;
      colorInput.value = card.color;
      hexLabel.setText(card.color.toUpperCase());
      hexLabel.style.color = contrastColor(card.color);
      nameLabel.setText(nearestColorName(card.color));
      this.scheduleSave();
    };
    randomBtn.addEventListener('click', (e) => { e.stopPropagation(); randomize(); });
    randomBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); randomize(); }
    });

    this.appendResizeHandles(el);
  },

  addSwatchAt(this: FreeformRenderer, x: number, y: number): void {
    const card: SwatchCard = {
      id: crypto.randomUUID(), kind: 'swatch', x, y,
      w: SWATCH_DEFAULT_W, h: SWATCH_DEFAULT_H, z: this.nextZ(),
      color: randomNamedColor().hex,
    };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
  },

  fileTypeIcon(this: FreeformRenderer, ext: string): string {
    const e = ext.toLowerCase();
    if (e === 'pdf') return 'file-text';
    if (['zip','rar','7z','tar','gz'].includes(e)) return 'file-archive';
    if (['xls','xlsx','csv','ods','numbers'].includes(e)) return 'file-spreadsheet';
    if (['doc','docx','odt','rtf','pages'].includes(e)) return 'file-text';
    if (['ppt','pptx','odp','key'].includes(e)) return 'file-sliders';
    if (['mp4','mkv','mov','avi','m4v','webm'].includes(e)) return 'file-video';
    if (['js','ts','py','json','html','css','sh','yml','yaml','xml','c','cpp','rs','go','java'].includes(e)) return 'file-code';
    return 'file';
  },

  formatFileSize(this: FreeformRenderer, bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  },

  renderFileContent(this: FreeformRenderer, el: HTMLElement, card: FileCard): void {
    el.addClass('visual-notes-freeform-file-card');

    const file = this.app.vault.getAbstractFileByPath(card.path);
    if (!(file instanceof TFile)) {
      const fail = el.createDiv('visual-notes-map-fail');
      setIcon(fail.createDiv('visual-notes-map-fail-icon'), 'file-x');
      fail.createDiv({ cls: 'visual-notes-bookmark-fail-url', text: card.path });
      fail.createDiv({ cls: 'visual-notes-bookmark-loading-text', text: 'File not found in vault. Try "Relink all board assets".' });
      this.appendResizeHandles(el);
      return;
    }

    const ext = file.extension.toLowerCase();

    if (ext === 'pdf') {
      // Live embedded PDF preview via Chromium's built-in viewer. Same
      // pattern as the map card: the iframe swallows pointer events, so a
      // permanent header strip is the drag handle.
      const header = el.createDiv('visual-notes-file-header');
      setIcon(header.createDiv('visual-notes-file-header-icon'), 'file-text');
      header.createDiv({ cls: 'visual-notes-file-header-title', text: file.name });
      header.setAttribute('title', 'Drag here to move. Double-click to open.');

      const body = el.createDiv('visual-notes-file-body');
      const iframe = body.createEl('iframe', { cls: 'visual-notes-file-iframe' });
      iframe.src = `${this.app.vault.getResourcePath(file)}#toolbar=0`;
      iframe.setAttribute('title', file.name);
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('loading', 'lazy');
    } else {
      const tile = el.createDiv('visual-notes-file-tile');
      const iconEl = tile.createDiv('visual-notes-file-tile-icon');
      setIcon(iconEl, this.fileTypeIcon(ext));
      tile.createDiv({ cls: 'visual-notes-file-tile-name', text: file.name });
      const meta = tile.createDiv('visual-notes-file-tile-meta');
      meta.createSpan({ cls: 'visual-notes-file-ext-pill', text: ext.toUpperCase() });
      meta.createSpan({ text: this.formatFileSize(file.stat.size) });
    }

    this.appendResizeHandles(el);
  },

  async openFileCard(this: FreeformRenderer, card: FileCard): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(card.path);
    if (!(file instanceof TFile)) { new Notice('File not found in vault.'); return; }
    // Obsidian opens what it understands (pdf, md, images, audio, video);
    // for everything else fall back to the OS default app (desktop only —
    // openWithDefaultApp is a private desktop API, hence the guard+catch).
    const knownViewer = ['pdf','md','canvas', ...IMAGE_EXTS, ...AUDIO_EXTS, 'mp4','mov','mkv','webm'];
    if (knownViewer.includes(file.extension.toLowerCase())) {
      await this.app.workspace.getLeaf('tab').openFile(file);
      return;
    }
    const appWithOpen = this.app as App & { openWithDefaultApp?: (path: string) => Promise<void> };
    try {
      if (appWithOpen.openWithDefaultApp) await appWithOpen.openWithDefaultApp(file.path);
      else await this.app.workspace.getLeaf('tab').openFile(file);
    } catch {
      new Notice('No app available to open this file type.');
    }
  },

  renderCalloutContent(this: FreeformRenderer, el: HTMLElement, card: CalloutCard): void {
    el.addClass('visual-notes-freeform-callout-card');
    el.style.borderLeftColor = card.color;
    // Tinted background derived from the accent — hex + alpha suffix keeps
    // it readable on both light and dark themes without a second setting.
    el.style.backgroundColor = `${card.color}1A`;

    const iconEl = el.createDiv({ cls: 'visual-notes-callout-icon', text: card.icon ?? '💡' });
    iconEl.setAttribute('title', 'Right-click the card to change the icon');

    const textEl = el.createDiv('visual-notes-callout-text');
    textEl.dataset.placeholder = 'Type something…';
    textEl.setText(card.text);
    // Same edit-on-demand model as table cells: static until double-click
    // (the card-level dblclick dispatch promotes it), demoted on blur.
    textEl.addEventListener('input', () => { card.text = textEl.textContent ?? ''; });
    textEl.addEventListener('blur', () => {
      textEl.contentEditable = 'false';
      this.scheduleSave();
    });
    textEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') textEl.blur();
    });

    this.appendResizeHandles(el);
  },

  editCalloutInline(this: FreeformRenderer, el: HTMLElement, _card: CalloutCard): void {
    const textEl = el.querySelector<HTMLElement>('.visual-notes-callout-text');
    if (!textEl) return;
    if (!textEl.isContentEditable) { textEl.contentEditable = 'true'; textEl.spellcheck = false; }
    textEl.focus();
    const rng = activeDocument.createRange();
    rng.selectNodeContents(textEl);
    rng.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(rng);
  },

  addCalloutAt(this: FreeformRenderer, x: number, y: number): void {
    const card: CalloutCard = {
      id: crypto.randomUUID(), kind: 'callout', x, y,
      w: CALLOUT_DEFAULT_W, h: CALLOUT_DEFAULT_H, z: this.nextZ(),
      text: '', icon: '💡', color: '#3b82f6',
    };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    const el = this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
    window.setTimeout(() => this.editCalloutInline(el, card), 0);
  },

  renderGroupContent(this: FreeformRenderer, el: HTMLElement, card: GroupCard): void {
    el.addClass('visual-notes-freeform-group-card');
    const color = card.color ?? '#6b7280';
    el.style.borderColor = color;
    el.style.backgroundColor = `${color}14`;

    const label = el.createDiv({ cls: 'visual-notes-group-label', text: card.label || 'Group' });
    label.toggleClass('is-empty', !card.label);
    label.style.backgroundColor = color;
    label.style.color = contrastColor(color);
    label.addEventListener('pointerdown', e => e.stopPropagation());
    label.addEventListener('dblclick', (e) => { e.stopPropagation(); this.editGroupLabel(el, card); });

    this.appendResizeHandles(el);
  },

  editGroupLabel(this: FreeformRenderer, el: HTMLElement, card: GroupCard): void {
    const label = el.querySelector<HTMLElement>('.visual-notes-group-label');
    if (!label || label.querySelector('input')) return;
    const original = card.label ?? '';
    label.empty();
    label.removeClass('is-empty');
    const input = label.createEl('input');
    input.type = 'text'; input.value = original; input.placeholder = 'Group';
    input.addClass('visual-notes-group-label-input');

    let cancelled = false;
    const restore = (text: string) => {
      label.empty();
      label.setText(text || 'Group');
      label.toggleClass('is-empty', !text);
    };
    const commit = () => {
      if (cancelled) { restore(original); return; }
      this.pushUndo();
      card.label = input.value.trim() || undefined;
      restore(card.label ?? '');
      this.scheduleSave();
    };
    input.addEventListener('pointerdown', e => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelled = true; input.blur(); }
    });
    input.addEventListener('blur', commit);
    window.requestAnimationFrame(() => { input.focus(); input.select(); });
  },

  cardsContainedInGroup(this: FreeformRenderer, group: GroupCard): string[] {
    const gx = group.x ?? 0, gy = group.y ?? 0;
    const gw = group.w ?? GROUP_DEFAULT_W, gh = group.h ?? GROUP_DEFAULT_H;
    const ids: string[] = [];
    for (const c of this.board.cards) {
      if (c.id === group.id || c.kind === 'group') continue;
      const cx = (c.x ?? 0) + (c.w ?? TILE_DEFAULT_W) / 2;
      const cy = (c.y ?? 0) + (c.h ?? TILE_DEFAULT_H) / 2;
      if (cx >= gx && cx <= gx + gw && cy >= gy && cy <= gy + gh) ids.push(c.id);
    }
    return ids;
  },

  groupSelected(this: FreeformRenderer): void {
    const ids = this.selection.getIds();
    const selected = ids.map(id => this.board.cards.find(c => c.id === id)).filter((c): c is Card => !!c);
    if (selected.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minZ = Infinity;
    for (const c of selected) {
      const x = c.x ?? 0, y = c.y ?? 0, w = c.w ?? TILE_DEFAULT_W, h = c.h ?? TILE_DEFAULT_H;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
      minZ = Math.min(minZ, c.z ?? 0);
    }

    const card: GroupCard = {
      id: crypto.randomUUID(), kind: 'group',
      x: minX - GROUP_PAD, y: minY - GROUP_PAD - 20, // extra top margin so the label chip clears the frame
      w: (maxX - minX) + GROUP_PAD * 2, h: (maxY - minY) + GROUP_PAD * 2 + 20,
      z: minZ - 1,
    };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    const el = this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
    window.setTimeout(() => this.editGroupLabel(el, card), 0);
  },

  addGroupAt(this: FreeformRenderer, x: number, y: number): void {
    const card: GroupCard = {
      id: crypto.randomUUID(), kind: 'group', x, y,
      w: GROUP_DEFAULT_W, h: GROUP_DEFAULT_H, z: 0,
    };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
  },

  addFileAt(this: FreeformRenderer, x: number, y: number): void {
    const createCard = (path: string) => {
      const isPdf = path.toLowerCase().endsWith('.pdf');
      const card: FileCard = {
        id: crypto.randomUUID(), kind: 'file', x, y,
        w: FILE_DEFAULT_W, h: isPdf ? FILE_DEFAULT_H : 150, z: this.nextZ(), path,
      };
      this.pushUndo(); this.board.cards.push(card); void this.saveNow();
      this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
    };
    const fromVault = () => new VaultAnyFilePickerModal(this.app, (f) => { void (async () => {
      createCard(await sortAssetFile(this.app, f));
    })(); }).open();
    const fromUpload = () => {
      const input = createEl('input');
      input.type = 'file';
      input.addEventListener('change', () => { void (async () => {
        const file = input.files?.[0]; if (!file) return;
        let path: string;
        try { path = await saveNewAsset(this.app, await file.arrayBuffer(), file.name); }
        catch { new Notice(`Failed to save ${file.name}.`); return; }
        createCard(path);
      })(); });
      input.click();
    };
    new MediaSourceModal(this.app, 'Add file', fromVault, fromUpload).open();
  },

  createSwatchGrid(this: FreeformRenderer, x: number, y: number, colors: NamedColor[]): void {
    const cell = 96, gap = 8, cols = 8;
    this.pushUndo();
    let z = this.nextZ();
    const newIds: string[] = [];
    colors.forEach((entry, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const card: SwatchCard = {
        id: crypto.randomUUID(), kind: 'swatch',
        x: this.applySnap(x + col * (cell + gap)),
        y: this.applySnap(y + row * (cell + gap)),
        w: cell, h: cell, z: z++,
        color: entry.hex,
      };
      this.board.cards.push(card);
      this.createCardEl(card);
      newIds.push(card.id);
    });
    this.selection.clear();
    for (const id of newIds) this.selection.add(id);
    this.refreshSelectionVisuals();
    void this.saveNow();
  },

  rebuildChecklistCard(this: FreeformRenderer, card: ChecklistCard): void {
    const oldEl = this.cardEls.get(card.id);
    if (!oldEl) return;
    const newEl = this.inner.createDiv('visual-notes-freeform-card');
    newEl.dataset.id = card.id;
    this.positionCardEl(newEl, card);
    this.renderCardContent(newEl, card);
    oldEl.replaceWith(newEl);
    this.cardEls.set(card.id, newEl);
  },

  addTile(this: FreeformRenderer): void { const p = this.centerPos(TILE_DEFAULT_W, TILE_DEFAULT_H); this.addTileAt(p.x, p.y); },

  addTileAt(this: FreeformRenderer, x: number, y: number): void {
    new TileModal(this.app, null, (t) => {
      t.x = x; t.y = y; t.w = TILE_DEFAULT_W; t.h = TILE_DEFAULT_H; t.z = this.nextZ();
      this.pushUndo(); this.board.cards.push(t); void this.saveNow();
      this.createCardEl(t); this.selection.select(t.id); this.refreshSelectionVisuals();
    }, this.file).open();
  },

  addSticky(this: FreeformRenderer): void { const p = this.centerPos(STICKY_DEFAULT_W, STICKY_DEFAULT_H); this.addStickyAt(p.x, p.y); },

  addStickyAt(this: FreeformRenderer, x: number, y: number, initialText = ''): void {
    const card: StickyCard = { id: crypto.randomUUID(), kind: 'sticky', x, y, w: STICKY_DEFAULT_W, z: this.nextZ(), text: initialText, color: this.defaultStickyColor ?? STICKY_COLORS[0].color };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    const el = this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
    if (!initialText) this.editStickyInline(el, card);
  },

  addBlankCard(this: FreeformRenderer): void { const p = this.centerPos(STICKY_DEFAULT_W, STICKY_DEFAULT_H); this.addBlankCardAt(p.x, p.y); },

  addBlankCardAt(this: FreeformRenderer, x: number, y: number): void {
    const card: StickyCard = { id: crypto.randomUUID(), kind: 'sticky', x, y, w: STICKY_DEFAULT_W, z: this.nextZ(), text: '', color: '#F3F4F6', blank: true };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    const el = this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
    this.editStickyInline(el, card);
  },

  addChecklist(this: FreeformRenderer): void { const p = this.centerPos(CHECKLIST_DEFAULT_W, CHECKLIST_DEFAULT_H); this.addChecklistAt(p.x, p.y); },

  addChecklistAt(this: FreeformRenderer, x: number, y: number): void {
    const card: ChecklistCard = { id: crypto.randomUUID(), kind: 'checklist', x, y, w: CHECKLIST_DEFAULT_W, h: CHECKLIST_DEFAULT_H, z: this.nextZ(), title: '', titleHidden: true, items: [], color: 'var(--background-primary)' };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    const el = this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
    window.setTimeout(() => el.querySelector<HTMLElement>('.visual-notes-checklist-item-input')?.focus(), 50);
  },

  addComment(this: FreeformRenderer): void { const p = this.centerPos(COMMENT_DEFAULT_W, COMMENT_DEFAULT_H); this.addCommentAt(p.x, p.y); },

  addCommentAt(this: FreeformRenderer, x: number, y: number): void {
    const card: CommentCard = {
      id: crypto.randomUUID(), kind: 'comment', x, y, w: COMMENT_DEFAULT_W, h: COMMENT_DEFAULT_H, z: this.nextZ(),
      text: '', author: this.commentAuthorName, createdAt: Date.now(), replies: [],
    };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    const el = this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
    window.setTimeout(() => el.querySelector<HTMLElement>('.visual-notes-comment-text')?.focus(), 50);
  },

  addNoteLink(this: FreeformRenderer): void { const p = this.centerPos(NOTELINK_DEFAULT_W, NOTELINK_DEFAULT_H); this.addNoteLinkAt(p.x, p.y); },

  addNoteLinkAt(this: FreeformRenderer, x: number, y: number): void {
    new NoteLinkPickerModal(this.app, (file) => {
      const card: NoteLinkCard = { id: crypto.randomUUID(), kind: 'note-link', x, y, w: NOTELINK_DEFAULT_W, h: NOTELINK_DEFAULT_H, z: this.nextZ(), path: file.path, displayMode: 'preview' };
      this.pushUndo(); this.board.cards.push(card); void this.saveNow();
      this.createCardEl(card); this.selection.select(card.id); this.refreshSelectionVisuals();
    }).open();
  },
};
