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
  ['headless-prompts', verifyHeadlessPrompts],
  ['file-narrowing', verifyFileNarrowing],
  ['specialist-contract', verifySpecialistContract],
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

async function loadRefactorCommandHandler() {
  const extensionUrl = new URL('../extensions/ralph-specum/index.ts', import.meta.url);
  const extensionModule = await import(extensionUrl.href);
  const activate = extensionModule?.default;
  if (typeof activate !== 'function') {
    expectedFail('default export from extensions/ralph-specum/index.ts is not a command registrar.');
  }

  const commands = new Map();
  activate({
    on() {},
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
  });

  const handler = commands.get('ralph-refactor')?.handler;
  if (typeof handler !== 'function') {
    expectedFail('ralph-refactor command handler is not registered from extensions/ralph-specum/index.ts.');
  }

  return handler;
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

function createRefactorCommandFixture(tempRoot) {
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
  writeFileSync(join(specRoot, '.ralph-state.json'), `${JSON.stringify({ name: 'interactive-target', taskIndex: 3 }, null, 2)}\n`, 'utf8');

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
