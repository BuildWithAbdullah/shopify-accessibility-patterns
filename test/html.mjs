import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parse,
  elements,
  byName,
  attr,
  hasAttr,
  ancestors,
  textOf,
  classList,
  hasClass,
  isInteractive,
  accessibleName
} from '../tools/html.mjs';

test('reads quoted, single quoted, unquoted and bare attributes', () => {
  const doc = parse('<input type="email" name=\'contact[email]\' size=20 required>');
  const input = byName(doc, 'input')[0];
  assert.equal(attr(input, 'type'), 'email');
  assert.equal(attr(input, 'name'), 'contact[email]');
  assert.equal(attr(input, 'size'), '20');
  assert.equal(hasAttr(input, 'required'), true);
  assert.equal(attr(input, 'required'), null);
});

test('attribute names are matched without regard to case', () => {
  const doc = parse('<div ARIA-Modal="true"></div>');
  assert.equal(attr(byName(doc, 'div')[0], 'aria-modal'), 'true');
});

test('void elements do not swallow what follows them', () => {
  const doc = parse('<p><br><span>after</span></p>');
  const p = byName(doc, 'p')[0];
  assert.deepEqual(p.children.filter((c) => c.type === 'element').map((c) => c.name), ['br', 'span']);
});

test('a self closing tag closes itself', () => {
  const doc = parse('<div><svg /><span>sibling</span></div>');
  const div = byName(doc, 'div')[0];
  assert.deepEqual(div.children.filter((c) => c.type === 'element').map((c) => c.name), ['svg', 'span']);
});

test('style and script bodies are kept as text and not parsed as markup', () => {
  const doc = parse('<style>a::after { content: "<button>"; }</style>');
  const style = byName(doc, 'style')[0];
  assert.equal(byName(doc, 'button').length, 0);
  assert.match(style.children[0].value, /content: "<button>"/);
});

test('comments do not become text content', () => {
  const doc = parse('<p>before<!-- a note -->after</p>');
  assert.equal(textOf(byName(doc, 'p')[0]), 'beforeafter');
});

test('every node carries the line it starts on', () => {
  const doc = parse('<div>\n  <p>one</p>\n\n  <p>two</p>\n</div>');
  const paragraphs = byName(doc, 'p');
  assert.equal(paragraphs[0].line, 2);
  assert.equal(paragraphs[1].line, 4);
});

test('an unclosed tag does not lose the elements after it', () => {
  const doc = parse('<div><p>one<div><p>two</p></div></div>');
  assert.equal(byName(doc, 'p').length, 2);
});

test('a stray closing tag is ignored rather than unwinding the stack', () => {
  const doc = parse('<div><span>one</span></section><span>two</span></div>');
  const div = byName(doc, 'div')[0];
  assert.equal(div.children.filter((c) => c.type === 'element').length, 2);
});

test('ancestors runs from the element outwards', () => {
  const doc = parse('<div class="card"><h3><a href="/x">Title</a></h3></div>');
  const link = byName(doc, 'a')[0];
  assert.deepEqual(ancestors(link).map((el) => el.name), ['h3', 'div']);
});

test('classList and hasClass', () => {
  const doc = parse('<span class="  visually-hidden  price__label ">x</span>');
  const span = byName(doc, 'span')[0];
  assert.deepEqual(classList(span), ['visually-hidden', 'price__label']);
  assert.equal(hasClass(span, 'visually-hidden'), true);
  assert.equal(hasClass(span, 'visually'), false);
});

test('elements returns document order', () => {
  const doc = parse('<div><a href="/1">1</a><a href="/2">2</a></div>');
  assert.deepEqual(elements(doc).map((el) => el.name), ['div', 'a', 'a']);
});

/* Interactivity ---------------------------------------------------------- */

test('an anchor without href is not interactive', () => {
  const doc = parse('<a>not a link</a><a href="/x">a link</a>');
  const [first, second] = byName(doc, 'a');
  assert.equal(isInteractive(first), false);
  assert.equal(isInteractive(second), true);
});

