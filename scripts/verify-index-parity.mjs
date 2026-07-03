#!/usr/bin/env node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));

const cases = new Map([
  ['parser-unknown', verifyParserUnknown],
  ['parser-options', verifyParserOptions],
  ['paths', verifyPaths],
]);

async function main() {
  if (!requestedCase || requestedCase === 'all') {
    for (const verifyCase of cases.values()) {
      await verifyCase();
    }
    console.log('PASS index parity verifier');
    return;
  }

  const verifyCase = cases.get(requestedCase);
  if (!verifyCase) {
    console.error(`Unknown verify case: ${requestedCase}`);
    console.error(`Supported cases: ${[...cases.keys()].join(', ')}`);
    process.exitCode = 2;
    return;
  }

  await verifyCase();
  console.log(`PASS ${requestedCase}`);
}

function parseCaseArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--case') return args[index + 1] ?? '';
    if (token.startsWith('--case=')) return token.slice('--case='.length);
  }
  return 'all';
}

async function verifyParserUnknown() {
  const parseIndexArgs = await loadParseIndexArgs();

  const defaultsResult = parseIndexArgs([]);
  assertStableDefaultShape(defaultsResult, 'default parse result');

  const unsupportedOption = '--definitely-unsupported-index-option';
  const result = parseIndexArgs([unsupportedOption]);
  const ok = result?.ok === true;
  const errorText = String(result?.error?.message ?? result?.error ?? result?.message ?? '');

  if (ok || !errorText.includes(unsupportedOption)) {
    expectedFail(
      `unsupported option ${unsupportedOption} must return an error naming the option; got ${JSON.stringify(result)}`,
    );
  }

  assertStableDefaultShape(result, 'unknown option parse result');
}

