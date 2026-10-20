import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run, runByCode } from '../tools/checks.mjs';
import { parse, elements, attr, hasAttr } from '../tools/html.mjs';
import { openTarget, onKeydown, FOCUSABLE_SELECTORS } from '../tools/focus-order.mjs';
import { LIMITS, LIMIT_IDS } from '../tools/limits.mjs';
import { FINDING_CODES, checkOf } from '../tools/findings.mjs';

/* ---------------------------------------------------------------------------
   The limits of this repository, asserted rather than written down.

   docs/08-what-the-checks-do-not-see.md has described all of this in prose
   since the repository was published, and the prose was doing the most
   important job in it with nothing holding it to account. The argument this
   repository makes is that the expensive Shopify accessibility failures are
   the ones no static check reports. That was the one claim nothing checked.

   Each limit in tools/limits.mjs is exercised here under its own id, and
   tools/verify.mjs asserts the two files name the same set, so neither can
   grow a limit the other does not know about.

   What this file asserts is a gap, and in four of the six cases it asserts it
   in both directions: the same outcome for a visitor gets either verdict
   depending on something that is not a property of the page. That is a
   stronger statement than "the checks miss things", and it is the reason the
   working order in docs/07 puts a keyboard pass before any of this.

   The pages below are constructed, and that is the honest scope. They show
   what the detectors admit, which is what makes the implication unsound. They
   say nothing about how often each outcome occurs on real themes, which no
   test in a repository with no network could tell you.
   --------------------------------------------------------------------------- */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const codes = (html) => [...runByCode(html).keys()].sort();
