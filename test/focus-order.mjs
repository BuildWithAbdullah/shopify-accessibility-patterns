import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  FOCUSABLE,
  FOCUSABLE_SELECTORS,
  onKeydown,
  openTarget,
  closeTarget,
  inertSiblings,
  inCycle
} from '../tools/focus-order.mjs';

const ASSET = readFileSync(fileURLToPath(new URL('../assets/a11y-focus-trap.js', import.meta.url)), 'utf8');

/* -------------------------------------------------------------------------
   Tab handling
   ------------------------------------------------------------------------- */

test('Tab from the last control wraps to the first', () => {
  assert.deepEqual(onKeydown({ key: 'Tab', count: 4, index: 3 }), {
    action: 'wrap',
    focus: 0,
    preventDefault: true
  });
});

test('Shift and Tab from the first control wraps to the last', () => {
  assert.deepEqual(onKeydown({ key: 'Tab', shiftKey: true, count: 4, index: 0 }), {
    action: 'wrap',
    focus: 3,
    preventDefault: true
  });
});

/* A trap that calls preventDefault on every Tab has taken focus movement away
   from the browser, and with it every edge case the browser already handles. */
test('Tab in the middle of the cycle is left to the browser', () => {
  for (const index of [1, 2]) {
    const result = onKeydown({ key: 'Tab', count: 4, index });
    assert.equal(result.action, 'pass');
    assert.equal(result.preventDefault, false);
  }
});

test('Shift and Tab in the middle of the cycle is left to the browser', () => {
  const result = onKeydown({ key: 'Tab', shiftKey: true, count: 4, index: 2 });
  assert.equal(result.action, 'pass');
  assert.equal(result.preventDefault, false);
});

test('a single control is both ends of the cycle, so Tab stays on it', () => {
  assert.deepEqual(onKeydown({ key: 'Tab', count: 1, index: 0 }), {
    action: 'wrap',
    focus: 0,
    preventDefault: true
  });
  assert.deepEqual(onKeydown({ key: 'Tab', shiftKey: true, count: 1, index: 0 }), {
    action: 'wrap',
    focus: 0,
    preventDefault: true
  });
});

test('an empty dialog holds focus rather than letting Tab escape behind the overlay', () => {
  const result = onKeydown({ key: 'Tab', count: 0, index: -1 });
  assert.equal(result.preventDefault, true);
  assert.equal(result.focus, null);
});

test('focus that has escaped the dialog is pulled back to the near end', () => {
  assert.deepEqual(onKeydown({ key: 'Tab', count: 3, index: -1 }), {
    action: 'recover',
    focus: 0,
    preventDefault: true
  });
  assert.deepEqual(onKeydown({ key: 'Tab', shiftKey: true, count: 3, index: -1 }), {
    action: 'recover',
    focus: 2,
    preventDefault: true
  });
});

test('Escape closes, and is the only key besides Tab that is handled', () => {
  assert.equal(onKeydown({ key: 'Escape', count: 3, index: 1 }).action, 'close');
  for (const key of ['Enter', 'ArrowDown', 'a', ' ', 'Home']) {
    assert.equal(onKeydown({ key, count: 3, index: 1 }).action, 'pass', key);
  }
});

/* -------------------------------------------------------------------------
   Opening and closing
   ------------------------------------------------------------------------- */

test('an explicit initial target wins over the first control', () => {
  assert.deepEqual(openTarget({ hasExplicitInitial: true, count: 3 }), {
    target: 'initial',
    needsTabindex: false
  });
});

test('the first control takes focus when there is no explicit target', () => {
  assert.deepEqual(openTarget({ count: 3 }), { target: 'first', needsTabindex: false });
});

/* focus() on an element that cannot hold focus does nothing at all, silently,
   which leaves the user outside a dialog that has made the page inert. */
test('an empty dialog takes focus itself and needs a tabindex to be able to', () => {
  assert.deepEqual(openTarget({ count: 0, dialogHasTabindex: false }), {
    target: 'dialog',
    needsTabindex: true
  });
  assert.deepEqual(openTarget({ count: 0, dialogHasTabindex: true }), {
    target: 'dialog',
    needsTabindex: false
  });
});

test('focus returns to the opener when it is still in the document', () => {
  assert.equal(closeTarget({ hadOpener: true, openerStillInDocument: true }), 'opener');
});

/* A quick add button opens a drawer, the drawer re-renders the section behind
   it, and the opener is gone by the time the drawer closes. */
test('focus falls back to the body when the opener has been re-rendered away', () => {
  assert.equal(closeTarget({ hadOpener: true, openerStillInDocument: false }), 'body');
  assert.equal(closeTarget({ hadOpener: false, openerStillInDocument: false }), 'body');
});

/* -------------------------------------------------------------------------
   Inert background
   ------------------------------------------------------------------------- */

test('every sibling of the dialog becomes inert and the dialog branch does not', () => {
  assert.deepEqual(inertSiblings(['header', 'main', 'drawer', 'footer'], 'drawer'), [
    'header',
    'main',
    'footer'
  ]);
});

test('nothing is made inert when the dialog is the only child', () => {
  assert.deepEqual(inertSiblings(['drawer'], 'drawer'), []);
});

/* -------------------------------------------------------------------------
   Which controls are in the cycle
   ------------------------------------------------------------------------- */

test('a control inside a collapsed panel is out of the cycle', () => {
  assert.equal(inCycle({ displayNone: true }), false);
});

test('a control that is merely off screen stays in the cycle', () => {
  assert.equal(inCycle({ displayNone: false }), true);
});

test('the active element stays in the cycle even when it looks unrendered', () => {
  assert.equal(inCycle({ displayNone: true, isActiveElement: true }), true);
});

/* -------------------------------------------------------------------------
   The asset and this module cannot drift
   ------------------------------------------------------------------------- */

test('the theme asset uses exactly the selector list this module exports', () => {
  for (const selector of FOCUSABLE_SELECTORS) {
    assert.ok(ASSET.includes(`'${selector}'`), `asset is missing ${selector}`);
  }
  const block = ASSET.match(/var FOCUSABLE = \[([\s\S]*?)\]\.join/);
  assert.ok(block, 'the asset declares a FOCUSABLE list');
  const count = block[1].split(',').filter((line) => line.includes("'")).length;
  assert.equal(count, FOCUSABLE_SELECTORS.length);
});

test('the joined selector is a single comma separated list', () => {
  assert.equal(FOCUSABLE, FOCUSABLE_SELECTORS.join(','));
  assert.equal(FOCUSABLE.includes('\n'), false);
});

test('tabindex of minus one is excluded from the selector, since it is not a tab stop', () => {
  assert.ok(FOCUSABLE.includes('[tabindex]:not([tabindex="-1"])'));
});

test('disabled controls are excluded from the selector', () => {
  for (const tag of ['button', 'select', 'textarea']) {
    assert.ok(FOCUSABLE.includes(`${tag}:not([disabled])`), tag);
  }
});

test('the asset returns focus to the opener and restores the background', () => {
  assert.match(ASSET, /this\.opener\.focus\(\)/);
  assert.match(ASSET, /inert = false/);
});

test('the asset re-initialises on the theme editor section load event', () => {
  assert.match(ASSET, /shopify:section:load/);
});