async function verifyPaths() {
  const helper = await loadIndexingHelper();
  const resolveIndexPaths = helper?.resolveIndexPaths;
  const readPriorIndexState = helper?.readPriorIndexState ?? helper?.readIndexState;
  const assertIndexOutputPath = helper?.assertIndexOutputPath;
  const getComponentIndexPath = helper?.getComponentIndexPath;
  const toIndexDisplayPath = helper?.toIndexDisplayPath;

  if (typeof resolveIndexPaths !== 'function') {
    expectedFail('resolveIndexPaths is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof readPriorIndexState !== 'function') {
    expectedFail('readPriorIndexState/readIndexState is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof assertIndexOutputPath !== 'function') {
    expectedFail('assertIndexOutputPath is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof getComponentIndexPath !== 'function') {
    expectedFail('getComponentIndexPath is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof toIndexDisplayPath !== 'function') {
    expectedFail('toIndexDisplayPath is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-index-paths-'));
  try {
    const projectRoot = join(tempRoot, 'project');
    const scanRoot = join(projectRoot, 'src');
    const specRoot = join(tempRoot, 'custom-spec-root');
    mkdirSync(scanRoot, { recursive: true });
    mkdirSync(specRoot, { recursive: true });

    const resolved = resolveIndexPaths({ cwd: projectRoot, scanPath: scanRoot, specRoot });
    const paths = resolved?.paths ?? resolved;
    const indexRoot = join(specRoot, '.index');
    const canonicalStatePath = join(indexRoot, 'index-state.json');
    const aliasStatePath = join(indexRoot, '.index-state.json');

    assertEqual(paths?.projectRoot, resolve(projectRoot), 'resolved project root');
    assertEqual(paths?.scanPath, resolve(scanRoot), 'resolved scan path');
    assertEqual(paths?.specRoot, resolve(specRoot), 'resolved configured spec root');
    assertEqual(paths?.indexRoot, indexRoot, 'resolved index root');
    assertEqual(paths?.statePath, canonicalStatePath, 'canonical state path');
    assertEqual(paths?.stateWritePath, canonicalStatePath, 'canonical write-only state path');
    assertArrayEqual(paths?.stateReadPaths, [canonicalStatePath, aliasStatePath], 'canonical-first state read paths');
    assertEqual(paths?.summaryPath, join(indexRoot, 'index.md'), 'summary path');
    assertEqual(paths?.componentRoot, join(indexRoot, 'components'), 'component root');
    assertEqual(paths?.externalRoot, join(indexRoot, 'external'), 'external root');
    assertEqual(paths?.stateAliasPath, aliasStatePath, 'compatibility read-only state alias path');

    assertIndexOutputPath(paths.indexRoot, paths.summaryPath, 'summary path');
    assertIndexOutputPath(paths.indexRoot, getComponentIndexPath(paths, join(scanRoot, 'accounts.service.ts'), 'services'), 'component artifact path');
    assertThrows(() => assertIndexOutputPath(paths.indexRoot, join(indexRoot, '..', 'escape.md'), 'escaping output path'), 'escaping output path');
    assertEqual(toIndexDisplayPath(paths, join(projectRoot, 'src', 'accounts.service.ts')), 'src/accounts.service.ts', 'inside project display path');
    assertEqual(toIndexDisplayPath(paths, join(tempRoot, 'external-src', 'outside.service.ts')), join(tempRoot, 'external-src', 'outside.service.ts'), 'outside project display path');

    mkdirSync(indexRoot, { recursive: true });
    const aliasState = { indexed: 'alias-state-read', components: [], external: [] };
    writeFileSync(aliasStatePath, `${JSON.stringify(aliasState)}\n`, 'utf8');

    const priorStateResult = readPriorIndexState(paths);
    const priorState = priorStateResult?.state ?? priorStateResult;
    const priorStatePath = priorStateResult?.path ?? priorStateResult?.statePath ?? priorStateResult?.sourcePath;

    assertEqual(priorState?.indexed, aliasState.indexed, 'compatibility alias state read');
    if (priorStatePath !== undefined) {
      assertEqual(priorStatePath, aliasStatePath, 'compatibility alias state source path');
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyParserOptions() {
  const parseIndexArgs = await loadParseIndexArgs();

  const result = parseIndexArgs([
    '--path',
    'src/features',
    '--type',
    'services,controllers',
    '--exclude',
    'node_modules',
    '--exclude',
    'dist/**',
    '--dry-run',
    '--force',
    '--quick',
  ]);

  if (result?.ok !== true) {
    expectedFail(`parity flags must parse successfully; got ${stringifyParseResult(result)}`);
  }

  assertStableDefaultShape(result, 'parity option parse result');

  const options = result.options;
  assertEqual(options.scanPath, 'src/features', '--path value');
  assertArrayEqual(options.categories, ['services', 'controllers'], 'comma-list --type values');
  assertArrayEqual(options.excludes, ['node_modules', 'dist/**'], 'repeated --exclude values');
  assertEqual(options.dryRun, true, '--dry-run flag');
  assertEqual(options.force, true, '--force flag');
  assertEqual(options.changed, false, '--changed default when omitted');
  assertEqual(options.quick, true, '--quick flag');

  const changedResult = parseIndexArgs(['--changed']);
  if (changedResult?.ok !== true || changedResult.options.changed !== true) {
    expectedFail(`--changed must parse successfully when used without --force; got ${stringifyParseResult(changedResult)}`);
  }

  const conflictResult = parseIndexArgs(['--force', '--changed']);
  const conflictError = String(conflictResult?.error?.message ?? conflictResult?.error ?? conflictResult?.message ?? '');
  if (conflictResult?.ok !== false || !conflictError.includes('--force') || !conflictError.includes('--changed')) {
    expectedFail(
      `--force --changed must fail before scanning with both flag names in the error; got ${stringifyParseResult(
        conflictResult,
      )}`,
    );
  }

  assertMissingValueMessage(parseIndexArgs(['--path']), '--path');
  assertMissingValueMessage(parseIndexArgs(['--type=']), '--type');
  assertMissingValueMessage(parseIndexArgs(['--exclude', '--quick']), '--exclude');
}

function assertMissingValueMessage(result, optionName) {
  const errorText = String(result?.error?.message ?? result?.error ?? result?.message ?? '');
  if (result?.ok !== false || !errorText.includes('Missing value') || !errorText.includes(optionName)) {
    expectedFail(`${optionName} missing value error must be readable and name the option; got ${stringifyParseResult(result)}`);
  }
}

function assertStableDefaultShape(result, label) {
  const options = result?.options;
  const externalInputs = options?.externalInputs;
  const stable =
    options &&
    typeof options.scanPath === 'string' &&
    typeof options.specRoot === 'string' &&
    Array.isArray(options.categories) &&
    Array.isArray(options.excludes) &&
    typeof options.dryRun === 'boolean' &&
    typeof options.force === 'boolean' &&
    typeof options.changed === 'boolean' &&
    typeof options.quick === 'boolean' &&
    externalInputs &&
    Array.isArray(externalInputs.urls) &&
    Array.isArray(externalInputs.mcpResources) &&
    typeof externalInputs.includePackageResources === 'boolean';

  if (!stable) {
    expectedFail(`${label} must include stable parser option defaults; got ${JSON.stringify(result)}`);
  }
}

async function loadParseIndexArgs() {
  const helper = await loadIndexingHelper();
  const parseIndexArgs = helper?.parseIndexArgs;

  if (typeof parseIndexArgs !== 'function') {
    expectedFail('parseIndexArgs is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  return parseIndexArgs;
}

async function loadIndexingHelper() {
  const helperUrl = new URL('../extensions/ralph-specum/indexing.ts', import.meta.url);
  try {
    return await import(helperUrl.href);
  } catch (error) {
    if (isExpectedMissingHelperError(error)) return null;
    throw error;
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    expectedFail(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    expectedFail(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(action, label) {
  try {
    action();
  } catch (_error) {
    return;
  }
  expectedFail(`${label} expected to throw`);
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
    message.includes('/extensions/ralph-specum/indexing.ts')
  );
}

function expectedFail(message) {
  console.error(`EXPECTED_FAIL ${requestedCase}: ${message}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
