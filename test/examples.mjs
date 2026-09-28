import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHECK_IDS, checkById, runGrouped, run } from '../tools/checks.mjs';

const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));
const manifest = JSON.parse(readFileSync(join(EXAMPLES, 'manifest.json'), 'utf8'));

function html(directory, side) {
  return readFileSync(join(EXAMPLES, directory, `${side}.html`), 'utf8');
}

test('the manifest and the directories on disk agree', () => {
  const onDisk = readdirSync(EXAMPLES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(manifest.examples.map((e) => e.directory).sort(), onDisk);
});

test('every check has a pair behind it', () => {
  const covered = new Set(manifest.examples.map((e) => e.check));
  assert.deepEqual(CHECK_IDS.filter((id) => !covered.has(id)), []);
});

test('no two examples claim the same check', () => {
  const claimed = manifest.examples.map((e) => e.check);
  assert.equal(new Set(claimed).size, claimed.length);
});

for (const entry of manifest.examples) {
  test(`${entry.directory}: the failing page trips ${entry.check}`, () => {
    const findings = runGrouped(html(entry.directory, 'fail')).get(entry.check);
    assert.ok(findings && findings.length > 0);
    for (const finding of findings) {
      assert.equal(typeof finding.line, 'number');
      assert.ok(finding.line > 0);
      assert.ok(finding.evidence.length > 0);
    }
  });

  test(`${entry.directory}: the failing page trips nothing else`, () => {
    const ids = [...runGrouped(html(entry.directory, 'fail')).keys()];
    assert.deepEqual(ids.filter((id) => id !== entry.check), []);
  });

  /* The cross check. A corrected page that fixes its own defect while carrying
     somebody else's is what actually goes wrong with a pair like this, and a
     check that only looks at its own criterion cannot see it. */
  test(`${entry.directory}: the corrected page trips no check at all`, () => {
    const grouped = runGrouped(html(entry.directory, 'pass'));
    assert.deepEqual(
      [...grouped.entries()].map(([id, list]) => `${id} at line ${list[0].line}`),
      []
    );
  });

  test(`${entry.directory}: the manifest cites the criteria its check declares`, () => {
    assert.deepEqual(entry.criteria, checkById(entry.check).criteria);
  });

  test(`${entry.directory}: both sides describe themselves in a comment`, () => {
    for (const side of ['fail', 'pass']) {
      assert.match(html(entry.directory, side), /<!--[\s\S]{80,}?-->/, side);
    }
  });

  test(`${entry.directory}: the manifest explains the defect and the correction`, () => {
    assert.ok(entry.summary.length > 40);
    assert.ok(entry.correction.length > 30);
  });
}

test('the failing and corrected pages differ by more than a comment', () => {
  for (const entry of manifest.examples) {
    const fail = html(entry.directory, 'fail').replace(/<!--[\s\S]*?-->/g, '');
    const pass = html(entry.directory, 'pass').replace(/<!--[\s\S]*?-->/g, '');
    assert.notEqual(fail, pass, entry.directory);
  }
});

test('every page is a complete document, so it can be opened on its own', () => {
  for (const entry of manifest.examples) {
    for (const side of ['fail', 'pass']) {
      const source = html(entry.directory, side);
      assert.match(source, /^<!doctype html>/i, `${entry.directory}/${side}`);
      assert.match(source, /<html lang="en">/, `${entry.directory}/${side}`);
      assert.match(source, /<title>[^<]+<\/title>/, `${entry.directory}/${side}`);
    }
  }
});

test('no corrected page in the repository trips any check, taken together', () => {
  const findings = manifest.examples.flatMap((entry) => run(html(entry.directory, 'pass')));
  assert.deepEqual(findings, []);
});
