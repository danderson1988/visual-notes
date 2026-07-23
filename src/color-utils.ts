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

/**
 * True for a plain 6-digit hex color ("#FDE68A"), false for anything else —
 * in particular a CSS var()/keyword reference like "var(--ib-card-bg)",
 * which isDark()/contrastColor() can't meaningfully evaluate (they'd just
 * parseInt() garbage out of it). Callers use this to skip per-card contrast
 * computation for theme-driven default colors and fall back to the
 * matching CSS-level text color instead.
 */
export function isHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}
