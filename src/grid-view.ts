import { App, setIcon, Menu, Notice, TFile, TFolder } from 'obsidian';
import Sortable from 'sortablejs';
import { VisualNotesFile, TileCard, TILE_DRAG_MIME, DraggedTilePayload } from './file-types';
import { writeBoardFile } from './file-io';
import { contrastColor } from './color-utils';
import { resolveThumbnailSrc } from './thumbnail-utils';
import { isCustomIconRef, resolveCustomIconSrc } from './custom-icons';
import { TileModal, ConfirmModal } from './tile-modal';
import { initDrag } from './drag';

/** Typed wrapper for private Obsidian APIs used in grid-view. */
interface AppWithPrivateAPIs extends App {
  plugins?: { enabledPlugins?: Set<string> };
}

export class GridRenderer {
  private sortable: Sortable | null = null;

  constructor(
    private app: App,
    private container: HTMLElement,
    private board: VisualNotesFile,
    private file: TFile,
    private onNavigate: (boardPath: string) => Promise<void>
  ) {}

  render(): void {
    this.sortable?.destroy();
    this.sortable = null;
    this.container.empty();

    const grid = this.container.createDiv('visual-notes-grid');
    const tiles = this.getSortedTiles();
    for (const tile of tiles) this.renderTile(grid, tile);

    // "Add tile" button
    const addBtn = grid.createDiv('visual-notes-add-tile');
    addBtn.setAttribute('tabindex', '0');
    addBtn.setAttribute('role', 'button');
    addBtn.setAttribute('aria-label', 'Add tile');
    setIcon(addBtn.createDiv('visual-notes-add-icon'), 'plus');
    addBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addBtn.click(); }
    });
    addBtn.addEventListener('click', () => {
      new TileModal(this.app, null, (newTile) => { void (async () => {
        newTile.order = this.board.cards.length;
        this.board.cards.push(newTile);
        await this.save();
        this.render();
      })(); }, this.file).open();
    });

    // Drag to rearrange
    this.sortable = initDrag(grid, tiles, async (reordered) => {
      // Update order fields and replace tiles in board.cards
      reordered.forEach((t, i) => { t.order = i; });
      const otherCards = this.board.cards.filter(c => c.kind !== 'tile');
      this.board.cards = [...reordered, ...otherCards];
      await this.save();
    });
  }

  destroy(): void {
    this.sortable?.destroy();
    this.sortable = null;
  }

  // ── Tile rendering ───────────────────────────────────────────

  private renderTile(grid: HTMLElement, tile: TileCard): void {
    const wrapper = grid.createDiv('visual-notes-tile-wrapper');
    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute('aria-label', tile.label + (tile.subtitle ? `, ${tile.subtitle}` : ''));

    // Native HTML5 drag, separate from Sortable's in-grid reorder (which
    // listens for dragover/drop on this same `grid` element specifically) —
    // this lets the tile also be dropped onto a freeform canvas open in a
    // different pane, recreated there as an equivalent nested Tile card.
    wrapper.setAttribute('draggable', 'true');
    wrapper.addEventListener('dragstart', (e) => {
      if (!e.dataTransfer) return;
      const payload: DraggedTilePayload = {
        label: tile.label,
        subtitle: tile.subtitle,
        icon: tile.icon,
        color: tile.color,
        thumbnail: tile.thumbnail,
        target: tile.target,
      };
      e.dataTransfer.setData(TILE_DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'copy';
    });

    const tileEl = wrapper.createDiv('visual-notes-tile');
    // The accent color is meant as a backdrop for a small centered icon
    // glyph — it looks wrong behind a full thumbnail image, especially one
    // with transparent or padded margins (logos/app icons commonly have
    // both), where it would show straight through as an unwanted colored
    // halo. Use a neutral background instead whenever a thumbnail is set,
    // or the icon itself is a custom bundled asset (same reasoning — it's
    // full art, not a glyph meant to sit on an accent-colored chip).
    const hasThumbForBg = !!tile.thumbnail || isCustomIconRef(tile.icon);
    tileEl.setCssProps({ '--ib-tile-color': hasThumbForBg ? 'transparent' : tile.color });
    tileEl.style.overflow = 'hidden';

    const iconColor = contrastColor(tile.color);
    const thumbSrc = resolveThumbnailSrc(this.app, tile);

    if (thumbSrc) {
      const img = tileEl.createEl('img', { cls: 'visual-notes-tile-thumbnail-img' });
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;';
      img.src = thumbSrc;
      img.alt = tile.label;
      // If the image fails to load (moved/deleted vault file, dead URL),
      // fall back to the icon/color rendering rather than showing a broken
      // image icon.
      img.addEventListener('error', () => {
        img.remove();
        tileEl.setCssProps({ '--ib-tile-color': tile.color });
        this.renderIconInto(tileEl, tile, iconColor);
      });
    } else {
      this.renderIconInto(tileEl, tile, iconColor);
    }

    wrapper.createDiv({ cls: 'visual-notes-tile-label', text: tile.label });
    if (tile.subtitle) {
      wrapper.createDiv({ cls: 'visual-notes-tile-subtitle', text: tile.subtitle });
    }

    if (tile.target.kind === 'board') {
      const chevron = tileEl.createDiv('visual-notes-tile-board-indicator');
      setIcon(chevron, 'chevron-right');
      chevron.style.color = iconColor;
    }

    if (tile.target.kind === 'kanban') {
      const indicator = tileEl.createDiv('visual-notes-tile-board-indicator');
      setIcon(indicator, 'columns-3');
      indicator.style.color = iconColor;
    }

    // ── Interactions ─────────────────────────────────────────
    let suppressClick = false;

    wrapper.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      void this.activateTile(tile);
    });

    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void this.activateTile(tile); }
      if (e.key === 'F10' && e.shiftKey) {
        e.preventDefault();
        const rect = wrapper.getBoundingClientRect();
        wrapper.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left, clientY: rect.bottom })
        );
      }
    });

    wrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      suppressClick = true;
      const menu = new Menu();
      menu.addItem(item =>
        item.setTitle('Edit').setIcon('pencil').onClick(() => {
          new TileModal(this.app, tile, (updated) => { void (async () => {
            const idx = this.board.cards.findIndex(c => c.id === updated.id);
            if (idx !== -1) this.board.cards[idx] = updated;
            await this.save();
            this.render();
          })(); }, this.file).open();
        })
      );
      menu.addSeparator();
      menu.addItem(item =>
        item.setTitle('Delete').setIcon('trash').onClick(() => {
          const msg = `Delete "${tile.label}"?`;
          new ConfirmModal(this.app, msg, () => { void (async () => {
            this.board.cards = this.board.cards.filter(c => c.id !== tile.id);
            await this.save();
            this.render();
          })(); }).open();
        })
      );
      menu.showAtMouseEvent(e);
    });

    // Long-press for mobile
    let longPressTimer: number | null = null;
    wrapper.addEventListener('pointerdown', (e) => {
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        suppressClick = true;
        wrapper.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY })
        );
      }, 600);
    });
    wrapper.addEventListener('pointerup', () => { if (longPressTimer) { window.clearTimeout(longPressTimer); longPressTimer = null; } });
    wrapper.addEventListener('pointermove', () => { if (longPressTimer) { window.clearTimeout(longPressTimer); longPressTimer = null; } });
  }

  // ── Tile activation ──────────────────────────────────────────

  private async activateTile(tile: TileCard): Promise<void> {
    const { target } = tile;

    if (target.kind === 'board') {
      await this.onNavigate(target.path);
      return;
    }

    if (!target.path) { new Notice('This tile has no target set.'); return; }

    const abstract = this.app.vault.getAbstractFileByPath(target.path);
    if (!abstract) { new Notice(`Target no longer exists: ${target.path}`); return; }

    if (target.kind === 'note' || target.kind === 'canvas') {
      if (!(abstract instanceof TFile)) return;
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.openFile(abstract);
      void this.app.workspace.revealLeaf(leaf);
      return;
    }

    if (target.kind === 'kanban') {
      if (!(abstract instanceof TFile)) return;
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.openFile(abstract);
      void this.app.workspace.revealLeaf(leaf);
      const isInstalled = (this.app as AppWithPrivateAPIs).plugins?.enabledPlugins?.has('obsidian-kanban') ?? false;
      if (!isInstalled) new Notice('Install the community "Kanban" plugin to view this as a board.');
      return;
    }

    if (target.kind === 'folder') {
      if (!(abstract instanceof TFolder)) return;
      const explorerLeaves = this.app.workspace.getLeavesOfType('file-explorer');
      if (explorerLeaves.length > 0) {
        const view = explorerLeaves[0].view as { revealInFolder?: (f: TFolder) => void };
        view.revealInFolder?.(abstract);
      }
      const firstNote = abstract.children.find(
        (f): f is TFile => f instanceof TFile && f.extension === 'md'
      );
      if (firstNote) {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.openFile(firstNote);
        void this.app.workspace.revealLeaf(leaf);
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  private renderIconInto(tileEl: HTMLElement, tile: TileCard, iconColor: string): void {
    const iconEl = tileEl.createDiv('visual-notes-tile-icon');
    iconEl.style.color = iconColor;
    const customSrc = isCustomIconRef(tile.icon) ? resolveCustomIconSrc(tile.icon) : undefined;
    const isSingleEmoji =
      [...tile.icon].length === 1 && /\p{Emoji_Presentation}/u.test(tile.icon);
    if (customSrc) {
      iconEl.createEl('img', { attr: { src: customSrc }, cls: 'visual-notes-tile-custom-icon-img' });
    } else if (isSingleEmoji) {
      iconEl.setText(tile.icon);
      iconEl.addClass('visual-notes-tile-emoji');
    } else {
      setIcon(iconEl, tile.icon);
    }
  }

  private getSortedTiles(): TileCard[] {
    return this.board.cards
      .filter((c): c is TileCard => c.kind === 'tile')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private async save(): Promise<void> {
    await writeBoardFile(this.app, this.file, this.board);
  }
}