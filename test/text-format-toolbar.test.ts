// @vitest-environment jsdom
//
// Mobile UX overhaul, phase 1: TextFormatToolbar (the rich-text selection
// popover) has no phone-specific sizing/positioning/keyboard-awareness and
// was the leading suspect for a report of editing taking over the whole
// iPhone screen with a white popup. It's now gated off entirely on
// Platform.isPhone (checked in scheduleCheck(), before the popover is ever
// created) — these tests lock in that the gate actually prevents the
// popover on phone, and doesn't regress it on desktop/iPad.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Platform } from 'obsidian';
import { TextFormatToolbar } from '../src/text-format-toolbar';

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = document.createElement('div');
  editor.contentEditable = 'true';
  editor.textContent = 'hello world';
  container.appendChild(editor);
  return { container, editor };
}

// jsdom doesn't fire 'selectionchange' automatically when a Range is added
// to a Selection (a real browser does) — dispatching it manually simulates
// what the browser would do after the user actually selects some text.
function selectAllTextIn(editor: HTMLElement): void {
  const textNode = editor.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, (textNode.textContent ?? '').length);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}

describe('TextFormatToolbar: gated off on phone (mobile UX phase 1)', () => {
  // jsdom has no real layout engine — Range.prototype.getClientRects isn't
  // implemented at all, which position() (run via a queued rAF once the
  // popover shows) calls unconditionally. Stubbed to an empty list so
  // position() takes its no-rects fallback path instead of throwing; the
  // actual pixel position isn't what these gating tests care about.
  let originalGetClientRects: (() => DOMRectList) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  });
  afterEach(() => {
    vi.useRealTimers();
    Platform.isPhone = false;
    document.body.innerHTML = '';
    if (originalGetClientRects) Range.prototype.getClientRects = originalGetClientRects;
  });

  it('never creates the popover when Platform.isPhone is true', async () => {
    Platform.isPhone = true;
    const { container, editor } = setup();
    new TextFormatToolbar(editor, container, container);

    selectAllTextIn(editor);
    await vi.advanceTimersByTimeAsync(150); // past the 100ms debounce

    expect(container.querySelector('.visual-notes-text-fmt-toolbar')).toBeNull();
  });

  it('still shows the popover when Platform.isPhone is false (desktop/iPad unaffected)', async () => {
    Platform.isPhone = false;
    const { container, editor } = setup();
    new TextFormatToolbar(editor, container, container);

    selectAllTextIn(editor);
    await vi.advanceTimersByTimeAsync(150);

    expect(container.querySelector('.visual-notes-text-fmt-toolbar')).not.toBeNull();
  });
});
