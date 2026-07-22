import { FileView, WorkspaceLeaf, TFile, Notice, setIcon } from 'obsidian';
import type VisualNotesPlugin from './main';
import { VisualNotesFile } from './file-types';
import { readBoardFile, writeBoardFile, isVisualNotesOwnedFile, saveBoardAsTemplate } from './file-io';
import { GridRenderer } from './grid-view';
import { FreeformRenderer } from './freeform-view';
import { relinkBoardData } from './asset-manager';
import { CreateBoardModal } from './create-board-modal';
import { NamePromptModal } from './tile-modal';

// Obsidian core's own view type string for its native Canvas view.
export const NATIVE_CANVAS_VIEW_TYPE = 'canvas';

export const VISUAL_NOTES_VIEW_TYPE = 'visual-notes-view';

export class VisualNotesView extends FileView {
  plugin: VisualNotesPlugin;

  // Navigation history: files visited before the current one.
  // Empty = this is the entry point.
  private navigationHistory: TFile[] = [];

  // Flag to distinguish internal navigation from an external file open.
  private isInternalNavigation = false;

  private renderer: GridRenderer | FreeformRenderer | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: VisualNotesPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  // A FileView can be open without a file (e.g. workspace restore with no state).
  override allowNoFile = true;

  getViewType(): string { return VISUAL_NOTES_VIEW_TYPE; }

  override getDisplayText(): string {
    return this.file ? this.file.basename : 'Visual Notes';
  }

  override getIcon(): string { return 'layout-grid'; }

  // Obsidian calls this when it assigns a file to the view.
  override async onLoadFile(file: TFile): Promise<void> {
    // .canvas is a shared extension: Visual Notes registers a view for it so
    // its own boards open richly, but plenty of .canvas files in a vault
    // will be plain native canvases (or another plugin's) that just happen
    // to share the extension. Never render those with Visual Notes' UI —
    // hand the leaf straight back to Obsidian's real native Canvas view
    // instead.
    if (file.extension === 'canvas' && !(await isVisualNotesOwnedFile(this.app, file))) {
      await this.leaf.setViewState({ type: NATIVE_CANVAS_VIEW_TYPE, state: { file: file.path } });
      return;
    }

    if (!this.isInternalNavigation) {
      // Opened externally (ribbon, file explorer, workspace restore) — reset history.
      this.navigationHistory = [];
    }
    this.isInternalNavigation = false;

    const board = await readBoardFile(this.app, file);

    if (this.plugin.settings.autoRelinkOnOpen) {
      const fixed = await relinkBoardData(this.app, board);
      if (fixed > 0) {
        await writeBoardFile(this.app, file, board);
        new Notice(`Visual Notes: Fixed ${fixed} broken link${fixed === 1 ? '' : 's'}.`);
      }
    }

    await this.renderBoard(board, file);
  }

  override async onUnloadFile(_file: TFile): Promise<void> {
    await this.destroyRenderer();
  }

  override async onClose(): Promise<void> {
    await this.destroyRenderer();
  }

  // Called when there is no file (e.g. workspace restore with missing state).
  protected override async onOpen(): Promise<void> {
    if (!this.file) {
      this.renderEmpty();
    }
  }

  // ── Public navigation API (called by GridRenderer) ───────────

  async navigateToBoard(targetPath: string): Promise<void> {
    // A tile pointing at the very board it lives on used to "navigate" to
    // itself: the same board re-rendered, nothing visibly changed, and a
    // bogus history entry piled up — reported as "cannot get into my
    // canvas". Creating such a tile is now blocked in TileModal, but boards
    // saved before that (or edited by hand) can still carry one — explain
    // instead of silently doing nothing.
    if (this.file && targetPath === this.file.path) {
      new Notice('This tile links to the board it\'s on, so it has nowhere to go. Right-click the tile and choose Edit to point it at a different board.', 8000);
      return;
    }
    const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
    if (!(targetFile instanceof TFile)) {
      new Notice(`Board file not found: ${targetPath}`);
      return;
    }
    this.isInternalNavigation = true;
    this.navigationHistory.push(this.file!);
    // Force Visual Notes' own view type explicitly. Since Visual Notes no
    // longer owns the .canvas extension (Obsidian's core Canvas plugin
    // does), a plain leaf.openFile() here would resolve via extension and
    // silently drop you into the native Canvas view mid-navigation.
    await this.leaf.setViewState({ type: VISUAL_NOTES_VIEW_TYPE, state: { file: targetFile.path } });
  }

  async navigateBack(): Promise<void> {
    const prev = this.navigationHistory.pop();
    if (!prev) return;
    this.isInternalNavigation = true;
    await this.leaf.setViewState({ type: VISUAL_NOTES_VIEW_TYPE, state: { file: prev.path } });
  }

  // ── Rendering ────────────────────────────────────────────────

