/* ---------------------------------------------------------------------------
   findings.mjs
   The catalogue: every finding the detectors in tools/checks.mjs can report,
   one entry per reason rather than one per check.

   Why this exists. Eleven checks reported findings labelled with the check id
   alone, and eleven of the thirty-two reasons below were the only reason the
   example pairs ever reached. The other twenty-one had never been observed to
   fire, which is not an abstract gap: on the first run after the fixtures in
   test/fixtures/ were written to reach them, nine real defects came out of
   it, and seven of the nine were in branches the pairs never touched. The
   sibling repository technical-seo-toolkit found four of six the same way.

   A check is a question. A finding is an answer, and the answers have
   different fixes. `unnamed-control` covered a button holding a decorative
   graphic, a button whose aria-labelledby points at an id nothing has, and a
   button whose aria-label is a space. The first needs somebody to decide what
   the control is called, the second is a one word edit, and the third is a
   theme setting the merchant left blank. Putting all three in one queue is
   how the cheap ones stay unfixed.

   `fix` is the edit, not the principle. `cannotSay` is per finding rather
   than per check, because the limits differ by reason: a dangling
   aria-labelledby is a fact about the file, and a control whose only content
   is aria-hidden may well be named by a script this cannot see.

   test/catalogue.mjs asserts this list against what the detectors emit, in
   both directions. docs/09-finding-catalogue.md is generated from it by
   tools/gen-catalogue.mjs and checked in CI, so the prose cannot drift from
   the code.
   --------------------------------------------------------------------------- */