test('a hidden input is not interactive', () => {
  const doc = parse('<input type="hidden" name="id" value="1"><input type="text">');
  const [hidden, text] = byName(doc, 'input');
  assert.equal(isInteractive(hidden), false);
  assert.equal(isInteractive(text), true);
});

test('an explicit non interactive role beats the tag name', () => {
  const doc = parse('<button role="presentation">x</button>');
  assert.equal(isInteractive(byName(doc, 'button')[0]), false);
});

test('a div with an interactive role is interactive', () => {
  const doc = parse('<div role="button" tabindex="0">Go</div>');
  assert.equal(isInteractive(byName(doc, 'div')[0]), true);
});

test('a label is not treated as interactive, so wrapping an input is not nesting', () => {
  const doc = parse('<label>Email <input type="email"></label>');
  assert.equal(isInteractive(byName(doc, 'label')[0]), false);
});

/* Accessible name -------------------------------------------------------- */

test('aria-labelledby is resolved inside the document and wins', () => {
  const doc = parse(
    '<h2 id="t">Your cart</h2><div role="dialog" aria-label="ignored" aria-labelledby="t"></div>'
  );
  assert.equal(accessibleName(byName(doc, 'div')[0], doc), 'Your cart');
});

test('aria-labelledby that points at nothing falls through to aria-label', () => {
  const doc = parse('<div role="dialog" aria-label="Cart" aria-labelledby="missing"></div>');
  assert.equal(accessibleName(byName(doc, 'div')[0], doc), 'Cart');
});

test('text in a visually hidden span names a button', () => {
  const doc = parse(
    '<button><svg aria-hidden="true"></svg><span class="visually-hidden">Search</span></button>'
  );
  assert.equal(accessibleName(byName(doc, 'button')[0], doc), 'Search');
});

test('an aria-hidden child contributes nothing to the name', () => {
  const doc = parse('<button><span aria-hidden="true">Search</span></button>');
  assert.equal(accessibleName(byName(doc, 'button')[0], doc), '');
});

test('image alt inside a control contributes to the name', () => {
  const doc = parse('<a href="/x"><img src="c.svg" alt="Cart"></a>');
  assert.equal(accessibleName(byName(doc, 'a')[0], doc).trim(), 'Cart');
});

test('an svg title names a control that has nothing else', () => {
  const doc = parse('<button><svg><title>Close</title></svg></button>');
  assert.equal(accessibleName(byName(doc, 'button')[0], doc), 'Close');
});

test('a label associated by for names an input', () => {
  const doc = parse('<label for="e">Email address</label><input id="e" type="email">');
  assert.equal(accessibleName(byName(doc, 'input')[0], doc), 'Email address');
});

test('a wrapping label names an input', () => {
  const doc = parse('<label>Email address <input type="email"></label>');
  assert.equal(accessibleName(byName(doc, 'input')[0], doc), 'Email address');
});

test('a placeholder does not name an input', () => {
  const doc = parse('<input type="email" placeholder="Email">');
  assert.equal(accessibleName(byName(doc, 'input')[0], doc), '');
});

test('a submit input is named by its value', () => {
  const doc = parse('<input type="submit" value="Subscribe">');
  assert.equal(accessibleName(byName(doc, 'input')[0], doc), 'Subscribe');
});

test('an empty alt is a name of nothing, which is what a decorative image wants', () => {
  const doc = parse('<img src="d.png" alt="">');
  assert.equal(accessibleName(byName(doc, 'img')[0], doc), '');
});

test('a select is not named by its options', () => {
  const doc = parse('<select><option>Small</option><option>Large</option></select>');
  assert.equal(accessibleName(byName(doc, 'select')[0], doc), '');
});

test('a select with a label is named by it', () => {
  const doc = parse('<label for="s">Size</label><select id="s"><option>Small</option></select>');
  assert.equal(accessibleName(byName(doc, 'select')[0], doc), 'Size');
});

test('a textarea is not named by the text inside it', () => {
  const doc = parse('<textarea>Leave a note</textarea>');
  assert.equal(accessibleName(byName(doc, 'textarea')[0], doc), '');
});
