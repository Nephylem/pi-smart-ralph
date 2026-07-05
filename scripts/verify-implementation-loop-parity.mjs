#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
const cases = new Map([
  ['state-resume', verifyStateResume],
  ['state-integrity', verifyStateIntegrity],
  ['recovery-fix', verifyRecoveryFix],
  ['recovery-bounds', verifyRecoveryBounds],
  ['task-modification', verifyTaskModification],
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

async function verifyRecoveryBounds() {
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

  const boundedRecoveryPatterns = [
    /maxFixTasksPerOriginal/,
    /maxFixTaskDepth/,
    /attempts\s*>?=\s*(?:maxFixTasksPerOriginal|numberField\([^\n]+maxFixTasksPerOriginal)/,
    /(?:depth|lineage)[\s\S]{0,160}>?=\s*(?:maxFixTaskDepth|numberField\([^\n]+maxFixTaskDepth)/,
  ];
  const hasBoundChecks = boundedRecoveryPatterns.every((pattern) => pattern.test(indexSource + helperSource));
  if (!hasBoundChecks) {
    expectedFail('recovery mode still lacks explicit maxFixTasksPerOriginal/maxFixTaskDepth stop checks before inserting more fix tasks.');
  }

  const extractedHelperPatterns = [
    /export function getImplementationRecoveryBounds\(/,
    /export function isImplementationRecoveryStopRequired\(/,
    /export function formatImplementationRecoveryStopMessage\(/,
    /createImplementationRecoveryStopPlan\([\s\S]*?getImplementationRecoveryBounds\(/,
    /createImplementationRecoveryStopPlan\([\s\S]*?formatImplementationRecoveryStopMessage\(/,
  ];
  if (!extractedHelperPatterns.every((pattern) => pattern.test(helperSource))) {
    expectedFail('recovery bounds are not yet isolated behind reusable helper exports for bounds and stop-message formatting.');
  }

  const stopBranch = failureSection[0].match(/if \([^\n]*maxFix[^\)]*\) \{[\s\S]*?blockImplementation\([\s\S]*?return;[\s\S]*?\}/);
  if (!stopBranch) {
    expectedFail('recovery mode does not yet stop non-successfully when fix-task count or depth limits are exceeded.');
  }

  const stopProofPatterns = [
    /originalTaskId|retry target|retryTarget/,
    /fixTaskIds|lineage|history/,
  ];
  const hasStopProof = stopProofPatterns.every((pattern) => pattern.test(stopBranch[0] + helperSource));
  if (!hasStopProof) {
    expectedFail('recovery over-limit stop does not yet report the original task id plus fix-task history or lineage.');
  }

  const stableStopMessagePattern = /Recovery (?:limit|depth) reached for .*: (?:fix history .* already used .* attempts\.|lineage .* is already at depth .*\.)/;
  if (!stableStopMessagePattern.test(helperSource)) {
    expectedFail('recovery stop-message formatting is not stable enough for verifier assertions.');
  }

  if (/ALL_TASKS_COMPLETE/.test(stopBranch[0])) {
    throw new Error('recovery over-limit stop branch must not emit ALL_TASKS_COMPLETE.');
  }
}

async function verifyTaskModification() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('execution loop helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  const parseSection = indexSource.match(/function parseTaskModificationRequest\([\s\S]*?return \{[\s\S]*?proposedTasks,\n\t\};\n\}/);
  if (!parseSection) {
    expectedFail('could not locate TASK_MODIFICATION_REQUEST payload parser.');
  }

  const invalidPayloadPatterns = [
    /payload must be a JSON object/,
    /Unsupported TASK_MODIFICATION_REQUEST type/,
    /must include originalTaskId/,
    /must include reasoning/,
    /must include at least one proposed task block/,
  ];
  const missingInvalidPayloadChecks = invalidPayloadPatterns.filter((pattern) => !pattern.test(parseSection[0]));
  if (missingInvalidPayloadChecks.length > 0) {
    expectedFail('TASK_MODIFICATION_REQUEST parser does not yet reject invalid payload shape before any mutation attempt.');
  }

  const handlerSection = indexSource.match(/function handleTaskModificationRequest\([\s\S]*?\n\}/);
  if (!handlerSection) {
    expectedFail('could not locate TASK_MODIFICATION_REQUEST application handler.');
  }

  const handlerSource = handlerSection[0];
  if (!/targeted .* active task/.test(handlerSource)) {
    expectedFail('task modification handling does not yet reject mismatched originalTaskId values.');
  }
  if (!/proposed duplicate task ids/.test(handlerSource)) {
    expectedFail('task modification handling does not yet reject duplicate proposed task ids.');
  }

  const firstMutationIndex = [handlerSource.indexOf('setTaskCheckboxStatus('), handlerSource.indexOf('insertTaskBlocks(')]
    .filter((value) => value >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  const validationIndices = [
    handlerSource.indexOf('request.originalTaskId !== currentTaskId'),
    handlerSource.indexOf('proposed duplicate task ids'),
    handlerSource.indexOf('must be a single checkbox task block'),
    handlerSource.indexOf('already exists in tasks.md'),
  ].filter((value) => value >= 0);
  if (firstMutationIndex < 0 || validationIndices.length < 4) {
    expectedFail('task modification verifier could not prove validation happens before file mutation.');
  }
  if (validationIndices.some((value) => value > firstMutationIndex)) {
    throw new Error('unsafe task modification validation appears after task-file mutation.');
  }

  const validMutationPatterns = [
    /modificationMap:\s*modificationStatePatch/,
    /nativeTaskMirrorStatePatch\(mirror\)/,
    /totalTasks:\s*updatedTasks\.length/,
  ];
  const missingValidMutationBehavior = validMutationPatterns.filter((pattern) => !pattern.test(handlerSource));
  if (missingValidMutationBehavior.length > 0) {
    expectedFail('valid task modification requests do not yet persist modificationMap history and remap native task ordering.');
  }

  const extractedHelperPatterns = [
    /export function (?:validate|parse)ImplementationTaskModification/,
    /export function validateImplementationTaskMutation/,
    /export function applyImplementationTaskBlockMutation/,
    /export function createImplementationTaskMutationRemapPatch/,
    /export function applyImplementationTaskModification/,
    /export function createImplementationTaskModificationStatePatch/,
  ];
  if (!extractedHelperPatterns.every((pattern) => pattern.test(helperSource))) {
    expectedFail('task modification validation, block mutation, and remap logic are not yet isolated in implementation-loop.ts for safe parity coverage.');
  }

  if (!/join\("\\n\\n"\)[\s\S]*replace\(/.test(helperSource)) {
    expectedFail('task block mutation helper is not yet deterministic enough for fixture assertions.');
  }

  if (!/from\s+["']\.\/implementation-loop(?:\.ts)?["'][\s\S]*ImplementationTaskModification/.test(indexSource)) {
    expectedFail('runImplementCommand does not yet delegate task modification request handling through implementation-loop.ts helpers.');
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
