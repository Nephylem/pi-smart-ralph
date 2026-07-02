#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const extensionPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
const startBranchPath = join(root, 'extensions', 'ralph-specum', 'start-branch.ts');
const source = readFileSync(extensionPath, 'utf8');
const startBranchSource = readFileSync(startBranchPath, 'utf8');
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

const branchOrderingSmokeFixture = {
  label: 'new-spec branch decision before writes',
  branchDecisionMarkerPatterns: [
    /decideStartBranchBeforeWrites\s*\(/,
    /decideStartBranchDecision\s*\(/,
    /planStartBranchDecision\s*\(/,
  ],
  recordedWritePatterns: [
    { label: 'spec directory', pattern: /mkdirSync\(resolved\.target\.spec\.absolutePath,\s*\{\s*recursive:\s*true\s*\}\)/ },
    { label: '.ralph-state.json', pattern: /mergeRalphState\(\s*spec\s*,\s*statePatch\s*,\s*options\s*\)/ },
    { label: '.progress.md', pattern: /maybeWriteInitialProgress\s*\(/ },
    { label: '.current-spec', pattern: /writeCurrentSpec\(\s*spec\s*,\s*options\s*\)/ },
  ],
};

function firstSourceIndex(patterns) {
  return patterns.reduce((earliest, pattern) => {
    const match = source.match(pattern);
    if (!match || match.index === undefined) return earliest;
    return earliest === -1 ? match.index : Math.min(earliest, match.index);
  }, -1);
}

const branchDecisionIndex = firstSourceIndex(branchOrderingSmokeFixture.branchDecisionMarkerPatterns);
assert(
  branchDecisionIndex >= 0,
  'Branch ordering smoke fixture must observe a pre-write branch decision marker for new specs.',
);

for (const recordedWrite of branchOrderingSmokeFixture.recordedWritePatterns) {
  const writeIndex = firstSourceIndex([recordedWrite.pattern]);
  assert(
    writeIndex >= 0,
    `Branch ordering smoke fixture must record attempted write to ${recordedWrite.label}.`,
  );
  assert(
    branchDecisionIndex >= 0 && writeIndex >= 0 && branchDecisionIndex < writeIndex,
    `Branch ordering smoke failed: branch decision marker must occur before ${recordedWrite.label} write for new specs.`,
  );
}

const branchPlannerBoundarySmokeFixture = {
  requiredExports: [
    'planStartBranchDecision',
    'collectStartBranchGitState',
    'planStartBranchApplication',
    'applyStartBranchApplication',
    'decideStartBranchDecision',
    'serializeBranchDecision',
  ],
  decisionFields: ['mode', 'currentBranch', 'defaultBranch', 'targetBranch', 'worktreePath', 'dirty', 'applied', 'reason'],
  destructiveGitPatterns: [/--force/, /--discard-changes/, /\breset\b/, /\bbranch\s+-D\b/, /\bworktree\s+remove\b/],
};

for (const exportName of branchPlannerBoundarySmokeFixture.requiredExports) {
  assert(
    new RegExp(`export\\s+function\\s+${exportName}\\s*\\(`).test(startBranchSource),
    `Branch helper must expose ${exportName} so planning and git application stay separately fixture-testable.`,
  );
}

assert(
  /export\s+type\s+BranchDecision\s*=\s*\{[\s\S]*?mode:\s*StartBranchMode;[\s\S]*?applied:\s*boolean;[\s\S]*?reason:\s*string;[\s\S]*?\}/.test(startBranchSource),
  'Branch helper must return the design BranchDecision object shape.',
);

for (const field of branchPlannerBoundarySmokeFixture.decisionFields) {
  assert(
    new RegExp(`export\\s+type\\s+BranchDecision\\s*=\\s*\\{[\\s\\S]*?${field}\\??:`).test(startBranchSource),
    `BranchDecision must serialize ${field} for smoke fixtures and downstream state.`,
  );
  assert(
    new RegExp(`export\\s+function\\s+serializeBranchDecision[\\s\\S]*?${field}:\\s*(?:cleanBranchName\\()?decision\\.${field}`).test(startBranchSource),
    `serializeBranchDecision must persist ${field} in stable downstream branch metadata.`,
  );
}

assert(
  /export\s+type\s+StartBranchGitRunner\s*=\s*\(args:\s*string\[\],\s*options:\s*\{\s*cwd:\s*string\s*\}\)\s*=>\s*StartBranchGitResult/.test(startBranchSource),
  'Injected git runner interface must remain small and serializable for smoke fixtures.',
);

assert(
  /export\s+type\s+StartBranchGitCommand\s*=\s*\{[\s\S]*?args:\s*string\[\];[\s\S]*?description:\s*string;[\s\S]*?\}/.test(startBranchSource),
  'Git command application must be represented as serializable command plans.',
);

const purePlannerBody = startBranchSource.match(/export\s+function\s+planStartBranchDecision[\s\S]*?\n\}/)?.[0] ?? '';
assert(
  !/spawnSync\(|defaultGitRunner|git\(/.test(purePlannerBody),
  'planStartBranchDecision must be pure and must not invoke real git operations.',
);

assert(
  /const\s+gitState\s*=\s*collectStartBranchGitState\(git,\s*cwd\)[\s\S]*?return\s+planStartBranchDecision\(/.test(startBranchSource),
  'decideStartBranchDecision must collect git state, then delegate pure planning to planStartBranchDecision.',
);

assert(
  /export\s+function\s+applyStartBranchApplication[\s\S]*?for\s*\(const\s+command\s+of\s+planStartBranchApplication\(decision\)\)[\s\S]*?git\(command\.args,\s*\{\s*cwd\s*\}\)/.test(startBranchSource),
  'Git command application must be isolated behind applyStartBranchApplication.',
);

for (const destructivePattern of branchPlannerBoundarySmokeFixture.destructiveGitPatterns) {
  assert(
    !destructivePattern.test(startBranchSource),
    `Branch helper must not plan destructive git operation matching ${destructivePattern}.`,
  );
}

const interactiveBranchChoiceSmokeFixtures = [
  {
    label: 'default-branch interactive mode',
    input: {
      isNew: true,
      specName: 'interactive-default',
      currentBranch: 'main',
      defaultBranch: 'main',
      quickMode: false,
      autonomousMode: false,
    },
    expectedModes: ['create-current-branch', 'create-worktree'],
  },
  {
    label: 'non-default-branch interactive mode',
    input: {
      isNew: true,
      specName: 'interactive-feature',
      currentBranch: 'feature/existing-work',
      defaultBranch: 'main',
      quickMode: false,
      autonomousMode: false,
    },
    expectedModes: ['stay-current', 'create-worktree'],
  },
];

function formatInteractiveChoiceDiagnostic(smokeCase, reason) {
  return `Interactive branch choice smoke failed for ${smokeCase.label}: ${reason}`;
}

assert(
  /export\s+type\s+StartBranchUiChoice\s*=\s*\{[\s\S]*?mode:\s*StartBranchMode;[\s\S]*?label:\s*string;[\s\S]*?decision:\s*BranchDecision;[\s\S]*?\}/.test(startBranchSource),
  'Interactive branch fixtures require serializable StartBranchUiChoice objects with mode, label, and decision.',
);

assert(
  /export\s+function\s+planStartBranchInteractiveChoices\s*\(\s*input:\s*StartBranchPlanInput\s*\)\s*:\s*StartBranchUiChoice\[\]/.test(startBranchSource),
  'Branch helper must expose planStartBranchInteractiveChoices(input) for injected Pi UI fixtures.',
);

const interactiveChoicePlannerBody =
  startBranchSource.match(/export\s+function\s+planStartBranchInteractiveChoices[\s\S]*?\n\}/)?.[0] ?? '';

for (const smokeCase of interactiveBranchChoiceSmokeFixtures) {
  for (const expectedMode of smokeCase.expectedModes) {
    assert(
      new RegExp(`mode:\\s*["']${expectedMode}["']`).test(interactiveChoicePlannerBody),
      formatInteractiveChoiceDiagnostic(smokeCase, `missing offered mode ${expectedMode}`),
    );
  }
}

assert(
  /export\s+const\s+START_BRANCH_CHOICE_LABELS/.test(startBranchSource),
  'Interactive branch choice labels must be centralized inside the branch helper.',
);

assert(
  /function\s+labelStartBranchChoice\s*\(\s*decision:\s*BranchDecision\s*\):\s*string[\s\S]*?START_BRANCH_CHOICE_LABELS\[decision\.mode\]\(decision\)/.test(startBranchSource),
  'Interactive branch fixtures should verify label centralization instead of exact prose labels.',
);

assert(
  /label:\s*labelStartBranchChoice\(/.test(interactiveChoicePlannerBody),
  'Interactive branch choices must derive labels through the centralized label helper.',
);

assert(
  /currentBranch\s*===\s*defaultBranch[\s\S]*?create-current-branch[\s\S]*?create-worktree/.test(interactiveChoicePlannerBody),
  formatInteractiveChoiceDiagnostic(
    interactiveBranchChoiceSmokeFixtures[0],
    'default branch must offer current-directory branch creation and worktree choices before writes',
  ),
);

assert(
  /currentBranch\s*!==\s*defaultBranch[\s\S]*?stay-current[\s\S]*?create-worktree/.test(interactiveChoicePlannerBody),
  formatInteractiveChoiceDiagnostic(
    interactiveBranchChoiceSmokeFixtures[1],
    'non-default branch must offer stay-current and worktree choices before writes',
  ),
);

const headlessBranchSafetySmokeFixtures = [
  {
    label: 'quick/default branch',
    input: {
      isNew: true,
      specName: 'quick-default',
      currentBranch: 'main',
      defaultBranch: 'main',
      quickMode: true,
      autonomousMode: false,
    },
    expectedMode: 'create-current-branch',
    expectedTargetBranch: 'ralph/quick-default',
    expectedPromptCalls: 0,
  },
  {
    label: 'autonomous/default branch',
    input: {
      isNew: true,
      specName: 'autonomous-default',
      currentBranch: 'main',
      defaultBranch: 'main',
      quickMode: false,
      autonomousMode: true,
    },
    expectedMode: 'create-current-branch',
    expectedTargetBranch: 'ralph/autonomous-default',
    expectedPromptCalls: 0,
  },
  {
    label: 'quick/non-default branch',
    input: {
      isNew: true,
      specName: 'quick-feature',
      currentBranch: 'feature/existing-work',
      defaultBranch: 'main',
      quickMode: true,
      autonomousMode: false,
    },
    expectedMode: 'stay-current',
    expectedPromptCalls: 0,
  },
];

function formatHeadlessBranchDiagnostic(smokeCase, reason) {
  return `Headless branch safety smoke failed for ${smokeCase.label}: ${reason}`;
}

for (const smokeCase of headlessBranchSafetySmokeFixtures) {
  assert(
    smokeCase.expectedPromptCalls === 0,
    formatHeadlessBranchDiagnostic(smokeCase, 'headless quick/autonomous fixtures must expect zero prompt calls'),
  );
  assert(
    smokeCase.input.quickMode || smokeCase.input.autonomousMode,
    formatHeadlessBranchDiagnostic(smokeCase, 'fixture must exercise quick or autonomous headless mode'),
  );
}

assert(
  /export\s+function\s+planStartBranchInteractiveChoices[\s\S]*?if\s*\(\s*!input\.isNew\s*\|\|\s*input\.quickMode\s*\|\|\s*input\.autonomousMode\s*\)\s*return\s*\[\]/.test(startBranchSource),
  'Headless branch safety fixtures must make zero prompt calls by bypassing interactive choice planning.',
);

assert(
  /input\.quickMode[\s\S]*?mode:\s*["']create-current-branch["'][\s\S]*?targetBranch:\s*safeTargetBranch\(input\.specName\)/.test(purePlannerBody),
  formatHeadlessBranchDiagnostic(headlessBranchSafetySmokeFixtures[0], 'quick/default branch must deterministically plan safe current-directory branch creation'),
);

assert(
  /input\.autonomousMode[\s\S]*?mode:\s*["']create-current-branch["'][\s\S]*?targetBranch:\s*safeTargetBranch\(input\.specName\)/.test(purePlannerBody),
  formatHeadlessBranchDiagnostic(headlessBranchSafetySmokeFixtures[1], 'autonomous/default branch must deterministically plan safe current-directory branch creation'),
);

assert(
  /currentBranch\s*!==\s*defaultBranch[\s\S]*?input\.quickMode[\s\S]*?mode:\s*["']stay-current["']/.test(purePlannerBody),
  formatHeadlessBranchDiagnostic(headlessBranchSafetySmokeFixtures[2], 'quick/non-default branch must deterministically stay on the current branch'),
);

const headlessGitCommandSource = startBranchSource.match(/export\s+function\s+planStartBranchApplication[\s\S]*?\n\}/)?.[0] ?? '';
for (const destructivePattern of branchPlannerBoundarySmokeFixture.destructiveGitPatterns) {
  assert(
    !destructivePattern.test(headlessGitCommandSource),
    `Headless branch safety generated git commands must not include destructive operation matching ${destructivePattern}.`,
  );
}

if (failures.length > 0) {
  console.error('START_FLOW_PARITY_RED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (!quietForPackJson) console.log('START_FLOW_PARITY_OK');
