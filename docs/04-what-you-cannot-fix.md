# What you cannot fix at theme level

Not every barrier on a Shopify store is in the theme. Knowing which ones are
not, and being able to say so precisely, is the difference between a report
that holds up and one that promises something undeliverable.

Three categories.

## 1. Shopify-controlled checkout

On most plans, checkout is served by Shopify and is not editable at theme
level. `checkout.liquid` is available only on Shopify Plus, and even there it
is being phased out in favour of Checkout Extensibility, which constrains what
can be changed to defined extension points.

What this means in practice: if a barrier exists inside checkout, you cannot
fix it in the theme. You can document it, report it to Shopify, and note it in
the accessibility statement.

This matters commercially, because checkout is exactly where an ADA demand
letter will point. A remediation scope that quietly excludes checkout without
saying so leaves the merchant exposed and leaves you explaining it later. Say
it in the proposal.

## 2. Third-party apps

Review widgets, size charts, subscription pickers, loyalty popups, chat
launchers, cookie banners, upsell modals.

Three flavours, in increasing order of difficulty:

**Renders into your DOM.** You can usually fix it with CSS and a guarded
script, though the fix has to survive the app re-rendering. This is the case
the injection kit in
[wix-squarespace-accessibility](https://github.com/BuildWithAbdullah/wix-squarespace-accessibility)
is built for, and the same discipline applies here.

**Renders in an iframe from another origin.** You cannot touch it. Same-origin
policy is a browser security boundary; no script, stylesheet, overlay or app
can reach inside a cross-origin frame. This is not a limitation of your
approach, it is how the web works, and it applies to every site.

**Loads asynchronously and re-renders.** Even where you can reach the DOM, your
fix is undone whenever the widget re-renders. This needs a `MutationObserver`
with a guard so you are not fighting your own patch. See
[05-injection-limits.md](05-injection-limits.md).

### How to report a cross-origin embed

WCAG anticipates this. A page may claim partial conformance for a component it
does not control, provided the component is identified and the limitation is
documented. So:

1. Name the component and what it does.
2. State that it is served from another origin and cannot be modified from the
   containing page.
3. Say what you did instead: an accessible alternative path to the same
   information, a documented exception in the accessibility statement, and a
   support request logged with the vendor.
4. Give the merchant the vendor's accessibility contact so they can apply
   pressure, and note that swapping the app is the only complete fix.

Do not claim you fixed it. Do not let an overlay claim it either.

## 3. Content the merchant controls

Alt text on images uploaded through the admin, heading structure inside rich
text fields, link text in blog posts, colour choices made per-section in the
theme editor, PDFs uploaded to Files.

You can fix today's content. You cannot fix tomorrow's. A theme that has been
made accessible will drift back within months unless the people adding content
know what to do.

The deliverable that actually holds the line is a short maintenance checklist
the merchant can follow: how to write alt text, why not to skip heading levels,
which colour schemes are safe to use, and what to check before publishing a new
section. It costs an hour to write and it is usually the most valuable page in
the report.

## Saying this well

The framing that works with clients:

> Everything in the theme is fixed and verified. Three things sit outside the
> theme: the Shopify checkout, the reviews widget which is served from another
> company's domain, and the content your team adds day to day. The first two
> are documented in your accessibility statement, which is the recognised way
> to handle components you do not control. The third is covered by the
> maintenance checklist.

Precise, honest, and it does not overpromise. It is also a considerably
stronger position than a vendor claiming a script made everything compliant.
