#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
const cases = new Map([
  ['state-resume', verifyStateResume],
  ['state-integrity', verifyStateIntegrity],
  ['recovery-fix', verifyRecoveryFix],
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

async function verifyStateIntegrity() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('execution bootstrap helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  if (!/createImplementationStateDefaults\(/.test(helperSource)) {
    expectedFail('pre-execution state upgrade helper is not available yet.');
  }

  const startupSection = indexSource.match(/taskData = readImplementationTasks\(spec\);[\s\S]*?state = ensureNativeTaskCardsForImplementation\(pi, ctx, spec, options, state, taskData\.tasks\);/);
  if (!startupSection) {
    expectedFail('could not locate implementation startup state bootstrap and native-task repair sequence.');
  }

  if (!/export function validateImplementationExecutionState\(/.test(helperSource)) {
    expectedFail('implementation-loop.ts does not export validateImplementationExecutionState for corrupt execution-state rejection yet.');
  }

  if (!/validateImplementationExecutionState\(state[,\s]/.test(startupSection[0])) {
    expectedFail('implementation startup does not validate corrupt execution state before delegation or native-task repair.');
  }

  if (!/\.ralph-state\.json/.test(helperSource) || !/missing required|invalid|required top-level/i.test(helperSource)) {
    expectedFail('corrupt execution-state diagnostics do not yet name .ralph-state.json and the missing or invalid field.');
  }

  const staleMapRepairSection = indexSource.match(/function ensureNativeTaskCardsForImplementation\([\s\S]*?return state \?\? \{\};\n\}/);
  if (!staleMapRepairSection) {
    expectedFail('could not locate native task map repair helper.');
  }

  if (!/nativeTaskRepairReason\(/.test(staleMapRepairSection[0]) || !/mirrorTasksToNativeTaskCards\(/.test(staleMapRepairSection[0])) {
    expectedFail('native task map repair is not wired to canonical tasks.md mirroring yet.');
  }

  if (!/mergeRalphState\(spec, \{ \.\.\.nativeTaskMirrorStatePatch\(mirror\), nativeTaskRepairReason: repairReason \}, options\)/.test(staleMapRepairSection[0])) {
    expectedFail('stale native task map repair does not persist the rebuilt mapping before continuing execution.');
  }
}

async function verifyRecoveryFix() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('execution loop helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  const failureSection = indexSource.match(/if \(!validation\.ok\) \{[\s\S]*?continue;\n\s*\}/);
  if (!failureSection) {
    expectedFail('could not locate implementation failure handling branch.');
  }

  if (!/recoveryMode/.test(failureSection[0]) || !/fixTaskMap/.test(indexSource + helperSource)) {
    expectedFail('recoverable task failures do not branch through recovery-mode fix-task handling yet.');
  }

  const isolatedHelperPatterns = [
    /export function createImplementationFixTaskId\(/,
    /export function resolveImplementationInsertionAnchor\(/,
    /export function createImplementationFixTaskLineage\(/,
    /createImplementationFixTaskPlan\([\s\S]*?createImplementationFixTaskLineage\(/,
    /mergeImplementationFixTaskIds\([\s\S]*?sort\(compareImplementationFixTaskIds\)/,
  ];
  const missingIsolatedHelpers = isolatedHelperPatterns.filter((pattern) => !pattern.test(helperSource));
  if (missingIsolatedHelpers.length > 0) {
    expectedFail('recovery helpers are not yet isolated behind dedicated fix-task id, anchor, lineage, and deterministic ordering helpers.');
  }

  const fixTrackingPatterns = [
    /attempts\s*:\s*\d+/,
    /fixTaskIds/,
    /lastError/,
  ];
  const missingFixTracking = fixTrackingPatterns.filter((pattern) => !pattern.test(indexSource + helperSource));
  if (missingFixTracking.length > 0) {
    expectedFail('recovery mode does not yet record fixTaskMap attempts, fixTaskIds, and lastError for the failed original task.');
  }

  const insertionPatterns = [
    /\[FIX\s+\$?\{?(?:task|originalTask)[^\]]*\]?/,
    /totalTasks\s*:\s*(?:tasks\.length\s*\+\s*1|numberField\([^\n]+totalTasks[^\n]+\)\s*\+\s*1)/,
    /taskIndex\s*:\s*(?:insertedFixTaskIndex|fixTaskIndex|task\.index\s*\+\s*1)/,
  ];
  const hasInsertionPlan = insertionPatterns.every((pattern) => pattern.test(indexSource + helperSource));
  if (!hasInsertionPlan) {
    expectedFail('recovery mode does not yet insert a <taskId>.<attempt> fix task after the failed block, increment totalTasks, and resume at that fix task.');
  }

  const lineagePatterns = [
    /\[FIX\s+\$?\{?(?:task|originalTask)[^\]]*\]?/,
    /originalTaskId|retry target|retryTarget|lineage/i,
  ];
  const hasLineage = lineagePatterns.every((pattern) => pattern.test(indexSource + helperSource));
  if (!hasLineage) {
    expectedFail('recovery mode does not yet preserve the original task as the retry target in recorded fix-task lineage.');
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
