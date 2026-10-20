# What the checks in this repository do not see

The detectors in `tools/checks.mjs`, the stylesheet contract in
`tools/css-contract.mjs` and the snippet contracts in `tools/liquid-contract.mjs`
exist so that the patterns here cannot quietly stop being correct. They are not
an audit, they are not a scanner, and passing them is not conformance. This page
is the list of what they miss, because a verification layer whose limits are not
written down is read as a stronger claim than it is.

**Six of the limits below are now asserted rather than described.** They are
declared in [`tools/limits.mjs`](../tools/limits.mjs) and exercised in
[`test/gap.mjs`](../test/gap.mjs), four of them in both directions, and
`tools/verify.mjs` fails if one is declared and not exercised or exercised and
not declared. The id of each is given in the section it belongs to. The rest of
this page is the part no assertion reaches, which is most of it, and the
distinction between the two is worth more than either half: a limit that is
asserted cannot be quietly narrowed, and a limit that is only written down can.

The per finding version of the same thing, with what each individual finding
cannot establish, is in the
[finding catalogue](09-finding-catalogue.md).

## They read files, not pages

Every check takes source text. Nothing here launches a browser, so nothing here
knows what a visitor actually gets.

That rules out, entirely:

- **The cascade** (`cascade-not-resolved`, asserted in both directions). The
  checks read declarations as written, and they only read the declarations in
  the file. A focus ring restored by a linked theme stylesheet makes a reported
  finding wrong, and a ring cancelled by one makes an unreported page
  defective, so the finding count carries no information about whether there is
  an indicator on the screen. A colour inherited from a scheme the merchant
  configured in the theme editor, and a rule whose specificity loses, are
  invisible for the same reason.
- **Computed size and colour** (`declared-size-is-not-rendered-size`, asserted
  in both directions). `tools/checks.mjs` can tell you a rule sets a target to
  16 by 16. It cannot tell you the rendered size, because padding, line height,
  a transform, a larger child and a pseudo-element all change it. A 24 pixel
  declaration under a half scale transform renders at 12 and is silent; a 16
  pixel declaration with 8 pixels of padding renders at 32 and is reported. The
  same applies to contrast: `tools/contrast.mjs` is exact about the two colours
  it is handed and knows nothing about which two colours are really in front of
  each other.
- **Anything a script does** (`name-can-change-after-load`, asserted in both
  directions). A name added on load, a role assigned by a theme component, an
  app that injects a review widget after first paint. The markup on disk is the
  markup before any of that, and the assertions use a page carrying its own
  script, so the runtime outcome is in the file and still not something the
  checks read.
- **Generated content.** A label supplied by `::before` is a label this cannot
  read, and one that a screen reader may or may not announce depending on the
  browser.

## They cannot see behaviour, which is where drawers fail

This is the important one, and it is the same argument as
[drawers and modals](03-drawers-and-modals.md).

A cart drawer that announces itself correctly and a cart drawer that is usable
are different things. `dialog-not-a-dialog` checks for `role="dialog"`,
`aria-modal="true"` and a name. All three can be present while:

- focus never moves into the drawer when it opens;
- the page behind it stays tabbable under an overlay the user cannot see past;
- Escape does nothing;
- closing it drops focus to `<body>`, so the next Tab starts from the top of the
  page.

None of those are in the DOM. There is nothing in the markup that distinguishes a
drawer which takes focus from one which does not. That is why
`tools/focus-order.mjs` exists: the arithmetic of the trap is tested because the
trap itself cannot be, and the tests state which decisions are being checked.
Whether the browser then puts focus where the arithmetic says is a question you
answer by pressing Tab.

This is the limit `semantics-are-not-behaviour` asserts, and it is asserted in
the strongest available form. All four combinations of the two verdicts are
constructed in `test/gap.mjs`: a drawer carrying all three attributes whose own
focus arithmetic says focus goes nowhere when it opens, a drawer carrying none
of them where focus lands correctly, and the two agreeing cases. Reaching all
four is what independence means. A reader cannot treat the static verdict as
weak evidence about behaviour, because it is not evidence about behaviour at
all.

## They check the pattern, not your theme

The example pairs in `examples/` are written to demonstrate one defect each, and
the verifier asserts exactly that: a failing page trips its own check and nothing
else, and a corrected page trips nothing in the repository at all. That makes the
pairs trustworthy as illustrations. It says nothing about a real theme, where
defects arrive several at a time, interact, and are usually worse in combination
than separately.

It also says much less about coverage than it reads as saying, and that is the
limit `pairs-do-not-cover-the-catalogue` asserts. One defect per page means that
for every check with more than one reason to fire, the pairs reach a strict
subset of its findings. This repository asserted that every check had a pair,
and was green, while fifteen of the thirty-two findings in the catalogue had
never fired once. The eight fixtures in `test/fixtures/` exist to close that,
and writing them turned up nine defects in the detectors, seven of them in
branches no pair touched. The assertion is deliberately written to fail if the
pairs ever do reach everything, because at that point the limit has gone and the
sentence should go with it.

The snippet contracts have the sharper version of this limit. Nothing executes
Liquid, so the contracts read a skeleton with the Liquid stripped and every
branch of every conditional kept at once. That answers questions of the form
"can this snippet ever emit a control inside a link" and cannot answer "what does
it render for a product on sale". Where the difference matters, the check splits
the snippet at its branch boundaries first, which is what
`product-card:price-state-has-text` does, and the reason it does is written next
to it. Liquid output is opaque either way: a check that an input's `id` and a
label's `for` are both present is not a check that they agree.

## Judgements that are not automatable at all

Some of the most expensive findings in a real audit are ones no tool will ever
produce, because they are judgements:

- Whether a link's name says where it goes. `unnamed-control` is satisfied by
  "click here" (`a-name-is-not-a-good-name`, asserted in one direction, which is
  the honest one: a link named "click here" produces no finding anywhere in this
  repository).
- Whether a heading structure describes the page or just happens to be nested
  correctly.
- Whether alt text is useful. An empty `alt` is correct for a decorative image
  and wrong for a product photo, and only a person looking at the image can say
  which this is.
- Whether an error message tells the user what to do.
- Whether a label that exists only for the accessibility layer is enough. A
  visually hidden label passes `field-without-label` and still fails the sighted
  user who wants to check what they typed.
- Whether the reading order matches the visual order once a section reflows.

## What is not checked here at all

Three parts of a Shopify storefront are out of scope by construction, and the
reasoning is in [what you cannot fix](04-what-you-cannot-fix.md):

- **Checkout.** It is Shopify's, and on anything below Shopify Plus you cannot
  change its markup.
- **Apps in cross-origin iframes.** Reviews, subscriptions and chat widgets. You
  cannot reach into them, and a scanner cannot either.
- **Merchant content.** Alt text on uploaded images, heading levels inside rich
  text, colour choices in a scheme. A pattern library fixes the template; it
  cannot fix what is typed into it.

## What passing actually means

`npm run check` green means: the patterns in this repository still emit what they
claim to emit, the stylesheet still makes the guarantees the README describes,
every failing example still fails for exactly the findings the manifest names,
every corrected example still carries no other defect that this repository knows
how to look for, every finding in the catalogue has been observed firing on a
real page, and every limit on this page that can be asserted still holds in the
directions claimed for it.

That is worth having, and it is a much smaller claim than conformance. The
remaining work on any real theme is keyboard testing, a screen reader, and
somebody making the judgements listed above.
