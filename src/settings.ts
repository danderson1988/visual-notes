import { App, PluginSettingTab, Setting, Notice, FuzzySuggestModal, TFile } from 'obsidian';
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

export class VisualNotesSettingsTab extends PluginSettingTab {
  plugin: VisualNotesPlugin;
  private importText = '';

  constructor(app: App, plugin: VisualNotesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Open on startup ──────────────────────────────────────
    new Setting(containerEl)
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

    // ── Default board ────────────────────────────────────────
    const defaultSetting = new Setting(containerEl)
      .setName('Default board')
      .setDesc('Board opened when you click the ribbon icon or use the "Open" command.');

    const pathDisplay = defaultSetting.controlEl.createEl('span', {
      text: this.plugin.settings.defaultBoardPath ?? 'None',
      cls: 'visual-notes-modal-path-display' + (this.plugin.settings.defaultBoardPath ? '' : ' is-empty'),
    });

    defaultSetting.addButton(btn =>
      btn.setButtonText('Browse…').onClick(() => {
        new BoardPickerModal(this.app, (file) => { void (async () => {
          this.plugin.settings.defaultBoardPath = file.path;
          await this.plugin.saveSettings();
          pathDisplay.textContent = file.path;
          pathDisplay.removeClass('is-empty');
          // Update "Clear" button visibility by re-rendering
          this.display();
        })(); }).open();
      })
    );

    if (this.plugin.settings.defaultBoardPath) {
      defaultSetting.addButton(btn =>
        btn.setButtonText('Clear').onClick(() => { void (async () => {
          this.plugin.settings.defaultBoardPath = undefined;
          await this.plugin.saveSettings();
          this.display();
        })(); })
      );
    }

    // ── Freeform canvas ──────────────────────────────────────
    new Setting(containerEl).setName('Freeform canvas').setHeading();

    new Setting(containerEl)
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

    new Setting(containerEl)
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
          this.display();
        })
      );

    new Setting(containerEl)
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
          this.display();
        })
      );

    new Setting(containerEl)
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
          this.display();
        })
      );

    new Setting(containerEl)
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

    new Setting(containerEl)
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
          this.display();
        })
      );

    new Setting(containerEl)
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

    new Setting(containerEl)
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
          this.display();
        })
      );

    new Setting(containerEl)
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
          this.display();
        })
      );

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    const stickyColorSetting = new Setting(containerEl)
      .setName('Default sticky colour')
      .setDesc('Colour used when creating new sticky notes.');

    const stickyPalette = stickyColorSetting.controlEl.createDiv('visual-notes-settings-sticky-palette');
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

    new Setting(containerEl)
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

    // ── Assets ───────────────────────────────────────────────
    new Setting(containerEl).setName('Assets').setHeading();

    new Setting(containerEl)
      .setName('Auto-sort assets')
      .setDesc('All images, audio, video, and documents imported or linked into a board are automatically moved to _Assets/Images/, _Assets/Audio/, etc. in the vault root. Always on.')
      .addText(t => { t.inputEl.disabled = true; t.setValue('Enabled'); });

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    // ── Export ───────────────────────────────────────────────
    new Setting(containerEl).setName('Data').setHeading();

    new Setting(containerEl)
      .setName('Export tiles as JSON')
      .setDesc('Copy all your tile data to the clipboard as JSON.')
      .addButton(btn =>
        btn.setButtonText('Copy to clipboard').onClick(() => { void (async () => {
          const json = JSON.stringify(this.plugin.settings.rootTiles, null, 2);
          await navigator.clipboard.writeText(json);
          new Notice('Tile data copied to clipboard.');
        })(); })
      );

    // ── Import ───────────────────────────────────────────────
    new Setting(containerEl)
      .setName('Import tiles from JSON')
      .setDesc(
        'Paste JSON exported from another vault. This will replace all existing tiles. ' +
        'Make sure the JSON is an array of tile objects.'
      );

    const importArea = containerEl.createEl('textarea', {
      cls: 'visual-notes-settings-import-area',
      placeholder: '[\n  { "id": "...", "label": "...", ... }\n]',
    });
    importArea.addEventListener('input', () => {
      this.importText = importArea.value;
    });

    new Setting(containerEl)
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
                importArea.value = '';
                this.importText = '';
                new Notice(`Imported ${parsed.length} tile(s).`);
              })(); }
            ).open();
          })
      );

    // ── Reset ────────────────────────────────────────────────
    new Setting(containerEl).setName('Danger zone').setHeading();

    new Setting(containerEl)
      .setName('Reset all tiles')
      .setDesc('Permanently delete every tile and nested board. This cannot be undone.')
      .addButton(btn =>
        btn
          .setButtonText('Reset everything')
          .setWarning()
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
          })
      );
  }
}