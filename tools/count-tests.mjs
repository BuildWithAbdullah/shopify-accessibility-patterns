#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   count-tests.mjs

   How many tests actually ran, counted from the structured event stream
   rather than from reporter output, and compared against the figure the
   README quotes.

   Parsing reporter output is the trap this replaces, and it is not
   hypothetical on this repository: `node --test` prints TAP on Node 20 and
   22 and the spec reporter on Node 24 even when piped, so the same suite
   that reports `# tests 356` on the floor reports `ℹ tests 356` on the
   newest version in the matrix. A counter that reads printed lines is a
   counter that works until somebody upgrades. node:test's run() emits
   objects, and an object does not change shape because the terminal did.

   There is a second trap inside the first. An object stream only flows once
   something reads it, and attaching named event listeners does not count as
   reading it, so `end` never fires and whatever was going to run at the end
   silently never runs. It is consumed with for-await here, and zero tests is
   a failure rather than a pass.
   --------------------------------------------------------------------------- */

import { run } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = join(root, 'test');
const files = readdirSync(testDir)
  .filter((name) => name.endsWith('.mjs'))
  .sort()
  .map((name) => join(testDir, name));

const counts = { pass: 0, fail: 0 };
const failed = [];

const stream = run({ files, concurrency: 1 });

for await (const event of stream) {
  if (event.type === 'test:pass') counts.pass += 1;
  if (event.type === 'test:fail') {
    counts.fail += 1;
    failed.push(event.data?.name ?? '(unnamed)');
  }
}

const total = counts.pass + counts.fail;

if (total === 0) {
  console.error('No tests ran. A counter that reports zero and exits 0 is worse than no counter.');
  process.exit(1);
}

if (counts.fail > 0) {
  console.error(`${counts.fail} of ${total} tests failed:`);
  for (const name of failed) console.error(`  ${name}`);
  process.exit(1);
}

/* The README quotes the figure in more than one place, and every occurrence
   of the shape is read, so a number updated in the summary and forgotten in
   the body is a failure rather than a half-truth. The phrase has to sit on
   one line: a figure split across a line break is not a wrong number, it is
   an invisible one, and this check would report zero occurrences rather than
   a disagreement. */
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const quoted = [...readme.matchAll(/(\d+) tests\b/g)].map((m) => Number(m[1]));

if (quoted.length < 2) {
  console.error(`The README states the test count ${quoted.length} time(s). It should state it at least twice.`);
  process.exit(1);
}

const wrong = quoted.filter((n) => n !== total);
if (wrong.length > 0) {
  console.error(`${total} tests ran. The README says ${[...new Set(quoted)].join(' and ')}.`);
  process.exit(1);
}

console.log(`${total} tests ran across ${files.length} files, all passing, and the README agrees.`);
