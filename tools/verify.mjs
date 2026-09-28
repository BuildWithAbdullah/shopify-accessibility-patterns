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

import { CHECKS, CHECK_IDS, checkById, runGrouped } from './checks.mjs';
import { audit as auditCss } from './css-contract.mjs';
import { auditSnippet, SNIPPETS_WITH_CONTRACTS } from './liquid-contract.mjs';
import { FOCUSABLE_SELECTORS } from './focus-order.mjs';
import { REGION_ATTRIBUTES, CLEAR_DELAY_MS } from './announce.mjs';
import { stripComments } from './source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
function assert(ok, label, detail = '') {
  results.push({ ok: Boolean(ok), label, detail });
}

function read(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.scratch']);
const TEXT_EXTENSIONS = new Set(['.md', '.mjs', '.js', '.css', '.liquid', '.json', '.yml', '.yaml', '.html']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const textFiles = files.filter((f) => TEXT_EXTENSIONS.has(f.slice(f.lastIndexOf('.'))));

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
  [['.toSorted', '('].join(''), 'Node 20'],
  [['.toReversed', '('].join(''), 'Node 20'],
  [['.toSpliced', '('].join(''), 'Node 20'],
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
assert(
  typeof pkg.engines?.node === 'string' && pkg.engines.node.includes('18'),
  'the manifest states the oldest Node it supports',
  pkg.engines?.node
);

/* -------------------------------------------------------------------------
   8. The README describes what is actually here
   ------------------------------------------------------------------------- */

const readme = read('README.md');
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
