import test from 'node:test';
import assert from 'node:assert/strict';

import { parse, includeTags, namesLiteralSnippet, snippetName, filterNames, branchSegments } from '../tools/liquid.mjs';

test('a comment block is captured and kept out of the skeleton', () => {
  const parsed = parse('{%- comment -%}\n  why this exists\n{%- endcomment -%}\n<button>Go</button>');
  assert.equal(parsed.comments.length, 1);
  assert.match(parsed.comments[0].body, /why this exists/);
  assert.equal(parsed.skeleton.includes('why this exists'), false);
  assert.match(parsed.skeleton, /<button>Go<\/button>/);
});

test('a style block is captured as CSS and kept out of the skeleton', () => {
  const parsed = parse('<a>x</a>\n{%- style -%}\n  .a { color: red; }\n{%- endstyle -%}');
  assert.equal(parsed.styles.length, 1);
  assert.match(parsed.styles[0].body, /\.a \{ color: red; \}/);
  assert.equal(parsed.skeleton.includes('color: red'), false);
});

test('outputs are recorded with their filters and their line', () => {
  const parsed = parse('<p>\n  {{ product.title | escape }}\n</p>');
  assert.equal(parsed.outputs.length, 1);
  assert.equal(parsed.outputs[0].expression, 'product.title');
  assert.deepEqual(filterNames(parsed.outputs[0]), ['escape']);
  assert.equal(parsed.outputs[0].line, 2);
});

test('a pipe inside a quoted filter argument does not split the filter list', () => {
  const parsed = parse("{{ title | replace: '|', '-' | escape }}");
  assert.deepEqual(filterNames(parsed.outputs[0]), ['replace', 'escape']);
});

test('an output leaves a placeholder so the skeleton stays valid markup', () => {
  const parsed = parse('<a href="{{ product.url }}">{{ product.title | escape }}</a>');
  assert.equal(parsed.skeleton.includes('{{'), false);
  assert.match(parsed.skeleton, /<a href="LIQUIDOUT">LIQUIDOUT<\/a>/);
});

test('control flow tags are recorded and leave the markup of every branch behind', () => {
  const parsed = parse('{%- if a -%}<span>one</span>{%- else -%}<span>two</span>{%- endif -%}');
  assert.deepEqual(parsed.tags.map((t) => t.name), ['if', 'else', 'endif']);
  assert.match(parsed.skeleton, /<span>one<\/span><span>two<\/span>/);
});

test('a raw block is passed through untouched', () => {
  const parsed = parse('{% raw %}{{ not_an_output }}{% endraw %}');
  assert.match(parsed.skeleton, /\{\{ not_an_output \}\}/);
  assert.equal(parsed.outputs.length, 0);
});

/* The render tag ---------------------------------------------------------- */

test('a render tag naming a string literal is accepted', () => {
  const [tag] = includeTags(parse("{% render 'icon-cart' %}"));
  assert.equal(namesLiteralSnippet(tag), true);
  assert.equal(snippetName(tag), 'icon-cart');
});

test('a render tag with parameters after the literal is accepted', () => {
  const [tag] = includeTags(parse("{% render 'a11y-icon-button', icon: 'cart', label: 'Open cart' %}"));
  assert.equal(namesLiteralSnippet(tag), true);
  assert.equal(snippetName(tag), 'a11y-icon-button');
});

/* This is the case that shipped in this repository and rendered nothing. The
   tag takes a literal filename; a filtered expression is not one, and Liquid
   reports no error, so the button loses its glyph silently. */
test('a render tag whose filename is built with a filter is rejected', () => {
  const [tag] = includeTags(parse("{% render 'icon-' | append: icon %}"));
  assert.equal(namesLiteralSnippet(tag), false);
});

test('a render tag whose filename is a variable is rejected', () => {
  const [tag] = includeTags(parse('{% render icon_name %}'));
  assert.equal(namesLiteralSnippet(tag), false);
});

test('include is scanned as well as render, since older themes still use it', () => {
  const tags = includeTags(parse("{% include 'old-snippet' %}{% render 'new-snippet' %}"));
  assert.deepEqual(tags.map((t) => t.name), ['include', 'render']);
  assert.equal(tags.every(namesLiteralSnippet), true);
});

test('a double quoted filename is accepted', () => {
  const [tag] = includeTags(parse('{% render "icon-cart" %}'));
  assert.equal(namesLiteralSnippet(tag), true);
});

/* Branch segments ------------------------------------------------------- */

test('markup in different branches lands in different segments', () => {
  const segments = branchSegments('{%- if sale -%}<s>a</s>{%- else -%}<span>b</span>{%- endif -%}');
  assert.equal(segments.length, 2);
  assert.match(segments[0], /<s>a<\/s>/);
  assert.match(segments[1], /<span>b<\/span>/);
  assert.equal(segments[0].includes('<span>b'), false);
});

test('markup outside any branch is its own segment', () => {
  const segments = branchSegments('<h3>t</h3>{% if a %}<p>x</p>{% endif %}<footer>f</footer>');
  assert.equal(segments.length, 3);
  assert.match(segments[0], /<h3>t<\/h3>/);
  assert.match(segments[2], /<footer>f<\/footer>/);
});

test('a case block splits on every when', () => {
  const segments = branchSegments("{% case icon %}{% when 'cart' %}<i>c</i>{% when 'search' %}<i>s</i>{% endcase %}");
  assert.equal(segments.length, 2);
});

test('a for loop is not a branch, so its body stays with what surrounds it', () => {
  const segments = branchSegments('<ul>{% for v in values %}<li>x</li>{% endfor %}</ul>');
  assert.equal(segments.length, 1);
});

test('empty segments are dropped', () => {
  assert.deepEqual(branchSegments('{% if a %}{% endif %}'), []);
});

test('parse carries the source through, so a caller can re-split it', () => {
  const source = '<p>{{ x }}</p>';
  assert.equal(parse(source).source, source);
});
