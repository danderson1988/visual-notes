// Copy/cut/paste of card groups, and the group-template menus built on top
// of the same machinery.
//
// Both features move the same thing around — a CardBundle (see
// group-templates.ts): the selected cards, the connections strictly between
// them, and any selected ink. Copy puts one in the clipboard; a template
// puts one in a vault file. Paste is a single code path for both.
//
// Clipboard strategy: the bundle is held in a module-level variable (so it
// survives switching boards, and so the right-click "Paste" item can be
// built synchronously while the menu is being assembled), *and* mirrored
// into the system clipboard as marker-prefixed JSON so a copy can be
// pasted into a board open in another Obsidian window. Paste prefers the
// system clipboard — that way an external copy made after ours correctly
// wins — and falls back to the in-memory bundle only when the clipboard
// carries nothing usable, which is also what covers the case of
// navigator.clipboard.writeText being unavailable or denied.

import { Notice, TFile } from 'obsidian';
import { NamePromptModal, ConfirmModal } from './tile-modal';
import {
  CardBundle, bundleBBox, findGroupTemplate, listGroupTemplates,
  offsetBundle, readGroupTemplate, saveGroupTemplate, withFreshBundleIds,
} from './group-templates';
import { screenToCanvas } from './canvas/pan-zoom';
import type { FreeformRenderer } from './freeform-view';

declare module './freeform-view' {
  interface FreeformRenderer {
    collectSelectionBundle(): CardBundle | null;
    copySelection(cut?: boolean): void;
    hasClipboardBundle(): boolean;
    readBundleFromText(text: string): CardBundle | null;
    pasteFromClipboard(cx?: number, cy?: number): void;
    pasteBundleAt(bundle: CardBundle, cx?: number, cy?: number): void;
    promptSaveSelectionAsTemplate(): void;
    showGroupTemplateMenu(e: MouseEvent, cx: number, cy: number): void;
    insertGroupTemplate(file: TFile, cx: number, cy: number): Promise<void>;
  }
}

// Distinguishes our own JSON from any other text on the clipboard. Versioned
// so a future bundle-shape change can be rejected rather than half-pasted.
const CLIPBOARD_MARKER = 'visual-notes/cards-v1:';

// Session clipboard, shared by every open board (module scope, not per
// renderer) so copying on one board and pasting on another works.
let sessionClipboard: CardBundle | null = null;

// Gap left between a pasted bundle and the copy it came from, when pasting
// with no pointer position to aim at.
const PASTE_FALLBACK_OFFSET = 24;

