#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
let activeCase = requestedCase;

const acceptanceChecklistCaseKey = 'acceptance-checklist';
const cleanupCaseKey = 'cleanup';
const acceptanceChecklistCoverage = {
  topologyEnums: ['topology-classification-fixtures'],
  commitNone: ['commit-mode-derivation'],
  relaxedBlockerPriority: ['relaxed-completion-validation-fixtures', 'topology-blocker-priority-contract'],
  promptContracts: ['executor-topology-contract', 'planner-template-contract'],
  redPass: ['red-pass-evidence-contract'],
};
const acceptanceChecklistCases = Object.values(acceptanceChecklistCoverage).flat();
const verifierTempPrefixes = [
  'task-blockers-topology-',
  'task-blockers-normalization-',
  'task-blockers-commit-mode-',
  'task-blockers-relaxed-completion-',
];
const cases = new Map([
  ['topology-helper-contract', verifyTopologyHelperContract],
  ['topology-classification-fixtures', verifyTopologyClassificationFixtures],
  ['topology-input-normalization', verifyTopologyInputNormalization],
  ['commit-mode-derivation', verifyCommitModeDerivation],
  ['coordinator-preflight-contract', verifyCoordinatorPreflightContract],
  ['relaxed-completion-validation-fixtures', verifyRelaxedCompletionValidationFixtures],
  ['topology-blocker-priority-contract', verifyTopologyBlockerPriorityContract],
  ['red-pass-evidence-contract', verifyRedPassEvidenceContract],
  ['executor-topology-contract', verifyExecutorTopologyContract],
  ['planner-template-contract', verifyPlannerTemplateContract],
  ['stable-helper-exports', verifyStableHelperExports],
  [acceptanceChecklistCaseKey, verifyAcceptanceChecklist],
]);
const supportedCaseNames = [...cases.keys(), cleanupCaseKey];

