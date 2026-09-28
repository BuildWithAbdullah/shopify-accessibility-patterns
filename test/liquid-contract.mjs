import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { auditSnippet, auditCommon, SNIPPETS_WITH_CONTRACTS } from '../tools/liquid-contract.mjs';

const SNIPPETS = fileURLToPath(new URL('../snippets/', import.meta.url));

function failuresFor(path) {
  return auditSnippet(path).filter((item) => !item.ok);
}

/** Write a snippet to a temporary file and audit it. */
function auditSource(name, source) {
  const dir = mkdtempSync(join(tmpdir(), 'sap-'));
  try {
    const path = join(dir, `${name}.liquid`);
    writeFileSync(path, source, 'utf8');
    return auditSnippet(path).filter((item) => !item.ok);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------
   The snippets as shipped
   ------------------------------------------------------------------------- */

test('every snippet in the repository meets its contract', () => {
  for (const file of readdirSync(SNIPPETS).filter((f) => f.endsWith('.liquid'))) {
    const failed = failuresFor(join(SNIPPETS, file));
    assert.deepEqual(
      failed.map((item) => `${item.id}: ${item.detail}`),
      [],
      file
    );
  }
});

test('every snippet has a contract of its own, not only the shared rules', () => {
  const onDisk = readdirSync(SNIPPETS)
    .filter((f) => f.endsWith('.liquid'))
    .map((f) => f.replace(/\.liquid$/, ''))
    .sort();
  assert.deepEqual(onDisk, [...SNIPPETS_WITH_CONTRACTS].sort());
});

/* -------------------------------------------------------------------------
   The shared rules catch what they are for
   ------------------------------------------------------------------------- */

/* This is the defect that shipped in this repository. Liquid's render tag takes
   a literal filename, so building one with append renders nothing and reports
   nothing: the button keeps its accessible name and loses its glyph. */
test('a render tag whose filename is built with a filter is caught', () => {
  const { out } = auditCommon('probe', "{% render 'icon-' | append: icon %}\n<button type=\"button\">x</button>");
  const failed = out.filter((item) => !item.ok).map((item) => item.id);
  assert.ok(failed.includes('probe:render-names-a-literal'));
});

test('a render tag naming a literal, with parameters, is accepted', () => {
  const { out } = auditCommon('probe', "{% render 'icon-cart' %}{% render 'thing', a: 1 %}");
  const failed = out.filter((item) => !item.ok).map((item) => item.id);
  assert.equal(failed.includes('probe:render-names-a-literal'), false);
});

test('merchant text reaching markup unescaped is caught', () => {
  const { out } = auditCommon('probe', '<h3>{{ product.title }}</h3>');
  const failed = out.filter((item) => !item.ok).map((item) => item.id);
  assert.ok(failed.includes('probe:merchant-text-escaped'));
});

test('merchant text passed through escape is accepted', () => {
  const { out } = auditCommon('probe', '<h3>{{ product.title | escape }}</h3>');
  const failed = out.filter((item) => !item.ok).map((item) => item.id);
  assert.equal(failed.includes('probe:merchant-text-escaped'), false);
});

test('a translation filter counts as escaping, since it returns a translated string', () => {
  const { out } = auditCommon('probe', "<span>{{ 'products.title' | t }}</span>");
  const failed = out.filter((item) => !item.ok).map((item) => item.id);
  assert.equal(failed.includes('probe:merchant-text-escaped'), false);
});

test('a value that is not merchant editable is not required to be escaped', () => {
  const { out } = auditCommon('probe', '<a href="{{ product.url }}">x</a>');
  const failed = out.filter((item) => !item.ok).map((item) => item.id);
  assert.equal(failed.includes('probe:merchant-text-escaped'), false);
});

test('display none inside a snippet style block is caught', () => {
  const { out } = auditCommon('probe', '<span class="a">x</span>{% style %}.a { display: none; }{% endstyle %}');
  const failed = out.filter((item) => !item.ok).map((item) => item.id);
  assert.ok(failed.includes('probe:no-accessibility-tree-hiding'));
});

test('naming a control with aria-label instead of text is caught', () => {
  const { out } = auditCommon('probe', '<button type="button" aria-label="Search"></button>');
  const failed = out.filter((item) => !item.ok).map((item) => item.id);
  assert.ok(failed.includes('probe:no-aria-label-for-naming'));
});

/* -------------------------------------------------------------------------
   The per snippet contracts catch a regression in the snippet they name
   ------------------------------------------------------------------------- */

test('an icon button that loses its hidden label is caught', () => {
  const source = readFileSync(join(SNIPPETS, 'a11y-icon-button.liquid'), 'utf8').replace(
    '<span class="visually-hidden">{{ label | escape }}</span>',
    ''
  );
  const failed = auditSource('a11y-icon-button', source).map((item) => item.id);
  assert.ok(failed.includes('icon-button:carries-hidden-text'));
});

test('an icon button that loses its explicit type is caught', () => {
  const source = readFileSync(join(SNIPPETS, 'a11y-icon-button.liquid'), 'utf8').replace(
    '  type="button"\n',
    ''
  );
  const failed = auditSource('a11y-icon-button', source).map((item) => item.id);
  assert.ok(failed.includes('icon-button:is-a-button'));
});

test('an icon button whose target shrinks below the minimum is caught', () => {
  const source = readFileSync(join(SNIPPETS, 'a11y-icon-button.liquid'), 'utf8')
    .replace('min-width: 24px;', 'min-width: 16px;');
  const failed = auditSource('a11y-icon-button', source).map((item) => item.id);
  assert.ok(failed.includes('icon-button:target-size'));
});

/* The regression this snippet exists to prevent: somebody wraps the card in an
   anchor again because it is the quickest way to make it all clickable. */
test('a product card that nests the quick add button inside the link is caught', () => {
  const source = `<div class="a11y-card">
  <a class="a11y-card__link" href="{{ product.url }}">
    <h3>{{ product.title | escape }}</h3>
    <button type="submit" class="a11y-card__add">Quick add<span class="visually-hidden">, {{ product.title | escape }}</span></button>
  </a>
  <p><span class="visually-hidden">Price</span>{{ product.price | money }}</p>
</div>`;
  const failed = auditSource('a11y-product-card', source).map((item) => item.id);
  assert.ok(failed.includes('product-card:no-nested-interactive'));
});

test('a product card whose quick add button loses its product name is caught', () => {
  const source = readFileSync(join(SNIPPETS, 'a11y-product-card.liquid'), 'utf8').replace(
    'Quick add<span class="visually-hidden">, {{ product.title | escape }}</span>',
    'Quick add'
  );
  const failed = auditSource('a11y-product-card', source).map((item) => item.id);
  assert.ok(failed.includes('product-card:add-button-is-distinguishable'));
});

test('a product card that drops the hidden price labels is caught', () => {
  const source = readFileSync(join(SNIPPETS, 'a11y-product-card.liquid'), 'utf8')
    .replace('<span class="visually-hidden">Sale price</span>\n', '')
    .replace('<span class="visually-hidden">Regular price</span>\n', '');
  const failed = auditSource('a11y-product-card', source).map((item) => item.id);
  assert.ok(failed.includes('product-card:price-state-has-text'));
});

test('a variant picker rebuilt from divs is caught', () => {
  const source = `<div class="a11y-variant">
  <p>{{ option.name | escape }}</p>
  <div class="swatch" data-option-value="{{ value | escape }}"></div>
</div>`;
  const failed = auditSource('a11y-variant-picker', source).map((item) => item.id);
  assert.ok(failed.includes('variant-picker:grouped-and-named'));
  assert.ok(failed.includes('variant-picker:native-radios'));
});

test('a variant picker that loses its legend is caught', () => {
  const source = readFileSync(join(SNIPPETS, 'a11y-variant-picker.liquid'), 'utf8')
    .replace('<legend class="a11y-variant__legend">{{ option.name | escape }}</legend>', '<p>{{ option.name | escape }}</p>');
  const failed = auditSource('a11y-variant-picker', source).map((item) => item.id);
  assert.ok(failed.includes('variant-picker:grouped-and-named'));
});

test('a variant picker whose selected state is colour alone is caught', () => {
  const source = readFileSync(join(SNIPPETS, 'a11y-variant-picker.liquid'), 'utf8')
    .replace('    border-width: 2px;\n', '');
  const failed = auditSource('a11y-variant-picker', source).map((item) => item.id);
  assert.ok(failed.includes('variant-picker:selection-not-colour-alone'));
});

test('a skip link hidden rather than offset is caught', () => {
  const source = readFileSync(join(SNIPPETS, 'a11y-skip-link.liquid'), 'utf8')
    .replace('transform: translateY(-200%);', 'display: none;')
    .replace('    transform: translateY(0);\n', '');
  const failed = auditSource('a11y-skip-link', source).map((item) => item.id);
  assert.ok(failed.includes('a11y-skip-link:no-accessibility-tree-hiding'));
  assert.ok(failed.includes('skip-link:offset-not-hidden'));
});

test('a skip link that never comes back on focus is caught', () => {
  const source = readFileSync(join(SNIPPETS, 'a11y-skip-link.liquid'), 'utf8')
    .replace('    transform: translateY(0);\n', '');
  const failed = auditSource('a11y-skip-link', source).map((item) => item.id);
  assert.ok(failed.includes('skip-link:returns-on-focus'));
});

/* -------------------------------------------------------------------------
   Shape of the results
   ------------------------------------------------------------------------- */

test('every result names the snippet it belongs to and explains itself', () => {
  for (const item of auditSnippet(join(SNIPPETS, 'a11y-product-card.liquid'))) {
    assert.match(item.id, /^(a11y-)?product-card:|^a11y-product-card:/);
    assert.ok(item.detail.length > 20, item.id);
  }
});
