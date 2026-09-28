/* ---------------------------------------------------------------------------
   html.mjs
   A small HTML scanner, enough to ask structural questions about the example
   pages in this repository.

   Why this exists rather than a dependency: the checks in tools/checks.mjs
   need to ask things like "is there a button inside this anchor" and "does
   this control have an accessible name", and answering those with regular
   expressions produces confident wrong answers. They need a tree.

   What it is NOT: an HTML5 parser. It does not implement the insertion modes,
   it does not reconstruct implied tags, and it does not do error recovery the
   way a browser does. It reads well formed markup, which is what the files in
   examples/ are, and it reports a line number for every node so a finding can
   point at evidence. Anything beyond that belongs in a real parser.
   --------------------------------------------------------------------------- */

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr'
]);

const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

/* Raw text elements whose contents are not page text. A <title> inside an
   <svg> is an accessible name and has to be readable, so it is not in here. */
const NON_TEXT_ELEMENTS = new Set(['script', 'style']);

/* Elements that are focusable and operable by default. Used by the checks
   that look for controls, and by the nested interactive check. */
export const INTERACTIVE_ELEMENTS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
  'audio', 'video', 'label', 'option'
]);

export const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'option', 'textbox', 'combobox',
  'slider', 'spinbutton', 'searchbox'
]);

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function parseAttributes(text) {
  const attrs = {};
  const order = [];
  const re = /([^\s"'>/=]+)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    if (name === '/') continue;
    let value = '';
    if (m[2] === undefined) {
      value = null; // present with no value, as in `hidden` or `checked`
    } else if (m[4] !== undefined) {
      value = m[4];
    } else if (m[5] !== undefined) {
      value = m[5];
    } else {
      value = m[6] || '';
    }
    if (!(name in attrs)) order.push(name);
    attrs[name] = value;
  }
  return { attrs, order };
}

function makeElement(name, attrs, order, line) {
  return {
    type: 'element',
    name,
    attrs,
    attrOrder: order,
    line,
    children: [],
    parent: null
  };
}

/**
 * Parse a string of HTML into a tree.
 * Returns the root node, whose children are the top level nodes.
 */
export function parse(source) {
  const root = makeElement('#document', {}, [], 1);
  const stack = [root];
  let i = 0;

  const push = (node) => {
    const parent = stack[stack.length - 1];
    node.parent = parent;
    parent.children.push(node);
    return node;
  };

  while (i < source.length) {
    const lt = source.indexOf('<', i);

    if (lt === -1) {
      const value = source.slice(i);
      if (value.trim() !== '') push({ type: 'text', value, line: lineAt(source, i), parent: null });
      break;
    }

    if (lt > i) {
      const value = source.slice(i, lt);
      if (value.trim() !== '') push({ type: 'text', value, line: lineAt(source, i), parent: null });
    }

    // Comment
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      const stop = end === -1 ? source.length : end + 3;
      push({
        type: 'comment',
        value: source.slice(lt + 4, end === -1 ? source.length : end),
        line: lineAt(source, lt),
        parent: null
      });
      i = stop;
      continue;
    }

    // Doctype or processing instruction
    if (source.startsWith('<!', lt) || source.startsWith('<?', lt)) {
      const end = source.indexOf('>', lt);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    // Closing tag
    if (source.startsWith('</', lt)) {
      const end = source.indexOf('>', lt);
      const stop = end === -1 ? source.length : end + 1;
      const name = source.slice(lt + 2, end === -1 ? source.length : end).trim().toLowerCase();
      for (let s = stack.length - 1; s > 0; s -= 1) {
        if (stack[s].name === name) {
          stack.length = s;
          break;
        }
      }
      i = stop;
      continue;
    }

    // Opening tag
    const end = source.indexOf('>', lt);
    if (end === -1) {
      const value = source.slice(lt);
      if (value.trim() !== '') push({ type: 'text', value, line: lineAt(source, lt), parent: null });
      break;
    }

    const inner = source.slice(lt + 1, end);
    const selfClosing = inner.trimEnd().endsWith('/');
    const space = inner.search(/[\s/]/);
    const name = (space === -1 ? inner : inner.slice(0, space)).toLowerCase();
    const { attrs, order } = parseAttributes(space === -1 ? '' : inner.slice(space));
    const node = push(makeElement(name, attrs, order, lineAt(source, lt)));

    if (VOID_ELEMENTS.has(name) || selfClosing) {
      i = end + 1;
      continue;
    }

    if (RAW_TEXT_ELEMENTS.has(name)) {
      const closeAt = source.toLowerCase().indexOf(`</${name}`, end + 1);
      const textEnd = closeAt === -1 ? source.length : closeAt;
      const value = source.slice(end + 1, textEnd);
      if (value !== '') {
        node.children.push({
          type: 'text',
          value,
          line: lineAt(source, end + 1),
          parent: node
        });
      }
      const gt = closeAt === -1 ? source.length : source.indexOf('>', closeAt);
      i = gt === -1 ? source.length : gt + 1;
      continue;
    }

    stack.push(node);
    i = end + 1;
  }

  return root;
}

/** Every element in document order, root excluded. */
export function elements(node) {
  const out = [];
  const walk = (n) => {
    for (const child of n.children) {
      if (child.type === 'element') {
        out.push(child);
        walk(child);
      }
    }
  };
  walk(node);
  return out;
}

/** Elements matching a tag name, or any of several. */
export function byName(node, ...names) {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  return elements(node).filter((el) => wanted.has(el.name));
}

export function attr(el, name) {
  if (!el || el.type !== 'element') return undefined;
  const value = el.attrs[name.toLowerCase()];
  return value === undefined ? undefined : value;
}

export function hasAttr(el, name) {
  return el && el.type === 'element' && name.toLowerCase() in el.attrs;
}

export function ancestors(el) {
  const out = [];
  let cursor = el.parent;
  while (cursor && cursor.name !== '#document') {
    out.push(cursor);
    cursor = cursor.parent;
  }
  return out;
}

/** Visible text content, with comments and script or style bodies dropped. */
export function textOf(el) {
  if (!el) return '';
  if (el.type === 'text') return el.value;
  if (el.type !== 'element') return '';
  if (NON_TEXT_ELEMENTS.has(el.name)) return '';
  return el.children.map(textOf).join('');
}

export function classList(el) {
  const value = attr(el, 'class');
  if (!value) return [];
  return value.split(/\s+/).filter(Boolean);
}

export function hasClass(el, name) {
  return classList(el).includes(name);
}

/**
 * Is this element interactive, either natively or by an ARIA role?
 * An anchor without href is not, which is the reason for the extra clause.
 */
export function isInteractive(el) {
  if (!el || el.type !== 'element') return false;
  const role = (attr(el, 'role') || '').trim().toLowerCase();
  if (INTERACTIVE_ROLES.has(role)) return true;
  if (role) return false; // an explicit non interactive role wins
  if (el.name === 'a') return hasAttr(el, 'href');
  if (el.name === 'input') return (attr(el, 'type') || 'text').toLowerCase() !== 'hidden';
  if (el.name === 'label' || el.name === 'option') return false;
  return INTERACTIVE_ELEMENTS.has(el.name);
}

/**
 * The accessible name of a control, as far as static markup can tell.
 *
 * This implements the part of accname that a file on disk can answer:
 * aria-labelledby is resolved within the same document, then aria-label, then
 * the value or alt attribute where the element takes one, then descendant
 * text including text in a visually hidden span, then title.
 *
 * It does not run CSS, so it cannot know that a class named visually-hidden
 * is off screen rather than display:none, and it cannot see generated content.
 * Treat an empty result as "no name in the markup", not as proof that a user
 * hears nothing.
 */
export function accessibleName(el, root) {
  const labelledby = attr(el, 'aria-labelledby');
  if (labelledby && root) {
    const ids = labelledby.split(/\s+/).filter(Boolean);
    const all = elements(root);
    const parts = ids
      .map((id) => all.find((candidate) => attr(candidate, 'id') === id))
      .filter(Boolean)
      .map((target) => textOf(target).trim());
    const joined = parts.join(' ').trim();
    if (joined) return joined;
  }

  const ariaLabel = attr(el, 'aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  if (el.name === 'img') {
    const alt = attr(el, 'alt');
    return alt === undefined ? '' : alt.trim();
  }

  /* A form control is named by its label, never by its contents. A select's
     accessible name does not come from its options, which is exactly the trap
     a content-first implementation falls into: every unlabelled select looks
     named because it has an option in it. */
  if (el.name === 'input' || el.name === 'select' || el.name === 'textarea') {
    const type = (attr(el, 'type') || (el.name === 'input' ? 'text' : '')).toLowerCase();
    if (el.name === 'input' && (type === 'submit' || type === 'button' || type === 'reset')) {
      const value = attr(el, 'value');
      if (value && value.trim()) return value.trim();
    }
    const id = attr(el, 'id');
    if (id && root) {
      const label = byName(root, 'label').find((l) => attr(l, 'for') === id);
      if (label) {
        const text = textOf(label).trim();
        if (text) return text;
      }
    }
    const wrapping = ancestors(el).find((a) => a.name === 'label');
    if (wrapping) {
      const text = textOf(wrapping).trim();
      if (text) return text;
    }
    const title = attr(el, 'title');
    return title ? title.trim() : '';
  }

  // Descendant content, including any img alt inside the control.
  const fromContent = contentName(el).trim();
  if (fromContent) return fromContent;

  const title = attr(el, 'title');
  return title ? title.trim() : '';
}

function contentName(el) {
  if (el.type === 'text') return el.value;
  if (el.type !== 'element') return '';
  if (el.name === 'img') {
    const alt = attr(el, 'alt');
    return alt ? ` ${alt} ` : '';
  }
  if (el.name === 'svg') {
    const title = byName(el, 'title').map((t) => textOf(t)).join(' ');
    const label = attr(el, 'aria-label');
    return title || label || '';
  }
  if (attr(el, 'aria-hidden') === 'true') return '';
  return el.children.map(contentName).join('');
}
