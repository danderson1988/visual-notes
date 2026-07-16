import { App, Notice, TFile, TFolder } from 'obsidian';
import { VisualNotesFile } from './file-types';
import { CanvasData, visualNotesToCanvas, canvasToVisualNotes, isVisualNotesCanvas } from './canvas-format';
import { migrateLegacyKanbanColumns } from './kanban-migrate';

// ── Read ──────────────────────────────────────────────────────

export async function readBoardFile(app: App, file: TFile): Promise<VisualNotesFile> {
  const raw = await app.vault.read(file);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Not a valid canvas/board file');

    // Native JSON Canvas format (nodes/edges) — whether authored by Icon
    // Board or by Obsidian's own Canvas / another plugin.
    if (Array.isArray((parsed as Record<string, unknown>).nodes)) {
      const data = parsed as CanvasData;
      return migrateLegacyKanbanColumns(canvasToVisualNotes(data));
    }

    throw new Error('Unrecognized file structure');
  } catch {
    const backupPath = file.path + '.bak';
    try {
      if (!app.vault.getAbstractFileByPath(backupPath)) {
        await app.vault.create(backupPath, raw);
      }
    } catch { /* ignore */ }
    new Notice(
      `Visual Notes: Could not read "${file.name}" — it may be corrupted. ` +
      `A backup was saved as "${file.name}.bak".`,
      8000
    );
    return emptyBoard('grid');
  }
}

/** True if the given vault file is a JSON Canvas authored by Visual Notes (has our `ib` marker at the root). */
export async function isVisualNotesOwnedFile(app: App, file: TFile): Promise<boolean> {
  try {
    const raw = await app.vault.read(file);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return false;
    return isVisualNotesCanvas(parsed as CanvasData);
  } catch {
    return false;
  }
}

// ── Write ─────────────────────────────────────────────────────

export async function writeBoardFile(app: App, file: TFile, board: VisualNotesFile): Promise<void> {
  const data = visualNotesToCanvas(board);
  await app.vault.modify(file, JSON.stringify(data, null, 2));
}

// ── Create ────────────────────────────────────────────────────

export async function createBoardFile(
  app: App,
  name: string,
  folder: TFolder | null,
  layout: 'grid' | 'freeform'
): Promise<TFile> {
  return writeNewBoardFile(app, name, folder, emptyBoard(layout));
}

// ── Templates ─────────────────────────────────────────────────

export const TEMPLATES_FOLDER = '_Templates';

// Template files are just ordinary Visual Notes boards that happen to live
// in this one folder — nothing distinguishes them at the file-format level.
export function listTemplates(app: App): TFile[] {
  return app.vault.getFiles().filter(
    f => f.extension === 'canvas' && f.path.startsWith(`${TEMPLATES_FOLDER}/`)
  );
}

// Spawns a new board from a template file. The template itself is never
// opened or modified — its contents are copied into a brand-new file with
// every card/connection/drawing id regenerated, so opening the same
// template repeatedly always yields independent boards, and the template
// stays exactly as-is for next time.
export async function createBoardFileFromTemplate(
  app: App,
  templateFile: TFile,
  folder: TFolder | null
): Promise<TFile> {
  const templateBoard = await readBoardFile(app, templateFile);
  return writeNewBoardFile(app, templateFile.basename, folder, withFreshIds(templateBoard));
}

// Writes a bundled starter template into _Templates/<name>.canvas so it
// behaves like any user-made template from then on (editable, deletable,
// listed by listTemplates). If a template with that name already exists —
// including a user-modified copy of the same starter — it is returned
// untouched rather than overwritten.
export async function installStarterTemplate(app: App, name: string, json: string): Promise<TFile> {
  await ensureDir(app, TEMPLATES_FOLDER);
  const path = `${TEMPLATES_FOLDER}/${name}.canvas`;
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return existing;
  return app.vault.create(path, json);
}

