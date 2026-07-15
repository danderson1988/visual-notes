import { App, Modal, Notice, TFile, requestUrl } from 'obsidian';

export interface CropOutput { blob: Blob; ext: string; }

const MAX_DISPLAY_W = 640;
const MAX_DISPLAY_H = 460;
const MIN_CROP_PX = 24; // in displayed (not natural) pixels

// Canvas.toBlob only reliably supports png/jpeg/webp across Electron/Chromium
// builds — anything else (gif, svg, bmp, avif, tiff, ico) falls back to a
// static PNG. This also means cropping an animated GIF necessarily produces
// a single still frame: drawImage only ever captures whatever frame the
// <img> happened to be showing at crop time, since canvas has no concept of
// multi-frame images.
function pickOutputFormat(sourceExt: string): { mime: string; ext: string } {
  const e = sourceExt.toLowerCase();
  if (e === 'jpg' || e === 'jpeg') return { mime: 'image/jpeg', ext: 'jpg' };
  if (e === 'webp') return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/png', ext: 'png' };
}

type HSide = 'l' | 'r' | 'm';
type VSide = 't' | 'b' | 'm';

// Freeform crop tool for an ImageCard, opened from its right-click menu.
// Never touches the original file: it always writes a new cropped image
// (caller saves it as a fresh vault asset and repoints the card at it), so
// the source — vault file or external URL — is left completely untouched.
export class CropImageModal extends Modal {
  private objectUrl: string | null = null;
  private img!: HTMLImageElement;
  private rectEl!: HTMLElement;
  private dimTop!: HTMLElement;
  private dimBottom!: HTMLElement;
  private dimLeft!: HTMLElement;
  private dimRight!: HTMLElement;
  private rect = { x: 0, y: 0, w: 0, h: 0 }; // displayed px, relative to the stage
  private displayW = 0;
  private displayH = 0;
  private naturalW = 0;
  private naturalH = 0;
  private readonly sourceExt: string;

  constructor(
    app: App,
    private source: { type: 'vault'; path: string } | { type: 'external'; url: string },
    private onSave: (out: CropOutput) => void,
  ) {
    super(app);
    const rawName = source.type === 'vault' ? source.path : source.url;
    this.sourceExt = (rawName.split('.').pop() ?? 'png').split('?')[0].toLowerCase();
    this.modalEl.addClass('visual-notes-crop-modal');
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Crop image' });
    const status = contentEl.createDiv({ cls: 'visual-notes-crop-status', text: 'Loading image…' });

    void (async () => {
      let buf: ArrayBuffer;
      try {
        if (this.source.type === 'vault') {
          const file = this.app.vault.getAbstractFileByPath(this.source.path);
          if (!(file instanceof TFile)) throw new Error('missing');
          buf = await this.app.vault.readBinary(file);
        } else {
          buf = await requestUrl({ url: this.source.url }).arrayBuffer;
        }
      } catch {
        status.setText('Could not load this image.');
        return;
      }

      // A same-origin blob: URL (rather than drawing the live <img> from the
      // card, which could be cross-origin for external sources) keeps the
      // canvas untainted so toBlob() below is guaranteed to work.
      this.objectUrl = URL.createObjectURL(new Blob([buf]));
      const img = new Image();
      img.onload = () => {
        status.remove();
        this.naturalW = img.naturalWidth; this.naturalH = img.naturalHeight;
        this.buildEditor(contentEl, img);
      };
      img.onerror = () => status.setText('Could not decode this image.');
      img.src = this.objectUrl;
    })();
  }

  override onClose(): void {
    this.contentEl.empty();
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
  }

