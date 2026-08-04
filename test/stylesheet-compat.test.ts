// Obsidian's plugin health check lints styles.css against browser-support
// data and warns on anything marked "partially supported", judging by the
// caniuse *feature*, not by the specific value you wrote. `text-indent` is
// the case that caught us in 1.1.21: the feature is partial only because of
// the `hanging` and `each-line` keywords, while the plain length we used has
// been universally supported for decades. The warning is still a warning, and
// a clean health check is worth more than one line of CSS.
//
// This runs on the raw stylesheet rather than the DOM because jsdom has no
// layout engine and would happily accept anything.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
// Comments discuss these properties by name — match declarations only.
const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');

// Property names Obsidian's checker flags. Add to this list as the checker
// reports them; each entry needs a supported alternative, not a suppression.
const FLAGGED = ['text-indent'];

describe('stylesheet: no browser features Obsidian flags as partial', () => {
  for (const prop of FLAGGED) {
    it(`declares no ${prop}`, () => {
      const found = declarations.match(new RegExp(`(^|[;{\\s])${prop}\\s*:`, 'g'));
      expect(found).toBe(null);
    });
  }
});

describe('stylesheet: bullet hanging indent survives without text-indent', () => {
  // The indent is what keeps continuation lines (Shift+Enter, natural wraps,
  // a multi-paragraph item) under the text instead of under the marker. It is
  // now built from two halves that only work as a pair, so assert both: the
  // <li> pads the text across, and the marker alone is pulled back out of
  // that padding by exactly the same distance.
  it('pads the item across by the full indent', () => {
    expect(declarations).toMatch(
      /\.visual-notes-sticky-editor li \{[^}]*padding-left:\s*var\(--vn-bullet-indent\)/,
    );
  });

  it('pulls the marker back out of the padding by the same distance', () => {
    expect(declarations).toMatch(
      /\.visual-notes-sticky-editor li::before \{[^}]*margin-left:\s*calc\(-1 \* var\(--vn-bullet-indent\)\)/,
    );
  });

  it('derives the indent from the two tunable knobs', () => {
    expect(declarations).toMatch(
      /--vn-bullet-indent:\s*calc\(var\(--vn-bullet-w\) \+ var\(--vn-bullet-gap\)\)/,
    );
  });
});
