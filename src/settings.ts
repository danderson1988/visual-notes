import { App, PluginSettingTab, Setting, Notice, FuzzySuggestModal, TFile, type SettingDefinitionItem } from 'obsidian';
import type VisualNotesPlugin from './main';
import { ConfirmModal } from './tile-modal';
import { Tile } from './types';
import { relinkAllBoards } from './asset-manager';

// ── Board picker modal ────────────────────────────────────────

class BoardPickerModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private onChoose: (f: TFile) => void) {
    super(app);
    this.setPlaceholder('Search for a board file…');
  }
  getItems(): TFile[] {
    // Lists every .canvas file. FuzzySuggestModal requires a synchronous
    // item list, so this can't filter out plain native canvases by content
    // here (that check is async — see isVisualNotesOwnedFile in file-io.ts).
    // Picking a non-Icon-Board canvas as the default board is harmless:
    // opening it will simply hand off to Obsidian's native Canvas view
    // instead of Visual Notes' UI.
    return this.app.vault.getAllLoadedFiles()
      .filter((f): f is TFile => f instanceof TFile && f.extension === 'canvas');
  }
  getItemText(f: TFile): string { return f.path; }
  onChooseItem(f: TFile): void { this.onChoose(f); }
}

// ── Settings tab ──────────────────────────────────────────────
//
// Two rendering paths, one body per setting so they can never drift:
// Obsidian 1.13+ renders declaratively from getSettingDefinitions() (and
// indexes each setting's name/desc for its settings search); older
// versions call display(), which builds the same settings imperatively.
// IMPORTANT: no 1.13-only APIs may be referenced here (update(),
// setDestructive(), …) — minAppVersion predates them and the plugin
// review's obsidianmd/no-unsupported-api check flags even guarded
// references. Obsidian 1.13 is not generally available yet (stable is
// 1.12.x as of 2026-07), so the floor must stay below 1.13.

export class VisualNotesSettingsTab extends PluginSettingTab {
  plugin: VisualNotesPlugin;
  private importText = '';
  private importAreaEl: HTMLTextAreaElement | null = null;

