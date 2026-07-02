#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const extensionPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
const source = readFileSync(extensionPath, 'utf8');
const quietForPackJson = process.env.npm_command === 'pack';

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function countMatches(pattern) {
  return [...source.matchAll(pattern)].length;
}

assert(
  /type\s+StartCommandName\s*=\s*["']ralph-start["']\s*\|\s*["']ralph-new["']/.test(source),
  'StartCommandName must normalize supported start/new command names.',
);

assert(
  /type\s+StartInvocation\s*=\s*\{[\s\S]*?command:\s*StartCommandName;[\s\S]*?aliasOf\?:\s*["']ralph-start["'];[\s\S]*?\}/.test(source),
  'StartInvocation must provide focused shared invocation metadata.',
);

assert(
  /const\s+RALPH_START_INVOCATION:\s*StartInvocation\s*=\s*\{\s*command:\s*["']ralph-start["']\s*\}/.test(source),
  'ralph-start invocation metadata must be defined once.',
);

assert(
  /const\s+RALPH_NEW_INVOCATION:\s*StartInvocation\s*=\s*\{\s*command:\s*["']ralph-new["']\s*,\s*aliasOf:\s*["']ralph-start["']\s*\}/.test(source),
  'ralph-new alias invocation metadata must be defined once.',
);

assert(
  /pi\.registerCommand\(\s*["']ralph-start["']/.test(source),
  'ralph-start must be registered as a Pi command.',
);

assert(
  /pi\.registerCommand\(\s*["']ralph-new["']/.test(source),
  'ralph-new must be registered as a Pi command.',
);

assert(
  /ralph-start[\s\S]*?runStartCommand\(\s*pi\s*,\s*args\s*,\s*ctx\s*,\s*RALPH_START_INVOCATION\s*\)/.test(source),
  'ralph-start must call the shared start runner with normalized invocation metadata.',
);

assert(
  /ralph-new[\s\S]*?runStartCommand\(\s*pi\s*,\s*args\s*,\s*ctx\s*,\s*RALPH_NEW_INVOCATION\s*\)/.test(source),
  'ralph-new must call the same shared start runner with alias invocation metadata.',
);

assert(
  /runStartCommand\(\s*pi\s*,\s*["']--next-epic-spec["']\s*,\s*ctx\s*\)/.test(source),
  '--next-epic-spec call sites must remain on the shared start runner.',
);

assert(
  countMatches(/function\s+parseStartArgs\s*\(/g) === 1,
  'start option parsing must remain in one canonical parseStartArgs function.',
);

assert(
  countMatches(/parseNewArgs|parseRalphNewArgs|function\s+[^\n(]*New[^\n(]*Args\s*\(/g) === 0,
  'ralph-new must not introduce duplicated start option parsing.',
);

const optionSnapshotFields = [
  'reference',
  'goalProvided',
  'skipResearch',
  'specsDir',
  'tasksSize',
  'commitSpec',
  'quickMode',
  'autonomousMode',
  'nextEpicSpec',
];

assert(
  /type\s+StartOptionsSnapshot\s*=\s*\{[\s\S]*?\}/.test(source),
  'StartOptionsSnapshot must define the shared start/new option state shape.',
);

for (const field of optionSnapshotFields) {
  assert(
    new RegExp(`type\\s+StartOptionsSnapshot\\s*=\\s*\\{[\\s\\S]*?${field}\\??:`).test(source),
    `StartOptionsSnapshot must include ${field} for start/new parity.`,
  );
}

assert(
  /function\s+buildStartOptionsSnapshot\s*\(\s*parsed:\s*StartArguments\s*\)\s*:\s*StartOptionsSnapshot/.test(source),
  'A single buildStartOptionsSnapshot(parsed) helper must derive option snapshots from canonical parsed start args.',
);

assert(
  /buildStartOptionsSnapshot\(\s*parsed\s*\)/.test(source),
  'runStartCommand must use buildStartOptionsSnapshot(parsed) when building start/new state metadata.',
);

assert(
  /startCompatibility\s*:\s*\{[\s\S]*?command:\s*invocation\.command[\s\S]*?aliasOf:\s*invocation\.aliasOf[\s\S]*?options:\s*buildStartOptionsSnapshot\(\s*parsed\s*\)/.test(source),
  'Output state snapshots must share options and differ only by invocation command/aliasOf metadata.',
);

assert(
  !/void\s+invocation\s*;/.test(source),
  'runStartCommand must persist invocation metadata instead of discarding it.',
);

if (failures.length > 0) {
  console.error('START_FLOW_PARITY_RED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (!quietForPackJson) console.log('START_FLOW_PARITY_OK');
