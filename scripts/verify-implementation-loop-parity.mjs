#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
const cases = new Map([
  ['state-resume', verifyStateResume],
]);
const supportedCaseNames = [...cases.keys()];

async function main() {
  const caseName = requestedCase === 'all' ? 'state-resume' : requestedCase;
  const verifyCase = cases.get(caseName);
  if (!verifyCase) {
    console.error(`Unknown verify case: ${caseName}`);
    console.error(`Supported cases: ${supportedCaseNames.join(', ')}`);
    process.exitCode = 2;
    return;
  }

  try {
    await verifyCase();
    console.log(`PASS ${caseName}`);
  } catch (error) {
    if (error?.expectedFail === true) {
      console.error(`EXPECTED_FAIL ${caseName}: ${error.message}`);
    } else {
      console.error(`FAIL ${caseName}: ${formatError(error)}`);
    }
    process.exitCode = 1;
  }
}

function parseCaseArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--case') return args[index + 1] ?? '';
    if (token.startsWith('--case=')) return token.slice('--case='.length);
  }
  return 'all';
}

async function verifyStateResume() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('execution bootstrap helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  if (!/from\s+["']\.\/implementation-loop(?:\.ts)?["']/.test(indexSource)) {
    expectedFail('runImplementCommand does not import ./implementation-loop yet.');
  }

  if (!/runImplementCommand[\s\S]*?implementation-loop/i.test(indexSource)) {
    expectedFail('runImplementCommand does not delegate execution bootstrap/resume handling to implementation-loop helpers yet.');
  }

  const bootstrapSection = indexSource.match(/state\s*=\s*mergeRalphState\([\s\S]*?awaitingApproval:\s*false,[\s\S]*?validationError:\s*null,[\s\S]*?\}\s*,\s*options\s*\);/);
  if (!bootstrapSection) {
    expectedFail('could not locate execution bootstrap state merge in runImplementCommand.');
  }

  const bootstrapRequiredFields = [
    'phase',
    'taskIndex',
    'totalTasks',
    'taskIteration',
    'globalIteration',
    'recoveryMode',
    'maxFixTasksPerOriginal',
    'maxFixTaskDepth',
    'fixTaskMap',
    'modificationMap',
    'nativeTaskMap',
    'evidence',
  ];

  const missingBootstrapFields = bootstrapRequiredFields.filter((field) => !new RegExp(`${field}\\s*:`).test(bootstrapSection[0]));
  if (missingBootstrapFields.length > 0) {
    expectedFail(`fresh execution bootstrap is missing ImplementationLoopStateV1 fields: ${missingBootstrapFields.join(', ')}`);
  }

  const resumeSection = indexSource.match(/function implementationAttemptPatch\([\s\S]*?return\s*\{[\s\S]*?currentTask:\s*\{[\s\S]*?\};\n\}/);
  if (!resumeSection) {
    expectedFail('could not locate implementationAttemptPatch resume state merge.');
  }

  const resumeRequiredPatterns = [
    ['phase', /phase:\s*["']execution["']/],
    ['taskIndex', /taskIndex:\s*task\.index/],
    ['totalTasks', /totalTasks/],
    ['taskIteration', /taskIteration/],
    ['globalIteration', /globalIteration/],
    ['recoveryMode', /recoveryMode:\s*parsed\.recoveryMode/],
    ['maxFixTasksPerOriginal', /maxFixTasksPerOriginal:\s*numberField\(state,\s*["']maxFixTasksPerOriginal["']\)\s*\?\?\s*3/],
    ['maxFixTaskDepth', /maxFixTaskDepth:\s*numberField\(state,\s*["']maxFixTaskDepth["']\)\s*\?\?\s*3/],
    ['fixTaskMap', /fixTaskMap:\s*stateRecordField\(state,\s*["']fixTaskMap["']\)/],
    ['modificationMap', /modificationMap:\s*stateRecordField\(state,\s*["']modificationMap["']\)/],
    ['nativeTaskMap', /nativeTaskMap:\s*stateRecordField\(state,\s*["']nativeTaskMap["']\)/],
    ['evidence', /evidence:\s*stateRecordField\(state,\s*["']evidence["']\)/],
  ];

  const missingResumeFields = resumeRequiredPatterns
    .filter(([, pattern]) => !pattern.test(resumeSection[0]))
    .map(([field]) => field);

  if (missingResumeFields.length > 0) {
    expectedFail(`resumed execution state does not preserve in-flight fields: ${missingResumeFields.join(', ')}`);
  }
}

function expectedFail(message) {
  const error = new Error(message);
  error.expectedFail = true;
  throw error;
}

function formatError(error) {
  return String(error?.stack ?? error?.message ?? error);
}

await main();
