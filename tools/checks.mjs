/* ---------------------------------------------------------------------------
   checks.mjs
   One static detector for each failing and corrected pair in examples/.

   These exist so the pairs cannot rot. A repository of "before and after"
   markup is only worth reading if the before really does fail and the after
   really does not, and the only way to keep that true through later edits is to
   have a machine assert it on every push.

   They are not a scanner. Each one is written against the pattern it names, it
   reads the markup and the stylesheet in the file rather than a rendered page,
   and every one of them carries what it proves and what it does not. Several of
   the most expensive Shopify accessibility failures are invisible to this kind
   of check by construction, which is the whole argument in
   docs/03-drawers-and-modals.md and docs/06-why-overlays-fail.md.
   --------------------------------------------------------------------------- */

import {
  parse as parseHtml,
  elements,
  byName,
  attr,
  hasAttr,
  textOf,
  classList,
  hasClass,
  ancestors,
  isInteractive,
  accessibleName
} from './html.mjs';

import {
  parse as parseCss,
  declared,
  pixels,
  shorthandWidth
} from './css.mjs';

const HIDDEN_TEXT_CLASSES = new Set([
  'visually-hidden',
  'visuallyhidden',
  'sr-only',
  'screen-reader-text',
  'a11y-visually-hidden'
]);

const NATIVELY_FOCUSABLE = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'summary', 'details',
  'audio', 'video', 'iframe'
]);

function isHiddenText(el) {
  return el.type === 'element' && classList(el).some((c) => HIDDEN_TEXT_CLASSES.has(c));
}

/** Every <style> block, with its rules and the offset back to file lines. */
export function styleSheets(doc) {
  return byName(doc, 'style').map((styleEl) => {
    const text = styleEl.children.find((c) => c.type === 'text');
    const body = text ? text.value : '';
    const startLine = text ? text.line : styleEl.line;
    return {
      rules: parseCss(body).map((rule) => ({ ...rule, line: startLine + rule.line - 1 })),
      element: styleEl
    };
  });
}

/** All rules across every style block in the document. */
export function allRules(doc) {
  return styleSheets(doc).flatMap((sheet) => sheet.rules);
}

/** Rules whose selector list mentions any of an element's classes. */
function rulesTouchingClasses(rules, el) {
  const classes = classList(el);
  if (!classes.length) return [];
  return rules.filter((rule) =>
    rule.selectors.some((selector) => classes.some((c) => selector.includes(`.${c}`)))
  );
}

function finding(check, line, evidence, extra = {}) {
  return { check: check.id, criteria: check.criteria, line, evidence, ...extra };
}

/* --------------------------------------------------------------------------
   1. Controls with no accessible name
   -------------------------------------------------------------------------- */

const unnamedControl = {
  id: 'unnamed-control',
  title: 'Interactive control with no accessible name',
  criteria: ['1.1.1', '4.1.2'],
  proves:
    'The markup supplies nothing for this control to be announced as: no text content, no image alt, no aria-label and no aria-labelledby that resolves inside the file.',
  doesNotProve:
    'That a user hears nothing. A name can arrive from a script after load, or from generated content, and neither is visible here. It also cannot tell a good name from a bad one: "click here" passes this check and fails 2.4.4.',
  detect(doc) {
    const out = [];
    for (const el of elements(doc)) {
      const role = (attr(el, 'role') || '').toLowerCase();
      const isControl =
        el.name === 'button' ||
        (el.name === 'a' && hasAttr(el, 'href')) ||
        role === 'button' ||
        role === 'link' ||
        (el.name === 'input' &&
          ['submit', 'button', 'reset'].includes((attr(el, 'type') || '').toLowerCase()));
      if (!isControl) continue;
      if (attr(el, 'aria-hidden') === 'true') continue;

      const name = accessibleName(el, doc);
      if (name === '') {
        out.push(
          finding(
            unnamedControl,
            el.line,
            `<${el.name}${attr(el, 'class') ? ` class="${attr(el, 'class')}"` : ''}> has no accessible name`
          )
        );
      }
    }
    return out;
  }
};

/* --------------------------------------------------------------------------
   2. Interactive inside interactive
   -------------------------------------------------------------------------- */

