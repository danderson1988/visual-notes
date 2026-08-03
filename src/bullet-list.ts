// Bullet-list toggling for the sticky/Note rich-text editor.
//
// Lives outside TextFormatToolbar because the button that drives it sits in
// the card's floating context bar, not in the selection popover: unlike
// bold/italic/colour, a list is a block-level change that makes sense with
// nothing selected at all — you point at a line and turn it into a bullet.
// The selection popover only ever appears once text is selected, so it was
// the wrong host for it.
//
// Hand-rolled rather than document.execCommand('insertUnorderedList'): this
// codebase already dropped execCommand elsewhere for being deprecated (see
// the caret-insert comment in freeform-view-cards-table.ts).

// Toggles bullets on whatever the selection touches. A collapsed selection
// (a caret sitting in a line) is fully supported and toggles just that line.
// Returns false when there was nothing to act on, so callers can skip the
// undo push and save.
export function toggleBulletList(editor: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;

  const blocks = blocksInRange(editor, range);
  if (!blocks.length) return false;

  const existingItems = blocks.filter(b => b.tagName === 'LI');
  if (existingItems.length === blocks.length) unwrapListItems(editor, existingItems);
  else wrapBlocksInList(blocks);
  // Bulleting already-enlarged text lands the size on a span inside the new
  // item, which would leave the marker at base size.
  hoistListItemSizes(editor);

  editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
  return true;
}

// The editor's own top-level children that the range touches. Content seeded
// from MarkdownRenderer arrives as <p> blocks, but a freshly typed line can
// still be a bare text node — normalized into a block here so both shapes
// take the same path below.
function blocksInRange(editor: HTMLElement, range: Range): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const node of Array.from(editor.childNodes)) {
    if (!range.intersectsNode(node)) continue;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      // A <ul> in range contributes its <li>s, not itself — but only the
      // ones actually touched. Taking every child would mean a caret resting
      // in one item un-bulleted the entire list.
      if (el.tagName === 'UL') {
        out.push(...(Array.from(el.children) as HTMLElement[]).filter(li => range.intersectsNode(li)));
      } else out.push(el);
    } else if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) {
      const p = createEl('p');
      node.parentNode!.insertBefore(p, node);
      p.appendChild(node);
      out.push(p);
    }
  }
  return out;
}

function wrapBlocksInList(blocks: HTMLElement[]): void {
  const ul = createEl('ul');
  blocks[0].parentNode!.insertBefore(ul, blocks[0]);
  for (const block of blocks) {
    const li = createEl('li');
    // Carry a size set on the paragraph across, so toggling bullets on
    // doesn't quietly reset a resized line back to base.
    if (block.style.fontSize) li.style.fontSize = block.style.fontSize;
    while (block.firstChild) li.appendChild(block.firstChild);
    ul.appendChild(li);
    block.remove();
  }
}

function unwrapListItems(editor: HTMLElement, items: HTMLElement[]): void {
  // `tail` keeps a run of unwrapped items in document order — without it
  // each one would be inserted at the same anchor and come out reversed.
  let tail: Node | null = null;
  for (const li of items) {
    const ul = li.parentElement;
    if (!ul) continue;
    const p = createEl('p');
    // Carry the item's size back out, so un-bulleting a big line doesn't
    // silently shrink it.
    if (li.style.fontSize) p.style.fontSize = li.style.fontSize;
    while (li.firstChild) p.appendChild(li.firstChild);
    // Items still above this one mean the list is being split, so the
    // paragraph belongs after the <ul> rather than before it.
    const splitting = !!li.previousElementSibling;
    li.remove();
    const parent = ul.parentNode!;
    if (splitting) parent.insertBefore(p, tail ? tail.nextSibling : ul.nextSibling);
    else parent.insertBefore(p, ul);
    tail = p;
  }
  // Drop any list left with no items rather than leaving an empty <ul>
  // behind, which would swallow the next toggle-on.
  for (const ul of Array.from(editor.querySelectorAll('ul'))) {
    if (!ul.children.length) ul.remove();
  }
}

// A bullet marker is sized by its <li>, not by anything nested inside it, so
// sizing text within an item gives a big line next to a tiny bullet. When one
// size covers the item's whole text, move it onto the <li> itself.
export function hoistListItemSizes(editor: HTMLElement): void {
  // Selecting a whole list puts the size on a <span> wrapping the <ul>
  // instead of inside an item — push it down to the items, which is the only
  // level the marker reads.
  for (const span of Array.from(editor.querySelectorAll('span'))) {
    const size = span.style.fontSize;
    if (!size) continue;
    const lists = Array.from(span.querySelectorAll('ul'));
    if (!lists.length) continue;
    for (const ul of lists) {
      for (const li of Array.from(ul.children)) {
        // instanceOf, not instanceof: a board open in a popout window has its
        // own HTMLElement global, which a plain instanceof would miss.
        if (li.instanceOf(HTMLElement) && !li.style.fontSize) li.style.fontSize = size;
      }
    }
    span.style.removeProperty('font-size');
    if (!span.getAttribute('style') && !span.className) {
      span.replaceWith(...Array.from(span.childNodes));
    }
  }

  for (const li of Array.from(editor.querySelectorAll('li'))) {
    if (li.style.fontSize) continue;
    const sized = Array.from(li.querySelectorAll<HTMLElement>('*')).filter(el => el.style.fontSize);
    if (!sized.length) continue;

    const size = sized[0].style.fontSize;
    if (!sized.every(el => el.style.fontSize === size)) continue;
    // Only when one size covers the item's entire text. A part-resized line
    // keeps its base-size marker, which is the right answer — the line itself
    // hasn't changed size, just a word inside it.
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
