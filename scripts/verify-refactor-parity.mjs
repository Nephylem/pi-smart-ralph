#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
let activeCase = requestedCase;

const acceptanceChecklistCaseKey = 'acceptance-checklist';
const cleanupCaseKey = 'cleanup';
const cleanupRecoveryCaseKey = 'cleanup-recovery';
const acceptanceChecklistCases = [
  'command-registration',
  'spec-resolution',
  'headless-prompts',
  'file-narrowing',
  'specialist-contract',
  'request-payload',
  'audit-rollback',
  'cascade-handling',
  'state-merge',
  'commit-spec',
];
const verifierTempPrefixes = [
  'ralph-refactor-spec-resolution-',
  'ralph-refactor-headless-prompts-',
  'ralph-refactor-file-narrowing-',
  'ralph-refactor-request-payload-',
  'ralph-refactor-audit-rollback-',
  'ralph-refactor-cascade-handling-',
  'ralph-refactor-state-merge-',
  'ralph-refactor-commit-spec-',
  'ralph-refactor-git-wrapper-',
];

const cases = new Map([
  ['command-registration', verifyCommandRegistration],
  ['spec-resolution', verifySpecResolution],
  ['headless-prompts', verifyHeadlessPrompts],
  ['file-narrowing', verifyFileNarrowing],
  ['specialist-contract', verifySpecialistContract],
  ['request-payload', verifyRequestPayload],
  ['audit-rollback', verifyAuditRollback],
  ['cascade-handling', verifyCascadeHandling],
  ['state-merge', verifyStateMerge],
  ['commit-spec', verifyCommitSpec],
  ['package-wiring', verifyPackageWiring],
  [acceptanceChecklistCaseKey, verifyAcceptanceChecklist],
]);
const supportedCaseNames = [...cases.keys(), cleanupCaseKey, cleanupRecoveryCaseKey];

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

    const cleanupResult = await runVerifierCase(cleanupCaseKey, verifyCleanupCase);
    if (!cleanupResult.ok) {
      printCaseFailure(cleanupResult);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS ${cleanupCaseKey}`);

    console.log(`PASS refactor parity verifier: ${summaries.length}/${cases.size} cases passed`);
    return;
  }

  if (requestedCase === cleanupCaseKey) {
    const result = await runVerifierCase(requestedCase, verifyCleanupCase);
    if (!result.ok) {
      printCaseFailure(result);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS ${requestedCase}`);
    return;
  }

  if (requestedCase === cleanupRecoveryCaseKey) {
    const result = await runVerifierCase(requestedCase, verifyCleanupRecoveryCase);
    if (!result.ok) {
      printCaseFailure(result);
      process.exitCode = 1;
      return;
    }
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

async function verifyHeadlessPrompts() {
  const handler = await loadRefactorCommandHandler();
  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-refactor-headless-prompts-'));

  try {
    const fixture = createRefactorCommandFixture(tempRoot);
    const trackedPaths = [
      join(fixture.specRoot, 'requirements.md'),
      join(fixture.specRoot, 'design.md'),
      join(fixture.specRoot, 'tasks.md'),
      join(fixture.specRoot, '.progress.md'),
      join(fixture.specRoot, '.ralph-state.json'),
    ];

    const interactivePrompts = [];
    const interactiveNotifications = [];
    await handler('', {
      cwd: fixture.projectRoot,
      hasUI: true,
      waitForIdle: async () => {},
      ui: {
        notify(message, type) {
          interactiveNotifications.push({ message, type });
        },
        select(title, labels) {
          interactivePrompts.push({ kind: 'select', title, labels });
          return labels[0] ?? null;
        },
        confirm(title, message) {
          interactivePrompts.push({ kind: 'confirm', title, message });
          return true;
        },
        input(title, placeholder) {
          interactivePrompts.push({ kind: 'input', title, placeholder });
          return 'interactive-choice';
        },
        setStatus() {},
        setWidget() {},
      },
    });

    const selectTitles = interactivePrompts.filter((entry) => entry.kind === 'select').map((entry) => entry.title.toLowerCase());
    const promptedForFile = selectTitles.some((title) => title.includes('file') || title.includes('artifact'));
    const promptedForSection = selectTitles.some((title) => title.includes('section'));
    if (!promptedForFile || !promptedForSection) {
      throw new Error(`interactive runs must prompt for file and section choices before delegation; got prompts ${JSON.stringify(interactivePrompts)} and notifications ${JSON.stringify(interactiveNotifications)}`);
    }

    const beforeHeadlessHashes = hashFiles(trackedPaths);
    const headlessOutput = await captureConsoleLogs(async () => {
      await handler('', {
        cwd: fixture.projectRoot,
        hasUI: false,
        waitForIdle: async () => {},
        ui: {
          notify() {},
          select() {
            throw new Error('headless ctx.ui.select must not be called');
          },
          confirm() {
            throw new Error('headless ctx.ui.confirm must not be called');
          },
          input() {
            throw new Error('headless ctx.ui.input must not be called');
          },
          setStatus() {},
          setWidget() {},
        },
      });
    });
    const afterHeadlessHashes = hashFiles(trackedPaths);
    assertEqual(afterHeadlessHashes, beforeHeadlessHashes, 'headless stop must leave artifacts, progress, and state unchanged');

    const headlessMessage = headlessOutput.join('\n');
    if (!/(headless|non-interactive|re-run|rerun|choose|selection|section)/i.test(headlessMessage) || !/--file|ui|interactive/i.test(headlessMessage)) {
      throw new Error(`headless runs needing file/section decisions must stop with actionable guidance; got ${JSON.stringify(headlessMessage)}`);
    }
  } catch (error) {
    if (error?.expectedFail === true) throw error;
    expectedFail(error?.message ?? String(error));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyFileNarrowing() {
  const handler = await loadRefactorCommandHandler();
  const buildRefactorSelectedFilePlan = await loadBuildRefactorSelectedFilePlan();
  const resolveRefactorSpecPlan = await loadResolveRefactorSpecPlan();
  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-refactor-file-narrowing-'));

  try {
    const fixture = createRefactorCommandFixture(tempRoot);
    const prompts = [];
    const notifications = [];

    await handler('--file=requirements', {
      cwd: fixture.projectRoot,
      hasUI: true,
      waitForIdle: async () => {},
      ui: {
        notify(message, type) {
          notifications.push({ message, type });
        },
        select(title, labels) {
          prompts.push({ kind: 'select', title, labels });
          return labels[0] ?? null;
        },
        confirm(title, message) {
          prompts.push({ kind: 'confirm', title, message });
          return true;
        },
        input(title, placeholder) {
          prompts.push({ kind: 'input', title, placeholder });
          return 'interactive-choice';
        },
        setStatus() {},
        setWidget() {},
      },
    });

    const selectTitles = prompts.filter((entry) => entry.kind === 'select').map((entry) => entry.title.toLowerCase());
    const promptedForFile = selectTitles.some((title) => title.includes('file') || title.includes('artifact'));
    const promptedForSection = selectTitles.some((title) => title.includes('section'));
    if (promptedForFile || !promptedForSection) {
      throw new Error(`--file=requirements must suppress unrelated file prompts while still allowing section choice; got prompts ${JSON.stringify(prompts)} and notifications ${JSON.stringify(notifications)}`);
    }

    const plan = resolveRefactorSpecPlan({ cwd: fixture.projectRoot, reference: null });
    const selectedFilePlan = await buildRefactorSelectedFilePlan(plan, 'requirements');

    assertEqual(selectedFilePlan?.selectedFile, 'requirements', 'selected file from --file narrowing');
    assertArrayEqual(selectedFilePlan?.availableSections, ['Scope', 'Open Questions'], 'narrowed section inventory');

    const progressLearnings = Array.isArray(selectedFilePlan?.progressLearnings) ? selectedFilePlan.progressLearnings : [];
    const hasFixtureLearning = progressLearnings.some((entry) => String(entry).includes('interactive planning should read this later'));
    if (!hasFixtureLearning) {
      throw new Error(`selected-file refactor plans must load .progress.md learnings; got ${JSON.stringify(selectedFilePlan)}`);
    }
  } catch (error) {
    if (error?.expectedFail === true) throw error;
    expectedFail(error?.message ?? String(error));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifySpecialistContract() {
  const specialistSourcePath = join(root, 'agents', 'ralph-refactor-specialist.md');
  const source = readFileSync(specialistSourcePath, 'utf8');
  const failures = [];

  if (!/artifact-only|only the selected artifact path|artifact content/i.test(source)) {
    failures.push('specialist contract must explicitly restrict edits to the selected artifact only');
  }

  if (/append refactoring log to progress/i.test(source) || /progress log/i.test(source)) {
    failures.push('specialist contract must not claim ownership of .progress.md updates');
  }

  const requiredMarkers = ['REFACTOR_COMPLETE', 'CASCADE_NEEDED', 'CASCADE_REASON', 'EVIDENCE'];
  const missingMarkers = requiredMarkers.filter((marker) => !source.includes(marker));
  if (missingMarkers.length > 0) {
    failures.push(`specialist completion contract is missing marker(s): ${missingMarkers.join(', ')}`);
  }

  if (failures.length > 0) {
    expectedFail(`specialist contract inspection failed for ${specialistSourcePath}: ${failures.join('; ')}`);
  }
}

async function verifyRequestPayload() {
  const resolveRefactorSpecPlan = await loadResolveRefactorSpecPlan();
  const buildRefactorSelectedFilePlan = await loadBuildRefactorSelectedFilePlan();
  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-refactor-request-payload-'));

  try {
    const fixture = createRefactorCommandFixture(tempRoot);
    const plan = await resolveRefactorSpecPlan({ cwd: fixture.projectRoot, reference: null });
    const selectedFilePlan = await buildRefactorSelectedFilePlan(plan, 'requirements');
    const expectedArtifactPath = join(fixture.specRoot, 'requirements.md');
    assertEqual(selectedFilePlan?.artifactPath, expectedArtifactPath, 'selected artifact path for request payload');

    const subagentStub = createRefactorRequestCaptureStub();
    const commandWithStub = await loadRefactorCommand({ events: subagentStub.events });
    await commandWithStub.handler('--file=requirements', {
      cwd: fixture.projectRoot,
      hasUI: true,
      waitForIdle: async () => {},
      ui: {
        notify() {},
        select(title, labels) {
          if (/section/i.test(title)) return labels[0] ?? null;
          return labels[0] ?? null;
        },
        confirm() {
          return true;
        },
        input() {
          return 'interactive-choice';
        },
        setStatus() {},
        setWidget() {},
      },
    });

    if (subagentStub.requests.length === 0) {
      expectedFail('coordinator did not dispatch any refactor specialist request to the capture stub.');
    }

    if (subagentStub.requests.length !== 1) {
      throw new Error(`coordinator must dispatch exactly one refactor specialist request for --file=requirements; got ${subagentStub.requests.length}`);
    }

    const request = parseCapturedRefactorRequest(subagentStub.requests[0]);
    assertRequestHasKeys(request, ['spec', 'files', 'sections', 'progressLearnings', 'cascadePolicy', 'allowedFiles']);
    assertEqual(request?.spec?.name, 'interactive-target', 'request spec.name');
    assertEqual(request?.spec?.basePath, fixture.specRoot, 'request spec.basePath');
    assertArrayEqual((request?.files ?? []).map((entry) => entry.kind), ['requirements'], 'request files kinds');
    assertArrayEqual((request?.files ?? []).map((entry) => entry.path), [expectedArtifactPath], 'request files paths');
    assertArrayEqual(request?.allowedFiles, [expectedArtifactPath], 'request allowedFiles');

    const outOfScopeAllowedFiles = (request?.allowedFiles ?? []).filter((filePath) => filePath !== expectedArtifactPath);
    if (outOfScopeAllowedFiles.length > 0) {
      throw new Error(`allowedFiles must contain only the in-scope artifact path; got ${JSON.stringify(request.allowedFiles)}`);
    }

    const hasFixtureLearning = (request?.progressLearnings ?? []).some((entry) => String(entry).includes('interactive planning should read this later'));
    if (!hasFixtureLearning) {
      throw new Error(`request progressLearnings must include .progress.md learnings; got ${JSON.stringify(request?.progressLearnings ?? [])}`);
    }
  } catch (error) {
    if (error?.expectedFail === true) throw error;
    expectedFail(error?.message ?? String(error));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyAuditRollback() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-refactor-audit-rollback-'));

  try {
    const fixture = createRefactorCommandFixture(tempRoot);
    const trackedPaths = {
      requirements: join(fixture.specRoot, 'requirements.md'),
      design: join(fixture.specRoot, 'design.md'),
      tasks: join(fixture.specRoot, 'tasks.md'),
      progress: join(fixture.specRoot, '.progress.md'),
      state: join(fixture.specRoot, '.ralph-state.json'),
    };
    const beforeHashes = {
      requirements: hashFile(trackedPaths.requirements),
      design: hashFile(trackedPaths.design),
      tasks: hashFile(trackedPaths.tasks),
      progress: hashFile(trackedPaths.progress),
      state: hashFile(trackedPaths.state),
    };

    const subagentStub = createRefactorAuditRollbackStub();
    const notifications = [];
    const commandWithStub = await loadRefactorCommand({ events: subagentStub.events });
    await commandWithStub.handler('--file=requirements', {
      cwd: fixture.projectRoot,
      hasUI: true,
      waitForIdle: async () => {},
      ui: {
        notify(message, type) {
          notifications.push({ message, type });
        },
        select(_title, labels) {
          return labels[0] ?? null;
        },
        confirm() {
          return true;
        },
        input() {
          return 'interactive-choice';
        },
        setStatus() {},
        setWidget() {},
      },
    });

    const afterHashes = {
      requirements: hashFile(trackedPaths.requirements),
      design: hashFile(trackedPaths.design),
      tasks: hashFile(trackedPaths.tasks),
      progress: hashFile(trackedPaths.progress),
      state: hashFile(trackedPaths.state),
    };

    const changedPaths = Object.entries(afterHashes)
      .filter(([name, hash]) => hash !== beforeHashes[name])
      .map(([name]) => name);

    if (!notifications.some((entry) => entry.type === 'warning' && /refactor|marker|unauthorized|reject|invalid/i.test(String(entry.message)))) {
      throw new Error(`malformed specialist completion must be rejected with a warning before success handling; got notifications ${JSON.stringify(notifications)}`);
    }

    if (afterHashes.progress !== beforeHashes.progress || afterHashes.state !== beforeHashes.state) {
      throw new Error(`progress/state writes must not happen after malformed output or unauthorized edits; changed ${JSON.stringify({ progress: afterHashes.progress !== beforeHashes.progress, state: afterHashes.state !== beforeHashes.state })}`);
    }

    if (afterHashes.design !== beforeHashes.design) {
      throw new Error(`unauthorized spec-directory edits must be rolled back before returning; design.md remained mutated and tracked changes were ${JSON.stringify(changedPaths)}`);
    }

    if (afterHashes.requirements !== beforeHashes.requirements) {
      throw new Error(`malformed specialist completion must not keep even in-scope artifact edits; requirements.md remained mutated and tracked changes were ${JSON.stringify(changedPaths)}`);
    }
  } catch (error) {
    if (error?.expectedFail === true) throw error;
    expectedFail(error?.message ?? String(error));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyCascadeHandling() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-refactor-cascade-handling-'));

  try {
    const approvedFixture = createRefactorCommandFixture(join(tempRoot, 'approved'));
    const approvedStub = createRefactorCascadeHandlingStub();
    const approvedConfirmPrompts = [];
    const approvedCommand = await loadRefactorCommand({ events: approvedStub.events });

    await approvedCommand.handler('--file=requirements', {
      cwd: approvedFixture.projectRoot,
      hasUI: true,
      waitForIdle: async () => {},
      ui: {
        notify() {},
        select(_title, labels) {
          return labels[0] ?? null;
        },
        confirm(title, message) {
          approvedConfirmPrompts.push({ title, message });
          return true;
        },
        input() {
          return 'interactive-choice';
        },
        setStatus() {},
        setWidget() {},
      },
    });

    if (approvedStub.requests.length === 0) {
      expectedFail('coordinator did not dispatch the initial requirements refactor request for cascade handling.');
    }

    if (approvedStub.requests.length !== 2) {
      throw new Error(`approved requirements→design cascades must run a second bounded specialist step after explicit approval; got ${approvedStub.requests.length} request(s)`);
    }

    if (!approvedConfirmPrompts.some((entry) => /cascade|downstream|design/i.test(`${entry.title} ${entry.message}`))) {
      throw new Error(`approved cascades must prompt for downstream handling before editing design.md; got prompts ${JSON.stringify(approvedConfirmPrompts)}`);
    }

    const approvedRequests = approvedStub.requests.map(parseCapturedRefactorRequest);
    assertArrayEqual(approvedRequests.map((request) => request.files?.[0]?.kind ?? null), ['requirements', 'design'], 'approved cascade request order');
    assertArrayEqual(
      approvedRequests.map((request) => request.allowedFiles?.[0] ?? null),
      [join(approvedFixture.specRoot, 'requirements.md'), join(approvedFixture.specRoot, 'design.md')],
      'approved cascade allowedFiles order',
    );

    const approvedDesign = readFileSync(join(approvedFixture.specRoot, 'design.md'), 'utf8');
    if (!approvedDesign.includes('approved cascade mutation')) {
      throw new Error('approved requirements→design cascades must update design.md during the second bounded step.');
    }

    const rejectedFixture = createRefactorCommandFixture(join(tempRoot, 'rejected'));
    const rejectedStub = createRefactorCascadeHandlingStub();
    const rejectedCommand = await loadRefactorCommand({ events: rejectedStub.events });
    const rejectedProgressPath = join(rejectedFixture.specRoot, '.progress.md');
    const rejectedDesignPath = join(rejectedFixture.specRoot, 'design.md');
    const rejectedProgressBefore = hashFile(rejectedProgressPath);
    const rejectedDesignBefore = hashFile(rejectedDesignPath);

    await rejectedCommand.handler('--file=requirements', {
      cwd: rejectedFixture.projectRoot,
      hasUI: true,
      waitForIdle: async () => {},
      ui: {
        notify() {},
        select(_title, labels) {
          return labels[0] ?? null;
        },
        confirm() {
          return false;
        },
        input() {
          return 'interactive-choice';
        },
        setStatus() {},
        setWidget() {},
      },
    });

    if (rejectedStub.requests.length !== 1) {
      throw new Error(`rejected cascades must not spawn downstream specialist steps; got ${rejectedStub.requests.length} request(s)`);
    }

    const rejectedDesignAfter = hashFile(rejectedDesignPath);
    if (rejectedDesignAfter !== rejectedDesignBefore) {
      throw new Error('rejected cascades must leave downstream files byte-unchanged.');
    }

    const rejectedProgressAfter = hashFile(rejectedProgressPath);
    const rejectedProgressText = readFileSync(rejectedProgressPath, 'utf8');
    if (rejectedProgressAfter === rejectedProgressBefore || !/cascade|skipped|rejected|design/i.test(rejectedProgressText)) {
      throw new Error(`rejected cascades must be logged in .progress.md without downstream edits; got ${JSON.stringify(rejectedProgressText)}`);
    }
  } catch (error) {
    if (error?.expectedFail === true) throw error;
    expectedFail(error?.message ?? String(error));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyStateMerge() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-refactor-state-merge-'));

  try {
    const requirementsFixture = createRefactorCommandFixture(join(tempRoot, 'requirements'));
    const requirementsStub = createRefactorStateMergeStub();
    const requirementsCommand = await loadRefactorCommand({ events: requirementsStub.events });
    const requirementsProgressPath = join(requirementsFixture.specRoot, '.progress.md');
    const requirementsStatePath = join(requirementsFixture.specRoot, '.ralph-state.json');
    const requirementsStateBefore = JSON.parse(readFileSync(requirementsStatePath, 'utf8'));
    const requirementsTaskIndexBefore = requirementsStateBefore.taskIndex;

    await requirementsCommand.handler('--file=requirements', {
      cwd: requirementsFixture.projectRoot,
      hasUI: true,
      waitForIdle: async () => {},
      ui: {
        notify() {},
        select(_title, labels) {
          return labels[0] ?? null;
        },
        confirm() {
          return false;
        },
        input() {
          return 'interactive-choice';
        },
        setStatus() {},
        setWidget() {},
      },
    });

    const requirementsStateAfter = JSON.parse(readFileSync(requirementsStatePath, 'utf8'));
    assertPreservedRefactorStateMetadata(requirementsStateAfter, requirementsStateBefore, requirementsFixture.specRoot, 'requirements-only refactor state merge');
    assertEqual(requirementsStateAfter?.taskIndex, requirementsTaskIndexBefore, 'requirements-only refactor must preserve taskIndex when tasks.md is unchanged');

    const requirementsProgress = readFileSync(requirementsProgressPath, 'utf8');
    if (!/requirements/i.test(requirementsProgress) || !/updated|refactor/i.test(requirementsProgress)) {
      throw new Error(`direct artifact updates must append a .progress.md summary entry for requirements.md; got ${JSON.stringify(requirementsProgress)}`);
    }
    if (!/cascade/i.test(requirementsProgress) || !/rejected|skipped/i.test(requirementsProgress) || !/design/i.test(requirementsProgress)) {
      throw new Error(`skipped or rejected cascades must append a .progress.md summary entry; got ${JSON.stringify(requirementsProgress)}`);
    }

    const tasksFixture = createRefactorCommandFixture(join(tempRoot, 'tasks'));
    const tasksStub = createRefactorStateMergeStub();
    const tasksCommand = await loadRefactorCommand({ events: tasksStub.events });
    const tasksProgressPath = join(tasksFixture.specRoot, '.progress.md');
    const tasksStatePath = join(tasksFixture.specRoot, '.ralph-state.json');
    const tasksStateBefore = JSON.parse(readFileSync(tasksStatePath, 'utf8'));

    await tasksCommand.handler('--file=tasks', {
      cwd: tasksFixture.projectRoot,
      hasUI: true,
      waitForIdle: async () => {},
      ui: {
        notify() {},
        select(_title, labels) {
          return labels[0] ?? null;
        },
        confirm() {
          return true;
        },
        input() {
          return 'interactive-choice';
        },
        setStatus() {},
        setWidget() {},
      },
    });

    const tasksStateAfter = JSON.parse(readFileSync(tasksStatePath, 'utf8'));
    assertPreservedRefactorStateMetadata(tasksStateAfter, tasksStateBefore, tasksFixture.specRoot, 'tasks refactor state merge');
    assertEqual(tasksStateAfter?.taskIndex, 0, 'tasks.md refactors must reset taskIndex to 0 for remirroring');

    const tasksProgress = readFileSync(tasksProgressPath, 'utf8');
    if (!/tasks/i.test(tasksProgress) || !/updated|refactor/i.test(tasksProgress)) {
      throw new Error(`tasks.md updates must append a .progress.md summary entry; got ${JSON.stringify(tasksProgress)}`);
    }
  } catch (error) {
    if (error?.expectedFail === true) throw error;
    expectedFail(error?.message ?? String(error));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyCommitSpec() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-refactor-commit-spec-'));

  try {
    const enabledFixture = createRefactorCommandFixture(join(tempRoot, 'enabled'));
    initializeGitFixture(enabledFixture.projectRoot);
    const enabledStub = createRefactorStateMergeStub();
    const enabledCommand = await loadRefactorCommand({ events: enabledStub.events });
    const enabledBeforeCount = gitCommitCount(enabledFixture.projectRoot);
    const enabledSpecRelativeRoot = `${relative(enabledFixture.projectRoot, enabledFixture.specRoot).replace(/\\/g, '/')}/`;

    await withLoggedGitWrapper(async (logPath) => {
      await enabledCommand.handler('--file=requirements', {
        cwd: enabledFixture.projectRoot,
        hasUI: true,
        waitForIdle: async () => {},
        ui: {
          notify() {},
          select(_title, labels) {
            return labels[0] ?? null;
          },
          confirm() {
            return false;
          },
          input() {
            return 'interactive-choice';
          },
          setStatus() {},
          setWidget() {},
        },
      });

      const enabledAfterCount = gitCommitCount(enabledFixture.projectRoot);
      if (enabledAfterCount !== enabledBeforeCount + 1) {
        expectedFail(`commitSpec=true must create exactly one local commit after a successful refactor run; expected ${enabledBeforeCount + 1} commits, got ${enabledAfterCount}.`);
      }

      const committedPaths = gitLastCommitPaths(enabledFixture.projectRoot);
      if (committedPaths.length === 0) {
        throw new Error('commitSpec=true must create a non-empty commit for selected spec updates.');
      }

      const outOfScopePaths = committedPaths.filter((filePath) => !filePath.startsWith(enabledSpecRelativeRoot));
      if (outOfScopePaths.length > 0) {
        throw new Error(`local refactor commit must stay scoped to the selected spec directory; got ${JSON.stringify(committedPaths)}`);
      }

      const gitLogLines = readLoggedGitInvocations(logPath);
      if (gitLogLines.some((line) => /(^|\s)push(\s|$)/.test(line))) {
        throw new Error(`refactor commit flow must never invoke git push; got ${JSON.stringify(gitLogLines)}`);
      }
    });

    const disabledFixture = createRefactorCommandFixture(join(tempRoot, 'disabled'), { commitSpec: false });
    initializeGitFixture(disabledFixture.projectRoot);
    const disabledStub = createRefactorStateMergeStub();
    const disabledCommand = await loadRefactorCommand({ events: disabledStub.events });
    const disabledBeforeCount = gitCommitCount(disabledFixture.projectRoot);

    await withLoggedGitWrapper(async (logPath) => {
      await disabledCommand.handler('--file=requirements', {
        cwd: disabledFixture.projectRoot,
        hasUI: true,
        waitForIdle: async () => {},
        ui: {
          notify() {},
          select(_title, labels) {
            return labels[0] ?? null;
          },
          confirm() {
            return false;
          },
          input() {
            return 'interactive-choice';
          },
          setStatus() {},
          setWidget() {},
        },
      });

      const disabledAfterCount = gitCommitCount(disabledFixture.projectRoot);
      if (disabledAfterCount !== disabledBeforeCount) {
        throw new Error(`commitSpec=false must not create a local git commit; expected ${disabledBeforeCount} commits, got ${disabledAfterCount}.`);
      }

      const gitLogLines = readLoggedGitInvocations(logPath);
      if (gitLogLines.some((line) => /(^|\s)push(\s|$)/.test(line))) {
        throw new Error(`commitSpec=false runs must never invoke git push; got ${JSON.stringify(gitLogLines)}`);
      }
    });
  } catch (error) {
    if (error?.expectedFail === true) throw error;
    expectedFail(error?.message ?? String(error));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyAcceptanceChecklist() {
  for (const caseName of acceptanceChecklistCases) {
    const verifyCase = cases.get(caseName);
    if (typeof verifyCase !== 'function') {
      throw new Error(`acceptance checklist is missing verifier case ${caseName}`);
    }

    const result = await runVerifierCase(caseName, verifyCase);
    if (!result.ok) {
      throw result.error;
    }
  }
}

async function verifyCleanupCase() {
  const repairedBefore = cleanupVerifierTempArtifacts(listVerifierTempEntries());
  const beforeEntries = new Set(listVerifierTempEntries());
  let caseError = null;

  try {
    await verifyAcceptanceChecklist();
  } catch (error) {
    caseError = error;
  }

  const remainingEntries = listVerifierTempEntries().filter((entry) => !beforeEntries.has(entry));
  const repairedAfter = cleanupVerifierTempArtifacts(remainingEntries);
  const stillRemainingEntries = listVerifierTempEntries().filter((entry) => !beforeEntries.has(entry));
  if (stillRemainingEntries.length > 0) {
    expectedFail(`verifier cleanup must remove temporary artifacts; artifactList=${JSON.stringify(stillRemainingEntries)}`);
  }

  if (repairedBefore.length > 0 || repairedAfter.length > 0) {
    console.log(`Recovered cleanup artifacts artifactList=${JSON.stringify([...repairedBefore, ...repairedAfter].sort())}`);
  }

  if (caseError) {
    throw caseError;
  }
}

async function verifyCleanupRecoveryCase() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  const helperSource = readFileSync(helperPath, 'utf8');
  const missingContracts = [];

  if (!/cleanup_artifact_failure[\s\S]{0,200}reasonCode:\s*["']VERIFY_CLEANUP_ARTIFACT_FAILURE["'][\s\S]{0,200}recoverable:\s*true[\s\S]{0,200}recoveryAction:\s*["']cleanup_artifacts["']/m.test(helperSource)) {
    missingContracts.push('recoverable cleanup-artifact failure policy');
  }

  if (!/(artifactList|leftoverArtifacts|cleanupArtifactList|cleanupArtifacts?:\s*\[|leftover artifact list)/i.test(helperSource)) {
    missingContracts.push('exact cleanup artifact-list normalization');
  }

  const publishCase = spawnSync(process.execPath, ['scripts/verify-publish-bundle.mjs', '--case', 'package-path-failure'], {
    cwd: root,
    encoding: 'utf8',
  });
  const publishOutput = `${publishCase.stdout ?? ''}\n${publishCase.stderr ?? ''}`.trim();

  if (publishCase.status === 0) {
    if (!/PASS package-path-failure/.test(publishOutput)) {
      throw new Error(`package-path-failure case must report a PASS marker when it succeeds; got ${JSON.stringify(publishOutput)}`);
    }
  } else if (!/(EXPECTED_FAIL|FAIL) package-path-failure:/.test(publishOutput)) {
    throw new Error(`package-path-failure case must fail with a named diagnostic result; got ${JSON.stringify(publishOutput)}`);
  }

  if (publishCase.status !== 0) {
    missingContracts.push('portable publish path diagnostics');
  }

  if (missingContracts.length > 0) {
    expectedFail(`cleanup recovery coverage is missing ${missingContracts.join(', ')}. package-path-failure output: ${publishOutput || `exit ${publishCase.status ?? 'unknown'}`}`);
  }
}

async function verifyPackageWiring() {
  const packageJsonPath = join(root, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const scripts = packageJson?.scripts ?? {};
  const failures = [];
  const requiredEntryPoints = ['prepack', 'verify:index', 'verify:pack'];

  for (const scriptName of requiredEntryPoints) {
    if (!scriptEventuallyRunsRefactorVerifier(scriptName, scripts)) {
      failures.push(`package.json script "${scriptName}" must reach scripts/verify-refactor-parity.mjs through existing npm script wiring`);
    }
  }

  for (const caseName of [acceptanceChecklistCaseKey, cleanupCaseKey]) {
    if (!supportedCaseNames.includes(caseName)) {
      failures.push(`scripts/verify-refactor-parity.mjs must expose the "${caseName}" case`);
    }
  }

  if (failures.length > 0) {
    expectedFail(`package wiring inspection failed for ${packageJsonPath}: ${failures.join('; ')}`);
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

async function loadBuildRefactorSelectedFilePlan() {
  const helper = await loadRefactorHelper();
  const buildRefactorSelectedFilePlan = helper?.buildRefactorSelectedFilePlan;

  if (typeof buildRefactorSelectedFilePlan !== 'function') {
    expectedFail('buildRefactorSelectedFilePlan is not exported from extensions/ralph-specum/refactor.ts yet.');
  }

  return buildRefactorSelectedFilePlan;
}

async function loadRefactorCommand(overrides = {}) {
  const extensionUrl = new URL('../extensions/ralph-specum/index.ts', import.meta.url);
  const extensionModule = await import(extensionUrl.href);
  const activate = extensionModule?.default;
  if (typeof activate !== 'function') {
    expectedFail('default export from extensions/ralph-specum/index.ts is not a command registrar.');
  }

  const commands = new Map();
  const pi = {
    events: overrides.events ?? new EventEmitter(),
    on() {},
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    ...overrides,
  };
  activate(pi);

  const command = commands.get('ralph-refactor');
  const handler = command?.handler;
  if (typeof handler !== 'function') {
    expectedFail('ralph-refactor command handler is not registered from extensions/ralph-specum/index.ts.');
  }

  return { pi, command, handler };
}

async function loadRefactorCommandHandler() {
  const command = await loadRefactorCommand();
  return command.handler;
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

function createRefactorRequestCaptureStub() {
  const events = new EventEmitter();
  const requests = [];
  let completionCount = 0;

  events.on('subagents:rpc:ping', (payload) => {
    events.emit(`subagents:rpc:ping:reply:${payload.requestId}`, { success: true, data: { version: 1 } });
  });

  events.on('subagents:rpc:spawn', (payload) => {
    requests.push(payload);
    const agentId = `refactor-capture-${requests.length}`;
    events.emit(`subagents:rpc:spawn:reply:${payload.requestId}`, { success: true, data: { id: agentId } });
    queueMicrotask(() => {
      completionCount += 1;
      events.emit('subagents:completed', {
        id: agentId,
        status: 'completed',
        result: [
          'REFACTOR_COMPLETE',
          'CASCADE_NEEDED: none',
          'CASCADE_REASON: none',
          `EVIDENCE: capture stub completion ${completionCount}`,
        ].join('\n'),
      });
    });
  });

  return { events, requests };
}

function createRefactorAuditRollbackStub() {
  const events = new EventEmitter();
  const requests = [];

  events.on('subagents:rpc:ping', (payload) => {
    events.emit(`subagents:rpc:ping:reply:${payload.requestId}`, { success: true, data: { version: 1 } });
  });

  events.on('subagents:rpc:spawn', (payload) => {
    requests.push(payload);
    const request = parseCapturedRefactorRequest(payload);
    const allowedPath = request?.allowedFiles?.[0];
    const unauthorizedDesignPath = join(request?.spec?.basePath ?? '', 'design.md');

    if (allowedPath) {
      writeFileSync(allowedPath, `${readFileSync(allowedPath, 'utf8')}\n<!-- allowed mutation from audit rollback stub -->\n`, 'utf8');
    }
    if (request?.spec?.basePath) {
      writeFileSync(unauthorizedDesignPath, `${readFileSync(unauthorizedDesignPath, 'utf8')}\n<!-- unauthorized design mutation from audit rollback stub -->\n`, 'utf8');
    }

    const agentId = `refactor-audit-${requests.length}`;
    events.emit(`subagents:rpc:spawn:reply:${payload.requestId}`, { success: true, data: { id: agentId } });
    queueMicrotask(() => {
      events.emit('subagents:completed', {
        id: agentId,
        status: 'completed',
        result: [
          'CASCADE_NEEDED: design',
          'EVIDENCE: malformed completion missing REFACTOR_COMPLETE and CASCADE_REASON',
        ].join('\n'),
      });
    });
  });

  return { events, requests };
}

function createRefactorCascadeHandlingStub() {
  const events = new EventEmitter();
  const requests = [];

  events.on('subagents:rpc:ping', (payload) => {
    events.emit(`subagents:rpc:ping:reply:${payload.requestId}`, { success: true, data: { version: 1 } });
  });

  events.on('subagents:rpc:spawn', (payload) => {
    requests.push(payload);
    const request = parseCapturedRefactorRequest(payload);
    const selectedKind = request?.files?.[0]?.kind;
    const allowedPath = request?.allowedFiles?.[0];
    const agentId = `refactor-cascade-${requests.length}`;

    if (allowedPath) {
      const mutationLabel = selectedKind === 'design' ? 'approved cascade mutation' : 'primary requirements mutation';
      writeFileSync(allowedPath, `${readFileSync(allowedPath, 'utf8')}\n<!-- ${mutationLabel} -->\n`, 'utf8');
    }

    events.emit(`subagents:rpc:spawn:reply:${payload.requestId}`, { success: true, data: { id: agentId } });
    queueMicrotask(() => {
      events.emit('subagents:completed', {
        id: agentId,
        status: 'completed',
        result: selectedKind === 'design'
          ? [
              'REFACTOR_COMPLETE',
              'CASCADE_NEEDED: none',
              'CASCADE_REASON: downstream design update applied',
              'EVIDENCE: design cascade stub completion',
            ].join('\n')
          : [
              'REFACTOR_COMPLETE',
              'CASCADE_NEEDED: design',
              'CASCADE_REASON: requirements changes should cascade into architecture notes',
              'EVIDENCE: requirements stub completion',
            ].join('\n'),
      });
    });
  });

  return { events, requests };
}

function createRefactorStateMergeStub() {
  const events = new EventEmitter();
  const requests = [];

  events.on('subagents:rpc:ping', (payload) => {
    events.emit(`subagents:rpc:ping:reply:${payload.requestId}`, { success: true, data: { version: 1 } });
  });

  events.on('subagents:rpc:spawn', (payload) => {
    requests.push(payload);
    const request = parseCapturedRefactorRequest(payload);
    const selectedKind = request?.files?.[0]?.kind;
    const allowedPath = request?.allowedFiles?.[0];
    const agentId = `refactor-state-${requests.length}`;

    if (allowedPath) {
      writeFileSync(allowedPath, `${readFileSync(allowedPath, 'utf8')}\n<!-- ${selectedKind} state merge mutation -->\n`, 'utf8');
    }

    events.emit(`subagents:rpc:spawn:reply:${payload.requestId}`, { success: true, data: { id: agentId } });
    queueMicrotask(() => {
      events.emit('subagents:completed', {
        id: agentId,
        status: 'completed',
        result: selectedKind === 'requirements'
          ? [
              'REFACTOR_COMPLETE',
              'CASCADE_NEEDED: design',
              'CASCADE_REASON: requirements state merge verifier requested a downstream design review',
              'EVIDENCE: requirements state merge stub completion',
            ].join('\n')
          : [
              'REFACTOR_COMPLETE',
              'CASCADE_NEEDED: none',
              `CASCADE_REASON: ${selectedKind} state merge stub completion`,
              `EVIDENCE: ${selectedKind} state merge stub completion`,
            ].join('\n'),
      });
    });
  });

  return { events, requests };
}

function parseCapturedRefactorRequest(spawnPayload) {
  const prompt = String(spawnPayload?.prompt ?? '');
  const match = prompt.match(/\{[\s\S]*\}/m);
  if (!match) {
    throw new Error(`could not locate JSON request payload in captured prompt: ${prompt}`);
  }
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    throw new Error(`captured request payload is not valid JSON: ${error?.message ?? error}`);
  }
}

function assertRequestHasKeys(value, keys) {
  const actualKeys = value && typeof value === 'object' ? Object.keys(value) : [];
  const missing = keys.filter((key) => !actualKeys.includes(key));
  if (missing.length > 0) {
    throw new Error(`request payload is missing key(s): ${missing.join(', ')} from ${JSON.stringify(actualKeys)}`);
  }
}

function initializeGitFixture(cwd) {
  runGitFixtureCommand(cwd, ['init']);
  runGitFixtureCommand(cwd, ['config', 'user.name', 'Refactor Verifier']);
  runGitFixtureCommand(cwd, ['config', 'user.email', 'refactor-verifier@example.com']);
  runGitFixtureCommand(cwd, ['add', '.']);
  runGitFixtureCommand(cwd, ['commit', '-m', 'baseline fixture']);
}

function runGitFixtureCommand(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.stdout || `status ${result.status ?? 'unknown'}`}`);
  }
  return result.stdout.trim();
}

function gitCommitCount(cwd) {
  return Number.parseInt(runGitFixtureCommand(cwd, ['rev-list', '--count', 'HEAD']), 10);
}

function gitLastCommitPaths(cwd) {
  const output = runGitFixtureCommand(cwd, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']);
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function readLoggedGitInvocations(logPath) {
  return readFileSync(logPath, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function withLoggedGitWrapper(run) {
  const wrapperRoot = mkdtempSync(join(tmpdir(), 'ralph-refactor-git-wrapper-'));
  const binDir = join(wrapperRoot, 'bin');
  const wrapperPath = join(binDir, 'git');
  const logPath = join(wrapperRoot, 'git.log');
  const originalPath = process.env.PATH ?? '';
  const originalRealGit = process.env.RALPH_REAL_GIT;
  const originalGitLog = process.env.RALPH_GIT_LOG;
  const originalAuthorName = process.env.GIT_AUTHOR_NAME;
  const originalAuthorEmail = process.env.GIT_AUTHOR_EMAIL;
  const originalCommitterName = process.env.GIT_COMMITTER_NAME;
  const originalCommitterEmail = process.env.GIT_COMMITTER_EMAIL;
  const realGitLookup = spawnSync('bash', ['-lc', 'command -v git'], { cwd: root, encoding: 'utf8' });
  const realGit = realGitLookup.status === 0 ? realGitLookup.stdout.trim() : '';

  if (!realGit) {
    throw new Error(`unable to locate real git binary for commit-spec verifier: ${realGitLookup.stderr || realGitLookup.stdout || `status ${realGitLookup.status ?? 'unknown'}`}`);
  }

  mkdirSync(binDir, { recursive: true });
  writeFileSync(wrapperPath, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$RALPH_GIT_LOG"
if [ "\${1:-}" = "push" ]; then
  echo "git push blocked by verifier" >&2
  exit 99
fi
exec "$RALPH_REAL_GIT" "$@"
`, 'utf8');
  chmodSync(wrapperPath, 0o755);
  writeFileSync(logPath, '', 'utf8');

  process.env.PATH = `${binDir}:${originalPath}`;
  process.env.RALPH_REAL_GIT = realGit;
  process.env.RALPH_GIT_LOG = logPath;
  process.env.GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME ?? 'Refactor Verifier';
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL ?? 'refactor-verifier@example.com';
  process.env.GIT_COMMITTER_NAME = process.env.GIT_COMMITTER_NAME ?? process.env.GIT_AUTHOR_NAME;
  process.env.GIT_COMMITTER_EMAIL = process.env.GIT_COMMITTER_EMAIL ?? process.env.GIT_AUTHOR_EMAIL;

  try {
    return await run(logPath);
  } finally {
    process.env.PATH = originalPath;
    restoreEnvValue('RALPH_REAL_GIT', originalRealGit);
    restoreEnvValue('RALPH_GIT_LOG', originalGitLog);
    restoreEnvValue('GIT_AUTHOR_NAME', originalAuthorName);
    restoreEnvValue('GIT_AUTHOR_EMAIL', originalAuthorEmail);
    restoreEnvValue('GIT_COMMITTER_NAME', originalCommitterName);
    restoreEnvValue('GIT_COMMITTER_EMAIL', originalCommitterEmail);
    rmSync(wrapperRoot, { recursive: true, force: true });
  }
}

function restoreEnvValue(name, value) {
  if (typeof value === 'string') {
    process.env[name] = value;
    return;
  }
  delete process.env[name];
}

function createRefactorCommandFixture(tempRoot, options = {}) {
  const projectRoot = join(tempRoot, 'project');
  const configuredSpecRoot = join(projectRoot, 'custom-specs');
  const specRoot = join(configuredSpecRoot, 'interactive-target');

  mkdirSync(join(projectRoot, '.pi'), { recursive: true });
  mkdirSync(specRoot, { recursive: true });
  writeFileSync(join(projectRoot, '.pi', 'ralph-specum.local.md'), ['---', 'specs_dirs:', '  - ./custom-specs', '---', ''].join('\n'), 'utf8');
  writeFileSync(join(configuredSpecRoot, '.current-spec'), 'interactive-target\n', 'utf8');
  writeFileSync(join(specRoot, 'requirements.md'), ['# Requirements', '', '## Scope', 'Body', '', '## Open Questions', 'Body', ''].join('\n'), 'utf8');
  writeFileSync(join(specRoot, 'design.md'), ['# Design', '', '## Architecture', 'Body', ''].join('\n'), 'utf8');
  writeFileSync(join(specRoot, 'tasks.md'), ['# Tasks', '', '- [ ] Demo task', ''].join('\n'), 'utf8');
  writeFileSync(join(specRoot, '.progress.md'), ['# Progress', '', '## Learnings', '- interactive planning should read this later', ''].join('\n'), 'utf8');
  writeFileSync(join(specRoot, '.ralph-state.json'), `${JSON.stringify({
    source: 'spec',
    name: 'interactive-target',
    basePath: specRoot,
    phase: 'execution',
    taskIndex: 3,
    totalTasks: 7,
    commitSpec: options.commitSpec ?? true,
    relatedSpecs: [{ name: 'packaged-resource-parity', relevance: 'High' }],
    epicName: 'smart-ralph-parity-audit',
    epicSpecName: 'spec-refactor-command-parity',
  }, null, 2)}\n`, 'utf8');

  return { projectRoot, configuredSpecRoot, specRoot };
}

async function captureConsoleLogs(run) {
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.map((value) => String(value)).join(' '));
  };

  try {
    await run();
    return lines;
  } finally {
    console.log = originalLog;
  }
}

function hashFiles(filePaths) {
  const hash = createHash('sha256');
  for (const filePath of filePaths) {
    hash.update(`${filePath}\n`);
    hash.update(readFileSync(filePath));
  }
  return hash.digest('hex');
}

function hashFile(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

function stringifyParseResult(result) {
  return JSON.stringify(result, (_key, value) => {
    if (value instanceof Error) return { message: value.message };
    return value;
  });
}

function scriptEventuallyRunsRefactorVerifier(scriptName, scripts, seen = new Set()) {
  if (seen.has(scriptName)) return false;
  seen.add(scriptName);

  const command = String(scripts?.[scriptName] ?? '');
  if (!command) return false;
  if (command.includes('scripts/verify-refactor-parity.mjs')) return true;

  const nestedScripts = [...command.matchAll(/npm run\s+([^\s&;|]+)/g)].map((match) => match[1]);
  return nestedScripts.some((nestedScriptName) => scriptEventuallyRunsRefactorVerifier(nestedScriptName, scripts, seen));
}

function listVerifierTempEntries() {
  return readDirectoryEntries(tmpdir())
    .map((entry) => entry.name)
    .filter((entryName) => verifierTempPrefixes.some((prefix) => entryName.startsWith(prefix)))
    .sort();
}

function cleanupVerifierTempArtifacts(entryNames) {
  const normalizedEntries = [...new Set(entryNames)]
    .filter((entryName) => verifierTempPrefixes.some((prefix) => entryName.startsWith(prefix)))
    .sort();
  for (const entryName of normalizedEntries) {
    rmSync(join(tmpdir(), entryName), { recursive: true, force: true });
  }
  return normalizedEntries;
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

function assertPreservedRefactorStateMetadata(actual, before, expectedBasePath, label) {
  assertEqual(actual?.source, before?.source, `${label} source`);
  assertEqual(actual?.name, before?.name, `${label} name`);
  assertEqual(actual?.basePath, expectedBasePath, `${label} basePath`);
  assertEqual(actual?.phase, before?.phase, `${label} phase`);
  assertEqual(actual?.commitSpec, before?.commitSpec, `${label} commitSpec`);
  assertArrayEqual(actual?.relatedSpecs, before?.relatedSpecs, `${label} relatedSpecs`);
  assertEqual(actual?.epicName, before?.epicName, `${label} epicName`);
  assertEqual(actual?.epicSpecName, before?.epicSpecName, `${label} epicSpecName`);
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
