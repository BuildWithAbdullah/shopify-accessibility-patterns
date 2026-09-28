# Shopify Accessibility Patterns

Theme-level Liquid, CSS and JavaScript for the accessibility problems that recur
on Shopify Online Store 2.0 themes, plus the reasoning for the ones that are not
a code fix at all.

Every pattern here is source-level. Nothing in this repository is an overlay, a
runtime patch layer or a script that repairs the page after it loads. Those are
covered too, in [why overlays do not work](docs/06-why-overlays-fail.md) and in
[the limits of patching what you do not control](docs/05-injection-limits.md).

It also runs. Eleven failing and corrected page pairs in [`examples/`](examples/),
a detector for each of them, a contract over the baseline stylesheet, a contract
over every snippet, and 293 tests. `npm test && npm run verify` is the whole of
it, there are no dependencies, and what the checks cannot see is written down in
[what the checks do not see](docs/08-what-the-checks-do-not-see.md).

## Why a Shopify-specific repository

Generic WCAG advice does not survive contact with a Liquid theme. The failures
here have a particular shape:

- **They repeat.** One product card snippet renders on every collection page,
  so one defect becomes several hundred findings. Fix the snippet, not the
  findings.
- **Colour lives in the theme editor.** A merchant adds a colour scheme with an
  inherited text colour and every section using that scheme fails at once.
- **A third of the page is not yours.** Checkout is Shopify's. Reviews,
  subscriptions and chat widgets belong to apps, sometimes inside cross-origin
  iframes you cannot reach.
- **The worst failures are invisible to scanners.** Cart drawers, mobile menus
  and variant pickers fail on keyboard operation, and no automated tool reports
  it.

## Snippets

| File | Fixes | Criteria |
|---|---|---|
| [`a11y-skip-link.liquid`](snippets/a11y-skip-link.liquid) | Skip link that is actually focusable, with a focusable target | 2.4.1 |
| [`a11y-icon-button.liquid`](snippets/a11y-icon-button.liquid) | Named icon-only controls at a conforming target size | 1.1.1, 4.1.2, 2.5.8 |
| [`a11y-product-card.liquid`](snippets/a11y-product-card.liquid) | Product card with no nested interactive controls | 4.1.2, 2.4.4, 1.1.1 |
| [`a11y-variant-picker.liquid`](snippets/a11y-variant-picker.liquid) | Variant swatches as a real radio group | 1.3.1, 2.1.1, 4.1.2 |

Each of those carries a contract in
[`tools/liquid-contract.mjs`](tools/liquid-contract.mjs) asserting what it emits,
so the snippet and the claim in this table cannot drift apart. A new snippet
without a contract fails the build.

## Assets

| File | Purpose |
|---|---|
| [`a11y-base.css`](assets/a11y-base.css) | Focus visibility, the visually hidden utility, target sizes, reduced motion, control boundaries |
| [`a11y-focus-trap.js`](assets/a11y-focus-trap.js) | Focus management for drawers, menus and modals, including returning focus to the trigger |
| [`a11y-announcer.js`](assets/a11y-announcer.js) | One polite live region for AJAX cart and variant updates |

The two JavaScript files are theme files: they run in a page and cannot be tested
without shipping a DOM implementation as a dependency. What is testable is the
part that actually goes wrong, so the decisions are pulled out into
[`tools/focus-order.mjs`](tools/focus-order.mjs) and
[`tools/announce.mjs`](tools/announce.mjs), unit tested there, and CI asserts that
each asset still uses what its module specifies.

## Documentation

| Document | What it covers |
|---|---|
| [01 Viewport and zoom](docs/01-viewport-and-zoom.md) | The `maximum-scale` line, and the fixed heights that are the harder half of 1.4.4 |
| [02 Colour schemes and contrast](docs/02-colour-schemes-and-contrast.md) | Fixing tokens rather than instances, and the opacity trap |
| [03 Drawers and modals](docs/03-drawers-and-modals.md) | The five operability failures no scan reports |
| [04 What you cannot fix](docs/04-what-you-cannot-fix.md) | Checkout, cross-origin apps, merchant content, and how to report them |
| [05 Injection limits](docs/05-injection-limits.md) | Guarded patching, and the point at which it becomes the wrong answer |
| [06 Why overlays fail](docs/06-why-overlays-fail.md) | The argument, and what you find when you remove one |
| [07 Theme audit checklist](docs/07-theme-audit-checklist.md) | A working order for a full theme audit |
| [08 What the checks do not see](docs/08-what-the-checks-do-not-see.md) | The limits of everything in this repository that runs |

## Examples

Eleven pairs in [`examples/`](examples/), each a complete page you can open. The
two sides differ only in the defect: same content, same layout, same wording.

