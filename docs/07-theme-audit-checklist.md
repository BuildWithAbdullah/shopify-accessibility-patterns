# Theme audit checklist

A working order for auditing a Shopify theme. Roughly a day for a standard
store, longer if there are many custom sections.

## Before anything else

- [ ] Check for an accessibility overlay or auto-patch script. If one is
      present, scan with it active, note any score instability across repeated
      scans, then disable it and scan again. The second scan is the real
      baseline. See [06-why-overlays-fail.md](06-why-overlays-fail.md).
- [ ] Check for a second overlay. Sites that changed vendors often have two,
      one of them inert.
- [ ] Duplicate the live theme and work in the copy.
- [ ] Record the theme name and version. It determines whether fixes survive
      the next update.

## Global, fix once

These are single changes that resolve findings across every page. Do them
first, then re-scan, because the finding count usually collapses and the
remaining list is much more useful.

- [ ] `layout/theme.liquid` viewport meta: remove `maximum-scale` and
      `user-scalable=no`. Check `layout/password.liquid` too.
- [ ] Grep the stylesheet for `outline: none` and `outline: 0`. Replace with a
      `:focus-visible` rule.
- [ ] Add a skip link, and confirm `<main id="MainContent" tabindex="-1">`.
      The `tabindex` is the part that is usually missing.
- [ ] Landmarks: one `main`, `header`, `footer`, `nav` with names where there
      is more than one.
- [ ] Colour schemes: audit `settings_data.json` as a table, fix the tokens,
      not the instances. See
      [02-colour-schemes-and-contrast.md](02-colour-schemes-and-contrast.md).
- [ ] Input and control borders: `#767676` or darker, per 1.4.11.
- [ ] `prefers-reduced-motion` block for carousels and scroll animations.
- [ ] Header icon buttons: cart, search, account, menu all named.

## Per template

Home, collection, product, cart, search results, 404, customer login,
customer account, blog article, and any page with an app embed.

**Automated**

- [ ] axe DevTools with the WCAG 2.2 AA ruleset selected. The default is 2.1;
      selecting the wrong ruleset is an easy and common mistake.
- [ ] WAVE, with attention to the alerts, not only the errors.
- [ ] Lighthouse accessibility.

**Manual, mouse unplugged**

- [ ] `Tab` from the top. Skip link first, and visible when focused.
- [ ] Focus ring visible at every stop, including on dark sections.
- [ ] Focus never disappears into hidden content.
- [ ] Every drawer, modal and menu: focus goes in, `Escape` closes, focus
      returns to the trigger.
- [ ] Gallery, variant picker and quantity stepper all keyboard operable.
- [ ] Add to cart, then confirm something is announced.
- [ ] Submit a form with an error and confirm the error is announced and
      focus is moved to it.

**Manual, screen reader**

- [ ] Heading outline reads as a sensible table of contents.
- [ ] Links list is navigable without the surrounding page. No wall of
      "Read more".
- [ ] Every form control announces a name, a state and any instruction.
- [ ] Images: read every alt value aloud and ask whether it replaces the image
      or merely mentions it.

**Manual, visual**

- [ ] 200 percent zoom: no clipped or overlapping text.
- [ ] 320px viewport: no horizontal scrolling on the document.
- [ ] Hover, focus, disabled and error states all checked for contrast.
- [ ] Non-text contrast sampled with a colour picker on control boundaries.

## Judgement calls

Not every scanner flag is a defect, and not every defect should be silenced.

- [ ] Where a flag is a false positive, document the reasoning rather than
      changing markup to satisfy the tool. A contrast flag on a control that
      would need its keyboard behaviour broken to "fix" is a flag to explain,
      not to clear.
- [ ] Where a barrier is outside the theme, name it, say why, and record it in
      the accessibility statement. See
      [04-what-you-cannot-fix.md](04-what-you-cannot-fix.md).
- [ ] Never claim a before-and-after delta where no baseline scan exists.

## Deliverables that hold up

- [ ] Before and after evidence per page, from the same tool with the same
      configuration.
- [ ] Findings mapped to specific success criteria, with levels.
- [ ] Manual findings listed separately from automated ones, so the client can
      see what a scan would have missed.
- [ ] A documented exceptions section for third-party and checkout components.
- [ ] An accessibility statement.
- [ ] A maintenance checklist for whoever adds content next. This is usually
      the most valuable page in the report, because it is the only part that
      stops the site drifting back.
