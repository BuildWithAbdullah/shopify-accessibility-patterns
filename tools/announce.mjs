/* ---------------------------------------------------------------------------
   announce.mjs
   The live region rules behind assets/a11y-announcer.js, separated from the DOM
   so they can be tested.

   A live region has a small number of ways to fail and all of them are silent.
   Nothing throws, nothing appears in a console, and no automated scan reports
   it, because a correct live region and a broken one are the same markup. The
   difference is in when the text changes relative to when the element enters
   the document, and that is arithmetic, which means it is testable.
   --------------------------------------------------------------------------- */

/** The attributes the region must carry. Asserted against the asset in CI. */
export const REGION_ATTRIBUTES = {
  id: 'a11y-live-region',
  role: 'status',
  'aria-live': 'polite',
  'aria-atomic': 'true'
};

/** How long the text stays before it is cleared, in milliseconds. */
export const CLEAR_DELAY_MS = 5000;

/**
 * Which politeness setting a message should use.
 *
 * polite waits for a pause. assertive interrupts whatever the user is reading
 * mid-sentence, which is why it belongs only to messages that stop the user
 * proceeding. A cart confirmation is not one of those, and the habit of
 * reaching for assertive because the developer wants to be sure the message
 * lands is the reason screen reader users turn live regions off.
 */
export function politenessFor(kind) {
  switch (kind) {
    case 'error':
    case 'blocking':
      return 'assertive';
    case 'status':
    case 'cart':
    case 'variant':
    case 'filter':
    default:
      return 'polite';
  }
}

/**
 * The sequence of steps needed to announce a message.
 *
 * Returns a list of { at, text } where `at` is 'now', 'next-frame' or a delay
 * in milliseconds. The two step shape is the whole point:
 *
 *   1. Clear the region in this tick.
 *   2. Set the text on the next frame.
 *
 * Setting the text in the same tick as inserting or clearing the element
 * announces nothing in several screen reader and browser pairs, because there
 * is no mutation for the observer to see: the element arrived already
 * containing its final text. The same applies to announcing identical text
 * twice in a row, which is exactly what "add to cart" does when a shopper adds
 * the same product again, so the clear step is not an optimisation to skip
 * when the message has not changed.
 */
export function plan(message, { existingText = '' } = {}) {
  if (!message) return [];

  const steps = [];
  if (existingText !== '') {
    steps.push({ at: 'now', text: '' });
  } else {
    // Still clear, so that the next-frame write is always a mutation.
    steps.push({ at: 'now', text: '' });
  }
  steps.push({ at: 'next-frame', text: message });
  steps.push({ at: CLEAR_DELAY_MS, text: '' });
  return steps;
}

/**
 * Will this sequence of writes produce a detectable change for each message?
 *
 * writes is a list of strings in the order they are applied. A message is
 * announced when the value it is written as differs from the value before it.
 * Used by the tests to state the guarantee directly rather than restating the
 * implementation.
 */
export function announced(writes) {
  const out = [];
  let previous = null;
  for (const text of writes) {
    if (text !== previous && text !== '') out.push(text);
    previous = text;
  }
  return out;
}

/**
 * Should the region be created before it is needed?
 *
 * Yes, always. A region that is created and populated in the same tick is the
 * single most common live region defect, and the fix is to put an empty region
 * in the document at load. This function exists so the rule has a name and a
 * test rather than living only in a comment.
 */
export function mustExistBeforeFirstMessage() {
  return true;
}

/**
 * Is this a hiding technique a live region can survive?
 *
 * display:none and visibility:hidden both remove the element from the
 * accessibility tree, so nothing inside is announced. The region has to be
 * rendered and off screen, which is the same clip recipe the visually hidden
 * utility uses.
 */
export function hidingIsSafe(declarations) {
  const lookup = new Map(
    Object.entries(declarations).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()])
  );
  if (lookup.get('display') === 'none') return false;
  if (lookup.get('visibility') === 'hidden') return false;
  if (lookup.get('content-visibility') === 'hidden') return false;
  return true;
}
