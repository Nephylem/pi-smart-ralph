#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const extensionPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
const source = readFileSync(extensionPath, 'utf8');

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function countMatches(pattern) {
  return [...source.matchAll(pattern)].length;
}

assert(
  /pi\.registerCommand\(\s*["']ralph-start["']/.test(source),
  'ralph-start must be registered as a Pi command.',
);

assert(
  /pi\.registerCommand\(\s*["']ralph-new["']/.test(source),
  'ralph-new must be registered as a Pi command.',
);

assert(
  /ralph-start[\s\S]*?runStartCommand\(\s*pi\s*,\s*args\s*,\s*ctx\s*,\s*\{\s*command:\s*["']ralph-start["']\s*\}/.test(source),
  'ralph-start must call the shared start runner with invocation metadata.',
);

assert(
  /ralph-new[\s\S]*?runStartCommand\(\s*pi\s*,\s*args\s*,\s*ctx\s*,\s*\{\s*command:\s*["']ralph-new["']\s*,\s*aliasOf:\s*["']ralph-start["']\s*\}/.test(source),
  'ralph-new must call the same shared start runner with alias invocation metadata.',
);

assert(
  countMatches(/function\s+parseStartArgs\s*\(/g) === 1,
  'start option parsing must remain in one canonical parseStartArgs function.',
);

assert(
  countMatches(/parseNewArgs|parseRalphNewArgs|function\s+[^\n(]*New[^\n(]*Args\s*\(/g) === 0,
  'ralph-new must not introduce duplicated start option parsing.',
);

if (failures.length > 0) {
  console.error('START_FLOW_PARITY_RED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('START_FLOW_PARITY_OK');
