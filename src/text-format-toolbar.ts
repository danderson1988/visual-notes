// Storage format:
// Text colour  → <span style="color:#hex">…</span>
// Highlight    → <mark style="background:#hex">…</mark>
// These are the only two HTML tags this toolbar writes. They live inline in the sticky
// card's HTML field. Obsidian's MarkdownRenderer passes inline HTML through on render.
// Same-type wrappers are always flattened before a new one is applied (no nesting).

import { setIcon, Platform } from 'obsidian';

const TEXT_COLORS: (string | null)[] = [
  null,      // Default — removes colour
  '#EF4444', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899',
];

const HIGHLIGHT_COLORS: (string | null)[] = [
  null,      // None — removes highlight
  '#000000', '#67E8F9', '#BEF264',
  '#FCD34D', '#F9A8D4', '#D1D5DB',
];

export class TextFormatToolbar {
  private popover:     HTMLElement | null = null;
  private debounce:    number | null = null;
  private savedRange:  Range | null = null;

  private readonly onSelChange: () => void;
  private readonly onOutside:   (e: MouseEvent) => void;

  constructor(
    private readonly editor:    HTMLElement,   // contenteditable div
    private readonly cardEl:    HTMLElement,
    private readonly container: HTMLElement,
  ) {
    this.onSelChange = () => this.scheduleCheck();
    this.onOutside   = (e: MouseEvent) => {
      if (this.popover && !this.popover.contains(e.target as Node)) this.dismiss();
    };
    activeDocument.addEventListener('selectionchange', this.onSelChange);
  }

  // ── Selection check ────────────────────────────────────────────