export const FINDINGS = [
  /* ---- unnamed-control ---------------------------------------------------- */
  {
    code: 'unnamed-control/aria-hidden-content-only',
    summary:
      'Everything inside the control carries aria-hidden="true", so the glyph is correctly withheld and nothing is left to announce.',
    fix: 'Add visually hidden text inside the control. It survives translation, a failed icon request and voice control, none of which an aria-label does as well.',
    cannotSay:
      'That a user hears nothing. A theme script can set aria-label on load, and this reads the file before any script has run.'
  },
  {
    code: 'unnamed-control/svg-without-title',
    summary:
      'The only content is an inline graphic with no title element, no aria-label and no aria-hidden, so it is exposed and anonymous at once.',
    fix: 'Decide which it is. A decorative icon takes aria-hidden="true" plus visually hidden text on the control; a meaningful one takes a title element inside the svg.',
    cannotSay: 'Which of the two it is. That is a judgement about what the icon means on this page.'
  },
  {
    code: 'unnamed-control/image-without-alt',
    summary:
      'The only content is an image whose alt is absent or empty, which is the shape a merchant produces when the theme has no icon for what they wanted.',
    fix: 'Put the name on the image with alt, not on the control. An image inside a link is named by its alt, and that is the one place a merchant can reach from the admin.',
    cannotSay: 'Whether an empty alt was deliberate. On a decorative image it is correct, and then the control needs its own name instead.'
  },
  {
    code: 'unnamed-control/dangling-labelledby',
    summary:
      'aria-labelledby names an id that nothing in the file has, which is what happens when a section is copied and the element it referred to stays behind.',
    fix: 'Point it at an id that exists, or delete the attribute and name the control directly. A dangling reference is treated as no name at all, not as a fallback.',
    cannotSay:
      'That the id is missing at runtime. A different section can render it, and on a storefront assembled from sections that is worth checking before editing.'
  },
  {
    code: 'unnamed-control/empty-labelledby-target',
    summary:
      'aria-labelledby resolves to an element that is present and holds no text, which is what a metafield or a block setting does when it is empty for this product.',
    fix: 'Give the referenced element a fallback in Liquid, or name the control directly. An empty target is worse than a dangling one, because it passes a check that only looks for the id.',
    cannotSay: 'Whether it is empty for every product. One product with a populated metafield is enough to hide this.'
  },
  {
    code: 'unnamed-control/empty-label',
    summary: 'aria-label is present and empty once trimmed, which is a theme setting the merchant left blank.',
    fix: 'Supply a default in the Liquid that renders the attribute, so a blank setting falls back to wording rather than to nothing.',
    cannotSay: 'Nothing beyond the file. This one is unambiguous: an empty aria-label is an empty name.'
  },
  {
    code: 'unnamed-control/no-labelling-at-all',
    summary:
      'No text, no image alt, no aria-label and no aria-labelledby. Often a control whose glyph was in a pseudo-element on a class the theme no longer sets.',
    fix: 'Add the name as text. If the control is genuinely redundant, remove it from the tab order rather than naming it, because an empty control in the tab order is a stop with nothing to say.',
    cannotSay: 'Whether a name arrives from generated content. A label supplied by ::before is one this cannot read and a screen reader may or may not announce.'
  },

  /* ---- nested-interactive ------------------------------------------------- */
  {
    code: 'nested-interactive/control-in-link',
    summary: 'A control inside the anchor that wraps a whole product card, which is the common shape of this defect on a storefront.',
    fix: 'Make them siblings and stretch a pseudo-element from the title link across the card, so the card stays clickable for a pointer without nesting.',
    cannotSay: 'How badly it behaves, which varies by pairing and by screen reader.'
  },
  {
    code: 'nested-interactive/link-in-link',
    summary: 'A link inside a link, usually a badge that became a link to a collection while sitting inside the card anchor.',
    fix: 'Unlink the badge. A sale badge is a label, and the card already links to the product.',
    cannotSay: 'Which of the two links a user meant to activate, which is the point: neither can the browser.'
  },
  {
    code: 'nested-interactive/control-in-control',
    summary: 'Two controls nested where neither is a link, such as a checkbox inside an element given role="button" so the whole thing is clickable.',
    fix: 'Keep the native control and style its label, rather than wrapping it in something that claims to be a control itself.',
    cannotSay: 'Which role wins. Browsers and screen readers disagree, and that disagreement is the defect.'
  },

  /* ---- swatch-not-a-control ----------------------------------------------- */
  {
    code: 'swatch-not-a-control/option-data-attribute',
    summary: 'A div or span carrying the option value in a data attribute, with no role, no tabindex and no name.',
    fix: 'A fieldset and legend around native radio inputs, with the colour name as text rather than as a border colour.',
    cannotSay: 'That the swatch does nothing on click. It almost certainly works with a mouse, which is why it survives testing.'
  },
  {
    code: 'swatch-not-a-control/class-hook-only',
    summary: 'The same defect in a theme that reads the option out of the element text, so there is no data attribute to find it by, only a class.',
    fix: 'The same fix. Note that the class is the only hook here, so a theme that renames it puts the swatch beyond this check entirely.',
    cannotSay: 'Anything about a theme using a third naming convention. This finding is as good as the class list it matches.'
  },

  /* ---- skip-link-unusable ------------------------------------------------- */
  {
    code: 'skip-link-unusable/hidden-by-display',
    summary: 'A rule in this file takes the skip link out of the tab order with display: none, which is the version everybody quotes.',
    fix: 'Offset it off screen with position and a negative coordinate, and bring it back on focus. display: none means :focus never happens.',
    cannotSay: 'That no later rule overrides it. This does not resolve the cascade and reads declarations as written.'
  },
  {
    code: 'skip-link-unusable/hidden-by-visibility',
    summary: 'The same removal written with visibility: hidden, which is just as complete and survives a review that greps for display: none.',
    fix: 'The same offset pattern. Reach for it rather than for visibility: visible on focus, which does not restore a child of a hidden ancestor.',
    cannotSay:
      'That no later rule overrides it, and in this spelling that matters more: visibility is inherited, so a hidden ancestor can produce this without any rule naming the link at all, and no rule naming the link can undo it.'
  },
  {
    code: 'skip-link-unusable/target-missing',
    summary:
      'The fragment the link points at does not exist in the file. This is the failure that outlives a theme update: visible, focusable, announced correctly, and does nothing.',
    fix: 'Point it at the id the layout actually renders, and keep the two together in one snippet so they cannot be renamed separately.',
    cannotSay: 'That it is missing at runtime, on a page assembled from sections that another section may render.'
  },
  {
    code: 'skip-link-unusable/target-not-focusable',
    summary: 'The target exists and cannot accept focus, because it is not natively focusable and carries no tabindex.',
    fix: 'tabindex="-1" on the target. Without it several browsers scroll to it and leave focus behind, so the link appears to work.',
    cannotSay: 'Whether focus lands once the attribute is there. That is browser behaviour and the way to know is to press Tab.'
  },

  /* ---- focus-outline-removed ---------------------------------------------- */
  {
    code: 'focus-outline-removed/universal-reset',
    summary: 'A universal selector removes the outline and nothing anywhere in the document restores an indicator for :focus-visible.',
    fix: ':focus-visible, which shows the indicator for keyboard input and suppresses it for a pointer, which is what the reset was reaching for.',
    cannotSay:
      'That no indicator is visible. A box-shadow or a border change can be doing the job, and neither is read here. Nor whether an indicator that does exist meets the contrast and thickness 2.4.11 asks for.'
  },
  {
    code: 'focus-outline-removed/focus-reset',
    summary: 'The same removal scoped to named components rather than applied universally, which is what a theme accumulates one component at a time.',
    fix: 'The same fix, done once in a baseline rather than per component, because this finding arrives in batches and each addition looked small on its own.',
    cannotSay:
      'Which component the visitor will reach first. A per component reset leaves the indicator intact on everything it has not reached yet, so a keyboard pass over one page can come back clean.'
  },

  /* ---- viewport-scaling-blocked ------------------------------------------- */
  {
    code: 'viewport-scaling-blocked/user-scalable-no',
    summary: 'The viewport declaration carries user-scalable=no, which is an author instruction not to allow text to be enlarged.',
    fix: 'Remove it, and set a 16px minimum font size on fields, which is usually what it was added for.',
    cannotSay:
      'That a visitor cannot zoom. iOS Safari has ignored this since version 10. Remove it anyway: it still applies in several in-app webviews, and it is free.'
  },
  {
    code: 'viewport-scaling-blocked/maximum-scale-below-2',
    summary: 'maximum-scale is set below 2, so enlargement is capped under the 200 per cent that 1.4.4 asks for.',
    fix: 'Remove the cap rather than raising it. There is no value for it that helps.',
    cannotSay: 'Anything about the harder half of 1.4.4: fixed pixel heights that clip text once it is enlarged.'
  },

  /* ---- dialog-not-a-dialog ------------------------------------------------ */
  {
    code: 'dialog-not-a-dialog/no-dialog-role',
    summary: 'A container named as a drawer, modal or popup carries no role="dialog", so nothing announces that something opened.',
    fix: 'role="dialog" on the container, or the dialog element, which brings the role with it.',
    cannotSay: 'Anything at all about behaviour, which is where drawers actually fail. test/gap.mjs asserts that rather than leaving it here.'
  },
  {
    code: 'dialog-not-a-dialog/no-aria-modal',
    summary: 'No aria-modal="true", so nothing tells the accessibility layer that the page behind this is out of the way.',
    fix: 'aria-modal="true", and make the background genuinely inert, because the attribute is a claim rather than a mechanism.',
    cannotSay: 'Whether the background is inert. The attribute and the behaviour are independent, and this reads only the attribute.'
  },
  {
    code: 'dialog-not-a-dialog/no-accessible-name',
    summary: 'The container has no aria-label and no aria-labelledby, so it opens as an unnamed dialog.',
    fix: 'Point aria-labelledby at the heading the drawer already has, rather than duplicating the wording in an aria-label.',
    cannotSay: 'Whether the name is useful, only whether there is one.'
  },

  /* ---- meaning-in-colour-only -------------------------------------------- */
  {
    code: 'meaning-in-colour-only/struck-price',
    summary: 'A struck-through price with no hidden text beside it naming which price is which, so the distinction exists only in the rendering.',
    fix: 'Hidden labels naming each price, with no visual change at all.',
    cannotSay:
      'That it reads badly everywhere. Some screen readers announce a deletion, inconsistently and depending on verbosity.'
  },
  {
    code: 'meaning-in-colour-only/sale-class',
    summary: 'A price marked as a sale price by class and colour rather than by a struck element, with no text equivalent.',
    fix: 'The same hidden labels, and check the class list while you are there: this finding is found by class name, so a theme with its own naming is invisible to it.',
    cannotSay:
      'Anything about the other places colour alone carries meaning, such as stock status dots and required-field asterisks. This finding looks only at prices.'
  },

  /* ---- live-region-arrives-populated ------------------------------------- */
  {
    code: 'live-region-arrives-populated/aria-live-attribute',
    summary: 'A region with aria-live is in the markup with its message already inside it, so there is no mutation for the accessibility layer to observe.',
    fix: 'One empty region in the document before the first message, written on a later frame.',
    cannotSay:
      'That nothing is ever announced. A region that was already in the document and is being re-rendered is a different case this cannot distinguish from first insertion.'
  },
  {
    code: 'live-region-arrives-populated/status-role',
    summary: 'The same defect expressed with role="status", which carries an implicit polite live value. A theme is more likely to use the role, because the Shopify documentation does.',
    fix: 'The same fix. The two are separated here because somebody searching their theme will search for one spelling or the other, and finding neither is the usual outcome of searching for the wrong one.',
    cannotSay:
      'That the role is the whole story. role="alert" is assertive and interrupts, role="status" is polite and waits, and this finding does not judge which of the two the message deserved.'
  },

  /* ---- field-without-label ----------------------------------------------- */
  {
    code: 'field-without-label/placeholder-as-label',
    summary: 'The field has no label and a placeholder is the only description of it, which disappears as soon as the field has content.',
    fix: 'A real label associated by for and id. Hide it visually if the design needs that, and keep the placeholder only if it adds something the label does not.',
    cannotSay:
      'That a visually hidden label is enough. It satisfies this finding and still fails the sighted user who wants to check what they typed.'
  },
  {
    code: 'field-without-label/no-label-at-all',
    summary: 'No label and no placeholder either, usually a field whose description is text in a neighbouring element associated with nothing.',
    fix: 'Associate the text that is already there, by giving the field an id and the text a for. The wording exists; only the link is missing.',
    cannotSay: 'Whether the neighbouring text is the label. That is a judgement about layout.'
  },
  {
    code: 'field-without-label/missing-autocomplete',
    summary: 'A field collecting an email address, telephone number or password with no autocomplete token, which 1.3.5 asks for.',
    fix: 'The token for what the field collects. It is also the difference between a form a password manager fills and one it does not.',
    cannotSay: 'Anything about name and address fields, which this finding does not cover.'
  },

  /* ---- target-under-24px -------------------------------------------------- */
  {
    code: 'target-under-24px/both-dimensions',
    summary: 'A rule plainly targeting a control fixes both dimensions below 24 CSS pixels, which is what sizing a target to its glyph produces.',
    fix: 'A 24 by 24 minimum on the hit area, with the glyph left at its original size.',
    cannotSay:
      'The rendered size, which padding, line height, a larger child and a pseudo-element all change. It also does not apply the 2.5.8 exceptions for inline links, spacing and user agent sizing.'
  },
  {
    code: 'target-under-24px/one-dimension',
    summary:
      'One dimension conforms and the other does not. This is the one that gets missed in review: the target is comfortably wide, somebody checked the width, and 2.5.8 asks for both.',
    fix: 'Raise the short axis, usually with padding rather than height so the glyph does not move. Note that the Level AA minimum is 24, not 44: 44 is 2.5.5 at Level AAA.',
    cannotSay:
      'The rendered size, as above, and in this case the undershoot is often undone by line height on the very element the rule names, which is why the figure here is a declaration and not a measurement.'
  }
];

export const FINDING_CODES = FINDINGS.map((f) => f.code);

export function findingByCode(code) {
  return FINDINGS.find((f) => f.code === code);
}

/** The check a finding belongs to, which is the part of its code before the slash. */
export function checkOf(code) {
  return code.slice(0, code.indexOf('/'));
}
