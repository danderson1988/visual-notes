// Draggable floating panel exposing perfect-freehand's own tuning knobs for
// the Pen tool (github.com/steveruizok/perfect-freehand, MIT, Steve Ruiz).
// Opened via the gear icon in the pen color/width picker (see
// showPenColorPicker in freeform-view-canvas.ts). Kept as a standalone
// class, not part of the FreeformRenderer prototype-mixin split — same
// reasoning as TextFormatToolbar: a self-contained floating widget with its
// own lifecycle, not tied to any one card kind.
import { setIcon } from 'obsidian';

export type EasingKey = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export const EASING_FNS: Record<EasingKey, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

const EASING_LABELS: Record<EasingKey, string> = {
  linear: 'Linear',
  easeIn: 'Ease In',
  easeOut: 'Ease Out',
  easeInOut: 'Ease In Out',
};

// Global rendering knobs for every pen stroke on the board — not per-stroke
// data. buildPenOutlineD already re-renders every stroke fresh from one
// shared config with no memory of what it was drawn with, so changing these
// live reshapes everything already on the canvas, not just new strokes.
// That's intentional, matching perfect-freehand's own demo/playground feel.
export interface PenDrawOptions {
  size: number;
  thinning: number;
  streamline: number;
  smoothing: number;
  easing: EasingKey;
  taperStart: number;
  capStart: boolean;
  taperEnd: number;
  capEnd: boolean;
}

export const DEFAULT_PEN_DRAW_OPTIONS: PenDrawOptions = {
  size: 16,
  thinning: 0.5,
  streamline: 0.5,
  smoothing: 0.5,
  easing: 'linear',
  taperStart: 0,
  capStart: true,
  taperEnd: 0,
  capEnd: true,
};

export class PenOptionsPanel {
  private el: HTMLElement | null = null;

  constructor(
    private readonly container: HTMLElement,
    // Mutated in place by every control — the caller's own PenDrawOptions
    // object, so changes are visible to buildPenOutlineD immediately.
    private readonly options: PenDrawOptions,
    // Fired on every input tick (live re-render, no save).
    private readonly onLiveChange: () => void,
    // Fired on release/blur (persist to plugin settings).
    private readonly onCommit: () => void,
  ) {}

  isOpen(): boolean { return this.el !== null; }

  toggle(anchor: HTMLElement): void {
    if (this.el) this.hide(); else this.show(anchor);
  }

