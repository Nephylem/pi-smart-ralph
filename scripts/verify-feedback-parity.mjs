#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
let activeCase = requestedCase;

const cases = new Map([
  ['command-registration', verifyCommandRegistration],
  ['draft-fallback', verifyDraftFallback],
]);

async function main() {
  if (!requestedCase || requestedCase === 'all') {
    const summaries = [];

    for (const [caseName, verifyCase] of cases.entries()) {
      const result = await runVerifierCase(caseName, verifyCase);
      summaries.push(result);
      if (!result.ok) {
        printCaseFailure(result);
        console.error(`FAIL feedback parity verifier: ${countPassed(summaries)}/${cases.size} cases passed; failed: ${caseName}`);
        process.exitCode = 1;
        return;
      }
      console.log(`PASS ${caseName}`);
    }

    console.log(`PASS feedback parity verifier: ${summaries.length}/${cases.size} cases passed`);
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

  if (!/\.registerCommand\(\s*["']ralph-feedback["']\s*,/m.test(source)) {
    failures.push('pi.registerCommand("ralph-feedback", ...) is absent');
  }

  const requiredHelpTokens = ['/ralph-feedback', 'feedback', 'safe'];
  const missingHelpTokens = requiredHelpTokens.filter((token) => !source.includes(token));
  if (missingHelpTokens.length > 0) {
    failures.push(`help/status documentation is missing ${missingHelpTokens.join(', ')}`);
  }

  const safeFeedbackHelpPattern = /\/ralph-feedback[\s\S]{0,200}(safe|safely|prepare|submission|submit)/i;
  if (!safeFeedbackHelpPattern.test(source)) {
    failures.push('help text does not describe safe feedback submission/preparation behavior');
  }

  if (failures.length > 0) {
    expectedFail(`command registration source inspection failed for ${commandSourcePath}: ${failures.join('; ')}`);
  }
}

async function verifyDraftFallback() {
  const packageJsonPath = join(root, 'package.json');
  const feedbackModulePath = join(root, 'extensions', 'ralph-specum', 'feedback.ts');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const feedbackSource = readFileSync(feedbackModulePath, 'utf8');
  const failures = [];

  const bugsUrl = packageJson?.bugs?.url;
  if (bugsUrl !== 'https://github.com/Nephylem/pi-smart-ralph/issues') {
    failures.push(`package.json bugs.url must stay fixed to Pi Smart Ralph issues; got ${JSON.stringify(bugsUrl)}`);
  }

  const requiredExports = [
    'resolveFeedbackTargetRepo',
    'buildFeedbackDraft',
    'renderFeedbackFallback',
  ];
  const missingExports = requiredExports.filter(
    (name) => !new RegExp(`export\\s+function\\s+${name}\\s*\\(`, 'm').test(feedbackSource),
  );
  if (missingExports.length > 0) {
    failures.push(`feedback.ts is missing expected draft/fallback exports: ${missingExports.join(', ')}`);
  }

  const requiredDraftTokens = [
    'Nephylem/pi-smart-ralph',
    '/ralph-feedback',
    'unconfirmed',
    'issues/new',
    'targetRepo',
    'sourceCommand',
    'confirmedBy',
  ];
  const missingDraftTokens = requiredDraftTokens.filter((token) => !feedbackSource.includes(token));
  if (missingDraftTokens.length > 0) {
    failures.push(`feedback.ts draft/fallback source is missing ${missingDraftTokens.join(', ')}`);
  }

  if (feedbackSource.includes('tzachbon/smart-ralph')) {
    failures.push('feedback.ts still references archived upstream repo tzachbon/smart-ralph');
  }

  if (failures.length > 0) {
    expectedFail(`draft fallback source inspection failed for ${feedbackModulePath}: ${failures.join('; ')}`);
  }
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
