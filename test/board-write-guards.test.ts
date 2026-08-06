// Guards against a board file losing everything in it.
//
// Written after a user reported a board that opened empty and dropped out of
// its parent's tile list, with no error shown, and which we could not
// reproduce. Every route to that outcome — whatever triggers it — ends at the
// same shape of event: a write that replaces a file full of nodes with one
// that has none. These test the guard at that choke point rather than at any
// single suspected cause, so they hold even if the trigger turns out to be
// something we haven't thought of.
import { describe, it, expect } from 'vitest';
import {
  readBoardFile, writeBoardFile, classifyCanvasFile, EMPTIED_BAK_SUFFIX,
} from '../src/file-io';
import { visualNotesToCanvas } from '../src/canvas-format';
import { FakeVault } from './fake-vault';
import type { VisualNotesFile, StickyCard } from '../src/file-types';

function board(cards: VisualNotesFile['cards'] = []): VisualNotesFile {
  return { version: 3, layout: 'freeform', cards, connections: [], drawings: [] };
}

const sticky = (id: string): StickyCard => ({ id, kind: 'sticky', text: id, color: '#fff' });

/** A board file with two cards, as it would exist on disk. */
function vaultWithBoard(): { vault: FakeVault; file: ReturnType<FakeVault['putText']>; raw: string } {
  const vault = new FakeVault();
  const raw = JSON.stringify(visualNotesToCanvas(board([sticky('s1'), sticky('s2')])), null, 2);
  return { vault, file: vault.putText('Board.canvas', raw), raw };
}

describe('writeBoardFile: emptying a board that had cards', () => {
  it('snapshots the previous contents before the write lands', async () => {
    const { vault, file, raw } = vaultWithBoard();

    await writeBoardFile(vault.toApp(), file, board([]));

    expect(vault.has('Board.canvas' + EMPTIED_BAK_SUFFIX)).toBe(true);
    expect(vault.textAt('Board.canvas' + EMPTIED_BAK_SUFFIX)).toBe(raw);
  });

  it('still performs the write — clearing a board by hand must keep working', async () => {
    const { vault, file } = vaultWithBoard();

    await writeBoardFile(vault.toApp(), file, board([]));

    const after = JSON.parse(vault.textAt('Board.canvas')) as { nodes: unknown[] };
    expect(after.nodes).toHaveLength(0);
  });

  it('refreshes the snapshot, so it always holds the most recent full board', async () => {
    const { vault, file } = vaultWithBoard();
    await writeBoardFile(vault.toApp(), file, board([]));

    // Board rebuilt with different content, then emptied again.
    await writeBoardFile(vault.toApp(), file, board([sticky('later')]));
    await writeBoardFile(vault.toApp(), file, board([]));

    const backup = JSON.parse(vault.textAt('Board.canvas' + EMPTIED_BAK_SUFFIX)) as { nodes: { id: string }[] };
    expect(backup.nodes).toHaveLength(1);
    expect(backup.nodes[0].id).toBe('later');
  });

  it('does not snapshot when the board still has cards', async () => {
    const { vault, file } = vaultWithBoard();

    await writeBoardFile(vault.toApp(), file, board([sticky('s1')]));

    expect(vault.has('Board.canvas' + EMPTIED_BAK_SUFFIX)).toBe(false);
  });

  it('does not snapshot when the file on disk was already empty', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Board.canvas', JSON.stringify(visualNotesToCanvas(board([]))));

    await writeBoardFile(vault.toApp(), file, board([]));

    expect(vault.has('Board.canvas' + EMPTIED_BAK_SUFFIX)).toBe(false);
  });
});

describe('writeBoardFile: a board that failed to read is never written back', () => {
  it('leaves the file untouched rather than overwriting it with the placeholder', async () => {
    const vault = new FakeVault();
    const original = '{ this is not valid JSON';
    const file = vault.putText('Board.canvas', original);

    // The full loop that used to destroy a board: read fails, the placeholder
    // renders as an empty board, and the next autosave writes it back out.
    const placeholder = await readBoardFile(vault.toApp(), file);
    await writeBoardFile(vault.toApp(), file, placeholder);

    expect(placeholder.unreadable).toBe(true);
    expect(vault.textAt('Board.canvas')).toBe(original);
  });

  it('does not leave a spurious empty-board snapshot behind either', async () => {
    const { vault, file } = vaultWithBoard();
    const placeholder = board([]);
    placeholder.unreadable = true;

    await writeBoardFile(vault.toApp(), file, placeholder);

    expect(vault.has('Board.canvas' + EMPTIED_BAK_SUFFIX)).toBe(false);
  });
});

describe('readBoardFile: failures return a placeholder rather than throwing', () => {
  it('flags a board that could not be parsed', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Board.canvas', 'not json at all');

    const out = await readBoardFile(vault.toApp(), file);

    expect(out.unreadable).toBe(true);
    expect(out.cards).toHaveLength(0);
  });

  it('flags a board that could not even be opened, instead of rejecting', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Board.canvas', '{}');
    vault.remove('Board.canvas'); // the handle stays valid; the content is gone

    const out = await readBoardFile(vault.toApp(), file);

    expect(out.unreadable).toBe(true);
  });

  it('does not flag a board that read cleanly', async () => {
    const { vault, file } = vaultWithBoard();

    const out = await readBoardFile(vault.toApp(), file);

    expect(out.unreadable).toBeUndefined();
    expect(out.cards).toHaveLength(2);
  });
});

describe('classifyCanvasFile: unreadable is not the same as foreign', () => {
  it('recognises one of our own boards', async () => {
    const { vault, file } = vaultWithBoard();
    expect(await classifyCanvasFile(vault.toApp(), file)).toBe('ours');
  });

  it('recognises a plain native canvas as foreign', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Native.canvas', JSON.stringify({
      nodes: [{ id: 'a', type: 'text', text: 'hi', x: 0, y: 0, width: 10, height: 10 }],
      edges: [],
    }));

    expect(await classifyCanvasFile(vault.toApp(), file)).toBe('foreign');
  });

  it('reports a file it cannot parse as unreadable, NOT foreign', async () => {
    // The distinction that matters: `foreign` sends the file to Obsidian's
    // native Canvas view, which rewrites whatever it is given. Answering
    // `foreign` here is how a bad read becomes permanent damage.
    const vault = new FakeVault();
    const file = vault.putText('Broken.canvas', '{ truncated');

    expect(await classifyCanvasFile(vault.toApp(), file)).toBe('unreadable');
  });

  it('reports a file it cannot open as unreadable', async () => {
    const vault = new FakeVault();
    const file = vault.putText('Gone.canvas', '{}');
    vault.remove('Gone.canvas');

    expect(await classifyCanvasFile(vault.toApp(), file)).toBe('unreadable');
  });
});
