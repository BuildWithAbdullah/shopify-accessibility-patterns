/* ---------------------------------------------------------------------------
   tracked.mjs

   The files a fresh clone contains, which is not the same as the files this
   directory contains.

   A verifier that counts text files and does not read .gitignore prints a
   figure that moves depending on whether anybody has run npm install. On a
   sibling repository that made a fresh clone report four fewer assertions
   than the README claimed, which is the worst kind of wrong number: it is
   right on the machine of the person who wrote it.

   This repository has no dependencies, so there is no node_modules to count
   today. That is exactly why it is worth having: the day somebody adds one,
   the figure beside the command in the README would start depending on who
   ran it, and nothing would say so.
   --------------------------------------------------------------------------- */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ALWAYS_IGNORED = ['.git'];

export function ignoreRules(root) {
  const path = join(root, '.gitignore');
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
  const patterns = lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
    .map((l) => l.replace(/\/$/, ''));
  return [...ALWAYS_IGNORED, ...patterns];
}

function ignored(relativePath, patterns) {
  const segments = relativePath.split(sep);
  return patterns.some((pattern) => {
    if (pattern.includes('/')) return relativePath === pattern || relativePath.startsWith(`${pattern}/`);
    return segments.includes(pattern);
  });
}

export function trackedFiles(root) {
  const patterns = ignoreRules(root);
  const out = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const rel = relative(root, full);
      if (ignored(rel, patterns)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };

  walk(root);
  return out;
}

export function trackedTextFiles(root, extensions = ['md', 'mjs', 'js', 'html', 'yml', 'json']) {
  const pattern = new RegExp(`\\.(${extensions.join('|')})$`);
  return trackedFiles(root).filter((p) => pattern.test(p));
}
