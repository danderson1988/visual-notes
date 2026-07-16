import { Plugin, TFile, TFolder, TAbstractFile, FileView, Menu, Notice } from 'obsidian';
import { VisualNotesView, VISUAL_NOTES_VIEW_TYPE, NATIVE_CANVAS_VIEW_TYPE } from './view';
import { VisualNotesSettingsTab } from './settings';
import { VisualNotesSettings, DEFAULT_SETTINGS } from './types';
import { CreateBoardModal, TemplatePickerModal, TemplateChoice } from './create-board-modal';
import { needsMigration, migrateV1toV2 } from './migration';
import { relinkAllBoards } from './asset-manager';
import { isVisualNotesOwnedFile, listTemplates, createBoardFileFromTemplate, installStarterTemplate, TEMPLATES_FOLDER } from './file-io';
import { STARTER_TEMPLATES } from './starter-templates';

export default class VisualNotesPlugin extends Plugin {
  settings: VisualNotesSettings;

  // Files the user has explicitly chosen to view with Obsidian's native
  // Canvas instead of Visual Notes' own UI for this session — e.g. so a
  // plugin that patches the native Canvas view class (something Visual
  // Notes' separately-drawn UI can never expose a hook for) can work on
  // them. Session-only by design: not persisted to disk, so a restart
  // always goes back to Visual Notes' rich rendering by default.
  private nativeOverrides = new Set<string>();

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.applyCanvasAppearanceSettings();

    // Register the view
    this.registerView(
      VISUAL_NOTES_VIEW_TYPE,
      (leaf) => new VisualNotesView(leaf, this)
    );

