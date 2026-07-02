#!/usr/bin/env node

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));

const cases = new Map([
  ['parser-unknown', verifyParserUnknown],
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
  const helper = await loadIndexingHelper();
  const parseIndexArgs = helper?.parseIndexArgs;

  if (typeof parseIndexArgs !== 'function') {
    expectedFail('parseIndexArgs is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  const unsupportedOption = '--definitely-unsupported-index-option';
  const result = parseIndexArgs([unsupportedOption]);
  const ok = result?.ok === true;
  const errorText = String(result?.error?.message ?? result?.error ?? result?.message ?? '');

  if (ok || !errorText.includes(unsupportedOption)) {
    expectedFail(
      `unsupported option ${unsupportedOption} must return an error naming the option; got ${JSON.stringify(result)}`,
    );
  }
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
  console.error(`EXPECTED_FAIL parser-unknown: ${message}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
