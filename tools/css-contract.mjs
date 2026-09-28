/* ---------------------------------------------------------------------------
   css-contract.mjs
   The guarantees assets/a11y-base.css makes, expressed as assertions over the
   file itself.

   The README describes what the baseline stylesheet does. This turns that
   description into something a machine checks, so the file and the claim cannot
   drift: if someone softens the focus ring to a hairline or swaps the visually
   hidden recipe for display:none, CI says so rather than the next audit.

   Each guarantee returns { id, ok, detail, line }. Nothing here renders CSS or
   resolves the cascade, so a guarantee that holds is a guarantee about what the
   file declares, not about what a visitor sees once a theme stylesheet has had
   its turn.
   --------------------------------------------------------------------------- */

import { parse, rulesFor, rulesWhere, declared, atRules, pixels, shorthandWidth } from './css.mjs';
import { ratio, ratioRounded } from './contrast.mjs';

/** Minimum focus indicator thickness this repository commits to. */
export const MIN_OUTLINE_PX = 2;

/** WCAG 2.5.8 Level AA minimum target size in CSS pixels. */
export const MIN_TARGET_PX = 24;

/** The contrast the 1.4.11 control boundary rule has to clear. */
export const MIN_BOUNDARY_RATIO = 3;

function result(id, ok, detail, line) {
  return { id, ok, detail, line };
}

function hasVisuallyHiddenRecipe(rule) {
  return (
    declared(rule, 'position') === 'absolute' &&
    pixels(declared(rule, 'width')) === 1 &&
    pixels(declared(rule, 'height')) === 1 &&
    declared(rule, 'overflow') === 'hidden' &&
    (declared(rule, 'clip') !== undefined || declared(rule, 'clip-path') !== undefined)
  );
}

/**
 * Check a stylesheet against the contract.
 * Pass the source of assets/a11y-base.css.
 */
