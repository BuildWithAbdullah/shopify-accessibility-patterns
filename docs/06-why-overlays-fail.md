# Why accessibility overlays do not solve this

Every merchant facing a demand letter is offered an overlay: a script tag that
promises compliance for a monthly fee. It is worth being able to explain,
concretely and without sounding defensive, why that does not work.

## What they claim and what they do

An overlay is JavaScript that runs after the page loads, scans the DOM,
attempts automated repairs, and adds a widget offering font size, contrast and
cursor adjustments.

The repairs are real but shallow: guessing alt text from filenames, adding ARIA
roles to elements it recognises, adjusting contrast on elements it can classify.

## The four structural problems

**1. They cannot fix what tooling cannot detect.** An overlay is an automated
tool running in the browser, so it is bounded by the same limits as any
automated tool. Roughly a third of WCAG success criteria are machine-testable,
and the operability criteria are concentrated in the part that is not. Whether a
cart drawer manages focus, whether tab order matches reading order, whether alt
text is meaningful rather than merely present: none of these can be determined
from the DOM. An overlay cannot fix a keyboard trap, because it cannot tell
there is one.

**2. They run after the barrier is already loaded.** Screen readers build their
model from the accessibility tree as it is delivered. A script that mutates that
tree afterwards produces announcements that do not match what the user was
navigating a moment ago. Users report content shifting under them.

**3. They break real assistive technology.** This is the part that surprises
people. Overlay widgets frequently conflict with the screen reader, magnifier or
voice control the user already has configured. The most common complaint from
actual screen reader users is not that overlays fail to help; it is that they
have to be disabled before the site becomes usable at all. Several
community-maintained lists of overlay-using sites exist purely so users can
avoid them.

**4. They are not a legal defence.** Overlay-using sites continue to receive
demand letters and continue to be named in filings. The presence of an overlay
does not establish conformance, and vendor indemnity offers are narrow enough
to be worth reading closely.

## What you find when you remove one

Two things happen repeatedly when an overlay comes off a live site.

**Scores stop fluctuating.** An auto-patch script that runs on a timer produces
different results depending on when the scan happened relative to the patch
pass. Reported scores drift by several points between identical scans with no
change to the site. Once the script is gone, the numbers hold still, and only
then can before-and-after figures be trusted at all.

**The underlying markup is untouched.** Everything the overlay was papering over
is still there: unnamed buttons, missing landmarks, unlabelled inputs, broken
heading structure. The overlay was a layer over the defects, not a fix for
them. Remove it and the original site is exactly as it was.

There is a related pattern worth watching for. When an overlay subscription
lapses, the script often keeps loading, doing nothing, on every page. A dead
overlay script still in the head of every page is a common finding on sites
that cancelled a vendor and were never told to remove the tag.

## Vendor lock-in

Overlay and managed-accessibility contracts are recurring. The work lives in the
vendor's account, not the client's, and cancelling can mean losing it. A client
who declines a renewal can find the accessibility work removed from their site
along with the subscription, and be left with a dead script tag as the only
trace.

Ask, before signing anything: if we stop paying, what stays? Source-level fixes
in your own theme stay. A hosted patch layer does not.

## What to say instead

> An overlay is a script that tries to repair the page in the browser after it
> loads. It can only fix what a machine can detect, which is about a third of
> the standard, and it cannot fix the keyboard and focus problems that make a
> site genuinely unusable. It also interferes with the screen readers your
> customers already use. The fix is in the theme source, where it is permanent,
> where it survives you cancelling any subscription, and where anyone can audit
> it.

## When a client already has one

1. Baseline-scan the site with the overlay still active, and note any score
   instability across repeated scans.
2. Disable it and re-scan. This is the honest baseline.
3. Remediate at source.
4. Remove the script tag entirely rather than leaving it inert.
5. Check for a second overlay. Sites that have changed vendors often have two.
