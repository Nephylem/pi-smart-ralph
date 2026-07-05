#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
const acceptanceChecklistCaseKey = 'acceptance-checklist';
const cleanupCaseKey = 'cleanup';
const acceptanceChecklistCases = [
  'state-resume',
  'state-integrity',
  'recovery-fix',
  'recovery-bounds',
  'task-modification',
  'completion-gates',
  'parallel-batch',
  'layer3-review',
  'completion-finalizer',
  'contract-wiring',
  'edge-cases',
];
const cases = new Map([
  ['state-resume', verifyStateResume],
  ['state-integrity', verifyStateIntegrity],
  ['recovery-fix', verifyRecoveryFix],
  ['recovery-bounds', verifyRecoveryBounds],
  ['task-modification', verifyTaskModification],
  ['completion-gates', verifyCompletionGates],
  ['parallel-batch', verifyParallelBatch],
  ['layer3-review', verifyLayer3Review],
  ['completion-finalizer', verifyCompletionFinalizer],
  ['contract-wiring', verifyContractWiring],
  ['edge-cases', verifyEdgeCases],
  [acceptanceChecklistCaseKey, verifyAcceptanceChecklist],
  [cleanupCaseKey, verifyCleanup],
]);
const supportedCaseNames = [...cases.keys()];

