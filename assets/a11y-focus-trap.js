/* ---------------------------------------------------------------------------
   a11y-focus-trap.js
   Focus management for cart drawers, mobile menus, quick-view modals and
   newsletter popups.

   WCAG 2.1.2 No Keyboard Trap, 2.4.3 Focus Order, 2.4.7 Focus Visible

   Load in layout/theme.liquid:

     <script src="{{ 'a11y-focus-trap.js' | asset_url }}" defer></script>

   Then mark up the dialog:

     <div id="CartDrawer" role="dialog" aria-modal="true"
          aria-labelledby="CartDrawerTitle" data-a11y-dialog hidden>
       <h2 id="CartDrawerTitle">Your cart</h2>
       <button type="button" data-a11y-dialog-close>Close</button>
     </div>

   And open it from anywhere:

     document.querySelector('#CartDrawer').a11yDialog.open(triggerElement);

   ---------------------------------------------------------------------------
   Why this file exists

   The usual Shopify drawer failure is not a trap. It is the absence of one.
   The drawer slides in, focus is never moved into it, and the page behind
   stays fully tabbable underneath an overlay the user cannot see past. The
   user tabs off the trigger into content they cannot see, with no way to
   dismiss what is covering it.

   The other half, and the half that is skipped most often, is returning focus
   to the element that opened the dialog. Without it, closing a drawer drops
   focus to <body> and the next Tab starts again from the top of the page.

   An automated scan reports none of this. There is nothing in the DOM that
   distinguishes a dialog which takes focus from one which does not.
   --------------------------------------------------------------------------- */

(function () {
  'use strict';

  var FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'summary',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function focusableWithin(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll(FOCUSABLE),
      function (el) {
        // offsetParent is null for anything display:none, which keeps
        // collapsed accordion contents out of the cycle.
        return el.offsetParent !== null || el === document.activeElement;
      }
    );
  }

  function A11yDialog(el) {
    this.el = el;
    this.opener = null;
    this.onKeydown = this.onKeydown.bind(this);
    this.close = this.close.bind(this);

    var self = this;
    Array.prototype.forEach.call(
      el.querySelectorAll('[data-a11y-dialog-close]'),
      function (btn) { btn.addEventListener('click', self.close); }
    );

    el.addEventListener('click', function (e) {
      if (e.target === el) self.close();
    });
  }

  A11yDialog.prototype.open = function (opener) {
    this.opener = opener || document.activeElement;
    this.el.hidden = false;

    // Everything that is not the dialog becomes inert, which removes it from
    // the tab order and from the accessibility tree in one property.
    this.inertTargets = Array.prototype.filter.call(
      document.body.children,
      function (child) { return child !== this.el && !child.contains(this.el); }.bind(this)
    );
    this.inertTargets.forEach(function (el) { el.inert = true; });

    var items = focusableWithin(this.el);
    // Prefer an explicit initial target, then the first focusable control,
    // then the dialog itself, which needs tabindex="-1" to accept focus.
    var target = this.el.querySelector('[data-a11y-dialog-initial]') || items[0] || this.el;
    if (target === this.el && !this.el.hasAttribute('tabindex')) {
      this.el.setAttribute('tabindex', '-1');
    }
    target.focus();

    document.addEventListener('keydown', this.onKeydown);
    document.documentElement.style.overflow = 'hidden';
    this.el.dispatchEvent(new CustomEvent('a11y-dialog:open', { bubbles: true }));
  };

  A11yDialog.prototype.close = function () {
    this.el.hidden = true;

    (this.inertTargets || []).forEach(function (el) { el.inert = false; });
    this.inertTargets = null;

    document.removeEventListener('keydown', this.onKeydown);
    document.documentElement.style.overflow = '';

    // Put the user back exactly where they were. Skipping this is the most
    // common remaining defect once a drawer has been made to take focus.
    if (this.opener && document.contains(this.opener)) this.opener.focus();
    this.opener = null;

    this.el.dispatchEvent(new CustomEvent('a11y-dialog:close', { bubbles: true }));
  };

  A11yDialog.prototype.onKeydown = function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== 'Tab') return;

    // Fallback cycle for browsers and embedded webviews without inert.
    var items = focusableWithin(this.el);
    if (!items.length) { e.preventDefault(); return; }

    var first = items[0];
    var last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  function init(root) {
    Array.prototype.forEach.call(
      (root || document).querySelectorAll('[data-a11y-dialog]'),
      function (el) {
        if (!el.a11yDialog) el.a11yDialog = new A11yDialog(el);
      }
    );
  }

  document.addEventListener('DOMContentLoaded', function () { init(document); });

  // Theme editor re-renders sections without a page load, so re-initialise.
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });

  window.A11yDialog = A11yDialog;
  window.a11yDialogInit = init;
})();
