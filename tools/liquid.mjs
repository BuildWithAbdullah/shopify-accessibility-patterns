/* ---------------------------------------------------------------------------
   liquid.mjs
   A scanner for the Liquid in snippets/, so the contract in
   tools/liquid-contract.mjs can assert what each snippet emits rather than
   trusting the README's description of it.

   It separates a snippet into four things: its comment blocks, its {% style %}
   blocks, its Liquid tags and outputs with line numbers, and a markup skeleton
   with the Liquid removed so tools/html.mjs can read the structure.

   The skeleton is where the honesty is needed. Liquid is a template language,
   so a snippet does not have one output, it has one per set of inputs. The
   skeleton keeps the markup from every branch of every conditional at once,
   which is right for questions of the form "can this snippet ever emit a
   button inside an anchor" and wrong for questions of the form "what does this
   render for a product on sale". Loops appear once, not once per iteration.
   Nothing here executes Liquid or contacts Shopify, so filter output is opaque:
   {{ product.title | escape }} becomes a placeholder, not a title.
   --------------------------------------------------------------------------- */

const CONTROL_TAGS = new Set([
  'if', 'elsif', 'else', 'endif', 'unless', 'endunless',
  'case', 'when', 'endcase', 'for', 'endfor', 'break', 'continue',
  'assign', 'capture', 'endcapture', 'increment', 'decrement',
  'liquid', 'echo', 'cycle', 'tablerow', 'endtablerow', 'raw', 'endraw'
]);

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * Split a snippet into its parts.
 *
 * Returns:
 *   comments  [{ body, line }]
 *   styles    [{ body, line }]          the contents of {% style %} blocks
 *   tags      [{ name, args, raw, line }]
 *   outputs   [{ expression, filters, raw, line }]
 *   skeleton  string                     markup with Liquid stripped
 */
export function parse(source) {
  const comments = [];
  const styles = [];
  const tags = [];
  const outputs = [];

  let skeleton = '';
  let i = 0;

  const openTag = /\{%-?\s*([a-zA-Z_][\w-]*)?/;

  while (i < source.length) {
    const nextTag = source.indexOf('{%', i);
    const nextOut = source.indexOf('{{', i);

    if (nextTag === -1 && nextOut === -1) {
      skeleton += source.slice(i);
      break;
    }

    const next = nextTag === -1 ? nextOut : nextOut === -1 ? nextTag : Math.min(nextTag, nextOut);
    skeleton += source.slice(i, next);

    if (next === nextOut && (nextTag === -1 || nextOut < nextTag)) {
      const close = source.indexOf('}}', next);
      const stop = close === -1 ? source.length : close + 2;
      const raw = source.slice(next, stop);
      const body = raw.replace(/^\{\{-?/, '').replace(/-?\}\}$/, '').trim();
      const pieces = splitFilters(body);
      outputs.push({
        expression: pieces.expression,
        filters: pieces.filters,
        raw,
        line: lineAt(source, next)
      });
      // Placeholder, so the skeleton stays valid markup and attribute values
      // remain non empty.
      skeleton += 'LIQUIDOUT';
      i = stop;
      continue;
    }

    const close = source.indexOf('%}', next);
    const stop = close === -1 ? source.length : close + 2;
    const raw = source.slice(next, stop);
    const inner = raw.replace(/^\{%-?/, '').replace(/-?%\}$/, '').trim();
    const match = inner.match(/^([a-zA-Z_][\w-]*)\s*([\s\S]*)$/);
    const name = match ? match[1] : '';
    const args = match ? match[2].trim() : '';
    const line = lineAt(source, next);

    if (name === 'comment') {
      const endMatch = source.slice(stop).match(/\{%-?\s*endcomment\s*-?%\}/);
      const bodyEnd = endMatch ? stop + endMatch.index : source.length;
      comments.push({ body: source.slice(stop, bodyEnd), line });
      i = endMatch ? bodyEnd + endMatch[0].length : source.length;
      continue;
    }

    if (name === 'style' || name === 'stylesheet') {
      const endMatch = source.slice(stop).match(/\{%-?\s*end(style|stylesheet)\s*-?%\}/);
      const bodyEnd = endMatch ? stop + endMatch.index : source.length;
      styles.push({ body: source.slice(stop, bodyEnd), line });
      i = endMatch ? bodyEnd + endMatch[0].length : source.length;
      continue;
    }

    if (name === 'raw') {
      const endMatch = source.slice(stop).match(/\{%-?\s*endraw\s*-?%\}/);
      const bodyEnd = endMatch ? stop + endMatch.index : source.length;
      skeleton += source.slice(stop, bodyEnd);
      i = endMatch ? bodyEnd + endMatch[0].length : source.length;
      continue;
    }

    tags.push({ name, args, raw, line });
    i = stop;
    // Control flow leaves nothing behind. Everything else, including render
    // and form, is also dropped from the skeleton: what a nested snippet emits
    // is that snippet's business and is checked there.
    void CONTROL_TAGS;
  }

  return { comments, styles, tags, outputs, skeleton, source };
}

function splitFilters(body) {
  // Split on | that is not inside quotes.
  const parts = [];
  let current = '';
  let quote = null;
  for (const ch of body) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '|') {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);

  const expression = parts.shift().trim();
  const filters = parts.map((part) => {
    const name = part.trim().split(/[\s:]/)[0];
    return { name, raw: part.trim() };
  });
  return { expression, filters };
}

