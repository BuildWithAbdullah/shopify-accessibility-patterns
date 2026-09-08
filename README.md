# Shopify Accessibility Patterns

Theme-level Liquid, CSS and JavaScript for the accessibility problems that recur
on Shopify Online Store 2.0 themes, plus the reasoning for the ones that are not
a code fix at all.

Every pattern here is source-level. Nothing in this repository is an overlay, a
runtime patch layer or a script that repairs the page after it loads. Those are
covered too, in [why overlays do not work](docs/06-why-overlays-fail.md) and in
[the limits of patching what you do not control](docs/05-injection-limits.md).

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

## Assets

| File | Purpose |
|---|---|
| [`a11y-base.css`](assets/a11y-base.css) | Focus visibility, the visually hidden utility, target sizes, reduced motion, control boundaries |
| [`a11y-focus-trap.js`](assets/a11y-focus-trap.js) | Focus management for drawers, menus and modals, including returning focus to the trigger |
| [`a11y-announcer.js`](assets/a11y-announcer.js) | One polite live region for AJAX cart and variant updates |

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

## Compatibility

Written against Online Store 2.0 themes using the Dawn conventions: colour
scheme custom properties, `snippets/`, `sections/`, and the
`shopify:section:load` event in the theme editor. Class names and CSS custom
property names will differ between themes, so check the selectors before
copying wholesale. The patterns themselves are theme-independent.

## Verify your work

The failing and corrected patterns behind these fixes, indexed by success
criterion and checked by an axe-core harness in CI, are in
[wcag-fix-library](https://github.com/BuildWithAbdullah/wcag-fix-library).

## Standard

WCAG 2.2 Level AA, which is the target for ADA Title III practice, Section 508,
EN 301 549 and the European Accessibility Act.

## Licence

MIT.