const nestedInteractive = {
  id: 'nested-interactive',
  title: 'An interactive element inside another interactive element',
  criteria: ['4.1.2'],
  proves:
    'One target carries two conflicting roles. Screen readers disagree about what to announce, keyboard activation is unpredictable, and the inner control may be unreachable.',
  doesNotProve:
    'How badly it behaves, which varies by pairing. It also does not catch the same defect assembled at runtime, where a script wraps a card in a click handler instead of an anchor.',
  detect(doc) {
    const out = [];
    for (const el of elements(doc)) {
      if (!isInteractive(el)) continue;
      const outer = ancestors(el).find((a) => isInteractive(a));
      if (!outer) continue;
      // summary is the label of its own details element, which is not nesting.
      if (el.name === 'summary' && outer.name === 'details') continue;
      out.push(
        finding(
          nestedInteractive,
          el.line,
          `<${el.name}> is inside <${outer.name}> declared on line ${outer.line}`
        )
      );
    }
    return out;
  }
};

/* --------------------------------------------------------------------------
   3. Swatches that are not controls
   -------------------------------------------------------------------------- */

const swatchNotAControl = {
  id: 'swatch-not-a-control',
  title: 'Variant swatch built from a non-interactive element',
  criteria: ['1.3.1', '2.1.1', '4.1.2'],
  proves:
    'An element carrying an option value is neither focusable nor announced as a control, so the option cannot be chosen from a keyboard and has no role, name or state.',
  doesNotProve:
    'That the swatch does nothing on click. It almost certainly works with a mouse, which is why this survives testing. Nor does it judge a swatch that has been given role and tabindex by hand, which can be made to work and is still more code than a radio input.',
  detect(doc) {
    const out = [];
    const seen = new Set();
    for (const el of elements(doc)) {
      if (!['div', 'span', 'li', 'p'].includes(el.name)) continue;
      if (isInteractive(el)) continue;
      if (hasAttr(el, 'tabindex')) continue;

      const dataHook = Object.keys(el.attrs).find(
        (name) => /^data-/.test(name) && /(option|variant|swatch|value)/.test(name)
      );
      const classHook = classList(el).some((c) => c === 'swatch' || c === 'option-value');
      if (!dataHook && !classHook) continue;
      if (seen.has(el)) continue;
      seen.add(el);

      out.push(
        finding(
          swatchNotAControl,
          el.line,
          `<${el.name}${dataHook ? ` ${dataHook}="${el.attrs[dataHook]}"` : ''}> is not focusable and has no role`
        )
      );
    }
    return out;
  }
};

/* --------------------------------------------------------------------------
   4. Skip link that cannot be reached or does not move focus
   -------------------------------------------------------------------------- */

const skipLinkUnusable = {
  id: 'skip-link-unusable',
  title: 'Skip link that cannot be focused, or whose target cannot take focus',
  criteria: ['2.4.1'],
  proves:
    'Either a rule in this file removes the link from the tab order, or the fragment it points at does not exist, or the target cannot accept focus because it is not natively focusable and has no tabindex.',
  doesNotProve:
    'That the link works when none of those hold. Whether focus actually lands is browser behaviour, and the only way to know is to press Tab after activating it.',
  detect(doc) {
    const out = [];
    const rules = allRules(doc);

    const links = byName(doc, 'a').filter((el) => {
      const href = attr(el, 'href') || '';
      if (!href.startsWith('#') || href === '#') return false;
      return /skip/i.test(textOf(el)) || classList(el).some((c) => /skip/i.test(c));
    });

    for (const link of links) {
      for (const rule of rulesTouchingClasses(rules, link)) {
        const display = declared(rule, 'display');
        const visibility = declared(rule, 'visibility');
        if (display === 'none' || visibility === 'hidden') {
          out.push(
            finding(
              skipLinkUnusable,
              rule.line,
              `${rule.selectors.join(', ')} takes the skip link out of the tab order with ${display === 'none' ? 'display: none' : 'visibility: hidden'}`
            )
          );
        }
      }

      const id = (attr(link, 'href') || '').slice(1);
      const target = elements(doc).find((el) => attr(el, 'id') === id);
      if (!target) {
        out.push(finding(skipLinkUnusable, link.line, `no element has id="${id}"`));
        continue;
      }
      const focusable = NATIVELY_FOCUSABLE.has(target.name) || hasAttr(target, 'tabindex');
      if (!focusable) {
        out.push(
          finding(
            skipLinkUnusable,
            target.line,
            `<${target.name} id="${id}"> cannot take focus: it is not natively focusable and has no tabindex`
          )
        );
      }
    }
    return out;
  }
};

/* --------------------------------------------------------------------------
   5. Focus indicator removed
   -------------------------------------------------------------------------- */

