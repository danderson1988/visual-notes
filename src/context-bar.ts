import { setIcon, setTooltip, Platform } from 'obsidian';
import { Card } from './file-types';
import { isDarkTheme } from './color-utils';

export type CtxEvent =
  | { type: 'delete' }
  | { type: 'tile-edit' }
  // Generic "start inline-editing this card's text/title" — the handler
  // branches on card.kind. Added so single-tap-select + one visible button
  // reaches edit mode on touch devices, where the dblclick that normally
  // starts these editors is unreliable/undiscoverable.
  | { type: 'edit-card' }
  | { type: 'sticky-color'; hex: string }
  | { type: 'sticky-top-color'; hex: string | null }
  | { type: 'checklist-accent'; hex: string }
  | { type: 'checklist-bg'; hex: string }
  | { type: 'checklist-top-color'; hex: string | null }
  | { type: 'checklist-title' }
  | { type: 'comment-color'; hex: string }
  | { type: 'comment-resolve' }
  | { type: 'table-bg'; hex: string }
  | { type: 'table-title' }
  | { type: 'image-caption' }
  | { type: 'notelink-display' }
  | { type: 'notelink-open' }
  | { type: 'bookmark-refresh' }
  | { type: 'bookmark-copy-url' }
  | { type: 'kanban-color'; hex: string }
  | { type: 'kanban-bg'; hex: string | null }
  | { type: 'kanban-top-color'; hex: string | null }
  | { type: 'kanban-title' }
  | { type: 'kanban-add-col' }
  | { type: 'checkers-reset' };

// ── Colour palettes ───────────────────────────────────────────────────────────

const ACCENT_COLORS  = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899','#6b7280','#14b8a6','#f43f5e','#8b5cf6','#84cc16'];

// Card *background* fills — unlike the accent/strip colors above (already
// fully saturated, read fine in either theme), these are pale pastels
// meant to sit under dark text on a light canvas. Sitting on a dark canvas
// instead, they glare rather than blend in, which is what "colors don't
// suit dark mode" meant in practice. bgColors() swaps in a muted, deep
// counterpart per swatch (same hue family, Tailwind's 800/900 shades) once
// Obsidian's own theme is dark, so light mode keeps the original bright
// palette untouched.
const BG_COLORS_LIGHT = ['#FFFFFF','#F3F4F6','#FEF9C3','#FEE2E2','#D1FAE5','#DBEAFE','#EDE9FE','#FCE7F3','#ECFDF5','#FFF7ED','#F0F9FF','#E0F2FE'];
const BG_COLORS_DARK  = ['#1F2937','#374151','#713F12','#7F1D1D','#064E3B','#1E3A8A','#4C1D95','#831843','#134E4A','#7C2D12','#0C4A6E','#164E63'];
function BG_COLORS(): string[] { return isDarkTheme() ? BG_COLORS_DARK : BG_COLORS_LIGHT; }

const STRIP_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899','#6b7280','#14b8a6','#f43f5e','#1d4ed8','#84cc16'];

// ── ContextBar ────────────────────────────────────────────────────────────────

export class ContextBar {
  private ctxPanelEl!: HTMLElement;
  private trashConfirmActive = false;
  private trashTimeout: number | null = null;
  private currentCard: Card | null = null;
  private currentCardEl: HTMLElement | null = null;
  // A floating panel above the selection has nowhere good to go on a phone
  // screen (same reasoning TextFormatToolbar is disabled there) — phone
  // keeps the original design: the same fixed toolbar element repurposed in
  // place, reflowed into a bottom-docked bar by the existing CSS media
  // query. Decided once; a phone doesn't turn into a desktop mid-session.
  private readonly floating = !Platform.isPhone;

