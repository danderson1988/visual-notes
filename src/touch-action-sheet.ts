// Phone replacement for Obsidian's desktop-style context Menu.
//
// On iPhone, right-click menus are reached via a manual long-press that
// dispatches a synthetic `contextmenu` MouseEvent into the same handlers a
// desktop right-click uses (see bindCanvasEvents in freeform-view-canvas).
// Feeding that synthetic touch-origin event into Obsidian's `Menu` +
// `showAtMouseEvent` proved unreliable on the phone app (reported: no
// menus at all on iPhone) — so on phones every `newMenu()` returns this
// instead: a plain bottom action sheet drawn with our own DOM, no
// dependency on Menu's positioning at all.
//
// It deliberately implements only the Menu surface this codebase actually
// calls — addItem/addSeparator/showAtMouseEvent(+showAtPosition), and per-
// item setTitle/setIcon/setChecked/setIsLabel/onClick — so every existing
// menu-building call site (populateCardMenu, the canvas/connection/
// drawing/table/kanban/checklist menus, grid-view tiles) works against it
// unchanged via a cast. Anything new Menu API a future call site adopts
// must be mirrored here.

import { setIcon } from 'obsidian';

interface SheetEntry {
  kind: 'item' | 'separator';
  title: string;
  icon: string | null;
  checked: boolean;
  isLabel: boolean;
  onClick: ((evt: MouseEvent | KeyboardEvent) => unknown) | null;
}

class TouchSheetItem {
  entry: SheetEntry = { kind: 'item', title: '', icon: null, checked: false, isLabel: false, onClick: null };
  setTitle(t: string): this { this.entry.title = t; return this; }
  setIcon(i: string | null): this { this.entry.icon = i; return this; }
  setChecked(v: boolean | null): this { this.entry.checked = !!v; return this; }
  setIsLabel(v: boolean): this { this.entry.isLabel = v; return this; }
  setDisabled(_v: boolean): this { return this; }
  setWarning(_v: boolean): this { return this; }
  setSection(_s: string): this { return this; }
  onClick(fn: (evt: MouseEvent | KeyboardEvent) => unknown): this { this.entry.onClick = fn; return this; }
}

export class TouchActionSheet {
  private entries: SheetEntry[] = [];
  private backdrop: HTMLElement | null = null;

  addItem(cb: (item: TouchSheetItem) => unknown): this {
    const item = new TouchSheetItem();
    cb(item);
    this.entries.push(item.entry);
    return this;
  }

  addSeparator(): this {
    this.entries.push({ kind: 'separator', title: '', icon: null, checked: false, isLabel: false, onClick: null });
    return this;
  }

  // The event/position is ignored on purpose — a bottom sheet has one
  // place to be. Matching Menu's method names keeps call sites unchanged.
  showAtMouseEvent(_e: MouseEvent): this { this.open(); return this; }
  showAtPosition(_pos: { x: number; y: number }): this { this.open(); return this; }

  hide(): this {
    this.backdrop?.remove();
    this.backdrop = null;
    return this;
  }

  private open(): void {
    if (this.backdrop) return;
    const backdrop = this.backdrop = activeDocument.body.createDiv('visual-notes-touch-sheet-backdrop');
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.hide();
    });

    const sheet = backdrop.createDiv('visual-notes-touch-sheet');
    sheet.createDiv('visual-notes-touch-sheet-grabber');

    for (const entry of this.entries) {
      if (entry.kind === 'separator') {
        sheet.createDiv('visual-notes-touch-sheet-sep');
        continue;
      }
      if (entry.isLabel) {
        sheet.createDiv({ cls: 'visual-notes-touch-sheet-label', text: entry.title });
        continue;
      }
      const row = sheet.createDiv('visual-notes-touch-sheet-row');
      const iconEl = row.createDiv('visual-notes-touch-sheet-row-icon');
      if (entry.icon) setIcon(iconEl, entry.icon);
      row.createSpan({ cls: 'visual-notes-touch-sheet-row-title', text: entry.title });
      if (entry.checked) {
        const check = row.createDiv('visual-notes-touch-sheet-row-check');
        setIcon(check, 'check');
      }
      row.addEventListener('click', (e) => {
        // Close BEFORE running the action: Obsidian's own Menu hides only
        // after the callback returns, which left menus stuck open when a
        // callback threw (bug #5). Closing first makes a throwing action
        // annoying but never sheet-jamming.
        this.hide();
        entry.onClick?.(e);
      });
    }
  }
}