// Saves a copy of the given board's data into _Templates/<name>.canvas.
// The archive is dropped — a template is meant to be a lean starting point,
// not carry over whatever happened to be archived on the board it came from.
export async function saveBoardAsTemplate(app: App, board: VisualNotesFile, name: string): Promise<TFile> {
  await ensureDir(app, TEMPLATES_FOLDER);
  const found = app.vault.getAbstractFileByPath(TEMPLATES_FOLDER);
  const folder = found instanceof TFolder ? found : null;
  const clone = JSON.parse(JSON.stringify(board)) as VisualNotesFile;
  delete clone.archived;
  return writeNewBoardFile(app, name, folder, clone);
}

// ── Helpers ───────────────────────────────────────────────────

export async function ensureDir(app: App, dir: string): Promise<void> {
  const parts = dir.split('/');
  let cur = '';
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!app.vault.getAbstractFileByPath(cur)) {
      try { await app.vault.createFolder(cur); } catch { /* folder may already exist */ }
    }
  }
}

// Resolves name/folder to a collision-safe path (appending " 1", " 2", …
// before the extension as needed) and writes board there.
async function writeNewBoardFile(app: App, name: string, folder: TFolder | null, board: VisualNotesFile): Promise<TFile> {
  const safeName = name.trim() || 'New Visual Notes board';
  const baseName = safeName.endsWith('.canvas') ? safeName : `${safeName}.canvas`;
  const folderPath = folder ? folder.path : '';

  let finalPath = folderPath ? `${folderPath}/${baseName}` : baseName;
  let counter = 1;
  while (app.vault.getAbstractFileByPath(finalPath)) {
    const stem = baseName.replace(/\.canvas$/, '');
    const candidate = `${stem} ${counter}.canvas`;
    finalPath = folderPath ? `${folderPath}/${candidate}` : candidate;
    counter++;
  }

  const data = visualNotesToCanvas(board);
  return app.vault.create(finalPath, JSON.stringify(data, null, 2));
}

function emptyBoard(layout: 'grid' | 'freeform'): VisualNotesFile {
  const board: VisualNotesFile = { version: 3, layout, cards: [], connections: [], drawings: [] };
  if (layout === 'freeform') board.viewport = { x: 0, y: 0, zoom: 1 };
  return board;
}

// Deep-clones a board, giving every card (top-level and nested inside a
// Column or Kanban board/column), connection, and drawing stroke a fresh id
// — remapping connection endpoints and drawing groupIds to match — so a
// board spawned from a template never shares ids with the template or with
// any other board spawned from the same one.
export function withFreshIds(board: VisualNotesFile): VisualNotesFile {
  const clone = JSON.parse(JSON.stringify(board)) as VisualNotesFile;
  const cardIdMap = new Map<string, string>();

  const remapChild = (c: { id: string }) => {
    const fresh = crypto.randomUUID();
    cardIdMap.set(c.id, fresh);
    c.id = fresh;
  };
  const remapCard = (card: VisualNotesFile['cards'][number]) => {
    remapChild(card);
    if (card.kind === 'column') for (const ch of card.children) remapChild(ch);
    if (card.kind === 'kanban-board') for (const col of card.columns) for (const it of col.items) remapChild(it);
    if (card.kind === 'kanban-column') for (const it of card.items) remapChild(it);
  };

  for (const card of clone.cards) remapCard(card);
  for (const card of clone.archived ?? []) remapCard(card);

  for (const conn of clone.connections) {
    conn.id = crypto.randomUUID();
    if (conn.fromCardId) conn.fromCardId = cardIdMap.get(conn.fromCardId) ?? conn.fromCardId;
    if (conn.toCardId) conn.toCardId = cardIdMap.get(conn.toCardId) ?? conn.toCardId;
  }

  // Strokes drawn in one pen session share a groupId (so they're selected/
  // moved/deleted together) — regenerate it once per original groupId, not
  // once per stroke, or that grouping would be lost.
  const groupIdMap = new Map<string, string>();
  for (const d of clone.drawings) {
    d.id = crypto.randomUUID();
    if (!groupIdMap.has(d.groupId)) groupIdMap.set(d.groupId, crypto.randomUUID());
    d.groupId = groupIdMap.get(d.groupId)!;
  }

  return clone;
}