  constructor(
    private readonly toolbarEl: HTMLElement,
    private readonly container: HTMLElement,
    private readonly getTrashZoneEl: () => HTMLElement | null,
    private readonly emit: (e: CtxEvent) => void,
  ) {
    if (this.floating) {
      // Screen-space sibling of the pen picker / connection-props panel /
      // pen options panel, not an in-flow toolbar child — created once and
      // toggled invisible rather than removed/recreated per show(), same
      // as the docked panel below never gets torn down either.
      this.ctxPanelEl = this.container.createDiv('visual-notes-ctx-bar-panel ib-ctx-panel');
      this.ctxPanelEl.addClass('ib-invisible');
    } else {
      this.ctxPanelEl = this.toolbarEl.createDiv('ib-ctx-panel');
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  show(card: Card, cardEl: HTMLElement): void {
    this.currentCard = card;
    this.currentCardEl = cardEl;
    this.fill(card);
    if (this.floating) this.position(); else this.activate();
  }

  hide(): void {
    this.currentCard = null;
    this.currentCardEl = null;
    if (this.floating) { this.ctxPanelEl.addClass('ib-invisible'); this.cancelTrashConfirm(); }
    else this.deactivate();
  }

  // Called after the selected card's on-screen rect changes for a reason
  // that isn't a fresh show() — dragged, resized, or the canvas itself was
  // panned/zoomed. No-op on phone (nothing floats there) or when nothing is
  // currently shown. Unlike position(), this runs synchronously with no
  // invisible/rAF flash-prevention step: the panel is already visible and
  // already close to right, this just nudges it to stay aligned.
  reposition(): void {
    if (!this.floating || !this.currentCardEl) return;
    this.applyPosition();
  }

  destroy(): void {
    if (this.trashTimeout !== null) window.clearTimeout(this.trashTimeout);
  }

  // ── Panel activation (docked/phone mode only) ───────────────────────────────

  private activate(): void {
    this.toolbarEl.addClass('ib-ctx-active');
  }

  private deactivate(): void {
    this.toolbarEl.removeClass('ib-ctx-active');
    this.cancelTrashConfirm();
  }

  // ── Positioning (floating mode only) ────────────────────────────────────────

  // Same measure-then-clamp approach as TextFormatToolbar.position(): hide,
  // measure on the next frame (so the just-rebuilt content has real
  // dimensions), position, reveal — avoids a visible flash at a stale spot
  // when show() targets a different card than whatever was last positioned.
  private position(): void {
    this.ctxPanelEl.addClass('ib-invisible');
    window.requestAnimationFrame(() => {
      this.applyPosition();
      this.ctxPanelEl.removeClass('ib-invisible');
    });
  }

  private applyPosition(): void {
    const cardEl = this.currentCardEl;
    if (!cardEl) return;
    const cardRect = cardEl.getBoundingClientRect();
    const contRect = this.container.getBoundingClientRect();
    const panelW = this.ctxPanelEl.offsetWidth;
    const panelH = this.ctxPanelEl.offsetHeight;
    const gap = 8;
    let left = (cardRect.left + cardRect.right) / 2 - contRect.left - panelW / 2;
    let top = cardRect.top - contRect.top - panelH - gap;
    if (top < 4) top = cardRect.bottom - contRect.top + gap; // no room above — flip below
    const margin = 4;
    left = Math.max(margin, Math.min(left, contRect.width - margin - panelW));
    top = Math.max(margin, Math.min(top, contRect.height - margin - panelH));
    this.ctxPanelEl.setCssStyles({ top: `${top}px`, left: `${left}px`, right: '', bottom: '' });

    // Still overlapping the bottom-left trash zone? Nudge above it instead
    // of just clamping sideways — same fix positionPenPicker already needed.
    const trash = this.getTrashZoneEl();
    if (!trash) return;
    const pRect = this.ctxPanelEl.getBoundingClientRect();
    const tRect = trash.getBoundingClientRect();
    const overlaps = pRect.left < tRect.right + margin && pRect.right > tRect.left - margin
      && pRect.top < tRect.bottom + margin && pRect.bottom > tRect.top - margin;
    if (overlaps) {
      const flippedTop = Math.max(margin, tRect.top - contRect.top - panelH - margin);
      this.ctxPanelEl.setCssStyles({ top: `${flippedTop}px` });
    }
  }

  // Sub-panels (color grid, bg/strip tabs) resize the already-visible panel
  // well beyond its initial icon-row footprint — re-measure in place so it
  // doesn't end up positioned for a panel half its eventual size. Safe to
  // call synchronously (unlike position()): the panel is already visible,
  // so there's nothing to flash.
  private syncPos(): void {
    if (this.floating) this.applyPosition();
  }

  // ── Fill by card type ────────────────────────────────────────────────────────

  private fill(card: Card): void {
    const p = this.ctxPanelEl;
    p.empty();
    this.cancelTrashConfirm();

    this.mkBack(p, () => this.hide());

    switch (card.kind) {
      case 'tile':
        this.mkBtn(p, 'Edit', 'edit-2', () => this.emit({ type: 'tile-edit' }));
        break;

      case 'sticky':
        // Explicit entry into edit mode — dblclick (the only other way in)
        // is unreliable on touch devices. Bold/Italic/Underline/Strike used
        // to live here too, but they only ever worked while the sticky was
        // already in text-edit mode (they applied to the current text
        // selection) — selecting the card without entering edit mode left
        // them silently doing nothing. TextFormatToolbar already covers the
        // same commands (plus Color/Highlight) the moment text is actually
        // selected, so they were pure duplication once genuinely fixed.
        this.mkBtn(p, 'Edit', 'edit-2', () => this.emit({ type: 'edit-card' }));
        this.mkBtn(p, 'Color', 'palette', () => this.openBgTopColorSub(
          p, card,
          BG_COLORS(),
          hex => this.emit({ type: 'sticky-color', hex }),
          STRIP_COLORS,
          hex => this.emit({ type: 'sticky-top-color', hex }),
        ));
        break;

      case 'checklist':
        this.mkBtn(p, 'Color', 'palette', () => this.openBgTopColorSub(
          p, card,
          BG_COLORS(),
          hex => this.emit({ type: 'checklist-bg', hex }),
          ACCENT_COLORS,
          hex => this.emit({ type: 'checklist-top-color', hex }),
        ));
        this.mkBtn(p, 'Title', 'heading', () => this.emit({ type: 'checklist-title' }));
        break;

      case 'table':
        this.mkBtn(p, 'Color', 'palette', () => this.openColorSub(p, BG_COLORS(), hex => this.emit({ type: 'table-bg', hex }), card));
        this.mkBtn(p, 'Title', 'heading', () => this.emit({ type: 'table-title' }));
        break;

      case 'comment':
        this.mkBtn(p, 'Color', 'palette', () => this.openColorSub(p, ACCENT_COLORS, hex => this.emit({ type: 'comment-color', hex }), card));
        this.mkBtn(p, card.resolved ? 'Unresolve' : 'Resolve', card.resolved ? 'rotate-ccw' : 'check', () => this.emit({ type: 'comment-resolve' }));
        break;

      case 'image':
        this.mkBtn(p, 'Caption', 'align-left', () => this.emit({ type: 'image-caption' }));
        break;

      case 'note-link':
        this.mkBtn(p, 'Display', 'layout-list',   () => this.emit({ type: 'notelink-display' }));
        this.mkBtn(p, 'Open',    'external-link', () => this.emit({ type: 'notelink-open' }));
        break;

      case 'bookmark':
        this.mkBtn(p, 'Refresh',  'refresh-cw', () => this.emit({ type: 'bookmark-refresh' }));
        this.mkBtn(p, 'Copy URL', 'copy',        () => this.emit({ type: 'bookmark-copy-url' }));
        break;

      case 'kanban-column':
        this.mkBtn(p, 'Color', 'palette', () => this.openBgTopColorSub(
          p, card,
          BG_COLORS(),
          hex => this.emit({ type: 'kanban-bg', hex }),
          STRIP_COLORS,
          hex => this.emit({ type: 'kanban-top-color', hex }),
        ));
        this.mkBtn(p, 'Title',   'heading', () => this.emit({ type: 'kanban-title' }));
        this.mkBtn(p, 'Add col', 'columns', () => this.emit({ type: 'kanban-add-col' }));
        break;

      case 'kanban-board':
        // Per-column color/background/WIP now live on each column's own
        // "..." menu (right-click won't do it justice with several columns
        // in play) — the global context bar just handles the board-level
        // title and adding another column.
        this.mkBtn(p, 'Title',    'heading', () => this.emit({ type: 'kanban-title' }));
        this.mkBtn(p, 'Add col',  'columns', () => this.emit({ type: 'kanban-add-col' }));
        break;

      case 'audio':
        // no specific actions
        break;

      case 'checkers':
        this.mkBtn(p, 'New game', 'rotate-ccw', () => this.emit({ type: 'checkers-reset' }));
        break;

      // Text-bearing kinds that previously had no context-bar case at all
      // (only Back + Delete) and whose editors were dblclick-only.
      case 'callout':
        this.mkBtn(p, 'Edit', 'edit-2', () => this.emit({ type: 'edit-card' }));
        break;

      case 'group':
        this.mkBtn(p, 'Rename', 'edit-2', () => this.emit({ type: 'edit-card' }));
        break;

      case 'calendar':
      case 'column':
        this.mkBtn(p, 'Title', 'heading', () => this.emit({ type: 'edit-card' }));
        break;
    }

    this.mkTrash(p);
    this.syncPos();
  }

  // ── Background + Top strip two-tab picker ────────────────────────────────────

  private openBgTopColorSub(
    p: HTMLElement,
    card: Card,
    bgColors: string[],
    onBg: (hex: string) => void,
    stripColors: string[],
    onStrip: (hex: string | null) => void,
  ): void {
    p.empty();
    this.cancelTrashConfirm();
    this.mkBack(p, () => this.fill(card));

    // Tab row
    const tabRow = p.createDiv('ib-ctx-tab-row');
    const bgTab    = tabRow.createDiv('ib-ctx-tab ib-ctx-tab--active');
    bgTab.setText('Background');
    const stripTab = tabRow.createDiv('ib-ctx-tab');
    stripTab.setText('Top strip');

    // Swatch area (re-rendered on tab switch)
    const swatchArea = p.createDiv('ib-ctx-swatch-area');

    const renderSwatches = (tab: 'bg' | 'strip') => {
      swatchArea.empty();
      if (tab === 'bg') {
        const grid = swatchArea.createDiv('ib-ctx-color-grid');
        for (const hex of bgColors) {
          const sw = grid.createDiv('ib-ctx-color-swatch');
          sw.style.background = hex;
          if (['#FFFFFF','#F3F4F6','#E0F2FE','#F0F9FF'].includes(hex))
            sw.addClass('ib-swatch-border-light');
          sw.addEventListener('click', () => onBg(hex));
        }
        this.mkCustomColor(swatchArea, onBg, () => {});
      } else {
        const grid = swatchArea.createDiv('ib-ctx-color-grid');
        // "None" swatch removes the strip
        const noneSw = grid.createDiv('ib-ctx-color-swatch ib-ctx-color-swatch--none');
        noneSw.setAttribute('aria-label', 'None');
        noneSw.addEventListener('click', () => onStrip(null));
        for (const hex of stripColors) {
          const sw = grid.createDiv('ib-ctx-color-swatch');
          sw.style.background = hex;
          sw.addEventListener('click', () => onStrip(hex));
        }
        this.mkCustomColor(swatchArea, onStrip, () => {});
      }
    };

    bgTab.addEventListener('click', () => {
      bgTab.addClass('ib-ctx-tab--active');
      stripTab.removeClass('ib-ctx-tab--active');
      renderSwatches('bg');
      this.syncPos();
    });
    stripTab.addEventListener('click', () => {
      stripTab.addClass('ib-ctx-tab--active');
      bgTab.removeClass('ib-ctx-tab--active');
      renderSwatches('strip');
      this.syncPos();
    });

    renderSwatches('bg');
    this.mkTrash(p);
    this.syncPos();
  }

  // ── Color sub-panel ──────────────────────────────────────────────────────────

  private openColorSub(
    p: HTMLElement,
    colors: string[],
    onSelect: (hex: string) => void,
    card: Card,
  ): void {
    p.empty();
    this.cancelTrashConfirm();
    this.mkBack(p, () => this.fill(card));

    const grid = p.createDiv('ib-ctx-color-grid');
    for (const hex of colors) {
      const sw = grid.createDiv('ib-ctx-color-swatch');
      sw.style.background = hex;
      if (['#F3F4F6','#D1D5DB'].includes(hex))
        sw.addClass('ib-swatch-border-light');
      sw.addEventListener('click', () => { onSelect(hex); this.fill(card); });
    }

    this.mkCustomColor(p, onSelect, () => this.fill(card));
    this.mkTrash(p);
    this.syncPos();
  }

  private mkCustomColor(p: HTMLElement, onSelect: (hex: string) => void, onBack: () => void): void {
    const inp = p.createEl('input');
    inp.type = 'color';
    inp.addClass('ib-ctx-color-wheel-input');
    inp.addEventListener('pointerdown', e => e.stopPropagation());
    inp.addEventListener('change', () => { onSelect(inp.value); onBack(); });

    const btn = this.mkBtn(p, 'Custom', 'pipette', () => inp.click());
    btn.prepend(inp);
  }

  // ── Button helpers ───────────────────────────────────────────────────────────

  // The floating panel hides .visual-notes-tb-btn-label via CSS (icon-only,
  // matching native Canvas's compact selection toolbar) — setTooltip gives
  // it back as a native hover tooltip instead. Harmless to set unconditionally
  // for the docked/phone panel too, where the label is already visible.
  private mkBtn(parent: HTMLElement, label: string, icon: string, handler: () => void): HTMLElement {
    const btn = parent.createDiv('visual-notes-tb-btn');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', label);
    setTooltip(btn, label);
    const ic = btn.createDiv('visual-notes-tb-btn-icon');
    setIcon(ic, icon);
    const labelSpan = btn.createSpan('visual-notes-tb-btn-label');
    labelSpan.setText(label);
    btn.addEventListener('click', handler);
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    return btn;
  }

  private mkBack(parent: HTMLElement, handler: () => void): void {
    const back = parent.createDiv('ib-ctx-back-btn');
    back.setAttribute('tabindex', '0');
    back.setAttribute('aria-label', 'Back');
    setTooltip(back, 'Back');
    setIcon(back, 'arrow-left');
    back.addEventListener('click', handler);
    back.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
  }

  private mkTrash(parent: HTMLElement): void {
    parent.createDiv('ib-ctx-spacer');
    parent.createDiv('ib-ctx-trash-sep');

    const btn = parent.createDiv('visual-notes-tb-btn ib-ctx-trash-btn');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', 'Delete');
    setTooltip(btn, 'Delete');
    const ic = btn.createDiv('visual-notes-tb-btn-icon');
    setIcon(ic, 'trash-2');
    const labelEl = btn.createSpan('visual-notes-tb-btn-label');
    labelEl.setText('Delete');

    // Icon-only mode has no visible label to show "Sure?" on, so the red
    // ib-ctx-trash--confirm background is the primary confirm signal there;
    // the label/tooltip text still updates too, for the docked panel and
    // for anyone hovering the floating one.
    const confirm = () => {
      if (this.trashConfirmActive) { this.emit({ type: 'delete' }); return; }
      this.trashConfirmActive = true;
      labelEl.setText('Sure?');
      setTooltip(btn, 'Sure?');
      btn.addClass('ib-ctx-trash--confirm');
      if (this.trashTimeout !== null) window.clearTimeout(this.trashTimeout);
      this.trashTimeout = window.setTimeout(() => {
        this.trashTimeout = null;
        this.trashConfirmActive = false;
        labelEl.setText('Delete');
        setTooltip(btn, 'Delete');
        btn.removeClass('ib-ctx-trash--confirm');
      }, 3000);
    };

    btn.addEventListener('click', confirm);
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); confirm(); } });
  }

  private cancelTrashConfirm(): void {
    if (this.trashTimeout !== null) { window.clearTimeout(this.trashTimeout); this.trashTimeout = null; }
    this.trashConfirmActive = false;
  }
}
