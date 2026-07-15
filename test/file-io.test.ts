import { describe, it, expect } from 'vitest';
import {
  readBoardFile, isVisualNotesOwnedFile, writeBoardFile, createBoardFile, listTemplates,
  createBoardFileFromTemplate, installStarterTemplate, saveBoardAsTemplate, ensureDir, TEMPLATES_FOLDER,
} from '../src/file-io';
import { visualNotesToCanvas } from '../src/canvas-format';
import { FakeVault } from './fake-vault';
import type { VisualNotesFile, StickyCard } from '../src/file-types';

function board(cards: VisualNotesFile['cards'] = []): VisualNotesFile {
  return { version: 3, layout: 'freeform', cards, connections: [], drawings: [] };
}

describe('readBoardFile', () => {
  it('parses a valid native Canvas file into a VisualNotesFile', async () => {
    const vault = new FakeVault();
    const sticky: StickyCard = { id: 's1', kind: 'sticky', text: 'hi', color: '#fff' };
    const raw = JSON.stringify(visualNotesToCanvas(board([sticky])));
    const file = vault.putText('Board.canvas', raw);

    const out = await readBoardFile(vault.toApp(), file);
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0]).toMatchObject({ id: 's1', kind: 'sticky' });
  });

  it('runs the legacy kanban-column migration on read', async () => {
    // A hand-built native canvas node carrying a legacy kanban-column ib
    // payload — readBoardFile should hand it through migrateLegacyKanbanColumns.
    const vault = new FakeVault();
    const raw = JSON.stringify({
      nodes: [{
        id: 'k1', type: 'group', x: 0, y: 0, width: 280, height: 400,
        ib: { id: 'k1', kind: 'kanban-column', color: '#eee', items: [] },
      }],
      edges: [],
      ib: { version: 1, layout: 'freeform' },
    });
    const file = vault.putText('Board.canvas', raw);

    const out = await readBoardFile(vault.toApp(), file);
    expect(out.cards[0].kind).toBe('kanban-board');
  });

  it('backs up and returns an empty board when the file is not valid JSON', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Broken.canvas', 'this is not json {{{');

    const out = await readBoardFile(vault.toApp(), file);

    expect(out.cards).toEqual([]);
    expect(out.layout).toBe('grid');
    expect(vault.has('Broken.canvas.bak')).toBe(true);
    expect(vault.textAt('Broken.canvas.bak')).toBe('this is not json {{{');
  });

  it('backs up and returns an empty board when the JSON is valid but not canvas-shaped', async () => {
    const vault = new FakeVault();
    const file = vault.putText('NotACanvas.canvas', JSON.stringify({ hello: 'world' }));

    const out = await readBoardFile(vault.toApp(), file);

    expect(out.cards).toEqual([]);
    expect(vault.has('NotACanvas.canvas.bak')).toBe(true);
  });

  it('does not overwrite an existing backup on a second failed read', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Broken.canvas', 'not json');
    vault.putText('Broken.canvas.bak', 'the original backup, already made once before');

    await readBoardFile(vault.toApp(), file);

    expect(vault.textAt('Broken.canvas.bak')).toBe('the original backup, already made once before');
  });
});

describe('isVisualNotesOwnedFile', () => {
  it('is true for a canvas carrying the ib version marker', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Board.canvas', JSON.stringify(visualNotesToCanvas(board())));
    expect(await isVisualNotesOwnedFile(vault.toApp(), file)).toBe(true);
  });

  it('is false for a plain native canvas with no ib marker', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Native.canvas', JSON.stringify({ nodes: [], edges: [] }));
    expect(await isVisualNotesOwnedFile(vault.toApp(), file)).toBe(false);
  });

  it('is false (not throwing) for unparseable content', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Broken.canvas', 'nope');
    expect(await isVisualNotesOwnedFile(vault.toApp(), file)).toBe(false);
  });
});

describe('writeBoardFile', () => {
  it('writes the board as native Canvas JSON via vault.modify', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Board.canvas', '{}');
    const sticky: StickyCard = { id: 's1', kind: 'sticky', text: 'hi', color: '#fff' };

    await writeBoardFile(vault.toApp(), file, board([sticky]));

    const written = JSON.parse(vault.textAt('Board.canvas'));
    expect(written.nodes[0].ib).toMatchObject({ id: 's1', kind: 'sticky' });
  });
});

describe('createBoardFile / collision-safe naming', () => {
  it('creates a new empty board at the expected path', async () => {
    const vault = new FakeVault();
    const file = await createBoardFile(vault.toApp(), 'My Board', null, 'freeform');
    expect(file.path).toBe('My Board.canvas');
    const written = JSON.parse(vault.textAt('My Board.canvas'));
    expect(written.ib.layout).toBe('freeform');
  });

  it('appends a counter suffix when the name is already taken', async () => {
    const vault = new FakeVault();
    const first = await createBoardFile(vault.toApp(), 'My Board', null, 'freeform');
    const second = await createBoardFile(vault.toApp(), 'My Board', null, 'freeform');
    const third = await createBoardFile(vault.toApp(), 'My Board', null, 'freeform');

    expect(first.path).toBe('My Board.canvas');
    expect(second.path).toBe('My Board 1.canvas');
    expect(third.path).toBe('My Board 2.canvas');
  });

  it('falls back to a default name when given only whitespace', async () => {
    const vault = new FakeVault();
    const file = await createBoardFile(vault.toApp(), '   ', null, 'freeform');
    expect(file.path).toBe('New Visual Notes board.canvas');
  });
});