const focusOutlineRemoved = {
  id: 'focus-outline-removed',
  title: 'Focus indicator removed by a stylesheet rule',
  criteria: ['2.4.7'],
  proves:
    'A rule in this file sets outline to none or zero on focus, or universally, and no later rule restores an indicator for :focus-visible.',
  doesNotProve:
    'That no indicator is visible. This check does not resolve the cascade, so a ring supplied by a different selector, a box-shadow or a border change can still be doing the job. It also cannot judge whether an indicator that does exist meets the 3:1 contrast and thickness that 2.4.11 asks for.',
  detect(doc) {
    const out = [];
    for (const sheet of styleSheets(doc)) {
      const restores = sheet.rules.some(
        (rule) =>
          rule.selectors.some((s) => /(^|\s|,):focus-visible/.test(s) || s === ':focus-visible') &&
          (shorthandWidth(declared(rule, 'outline')) || 0) > 0
      );
      if (restores) continue;

      for (const rule of sheet.rules) {
        const outline = declared(rule, 'outline');
        const width = declared(rule, 'outline-width');
        const removed =
          (outline !== undefined && /^(none|0(px|rem|em)?)$/.test(outline.trim())) ||
          (width !== undefined && pixels(width) === 0);
        if (!removed) continue;
        const risky = rule.selectors.some((s) => s.includes(':focus') || s.includes('*'));
        if (!risky) continue;
        out.push(
          finding(
            focusOutlineRemoved,
            rule.line,
            `${rule.selectors.join(', ')} sets outline to ${outline ?? width} and nothing restores it for :focus-visible`
          )
        );
      }
    }
    return out;
  }
};

/* --------------------------------------------------------------------------
   6. Viewport scaling blocked
   -------------------------------------------------------------------------- */

const viewportScalingBlocked = {
  id: 'viewport-scaling-blocked',
  title: 'Viewport meta tag prevents zooming',
  criteria: ['1.4.4'],
  proves:
    'The viewport declaration sets user-scalable=no or a maximum-scale below 2, which is an author instruction not to allow text to be enlarged.',
  doesNotProve:
    'That a visitor cannot zoom. iOS Safari has ignored this restriction since version 10 and Android Chrome can be configured to. The reason to remove it anyway is that it is a declared intent to block zoom, it still applies in several in-app webviews, and removing it is free. It also says nothing about the harder half of 1.4.4: fixed pixel heights that clip text once it is enlarged.',
  detect(doc) {
    const out = [];
    for (const meta of byName(doc, 'meta')) {
      if ((attr(meta, 'name') || '').toLowerCase() !== 'viewport') continue;
      const content = attr(meta, 'content') || '';
      const parts = new Map(
        content.split(',').map((part) => {
          const [k, v] = part.split('=');
          return [(k || '').trim().toLowerCase(), (v || '').trim().toLowerCase()];
        })
      );
      if (parts.get('user-scalable') === 'no' || parts.get('user-scalable') === '0') {
        out.push(finding(viewportScalingBlocked, meta.line, 'user-scalable=no'));
      }
      const max = parts.get('maximum-scale');
      if (max !== undefined && Number(max) < 2) {
        out.push(finding(viewportScalingBlocked, meta.line, `maximum-scale=${max}`));
      }
    }
    return out;
  }
};

/* --------------------------------------------------------------------------
   7. A drawer that is not a dialog
   -------------------------------------------------------------------------- */

const dialogNotADialog = {
  id: 'dialog-not-a-dialog',
  title: 'Drawer or modal container without dialog semantics',
  criteria: ['1.3.1', '4.1.2'],
  proves:
    'A container named as a drawer, modal or dialog is missing role="dialog", aria-modal="true" or an accessible name, so nothing announces what opened or keeps the page behind it out of the way.',
  doesNotProve:
    'Anything at all about behaviour, which is where drawers actually fail. Whether focus moves in on open, whether the background is inert, whether Escape closes it and whether focus returns to the trigger are not in the markup. Adding the three attributes this check asks for and nothing else produces a drawer that announces itself correctly and is still unusable.',
  detect(doc) {
    const out = [];
    for (const el of elements(doc)) {
      if (!['div', 'aside', 'section', 'dialog'].includes(el.name)) continue;
      const names = [attr(el, 'id') || '', ...classList(el)].join(' ').toLowerCase();
      if (!/(drawer|modal|dialog|popup)/.test(names)) continue;
      // Child parts such as drawer__inner are not the container.
      if (/__/.test(classList(el).join(' ')) && !/(^|\s)(drawer|modal|dialog|popup)(\s|$)/.test(classList(el).join(' '))) {
        continue;
      }

      const role = (attr(el, 'role') || '').toLowerCase();
      if (el.name !== 'dialog' && role !== 'dialog' && role !== 'alertdialog') {
        out.push(finding(dialogNotADialog, el.line, `<${el.name} id="${attr(el, 'id') || ''}"> has no role="dialog"`));
      }
      if (el.name !== 'dialog' && attr(el, 'aria-modal') !== 'true') {
        out.push(finding(dialogNotADialog, el.line, `<${el.name} id="${attr(el, 'id') || ''}"> has no aria-modal="true"`));
      }
      if (accessibleName(el, doc) === '' || (!hasAttr(el, 'aria-label') && !hasAttr(el, 'aria-labelledby'))) {
        out.push(
          finding(
            dialogNotADialog,
            el.line,
            `<${el.name} id="${attr(el, 'id') || ''}"> has no aria-label or aria-labelledby`
          )
        );
      }
    }
    return out;
  }
};

