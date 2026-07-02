#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const extensionPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
const startBranchPath = join(root, 'extensions', 'ralph-specum', 'start-branch.ts');
const gitignorePath = join(root, 'extensions', 'ralph-specum', 'gitignore.ts');
const startDiscoveryPath = join(root, 'extensions', 'ralph-specum', 'start-discovery.ts');
const source = readFileSync(extensionPath, 'utf8');
const startBranchSource = readFileSync(startBranchPath, 'utf8');
const gitignoreSource = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
const startDiscoverySource = existsSync(startDiscoveryPath) ? readFileSync(startDiscoveryPath, 'utf8') : '';
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

function stripSourceComments(text) {
  return text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const executableStartBranchSource = stripSourceComments(startBranchSource);

const safeGitCommandConstructionSmokeFixture = {
  allowedOperations: ['create-current-branch', 'use-existing-branch', 'create-worktree'],
  recordedCommandCases: [
    {
      label: 'current-directory branch creation',
      mode: 'create-current-branch',
      expectedArgs: ['switch', '-c'],
    },
    {
      label: 'worktree creation',
      mode: 'create-worktree',
      expectedArgs: ['worktree', 'add', '-b'],
    },
  ],
};

assert(
  /const\s+ALLOWED_START_GIT_OPERATIONS:\s*Record<AllowedStartGitOperation,\s*AllowedStartGitOperationSpec>/.test(startBranchSource),
  'Safe git command construction must be centralized in the branch helper allowlist.',
);

assert(
  /Destructive operations[\s\S]*?intentionally absent from this allowlist/.test(startBranchSource),
  'Branch helper source comments must explain why destructive git operations are excluded.',
);

for (const operation of safeGitCommandConstructionSmokeFixture.allowedOperations) {
  assert(
    new RegExp(`["']${operation}["']:\\s*\\{[\\s\\S]*?buildArgs:`).test(startBranchSource),
    `Safe git command allowlist must centralize operation ${operation}.`,
  );
}

for (const commandCase of safeGitCommandConstructionSmokeFixture.recordedCommandCases) {
  assert(
    new RegExp(`mode:\\s*["']${commandCase.mode}["']`).test(startBranchSource),
    `Smoke fixture command recording must cover ${commandCase.label}.`,
  );
  for (const arg of commandCase.expectedArgs) {
    assert(
      new RegExp(`["']${arg}["']`).test(startBranchSource),
      `Smoke fixture command recording for ${commandCase.label} must include git arg ${arg}.`,
    );
  }
}

assert(
  /function\s+commandForAllowedStartGitOperation\s*\([\s\S]*?ALLOWED_START_GIT_OPERATIONS\[operation\]/.test(startBranchSource),
  'planStartBranchApplication must construct commands through the centralized safe git operation allowlist.',
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
    !destructivePattern.test(executableStartBranchSource),
    `Branch helper executable command construction must not plan destructive git operation matching ${destructivePattern}.`,
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

const destructiveCommandPlanRegressionFixtures = [
  {
    label: 'default branch current-directory command plan',
    coverage: 'default branch',
    expectedMode: 'create-current-branch',
    expectedCommandPlan: ['switch', '-c', 'ralph/default-branch-regression'],
    input: {
      isNew: true,
      specName: 'default-branch-regression',
      currentBranch: 'main',
      defaultBranch: 'main',
      dirty: false,
      quickMode: true,
      autonomousMode: false,
    },
  },
  {
    label: 'non-default branch stay-current command plan',
    coverage: 'non-default branch',
    expectedMode: 'stay-current',
    expectedCommandPlan: [],
    input: {
      isNew: true,
      specName: 'non-default-regression',
      currentBranch: 'feature/existing-work',
      defaultBranch: 'main',
      dirty: false,
      quickMode: true,
      autonomousMode: false,
    },
  },
  {
    label: 'dirty worktree command plan',
    coverage: 'dirty worktree',
    expectedMode: 'create-current-branch',
    expectedCommandPlan: ['switch', '-c', 'ralph/dirty-worktree-regression'],
    input: {
      isNew: true,
      specName: 'dirty-worktree-regression',
      currentBranch: 'main',
      defaultBranch: 'main',
      dirty: true,
      quickMode: true,
      autonomousMode: false,
    },
  },
  {
    label: 'quick/autonomous headless command plan',
    coverage: 'quick/autonomous',
    expectedMode: 'create-current-branch',
    expectedCommandPlan: ['switch', '-c', 'ralph/autonomous-regression'],
    input: {
      isNew: true,
      specName: 'autonomous-regression',
      currentBranch: 'main',
      defaultBranch: 'main',
      dirty: false,
      quickMode: false,
      autonomousMode: true,
    },
  },
  {
    label: 'interactive worktree command plan',
    coverage: 'interactive',
    expectedMode: 'create-worktree',
    expectedCommandPlan: ['worktree', 'add', '-b', 'ralph/interactive-regression', '../interactive-regression-worktree'],
    input: {
      isNew: true,
      specName: 'interactive-regression',
      currentBranch: 'main',
      defaultBranch: 'main',
      dirty: false,
      quickMode: false,
      autonomousMode: false,
    },
  },
];

const requiredDestructiveRegressionCoverage = ['default branch', 'non-default branch', 'dirty worktree', 'quick/autonomous', 'interactive'];

function formatDestructiveRegressionDiagnostic(smokeCase, reason) {
  return `Destructive git command regression smoke failed for ${smokeCase.label}: ${reason}`;
}

for (const requiredCoverage of requiredDestructiveRegressionCoverage) {
  assert(
    destructiveCommandPlanRegressionFixtures.some((smokeCase) => smokeCase.coverage === requiredCoverage),
    `Destructive git command regression smoke must include AC-5.2 coverage fixture ${requiredCoverage}.`,
  );
}

for (const smokeCase of destructiveCommandPlanRegressionFixtures) {
  assert(
    Array.isArray(smokeCase.expectedCommandPlan),
    formatDestructiveRegressionDiagnostic(smokeCase, 'fixture must declare the generated branch/worktree command plan to inspect'),
  );
  assert(
    smokeCase.expectedMode === 'stay-current' || smokeCase.expectedCommandPlan.length > 0,
    formatDestructiveRegressionDiagnostic(smokeCase, 'mutating branch/worktree fixtures must expose their generated command plan'),
  );
}

assert(
  /export\s+function\s+planStartBranchDestructiveRegressionFixtures\s*\([\s\S]*?planStartBranchApplication\(/.test(startBranchSource),
  'Branch helper must expose generated branch/worktree command plans for destructive git command regression fixtures.',
);

assert(
  /default branch[\s\S]*?non-default branch[\s\S]*?dirty worktree[\s\S]*?quick\/autonomous[\s\S]*?interactive/.test(startBranchSource),
  'Generated destructive git command regression fixtures must cover default branch, non-default branch, dirty worktree, quick/autonomous, and interactive cases.',
);

const requiredRalphGitignorePatterns = [
  'specs/.current-spec',
  'specs/.current-epic',
  '**/.progress.md',
  '**/.ralph-state.json',
];

const gitignoreIdempotencySmokeFixtures = [
  {
    label: 'missing .gitignore',
    initialContent: '',
    runs: 1,
    expectedEntries: requiredRalphGitignorePatterns,
    expectedFinalNewline: true,
  },
  {
    label: 'existing .gitignore preserves unrelated entries',
    initialContent: 'node_modules/\ndist/\n',
    runs: 1,
    expectedEntries: ['node_modules/', 'dist/', ...requiredRalphGitignorePatterns],
    expectedFinalNewline: true,
  },
  {
    label: 'existing .gitignore without trailing newline is normalized before append',
    initialContent: 'node_modules/',
    runs: 1,
    expectedEntries: ['node_modules/', ...requiredRalphGitignorePatterns],
    expectedFinalNewline: true,
  },
  {
    label: 'two repeated updater runs do not duplicate Ralph entries',
    initialContent: 'node_modules/\nspecs/.current-spec\n',
    runs: 2,
    expectedEntries: ['node_modules/', ...requiredRalphGitignorePatterns],
    expectedFinalNewline: true,
  },
];

function formatGitignoreDiagnostic(smokeCase, reason, details = undefined) {
  const detailText = details ? ` (${details})` : '';
  return `Ralph gitignore idempotency smoke failed for ${smokeCase.label}: ${reason}${detailText}`;
}

function splitFixtureGitignoreEntries(content) {
  return content.split(/\r?\n/).filter((entry) => entry.length > 0);
}

function applyGitignoreFixtureRun(content) {
  const entries = new Set(splitFixtureGitignoreEntries(content));
  const missing = requiredRalphGitignorePatterns.filter((pattern) => !entries.has(pattern));
  if (missing.length === 0) return content.endsWith('\n') || content.length === 0 ? content : `${content}\n`;
  const prefix = content.length === 0 || content.endsWith('\n') ? content : `${content}\n`;
  return `${prefix}${missing.join('\n')}\n`;
}

function assertGitignoreFixtureStable(smokeCase) {
  let content = smokeCase.initialContent;
  for (let run = 0; run < smokeCase.runs; run += 1) content = applyGitignoreFixtureRun(content);
  const actualEntries = splitFixtureGitignoreEntries(content);

  assert(
    smokeCase.runs === 1 || smokeCase.runs === 2,
    formatGitignoreDiagnostic(smokeCase, 'fixture must exercise one or two updater runs'),
  );
  assert(
    actualEntries.join('\u0000') === smokeCase.expectedEntries.join('\u0000'),
    formatGitignoreDiagnostic(
      smokeCase,
      'entry order mismatch after updater run',
      `expected=${JSON.stringify(smokeCase.expectedEntries)} actual=${JSON.stringify(actualEntries)}`,
    ),
  );
  assert(
    content.endsWith('\n') === smokeCase.expectedFinalNewline,
    formatGitignoreDiagnostic(smokeCase, 'final newline normalization mismatch', `content=${JSON.stringify(content)}`),
  );

  for (const requiredPattern of requiredRalphGitignorePatterns) {
    const occurrences = actualEntries.filter((entry) => entry === requiredPattern).length;
    assert(
      occurrences === 1,
      formatGitignoreDiagnostic(smokeCase, `required pattern ${requiredPattern} occurrence count must be exactly 1`, `actual=${occurrences}`),
    );
  }

  for (const unrelatedEntry of splitFixtureGitignoreEntries(smokeCase.initialContent).filter((entry) => !requiredRalphGitignorePatterns.includes(entry))) {
    assert(
      actualEntries.indexOf(unrelatedEntry) === smokeCase.expectedEntries.indexOf(unrelatedEntry),
      formatGitignoreDiagnostic(smokeCase, `unrelated existing entry ${unrelatedEntry} must be preserved in order`),
    );
  }
}

for (const pattern of requiredRalphGitignorePatterns) {
  assert(
    gitignoreSource.includes(pattern),
    `Ralph gitignore updater must include required pattern ${pattern}.`,
  );
}

for (const smokeCase of gitignoreIdempotencySmokeFixtures) assertGitignoreFixtureStable(smokeCase);

assert(
  /export\s+const\s+REQUIRED_RALPH_GITIGNORE_PATTERNS\s*=\s*\[[\s\S]*?specs\/\.current-spec[\s\S]*?specs\/\.current-epic[\s\S]*?\*\*\/\.progress\.md[\s\S]*?\*\*\/\.ralph-state\.json[\s\S]*?\]/.test(gitignoreSource),
  'Ralph gitignore updater must centralize required ignore patterns in the required order.',
);

assert(
  /export\s+function\s+ensureRalphGitignore\s*\(/.test(gitignoreSource),
  'Ralph gitignore updater must expose ensureRalphGitignore for start/new kickoff.',
);

assert(
  /existsSync\(gitignorePath\)[\s\S]*?writeFileSync\(gitignorePath/.test(gitignoreSource),
  'Ralph gitignore updater must create a missing .gitignore with required patterns.',
);

assert(
  /function\s+findMissingRequiredPatterns[\s\S]*?new\s+Set\(splitGitignoreEntries\(content\)\)[\s\S]*?!existingEntries\.has\(pattern\)/.test(gitignoreSource),
  'Ralph gitignore updater must use exact line matching to append only missing Ralph patterns across repeated runs.',
);

assert(
  /function\s+appendMissingGitignoreEntries[\s\S]*?hasFinalNewline\(content\)[\s\S]*?formatGitignoreEntries\(missingPatterns\)/.test(gitignoreSource),
  'Ralph gitignore updater must preserve existing content/order and append missing Ralph patterns after a normalized newline.',
);

assert(
  /missingPatterns\.length\s*>\s*0[\s\S]*?appendMissingGitignoreEntries\(existing,\s*missingPatterns\)[\s\S]*?hasFinalNewline\(existing\)[\s\S]*?`\$\{existing\}\\n`/.test(gitignoreSource),
  'Ralph gitignore updater must normalize the final newline even when no Ralph patterns are missing.',
);

const relatedSpecDiscoverySmokeFixtures = [
  {
    label: 'metadata relationship match from existing spec artifact',
    currentSpecName: 'start-and-new-flow-parity',
    currentGoal: 'match original start and new kickoff flow parity',
    existingState: { relatedSpecs: [] },
    candidates: [
      {
        name: 'implementation-recovery-loop-parity',
        artifact: 'requirements.md',
        frontmatter: { epic: 'smart-ralph-parity-audit', contracts: ['StartCompatibilityContractV1'] },
        text: 'Consumes StartCompatibilityContractV1 and resumes implementation from normalized start state fields.',
      },
    ],
    expectedNames: ['implementation-recovery-loop-parity'],
    expectedEvidenceIncludes: ['StartCompatibilityContractV1', 'requirements.md'],
  },
  {
    label: 'keyword match from existing spec artifacts',
    currentSpecName: 'start-and-new-flow-parity',
    currentGoal: 'branch safety and related spec discovery for start command',
    existingState: { relatedSpecs: [] },
    candidates: [
      {
        name: 'triage-github-sync-parity',
        artifact: 'plan.md',
        frontmatter: { epic: 'smart-ralph-parity-audit' },
        text: 'Shares branch/worktree safety behavior and active epic start command context.',
      },
    ],
    expectedNames: ['triage-github-sync-parity'],
    expectedEvidenceIncludes: ['branch', 'plan.md'],
  },
  {
    label: 'resume merge preserves existing relatedSpecs by name',
    currentSpecName: 'start-and-new-flow-parity',
    currentGoal: 'preserve manually curated related specs while merging scanner updates',
    existingState: {
      relatedSpecs: [
        {
          name: 'implementation-recovery-loop-parity',
          relevance: 'High',
          mayNeedUpdate: false,
          evidence: 'Manual downstream consumer note must be preserved on resume.',
        },
        {
          name: 'packaged-resource-parity',
          relationship: 'producer',
          mayNeedUpdate: false,
          evidence: 'Existing producer dependency remains relevant.',
        },
      ],
    },
    candidates: [
      {
        name: 'implementation-recovery-loop-parity',
        artifact: 'design.md',
        frontmatter: { contracts: ['StartCompatibilityContractV1'] },
        text: 'New scan evidence should merge into the existing entry instead of duplicating the spec name.',
      },
      {
        name: 'indexing-command-parity',
        artifact: 'research.md',
        frontmatter: { contracts: ['IndexArtifactContractV1'] },
        text: 'Index artifacts can provide related spec discovery hints for start.',
      },
    ],
    expectedNames: ['implementation-recovery-loop-parity', 'packaged-resource-parity', 'indexing-command-parity'],
    expectedEvidenceIncludes: ['Manual downstream consumer note', 'design.md'],
  },
];

function formatRelatedSpecDiscoveryDiagnostic(smokeCase, reason) {
  return `Related spec discovery smoke failed for ${smokeCase.label}: ${reason}`;
}

function assertRelatedSpecEntryShape(smokeCase, entry) {
  assert(typeof entry.name === 'string' && entry.name.length > 0, formatRelatedSpecDiscoveryDiagnostic(smokeCase, 'entry must include name'));
  assert(
    typeof entry.relevance === 'string' || typeof entry.relationship === 'string',
    formatRelatedSpecDiscoveryDiagnostic(smokeCase, `entry ${entry.name ?? '<unknown>'} must include relevance or relationship`),
  );
  assert(
    typeof entry.mayNeedUpdate === 'boolean',
    formatRelatedSpecDiscoveryDiagnostic(smokeCase, `entry ${entry.name ?? '<unknown>'} must include mayNeedUpdate boolean`),
  );
  assert(
    typeof entry.evidence === 'string' && entry.evidence.length > 0,
    formatRelatedSpecDiscoveryDiagnostic(smokeCase, `entry ${entry.name ?? '<unknown>'} must include evidence text`),
  );
}

for (const smokeCase of relatedSpecDiscoverySmokeFixtures) {
  assert(smokeCase.candidates.length > 0, formatRelatedSpecDiscoveryDiagnostic(smokeCase, 'fixture must include existing spec artifacts to scan'));
  assert(smokeCase.expectedNames.length > 0, formatRelatedSpecDiscoveryDiagnostic(smokeCase, 'fixture must expect at least one discovered or preserved related spec'));
  for (const existingEntry of smokeCase.existingState.relatedSpecs) assertRelatedSpecEntryShape(smokeCase, existingEntry);
}

assert(
  startDiscoverySource.length > 0,
  'Start discovery helper must exist at extensions/ralph-specum/start-discovery.ts for related spec scanning.',
);

assert(
  /export\s+type\s+RelatedSpecDiscovery\s*=\s*\{[\s\S]*?name:\s*string[\s\S]*?(?:relevance|relationship)[\s\S]*?mayNeedUpdate:\s*boolean[\s\S]*?evidence:\s*string/.test(startDiscoverySource),
  'RelatedSpecDiscovery must include name, relevance or relationship, mayNeedUpdate, and evidence text.',
);

assert(
  /export\s+type\s+RelatedSpecDiscoveryWarning\s*=\s*\{[\s\S]*?candidatePath:\s*string[\s\S]*?reason:\s*string/.test(startDiscoverySource),
  'Related spec discovery must expose warning metadata for skipped unreadable candidates.',
);

assert(
  /const\s+DEFAULT_RELATED_SPEC_LIMIT\s*=\s*5/.test(startDiscoverySource),
  'Related spec discovery must centralize the design result limit of 5.',
);

assert(
  /export\s+function\s+discoverRelatedSpecs\s*\(/.test(startDiscoverySource),
  'Start discovery helper must expose discoverRelatedSpecs for keyword and metadata scanning of existing spec artifacts.',
);

assert(
  /export\s+function\s+mergeRelatedSpecsByName\s*\(/.test(startDiscoverySource),
  'Start discovery helper must expose mergeRelatedSpecsByName to preserve and merge resume state by spec name.',
);

assert(
  /frontmatter|metadata|contracts|epic/.test(startDiscoverySource),
  'Related spec discovery must inspect metadata/frontmatter relationships from existing spec artifacts.',
);

assert(
  /keyword|token|score|goal/i.test(startDiscoverySource),
  'Related spec discovery must inspect keyword matches from current goal and existing spec artifacts.',
);

assert(
  /function\s+scoreRelatedArtifact\s*\([\s\S]*?function\s+buildRelatedSpecEvidence\s*\(/.test(startDiscoverySource),
  'Related spec discovery must centralize relevance scoring and evidence string construction.',
);

assert(
  /function\s+compareScoredDiscoveries\s*\([\s\S]*?b\.score\s*-\s*a\.score[\s\S]*?localeCompare[\s\S]*?candidateOrder/.test(startDiscoverySource),
  'Related spec discovery must preserve deterministic ordering by score, name, and candidate order.',
);

assert(
  /function\s+limitRelatedSpecs[\s\S]*?slice\(0,\s*Math\.max\(0,\s*limit\)\)/.test(startDiscoverySource),
  'Related spec discovery must cap discovered and merged results through one deterministic limit helper.',
);

assert(
  /readCandidateText[\s\S]*?recordDiscoveryWarning\(warnings,\s*path[\s\S]*?return\s+null/.test(startDiscoverySource),
  'Related spec discovery must skip unreadable candidates with warning metadata instead of failing kickoff.',
);

assert(
  /catch\s*\(error\)\s*\{[\s\S]*?recordDiscoveryWarning\(options\.warnings,\s*indexDir[\s\S]*?\}/.test(startDiscoverySource),
  'Related spec discovery must record warning metadata for unreadable index hint directories.',
);

assert(
  /new\s+Map<\s*string[\s\S]*?\.name[\s\S]*?set\(/.test(startDiscoverySource),
  'Related spec merge behavior must de-duplicate and merge entries by name on resume.',
);

assert(
  /function\s+mergeDiscoveriesByName\s*<\s*T\s+extends\s+NamedDiscoveryEntry\s*>[\s\S]*?new\s+Map<\s*string\s*,\s*T\s*>[\s\S]*?options\.normalizeExisting[\s\S]*?options\.merge/.test(startDiscoverySource),
  'Discovery merge-by-name behavior must be shared by related specs and discovered skills through one generic helper.',
);

assert(
  /Resume preservation is explicit[\s\S]*?existing state is normalized first[\s\S]*?same-name discoveries enrich it/.test(startDiscoverySource),
  'Discovery merge helper must document explicit resume state preservation rules.',
);

assert(
  /mergeRelatedSpecsByName[\s\S]*?mergeDiscoveriesByName\([\s\S]*?normalizeExistingRelatedSpec[\s\S]*?mergeRelatedSpec/.test(startDiscoverySource),
  'Related spec merging must delegate to the shared merge-by-name helper while preserving related-spec-specific fields.',
);

assert(
  /discoverRelatedSpecs\([\s\S]*?relatedSpecs[\s\S]*?mergeRelatedSpecsByName/.test(source),
  'runStartCommand must merge discovered related specs with existing relatedSpecs before writing start state.',
);

const skillDiscoverySmokeFixtures = [
  {
    label: 'packaged skill metadata matches start goal without execution',
    currentGoal: 'improve branch safety and discovery for start command parity',
    existingState: { discoveredSkills: [] },
    skills: [
      {
        name: 'clean-architecture',
        path: '/packaged/skills/clean-architecture/SKILL.md',
        frontmatter: { name: 'clean-architecture' },
        description: 'Structure software around dependency boundaries, ports, adapters, and safety-focused architecture.',
        executableBody: 'throw new Error("SKILL_CODE_EXECUTED")',
      },
    ],
    expectedNames: ['clean-architecture'],
    expectedReasonIncludes: ['branch', 'safety'],
  },
  {
    label: 'project skill metadata matches spec goal and preserves path',
    currentGoal: 'build FastAPI async API kickoff context',
    existingState: { discoveredSkills: [] },
    skills: [
      {
        name: 'fastapi-python',
        path: '/project/.ralph/skills/fastapi-python/SKILL.md',
        frontmatter: { name: 'fastapi-python', description: 'Expert in FastAPI Python development with async API patterns' },
        description: 'Use when building FastAPI Python APIs and async operations.',
        executableBody: 'process.exit(99)',
      },
    ],
    expectedNames: ['fastapi-python'],
    expectedReasonIncludes: ['FastAPI', 'async'],
  },
  {
    label: 'resume merge preserves existing discoveredSkills by name',
    currentGoal: 'preserve curated skills while scanning metadata',
    existingState: {
      discoveredSkills: [
        {
          name: 'frontend-design',
          path: '/existing/skills/frontend-design/SKILL.md',
          relevance: 'High',
          reason: 'Manual kickoff curation must be preserved on resume.',
        },
        {
          name: 'python-patterns',
          path: '/existing/skills/python-patterns/SKILL.md',
          relevance: 'Medium',
          reason: 'Existing project skill remains useful.',
        },
      ],
    },
    skills: [
      {
        name: 'frontend-design',
        path: '/project/skills/frontend-design/SKILL.md',
        frontmatter: { name: 'frontend-design' },
        description: 'Create distinctive production-grade frontend interfaces.',
        executableBody: 'globalThis.__skillExecuted = true',
      },
      {
        name: 'software-design-philosophy',
        path: '/packaged/skills/software-design-philosophy/SKILL.md',
        frontmatter: { name: 'software-design-philosophy' },
        description: 'Manage software complexity through deep modules and information hiding.',
        executableBody: 'require("node:fs").rmSync("/tmp/should-not-run", { recursive: true })',
      },
    ],
    expectedNames: ['frontend-design', 'python-patterns', 'software-design-philosophy'],
    expectedReasonIncludes: ['Manual kickoff curation', 'complexity'],
  },
];

function formatSkillDiscoveryDiagnostic(smokeCase, reason) {
  return `Skill discovery smoke failed for ${smokeCase.label}: ${reason}`;
}

function assertSkillDiscoveryEntryShape(smokeCase, entry) {
  assert(typeof entry.name === 'string' && entry.name.length > 0, formatSkillDiscoveryDiagnostic(smokeCase, 'entry must include name'));
  assert(typeof entry.path === 'string' && entry.path.endsWith('SKILL.md'), formatSkillDiscoveryDiagnostic(smokeCase, `entry ${entry.name ?? '<unknown>'} must include SKILL.md path`));
  assert(
    entry.relevance === 'High' || entry.relevance === 'Medium' || entry.relevance === 'Low',
    formatSkillDiscoveryDiagnostic(smokeCase, `entry ${entry.name ?? '<unknown>'} must include High/Medium/Low relevance`),
  );
  assert(
    typeof entry.reason === 'string' && entry.reason.length > 0,
    formatSkillDiscoveryDiagnostic(smokeCase, `entry ${entry.name ?? '<unknown>'} must include reason text`),
  );
}

for (const smokeCase of skillDiscoverySmokeFixtures) {
  assert(smokeCase.skills.length > 0, formatSkillDiscoveryDiagnostic(smokeCase, 'fixture must include packaged/project SKILL.md metadata to scan'));
  assert(smokeCase.expectedNames.length > 0, formatSkillDiscoveryDiagnostic(smokeCase, 'fixture must expect at least one discovered or preserved skill'));
  for (const skill of smokeCase.skills) {
    assert(skill.path.endsWith('SKILL.md'), formatSkillDiscoveryDiagnostic(smokeCase, `fixture skill ${skill.name} must use a SKILL.md path`));
    assert(
      typeof skill.description === 'string' || typeof skill.frontmatter?.description === 'string',
      formatSkillDiscoveryDiagnostic(smokeCase, `fixture skill ${skill.name} must provide metadata description text`),
    );
    assert(
      /throw|process\.exit|rmSync|__skillExecuted/.test(skill.executableBody),
      formatSkillDiscoveryDiagnostic(smokeCase, `fixture skill ${skill.name} must contain executable body that would be unsafe if evaluated`),
    );
  }
  for (const existingEntry of smokeCase.existingState.discoveredSkills) assertSkillDiscoveryEntryShape(smokeCase, existingEntry);
}

assert(
  /export\s+type\s+DiscoveredSkill\s*=\s*\{[\s\S]*?name:\s*string[\s\S]*?path:\s*string[\s\S]*?relevance:\s*["']High["']\s*\|\s*["']Medium["']\s*\|\s*["']Low["'][\s\S]*?reason:\s*string/.test(startDiscoverySource),
  'DiscoveredSkill must include name, path, High/Medium/Low relevance, and reason text.',
);

assert(
  /export\s+function\s+discoverSkills\s*\(/.test(startDiscoverySource),
  'Start discovery helper must expose discoverSkills for read-only packaged/project SKILL.md metadata scanning.',
);

assert(
  /export\s+function\s+mergeDiscoveredSkillsByName\s*\(/.test(startDiscoverySource),
  'Start discovery helper must expose mergeDiscoveredSkillsByName to preserve and merge discoveredSkills by skill name on resume.',
);

assert(
  /SKILL\.md[\s\S]*?(frontmatter|metadata|description)/.test(startDiscoverySource),
  'Skill discovery must read SKILL.md metadata/frontmatter/description text instead of relying on executable skill code.',
);

assert(
  /discoverSkills[\s\S]*?readFileSync[\s\S]*?!\s*(?:import|eval|Function)\s*\(/.test(startDiscoverySource) || (/discoverSkills[\s\S]*?readFileSync/.test(startDiscoverySource) && !/\b(?:eval|Function)\s*\(|\bimport\s*\(/.test(startDiscoverySource)),
  'Skill discovery must be non-destructive metadata scanning only: read SKILL.md text and do not eval/import/execute skills.',
);

assert(
  /new\s+Map<\s*string[\s\S]*?discoveredSkills[\s\S]*?\.name[\s\S]*?set\(/.test(startDiscoverySource),
  'Discovered skill merge behavior must de-duplicate and preserve entries by name on resume.',
);

assert(
  /mergeDiscoveredSkillsByName[\s\S]*?mergeDiscoveriesByName\([\s\S]*?normalizeExistingSkill[\s\S]*?mergeDiscoveredSkill/.test(startDiscoverySource),
  'Discovered skill merging must delegate to the shared merge-by-name helper while preserving skill-specific fields.',
);

assert(
  /readCandidateText[\s\S]*?catch\s*\(error\)[\s\S]*?recordDiscoveryWarning[\s\S]*?return\s+null/.test(startDiscoverySource) && /discoverSkills[\s\S]*?readSkillMetadata\([\s\S]*?options\.warnings/.test(startDiscoverySource),
  'Discovery warnings must remain non-blocking for kickoff across related spec and skill scans.',
);

assert(
  /discoverSkills\([\s\S]*?discoveredSkills[\s\S]*?mergeDiscoveredSkillsByName/.test(source),
  'runStartCommand must merge discovered skills with existing discoveredSkills before writing start state.',
);

const startCompatibilityContractFields = [
  'command',
  'aliasOf',
  'options',
  'branchDecision',
  'specRoot',
  'statePatch',
];

assert(
  /type\s+StartCompatibilityContractV1\s*=\s*\{[\s\S]*?command:\s*StartCommandName[\s\S]*?aliasOf\?:\s*["']ralph-start["'][\s\S]*?options:\s*StartOptionsSnapshot[\s\S]*?branchDecision:\s*BranchDecision[\s\S]*?specRoot:[\s\S]*?statePatch:\s*Record<\s*string\s*,\s*unknown\s*>[\s\S]*?\}/.test(source),
  'StartCompatibilityContractV1 must define command, optional aliasOf, options, branchDecision, specRoot, and statePatch fields.',
);

for (const field of startCompatibilityContractFields) {
  assert(
    new RegExp(`startCompatibility:\\s*\\{[\\s\\S]*?${field}:`).test(source) || (field === 'aliasOf' && /\.\.\.\(invocation\.aliasOf\s*\?\s*\{\s*aliasOf:\s*invocation\.aliasOf\s*\}/.test(source)),
    `startCompatibility state metadata must include ${field}.`,
  );
}

assert(
  /RALPH_NEW_INVOCATION:\s*StartInvocation\s*=\s*\{\s*command:\s*["']ralph-new["']\s*,\s*aliasOf:\s*["']ralph-start["']\s*\}/.test(source),
  '/ralph-new must record aliasOf: "ralph-start" in start compatibility metadata.',
);

assert(
  /RALPH_START_INVOCATION:\s*StartInvocation\s*=\s*\{\s*command:\s*["']ralph-start["']\s*\}/.test(source) && !/RALPH_START_INVOCATION[\s\S]*?aliasOf/.test(source.slice(source.indexOf('const RALPH_START_INVOCATION'), source.indexOf('const RALPH_NEW_INVOCATION'))),
  '/ralph-start invocation metadata must not record aliasOf.',
);

assert(
  /startCompatibility:\s*\{[\s\S]*?\.\.\.\(invocation\.aliasOf\s*\?\s*\{\s*aliasOf:\s*invocation\.aliasOf\s*\}\s*:\s*\{\s*\}\)[\s\S]*?options:\s*buildStartOptionsSnapshot\(\s*parsed\s*\)[\s\S]*?branchDecision[\s\S]*?specRoot[\s\S]*?statePatch:/ .test(source),
  'Start compatibility metadata must omit aliasOf for /ralph-start while preserving it for /ralph-new.',
);

assert(
  /statePatch:\s*\{[\s\S]*?commitSpec:\s*statePatch\.commitSpec[\s\S]*?relatedSpecs:\s*statePatch\.relatedSpecs[\s\S]*?discoveredSkills:\s*statePatch\.discoveredSkills[\s\S]*?\}/.test(source),
  'Start compatibility statePatch must preserve commitSpec, relatedSpecs, and discoveredSkills behavior for downstream consumers.',
);

assert(
  /type\s+StartSummaryMetadata\s*=\s*\{[\s\S]*?branchDecision:[\s\S]*?discoveryCounts:[\s\S]*?relatedSpecs:\s*number[\s\S]*?discoveredSkills:\s*number[\s\S]*?\}/.test(source),
  'Start summary metadata must have a display-only shape for branch decision and discovery counts.',
);

assert(
  /function\s+buildStartSummaryMetadata\s*\(\s*branchDecision:\s*BranchDecision\s*,\s*statePatch:\s*Record<\s*string\s*,\s*unknown\s*>\s*,?\s*\)\s*:\s*StartSummaryMetadata/.test(source),
  'Start summary metadata must be built separately from StartCompatibilityContractV1 construction.',
);

assert(
  /const\s+startSummaryMetadata\s*=\s*buildStartSummaryMetadata\(\s*branchDecision\s*,\s*statePatch\s*\)[\s\S]*?startCompatibility:\s*\{/.test(source),
  'runStartCommand must derive summary metadata before contract construction without using startCompatibility as display input.',
);

assert(
  /formatStartSummary\([\s\S]*?summaryMetadata:\s*StartSummaryMetadata[\s\S]*?`Branch decision:\s*\$\{formatBranchSummary\(summaryMetadata\)\}`[\s\S]*?`Discovery:\s*\$\{summaryMetadata\.discoveryCounts\.relatedSpecs\}\s*related spec\(s\),\s*\$\{summaryMetadata\.discoveryCounts\.discoveredSkills\}\s*skill\(s\)`/.test(source),
  'Start summary must include branch decision and discovery counts through display metadata.',
);

const formatStartSummaryBody = source.slice(source.indexOf('function formatStartSummary'), source.indexOf('function readActiveEpicForStart'));
assert(
  !/startCompatibility/.test(formatStartSummaryBody),
  'formatStartSummary must not read StartCompatibilityContractV1 state metadata for display formatting.',
);

assert(
  /formatStartSummary\(pointer\.spec,\s*resolved\.target\.isNew,\s*phase,\s*state,\s*pointer\.value,\s*progressPath,\s*startSummaryMetadata,\s*parsed\.warnings\)/.test(source),
  'runStartCommand must pass separate summary metadata to existing summary output without changing quick flow handoff.',
);

if (failures.length > 0) {
  console.error('START_FLOW_PARITY_RED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (!quietForPackJson) console.log('START_FLOW_PARITY_OK');