describe('listTemplates', () => {
  it('lists only .canvas files under the templates folder', () => {
    const vault = new FakeVault();
    vault.putText(`${TEMPLATES_FOLDER}/A.canvas`, '{}');
    vault.putText(`${TEMPLATES_FOLDER}/B.canvas`, '{}');
    vault.putText(`${TEMPLATES_FOLDER}/notes.md`, 'not a template');
    vault.putText('Elsewhere/C.canvas', '{}'); // outside the templates folder

    const names = listTemplates(vault.toApp()).map(f => f.name).sort();
    expect(names).toEqual(['A.canvas', 'B.canvas']);
  });
});

describe('createBoardFileFromTemplate', () => {
  it('spawns a new file with fresh ids, leaving the template itself untouched', async () => {
    const vault = new FakeVault();
    const sticky: StickyCard = { id: 'orig', kind: 'sticky', text: 'hi', color: '#fff' };
    const templateFile = vault.putText('Templates/Foo.canvas', JSON.stringify(visualNotesToCanvas(board([sticky]))));

    const spawned = await createBoardFileFromTemplate(vault.toApp(), templateFile, null);

    expect(spawned.path).toBe('Foo.canvas');
    const spawnedData = JSON.parse(vault.textAt('Foo.canvas'));
    expect(spawnedData.nodes[0].ib.id).not.toBe('orig');
    // Template file itself is unchanged.
    const templateData = JSON.parse(vault.textAt('Templates/Foo.canvas'));
    expect(templateData.nodes[0].ib.id).toBe('orig');
  });
});

describe('installStarterTemplate', () => {
  it('writes the starter into _Templates/<name>.canvas when nothing is there yet', async () => {
    const vault = new FakeVault();
    const file = await installStarterTemplate(vault.toApp(), 'Weekly Planner', '{"nodes":[],"edges":[]}');
    expect(file.path).toBe(`${TEMPLATES_FOLDER}/Weekly Planner.canvas`);
    expect(vault.textAt(`${TEMPLATES_FOLDER}/Weekly Planner.canvas`)).toBe('{"nodes":[],"edges":[]}');
  });

  it('returns the existing file untouched if one with that name already exists', async () => {
    const vault = new FakeVault();
    vault.putText(`${TEMPLATES_FOLDER}/Weekly Planner.canvas`, 'user already customized this');

    const file = await installStarterTemplate(vault.toApp(), 'Weekly Planner', '{"nodes":[],"edges":[]}');

    expect(file.path).toBe(`${TEMPLATES_FOLDER}/Weekly Planner.canvas`);
    // Not overwritten with the bundled starter's content.
    expect(vault.textAt(`${TEMPLATES_FOLDER}/Weekly Planner.canvas`)).toBe('user already customized this');
  });
});

describe('saveBoardAsTemplate', () => {
  it('saves a copy of the board with archived cards stripped', async () => {
    const vault = new FakeVault();
    const sticky: StickyCard = { id: 's1', kind: 'sticky', text: 'keep me', color: '#fff' };
    const archivedCard: StickyCard = { id: 'arch1', kind: 'sticky', text: 'drop me', color: '#fff' };
    const src = board([sticky]);
    src.archived = [archivedCard];

    await saveBoardAsTemplate(vault.toApp(), src, 'My Template');

    const written = JSON.parse(vault.textAt(`${TEMPLATES_FOLDER}/My Template.canvas`));
    expect(written.ib.archived).toBeUndefined();
    expect(written.nodes).toHaveLength(1);
    // Original board object itself isn't mutated by the strip.
    expect(src.archived).toHaveLength(1);
  });
});

describe('ensureDir', () => {
  it('creates every path segment that does not already exist', async () => {
    const vault = new FakeVault();
    const app = vault.toApp();
    await ensureDir(app, '_Assets/Images/Sub');
    expect(app.vault.getAbstractFileByPath('_Assets')).toBeTruthy();
    expect(app.vault.getAbstractFileByPath('_Assets/Images')).toBeTruthy();
    expect(app.vault.getAbstractFileByPath('_Assets/Images/Sub')).toBeTruthy();
  });

  it('is a no-op for segments that already exist', async () => {
    const vault = new FakeVault();
    const app = vault.toApp();
    await ensureDir(app, '_Assets');
    await expect(ensureDir(app, '_Assets/Images')).resolves.toBeUndefined();
  });
});
