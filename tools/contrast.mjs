/* ---------------------------------------------------------------------------
   contrast.mjs
   WCAG 2.x relative luminance and contrast ratio.

   This exists because the numbers in this repository's documentation are
   claims, and a claim about a colour pair is the easiest kind of claim to
   check. The CSS contract in tools/css-contract.mjs uses it to assert that the
   border colour the baseline stylesheet ships actually clears 3:1 against
   white, and that the hairline grey it warns about actually does not.

   What it cannot tell you: whether the colour pair it is given is the pair a
   visitor sees. Opacity, overlapping layers, background images, gradients and
   colour scheme inheritance all change the effective background, and none of
   them are visible to a function that takes two hex strings. A passing ratio
   here is a passing ratio for those two colours and nothing more.
   --------------------------------------------------------------------------- */

/** Parse #rgb, #rrggbb, or "r g b" / "r, g, b" into a [r, g, b] triple 0-255. */
export function parseColour(input) {
  const value = String(input).trim();

  const hex = value.replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16)
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
  }

  const rgb = value.match(/-?\d+(\.\d+)?/g);
  if (rgb && rgb.length >= 3) {
    return rgb.slice(0, 3).map((n) => Math.round(Number(n)));
  }

  throw new Error(`Cannot read "${input}" as a colour`);
}

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 for black and 1 for white. */
export function luminance(colour) {
  const [r, g, b] = Array.isArray(colour) ? colour : parseColour(colour);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, 1 to 21, order independent. */
export function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Rounded the way WCAG reporting tools round, down to two places. */
export function ratioRounded(a, b) {
  return Math.floor(ratio(a, b) * 100) / 100;
}

/**
 * Does this pair meet a given requirement?
 * kind: 'text' is 1.4.3 at 4.5:1, 'large-text' is 3:1, 'non-text' is 1.4.11
 * at 3:1 for user interface component boundaries and graphical objects.
 */
export function meets(a, b, kind = 'text') {
  const required = kind === 'text' ? 4.5 : 3;
  return ratio(a, b) >= required;
}
