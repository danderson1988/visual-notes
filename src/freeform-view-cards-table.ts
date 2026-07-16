import {
  Notice, setIcon,
} from 'obsidian';
import {
  TableCard, TableColumn, TableRow, TableColumnType, TableViewMode,
} from './file-types';
import {
  tableDatedItems, renderCalendarGrid,
  addDaysISO, todayISO, monthTitle, shortDate,
} from './dated-items';
import { contrastColor } from './color-utils';
import { NamePromptModal } from './tile-modal';
import {
  TABLE_DEFAULT_W, TABLE_DEFAULT_H,
  DRAG_THRESHOLD,
  KanbanItemColorModal,
} from './freeform-view-shared';
import type { FreeformRenderer } from './freeform-view';

declare module './freeform-view' {
  interface FreeformRenderer {
    renderTableContent(el: HTMLElement, card: TableCard): void;
    appendTableHeaderCell(
        headerRow: HTMLElement, cardEl: HTMLElement, card: TableCard, col: TableColumn, colIndex: number,
      ): void;
    clearTableCellSel(): void;
    applyTableCellSelClasses(): void;
    showTableCellMenu(
        e: MouseEvent, cardEl: HTMLElement, card: TableCard, layer: HTMLElement, r: number, c: number,
      ): void;
    sortTableByColumn(cardEl: HTMLElement, card: TableCard, col: TableColumn): void;
    insertTableColumn(cardEl: HTMLElement, card: TableCard, atIndex: number): void;
    duplicateTableColumn(cardEl: HTMLElement, card: TableCard, col: TableColumn): void;
    insertTableRow(cardEl: HTMLElement, card: TableCard, atIndex: number): void;
    duplicateTableRow(cardEl: HTMLElement, card: TableCard, row: TableRow): void;
    parseClipboardGrid(text: string): string[][];
    handleTablePaste(e: ClipboardEvent, cardEl: HTMLElement, card: TableCard, rowIndex: number, colIndex: number): void;
    appendTableDataRow(
        layer: HTMLElement, cardEl: HTMLElement, card: TableCard, row: TableRow, rowIndex: number,
      ): void;
    showTableSelectMenu(e: MouseEvent, cardEl: HTMLElement, card: TableCard, col: TableColumn, row: TableRow): void;
    bindTableGridDelegation(layer: HTMLElement, cardEl: HTMLElement, card: TableCard): void;
    focusTableCell(layer: HTMLElement, rowIndex: number, colIndex: number): void;
    addTable(): void;
    appendTableViewSwitcher(parent: HTMLElement, el: HTMLElement, card: TableCard): void;
    renderTableAltViewContent(el: HTMLElement, card: TableCard): void;
    appendAltCellValue(parent: HTMLElement, el: HTMLElement, card: TableCard, col: TableColumn, row: TableRow): void;
    tableAltColumns(card: TableCard): { labelCol?: TableColumn; cbCol?: TableColumn };
    renderTableListView(body: HTMLElement, el: HTMLElement, card: TableCard): void;
    renderTableGalleryView(body: HTMLElement, el: HTMLElement, card: TableCard): void;
    renderTableBoardView(body: HTMLElement, el: HTMLElement, card: TableCard): void;
    bindTableBoardRowDrag(
        rowCard: HTMLElement, lanesWrap: HTMLElement, el: HTMLElement,
        card: TableCard, selCol: TableColumn, row: TableRow,
      ): void;
    renderTableCalendarView(body: HTMLElement, el: HTMLElement, card: TableCard): void;
    addTableAt(x: number, y: number): void;
  }
}

