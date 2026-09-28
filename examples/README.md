# Example pairs

Eleven failures, each with the markup that produces it and the markup that fixes
it, as complete pages you can open in a browser side by side.

Each directory holds `fail.html` and `pass.html`. They differ only in the defect:
same content, same layout, same wording, so the diff is the fix and nothing else.
Every page is self contained, with its stylesheet inline, and explains itself in a
comment.

## What CI asserts about them

Run by `npm test` and `npm run verify`, on every push:

1. Every directory here is in `manifest.json`, and every entry in `manifest.json`
   is a directory here.
2. Each `fail.html` trips its own detector in `tools/checks.mjs`, with a line
   number and a piece of evidence.
3. Each `fail.html` trips **nothing else**, so the pair demonstrates one defect
   rather than a pile of them.
4. Each `pass.html` trips **no detector in the repository at all**. This is the
   assertion that matters most: the failure mode of a corrected example is that it
   fixes its own defect and carries somebody else's, and a check that only looks at
   its own criterion cannot see that.
5. Every detector has a pair behind it, so a detector cannot be added without an
   illustration and a pair cannot be added without a detector.
6. The criteria the manifest cites are the criteria the detector declares.

## The pairs

| Directory | Criteria | The failure |
|---|---|---|
| `unnamed-icon-button` | 1.1.1, 4.1.2 | Header icon buttons whose only content is a decorative glyph |
| `nested-interactive-card` | 4.1.2 | Quick add button inside the anchor wrapping the card |
| `swatch-not-a-control` | 1.3.1, 2.1.1, 4.1.2 | Variant swatches built from div elements |
| `skip-link-unusable` | 2.4.1 | Skip link hidden with display:none, target cannot take focus |
| `focus-outline-removed` | 2.4.7 | A global outline reset |
| `viewport-scaling-blocked` | 1.4.4 | user-scalable=no on the viewport meta tag |
| `dialog-not-a-dialog` | 1.3.1, 4.1.2 | Cart drawer with no role, no aria-modal and no name |
| `meaning-in-colour-only` | 1.4.1 | Sale price distinguished only by a strikethrough and a colour |
| `live-region-arrives-populated` | 4.1.3 | Status region inserted with its message already inside it |
| `field-without-label` | 1.3.5, 3.3.2, 4.1.2 | Newsletter field labelled by its placeholder |
| `target-under-24px` | 2.5.8 | Pagination links sized 16 by 16 |

## What they are not

Illustrations of one defect at a time, in isolation, in a page written to contain
it. A real theme has several at once and they interact. And a detector passing
says nothing about behaviour: see
[what the checks do not see](../docs/08-what-the-checks-do-not-see.md), which is
worth reading before quoting any of this as evidence of conformance.
