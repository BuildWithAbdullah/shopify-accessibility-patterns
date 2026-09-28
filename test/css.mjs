import test from 'node:test';
import assert from 'node:assert/strict';

import { parse, rulesFor, rulesWhere, declared, inAtRule, atRules, pixels, shorthandWidth } from '../tools/css.mjs';

test('comments are removed and line numbers survive it', () => {
  const rules = parse(`/* one
   two
   three */
.a { color: red; }`);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].line, 4);
});

test('a comment between declarations does not swallow them', () => {
  const rules = parse('.a { color: red; /* why */ border: 0; }');
  assert.deepEqual(rules[0].declarations.map((d) => d.property), ['color', 'border']);
});

test('a selector list is split and normalised', () => {
  const rules = parse('.a ,\n  .b   .c { color: red; }');
  assert.deepEqual(rules[0].selectors, ['.a', '.b .c']);
});

test('important is recorded separately from the value', () => {
  const rules = parse('.a { position: absolute !important; }');
  assert.equal(rules[0].declarations[0].value, 'absolute');
  assert.equal(rules[0].declarations[0].important, true);
});

test('rules inside an at-rule carry its condition', () => {
  const rules = parse('@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms; } }');
  assert.deepEqual(rules[0].at, ['@media (prefers-reduced-motion: reduce)']);
  assert.equal(inAtRule(rules, 'prefers-reduced-motion').length, 1);
  assert.deepEqual(atRules(rules), ['@media (prefers-reduced-motion: reduce)']);
});

test('a rule after an at-rule block is not still inside it', () => {
  const rules = parse('@media (forced-colors: active) { .a { outline: 1px; } }\n.b { color: red; }');
  assert.deepEqual(rules[1].selectors, ['.b']);
  assert.deepEqual(rules[1].at, []);
});

test('a statement at-rule does not open a block', () => {
  const rules = parse('@charset "utf-8";\n.a { color: red; }');
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].selectors, ['.a']);
});

test('rulesFor matches a selector exactly and not as a substring', () => {
  const rules = parse('.visually-hidden { width: 1px; }\n.visually-hidden-focusable { width: auto; }');
  assert.equal(rulesFor(rules, '.visually-hidden').length, 1);
  assert.equal(rulesWhere(rules, (s) => s.includes('.visually-hidden')).length, 2);
});

test('the last declaration of a property wins', () => {
  const rules = parse('.a { outline: none; outline: 3px solid red; }');
  assert.equal(declared(rules[0], 'outline'), '3px solid red');
});

test('lengths are read in px and rem', () => {
  assert.equal(pixels('24px'), 24);
  assert.equal(pixels('1.5rem'), 24);
  assert.equal(pixels('0'), 0);
  assert.equal(pixels('auto'), undefined);
  assert.equal(pixels(undefined), undefined);
});

test('a width is picked out of an outline shorthand in any order', () => {
  assert.equal(shorthandWidth('3px solid red'), 3);
  assert.equal(shorthandWidth('solid 2px currentColor'), 2);
  assert.equal(shorthandWidth('none'), undefined);
});

test('a nested block inside a rule does not truncate it', () => {
  const rules = parse('@supports (display: grid) { .a { display: grid; } }');
  assert.equal(declared(rules[0], 'display'), 'grid');
  assert.deepEqual(rules[0].at, ['@supports (display: grid)']);
});