| Pair | Criteria | The failure |
|---|---|---|
| [`unnamed-icon-button`](examples/unnamed-icon-button) | 1.1.1, 4.1.2 | Header icon buttons whose only content is a decorative glyph |
| [`nested-interactive-card`](examples/nested-interactive-card) | 4.1.2 | Quick add button inside the anchor wrapping the whole card |
| [`swatch-not-a-control`](examples/swatch-not-a-control) | 1.3.1, 2.1.1, 4.1.2 | Variant swatches built from div elements with click handlers |
| [`skip-link-unusable`](examples/skip-link-unusable) | 2.4.1 | Skip link hidden with display:none, pointing at a target that cannot take focus |
| [`focus-outline-removed`](examples/focus-outline-removed) | 2.4.7 | A global outline reset, added to stop the ring appearing on mouse click |
| [`viewport-scaling-blocked`](examples/viewport-scaling-blocked) | 1.4.4 | `user-scalable=no` and `maximum-scale=1` on the viewport meta tag |
| [`dialog-not-a-dialog`](examples/dialog-not-a-dialog) | 1.3.1, 4.1.2 | Cart drawer with no role, no `aria-modal` and no accessible name |
| [`meaning-in-colour-only`](examples/meaning-in-colour-only) | 1.4.1 | Sale price distinguished by a strikethrough and a red, with no text saying which is which |
| [`live-region-arrives-populated`](examples/live-region-arrives-populated) | 4.1.3 | Cart status region inserted with its message already inside it |
| [`field-without-label`](examples/field-without-label) | 1.3.5, 3.3.2, 4.1.2 | Newsletter email field whose placeholder is doing the work of a label |
| [`target-under-24px`](examples/target-under-24px) | 2.5.8 | Pagination links sized 16 by 16 |

One point of terminology, because audit reports get it wrong constantly: the
Level AA target size minimum under 2.5.8 is 24 by 24 CSS pixels. The 44 figure
belongs to 2.5.5 at Level AAA and to the Apple human interface guideline.
Attributing it to Level AA inflates finding counts and sends clients off to
redesign components that already conform.

## Verifying

```
npm test          # 293 tests
npm run verify    # 247 repository-level assertions
npm run check     # both
```

No dependencies, no build step, no API key, no network access. Node 18 or newer.

`npm test` covers the HTML and CSS scanners the checks are built on, the contrast
arithmetic, the Liquid scanner, all eleven detectors in both directions, the
stylesheet contract against a deliberately broken stylesheet, the snippet
contracts against deliberately broken snippets, and the keyboard and live region
logic behind the two theme assets.

`npm run verify` asserts the things that are true of the repository as a whole
and quietly stop being true as it grows. Among them:

- every failing example trips its own detector and nothing else;
- every corrected example trips no detector in the repository at all;
- every detector has a pair, and every pair has a detector;
- every snippet has a contract, and every contract holds;
- the baseline stylesheet still makes every guarantee this README describes,
  including that its control boundary colour clears 3:1 on white, computed rather
  than asserted;
- each theme asset still uses the selector list and the live region attributes its
  module specifies;
- every file in `test/` is named in the test script, because `node --test` did not
  accept glob patterns before Node 21, so a glob passes locally and silently finds
  nothing on the oldest version this repository supports;
- nothing in the repository uses a Node API newer than the version the manifest
  claims;
- every file this README links to exists, and every snippet, asset and document
  present is listed in it.

CI runs both on Node 18, 20 and 22.

## Installing

Copy the snippets into `snippets/` and the assets into `assets/`, then wire them
up in `layout/theme.liquid`:

```liquid
{{ 'a11y-base.css' | asset_url | stylesheet_tag }}
<script src="{{ 'a11y-focus-trap.js' | asset_url }}" defer></script>
<script src="{{ 'a11y-announcer.js' | asset_url }}" defer></script>
```

```liquid
<body>
  {% render 'a11y-skip-link' %}
  ...
  <main id="MainContent" role="main" tabindex="-1">
```

The `tabindex="-1"` on `main` is not optional. Without it several browsers
scroll to the target but leave focus behind, so the skip link appears to work
and does nothing.

Then render the snippets where the theme currently has its own versions:

```liquid
{% render 'a11y-icon-button', icon: 'cart', label: 'Open cart drawer', controls: 'CartDrawer', expanded: false %}
{% render 'a11y-product-card', product: product %}
{% render 'a11y-variant-picker', product: product %}
```

`a11y-icon-button` maps the `icon` parameter to a theme icon snippet with a case
block rather than building the snippet name with `append`. Liquid's `render` tag
takes a string literal: a filtered expression is not one, so a name built that way
resolves to nothing and renders nothing, with no error. The button keeps its
accessible name and loses its glyph, which looks like a missing icon file and gets
diagnosed as one. The snippet names in that block are Dawn's, so change them to
match the theme.

## Compatibility

Written against Online Store 2.0 themes using the Dawn conventions: colour
scheme custom properties, `snippets/`, `sections/`, and the
`shopify:section:load` event in the theme editor. Class names and CSS custom
property names will differ between themes, so check the selectors before
copying wholesale. The patterns themselves are theme-independent.

## Related

The failing and corrected patterns behind these fixes, indexed by success
criterion across all of WCAG rather than only the Shopify-shaped subset, and
checked by an axe-core harness, are in
[wcag-fix-library](https://github.com/BuildWithAbdullah/wcag-fix-library).

## Standard

WCAG 2.2 Level AA, which is the target for ADA Title III practice, Section 508,
EN 301 549 and the European Accessibility Act.

## Licence

MIT.
