#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
const verifierTempPrefixes = ['triage-github-sync-parity-'];
const temporaryFixtureRoots = [];

const cases = new Map([
  ['minimal-state-load', verifyMinimalStateLoad],
  ['minimal-state-repair', verifyMinimalStateRepair],
  ['minimal-state-validation-boundary', verifyMinimalStateValidationBoundary],
  ['output-spec-files', verifyOutputSpecFiles],
  ['output-github-issues', verifyOutputGithubIssues],
  ['output-both', verifyOutputBoth],
  ['github-unconfirmed', verifyGithubUnconfirmed],
  ['github-confirmed-create', verifyGithubConfirmedCreate],
  ['github-metadata-update', verifyGithubMetadataUpdate],
  ['github-missing-labels', verifyGithubMissingLabels],
]);

process.on('exit', () => {
  cleanupTemporaryFixtures();
});

async function main() {
  if (!requestedCase || requestedCase === 'all') {
    const summaries = [];
    for (const [caseName, verifyCase] of cases.entries()) {
      const result = await runVerifierCase(caseName, verifyCase);
      summaries.push(result);
      if (!result.ok) {
        printCaseFailure(result);
        console.error(`FAIL triage github sync parity verifier: ${countPassed(summaries)}/${cases.size} cases passed; failed: ${caseName}`);
        process.exitCode = 1;
        return;
      }
      console.log(formatCasePass(caseName, result));
    }
    console.log(`PASS triage github sync parity verifier: ${summaries.length}/${cases.size} cases passed`);
    return;
  }

  const verifyCase = cases.get(requestedCase);
  if (!verifyCase) {
    console.error(`Unknown verify case: ${requestedCase}`);
    console.error(`Supported cases: ${[...cases.keys()].join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const result = await runVerifierCase(requestedCase, verifyCase);
  if (!result.ok) {
    printCaseFailure(result);
    process.exitCode = 1;
    return;
  }

  console.log(formatCasePass(requestedCase, result));
}

async function runVerifierCase(caseName, verifyCase) {
  try {
    const details = await verifyCase();
    return { name: caseName, ok: true, ...(details ?? {}) };
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

function formatCasePass(caseName, result) {
  const summary = result?.summary;
  return summary ? `PASS ${caseName} (${summary})` : `PASS ${caseName}`;
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

function createFixtureRoot(label) {
  const safeLabel = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const fixtureRoot = mkdtempSync(join(tmpdir(), `triage-github-sync-parity-${safeLabel}-`));
  temporaryFixtureRoots.push(fixtureRoot);
  return fixtureRoot;
}

function cleanupTemporaryFixtures() {
  for (const fixtureRoot of temporaryFixtureRoots.splice(0)) {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function expectedFail(message) {
  const error = new Error(message);
  error.expectedFail = true;
  throw error;
}

async function loadEpicsModule() {
  return import(new URL('../extensions/ralph-specum/epics.ts', import.meta.url));
}

async function loadGithubModule() {
  return import(new URL('../extensions/ralph-specum/github.ts', import.meta.url));
}

async function loadRalphSpecumExtension() {
  return import(new URL('../extensions/ralph-specum/index.ts', import.meta.url));
}

async function verifyMinimalStateLoad() {
  const fixtureRoot = createFixtureRoot('minimal-state-load');
  const epicName = 'demo-epic';
  seedMinimalEpicStateFixture(fixtureRoot, epicName);

  const { safeReadEpicState } = await loadEpicsModule();
  const read = safeReadEpicState(epicName, { cwd: fixtureRoot });
  const state = read.state;

  if (!state) {
    expectedFail(`safeReadEpicState returned no state for fixture: ${read.warnings.join('; ') || 'unknown error'}`);
  }

  const failures = [];
  if (state.name !== epicName) failures.push(`expected name ${JSON.stringify(epicName)} but got ${JSON.stringify(state.name)}`);
  if (state.goal !== 'Keep original epic state resumable') failures.push(`expected goal to be preserved but got ${JSON.stringify(state.goal)}`);

  const childNames = Array.isArray(state.specs) ? state.specs.map((spec) => spec?.name) : [];
  if (JSON.stringify(childNames) !== JSON.stringify(['alpha-child', 'beta-child'])) {
    failures.push(`expected child order alpha-child,beta-child but got ${JSON.stringify(childNames)}`);
  }

  const childStatuses = Array.isArray(state.specs) ? state.specs.map((spec) => spec?.status) : [];
  if (JSON.stringify(childStatuses) !== JSON.stringify(['completed', 'in_progress'])) {
    failures.push(`expected child statuses to be preserved but got ${JSON.stringify(childStatuses)}`);
  }

  const dependencyOrder = Array.isArray(state.specs)
    ? state.specs.map((spec) => Array.isArray(spec?.dependencies) ? [...spec.dependencies] : [])
    : [];
  if (JSON.stringify(dependencyOrder) !== JSON.stringify([
    ['shared-dependency', 'alpha-prereq'],
    ['alpha-child', 'shared-dependency'],
  ])) {
    failures.push(`expected dependency order to be preserved but got ${JSON.stringify(dependencyOrder)}`);
  }

  const normalizedOrders = Array.isArray(state.specs) ? state.specs.map((spec) => spec?.order) : [];
  if (JSON.stringify(normalizedOrders) !== JSON.stringify([0, 1])) {
    failures.push(`expected normalized child order values [0,1] but got ${JSON.stringify(normalizedOrders)}`);
  }

  if (!Array.isArray(read.warnings) || read.warnings.length !== 0) {
    failures.push(`expected normalized minimal read to avoid validation warnings but got ${JSON.stringify(read.warnings)}`);
  }

  if (failures.length > 0) {
    expectedFail(`minimal original epic-state fixture is not normalized on read: ${failures.join('; ')}`);
  }

  return { summary: `loaded ${state.specs.length} child specs from ${root}` };
}

async function verifyMinimalStateRepair() {
  const fixtureRoot = createFixtureRoot('minimal-state-repair');
  const epicName = 'demo-epic';
  const statePath = seedMinimalEpicStateFixture(fixtureRoot, epicName);

  const { mergeEpicState } = await loadEpicsModule();
  mergeEpicState(epicName, {
    output: 'spec-files',
  }, { cwd: fixtureRoot });

  const persisted = JSON.parse(readFileSync(statePath, 'utf8'));
  const failures = [];

  const requiredTopLevelFields = ['schemaVersion', 'basePath', 'epicPath', 'researchPath', 'progressPath', 'createdAt', 'updatedAt', 'validation'];
  for (const field of requiredTopLevelFields) {
    if (!(field in persisted)) {
      failures.push(`expected repair/save to persist missing field ${field}`);
    }
  }

  if (persisted.name !== epicName) failures.push(`expected name ${JSON.stringify(epicName)} to be preserved but got ${JSON.stringify(persisted.name)}`);
  if (persisted.goal !== 'Keep original epic state resumable') failures.push(`expected goal to be preserved but got ${JSON.stringify(persisted.goal)}`);

  const childStatuses = Array.isArray(persisted.specs) ? persisted.specs.map((spec) => spec?.status) : [];
  if (JSON.stringify(childStatuses) !== JSON.stringify(['completed', 'in_progress'])) {
    failures.push(`expected child statuses to be preserved but got ${JSON.stringify(childStatuses)}`);
  }

  const dependencyOrder = Array.isArray(persisted.specs)
    ? persisted.specs.map((spec) => Array.isArray(spec?.dependencies) ? [...spec.dependencies] : [])
    : [];
  if (JSON.stringify(dependencyOrder) !== JSON.stringify([
    ['shared-dependency', 'alpha-prereq'],
    ['alpha-child', 'shared-dependency'],
  ])) {
    failures.push(`expected dependency order to be preserved but got ${JSON.stringify(dependencyOrder)}`);
  }

  if (failures.length > 0) {
    expectedFail(`minimal epic-state repair/save did not backfill Pi-required fields: ${failures.join('; ')}`);
  }

  return { summary: `repaired epic state at ${statePath}` };
}

async function verifyMinimalStateValidationBoundary() {
  const fixtureRoot = createFixtureRoot('minimal-state-validation-boundary');
  const epicName = 'demo-epic';
  seedMinimalEpicStateFixture(fixtureRoot, epicName);

  const { readCompatibleEpicState, readEpicState, validateEpicState } = await loadEpicsModule();
  const compatibleRead = readCompatibleEpicState(epicName, { cwd: fixtureRoot });
  const rawState = readEpicState(epicName, { cwd: fixtureRoot });
  const strictValidation = validateEpicState(rawState);
  const compatibilityWarnings = compatibleRead.compatibilityWarnings;
  const persistedCompatibilityWarnings = compatibleRead.state?.validation?.compatibilityWarnings;

  if (!Array.isArray(compatibilityWarnings) || compatibilityWarnings.length === 0) {
    expectedFail('expected compatibility read to expose normalization warnings for an original minimal fixture');
  }

  if (!Array.isArray(persistedCompatibilityWarnings) || persistedCompatibilityWarnings.length === 0) {
    expectedFail('expected normalized state.validation.compatibilityWarnings to preserve the compatibility warning');
  }

  if (strictValidation.warnings.length > 0) {
    expectedFail(`strict validation still rejects the original minimal fixture before normalization: ${strictValidation.warnings.join('; ')}`);
  }

  return { summary: 'minimal fixture reaches normalization before strict validation' };
}

async function verifyOutputSpecFiles() {
  const fixtureRoot = createFixtureRoot('output-spec-files');
  const epicName = 'demo-epic';
  const ghWriteLogPath = seedSpecFilesTriageFixture(fixtureRoot, epicName);
  const notes = [];
  const originalPath = process.env.PATH;
  process.env.PATH = `${join(fixtureRoot, 'bin')}:${originalPath ?? ''}`;

  try {
    const extensionModule = await loadRalphSpecumExtension();
    const commands = new Map();
    const pi = {
      registerCommand(name, config) {
        commands.set(name, config);
      },
      on() {},
    };
    extensionModule.default(pi);

    const triage = commands.get('ralph-triage');
    if (!triage?.handler) {
      expectedFail('ralph-specum extension did not register a runnable ralph-triage command handler');
    }

    const ctx = {
      cwd: fixtureRoot,
      hasUI: true,
      waitForIdle: async () => {},
      ui: {
        notify(message, type) {
          notes.push({ message, type });
        },
        setStatus() {},
        setFooter() {},
        setWidget() {},
      },
    };

    await triage.handler(epicName, ctx);

    const childNames = ['alpha-child', 'beta-child'];
    await waitFor(
      () => childNames.every((name) => existsSync(join(fixtureRoot, 'specs', name, 'plan.md'))),
      5000,
      'timed out waiting for triage to materialize child spec plans',
    );
    await sleep(100);

    const failures = [];
    const childArtifacts = childNames.map((name) => ({
      name,
      planPath: join(fixtureRoot, 'specs', name, 'plan.md'),
      progressPath: join(fixtureRoot, 'specs', name, '.progress.md'),
      statePath: join(fixtureRoot, 'specs', name, '.ralph-state.json'),
    }));

    for (const artifact of childArtifacts) {
      if (!existsSync(artifact.planPath)) failures.push(`expected plan.md for ${artifact.name}`);
      if (!existsSync(artifact.progressPath)) failures.push(`expected .progress.md for ${artifact.name}`);
      if (!existsSync(artifact.statePath)) failures.push(`expected .ralph-state.json for ${artifact.name}`);
    }

    const epicState = JSON.parse(readFileSync(join(fixtureRoot, 'specs', '_epics', epicName, '.epic-state.json'), 'utf8'));
    if (epicState.output !== 'spec-files') {
      failures.push(`expected triage to persist output spec-files but got ${JSON.stringify(epicState.output)}`);
    }

    const ghWriteCallCount = readWriteCallCount(ghWriteLogPath);
    if (ghWriteCallCount !== 0) {
      failures.push(`expected spec-files triage to perform 0 gh issue create/edit calls but got ${ghWriteCallCount}`);
    }

    if (notes.some(({ message }) => /GitHub issues/i.test(String(message)))) {
      failures.push('spec-files triage unexpectedly announced a GitHub sync phase');
    }

    if (failures.length > 0) {
      expectedFail(`spec-files triage parity failed: ${failures.join('; ')}`);
    }

    return { summary: `materialized ${childArtifacts.length} child specs with ${ghWriteCallCount} gh issue create/edit calls` };
  } finally {
    process.env.PATH = originalPath;
  }
}

async function verifyOutputGithubIssues() {
  const fixtureRoot = createFixtureRoot('output-github-issues');
  const epicName = 'demo-epic';
  const { ghWriteLogPath } = seedGithubBackedTriageFixture(fixtureRoot, epicName, 'github-issues');
  const notes = [];
  const originalPath = process.env.PATH;
  process.env.PATH = `${join(fixtureRoot, 'bin')}:${originalPath ?? ''}`;

  try {
    const triage = await loadRegisteredTriageCommand();
    const ctx = createTriageCtx(fixtureRoot, notes);

    await triage.handler(`--output github-issues --yes ${epicName}`, ctx);
    await sleep(100);

    const childNames = ['alpha-child', 'beta-child'];
    const failures = [];
    const epicState = JSON.parse(readFileSync(join(fixtureRoot, 'specs', '_epics', epicName, '.epic-state.json'), 'utf8'));
    const ghWriteCallCount = readWriteCallCount(ghWriteLogPath);

    if (epicState.output !== 'github-issues') {
      failures.push(`expected triage to persist output github-issues but got ${JSON.stringify(epicState.output)}`);
    }

    if (ghWriteCallCount <= 0) {
      failures.push('expected github-issues triage to perform mocked gh issue create/edit calls');
    }

    if (!['created', 'updated', 'synced'].includes(epicState.githubStatus)) {
      failures.push(`expected epic githubStatus to record a successful sync but got ${JSON.stringify(epicState.githubStatus)}`);
    }

    if (typeof epicState.issueNumber !== 'number' || typeof epicState.issueUrl !== 'string') {
      failures.push(`expected epic GitHub issue metadata to persist but got issueNumber=${JSON.stringify(epicState.issueNumber)} issueUrl=${JSON.stringify(epicState.issueUrl)}`);
    }

    const childIssueNumbers = Array.isArray(epicState.specs) ? epicState.specs.map((spec) => spec?.issueNumber) : [];
    if (JSON.stringify(childIssueNumbers.map((value) => typeof value === 'number')) !== JSON.stringify([true, true])) {
      failures.push(`expected child issue numbers to persist for both child specs but got ${JSON.stringify(childIssueNumbers)}`);
    }

    const syncedTotal = epicState.github?.summary?.total;
    if (syncedTotal !== 3) {
      failures.push(`expected github summary total to be 3 (epic + 2 child issues) but got ${JSON.stringify(syncedTotal)}`);
    }

    for (const name of childNames) {
      if (existsSync(join(fixtureRoot, 'specs', name))) {
        failures.push(`expected github-issues triage to skip child spec directory ${name}`);
      }
    }

    if (ghWriteCallCount !== 3) {
      failures.push(`expected github-issues triage to perform 3 gh issue create/edit calls but got ${ghWriteCallCount}`);
    }

    if (notes.some(({ message }) => /plan\.md|materializ/i.test(String(message)))) {
      failures.push('github-issues triage unexpectedly announced child spec materialization');
    }

    if (failures.length > 0) {
      expectedFail(`github-issues triage parity failed: ${failures.join('; ')}`);
    }

    return { summary: `synced ${ghWriteCallCount} GitHub issues with 0 child spec directories created` };
  } finally {
    process.env.PATH = originalPath;
  }
}

async function verifyOutputBoth() {
  const fixtureRoot = createFixtureRoot('output-both');
  const epicName = 'demo-epic';
  const { ghWriteLogPath } = seedGithubBackedTriageFixture(fixtureRoot, epicName, 'both');
  const notes = [];
  const originalPath = process.env.PATH;
  process.env.PATH = `${join(fixtureRoot, 'bin')}:${originalPath ?? ''}`;

  try {
    const triage = await loadRegisteredTriageCommand();
    const ctx = createTriageCtx(fixtureRoot, notes);

    await triage.handler(`--output both --yes ${epicName}`, ctx);

    const childNames = ['alpha-child', 'beta-child'];
    await waitFor(
      () => childNames.every((name) => existsSync(join(fixtureRoot, 'specs', name, 'plan.md'))),
      5000,
      'timed out waiting for triage to materialize child spec plans for output both',
    );
    await sleep(100);

    const failures = [];
    const epicState = JSON.parse(readFileSync(join(fixtureRoot, 'specs', '_epics', epicName, '.epic-state.json'), 'utf8'));
    const ghWriteCallCount = readWriteCallCount(ghWriteLogPath);

    if (epicState.output !== 'both') {
      failures.push(`expected triage to persist output both but got ${JSON.stringify(epicState.output)}`);
    }

    if (ghWriteCallCount !== 3) {
      failures.push(`expected both triage to perform 3 gh issue create/edit calls but got ${ghWriteCallCount}`);
    }

    if (typeof epicState.issueNumber !== 'number' || typeof epicState.issueUrl !== 'string' || !epicState.githubStatus) {
      failures.push(`expected epic GitHub issue metadata to persist but got issueNumber=${JSON.stringify(epicState.issueNumber)} issueUrl=${JSON.stringify(epicState.issueUrl)} githubStatus=${JSON.stringify(epicState.githubStatus)}`);
    }

    const syncedTotal = epicState.github?.summary?.total;
    if (syncedTotal !== 3) {
      failures.push(`expected github summary total to be 3 (epic + 2 child issues) but got ${JSON.stringify(syncedTotal)}`);
    }

    for (const [index, name] of childNames.entries()) {
      const childDir = join(fixtureRoot, 'specs', name);
      const planPath = join(childDir, 'plan.md');
      const progressPath = join(childDir, '.progress.md');
      const statePath = join(childDir, '.ralph-state.json');
      const childSpec = epicState.specs?.[index];
      const plan = existsSync(planPath) ? readFileSync(planPath, 'utf8') : '';
      const expectedIssueLine = `GitHub Issue: ${childSpec?.issueUrl}`;

      if (!existsSync(planPath)) failures.push(`expected plan.md for ${name}`);
      if (!existsSync(progressPath)) failures.push(`expected .progress.md for ${name}`);
      if (!existsSync(statePath)) failures.push(`expected .ralph-state.json for ${name}`);
      if (typeof childSpec?.issueNumber !== 'number' || typeof childSpec?.issueUrl !== 'string' || !childSpec?.githubStatus) {
        failures.push(`expected child GitHub metadata for ${name} but got ${JSON.stringify(childSpec)}`);
      }
      if (!plan.includes(expectedIssueLine)) {
        failures.push(`expected ${name} plan to include ${JSON.stringify(expectedIssueLine)} but it did not`);
      }
    }

    if (notes.some(({ message }) => /skip.*GitHub/i.test(String(message)))) {
      failures.push('both triage unexpectedly reported skipped GitHub sync');
    }

    if (failures.length > 0) {
      expectedFail(`both triage parity failed: ${failures.join('; ')}`);
    }

    return {
      summary: `synced ${ghWriteCallCount} GitHub issues and cross-linked ${childNames.length} child plans with persisted issue metadata`,
    };
  } finally {
    process.env.PATH = originalPath;
  }
}

async function verifyGithubUnconfirmed() {
  const headlessReason = 'GitHub issue output requires Pi UI confirmation or --yes in noninteractive mode; no GitHub issues were created.';
  const cancelledReason = 'User cancelled GitHub issue creation; no GitHub issues were created.';

  const headless = await runUnconfirmedGithubScenario({
    label: 'github-unconfirmed-headless',
    ctxFactory: (fixtureRoot, notes) => ({
      cwd: fixtureRoot,
      hasUI: false,
      waitForIdle: async () => {},
      ui: {
        notify(message, type) {
          notes.push({ message, type });
        },
        setStatus() {},
        setFooter() {},
        setWidget() {},
      },
    }),
  });

  const cancelled = await runUnconfirmedGithubScenario({
    label: 'github-unconfirmed-cancelled',
    ctxFactory: (fixtureRoot, notes) => ({
      cwd: fixtureRoot,
      hasUI: true,
      waitForIdle: async () => {},
      ui: {
        notify(message, type) {
          notes.push({ message, type });
        },
        confirm: async () => false,
        setStatus() {},
        setFooter() {},
        setWidget() {},
      },
    }),
  });

  const failures = [];
  assertUnconfirmedGithubOutcome(headless, headlessReason, 'headless-without-yes', failures, { requireNotifiedMessage: false });
  assertUnconfirmedGithubOutcome(cancelled, cancelledReason, 'interactive-cancel', failures, { requireNotifiedMessage: true });

  if (failures.length > 0) {
    expectedFail(`unconfirmed GitHub sync parity failed: ${failures.join('; ')}`);
  }

  return {
    summary: `skipped GitHub writes for headless and cancelled flows with ${headless.ghWriteCallCount + cancelled.ghWriteCallCount} gh issue create/edit calls`,
  };
}

async function verifyGithubConfirmedCreate() {
  const fixtureRoot = createFixtureRoot('github-confirmed-create');
  const epicName = 'demo-epic';
  const { ghWriteLogPath, ghWriteArgsLogPath } = seedGithubBackedTriageFixture(fixtureRoot, epicName, 'github-issues');
  const notes = [];
  const originalPath = process.env.PATH;
  process.env.PATH = `${join(fixtureRoot, 'bin')}:${originalPath ?? ''}`;

  try {
    const triage = await loadRegisteredTriageCommand();
    const ctx = createTriageCtx(fixtureRoot, notes);

    await triage.handler(`--output github-issues --yes ${epicName}`, ctx);
    await sleep(100);

    const failures = [];
    const epicState = JSON.parse(readFileSync(join(fixtureRoot, 'specs', '_epics', epicName, '.epic-state.json'), 'utf8'));
    const ghWriteCallCount = readWriteCallCount(ghWriteLogPath);
    const ghWriteCalls = readGhWriteCalls(ghWriteArgsLogPath);
    const createCalls = ghWriteCalls.filter((call) => call[0] === 'issue' && call[1] === 'create');
    const createBodies = createCalls.map((call) => flagValue(call, '--body')).filter((value) => typeof value === 'string');
    const metadataBodies = createBodies.filter((body) => body.includes('<!-- ralph-specum:') && body.includes('## Ralph metadata'));

    if (epicState.output !== 'github-issues') {
      failures.push(`expected confirmed sync to persist output github-issues but got ${JSON.stringify(epicState.output)}`);
    }

    if (ghWriteCallCount !== 3) {
      failures.push(`expected confirmed sync to perform 3 gh issue create/edit calls but got ${ghWriteCallCount}`);
    }

    if (createCalls.length !== 3) {
      failures.push(`expected confirmed sync to perform 3 gh issue create calls but got ${createCalls.length}`);
    }

    if (metadataBodies.length !== 3) {
      failures.push(`expected all 3 gh issue create payloads to include the ralph-specum HTML metadata comment but saw ${metadataBodies.length}`);
    }

    if (typeof epicState.issueNumber !== 'number' || epicState.issueNumber !== 101) {
      failures.push(`expected epic issueNumber 101 after confirmed create but got ${JSON.stringify(epicState.issueNumber)}`);
    }

    if (epicState.issueUrl !== 'https://github.com/octocat/demo-repo/issues/101') {
      failures.push(`expected epic issueUrl to persist the created URL but got ${JSON.stringify(epicState.issueUrl)}`);
    }

    if (epicState.githubStatus !== 'created') {
      failures.push(`expected epic githubStatus created after confirmed sync but got ${JSON.stringify(epicState.githubStatus)}`);
    }

    if (epicState.github?.epicIssue?.issueNumber !== 101 || epicState.github?.epicIssue?.issueUrl !== 'https://github.com/octocat/demo-repo/issues/101') {
      failures.push(`expected nested github epicIssue refs to persist created epic metadata but got ${JSON.stringify(epicState.github?.epicIssue)}`);
    }

    if (epicState.github?.summary?.total !== 3 || epicState.github?.summary?.created !== 3) {
      failures.push(`expected github summary to record 3 created issues but got ${JSON.stringify(epicState.github?.summary)}`);
    }

    if (notes.some(({ message }) => /skip.*GitHub/i.test(String(message)))) {
      failures.push('confirmed sync unexpectedly reported skipped GitHub output');
    }

    if (failures.length > 0) {
      expectedFail(`confirmed GitHub create parity failed: ${failures.join('; ')}`);
    }

    return {
      summary: `created ${createCalls.length} GitHub issues with metadata comments and persisted epic refs ${epicState.issueNumber}/${epicState.githubStatus}`,
    };
  } finally {
    process.env.PATH = originalPath;
  }
}

async function verifyGithubMetadataUpdate() {
  const {
    createOrUpdateEpicIssue,
    ralphGithubMetadataComment,
    RALPH_GITHUB_METADATA_SCHEMA_VERSION,
    RALPH_GITHUB_METADATA_TOOL,
  } = await loadGithubModule();

  const repository = {
    owner: 'octocat',
    name: 'demo-repo',
    nameWithOwner: 'octocat/demo-repo',
    url: 'https://github.com/octocat/demo-repo',
  };
  const state = {
    name: 'demo-epic',
    goal: 'Update the existing epic issue via metadata lookup.',
    output: 'github-issues',
    specs: [],
    issueNumber: null,
  };
  const metadataComment = ralphGithubMetadataComment({
    tool: RALPH_GITHUB_METADATA_TOOL,
    schemaVersion: RALPH_GITHUB_METADATA_SCHEMA_VERSION,
    kind: 'epic',
    epicName: state.name,
  });
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (args[0] === 'issue' && args[1] === 'list') {
      return {
        status: 0,
        stdout: JSON.stringify([{ number: 101, url: 'https://github.com/octocat/demo-repo/issues/101', body: `Existing issue body\n\n${metadataComment}\n` }]),
        stderr: '',
      };
    }
    if (args[0] === 'issue' && args[1] === 'edit') {
      return {
        status: 0,
        stdout: 'https://github.com/octocat/demo-repo/issues/101',
        stderr: '',
      };
    }
    if (args[0] === 'issue' && args[1] === 'create') {
      return {
        status: 0,
        stdout: 'https://github.com/octocat/demo-repo/issues/999',
        stderr: '',
      };
    }
    return {
      status: 1,
      stdout: '',
      stderr: `unexpected command: ${args.join(' ')}`,
    };
  };

  const result = createOrUpdateEpicIssue(state, { repository, runner });
  const failures = [];
  const createCalls = calls.filter((args) => args[0] === 'issue' && args[1] === 'create');
  const editCalls = calls.filter((args) => args[0] === 'issue' && args[1] === 'edit');
  const listCalls = calls.filter((args) => args[0] === 'issue' && args[1] === 'list');

  if (result.action !== 'updated' || result.operation !== 'update') {
    failures.push(`expected metadata lookup to choose update but got action=${JSON.stringify(result.action)} operation=${JSON.stringify(result.operation)}`);
  }

  if (result.issueNumber !== 101 || result.issueUrl !== 'https://github.com/octocat/demo-repo/issues/101') {
    failures.push(`expected metadata lookup to reuse issue 101 but got issueNumber=${JSON.stringify(result.issueNumber)} issueUrl=${JSON.stringify(result.issueUrl)}`);
  }

  if (result.issueNumberSource !== 'metadata') {
    failures.push(`expected metadata lookup source to be metadata but got ${JSON.stringify(result.issueNumberSource)}`);
  }

  if (listCalls.length !== 1) {
    failures.push(`expected exactly one gh issue list lookup but got ${listCalls.length}`);
  }

  if (editCalls.length !== 1) {
    failures.push(`expected exactly one gh issue edit call but got ${editCalls.length}`);
  }

  if (createCalls.length !== 0) {
    failures.push(`expected no gh issue create call when metadata lookup finds a match but got ${createCalls.length}`);
  }

  if (!Array.isArray(result.lookupCommands) || result.lookupCommands.length !== 1 || result.lookupCommands[0]?.[0] !== 'issue' || result.lookupCommands[0]?.[1] !== 'list') {
    failures.push(`expected lookupCommands to record one gh issue list call but got ${JSON.stringify(result.lookupCommands)}`);
  }

  if (!Array.isArray(result.writeCommand) || result.writeCommand[0] !== 'issue' || result.writeCommand[1] !== 'edit' || !result.writeCommand.includes('101')) {
    failures.push(`expected writeCommand to target gh issue edit 101 but got ${JSON.stringify(result.writeCommand)}`);
  }

  if (!result.body.includes(metadataComment)) {
    failures.push('expected updated issue body to retain the ralph-specum metadata comment');
  }

  if (JSON.stringify(result.stateIssueNumberPatch) !== JSON.stringify({ issueNumber: 101 })) {
    failures.push(`expected stateIssueNumberPatch to backfill issueNumber 101 but got ${JSON.stringify(result.stateIssueNumberPatch)}`);
  }

  if (failures.length > 0) {
    expectedFail(`metadata lookup update parity failed: ${failures.join('; ')}`);
  }

  return {
    summary: `updated existing issue ${result.issueNumber} via metadata lookup with ${editCalls.length} gh issue edit call and ${createCalls.length} create calls`,
  };
}

async function verifyGithubMissingLabels() {
  const fixtureRoot = createFixtureRoot('github-missing-labels');
  const epicName = 'demo-epic';
  const { ghWriteLogPath, ghWriteArgsLogPath } = seedGithubBackedTriageFixture(fixtureRoot, epicName, 'github-issues');
  const notes = [];
  const originalPath = process.env.PATH;
  process.env.PATH = `${join(fixtureRoot, 'bin')}:${originalPath ?? ''}`;

  try {
    const triage = await loadRegisteredTriageCommand();
    const ctx = createTriageCtx(fixtureRoot, notes);

    await triage.handler(`--output github-issues --yes ${epicName}`, ctx);
    await sleep(100);

    const failures = [];
    const epicState = JSON.parse(readFileSync(join(fixtureRoot, 'specs', '_epics', epicName, '.epic-state.json'), 'utf8'));
    const ghWriteCallCount = readWriteCallCount(ghWriteLogPath);
    const ghWriteCalls = readGhWriteCalls(ghWriteArgsLogPath);
    const issueWrites = ghWriteCalls.filter((call) => call[0] === 'issue' && (call[1] === 'create' || call[1] === 'edit'));
    const attachedLabels = issueWrites.flatMap((call) => call.flatMap((arg, index) => (arg === '--label' || arg === '--add-label') ? [call[index + 1] ?? null] : []).filter(Boolean));
    const expectedSummaryMissingLabels = ['ralph', 'epic', 'spec'];
    const actualSummaryMissingLabels = epicState.github?.summary?.missingLabels ?? [];
    const epicMissingLabels = epicState.github?.epicIssue?.result?.missingLabels ?? [];
    const childAlphaMissingLabels = epicState.github?.childIssues?.['alpha-child']?.result?.missingLabels ?? [];
    const childBetaMissingLabels = epicState.github?.childIssues?.['beta-child']?.result?.missingLabels ?? [];
    const githubWarnings = epicState.github?.warnings ?? [];

    if (ghWriteCallCount !== 3) {
      failures.push(`expected missing-label sync to perform 3 gh issue create/edit calls but got ${ghWriteCallCount}`);
    }

    if (attachedLabels.length !== 0) {
      failures.push(`expected unavailable labels to be omitted from gh write args but saw ${JSON.stringify(attachedLabels)}`);
    }

    if (JSON.stringify(actualSummaryMissingLabels) !== JSON.stringify(expectedSummaryMissingLabels)) {
      failures.push(`expected github.summary.missingLabels ${JSON.stringify(expectedSummaryMissingLabels)} but got ${JSON.stringify(actualSummaryMissingLabels)}`);
    }

    if (JSON.stringify(epicMissingLabels) !== JSON.stringify(['ralph', 'epic'])) {
      failures.push(`expected epic issue result missingLabels ["ralph","epic"] but got ${JSON.stringify(epicMissingLabels)}`);
    }

    if (JSON.stringify(childAlphaMissingLabels) !== JSON.stringify(['ralph', 'spec'])) {
      failures.push(`expected alpha-child missingLabels ["ralph","spec"] but got ${JSON.stringify(childAlphaMissingLabels)}`);
    }

    if (JSON.stringify(childBetaMissingLabels) !== JSON.stringify(['ralph', 'spec'])) {
      failures.push(`expected beta-child missingLabels ["ralph","spec"] but got ${JSON.stringify(childBetaMissingLabels)}`);
    }

    if (!Array.isArray(githubWarnings) || githubWarnings.length === 0 || !githubWarnings.some((warning) => /missing label/i.test(String(warning)))) {
      failures.push(`expected github.warnings to record missing-label warnings but got ${JSON.stringify(githubWarnings)}`);
    }

    if (notes.some(({ message }) => /label create|auto-create/i.test(String(message)))) {
      failures.push(`expected missing-label sync to avoid auto-create messaging but got ${JSON.stringify(notes.map(({ message }) => message))}`);
    }

    if (failures.length > 0) {
      expectedFail(`missing-label parity failed: ${failures.join('; ')}`);
    }

    return {
      summary: `omitted ${attachedLabels.length} unavailable gh labels while recording ${actualSummaryMissingLabels.length} missing labels`,
    };
  } finally {
    process.env.PATH = originalPath;
  }
}

function seedSpecFilesTriageFixture(fixtureRoot, epicName) {
  const epicDir = join(fixtureRoot, 'specs', '_epics', epicName);
  mkdirSync(epicDir, { recursive: true });
  writeFileSync(join(epicDir, 'epic.md'), [
    `# Epic: ${epicName}`,
    '',
    '## Specs',
    '',
    '### Spec 1: alpha-child',
    '**Goal**: Materialize the alpha child plan.',
    '**Dependencies**: None',
    '',
    '### Spec 2: beta-child',
    '**Goal**: Materialize the beta child plan.',
    '**Dependencies**: alpha-child',
    '',
  ].join('\n'));
  writeFileSync(join(epicDir, '.epic-state.json'), `${JSON.stringify({
    name: epicName,
    goal: 'Materialize child spec artifacts only',
    output: 'spec-files',
    specs: [
      {
        name: 'alpha-child',
        goal: 'Materialize the alpha child plan.',
        status: 'pending',
        dependencies: [],
      },
      {
        name: 'beta-child',
        goal: 'Materialize the beta child plan.',
        status: 'pending',
        dependencies: ['alpha-child'],
      },
    ],
  }, null, 2)}\n`);

  const binDir = join(fixtureRoot, 'bin');
  mkdirSync(binDir, { recursive: true });
  const ghWriteLogPath = join(fixtureRoot, 'gh-write-calls.log');
  writeFileSync(join(binDir, 'gh'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"issue create"* || "$*" == *"issue edit"* ]]; then
  printf '%s\n' "$*" >> ${JSON.stringify(ghWriteLogPath)}
fi
exit 0
`);
  chmodSync(join(binDir, 'gh'), 0o755);
  return ghWriteLogPath;
}

function seedGithubIssuesTriageFixture(fixtureRoot, epicName) {
  return seedGithubBackedTriageFixture(fixtureRoot, epicName, 'github-issues').ghWriteLogPath;
}

function seedGithubBackedTriageFixture(fixtureRoot, epicName, output) {
  const epicDir = join(fixtureRoot, 'specs', '_epics', epicName);
  mkdirSync(epicDir, { recursive: true });
  writeFileSync(join(epicDir, 'epic.md'), [
    `# Epic: ${epicName}`,
    '',
    '## Specs',
    '',
    '### Spec 1: alpha-child',
    '**Goal**: Sync the alpha child issue only.',
    '**Dependencies**: None',
    '',
    '### Spec 2: beta-child',
    '**Goal**: Sync the beta child issue only.',
    '**Dependencies**: alpha-child',
    '',
  ].join('\n'));
  writeFileSync(join(epicDir, '.epic-state.json'), `${JSON.stringify({
    name: epicName,
    goal: output === 'both' ? 'Sync GitHub issues and materialize child specs' : 'Sync GitHub issues without child spec directories',
    output,
    specs: [
      {
        name: 'alpha-child',
        goal: 'Sync the alpha child issue only.',
        status: 'pending',
        dependencies: [],
      },
      {
        name: 'beta-child',
        goal: 'Sync the beta child issue only.',
        status: 'pending',
        dependencies: ['alpha-child'],
      },
    ],
  }, null, 2)}\n`);

  const binDir = join(fixtureRoot, 'bin');
  mkdirSync(binDir, { recursive: true });
  const ghWriteLogPath = join(fixtureRoot, 'gh-write-calls.log');
  const ghWriteArgsLogPath = join(fixtureRoot, 'gh-write-args.jsonl');
  const ghCounterPath = join(fixtureRoot, 'gh-issue-counter.txt');
  writeFileSync(join(binDir, 'gh'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  echo 'gh version 2.52.0'
  exit 0
fi
if [[ "\${1:-}" == "repo" && "\${2:-}" == "view" ]]; then
  echo '{"name":"demo-repo","owner":{"login":"octocat"},"url":"https://github.com/octocat/demo-repo"}'
  exit 0
fi
if [[ "\${1:-}" == "auth" && "\${2:-}" == "status" ]]; then
  echo 'Logged in to github.com as octocat'
  exit 0
fi
if [[ "\${1:-}" == "label" && "\${2:-}" == "list" ]]; then
  echo '[]'
  exit 0
fi
if [[ "\${1:-}" == "issue" && "\${2:-}" == "list" ]]; then
  echo '[]'
  exit 0
fi
if [[ "\${1:-}" == "issue" && ( "\${2:-}" == "create" || "\${2:-}" == "edit" ) ]]; then
  printf 'WRITE %s %s\n' "\${1:-}" "\${2:-}" >> ${JSON.stringify(ghWriteLogPath)}
  node -e 'const fs=require("fs"); fs.appendFileSync(process.argv[1], JSON.stringify(process.argv.slice(2))+"\\n")' ${JSON.stringify(ghWriteArgsLogPath)} "$@"
fi
if [[ "\${1:-}" == "issue" && "\${2:-}" == "create" ]]; then
  next=101
  if [[ -f ${JSON.stringify(ghCounterPath)} ]]; then
    next=$(( $(cat ${JSON.stringify(ghCounterPath)}) + 1 ))
  fi
  printf '%s' "$next" > ${JSON.stringify(ghCounterPath)}
  echo "https://github.com/octocat/demo-repo/issues/$next"
  exit 0
fi
if [[ "\${1:-}" == "issue" && "\${2:-}" == "edit" ]]; then
  echo 'https://github.com/octocat/demo-repo/issues/101'
  exit 0
fi
exit 0
`);
  chmodSync(join(binDir, 'gh'), 0o755);
  return { ghWriteLogPath, ghWriteArgsLogPath };
}

async function loadRegisteredTriageCommand() {
  const extensionModule = await loadRalphSpecumExtension();
  const commands = new Map();
  const pi = {
    registerCommand(name, config) {
      commands.set(name, config);
    },
    on() {},
  };
  extensionModule.default(pi);

  const triage = commands.get('ralph-triage');
  if (!triage?.handler) {
    expectedFail('ralph-specum extension did not register a runnable ralph-triage command handler');
  }
  return triage;
}

function createTriageCtx(cwd, notes) {
  return {
    cwd,
    hasUI: true,
    waitForIdle: async () => {},
    ui: {
      notify(message, type) {
        notes.push({ message, type });
      },
      confirm: async () => true,
      setStatus() {},
      setFooter() {},
      setWidget() {},
    },
  };
}

async function runUnconfirmedGithubScenario({ label, ctxFactory }) {
  const fixtureRoot = createFixtureRoot(label);
  const epicName = 'demo-epic';
  const { ghWriteLogPath } = seedGithubBackedTriageFixture(fixtureRoot, epicName, 'github-issues');
  const notes = [];
  const originalPath = process.env.PATH;
  process.env.PATH = `${join(fixtureRoot, 'bin')}:${originalPath ?? ''}`;

  try {
    const triage = await loadRegisteredTriageCommand();
    const ctx = ctxFactory(fixtureRoot, notes);
    await triage.handler(`--output github-issues ${epicName}`, ctx);
    await sleep(100);

    return {
      notes,
      ghWriteCallCount: readWriteCallCount(ghWriteLogPath),
      epicState: JSON.parse(readFileSync(join(fixtureRoot, 'specs', '_epics', epicName, '.epic-state.json'), 'utf8')),
    };
  } finally {
    process.env.PATH = originalPath;
  }
}

function assertUnconfirmedGithubOutcome(result, expectedReason, scenarioName, failures, options = {}) {
  if (result.ghWriteCallCount !== 0) {
    failures.push(`expected ${scenarioName} to perform 0 gh issue create/edit calls but got ${result.ghWriteCallCount}`);
  }

  if (result.epicState.output !== 'github-issues') {
    failures.push(`expected ${scenarioName} to persist output github-issues but got ${JSON.stringify(result.epicState.output)}`);
  }

  if (result.epicState.githubStatus !== 'confirmation_required') {
    failures.push(`expected ${scenarioName} githubStatus confirmation_required but got ${JSON.stringify(result.epicState.githubStatus)}`);
  }

  if (result.epicState.issueNumber != null || result.epicState.issueUrl != null) {
    failures.push(`expected ${scenarioName} to avoid persisting epic issue refs but got issueNumber=${JSON.stringify(result.epicState.issueNumber)} issueUrl=${JSON.stringify(result.epicState.issueUrl)}`);
  }

  if (result.epicState.github?.status !== 'skipped') {
    failures.push(`expected ${scenarioName} github.status skipped but got ${JSON.stringify(result.epicState.github?.status)}`);
  }

  if (result.epicState.github?.confirmedBy !== 'not-confirmed') {
    failures.push(`expected ${scenarioName} confirmedBy not-confirmed but got ${JSON.stringify(result.epicState.github?.confirmedBy)}`);
  }

  if (result.epicState.github?.summary?.skippedReason !== expectedReason) {
    failures.push(`expected ${scenarioName} skippedReason ${JSON.stringify(expectedReason)} but got ${JSON.stringify(result.epicState.github?.summary?.skippedReason)}`);
  }

  if (!Array.isArray(result.epicState.github?.warnings) || !result.epicState.github.warnings.includes(expectedReason)) {
    failures.push(`expected ${scenarioName} github warnings to include ${JSON.stringify(expectedReason)} but got ${JSON.stringify(result.epicState.github?.warnings)}`);
  }

  const notifiedMessages = result.notes.map(({ message }) => String(message));
  if (options.requireNotifiedMessage && !notifiedMessages.some((message) => message.includes(expectedReason))) {
    failures.push(`expected ${scenarioName} output to mention skipped reason ${JSON.stringify(expectedReason)} but got ${JSON.stringify(notifiedMessages)}`);
  }
}

function readWriteCallCount(logPath) {
  if (!existsSync(logPath)) return 0;
  return readFileSync(logPath, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

function readGhWriteCalls(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function flagValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

async function waitFor(check, timeoutMs, errorMessage) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(50);
  }
  throw new Error(errorMessage);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seedMinimalEpicStateFixture(fixtureRoot, epicName) {
  const epicDir = join(fixtureRoot, 'specs', '_epics', epicName);
  mkdirSync(epicDir, { recursive: true });
  const statePath = join(epicDir, '.epic-state.json');
  writeFileSync(statePath, `${JSON.stringify({
    name: epicName,
    goal: 'Keep original epic state resumable',
    specs: [
      {
        name: 'alpha-child',
        status: 'completed',
        dependencies: ['shared-dependency', 'alpha-prereq'],
      },
      {
        name: 'beta-child',
        status: 'in_progress',
        dependencies: ['alpha-child', 'shared-dependency'],
      },
    ],
  }, null, 2)}\n`);
  return statePath;
}

await main();
