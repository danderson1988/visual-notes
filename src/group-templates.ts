// Reusable card-cluster templates ("group templates").
//
// A group template is a fragment of a board — some cards, the connections
// strictly between them, and any selected ink — saved so the same cluster
// can be dropped onto any board again later. Storage is deliberately the
// same shape as everything else here: an ordinary Visual Notes .canvas
// file, just parked in _Templates/Groups/ instead of _Templates/. That
// means a template can be opened and edited as a board like any other, is
// portable with the vault, and needs no separate settings/data.json store.
//
// The same CardBundle type is what the clipboard copies and pastes (see
// freeform-view-clipboard.ts) — a template is just a bundle that was
// written to disk instead of held in memory.

import { App, TFile, TFolder } from 'obsidian';
import { Card, Connection, DrawingStroke, VisualNotesFile } from './file-types';
import {
  GROUP_TEMPLATES_FOLDER, ensureDir, readBoardFile, withFreshIds, writeNewBoardFile,
} from './file-io';
import { visualNotesToCanvas } from './canvas-format';

export { GROUP_TEMPLATES_FOLDER };

/** A self-contained slice of a board: cards plus the edges/ink that belong with them. */
export interface CardBundle {
  cards: Card[];
  connections: Connection[];
  drawings: DrawingStroke[];
}

export interface BundleBox { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Bounding box over every card and ink point in the bundle, in the canvas
 * coordinates the bundle was captured with. Null for an empty bundle.
 */
export function bundleBBox(bundle: CardBundle): BundleBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of bundle.cards) {
    const x = c.x ?? 0, y = c.y ?? 0;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + (c.w ?? 0)); maxY = Math.max(maxY, y + (c.h ?? 0));
  }
  for (const s of bundle.drawings) {
    for (const p of s.points) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
  }
  // Also shift free-floating connection endpoints (an arrow with one or
  // both ends dropped on empty canvas rather than anchored to a card).
  for (const conn of bundle.connections) {
    for (const p of [conn.fromPoint, conn.toPoint]) {
      if (!p) continue;
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Translates every card, ink point, and free connection endpoint in place. */
export function offsetBundle(bundle: CardBundle, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  for (const c of bundle.cards) { c.x = (c.x ?? 0) + dx; c.y = (c.y ?? 0) + dy; }
  for (const s of bundle.drawings) for (const p of s.points) { p.x += dx; p.y += dy; }
  for (const conn of bundle.connections) {
    if (conn.fromPoint) { conn.fromPoint.x += dx; conn.fromPoint.y += dy; }
    if (conn.toPoint) { conn.toPoint.x += dx; conn.toPoint.y += dy; }
  }
}

/**
 * Deep-clones the bundle with every card/connection/stroke id regenerated,
 * remapping connection endpoints and ink groupIds to match — so pasting the
 * same bundle repeatedly (or pasting back onto the board it came from)
 * never produces two cards sharing an id. Delegates to the board-level
 * withFreshIds so both paths stay in step as new nested card kinds appear.
 */
export function withFreshBundleIds(bundle: CardBundle): CardBundle {
  const fresh = withFreshIds(bundleToBoard(bundle));
  return { cards: fresh.cards, connections: fresh.connections, drawings: fresh.drawings };
}

/** Saved templates, newest-looking-first is not meaningful here — sorted by name for a stable menu. */
export function listGroupTemplates(app: App): TFile[] {
  return app.vault.getFiles()
    .filter(f => f.extension === 'canvas' && f.path.startsWith(`${GROUP_TEMPLATES_FOLDER}/`))
    .sort((a, b) => a.basename.localeCompare(b.basename));
}

/** The template file of exactly this name, if one already exists. */
export function findGroupTemplate(app: App, name: string): TFile | null {
  const target = `${GROUP_TEMPLATES_FOLDER}/${name.trim()}.canvas`;
  const found = app.vault.getAbstractFileByPath(target);
  return found instanceof TFile ? found : null;
}

/**
 * Writes the bundle to _Templates/Groups/<name>.canvas, normalized so its
 * top-left corner sits at the origin — a template carries no memory of
 * where on the source board it happened to be drawn, so it can be dropped
 * anywhere later. Overwrites the file at that exact name when `replace` is
 * set (the caller confirms first); otherwise a name collision gets the
 * usual " 1", " 2", … suffix rather than clobbering the existing template.
 */
export async function saveGroupTemplate(
  app: App, bundle: CardBundle, name: string, replace = false,
): Promise<TFile> {
  await ensureDir(app, GROUP_TEMPLATES_FOLDER);
  const normalized = withFreshBundleIds(bundle);
  const box = bundleBBox(normalized);
  if (box) offsetBundle(normalized, -box.minX, -box.minY);

  if (replace) {
    const existing = findGroupTemplate(app, name);
    if (existing) {
      await app.vault.modify(existing, JSON.stringify(visualNotesToCanvas(bundleToBoard(normalized)), null, 2));
      return existing;
    }
  }
  const found = app.vault.getAbstractFileByPath(GROUP_TEMPLATES_FOLDER);
  const folder = found instanceof TFolder ? found : null;
  return writeNewBoardFile(app, name, folder, bundleToBoard(normalized));
}

/**
 * Reads a template file back into a bundle. Returns null when the file is
 * unreadable or holds nothing placeable — readBoardFile already surfaces
 * its own Notice for a corrupt file, so callers only need the null check.
 */
export async function readGroupTemplate(app: App, file: TFile): Promise<CardBundle | null> {
  const board = await readBoardFile(app, file);
  const bundle: CardBundle = {
    cards: board.cards,
    connections: board.connections ?? [],
    drawings: board.drawings ?? [],
  };
  if (!bundle.cards.length && !bundle.drawings.length) return null;
  return bundle;
}

function bundleToBoard(bundle: CardBundle): VisualNotesFile {
  return {
    version: 3, layout: 'freeform',
    viewport: { x: 0, y: 0, zoom: 1 },
    cards: bundle.cards, connections: bundle.connections, drawings: bundle.drawings,
  };
}
