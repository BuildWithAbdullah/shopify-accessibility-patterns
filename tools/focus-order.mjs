/* ---------------------------------------------------------------------------
   focus-order.mjs
   The keyboard arithmetic behind assets/a11y-focus-trap.js, pulled out of the
   browser so it can be tested.

   The asset is a theme file. It runs in a page, it touches document and
   window, and none of that is testable in CI without shipping a DOM
   implementation as a dependency. What is testable is the part that actually
   goes wrong: which element should receive focus on open, which on Tab at
   either end of the cycle, which on close, and when a keydown should be
   allowed through to the browser instead of being handled.

   FOCUSABLE below is the single source of truth for the selector. The test
   suite asserts that assets/a11y-focus-trap.js uses exactly this list, so the
   asset and this module cannot drift apart.
   --------------------------------------------------------------------------- */

/** Selectors for elements that are focusable by default. */
export const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])'
];

export const FOCUSABLE = FOCUSABLE_SELECTORS.join(',');

/**
 * What should happen on a keydown inside an open dialog.
 *
 * state: { key, shiftKey, count, index }
 *   count  how many focusable elements the dialog currently holds
 *   index  the index of the focused element, or -1 when focus is on the
 *          dialog itself or has fallen outside it
 *
 * Returns { action, focus, preventDefault }
 *   action  'close' | 'wrap' | 'recover' | 'pass'
 *   focus   the index to move focus to, or null
 *
 * 'pass' is the important one. A trap that calls preventDefault on every Tab
 * has taken over focus movement from the browser, which means it also owns
 * every edge case the browser already handles correctly: shadow roots, iframe
 * boundaries, the address bar. Handle only the two ends of the cycle and let
 * the browser do the rest.
 */
export function onKeydown({ key, shiftKey = false, count = 0, index = -1 }) {
  if (key === 'Escape') {
    return { action: 'close', focus: null, preventDefault: true };
  }

  if (key !== 'Tab') {
    return { action: 'pass', focus: null, preventDefault: false };
  }

  if (count === 0) {
    // Nothing to move to. Keeping focus where it is beats letting Tab escape
    // to the page behind, which the user cannot see.
    return { action: 'wrap', focus: null, preventDefault: true };
  }

  if (index < 0) {
    // Focus is on the dialog container or has escaped. Pull it back to the
    // near end of the cycle rather than leaving the user outside the dialog.
    return {
      action: 'recover',
      focus: shiftKey ? count - 1 : 0,
      preventDefault: true
    };
  }

  if (shiftKey && index === 0) {
    return { action: 'wrap', focus: count - 1, preventDefault: true };
  }

  if (!shiftKey && index === count - 1) {
    return { action: 'wrap', focus: 0, preventDefault: true };
  }

  return { action: 'pass', focus: null, preventDefault: false };
}

/**
 * Where focus goes when the dialog opens.
 *
 * Returns { target, needsTabindex }
 *   target        'initial' | 'first' | 'dialog'
 *   needsTabindex true when the dialog itself will take focus and does not
 *                 already carry a tabindex, in which case one has to be added
 *                 or the focus call silently does nothing
 */
export function openTarget({ hasExplicitInitial = false, count = 0, dialogHasTabindex = false }) {
  if (hasExplicitInitial) return { target: 'initial', needsTabindex: false };
  if (count > 0) return { target: 'first', needsTabindex: false };
  return { target: 'dialog', needsTabindex: !dialogHasTabindex };
}

/**
 * Where focus goes when the dialog closes.
 *
 * Returns 'opener' when the element that opened the dialog is still in the
 * document, and 'body' when it is not. The second case is not rare on a
 * commerce theme: a quick add button inside a product card opens a drawer, the
 * drawer re-renders the section behind it, and the opener is gone by the time
 * the drawer closes. A trap that assumes the opener survives throws, and the
 * throw leaves the page inert.
 */
export function closeTarget({ hadOpener = false, openerStillInDocument = false }) {
  return hadOpener && openerStillInDocument ? 'opener' : 'body';
}

/**
 * Which siblings of the dialog become inert while it is open.
 *
 * children is a list of identifiers for body's element children, and
 * dialogPath is the identifier of the child that is, or contains, the dialog.
 * Everything else is made inert. Marking the ancestor of the dialog inert as
 * well would make the dialog itself inert, which is the bug this replaces.
 */
export function inertSiblings(children, dialogPath) {
  return children.filter((child) => child !== dialogPath);
}

/**
 * Is a focusable element part of the cycle right now?
 *
 * The browser's own rule is roughly "rendered and not inert". A trap cannot ask
 * that question of a static list, so the asset uses offsetParent, which is null
 * for anything display:none. That correctly excludes a collapsed accordion
 * panel inside the drawer and, importantly, does NOT exclude an element that is
 * merely off screen, which is how the visually hidden pattern works.
 *
 * The one case offsetParent gets wrong is position:fixed, whose offsetParent is
 * null in several browsers even when the element is plainly visible, so a
 * fixed-position control inside a dialog is treated as present when it is the
 * active element and excluded otherwise. That is the compromise the asset makes
 * and it is stated in docs/03-drawers-and-modals.md.
 */
export function inCycle({ displayNone = false, isActiveElement = false }) {
  if (isActiveElement) return true;
  return !displayNone;
}
