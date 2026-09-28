/* ---------------------------------------------------------------------------
   css.mjs
   A small stylesheet scanner: comments stripped, at-rules kept with their
   conditions, every rule carrying its selectors, its declarations and the line
   it starts on.

   Enough to answer the questions the CSS contract asks of the baseline
   stylesheet. Not a CSS parser: it does not resolve the cascade, it does not
   expand shorthands, and it does not understand specificity. It reads the file
   as written.
   --------------------------------------------------------------------------- */

function stripComments(source) {
  // Replace comment bodies with spaces and keep newlines, so line numbers
  // stay true after stripping.
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let j = i; j < stop; j += 1) {
        out += source[j] === '\n' ? '\n' : ' ';
      }
      i = stop;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

function declarations(body) {
  const out = [];
  for (const chunk of body.split(';')) {
    const colon = chunk.indexOf(':');
    if (colon === -1) continue;
    const property = chunk.slice(0, colon).trim().toLowerCase();
    let value = chunk.slice(colon + 1).trim();
    if (!property || !value) continue;
    let important = false;
    if (/!\s*important$/i.test(value)) {
      important = true;
      value = value.replace(/!\s*important$/i, '').trim();
    }
    out.push({ property, value, important });
  }
  return out;
}

/**
 * Parse a stylesheet into a flat list of rules.
 * Each rule: { selectors: string[], declarations, line, at: string[] }
 * where `at` is the stack of enclosing at-rule conditions, outermost first,
 * for example ['@media (prefers-reduced-motion: reduce)'].
 */
export function parse(source) {
  const clean = stripComments(source);
  const rules = [];
  const atStack = [];

  let i = 0;
  let prelude = '';
  let preludeStart = 0;
  let line = 1;

  const lineOf = (index) => {
    let n = 1;
    for (let j = 0; j < index; j += 1) if (clean.charCodeAt(j) === 10) n += 1;
    return n;
  };

  while (i < clean.length) {
    const ch = clean[i];

    if (ch === '{') {
      const head = prelude.trim();
      if (head.startsWith('@') && !head.startsWith('@font-face') && !head.startsWith('@page')) {
        atStack.push(head.replace(/\s+/g, ' '));
        prelude = '';
        i += 1;
        preludeStart = i;
        continue;
      }

      // Find the matching close brace for a declaration block.
      let depth = 1;
      let j = i + 1;
      while (j < clean.length && depth > 0) {
        if (clean[j] === '{') depth += 1;
        else if (clean[j] === '}') depth -= 1;
        j += 1;
      }
      const body = clean.slice(i + 1, j - 1);
      rules.push({
        selectors: head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean),
        declarations: declarations(body),
        line: lineOf(preludeStart + (prelude.length - prelude.trimStart().length)),
        at: atStack.slice()
      });
      prelude = '';
      i = j;
      preludeStart = i;
      continue;
    }

    if (ch === '}') {
      if (atStack.length) atStack.pop();
      prelude = '';
      i += 1;
      preludeStart = i;
      continue;
    }

    if (ch === ';' && prelude.trim().startsWith('@')) {
      // A statement at-rule, such as @import or @charset.
      prelude = '';
      i += 1;
      preludeStart = i;
      continue;
    }

    if (prelude === '' ) preludeStart = i;
    prelude += ch;
    if (ch === '\n') line += 1;
    i += 1;
  }

  return rules;
}

/** Every rule whose selector list contains the given selector exactly. */
export function rulesFor(rules, selector) {
  const wanted = selector.replace(/\s+/g, ' ').trim();
  return rules.filter((rule) => rule.selectors.includes(wanted));
}

/** Every rule whose selector list contains a selector matching a predicate. */
export function rulesWhere(rules, predicate) {
  return rules.filter((rule) => rule.selectors.some(predicate));
}

/** The last declared value for a property within a rule, shorthand aware only
    to the extent of returning the raw string. */
export function declared(rule, property) {
  const matches = rule.declarations.filter((d) => d.property === property.toLowerCase());
  return matches.length ? matches[matches.length - 1].value : undefined;
}

/** Rules inside a given at-rule condition, matched as a substring. */
export function inAtRule(rules, needle) {
  return rules.filter((rule) => rule.at.some((condition) => condition.includes(needle)));
}

/** All at-rule conditions present in the sheet. */
export function atRules(rules) {
  const out = new Set();
  for (const rule of rules) for (const condition of rule.at) out.add(condition);
  return Array.from(out);
}

/** Parse a CSS length into pixels, or undefined when it is not a plain length. */
export function pixels(value) {
  if (value === undefined) return undefined;
  const match = String(value).trim().match(/^(-?\d*\.?\d+)(px|rem|em)?$/);
  if (!match) return undefined;
  const n = Number(match[1]);
  const unit = match[2] || 'px';
  if (unit === 'px') return n;
  return n * 16; // the root font size this repository assumes, stated in the docs
}

/** The first width-looking length in an outline or border shorthand. */
export function shorthandWidth(value) {
  if (value === undefined) return undefined;
  for (const token of String(value).trim().split(/\s+/)) {
    const px = pixels(token);
    if (px !== undefined) return px;
  }
  return undefined;
}
