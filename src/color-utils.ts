/**
 * Returns true if the hex color is "dark" (luminance < 0.35),
 * meaning white text/icons should be used on top of it.
 */
export function isDark(hex: string): boolean {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  // sRGB linearization
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance < 0.35;
}

/** Returns the CSS color (white or near-black) that should be used for icons/text on top of `hex`. */
export function contrastColor(hex: string): string {
  return isDark(hex) ? '#ffffff' : '#1a1a1a';
}