    // .canvas is NOT registered the same way — Obsidian's core Canvas
    // plugin already owns that extension, and a second registerExtensions
    // call for it would conflict. Instead, Visual Notes lets native Canvas
    // stay the default and reactively takes over the leaf at runtime for
    // any .canvas file that carries Visual Notes' own marker (see
    // isVisualNotesOwnedFile in file-io.ts / canvas-format.ts). Plain native
    // canvases — anything without that marker — are left alone entirely.
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file && file.extension === 'canvas') void this.maybeTakeOverCanvasLeaf(file);
      })
    );

    // Ribbon — opens (or focuses) the default board. Right-click for more
    // options: left-click alone gave no way to create an *additional*
    // board once one already existed (the ribbon would just refocus the
    // one you had), and the only command for it lived in the command
    // palette where it was easy to miss.
    const ribbonEl = this.addRibbonIcon('layout-grid', 'Visual Notes', () => {
      void this.openDefaultBoard();
    });
    ribbonEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = new Menu();
      menu.addItem(item =>
        item.setTitle('Open default board').setIcon('layout-grid').onClick(() => {
          void this.openDefaultBoard();
        })
      );
      menu.addItem(item =>
        item.setTitle('Create new board…').setIcon('plus').onClick(() => {
          new CreateBoardModal(this.app, this, (file) => { void this.openBoardFile(file); }).open();
        })
      );
      menu.addItem(item =>
        item.setTitle('New board from template…').setIcon('layout-template').onClick(() => {
          this.openTemplatePicker((file) => { void this.openBoardFile(file); });
        })
      );
      menu.showAtMouseEvent(e);
    });

    // File explorer: right-clicking a folder gets a "New Visual Notes board"
    // entry too, matching how Obsidian's own "New canvas" works — and the
    // new board is created directly inside that folder.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFolder)) return;
        menu.addItem(item =>
          item.setTitle('New Visual Notes board').setIcon('layout-grid').onClick(() => {
            new CreateBoardModal(this.app, this, (created) => { void this.openBoardFile(created); }, file).open();
          })
        );
        menu.addItem(item =>
          item.setTitle('New Visual Notes from template…').setIcon('layout-template').onClick(() => {
            this.openTemplatePicker((created) => { void this.openBoardFile(created); }, file);
          })
        );
      })
    );

    // Command: open default board
    this.addCommand({
      id: 'open',
      name: 'Open',
      callback: () => { void this.openDefaultBoard(); },
    });

    // Command: create a new board
    this.addCommand({
      id: 'create-board',
      name: 'Create new board',
      callback: () => {
        new CreateBoardModal(this.app, this, (file) => {
          void this.openBoardFile(file);
        }).open();
      },
    });

    // Command: create a new board from a template
    this.addCommand({
      id: 'new-board-from-template',
      name: 'New board from template',
      callback: () => {
        this.openTemplatePicker((file) => { void this.openBoardFile(file); });
      },
    });

    // Command: relink all board assets
    this.addCommand({
      id: 'relink-board-assets',
      name: 'Relink all board assets',
      callback: async () => {
        const n = await relinkAllBoards(this.app);
        new Notice(n > 0
          ? `Visual Notes: Fixed ${n} broken link${n === 1 ? '' : 's'} across all boards.`
          : 'Visual Notes: No broken links found.');
      },
    });

    // Command: toggle between Visual Notes' rich view and Obsidian's native
    // Canvas view for the currently open board. Useful when another plugin
    // (e.g. one that patches the native Canvas view class) needs to act on
    // the file — that only works while native Canvas is actually rendering
    // it, which Visual Notes' own UI otherwise pre-empts.
    this.addCommand({
      id: 'toggle-native-canvas-view',
      name: 'Toggle native Canvas view for this file',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(FileView);
        const file = view?.file;
        if (!file || file.extension !== 'canvas') return false;
        if (!checking) void this.toggleNativeView(view);
        return true;
      },
    });

    // Settings tab
    this.addSettingTab(new VisualNotesSettingsTab(this.app, this));

    // Run migration + startup open + a one-time sweep of already-open
    // .canvas leaves (from a restored workspace layout) after the
    // workspace is ready. The file-open event above only fires going
    // forward, so leaves that were already open when Obsidian launched
    // need this separate pass.
    this.app.workspace.onLayoutReady(async () => {
      await this.runMigrationIfNeeded();
      await this.sweepOpenCanvasLeaves();

      if (this.settings.openOnStartup) {
        await this.openDefaultBoard();
      }
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as VisualNotesSettings;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // Applies the dot-grid color/size and canvas background color as CSS
  // custom properties on the whole app body — every open (and future)
  // board's canvas reads these via var(--ib-dot-color, ...), etc. with
  // inheritance, so setting them here updates every open board live in one
  // shot — no need to reach into each board's individual FreeformRenderer
  // instance.
  applyCanvasAppearanceSettings(): void {
    if (this.settings.dotColor) document.body.style.setProperty('--ib-dot-color', this.settings.dotColor);
    else document.body.style.removeProperty('--ib-dot-color');

    if (this.settings.dotSize !== undefined) document.body.style.setProperty('--ib-dot-radius', `${this.settings.dotSize}px`);
    else document.body.style.removeProperty('--ib-dot-radius');

    if (this.settings.canvasBgColor) document.body.style.setProperty('--ib-canvas-bg', this.settings.canvasBgColor);
    else document.body.style.removeProperty('--ib-canvas-bg');

    document.body.style.setProperty('--ib-trash-zone-size', `${this.settings.trashZoneSize ?? 56}px`);
  }

  // ── Canvas leaf takeover ─────────────────────────────────────

  async toggleNativeView(view: FileView): Promise<void> {
    const file = view.file;
    if (!file || file.extension !== 'canvas') return;
    const leaf = view.leaf;

    if (view.getViewType() === VISUAL_NOTES_VIEW_TYPE) {
      // Visual Notes → native: remember this choice for the session so the
      // file-open takeover hook doesn't immediately swap it back.
      this.nativeOverrides.add(file.path);
      await leaf.setViewState({ type: NATIVE_CANVAS_VIEW_TYPE, state: { file: file.path } });
      new Notice('Opened with Obsidian\'s native Canvas view.');
      return;
    }

    // Native → Visual Notes: only makes sense for files Visual Notes actually
    // authored (has its `ib` marker) — anything else, there's no rich card
    // data to render.
    if (!(await isVisualNotesOwnedFile(this.app, file))) {
      new Notice('This canvas wasn\'t created by Visual Notes — nothing to switch to.');
      return;
    }
    this.nativeOverrides.delete(file.path);
    await leaf.setViewState({ type: VISUAL_NOTES_VIEW_TYPE, state: { file: file.path } });
  }

  private async maybeTakeOverCanvasLeaf(file: TFile): Promise<void> {
    if (this.nativeOverrides.has(file.path)) return;
    if (!(await isVisualNotesOwnedFile(this.app, file))) return;
    const leaves = this.app.workspace.getLeavesOfType(NATIVE_CANVAS_VIEW_TYPE);
    const leaf = leaves.find(l => (l.view as { file?: TAbstractFile }).file?.path === file.path);
    if (!leaf) return;
    await leaf.setViewState({ type: VISUAL_NOTES_VIEW_TYPE, state: { file: file.path } });
  }

  private async sweepOpenCanvasLeaves(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(NATIVE_CANVAS_VIEW_TYPE)) {
      const file = (leaf.view as { file?: TAbstractFile }).file;
      if (!(file instanceof TFile) || this.nativeOverrides.has(file.path)) continue;
      if (await isVisualNotesOwnedFile(this.app, file)) {
        await leaf.setViewState({ type: VISUAL_NOTES_VIEW_TYPE, state: { file: file.path } });
      }
    }
  }

  // ── Board opening ─────────────────────────────────────────────

  async openDefaultBoard(): Promise<void> {
    const { workspace } = this.app;

    // If a board leaf is already visible AND actually has a file loaded,
    // just focus it. A leaf can exist with no file (e.g. after a workspace
    // restore whose saved file no longer exists) — that's the "No board is
    // open" empty state, not a real board, so it must NOT short-circuit
    // here; otherwise clicking the ribbon just reveals a dead empty view
    // forever instead of ever reaching the create/open flow below.
    const existing = workspace.getLeavesOfType(VISUAL_NOTES_VIEW_TYPE);
    const existingWithFile = existing.find(l => (l.view as { file?: TFile }).file instanceof TFile);
    if (existingWithFile) {
      void workspace.revealLeaf(existingWithFile);
      return;
    }

    // Try the stored default board path
    if (this.settings.defaultBoardPath) {
      const file = this.app.vault.getAbstractFileByPath(this.settings.defaultBoardPath);
      if (file instanceof TFile) {
        // Reuse an existing empty leaf instead of opening a new tab, if one's there.
        if (existing.length > 0) {
          await existing[0].setViewState({ type: VISUAL_NOTES_VIEW_TYPE, state: { file: file.path } });
          void workspace.revealLeaf(existing[0]);
          return;
        }
        await this.openBoardFile(file);
        return;
      }
      // Path is stale — clear it
      this.settings.defaultBoardPath = undefined;
      await this.saveSettings();
    }

    // No default board — prompt to create one
    new CreateBoardModal(this.app, this, (file) => {
      this.settings.defaultBoardPath = file.path;
      void this.saveSettings().then(() => this.openBoardFile(file));
    }).open();
  }

  // Shared by every "new board from template" entry point (ribbon menu,
  // folder context menu, command palette, and the empty-state screen in
  // view.ts) — each just supplies its own onCreated (open in a new tab vs.
  // reuse the current empty leaf) and an optional target folder.
  //
  // The picker lists the vault's own _Templates/ files plus any bundled
  // starter templates not yet installed. Starters are install-on-pick:
  // nothing is written to the vault until the user explicitly chooses one,
  // at which point the template file is added to _Templates/ (so it's theirs
  // to edit or delete from then on) and a fresh board is spawned from it.
  openTemplatePicker(onCreated: (file: TFile) => void, folder: TFolder | null = null): void {
    const vaultTemplates = listTemplates(this.app);
    const installedNames = new Set(vaultTemplates.map(f => f.basename));

    const choices: TemplateChoice[] = vaultTemplates.map(f => ({
      label: f.basename,
      onPick: () => { void (async () => {
        const file = await createBoardFileFromTemplate(this.app, f, folder);
        onCreated(file);
      })(); },
    }));

    for (const starter of STARTER_TEMPLATES) {
      if (installedNames.has(starter.name)) continue;
      choices.push({
        label: `${starter.name} — starter`,
        onPick: () => { void (async () => {
          const templateFile = await installStarterTemplate(this.app, starter.name, starter.json);
          new Notice(`Visual Notes: Added starter template to ${TEMPLATES_FOLDER}/${starter.name}.canvas — edit it there to make it your own.`);
          const file = await createBoardFileFromTemplate(this.app, templateFile, folder);
          onCreated(file);
        })(); },
      });
    }

    new TemplatePickerModal(this.app, choices).open();
  }

  async openBoardFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    // Force Visual Notes' view type directly rather than leaf.openFile(),
    // since for .canvas files that would resolve via extension to
    // Obsidian's native Canvas view (which Visual Notes no longer claims).
    await leaf.setViewState({ type: VISUAL_NOTES_VIEW_TYPE, state: { file: file.path } });
    void this.app.workspace.revealLeaf(leaf);
  }

  // ── Migration ─────────────────────────────────────────────────

  private async runMigrationIfNeeded(): Promise<void> {
    if (!needsMigration(this.settings)) return;

    try {
      const homeFile = await migrateV1toV2(this.app, this);
      // Immediately open the migrated home board
      await this.openBoardFile(homeFile);
    } catch (e) {
      console.error('Visual Notes: migration failed', e);
      new Notice('Visual Notes: Migration failed — your v1 tiles are still in plugin settings. Please report this issue.', 10000);
    }
  }
}