export const clipboardMethods = {
  /**
   * The current selection as a self-contained bundle, deep-cloned so later
   * edits to the board can't reach back into a copied/saved bundle.
   *
   * A selected group frame brings its contents along — dragging a frame
   * already moves the cards inside it, so copying one that came back empty
   * would be a surprise. Connections are kept only when *both* endpoints
   * are in the bundle: a half-connected arrow would have nothing to anchor
   * to once pasted.
   */
  collectSelectionBundle(this: FreeformRenderer): CardBundle | null {
    const ids = new Set(this.selection.getIds());
    for (const id of [...ids]) {
      const card = this.board.cards.find(c => c.id === id);
      if (card?.kind === 'group') for (const inner of this.cardsContainedInGroup(card)) ids.add(inner);
    }

    // Filtering the board (rather than mapping over the id set) keeps the
    // cards in board order, which is what the z-order restack below and the
    // group frames' behind-their-contents layering both rely on.
    const cards = this.board.cards.filter(c => ids.has(c.id));
    const connections = this.board.connections.filter(c =>
      !!c.fromCardId && !!c.toCardId && ids.has(c.fromCardId) && ids.has(c.toCardId));
    const drawings = this.board.drawings.filter(s => this.selectedDrawingIds.has(s.groupId));

    if (!cards.length && !drawings.length) return null;
    return JSON.parse(JSON.stringify({ cards, connections, drawings })) as CardBundle;
  },

  copySelection(this: FreeformRenderer, cut = false): void {
    const bundle = this.collectSelectionBundle();
    if (!bundle) return;
    sessionClipboard = bundle;
    // Best-effort mirror for cross-window paste. Failure (no permission, no
    // clipboard API on this platform) is not worth interrupting the user
    // over — the in-memory copy above still works everywhere.
    void navigator.clipboard?.writeText(CLIPBOARD_MARKER + JSON.stringify(bundle)).catch(() => { /* in-memory copy stands */ });

    if (cut) {
      // Two separate undo entries when the selection spans both cards and
      // ink, since each delete pushes its own — an acceptable seam for a
      // combination that's rare in practice.
      if (!this.selection.isEmpty()) this.deleteSelected();
      if (this.selectedDrawingIds.size > 0) this.deleteSelectedDrawing();
    }
    new Notice(`${cut ? 'Cut' : 'Copied'} ${describeBundle(bundle)}.`);
  },

  hasClipboardBundle(this: FreeformRenderer): boolean {
    return sessionClipboard !== null;
  },

  readBundleFromText(this: FreeformRenderer, text: string): CardBundle | null {
    if (!text.startsWith(CLIPBOARD_MARKER)) return null;
    try {
      const parsed = JSON.parse(text.slice(CLIPBOARD_MARKER.length)) as Partial<CardBundle>;
      if (!Array.isArray(parsed.cards)) return null;
      return {
        cards: parsed.cards,
        connections: Array.isArray(parsed.connections) ? parsed.connections : [],
        drawings: Array.isArray(parsed.drawings) ? parsed.drawings : [],
      };
    } catch { return null; }
  },

  pasteFromClipboard(this: FreeformRenderer, cx?: number, cy?: number): void {
    if (!sessionClipboard) return;
    this.pasteBundleAt(sessionClipboard, cx, cy);
  },

  /**
   * Drops a bundle onto this board, centred on (cx, cy) in canvas space —
   * or on the pointer, or on the middle of the view, in that order of
   * preference when no explicit position is given. The bundle argument is
   * never mutated: ids are regenerated and coordinates shifted on a clone,
   * so the same clipboard entry or template file can be pasted repeatedly.
   */
  pasteBundleAt(this: FreeformRenderer, bundle: CardBundle, cx?: number, cy?: number): void {
    const fresh = withFreshBundleIds(bundle);
    const box = bundleBBox(fresh);
    if (!box) return;

    const w = box.maxX - box.minX, h = box.maxY - box.minY;
    let targetX: number, targetY: number;
    if (cx !== undefined && cy !== undefined) {
      targetX = cx - w / 2; targetY = cy - h / 2;
    } else if (this.lastPointerClient) {
      const rect = this.outer.getBoundingClientRect();
      const p = screenToCanvas(this.lastPointerClient.x - rect.left, this.lastPointerClient.y - rect.top, this.vp);
      targetX = p.x - w / 2; targetY = p.y - h / 2;
    } else {
      // Nothing to aim at: offset slightly from where the bundle was
      // captured, the same nudge duplicate uses, so the copy is visibly
      // distinct from its original rather than landing exactly on top.
      targetX = box.minX + PASTE_FALLBACK_OFFSET; targetY = box.minY + PASTE_FALLBACK_OFFSET;
    }
    offsetBundle(fresh, this.applySnap(targetX) - box.minX, this.applySnap(targetY) - box.minY);

    this.pushUndo();

    // Restack above everything already on the board, preserving the
    // bundle's own relative layering.
    const baseZ = this.nextZ();
    const sorted = [...fresh.cards].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    sorted.forEach((c, i) => { c.z = baseZ + i; });

    for (const card of fresh.cards) {
      this.board.cards.push(card);
      this.createCardEl(card);
    }
    this.board.connections.push(...fresh.connections);
    for (const stroke of fresh.drawings) {
      this.board.drawings.push(stroke);
      this.renderSingleDrawing(stroke);
    }

    this.selection.clear();
    this.deselectDrawing();
    if (fresh.cards.length) {
      for (const card of fresh.cards) this.selection.add(card.id);
    } else {
      // Ink-only paste — there are no cards to select, so select the
      // pasted sketches instead and the usual selection UI still applies.
      for (const stroke of fresh.drawings) this.selectedDrawingIds.add(stroke.groupId);
      this.refreshDrawingSelectionVisual();
    }
    this.refreshSelectionVisuals();
    this.refreshAllConnections();
    this.scheduleSave();
  },

  // ── Group templates ───────────────────────────────────────────

  promptSaveSelectionAsTemplate(this: FreeformRenderer): void {
    const bundle = this.collectSelectionBundle();
    if (!bundle) { new Notice('Select some cards first, then save them as a template.'); return; }
    new NamePromptModal(this.app, 'Create template', 'Template name', (name) => {
      const existing = findGroupTemplate(this.app, name);
      if (existing) {
        new ConfirmModal(
          this.app,
          `A template named "${existing.basename}" already exists. Replace it?`,
          () => void writeTemplate(this, bundle, name, true),
          'Replace',
        ).open();
        return;
      }
      void writeTemplate(this, bundle, name, false);
    }, '', 'Create').open();
  },

  /**
   * Second-level menu of the user's saved templates, opened from the
   * canvas right-click menu's "Templates" entry. A real nested submenu
   * would be better, but Obsidian's Menu exposes no submenu API (see the
   * note on the canvas menu itself) — showing a second menu at the same
   * point is the closest equivalent, and works with the phone action
   * sheet unchanged.
   */
  showGroupTemplateMenu(this: FreeformRenderer, e: MouseEvent, cx: number, cy: number): void {
    const files = listGroupTemplates(this.app);
    const menu = this.newMenu();
    if (!files.length) {
      menu.addItem(i => i.setTitle('No saved templates yet').setIsLabel(true));
      menu.addItem(i => i.setTitle('Select cards, right-click them, then "Create template"').setIsLabel(true));
    } else {
      for (const file of files) {
        menu.addItem(i => i.setTitle(file.basename).setIcon('layout-template')
          .onClick(() => void this.insertGroupTemplate(file, cx, cy)));
      }
    }
    // Deferred a tick: Obsidian's Menu hides the clicked menu only after
    // the item's callback returns, and that teardown would otherwise close
    // this one right along with it.
    window.setTimeout(() => menu.showAtMouseEvent(e), 0);
  },

  async insertGroupTemplate(this: FreeformRenderer, file: TFile, cx: number, cy: number): Promise<void> {
    const bundle = await readGroupTemplate(this.app, file);
    if (!bundle) { new Notice(`Template "${file.basename}" is empty or unreadable.`); return; }
    this.pasteBundleAt(bundle, cx, cy);
  },
};

async function writeTemplate(
  renderer: FreeformRenderer, bundle: CardBundle, name: string, replace: boolean,
): Promise<void> {
  try {
    const saved = await saveGroupTemplate(renderer.app, bundle, name, replace);
    new Notice(`Saved template "${saved.basename}".`);
  } catch (err) {
    console.error('Visual Notes: failed to save group template', err);
    new Notice(`Couldn't save template "${name}" — ${err instanceof Error ? err.message : String(err)}.`);
  }
}

function describeBundle(bundle: CardBundle): string {
  const parts: string[] = [];
  if (bundle.cards.length) parts.push(`${bundle.cards.length} card${bundle.cards.length === 1 ? '' : 's'}`);
  const sketches = new Set(bundle.drawings.map(s => s.groupId)).size;
  if (sketches) parts.push(`${sketches} sketch${sketches === 1 ? '' : 'es'}`);
  return parts.join(' and ');
}
