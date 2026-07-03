#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
let activeCase = requestedCase;

const cases = new Map([
  ['command-registration', verifyCommandRegistration],
]);

async function main() {
  if (!requestedCase || requestedCase === 'all') {
    const summaries = [];

    for (const [caseName, verifyCase] of cases.entries()) {
      const result = await runVerifierCase(caseName, verifyCase);
      summaries.push(result);
      if (!result.ok) {
        printCaseFailure(result);
        console.error(`FAIL refactor parity verifier: ${countPassed(summaries)}/${cases.size} cases passed; failed: ${caseName}`);
        process.exitCode = 1;
        return;
      }
      console.log(`PASS ${caseName}`);
    }

    console.log(`PASS refactor parity verifier: ${summaries.length}/${cases.size} cases passed`);
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

async function verifyCommandRegistration() {
  const commandSourcePath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const source = readFileSync(commandSourcePath, 'utf8');
  const failures = [];

  if (!/\.registerCommand\(\s*["']ralph-refactor["']\s*,/m.test(source)) {
    failures.push('pi.registerCommand("ralph-refactor", ...) is absent');
  }

  const requiredDocumentationTokens = [
    '/ralph-refactor',
    '--file',
    'requirements',
    'design',
    'tasks',
  ];
  const missingDocumentationTokens = requiredDocumentationTokens.filter((token) => !source.includes(token));
  if (missingDocumentationTokens.length > 0) {
    failures.push(`help/status documentation is missing ${missingDocumentationTokens.join(', ')}`);
  }

  const parseRefactorArgs = await loadParseRefactorArgs();
  const validResult = parseRefactorArgs(['sample-spec', '--file=requirements']);
  if (validResult?.ok !== true) {
    failures.push(`valid --file=requirements parse must succeed; got ${stringifyParseResult(validResult)}`);
  }

  const invalidResult = parseRefactorArgs(['sample-spec', '--file=notes']);
  const invalidOk = invalidResult?.ok === true;
  const invalidText = String(invalidResult?.error?.message ?? invalidResult?.error ?? invalidResult?.message ?? '');
  if (invalidOk || !invalidText.includes('--file') || !/requirements|design|tasks/.test(invalidText)) {
    failures.push(`invalid --file values must be rejected with enum guidance; got ${stringifyParseResult(invalidResult)}`);
  }

  if (failures.length > 0) {
    expectedFail(`command registration source inspection failed for ${commandSourcePath}: ${failures.join('; ')}`);
  }
}

async function loadParseRefactorArgs() {
  const helper = await loadRefactorHelper();
  const parseRefactorArgs = helper?.parseRefactorArgs;

  if (typeof parseRefactorArgs !== 'function') {
    expectedFail('parseRefactorArgs is not exported from extensions/ralph-specum/refactor.ts yet.');
  }

  return parseRefactorArgs;
}

async function loadRefactorHelper() {
  const helperUrl = new URL('../extensions/ralph-specum/refactor.ts', import.meta.url);
  try {
    return await import(helperUrl.href);
  } catch (error) {
    if (isExpectedMissingHelperError(error)) return null;
    throw error;
  }
}

function stringifyParseResult(result) {
  return JSON.stringify(result, (_key, value) => {
    if (value instanceof Error) return { message: value.message };
    return value;
  });
}

function isExpectedMissingHelperError(error) {
  const message = String(error?.message ?? '');
  return (
    error?.code === 'ERR_MODULE_NOT_FOUND' ||
    error?.code === 'ERR_UNKNOWN_FILE_EXTENSION' ||
    message.includes('Cannot find module') ||
    message.includes('Unknown file extension') ||
    message.includes('/extensions/ralph-specum/refactor.ts')
  );
}

function expectedFail(message) {
  const error = new Error(message);
  error.expectedFail = true;
  error.caseName = activeCase;
  throw error;
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
