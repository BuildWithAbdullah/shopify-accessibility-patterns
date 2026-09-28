import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { audit, failures, MIN_OUTLINE_PX, MIN_TARGET_PX, MIN_BOUNDARY_RATIO } from '../tools/css-contract.mjs';

const BASE = readFileSync(fileURLToPath(new URL('../assets/a11y-base.css', import.meta.url)), 'utf8');

function idsOf(source) {
  return failures(source).map((item) => item.id);
}

test('the stylesheet this repository ships meets every guarantee', () => {
  const failed = failures(BASE);
  assert.deepEqual(
    failed.map((item) => `${item.id}: ${item.detail}`),
    []
  );
});

test('the audit reports one result per guarantee, passing or failing', () => {
  const results = audit(BASE);
  assert.ok(results.length >= 10);
  assert.equal(new Set(results.map((r) => r.id)).size, results.length);
  for (const result of results) {
    assert.equal(typeof result.detail, 'string');
    assert.ok(result.detail.length > 0, `${result.id} explains itself`);
  }
});

test('every failure carries the line it is on where there is one to carry', () => {
  const broken = BASE.replace('outline-offset: 2px;', 'outline: none;');
  const offsetFailure = failures(broken).find((item) => item.id === 'no-outline-reset');
  assert.ok(offsetFailure);
  assert.equal(typeof offsetFailure.line, 'number');
});

/* Each of these mutates the real stylesheet in one way and checks that the
   contract notices. A contract that only ever sees a correct file is not a
   contract. */

test('replacing the visually hidden recipe with display none is caught', () => {
  const broken = BASE.replace('position: absolute !important;', 'display: none;');
  assert.ok(idsOf(broken).includes('visually-hidden-recipe'));
});

test('hiding the visually hidden utility with visibility hidden is caught', () => {
  const broken = BASE.replace('overflow: hidden;', 'overflow: hidden; visibility: hidden;');
  assert.ok(idsOf(broken).includes('visually-hidden-stays-rendered'));
});

test('thinning the focus ring below the minimum is caught', () => {
  const broken = BASE.replace('outline: 3px solid rgb(var(--color-foreground, 18 18 18));', 'outline: 1px solid rgb(var(--color-foreground, 18 18 18));');
  assert.ok(idsOf(broken).includes('focus-indicator-thickness'));
  assert.equal(MIN_OUTLINE_PX, 2);
});

test('removing the outline offset is caught', () => {
  const broken = BASE.replace('  outline-offset: 2px;\n}', '}');
  assert.ok(idsOf(broken).includes('focus-indicator-offset'));
});

test('an outline reset anywhere in the sheet is caught', () => {
  const broken = `${BASE}\n.theme-override:focus { outline: none; }\n`;
  assert.ok(idsOf(broken).includes('no-outline-reset'));
});

test('an outline width of zero counts as a reset', () => {
  const broken = `${BASE}\n.theme-override:focus { outline-width: 0; }\n`;
  assert.ok(idsOf(broken).includes('no-outline-reset'));
});

test('dropping the forced colours fallback is caught', () => {
  const broken = BASE.replace('@media (forced-colors: active)', '@media (min-width: 40em)');
  assert.ok(idsOf(broken).includes('forced-colors-fallback'));
});

test('dropping the reduced motion block is caught', () => {
  const broken = BASE.replace('@media (prefers-reduced-motion: reduce)', '@media (min-width: 40em)');
  const ids = idsOf(broken);
  assert.ok(ids.includes('reduced-motion-block'));
  assert.ok(ids.includes('reduced-motion-covers-transitions'));
});

test('a reduced motion block that only touches animation is caught', () => {
  const broken = BASE.replace('    transition-duration: 0.01ms !important;\n', '');
  assert.ok(idsOf(broken).includes('reduced-motion-covers-transitions'));
});

test('hiding content inside the reduced motion block is caught', () => {
  const broken = BASE.replace(
    '    animation-duration: 0.01ms !important;',
    '    animation-duration: 0.01ms !important;\n    display: none;'
  );
  assert.ok(idsOf(broken).includes('reduced-motion-does-not-hide'));
});

test('shrinking the target utility below the level AA minimum is caught', () => {
  const broken = BASE.replace('  min-width: 24px;\n  min-height: 24px;', '  min-width: 16px;\n  min-height: 16px;');
  assert.ok(idsOf(broken).includes('target-size-minimum'));
  assert.equal(MIN_TARGET_PX, 24);
});

/* The number in the comment and the colour in the rule are now the same fact:
   swapping the border grey for the hairline the comment warns about fails. */
test('a control boundary that does not clear 3 to 1 is caught', () => {
  const broken = BASE.replace('border: 1px solid #767676;', 'border: 1px solid #dddddd;');
  const failure = failures(broken).find((item) => item.id === 'control-boundary-contrast');
  assert.ok(failure);
  assert.match(failure.detail, /1\.35:1/);
  assert.equal(MIN_BOUNDARY_RATIO, 3);
});

test('moving horizontal scrolling onto the page is caught', () => {
  const broken = `${BASE}\nbody { overflow-x: auto; }\n`;
  assert.ok(idsOf(broken).includes('reflow-scoped-to-component'));
});

test('an empty stylesheet fails rather than passing by having nothing to check', () => {
  assert.ok(failures('').length > 5);
});
