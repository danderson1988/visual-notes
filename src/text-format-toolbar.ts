// Storage format:
// Text colour  → <span style="color:#hex">…</span>
// Highlight    → <mark style="background:#hex">…</mark>
// These are the only two HTML tags this toolbar writes. They live inline in the sticky
// card's HTML field. Obsidian's MarkdownRenderer passes inline HTML through on render.
// Same-type wrappers are always flattened before a new one is applied (no nesting).

import { setIcon, Platform } from 'obsidian';
import { hoistListItemSizes } from './bullet-list';
import { placeFloatingPanel, Rect } from './floating-placement';

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

// Per-selection text sizes, as em multipliers of whatever the card is
// already at. `null` is the reset step: it strips the font-size rather than
// writing 1em, so repeatedly resizing can't leave a pile of nested spans.
const TEXT_SIZES: { label: string; em: number | null }[] = [
  { label: 'XS', em: 0.75 },
  { label: 'S',  em: 0.9 },
  { label: 'M',  em: null },
  { label: 'L',  em: 1.25 },
  { label: 'XL', em: 1.5 },
  { label: '2X', em: 2 },
  { label: '3X', em: 2.5 },
  { label: '4X', em: 3 },
  { label: '5X', em: 4 },
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
    this.buildSizeSection(pop);
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
    mkBtn('B', 'strong', 'Bold (⌘B)', 'visual-notes-fmt-bold');
    mkBtn('I', 'em',     'Italic (⌘I)', 'visual-notes-fmt-italic');
    mkBtn('S', 's',      'Strikethrough (⌘⇧S)', 'visual-notes-fmt-strike');
    mkBtn('U', 'u',      'Underline (⌘U)', 'visual-notes-fmt-underline');
  }

  // Sizes the selected text only, so one note can carry a big heading and
  // ordinary body text — the context bar's own Size control scales a whole
  // card at once, which can't express that on its own.
  private buildSizeSection(parent: HTMLElement): void {
    const section = parent.createDiv('visual-notes-text-fmt-section');
    const label = section.createSpan('visual-notes-text-fmt-label');
    label.setText('Size');
    const row = section.createDiv('visual-notes-text-fmt-sizes');
    for (const { label: text, em } of TEXT_SIZES) {
      const btn = row.createDiv('visual-notes-text-fmt-size-btn');
      btn.setText(text);
      btn.setAttribute('title', em === null ? 'Reset text size' : `Text size ${text}`);
      if (em === null) btn.addClass('is-reset');
      btn.addEventListener('click', () => { this.applyTextSize(em); this.dismiss(); });
    }
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
    pop.addClass('visual-notes-invisible');
    window.requestAnimationFrame(() => {
      if (!this.popover || !this.savedRange) return;

      // Anchored to the card, not to the selection. Anchoring to the selection
      // meant "above the selected text" — which on anything but a short card
      // with the selection near its top is directly on top of the note being
      // edited. Horizontal centring still follows the selection, so the
      // popover stays near where you're typing without ever covering it.
      const rects = this.savedRange.getClientRects();
      const centerOn = rects.length > 0
        ? (rects[0].left + rects[rects.length - 1].right) / 2
        : undefined;

      // The context bar prefers the space above a card, so this takes the
      // space below — the two only need avoidance for the cases where one of
      // them has to flip.
      const avoid: Rect[] = [];
      const ctxBar = this.container.querySelector<HTMLElement>('.visual-notes-ctx-bar-panel');
      if (ctxBar && !ctxBar.hasClass('visual-notes-invisible')) {
        avoid.push(ctxBar.getBoundingClientRect());
      }

      const { top, left } = placeFloatingPanel({
        anchor: this.cardEl.getBoundingClientRect(),
        container: this.container.getBoundingClientRect(),
        panelW: pop.offsetWidth,
        panelH: pop.offsetHeight,
        prefer: 'below',
        centerOn,
        avoid,
      });

      pop.style.top  = `${top}px`;
      pop.style.left = `${left}px`;
      pop.removeClass('visual-notes-invisible');
    });
  }

  // ── Apply formatting ───────────────────────────────────────────

  private applyColor(hex: string | null): void {
    this.applyInlineStyleProp('color', hex);
  }

  // Sizes are stored in `em`, not px, so they multiply whatever the card and
  // global text scales currently are instead of fighting them — a heading
  // stays proportionally a heading when either is changed later.
  private applyTextSize(em: number | null): void {
    this.applyInlineStyleProp('font-size', em === null ? null : `${em}em`);
  }

  // Colour and size both live on <span>, so wrapRange's blanket "flatten
  // every same-tag element in range" would mean setting one silently wiped
  // the other. This clears only the property being written, and unwraps a
  // span solely once nothing else is left on it.
  private applyInlineStyleProp(prop: 'color' | 'font-size', value: string | null): void {
    this.restoreSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    const tmp = createDiv();
    tmp.appendChild(range.extractContents());
    for (const el of Array.from(tmp.querySelectorAll('span'))) {
      el.style.removeProperty(prop);
      if (!el.getAttribute('style') && !el.className) {
        el.replaceWith(...Array.from(el.childNodes));
      }
    }

    if (value === null) {
      const frag = createFragment();
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      range.insertNode(frag);
    } else {
      const span = createSpan();
      span.style.setProperty(prop, value);
      while (tmp.firstChild) span.appendChild(tmp.firstChild);
      range.insertNode(span);
      span.parentElement?.normalize();
    }
    if (prop === 'font-size') hoistListItemSizes(this.editor);
    sel.removeAllRanges();
  }

  // A bullet marker is sized by its <li>, not by anything nested inside it,
  // so sizing a span within an item gives a big line next to a tiny bullet.
  // When the size covers the whole item, move it onto the <li> itself so the
  // marker grows with the text.
  private hoistListItemSizes(): void {
    // Selecting a whole list puts the size on a <span> wrapping the <ul>
    // instead of inside an item — push it down to the items, which is the
    // only level the marker reads.
    for (const span of Array.from(this.editor.querySelectorAll('span'))) {
      const size = span.style.fontSize;
      if (!size) continue;
      const lists = Array.from(span.querySelectorAll('ul'));
      if (!lists.length) continue;
      for (const ul of lists) {
        for (const li of Array.from(ul.children)) {
          // instanceOf, not instanceof: a board open in a popout window has
          // its own HTMLElement global, which a plain instanceof would miss.
          if (li.instanceOf(HTMLElement) && !li.style.fontSize) li.style.fontSize = size;
        }
      }
      span.style.removeProperty('font-size');
      if (!span.getAttribute('style') && !span.className) {
        span.replaceWith(...Array.from(span.childNodes));
      }
    }

    for (const li of Array.from(this.editor.querySelectorAll('li'))) {
      if (li.style.fontSize) continue;
      const sized = Array.from(li.querySelectorAll<HTMLElement>('*')).filter(el => el.style.fontSize);
      if (!sized.length) continue;

      const size = sized[0].style.fontSize;
      if (!sized.every(el => el.style.fontSize === size)) continue;
      // Only when one size covers the item's entire text. A part-resized
      // line keeps its base-size marker, which is the right answer — the
      // line itself hasn't changed size, just a word inside it.
      const covered = sized.map(el => el.textContent ?? '').join('').trim();
      if (covered !== (li.textContent ?? '').trim()) continue;

      li.style.fontSize = size;
      for (const el of sized) {
        el.style.removeProperty('font-size');
        if (el.tagName === 'SPAN' && !el.getAttribute('style') && !el.className) {
          el.replaceWith(...Array.from(el.childNodes));
        }
      }
    }
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
