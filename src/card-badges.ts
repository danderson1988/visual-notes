import { App, Modal, Notice } from 'obsidian';

const LABEL_COLOR_PALETTE = [
  '#EF4444', '#F59E0B', '#EAB308', '#84CC16',
  '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6',
  '#EC4899', '#64748B',
];

// Prompts for a label's text + color — Trello-label style pill attached to
// any card (see CardLabel in file-types.ts).
export class LabelPromptModal extends Modal {
  private color = LABEL_COLOR_PALETTE[0];

  constructor(app: App, private onCreate: (text: string, color: string) => void) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Add label' });

    const input = contentEl.createEl('input', { type: 'text', placeholder: 'Label text' });
    input.addClass('visual-notes-board-name-input');

    const palette = contentEl.createDiv('visual-notes-modal-palette');
    for (const hex of LABEL_COLOR_PALETTE) {
      const swatch = palette.createDiv('visual-notes-modal-swatch');
      swatch.style.backgroundColor = hex;
      if (hex === this.color) swatch.addClass('is-selected');
      swatch.addEventListener('click', () => {
        this.color = hex;
        palette.querySelectorAll<HTMLElement>('.visual-notes-modal-swatch').forEach(s => s.removeClass('is-selected'));
        swatch.addClass('is-selected');
      });
    }

    const row = contentEl.createDiv('visual-notes-modal-buttons');
    row.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    const addBtn = row.createEl('button', { text: 'Add', cls: 'mod-cta' });
    const submit = () => {
      const text = input.value.trim();
      if (!text) { new Notice('Enter label text.'); return; }
      this.onCreate(text, this.color);
      this.close();
    };
    addBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    window.setTimeout(() => input.focus(), 50);
  }

  override onClose(): void { this.contentEl.empty(); }
}

// Curated set rather than a free-typed emoji field — keeps the picker a
// simple grid of known-good glyphs instead of another text input.
export const REACTION_EMOJI = ['👍', '👎', '😄', '😢', '❤️', '🎉', '😮', '👀', '🔥', '🤔'];

// Clicking an emoji toggles it for the card (on if absent, off if already
// active) — reactions are a single-user presence flag, not a counter.
export class ReactionPickerModal extends Modal {
  constructor(app: App, private active: string[], private onToggle: (emoji: string) => void) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Add reaction' });
    const grid = contentEl.createDiv('visual-notes-reaction-grid');
    for (const emoji of REACTION_EMOJI) {
      const btn = grid.createDiv('visual-notes-reaction-option');
      btn.setText(emoji);
      btn.toggleClass('is-active', this.active.includes(emoji));
      btn.addEventListener('click', () => {
        this.onToggle(emoji);
        this.close();
      });
    }
  }

  override onClose(): void { this.contentEl.empty(); }
}
