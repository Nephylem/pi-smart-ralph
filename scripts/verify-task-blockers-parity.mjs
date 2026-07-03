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
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
let activeCase = requestedCase;

const acceptanceChecklistCaseKey = 'acceptance-checklist';
const cleanupCaseKey = 'cleanup';
const acceptanceChecklistCases = [
  'topology-classification-fixtures',
  'commit-mode-derivation',
  'relaxed-completion-validation-fixtures',
  'topology-blocker-priority-contract',
  'red-pass-evidence-contract',
  'executor-topology-contract',
  'planner-template-contract',
];
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
  const helper = loadTaskCompletionHelper();
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
      const helper = loadTaskCompletionHelper();
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
      const helper = loadTaskCompletionHelper();
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
  const helper = loadTaskCompletionHelper();
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
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  if (!/from\s+["']\.\/task-completion\.ts["']/.test(indexSource)) {
    expectedFail('coordinator must import task-completion helpers before executor dispatch.');
  }

  if (!/analyzeTaskWorkspace\(/.test(indexSource)) {
    expectedFail('coordinator must compute a workspace report before dispatching the executor.');
  }

  if (!/formatTaskWorkspaceReport\(/.test(indexSource)) {
    expectedFail('coordinator must format the workspace report for prompt-visible preflight guidance.');
  }

  const promptSection = indexSource.match(/function buildImplementationPrompt\([\s\S]*?\n}\n\nfunction subagentCompletionOutput/);
  if (!promptSection || !/topology/i.test(promptSection[0]) || !/single_repo/i.test(promptSection[0]) || !/commit-required/i.test(promptSection[0])) {
    expectedFail('executor prompt must mention topology preflight and preserve single_repo commit-required behavior.');
  }

  const executionSection = indexSource.match(/const definition = implementationSubagentDefinition\(task\);[\s\S]*?const prompt = buildImplementationPrompt\(task, definition, spec, state, options\);/);
  if (!executionSection || !/analyzeTaskWorkspace/.test(executionSection[0])) {
    expectedFail('coordinator must compute workspace topology in the execution flow before building the executor prompt.');
  }
}

async function verifyRelaxedCompletionValidationFixtures() {
  const helper = loadTaskCompletionHelper();
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'task-blockers-relaxed-completion-'));

  try {
    const multiRepoOuter = createGitFixture(join(fixtureRoot, 'multi-repo', 'outer'));
    const multiRepoInner = createGitFixture(join(fixtureRoot, 'multi-repo', 'outer', 'nested-repo'));
    const repoPlusNonRepo = createGitFixture(join(fixtureRoot, 'repo-plus-nonrepo', 'repo'));
    const noRepoRoot = join(fixtureRoot, 'no-repo');
    mkdirSync(noRepoRoot, { recursive: true });

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
    }

    const indexSource = readFileSync(join(root, 'extensions', 'ralph-specum', 'index.ts'), 'utf8');
    if (!/commit_reason/i.test(indexSource)) {
      expectedFail('completion validation must parse `commit_reason` so multi_repo, repo_plus_nonrepo, and no_repo tasks can finish with `commit: none` plus topology evidence.');
    }

    const validationSection = indexSource.match(/function validateSubagentCompletion\([\s\S]*?\n}\n\nfunction runGitCommand/);
    if (!validationSection || !/workspaceReport|task-completion|topology_relaxed|commitReason/.test(validationSection[0])) {
      expectedFail('completion validation must reuse the workspace topology report when deciding whether non-single_repo `commit: none` completions are valid.');
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function verifyTopologyBlockerPriorityContract() {
  const indexSource = readFileSync(join(root, 'extensions', 'ralph-specum', 'index.ts'), 'utf8');
  const helperSource = readFileSync(join(root, 'extensions', 'ralph-specum', 'task-completion.ts'), 'utf8');
  const failureReasonSection = indexSource.match(/function detectExplicitFailureReason\([\s\S]*?\n}\n\nfunction extractCompletionEvidence/);

  if (!failureReasonSection) {
    expectedFail('parity coverage could not locate detectExplicitFailureReason for blocker-priority assertions.');
  }

  if (!/TaskCompletionAssessment/.test(helperSource)) {
    expectedFail('task-completion helper must define TaskCompletionAssessment so topology-aware blocker decisions are testable.');
  }

  if (!/multi_repo|repo_plus_nonrepo|no_repo|topology_relaxed|commit topology|split_repo_workspace/i.test(failureReasonSection[0])) {
    expectedFail('blocker selection must prefer topology/commit-topology reasons ahead of generic verification noise for non-single_repo failures.');
  }
}

async function verifyRedPassEvidenceContract() {
  const helperSource = readFileSync(join(root, 'extensions', 'ralph-specum', 'task-completion.ts'), 'utf8');
  const indexSource = readFileSync(join(root, 'extensions', 'ralph-specum', 'index.ts'), 'utf8');
  const evidenceSection = indexSource.match(/function extractCompletionEvidence\([\s\S]*?\n}\n\nfunction validateSubagentCompletion/);
  const validationSection = indexSource.match(/function validateSubagentCompletion\([\s\S]*?\n}\n\nfunction runGitCommand/);

  if (!evidenceSection || !validationSection) {
    expectedFail('parity coverage could not locate completion-evidence parsing for RED_PASS assertions.');
  }

  if (!helperSource.includes("const KEYED_COMPLETION_EVIDENCE_PATTERN = /^(?:verify|verification|evidence):\\s*(.+)$/i;")) {
    expectedFail('task-completion helper must centralize keyed `verify:`/`verification:`/`evidence:` parsing behind one stable completion-evidence pattern.');
  }

  if (!/function\s+extractKeyedCompletionEvidence\(/.test(helperSource) || !/function\s+collectKeyedCompletionEvidence\(/.test(helperSource)) {
    expectedFail('task-completion helper must expose one internal extraction path for keyed completion evidence collection.');
  }

  if (!/parseTaskCompletionFields\([\s\S]*extractKeyedCompletionEvidence/.test(helperSource) || !/hasExpectedFailureProof\([\s\S]*collectKeyedCompletionEvidence/.test(helperSource)) {
    expectedFail('task-completion helper must reuse the centralized keyed-evidence extractor for both completion-field parsing and RED_PASS validation.');
  }

  if (!/RED_PASS/.test(indexSource)) {
    expectedFail('completion validation must explicitly recognize keyed `verify: RED_PASS` proof for `[RED]` TASK_COMPLETE outputs.');
  }

  if (!/\[RED\]|expected-failure|red[-_ ]pass/i.test(validationSection[0])) {
    expectedFail('completion validation must branch on `[RED]` task context so expected failures only count when keyed proof is present.');
  }

  if (!/verify\|verification\|evidence/.test(evidenceSection[0]) || !/RED_PASS/.test(evidenceSection[0])) {
    expectedFail('keyed evidence parsing must require `verify:`/`verification:`/`evidence:` lines to carry `RED_PASS` instead of accepting raw failing output.');
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

async function verifyAcceptanceChecklist() {
  for (const caseName of acceptanceChecklistCases) {
    const verifyCase = cases.get(caseName);
    if (typeof verifyCase !== 'function') {
      throw new Error(`acceptance checklist is missing verifier case ${caseName}`);
    }

    const result = await runVerifierCase(caseName, verifyCase);
    if (!result.ok) {
      throw result.error;
    }
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

function loadTaskCompletionHelper() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'task-completion.ts');
  const helperSource = readFileSync(helperPath, 'utf8');
  const executableSource = transpileTaskCompletionSource(helperSource);
  const context = {
    module: { exports: {} },
    exports: {},
    require: createRequire(import.meta.url),
  };

  vm.runInNewContext(executableSource, context, { filename: helperPath });
  return context.module.exports;
}

function transpileTaskCompletionSource(source) {
  return source
    .replace(/import\s+\{([^}]+)\}\s+from\s+'([^']+)';/g, 'const {$1} = require("$2");')
    .replace(/export\s+type\s+[\s\S]*?;\n/g, '')
    .replace(/export\s+interface\s+[\s\S]*?\n}\n/g, '')
    .replace(/export\s+function\s+analyzeTaskWorkspace\(([^)]*)\)\s*:\s*TaskWorkspaceReport\s*{/m, 'function analyzeTaskWorkspace($1) {')
    .replace(/export\s+function\s+classifyTaskWorkspace\(([^)]*)\)\s*:\s*TaskTopology\s*{/m, 'function classifyTaskWorkspace($1) {')
    .replace(/export\s+function\s+formatTaskWorkspaceReport\(([^)]*)\)\s*:\s*string\s*{/m, 'function formatTaskWorkspaceReport($1) {')
    .replace(/report:\s*TaskWorkspaceReport/g, 'report')
    .replace(/input:\s*TaskWorkspaceInput\s*=\s*{}/g, 'input = {}')
    .replace(/entries:\s*TaskWorkspaceEntry\[\]\s*=\s*\[\]/g, 'entries = []')
    .replace(/\(repoRoot\):\s*repoRoot is string\s*=>\s*Boolean\(repoRoot\)/g, '(repoRoot) => Boolean(repoRoot)')
    .concat('\nmodule.exports = { analyzeTaskWorkspace, classifyTaskWorkspace, formatTaskWorkspaceReport };\n');
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
