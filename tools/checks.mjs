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

/**
 * Does one media query apply to a screen?
 *
 * A rule that only applies to print cannot take a control out of the tab
 * order, cannot remove a focus indicator a visitor will ever see, and cannot
 * make a pointer target too small, because a printed page has no tab order,
 * no focus and no pointer. Three detectors in this file read declarations
 * without looking at the at-rule they sit inside, which reported
 * `@media print { .skip-link { display: none } }` as a 2.4.1 failure. Hiding a
 * skip link from print is a thing themes deliberately do.
 *
 * The parser in tools/css.mjs already records the at-rule stack on every rule.
 * Nothing read it, which is the whole of that defect.
 *
 * Only print is excluded, and only when no other media type is listed beside
 * it. A forced-colors query, a width query and a hover query can all be active
 * while somebody is using the page, so a reset inside one of those is still a
 * reset.
 */
function mediaAppliesOnScreen(query) {
  const q = query.toLowerCase();
  if (!/\bprint\b/.test(q)) return true;
  return /\b(screen|all)\b/.test(q);
}

/** Is this rule capable of applying while somebody is using the page? */
export function appliesOnScreen(rule) {
  for (const at of rule.at ?? []) {
    if (!at.toLowerCase().startsWith('@media')) continue;
    const queries = at.slice('@media'.length).split(',');
    if (!queries.some(mediaAppliesOnScreen)) return false;
  }
  return true;
}

/**
 * Does a selector carry this class?
 *
 * A class name is a token, not a substring. Matching with includes() meant
 * that a rule for `.skip-link-overlay` was read as a rule for `.skip-link`,
 * so hiding a backdrop was reported as hiding the link. The lookahead is what
 * makes it a token: a class name continues through word characters and
 * hyphens, so anything else, including the end of the selector, ends it.
 */
