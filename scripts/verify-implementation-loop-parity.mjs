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
  ['verification-recovery-policy', verifyVerificationRecoveryPolicy],
  ['verify-auto-recovery', verifyVerifyAutoRecovery],
  ['shared-surface-preflight', verifySharedSurfacePreflight],
  ['verification-envelope', verifyVerificationEnvelope],
  ['state-cleanup', verifyStateCleanup],
  ['contract-surface', verifyContractSurface],
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

  const bootstrapSection = matchSource(indexSource, /state\s*=\s*mergeRalphState\([\s\S]*?awaitingApproval:\s*false,[\s\S]*?validationError:\s*null,[\s\S]*?\}\s*,\s*options\s*\);/);
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

  const resumeSection = matchSource(indexSource, /function implementationAttemptPatch\([\s\S]*?return\s*\{[\s\S]*?currentTask:\s*\{[\s\S]*?\};\n\}/);
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

  const startupSection = matchSource(indexSource, /taskData = readImplementationTasks\(spec\);[\s\S]*?state = ensureNativeTaskCardsForImplementation\(pi, ctx, spec, options, state, taskData\.tasks\);/);
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

  const staleMapRepairSection = matchSource(indexSource, /function ensureNativeTaskCardsForImplementation\([\s\S]*?return state \?\? \{\};\n\}/);
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

  const failureSection = matchSource(indexSource, /if \(!validation\.ok\) \{[\s\S]*?continue;\n\s*\}/);
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

  const failureSection = matchSource(indexSource, /if \(!validation\.ok\) \{[\s\S]*?continue;\n\s*\}/);
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

  const parseSection = matchSource(indexSource, /function parseTaskModificationRequest\([\s\S]*?return \{[\s\S]*?proposedTasks,\n\t\};\n\}/);
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
  if (!/normalizeImplementationTaskModificationProposals\(/.test(parseSection[0])) {
    expectedFail('TASK_MODIFICATION_REQUEST parser does not yet normalize structured task objects into canonical task blocks.');
  }

  const handlerSection = matchSource(indexSource, /function handleTaskModificationRequest\([\s\S]*?\n\}/);
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
    handlerSource.indexOf('normalizeImplementationTaskModificationProposals('),
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
    /export function normalizeImplementationTaskModificationProposals/,
    /export function createImplementationCanonicalTaskBlock/,
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

  const canonicalRenderingPatterns = [
    /- \[ \] \$\{input\.taskNumber\}/,
    /\*\*Do\*\*/,
    /\*\*Files\*\*/,
    /\*\*Done when\*\*/,
    /\*\*Verify\*\*/,
    /\*\*Commit\*\*/,
  ];
  if (!canonicalRenderingPatterns.every((pattern) => pattern.test(helperSource))) {
    expectedFail('structured task proposals are not yet rendered through a stable canonical markdown task-block helper.');
  }

  const structuredRepairPatterns = [
    /title\s*\?\?\s*value\.subject\s*\?\?\s*value\.name/i,
    /doneWhen|acceptance criteria|exit criteria/i,
    /files\s*\|\|\s*paths|files changed/i,
    /Recovered task for/,
    /MANUAL_VERIFY_REQUIRED/,
    /createImplementationGeneratedTaskMutationId\(/,
  ];
  const missingStructuredRepairPatterns = structuredRepairPatterns.filter((pattern) => !pattern.test(helperSource));
  if (missingStructuredRepairPatterns.length > 0) {
    expectedFail('task modification helpers do not yet prove structured-object normalization plus bounded default-field repair for malformed task proposals.');
  }

  const helperDelegationPatterns = [
    /validateImplementationTaskMutation\(/,
    /applyImplementationTaskModification\(/,
    /createImplementationTaskMutationRemapPatch\(/,
  ];
  const missingHelperDelegation = helperDelegationPatterns.filter((pattern) => !pattern.test(handlerSource));
  if (missingHelperDelegation.length > 0) {
    expectedFail('task modification handler does not yet delegate repaired proposal validation and remap-before-block behavior through implementation-loop helper exports.');
  }

  const repairBeforeBlockPatterns = [
    /normalizeImplementationTaskModificationProposals\([\s\S]*fallbackFiles:[\s\S]*fallbackVerify:/,
    /validateImplementationTaskMutation\([\s\S]*proposedTasks:[\s\S]*requiredFields:[\s\S]*existingTaskIds:/,
  ];
  if (!repairBeforeBlockPatterns.every((pattern) => pattern.test(handlerSource))) {
    expectedFail('task modification handler does not yet prove recoverable missing fields and generated child ids are repaired before mutation-time blockers run.');
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

  const validationSection = matchSource(indexSource, /function validateSubagentCompletion\([\s\S]*?\n}\n\nfunction runGitCommand/);
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

  const loopSection = matchSource(indexSource, /implementationLoop: while \(true\) \{[\s\S]*?completedSummaries\.push\(`- Completed task/);
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

  const evidenceSection = matchSource(indexSource, /setTaskCheckboxStatus\(spec, task\.index, true\);[\s\S]*?completedSummaries\.push\(`- Completed task/);
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

  const finalSection = matchSource(indexSource, /if \(next\.kind === "complete"\) \{[\s\S]*?"ALL_TASKS_COMPLETE",/);
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

  const dependencySection = matchSource(indexSource, /function assignNativeTaskDependencies\([\s\S]*?\n}\n\nfunction activeToolDependencyError/);
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

  const nextTaskSection = matchSource(indexSource, /function nextImplementationTask\([\s\S]*?\n}\n\nfunction stateRecordField/);
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

  const loopSection = matchSource(indexSource, /while \(true\) \{[\s\S]*?const next = nextImplementationTask\(tasks, numberField\(state, ["']taskIndex["']\)\);[\s\S]*?validation = validateSubagentCompletion\(completion, definition, task, workspaceReport\);/);
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

  const finalSection = matchSource(indexSource, /if \(next\.kind === "complete"\) \{[\s\S]*?"ALL_TASKS_COMPLETE",[\s\S]*?return;/);
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

  if (!acceptanceChecklistCases.includes('edge-cases')) {
    throw new Error('acceptance-checklist no longer includes the edge-cases verifier coverage.');
  }

  const helperBehaviorChecks = [
    [
      'resume repair preserves execution re-entry',
      helperSource.includes('export function createImplementationResumeRepairStatePatch(')
        && helperSource.includes('phase: "execution"')
        && helperSource.includes('taskIndex: input.taskIndex')
        && helperSource.includes('totalTasks: input.totalTasks')
        && helperSource.includes('awaitingApproval: false')
        && helperSource.includes('blocked: false')
        && helperSource.includes('validationError: null')
        && helperSource.includes('activeTaskPendingEvidence: null')
        && helperSource.includes('...createImplementationStateDefaults(input.state)'),
    ],
    [
      'batch-modification restart logic',
      helperSource.includes('export function shouldRestartImplementationLoopAfterBatchModification(')
        && helperSource.includes('if (nextState && nextState !== state) return true;')
        && helperSource.includes('return nextState === null;'),
    ],
    [
      'stale progress 60 minute helper',
      helperSource.includes('export function shouldDeleteStaleImplementationProgressFile(')
        && helperSource.includes('maxAgeMs = 60 * 60 * 1000')
        && helperSource.includes('return /^\\.progress-task-.*\\.md$/i.test(entryName) && ageMs >= maxAgeMs;'),
    ],
    [
      'PR URL normalization helper',
      helperSource.includes('export function normalizeImplementationPrUrl(prUrl: string): string | null {')
        && helperSource.includes('const normalized = prUrl.trim();')
        && helperSource.includes('return normalized.length > 0 ? normalized : null;'),
    ],
  ];
  const missingHelperBehaviors = helperBehaviorChecks
    .filter(([, ok]) => !ok)
    .map(([label]) => label);
  if (missingHelperBehaviors.length > 0) {
    throw new Error(`edge-case helper behavior is missing: ${missingHelperBehaviors.join(', ')}`);
  }
}

async function verifyVerificationRecoveryPolicy() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('verification recovery classifier helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  const classifierExports = [
    /export type VerificationFailureCategory\s*=\s*[\s\S]*?transient_tool_failure[\s\S]*?fatal_runtime_failure/,
    /export type VerificationRecoveryAction\s*=\s*[\s\S]*?retry_verifier[\s\S]*?block/,
    /export function (?:classifyImplementationVerificationFailure|classifyVerificationFailure)\(/,
    /export function (?:createImplementationVerificationRecoveryPolicy|createVerificationRecoveryPolicy)\(/,
  ];
  if (classifierExports.some((pattern) => !pattern.test(helperSource))) {
    expectedFail('implementation-loop.ts does not yet export stable verification failure category/action types plus classification and recovery-policy helpers.');
  }

  const policyContracts = [
    {
      label: 'transient tool failure',
      category: 'transient_tool_failure',
      reasonCode: 'VERIFY_TRANSIENT_TOOL_FAILURE',
      recoverable: true,
      recoveryAction: 'retry_verifier',
    },
    {
      label: 'cleanup artifact failure',
      category: 'cleanup_artifact_failure',
      reasonCode: 'VERIFY_CLEANUP_ARTIFACT_FAILURE',
      recoverable: true,
      recoveryAction: 'cleanup_artifacts',
    },
    {
      label: 'shared-contract drift',
      category: 'shared_contract_drift',
      reasonCode: 'VERIFY_SHARED_CONTRACT_DRIFT',
      recoverable: true,
      recoveryAction: 'repair_shared_contract',
    },
    {
      label: 'stale-state failure',
      category: 'stale_state_failure',
      reasonCode: 'VERIFY_STALE_STATE_FAILURE',
      recoverable: true,
      recoveryAction: 'repair_state',
    },
    {
      label: 'publish-bundle failure',
      category: 'publish_bundle_failure',
      reasonCode: 'VERIFY_PUBLISH_BUNDLE_FAILURE',
      recoverable: true,
      recoveryAction: 'repair_publish_bundle',
    },
    {
      label: 'real product failure',
      category: 'real_product_failure',
      reasonCode: 'VERIFY_REAL_PRODUCT_FAILURE',
      recoverable: false,
      recoveryAction: 'delegate_fix_task',
    },
    {
      label: 'fatal runtime failure',
      category: 'fatal_runtime_failure',
      reasonCode: 'VERIFY_FATAL_RUNTIME_FAILURE',
      recoverable: false,
      recoveryAction: 'block',
    },
  ];

  const missingPolicyContracts = policyContracts.filter((contract) => {
    const pattern = new RegExp(
      `${escapeRegExp(contract.category)}[\\s\\S]{0,500}${escapeRegExp(contract.reasonCode)}[\\s\\S]{0,200}recoverable\\s*:\\s*${contract.recoverable}[\\s\\S]{0,200}${escapeRegExp(contract.recoveryAction)}`,
    );
    return !pattern.test(helperSource);
  });
  if (missingPolicyContracts.length > 0) {
    expectedFail(`verification recovery policy is missing stable reasonCode/recoverable/recoveryAction contracts for: ${missingPolicyContracts.map((contract) => contract.label).join(', ')}.`);
  }

  const indexRoutingPatterns = [
    /from\s+["']\.\/implementation-loop(?:\.ts)?["'][\s\S]*?(classifyImplementationVerificationFailure|classifyVerificationFailure|createImplementationVerificationRecoveryPolicy|createVerificationRecoveryPolicy)/,
    /if\s*\(!validation\.ok\)\s*\{[\s\S]{0,2000}(classifyImplementationVerificationFailure|classifyVerificationFailure|createImplementationVerificationRecoveryPolicy|createVerificationRecoveryPolicy)[\s\S]{0,800}(reasonCode|recoverable|recoveryAction)/,
  ];
  if (indexRoutingPatterns.some((pattern) => !pattern.test(indexSource))) {
    expectedFail('runImplementCommand does not yet route verification failures through the implementation-loop recovery-policy helper before blocking.');
  }
}

async function verifyVerifyAutoRecovery() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('verify auto-recovery helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');

  const recoveryExports = [
    /export interface VerificationRecoveryAttempt\s*\{/,
    /export interface (?:ImplementationLoopStateV1Plus|ImplementationVerificationRecoveryState)\s*\{[\s\S]*?maxVerificationRecoveryAttempts[\s\S]*?verificationRecovery/s,
    /export function (?:getImplementationVerificationRecoveryBudget|getVerificationRecoveryBudget)\(/,
    /export function (?:createImplementationVerificationRecoveryAttempt|createVerificationRecoveryAttempt)\(/,
    /export function (?:rerunImplementationVerifierExactly|rerunExactImplementationVerifier|rerunVerificationCommandExactly)\(/,
    /export function (?:planImplementationVerificationRecovery|createImplementationVerificationRecoveryPlan|recoverImplementationVerificationFailure)\(/,
  ];
  if (recoveryExports.some((pattern) => !pattern.test(helperSource))) {
    expectedFail('implementation-loop.ts does not yet export bounded verify auto-recovery helpers for retry budget, attempt history, exact verifier rerun, and in-loop recovery planning.');
  }

  const scenarioContracts = [
    {
      label: 'cleanup artifact failure',
      category: 'cleanup_artifact_failure',
      action: 'cleanup_artifacts',
      signal: 'VERIFICATION_PASS',
    },
    {
      label: 'transient verifier failure',
      category: 'transient_tool_failure',
      action: 'retry_verifier',
      signal: 'VERIFICATION_PASS',
    },
    {
      label: 'shared-contract drift repaired in-place',
      category: 'shared_contract_drift',
      action: 'repair_shared_contract',
      signal: 'VERIFICATION_PASS',
    },
  ];
  const missingScenarioContracts = scenarioContracts.filter((contract) => {
    const pattern = new RegExp(
      `${escapeRegExp(contract.category)}[\\s\\S]{0,400}${escapeRegExp(contract.action)}[\\s\\S]{0,800}${escapeRegExp(contract.signal)}[\\s\\S]{0,800}(rerun|retry|exact verifier|failing verifier)`,
      'i',
    );
    return !pattern.test(helperSource + indexSource);
  });
  if (missingScenarioContracts.length > 0) {
    expectedFail(`verify auto-recovery does not yet cover cleanup artifact failure, transient verifier failure, and shared-contract drift repaired in-place inside the same /ralph-implement session (${missingScenarioContracts.map((contract) => contract.label).join(', ')}).`);
  }

  const failureSection = matchSource(indexSource, /if \(!validation\.ok\) \{[\s\S]*?continue implementationLoop;[\s\S]*?\n\s*\}/);
  if (!failureSection) {
    expectedFail('could not locate implementation failure handling branch for verify auto-recovery.');
  }

  if (/definition\.completionSignal === "VERIFICATION_PASS"[\s\S]{0,400}blockImplementation\(/.test(failureSection[0])) {
    expectedFail('runImplementCommand still blocks VERIFICATION_PASS failures before any bounded in-loop recovery attempt can rerun the exact failing verifier.');
  }

  const indexRecoveryPatterns = [
    /definition\.completionSignal === "VERIFICATION_PASS"[\s\S]{0,2000}(planImplementationVerificationRecovery|createImplementationVerificationRecoveryPlan|recoverImplementationVerificationFailure)/,
    /(planImplementationVerificationRecovery|createImplementationVerificationRecoveryPlan|recoverImplementationVerificationFailure)[\s\S]{0,1600}(rerunImplementationVerifierExactly|rerunExactImplementationVerifier|rerunVerificationCommandExactly)/,
    /verificationRecovery[\s\S]{0,800}attempts[\s\S]{0,800}history/s,
    /maxVerificationRecoveryAttempts/,
    /continue implementationLoop;[\s\S]{0,400}(verificationRecovery|VERIFICATION_PASS)/s,
  ];
  if (indexRecoveryPatterns.some((pattern) => !pattern.test(indexSource + helperSource))) {
    expectedFail('runImplementCommand does not yet capture verification evidence, persist bounded verificationRecovery attempts/history, rerun the exact verifier, and continue the same session on success.');
  }
}

async function verifySharedSurfacePreflight() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('shared-surface preflight helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');
  const combinedSource = `${helperSource}\n${indexSource}`;

  const preflightExports = [
    /export (?:const|function) (?:SHARED_SURFACE_PREFLIGHT_COMMANDS|sharedSurfacePreflightCommands|implementationSharedSurfacePreflightCommands)\b/,
    /export function (?:createImplementationSharedSurfacePreflightPlan|planImplementationSharedSurfacePreflight|createSharedSurfacePreflightPlan)\(/,
    /export function (?:runImplementationSharedSurfacePreflight|runSharedSurfacePreflightCommands|executeImplementationSharedSurfacePreflight)\(/,
  ];
  if (preflightExports.some((pattern) => !pattern.test(helperSource))) {
    expectedFail('implementation-loop.ts does not yet export shared-surface preflight mapping, plan creation, and command execution helpers.');
  }

  const expectedMapping = new Map([
    [
      'extensions/ralph-specum/index.ts',
      [
        'node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist',
        'node scripts/verify-task-blockers-parity.mjs --case acceptance-checklist',
      ],
    ],
    [
      'extensions/ralph-specum/implementation-loop.ts',
      ['node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist'],
    ],
    [
      'extensions/ralph-specum/task-completion.ts',
      ['node scripts/verify-task-blockers-parity.mjs --case acceptance-checklist'],
    ],
    ['package.json', ['npm run verify:index', 'npm run verify:pack']],
    [
      'references/ralph-resource-manifest.v1.json',
      ['node scripts/verify-publish-bundle.mjs', 'npm run verify:pack'],
    ],
    [
      'schemas/spec.schema.json',
      ['node scripts/verify-publish-bundle.mjs', 'npm run verify:index', 'npm run verify:pack'],
    ],
  ]);

  const missingMappings = [];
  for (const [surface, commands] of expectedMapping) {
    if (!helperSource.includes(surface)) {
      missingMappings.push(`${surface} -> <surface missing>`);
      continue;
    }

    for (const command of commands) {
      const mappedCommandPattern = new RegExp(
        `${escapeRegExp(surface)}[\\s\\S]{0,900}${escapeRegExp(command)}`,
      );
      if (!mappedCommandPattern.test(helperSource)) {
        missingMappings.push(`${surface} -> ${command}`);
      }
    }
  }
  if (missingMappings.length > 0) {
    expectedFail(`shared-surface preflight mapping is missing required AC-3.1 entries: ${missingMappings.join('; ')}.`);
  }

  const planningBehaviorPatterns = [
    /touchedFiles|changedFiles|changed-file|changed file/i,
    /dedupe|deduplicat|Set<|new Set\(/,
    /commands\s*:/,
    /before.*package.*verify|preflight.*package.*verify|package.*verify.*preflight/i,
  ];
  if (planningBehaviorPatterns.some((pattern) => !pattern.test(helperSource))) {
    expectedFail('shared-surface preflight planner does not yet derive a deduplicated command bundle from touched files before package verification.');
  }

  const packageVerifyMarkers = [
    'npm run verify:index',
    'npm run verify:pack',
    'node scripts/verify-publish-bundle.mjs',
  ];
  const missingRunProof = [];
  for (const command of new Set([...expectedMapping.values()].flat())) {
    const commandRunPattern = new RegExp(
      `(runImplementationSharedSurfacePreflight|runSharedSurfacePreflightCommands|executeImplementationSharedSurfacePreflight)[\\s\\S]{0,2000}${escapeRegExp(command)}`,
    );
    if (!commandRunPattern.test(combinedSource)) {
      missingRunProof.push(command);
    }
  }
  if (missingRunProof.length > 0) {
    expectedFail(`shared-surface preflight does not yet prove every mapped command runs at least once before package verification tasks: ${missingRunProof.join('; ')}.`);
  }

  const preflightCallIndex = indexOfFirstMatch(combinedSource, [
    /runImplementationSharedSurfacePreflight\(/,
    /runSharedSurfacePreflightCommands\(/,
    /executeImplementationSharedSurfacePreflight\(/,
  ]);
  if (preflightCallIndex < 0) {
    expectedFail('runImplementCommand does not yet invoke shared-surface preflight before package VERIFY tasks.');
  }

  const firstPackageVerifyIndex = packageVerifyMarkers
    .map((marker) => combinedSource.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  if (firstPackageVerifyIndex < 0) {
    expectedFail('shared-surface preflight verifier could not locate package verification commands for ordering proof.');
  }
  if (preflightCallIndex > firstPackageVerifyIndex) {
    throw new Error('shared-surface preflight invocation appears after package verification commands.');
  }
}

async function verifyVerificationEnvelope() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('verification envelope helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const completionPath = join(root, 'extensions', 'ralph-specum', 'task-completion.ts');
  const completionSource = existsSync(completionPath) ? readFileSync(completionPath, 'utf8') : '';
  const combinedSource = `${helperSource}\n${completionSource}`;

  const envelopeShapePatterns = [
    /export (?:interface|type) (?:VerificationResultEnvelope|ImplementationVerificationResultEnvelope)\b[\s\S]*?status[\s\S]*?reasonCode[\s\S]*?category[\s\S]*?failingCommand[\s\S]*?recoverable[\s\S]*?suggestedRecovery[\s\S]*?evidence/s,
    /status\s*:\s*[\s\S]{0,300}(?:VERIFICATION_PASS|VERIFICATION_FAIL|TASK_COMPLETE|TASK_FAILED)/,
    /reasonCode\??\s*:/,
    /category\??\s*:/,
    /failingCommand\??\s*:/,
    /recoverable\s*:\s*boolean/,
    /suggestedRecovery\??\s*:/,
    /evidence\s*:\s*(?:string\[\]|Array<string>)/,
  ];
  if (envelopeShapePatterns.some((pattern) => !pattern.test(combinedSource))) {
    expectedFail('structured verification result envelope does not yet expose status, reasonCode, category, failingCommand, recoverable, suggestedRecovery, and evidence fields.');
  }

  const normalizerExports = [
    /export function (?:normalizeImplementationVerificationResultEnvelope|normalizeVerificationResultEnvelope|createImplementationVerificationResultEnvelope)\(/,
    /export function (?:normalizeImplementationQaResultEnvelope|normalizeQaVerificationResultEnvelope|normalizeVerificationAgentOutputEnvelope)\(/,
    /export function (?:normalizeImplementationPackageResultEnvelope|normalizePackageVerificationResultEnvelope|normalizePackageScriptOutputEnvelope)\(/,
    /export function (?:normalizeNestedParityVerificationResultEnvelope|normalizeImplementationParityResultEnvelope|normalizeNestedVerifierResultEnvelope)\(/,
  ];
  if (normalizerExports.some((pattern) => !pattern.test(combinedSource))) {
    expectedFail('implementation-loop/task-completion helpers do not yet export normalizers for verification-agent, QA-agent, package-script, and nested parity-script outputs.');
  }

  const fixtureContracts = [
    {
      label: 'verification agent pass output',
      source: 'VERIFICATION_PASS\nverify: node scripts/verify-implementation-loop-parity.mjs --case shared-surface-preflight\nEvidence: PASS shared-surface-preflight',
      status: 'VERIFICATION_PASS',
      reasonCode: 'VERIFY_OK',
      recoverable: false,
      evidence: 'PASS shared-surface-preflight',
    },
    {
      label: 'verification agent fail output',
      source: 'VERIFICATION_FAIL\nreasonCode: VERIFY_SHARED_CONTRACT_DRIFT\nfailingCommand: node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist\nEvidence: acceptance checklist failed',
      status: 'VERIFICATION_FAIL',
      reasonCode: 'VERIFY_SHARED_CONTRACT_DRIFT',
      category: 'shared_contract_drift',
      failingCommand: 'node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist',
      recoverable: true,
      suggestedRecovery: 'repair_shared_contract',
      evidence: 'acceptance checklist failed',
    },
    {
      label: 'package script fail output',
      source: 'npm run verify:pack\nEXPECTED_FAIL verify-publish-bundle: cleanup artifact remained in package staging root',
      status: 'VERIFICATION_FAIL',
      reasonCode: 'VERIFY_CLEANUP_ARTIFACT_FAILURE',
      category: 'cleanup_artifact_failure',
      failingCommand: 'npm run verify:pack',
      recoverable: true,
      suggestedRecovery: 'cleanup_artifacts',
      evidence: 'cleanup artifact remained',
    },
    {
      label: 'nested parity script fail output',
      source: 'FAIL verification-recovery-policy: VERIFY_FATAL_RUNTIME_FAILURE in nested parity verifier',
      status: 'VERIFICATION_FAIL',
      reasonCode: 'VERIFY_FATAL_RUNTIME_FAILURE',
      category: 'fatal_runtime_failure',
      failingCommand: 'node scripts/verify-implementation-loop-parity.mjs --case verification-recovery-policy',
      recoverable: false,
      suggestedRecovery: 'block',
      evidence: 'nested parity verifier',
    },
  ];

  const missingFixtureContracts = [];
  for (const contract of fixtureContracts) {
    const requiredValues = [
      contract.status,
      contract.reasonCode,
      contract.category,
      contract.failingCommand,
      String(contract.recoverable),
      contract.suggestedRecovery,
      contract.evidence,
    ].filter(Boolean);
    const missingValues = requiredValues.filter((value) => !combinedSource.includes(value));
    if (missingValues.length > 0) {
      missingFixtureContracts.push(`${contract.label}: ${missingValues.join(', ')}`);
    }
  }
  if (missingFixtureContracts.length > 0) {
    expectedFail(`verification envelope normalizers do not yet cover pass/fail outputs from verification agents, package scripts, and nested parity scripts with required normalized fields: ${missingFixtureContracts.join('; ')}.`);
  }

  const decisionBridgePatterns = [
    /(VerificationResultEnvelope|ImplementationVerificationResultEnvelope)[\s\S]{0,800}(recoverable|reasonCode|suggestedRecovery)/,
    /(recoverable|reasonCode|suggestedRecovery)[\s\S]{0,800}(block|recovery|decision)/i,
    /(rawSummary|rawOutput|output)[\s\S]{0,800}(envelope|structured)/i,
  ];
  if (decisionBridgePatterns.some((pattern) => !pattern.test(combinedSource))) {
    expectedFail('coordinator decision bridge is not yet provably consuming structured envelope fields instead of prose-only output parsing.');
  }
}

async function verifyStateCleanup() {
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  if (!existsSync(helperPath)) {
    expectedFail('state cleanup helper extensions/ralph-specum/implementation-loop.ts is not implemented yet.');
  }

  const helperSource = readFileSync(helperPath, 'utf8');
  const indexPath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const indexSource = readFileSync(indexPath, 'utf8');
  const combinedSource = `${helperSource}\n${indexSource}`;

  const cleanupExports = [
    /export function (?:clearRecoveredImplementationState|clearStaleImplementationFailureMetadata|createRecoveredImplementationStatePatch)\(/,
    /export function (?:finalizeCompletedImplementationState|createImplementationCompletionFinalizer|completeImplementationStateCleanup)\(/,
    /export function (?:rewriteImplementationProgressTruthfully|syncImplementationProgressAfterCompletion|writeImplementationCompletionProgress)\(/,
    /export function (?:deleteImplementationStateFile|removeCompletedImplementationStateFile|deleteRalphStateAfterCompletion)\(/,
  ];
  if (cleanupExports.some((pattern) => !pattern.test(helperSource))) {
    expectedFail('implementation-loop.ts does not yet export recovered-state cleanup, completion finalizer, truthful progress sync, and .ralph-state.json deletion helpers.');
  }

  const staleFailureFields = ['blocked', 'blockedAt', 'validationError', 'lastSubagentOutput'];
  const staleInflightFields = ['currentTask', 'activeTaskPendingEvidence', 'recoveryMode'];
  const recoveredCleanupContracts = [
    /blocked\s*:\s*false/,
    /blockedAt\s*:\s*(?:null|undefined)/,
    /validationError\s*:\s*(?:null|undefined)/,
    /lastSubagentOutput\s*:\s*(?:["']{2}|null|undefined)/,
    /currentTask\s*:\s*(?:null|undefined)/,
  ];
  if (recoveredCleanupContracts.some((pattern) => !pattern.test(combinedSource))) {
    expectedFail(`successful recovery does not yet clear stale failure metadata before the next task starts: ${staleFailureFields.join(', ')}, currentTask.`);
  }

  const nextTaskOrderingPattern = /(clearRecoveredImplementationState|clearStaleImplementationFailureMetadata|createRecoveredImplementationStatePatch)[\s\S]{0,1600}(next task|before the next task|taskIndex\s*:\s*|currentTask\s*:\s*\{)/i;
  if (!nextTaskOrderingPattern.test(combinedSource)) {
    expectedFail('state cleanup verifier cannot prove recovered specs clear stale failure metadata before the next task starts.');
  }

  const progressTruthPatterns = [
    /\.progress\.md/,
    /phase\s*:\s*(?:["']completed["']|completed)/i,
    /task\s*:\s*(?:totalTasks|tasks\.length|\$\{[^}]*total[^}]*\}\/\$\{[^}]*total[^}]*\})/,
    /## Current Task[\s\S]{0,160}(?:Completed|Awaiting next task)/,
    /## Next[\s\S]{0,240}(?:Complete|No next task|Awaiting next task)/i,
  ];
  if (progressTruthPatterns.some((pattern) => !pattern.test(combinedSource))) {
    expectedFail('completed specs do not yet rewrite .progress.md header/current/next text to truthful completion state.');
  }

  const completionEvidencePatterns = [
    /(lastCompletedTaskSignal|completionSignal)\s*:\s*(?:["']TASK_COMPLETE["']|["']VERIFICATION_PASS["'])/,
    /(lastCompletedTaskEvidence|verifiedTaskEvidence|completionEvidence)\s*:/,
    /(completedAt|commit|verify|evidence)\s*:/,
  ];
  if (completionEvidencePatterns.some((pattern) => !pattern.test(combinedSource))) {
    expectedFail('completed specs do not yet write durable completion evidence before final cleanup.');
  }

  const stateDeletionPatterns = [
    /\.ralph-state\.json/,
    /(?:unlinkSync|rmSync|unlink|rm)\([^)]*(?:statePath|getStatePath|\.ralph-state\.json)/s,
    /(deleteImplementationStateFile|removeCompletedImplementationStateFile|deleteRalphStateAfterCompletion)\(/,
  ];
  if (stateDeletionPatterns.some((pattern) => !pattern.test(combinedSource))) {
    expectedFail('successful completion does not yet delete <basePath>/.ralph-state.json.');
  }

  const staleRetainedArtifactGuards = [
    /(?:omit|delete|undefined|null)[\s\S]{0,220}(?:blockedAt|validationError|lastSubagentOutput)/,
    /(?:omit|delete|undefined|null)[\s\S]{0,220}(?:currentTask|activeTaskPendingEvidence)/,
    /(?:retained completion artifact|completion artifact|final state|completion evidence)[\s\S]{0,600}(?:blockedAt|currentTask|in-flight|in flight|activeTaskPendingEvidence)/i,
  ];
  if (staleRetainedArtifactGuards.some((pattern) => !pattern.test(combinedSource))) {
    expectedFail(`completed specs do not yet prove retained completion artifacts omit stale blocked or in-flight fields: ${[...staleFailureFields, ...staleInflightFields].join(', ')}.`);
  }
}

function matchSource(source, pattern) {
  return source.match(pattern);
}

async function verifyContractSurface() {
  const implementationVerifierPath = join(root, 'scripts', 'verify-implementation-loop-parity.mjs');
  const taskBlockersVerifierPath = join(root, 'scripts', 'verify-task-blockers-parity.mjs');
  const helperPath = join(root, 'extensions', 'ralph-specum', 'implementation-loop.ts');
  const completionPath = join(root, 'extensions', 'ralph-specum', 'task-completion.ts');

  const implementationVerifierSource = readFileSync(implementationVerifierPath, 'utf8');
  const taskBlockersVerifierSource = readFileSync(taskBlockersVerifierPath, 'utf8');
  const helperSource = existsSync(helperPath) ? readFileSync(helperPath, 'utf8') : '';
  const completionSource = existsSync(completionPath) ? readFileSync(completionPath, 'utf8') : '';

  const stableImplementationBridges = [
    /export function validateImplementationCompletionBridge\(/,
    /export function createImplementationCompletionBridgeInput\(/,
    /export function planImplementationVerificationRecoveryFromEnvelope\(/,
    /export function createImplementationSharedSurfacePreflightPlan\(/,
    /export function createImplementationCompletionFinalizer\(/,
  ];
  const missingImplementationBridges = stableImplementationBridges.filter((pattern) => !pattern.test(helperSource));
  if (missingImplementationBridges.length > 0) {
    expectedFail('implementation-loop.ts does not yet expose the stable verifier bridge surface needed for behavior-first contract checks.');
  }

  const stableTaskCompletionBridges = [
    /export function analyzeTaskWorkspace\(/,
    /export function formatTaskWorkspaceReport\(/,
    /export function normalizeVerificationAgentOutputEnvelope\(/,
    /export function normalizePackageScriptOutputEnvelope\(/,
    /export function normalizeNestedVerifierResultEnvelope\(/,
  ];
  const missingTaskCompletionBridges = stableTaskCompletionBridges.filter((pattern) => !pattern.test(completionSource));
  if (missingTaskCompletionBridges.length > 0) {
    expectedFail('task-completion.ts does not yet expose stable helper exports for verifier contract fixtures.');
  }

  if (!/\['stable-helper-exports',\s*verifyStableHelperExports\]/.test(taskBlockersVerifierSource)) {
    expectedFail('verify-task-blockers-parity.mjs does not yet expose the stable-helper-exports case required by the contract-surface verifier.');
  }

  const sourceShapeCouplings = [
    {
      label: 'implementation-loop verifier scrapes index.ts function bodies',
      pattern: /indexSource\.match\(\/function\s|indexSource\.match\(\/if \(next|indexSource\.match\(\/implementationLoop:/,
      source: implementationVerifierSource,
    },
    {
      label: 'task-blockers verifier scrapes coordinator source shape',
      pattern: /indexSource\.match\(\/function\s|indexSource\.match\(\/const definition|promptSection|validationSection|failureReasonSection|evidenceSection/,
      source: taskBlockersVerifierSource,
    },
  ].filter((check) => check.pattern.test(check.source));

  if (sourceShapeCouplings.length > 0) {
    expectedFail(`parity verifiers still rely on source-shape scraping instead of stable exported bridges: ${sourceShapeCouplings.map((check) => check.label).join('; ')}.`);
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
  const indexingPath = join(root, 'extensions', 'ralph-specum', 'indexing.ts');
  const refactorAgentPath = join(root, 'agents', 'ralph-refactor-specialist.md');
  const manifestPath = join(root, 'references', 'ralph-resource-manifest.v1.json');

  const schema = readJson(schemaPath);
  const packageJson = readJson(packagePath);
  const indexSource = readFileSync(indexPath, 'utf8');
  const helperSource = existsSync(helperPath) ? readFileSync(helperPath, 'utf8') : '';
  const indexingSource = existsSync(indexingPath) ? readFileSync(indexingPath, 'utf8') : '';
  const refactorAgentSource = existsSync(refactorAgentPath) ? readFileSync(refactorAgentPath, 'utf8') : '';

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

  const startCompatibilitySignals = [
    /type\s+StartCompatibilityContractV1\s*=\s*\{[\s\S]*?command:\s*StartCommandName;[\s\S]*?aliasOf\?:\s*["']ralph-start["'];[\s\S]*?options:\s*StartOptionsSnapshot;[\s\S]*?branchDecision:\s*BranchDecision;[\s\S]*?specRoot:\s*\{[\s\S]*?path:\s*string;[\s\S]*?absolutePath:\s*string;[\s\S]*?source:\s*["']default["']\s*\|\s*["']settings["'][\s\S]*?\};[\s\S]*?statePatch:\s*Record<\s*string\s*,\s*unknown\s*>;[\s\S]*?\}/,
    /const\s+specRoot\s*=\s*\{[\s\S]*?path:\s*rootForSpec\.path,[\s\S]*?absolutePath:\s*rootForSpec\.absolutePath,[\s\S]*?source:\s*rootForSpec\.source,[\s\S]*?\}/,
    /startCompatibility:\s*\{[\s\S]*?command:\s*invocation\.command[\s\S]*?options:\s*buildStartOptionsSnapshot\(parsed\)[\s\S]*?branchDecision:\s*branchDecision[\s\S]*?specRoot:\s*specRoot[\s\S]*?statePatch:\s*\{[\s\S]*?phase,[\s\S]*?commitSpec:\s*statePatch\.commitSpec,[\s\S]*?relatedSpecs:\s*statePatch\.relatedSpecs,[\s\S]*?discoveredSkills:\s*statePatch\.discoveredSkills,[\s\S]*?\}[\s\S]*?\}\s*satisfies\s*StartCompatibilityContractV1/,
  ];
  if (startCompatibilitySignals.some((pattern) => !pattern.test(indexSource))) {
    expectedFail('StartCompatibilityContractV1 compatibility is not yet provable for implementation-loop bootstrap metadata.');
  }

  const indexArtifactSignals = [
    /export\s+interface\s+IndexRunResult\s*\{[\s\S]*?ok:\s*boolean;[\s\S]*?dryRun:\s*boolean;[\s\S]*?indexRoot:\s*string;[\s\S]*?statePath:\s*string;[\s\S]*?summaryPath:\s*string;[\s\S]*?writes:\s*PlannedWrite\[\];[\s\S]*?message:\s*string;[\s\S]*?error\?:\s*string;[\s\S]*?\}/,
    /export\s+async\s+function\s+runRalphIndex\s*\(/,
    /import\s*\{\s*formatRalphIndexCommandResult,\s*runRalphIndex\s*\}\s*from\s*["']\.\/indexing\.ts["']/,
    /const\s+indexResult\s*=\s*await\s+runRalphIndex\(\{\s*cwd:\s*ctx\.cwd,\s*args:\s*\[\]\s*\}\)[\s\S]*?const\s+indexSummary\s*=\s*formatRalphIndexCommandResult\(indexResult\)/,
  ];
  if (indexArtifactSignals.some((pattern) => !pattern.test(indexSource + indexingSource + helperSource))) {
    expectedFail('IndexArtifactContractV1 compatibility is not yet provable for implementation-loop finalization and index wiring.');
  }

  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : null;
  const manifestEntries = Array.isArray(manifest) ? manifest : [];
  const findManifestEntry = (piPath) => manifestEntries.find((entry) => entry?.piPath === piPath);
  const schemaManifestEntry = findManifestEntry('schemas/spec.schema.json');
  const executorPromptManifestEntry = findManifestEntry('prompts/executor-prompt.md');
  const tasksTemplateManifestEntry = findManifestEntry('templates/tasks.md');
  const hasFailureRecoveryManifestEntry = manifestEntries.some((entry) => entry?.piPath === 'references/failure-recovery.md');
  const packagedManifestSignals = [
    Array.isArray(manifest),
    hasFailureRecoveryManifestEntry,
    schemaManifestEntry?.status === 'adapted' && /implementation-loop|in-flight execution/i.test(String(schemaManifestEntry?.notes ?? '')),
    executorPromptManifestEntry?.status === 'adapted' && /prompts-root|executor guidance|topology-aware/i.test(String(executorPromptManifestEntry?.notes ?? '')),
    tasksTemplateManifestEntry?.status === 'adapted' && /verification|blocker-safe|Pi task-scoped/i.test(String(tasksTemplateManifestEntry?.notes ?? '')),
  ];
  if (packagedManifestSignals.some((signal) => !signal)) {
    expectedFail('RalphResourceManifestV1 compatibility or update-needed detection is not yet provable for packaged implementation-loop references.');
  }

  const refactorDelegationPatterns = [
    /ralph-refactor-specialist/,
    /if \(/,
    /refactor/i,
  ];
  const refactorCompatibilitySignals = [
    existsSync(refactorAgentPath),
    /Ralph refactor specialist|spec refactoring specialist/i.test(refactorAgentSource),
    ...refactorDelegationPatterns.map((pattern) => pattern.test(indexSource)),
  ];
  if (refactorCompatibilitySignals.some((signal) => !signal)) {
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

function indexOfFirstMatch(source, patterns) {
  return patterns
    .map((pattern) => {
      const match = source.match(pattern);
      return match?.index ?? -1;
    })
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
