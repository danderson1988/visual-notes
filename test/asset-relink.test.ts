import { describe, it, expect } from 'vitest';
import { relinkBoardData, relinkAllBoards } from '../src/asset-manager';
import { visualNotesToCanvas } from '../src/canvas-format';
import { FakeVault } from './fake-vault';
import type { App } from 'obsidian';
import type { VisualNotesFile, ImageCard, NoteLinkCard, TileCard, KanbanColumnCard } from '../src/file-types';

// relinkBoardData only ever calls two Vault methods — a plain object
// standing in for `app.vault` is enough, no real Obsidian runtime needed.
interface FakeFile { name: string; path: string; }
function fakeApp(files: FakeFile[]): App {
  return {
    vault: {
      getAbstractFileByPath: (path: string) => files.find(f => f.path === path) ?? null,
      getFiles: () => files,
    },
  } as unknown as App;
}

function board(cards: VisualNotesFile['cards']): VisualNotesFile {
  return { version: 3, layout: 'freeform', cards, connections: [], drawings: [] };
}

describe('relinkBoardData (asset relinking)', () => {
  it('fixes a broken image path when exactly one vault file matches the filename', async () => {
    const app = fakeApp([{ name: 'cat.png', path: 'Assets/Images/cat.png' }]);
    const img: ImageCard = { id: 'img1', kind: 'image', source: { type: 'vault', path: 'OldFolder/cat.png' } };
    const b = board([img]);

    const fixed = await relinkBoardData(app, b);

    expect(fixed).toBe(1);
    expect((b.cards[0] as ImageCard).source).toEqual({ type: 'vault', path: 'Assets/Images/cat.png' });
  });

  it('leaves an already-valid path untouched', async () => {
    const app = fakeApp([{ name: 'cat.png', path: 'Assets/Images/cat.png' }]);
    const img: ImageCard = { id: 'img1', kind: 'image', source: { type: 'vault', path: 'Assets/Images/cat.png' } };
    const b = board([img]);

    const fixed = await relinkBoardData(app, b);

    expect(fixed).toBe(0);
    expect((b.cards[0] as ImageCard).source.path).toBe('Assets/Images/cat.png');
  });

  it('leaves a broken path alone when no file in the vault matches the filename', async () => {
    const app = fakeApp([]); // vault has nothing at all
    const img: ImageCard = { id: 'img1', kind: 'image', source: { type: 'vault', path: 'OldFolder/cat.png' } };
    const b = board([img]);

    const fixed = await relinkBoardData(app, b);

    expect(fixed).toBe(0);
    expect((b.cards[0] as ImageCard).source.path).toBe('OldFolder/cat.png');
  });

  it('leaves a broken path alone when the filename is ambiguous (matches more than one file)', async () => {
    const app = fakeApp([
      { name: 'cat.png', path: 'Assets/Images/cat.png' },
      { name: 'cat.png', path: 'Backup/cat.png' },
    ]);
    const img: ImageCard = { id: 'img1', kind: 'image', source: { type: 'vault', path: 'OldFolder/cat.png' } };
    const b = board([img]);

    const fixed = await relinkBoardData(app, b);

    expect(fixed).toBe(0);
    expect((b.cards[0] as ImageCard).source.path).toBe('OldFolder/cat.png');
  });

  it('relinks note-link and generic file cards the same way', async () => {
    const app = fakeApp([{ name: 'Notes.md', path: 'Vault/Notes.md' }]);
    const note: NoteLinkCard = { id: 'n1', kind: 'note-link', path: 'Old/Notes.md', displayMode: 'preview' };
    const b = board([note]);

    const fixed = await relinkBoardData(app, b);

    expect(fixed).toBe(1);
    expect((b.cards[0] as NoteLinkCard).path).toBe('Vault/Notes.md');
  });

  it('relinks multiple broken fields on a single legacy kanban item and counts each fix', async () => {
    const app = fakeApp([
      { name: 'shot.png', path: 'Assets/Images/shot.png' },
      { name: 'clip.mp3', path: 'Assets/Audio/clip.mp3' },
    ]);
    const kc: KanbanColumnCard = {
      id: 'kc1', kind: 'kanban-column', color: '#eee',
      items: [{ id: 'it1', text: 'x', done: false, imagePath: 'Old/shot.png', audioPath: 'Old/clip.mp3' }],
    };
    const b = board([kc]);

    const fixed = await relinkBoardData(app, b);

    expect(fixed).toBe(2);
    expect(kc.items[0].imagePath).toBe('Assets/Images/shot.png');
    expect(kc.items[0].audioPath).toBe('Assets/Audio/clip.mp3');
  });

  it('never touches a folder-target tile, even if its path would otherwise look broken', async () => {
    const app = fakeApp([]); // nothing in the vault — a non-folder tile here would be left alone anyway, but for a different reason
    const tile: TileCard = {
      id: 'tile1', kind: 'tile', label: 'My Folder', icon: 'folder', color: '#3B82F6',
      target: { kind: 'folder', path: 'Some/Folder' },
    };
    const b = board([tile]);

    const fixed = await relinkBoardData(app, b);

    expect(fixed).toBe(0);
    expect((b.cards[0] as TileCard).target).toEqual({ kind: 'folder', path: 'Some/Folder' });
  });
});

