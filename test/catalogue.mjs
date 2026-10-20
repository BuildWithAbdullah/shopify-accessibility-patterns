import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runByCode, CHECK_IDS, checkById } from '../tools/checks.mjs';
import { FINDINGS, FINDING_CODES, findingByCode, checkOf } from '../tools/findings.mjs';
import { FIXTURES } from './fixtures/index.mjs';

/* ---------------------------------------------------------------------------
   The catalogue against what the detectors actually emit, in both directions.

   One direction stops a finding sitting in the catalogue having never fired,
   which is how a repository ends up describing behaviour it does not have.
   The other stops a detector emitting a code nothing describes, which is how
   a finding ends up in a client report with no fix beside it.

   Neither direction is interesting on its own. Together they are the reason
   the fifteen findings in test/fixtures/ exist, and writing those turned up
   nine defects in the detectors.
   --------------------------------------------------------------------------- */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'examples', 'manifest.json'), 'utf8'));

const codesIn = (path) => [...runByCode(readFileSync(path, 'utf8')).keys()].sort();
const sorted = (list) => [...list].sort();

const observed = new Map();
const note = (code, where) => observed.set(code, [...(observed.get(code) ?? []), where]);

for (const entry of manifest.examples) {
  for (const code of codesIn(join(root, 'examples', entry.directory, 'fail.html'))) {
    note(code, `${entry.directory}/fail.html`);
  }
}
for (const fixture of FIXTURES) {
  for (const code of codesIn(join(root, 'test', 'fixtures', fixture.file))) {
    note(code, `fixtures/${fixture.file}`);
  }
}

test('every finding in the catalogue is observed firing on a real page', () => {
  const never = FINDING_CODES.filter((code) => !observed.has(code));
  assert.deepEqual(never, [], `catalogued and never observed: ${never.join(', ')}`);
});

test('every finding the detectors emit is in the catalogue', () => {
  const undescribed = [...observed.keys()].filter((code) => !FINDING_CODES.includes(code));
  assert.deepEqual(sorted(undescribed), [], `emitted and not catalogued: ${undescribed.join(', ')}`);
});

test('the catalogue has no duplicate codes', () => {
  assert.equal(new Set(FINDING_CODES).size, FINDING_CODES.length);
});

test('every finding code names a check that exists', () => {
  for (const code of FINDING_CODES) {
    assert.ok(CHECK_IDS.includes(checkOf(code)), `${code} names no check`);
  }
});

test('every check has at least one finding in the catalogue', () => {
  for (const id of CHECK_IDS) {
    const mine = FINDING_CODES.filter((code) => checkOf(code) === id);
    assert.ok(mine.length > 0, `${id} has no catalogued finding`);
  }
});

test('every catalogue entry says what it is, how to fix it, and what it cannot establish', () => {
  for (const entry of FINDINGS) {
    assert.ok(entry.summary.length > 60, `${entry.code} summary is too short to be useful`);
    assert.ok(entry.fix.length > 40, `${entry.code} has no fix`);
    assert.ok(entry.cannotSay.length > 20, `${entry.code} does not state what it cannot say`);
  }
});

/* The manifest declares the findings each failing page produces, and the
   declaration is set equality rather than containment. Containment is the
   version that rots: a detector that gains a reason to fire adds a finding to
   every page it was already firing on, and a containment check stays green. */
for (const entry of manifest.examples) {
  test(`${entry.directory}/fail.html trips exactly the findings the manifest declares`, () => {
    assert.deepEqual(
      codesIn(join(root, 'examples', entry.directory, 'fail.html')),
      sorted(entry.onFail)
    );
  });

  test(`${entry.directory} declares findings that all belong to its own check`, () => {
    for (const code of entry.onFail) {
      assert.equal(checkOf(code), entry.check, `${code} is not a ${entry.check} finding`);
    }
  });
}

for (const fixture of FIXTURES) {
  test(`fixtures/${fixture.file} trips exactly the findings it declares`, () => {
    assert.deepEqual(codesIn(join(root, 'test', 'fixtures', fixture.file)), sorted(fixture.expect));
  });
}

test('every fixture file on disk is in the index', () => {
  const onDisk = readdirSync(join(root, 'test', 'fixtures'))
    .filter((name) => name.endsWith('.html'))
    .sort();
  assert.deepEqual(onDisk, sorted(FIXTURES.map((f) => f.file)));
});

test('every fixture says why it exists', () => {
  for (const fixture of FIXTURES) {
    assert.ok(fixture.why.length > 40, `${fixture.file} does not say why it exists`);
  }
});

/* A fixture that duplicates a pair is a fixture nobody will maintain. The
   point of the directory is the findings the pairs cannot reach, so each
   fixture has to be the first place at least one of its findings fires. */
test('every fixture reaches at least one finding no example pair reaches', () => {
  const fromPairs = new Set(manifest.examples.flatMap((e) => e.onFail));
  for (const fixture of FIXTURES) {
    const novel = fixture.expect.filter((code) => !fromPairs.has(code));
    assert.ok(novel.length > 0, `${fixture.file} reaches nothing the pairs do not`);
  }
});

test('each check carries a finding whose fix differs from its siblings', () => {
  for (const id of CHECK_IDS) {
    const mine = FINDINGS.filter((entry) => checkOf(entry.code) === id);
    if (mine.length < 2) continue;
    const fixes = new Set(mine.map((entry) => entry.fix));
    assert.ok(
      fixes.size > 1,
      `every ${id} finding prescribes the same fix, so splitting it bought nothing`
    );
  }
});

test('the catalogue and the checks agree about criteria', () => {
  for (const code of FINDING_CODES) {
    const check = checkById(checkOf(code));
    assert.ok(check.criteria.length > 0, `${code} belongs to a check citing no criteria`);
    assert.ok(findingByCode(code), `${code} is not retrievable by code`);
  }
});

test('the examples directory holds no stray file the manifest does not know about', () => {
  const dirs = readdirSync(join(root, 'examples'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  assert.deepEqual(dirs, sorted(manifest.examples.map((e) => e.directory)));
  for (const dir of dirs) {
    const full = join(root, 'examples', dir);
    assert.ok(statSync(full).isDirectory());
  }
});
