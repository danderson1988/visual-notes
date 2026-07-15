import { App, Notice, TFile } from 'obsidian';
import { Tile, VisualNotesSettings } from './types';
import { VisualNotesFile, TileCard } from './file-types';
import { createBoardFile, writeBoardFile } from './file-io';
import type VisualNotesPlugin from './main';

export function needsMigration(settings: VisualNotesSettings): boolean {
  return !settings.v2migrationDone && settings.rootTiles.length > 0;
}

/**
 * Converts v1 plugin-settings tiles into `.canvas` board files.
 * Nested board tiles become separate `.canvas` files.
 * Returns the home board file.
 */
export async function migrateV1toV2(app: App, plugin: VisualNotesPlugin): Promise<TFile> {
  // Keep a backup copy before clearing
  plugin.settings.legacyBackup = JSON.parse(JSON.stringify(plugin.settings.rootTiles)) as Tile[];

  const homeFile = await convertBoard(app, plugin.settings.rootTiles, 'Visual Notes Home');

  plugin.settings.v2migrationDone = true;
  plugin.settings.defaultBoardPath = homeFile.path;
  plugin.settings.rootTiles = [];
  await plugin.saveSettings();

  new Notice(
    `Visual Notes: Your tiles have been migrated to "${homeFile.path}". ` +
    'A backup of your previous data is stored in plugin settings under "legacyBackup".',
    10000
  );

  return homeFile;
}

// ── Recursive helpers ─────────────────────────────────────────

async function convertBoard(app: App, tiles: Tile[], boardName: string): Promise<TFile> {
  const cards: TileCard[] = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    cards.push(await convertTile(app, tile, i));
  }

  const board: VisualNotesFile = { version: 2, layout: 'grid', cards, connections: [], drawings: [] };

  // createBoardFile writes an empty board; overwrite with our data
  const file = await createBoardFile(app, boardName, null, 'grid');
  await writeBoardFile(app, file, board);
  return file;
}

async function convertTile(app: App, tile: Tile, index: number): Promise<TileCard> {
  if (tile.kind === 'board') {
    // Recursively convert children (or create an empty board if no children)
    const childTiles = tile.children ?? [];
    const childFile = await convertBoard(app, childTiles, tile.label);
    return {
      id: tile.id,
      kind: 'tile',
      label: tile.label,
      subtitle: tile.subtitle,
      icon: tile.icon,
      color: tile.color,
      target: { kind: 'board', path: childFile.path },
      order: index,
    };
  }

  return {
    id: tile.id,
    kind: 'tile',
    label: tile.label,
    subtitle: tile.subtitle,
    icon: tile.icon,
    color: tile.color,
    target: {
      kind: tile.kind,
      path: tile.targetPath ?? '',
    },
    order: index,
  };
}
