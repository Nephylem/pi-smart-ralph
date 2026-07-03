#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
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

const cleanupCaseKey = 'cleanup';
const cases = new Map([
  ['topology-helper-contract', verifyTopologyHelperContract],
  ['topology-classification-fixtures', verifyTopologyClassificationFixtures],
  ['topology-input-normalization', verifyTopologyInputNormalization],
  ['commit-mode-derivation', verifyCommitModeDerivation],
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

    console.log(`PASS task-blockers parity verifier: ${summaries.length}/${cases.size} cases passed`);
    return;
  }

  if (requestedCase === cleanupCaseKey) {
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
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
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
    .replace(/input:\s*TaskWorkspaceInput\s*=\s*{}/g, 'input = {}')
    .replace(/entries:\s*TaskWorkspaceEntry\[\]\s*=\s*\[\]/g, 'entries = []')
    .replace(/\(repoRoot\):\s*repoRoot is string\s*=>\s*Boolean\(repoRoot\)/g, '(repoRoot) => Boolean(repoRoot)')
    .concat('\nmodule.exports = { analyzeTaskWorkspace, classifyTaskWorkspace };\n');
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

function expectedFail(message) {
  const error = new Error(message);
  error.expectedFail = true;
  throw error;
}

await main();