  private buildEditor(contentEl: HTMLElement, img: HTMLImageElement): void {
    const scale = Math.min(1, MAX_DISPLAY_W / this.naturalW, MAX_DISPLAY_H / this.naturalH);
    this.displayW = Math.max(1, Math.round(this.naturalW * scale));
    this.displayH = Math.max(1, Math.round(this.naturalH * scale));

    if (this.sourceExt === 'gif') {
      contentEl.createDiv({
        cls: 'visual-notes-crop-hint',
        text: 'Cropping an animated GIF keeps only the current frame as a still image.',
      });
    }

    const stage = contentEl.createDiv('visual-notes-crop-stage');
    stage.style.width = `${this.displayW}px`;
    stage.style.height = `${this.displayH}px`;

    img.addClass('visual-notes-crop-img');
    img.style.width = `${this.displayW}px`;
    img.style.height = `${this.displayH}px`;
    stage.appendChild(img);
    this.img = img;

    // Dimming the area outside the crop is done with four separate bands
    // sized to exactly fit inside the stage, rather than the usual
    // giant-box-shadow-plus-overflow:hidden trick — that trick needs the
    // stage to clip overflow, which also clips the resize handles whenever
    // the crop touches an edge (see the bug this replaced).
    this.dimTop = stage.createDiv('visual-notes-crop-dim');
    this.dimBottom = stage.createDiv('visual-notes-crop-dim');
    this.dimLeft = stage.createDiv('visual-notes-crop-dim');
    this.dimRight = stage.createDiv('visual-notes-crop-dim');

    // Smaller than the full image and centered, so it reads clearly as "pick
    // a region" rather than "nearly everything is already selected."
    this.rect = { x: this.displayW * 0.25, y: this.displayH * 0.25, w: this.displayW * 0.5, h: this.displayH * 0.5 };
    const rectEl = stage.createDiv('visual-notes-crop-rect');
    this.rectEl = rectEl;
    this.syncRectEl();
    this.bindDrag(rectEl);

    const handles: Array<{ cls: string; x: HSide; y: VSide }> = [
      { cls: 'nw', x: 'l', y: 't' }, { cls: 'n', x: 'm', y: 't' }, { cls: 'ne', x: 'r', y: 't' },
      { cls: 'w', x: 'l', y: 'm' }, { cls: 'e', x: 'r', y: 'm' },
      { cls: 'sw', x: 'l', y: 'b' }, { cls: 's', x: 'm', y: 'b' }, { cls: 'se', x: 'r', y: 'b' },
    ];
    for (const h of handles) {
      const handleEl = rectEl.createDiv(`visual-notes-crop-handle visual-notes-crop-handle-${h.cls}`);
      this.bindResize(handleEl, h.x, h.y);
    }

    const btnRow = contentEl.createDiv('visual-notes-modal-buttons');
    btnRow.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    const saveBtn = btnRow.createEl('button', { text: 'Save crop', cls: 'mod-cta' });
    saveBtn.addEventListener('click', () => this.applyCrop());
  }

  private syncRectEl(): void {
    const { x, y, w, h } = this.rect;
    this.rectEl.style.left = `${x}px`;
    this.rectEl.style.top = `${y}px`;
    this.rectEl.style.width = `${w}px`;
    this.rectEl.style.height = `${h}px`;

    const set = (el: HTMLElement, l: number, t: number, ww: number, hh: number) => {
      el.style.left = `${l}px`; el.style.top = `${t}px`;
      el.style.width = `${Math.max(0, ww)}px`; el.style.height = `${Math.max(0, hh)}px`;
    };
    set(this.dimTop, 0, 0, this.displayW, y);
    set(this.dimBottom, 0, y + h, this.displayW, this.displayH - (y + h));
    set(this.dimLeft, 0, y, x, h);
    set(this.dimRight, x + w, y, this.displayW - (x + w), h);
  }

  private bindDrag(bodyEl: HTMLElement): void {
    bodyEl.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      const start = { ...this.rect };
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        this.rect.x = Math.min(Math.max(0, start.x + dx), this.displayW - this.rect.w);
        this.rect.y = Math.min(Math.max(0, start.y + dy), this.displayH - this.rect.h);
        this.syncRectEl();
      };
      const up = () => { activeDocument.removeEventListener('pointermove', move); activeDocument.removeEventListener('pointerup', up); };
      activeDocument.addEventListener('pointermove', move);
      activeDocument.addEventListener('pointerup', up);
    });
  }

  private bindResize(handleEl: HTMLElement, xSide: HSide, ySide: VSide): void {
    handleEl.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      const start = { ...this.rect };
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        let { x, y, w, h } = start;
        if (xSide === 'l') {
          x = Math.max(0, Math.min(start.x + dx, start.x + start.w - MIN_CROP_PX));
          w = start.x + start.w - x;
        } else if (xSide === 'r') {
          w = Math.max(MIN_CROP_PX, Math.min(start.w + dx, this.displayW - start.x));
        }
        if (ySide === 't') {
          y = Math.max(0, Math.min(start.y + dy, start.y + start.h - MIN_CROP_PX));
          h = start.y + start.h - y;
        } else if (ySide === 'b') {
          h = Math.max(MIN_CROP_PX, Math.min(start.h + dy, this.displayH - start.y));
        }
        this.rect = { x, y, w, h };
        this.syncRectEl();
      };
      const up = () => { activeDocument.removeEventListener('pointermove', move); activeDocument.removeEventListener('pointerup', up); };
      activeDocument.addEventListener('pointermove', move);
      activeDocument.addEventListener('pointerup', up);
    });
  }

  private applyCrop(): void {
    const scaleX = this.naturalW / this.displayW;
    const scaleY = this.naturalH / this.displayH;
    const sx = Math.round(this.rect.x * scaleX);
    const sy = Math.round(this.rect.y * scaleY);
    const sw = Math.max(1, Math.round(this.rect.w * scaleX));
    const sh = Math.max(1, Math.round(this.rect.h * scaleY));

    const canvas = activeDocument.createElement('canvas');
    canvas.width = sw; canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) { new Notice('Crop failed — canvas unavailable.'); return; }
    ctx.drawImage(this.img, sx, sy, sw, sh, 0, 0, sw, sh);

    const { mime, ext } = pickOutputFormat(this.sourceExt);
    canvas.toBlob((blob) => {
      if (!blob) { new Notice('Crop failed — could not encode the image.'); return; }
      this.onSave({ blob, ext });
      this.close();
    }, mime, 0.92);
  }
}