async function main() {
  if (!requestedCase || requestedCase === 'all') {
    const summaries = [];

    for (const [caseName, verifyCase] of cases.entries()) {
      const result = await runVerifierCase(caseName, verifyCase);
      summaries.push(result);
      if (!result.ok) {
        printCaseFailure(result);
        console.error(`FAIL task-blockers parity verifier: ${countPassed(summaries)}/${cases.size} cases passed; failed: ${caseName}`);
        process.exitCode = 1;
        return;
      }
      console.log(`PASS ${caseName}`);
    }

    const cleanupResult = await runVerifierCase(cleanupCaseKey, verifyCleanupCase);
    if (!cleanupResult.ok) {
      printCaseFailure(cleanupResult);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS ${cleanupCaseKey}`);

    console.log(`PASS task-blockers parity verifier: ${summaries.length}/${cases.size} cases passed`);
    return;
  }

  if (requestedCase === cleanupCaseKey) {
    const result = await runVerifierCase(requestedCase, verifyCleanupCase);
    if (!result.ok) {
      printCaseFailure(result);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS ${requestedCase}`);
    return;
  }

  const verifyCase = cases.get(requestedCase);
  if (!verifyCase) {
    console.error(`Unknown verify case: ${requestedCase}`);
    console.error(`Supported cases: ${supportedCaseNames.join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const result = await runVerifierCase(requestedCase, verifyCase);
  if (!result.ok) {
    printCaseFailure(result);
    process.exitCode = 1;
    return;
  }

  console.log(`PASS ${requestedCase}`);
}

async function runVerifierCase(caseName, verifyCase) {
  activeCase = caseName;
  try {
    await verifyCase();
    return { name: caseName, ok: true };
  } catch (error) {
    return { name: caseName, ok: false, error };
  }
}

function printCaseFailure(result) {
  if (result.error?.expectedFail === true) {
    console.error(`EXPECTED_FAIL ${result.name}: ${result.error.message}`);
    return;
  }

  console.error(`FAIL ${result.name}: ${formatError(result.error)}`);
}

function countPassed(results) {
  return results.filter((result) => result.ok).length;
}

function formatError(error) {
  return String(error?.stack ?? error?.message ?? error);
}

function parseCaseArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--case') return args[index + 1] ?? '';
    if (token.startsWith('--case=')) return token.slice('--case='.length);
  }
  return 'all';
}

async function verifyTopologyHelperContract() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'task-completion.ts');

  if (!existsSync(helperPath)) {
    expectedFail('extensions/ralph-specum/task-completion.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  if (!/export\s+(async\s+)?function\s+(analyzeTaskWorkspace|classifyTaskWorkspace)/.test(helperSource)) {
    expectedFail('task-completion helper must export analyzeTaskWorkspace or classifyTaskWorkspace for parity coverage.');
  }

  if (!/export\s+type\s+TaskTopology\s*=\s*'single_repo'\s*\|\s*'multi_repo'\s*\|\s*'repo_plus_nonrepo'\s*\|\s*'no_repo'/.test(helperSource)) {
    expectedFail('task-completion helper must declare the TaskTopology contract for parity coverage.');
  }

  if (!/export\s+function\s+formatTaskWorkspaceReport\(/.test(helperSource)) {
    expectedFail('task-completion helper must export formatTaskWorkspaceReport for stable workspace-report strings.');
  }

  if (!/return\s*{[\s\S]*topology,[\s\S]*entries,[\s\S]*commitMode,[\s\S]*}/s.test(helperSource)) {
    expectedFail('task-completion helper must return a workspace report containing topology, entries, and commit guidance.');
  }
}

async function verifyTopologyClassificationFixtures() {
  const helper = await loadTaskCompletionHelper();
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'task-blockers-topology-'));

  try {
    const singleRepo = createGitFixture(join(fixtureRoot, 'single-repo'));
    const multiRepoOuter = createGitFixture(join(fixtureRoot, 'multi-repo', 'outer'));
    const multiRepoInner = createGitFixture(join(fixtureRoot, 'multi-repo', 'outer', 'nested-repo'));
    const repoPlusNonRepo = createGitFixture(join(fixtureRoot, 'repo-plus-nonrepo', 'repo'));
    const noRepoRoot = join(fixtureRoot, 'no-repo');
    mkdirSync(noRepoRoot, { recursive: true });

    const casesToVerify = [
      {
        name: 'single_repo',
        expectedTopology: 'single_repo',
        input: createWorkspaceInput({
          specDir: join(singleRepo, 'specs', 'single'),
          taskFiles: [join(singleRepo, 'src', 'task.ts')],
        }),
      },
      {
        name: 'multi_repo',
        expectedTopology: 'multi_repo',
        input: createWorkspaceInput({
          specDir: join(multiRepoOuter, 'specs', 'multi'),
          taskFiles: [join(multiRepoInner, 'src', 'task.ts')],
        }),
      },
      {
        name: 'repo_plus_nonrepo',
        expectedTopology: 'repo_plus_nonrepo',
        input: createWorkspaceInput({
          specDir: join(fixtureRoot, 'repo-plus-nonrepo', 'external-spec'),
          taskFiles: [join(repoPlusNonRepo, 'src', 'task.ts')],
        }),
      },
      {
        name: 'no_repo',
        expectedTopology: 'no_repo',
        input: createWorkspaceInput({
          specDir: join(noRepoRoot, 'specs', 'none'),
          taskFiles: [join(noRepoRoot, 'src', 'task.ts')],
        }),
      },
    ];

    for (const testCase of casesToVerify) {
      materializeWorkspaceInput(testCase.input);
      const report = helper.analyzeTaskWorkspace(testCase.input);
      assertTopologyCase(testCase, report);
      assertClassificationKinds(testCase, report);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function verifyTopologyInputNormalization() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'task-blockers-normalization-'));

  try {
    const repoRoot = createGitFixture(join(fixtureRoot, 'repo'));
    const specDir = join(repoRoot, 'specs', 'normalize');
    const sharedTaskFile = join(repoRoot, 'src', 'shared.ts');
    const alternateTaskFile = join(repoRoot, 'src', 'alternate.ts');

    const inputs = [
      {
        name: 'none-directive',
        input: createWorkspaceInput({ specDir, taskFiles: [] }),
        filesDirective: 'None',
        expectedTaskFiles: [],
      },
      {
        name: 'comma-backtick-directive',
        input: createWorkspaceInput({ specDir, taskFiles: [] }),
        filesDirective: `\`${sharedTaskFile}\`, \`${alternateTaskFile}\``,
        expectedTaskFiles: [sharedTaskFile, alternateTaskFile],
      },
      {
        name: 'newline-directive',
        input: createWorkspaceInput({ specDir, taskFiles: [] }),
        filesDirective: `\`${sharedTaskFile}\`\n\`${alternateTaskFile}\``,
        expectedTaskFiles: [sharedTaskFile, alternateTaskFile],
      },
    ];

    for (const testCase of inputs) {
      testCase.input.filesDirective = testCase.filesDirective;
      materializeWorkspaceInput(testCase.input);
      const helper = await loadTaskCompletionHelper();
      const report = helper.analyzeTaskWorkspace(testCase.input);
      const taskFileEntries = (report.entries ?? [])
        .filter((entry) => entry.kind === 'task_file')
        .map((entry) => resolve(entry.path))
        .sort();
      const expectedTaskFiles = testCase.expectedTaskFiles.map((taskFile) => resolve(taskFile)).sort();

      if (JSON.stringify(taskFileEntries) !== JSON.stringify(expectedTaskFiles)) {
        expectedFail(`normalization fixture ${testCase.name} expected task files ${expectedTaskFiles.join(', ')} but received ${taskFileEntries.join(', ')}`);
      }
    }

    const memoizedInput = createWorkspaceInput({
      specDir: join(repoRoot, 'specs', 'memoized'),
      taskFiles: [sharedTaskFile, sharedTaskFile],
    });
    materializeWorkspaceInput(memoizedInput);

    const spawnCalls = [];
    const childProcess = createRequire(import.meta.url)('node:child_process');
    const originalSpawnSync = childProcess.spawnSync;
    childProcess.spawnSync = (...args) => {
      spawnCalls.push(args[1]?.join(' ') ?? '');
      return originalSpawnSync(...args);
    };

    try {
      const helper = await loadTaskCompletionHelper();
      helper.analyzeTaskWorkspace(memoizedInput);
    } finally {
      childProcess.spawnSync = originalSpawnSync;
    }

    if (spawnCalls.length !== 2) {
      expectedFail(`memoization fixture expected 2 git probes for duplicate task/spec directories but received ${spawnCalls.length}`);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function verifyCommitModeDerivation() {
  const helper = await loadTaskCompletionHelper();
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'task-blockers-commit-mode-'));

  try {
    const singleRepo = createGitFixture(join(fixtureRoot, 'single-repo'));
    const multiRepoOuter = createGitFixture(join(fixtureRoot, 'multi-repo', 'outer'));
    const multiRepoInner = createGitFixture(join(fixtureRoot, 'multi-repo', 'outer', 'nested-repo'));
    const noRepoSpecRoot = join(fixtureRoot, 'no-repo-spec');
    mkdirSync(noRepoSpecRoot, { recursive: true });

    const casesToVerify = [
      {
        name: 'commit-none-single-repo',
        expectedTopology: 'single_repo',
        expectedCommitMode: 'none',
        expectedCommitReason: undefined,
        input: createWorkspaceInput({
          specDir: join(singleRepo, 'specs', 'commit-none'),
          taskFiles: [join(singleRepo, 'src', 'task.ts')],
          commitDirective: 'None',
        }),
      },
      {
        name: 'commit-message-single-repo',
        expectedTopology: 'single_repo',
        expectedCommitMode: 'required',
        expectedCommitReason: undefined,
        input: createWorkspaceInput({
          specDir: join(singleRepo, 'specs', 'commit-required'),
          taskFiles: [join(singleRepo, 'src', 'task-required.ts')],
          commitDirective: '`feat(task-blockers): fixture`',
        }),
      },
      {
        name: 'commit-message-multi-repo',
        expectedTopology: 'multi_repo',
        expectedCommitMode: 'topology_relaxed',
        expectedCommitReason: 'multi_repo',
        input: createWorkspaceInput({
          specDir: join(multiRepoOuter, 'specs', 'commit-relaxed'),
          taskFiles: [join(multiRepoInner, 'src', 'task.ts')],
          commitDirective: '`feat(task-blockers): split repo fixture`',
        }),
      },
      {
        name: 'files-none-no-repo',
        expectedTopology: 'no_repo',
        expectedCommitMode: 'topology_relaxed',
        expectedCommitReason: 'no_repo',
        input: createWorkspaceInput({
          specDir: join(noRepoSpecRoot, 'specs', 'files-none'),
          taskFiles: [],
          filesDirective: 'None',
          commitDirective: '`feat(task-blockers): spec-only fixture`',
        }),
      },
    ];

    for (const testCase of casesToVerify) {
      materializeWorkspaceInput(testCase.input);
      const report = helper.analyzeTaskWorkspace(testCase.input);
      assertTopologyCase(testCase, report);
      assertCommitModeCase(testCase, report);
      assertFormattedWorkspaceReport(testCase, report, helper);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function verifyCoordinatorPreflightContract() {
  const helper = await loadTaskCompletionHelper();
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'task-blockers-topology-'));

  try {
    const repoRoot = createGitFixture(join(fixtureRoot, 'single-repo'));
    const input = createWorkspaceInput({
      specDir: join(repoRoot, 'specs', 'preflight'),
      taskFiles: [join(repoRoot, 'src', 'task.ts')],
      commitDirective: '`feat(task-blockers): preflight fixture`',
    });
    materializeWorkspaceInput(input);

    const report = helper.analyzeTaskWorkspace(input);
    if (!Array.isArray(report.promptGuidance) || report.promptGuidance.length === 0) {
      expectedFail('task-completion helper must return prompt guidance for topology preflight.');
    }

    const promptGuidance = report.promptGuidance.join('\n');
    if (!/preflight workspace topology/i.test(promptGuidance) || !/single_repo/i.test(promptGuidance) || !/commit-required/i.test(promptGuidance)) {
      expectedFail('topology preflight guidance must mention preflight, single_repo, and commit-required behavior.');
    }

    const formattedReport = helper.formatTaskWorkspaceReport(report);
    if (!/topology=single_repo/.test(formattedReport) || !/commitMode=required/.test(formattedReport)) {
      expectedFail('formatted workspace report must carry single_repo topology and commit-required guidance for prompt reuse.');
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function verifyRelaxedCompletionValidationFixtures() {
  const helper = await loadTaskCompletionHelper();
  const implementationHelper = await loadImplementationLoopHelper();
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'task-blockers-relaxed-completion-'));

  try {
    const multiRepoOuter = createGitFixture(join(fixtureRoot, 'multi-repo', 'outer'));
    const multiRepoInner = createGitFixture(join(fixtureRoot, 'multi-repo', 'outer', 'nested-repo'));
    const repoPlusNonRepo = createGitFixture(join(fixtureRoot, 'repo-plus-nonrepo', 'repo'));
    const noRepoRoot = join(fixtureRoot, 'no-repo');
    mkdirSync(noRepoRoot, { recursive: true });

    const assessTaskCompletionOutput = helper.analyzeTaskWorkspace.assessTaskCompletionOutput;
    if (typeof assessTaskCompletionOutput !== 'function') {
      expectedFail('task-completion helper must expose topology-aware completion assessment for relaxed workspace fixtures.');
    }

    const validateImplementationCompletionBridge = implementationHelper?.validateImplementationCompletionBridge;
    if (typeof validateImplementationCompletionBridge !== 'function') {
      expectedFail('implementation-loop.ts must export validateImplementationCompletionBridge for relaxed completion fixtures.');
    }

    const casesToVerify = [
      {
        name: 'multi_repo',
        expectedTopology: 'multi_repo',
        expectedCommitReason: 'multi_repo',
        input: createWorkspaceInput({
          specDir: join(multiRepoOuter, 'specs', 'relaxed'),
          taskFiles: [join(multiRepoInner, 'src', 'task.ts')],
          commitDirective: '`feat(task-blockers): split repo fixture`',
        }),
      },
      {
        name: 'repo_plus_nonrepo',
        expectedTopology: 'repo_plus_nonrepo',
        expectedCommitReason: 'repo_plus_nonrepo',
        input: createWorkspaceInput({
          specDir: join(fixtureRoot, 'repo-plus-nonrepo', 'external-spec'),
          taskFiles: [join(repoPlusNonRepo, 'src', 'task.ts')],
          commitDirective: '`feat(task-blockers): mixed fixture`',
        }),
      },
      {
        name: 'no_repo',
        expectedTopology: 'no_repo',
        expectedCommitReason: 'no_repo',
        input: createWorkspaceInput({
          specDir: join(noRepoRoot, 'specs', 'relaxed'),
          taskFiles: [join(noRepoRoot, 'src', 'task.ts')],
          commitDirective: '`feat(task-blockers): no repo fixture`',
        }),
      },
    ];

    for (const testCase of casesToVerify) {
      materializeWorkspaceInput(testCase.input);
      const report = helper.analyzeTaskWorkspace(testCase.input);
      assertTopologyCase(testCase, report);
      assertCommitModeCase({ ...testCase, expectedCommitMode: 'topology_relaxed' }, report);

      const validOutput = `TASK_COMPLETE\nevidence: topology-relaxed fixture\ncommit: none\ncommit_reason: ${testCase.expectedCommitReason}`;
      const validAssessment = assessTaskCompletionOutput(validOutput, report);
      if (!validAssessment?.ok) {
        expectedFail(`relaxed completion fixture ${testCase.name} must accept commit: none with commit_reason: ${testCase.expectedCommitReason}.`);
      }

      const bridgeValidation = validateImplementationCompletionBridge({
        output: validOutput,
        signal: 'TASK_COMPLETE',
        task: { rawTitle: testCase.name, subject: testCase.name },
        assessCompletionOutput: (output) => assessTaskCompletionOutput(output, report),
        detectFailureReason: () => 'generic verification noise',
      });
      if (!bridgeValidation.ok) {
        expectedFail(`implementation completion bridge must accept topology-relaxed output for ${testCase.name}.`);
      }

      const invalidOutput = 'TASK_COMPLETE\nevidence: topology-relaxed fixture\ncommit: none';
      const invalidValidation = validateImplementationCompletionBridge({
        output: invalidOutput,
        signal: 'TASK_COMPLETE',
        task: { rawTitle: testCase.name, subject: testCase.name },
        assessCompletionOutput: (output) => assessTaskCompletionOutput(output, report),
        detectFailureReason: () => 'generic verification noise',
      });
      if (invalidValidation.ok || !/commit_reason/i.test(String(invalidValidation.error ?? ''))) {
        expectedFail(`implementation completion bridge must require commit_reason for topology-relaxed fixture ${testCase.name}.`);
      }
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function verifyTopologyBlockerPriorityContract() {
  const helper = await loadTaskCompletionHelper();
  const selectTaskCompletionBlocker = helper.analyzeTaskWorkspace.selectTaskCompletionBlocker;

  if (typeof selectTaskCompletionBlocker !== 'function') {
    expectedFail('task-completion helper must expose topology-aware blocker selection for parity fixtures.');
  }

  const blocker = selectTaskCompletionBlocker({
    topologyBlocker: 'Workspace commit topology multi_repo requires split_repo_workspace evidence.',
    modificationBlocker: 'task modification blocker',
    verificationBlocker: 'generic verification noise',
    fallbackBlocker: 'fallback blocker',
  });

  if (!/topology|split_repo_workspace|multi_repo/i.test(String(blocker))) {
    expectedFail('blocker selection must prefer topology-aware commit blockers ahead of generic verification noise.');
  }
}

async function verifyRedPassEvidenceContract() {
  const helper = await loadTaskCompletionHelper();
  const implementationHelper = await loadImplementationLoopHelper();
  const hasExpectedFailureProof = helper.analyzeTaskWorkspace.hasExpectedFailureProof;
  const validateImplementationCompletionBridge = implementationHelper?.validateImplementationCompletionBridge;

  if (typeof hasExpectedFailureProof !== 'function') {
    expectedFail('task-completion helper must expose keyed expected-failure proof detection for RED_PASS fixtures.');
  }

  if (typeof validateImplementationCompletionBridge !== 'function') {
    expectedFail('implementation-loop.ts must export validateImplementationCompletionBridge for RED_PASS fixtures.');
  }

  if (!hasExpectedFailureProof('verify: RED_PASS')) {
    expectedFail('keyed RED_PASS proof must be detected from verify: lines.');
  }

  if (hasExpectedFailureProof('FAIL verifier output without keyed proof')) {
    expectedFail('raw failing output must not count as RED_PASS proof without a keyed evidence line.');
  }

  const redTask = { rawTitle: '6.1 [RED] fixture', subject: 'red fixture' };
  const validResult = validateImplementationCompletionBridge({
    output: 'TASK_COMPLETE\nverify: RED_PASS',
    signal: 'TASK_COMPLETE',
    task: redTask,
    hasExpectedFailureProof,
    assessCompletionOutput: () => ({ ok: true }),
    detectFailureReason: () => 'missing RED_PASS proof',
  });
  if (!validResult.ok) {
    expectedFail('RED tasks must accept TASK_COMPLETE outputs with keyed verify: RED_PASS proof.');
  }

  const invalidResult = validateImplementationCompletionBridge({
    output: 'TASK_COMPLETE\nFAIL without keyed proof',
    signal: 'TASK_COMPLETE',
    task: redTask,
    hasExpectedFailureProof,
    assessCompletionOutput: () => ({ ok: true }),
    detectFailureReason: () => 'missing RED_PASS proof',
  });
  if (invalidResult.ok || !/RED_PASS/i.test(String(invalidResult.error ?? ''))) {
    expectedFail('RED tasks must reject TASK_COMPLETE outputs that omit keyed RED_PASS proof.');
  }
}

async function verifyExecutorTopologyContract() {
  const executorAgentSource = readFileSync(join(root, 'agents', 'ralph-spec-executor.md'), 'utf8');
  const executorPromptSource = readFileSync(join(root, 'prompts', 'executor-prompt.md'), 'utf8');

  assertExecutorSurfaceContract({
    surfaceName: 'agents/ralph-spec-executor.md',
    source: executorAgentSource,
  });
  assertExecutorSurfaceContract({
    surfaceName: 'prompts/executor-prompt.md',
    source: executorPromptSource,
  });
}

async function verifyPlannerTemplateContract() {
  const plannerAgentSource = readFileSync(join(root, 'agents', 'ralph-task-planner.md'), 'utf8');
  const tasksTemplateSource = readFileSync(join(root, 'templates', 'tasks.md'), 'utf8');

  assertPlannerSurfaceContract({
    surfaceName: 'agents/ralph-task-planner.md',
    source: plannerAgentSource,
  });
  assertTemplateSurfaceContract({
    surfaceName: 'templates/tasks.md',
    source: tasksTemplateSource,
  });
}

async function verifyStableHelperExports() {
  const helperSource = readFileSync(join(root, 'extensions', 'ralph-specum', 'task-completion.ts'), 'utf8');
  const implementationHelperSource = readFileSync(join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts'), 'utf8');
  const verifierSource = readFileSync(join(root, 'scripts', 'verify-task-blockers-parity.mjs'), 'utf8');

  const requiredTaskCompletionExports = [
    /export function analyzeTaskWorkspace\(/,
    /export function classifyTaskWorkspace\(/,
    /export function formatTaskWorkspaceReport\(/,
    /export function normalizeVerificationAgentOutputEnvelope\(/,
    /export function normalizeQaVerificationResultEnvelope\(/,
    /export function normalizePackageScriptOutputEnvelope\(/,
    /export function normalizeNestedVerifierResultEnvelope\(/,
  ];
  if (requiredTaskCompletionExports.some((pattern) => !pattern.test(helperSource))) {
    expectedFail('task-completion.ts must expose stable helper exports for topology, evidence, and verification-envelope contract fixtures.');
  }

  const requiredImplementationExports = [
    /export function createImplementationCompletionBridgeInput\(/,
    /export function validateImplementationCompletionBridge\(/,
    /export function createImplementationVerificationDecision\(/,
  ];
  if (requiredImplementationExports.some((pattern) => !pattern.test(implementationHelperSource))) {
    expectedFail('implementation-loop.ts must expose stable completion and verification decision bridges for task-blocker parity fixtures.');
  }

  const brittleVerifierPatterns = [
    /readFileSync\(join\(root, 'extensions', 'ralph-specum', 'index\.ts'\), 'utf8'\)/,
    /indexSource\.match\(/,
    /coordinatorSource\.match\(/,
  ];
  const stillCoupled = brittleVerifierPatterns.filter((pattern) => pattern.test(verifierSource));
  if (stillCoupled.length > 0) {
    expectedFail('task-blockers verifier still depends on coordinator source text layout instead of exercising stable helper exports and behavior fixtures.');
  }
}

async function verifyAcceptanceChecklist() {
  const coveredCaseNames = [];

  for (const [coverageName, coverageCases] of Object.entries(acceptanceChecklistCoverage)) {
    if (!Array.isArray(coverageCases) || coverageCases.length === 0) {
      throw new Error(`acceptance checklist coverage ${coverageName} must list at least one verifier case`);
    }

    for (const caseName of coverageCases) {
      const verifyCase = cases.get(caseName);
      if (typeof verifyCase !== 'function') {
        throw new Error(`acceptance checklist is missing verifier case ${caseName}`);
      }

      coveredCaseNames.push(caseName);
      const result = await runVerifierCase(caseName, verifyCase);
      if (!result.ok) {
        throw result.error;
      }
    }
  }

  const coveredCaseSet = new Set(coveredCaseNames);
  if (coveredCaseSet.size !== acceptanceChecklistCases.length) {
    expectedFail('acceptance checklist coverage must keep a stable one-pass case list for topology, commit, blocker-priority, prompt-contract, and RED_PASS regressions.');
  }

  if (!supportedCaseNames.includes(cleanupCaseKey)) {
    expectedFail('acceptance checklist must expose a focused `cleanup` case so package verification can prove temp artifacts are removed.');
  }

  const packageJsonPath = join(root, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const verifyIndexScript = String(packageJson?.scripts?.['verify:index'] ?? '');
  const verifyPackScript = String(packageJson?.scripts?.['verify:pack'] ?? '');

  if (!scriptEventuallyRunsTaskBlockersCase(verifyIndexScript, acceptanceChecklistCaseKey)) {
    expectedFail('package verification must route `npm run verify:index` through `scripts/verify-task-blockers-parity.mjs --case acceptance-checklist` so the aggregate acceptance bundle runs in normal verification.');
  }

  if (!scriptEventuallyRunsTaskBlockersCase(verifyPackScript, cleanupCaseKey)) {
    expectedFail('package verification must route cleanup through `scripts/verify-task-blockers-parity.mjs --case cleanup` so acceptance fixtures prove temp artifacts are removed.');
  }
}

async function verifyCleanupCase() {
  const beforeEntries = new Set(listVerifierTempEntries());
  let caseError = null;

  try {
    await verifyAcceptanceChecklist();
  } catch (error) {
    caseError = error;
  }

  const remainingEntries = listVerifierTempEntries().filter((entry) => !beforeEntries.has(entry));
  if (remainingEntries.length > 0) {
    expectedFail(`verifier cleanup must remove temporary artifacts; found ${JSON.stringify(remainingEntries)}`);
  }

  if (caseError) {
    throw caseError;
  }
}

function assertExecutorSurfaceContract({ surfaceName, source }) {
  if (!/topology preflight|preflight repo topology|repo-topology preflight/i.test(source)) {
    expectedFail(`${surfaceName} must require topology preflight before commit handling.`);
  }

  if (!/single_repo/.test(source)) {
    expectedFail(`${surfaceName} must name \`single_repo\` explicitly in commit-handling guidance.`);
  }

  if (!/multi_repo/.test(source) || !/repo_plus_nonrepo/.test(source) || !/no_repo/.test(source)) {
    expectedFail(`${surfaceName} must list all non-\`single_repo\` topology markers in commit-handling guidance.`);
  }

  if (!/split-repo|spec-outside-repo/i.test(source)) {
    expectedFail(`${surfaceName} must explain split-repo/spec-outside-repo behavior.`);
  }

  if (!/commit:\s*none/i.test(source) || !/commit_reason/i.test(source)) {
    expectedFail(`${surfaceName} must allow \`commit: none\` plus \`commit_reason\` for non-\`single_repo\` success.`);
  }

  if (!/commit:\s*none`?\s+and\s+`?commit_reason:\s*<topology>/i.test(source) && !/commit:\s*none`?\s+plus\s+`?commit_reason:\s*<topology>/i.test(source)) {
    expectedFail(`${surfaceName} must keep the stable non-\`single_repo\` output-marker example \`commit: none\` + \`commit_reason: <topology>\`.`);
  }
}

function assertPlannerSurfaceContract({ surfaceName, source }) {
  if (!/Do not hardcode `\.\/specs\/`/i.test(source)) {
    expectedFail(`${surfaceName} must forbid hardcoded \`./specs/\` assumptions.`);
  }

  if (!/Commit:\s*None/i.test(source)) {
    expectedFail(`${surfaceName} must steer non-shared-repo tasks toward \`Commit: None\`.`);
  }

  if (!/single_repo/.test(source) || !/multi_repo/.test(source) || !/repo_plus_nonrepo/.test(source) || !/no_repo/.test(source)) {
    expectedFail(`${surfaceName} must use the canonical topology enum names in commit guidance.`);
  }
}

function assertTemplateSurfaceContract({ surfaceName, source }) {
  if (/\.\/specs\//.test(source)) {
    expectedFail(`${surfaceName} must avoid hardcoded \`./specs/\` examples so spec roots stay configurable.`);
  }

  if (!/Commit:\s*None/i.test(source)) {
    expectedFail(`${surfaceName} must include a canonical \`Commit: None\` example for non-shared-repo tasks.`);
  }

  if (!/single_repo/.test(source) || !/multi_repo/.test(source) || !/repo_plus_nonrepo/.test(source) || !/no_repo/.test(source)) {
    expectedFail(`${surfaceName} must use the canonical topology enum names in commit guidance.`);
  }
}

let taskCompletionHelperPromise;
let implementationLoopHelperPromise;

async function loadTaskCompletionHelper() {
  taskCompletionHelperPromise ??= loadRuntimeTsModule('extensions/ralph-specum/task-completion.ts');
  return taskCompletionHelperPromise;
}

async function loadImplementationLoopHelper() {
  implementationLoopHelperPromise ??= loadRuntimeTsModule('extensions/ralph-specum/implementation-loop.ts');
  return implementationLoopHelperPromise;
}

async function loadRuntimeTsModule(rootRelativePath) {
  const modulePath = join(root, rootRelativePath);
  const moduleUrl = pathToFileURL(modulePath);
  try {
    return await import(moduleUrl.href);
  } catch (error) {
    if (isExpectedMissingHelperError(error, modulePath)) return null;
    throw error;
  }
}

function isExpectedMissingHelperError(error, modulePath) {
  const message = String(error?.message ?? '');
  return (
    error?.code === 'ERR_MODULE_NOT_FOUND'
    || error?.code === 'ERR_UNKNOWN_FILE_EXTENSION'
    || message.includes('Cannot find module')
    || message.includes('Unknown file extension')
    || message.includes(modulePath)
  );
}

function createGitFixture(dirPath) {
  mkdirSync(dirPath, { recursive: true });
  execFileSync('git', ['init'], { cwd: dirPath, stdio: 'ignore' });
  return dirPath;
}

function createWorkspaceInput({ specDir, taskFiles, filesDirective, commitDirective }) {
  return {
    basePath: specDir,
    taskFiles,
    filesDirective,
    tasksPath: join(specDir, 'tasks.md'),
    progressPath: join(specDir, '.progress.md'),
    commitDirective: commitDirective ?? '`test(task-blockers): fixture`',
  };
}

function materializeWorkspaceInput(input) {
  writeText(input.tasksPath, '# tasks\n');
  writeText(input.progressPath, '# progress\n');
  for (const taskFile of input.taskFiles) {
    writeText(taskFile, '// task file\n');
  }
}

function writeText(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function assertTopologyCase(testCase, report) {
  if (report.topology !== testCase.expectedTopology) {
    expectedFail(`topology fixture ${testCase.name} expected ${testCase.expectedTopology} but received ${report.topology}`);
  }
}

function assertClassificationKinds(testCase, report) {
  const normalizedPaths = new Map((report.entries ?? []).map((entry) => [resolve(entry.path), entry.kind]));
  const expectedKinds = [
    [resolve(testCase.input.tasksPath), 'tasks_md'],
    [resolve(testCase.input.progressPath), 'progress_md'],
    ...testCase.input.taskFiles.map((taskFile) => [resolve(taskFile), 'task_file']),
  ];

  for (const [expectedPath, expectedKind] of expectedKinds) {
    if (normalizedPaths.get(expectedPath) !== expectedKind) {
      expectedFail(`topology fixture ${testCase.name} must classify ${expectedKind} input ${expectedPath}`);
    }
  }
}

function assertCommitModeCase(testCase, report) {
  if (report.commitMode !== testCase.expectedCommitMode) {
    expectedFail(`commit-mode fixture ${testCase.name} expected ${testCase.expectedCommitMode} but received ${String(report.commitMode)}`);
  }

  if (testCase.expectedCommitReason === undefined) {
    if (report.commitReason !== undefined) {
      expectedFail(`commit-mode fixture ${testCase.name} expected no commit reason but received ${String(report.commitReason)}`);
    }
    return;
  }

  if (report.commitReason !== testCase.expectedCommitReason) {
    expectedFail(`commit-mode fixture ${testCase.name} expected commit reason ${testCase.expectedCommitReason} but received ${String(report.commitReason)}`);
  }
}

function assertFormattedWorkspaceReport(testCase, report, helper) {
  const formattedReport = helper.formatTaskWorkspaceReport(report);
  const expectedLines = [
    `topology=${testCase.expectedTopology}`,
    `commitMode=${testCase.expectedCommitMode}`,
    `commitReason=${testCase.expectedCommitReason ?? 'none'}`,
    ...report.entries.map((entry) => `entry:${entry.kind}:${resolve(entry.path)}:${entry.repoRoot ?? 'none'}`),
  ];
  const expectedFormattedReport = expectedLines.join('\n');

  if (formattedReport !== expectedFormattedReport) {
    expectedFail(`workspace-report fixture ${testCase.name} expected ${JSON.stringify(expectedFormattedReport)} but received ${JSON.stringify(formattedReport)}`);
  }
}

function scriptEventuallyRunsTaskBlockersCase(script, caseName) {
  return script.includes(`scripts/verify-task-blockers-parity.mjs --case ${caseName}`)
    || script.includes(`scripts/verify-task-blockers-parity.mjs --case=${caseName}`);
}

function listVerifierTempEntries() {
  return readdirSync(tmpdir()).filter((entry) => verifierTempPrefixes.some((prefix) => entry.startsWith(prefix)));
}

function expectedFail(message) {
  const error = new Error(message);
  error.expectedFail = true;
  throw error;
}

await main();
