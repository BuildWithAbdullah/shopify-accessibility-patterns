#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   verify.mjs
   Repository level assertions. Run with `npm run verify`.

   The unit tests in test/ check that each piece behaves. This checks the things
   that are true of the repository as a whole and that quietly stop being true
   as it grows: an example added without a detector, a detector added without an
   example, a corrected page that fixes one defect and introduces another, a
   README that links to a file somebody renamed, a test file nobody runs.

   It prints every assertion it makes, passing or failing, so the output is a
   statement of what this repository guarantees rather than a count.
   --------------------------------------------------------------------------- */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHECKS, CHECK_IDS, checkById, runGrouped, runByCode } from './checks.mjs';
import { FINDINGS, FINDING_CODES, checkOf } from './findings.mjs';
import { LIMITS, LIMIT_IDS } from './limits.mjs';
import { trackedFiles, trackedTextFiles } from './tracked.mjs';
import { audit as auditCss } from './css-contract.mjs';
import { auditSnippet, SNIPPETS_WITH_CONTRACTS } from './liquid-contract.mjs';
import { FOCUSABLE_SELECTORS } from './focus-order.mjs';
import { REGION_ATTRIBUTES, CLEAR_DELAY_MS } from './announce.mjs';
import { stripComments } from './source.mjs';
import { buildCatalogue } from './gen-catalogue.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
function assert(ok, label, detail = '') {
  results.push({ ok: Boolean(ok), label, detail });
}