/* --------------------------------------------------------------------------
   8. Meaning carried by colour or decoration alone
   -------------------------------------------------------------------------- */

const meaningInColourOnly = {
  id: 'meaning-in-colour-only',
  title: 'Price state conveyed by strikethrough or colour with no text equivalent',
  criteria: ['1.4.1'],
  proves:
    'A struck-through or sale-coloured price has no hidden text beside it naming which price is which, so the distinction exists only in the rendering.',
  doesNotProve:
    'That the page reads badly in every case. Some screen readers announce a deletion, inconsistently and depending on verbosity settings. It also only looks at prices, which is where this shows up on a storefront, and not at the other places colour alone carries meaning, such as stock status dots and required-field asterisks.',
  detect(doc) {
    const out = [];
    const marked = [
      ...byName(doc, 's', 'del'),
      ...elements(doc).filter((el) =>
        classList(el).some((c) => /(price--sale|sale-price|on-sale|badge--sale)/.test(c))
      )
    ];

    for (const el of new Set(marked)) {
      const siblings = el.parent ? el.parent.children.filter((c) => c !== el) : [];
      const hasHiddenLabel = siblings.some(
        (sibling) => isHiddenText(sibling) && textOf(sibling).trim() !== ''
      );
      const hasHiddenChild = el.children.some(
        (child) => isHiddenText(child) && textOf(child).trim() !== ''
      );
      if (hasHiddenLabel || hasHiddenChild) continue;
      out.push(
        finding(
          meaningInColourOnly,
          el.line,
          `<${el.name}${attr(el, 'class') ? ` class="${attr(el, 'class')}"` : ''}> has no text equivalent beside it`
        )
      );
    }
    return out;
  }
};

/* --------------------------------------------------------------------------
   9. Live region that arrives already populated
   -------------------------------------------------------------------------- */

const liveRegionArrivesPopulated = {
  id: 'live-region-arrives-populated',
  title: 'Live region containing text at the moment it enters the document',
  criteria: ['4.1.3'],
  proves:
    'The region is in the markup with its message already inside it. There is no mutation for the accessibility layer to observe, so in most screen reader and browser pairs nothing is announced.',
  doesNotProve:
    'That nothing is ever announced. Behaviour differs between screen readers, and a region that was already in the document and is being re-rendered with new text is a different case this check cannot distinguish from first insertion. The reliable pattern either way is an empty region present before the first message.',
  detect(doc) {
    const out = [];
    for (const el of elements(doc)) {
      const live = (attr(el, 'aria-live') || '').toLowerCase();
      const role = (attr(el, 'role') || '').toLowerCase();
      const isRegion =
        live === 'polite' || live === 'assertive' || ['status', 'alert', 'log'].includes(role);
      if (!isRegion) continue;
      const text = textOf(el).trim();
      if (text === '') continue;
      out.push(
        finding(
          liveRegionArrivesPopulated,
          el.line,
          `region arrives holding ${JSON.stringify(text.slice(0, 60))}`
        )
      );
    }
    return out;
  }
};

/* --------------------------------------------------------------------------
   10. Fields with no label
   -------------------------------------------------------------------------- */

const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
const AUTOCOMPLETE_EXPECTED = new Set(['email', 'tel', 'password']);

function describe(el, type) {
  return el.name === 'input' ? `<input type="${type}">` : `<${el.name}>`;
}

