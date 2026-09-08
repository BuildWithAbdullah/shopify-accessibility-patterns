# Drawers, modals and the operability failures no scan reports

**WCAG 2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.4.3 Focus Order, 4.1.3 Status Messages**

A store can pass every automated check and still be unusable with a keyboard.
This is the document about that gap.

The pattern repeats: a theme is remediated until axe returns zero and
Lighthouse returns 100, the report goes out, and then a keyboard pass finds
that the cart drawer cannot be closed, the gallery cannot be advanced, and the
variant swatches cannot be reached. None of those produce a finding in any
scanner on the market, because there is nothing in the DOM that distinguishes a
drawer which manages focus from one which does not.

Budget for a manual keyboard pass on every template. It takes about ten minutes
per template and it finds the barriers that matter.

## The five that are always broken

### 1. The cart drawer

Opens visually. Focus never moves into it. The page behind stays tabbable
underneath the overlay. `Escape` does nothing. Closing it drops focus to
`body`, so the next `Tab` restarts from the top of the page.

Use [`a11y-focus-trap.js`](../assets/a11y-focus-trap.js). The four requirements
are: move focus in, make the rest of the page inert, close on `Escape`, and
return focus to the trigger on close. The fourth is the one that gets skipped.

### 2. The mobile menu

Same failure, plus one specific to off-canvas patterns: the menu is moved off
screen with `transform: translateX(-100%)` rather than hidden. Transformed
content is still focusable. Every link in a closed menu stays in the tab order
permanently, so a sighted keyboard user on a narrow viewport tabs through
fourteen invisible links before reaching the page.

Use `hidden`, `display: none` or `inert`. All three remove content from the tab
order and the accessibility tree together.

### 3. The product gallery

Thumbnails built from `div` elements with click handlers. Not focusable, no
role, no keyboard operation. The main image cannot be changed without a mouse.

Make each thumbnail a `button`, group them with a name, and reflect the current
selection with `aria-current="true"` so the state is announced rather than
merely drawn.

### 4. Variant swatches

Built from `span` or `div` with click handlers. Same problem, and the state is
usually conveyed by border colour alone, which fails 1.4.1 as well.

Use the radio group in
[`a11y-variant-picker.liquid`](../snippets/a11y-variant-picker.liquid). Native
radios give keyboard operation, arrow-key movement, a single tab stop for the
group, the selected state, and the group question from the legend, all without
script.

### 5. AJAX cart updates with no announcement

The badge changes, the drawer slides out, and nothing is announced. A screen
reader user has no confirmation the action worked, so they press the button
again.

Use [`a11y-announcer.js`](../assets/a11y-announcer.js). The two rules that are
easy to get wrong: the live region must already exist and be empty before the
update, and it should be `polite` rather than `assertive`.

## The manual pass

Per template, mouse unplugged:

1. `Tab` from the top. Is the skip link first, and is it visible when focused?
2. Can you see the focus ring at every single stop, including on dark sections?
3. Does focus ever vanish into something invisible?
4. Open every drawer, modal, menu and popup. Does focus go in? Does `Escape`
   close it? Does focus come back to the trigger?
5. Operate the gallery, the variant picker and the quantity stepper.
6. Complete an add-to-cart. Is anything announced?
7. Submit a form with an error. Is the error announced and is focus moved to
   it?

Templates worth doing: home, collection, product, cart, search results,
customer login, and any page with a third-party app embed.

## What to write in the report

State the coverage honestly. Automated tooling reaches roughly a third of the
success criteria, and the operability criteria are concentrated in the part it
cannot reach. A clean scan is the floor, not the ceiling, and a client who is
told this up front is much easier to work with than one who discovers it after
a complaint.