function read(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

/* The files a fresh clone contains, which is not the same as the files this
   directory contains. The hand rolled walk this replaces skipped node_modules
   by name, which is correct until the ignore list grows a second entry and
   nobody remembers there are two places to add it. tools/tracked.mjs reads
   .gitignore instead, so the figure beside the command in the README is the
   figure a reader gets, whoever ran npm install. */
const files = trackedFiles(ROOT);
const textFiles = trackedTextFiles(ROOT, ['md', 'mjs', 'js', 'css', 'liquid', 'json', 'yml', 'yaml', 'html']);

/* -------------------------------------------------------------------------
   1. Examples and detectors stay in step
   ------------------------------------------------------------------------- */

const manifest = JSON.parse(read('examples', 'manifest.json'));
const manifestDirs = manifest.examples.map((e) => e.directory);
const onDisk = readdirSync(join(ROOT, 'examples'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

assert(
  JSON.stringify([...manifestDirs].sort()) === JSON.stringify(onDisk),
  'every example directory is in the manifest and every manifest entry is on disk',
  `manifest: ${manifestDirs.length}, on disk: ${onDisk.length}`
);

for (const entry of manifest.examples) {
  const dir = join(ROOT, 'examples', entry.directory);
  const failPath = join(dir, 'fail.html');
  const passPath = join(dir, 'pass.html');

  if (!existsSync(failPath) || !existsSync(passPath)) {
    assert(false, `${entry.directory} has both fail.html and pass.html`);
    continue;
  }
  assert(true, `${entry.directory} has both fail.html and pass.html`);

  const check = checkById(entry.check);
  assert(Boolean(check), `${entry.directory} names a check that exists`, entry.check);
  if (!check) continue;

  assert(
    JSON.stringify(entry.criteria) === JSON.stringify(check.criteria),
    `${entry.directory} cites the same criteria as its check`,
    `manifest ${entry.criteria.join(', ')} against check ${check.criteria.join(', ')}`
  );

  const failGrouped = runGrouped(readFileSync(failPath, 'utf8'));
  const own = failGrouped.get(entry.check)?.length ?? 0;
  assert(own > 0, `${entry.directory}/fail.html trips ${entry.check}`, `${own} findings`);

  const strays = [...failGrouped.keys()].filter((id) => id !== entry.check);
  assert(
    strays.length === 0,
    `${entry.directory}/fail.html trips nothing else, so the pair demonstrates one defect`,
    strays.join(', ')
  );

  // The cross check. A corrected page that fixes its own defect while carrying
  // somebody else's is the failure mode a pass file has, and it is invisible to
  // a check that only looks at its own criterion.
  const passGrouped = runGrouped(readFileSync(passPath, 'utf8'));
  assert(
    passGrouped.size === 0,
    `${entry.directory}/pass.html trips no check in the repository`,
    [...passGrouped.entries()].map(([id, list]) => `${id} at line ${list[0].line}`).join('; ')
  );
}

const withoutExample = CHECK_IDS.filter((id) => !manifestDirs.some((dir) => {
  const entry = manifest.examples.find((e) => e.directory === dir);
  return entry.check === id;
}));
assert(
  withoutExample.length === 0,
  'every check has a failing and corrected pair behind it',
  withoutExample.join(', ')
);

for (const check of CHECKS) {
  assert(
    typeof check.proves === 'string' && check.proves.length > 40,
    `${check.id} states what it proves`
  );
  assert(
    typeof check.doesNotProve === 'string' && check.doesNotProve.length > 40,
    `${check.id} states what it does not prove`
  );
  assert(
    Array.isArray(check.criteria) && check.criteria.every((c) => /^\d+\.\d+\.\d+$/.test(c)),
    `${check.id} cites success criteria by number`,
    check.criteria.join(', ')
  );
}

/* -------------------------------------------------------------------------
   2. The baseline stylesheet keeps its promises
   ------------------------------------------------------------------------- */

for (const item of auditCss(read('assets', 'a11y-base.css'))) {
  assert(item.ok, `a11y-base.css: ${item.id}`, item.detail);
}

/* -------------------------------------------------------------------------
   3. The snippets keep theirs
   ------------------------------------------------------------------------- */

const snippetFiles = readdirSync(join(ROOT, 'snippets')).filter((f) => f.endsWith('.liquid')).sort();
for (const file of snippetFiles) {
  for (const item of auditSnippet(join(ROOT, 'snippets', file))) {
    assert(item.ok, `snippet: ${item.id}`, item.detail);
  }
}
for (const name of SNIPPETS_WITH_CONTRACTS) {
  assert(
    snippetFiles.includes(`${name}.liquid`),
    `the contract for ${name} has a snippet to check`
  );
}
const withoutContract = snippetFiles
  .map((f) => f.replace(/\.liquid$/, ''))
  .filter((name) => !SNIPPETS_WITH_CONTRACTS.includes(name));
assert(
  withoutContract.length === 0,
  'every snippet has a contract, so a new one cannot arrive unchecked',
  withoutContract.join(', ')
);

/* -------------------------------------------------------------------------
   4. The theme assets and the modules that specify them cannot drift
   ------------------------------------------------------------------------- */

/* Read the code, not the prose. Both assets explain in comments the mistakes
   they avoid, so an unstripped scan finds the mistake in the explanation. */
const trap = stripComments(read('assets', 'a11y-focus-trap.js'));
for (const selector of FOCUSABLE_SELECTORS) {
  assert(
    trap.includes(`'${selector}'`),
    `a11y-focus-trap.js uses the focusable selector ${selector}`,
    'the list in tools/focus-order.mjs is the single source of truth for it'
  );
}
const selectorsInTrap = (trap.match(/var FOCUSABLE = \[([\s\S]*?)\]\.join/) || [])[1];
const countInTrap = selectorsInTrap ? selectorsInTrap.split(',').filter((s) => s.includes("'")).length : 0;
assert(
  countInTrap === FOCUSABLE_SELECTORS.length,
  'the asset lists exactly as many focusable selectors as tools/focus-order.mjs does',
  `${countInTrap} in the asset against ${FOCUSABLE_SELECTORS.length} in the module`
);

const announcer = stripComments(read('assets', 'a11y-announcer.js'));
for (const [name, value] of Object.entries(REGION_ATTRIBUTES)) {
  assert(
    announcer.includes(`'${value}'`),
    `a11y-announcer.js sets ${name} to ${value}`
  );
}
assert(
  announcer.includes(String(CLEAR_DELAY_MS)),
  `a11y-announcer.js clears the region after ${CLEAR_DELAY_MS}ms, as tools/announce.mjs specifies`
);
assert(
  announcer.includes('requestAnimationFrame'),
  'a11y-announcer.js writes the message on a later frame, which is the mutation that gets announced'
);
assert(
  !/display\s*:\s*none/.test(announcer),
  'a11y-announcer.js does not hide the region with display:none, which would stop it being observed'
);

/* -------------------------------------------------------------------------
   5. House rules
   ------------------------------------------------------------------------- */

/* The needles are built from code points rather than written out, so that this
   file does not contain the characters it forbids and fail its own check. The
   same trick is used for the institution tokens and the API names below. */
const DASHES = [
  [String.fromCharCode(0x2014), 'em dash'],
  [String.fromCharCode(0x2013), 'en dash'],
  [String.fromCharCode(0x2012), 'figure dash'],
  [String.fromCharCode(0x2015), 'horizontal bar']
];
for (const [char, name] of DASHES) {
  const offenders = textFiles.filter((f) => readFileSync(f, 'utf8').includes(char));
  assert(
    offenders.length === 0,
    `no ${name} anywhere in the repository`,
    offenders.map((f) => relative(ROOT, f)).join(', ')
  );
}

const INSTITUTION = ['NU', 'CES'].join('');
const FORBIDDEN_TOKENS = [INSTITUTION, `FAST-${INSTITUTION}`];
for (const token of FORBIDDEN_TOKENS) {
  const offenders = textFiles.filter((f) => readFileSync(f, 'utf8').includes(token));
  assert(offenders.length === 0, 'no institution reference in the repository', offenders.map((f) => relative(ROOT, f)).join(', '));
}

const pkg = JSON.parse(read('package.json'));
assert(pkg.license === 'MIT', 'the manifest declares MIT');
assert(existsSync(join(ROOT, 'LICENSE')), 'a licence file is present');

/* -------------------------------------------------------------------------
   6. Every test actually runs
   ------------------------------------------------------------------------- */

const testFiles = readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.mjs')).sort();
const testScript = pkg.scripts.test;

assert(
  !testScript.includes('*'),
  'the test script names its files instead of using a glob',
  'node --test did not accept glob patterns before Node 21, so a glob passes locally and finds nothing on the oldest supported version'
);
for (const file of testFiles) {
  assert(testScript.includes(`test/${file}`), `test/${file} is named in the test script`);
}
const named = (testScript.match(/test\/[\w.-]+\.mjs/g) || []).map((p) => p.replace('test/', ''));
const missing = named.filter((f) => !testFiles.includes(f));
assert(missing.length === 0, 'the test script names no file that has been deleted', missing.join(', '));

/* -------------------------------------------------------------------------
   7. Nothing in this repository needs a newer Node than it claims
   ------------------------------------------------------------------------- */

/* The engines field is the promise; this is the check. It is a text scan of the
   obvious offenders, not a language level analysis, and it does not catch a
   newer regular expression flag or a newer option on an older API. The matrix
   in the workflow is what actually proves the claim. */
const TOO_NEW = [
  [['Object', 'groupBy'].join('.'), 'Node 21'],
  [['Map', 'groupBy'].join('.'), 'Node 21'],
  [['import', 'meta', 'dirname'].join('.'), 'Node 20.11'],
  [['import', 'meta', 'filename'].join('.'), 'Node 20.11'],
  [['Array', 'fromAsync'].join('.'), 'Node 22'],
  [['Promise', 'withResolvers'].join('.'), 'Node 22'],
  [['glob', 'Sync'].join(''), 'Node 22'],
  [['node:', 'sqlite'].join(''), 'Node 22'],
  [['navigator', '.'].join(''), 'Node 21']
];

const ourModules = files.filter((f) => f.endsWith('.mjs'));
for (const [needle, version] of TOO_NEW) {
  const offenders = ourModules.filter((f) => readFileSync(f, 'utf8').includes(needle));
  assert(
    offenders.length === 0,
    `nothing uses ${needle}, which needs ${version}`,
    offenders.map((f) => relative(ROOT, f)).join(', ')
  );
}
/* The floor has to be an exact version, and this assertion is here because
   the bare major it replaces was a false promise for the whole life of the
   repository. The manifest said >=18 and the README said Node 18 or newer,
   and `node --test` did not exist until 18.1.0, so npm test could not run at
   all on the version both of them promised. CI was green throughout, because
   actions/setup-node resolves `18` to the newest 18.x, which is the one shape
   of this mistake that can never be caught by testing it. An exact floor can
   be installed and run, so it can be checked. */
const floor = (pkg.engines?.node ?? '').replace(/^>=/, '');
assert(
  /^\d+\.\d+\.\d+$/.test(floor),
  'the engines floor is an exact version rather than a bare major, so it can be installed and run',
  pkg.engines?.node
);

const workflow = read('.github', 'workflows', 'ci.yml');
assert(
  workflow.includes(`'${floor}'`),
  'the CI matrix runs the suite on the exact floor the manifest promises',
  `looking for '${floor}' in the matrix`
);
/* The other entries in the matrix are deliberately bare majors: testing the
   newest release of a line is how a patch that breaks the suite gets noticed.
   The floor is the one that cannot be, because a bare major standing in for
   the floor is the whole of the defect this replaces. */
const floorMajor = floor.split('.')[0];
assert(
  !workflow.includes(`'${floorMajor}'`),
  'the matrix does not name the floor as a bare major, which would resolve to the newest release of that line and test a version nobody promised',
  `'${floorMajor}' would silently stand in for ${floor}`
);

/* -------------------------------------------------------------------------
   8. The catalogue, the fixtures and the limits
   ------------------------------------------------------------------------- */

/* test/catalogue.mjs asserts the catalogue against what the detectors emit.
   What is left for this file is the part that is true of the repository
   rather than of a page: that the manifest, the catalogue and the generated
   document cannot drift apart, and that the limits are exercised. */

for (const entry of manifest.examples) {
  assert(
    Array.isArray(entry.onFail) && entry.onFail.length > 0,
    `${entry.directory} declares the findings its failing page produces`
  );
  const unknown = (entry.onFail ?? []).filter((code) => !FINDING_CODES.includes(code));
  assert(unknown.length === 0, `${entry.directory} declares only catalogued findings`, unknown.join(', '));
}

assert(
  new Set(FINDING_CODES).size === FINDING_CODES.length,
  'the catalogue declares no finding twice'
);

for (const id of CHECK_IDS) {
  const mine = FINDING_CODES.filter((code) => checkOf(code) === id);
  assert(mine.length > 0, `${id} has at least one catalogued finding`, `${mine.length}`);
}

const uncatalogued = FINDING_CODES.filter((code) => !CHECK_IDS.includes(checkOf(code)));
assert(uncatalogued.length === 0, 'every catalogued finding names a check that exists', uncatalogued.join(', '));

/* The fixtures are the coverage and the pairs are the illustrations, so a
   fixture directory that quietly empties is a loss of coverage that nothing
   else in this file would notice. */
const fixtureFiles = readdirSync(join(ROOT, 'test', 'fixtures')).filter((f) => f.endsWith('.html'));
assert(fixtureFiles.length > 0, 'the fixtures directory holds pages');

const reachedByPairs = new Set(manifest.examples.flatMap((e) => e.onFail));
const reachedByFixtures = new Set(
  fixtureFiles.flatMap((f) => [...runByCode(read('test', 'fixtures', f)).keys()])
);
const unreached = FINDING_CODES.filter(
  (code) => !reachedByPairs.has(code) && !reachedByFixtures.has(code)
);
assert(
  unreached.length === 0,
  'every catalogued finding is reached by a pair or a fixture',
  unreached.join(', ')
);
assert(
  [...reachedByFixtures].some((code) => !reachedByPairs.has(code)),
  'the fixtures reach findings the pairs do not, which is the only reason they exist'
);

/* The generated document, compared against the builder rather than
   regenerated by it. A verifier that rewrites its own subject always passes. */
const catalogueDoc = read('docs', '09-finding-catalogue.md');
assert(
  catalogueDoc === buildCatalogue(),
  'docs/09-finding-catalogue.md matches what tools/gen-catalogue.mjs produces',
  'run node tools/gen-catalogue.mjs'
);
assert(
  catalogueDoc.includes(`report: ${FINDINGS.length} of them`),
  'the generated catalogue states the number of findings the module declares'
);

/* The limits are the most important claim in the repository and were prose
   until test/gap.mjs existed. These two assertions are what stop one of them
   being quietly dropped: an id removed from the test fails here, and an id
   invented in the test fails here too. */
const gapSource = read('test', 'gap.mjs');
for (const limit of LIMITS) {
  assert(
    (gapSource.split(limit.id).length - 1) >= 2,
    `the limit ${limit.id} is exercised in test/gap.mjs`
  );
  assert(limit.claim.length > 80, `the limit ${limit.id} states its claim`);
}
const idsInGap = [...gapSource.matchAll(/'([a-z-]+):/g)].map((m) => m[1]);
const undeclared = [...new Set(idsInGap)].filter(
  (id) => !LIMIT_IDS.includes(id) && LIMIT_IDS.some((known) => known.split('-')[0] === id.split('-')[0])
);
assert(
  undeclared.length === 0,
  'test/gap.mjs names no limit that tools/limits.mjs does not declare',
  undeclared.join(', ')
);

/* -------------------------------------------------------------------------
   9. The README describes what is actually here
   ------------------------------------------------------------------------- */

const readme = read('README.md');
assert(
  readme.includes('docs/09-finding-catalogue.md'),
  'the README links to the generated catalogue'
);
const linked = [...readme.matchAll(/\]\((?!https?:)([^)#]+)\)/g)].map((m) => m[1]);
for (const target of new Set(linked)) {
  assert(existsSync(join(ROOT, target)), `README links to ${target} and it exists`);
}

const shouldBeListed = [
  ...snippetFiles.map((f) => `snippets/${f}`),
  ...readdirSync(join(ROOT, 'assets')).sort().map((f) => `assets/${f}`),
  ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).sort().map((f) => `docs/${f}`)
];
for (const path of shouldBeListed) {
  assert(readme.includes(path), `README mentions ${path}`);
}
for (const section of ['## Examples', '## Verifying']) {
  assert(readme.includes(section), `README has a ${section} section`);
}

/* The thresholds quoted in prose are the thresholds the code uses. Numbers in a
   README drift away from the code that implements them, and a wrong number in a
   repository about correctness costs more than a missing one. */
assert(
  /24 by 24/.test(readme) && !/2\.5\.8[^.]{0,40}44/.test(readme),
  'the README attributes 24 by 24 to 2.5.8 and does not attribute 44 to it'
);

/* The count this README quotes is the count this file produces. A number in a
   README drifts away from the thing it describes, and in a repository about
   correctness a wrong number costs more than a missing one. The assertion is
   added last and counts itself. */
const quoted = readme.match(/npm run verify\s+#\s*(\d+) repository-level assertions/);
assert(
  Boolean(quoted) && Number(quoted[1]) === results.length + 1,
  'the README quotes the number of assertions this file actually makes',
  `README says ${quoted ? quoted[1] : 'nothing'}, this run made ${results.length + 1}`
);

/* -------------------------------------------------------------------------
   Report
   ------------------------------------------------------------------------- */

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  const line = `${r.ok ? 'ok  ' : 'FAIL'}  ${r.label}`;
  if (r.ok) console.log(line);
  else console.log(`${line}\n        ${r.detail}`);
}
console.log(`\n${results.length} assertions, ${failed.length} failing`);
if (failed.length > 0) process.exitCode = 1;
