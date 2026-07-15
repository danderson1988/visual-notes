import { App, Modal, setIcon, getIconIds } from 'obsidian';
import { CUSTOM_ICONS, customIconRef } from './custom-icons';

type PickerMode = 'lucide' | 'custom';

// Same palette used in tile-modal.ts — duplicated rather than imported
// since tile-modal.ts already imports this file (importing back would be
// circular).
const COLOR_PALETTE = [
  '#EF4444', '#F59E0B', '#EAB308', '#84CC16',
  '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6',
  '#EC4899', '#64748B', '#44403C', '#FFFFFF',
];

export class IconPickerModal extends Modal {
  // Color only matters for the Lucide tab (a glyph tinted/backed by it) —
  // custom asset icons render their own art on a transparent backdrop, so
  // picking one just passes the color through unchanged.
  private onSelect: (iconId: string, color: string) => void;
  private mode: PickerMode = 'lucide';
  private searchTerm = '';
  private selectedColor: string;

  constructor(app: App, currentColor: string, onSelect: (iconId: string, color: string) => void) {
    super(app);
    this.onSelect = onSelect;
    this.selectedColor = currentColor;
    this.modalEl.addClass('visual-notes-icon-picker-modal');
  }

  override onOpen(): void {
    this.render();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h3', { text: 'Choose Symbol' });

    // Mode toggle row
    const toggleRow = contentEl.createDiv('icon-picker-toggle-row');
    const modes: [PickerMode, string][] = [['lucide', 'Symbols'], ['custom', 'Custom']];
    for (const [m, label] of modes) {
      const btn = toggleRow.createEl('button', {
        text: label,
        cls: this.mode === m ? 'icon-picker-toggle-btn is-active' : 'icon-picker-toggle-btn',
      });
      btn.addEventListener('click', () => { this.mode = m; this.render(); });
    }

    if (this.mode === 'lucide') {
      const colorRow = contentEl.createDiv('icon-picker-color-row');
      for (const hex of COLOR_PALETTE) {
        const sw = colorRow.createDiv('icon-picker-color-swatch');
        sw.style.backgroundColor = hex;
        sw.toggleClass('is-selected', hex.toLowerCase() === this.selectedColor.toLowerCase());
        sw.addEventListener('click', () => {
          this.selectedColor = hex;
          colorRow.querySelectorAll<HTMLElement>('.icon-picker-color-swatch').forEach(s => s.removeClass('is-selected'));
          sw.addClass('is-selected');
        });
      }

      const searchInput = contentEl.createEl('input', {
        type: 'text',
        placeholder: 'Search symbols…',
        cls: 'icon-picker-search',
      });
      searchInput.value = this.searchTerm;
      searchInput.focus();

      const iconGrid = contentEl.createDiv('icon-picker-grid');
      this.renderIconGrid(iconGrid, this.searchTerm);

      searchInput.addEventListener('input', () => {
        this.searchTerm = searchInput.value;
        this.renderIconGrid(iconGrid, this.searchTerm);
      });
    } else {
      const grid = contentEl.createDiv('icon-picker-grid');
      if (CUSTOM_ICONS.length === 0) {
        grid.createEl('p', { text: 'No custom symbols bundled yet.', cls: 'icon-picker-empty' });
      }
      for (const custom of CUSTOM_ICONS) {
        const btn = grid.createDiv('icon-picker-item');
        btn.setAttribute('aria-label', custom.label);
        const img = btn.createEl('img', { cls: 'icon-picker-custom-img', attr: { src: custom.src, alt: custom.label } });
        img.addEventListener('error', () => img.remove());
        btn.addEventListener('click', () => {
          this.onSelect(customIconRef(custom.id), this.selectedColor);
          this.close();
        });
      }
    }
  }

  private renderIconGrid(grid: HTMLElement, filter: string): void {
    grid.empty();
    const allIds = getIconIds();
    const term = filter.toLowerCase().trim();
    const filtered = term ? allIds.filter(id => id.includes(term)) : allIds;
    const capped = filtered.slice(0, 300);

    for (const id of capped) {
      const btn = grid.createDiv('icon-picker-item');
      btn.setAttribute('aria-label', id);
      setIcon(btn, id);
      btn.addEventListener('click', () => {
        this.onSelect(id, this.selectedColor);
        this.close();
      });
    }

    if (capped.length === 0) {
      grid.createEl('p', { text: 'No symbols found.', cls: 'icon-picker-empty' });
    }
  }
}
