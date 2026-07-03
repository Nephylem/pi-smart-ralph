#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
let activeCase = requestedCase;

const cases = new Map([
  ['command-registration', verifyCommandRegistration],
  ['draft-fallback', verifyDraftFallback],
  ['headless-input', verifyHeadlessInput],
  ['confirmation-flow', verifyConfirmationFlow],
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

  const feedback = await loadFeedbackHelper();
  const requiredExports = [
    'resolveFeedbackTargetRepo',
    'buildFeedbackDraft',
    'renderFeedbackFallback',
  ];
  const missingExports = requiredExports.filter((name) => typeof feedback?.[name] !== 'function');
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

  if (feedback) {
    const targetRepo = feedback.resolveFeedbackTargetRepo(bugsUrl);
    if (targetRepo !== 'Nephylem/pi-smart-ralph') {
      failures.push(`resolveFeedbackTargetRepo must normalize bugs.url to Nephylem/pi-smart-ralph; got ${JSON.stringify(targetRepo)}`);
    }

    let invalidRepoError = '';
    try {
      feedback.resolveFeedbackTargetRepo('https://example.com/not-github');
    } catch (error) {
      invalidRepoError = String(error?.message ?? error);
    }
    if (!invalidRepoError) {
      failures.push('resolveFeedbackTargetRepo must fail closed when bugs.url is invalid');
    }

    const draft = feedback.buildFeedbackDraft('Manual fallback proof', { targetRepo });
    if (draft.targetRepo !== targetRepo) failures.push(`draft targetRepo mismatch: ${JSON.stringify(draft.targetRepo)}`);
    if (draft.sourceCommand !== '/ralph-feedback') failures.push(`draft sourceCommand mismatch: ${JSON.stringify(draft.sourceCommand)}`);
    if (draft.confirmedBy !== 'unconfirmed') failures.push(`draft confirmedBy mismatch: ${JSON.stringify(draft.confirmedBy)}`);
    if (!Array.isArray(draft.labels) || draft.labels.length === 0) failures.push('draft labels must be a non-empty array');

    const fallback = feedback.renderFeedbackFallback(draft);
    const expectedFallbackTokens = [
      `targetRepo: ${draft.targetRepo}`,
      `title: ${draft.title}`,
      `body: ${draft.body}`,
      `labels: ${draft.labels.join(', ')}`,
      `sourceCommand: ${draft.sourceCommand}`,
      `confirmedBy: ${draft.confirmedBy}`,
      `https://github.com/${draft.targetRepo}/issues/new`,
    ];
    const missingFallbackTokens = expectedFallbackTokens.filter((token) => !fallback.includes(token));
    if (missingFallbackTokens.length > 0) {
      failures.push(`fallback output is missing ${missingFallbackTokens.join(', ')}`);
    }
  }

  if (failures.length > 0) {
    expectedFail(`draft fallback verification failed for ${feedbackModulePath}: ${failures.join('; ')}`);
  }
}

async function verifyHeadlessInput() {
  const feedbackModulePath = join(root, 'extensions', 'ralph-specum', 'feedback.ts');
  const feedback = await loadFeedbackHelper();
  const failures = [];

  if (typeof feedback?.createFeedbackCommandHandler !== 'function') {
    failures.push('feedback.ts must export createFeedbackCommandHandler to exercise runtime input handling');
  }

  if (feedback?.createFeedbackCommandHandler) {
    const notifications = [];
    const handler = feedback.createFeedbackCommandHandler(async (_ctx, message) => {
      notifications.push(message);
    });

    let promptedTitle = null;
    let promptedBody = null;
    let promptCount = 0;

    await handler('   ', {
      hasUI: true,
      ui: {
        input: async (title, prompt) => {
          promptCount += 1;
          promptedTitle = title;
          promptedBody = prompt;
          return 'Prompted feedback from UI';
        },
      },
    });

    if (promptCount !== 1) {
      failures.push(`missing-message UI flow must prompt exactly once; got ${promptCount}`);
    }

    if (promptedTitle !== 'Feedback message') {
      failures.push(`missing-message UI prompt title mismatch: ${JSON.stringify(promptedTitle)}`);
    }

    if (typeof promptedBody !== 'string' || !/feedback/i.test(promptedBody)) {
      failures.push(`missing-message UI prompt body must mention feedback guidance; got ${JSON.stringify(promptedBody)}`);
    }

    const promptedNotification = notifications[0] ?? '';
    if (!promptedNotification.includes('Prompted feedback from UI')) {
      failures.push('UI prompt result must flow into the draft message instead of reporting missing input');
    }

    if (promptedNotification.includes('No feedback message provided yet.')) {
      failures.push('UI prompt path must not continue with the empty-message fallback after input is provided');
    }

    const headlessNotifications = [];
    let writeAttemptCount = 0;
    const headlessHandler = feedback.createFeedbackCommandHandler(async (_ctx, message) => {
      headlessNotifications.push(message);
    });

    await headlessHandler('', {
      hasUI: false,
      runner: {
        run: async () => {
          writeAttemptCount += 1;
          return { stdout: '', stderr: '', exitCode: 0 };
        },
      },
    });

    if (writeAttemptCount !== 0) {
      failures.push(`headless missing-message flow must stop before any GitHub write attempt; got ${writeAttemptCount}`);
    }

    const headlessMessage = headlessNotifications[0] ?? '';
    if (!/Usage:\s*\/ralph-feedback/i.test(headlessMessage)) {
      failures.push('headless missing-message flow must return explicit usage guidance');
    }

    if (!/no GitHub issue will be created|no remote write/i.test(headlessMessage)) {
      failures.push('headless missing-message flow must explain the no-write outcome');
    }
  }

  if (failures.length > 0) {
    expectedFail(`headless input verification failed for ${feedbackModulePath}: ${failures.join('; ')}`);
  }
}

async function verifyConfirmationFlow() {
  const feedbackModulePath = join(root, 'extensions', 'ralph-specum', 'feedback.ts');
  const feedback = await loadFeedbackHelper();
  const failures = [];

  if (typeof feedback?.createFeedbackCommandHandler !== 'function') {
    failures.push('feedback.ts must export createFeedbackCommandHandler to exercise confirmation gating');
  }

  if (feedback?.createFeedbackCommandHandler) {
    const unconfirmedNotifications = [];
    let unconfirmedConfirmCount = 0;
    let unconfirmedWriteCount = 0;
    const unconfirmedHandler = feedback.createFeedbackCommandHandler(async (_ctx, message) => {
      unconfirmedNotifications.push(message);
    });

    await unconfirmedHandler('Need a safer confirmation flow', {
      hasUI: true,
      ui: {
        confirm: async () => {
          unconfirmedConfirmCount += 1;
          return false;
        },
      },
      runner: {
        run: async () => {
          unconfirmedWriteCount += 1;
          return { stdout: '', stderr: '', exitCode: 0 };
        },
      },
    });

    if (unconfirmedConfirmCount !== 1) {
      failures.push(`interactive unconfirmed flow must request one confirmation before any write; got ${unconfirmedConfirmCount}`);
    }

    if (unconfirmedWriteCount !== 0) {
      failures.push(`unconfirmed flow must never invoke gh issue create; got ${unconfirmedWriteCount}`);
    }

    const unconfirmedMessage = unconfirmedNotifications[0] ?? '';
    if (!unconfirmedMessage.includes('confirmedBy: unconfirmed')) {
      failures.push('unconfirmed fallback must preserve confirmedBy: unconfirmed');
    }

    const uiNotifications = [];
    let uiConfirmCount = 0;
    let uiWriteCount = 0;
    const uiHandler = feedback.createFeedbackCommandHandler(async (_ctx, message) => {
      uiNotifications.push(message);
    });

    await uiHandler('Need a safer confirmation flow', {
      hasUI: true,
      ui: {
        confirm: async () => {
          uiConfirmCount += 1;
          return true;
        },
      },
      runner: {
        run: async () => {
          uiWriteCount += 1;
          return { stdout: 'https://github.com/Nephylem/pi-smart-ralph/issues/123', stderr: '', exitCode: 0 };
        },
      },
    });

    if (uiConfirmCount !== 1) {
      failures.push(`interactive confirmed flow must request one confirmation; got ${uiConfirmCount}`);
    }

    if (uiWriteCount !== 1) {
      failures.push(`interactive confirmed flow must invoke gh issue create exactly once; got ${uiWriteCount}`);
    }

    const uiMessage = uiNotifications[0] ?? '';
    if (!uiMessage.includes('confirmedBy: ui')) {
      failures.push('interactive confirmed flow must surface confirmedBy: ui in its draft/result output');
    }

    const yesNotifications = [];
    let yesWriteCount = 0;
    const yesHandler = feedback.createFeedbackCommandHandler(async (_ctx, message) => {
      yesNotifications.push(message);
    });

    await yesHandler('Need a safer confirmation flow --yes', {
      hasUI: false,
      runner: {
        run: async () => {
          yesWriteCount += 1;
          return { stdout: 'https://github.com/Nephylem/pi-smart-ralph/issues/124', stderr: '', exitCode: 0 };
        },
      },
    });

    if (yesWriteCount !== 1) {
      failures.push(`headless --yes flow must invoke gh issue create exactly once; got ${yesWriteCount}`);
    }

    const yesMessage = yesNotifications[0] ?? '';
    if (!yesMessage.includes('confirmedBy: yes-flag')) {
      failures.push('headless --yes flow must surface confirmedBy: yes-flag in its draft/result output');
    }
  }

  if (failures.length > 0) {
    expectedFail(`confirmation flow verification failed for ${feedbackModulePath}: ${failures.join('; ')}`);
  }
}

async function loadFeedbackHelper() {
  const helperUrl = new URL('../extensions/ralph-specum/feedback.ts', import.meta.url);
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
    message.includes('/extensions/ralph-specum/feedback.ts')
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
