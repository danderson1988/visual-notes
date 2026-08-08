// @vitest-environment jsdom
//
// Regression tests for the self-linking tile bug: a tile on a grid board
// could target the very board it lives on (the picker offered the current
// board — in a fresh vault it was often the ONLY option), producing a tile
// that "went nowhere" when clicked. See also navigateToBoard's guard in
// view.ts for tiles saved before these checks existed.
import { describe, it, expect, vi } from 'vitest';
import { TileModal } from '../src/tile-modal';
import { fakeApp } from './fake-app';
import { FakeVault } from './fake-vault';
import type { TFile } from 'obsidian';
import type { TileCard } from '../src/file-types';

function setup(boardPaths: string[], currentPath: string) {
  const vault = new FakeVault();
  for (const p of boardPaths) vault.putText(p, '{}');
  const app = fakeApp(vault);
  const currentFile = app.vault.getAbstractFileByPath(currentPath) as TFile;
  expect(currentFile).toBeTruthy();
  return { vault, app, currentFile };
}

describe('TileModal: self-link prevention (bug: tile pointing at its own board)', () => {
  it('the board picker list excludes the board the tile lives on', () => {
    const { app, currentFile } = setup(['Home.canvas', 'Projects.canvas', 'Ideas.canvas'], 'Home.canvas');
    const modal = new TileModal(app, null, () => {}, currentFile);
    expect((modal as any).getBoardPaths()).toEqual(['Ideas.canvas', 'Projects.canvas']);
  });

  it('the canvas-file picker list excludes the current board too', () => {
    const { app, currentFile } = setup(['Home.canvas', 'Other.canvas'], 'Home.canvas');
    const modal = new TileModal(app, null, () => {}, currentFile);
    expect((modal as any).getPathsForKind('canvas')).toEqual(['Other.canvas']);
  });

  it('in a fresh vault (only the current board exists) the picker list is empty rather than offering a self-link', () => {
    // This is the exact reported scenario: the vault's only .canvas file is
    // the board being edited, so the old list contained exactly one entry —
    // the board itself — making the broken pick look like the intended one.
    const { app, currentFile } = setup(['Home.canvas'], 'Home.canvas');
    const modal = new TileModal(app, null, () => {}, currentFile);
    expect((modal as any).getBoardPaths()).toEqual([]);
  });

  it('refuses to save a tile whose target is the board it lives on', () => {
    const { app, currentFile } = setup(['Home.canvas', 'Other.canvas'], 'Home.canvas');
    const onSave = vi.fn();
    const modal = new TileModal(app, null, onSave, currentFile);
    (modal as any).tile.label = 'My tile';
    (modal as any).targetKind = 'board';
    (modal as any).targetPath = 'Home.canvas';

    expect((modal as any).trySave()).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves normally when the target is a different board', () => {
    const { app, currentFile } = setup(['Home.canvas', 'Other.canvas'], 'Home.canvas');
    const onSave = vi.fn();
    const modal = new TileModal(app, null, onSave, currentFile);
    (modal as any).tile.label = 'My tile';
    (modal as any).targetKind = 'board';
    (modal as any).targetPath = 'Other.canvas';

    expect((modal as any).trySave()).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as TileCard;
    expect(saved.target).toEqual({ kind: 'board', path: 'Other.canvas' });
  });
});

// An empty target used to be rejected outright ("Please select a target"),
// which forced every new board through a second, nested NamePromptModal that
// asked for a name the user had already typed as the tile's label. Leaving
// the target empty now means "make one named after the label" instead.
describe('TileModal: create-on-save when no target is picked', () => {
  it('creates a nested board named after the label and points the tile at it', async () => {
    const { vault, app, currentFile } = setup(['Home.canvas'], 'Home.canvas');
    const onSave = vi.fn();
    const modal = new TileModal(app, null, onSave, currentFile);
    (modal as any).tile.label = 'My tile';
    (modal as any).targetKind = 'board';

    await (modal as any).handleSaveClick();

    // Nested under a folder named after the current board's stem
    expect(vault.has('Home/My tile.canvas')).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as TileCard;
    expect(saved.target).toEqual({ kind: 'board', path: 'Home/My tile.canvas' });
  });

  it('creates a plain canvas for a canvas-kind tile', async () => {
    const { vault, app, currentFile } = setup(['Home.canvas'], 'Home.canvas');
    const onSave = vi.fn();
    const modal = new TileModal(app, null, onSave, currentFile, 'canvas');
    (modal as any).tile.label = 'Sketches';

    await (modal as any).handleSaveClick();

    expect(JSON.parse(vault.textAt('Sketches.canvas'))).toEqual({ nodes: [], edges: [] });
    expect((onSave.mock.calls[0][0] as TileCard).target)
      .toEqual({ kind: 'canvas', path: 'Sketches.canvas' });
  });

  it('creates nothing when the label is empty', async () => {
    const { vault, app, currentFile } = setup(['Home.canvas'], 'Home.canvas');
    const onSave = vi.fn();
    const modal = new TileModal(app, null, onSave, currentFile);
    (modal as any).targetKind = 'board';

    await (modal as any).handleSaveClick();

    // The label guard has to run before creation, or a rejected click would
    // still leave a stray board behind.
    expect(vault.has('Home/.canvas')).toBe(false);
    expect(vault.has('Home/New Visual Notes board.canvas')).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('leaves an explicitly chosen target alone rather than creating a second board', async () => {
    const { vault, app, currentFile } = setup(['Home.canvas', 'Other.canvas'], 'Home.canvas');
    const onSave = vi.fn();
    const modal = new TileModal(app, null, onSave, currentFile);
    (modal as any).tile.label = 'My tile';
    (modal as any).targetKind = 'board';
    (modal as any).targetPath = 'Other.canvas';

    await (modal as any).handleSaveClick();

    expect(vault.has('Home/My tile.canvas')).toBe(false);
    expect((onSave.mock.calls[0][0] as TileCard).target)
      .toEqual({ kind: 'board', path: 'Other.canvas' });
  });

  it('still refuses a note tile with no target, rather than inventing an empty note', async () => {
    const { app, currentFile } = setup(['Home.canvas'], 'Home.canvas');
    const onSave = vi.fn();
    const modal = new TileModal(app, null, onSave, currentFile, 'note');
    (modal as any).tile.label = 'My tile';

    await (modal as any).handleSaveClick();

    expect(onSave).not.toHaveBeenCalled();
  });
});