  private async renderBoard(board: VisualNotesFile, file: TFile): Promise<void> {
    await this.destroyRenderer();

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('visual-notes-container');

    this.renderHeader(container, file, board.layout);

    const content = container.createDiv('visual-notes-content');

    if (board.layout === 'freeform') {
      this.renderer = new FreeformRenderer(
        this.app,
        content,
        board,
        file,
        (path) => this.navigateToBoard(path),
        async (updated) => { await writeBoardFile(this.app, file, updated); },
        this.plugin.settings.bookmarkCacheDays ?? 30,
        this.plugin.settings.defaultStickyColor,
        this.plugin.settings.toolbarPosition ?? 'left',
        this.plugin.settings.commentAuthorName,
        this.plugin.settings.cardDragAnimation ?? true,
        this.plugin.settings.cardDragAnimationIntensity ?? 1,
        this.plugin.settings.largeKanbanItems ?? false,
        this.plugin.settings.snapToGrid ?? true,
        this.plugin.settings.snapGridSize ?? 32,
        (value) => { this.plugin.settings.snapToGrid = value; void this.plugin.saveSettings(); },
        this.plugin.settings.mobileFabPosition ?? 'bottom-right',
      );
    } else {
      this.renderer = new GridRenderer(
        this.app,
        content,
        board,
        file,
        (path) => this.navigateToBoard(path)
      );
    }

    this.renderer.render();
  }

  private renderHeader(container: HTMLElement, file: TFile, layout: VisualNotesFile['layout']): void {
    const header = container.createDiv('visual-notes-view-header');

    // Back button (visible when we have history)
    const backBtn = header.createDiv('visual-notes-back-btn' + (this.navigationHistory.length === 0 ? ' is-hidden' : ''));
    setIcon(backBtn, 'arrow-left');
    backBtn.setAttribute('aria-label', 'Go back');
    backBtn.addEventListener('click', () => { void this.navigateBack(); });

    // Save as template — reads the file fresh off disk rather than reaching
    // into the live renderer, so this works the same for both grid and
    // freeform layouts without either renderer needing to expose its board.
    const templateBtn = header.createDiv('visual-notes-save-template-btn');
    setIcon(templateBtn, 'save');
    templateBtn.setAttribute('aria-label', 'Save as template');
    templateBtn.addEventListener('click', () => {
      new NamePromptModal(this.app, 'Save as template', 'Template name', (name) => { void (async () => {
        const board = await readBoardFile(this.app, file);
        const saved = await saveBoardAsTemplate(this.app, board, name);
        new Notice(`Visual Notes: Saved template "${saved.basename}".`);
      })(); }, file.basename, 'Save').open();
    });

    // Breadcrumb
    const breadcrumb = header.createDiv('visual-notes-breadcrumb');

    if (this.navigationHistory.length === 0) {
      breadcrumb.createSpan({ text: file.basename, cls: 'visual-notes-breadcrumb-current' });
    } else {
      // Render history entries as clickable ancestors
      this.navigationHistory.forEach((histFile, i) => {
        const span = breadcrumb.createSpan({
          text: histFile.basename,
          cls: 'visual-notes-breadcrumb-ancestor',
        });
        span.addEventListener('click', () => { void (async () => {
          // Navigate back to this point: slice history to index i
          const target = this.navigationHistory[i];
          this.navigationHistory = this.navigationHistory.slice(0, i);
          this.isInternalNavigation = true;
          await this.leaf.setViewState({ type: VISUAL_NOTES_VIEW_TYPE, state: { file: target.path } });
        })(); });
        breadcrumb.createSpan({ text: '›', cls: 'visual-notes-breadcrumb-sep' });
      });
      breadcrumb.createSpan({ text: file.basename, cls: 'visual-notes-breadcrumb-current' });
    }

    // Board-type badge — grid and canvas boards are otherwise visually
    // identical in the file explorer and tab bar (same .canvas extension,
    // same icon), which let users mix the two up ("expected a canvas, got a
    // grid"). Name the layout right in the header.
    breadcrumb.createSpan({
      text: layout === 'freeform' ? 'Canvas' : 'Tile grid',
      cls: 'visual-notes-layout-badge',
    });
  }

  private renderEmpty(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('visual-notes-container');
    const msg = container.createDiv('visual-notes-empty-state');
    msg.createEl('p', { text: 'No board is open.' });
    msg.createEl('p', {
      text: 'Create a new one, or open an existing .canvas board from the file explorer.',
      cls: 'visual-notes-empty-hint',
    });
    const btnRow = msg.createDiv('visual-notes-modal-buttons');
    const createBtn = btnRow.createEl('button', { text: 'Create new board', cls: 'mod-cta' });
    createBtn.addEventListener('click', () => {
      new CreateBoardModal(this.app, this.plugin, (file) => {
        this.isInternalNavigation = true;
        void this.leaf.setViewState({ type: VISUAL_NOTES_VIEW_TYPE, state: { file: file.path } });
      }).open();
    });
    const templateBtn = btnRow.createEl('button', { text: 'New board from template' });
    templateBtn.addEventListener('click', () => {
      this.plugin.openTemplatePicker((file) => {
        this.isInternalNavigation = true;
        void this.leaf.setViewState({ type: VISUAL_NOTES_VIEW_TYPE, state: { file: file.path } });
      });
    });
  }

  private async destroyRenderer(): Promise<void> {
    await this.renderer?.destroy();
    this.renderer = null;
  }
}