async function main() {
  const caseName = requestedCase === 'all' ? acceptanceChecklistCaseKey : requestedCase;
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

async function verifyCompletionGates() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('execution loop helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  const validationSection = indexSource.match(/function validateSubagentCompletion\([\s\S]*?\n}\n\nfunction runGitCommand/);
  if (!validationSection) {
    expectedFail('could not locate validateSubagentCompletion completion gate validator.');
  }

  const helperGatePatterns = [
    /export function hasImplementationCompletionSignal\(/,
    /export function detectImplementationCompletionContradiction\(/,
    /export function extractImplementationCompletionEvidence\(/,
    /export function validateImplementationTaskCompletion\(/,
  ];
  if (!helperGatePatterns.every((pattern) => pattern.test(helperSource))) {
    expectedFail('completion gate parsing and validation are not yet isolated behind implementation-loop.ts helper exports.');
  }

  if (!/from\s+["']\.\/implementation-loop(?:\.ts)?["'][\s\S]*validateImplementationTaskCompletion/.test(indexSource)) {
    expectedFail('runImplementCommand does not yet import completion gate validation helpers from implementation-loop.ts.');
  }

  if (!/validateSubagentCompletion\([\s\S]*validateImplementationTaskCompletion\(/.test(indexSource)) {
    expectedFail('validateSubagentCompletion does not yet delegate normal and \[VERIFY\] completion gates through implementation-loop.ts.');
  }

  const behaviorPatterns = [
    /TASK_COMPLETE/,
    /VERIFICATION_PASS/,
    /VERIFICATION_FAIL/,
    /requires manual|cannot be automated|USER_INPUT_REQUIRED|TASK_MODIFICATION_REQUEST/i,
    /verify\|verification\|evidence/i,
  ];
  const missingBehavior = behaviorPatterns.filter((pattern) => !pattern.test(validationSection[0] + helperSource));
  if (missingBehavior.length > 0) {
    expectedFail('completion gate coverage does not yet prove normal-task success, contradiction rejection, keyed evidence, and [VERIFY] pass/fail handling.');
  }
}

async function verifyLayer3Review() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('execution loop helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  const loopSection = indexSource.match(/implementationLoop: while \(true\) \{[\s\S]*?completedSummaries\.push\(`- Completed task/);
  if (!loopSection) {
    expectedFail('could not locate implementation execution loop for Layer 3 review checkpoints.');
  }

  const checkpointPatterns = [
    ['review invocation', /runArtifactReview\(/],
    ['review result handling', /REVIEW_PASS|REVIEW_FAIL/],
    ['checkpoint calculator helper', /export function calculateImplementationReviewCheckpointFlags\(/],
    ['checkpoint bridge helper', /createImplementationReviewCheckpoint\([\s\S]*?calculateImplementationReviewCheckpointFlags\(/],
    ['every-5th-task checkpoint', /taskIndex\s*>\s*0\s*&&\s*taskIndex\s*%\s*5\s*={1,3}\s*0/],
    ['final-task checkpoint', /taskIndex\s*={1,3}\s*totalTasks\s*-\s*1|totalTasks\s*-\s*1/],
    ['phase-boundary checkpoint', /phase(?:Boundary|Changed|Change)|first task of a new phase|phase-number change/i],
  ];
  const missingCheckpointPatterns = checkpointPatterns.filter(([, pattern]) => !pattern.test(loopSection[0] + helperSource)).map(([label]) => label);
  if (missingCheckpointPatterns.length > 0) {
    expectedFail(`Layer 3 review cadence is not yet wired for phase-boundary, every-5th-task, and final-task checkpoints (${missingCheckpointPatterns.join(', ')}).`);
  }

  const evidenceSection = indexSource.match(/setTaskCheckboxStatus\(spec, task\.index, true\);[\s\S]*?completedSummaries\.push\(`- Completed task/);
  if (!evidenceSection) {
    expectedFail('could not locate successful task completion state update for Layer 3 review evidence.');
  }

  const evidencePatterns = [
    ['canonical review evidence', /evidence[\s\S]{0,160}reviews|reviews[\s\S]{0,160}completedAt|reviews[\s\S]{0,160}summary/i],
    ['review evidence entry helper', /export function createImplementationReviewEvidenceEntry\(/],
    ['review recorder helper', /recordImplementationReviewEvidence\([\s\S]*?createImplementationReviewEvidenceEntry\(/],
    ['review pass/fail status', /REVIEW_PASS|REVIEW_FAIL/],
    ['progress evidence append', /appendProgress|appendArtifactReviewProgress/],
  ];
  const missingEvidencePatterns = evidencePatterns.filter(([, pattern]) => !pattern.test(evidenceSection[0] + helperSource)).map(([label]) => label);
  if (missingEvidencePatterns.length > 0) {
    expectedFail(`triggered Layer 3 reviews do not yet record REVIEW_PASS/REVIEW_FAIL evidence in progress or canonical evidence (${missingEvidencePatterns.join(', ')}).`);
  }

  const finalSection = indexSource.match(/if \(next\.kind === "complete"\) \{[\s\S]*?"ALL_TASKS_COMPLETE",/);
  if (!finalSection) {
    expectedFail('could not locate ALL_TASKS_COMPLETE finalization path.');
  }

  const finalGatePatterns = [
    ['review evidence lookup', /reviews/],
    ['review status requirement', /REVIEW_PASS|REVIEW_FAIL/],
    ['review-before-complete gate', /runArtifactReview\(|review.*before.*ALL_TASKS_COMPLETE|ALL_TASKS_COMPLETE[\s\S]{0,120}review/i],
  ];
  const missingFinalGatePatterns = finalGatePatterns.filter(([, pattern]) => !pattern.test(finalSection[0] + helperSource)).map(([label]) => label);
  if (missingFinalGatePatterns.length > 0) {
    expectedFail(`final completion is not yet gated on required Layer 3 review evidence before ALL_TASKS_COMPLETE (${missingFinalGatePatterns.join(', ')}).`);
  }
}

async function verifyParallelBatch() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('execution loop helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  const dependencySection = indexSource.match(/function assignNativeTaskDependencies\([\s\S]*?\n}\n\nfunction activeToolDependencyError/);
  if (!dependencySection) {
    expectedFail('could not locate native-task dependency assignment for [P] tasks.');
  }

  const barrierPatterns = [
    /let barrier: number\[\] = \[\];/,
    /let parallelGroup: number\[\] = \[\];/,
    /if \(task\.isParallel\) \{[\s\S]*?task\.blockedByIndices = \[\.\.\.barrier\];[\s\S]*?parallelGroup\.push\(task\.index\);/,
    /if \(parallelGroup\.length > 0\) \{[\s\S]*?barrier = \[\.\.\.parallelGroup\];[\s\S]*?parallelGroup = \[\];/,
  ];
  if (!barrierPatterns.every((pattern) => pattern.test(dependencySection[0]))) {
    throw new Error('parallel task metadata no longer preserves downstream barrier prerequisites for contiguous [P] groups.');
  }

  const nextTaskSection = indexSource.match(/function nextImplementationTask\([\s\S]*?\n}\n\nfunction stateRecordField/);
  if (!nextTaskSection) {
    expectedFail('could not locate nextImplementationTask selection logic.');
  }

  const batchSelectionPatterns = [
    /kind:\s*["']batch["']|parallel-sequential/,
    /taskIndices:\s*\[/,
    /selectImplementationExecutionBatchTaskIndices|createImplementationExecutionBatch|resolveImplementationExecutionBatch/,
  ];
  if (batchSelectionPatterns.some((pattern) => !pattern.test(nextTaskSection[0]))) {
    expectedFail('contiguous [P] groups still run as individual tasks: no isolated ExecutionBatch selection describes one sequential batch in listed task order.');
  }

  const helperIsolationPatterns = [
    /export function selectImplementationExecutionBatchTaskIndices\(/,
    /export function resolveImplementationExecutionBatch\([\s\S]*?selectImplementationExecutionBatchTaskIndices\(/,
    /export function createImplementationExecutionBatch\([\s\S]*?resolveImplementationExecutionBatch\(/,
    /export function applyImplementationBatchTaskEvidence\(/,
    /export function mergeImplementationBatchTaskEvidence\([\s\S]*?applyImplementationBatchTaskEvidence\(/,
  ];
  if (helperIsolationPatterns.some((pattern) => !pattern.test(helperSource))) {
    expectedFail('batch planning and evidence recording are not yet isolated behind dedicated helper exports.');
  }

  const loopSection = indexSource.match(/while \(true\) \{[\s\S]*?const next = nextImplementationTask\(tasks, numberField\(state, ["']taskIndex["']\)\);[\s\S]*?validation = validateSubagentCompletion\(completion, definition, task, workspaceReport\);/);
  if (!loopSection) {
    expectedFail('could not locate implementation execution loop for runnable task delegation.');
  }

  const batchExecutionPatterns = [
    /for \(const batchTask of|for \(const taskIndex of|batchTasks|executionBatch|parallelBatch/i,
    /recordImplementationBatchTaskEvidence|applyImplementationBatchTaskEvidence|mergeImplementationBatchTaskEvidence/,
    /parallel-sequential|sequential batch/i,
  ];
  const helperBatchPatterns = [
    /ExecutionBatch/,
    /selectImplementationExecutionBatchTaskIndices|createImplementationExecutionBatch|resolveImplementationExecutionBatch/,
    /recordImplementationBatchTaskEvidence|applyImplementationBatchTaskEvidence|mergeImplementationBatchTaskEvidence/,
    /parallel-sequential|sequential batch/i,
  ];
  if (batchExecutionPatterns.some((pattern) => !pattern.test(loopSection[0]))
    || helperBatchPatterns.some((pattern) => !pattern.test(helperSource))) {
    expectedFail('sequential batch execution is still missing listed-order orchestration or per-task batch evidence handling.');
  }

  const recoveryPatterns = [
    /recovery stop|Recovery limit/i,
    /fixTaskIds|lineage/,
    /batch/i,
  ];
  if (recoveryPatterns.some((pattern) => !pattern.test(helperSource))) {
    expectedFail('batch verification still lacks explicit recovery-stop coverage for aborting a contiguous [P] group before any downstream barrier task can run.');
  }
}

async function verifyCompletionFinalizer() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('execution loop helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  const finalSection = indexSource.match(/if \(next\.kind === "complete"\) \{[\s\S]*?"ALL_TASKS_COMPLETE",[\s\S]*?return;/);
  if (!finalSection) {
    expectedFail('could not locate implementation completion finalization path.');
  }

  const successBehaviorPatterns = [
    ['epic completion update', /completeEpicChildAfterImplementation\(/],
    ['index finalization', /runRalphIndex\(/],
    ['temporary progress cleanup', /\.progress-task-/],
    ['state-file deletion', /unlinkIfExists\(getRalphStatePath\(spec, options\)\)|unlinkSync\(getRalphStatePath\(spec, options\)\)/],
    ['optional PR URL lookup', /gh pr view|prUrl|PR URL/],
  ];
  const missingSuccessBehavior = successBehaviorPatterns
    .filter(([, pattern]) => !pattern.test(finalSection[0] + helperSource))
    .map(([label]) => label);
  if (missingSuccessBehavior.length > 0) {
    expectedFail(`completion finalizer is still missing successful terminal behavior (${missingSuccessBehavior.join(', ')}).`);
  }

  if (/phase:\s*["']completed["']/.test(finalSection[0])
    && !/unlinkIfExists\(getRalphStatePath\(spec, options\)\)|unlinkSync\(getRalphStatePath\(spec, options\)\)/.test(finalSection[0])) {
    expectedFail('successful completion still leaves .ralph-state.json in place instead of deleting execution state after finalization succeeds.');
  }

  const indexFailurePatterns = [
    /runRalphIndex\(/,
    /if\s*\([^\n]*index[^\n]*!={0,2}\s*true|if\s*\(![^\n]*index|index finalization failed|Failed to finalize.*index/i,
    /validationError|evidence[\s\S]{0,120}final|indexFinalized/i,
  ];
  if (indexFailurePatterns.some((pattern) => !pattern.test(finalSection[0] + helperSource))) {
    expectedFail('completion finalizer does not yet prove a failing-index path suppresses ALL_TASKS_COMPLETE and preserves resume-safe error evidence.');
  }
}

async function verifyEdgeCases() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('execution loop helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  const runtimeBehaviorPatterns = [
    ['resume-after-[x]-without-evidence repair', /restoreUnverifiedActiveTaskIfNeeded\([\s\S]*?prior run stopped before coordinator recorded completion signal plus verification evidence\./],
    ['[P] batch mutation loop restart', /modificationResult\.state \?\? state;[\s\S]*?continue implementationLoop;/],
    ['stale progress 60 minute age gate', /IMPLEMENTATION_STALE_PROGRESS_MAX_AGE_MS\s*=\s*60 \* 60 \* 1000[\s\S]*?ageMs = Date\.now\(\) - statSync\(entryPath\)\.mtimeMs;[\s\S]*?if \(ageMs < maxAgeMs\) continue;/],
    ['empty PR URL stays non-fatal', /spawnSync\("gh", \["pr", "view", "--json", "url", "-q", "\.url"\][\s\S]*?if \(result\.status !== 0\) return null;[\s\S]*?return prUrl\.length > 0 \? prUrl : null;/],
  ];
  const missingRuntimeBehavior = runtimeBehaviorPatterns
    .filter(([, pattern]) => !pattern.test(indexSource + helperSource))
    .map(([label]) => label);
  if (missingRuntimeBehavior.length > 0) {
    throw new Error(`edge-case runtime behavior is missing: ${missingRuntimeBehavior.join(', ')}`);
  }

  const isolatedCoveragePatterns = [
    /export function createImplementationResumeRepairStatePatch\(/,
    /export function shouldRestartImplementationLoopAfterBatchModification\(/,
    /export function shouldDeleteStaleImplementationProgressFile\(/,
    /export function normalizeImplementationPrUrl\(/,
  ];
  if (isolatedCoveragePatterns.some((pattern) => !pattern.test(helperSource))) {
    expectedFail('edge-case fixture coverage is incomplete: resume repair, [P] mutation break/re-entry, stale .progress-task age gating, and empty PR URL success are not yet isolated behind dedicated verifier-target helpers.');
  }
}

async function verifyAcceptanceChecklist() {
  for (const caseName of acceptanceChecklistCases) {
    const verifyCase = cases.get(caseName);
    if (!verifyCase) {
      throw new Error(`acceptance checklist references unknown verifier case: ${caseName}`);
    }
    await verifyCase();
  }
}

async function verifyCleanup() {
  await verifyCompletionFinalizer();
}

async function verifyContractWiring() {
  const schemaPath = join(root, 'schemas', 'spec.schema.json');
  const packagePath = join(root, 'package.json');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  const startRequirementsPath = join(root, 'specs', 'start-and-new-flow-parity', 'requirements.md');
  const indexingResearchPath = join(root, 'specs', 'indexing-command-parity', 'research.md');
  const packagedResearchPath = join(root, 'specs', 'packaged-resource-parity', 'research.md');
  const refactorResearchPath = join(root, 'specs', 'spec-refactor-command-parity', 'research.md');
  const manifestPath = join(root, 'references', 'ralph-resource-manifest.v1.json');

  const schema = readJson(schemaPath);
  const packageJson = readJson(packagePath);
  const indexSource = readFileSync(indexPath, 'utf8');
  const helperSource = existsSync(helperPath) ? readFileSync(helperPath, 'utf8') : '';
  const startRequirements = readFileSync(startRequirementsPath, 'utf8');
  const indexingResearch = readFileSync(indexingResearchPath, 'utf8');
  const packagedResearch = readFileSync(packagedResearchPath, 'utf8');
  const refactorResearch = readFileSync(refactorResearchPath, 'utf8');

  const stateSchema = schema?.definitions?.state;
  if (!stateSchema || typeof stateSchema !== 'object') {
    throw new Error('schemas/spec.schema.json is missing definitions.state.');
  }

  const stateProperties = stateSchema.properties ?? {};
  const requiredStateFields = [
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
  const missingSchemaFields = requiredStateFields.filter((field) => !(field in stateProperties));
  if (missingSchemaFields.length > 0) {
    expectedFail(`schemas/spec.schema.json is missing ImplementationLoopStateV1 fields: ${missingSchemaFields.join(', ')}`);
  }

  const phaseEnum = stateProperties.phase?.enum;
  if (!Array.isArray(phaseEnum) || !phaseEnum.includes('execution')) {
    expectedFail('schemas/spec.schema.json must keep state.phase compatible with in-flight execution state.');
  }
  if (phaseEnum.includes('completed')) {
    throw new Error('schemas/spec.schema.json must not allow completed as an in-flight execution phase value.');
  }

  if (!/StartCompatibilityContractV1/.test(indexSource)
    || !/startCompatibility/.test(indexSource)
    || !/command, aliasOf\?, options, branchDecision, specRoot, statePatch/.test(startRequirements)) {
    expectedFail('StartCompatibilityContractV1 compatibility is not yet provable for implementation-loop bootstrap metadata.');
  }

  if (!/IndexArtifactContractV1/.test(indexingResearch)
    || !/runRalphIndex\(/.test(indexSource + helperSource)) {
    expectedFail('IndexArtifactContractV1 compatibility is not yet provable for implementation-loop finalization and index wiring.');
  }

  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : null;
  const hasFailureRecoveryManifestEntry = Array.isArray(manifest)
    && manifest.some((entry) => entry?.piPath === 'references/failure-recovery.md');
  const packagedManifestSignals = [
    Array.isArray(manifest),
    /RalphResourceManifestV1/.test(packagedResearch),
    /mayNeedUpdate|needs packaged|consumes manifest\/resource contracts/i.test(packagedResearch),
    hasFailureRecoveryManifestEntry,
  ];
  if (packagedManifestSignals.some((signal) => !signal)) {
    expectedFail('RalphResourceManifestV1 compatibility or update-needed detection is not yet provable for packaged implementation-loop references.');
  }

  const refactorDelegationPatterns = [
    /ralph-refactor-specialist/,
    /if \(/,
    /refactor/i,
  ];
  if (!/spec-refactor-command-parity/.test(refactorResearch)
    || refactorDelegationPatterns.some((pattern) => !pattern.test(indexSource))) {
    expectedFail('Shared refactor-loop delegation expectations are not yet provable for implementation execution.');
  }

  const scripts = packageJson.scripts ?? {};
  const prepack = String(scripts.prepack ?? '');
  const verifyIndex = String(scripts['verify:index'] ?? '');
  const verifyPack = String(scripts['verify:pack'] ?? '');
  const verifierScript = 'node scripts/verify-implementation-loop-parity.mjs';
  if (!prepack.includes(verifierScript)
    || !verifyIndex.includes(`${verifierScript} --case acceptance-checklist`)
    || !verifyPack.includes(`${verifierScript} --case cleanup`)) {
    expectedFail('package verification scripts do not yet wire implementation-loop parity through prepack, verify:index, and verify:pack with acceptance-checklist/cleanup cases.');
  }

  if (!cases.has('acceptance-checklist') || !cases.has('cleanup')) {
    throw new Error('implementation-loop verifier must expose acceptance-checklist and cleanup cases once package wiring is added.');
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
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
