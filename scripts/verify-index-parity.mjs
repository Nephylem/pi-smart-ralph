#!/usr/bin/env node

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));

const cases = new Map([
  ['parser-unknown', verifyParserUnknown],
  ['parser-options', verifyParserOptions],
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