/** Every {% render %} and {% include %} tag. */
export function includeTags(parsed) {
  return parsed.tags.filter((tag) => tag.name === 'render' || tag.name === 'include');
}

/**
 * Does this tag name a snippet with a quoted string literal?
 *
 * Liquid's render tag takes a literal filename. It does not accept a variable
 * and it does not accept a filtered expression, so `{% render 'icon-' | append:
 * icon %}` does not render anything. This is the check that catches it.
 */
export function namesLiteralSnippet(tag) {
  const args = tag.args.trim();
  const match = args.match(/^(['"])([^'"]*)\1/);
  if (!match) return false;
  const rest = args.slice(match[0].length).trim();
  // A comma introduces parameters, which is fine. A pipe is a filter, which is
  // not: the filter applies to the filename, and the tag will not resolve.
  if (rest.startsWith('|')) return false;
  return rest === '' || rest.startsWith(',');
}

/** The literal snippet name a render tag points at, when it has one. */
export function snippetName(tag) {
  const match = tag.args.trim().match(/^(['"])([^'"]*)\1/);
  return match ? match[2] : undefined;
}

/** All filter names applied to an output. */
export function filterNames(output) {
  return output.filters.map((f) => f.name);
}

/* Tags that begin or end a branch. Markup either side of one of these does not
   necessarily render together, which is the limit of the flattened skeleton. */
const BRANCH_TAGS = new Set([
  'if', 'elsif', 'else', 'endif',
  'unless', 'endunless',
  'case', 'when', 'endcase'
]);

/**
 * Split a snippet into the pieces of markup that always render together.
 *
 * The skeleton keeps every branch at once, which answers "can this snippet ever
 * emit X" and cannot answer "does this hidden label render beside this price".
 * Splitting at every branch boundary answers the second: within one segment,
 * everything either renders or does not, together.
 *
 * Each segment is a fragment, not a document. An element whose opening tag is
 * outside the branch is not in the segment, so a segment's top level nodes are
 * siblings of each other and nothing more is implied.
 */
export function branchSegments(source) {
  const boundaries = [];
  const re = /\{%-?\s*([a-zA-Z_][\w-]*)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    if (!BRANCH_TAGS.has(m[1])) continue;
    const close = source.indexOf('%}', m.index);
    boundaries.push([m.index, close === -1 ? source.length : close + 2]);
  }

  const segments = [];
  let cursor = 0;
  for (const [start, end] of boundaries) {
    segments.push(source.slice(cursor, start));
    cursor = end;
  }
  segments.push(source.slice(cursor));

  return segments
    .map((segment) => parse(segment).skeleton)
    .filter((skeleton) => skeleton.trim() !== '');
}