export const cardsTableMethods = {
  renderTableContent(this: FreeformRenderer, el: HTMLElement, card: TableCard): void {
    el.addClass('visual-notes-freeform-table-card');
    el.style.backgroundColor = card.color;
    // Re-rendering rebuilds the grid DOM, so any live cell selection on
    // this card now points at dead elements — drop it.
    if (this.tableCellSel?.cardId === card.id) this.tableCellSel = null;

    // Database views: same rows, different lens (list/gallery/board/
    // calendar). Everything below is the classic editable grid.
    if ((card.view ?? 'table') !== 'table') {
      this.renderTableAltViewContent(el, card);
      return;
    }

    if (!card.titleHidden) {
      const titleEl = el.createEl('input', { cls: 'visual-notes-table-title' });
      titleEl.type = 'text'; titleEl.value = card.title || ''; titleEl.placeholder = 'Table';
      titleEl.addEventListener('pointerdown', e => e.stopPropagation());
      titleEl.addEventListener('input', () => { card.title = titleEl.value; });
      titleEl.addEventListener('blur', () => this.scheduleSave());
    }

    const gridWrap = el.createDiv('visual-notes-table-grid');
    // The zoom lives on an inner layer, not the scroll container, and the
    // layer is pinned to the container's client width in real pixels.
    // Zooming the scroll container directly hands the flex rows a wider
    // effective layout width (clientWidth / zoom), so flex:1 cells stretch
    // to fill it instead of scaling — with a fixed-width layer the rows
    // compute the identical 100% layout at every zoom level and CSS zoom
    // (not transform:scale, so scrollbars/hit-testing follow) scales it
    // uniformly.
    const zoomLayer = gridWrap.createDiv('visual-notes-table-zoom-layer');
    if (card.zoom && card.zoom !== 1) zoomLayer.style.setProperty('zoom', String(card.zoom));
    this.tableGridResizeObs.get(card.id)?.disconnect();
    const ro = new ResizeObserver(() => { zoomLayer.style.width = `${gridWrap.clientWidth}px`; });
    ro.observe(gridWrap);
    this.tableGridResizeObs.set(card.id, ro);
    this.bindTableGridDelegation(zoomLayer, el, card);

    const headerRow = zoomLayer.createDiv('visual-notes-table-row visual-notes-table-header-row');
    headerRow.createDiv('visual-notes-table-gutter-cell');
    card.columns.forEach((col, ci) => this.appendTableHeaderCell(headerRow, el, card, col, ci));

    card.rows.forEach((row, ri) => this.appendTableDataRow(zoomLayer, el, card, row, ri + 1));

    const footer = el.createDiv('visual-notes-table-footer');
    const addRowBtn = footer.createDiv('visual-notes-table-add-btn');
    setIcon(addRowBtn.createSpan(), 'plus'); addRowBtn.createSpan({ text: 'Row' });
    addRowBtn.setAttribute('tabindex', '0');
    addRowBtn.addEventListener('pointerdown', e => e.stopPropagation());
    addRowBtn.addEventListener('click', () => {
      this.pushUndo();
      card.rows.push({ id: crypto.randomUUID(), cells: {} });
      this.renderCardContent(el, card);
      this.scheduleSave();
    });
    const addColBtn = footer.createDiv('visual-notes-table-add-btn');
    setIcon(addColBtn.createSpan(), 'plus'); addColBtn.createSpan({ text: 'Column' });
    addColBtn.setAttribute('tabindex', '0');
    addColBtn.addEventListener('pointerdown', e => e.stopPropagation());
    addColBtn.addEventListener('click', () => {
      this.pushUndo();
      card.columns.push({ id: crypto.randomUUID(), label: `Column ${card.columns.length + 1}` });
      this.renderCardContent(el, card);
      this.scheduleSave();
    });

    // ── Paste — replace the whole table with the clipboard grid, first
    // clipboard row becoming the column headers. Unlike pasting into a
    // cell, this can't misalign: it doesn't matter where you clicked last.
    const pasteBtn = footer.createDiv('visual-notes-table-add-btn');
    setIcon(pasteBtn.createSpan(), 'clipboard-paste'); pasteBtn.createSpan({ text: 'Paste' });
    pasteBtn.setAttribute('aria-label', 'Replace table with clipboard contents (first row becomes headers)');
    pasteBtn.setAttribute('tabindex', '0');
    pasteBtn.addEventListener('pointerdown', e => e.stopPropagation());
    pasteBtn.addEventListener('click', () => { void (async () => {
      let text = '';
      try { text = await navigator.clipboard.readText(); } catch { /* no clipboard access */ }
      if (!text.trim()) { new Notice('Clipboard has no text.'); return; }
      const grid = this.parseClipboardGrid(text);
      this.pushUndo();
      card.columns = grid[0].map((label, i) => ({ id: crypto.randomUUID(), label: label.trim() || `Column ${i + 1}` }));
      card.rows = grid.slice(1).map(cells => {
        const row: TableRow = { id: crypto.randomUUID(), cells: {} };
        cells.forEach((v, i) => { row.cells[card.columns[i].id] = v; });
        return row;
      });
      if (card.rows.length === 0) card.rows.push({ id: crypto.randomUUID(), cells: {} });
      this.tableSort.delete(card.id);
      this.renderCardContent(el, card);
      this.scheduleSave();
      new Notice(`Imported ${card.rows.length} row${card.rows.length === 1 ? '' : 's'} × ${card.columns.length} column${card.columns.length === 1 ? '' : 's'}.`);
    })(); });

    this.appendTableViewSwitcher(footer, el, card);

    // ── Zoom slider (bottom right) — scales the grid content without
    // changing the card's size. Live-applied on drag; saved on release.
    const zoomWrap = footer.createDiv('visual-notes-table-zoom');
    setIcon(zoomWrap.createSpan({ cls: 'visual-notes-table-zoom-icon' }), 'zoom-out');
    const zoomSlider = zoomWrap.createEl('input', { type: 'range', cls: 'visual-notes-table-zoom-slider' });
    zoomSlider.min = '0.4'; zoomSlider.max = '1.5'; zoomSlider.step = '0.05';
    zoomSlider.value = String(card.zoom ?? 1);
    const zoomLabel = zoomWrap.createSpan({
      cls: 'visual-notes-table-zoom-label',
      text: `${Math.round((card.zoom ?? 1) * 100)}%`,
    });
    zoomSlider.addEventListener('pointerdown', e => e.stopPropagation());
    zoomSlider.addEventListener('input', () => {
      const z = Number(zoomSlider.value);
      card.zoom = z === 1 ? undefined : z;
      zoomLayer.style.setProperty('zoom', String(z));
      zoomLabel.setText(`${Math.round(z * 100)}%`);
    });
    zoomSlider.addEventListener('change', () => this.scheduleSave());
    zoomLabel.setAttribute('title', 'Double-click to reset');
    zoomLabel.addEventListener('dblclick', () => {
      card.zoom = undefined;
      zoomSlider.value = '1';
      zoomLayer.setCssStyles({ zoom: '1' });
      zoomLabel.setText('100%');
      this.scheduleSave();
    });

    this.appendResizeHandles(el);
  },

  appendTableHeaderCell(this: FreeformRenderer, 
    headerRow: HTMLElement, cardEl: HTMLElement, card: TableCard, col: TableColumn, colIndex: number,
  ): void {
    const cell = headerRow.createDiv('visual-notes-table-cell visual-notes-table-header-cell');
    if (col.color) cell.style.backgroundColor = col.color;
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const menu = this.newMenu();
      const align = col.align ?? 'left';
      const setAlign = (a: 'left' | 'center' | 'right') => {
        this.pushUndo(); col.align = a === 'left' ? undefined : a;
        this.renderCardContent(cardEl, card);
        this.scheduleSave();
      };
      menu.addItem(i => i.setTitle('Align left').setIcon('align-left').setChecked(align === 'left').onClick(() => setAlign('left')));
      menu.addItem(i => i.setTitle('Align center').setIcon('align-center').setChecked(align === 'center').onClick(() => setAlign('center')));
      menu.addItem(i => i.setTitle('Align right').setIcon('align-right').setChecked(align === 'right').onClick(() => setAlign('right')));
      menu.addSeparator();
      menu.addItem(i => i.setTitle('Column type').setIcon('type').setIsLabel(true));
      const COLUMN_TYPES: { t: TableColumnType; label: string }[] = [
        { t: 'text',     label: 'Text' },
        { t: 'number',   label: 'Number' },
        { t: 'checkbox', label: 'Checkbox' },
        { t: 'date',     label: 'Date' },
        { t: 'select',   label: 'Select' },
      ];
      const curType = col.type ?? 'text';
      for (const { t, label } of COLUMN_TYPES) {
        menu.addItem(i => i.setTitle(label).setChecked(curType === t).onClick(() => {
          this.pushUndo();
          col.type = t === 'text' ? undefined : t;
          this.renderCardContent(cardEl, card);
          this.scheduleSave();
        }));
      }
      menu.addSeparator();
      menu.addItem(i => i.setTitle('Insert column left').setIcon('arrow-left-to-line').onClick(() => {
        this.insertTableColumn(cardEl, card, colIndex);
      }));
      menu.addItem(i => i.setTitle('Insert column right').setIcon('arrow-right-to-line').onClick(() => {
        this.insertTableColumn(cardEl, card, colIndex + 1);
      }));
      menu.addItem(i => i.setTitle('Duplicate column').setIcon('copy').onClick(() => {
        this.duplicateTableColumn(cardEl, card, col);
      }));
      menu.addSeparator();
      menu.addItem(i => i.setTitle(col.color ? 'Change column color…' : 'Set column color…').setIcon('palette').onClick(() => {
        new KanbanItemColorModal(this.app, col.color, (hex) => {
          this.pushUndo(); col.color = hex;
          this.renderCardContent(cardEl, card);
          this.scheduleSave();
        }).open();
      }));
      if (col.color) {
        menu.addItem(i => i.setTitle('Reset column color').setIcon('x').onClick(() => {
          this.pushUndo(); col.color = undefined;
          this.renderCardContent(cardEl, card);
          this.scheduleSave();
        }));
      }
      menu.showAtMouseEvent(e);
    });

    const sort = this.tableSort.get(card.id);
    const sortBtn = cell.createDiv('visual-notes-table-sort-btn');
    setIcon(sortBtn, sort?.colId === col.id ? (sort.dir === 'asc' ? 'chevron-up' : 'chevron-down') : 'chevrons-up-down');
    sortBtn.toggleClass('is-active', sort?.colId === col.id);
    sortBtn.setAttribute('aria-label', 'Sort by this column');
    sortBtn.setAttribute('tabindex', '0');
    sortBtn.addEventListener('pointerdown', e => e.stopPropagation());
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sortTableByColumn(cardEl, card, col);
    });

    const labelEl = cell.createDiv('visual-notes-table-header-label');
    labelEl.dataset.placeholder = 'Column';
    labelEl.dataset.row = '0';
    labelEl.dataset.col = String(colIndex);
    labelEl.style.textAlign = col.align ?? 'left';
    labelEl.setText(col.label);

    if (card.columns.length > 1) {
      const delBtn = cell.createDiv('visual-notes-table-col-delete');
      setIcon(delBtn, 'x');
      delBtn.setAttribute('aria-label', 'Delete column');
      delBtn.setAttribute('tabindex', '0');
      delBtn.addEventListener('pointerdown', e => e.stopPropagation());
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pushUndo();
        card.columns = card.columns.filter(c => c.id !== col.id);
        this.renderCardContent(cardEl, card);
        this.scheduleSave();
      });
    }
  },

  clearTableCellSel(this: FreeformRenderer): void {
    if (!this.tableCellSel) return;
    this.tableCellSel.layer.querySelectorAll<HTMLElement>('.is-cell-selected')
      .forEach(el => el.removeClass('is-cell-selected'));
    this.tableCellSel = null;
  },

  applyTableCellSelClasses(this: FreeformRenderer): void {
    const s = this.tableCellSel; if (!s) return;
    const r1 = Math.min(s.a.r, s.b.r), r2 = Math.max(s.a.r, s.b.r);
    const c1 = Math.min(s.a.c, s.b.c), c2 = Math.max(s.a.c, s.b.c);
    s.layer.querySelectorAll<HTMLElement>('.visual-notes-table-cell:not(.visual-notes-table-header-cell)')
      .forEach(cell => {
        const r = Number(cell.dataset.row), c = Number(cell.dataset.col);
        cell.toggleClass('is-cell-selected', r >= r1 && r <= r2 && c >= c1 && c <= c2);
      });
  },

  showTableCellMenu(this: FreeformRenderer, 
    e: MouseEvent, cardEl: HTMLElement, card: TableCard, layer: HTMLElement, r: number, c: number,
  ): void {
    // Right-clicking outside the current selection collapses it to the
    // clicked cell first (Sheets behavior).
    let s = this.tableCellSel;
    const inSel = s && s.cardId === card.id
      && r >= Math.min(s.a.r, s.b.r) && r <= Math.max(s.a.r, s.b.r)
      && c >= Math.min(s.a.c, s.b.c) && c <= Math.max(s.a.c, s.b.c);
    if (!inSel) {
      this.clearTableCellSel();
      this.tableCellSel = s = { cardId: card.id, layer, a: { r, c }, b: { r, c } };
      this.applyTableCellSelClasses();
    }
    const r1 = Math.min(s!.a.r, s!.b.r), r2 = Math.max(s!.a.r, s!.b.r);
    const c1 = Math.min(s!.a.c, s!.b.c), c2 = Math.max(s!.a.c, s!.b.c);
    const count = (r2 - r1 + 1) * (c2 - c1 + 1);

    const forEachSelected = (fn: (row: TableRow, colId: string) => void) => {
      for (let rr = r1; rr <= r2; rr++) {
        const rowObj = card.rows[rr - 1]; if (!rowObj) continue;
        for (let cc = c1; cc <= c2; cc++) {
          const colObj = card.columns[cc]; if (colObj) fn(rowObj, colObj.id);
        }
      }
    };

    const menu = this.newMenu();
    menu.addItem(i => i
      .setTitle(count > 1 ? `Set color for ${count} cells…` : 'Set cell color…')
      .setIcon('palette')
      .onClick(() => {
        const current = card.rows[r - 1]?.cellColors?.[card.columns[c]?.id];
        new KanbanItemColorModal(this.app, current, (hex) => {
          this.pushUndo();
          forEachSelected((row, colId) => {
            if (hex) { (row.cellColors ??= {})[colId] = hex; }
            else if (row.cellColors) delete row.cellColors[colId];
          });
          this.renderCardContent(cardEl, card);
          this.scheduleSave();
        }).open();
      }));

    let anyColored = false;
    forEachSelected((row, colId) => { if (row.cellColors?.[colId]) anyColored = true; });
    if (anyColored) {
      menu.addItem(i => i.setTitle('Clear cell color').setIcon('x').onClick(() => {
        this.pushUndo();
        forEachSelected((row, colId) => { if (row.cellColors) delete row.cellColors[colId]; });
        this.renderCardContent(cardEl, card);
        this.scheduleSave();
      }));
    }

    // Row operations for the clicked row — the row-level contextmenu still
    // exists but only reachable from the gutter now that cells capture the
    // right-click.
    menu.addSeparator();
    const rowArrayIndex = r - 1;
    menu.addItem(i => i.setTitle('Insert row above').setIcon('arrow-up-to-line')
      .onClick(() => this.insertTableRow(cardEl, card, rowArrayIndex)));
    menu.addItem(i => i.setTitle('Insert row below').setIcon('arrow-down-to-line')
      .onClick(() => this.insertTableRow(cardEl, card, rowArrayIndex + 1)));
    const rowObj = card.rows[rowArrayIndex];
    if (rowObj) {
      menu.addItem(i => i.setTitle('Duplicate row').setIcon('copy')
        .onClick(() => this.duplicateTableRow(cardEl, card, rowObj)));
    }
    menu.showAtMouseEvent(e);
  },

  sortTableByColumn(this: FreeformRenderer, cardEl: HTMLElement, card: TableCard, col: TableColumn): void {
    const current = this.tableSort.get(card.id);
    const dir: 'asc' | 'desc' = current?.colId === col.id && current.dir === 'asc' ? 'desc' : 'asc';
    this.pushUndo();
    const mul = dir === 'asc' ? 1 : -1;
    const values = card.rows.map(r => r.cells[col.id] ?? '');
    const allNumeric = values.every(v => v.trim() === '' || !Number.isNaN(Number(v.trim())));
    card.rows.sort((a, b) => {
      const av = a.cells[col.id] ?? '', bv = b.cells[col.id] ?? '';
      if (allNumeric) return (Number(av.trim() || 0) - Number(bv.trim() || 0)) * mul;
      return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * mul;
    });
    this.tableSort.set(card.id, { colId: col.id, dir });
    this.renderCardContent(cardEl, card);
    this.scheduleSave();
  },

  insertTableColumn(this: FreeformRenderer, cardEl: HTMLElement, card: TableCard, atIndex: number): void {
    this.pushUndo();
    card.columns.splice(atIndex, 0, { id: crypto.randomUUID(), label: `Column ${card.columns.length + 1}` });
    this.renderCardContent(cardEl, card);
    this.scheduleSave();
  },

  duplicateTableColumn(this: FreeformRenderer, cardEl: HTMLElement, card: TableCard, col: TableColumn): void {
    this.pushUndo();
    const idx = card.columns.findIndex(c => c.id === col.id);
    const newCol: TableColumn = { ...col, id: crypto.randomUUID(), label: `${col.label} copy` };
    card.columns.splice(idx + 1, 0, newCol);
    for (const row of card.rows) {
      row.cells[newCol.id] = row.cells[col.id] ?? '';
      const cc = row.cellColors?.[col.id];
      if (cc) (row.cellColors ??= {})[newCol.id] = cc;
    }
    this.renderCardContent(cardEl, card);
    this.scheduleSave();
  },

  insertTableRow(this: FreeformRenderer, cardEl: HTMLElement, card: TableCard, atIndex: number): void {
    this.pushUndo();
    card.rows.splice(atIndex, 0, { id: crypto.randomUUID(), cells: {} });
    this.renderCardContent(cardEl, card);
    this.scheduleSave();
  },

  duplicateTableRow(this: FreeformRenderer, cardEl: HTMLElement, card: TableCard, row: TableRow): void {
    this.pushUndo();
    const idx = card.rows.findIndex(r => r.id === row.id);
    const newRow: TableRow = {
      ...row, id: crypto.randomUUID(), cells: { ...row.cells },
      cellColors: row.cellColors ? { ...row.cellColors } : undefined,
    };
    card.rows.splice(idx + 1, 0, newRow);
    this.renderCardContent(cardEl, card);
    this.scheduleSave();
  },

  parseClipboardGrid(this: FreeformRenderer, text: string): string[][] {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    let grid = lines.map(line => line.split('\t'));
    const lastCol = Math.max(1, ...grid.map(r => {
      let i = r.length;
      while (i > 0 && r[i - 1].trim() === '') i--;
      return i;
    }));
    grid = grid.map(r => r.slice(0, lastCol));
    while (grid.length > 1 && grid[grid.length - 1].every(v => v.trim() === '')) grid.pop();
    return grid;
  },

  handleTablePaste(this: FreeformRenderer, e: ClipboardEvent, cardEl: HTMLElement, card: TableCard, rowIndex: number, colIndex: number): void {
    // Stop this from bubbling to the canvas-level paste handler *before*
    // touching the DOM — re-rendering the table below removes the focused
    // cell from the document, which resets document.activeElement, so the
    // canvas handler's "am I inside a contenteditable?" guard would
    // otherwise fail and paste the same clipboard text again as a new
    // sticky note.
    e.preventDefault();
    e.stopPropagation();

    const grid = this.parseClipboardGrid(e.clipboardData?.getData('text/plain') ?? '');

    if (grid.length === 1 && grid[0].length === 1) {
      activeDocument.execCommand('insertText', false, grid[0][0]);
      return;
    }

    this.pushUndo();
    grid.forEach((cells, r) => {
      const targetRow = rowIndex + r;
      cells.forEach((value, c) => {
        const targetCol = colIndex + c;
        while (card.columns.length <= targetCol) {
          card.columns.push({ id: crypto.randomUUID(), label: `Column ${card.columns.length + 1}` });
        }
        const colId = card.columns[targetCol].id;
        if (targetRow === 0) {
          card.columns[targetCol].label = value;
        } else {
          while (card.rows.length < targetRow) card.rows.push({ id: crypto.randomUUID(), cells: {} });
          card.rows[targetRow - 1].cells[colId] = value;
        }
      });
    });

    this.renderCardContent(cardEl, card);
    this.scheduleSave();
  },

  appendTableDataRow(this: FreeformRenderer, 
    layer: HTMLElement, cardEl: HTMLElement, card: TableCard, row: TableRow, rowIndex: number,
  ): void {
    const rowEl = layer.createDiv('visual-notes-table-row');
    if (row.color) rowEl.style.backgroundColor = row.color;
    rowEl.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const menu = this.newMenu();
      const rowArrayIndex = card.rows.indexOf(row);
      menu.addItem(i => i.setTitle('Insert row above').setIcon('arrow-up-to-line').onClick(() => {
        this.insertTableRow(cardEl, card, rowArrayIndex);
      }));
      menu.addItem(i => i.setTitle('Insert row below').setIcon('arrow-down-to-line').onClick(() => {
        this.insertTableRow(cardEl, card, rowArrayIndex + 1);
      }));
      menu.addItem(i => i.setTitle('Duplicate row').setIcon('copy').onClick(() => {
        this.duplicateTableRow(cardEl, card, row);
      }));
      menu.addSeparator();
      menu.addItem(i => i.setTitle(row.color ? 'Change row color…' : 'Set row color…').setIcon('palette').onClick(() => {
        new KanbanItemColorModal(this.app, row.color, (hex) => {
          this.pushUndo(); row.color = hex;
          rowEl.style.backgroundColor = hex ?? '';
          this.scheduleSave();
        }).open();
      }));
      if (row.color) {
        menu.addItem(i => i.setTitle('Reset row color').setIcon('x').onClick(() => {
          this.pushUndo(); row.color = undefined;
          rowEl.setCssStyles({ backgroundColor: '' });
          this.scheduleSave();
        }));
      }
      menu.showAtMouseEvent(e);
    });
    const gutter = rowEl.createDiv('visual-notes-table-gutter-cell');
    if (card.rows.length > 1) {
      const delBtn = gutter.createDiv('visual-notes-table-row-delete');
      setIcon(delBtn, 'x');
      delBtn.setAttribute('aria-label', 'Delete row');
      delBtn.setAttribute('tabindex', '0');
      delBtn.addEventListener('pointerdown', e => e.stopPropagation());
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pushUndo();
        card.rows = card.rows.filter(r => r.id !== row.id);
        this.renderCardContent(cardEl, card);
        this.scheduleSave();
      });
    }
    card.columns.forEach((col, ci) => {
      const cell = rowEl.createDiv('visual-notes-table-cell');
      cell.dataset.row = String(rowIndex);
      cell.dataset.col = String(ci);
      const cellColor = row.cellColors?.[col.id];
      if (cellColor) cell.style.backgroundColor = cellColor;
      else if (col.color) cell.style.backgroundColor = col.color;

      // Typed columns render dedicated controls instead of the editable
      // text div — they deliberately don't carry the -cell-text class, so
      // the grid's text-editing delegation never touches them.
      const type = col.type ?? 'text';
      if (type === 'checkbox') {
        cell.addClass('visual-notes-table-cell--center');
        const cb = cell.createDiv('visual-notes-table-checkbox');
        cb.toggleClass('is-checked', row.cells[col.id] === 'true');
        cb.addEventListener('pointerdown', e => e.stopPropagation());
        cb.addEventListener('click', (e) => {
          e.stopPropagation();
          const on = row.cells[col.id] === 'true';
          row.cells[col.id] = on ? '' : 'true';
          cb.toggleClass('is-checked', !on);
          this.scheduleSave();
        });
        return;
      }
      if (type === 'date') {
        const input = cell.createEl('input', { cls: 'visual-notes-table-date-input' });
        input.type = 'date';
        input.value = row.cells[col.id] ?? '';
        input.addEventListener('pointerdown', e => e.stopPropagation());
        input.addEventListener('change', () => { row.cells[col.id] = input.value; this.scheduleSave(); });
        return;
      }
      if (type === 'select') {
        const value = row.cells[col.id] ?? '';
        const pill = cell.createDiv('visual-notes-table-select-pill');
        if (value) {
          const opt = col.options?.find(o => o.label === value);
          pill.setText(value);
          pill.style.backgroundColor = opt?.color ?? '#6b7280';
          pill.style.color = contrastColor(opt?.color ?? '#6b7280');
        } else {
          pill.setText('—');
          pill.addClass('is-empty');
        }
        pill.addEventListener('pointerdown', e => e.stopPropagation());
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showTableSelectMenu(e, cardEl, card, col, row);
        });
        return;
      }

      const textEl = cell.createDiv('visual-notes-table-cell-text');
      textEl.dataset.row = String(rowIndex);
      textEl.dataset.col = String(ci);
      textEl.style.textAlign = col.align ?? (type === 'number' ? 'right' : 'left');
      textEl.setText(row.cells[col.id] ?? '');
    });
  },

  showTableSelectMenu(this: FreeformRenderer, e: MouseEvent, cardEl: HTMLElement, card: TableCard, col: TableColumn, row: TableRow): void {
    const rerender = () => {
      this.renderCardContent(cardEl, card);
      this.scheduleSave();
    };
    const menu = this.newMenu();
    for (const opt of col.options ?? []) {
      menu.addItem(i => i.setTitle(opt.label).setChecked(row.cells[col.id] === opt.label).onClick(() => {
        this.pushUndo();
        row.cells[col.id] = opt.label;
        rerender();
      }));
    }
    if (col.options?.length) menu.addSeparator();
    menu.addItem(i => i.setTitle('Add option…').setIcon('plus').onClick(() => {
      new NamePromptModal(this.app, 'New option', 'e.g. "In progress"', (name) => {
        const label = name.trim(); if (!label) return;
        this.pushUndo();
        const palette = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899', '#6b7280'];
        const opts = (col.options ??= []);
        if (!opts.some(o => o.label === label)) opts.push({ label, color: palette[opts.length % palette.length] });
        row.cells[col.id] = label;
        rerender();
      }).open();
    }));
    if (row.cells[col.id]) {
      menu.addItem(i => i.setTitle('Clear').setIcon('x').onClick(() => {
        this.pushUndo();
        row.cells[col.id] = '';
        rerender();
      }));
    }
    menu.showAtMouseEvent(e);
  },

  bindTableGridDelegation(this: FreeformRenderer, layer: HTMLElement, cardEl: HTMLElement, card: TableCard): void {
    const isCell = (t: EventTarget | null): t is HTMLElement =>
      t instanceof HTMLElement && t.matches('.visual-notes-table-header-label, .visual-notes-table-cell-text');

    // Cells render as plain static divs; only the cell being edited is
    // promoted to contenteditable, and it's demoted again on blur. Keeping
    // hundreds of always-live contenteditable hosts (a big pasted table)
    // makes the whole window sluggish — Chromium pays for every editing
    // host in hit-testing and text-input bookkeeping even when idle.
    //
    // Interaction model matches Google Sheets: single click selects a
    // cell, click-drag selects a rectangle, double-click enters edit mode.
    const dataCellAt = (t: EventTarget | null): HTMLElement | null => {
      if (!(t instanceof HTMLElement)) return null;
      const cell = t.closest<HTMLElement>('.visual-notes-table-cell');
      return cell && layer.contains(cell) && !cell.classList.contains('visual-notes-table-header-cell') ? cell : null;
    };

    layer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // right-click is handled by contextmenu below
      const t = e.target instanceof HTMLElement ? e.target : null;
      const anyCell = t?.closest<HTMLElement>('.visual-notes-table-cell');
      if (!anyCell || !layer.contains(anyCell)) return;
      e.stopPropagation(); // don't start a card drag from inside the grid
      if (isCell(t) && t.isContentEditable) return; // editing: native caret/text selection

      const cell = dataCellAt(t);
      if (!cell) { this.clearTableCellSel(); return; } // header cell: sort/menu have their own handlers

      const r = Number(cell.dataset.row), c = Number(cell.dataset.col);
      this.clearTableCellSel();
      this.tableCellSel = { cardId: card.id, layer, a: { r, c }, b: { r, c } };
      this.applyTableCellSelClasses();

      const onMove = (me: PointerEvent) => {
        const over = dataCellAt(activeDocument.elementFromPoint(me.clientX, me.clientY));
        const s = this.tableCellSel;
        if (!over || !s || s.layer !== layer) return;
        const nr = Number(over.dataset.row), nc = Number(over.dataset.col);
        if (s.b.r === nr && s.b.c === nc) return;
        s.b = { r: nr, c: nc };
        this.applyTableCellSelClasses();
      };
      const onUp = () => {
        activeDocument.removeEventListener('pointermove', onMove);
        activeDocument.removeEventListener('pointerup', onUp);
      };
      activeDocument.addEventListener('pointermove', onMove);
      activeDocument.addEventListener('pointerup', onUp);
    });

    layer.addEventListener('dblclick', (e) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      const cell = t?.closest<HTMLElement>('.visual-notes-table-cell');
      if (!cell || !layer.contains(cell)) return;
      const editEl = isCell(t) ? t
        : cell.querySelector<HTMLElement>('.visual-notes-table-header-label, .visual-notes-table-cell-text');
      if (!editEl) return;
      e.stopPropagation();
      this.clearTableCellSel();
      if (!editEl.isContentEditable) { editEl.contentEditable = 'true'; editEl.spellcheck = false; }
      editEl.focus();
      const rng = activeDocument.createRange();
      rng.selectNodeContents(editEl);
      rng.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(rng);
    });

    // Right-click on a data cell: color the clicked cell — or the whole
    // selected range if the click lands inside one. Bound in the capture
    // phase so it wins over the row-level contextmenu handler (which still
    // serves the gutter). Header cells keep their own menu.
    layer.addEventListener('contextmenu', (e) => {
      const cell = dataCellAt(e.target);
      if (!cell) return;
      e.preventDefault(); e.stopPropagation();
      this.showTableCellMenu(e, cardEl, card, layer, Number(cell.dataset.row), Number(cell.dataset.col));
    }, { capture: true });

    // Clicking anywhere outside the grid clears the cell selection. Bound
    // once on the canvas (not per table) and auto-cleaned on unload.
    if (!this.tableSelOutsideBound) {
      this.tableSelOutsideBound = true;
      this.registerDomEvent(this.outer, 'pointerdown', (e) => {
        const s = this.tableCellSel;
        if (s && !(e.target instanceof Node && s.layer.contains(e.target))) this.clearTableCellSel();
      }, { capture: true });
    }

    layer.addEventListener('input', (e) => {
      const t = e.target; if (!isCell(t)) return;
      const row = Number(t.dataset.row), col = Number(t.dataset.col);
      if (row === 0) { card.columns[col].label = t.textContent ?? ''; return; }
      const r = card.rows[row - 1]; if (r) r.cells[card.columns[col].id] = t.textContent ?? '';
    });

    layer.addEventListener('focusout', (e) => {
      const t = e.target; if (!isCell(t)) return;
      t.contentEditable = 'false';
      this.scheduleSave();
    });

    layer.addEventListener('paste', (e) => {
      const t = e.target; if (!isCell(t)) return;
      this.handleTablePaste(e, cardEl, card, Number(t.dataset.row), Number(t.dataset.col));
    });

    // Tab/Shift+Tab hop across cells row-major (header row is index 0);
    // Enter moves down a row, growing the table with a fresh blank row if
    // already on the last one — spreadsheet-style navigation without a full
    // grid widget.
    layer.addEventListener('keydown', (e) => {
      const t = e.target; if (!isCell(t)) return;
      e.stopPropagation();
      const rowIndex = Number(t.dataset.row), colIndex = Number(t.dataset.col);
      if (e.key === 'Tab') {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        let r = rowIndex, c = colIndex + dir;
        const maxCol = card.columns.length - 1;
        if (c > maxCol) { c = 0; r += 1; }
        else if (c < 0) { c = maxCol; r -= 1; }
        if (r < 0 || r > card.rows.length) return;
        this.focusTableCell(layer, r, c);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const nextRow = rowIndex + 1;
        if (nextRow > card.rows.length) {
          this.pushUndo();
          card.rows.push({ id: crypto.randomUUID(), cells: {} });
          this.renderCardContent(cardEl, card);
          this.scheduleSave();
          window.setTimeout(() => {
            const gw = this.cardEls.get(card.id)?.querySelector<HTMLElement>('.visual-notes-table-zoom-layer');
            if (gw) this.focusTableCell(gw, nextRow, colIndex);
          }, 0);
        } else {
          this.focusTableCell(layer, nextRow, colIndex);
        }
      } else if (e.key === 'Escape') {
        t.blur();
      }
    });
  },

  focusTableCell(this: FreeformRenderer, layer: HTMLElement, rowIndex: number, colIndex: number): void {
    const rowEl = layer.children[rowIndex] as HTMLElement | undefined;
    if (!rowEl) return;
    const cells = rowEl.querySelectorAll<HTMLElement>('.visual-notes-table-header-label, .visual-notes-table-cell-text');
    const cellEl = cells[colIndex];
    if (!cellEl) return;
    if (!cellEl.isContentEditable) { cellEl.contentEditable = 'true'; cellEl.spellcheck = false; }
    cellEl.focus();
    const r = activeDocument.createRange();
    r.selectNodeContents(cellEl);
    r.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  },

  addTable(this: FreeformRenderer): void { const p = this.centerPos(TABLE_DEFAULT_W, TABLE_DEFAULT_H); this.addTableAt(p.x, p.y); },

  appendTableViewSwitcher(this: FreeformRenderer, parent: HTMLElement, el: HTMLElement, card: TableCard): void {
    const sw = parent.createDiv('visual-notes-table-view-switcher');
    const views: { v: TableViewMode; icon: string; label: string }[] = [
      { v: 'table',    icon: 'table',         label: 'Table view' },
      { v: 'list',     icon: 'list',          label: 'List view' },
      { v: 'gallery',  icon: 'layout-grid',   label: 'Gallery view' },
      { v: 'board',    icon: 'columns-3',     label: 'Board view' },
      { v: 'calendar', icon: 'calendar-days', label: 'Calendar view' },
    ];
    for (const { v, icon, label } of views) {
      const btn = this.dataViewNavBtn(sw, icon, label, () => {
        if ((card.view ?? 'table') === v) return;
        this.pushUndo();
        card.view = v === 'table' ? undefined : v;
        this.scheduleSave();
        this.rerenderCard(el, card);
      });
      btn.toggleClass('is-active', (card.view ?? 'table') === v);
    }
  },

  renderTableAltViewContent(this: FreeformRenderer, el: HTMLElement, card: TableCard): void {
    el.addClass('visual-notes-table-alt');

    const header = el.createDiv('visual-notes-table-alt-header');
    if (!card.titleHidden) {
      const titleEl = header.createEl('input', { cls: 'visual-notes-table-title' });
      titleEl.type = 'text'; titleEl.value = card.title || ''; titleEl.placeholder = 'Table';
      titleEl.addEventListener('pointerdown', e => e.stopPropagation());
      titleEl.addEventListener('input', () => { card.title = titleEl.value; });
      titleEl.addEventListener('blur', () => this.scheduleSave());
    }
    this.appendTableViewSwitcher(header, el, card);

    const body = el.createDiv('visual-notes-table-alt-body');
    switch (card.view) {
      case 'list':     this.renderTableListView(body, el, card); break;
      case 'gallery':  this.renderTableGalleryView(body, el, card); break;
      case 'board':    this.renderTableBoardView(body, el, card); break;
      case 'calendar': this.renderTableCalendarView(body, el, card); break;
    }

    this.appendResizeHandles(el);
  },

  appendAltCellValue(this: FreeformRenderer, parent: HTMLElement, el: HTMLElement, card: TableCard, col: TableColumn, row: TableRow): void {
    const raw = row.cells[col.id] ?? '';
    if (col.type === 'checkbox') {
      const cb = parent.createDiv('visual-notes-table-alt-cb');
      cb.toggleClass('is-checked', raw === 'true');
      cb.setAttribute('aria-label', col.label || 'Done');
      cb.addEventListener('pointerdown', e => e.stopPropagation());
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pushUndo();
        row.cells[col.id] = raw === 'true' ? '' : 'true';
        this.scheduleSave();
        this.rerenderCard(el, card);
      });
      return;
    }
    if (!raw.trim()) return;
    if (col.type === 'date') {
      parent.createDiv({ cls: 'visual-notes-table-alt-date', text: /^\d{4}-\d{2}-\d{2}$/.test(raw) ? shortDate(raw) : raw });
      return;
    }
    if (col.type === 'select') {
      const opt = col.options?.find(o => o.label === raw);
      const pill = parent.createDiv({ cls: 'visual-notes-table-alt-select', text: raw });
      if (opt) pill.style.setProperty('--vn-chip-color', opt.color);
      return;
    }
    parent.createDiv({ cls: 'visual-notes-table-alt-text', text: raw });
  },

  tableAltColumns(this: FreeformRenderer, card: TableCard): { labelCol?: TableColumn; cbCol?: TableColumn } {
    return {
      labelCol: card.columns.find(c => (c.type ?? 'text') === 'text') ?? card.columns[0],
      cbCol: card.columns.find(c => c.type === 'checkbox'),
    };
  },

  renderTableListView(this: FreeformRenderer, body: HTMLElement, el: HTMLElement, card: TableCard): void {
    const { labelCol, cbCol } = this.tableAltColumns(card);
    if (card.rows.length === 0) {
      body.createDiv({ cls: 'visual-notes-dataview-empty', text: 'No rows yet — switch to table view to add some.' });
      return;
    }
    const list = body.createDiv('visual-notes-table-list');
    for (const row of card.rows) {
      const rowEl = list.createDiv('visual-notes-table-list-row');
      if (row.color) rowEl.style.backgroundColor = row.color;
      if (cbCol) this.appendAltCellValue(rowEl, el, card, cbCol, row);
      const done = cbCol ? row.cells[cbCol.id] === 'true' : false;
      const label = rowEl.createDiv({
        cls: 'visual-notes-table-list-label',
        text: (labelCol ? row.cells[labelCol.id] : '')?.trim() || 'Untitled',
      });
      label.toggleClass('is-done', done);
      const meta = rowEl.createDiv('visual-notes-table-list-meta');
      for (const col of card.columns) {
        if (col === labelCol || col === cbCol) continue;
        this.appendAltCellValue(meta, el, card, col, row);
      }
    }
  },

  renderTableGalleryView(this: FreeformRenderer, body: HTMLElement, el: HTMLElement, card: TableCard): void {
    const { labelCol, cbCol } = this.tableAltColumns(card);
    if (card.rows.length === 0) {
      body.createDiv({ cls: 'visual-notes-dataview-empty', text: 'No rows yet — switch to table view to add some.' });
      return;
    }
    const grid = body.createDiv('visual-notes-table-gallery');
    for (const row of card.rows) {
      const cardEl = grid.createDiv('visual-notes-table-gallery-card');
      if (row.color) cardEl.style.backgroundColor = row.color;
      const head = cardEl.createDiv('visual-notes-table-gallery-head');
      if (cbCol) this.appendAltCellValue(head, el, card, cbCol, row);
      const done = cbCol ? row.cells[cbCol.id] === 'true' : false;
      head.createDiv({
        cls: 'visual-notes-table-gallery-title',
        text: (labelCol ? row.cells[labelCol.id] : '')?.trim() || 'Untitled',
      }).toggleClass('is-done', done);
      for (const col of card.columns) {
        if (col === labelCol || col === cbCol) continue;
        const raw = row.cells[col.id] ?? '';
        if (!raw.trim()) continue;
        const line = cardEl.createDiv('visual-notes-table-gallery-line');
        line.createSpan({ cls: 'visual-notes-table-gallery-collabel', text: col.label });
        this.appendAltCellValue(line, el, card, col, row);
      }
    }
  },

  renderTableBoardView(this: FreeformRenderer, body: HTMLElement, el: HTMLElement, card: TableCard): void {
    const selCol = card.columns.find(c => c.type === 'select');
    if (!selCol) {
      body.createDiv({
        cls: 'visual-notes-dataview-empty',
        text: 'Board view groups rows by a Select column — add one in table view (column menu → type → Select).',
      });
      return;
    }
    const { labelCol, cbCol } = this.tableAltColumns(card);
    const lanesWrap = body.createDiv('visual-notes-table-board');
    const options = selCol.options ?? [];
    const known = new Set(options.map(o => o.label));

    const makeLane = (label: string, color: string | undefined, rows: TableRow[], optionValue: string) => {
      const lane = lanesWrap.createDiv('visual-notes-table-board-lane');
      lane.dataset.option = optionValue;
      const head = lane.createDiv('visual-notes-table-board-lane-head');
      if (color) {
        const dot = head.createDiv('visual-notes-table-board-lane-dot');
        dot.style.backgroundColor = color;
      }
      head.createSpan({ cls: 'visual-notes-table-board-lane-title', text: label });
      head.createSpan({ cls: 'visual-notes-table-board-lane-count', text: String(rows.length) });
      const stack = lane.createDiv('visual-notes-table-board-lane-stack');
      for (const row of rows) {
        const rowCard = stack.createDiv('visual-notes-table-board-rowcard');
        if (row.color) rowCard.style.backgroundColor = row.color;
        const done = cbCol ? row.cells[cbCol.id] === 'true' : false;
        if (cbCol) this.appendAltCellValue(rowCard, el, card, cbCol, row);
        rowCard.createDiv({
          cls: 'visual-notes-table-board-rowlabel',
          text: (labelCol ? row.cells[labelCol.id] : '')?.trim() || 'Untitled',
        }).toggleClass('is-done', done);
        const meta = rowCard.createDiv('visual-notes-table-board-rowmeta');
        for (const col of card.columns) {
          if (col === labelCol || col === cbCol || col === selCol) continue;
          this.appendAltCellValue(meta, el, card, col, row);
        }
        this.bindTableBoardRowDrag(rowCard, lanesWrap, el, card, selCol, row);
      }
    };

    for (const opt of options) {
      makeLane(opt.label, opt.color, card.rows.filter(r => r.cells[selCol.id] === opt.label), opt.label);
    }
    const unassigned = card.rows.filter(r => !known.has(r.cells[selCol.id] ?? ''));
    makeLane(`No ${selCol.label || 'value'}`, undefined, unassigned, '');
  },

  bindTableBoardRowDrag(this: FreeformRenderer, 
    rowCard: HTMLElement, lanesWrap: HTMLElement, el: HTMLElement,
    card: TableCard, selCol: TableColumn, row: TableRow,
  ): void {
    rowCard.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('.visual-notes-table-alt-cb')) return;
      e.stopPropagation(); e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      let ghost: HTMLElement | null = null;
      let hoverLane: HTMLElement | null = null;
      rowCard.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_THRESHOLD) {
          ghost = rowCard.cloneNode(true) as HTMLElement;
          ghost.addClass('visual-notes-table-board-drag-ghost');
          ghost.style.width = `${rowCard.getBoundingClientRect().width}px`;
          activeDocument.body.appendChild(ghost);
          rowCard.addClass('is-drag-source');
        }
        if (!ghost) return;
        ghost.style.left = `${ev.clientX + 6}px`;
        ghost.style.top = `${ev.clientY + 6}px`;
        const under = activeDocument.elementFromPoint(ev.clientX, ev.clientY);
        const lane = (under as HTMLElement | null)?.closest<HTMLElement>('.visual-notes-table-board-lane');
        const next = lane && lanesWrap.contains(lane) ? lane : null;
        if (next !== hoverLane) {
          hoverLane?.removeClass('is-drop-target');
          hoverLane = next;
          hoverLane?.addClass('is-drop-target');
        }
      };
      const onUp = () => {
        rowCard.removeEventListener('pointermove', onMove);
        rowCard.removeEventListener('pointerup', onUp);
        rowCard.removeClass('is-drag-source');
        ghost?.remove();
        const option = hoverLane?.dataset.option;
        hoverLane?.removeClass('is-drop-target');
        if (ghost && option !== undefined && option !== (row.cells[selCol.id] ?? '')) {
          this.pushUndo();
          row.cells[selCol.id] = option;
          this.scheduleSave();
          this.rerenderCard(el, card);
        }
        ghost = null;
      };
      rowCard.addEventListener('pointermove', onMove);
      rowCard.addEventListener('pointerup', onUp);
    });
  },

  renderTableCalendarView(this: FreeformRenderer, body: HTMLElement, el: HTMLElement, card: TableCard): void {
    if (!card.columns.some(c => c.type === 'date')) {
      body.createDiv({
        cls: 'visual-notes-dataview-empty',
        text: 'Calendar view needs a Date column — add one in table view (column menu → type → Date).',
      });
      return;
    }
    const anchor = card.calAnchor ?? todayISO();
    const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;
    const navRow = body.createDiv('visual-notes-table-cal-nav');
    this.dataViewNavBtn(navRow, 'chevron-left', 'Previous month', () => {
      card.calAnchor = firstOfMonth(addDaysISO(firstOfMonth(anchor), -1));
      this.scheduleSave(); this.rerenderCard(el, card);
    });
    navRow.createDiv({ cls: 'visual-notes-calendar-month-label', text: monthTitle(anchor) });
    this.dataViewNavBtn(navRow, 'chevron-right', 'Next month', () => {
      card.calAnchor = firstOfMonth(addDaysISO(firstOfMonth(anchor), 32));
      this.scheduleSave(); this.rerenderCard(el, card);
    });
    this.dataViewTextBtn(navRow, 'Today', () => {
      card.calAnchor = undefined; this.scheduleSave(); this.rerenderCard(el, card);
    });

    const gridBody = body.createDiv('visual-notes-calendar-body');
    renderCalendarGrid(gridBody, anchor, 'month', tableDatedItems(card), {
      app: this.app,
      onDrop: (item, date) => {
        this.pushUndo();
        item.move(date);
        this.scheduleSave();
        this.refreshAfterDateChange(card.id);
      },
    });
  },

  addTableAt(this: FreeformRenderer, x: number, y: number): void {
    const columns: TableColumn[] = [
      { id: crypto.randomUUID(), label: 'Column 1' },
      { id: crypto.randomUUID(), label: 'Column 2' },
      { id: crypto.randomUUID(), label: 'Column 3' },
    ];
    const rows: TableRow[] = [
      { id: crypto.randomUUID(), cells: {} },
      { id: crypto.randomUUID(), cells: {} },
      { id: crypto.randomUUID(), cells: {} },
    ];
    const card: TableCard = {
      id: crypto.randomUUID(), kind: 'table', x, y, w: TABLE_DEFAULT_W, h: TABLE_DEFAULT_H, z: this.nextZ(),
      title: '', color: 'var(--background-primary)', columns, rows,
    };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
  },
};