export function audit(source) {
  const rules = parse(source);
  const out = [];
  const conditions = atRules(rules);

  /* 1. The visually hidden utility, which every snippet depends on. */
  const hidden = rulesFor(rules, '.visually-hidden');
  if (!hidden.length) {
    out.push(result('visually-hidden-present', false, 'no .visually-hidden rule in the sheet'));
  } else {
    const rule = hidden[0];
    out.push(
      result(
        'visually-hidden-recipe',
        hasVisuallyHiddenRecipe(rule),
        'position:absolute, 1px by 1px, overflow:hidden and a clip are all required, so the content stays in the accessibility tree and stays focusable',
        rule.line
      )
    );
    const display = declared(rule, 'display');
    const visibility = declared(rule, 'visibility');
    out.push(
      result(
        'visually-hidden-stays-rendered',
        display !== 'none' && visibility !== 'hidden',
        'display:none and visibility:hidden remove the content from the accessibility tree and from the tab order, which is the opposite of the intent',
        rule.line
      )
    );
  }

  /* 2. A focus indicator that is actually visible. */
  /* The unconditional rule only. The forced-colors fallback is also a
     :focus-visible rule, and counting it would let the baseline indicator be
     thinned while the sheet still looked compliant. */
  const focusVisible = rulesWhere(rules, (selector) => selector === ':focus-visible').filter(
    (rule) => rule.at.length === 0
  );
  const outlineWidths = focusVisible
    .map((rule) => shorthandWidth(declared(rule, 'outline')) ?? pixels(declared(rule, 'outline-width')))
    .filter((n) => n !== undefined);
  const thickest = outlineWidths.length ? Math.max(...outlineWidths) : 0;
  out.push(
    result(
      'focus-indicator-thickness',
      thickest >= MIN_OUTLINE_PX,
      `the :focus-visible outline is ${thickest}px and the contract is at least ${MIN_OUTLINE_PX}px`,
      focusVisible[0]?.line
    )
  );
  const offsets = focusVisible.map((rule) => declared(rule, 'outline-offset')).filter(Boolean);
  out.push(
    result(
      'focus-indicator-offset',
      offsets.length > 0,
      'an outline-offset keeps the ring off the control edge, which is what makes it visible against a dark button',
      focusVisible[0]?.line
    )
  );

  /* 3. Nothing in the sheet removes an outline. This file is the fix for that
        pattern, so it must not contain it. */
  const resets = rules.filter((rule) => {
    const outline = declared(rule, 'outline');
    const width = declared(rule, 'outline-width');
    return (
      (outline !== undefined && /^(none|0(px|rem|em)?)$/.test(outline.trim())) ||
      (width !== undefined && pixels(width) === 0)
    );
  });
  out.push(
    result(
      'no-outline-reset',
      resets.length === 0,
      resets.length
        ? `${resets.map((r) => r.selectors.join(', ')).join(' | ')} removes an outline`
        : 'no rule sets outline to none or zero',
      resets[0]?.line
    )
  );

  /* 4. Windows high contrast mode, where author colours are discarded. */
  out.push(
    result(
      'forced-colors-fallback',
      conditions.some((condition) => condition.includes('forced-colors')),
      'a coloured ring can disappear entirely under forced colours, and a transparent outline is repainted by the operating system'
    )
  );

  /* 5. Reduced motion, and reduced motion that does not break the page. */
  const reducedMotion = conditions.find((condition) => condition.includes('prefers-reduced-motion'));
  out.push(
    result(
      'reduced-motion-block',
      Boolean(reducedMotion),
      'carousels, parallax headers and scroll-triggered reveals are standard in commerce themes and are a real trigger for vestibular disorders'
    )
  );
  const motionRules = rules.filter((rule) =>
    rule.at.some((condition) => condition.includes('prefers-reduced-motion'))
  );
  out.push(
    result(
      'reduced-motion-does-not-hide',
      motionRules.every((rule) => declared(rule, 'display') !== 'none'),
      'suppressing motion must not suppress content: display:none inside the reduced motion block removes things the user asked to see still, not still moving'
    )
  );
  out.push(
    result(
      'reduced-motion-covers-transitions',
      motionRules.some((rule) => declared(rule, 'transition-duration') !== undefined) &&
        motionRules.some((rule) => declared(rule, 'animation-duration') !== undefined),
      'animation and transition both have to be reduced; a block that only touches animation leaves every hover and slide-in running'
    )
  );

  /* 6. Target size. */
  const targetRules = rulesWhere(rules, (selector) => selector.includes('a11y-target'));
  const targetWidth = targetRules.map((rule) => pixels(declared(rule, 'min-width'))).find((n) => n !== undefined);
  const targetHeight = targetRules.map((rule) => pixels(declared(rule, 'min-height'))).find((n) => n !== undefined);
  out.push(
    result(
      'target-size-minimum',
      targetWidth !== undefined && targetHeight !== undefined &&
        targetWidth >= MIN_TARGET_PX && targetHeight >= MIN_TARGET_PX,
      `the target utility is ${targetWidth} by ${targetHeight} and 2.5.8 Level AA asks for at least ${MIN_TARGET_PX} by ${MIN_TARGET_PX}`,
      targetRules[0]?.line
    )
  );

  /* 7. Control boundary contrast, computed rather than asserted. */
  const borderRules = rulesWhere(rules, (selector) => /input|select|textarea|field__input/.test(selector));
  const borderColour = borderRules
    .map((rule) => declared(rule, 'border') ?? declared(rule, 'border-color'))
    .map((value) => (value ? value.match(/#[0-9a-fA-F]{3,6}/)?.[0] : undefined))
    .find(Boolean);
  if (!borderColour) {
    out.push(result('control-boundary-contrast', false, 'no control border colour found to check'));
  } else {
    const measured = ratioRounded(borderColour, '#ffffff');
    out.push(
      result(
        'control-boundary-contrast',
        ratio(borderColour, '#ffffff') >= MIN_BOUNDARY_RATIO,
        `${borderColour} on white is ${measured}:1 and 1.4.11 asks for ${MIN_BOUNDARY_RATIO}:1`,
        borderRules[0]?.line
      )
    );
  }

  /* 8. Reflow: horizontal scrolling scoped to the component, never the page. */
  const pageScroll = rules.filter(
    (rule) =>
      rule.selectors.some((selector) => ['html', 'body', 'html, body'].includes(selector)) &&
      (declared(rule, 'overflow-x') === 'auto' || declared(rule, 'overflow-x') === 'scroll')
  );
  out.push(
    result(
      'reflow-scoped-to-component',
      pageScroll.length === 0,
      '1.4.10 allows horizontal scrolling for the size chart, not for the page',
      pageScroll[0]?.line
    )
  );

  return out;
}

/** Only the guarantees that failed. */
export function failures(source) {
  return audit(source).filter((item) => !item.ok);
}