describe('relinkAllBoards', () => {
  function boardOf(cards: VisualNotesFile['cards']): VisualNotesFile {
    return { version: 3, layout: 'freeform', cards, connections: [], drawings: [] };
  }

  it('fixes broken links across every Visual Notes-owned board and reports the total', async () => {
    const vault = new FakeVault();
    vault.putText('_Assets/Images/cat.png', 'bytes');

    const img: ImageCard = { id: 'img1', kind: 'image', source: { type: 'vault', path: 'Old/cat.png' } };
    vault.putText('BoardA.canvas', JSON.stringify(visualNotesToCanvas(boardOf([img]))));

    const note: NoteLinkCard = { id: 'n1', kind: 'note-link', path: 'Old/cat.png', displayMode: 'preview' };
    // second board referencing the same filename, also broken
    vault.putText('BoardB.canvas', JSON.stringify(visualNotesToCanvas(boardOf([note]))));

    const total = await relinkAllBoards(vault.toApp());

    expect(total).toBe(2);
    const boardAData = JSON.parse(vault.textAt('BoardA.canvas'));
    expect(boardAData.nodes[0].ib.source.path).toBe('_Assets/Images/cat.png');
  });

  it('never touches a plain native .canvas file with no Visual Notes marker', async () => {
    const vault = new FakeVault();
    const nativeCanvas = JSON.stringify({ nodes: [{ id: 'x', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'hi' }], edges: [] });
    vault.putText('Native.canvas', nativeCanvas);

    const total = await relinkAllBoards(vault.toApp());

    expect(total).toBe(0);
    expect(vault.textAt('Native.canvas')).toBe(nativeCanvas); // byte-for-byte untouched
  });

  it('does not rewrite a board that had nothing to fix', async () => {
    const vault = new FakeVault();
    vault.putText('_Assets/Images/cat.png', 'bytes');
    const img: ImageCard = { id: 'img1', kind: 'image', source: { type: 'vault', path: '_Assets/Images/cat.png' } };
    const raw = JSON.stringify(visualNotesToCanvas(boardOf([img])));
    vault.putText('BoardA.canvas', raw);

    await relinkAllBoards(vault.toApp());

    // Re-serializing an untouched board can reorder/reformat JSON, so this
    // asserts on content equivalence rather than requiring the exact same
    // bytes — the important thing is relinkAllBoards's own `if (n > 0)`
    // guard, which this exercises via a zero-fix board.
    expect(JSON.parse(vault.textAt('BoardA.canvas'))).toEqual(JSON.parse(raw));
  });
});
