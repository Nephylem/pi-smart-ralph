#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
let activeCase = requestedCase;

const cases = new Map([
  ['command-registration', verifyCommandRegistration],
  ['spec-resolution', verifySpecResolution],
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

async function verifySpecResolution() {
  const resolveRefactorSpecPlan = await loadResolveRefactorSpecPlan();
  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-refactor-spec-resolution-'));

  try {
    const projectRoot = join(tempRoot, 'project');
    const configuredSpecRoot = join(projectRoot, 'custom-specs');
    const explicitSpecRoot = join(configuredSpecRoot, 'explicit-target');
    const currentSpecRoot = join(configuredSpecRoot, 'current-target');
    const emptySpecRoot = join(configuredSpecRoot, 'empty-target');

    mkdirSync(join(projectRoot, '.pi'), { recursive: true });
    mkdirSync(explicitSpecRoot, { recursive: true });
    mkdirSync(currentSpecRoot, { recursive: true });
    mkdirSync(emptySpecRoot, { recursive: true });

    writeFileSync(join(projectRoot, '.pi', 'ralph-specum.local.md'), ['---', 'specs_dirs:', '  - ./custom-specs', '---', ''].join('\n'), 'utf8');
    writeFileSync(join(explicitSpecRoot, 'requirements.md'), '# Explicit target\n', 'utf8');
    writeFileSync(join(currentSpecRoot, 'design.md'), '# Current target\n', 'utf8');
    writeFileSync(join(configuredSpecRoot, '.current-spec'), 'current-target\n', 'utf8');
    writeFileSync(join(emptySpecRoot, 'notes.md'), 'no refactorable artifacts\n', 'utf8');

    const explicitPlan = await resolveRefactorSpecPlan({ cwd: projectRoot, reference: 'explicit-target' });
    assertEqual(explicitPlan?.spec?.absolutePath ?? explicitPlan?.specPath, explicitSpecRoot, 'configured-root explicit spec path');
    assertEqual(explicitPlan?.spec?.rootAbsolutePath ?? explicitPlan?.specRoot, configuredSpecRoot, 'configured-root explicit spec root');
    assertArrayEqual(explicitPlan?.availableFiles ?? explicitPlan?.artifacts, ['requirements'], 'explicit artifact inventory');

    const currentPlan = await resolveRefactorSpecPlan({ cwd: projectRoot, reference: null });
    assertEqual(currentPlan?.spec?.absolutePath ?? currentPlan?.specPath, currentSpecRoot, 'configured-root current spec path');
    assertArrayEqual(currentPlan?.availableFiles ?? currentPlan?.artifacts, ['design'], 'current-spec artifact inventory');

    const emptyBefore = hashDirectory(emptySpecRoot);
    let emptyError = null;
    try {
      await resolveRefactorSpecPlan({ cwd: projectRoot, reference: 'empty-target' });
    } catch (error) {
      emptyError = error;
    }

    if (!emptyError) {
      throw new Error('specs with no refactorable artifacts must fail before writes');
    }

    const emptyMessage = String(emptyError?.message ?? emptyError);
    if (!/requirements\.md|design\.md|tasks\.md|artifact/i.test(emptyMessage)) {
      throw new Error(`no-artifact failure must mention refactorable artifacts; got ${emptyMessage}`);
    }

    const emptyAfter = hashDirectory(emptySpecRoot);
    assertEqual(emptyAfter, emptyBefore, 'no-artifact guard must not write files');
  } catch (error) {
    if (error?.expectedFail === true) throw error;
    expectedFail(error?.message ?? String(error));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
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

async function loadResolveRefactorSpecPlan() {
  const helper = await loadRefactorHelper();
  const resolveRefactorSpecPlan = helper?.resolveRefactorSpecPlan;

  if (typeof resolveRefactorSpecPlan !== 'function') {
    expectedFail('resolveRefactorSpecPlan is not exported from extensions/ralph-specum/refactor.ts yet.');
  }

  return resolveRefactorSpecPlan;
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

function hashDirectory(directoryPath) {
  const hash = createHash('sha256');
  appendDirectoryHash(hash, directoryPath, '.');
  return hash.digest('hex');
}

function appendDirectoryHash(hash, absolutePath, relativePath) {
  const entries = readDirectoryEntries(absolutePath);
  for (const entry of entries) {
    const childRelativePath = relativePath === '.' ? entry.name : `${relativePath}/${entry.name}`;
    const childPath = join(absolutePath, entry.name);
    hash.update(`${childRelativePath}:${entry.type}\n`);
    if (entry.type === 'dir') {
      appendDirectoryHash(hash, childPath, childRelativePath);
      continue;
    }
    hash.update(readFileSync(childPath));
  }
}

function readDirectoryEntries(directoryPath) {
  return readdirSync(directoryPath, { withFileTypes: true })
    .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'dir' : 'file' }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual(actual, expected, label) {
  const actualValue = Array.isArray(actual) ? actual : [];
  const expectedValue = Array.isArray(expected) ? expected : [];
  if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
  }
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
