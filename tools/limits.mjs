/* ---------------------------------------------------------------------------
   limits.mjs
   The declared limits of everything in this repository that runs.

   docs/08-what-the-checks-do-not-see.md has said all of this in prose since
   the repository was first published, and prose was the wrong place for it.
   A verification layer whose limits are written down is read as a stronger
   claim than it is; a verification layer whose limits are asserted is read
   correctly, because the assertion fails if somebody quietly narrows one.

   The difference matters more here than in most repositories, because the
   argument this one makes is that the expensive Shopify accessibility
   failures are the ones no static check reports. That argument was the thing
   nothing checked.

   Each limit below is exercised by test/gap.mjs, which asserts it in both
   directions wherever both directions exist. `directions` says which:

     'false-positive'  a conforming page is reported
     'false-negative'  a defective page is not reported
     'both'            the same visitor-visible outcome gets either verdict
                       depending on something that is not a property of the
                       page, which is the strongest form of the claim

   tools/verify.mjs asserts that every id here appears in test/gap.mjs and
   that every limit id used there is declared here, so neither file can grow
   a limit the other does not know about.
   --------------------------------------------------------------------------- */

export const LIMITS = [
  {
    id: 'cascade-not-resolved',
    bounds: ['focus-outline-removed', 'skip-link-unusable', 'target-under-24px'],
    claim:
      'The checks read the declarations in the file. A document that links a stylesheet is a document whose cascade is partly somewhere else, so the verdict depends on which file a rule happens to live in rather than on what a visitor sees.',
    directions: 'both'
  },
  {
    id: 'declared-size-is-not-rendered-size',
    bounds: ['target-under-24px'],
    claim:
      'A declared width is not a rendered width. Padding, a transform, a larger child and a pseudo-element all change the box, so a conforming declaration can render too small and a small declaration can render large enough.',
    directions: 'both'
  },
  {
    id: 'name-can-change-after-load',
    bounds: ['unnamed-control', 'dialog-not-a-dialog', 'field-without-label'],
    claim:
      'The markup on disk is the markup before any script has run. A name added on load makes a reported finding wrong, and a name removed on load makes an unreported page defective.',
    directions: 'both'
  },
  {
    id: 'semantics-are-not-behaviour',
    bounds: ['dialog-not-a-dialog'],
    claim:
      'Dialog semantics and dialog behaviour are independent. All four combinations of the two verdicts are reachable, so neither predicts the other, and the static verdict carries no information about whether the drawer can be used.',
    directions: 'both'
  },
  {
    id: 'a-name-is-not-a-good-name',
    bounds: ['unnamed-control', 'dialog-not-a-dialog'],
    claim:
      'The checks ask whether there is a name, which is the only half of the question a machine can answer. A control named "click here" satisfies every name check in this repository and fails 2.4.4.',
    directions: 'false-negative'
  },
  {
    id: 'pairs-do-not-cover-the-catalogue',
    bounds: ['examples/manifest.json'],
    claim:
      'The example pairs demonstrate one defect each, so for every check with more than one reason to fire they reach a strict subset of its findings. This repository asserted that every check had a pair, and was green, while fifteen of thirty-two findings had never fired once. The pairs are illustrations; the fixtures are the coverage.',
    directions: 'false-negative'
  }
];

export const LIMIT_IDS = LIMITS.map((l) => l.id);

export function limitById(id) {
  return LIMITS.find((l) => l.id === id);
}
