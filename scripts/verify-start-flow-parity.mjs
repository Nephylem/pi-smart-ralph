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

const optionParitySmokeCases = [
  {
    label: '<spec-name> [goal]',
    ac12Token: '<spec-name> [goal]',
    snapshotFields: ['reference', 'goalProvided'],
    parserPatterns: [/positionals\.push\(token\)/, /goal\s*=\s*positionals\.slice\(1\)\.join\(["'] ["']\)\.trim\(\)/],
  },
  {
    label: '--skip-research',
    ac12Token: '--skip-research',
    snapshotFields: ['skipResearch'],
    parserPatterns: [/token\s*===\s*["']--skip-research["']/, /skipResearch\s*=\s*true/],
  },
  {
    label: '--specs-dir <path>',
    ac12Token: '--specs-dir',
    snapshotFields: ['specsDir'],
    parserPatterns: [/token\s*===\s*["']--specs-dir["']/, /token\.startsWith\(["']--specs-dir=["']\)/],
  },
  {
    label: '--tasks-size fine|coarse',
    ac12Token: '--tasks-size',
    snapshotFields: ['tasksSize'],
    parserPatterns: [/token\s*===\s*["']--tasks-size["']/, /value\s*===\s*["']fine["']\s*\|\|\s*value\s*===\s*["']coarse["']/],
  },
  {
    label: '--commit-spec',
    ac12Token: '--commit-spec',
    snapshotFields: ['commitSpec'],
    parserPatterns: [/token\s*===\s*["']--commit-spec["']/, /commitSpec\s*=\s*true/],
  },
  {
    label: '--no-commit-spec',
    ac12Token: '--no-commit-spec',
    snapshotFields: ['commitSpec'],
    parserPatterns: [/token\s*===\s*["']--no-commit-spec["']/, /commitSpec\s*=\s*false/],
  },
  {
    label: '--quick',
    snapshotFields: ['quickMode'],
    parserPatterns: [/token\s*===\s*["']--quick["']/, /quickMode\s*=\s*true/],
  },
  {
    label: '--autonomous/--auto',
    snapshotFields: ['autonomousMode'],
    parserPatterns: [/token\s*===\s*["']--autonomous["']\s*\|\|\s*token\s*===\s*["']--auto["']/, /autonomousMode\s*=\s*true/],
  },
  {
    label: '--next-epic-spec/--epic-next',
    snapshotFields: ['nextEpicSpec'],
    parserPatterns: [/token\s*===\s*["']--next-epic-spec["']\s*\|\|\s*token\s*===\s*["']--epic-next["']/, /nextEpicSpec\s*=\s*true/],
  },
];

const ac12RequiredTokens = ['<spec-name> [goal]', '--skip-research', '--specs-dir', '--tasks-size', '--commit-spec', '--no-commit-spec'];
const optionSnapshotFields = [...new Set(optionParitySmokeCases.flatMap((smokeCase) => smokeCase.snapshotFields))];

assert(
  /type\s+StartOptionsSnapshot\s*=\s*\{[\s\S]*?\}/.test(source),
  'StartOptionsSnapshot must define the shared start/new option state shape.',
);

for (const token of ac12RequiredTokens) {
  assert(
    optionParitySmokeCases.some((smokeCase) => smokeCase.ac12Token === token),
    `Option parity smoke table must include AC-1.2 case ${token}.`,
  );
}

for (const smokeCase of optionParitySmokeCases) {
  for (const field of smokeCase.snapshotFields) {
    assert(
      new RegExp(`type\\s+StartOptionsSnapshot\\s*=\\s*\\{[\\s\\S]*?${field}\\??:`).test(source),
      `StartOptionsSnapshot must include ${field} for ${smokeCase.label} parity.`,
    );
    assert(
      new RegExp(`${field}:\\s*parsed\\.${field === 'goalProvided' ? 'goal\\.trim\\(\\)\\.length > 0' : field}`).test(source),
      `buildStartOptionsSnapshot must derive ${field} for ${smokeCase.label} from canonical parsed args.`,
    );
  }
  for (const pattern of smokeCase.parserPatterns) {
    assert(pattern.test(source), `parseStartArgs must support ${smokeCase.label} through the canonical parser.`);
  }
}

assert(
  optionSnapshotFields.length === 9,
  'Option parity smoke table must cover all shared StartOptionsSnapshot fields without ad hoc field checks.',
);

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

const phaseParitySmokeCases = [
  {
    command: 'ralph-start',
    args: 'phase-default Start with research',
    skipResearch: false,
    expectedPhase: 'research',
  },
  {
    command: 'ralph-new',
    args: 'phase-default-new Start with research',
    skipResearch: false,
    expectedPhase: 'research',
  },
  {
    command: 'ralph-start',
    args: 'phase-skip --skip-research Start with requirements',
    skipResearch: true,
    expectedPhase: 'requirements',
  },
  {
    command: 'ralph-new',
    args: 'phase-skip-new --skip-research Start with requirements',
    skipResearch: true,
    expectedPhase: 'requirements',
  },
];

function formatPhaseSmokeDiagnostic(smokeCase, reason) {
  return `Phase parity smoke failed for command=${smokeCase.command} args=${JSON.stringify(smokeCase.args)} expectedPhase=${smokeCase.expectedPhase}: ${reason}`;
}

function matchingPhaseSmokeCase(commandName, skipResearch, expectedPhase) {
  return phaseParitySmokeCases.find(
    (smokeCase) =>
      smokeCase.command === commandName &&
      smokeCase.skipResearch === skipResearch &&
      smokeCase.expectedPhase === expectedPhase,
  );
}

const phaseSmokeSummary = phaseParitySmokeCases
  .map((smokeCase) => `${smokeCase.command} ${JSON.stringify(smokeCase.args)} -> ${smokeCase.expectedPhase}`)
  .join('; ');

for (const commandName of ['ralph-start', 'ralph-new']) {
  for (const skipResearch of [false, true]) {
    const expectedPhase = skipResearch ? 'requirements' : 'research';
    const expectedCase = {
      command: commandName,
      args: skipResearch ? 'phase-skip --skip-research Start with requirements' : 'phase-default Start with research',
      expectedPhase,
    };
    assert(
      Boolean(matchingPhaseSmokeCase(commandName, skipResearch, expectedPhase)),
      formatPhaseSmokeDiagnostic(expectedCase, `missing table case for skipResearch=${skipResearch}`),
    );
  }
}

for (const smokeCase of phaseParitySmokeCases) {
  assert(
    typeof smokeCase.args === 'string' && smokeCase.args.length > 0,
    formatPhaseSmokeDiagnostic(smokeCase, 'args must be a non-empty deterministic fixture string'),
  );
}

assert(
  /function\s+determineStartPhase\([\s\S]*?if\s*\(isNew\)\s*return\s+parsed\.skipResearch\s*\?\s*["']requirements["']\s*:\s*["']research["']/.test(source),
  `Phase parity resolver must support deterministic smoke cases (${phaseSmokeSummary}).`,
);

assert(
  /const\s+phase\s*=\s*determineStartPhase\(\s*spec\s*,\s*stateRead\.state\s*,\s*parsed\s*,\s*resolved\.target\.isNew\s*\)[\s\S]*?startStatePatch\(\s*spec\s*,\s*parsed\s*,\s*phase\s*,\s*stateRead\.state\s*\)/.test(source),
  `Phase parity state patch must receive the resolved phase for smoke cases (${phaseSmokeSummary}).`,
);

assert(
  /startCompatibility\s*:\s*\{[\s\S]*?command:\s*invocation\.command[\s\S]*?aliasOf:\s*invocation\.aliasOf[\s\S]*?statePatch:\s*\{[\s\S]*?phase\s*,/.test(source),
  `Phase parity diagnostics require startCompatibility.statePatch.phase for smoke cases (${phaseSmokeSummary}).`,
);

if (failures.length > 0) {
  console.error('START_FLOW_PARITY_RED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (!quietForPackJson) console.log('START_FLOW_PARITY_OK');
