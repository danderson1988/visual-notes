import { App, Modal, Setting, TFile, TFolder, FuzzySuggestModal } from 'obsidian';
import { createBoardFile } from './file-io';
import type VisualNotesPlugin from './main';

// ── Folder picker ─────────────────────────────────────────────

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private folders: TFolder[];
  private onChoose: (folder: TFolder | null) => void;

  constructor(app: App, onChoose: (folder: TFolder | null) => void) {
    super(app);
    this.folders = app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder);
    this.onChoose = onChoose;
    this.setPlaceholder('Type to search folders…');
  }

  getItems(): TFolder[] { return this.folders; }
  getItemText(item: TFolder): string { return item.path || '(vault root)'; }
  onChooseItem(item: TFolder): void { this.onChoose(item); }
}

// ── Template picker ───────────────────────────────────────────

// One entry per pickable template — either a real _Templates/ file or a
// bundled starter that gets installed on pick (see openTemplatePicker in
// main.ts, which builds the list and supplies each entry's onPick).
export interface TemplateChoice {
  label: string;
  onPick: () => void;
}

export class TemplatePickerModal extends FuzzySuggestModal<TemplateChoice> {
  constructor(app: App, private choices: TemplateChoice[]) {
    super(app);
    this.setPlaceholder('Type to search templates…');
  }

  getItems(): TemplateChoice[] { return this.choices; }
  getItemText(item: TemplateChoice): string { return item.label; }
  onChooseItem(item: TemplateChoice): void { item.onPick(); }
}

// ── Create board modal ────────────────────────────────────────

export class CreateBoardModal extends Modal {
  // Canvas is the default: it's the layout most users mean by "a Visual
  // Notes board". Defaulting to grid led users who wanted a canvas to
  // create a tile-launcher grid without realizing (bug report: "cannot get
  // into their canvas").
  private layout: 'grid' | 'freeform' = 'freeform';
  private boardName = 'New Visual Notes board';
  private targetFolder: TFolder | null = null;
  private onCreated: (file: TFile) => void;
  private plugin: VisualNotesPlugin;

  constructor(app: App, plugin: VisualNotesPlugin, onCreated: (file: TFile) => void, initialFolder: TFolder | null = null) {
    super(app);
    this.plugin = plugin;
    this.onCreated = onCreated;
    this.targetFolder = initialFolder;
    this.modalEl.addClass('visual-notes-create-modal');
  }

  override onOpen(): void { this.render(); }
  override onClose(): void { this.contentEl.empty(); }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'New board' });

    // ── Layout picker ──
    contentEl.createEl('p', {
      text: 'Choose a layout — this cannot be changed after creation.',
      cls: 'visual-notes-create-hint',
    });

    const layoutRow = contentEl.createDiv('visual-notes-layout-row');
    for (const opt of [
      {
        value: 'freeform' as const,
        label: 'Canvas',
        icon: '✦',
        desc: 'An infinite canvas with free-placed notes, images, drawings and connections — the full Visual Notes experience.',
      },
      {
        value: 'grid' as const,
        label: 'Tile grid',
        icon: '⊞',
        desc: 'A launcher page of tiles that link to your canvases, notes and folders — like a home screen, not a canvas itself.',
      },
    ]) {
      const card = layoutRow.createDiv(
        'visual-notes-layout-card' + (this.layout === opt.value ? ' is-selected' : '')
      );
      const header = card.createDiv('visual-notes-layout-card-header');
      header.createSpan({ text: opt.icon, cls: 'visual-notes-layout-card-icon' });
      header.createEl('strong', { text: opt.label });
      card.createEl('p', { text: opt.desc, cls: 'visual-notes-layout-card-desc' });
      card.addEventListener('click', () => { this.layout = opt.value; this.render(); });
    }

    // ── Name ──
    new Setting(contentEl)
      .setName('Board name')
      .addText(text => {
        text.setValue(this.boardName).onChange(v => { this.boardName = v; });
        window.setTimeout(() => { text.inputEl.select(); text.inputEl.focus(); }, 50);
      });

    // ── Location ──
    new Setting(contentEl)
      .setName('Location')
      .setDesc(this.targetFolder ? this.targetFolder.path : 'Vault root')
      .addButton(btn =>
        btn.setButtonText('Choose folder…').onClick(() => {
          new FolderSuggestModal(this.app, (folder) => {
            this.targetFolder = folder;
            this.render();
          }).open();
        })
      )
      .addButton(btn =>
        btn.setButtonText('Reset').onClick(() => {
          this.targetFolder = null;
          this.render();
        })
      );

    // ── Buttons ──
    const btnRow = contentEl.createDiv('visual-notes-modal-buttons');
    btnRow.createEl('button', { text: 'Cancel' })
      .addEventListener('click', () => this.close());

    const createBtn = btnRow.createEl('button', { text: 'Create board', cls: 'mod-cta' });
    createBtn.addEventListener('click', () => { void (async () => {
      const name = this.boardName.trim() || 'New Visual Notes board';
      const file = await createBoardFile(this.app, name, this.targetFolder, this.layout);
      this.close();
      this.onCreated(file);
    })(); });
  }
}
