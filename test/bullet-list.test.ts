// @vitest-environment jsdom
//
// Bullet toggling for the sticky/Note editor. Split out of TextFormatToolbar
// once the button moved to the card's floating context bar: a list is a
// block-level change that makes sense with nothing selected, but the
// selection popover only ever appears once text *is* selected, so it could
// never host the no-selection case.
import { describe, it, expect, afterEach } from 'vitest';
import { toggleBulletList } from '../src/bullet-list';

function editorWith(html: string): HTMLElement {
  const editor = document.createElement('div');
  editor.contentEditable = 'true';
  editor.innerHTML = html;
  document.body.appendChild(editor);
  return editor;
}

function selectBlocks(editor: HTMLElement, from: number, to: number): void {
  const range = document.createRange();
  range.setStartBefore(editor.children[from]);
  range.setEndAfter(editor.children[to]);
  const sel = window.getSelection()!;
  sel.removeAllRanges(); sel.addRange(range);
}

// A caret, not a selection — the case the context-bar button exists for.
function placeCaretIn(node: Node, offset = 0): void {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges(); sel.addRange(range);
}

afterEach(() => { document.body.innerHTML = ''; });

describe('bullet list: toggling', () => {
  it('wraps the selected paragraphs into a single <ul> of <li>s', () => {
    const editor = editorWith('<p>milk</p><p>eggs</p>');
    selectBlocks(editor, 0, 1);

    expect(toggleBulletList(editor)).toBe(true);

    expect(editor.querySelectorAll('ul')).toHaveLength(1);
    expect(Array.from(editor.querySelectorAll('li')).map(li => li.textContent)).toEqual(['milk', 'eggs']);
  });

  it('toggles an existing list back off into paragraphs, preserving order', () => {
    const editor = editorWith('<ul><li>milk</li><li>eggs</li></ul>');
    const range = document.createRange();
    range.selectNodeContents(editor.querySelector('ul')!);
    const sel = window.getSelection()!;
    sel.removeAllRanges(); sel.addRange(range);

    toggleBulletList(editor);

    expect(editor.querySelector('ul')).toBeNull();
    expect(Array.from(editor.querySelectorAll('p')).map(p => p.textContent)).toEqual(['milk', 'eggs']);
  });

  it('promotes a bare text node (a freshly typed line) into a list item', () => {
    const editor = editorWith('');
    editor.appendChild(document.createTextNode('milk'));
    const range = document.createRange();
    range.selectNodeContents(editor);
    const sel = window.getSelection()!;
    sel.removeAllRanges(); sel.addRange(range);

    toggleBulletList(editor);

    expect(editor.querySelectorAll('ul > li')).toHaveLength(1);
    expect(editor.querySelector('li')!.textContent).toBe('milk');
  });

  it('reports false when the selection is outside the editor, so no undo is pushed', () => {
    const editor = editorWith('<p>milk</p>');
    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    document.body.appendChild(outside);
    placeCaretIn(outside.firstChild!, 0);

    expect(toggleBulletList(editor)).toBe(false);
    expect(editor.querySelector('ul')).toBeNull();
  });
});

describe('bullet list: works from a caret, with nothing selected', () => {
  // The whole reason the button moved to the context bar — you point at a
  // line and bullet it, without having to select the text first.
  it('bullets the line the caret sits in', () => {
    const editor = editorWith('<p>milk</p><p>eggs</p>');
    placeCaretIn(editor.children[1].firstChild!, 2);

    expect(toggleBulletList(editor)).toBe(true);

    // Only the caret's own line becomes an item; the other is untouched.
    expect(Array.from(editor.querySelectorAll('li')).map(li => li.textContent)).toEqual(['eggs']);
    expect(editor.querySelector('p')!.textContent).toBe('milk');
  });

  it('un-bullets the item the caret sits in', () => {
    const editor = editorWith('<ul><li>milk</li><li>eggs</li></ul>');
    placeCaretIn(editor.querySelectorAll('li')[0].firstChild!, 1);

    toggleBulletList(editor);

    expect(Array.from(editor.querySelectorAll('li')).map(li => li.textContent)).toEqual(['eggs']);
    expect(editor.querySelector('p')!.textContent).toBe('milk');
  });
});

describe('bullet list: sizes travel with the item', () => {
  it('carries a size onto the item when bulleting already-enlarged text', () => {
    const editor = editorWith('<p style="font-size:2em">milk</p>');
    selectBlocks(editor, 0, 0);

    toggleBulletList(editor);

    expect(editor.querySelector('li')!.style.fontSize).toBe('2em');
  });

  it('carries the size back out when un-bulleting, rather than shrinking the line', () => {
    const editor = editorWith('<ul><li style="font-size:2em">milk</li></ul>');
    const range = document.createRange();
    range.selectNodeContents(editor.querySelector('ul')!);
    const sel = window.getSelection()!;
    sel.removeAllRanges(); sel.addRange(range);

    toggleBulletList(editor);

    expect(editor.querySelector('p')!.style.fontSize).toBe('2em');
  });

  it('hoists a size sitting on a span inside the new item onto the item itself', () => {
    // Otherwise the marker — sized by the <li>, never by a nested span —
    // stays tiny beside its own enlarged text.
    const editor = editorWith('<p><span style="font-size:2.5em">milk</span></p>');
    selectBlocks(editor, 0, 0);

    toggleBulletList(editor);

    const li = editor.querySelector('li')!;
    expect(li.style.fontSize).toBe('2.5em');
    expect(li.querySelector('[style*="font-size"]')).toBeNull();
  });
});
