#!/usr/bin/env node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
