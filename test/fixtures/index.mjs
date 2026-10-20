/* ---------------------------------------------------------------------------
   fixtures/index.mjs

   Pages that exist to make a detector fire for a reason no example pair
   reaches.

   The pairs in examples/ answer a different question. Each one is a complete
   page demonstrating one defect, with a corrected twin that differs only in
   that defect, and tools/verify.mjs asserts exactly that: the failing side
   trips its own finding and nothing else. That makes them trustworthy as
   illustrations and useless as coverage, because a check with six reasons to
   fire is represented by one of them.

   When the catalogue in tools/findings.mjs was first written, the eleven
   pairs reached seventeen of its thirty-two findings. The fifteen below had
   never been observed firing at all. Writing them turned up nine defects in
   the detectors, seven of which were in branches the pairs never touched, so
   this directory is not bookkeeping.

   `expect` is set equality in both directions. A fixture that trips something
   extra fails, and so does one that stops tripping what it declares.
   --------------------------------------------------------------------------- */

export const FIXTURES = [
  {
    file: 'labelling-variants.html',
    why: 'Six unnamed controls, each unnamed for a different reason, in the order a fix queue would want them.',
    expect: [
      'unnamed-control/dangling-labelledby',
      'unnamed-control/empty-labelledby-target',
      'unnamed-control/empty-label',
      'unnamed-control/image-without-alt',
      'unnamed-control/svg-without-title',
      'unnamed-control/no-labelling-at-all'
    ]
  },
  {
    file: 'card-nested-controls.html',
    why: 'The two nesting pairings the product card pair does not show, where the fix differs from the common case.',
    expect: ['nested-interactive/link-in-link', 'nested-interactive/control-in-control']
  },
  {
    file: 'swatch-class-hook.html',
    why: 'Swatches in a theme that reads the option from element text, so there is no data attribute and the class is the only hook.',
    expect: ['swatch-not-a-control/class-hook-only']
  },
  {
    file: 'skip-link-variants.html',
    why: 'A skip link removed with visibility rather than display, and a second one pointing at an id a theme update renamed.',
    expect: ['skip-link-unusable/hidden-by-visibility', 'skip-link-unusable/target-missing']
  },
  {
    file: 'focus-reset-on-focus.html',
    why: 'A focus reset scoped to named components, which is what a theme accumulates after the universal one has been removed.',
    expect: ['focus-outline-removed/focus-reset']
  },
  {
    file: 'status-role-populated.html',
    why: 'The live region defect written with role="status" instead of aria-live, which is the spelling the Shopify documentation uses.',
    expect: ['live-region-arrives-populated/status-role']
  },
  {
    file: 'quantity-field-unlabelled.html',
    why: 'A field with no label and no placeholder either, where the wording exists in a neighbour and only the association is missing.',
    expect: ['field-without-label/no-label-at-all']
  },
  {
    file: 'pagination-one-dimension.html',
    why: 'A target wide enough and not tall enough, which is the half of 2.5.8 a width check passes.',
    expect: ['target-under-24px/one-dimension']
  }
];
