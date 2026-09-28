import test from 'node:test';
import assert from 'node:assert/strict';

import { parseColour, luminance, ratio, ratioRounded, meets } from '../tools/contrast.mjs';

test('colours are read from short hex, long hex and an rgb triple', () => {
  assert.deepEqual(parseColour('#fff'), [255, 255, 255]);
  assert.deepEqual(parseColour('#767676'), [118, 118, 118]);
  assert.deepEqual(parseColour('18 18 18'), [18, 18, 18]);
  assert.deepEqual(parseColour('rgb(176, 0, 32)'), [176, 0, 32]);
  assert.throws(() => parseColour('rebeccapurple'));
});

test('luminance is 0 for black and 1 for white', () => {
  assert.equal(luminance('#000'), 0);
  assert.equal(luminance('#fff'), 1);
});

test('black on white is 21 to 1', () => {
  assert.equal(ratioRounded('#000', '#fff'), 21);
});

test('the ratio does not depend on the order of the pair', () => {
  assert.equal(ratio('#767676', '#ffffff'), ratio('#ffffff', '#767676'));
});

/* These are the two numbers the baseline stylesheet's comment asserts in prose.
   Checking them here is the point: the claim in the comment and the colour in
   the rule are now the same fact. */
test('the border grey the stylesheet ships clears 4.5 to 1 on white', () => {
  assert.equal(ratioRounded('#767676', '#ffffff'), 4.54);
  assert.equal(meets('#767676', '#ffffff', 'text'), true);
});

test('the hairline grey the stylesheet warns about is nowhere near 3 to 1', () => {
  assert.equal(ratioRounded('#ddd', '#ffffff'), 1.35);
  assert.equal(meets('#ddd', '#ffffff', 'non-text'), false);
});

test('the non-text threshold is 3 to 1 and the text threshold is 4.5 to 1', () => {
  // #949494 on white is about 3.07:1, which passes 1.4.11 and fails 1.4.3.
  assert.equal(meets('#949494', '#ffffff', 'non-text'), true);
  assert.equal(meets('#949494', '#ffffff', 'text'), false);
});

test('a pair either side of the boundary is judged the same way a reporting tool judges it', () => {
  // #767676 is the lightest grey that reaches 4.5:1 on white, and one step
  // lighter does not. This is why it appears in so many remediations.
  assert.equal(meets('#767676', '#ffffff', 'text'), true);
  assert.equal(meets('#777777', '#ffffff', 'text'), false);
});
