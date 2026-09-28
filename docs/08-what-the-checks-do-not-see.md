# What the checks in this repository do not see

The detectors in `tools/checks.mjs`, the stylesheet contract in
`tools/css-contract.mjs` and the snippet contracts in `tools/liquid-contract.mjs`
exist so that the patterns here cannot quietly stop being correct. They are not
an audit, they are not a scanner, and passing them is not conformance. This page
is the list of what they miss, because a verification layer whose limits are not
written down is read as a stronger claim than it is.

## They read files, not pages

Every check takes source text. Nothing here launches a browser, so nothing here
knows what a visitor actually gets.

That rules out, entirely:

- **The cascade.** The checks read declarations as written. A focus ring
  cancelled by a later theme stylesheet, a colour inherited from a scheme the
  merchant configured in the theme editor, a rule whose specificity loses: all
  invisible.
- **Computed size and colour.** `tools/checks.mjs` can tell you a rule sets a
  target to 16 by 16. It cannot tell you the rendered size, because padding, line
  height, a larger child and a pseudo-element all change it. The same applies to
  contrast: `tools/contrast.mjs` is exact about the two colours it is handed and
  knows nothing about which two colours are really in front of each other.
- **Anything a script does.** A name added on load, a role assigned by a theme
  component, an app that injects a review widget after first paint. The markup on
  disk is the markup before any of that.
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

## They check the pattern, not your theme

The example pairs in `examples/` are written to demonstrate one defect each, and
the verifier asserts exactly that: a failing page trips its own check and nothing
else, and a corrected page trips nothing in the repository at all. That makes the
pairs trustworthy as illustrations. It says nothing about a real theme, where
defects arrive several at a time, interact, and are usually worse in combination
than separately.

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
  "click here".
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

`npm test` and `npm run verify` green means: the patterns in this repository
still emit what they claim to emit, the stylesheet still makes the guarantees the
README describes, every failing example still fails for the reason given, and
every corrected example still carries no other defect that this repository knows
how to look for.

That is worth having, and it is a much smaller claim than conformance. The
remaining work on any real theme is keyboard testing, a screen reader, and
somebody making the judgements listed above.