export function selectorTouchesClass(selector, cls) {
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${escaped}(?![\\w-])`).test(selector);
}

/** Rules whose selector list mentions any of an element's classes. */
function rulesTouchingClasses(rules, el) {
  const classes = classList(el);
  if (!classes.length) return [];
  return rules.filter((rule) =>
    rule.selectors.some((selector) => classes.some((c) => selectorTouchesClass(selector, c)))
  );
}

/**
 * How this rule removes the focus indicator, or undefined if it does not.
 *
 * Three spellings, and only the first was read before. `outline: none` was
 * matched by requiring the whole declaration to be exactly `none` or a zero,
 * so `outline: 0 none`, which is the same reset with a redundant keyword after
 * it, passed the check written to catch it. `outline-style: none` was not read
 * at all, and it removes the outline whatever the width says.
 *
 * `outline: 3px solid transparent` is deliberately not a removal. It is the
 * forced-colors pattern this repository recommends in
 * examples/focus-outline-removed/pass.html: a transparent outline reserves the
 * space and the high contrast mode paints it.
 */
export function outlineRemoval(rule) {
  const style = declared(rule, 'outline-style');
  if (style !== undefined && style.trim().toLowerCase() === 'none') {
    return `outline-style: ${style.trim()}`;
  }

  const width = declared(rule, 'outline-width');
  if (width !== undefined && pixels(width) === 0) return `outline-width: ${width.trim()}`;

  const outline = declared(rule, 'outline');
  if (outline === undefined) return undefined;
  const value = outline.trim();
  if (value.toLowerCase().split(/\s+/).includes('none')) return `outline: ${value}`;
  if (shorthandWidth(value) === 0) return `outline: ${value}`;
  return undefined;
}

/** Does this rule put an indicator back, with a width somebody could see? */
function restoresIndicator(rule) {
  if (outlineRemoval(rule)) return false;
  const width = shorthandWidth(declared(rule, 'outline')) ?? pixels(declared(rule, 'outline-width'));
  return (width ?? 0) > 0;
}

/**
 * The size this rule actually produces along one axis.
 *
 * min-width wins over width in the box model, and reading width alone meant
 * that `width: 16px; min-width: 24px` was reported as a 16 pixel target when
 * it renders at 24. That is not a hypothetical pairing: it is what applying
 * this repository's own baseline produces, because assets/a11y-base.css sets
 * target size with min-width and min-height, so the fix this repository
 * recommends made this repository's own detector report a failure.
 */
export function effectivePixels(rule, axis) {
  const explicit = pixels(declared(rule, axis));
  const minimum = pixels(declared(rule, `min-${axis}`));
  if (explicit === undefined) return minimum;
  if (minimum === undefined) return explicit;
  return Math.max(explicit, minimum);
}

/**
 * One finding, carrying the catalogue code for the reason it fired.
 *
 * A check is not a finding, and treating the two as the same thing was the
 * largest gap in this repository. Several of these detectors fire for more
 * than one reason, and until this argument existed every reason arrived
 * labelled with the check id alone, so `unnamed-control` covered a button
 * with nothing inside it and a button whose aria-labelledby points at an id
 * that is not in the file. Those are different defects with different fixes,
 * and a set of findings that cannot tell them apart cannot be asserted
 * against.
 *
 * tools/findings.mjs is the catalogue. test/catalogue.mjs asserts the codes it
 * declares against the codes the detectors actually emit, in both directions,
 * so a code cannot sit in the catalogue having never fired and a detector
 * cannot emit one that nothing describes.
 */
function finding(check, reason, line, evidence, extra = {}) {
  return {
    check: check.id,
    code: `${check.id}/${reason}`,
    criteria: check.criteria,
    line,
    evidence,
    ...extra
  };
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
    const all = elements(doc);
    const hasId = (id) => all.some((candidate) => attr(candidate, 'id') === id);

    for (const el of all) {
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
      if (accessibleName(el, doc) !== '') continue;

      const where = `<${el.name}${attr(el, 'class') ? ` class="${attr(el, 'class')}"` : ''}>`;
      const labelledby = (attr(el, 'aria-labelledby') || '').trim();
      const ariaLabel = attr(el, 'aria-label');

      /* The order below is the order of the fixes, which is not the order of
         the markup. A dangling aria-labelledby is a one word edit to an id; a
         control with nothing in it needs somebody to decide what it is called.
         Reporting both as "no accessible name" put them in the same queue. */
      if (labelledby) {
        const ids = labelledby.split(/\s+/).filter(Boolean);
        const missing = ids.filter((id) => !hasId(id));
        if (missing.length > 0) {
          out.push(
            finding(
              unnamedControl,
              'dangling-labelledby',
              el.line,
              `${where} points aria-labelledby at ${missing.map((id) => `id="${id}"`).join(' and ')}, which nothing in this file has`
            )
          );
        } else {
          out.push(
            finding(
              unnamedControl,
              'empty-labelledby-target',
              el.line,
              `${where} points aria-labelledby at ${ids.map((id) => `id="${id}"`).join(' and ')}, and what it resolves to holds no text`
            )
          );
        }
        continue;
      }

      if (ariaLabel !== undefined) {
        out.push(
          finding(
            unnamedControl,
            'empty-label',
            el.line,
            `${where} carries aria-label=${JSON.stringify(ariaLabel)}, which is empty once trimmed`
          )
        );
        continue;
      }

      const content = el.children.filter(
        (child) => child.type === 'element' || (child.type === 'text' && child.value.trim() !== '')
      );

      if (content.length > 0 && content.every((child) => child.type === 'element' && attr(child, 'aria-hidden') === 'true')) {
        out.push(
          finding(
            unnamedControl,
            'aria-hidden-content-only',
            el.line,
            `${where} holds only ${content.map((c) => `<${c.name} aria-hidden="true">`).join(' ')}, so everything in it is withheld from the accessibility layer`
          )
        );
        continue;
      }

      if (content.length === 1 && content[0].name === 'img') {
        const alt = attr(content[0], 'alt');
        out.push(
          finding(
            unnamedControl,
            'image-without-alt',
            el.line,
            `${where} holds only an image, whose alt is ${alt === undefined ? 'absent' : 'empty'}`
          )
        );
        continue;
      }

      if (content.length === 1 && content[0].name === 'svg') {
        out.push(
          finding(
            unnamedControl,
            'svg-without-title',
            el.line,
            `${where} holds only an inline graphic with no title element and no aria-label`
          )
        );
        continue;
      }

      out.push(
        finding(
          unnamedControl,
          'no-labelling-at-all',
          el.line,
          `${where} has no text content, no image alt, no aria-label and no aria-labelledby`
        )
      );
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

      /* The pairing decides the fix. A control inside a link is the product
         card, and the fix is to make them siblings. A link inside a link is
         usually a badge that became a link, and the fix is to unlink the
         badge. Anything else is rarer and needs reading. */
      const reason =
        outer.name === 'a' && el.name === 'a'
          ? 'link-in-link'
          : outer.name === 'a'
            ? 'control-in-link'
            : 'control-in-control';

      out.push(
        finding(
          nestedInteractive,
          reason,
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
          dataHook ? 'option-data-attribute' : 'class-hook-only',
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
      for (const rule of rulesTouchingClasses(rules, link).filter(appliesOnScreen)) {
        const display = declared(rule, 'display');
        const visibility = declared(rule, 'visibility');
        if (display === 'none' || visibility === 'hidden') {
          out.push(
            finding(
              skipLinkUnusable,
              display === 'none' ? 'hidden-by-display' : 'hidden-by-visibility',
              rule.line,
              `${rule.selectors.join(', ')} takes the skip link out of the tab order with ${display === 'none' ? 'display: none' : 'visibility: hidden'}`
            )
          );
        }
      }

      const id = (attr(link, 'href') || '').slice(1);
      const target = elements(doc).find((el) => attr(el, 'id') === id);
      if (!target) {
        out.push(finding(skipLinkUnusable, 'target-missing', link.line, `no element has id="${id}"`));
        continue;
      }
      const focusable = NATIVELY_FOCUSABLE.has(target.name) || hasAttr(target, 'tabindex');
      if (!focusable) {
        out.push(
          finding(
            skipLinkUnusable,
            'target-not-focusable',
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

    /* One document is one cascade. Looking for the restore inside the same
       style block as the reset was the defect here, and it fails on the exact
       arrangement a Shopify theme produces: critical CSS inline in
       layout/theme.liquid and component CSS in a {% style %} block inside the
       section. Reset in one, restore in the other, and this reported a theme
       with a perfectly good focus ring as having none. */
    const rules = allRules(doc).filter(appliesOnScreen);
    /* The selector test was the other half of this defect, and on its own it
       is the more embarrassing half. It accepted :focus-visible only at the
       start of a selector or after whitespace or a comma, which means it
       recognised a bare `:focus-visible { }` and did not recognise
       `.button:focus-visible { }`. The second is what anybody actually writes,
       because a theme restores the indicator on its own components. It was
       hidden behind the per-block scoping above: the reset and the restore
       were usually in different blocks, so the restore was never reached to be
       rejected. */
    const restores = rules.some(
      (rule) =>
        rule.selectors.some((s) => s.includes(':focus-visible')) && restoresIndicator(rule)
    );
    if (restores) return out;

    for (const rule of rules) {
      const removal = outlineRemoval(rule);
      if (!removal) continue;
      const risky = rule.selectors.some((s) => s.includes(':focus') || s.includes('*'));
      if (!risky) continue;
      out.push(
        finding(
          focusOutlineRemoved,
          rule.selectors.some((s) => s.includes('*')) ? 'universal-reset' : 'focus-reset',
          rule.line,
          `${rule.selectors.join(', ')} sets ${removal} and nothing restores an indicator for :focus-visible`
        )
      );
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
        out.push(finding(viewportScalingBlocked, 'user-scalable-no', meta.line, 'user-scalable=no'));
      }
      const max = parts.get('maximum-scale');
      if (max !== undefined && Number(max) < 2) {
        out.push(
          finding(viewportScalingBlocked, 'maximum-scale-below-2', meta.line, `maximum-scale=${max}`)
        );
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

      /* The backdrop is not the dialog. Every drawer implementation ships one,
         it is usually called modal-overlay, and the name test above matched it,
         so on a correctly built drawer the only findings this check produced
         were three wrong ones about the element behind it. Giving a backdrop
         role="dialog" would be worse than leaving it alone.

         This is a name test and it inherits the limit of one: a theme whose
         actual drawer is called overlay is skipped here, and no check in this
         repository will report it. */
      if (/(overlay|backdrop|scrim|underlay)/.test(names)) continue;
      // Child parts such as drawer__inner are not the container.
      if (/__/.test(classList(el).join(' ')) && !/(^|\s)(drawer|modal|dialog|popup)(\s|$)/.test(classList(el).join(' '))) {
        continue;
      }

      const role = (attr(el, 'role') || '').toLowerCase();
      if (el.name !== 'dialog' && role !== 'dialog' && role !== 'alertdialog') {
        out.push(
          finding(
            dialogNotADialog,
            'no-dialog-role',
            el.line,
            `<${el.name} id="${attr(el, 'id') || ''}"> has no role="dialog"`
          )
        );
      }
      if (el.name !== 'dialog' && attr(el, 'aria-modal') !== 'true') {
        out.push(
          finding(
            dialogNotADialog,
            'no-aria-modal',
            el.line,
            `<${el.name} id="${attr(el, 'id') || ''}"> has no aria-modal="true"`
          )
        );
      }
      if (accessibleName(el, doc) === '' || (!hasAttr(el, 'aria-label') && !hasAttr(el, 'aria-labelledby'))) {
        out.push(
          finding(
            dialogNotADialog,
            'no-accessible-name',
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
          el.name === 's' || el.name === 'del' ? 'struck-price' : 'sale-class',
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
          live === 'polite' || live === 'assertive' ? 'aria-live-attribute' : 'status-role',
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
            placeholder ? 'placeholder-as-label' : 'no-label-at-all',
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
            'missing-autocomplete',
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

      if (!appliesOnScreen(rule)) continue;

      const width = effectivePixels(rule, 'width');
      const height = effectivePixels(rule, 'height');
      if (width === undefined || height === undefined) continue;
      if (width >= 24 && height >= 24) continue;

      out.push(
        finding(
          targetUnder24px,
          width < 24 && height < 24 ? 'both-dimensions' : 'one-dimension',
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

/** Findings grouped by catalogue code. */
export function runByCode(html, ids = CHECK_IDS) {
  const grouped = new Map();
  for (const item of run(html, ids)) {
    if (!grouped.has(item.code)) grouped.set(item.code, []);
    grouped.get(item.code).push(item);
  }
  return grouped;
}
