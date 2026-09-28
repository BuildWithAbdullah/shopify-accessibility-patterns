import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { stripComments } from '../tools/source.mjs';
import {
  REGION_ATTRIBUTES,
  CLEAR_DELAY_MS,
  politenessFor,
  plan,
  announced,
  mustExistBeforeFirstMessage,
  hidingIsSafe
} from '../tools/announce.mjs';

const RAW = readFileSync(fileURLToPath(new URL('../assets/a11y-announcer.js', import.meta.url)), 'utf8');

/* The asset explains in a comment why it must not use display:none, so a check
   for that string has to read the code and not the prose. */
const ASSET = stripComments(RAW);

/* -------------------------------------------------------------------------
   Politeness
   ------------------------------------------------------------------------- */

test('cart, variant, filter and status updates are polite', () => {
  for (const kind of ['cart', 'variant', 'filter', 'status', 'anything-else']) {
    assert.equal(politenessFor(kind), 'polite', kind);
  }
});

test('only a message that stops the user proceeding is assertive', () => {
  assert.equal(politenessFor('error'), 'assertive');
  assert.equal(politenessFor('blocking'), 'assertive');
});

/* -------------------------------------------------------------------------
   The two step write
   ------------------------------------------------------------------------- */

test('a message is cleared now and written on the next frame', () => {
  const steps = plan('Added to cart. 3 items, 84.00.');
  assert.equal(steps[0].at, 'now');
  assert.equal(steps[0].text, '');
  assert.equal(steps[1].at, 'next-frame');
  assert.equal(steps[1].text, 'Added to cart. 3 items, 84.00.');
});

test('the region is cleared again afterwards, so it is not re-read on review', () => {
  const steps = plan('Added to cart.');
  assert.deepEqual(steps[steps.length - 1], { at: CLEAR_DELAY_MS, text: '' });
});

test('an empty message plans nothing', () => {
  assert.deepEqual(plan(''), []);
  assert.deepEqual(plan(undefined), []);
});

/* The clear step is not an optimisation to skip when the text has not changed.
   Adding the same product twice writes the same string twice, and without the
   clear there is no mutation the second time, so nothing is announced. */
test('the same message twice is announced twice because of the clear step', () => {
  const first = plan('Added to cart.');
  const second = plan('Added to cart.', { existingText: 'Added to cart.' });
  const writes = [...first, ...second].map((step) => step.text);
  assert.deepEqual(announced(writes), ['Added to cart.', 'Added to cart.']);
});

test('without the clear step the second identical message is silent', () => {
  assert.deepEqual(announced(['Added to cart.', 'Added to cart.']), ['Added to cart.']);
});

test('two different messages in a row are both announced', () => {
  assert.deepEqual(announced(['', 'One item added.', '', 'Two items added.']), [
    'One item added.',
    'Two items added.'
  ]);
});

test('the region has to be in the document before the first message', () => {
  assert.equal(mustExistBeforeFirstMessage(), true);
});

/* -------------------------------------------------------------------------
   Hiding the region
   ------------------------------------------------------------------------- */

test('the off screen clip recipe is safe', () => {
  assert.equal(
    hidingIsSafe({
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      'clip-path': 'inset(50%)'
    }),
    true
  );
});

test('display none, visibility hidden and content-visibility hidden are not', () => {
  assert.equal(hidingIsSafe({ display: 'none' }), false);
  assert.equal(hidingIsSafe({ visibility: 'hidden' }), false);
  assert.equal(hidingIsSafe({ 'content-visibility': 'hidden' }), false);
});

test('property names are compared without regard to case', () => {
  assert.equal(hidingIsSafe({ Display: 'None' }), false);
});

/* -------------------------------------------------------------------------
   The asset and this module cannot drift
   ------------------------------------------------------------------------- */

test('the asset sets every attribute this module specifies', () => {
  for (const [name, value] of Object.entries(REGION_ATTRIBUTES)) {
    assert.ok(ASSET.includes(`'${value}'`), `asset does not set ${name} to ${value}`);
  }
});

test('the region is polite, not assertive', () => {
  assert.equal(REGION_ATTRIBUTES['aria-live'], 'polite');
  assert.equal(ASSET.includes("'assertive'"), false);
});

test('the asset clears after the delay this module specifies', () => {
  assert.ok(ASSET.includes(String(CLEAR_DELAY_MS)));
});

test('the asset writes on a later frame rather than in the same tick', () => {
  assert.match(ASSET, /requestAnimationFrame/);
  const clearBeforeWrite = ASSET.indexOf("el.textContent = ''") < ASSET.indexOf('requestAnimationFrame');
  assert.equal(clearBeforeWrite, true);
});

test('the asset does not hide the region in a way that stops it being observed', () => {
  assert.equal(/display\s*:\s*none/.test(ASSET), false);
  assert.equal(/visibility\s*:\s*hidden/.test(ASSET), false);
});

test('the asset reuses an existing region rather than adding a second one', () => {
  assert.match(ASSET, /getElementById\('a11y-live-region'\)/);
});

/* -------------------------------------------------------------------------
   Reading code rather than prose
   ------------------------------------------------------------------------- */

test('stripping comments leaves the code and removes the prose', () => {
  assert.equal(stripComments('a = 1; // never display:none\nb = 2;').includes('display:none'), false);
  assert.match(stripComments('a = 1; // note\nb = 2;'), /b = 2;/);
});

test('stripping comments does not touch a comment sequence inside a string', () => {
  assert.match(stripComments("var s = 'http://example.com';"), /http:\/\/example\.com/);
  assert.match(stripComments('var s = "/* not a comment */";'), /not a comment/);
});

test('stripping comments keeps the line count, so reported lines stay true', () => {
  const stripped = stripComments('/* one\n   two */\nthird();');
  assert.equal(stripped.split('\n').length, 3);
});

test('the asset still contains its own prose before stripping', () => {
  assert.match(RAW, /display:none/);
});
