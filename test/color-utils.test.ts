import { describe, it, expect } from 'vitest';
import { isDark, contrastColor, isHexColor } from '../src/color-utils';

describe('color-utils: isHexColor', () => {
  it('accepts a plain 6-digit hex color', () => {
    expect(isHexColor('#FDE68A')).toBe(true);
    expect(isHexColor('#000000')).toBe(true);
    expect(isHexColor('#abcdef')).toBe(true);
  });

  it('rejects a CSS var()/keyword reference', () => {
    expect(isHexColor('var(--ib-card-bg)')).toBe(false);
    expect(isHexColor('var(--background-primary)')).toBe(false);
    expect(isHexColor('transparent')).toBe(false);
  });

  it('rejects malformed or short hex strings', () => {
    expect(isHexColor('#fff')).toBe(false); // 3-digit shorthand not supported by isDark's parser
    expect(isHexColor('FDE68A')).toBe(false); // missing '#'
    expect(isHexColor('')).toBe(false);
  });
});

describe('color-utils: contrastColor against the actual default sticky palette', () => {
  // The reported bug: every default sticky preset is a pale/pastel color,
  // and text was using a single theme-level color regardless of the card's
  // own background — white theme text on a pale yellow sticky was reported
  // as "barely readable". Every one of these should read as light (needing
  // dark text) once contrast is computed per-card instead.
  const STICKY_PRESETS = [
    '#FDE68A', '#FCA5A5', '#86EFAC', '#93C5FD', '#C4B5FD',
    '#FBB6CE', '#FCD34D', '#A7F3D0', '#D1D5DB', '#F3F4F6',
  ];

  it('every default sticky preset gets dark text for readability', () => {
    for (const hex of STICKY_PRESETS) {
      expect(isDark(hex)).toBe(false);
      expect(contrastColor(hex)).toBe('#1a1a1a');
    }
  });
});
