#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
let activeCase = requestedCase;

const cleanupCaseKey = 'cleanup';
const cases = new Map([
  ['topology-helper-contract', verifyTopologyHelperContract],
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

  if (!/return\s*{\s*topology,\s*entries\s*,?\s*}/s.test(helperSource)) {
    expectedFail('task-completion helper must return a minimal workspace report containing topology and entries.');
  }
}

function expectedFail(message) {
  const error = new Error(message);
  error.expectedFail = true;
  throw error;
}

await main();
