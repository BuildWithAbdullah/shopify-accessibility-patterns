# Colour schemes and contrast

**WCAG 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast**

Contrast is where the finding counts get large, and where fixing findings one
at a time wastes the most time. A store does not have 390 contrast failures.
It has four bad tokens used 390 times.

## How Online Store 2.0 colour schemes fail

Themes on the 2.0 architecture define colour schemes in `settings_data.json`,
each with its own background, text, button and border colours. Sections pick a
scheme; the scheme supplies CSS custom properties; everything downstream
inherits.

The failure is systemic and it happens like this. Someone adds a new scheme in
the theme editor, because a section needs a soft cream background. They set the
background. They do not touch the text colour, because the preview looks fine
on the section they were editing.

Every other section that later uses that scheme now renders its text in a
colour that was derived for a different background. On a pale scheme this
produces near-white text on a near-white surface. It is legible on a bright
monitor at the angle the person who set it was sitting at, and invisible
anywhere else.

One scheme, one unchanged token, and every section using it fails at once.

## Fix the scheme, not the section

Work in this order:

1. Export `settings_data.json` and list every colour scheme.
2. For each scheme, compute the ratio of its text colour against its own
   background, and its button label against its own button fill. Do this as a
   table, once, before touching any CSS.
3. Derive a compliant value for any pair that fails, and set it in the scheme.
4. Re-scan. The finding count usually collapses.

Resist the urge to add per-section CSS overrides. They multiply, they are
invisible to the merchant in the theme editor, and the next person who adds a
section reintroduces the problem.

## The opacity trap

This one costs hours if you have not seen it before.

A container carries `opacity: 0.7`. Every descendant is blended toward whatever
is behind it. The computed colour in the stylesheet passes. The rendered pixels
do not.

The symptom is unmistakable once you know it: you change the text colour and
nothing happens. You change it to pure black and it is still grey. You start
doubting the selector.

Before touching the colour again, walk up the tree looking for `opacity` on any
ancestor. Fade-in-on-scroll animations that never complete are a common source,
as are hero overlays and "muted" section modifiers.

The fix is to remove the opacity and express the effect with a colour that has
alpha baked into it, so descendants are unaffected:

```css
/* Blends every descendant, including text */
.hero-overlay { opacity: 0.7; }

/* Affects only this element's own background */
.hero-overlay { background: rgb(0 0 0 / 0.7); }
```

## Non-text contrast is the one scanners miss entirely

axe and Lighthouse do not evaluate 1.4.11. They check text. So a product page
can score 100 for accessibility while its form fields have `#ddd` borders at
1.3:1 and nobody can see where the input begins.

On a commerce theme, check these by hand with a colour picker:

- input, select and textarea borders
- ghost and secondary button outlines
- variant swatch borders, in both selected and unselected states
- quantity stepper boundaries
- the focus ring, against every section background it can appear on
- meaningful icons, such as stock warnings and error markers
- carousel dots and their active state

Hairline greys are a house style in most themes and all of them fail. `#ddd` is
about 1.3:1 on white. `#767676` is 4.5:1 and looks almost identical at 1px.

## Values worth knowing

| On white | Ratio | Verdict |
|---|---|---|
| `#767676` | 4.54:1 | Boundary for normal text |
| `#595959` | 7.0:1 | Safe, survives a later size change |
| `#949494` | 2.85:1 | Fails text, passes nothing |
| `#dddddd` | 1.3:1 | Fails everything |

Specify `#595959` rather than `#767676` for body text, so a later design tweak
cannot silently push a passing value under the line.

## States, not just the resting state

Hover, focus, visited, disabled, error and placeholder each carry their own
colour. Hover is the most commonly missed, because nobody screenshots it.
Sale-price red on a light background is the second most common failure after
muted grey.

Disabled controls are exempt. Placeholder text is not, and if a placeholder is
carrying real instructions it should have been a label.