  constructor(app: App, plugin: VisualNotesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // ── Declarative definitions (Obsidian 1.13+) ────────────────

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { name: 'Open on startup', desc: 'Automatically open Visual Notes when Obsidian starts.',
        render: (s) => this.buildOpenOnStartup(s) },
      { name: 'Default board', desc: 'Board opened when you click the ribbon icon or use the "Open" command.',
        render: (s) => this.buildDefaultBoard(s) },
      { type: 'group', heading: 'Freeform canvas', items: [
        { name: 'Toolbar position', desc: 'Where the card-creation toolbar appears on the canvas. Takes effect when you next open a board.',
          render: (s) => this.buildToolbarPosition(s) },
        { name: 'Grid dot color', desc: 'Color of the dot grid on the freeform canvas background. Updates any open board live.',
          render: (s) => this.buildDotColor(s) },
        { name: 'Grid dot size', desc: 'Radius of each dot in pixels. Updates any open board live.',
          render: (s) => this.buildDotSize(s) },
        { name: 'Canvas background color', desc: 'Background color of the freeform canvas itself. Updates any open board live.',
          render: (s) => this.buildCanvasBgColor(s) },
        { name: 'Card drag animation', desc: 'Lift, tilt, and settle a card as you drag it around the canvas. Takes effect the next time you open a board.',
          render: (s) => this.buildCardDragAnimation(s) },
        { name: 'Card drag animation intensity', desc: 'How pronounced the lift/tilt effect is. Takes effect the next time you open a board.',
          render: (s) => this.buildCardDragAnimationIntensity(s) },
        { name: 'Snap to grid', desc: 'Dragging, resizing, or placing a card on the freeform canvas snaps it to a grid. Can also be toggled per-session with the magnet button on the canvas. Takes effect the next time you open a board.',
          render: (s) => this.buildSnapToGrid(s) },
        { name: 'Grid size', desc: 'Spacing in pixels of the snap-to-grid. Default: 32.',
          render: (s) => this.buildGridSize(s) },
        { name: 'Trash zone size', desc: 'Diameter in pixels of the delete-by-drag circle in the bottom-left corner of the freeform canvas. Updates any open board live. Default: 56.',
          render: (s) => this.buildTrashZoneSize(s) },
        { name: 'Larger kanban cards', desc: 'Bigger text, padding, and icon badges on kanban items. Takes effect the next time you open a board.',
          render: (s) => this.buildLargeKanbanItems(s) },
        { name: 'Bookmark cache duration', desc: 'Days before bookmark previews are automatically re-fetched. Default: 30.',
          render: (s) => this.buildBookmarkCacheDuration(s) },
        { name: 'Default sticky colour', desc: 'Colour used when creating new sticky notes.',
          render: (s) => this.buildDefaultStickyColor(s) },
        { name: 'Comment author name', desc: 'Shown on new comments and replies you add to a board. Defaults to "Anonymous" when left blank.',
          render: (s) => this.buildCommentAuthorName(s) },
      ] },
      { type: 'group', heading: 'Assets', items: [
        { name: 'Auto-sort assets', desc: 'All images, audio, video, and documents imported or linked into a board are automatically moved to _Assets/Images/, _Assets/Audio/, etc. in the vault root. Always on.',
          render: (s) => this.buildAutoSortAssets(s) },
        { name: 'Auto-relink on board open', desc: 'When a board opens, silently scan for broken file links and fix any that have a unique filename match in the vault.',
          render: (s) => this.buildAutoRelinkOnOpen(s) },
        { name: 'Relink all boards now', desc: 'Scan every Visual Notes file in the vault and fix broken links with a unique filename match. Useful after moving files.',
          render: (s) => this.buildRelinkAllBoardsNow(s) },
      ] },
      { type: 'group', heading: 'Data', items: [
        { name: 'Export tiles as JSON', desc: 'Copy all your tile data to the clipboard as JSON.',
          render: (s) => this.buildExportTilesJson(s) },
        { name: 'Import tiles from JSON', desc: 'Paste JSON exported from another vault. This will replace all existing tiles. Make sure the JSON is an array of tile objects.',
          render: (s) => this.buildImportDesc(s) },
        { name: 'Import', render: (s) => this.buildImportButton(s) },
      ] },
      { type: 'group', heading: 'Danger zone', items: [
        { name: 'Reset all tiles', desc: 'Permanently delete every tile and nested board. This cannot be undone.',
          render: (s) => this.buildResetAllTiles(s) },
      ] },
    ];
  }

  // ── Imperative fallback (Obsidian < 1.13) ───────────────────
  // Not called by the app on 1.13+ (getSettingDefinitions() takes over).

  override display(): void {
    this.renderImperative();
  }

  // Re-render after a settings mutation that changes the tab's structure
  // (reset buttons, board picker's Clear visibility, sticky palette).
  // Rebuilds imperatively on both paths: on 1.13+ the proper API would be
  // update(), but that's 1.13-only and even a guarded reference trips the
  // review's no-unsupported-api check — and an imperative rebuild renders
  // identically since both paths share the same buildX bodies.
  private refresh(): void {
    this.renderImperative();
  }

  private renderImperative(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.buildOpenOnStartup(new Setting(containerEl));
    this.buildDefaultBoard(new Setting(containerEl));

    new Setting(containerEl).setName('Freeform canvas').setHeading();
    this.buildToolbarPosition(new Setting(containerEl));
    this.buildDotColor(new Setting(containerEl));
    this.buildDotSize(new Setting(containerEl));
    this.buildCanvasBgColor(new Setting(containerEl));
    this.buildCardDragAnimation(new Setting(containerEl));
    this.buildCardDragAnimationIntensity(new Setting(containerEl));
    this.buildSnapToGrid(new Setting(containerEl));
    this.buildGridSize(new Setting(containerEl));
    this.buildTrashZoneSize(new Setting(containerEl));
    this.buildLargeKanbanItems(new Setting(containerEl));
    this.buildBookmarkCacheDuration(new Setting(containerEl));
    this.buildDefaultStickyColor(new Setting(containerEl));
    this.buildCommentAuthorName(new Setting(containerEl));

    new Setting(containerEl).setName('Assets').setHeading();
    this.buildAutoSortAssets(new Setting(containerEl));
    this.buildAutoRelinkOnOpen(new Setting(containerEl));
    this.buildRelinkAllBoardsNow(new Setting(containerEl));

    new Setting(containerEl).setName('Data').setHeading();
    this.buildExportTilesJson(new Setting(containerEl));
    this.buildImportDesc(new Setting(containerEl));
    this.buildImportButton(new Setting(containerEl));

    new Setting(containerEl).setName('Danger zone').setHeading();
    this.buildResetAllTiles(new Setting(containerEl));
  }

  // ── Per-setting builders ─────────────────────────────────────

  private buildOpenOnStartup(setting: Setting): void {
    setting
      .setName('Open on startup')
      .setDesc('Automatically open Visual Notes when Obsidian starts.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.openOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.openOnStartup = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private buildDefaultBoard(setting: Setting): void {
    setting
      .setName('Default board')
      .setDesc('Board opened when you click the ribbon icon or use the "Open" command.');

    const pathDisplay = setting.controlEl.createSpan('visual-notes-modal-path-display' + (this.plugin.settings.defaultBoardPath ? '' : ' is-empty'));
    pathDisplay.setText(this.plugin.settings.defaultBoardPath ?? 'None');

    setting.addButton(btn =>
      btn.setButtonText('Browse…').onClick(() => {
        new BoardPickerModal(this.app, (file) => { void (async () => {
          this.plugin.settings.defaultBoardPath = file.path;
          await this.plugin.saveSettings();
          pathDisplay.textContent = file.path;
          pathDisplay.removeClass('is-empty');
          // Update "Clear" button visibility by re-rendering
          this.refresh();
        })(); }).open();
      })
    );

    if (this.plugin.settings.defaultBoardPath) {
      setting.addButton(btn =>
        btn.setButtonText('Clear').onClick(() => { void (async () => {
          this.plugin.settings.defaultBoardPath = undefined;
          await this.plugin.saveSettings();
          this.refresh();
        })(); })
      );
    }
  }

  private buildToolbarPosition(setting: Setting): void {
    setting
      .setName('Toolbar position')
      .setDesc('Where the card-creation toolbar appears on the canvas. Takes effect when you next open a board.')
      .addDropdown(dd =>
        dd
          .addOption('left',   'Left')
          .addOption('right',  'Right')
          .addOption('top',    'Top')
          .addOption('bottom', 'Bottom')
          .setValue(this.plugin.settings.toolbarPosition ?? 'left')
          .onChange(async (value) => {
            this.plugin.settings.toolbarPosition = value as 'left' | 'right' | 'top' | 'bottom';
            await this.plugin.saveSettings();
          })
      );
  }

  private buildDotColor(setting: Setting): void {
    setting
      .setName('Grid dot color')
      .setDesc('Color of the dot grid on the freeform canvas background. Updates any open board live.')
      .addColorPicker(c =>
        c
          .setValue(this.plugin.settings.dotColor ?? '#d2d2d2')
          .onChange(async (value) => {
            this.plugin.settings.dotColor = value;
            this.plugin.applyCanvasAppearanceSettings();
            await this.plugin.saveSettings();
          })
      )
      .addButton(btn =>
        btn.setButtonText('Default').onClick(async () => {
          this.plugin.settings.dotColor = undefined;
          this.plugin.applyCanvasAppearanceSettings();
          await this.plugin.saveSettings();
          this.refresh();
        })
      );
  }

  private buildDotSize(setting: Setting): void {
    setting
      .setName('Grid dot size')
      .setDesc('Radius of each dot in pixels. Updates any open board live.')
      .addSlider(s =>
        s
          .setLimits(1, 6, 1)
          .setValue(this.plugin.settings.dotSize ?? 2)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.dotSize = value;
            this.plugin.applyCanvasAppearanceSettings();
            await this.plugin.saveSettings();
          })
      )
      .addButton(btn =>
        btn.setButtonText('Default').onClick(async () => {
          this.plugin.settings.dotSize = undefined;
          this.plugin.applyCanvasAppearanceSettings();
          await this.plugin.saveSettings();
          this.refresh();
        })
      );
  }

  private buildCanvasBgColor(setting: Setting): void {
    setting
      .setName('Canvas background color')
      .setDesc('Background color of the freeform canvas itself. Updates any open board live.')
      .addColorPicker(c =>
        c
          .setValue(this.plugin.settings.canvasBgColor ?? '#e6e6e6')
          .onChange(async (value) => {
            this.plugin.settings.canvasBgColor = value;
            this.plugin.applyCanvasAppearanceSettings();
            await this.plugin.saveSettings();
          })
      )
      .addButton(btn =>
        btn.setButtonText('Default').onClick(async () => {
          this.plugin.settings.canvasBgColor = undefined;
          this.plugin.applyCanvasAppearanceSettings();
          await this.plugin.saveSettings();
          this.refresh();
        })
      );
  }

  private buildCardDragAnimation(setting: Setting): void {
    setting
      .setName('Card drag animation')
      .setDesc('Lift, tilt, and settle a card as you drag it around the canvas. Takes effect the next time you open a board.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.cardDragAnimation ?? true)
          .onChange(async (value) => {
            this.plugin.settings.cardDragAnimation = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private buildCardDragAnimationIntensity(setting: Setting): void {
    setting
      .setName('Card drag animation intensity')
      .setDesc('How pronounced the lift/tilt effect is. Takes effect the next time you open a board.')
      .addSlider(s =>
        s
          .setLimits(0.5, 2, 0.1)
          .setValue(this.plugin.settings.cardDragAnimationIntensity ?? 1)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.cardDragAnimationIntensity = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton(btn =>
        btn.setButtonText('Default').onClick(async () => {
          this.plugin.settings.cardDragAnimationIntensity = undefined;
          await this.plugin.saveSettings();
          this.refresh();
        })
      );
  }

  private buildSnapToGrid(setting: Setting): void {
    setting
      .setName('Snap to grid')
      .setDesc('Dragging, resizing, or placing a card on the freeform canvas snaps it to a grid. Can also be toggled per-session with the magnet button on the canvas. Takes effect the next time you open a board.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.snapToGrid ?? true)
          .onChange(async (value) => {
            this.plugin.settings.snapToGrid = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private buildGridSize(setting: Setting): void {
    setting
      .setName('Grid size')
      .setDesc('Spacing in pixels of the snap-to-grid. Default: 32.')
      .addSlider(s =>
        s
          .setLimits(8, 80, 8)
          .setValue(this.plugin.settings.snapGridSize ?? 32)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.snapGridSize = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton(btn =>
        btn.setButtonText('Default').onClick(async () => {
          this.plugin.settings.snapGridSize = undefined;
          await this.plugin.saveSettings();
          this.refresh();
        })
      );
  }

  private buildTrashZoneSize(setting: Setting): void {
    setting
      .setName('Trash zone size')
      .setDesc('Diameter in pixels of the delete-by-drag circle in the bottom-left corner of the freeform canvas. Updates any open board live. Default: 56.')
      .addSlider(s =>
        s
          .setLimits(32, 96, 4)
          .setValue(this.plugin.settings.trashZoneSize ?? 56)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.trashZoneSize = value;
            this.plugin.applyCanvasAppearanceSettings();
            await this.plugin.saveSettings();
          })
      )
      .addButton(btn =>
        btn.setButtonText('Default').onClick(async () => {
          this.plugin.settings.trashZoneSize = undefined;
          this.plugin.applyCanvasAppearanceSettings();
          await this.plugin.saveSettings();
          this.refresh();
        })
      );
  }

  private buildLargeKanbanItems(setting: Setting): void {
    setting
      .setName('Larger kanban cards')
      .setDesc('Bigger text, padding, and icon badges on kanban items. Takes effect the next time you open a board.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.largeKanbanItems ?? false)
          .onChange(async (value) => {
            this.plugin.settings.largeKanbanItems = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private buildBookmarkCacheDuration(setting: Setting): void {
    setting
      .setName('Bookmark cache duration')
      .setDesc('Days before bookmark previews are automatically re-fetched. Default: 30.')
      .addText(text => {
        text
          .setPlaceholder('30')
          .setValue(String(this.plugin.settings.bookmarkCacheDays ?? 30))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            this.plugin.settings.bookmarkCacheDays = (!isNaN(n) && n > 0) ? n : undefined;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text.inputEl.addClass('ib-bookmark-days-input');
      });
  }

  private buildDefaultStickyColor(setting: Setting): void {
    setting
      .setName('Default sticky colour')
      .setDesc('Colour used when creating new sticky notes.');

    const stickyPalette = setting.controlEl.createDiv('visual-notes-settings-sticky-palette');
    const STICKY_SWATCHES = [
      { color: '#FDE68A', name: 'Yellow' },
      { color: '#FCA5A5', name: 'Rose' },
      { color: '#86EFAC', name: 'Green' },
      { color: '#93C5FD', name: 'Blue' },
      { color: '#C4B5FD', name: 'Purple' },
      { color: '#FBB6CE', name: 'Pink' },
      { color: '#FCD34D', name: 'Amber' },
      { color: '#A7F3D0', name: 'Mint' },
      { color: '#D1D5DB', name: 'Grey' },
      { color: '#F3F4F6', name: 'Light Grey' },
    ];
    const currentColor = this.plugin.settings.defaultStickyColor ?? '#FDE68A';
    for (const { color } of STICKY_SWATCHES) {
      const sw = stickyPalette.createDiv('visual-notes-modal-swatch');
      sw.style.backgroundColor = color;
      if (color === currentColor) sw.addClass('is-selected');
      sw.addEventListener('click', () => { void (async () => {
        stickyPalette.querySelectorAll<HTMLElement>('.visual-notes-modal-swatch').forEach(s => s.removeClass('is-selected'));
        sw.addClass('is-selected');
        this.plugin.settings.defaultStickyColor = color;
        await this.plugin.saveSettings();
      })(); });
    }
  }

  private buildCommentAuthorName(setting: Setting): void {
    setting
      .setName('Comment author name')
      .setDesc('Shown on new comments and replies you add to a board. Defaults to "Anonymous" when left blank.')
      .addText(text =>
        text
          .setPlaceholder('Anonymous')
          .setValue(this.plugin.settings.commentAuthorName ?? '')
          .onChange(async (value) => {
            this.plugin.settings.commentAuthorName = value.trim() || undefined;
            await this.plugin.saveSettings();
          })
      );
  }

  private buildAutoSortAssets(setting: Setting): void {
    setting
      .setName('Auto-sort assets')
      .setDesc('All images, audio, video, and documents imported or linked into a board are automatically moved to _Assets/Images/, _Assets/Audio/, etc. in the vault root. Always on.')
      .addText(t => { t.inputEl.disabled = true; t.setValue('Enabled'); });
  }

  private buildAutoRelinkOnOpen(setting: Setting): void {
    setting
      .setName('Auto-relink on board open')
      .setDesc('When a board opens, silently scan for broken file links and fix any that have a unique filename match in the vault.')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.autoRelinkOnOpen ?? false)
          .onChange(async (value) => {
            this.plugin.settings.autoRelinkOnOpen = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private buildRelinkAllBoardsNow(setting: Setting): void {
    setting
      .setName('Relink all boards now')
      .setDesc('Scan every Visual Notes file in the vault and fix broken links with a unique filename match. Useful after moving files.')
      .addButton(btn =>
        btn.setButtonText('Relink now').onClick(() => { void (async () => {
          btn.setButtonText('Scanning…');
          btn.buttonEl.disabled = true;
          const n = await relinkAllBoards(this.app);
          btn.setButtonText('Relink now');
          btn.buttonEl.disabled = false;
          new Notice(n > 0
            ? `Fixed ${n} broken link${n === 1 ? '' : 's'} across all boards.`
            : 'No broken links found.');
        })(); })
      );
  }

  private buildExportTilesJson(setting: Setting): void {
    setting
      .setName('Export tiles as JSON')
      .setDesc('Copy all your tile data to the clipboard as JSON.')
      .addButton(btn =>
        btn.setButtonText('Copy to clipboard').onClick(() => { void (async () => {
          const json = JSON.stringify(this.plugin.settings.rootTiles, null, 2);
          await navigator.clipboard.writeText(json);
          new Notice('Tile data copied to clipboard.');
        })(); })
      );
  }

  private buildImportDesc(setting: Setting): void {
    setting.setName('Import tiles from JSON').setDesc(
      'Paste JSON exported from another vault. This will replace all existing tiles. ' +
      'Make sure the JSON is an array of tile objects.'
    );

    const importArea = setting.settingEl.createEl('textarea', {
      cls: 'visual-notes-settings-import-area',
      placeholder: '[\n  { "id": "...", "label": "...", ... }\n]',
    });
    importArea.addEventListener('input', () => {
      this.importText = importArea.value;
    });
    this.importAreaEl = importArea;
  }

  private buildImportButton(setting: Setting): void {
    setting
      .addButton(btn =>
        btn
          .setButtonText('Import')
          .setCta()
          .onClick(() => {
            if (!this.importText.trim()) {
              new Notice('Paste some JSON first.');
              return;
            }
            let parsed: Tile[];
            try {
              parsed = JSON.parse(this.importText) as Tile[];
              if (!Array.isArray(parsed)) throw new Error('Not an array');
            } catch {
              new Notice('Invalid JSON — please check the format and try again.');
              return;
            }
            new ConfirmModal(
              this.app,
              `Replace all ${this.plugin.settings.rootTiles.length} existing tile(s) with the imported data?`,
              () => { void (async () => {
                this.plugin.settings.rootTiles = parsed;
                await this.plugin.saveSettings();
                if (this.importAreaEl) this.importAreaEl.value = '';
                this.importText = '';
                new Notice(`Imported ${parsed.length} tile(s).`);
              })(); }
            ).open();
          })
      );
  }

  private buildResetAllTiles(setting: Setting): void {
    setting
      .setName('Reset all tiles')
      .setDesc('Permanently delete every tile and nested board. This cannot be undone.')
      .addButton(btn => {
        // The destructive red styling on every supported version, without
        // referencing setWarning() (deprecated) or setDestructive()
        // (1.13-only, above our minAppVersion).
        btn.buttonEl.addClass('mod-warning');
        return btn
          .setButtonText('Reset everything')
          .onClick(() => {
            new ConfirmModal(
              this.app,
              `Delete all ${this.plugin.settings.rootTiles.length} tile(s)? This cannot be undone.`,
              () => { void (async () => {
                this.plugin.settings.rootTiles = [];
                await this.plugin.saveSettings();
                new Notice('All tiles deleted.');
              })(); }
            ).open();
          });
      });
  }
}