  private scheduleCheck(): void {
    // On a phone, this floating popover has nowhere good to go — no
    // phone-specific sizing/positioning/keyboard-awareness exists for it,
    // and it was the leading suspect for a report of editing taking over
    // the whole screen with a white popup. iPad (isMobile && !isPhone) and
    // desktop are unaffected; a phone-appropriate replacement (routed
    // through the bottom context bar) is a separate follow-up.
    if (Platform.isPhone) return;
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => {
      this.debounce = null;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { this.dismiss(); return; }
      if (!this.editor.contains(sel.anchorNode) || !this.editor.contains(sel.focusNode)) {
        this.dismiss(); return;
      }
      this.savedRange = sel.getRangeAt(0).cloneRange();
      if (!this.popover) this.show();
    }, 100);
  }

  // ── Popover ────────────────────────────────────────────────────

  private show(): void {
    const pop = this.popover = this.container.createDiv('visual-notes-text-fmt-toolbar');
    pop.addEventListener('pointerdown', e => e.preventDefault()); // keep editor focus + selection

    this.buildFormatRow(pop);
    pop.createDiv('visual-notes-text-fmt-divider');
    this.buildSection(pop, 'Color',     TEXT_COLORS,      hex => this.applyColor(hex),     'color');
    pop.createDiv('visual-notes-text-fmt-divider');
    this.buildSection(pop, 'Highlight', HIGHLIGHT_COLORS, hex => this.applyHighlight(hex), 'highlight');

    this.position(pop);
    window.setTimeout(() => activeDocument.addEventListener('mousedown', this.onOutside), 0);
  }

  private buildFormatRow(parent: HTMLElement): void {
    const row = parent.createDiv('visual-notes-text-fmt-inline-row');
    const mkBtn = (label: string, tag: string, title: string, cls?: string) => {
      const btn = row.createDiv('visual-notes-text-fmt-inline-btn');
      btn.setAttribute('title', title);
      if (cls) btn.addClass(cls);
      const labelSpan = btn.createSpan();
      labelSpan.setText(label);
      btn.addEventListener('click', () => this.applyInlineTag(tag));
    };
    mkBtn('B', 'strong', 'Bold (⌘B)', 'ib-fmt-bold');
    mkBtn('I', 'em',     'Italic (⌘I)', 'ib-fmt-italic');
    mkBtn('S', 's',      'Strikethrough (⌘⇧S)', 'ib-fmt-strike');
    mkBtn('U', 'u',      'Underline (⌘U)', 'ib-fmt-underline');
  }

  // ── Inline tag toggle (bold, italic, strikethrough, underline) ─

  public applyInlineTag(tag: string): void {
    this.restoreSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    // Toggle off if entire selection sits inside an element of this tag
    const ancestor = range.commonAncestorContainer;
    const existingWrapper = (ancestor.nodeType === Node.ELEMENT_NODE
      ? ancestor as Element
      : ancestor.parentElement
    )?.closest(tag);
    if (existingWrapper && this.editor.contains(existingWrapper)) {
      const children = Array.from(existingWrapper.childNodes);
      const parent = existingWrapper.parentNode!;
      while (existingWrapper.firstChild) parent.insertBefore(existingWrapper.firstChild, existingWrapper);
      existingWrapper.remove();
      if (children.length > 0 && parent.contains(children[0]) && parent.contains(children[children.length - 1])) {
        const nr = activeDocument.createRange();
        nr.setStartBefore(children[0]);
        nr.setEndAfter(children[children.length - 1]);
        sel.removeAllRanges(); sel.addRange(nr);
      } else {
        sel.removeAllRanges();
      }
    } else {
      const wrapper = createEl(tag as keyof HTMLElementTagNameMap);
      this.wrapRange(range, wrapper);
      const nr = activeDocument.createRange();
      nr.selectNodeContents(wrapper);
      sel.removeAllRanges(); sel.addRange(nr);
    }
  }

  private buildSection(
    parent: HTMLElement,
    label:  string,
    colors: (string | null)[],
    apply:  (hex: string | null) => void,
    kind:   'color' | 'highlight',
  ): void {
    const section = parent.createDiv('visual-notes-text-fmt-section');
    const sectionLabel = section.createSpan('visual-notes-text-fmt-label');
    sectionLabel.setText(label);
    const row = section.createDiv('visual-notes-text-fmt-swatches');

    // Colour-wheel swatch (opens native picker)
    const customSw = row.createDiv('visual-notes-text-fmt-swatch');
    customSw.addClass('is-custom');
    setIcon(customSw, 'pipette');
    const colorInput = customSw.createEl('input');
    colorInput.type = 'color';
    colorInput.className = 'visual-notes-text-fmt-custom-input';
    colorInput.addEventListener('pointerdown', e => e.stopPropagation());
    colorInput.addEventListener('change', () => { apply(colorInput.value); this.dismiss(); });
    customSw.addEventListener('click', () => { this.restoreSelection(); colorInput.click(); });

    // Preset swatches
    for (const hex of colors) {
      const sw = row.createDiv('visual-notes-text-fmt-swatch');
      if (hex === null) {
        sw.addClass(kind === 'color' ? 'is-default' : 'is-none');
        const nullLabel = sw.createSpan('visual-notes-text-fmt-null-label');
        nullLabel.setText(kind === 'color' ? 'A' : '/');
      } else {
        sw.style.backgroundColor = hex;
        if (hex === '#000000') {
          const blackLabel = sw.createSpan('visual-notes-text-fmt-black-label');
          blackLabel.setText('A');
        }
      }
      sw.addEventListener('click', () => { apply(hex); this.dismiss(); });
    }
  }

  // ── Positioning (above the actual selected text) ───────────────

  private position(pop: HTMLElement): void {
    pop.addClass('ib-invisible');
    window.requestAnimationFrame(() => {
      if (!this.popover || !this.savedRange) return;

      const rects   = this.savedRange.getClientRects();
      const contRect = this.container.getBoundingClientRect();
      const popW    = pop.offsetWidth;
      const popH    = pop.offsetHeight;
      const contW   = this.container.clientWidth;

      let selLeft: number, selRight: number, selTop: number, selBottom: number;
      if (rects.length > 0) {
        selLeft   = rects[0].left;
        selRight  = rects[rects.length - 1].right;
        selTop    = Math.min(...Array.from(rects).map(r => r.top));
        selBottom = Math.max(...Array.from(rects).map(r => r.bottom));
      } else {
        const fb = this.cardEl.getBoundingClientRect();
        selLeft = fb.left; selRight = fb.right;
        selTop  = fb.top;  selBottom = fb.bottom;
      }

      let left = (selLeft + selRight) / 2 - contRect.left - popW / 2;
      let top  = selTop  - contRect.top  - popH - 8;

      if (top < 4) top = selBottom - contRect.top + 8; // flip below
      if (left < 4) left = 4;
      if (left + popW > contW - 4) left = contW - 4 - popW;

      pop.style.top  = `${top}px`;
      pop.style.left = `${left}px`;
      pop.removeClass('ib-invisible');
    });
  }

  // ── Apply formatting ───────────────────────────────────────────

  private applyColor(hex: string | null): void {
    this.restoreSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    if (hex === null) this.unwrapRange(range, 'span');
    else { const s = createSpan(); s.style.color = hex; this.wrapRange(range, s); }
    sel.removeAllRanges();
  }

  private applyHighlight(hex: string | null): void {
    this.restoreSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    if (hex === null) this.unwrapRange(range, 'mark');
    else { const m = createEl('mark'); m.style.background = hex; this.wrapRange(range, m); }
    sel.removeAllRanges();
  }

  private restoreSelection(): void {
    if (!this.savedRange) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(this.savedRange.cloneRange());
  }

  // ── DOM range helpers ──────────────────────────────────────────

  private wrapRange(range: Range, wrapper: HTMLElement): void {
    const tag = wrapper.tagName.toLowerCase();
    // Extract selection, flatten any same-type tags inside, then rewrap
    const extracted = range.extractContents();
    const tmp = createDiv();
    tmp.appendChild(extracted);
    tmp.querySelectorAll(tag).forEach(el => el.replaceWith(...Array.from(el.childNodes)));
    while (tmp.firstChild) wrapper.appendChild(tmp.firstChild);
    range.insertNode(wrapper);
    wrapper.parentElement?.normalize();
  }

  private unwrapRange(range: Range, tag: string): void {
    const extracted = range.extractContents();
    const tmp = createDiv();
    tmp.appendChild(extracted);
    tmp.querySelectorAll(tag).forEach(el => el.replaceWith(...Array.from(el.childNodes)));
    const frag = createFragment();
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    range.insertNode(frag);
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  dismiss(): void {
    this.popover?.remove();
    this.popover = null;
    activeDocument.removeEventListener('mousedown', this.onOutside);
  }

  destroy(): void {
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    this.dismiss();
    activeDocument.removeEventListener('selectionchange', this.onSelChange);
  }
}