const page = (head, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

test('every limit declared in tools/limits.mjs is exercised in this file', () => {
  const source = readFileSync(join(root, 'test', 'gap.mjs'), 'utf8');
  for (const limit of LIMITS) {
    const mentions = source.split(limit.id).length - 1;
    assert.ok(mentions >= 2, `${limit.id} is declared and not exercised here`);
  }
});

/* -------------------------------------------------------------------------
   cascade-not-resolved

   The two pages below differ in one respect that is invisible to a visitor:
   which file the rule lives in. One conforms and is reported; the other does
   not conform and is not. So the finding count carries no information about
   whether a focus indicator is on the screen.
   ------------------------------------------------------------------------- */

const RESET = '*:focus { outline: none; }';
const RESTORE = ':focus-visible { outline: 3px solid #005bbb; }';
const LINKED = '<link rel="stylesheet" href="theme.css">';

test('cascade-not-resolved: a conforming page is reported, because the restore is in a linked file', () => {
  const html = page(`${LINKED}<style>${RESET}</style>`, '<button type="button">Add to cart</button>');
  assert.deepEqual(codes(html), ['focus-outline-removed/universal-reset']);
});

test('cascade-not-resolved: a defective page is silent, because the reset is in a linked file', () => {
  const html = page(LINKED, '<button type="button">Add to cart</button>');
  assert.deepEqual(codes(html), []);
});

test('cascade-not-resolved: the verdict flips with the file, not with what the visitor gets', () => {
  const restoreOutside = page(`${LINKED}<style>${RESET}</style>`, '<button type="button">Buy</button>');
  const restoreInside = page(`${LINKED}<style>${RESET}${RESTORE}</style>`, '<button type="button">Buy</button>');
  assert.equal(codes(restoreOutside).length, 1);
  assert.equal(codes(restoreInside).length, 0);
});

/* -------------------------------------------------------------------------
   declared-size-is-not-rendered-size
   ------------------------------------------------------------------------- */

test('declared-size-is-not-rendered-size: a 24 pixel declaration that renders at 12 is silent', () => {
  const html = page(
    '<style>.icon-button { width: 24px; height: 24px; transform: scale(0.5); }</style>',
    '<button class="icon-button" type="button">Cart</button>'
  );
  assert.deepEqual(codes(html), []);
});

test('declared-size-is-not-rendered-size: a 16 pixel declaration that renders at 32 is reported', () => {
  const html = page(
    '<style>.icon-button { width: 16px; height: 16px; padding: 8px; }</style>',
    '<button class="icon-button" type="button">Cart</button>'
  );
  assert.deepEqual(codes(html), ['target-under-24px/both-dimensions']);
});

/* -------------------------------------------------------------------------
   name-can-change-after-load

   Both pages carry their own script, so the runtime outcome is not a guess
   about a theme somewhere else: it is in the file, and still not something
   the detectors read.
   ------------------------------------------------------------------------- */

test('name-can-change-after-load: a control named by its own script is reported as unnamed', () => {
  const html = page(
    '',
    `<button class="header__icon" type="button"><svg aria-hidden="true" width="20" height="20"></svg></button>
     <script>document.querySelector('.header__icon').setAttribute('aria-label', 'Open cart drawer');</script>`
  );
  assert.deepEqual(codes(html), ['unnamed-control/aria-hidden-content-only']);
});

test('name-can-change-after-load: a control whose own script strips its name is silent', () => {
  const html = page(
    '',
    `<button class="header__icon" type="button">Open cart drawer</button>
     <script>document.querySelector('.header__icon').textContent = '';</script>`
  );
  assert.deepEqual(codes(html), []);
});

/* -------------------------------------------------------------------------
   semantics-are-not-behaviour

   The static verdict is dialog-not-a-dialog. The behavioural verdict is this
   repository's own arithmetic: assets/a11y-focus-trap.js puts focus where
   tools/focus-order.mjs says to put it, and openTarget reports needsTabindex
   when the drawer itself will take focus and cannot, which is the case where
   the focus call silently does nothing and Tab starts from the top of the
   page behind.

   All four combinations are constructed below. That is what independence
   means, and it is a sharper claim than "the check misses behaviour": a
   reader cannot treat either verdict as weak evidence for the other.
   ------------------------------------------------------------------------- */

/* Focusable descendants, by the same rule the asset uses. The selector list in
   tools/focus-order.mjs is the source of truth for the asset and this derives
   from the element names in it rather than restating them, so a change there
   is a change here. */
const FOCUSABLE_NAMES = new Set(
  FOCUSABLE_SELECTORS.map((selector) => selector.replace(/[:[].*$/, '')).filter(Boolean)
);

function focusableDescendants(drawer) {
  return elements(drawer).filter((el) => {
    if (el === drawer) return false;
    if (hasAttr(el, 'tabindex')) return attr(el, 'tabindex') !== '-1';
    if (!FOCUSABLE_NAMES.has(el.name)) return false;
    if (hasAttr(el, 'disabled')) return false;
    if (el.name === 'input' && (attr(el, 'type') || '').toLowerCase() === 'hidden') return false;
    if (el.name === 'a' && !hasAttr(el, 'href')) return false;
    return true;
  });
}

function behaviourOf(html) {
  const doc = parse(html);
  const drawer = elements(doc).find((el) => hasAttr(el, 'data-a11y-dialog'));
  assert.ok(drawer, 'the fixture has no drawer');
  const count = focusableDescendants(drawer).length;
  const open = openTarget({
    hasExplicitInitial: elements(drawer).some((el) => hasAttr(el, 'data-a11y-dialog-initial')),
    count,
    dialogHasTabindex: hasAttr(drawer, 'tabindex')
  });
  const tab = onKeydown({ key: 'Tab', count, index: -1 });
  return { count, usable: !open.needsTabindex && tab.focus !== null, open, tab };
}

const SEMANTIC = 'role="dialog" aria-modal="true" aria-labelledby="CartHeading"';
const CONTENTS = '<h2 id="CartHeading">Your cart</h2><button type="button">Close</button>';
const EMPTY = '<h2 id="CartHeading">Your cart</h2>';

const drawer = (attrs, inner) =>
  page('', `<div id="CartDrawer" class="drawer" data-a11y-dialog ${attrs}>${inner}</div>`);

test('semantics-are-not-behaviour: semantics complete and focus goes nowhere', () => {
  const html = drawer(SEMANTIC, EMPTY);
  assert.deepEqual(codes(html), []);
  const behaviour = behaviourOf(html);
  assert.equal(behaviour.count, 0);
  assert.equal(behaviour.open.target, 'dialog');
  assert.equal(behaviour.open.needsTabindex, true);
  assert.equal(behaviour.usable, false);
});

test('semantics-are-not-behaviour: semantics missing and focus lands correctly', () => {
  const html = drawer('', CONTENTS);
  assert.deepEqual(codes(html), [
    'dialog-not-a-dialog/no-accessible-name',
    'dialog-not-a-dialog/no-aria-modal',
    'dialog-not-a-dialog/no-dialog-role'
  ]);
  const behaviour = behaviourOf(html);
  assert.equal(behaviour.open.target, 'first');
  assert.equal(behaviour.usable, true);
});

test('semantics-are-not-behaviour: both right', () => {
  const html = drawer(SEMANTIC, CONTENTS);
  assert.deepEqual(codes(html), []);
  assert.equal(behaviourOf(html).usable, true);
});

test('semantics-are-not-behaviour: both wrong', () => {
  const html = drawer('', EMPTY);
  assert.equal(codes(html).length, 3);
  assert.equal(behaviourOf(html).usable, false);
});

test('semantics-are-not-behaviour: so neither verdict predicts the other', () => {
  const cases = [
    [drawer(SEMANTIC, EMPTY)],
    [drawer('', CONTENTS)],
    [drawer(SEMANTIC, CONTENTS)],
    [drawer('', EMPTY)]
  ].map(([html]) => ({
    staticSilent: run(html).length === 0,
    usable: behaviourOf(html).usable
  }));

  const seen = new Set(cases.map((c) => `${c.staticSilent}/${c.usable}`));
  assert.equal(seen.size, 4, `only reached ${[...seen].join(' ')}`);
});

/* -------------------------------------------------------------------------
   a-name-is-not-a-good-name
   ------------------------------------------------------------------------- */

test('a-name-is-not-a-good-name: a link named "click here" satisfies every name check here', () => {
  const html = page('', '<a href="/collections/sale">click here</a>');
  assert.deepEqual(codes(html), []);
});

test('a-name-is-not-a-good-name: and so does a drawer named "dialog"', () => {
  const html = page(
    '',
    '<div id="CartDrawer" class="drawer" role="dialog" aria-modal="true" aria-label="dialog"><button type="button">Close</button></div>'
  );
  assert.deepEqual(codes(html), []);
});

/* -------------------------------------------------------------------------
   pairs-do-not-cover-the-catalogue

   The limit of the verification layer itself, which is the one worth
   asserting most, because this repository asserted that every check had a
   pair and was green while fifteen of thirty-two findings had never fired.
   ------------------------------------------------------------------------- */

const manifest = JSON.parse(readFileSync(join(root, 'examples', 'manifest.json'), 'utf8'));

test('pairs-do-not-cover-the-catalogue: the pairs reach a strict subset of the catalogue', () => {
  const fromPairs = new Set(manifest.examples.flatMap((e) => e.onFail));
  assert.ok(fromPairs.size > 0);
  assert.ok(
    fromPairs.size < FINDING_CODES.length,
    'the pairs now reach every finding, so this limit no longer holds and should be removed'
  );
});

test('pairs-do-not-cover-the-catalogue: and for every check with several findings, a strict subset of those', () => {
  const fromPairs = new Set(manifest.examples.flatMap((e) => e.onFail));
  const shortfall = [];
  for (const entry of manifest.examples) {
    const all = FINDING_CODES.filter((code) => checkOf(code) === entry.check);
    if (all.length < 2) continue;
    const reached = all.filter((code) => fromPairs.has(code));
    assert.ok(reached.length > 0, `${entry.check} has a pair reaching none of its findings`);
    if (reached.length < all.length) shortfall.push(entry.check);
  }
  assert.ok(
    shortfall.length > 0,
    'no check has an unreached finding, which would make the fixtures redundant'
  );
});

test('pairs-do-not-cover-the-catalogue: the fixtures close it exactly, with nothing left over', () => {
  const html = (path) => readFileSync(path, 'utf8');
  const fromPairs = new Set(
    manifest.examples.flatMap((e) => codes(html(join(root, 'examples', e.directory, 'fail.html'))))
  );
  const everywhere = new Set(fromPairs);
  for (const file of ['labelling-variants', 'card-nested-controls', 'swatch-class-hook',
    'skip-link-variants', 'focus-reset-on-focus', 'status-role-populated',
    'quantity-field-unlabelled', 'pagination-one-dimension']) {
    for (const code of codes(html(join(root, 'test', 'fixtures', `${file}.html`)))) everywhere.add(code);
  }
  assert.deepEqual([...everywhere].sort(), [...FINDING_CODES].sort());
});

test('the limits file declares no limit twice', () => {
  assert.equal(new Set(LIMIT_IDS).size, LIMIT_IDS.length);
});

test('every limit states what it bounds and in which direction', () => {
  for (const limit of LIMITS) {
    assert.ok(limit.claim.length > 80, `${limit.id} does not state its claim`);
    assert.ok(limit.bounds.length > 0, `${limit.id} bounds nothing`);
    assert.ok(['both', 'false-positive', 'false-negative'].includes(limit.directions));
  }
});

test('the limits claiming both directions have an assertion in each', () => {
  const source = readFileSync(join(root, 'test', 'gap.mjs'), 'utf8');
  for (const limit of LIMITS.filter((l) => l.directions === 'both')) {
    const lines = source.split('\n').filter((line) => line.includes(`'${limit.id}:`));
    assert.ok(lines.length >= 2, `${limit.id} claims both directions and has ${lines.length} test`);
  }
});
