/* ---------------------------------------------------------------------------
   a11y-announcer.js
   A single live region for cart and variant updates.

   WCAG 4.1.3 Status Messages (Level AA)

   Load in layout/theme.liquid:

     <script src="{{ 'a11y-announcer.js' | asset_url }}" defer></script>

   Then announce from any theme script:

     window.a11yAnnounce('Added to cart. 3 items, 84.00.');

   ---------------------------------------------------------------------------
   The problem it solves

   On an AJAX cart, adding a product updates a badge in the header and maybe
   slides out a drawer. Nothing is announced. A screen reader user presses the
   add button and receives no confirmation that anything happened at all, so
   the usual response is to press it again.

   The same applies to variant changes updating a price, filter results
   updating a product count, and inline form validation.

   Two rules that are easy to get wrong:

   1. The live region must be in the DOM and empty before the update. Creating
      the element and setting its text in the same tick usually announces
      nothing, because there is no change for the observer to detect.

   2. Use polite, not assertive. Assertive interrupts whatever the user is
      currently reading. A cart confirmation is not worth interrupting for.
      Reserve assertive for errors that stop the user proceeding.
   --------------------------------------------------------------------------- */

(function () {
  'use strict';

  var region = null;
  var clearTimer = null;

  function ensureRegion() {
    if (region) return region;

    region = document.getElementById('a11y-live-region');
    if (region) return region;

    region = document.createElement('div');
    region.id = 'a11y-live-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');

    // Visually hidden, but never display:none. A live region that is not
    // rendered is not observed, and nothing is announced.
    region.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
      'overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';

    document.body.appendChild(region);
    return region;
  }

  function announce(message) {
    if (!message) return;
    var el = ensureRegion();

    clearTimeout(clearTimer);

    // Clearing first, then setting on the next frame, guarantees a detectable
    // change even when the same message is announced twice in a row. Without
    // this, adding the same product twice announces once.
    el.textContent = '';
    requestAnimationFrame(function () {
      el.textContent = message;
      // Clear afterwards so the text is not re-read when the user navigates
      // back over the region with a screen reader.
      clearTimer = setTimeout(function () { el.textContent = ''; }, 5000);
    });
  }

  document.addEventListener('DOMContentLoaded', ensureRegion);

  window.a11yAnnounce = announce;
})();