const fieldWithoutLabel = {
  id: 'field-without-label',
  title: 'Form field with no label, or with a placeholder standing in for one',
  criteria: ['1.3.5', '3.3.2', '4.1.2'],
  proves:
    'The field has no label associated by for and id, no wrapping label, no aria-label and no aria-labelledby. Where a placeholder is present, it is the only description of the field and it disappears as soon as the field has content.',
  doesNotProve:
    'That a user cannot guess what the field wants. Nor does it judge label wording, and it deliberately says nothing about visible labels: a label that exists only for the accessibility layer still fails users who need to check what they typed, and that judgement is not automatable.',
  detect(doc) {
    const out = [];
    for (const el of byName(doc, 'input', 'select', 'textarea')) {
      const type = (attr(el, 'type') || (el.name === 'input' ? 'text' : '')).toLowerCase();
      if (el.name === 'input' && SKIP_INPUT_TYPES.has(type)) continue;

      if (accessibleName(el, doc) === '') {
        const placeholder = attr(el, 'placeholder');
        out.push(
          finding(
            fieldWithoutLabel,
            el.line,
            placeholder
              ? `${describe(el, type)} has no label; placeholder="${placeholder}" is standing in for one`
              : `${describe(el, type)} has no label at all`
          )
        );
      }

      if (AUTOCOMPLETE_EXPECTED.has(type) && !hasAttr(el, 'autocomplete')) {
        out.push(
          finding(
            fieldWithoutLabel,
            el.line,
            `${describe(el, type)} has no autocomplete token, which 1.3.5 asks for on fields collecting information about the user`
          )
        );
      }
    }
    return out;
  }
};

/* --------------------------------------------------------------------------
   11. Targets below the minimum size
   -------------------------------------------------------------------------- */

const CONTROL_SELECTOR_HINTS = /(button|icon|pagination|swatch|a11y-target|dot|arrow)/;
const CONTROL_ELEMENTS = new Set(['a', 'button', 'input', 'select', 'summary']);

const targetUnder24px = {
  id: 'target-under-24px',
  title: 'Control sized below the 24 by 24 CSS pixel minimum',
  criteria: ['2.5.8'],
  proves:
    'A rule that plainly targets a control fixes both of its dimensions, and at least one of them is under 24 CSS pixels.',
  doesNotProve:
    'The rendered size, which padding, line height, a larger child or a pseudo-element can all change. It also does not apply the exceptions in 2.5.8: inline links in a sentence, targets whose spacing puts a 24px circle around them without overlap, and controls whose size is determined by the user agent are all conforming at any size. Note that the Level AA minimum is 24, not 44. 44 is 2.5.5 at Level AAA.',
  detect(doc) {
    const out = [];
    for (const rule of allRules(doc)) {
      const looksLikeControl = rule.selectors.some((selector) => {
        if (CONTROL_SELECTOR_HINTS.test(selector)) return true;
        const last = selector.split(/[\s>+~]/).filter(Boolean).pop() || '';
        return CONTROL_ELEMENTS.has(last.replace(/[:[].*$/, ''));
      });
      if (!looksLikeControl) continue;

      // A one pixel clipped box is the visually hidden pattern, not a target.
      const clipped =
        declared(rule, 'position') === 'absolute' &&
        declared(rule, 'overflow') === 'hidden' &&
        (declared(rule, 'clip') !== undefined || declared(rule, 'clip-path') !== undefined);
      if (clipped) continue;

      const width = pixels(declared(rule, 'width') ?? declared(rule, 'min-width'));
      const height = pixels(declared(rule, 'height') ?? declared(rule, 'min-height'));
      if (width === undefined || height === undefined) continue;
      if (width >= 24 && height >= 24) continue;

      out.push(
        finding(
          targetUnder24px,
          rule.line,
          `${rule.selectors.join(', ')} is ${width} by ${height} CSS pixels`
        )
      );
    }
    return out;
  }
};

/* -------------------------------------------------------------------------- */

export const CHECKS = [
  unnamedControl,
  nestedInteractive,
  swatchNotAControl,
  skipLinkUnusable,
  focusOutlineRemoved,
  viewportScalingBlocked,
  dialogNotADialog,
  meaningInColourOnly,
  liveRegionArrivesPopulated,
  fieldWithoutLabel,
  targetUnder24px
];

export const CHECK_IDS = CHECKS.map((check) => check.id);

export function checkById(id) {
  return CHECKS.find((check) => check.id === id);
}

/** Run every check, or a named subset, over a string of HTML. */
export function run(html, ids = CHECK_IDS) {
  const doc = parseHtml(html);
  const wanted = new Set(ids);
  const out = [];
  for (const check of CHECKS) {
    if (!wanted.has(check.id)) continue;
    out.push(...check.detect(doc));
  }
  return out;
}

/** Findings grouped by check id. */
export function runGrouped(html, ids = CHECK_IDS) {
  const grouped = new Map();
  for (const item of run(html, ids)) {
    if (!grouped.has(item.check)) grouped.set(item.check, []);
    grouped.get(item.check).push(item);
  }
  return grouped;
}
