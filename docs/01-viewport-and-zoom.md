# Viewport and zoom

**WCAG 1.4.4 Resize Text (Level AA)**

## The line

Open `layout/theme.liquid` and look at the viewport meta tag. In a large share
of themes, including themes still being sold today, it reads something like:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, height=device-height, minimum-scale=1.0, maximum-scale=1.0">
```

`maximum-scale=1.0` and `user-scalable=no` disable pinch-to-zoom. On a phone,
that removes the only magnification tool most people know how to use.

The fix:

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

That is the whole change. There is no visual consequence and no layout risk.
It is usually the single cheapest accessibility fix available on a Shopify
store, and it is frequently the one nobody has made because nobody reads that
line.

## The objection you will hear

"Modern browsers ignore `user-scalable=no` anyway."

Mostly true, and not a defence. The declaration is a statement of intent that
some browsers and many in-app webviews still honour, and the criterion is about
what the theme publishes rather than which browsers currently route around it.
Facebook, Instagram and TikTok in-app browsers account for a substantial share
of mobile commerce traffic, and their behaviour is not something you control.

## Where else it hides

The viewport tag is not always in `theme.liquid`. Check, in this order:

1. `layout/theme.liquid`
2. `layout/password.liquid`, which is often forgotten and is the only page
   anyone sees before launch
3. `snippets/meta-tags.liquid` or similar, if the theme factors head content out
4. Any app that injects into `content_for_header`

## The harder half of 1.4.4

Fixed pixel heights on containers that hold text. At 200 percent zoom the text
is clipped or overlaps rather than reflowing.

Search the theme stylesheet for `height:` on anything that contains copy. The
usual offenders on a commerce theme:

- announcement bars
- promo strips and countdown timers
- product card titles with a fixed height for grid alignment
- button labels
- badge and sale-tag overlays

Replace `height` with `min-height`. Grid alignment that depended on a fixed
height can usually be recovered with `align-items: stretch` or a grid row
definition instead.

## Testing

1. Set browser zoom to 200 percent and read the whole page, top to bottom.
2. On a real device, try to pinch-zoom the product page. Simulators are not
   reliable for this.
3. Check the password page as well as the storefront.

## Not the same as reflow

1.4.4 is about scaling text to 200 percent. 1.4.10 Reflow is about the layout
surviving a 320px viewport. Audit reports conflate them constantly. A theme can
pass one and fail the other, and the fixes are unrelated.
