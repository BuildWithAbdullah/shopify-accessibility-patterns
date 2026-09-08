# Patching what you do not control, and when to stop

Some barriers sit in markup you cannot edit: an app that renders into your DOM,
a section a merchant added through a page builder, a widget that rebuilds itself
on every filter change.

You can patch those from a theme script. Sometimes you should. This document is
about doing it safely, and about recognising the point where it stops being the
right answer.

## The discipline

A patch layer that runs once on `DOMContentLoaded` will miss anything rendered
later, and a patch layer that runs on every mutation without guards will fight
itself, thrash the main thread, and in the worst case loop forever because its
own changes trigger the observer that reapplies them.

Four rules.

**1. Mark what you have fixed.** Every element you touch gets a marker
attribute, and every fix checks for it first. This is what stops the observer
reprocessing the same nodes on every mutation.

**2. Observe, do not poll.** A `setInterval` running twice a second forever is
a battery and CPU cost on every page view for every user. A `MutationObserver`
costs nothing until something changes.

**3. Debounce the observer.** Widgets emit mutations in bursts. Coalesce them
into one pass per frame.

**4. Disconnect while writing.** Otherwise your own DOM writes re-trigger the
observer you are inside.

```js
(function () {
  'use strict';

  var MARK = 'data-a11y-fixed';
  var observer = null;
  var queued = false;

  function fixIconButtons(root) {
    root.querySelectorAll('button:not([' + MARK + '])').forEach(function (btn) {
      // Only act on genuinely unnamed controls. A patch that overwrites a
      // correct name is worse than no patch at all.
      if (btn.textContent.trim() || btn.getAttribute('aria-label')) {
        btn.setAttribute(MARK, 'skip');
        return;
      }
      var name = btn.dataset.a11yName || btn.className.match(/(cart|search|close|menu)/);
      if (!name) { btn.setAttribute(MARK, 'unknown'); return; }

      var label = document.createElement('span');
      label.className = 'visually-hidden';
      label.textContent = typeof name === 'string' ? name : name[0];
      btn.appendChild(label);
      btn.setAttribute(MARK, 'named');
    });
  }

  function run() {
    queued = false;
    if (observer) observer.disconnect();
    try {
      fixIconButtons(document);
    } finally {
      if (observer) start();
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', function () {
    observer = new MutationObserver(schedule);
    run();
  });
})();
```

Note the third rule inside `fixIconButtons`: an element that already has a name
is marked and skipped. A patch layer that blindly relabels everything will
overwrite correct names with worse ones, and that failure is much harder to
find than the one it replaced.

## When to stop

Injection is a repair, not an architecture. It is the right call when:

- the markup genuinely cannot be edited, as with a third-party app
- the fix is small and stable
- the alternative is leaving a real barrier in place

It is the wrong call when the markup **can** be edited and injection is simply
faster. That trade goes bad in a specific and predictable way.

A patch layer applied across a theme accumulates. It grows to cover cases that
were only ever symptoms of one bad template. It runs on every page load for
every visitor. It breaks silently when the theme updates and a class name
changes, and nothing tells you, because the elements it was fixing still exist
and simply stop being fixed. Nobody reads it. The next developer does not know
it is there.

Then somebody opens the source, sees the real markup underneath still carrying
every original defect, and reasonably concludes the work was cosmetic.

That is a hard conversation to have, and it is a fair criticism. The patch was
real and it worked, but the source was never fixed, and source is what anyone
technical will look at.

**The rule: if you can edit the source, edit the source.** Reserve injection for
the parts you genuinely cannot reach, keep it small, comment every rule with
what it is fixing and why it could not be fixed upstream, and list it in the
handover so the next person knows it exists.

## What to hand over

If a patch layer ships, the client gets a short document naming:

- every element it touches
- why that element could not be fixed at source
- what will break it, which is usually a theme update or an app update
- how to tell whether it is still working, which is normally a one-line
  console check

Without that, the layer is invisible maintenance debt with your name on it.