  show(anchor: HTMLElement): void {
    this.hide();
    const panel = this.container.createDiv('visual-notes-pen-options-panel');
    this.el = panel;

    const header = panel.createDiv('visual-notes-pen-options-header');
    header.createSpan({ text: 'Pen Options' });
    const resetBtn = header.createDiv('visual-notes-pen-options-reset');
    resetBtn.setText('Reset');
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Object.assign(this.options, DEFAULT_PEN_DRAW_OPTIONS);
      this.onLiveChange();
      this.onCommit();
      this.show(anchor); // rebuild so every slider/toggle reflects the reset values
    });
    const closeBtn = header.createDiv('visual-notes-pen-options-close');
    setIcon(closeBtn, 'x');
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });
    this.bindDrag(header, panel);

    const body = panel.createDiv('visual-notes-pen-options-body');
    this.slider(body, 'Size', 1, 64, 1, this.options.size, (v) => { this.options.size = v; });
    this.slider(body, 'Thinning', -1, 1, 0.05, this.options.thinning, (v) => { this.options.thinning = v; });
    this.slider(body, 'Streamline', 0, 1, 0.05, this.options.streamline, (v) => { this.options.streamline = v; });
    this.slider(body, 'Smoothing', 0, 1, 0.05, this.options.smoothing, (v) => { this.options.smoothing = v; });
    this.easingSelect(body);
    this.slider(body, 'Taper Start', 0, 200, 1, this.options.taperStart, (v) => { this.options.taperStart = v; });
    this.toggleRow(body, 'Cap Start', this.options.capStart, (v) => { this.options.capStart = v; });
    this.slider(body, 'Taper End', 0, 200, 1, this.options.taperEnd, (v) => { this.options.taperEnd = v; });
    this.toggleRow(body, 'Cap End', this.options.capEnd, (v) => { this.options.capEnd = v; });

    this.position(anchor);
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
  }

  private slider(
    parent: HTMLElement, label: string, min: number, max: number, step: number,
    value: number, setter: (v: number) => void,
  ): void {
    const row = parent.createDiv('visual-notes-pen-options-row');
    row.createSpan({ cls: 'visual-notes-pen-options-label', text: label });
    const input = row.createEl('input', { cls: 'visual-notes-pen-options-slider' });
    input.type = 'range';
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.value = String(value);
    const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
    const readout = row.createSpan({ cls: 'visual-notes-pen-options-value', text: fmt(value) });
    // Same reasoning as the connection-label-size slider: without this a
    // drag on the slider bubbles up as a canvas gesture instead of just
    // moving the thumb.
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('input', () => {
      const v = Number(input.value);
      setter(v);
      readout.setText(fmt(v));
      this.onLiveChange();
    });
    input.addEventListener('change', () => this.onCommit());
  }

  private toggleRow(parent: HTMLElement, label: string, value: boolean, setter: (v: boolean) => void): void {
    const row = parent.createDiv('visual-notes-pen-options-row');
    row.createSpan({ cls: 'visual-notes-pen-options-label', text: label });
    const btn = row.createDiv('visual-notes-pen-options-toggle');
    btn.toggleClass('is-on', value);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = !btn.hasClass('is-on');
      btn.toggleClass('is-on', next);
      setter(next);
      this.onLiveChange();
      this.onCommit();
    });
  }

  private easingSelect(parent: HTMLElement): void {
    const row = parent.createDiv('visual-notes-pen-options-row');
    row.createSpan({ cls: 'visual-notes-pen-options-label', text: 'Easing' });
    const select = row.createEl('select', { cls: 'visual-notes-pen-options-select' });
    select.addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const key of Object.keys(EASING_FNS) as EasingKey[]) {
      const opt = select.createEl('option', { text: EASING_LABELS[key] });
      opt.value = key;
    }
    select.value = this.options.easing;
    select.addEventListener('change', () => {
      this.options.easing = select.value as EasingKey;
      this.onLiveChange();
      this.onCommit();
    });
  }

  // Header pointerdown starts a drag, tracked on activeDocument and filtered
  // to the pointer that started it — same pattern every other drag gesture
  // in this plugin uses (card drag, resize handles, ink strokes).
  private bindDrag(handle: HTMLElement, panel: HTMLElement): void {
    handle.addClass('is-draggable');
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.visual-notes-pen-options-reset, .visual-notes-pen-options-close')) return;
      e.stopPropagation();
      const pointerId = e.pointerId;
      handle.setPointerCapture(pointerId);
      const cRect = this.container.getBoundingClientRect();
      const pRect = panel.getBoundingClientRect();
      const offX = e.clientX - pRect.left;
      const offY = e.clientY - pRect.top;
      const margin = 8;
      const onMove = (e2: PointerEvent) => {
        if (e2.pointerId !== pointerId) return;
        let left = e2.clientX - cRect.left - offX;
        let top = e2.clientY - cRect.top - offY;
        left = Math.max(margin, Math.min(left, cRect.width - margin - pRect.width));
        top = Math.max(margin, Math.min(top, cRect.height - margin - pRect.height));
        panel.setCssStyles({ left: `${left}px`, top: `${top}px`, right: '', bottom: '' });
      };
      const onUp = (e2: PointerEvent) => {
        if (e2.pointerId !== pointerId) return;
        activeDocument.removeEventListener('pointermove', onMove);
        activeDocument.removeEventListener('pointerup', onUp);
        activeDocument.removeEventListener('pointercancel', onUp);
      };
      activeDocument.addEventListener('pointermove', onMove);
      activeDocument.addEventListener('pointerup', onUp);
      activeDocument.addEventListener('pointercancel', onUp);
    });
  }

  // First-open anchor, beside the gear icon that opened it — same
  // measure-then-clamp approach as positionPenPicker. After this the panel
  // is freely draggable via bindDrag; it isn't re-anchored on subsequent
  // toggles within the same show(), only positioned fresh each time show()
  // rebuilds it (tool/color/eraser changes elsewhere don't touch this panel).
  private position(anchor: HTMLElement): void {
    const panel = this.el;
    if (!panel) return;
    const aRect = anchor.getBoundingClientRect();
    const cRect = this.container.getBoundingClientRect();
    const gap = 8;
    panel.setCssStyles({ top: `${aRect.top - cRect.top}px`, left: `${aRect.right - cRect.left + gap}px`, right: '', bottom: '' });
    const margin = 8;
    const pRect = panel.getBoundingClientRect();
    let top = pRect.top - cRect.top;
    let left = pRect.left - cRect.left;
    top = Math.max(margin, Math.min(top, cRect.height - margin - pRect.height));
    left = Math.max(margin, Math.min(left, cRect.width - margin - pRect.width));
    panel.setCssStyles({ top: `${top}px`, left: `${left}px`, right: '', bottom: '' });
  }
}
