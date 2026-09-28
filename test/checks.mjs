import test from 'node:test';
import assert from 'node:assert/strict';

import { CHECKS, CHECK_IDS, checkById, run, runGrouped } from '../tools/checks.mjs';

/** Findings from one named check only. */
function only(id, html) {
  return run(html, [id]);
}

function page(body, style = '') {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>t</title>${style ? `<style>${style}</style>` : ''}</head>
<body>${body}</body>
</html>`;
}

/* -------------------------------------------------------------------------
   Catalogue
   ------------------------------------------------------------------------- */

test('every check id is unique', () => {
  assert.equal(new Set(CHECK_IDS).size, CHECK_IDS.length);
});

test('every check carries criteria, what it proves and what it does not', () => {
  for (const check of CHECKS) {
    assert.ok(check.criteria.length > 0, `${check.id} has criteria`);
    assert.ok(check.proves.length > 40, `${check.id} says what it proves`);
    assert.ok(check.doesNotProve.length > 40, `${check.id} says what it does not prove`);
  }
});

test('checkById finds a check and returns undefined for one that does not exist', () => {
  assert.equal(checkById('unnamed-control').id, 'unnamed-control');
  assert.equal(checkById('not-a-check'), undefined);
});

/* -------------------------------------------------------------------------
   1. unnamed-control
   ------------------------------------------------------------------------- */

test('an icon button with only a hidden glyph is reported', () => {
  const findings = only('unnamed-control', page('<button type="button"><svg aria-hidden="true"></svg></button>'));
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].criteria, ['1.1.1', '4.1.2']);
});

test('the same button with hidden text is not reported', () => {
  const findings = only(
    'unnamed-control',
    page('<button type="button"><svg aria-hidden="true"></svg><span class="visually-hidden">Search</span></button>')
  );
  assert.equal(findings.length, 0);
});

test('a link whose only content is an image with alt is not reported', () => {
  assert.equal(only('unnamed-control', page('<a href="/x"><img src="a.png" alt="Cart"></a>')).length, 0);
});

test('a link whose only content is an image with empty alt is reported', () => {
  assert.equal(only('unnamed-control', page('<a href="/x"><img src="a.png" alt=""></a>')).length, 1);
});

test('an anchor with no href is not a control and is not reported', () => {
  assert.equal(only('unnamed-control', page('<a class="placeholder"></a>')).length, 0);
});

test('an aria-hidden control is skipped, because it is out of the tree entirely', () => {
  assert.equal(only('unnamed-control', page('<button aria-hidden="true" tabindex="-1"></button>')).length, 0);
});

test('the finding points at the line the control is on', () => {
  const html = page('\n\n<button type="button"></button>');
  assert.equal(only('unnamed-control', html)[0].line, 6);
});

/* -------------------------------------------------------------------------
   2. nested-interactive
   ------------------------------------------------------------------------- */

test('a button inside a link is reported', () => {
  const findings = only('nested-interactive', page('<a href="/p"><h3>T</h3><button type="button">Quick add</button></a>'));
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /<button> is inside <a>/);
});

test('sibling controls are not reported', () => {
  const html = page('<div><h3><a href="/p">T</a></h3><button type="button">Quick add</button></div>');
  assert.equal(only('nested-interactive', html).length, 0);
});

test('a summary inside its own details is not nesting', () => {
  assert.equal(only('nested-interactive', page('<details><summary>More</summary><p>x</p></details>')).length, 0);
});

test('a label wrapping its own input is not nesting', () => {
  assert.equal(only('nested-interactive', page('<label>Email <input type="email"></label>')).length, 0);
});

test('a div with role button containing a link is reported', () => {
  assert.equal(only('nested-interactive', page('<div role="button" tabindex="0"><a href="/x">x</a></div>')).length, 1);
});

/* -------------------------------------------------------------------------
   3. swatch-not-a-control
   ------------------------------------------------------------------------- */

test('a div carrying an option value is reported', () => {
  const findings = only('swatch-not-a-control', page('<div class="swatch" data-option-value="Rust"></div>'));
  assert.equal(findings.length, 1);
});

test('the same swatch given a role and a tabindex is not reported', () => {
  const html = page('<div class="swatch" data-option-value="Rust" role="radio" aria-checked="false" tabindex="0"></div>');
  assert.equal(only('swatch-not-a-control', html).length, 0);
});

test('a radio input carrying the same value is not reported', () => {
  const html = page('<input type="radio" name="Colour" value="Rust" id="r"><label for="r">Rust</label>');
  assert.equal(only('swatch-not-a-control', html).length, 0);
});

test('a wrapper named swatch-group is not itself a swatch', () => {
  assert.equal(only('swatch-not-a-control', page('<div class="swatch-group"></div>')).length, 0);
});

test('an element is reported once even when both the class and the data hook match', () => {
  assert.equal(only('swatch-not-a-control', page('<div class="swatch" data-swatch-value="Rust"></div>')).length, 1);
});

/* -------------------------------------------------------------------------
   4. skip-link-unusable
   ------------------------------------------------------------------------- */

test('a skip link hidden with display none is reported', () => {
  const findings = only(
    'skip-link-unusable',
    page('<a class="skip-link" href="#Main">Skip to content</a><main id="Main" tabindex="-1"></main>', '.skip-link { display: none; }')
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /display: none/);
});

test('a skip link pointing at nothing is reported', () => {
  const findings = only('skip-link-unusable', page('<a class="skip-link" href="#Main">Skip to content</a>'));
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /no element has id="Main"/);
});

test('a target that cannot take focus is reported', () => {
  const findings = only('skip-link-unusable', page('<a class="skip-link" href="#Main">Skip to content</a><main id="Main"></main>'));
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /cannot take focus/);
});

test('an offset skip link with a focusable target is not reported', () => {
  const html = page(
    '<a class="skip-link" href="#Main">Skip to content</a><main id="Main" tabindex="-1"></main>',
    '.skip-link { position: absolute; transform: translateY(-200%); } .skip-link:focus { transform: translateY(0); }'
  );
  assert.equal(only('skip-link-unusable', html).length, 0);
});

test('an in-page link that is not a skip link is left alone', () => {
  assert.equal(only('skip-link-unusable', page('<a href="#reviews">Read reviews</a>')).length, 0);
});

test('a natively focusable target needs no tabindex', () => {
  const html = page('<a class="skip-link" href="#Search">Skip to search</a><input id="Search" type="search" aria-label="Search">');
  assert.equal(only('skip-link-unusable', html).length, 0);
});

/* -------------------------------------------------------------------------
   5. focus-outline-removed
   ------------------------------------------------------------------------- */

test('a global focus outline reset is reported', () => {
  const findings = only('focus-outline-removed', page('<button>x</button>', '*:focus { outline: none; }'));
  assert.equal(findings.length, 1);
});

test('outline zero is reported as well as none', () => {
  assert.equal(only('focus-outline-removed', page('<button>x</button>', 'a:focus { outline: 0; }')).length, 1);
});

test('a reset that is followed by a focus-visible ring in the same sheet is not reported', () => {
  const css = '*:focus { outline: none; } :focus-visible { outline: 3px solid #121212; outline-offset: 2px; }';
  assert.equal(only('focus-outline-removed', page('<button>x</button>', css)).length, 0);
});

test('a focus-visible ring of zero width does not count as restoring one', () => {
  const css = '*:focus { outline: none; } :focus-visible { outline: 0; }';
  assert.ok(only('focus-outline-removed', page('<button>x</button>', css)).length > 0);
});

test('outline none on something that is not a focus state is not reported', () => {
  assert.equal(only('focus-outline-removed', page('<div>x</div>', '.card { outline: none; }')).length, 0);
});

/* -------------------------------------------------------------------------
   6. viewport-scaling-blocked
   ------------------------------------------------------------------------- */

test('user-scalable=no is reported', () => {
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, user-scalable=no"></head><body></body></html>';
  assert.equal(only('viewport-scaling-blocked', html).length, 1);
});

test('maximum-scale below 2 is reported', () => {
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, maximum-scale=1"></head><body></body></html>';
  assert.equal(only('viewport-scaling-blocked', html).length, 1);
});

test('maximum-scale of 5 is not reported', () => {
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, maximum-scale=5"></head><body></body></html>';
  assert.equal(only('viewport-scaling-blocked', html).length, 0);
});

test('a plain viewport declaration is not reported', () => {
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
  assert.equal(only('viewport-scaling-blocked', html).length, 0);
});

test('both restrictions on one tag are reported separately', () => {
  const html = '<!doctype html><html><head><meta name="viewport" content="maximum-scale=1, user-scalable=no"></head><body></body></html>';
  assert.equal(only('viewport-scaling-blocked', html).length, 2);
});

/* -------------------------------------------------------------------------
   7. dialog-not-a-dialog
   ------------------------------------------------------------------------- */

test('a drawer with no dialog semantics is reported three times, once per missing part', () => {
  const findings = only('dialog-not-a-dialog', page('<div id="CartDrawer" class="drawer"><h2>Your cart</h2></div>'));
  assert.equal(findings.length, 3);
});

test('a drawer with role, aria-modal and a name is not reported', () => {
  const html = page(
    '<div id="CartDrawer" class="drawer" role="dialog" aria-modal="true" aria-labelledby="T"><h2 id="T">Your cart</h2></div>'
  );
  assert.equal(only('dialog-not-a-dialog', html).length, 0);
});

test('a native dialog element needs no role or aria-modal, only a name', () => {
  const html = page('<dialog id="QuickView" aria-label="Quick view"></dialog>');
  assert.equal(only('dialog-not-a-dialog', html).length, 0);
});

test('a child part of a drawer is not treated as the container', () => {
  const html = page(
    '<div id="CartDrawer" class="drawer" role="dialog" aria-modal="true" aria-label="Cart"><div class="drawer__inner">x</div></div>'
  );
  assert.equal(only('dialog-not-a-dialog', html).length, 0);
});

test('aria-labelledby pointing at nothing is not a name', () => {
  const html = page('<div class="drawer" role="dialog" aria-modal="true" aria-labelledby="missing"></div>');
  assert.equal(only('dialog-not-a-dialog', html).length, 1);
});

/* -------------------------------------------------------------------------
   8. meaning-in-colour-only
   ------------------------------------------------------------------------- */

test('a struck-through price with no text equivalent is reported', () => {
  assert.equal(only('meaning-in-colour-only', page('<p><span>18.00</span> <s>24.00</s></p>')).length, 1);
});

test('the same prices with hidden labels are not reported', () => {
  const html = page(
    '<p><span class="visually-hidden">Sale price</span><span>18.00</span><span class="visually-hidden">Regular price</span><s>24.00</s></p>'
  );
  assert.equal(only('meaning-in-colour-only', html).length, 0);
});

test('a hidden label inside the struck element also counts', () => {
  assert.equal(
    only('meaning-in-colour-only', page('<p><s><span class="sr-only">Regular price</span>24.00</s></p>')).length,
    0
  );
});

test('a sale-coloured price with no text equivalent is reported', () => {
  assert.equal(only('meaning-in-colour-only', page('<p><span class="price--sale">18.00</span></p>')).length, 1);
});

test('an empty hidden span does not count as a text equivalent', () => {
  assert.equal(
    only('meaning-in-colour-only', page('<p><span class="visually-hidden"></span><s>24.00</s></p>')).length,
    1
  );
});

/* -------------------------------------------------------------------------
   9. live-region-arrives-populated
   ------------------------------------------------------------------------- */

test('a region that arrives holding text is reported', () => {
  const findings = only('live-region-arrives-populated', page('<div role="status" aria-live="polite">Added to cart.</div>'));
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /Added to cart/);
});

test('an empty region is not reported', () => {
  assert.equal(only('live-region-arrives-populated', page('<div id="a11y-live-region" role="status" aria-live="polite"></div>')).length, 0);
});

test('a region holding only whitespace is not reported', () => {
  assert.equal(only('live-region-arrives-populated', page('<div aria-live="polite">\n  \n</div>')).length, 0);
});

test('role alert is treated as a region as well as aria-live', () => {
  assert.equal(only('live-region-arrives-populated', page('<div role="alert">Out of stock.</div>')).length, 1);
});

test('aria-live off is not a region', () => {
  assert.equal(only('live-region-arrives-populated', page('<div aria-live="off">Anything.</div>')).length, 0);
});

/* -------------------------------------------------------------------------
   10. field-without-label
   ------------------------------------------------------------------------- */

test('a field whose placeholder is doing the work of a label is reported', () => {
  const findings = only('field-without-label', page('<input type="text" placeholder="Search">'));
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /placeholder="Search" is standing in for one/);
});

test('a labelled field is not reported', () => {
  const html = page('<label for="q">Search</label><input id="q" type="text">');
  assert.equal(only('field-without-label', html).length, 0);
});

test('an email field with no autocomplete is reported for 1.3.5 even when it is labelled', () => {
  const html = page('<label for="e">Email</label><input id="e" type="email">');
  const findings = only('field-without-label', html);
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /autocomplete/);
});

test('a labelled email field with autocomplete is not reported', () => {
  const html = page('<label for="e">Email</label><input id="e" type="email" autocomplete="email">');
  assert.equal(only('field-without-label', html).length, 0);
});

test('a hidden input and a submit button are not fields that need labels', () => {
  const html = page('<input type="hidden" name="id" value="1"><input type="submit" value="Go">');
  assert.equal(only('field-without-label', html).length, 0);
});

test('a select and a textarea are checked as well as an input', () => {
  const html = page('<select><option>One</option></select><textarea></textarea>');
  assert.equal(only('field-without-label', html).length, 2);
});

/* -------------------------------------------------------------------------
   11. target-under-24px
   ------------------------------------------------------------------------- */

test('a pagination target of 16 by 16 is reported', () => {
  const findings = only('target-under-24px', page('<a class="pagination__item" href="/2">2</a>', '.pagination__item { width: 16px; height: 16px; }'));
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /16 by 16/);
});

test('a minimum of 24 by 24 is not reported', () => {
  const css = '.pagination__item { min-width: 24px; min-height: 24px; }';
  assert.equal(only('target-under-24px', page('<a class="pagination__item" href="/2">2</a>', css)).length, 0);
});

test('a rule that fixes only one dimension is not judged', () => {
  const css = '.icon-button { width: 16px; }';
  assert.equal(only('target-under-24px', page('<button class="icon-button">x</button>', css)).length, 0);
});

test('a one pixel clipped box is the visually hidden pattern and not a target', () => {
  const css = '.variant__input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }';
  assert.equal(only('target-under-24px', page('<input class="variant__input" type="radio" aria-label="Rust">', css)).length, 0);
});

test('a rule on a container is not judged as a control', () => {
  assert.equal(only('target-under-24px', page('<div class="badge">x</div>', '.badge { width: 8px; height: 8px; }')).length, 0);
});

test('rem values are converted before being compared', () => {
  const css = '.icon-button { width: 1rem; height: 1rem; }';
  assert.equal(only('target-under-24px', page('<button class="icon-button">x</button>', css)).length, 1);
});

/* -------------------------------------------------------------------------
   Running them together
   ------------------------------------------------------------------------- */

test('run defaults to every check', () => {
  const html = page('<button type="button"></button><a href="/p"><button>x</button></a>');
  const ids = new Set(run(html).map((f) => f.check));
  assert.ok(ids.has('unnamed-control'));
  assert.ok(ids.has('nested-interactive'));
});

test('runGrouped keys by check id', () => {
  const grouped = runGrouped(page('<button type="button"></button>'));
  assert.deepEqual([...grouped.keys()], ['unnamed-control']);
  assert.equal(grouped.get('unnamed-control').length, 1);
});

test('a clean page produces nothing from any check', () => {
  const html = page(
    '<main id="Main" tabindex="-1"><h1>Store</h1><button type="button">Add to cart</button></main>',
    ':focus-visible { outline: 3px solid #121212; outline-offset: 2px; }'
  );
  assert.deepEqual(run(html), []);
});
