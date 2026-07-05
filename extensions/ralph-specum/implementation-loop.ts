import { getRalphStatePath, type RalphState } from "./state.ts";

export type ImplementationNativeTaskLike = {
	checkboxKey: string;
	index: number;
};

export const IMPLEMENTATION_DEFAULT_MAX_FIX_TASKS_PER_ORIGINAL = 3;
export const IMPLEMENTATION_DEFAULT_MAX_FIX_TASK_DEPTH = 3;
export const IMPLEMENTATION_DEFAULT_MAX_MODIFICATIONS_PER_TASK = 3;
export const IMPLEMENTATION_DEFAULT_MAX_MODIFICATION_DEPTH = 2;

export type ImplementationCompletionSignal = "TASK_COMPLETE" | "VERIFICATION_PASS" | "REFACTOR_COMPLETE";

export type ImplementationTaskEvidenceEntry = {
	signal: string;
	proof: string;
	agent: string;
	completedAt: string;
};

export type ImplementationCompletionValidation = {
	ok: boolean;
	signal: ImplementationCompletionSignal;
	evidence?: string;
	error?: string;
	output: string;
};

export type ImplementationSubagentCompletionLike = {
	result?: string | null;
	description?: string | null;
	error?: string | null;
	status?: string | null;
};

export type ImplementationCompletionValidationInput = {
	output: string;
	signal: ImplementationCompletionSignal;
	requiresExpectedFailureProof?: boolean;
	hasExpectedFailureProof?: (output: string, proofToken?: string) => boolean;
	assessCompletionOutput?: (output: string) => { ok: boolean; blocker?: string };
	detectFailureReason?: () => string | null;
};

export type CreateImplementationCompletionValidationInput = Omit<ImplementationCompletionValidationInput, "output" | "detectFailureReason"> & {
	completion: ImplementationSubagentCompletionLike;
	detectFailureReason?: (output: string) => string | null;
};

export type ImplementationCompletionTaskLike = {
	rawTitle?: string;
	subject?: string;
};

export type ValidateImplementationCompletionBridgeInput = {
	output: string;
	signal: ImplementationCompletionSignal;
	task?: ImplementationCompletionTaskLike;
	hasExpectedFailureProof?: (output: string, proofToken?: string) => boolean;
	assessCompletionOutput?: (output: string) => { ok: boolean; blocker?: string };
	detectFailureReason?: () => string | null;
};

export type ImplementationRecoveryTaskLike = {
	taskNumber?: string;
	stableKey: string;
	rawTitle?: string;
	subject: string;
	fields: Record<string, string>;
};

export type ImplementationFixTaskEntry = {
	attempts: number;
	fixTaskIds: string[];
	lastError?: string;
};

export type ImplementationFixTaskLineage = {
	originalTaskId: string;
	insertionAnchorId: string;
	attempts: number;
	fixTaskId: string;
	fixTaskIds: string[];
	lastError: string;
	fixTaskMap: Record<string, unknown>;
};

export type ImplementationFixTaskPlan = ImplementationFixTaskLineage & {
	fixTaskBlock: string;
};

export type ImplementationRecoveryStopPlan = {
	originalTaskId: string;
	failedTaskId: string;
	insertionAnchorId: string;
	attempts: number;
	lineageDepth: number;
	maxFixTasksPerOriginal: number;
	maxFixTaskDepth: number;
	fixTaskIds: string[];
	lastError: string;
	reason: string;
	evidence: Record<string, unknown>;
};

export type ImplementationRecoveryBounds = {
	maxFixTasksPerOriginal: number;
	maxFixTaskDepth: number;
};

export type ImplementationExecutionBatchTaskLike = {
	index: number;
	isParallel: boolean;
	status?: string | null;
};

export type ExecutionBatch = {
	kind: "single" | "batch";
	mode: "single" | "parallel-sequential";
	taskIndices: number[];
};

export type ImplementationBatchTaskEvidenceEntry = {
	taskKey: string;
	entry: ImplementationTaskEvidenceEntry;
};

export type ImplementationReviewStatus = "REVIEW_PASS" | "REVIEW_FAIL";

export type VerificationFailureCategory =
	| "transient_tool_failure"
	| "cleanup_artifact_failure"
	| "shared_contract_drift"
	| "stale_state_failure"
	| "publish_bundle_failure"
	| "real_product_failure"
	| "fatal_runtime_failure";

export type VerificationRecoveryAction =
	| "retry_verifier"
	| "cleanup_artifacts"
	| "repair_shared_contract"
	| "repair_state"
	| "repair_publish_bundle"
	| "delegate_fix_task"
	| "block";

export type ImplementationVerificationRecoveryPolicy = {
	category: VerificationFailureCategory;
	reasonCode: string;
	recoverable: boolean;
	recoveryAction: VerificationRecoveryAction;
	attemptCount: number;
	nextStep: string;
};

export type ImplementationVerificationFailureEnvelope = {
	output: string;
	normalizedOutput: string;
	policy: ImplementationVerificationRecoveryPolicy;
};

export type ImplementationFinalizerTaskLike = {
	checkboxKey?: string;
	stableKey: string;
	taskNumber?: string;
	status?: string | null;
};

export type ImplementationFinalizerFailureOutputInput = {
	specName: string;
	taskCount: number;
	statePath: string;
	epicLines: readonly string[];
	indexError: string;
	indexSummary: string;
};

export type ImplementationFinalizerSuccessOutputInput = {
	specName: string;
	taskCount: number;
	statePath: string;
	completedSummaries: readonly string[];
	epicLines: readonly string[];
	indexSummary: string;
	deletedProgressFiles: readonly string[];
	prUrl: string | null;
};

export type ImplementationReviewTaskLike = {
	index: number;
	taskNumber?: string;
	phase?: string;
	rawTitle?: string;
	subject?: string;
};

export type ImplementationReviewCheckpoint = {
	required: boolean;
	checkpoint: "phaseBoundary" | "every5" | "finalTask" | "none";
	phaseBoundary: boolean;
	phaseChanged: boolean;
	everyFifth: boolean;
	finalTask: boolean;
	reason: string;
};

export type ImplementationReviewEvidenceEntry = {
	taskIndex: number;
	status: ImplementationReviewStatus;
	iteration: number;
	checkpoint: ImplementationReviewCheckpoint["checkpoint"];
	summary: string;
	reviewedAt: string;
};

export type ImplementationReviewEvidenceInput = {
	taskIndex: number;
	status: ImplementationReviewStatus;
	iteration: number;
	checkpoint: ImplementationReviewCheckpoint["checkpoint"];
	summary: string;
	reviewedAt?: string;
};

export type ImplementationReviewCheckpointFlags = {
	phaseBoundary: boolean;
	phaseChanged: boolean;
	everyFifth: boolean;
	finalTask: boolean;
};

export type ImplementationTaskModificationType = "SPLIT_TASK" | "ADD_PREREQUISITE" | "ADD_FOLLOWUP";

export type ImplementationTaskModificationRequest = {
	type: ImplementationTaskModificationType;
	originalTaskId: string;
	reasoning: string;
	proposedTasks: string[];
};

export type ImplementationTaskModificationRecord = {
	id: string;
	ids: string[];
	type: ImplementationTaskModificationType;
	reason: string;
	appliedAt: string;
};

export type ImplementationTaskModificationStatePatch = Record<string, unknown>;

export type ApplyImplementationTaskModificationInput = {
	modificationMap: Record<string, unknown>;
	originalTaskId: string;
	existingEntry: unknown;
	priorCount: number;
	request: Pick<ImplementationTaskModificationRequest, "type" | "reasoning">;
	proposedTaskIds: string[];
	appliedAt?: string;
};

export type ApplyImplementationTaskModificationResult = {
	modificationRecord: ImplementationTaskModificationRecord;
	modificationStatePatch: ImplementationTaskModificationStatePatch;
};

export type ImplementationTaskMutationPosition = "before" | "after";

export type ImplementationTaskMutationAnchor = {
	startLine: number;
	endLine: number;
};

export type ImplementationParsedTaskMutationCandidate = {
	status: "pending" | "completed";
	taskNumber?: string;
	stableKey: string;
	fields: Record<string, string>;
};

export type ValidateImplementationTaskMutationInput = {
	request: Pick<ImplementationTaskModificationRequest, "originalTaskId">;
	currentTaskId: string;
	priorCount: number;
	maxModificationsPerTask: number;
	maxModificationDepth: number;
	existingTaskIds: ReadonlySet<string>;
	requiredFields: readonly Array<{ key: string; label: string }>;
	proposedTasks: readonly ImplementationParsedTaskMutationCandidate[];
};

export type ValidateImplementationTaskMutationResult = {
	proposedTaskIds: string[];
};

export type ApplyImplementationTaskBlockMutationInput = {
	content: string;
	anchorTask: ImplementationTaskMutationAnchor;
	blocks: string[];
	position: ImplementationTaskMutationPosition;
};

export type CreateImplementationTaskMutationRemapPatchInput = {
	state: RalphState | null;
	nativeTaskMap: Record<string, string>;
	totalTasks: number;
	nextTaskIndex: number;
	modificationStatePatch: ImplementationTaskModificationStatePatch;
	request: Pick<ImplementationTaskModificationRequest, "type" | "originalTaskId" | "reasoning">;
	proposedTaskIds: string[];
	lastSubagentOutput: string;
	maxModificationsPerTask?: number;
	maxModificationDepth?: number;
	appliedAt?: string;
};

export type CreateImplementationResumeRepairStatePatchInput = {
	state: RalphState | null;
	taskIndex: number;
	totalTasks: number;
};

const IMPLEMENTATION_VERIFICATION_POLICY_MATRIX: Record<VerificationFailureCategory, Omit<ImplementationVerificationRecoveryPolicy, "category" | "attemptCount" | "nextStep">> = {
	transient_tool_failure: {
		reasonCode: "VERIFY_TRANSIENT_TOOL_FAILURE",
		recoverable: true,
		recoveryAction: "retry_verifier",
	},
	cleanup_artifact_failure: {
		reasonCode: "VERIFY_CLEANUP_ARTIFACT_FAILURE",
		recoverable: true,
		recoveryAction: "cleanup_artifacts",
	},
	shared_contract_drift: {
		reasonCode: "VERIFY_SHARED_CONTRACT_DRIFT",
		recoverable: true,
		recoveryAction: "repair_shared_contract",
	},
	stale_state_failure: {
		reasonCode: "VERIFY_STALE_STATE_FAILURE",
		recoverable: true,
		recoveryAction: "repair_state",
	},
	publish_bundle_failure: {
		reasonCode: "VERIFY_PUBLISH_BUNDLE_FAILURE",
		recoverable: true,
		recoveryAction: "repair_publish_bundle",
	},
	real_product_failure: {
		reasonCode: "VERIFY_REAL_PRODUCT_FAILURE",
		recoverable: false,
		recoveryAction: "delegate_fix_task",
	},
	fatal_runtime_failure: {
		reasonCode: "VERIFY_FATAL_RUNTIME_FAILURE",
		recoverable: false,
		recoveryAction: "block",
	},
};

export function implementationStateRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? { ...value } : {};
}

export function normalizeImplementationVerificationFailureOutput(output: string): string {
	return normalizeImplementationWhitespace(output).toLowerCase();
}

export function classifyImplementationVerificationFailure(output: string): VerificationFailureCategory {
	const normalized = normalizeImplementationVerificationFailureOutput(output);
	if (!normalized) return "fatal_runtime_failure";
	if (/command not found|no such file or directory|network|timeout|temporar|eai_again|etimedout|tool registry unavailable/.test(normalized)) {
		return "transient_tool_failure";
	}
	if (/cleanup|artifact|temporary progress cleanup|\.progress-task-|stale temp/.test(normalized)) {
		return "cleanup_artifact_failure";
	}
	if (/shared contract|acceptance-checklist|contract drift|native task map|parity/.test(normalized)) {
		return "shared_contract_drift";
	}
	if (/stale state|\.ralph-state\.json|validation error|blockedat|lastsubagentoutput|currenttask/.test(normalized)) {
		return "stale_state_failure";
	}
	if (/publish bundle|verify:pack|verify:index|prepack|missingpathtype|dependency_entrypoint|originalroot/.test(normalized)) {
		return "publish_bundle_failure";
	}
	if (/assertionerror|failed|error:|real product|product failure|task .*failed/.test(normalized)) {
		return "real_product_failure";
	}
	return "fatal_runtime_failure";
}

export function createImplementationVerificationRecoveryPolicy(
	output: string,
	attemptCount = 0,
): ImplementationVerificationRecoveryPolicy {
	const category = classifyImplementationVerificationFailure(output);
	const contract = IMPLEMENTATION_VERIFICATION_POLICY_MATRIX[category];
	const nextStep = contract.recoverable
		? `Retry verification with ${contract.recoveryAction} (attempt ${attemptCount + 1}).`
		: contract.recoveryAction === "delegate_fix_task"
			? "Delegate a focused fix task before rerunning verification."
			: "Block implementation and surface the verifier failure evidence. ";
	return {
		category,
		reasonCode: contract.reasonCode,
		recoverable: contract.recoverable,
		recoveryAction: contract.recoveryAction,
		attemptCount,
		nextStep: nextStep.trim(),
	};
}

export function createImplementationVerificationFailureEnvelope(
	output: string,
	attemptCount = 0,
): ImplementationVerificationFailureEnvelope {
	return {
		output,
		normalizedOutput: normalizeImplementationVerificationFailureOutput(output),
		policy: createImplementationVerificationRecoveryPolicy(output, attemptCount),
	};
}

export function formatImplementationVerificationRecoveryPolicy(
	policy: ImplementationVerificationRecoveryPolicy,
): string {
	return `${policy.reasonCode}: recoverable=${policy.recoverable}; recoveryAction=${policy.recoveryAction}; attemptCount=${policy.attemptCount}; nextStep=${policy.nextStep}`;
}

export function hasImplementationCompletionSignal(output: string, signal: ImplementationCompletionSignal): boolean {
	return new RegExp(`(^|\\n)${signal}\\b`, "m").test(output);
}

export function detectImplementationCompletionContradiction(output: string): string | null {
	const patterns = [
		/requires manual/i,
		/cannot be automated/i,
		/could not complete/i,
		/needs human/i,
		/manual intervention/i,
		/TASK_MODIFICATION_REQUEST/i,
		/USER_INPUT_REQUIRED/i,
		/VERIFICATION_FAIL/i,
	];
	const match = patterns.find((pattern) => pattern.test(output));
	return match ? match.source : null;
}

export function extractImplementationCompletionEvidence(
	output: string,
	signal: ImplementationCompletionSignal,
	requireRedPass = false,
	hasExpectedFailureProof?: (output: string, proofToken?: string) => boolean,
): string | null {
	const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	const keyedEvidence: string[] = [];
	const passEvidence: string[] = [];

	for (const line of lines) {
		const keyed = line.match(/^(?:verify|verification|evidence):\s*(.+)$/i);
		if (keyed) keyedEvidence.push(keyed[1]);
		if (signal === "VERIFICATION_PASS" && /\bPASS\b/i.test(line) && !/^VERIFICATION_PASS\b/.test(line)) {
			passEvidence.push(line);
		}
	}

	if (requireRedPass) {
		return hasExpectedFailureProof?.(output, "RED_PASS") ? "RED_PASS" : null;
	}

	const candidates = signal === "VERIFICATION_PASS" ? [...keyedEvidence, ...passEvidence] : keyedEvidence;
	for (const candidate of candidates) {
		const evidence = meaningfulImplementationEvidence(candidate);
		if (evidence) return evidence;
	}
	return null;
}

export function formatImplementationSubagentCompletionOutput(completion: ImplementationSubagentCompletionLike): string {
	return [completion.result, completion.description, completion.error, completion.status]
		.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
		.join("\n");
}

export function createImplementationCompletionValidationInput(
	input: CreateImplementationCompletionValidationInput,
): ImplementationCompletionValidationInput {
	const output = formatImplementationSubagentCompletionOutput(input.completion);
	return {
		output,
		signal: input.signal,
		requiresExpectedFailureProof: input.requiresExpectedFailureProof,
		hasExpectedFailureProof: input.hasExpectedFailureProof,
		assessCompletionOutput: input.assessCompletionOutput,
		detectFailureReason: input.detectFailureReason
			? () => input.detectFailureReason?.(output) ?? null
			: undefined,
	};
}

export function validateImplementationTaskCompletion(input: ImplementationCompletionValidationInput): ImplementationCompletionValidation {
	if (!hasImplementationCompletionSignal(input.output, input.signal)) {
		return {
			ok: false,
			signal: input.signal,
			error: input.detectFailureReason?.() ?? `Missing completion signal ${input.signal}.`,
			output: input.output,
		};
	}

	const contradiction = detectImplementationCompletionContradiction(input.output);
	if (contradiction) {
		return {
			ok: false,
			signal: input.signal,
			error: input.detectFailureReason?.() ?? `Completion contradicted by output pattern: ${contradiction}.`,
			output: input.output,
		};
		}

	const evidence = extractImplementationCompletionEvidence(
		input.output,
		input.signal,
		Boolean(input.requiresExpectedFailureProof),
		input.hasExpectedFailureProof,
	);
	if (!evidence) {
		return {
			ok: false,
			signal: input.signal,
			error: input.requiresExpectedFailureProof
				? "[RED] completion signal lacked keyed expected-failure proof (`verify: RED_PASS`)."
				: "Completion signal lacked verification evidence.",
			output: input.output,
		};
	}

	if (input.requiresExpectedFailureProof) {
		const unexpectedFailureSignal = input.output.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => /^(?:VERIFICATION_FAIL|USER_INPUT_REQUIRED|TASK_MODIFICATION_REQUEST)\b/i.test(line));
		if (unexpectedFailureSignal) {
			return {
				ok: false,
				signal: input.signal,
				error: input.detectFailureReason?.()
					?? `Expected-failure proof RED_PASS cannot override explicit failure signal: ${unexpectedFailureSignal}.`,
				output: input.output,
			};
		}
	}

	const completionAssessment = input.assessCompletionOutput?.(input.output) ?? { ok: true };
	if (!completionAssessment.ok) {
		return {
			ok: false,
			signal: input.signal,
			error: completionAssessment.blocker
				?? input.detectFailureReason?.()
				?? "Workspace completion output is invalid.",
			output: input.output,
		};
	}

	return { ok: true, signal: input.signal, evidence, output: input.output };
}

export function createImplementationCompletionBridgeInput(
	input: ValidateImplementationCompletionBridgeInput,
): ImplementationCompletionValidationInput {
	return {
		output: input.output,
		signal: input.signal,
		requiresExpectedFailureProof: input.signal === "TASK_COMPLETE" && isImplementationRedTask(input.task),
		hasExpectedFailureProof: input.hasExpectedFailureProof,
		assessCompletionOutput: input.assessCompletionOutput,
		detectFailureReason: input.detectFailureReason,
	};
}

export function validateImplementationCompletionBridge(
	input: ValidateImplementationCompletionBridgeInput,
): ImplementationCompletionValidation {
	return validateImplementationTaskCompletion(createImplementationCompletionBridgeInput(input));
}

export function isImplementationRedTask(task?: ImplementationCompletionTaskLike | null): boolean {
	if (!task) return false;
	return /\[RED\]/i.test(`${task.rawTitle ?? ""}\n${task.subject ?? ""}`);
}

export function validateImplementationTaskModificationRequestPayload(parsed: unknown): ImplementationTaskModificationRequest {
	if (!isRecord(parsed)) throw new Error("TASK_MODIFICATION_REQUEST payload must be a JSON object.");

	const typeValue = typeof parsed.type === "string" ? parsed.type.trim().toUpperCase() : "";
	if (typeValue !== "SPLIT_TASK" && typeValue !== "ADD_PREREQUISITE" && typeValue !== "ADD_FOLLOWUP") {
		throw new Error(`Unsupported TASK_MODIFICATION_REQUEST type: ${String(parsed.type ?? "")}.`);
	}

	const originalTaskId = typeof parsed.originalTaskId === "string" ? parsed.originalTaskId.trim() : "";
	if (!originalTaskId) throw new Error("TASK_MODIFICATION_REQUEST must include originalTaskId.");

	const reasoningSource = typeof parsed.reasoning === "string"
		? parsed.reasoning
		: typeof parsed.reason === "string"
			? parsed.reason
			: "";
	const reasoning = normalizeImplementationWhitespace(reasoningSource);
	if (!reasoning) throw new Error("TASK_MODIFICATION_REQUEST must include reasoning.");

	const proposedTasks = Array.isArray(parsed.proposedTasks)
		? parsed.proposedTasks.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
		: [];
	if (proposedTasks.length === 0) throw new Error("TASK_MODIFICATION_REQUEST must include at least one proposed task block.");
	if ((typeValue === "ADD_PREREQUISITE" || typeValue === "ADD_FOLLOWUP") && proposedTasks.length !== 1) {
		throw new Error(`${typeValue} must propose exactly one task block.`);
	}

	return {
		type: typeValue,
		originalTaskId,
		reasoning,
		proposedTasks,
	};
}

export function parseImplementationTaskModification(output: string): ImplementationTaskModificationRequest | null {
	if (!/TASK_MODIFICATION_REQUEST/i.test(output)) return null;

	const payloadText = extractImplementationTaggedJsonPayload(output, "TASK_MODIFICATION_REQUEST");
	if (!payloadText) throw new Error("TASK_MODIFICATION_REQUEST was present but no JSON payload was found.");

	let parsed: unknown;
	try {
		parsed = JSON.parse(payloadText) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`TASK_MODIFICATION_REQUEST payload is not valid JSON: ${message}`);
	}

	return validateImplementationTaskModificationRequestPayload(parsed);
}

export function validateImplementationTaskMutation(input: ValidateImplementationTaskMutationInput): ValidateImplementationTaskMutationResult {
	if (input.request.originalTaskId !== input.currentTaskId) {
		throw new Error(`TASK_MODIFICATION_REQUEST targeted ${input.request.originalTaskId}, but the active task is ${input.currentTaskId}.`);
	}
	if (input.priorCount >= input.maxModificationsPerTask) {
		throw new Error(`Max modifications (${input.maxModificationsPerTask}) reached for task ${input.request.originalTaskId}.`);
	}

	const proposedTaskIds = input.proposedTasks.map((parsedTask, index) => {
		if (parsedTask.status === "completed") throw new Error(`Proposed task ${index + 1} must be unchecked.`);
		if (!parsedTask.taskNumber) throw new Error(`Proposed task ${index + 1} must start with a numeric task id.`);
		if (input.existingTaskIds.has(parsedTask.taskNumber)) throw new Error(`Proposed task id ${parsedTask.taskNumber} already exists in tasks.md.`);
		if (taskMutationDepth(parsedTask.taskNumber) > input.maxModificationDepth) {
			throw new Error(`Proposed task id ${parsedTask.taskNumber} exceeds max modification depth ${input.maxModificationDepth}.`);
		}
		for (const field of input.requiredFields) {
			if (!parsedTask.fields[field.key]) throw new Error(`Proposed task ${parsedTask.taskNumber} is missing required field: ${field.label}.`);
		}
		return parsedTask.taskNumber ?? parsedTask.stableKey;
	});

	if (new Set(proposedTaskIds).size !== proposedTaskIds.length) {
		throw new Error(`TASK_MODIFICATION_REQUEST proposed duplicate task ids: ${proposedTaskIds.join(", ")}.`);
	}

	return {
		proposedTaskIds,
	};
}

export function applyImplementationTaskBlockMutation(input: ApplyImplementationTaskBlockMutationInput): string {
	const lines = input.content.replace(/\r\n/g, "\n").split("\n");
	const insertionLines = [...input.blocks.join("\n\n").split("\n"), ""];
	const insertAt = input.position === "before" ? input.anchorTask.startLine : input.anchorTask.endLine;
	lines.splice(insertAt, 0, ...insertionLines);
	return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export function createImplementationTaskModificationStatePatch(
	modificationMap: Record<string, unknown>,
	originalTaskId: string,
	existingEntry: unknown,
	priorCount: number,
	modificationRecord: ImplementationTaskModificationRecord,
): ImplementationTaskModificationStatePatch {
	const existingModifications = isRecord(existingEntry) && Array.isArray(existingEntry.modifications)
		? [...existingEntry.modifications]
		: [];
	return {
		...modificationMap,
		[originalTaskId]: {
			...(isRecord(existingEntry) ? existingEntry : {}),
			count: priorCount + 1,
			modifications: [...existingModifications, modificationRecord],
		},
	};
}

export function createImplementationResumeRepairStatePatch(
	input: CreateImplementationResumeRepairStatePatchInput,
): Record<string, unknown> {
	return {
		phase: "execution",
		taskIndex: input.taskIndex,
		totalTasks: input.totalTasks,
		awaitingApproval: false,
		blocked: false,
		validationError: null,
		activeTaskPendingEvidence: null,
		...createImplementationStateDefaults(input.state),
	};
}

export function shouldRestartImplementationLoopAfterBatchModification(
	state: RalphState | null,
	nextState?: RalphState | null,
): boolean {
	if (nextState && nextState !== state) return true;
	return nextState === null;
}

export function shouldDeleteStaleImplementationProgressFile(
	entryName: string,
	ageMs: number,
	maxAgeMs = 60 * 60 * 1000,
): boolean {
	return /^\.progress-task-.*\.md$/i.test(entryName) && ageMs >= maxAgeMs;
}

export function normalizeImplementationPrUrl(prUrl: string): string | null {
	const normalized = prUrl.trim();
	return normalized.length > 0 ? normalized : null;
}

export function createImplementationTaskMutationRemapPatch(
	input: CreateImplementationTaskMutationRemapPatchInput,
): Record<string, unknown> {
	const appliedAt = normalizeImplementationField(input.appliedAt) || new Date().toISOString();
	return {
		nativeTaskMap: { ...input.nativeTaskMap },
		phase: input.nextTaskIndex >= input.totalTasks ? "completed" : "execution",
		taskIndex: input.nextTaskIndex >= input.totalTasks ? input.totalTasks : input.nextTaskIndex,
		totalTasks: input.totalTasks,
		taskIteration: 1,
		globalIteration: (positiveInteger(input.state?.globalIteration) ?? 1) + 1,
		blocked: false,
		validationError: null,
		activeTaskPendingEvidence: null,
		modificationMap: input.modificationStatePatch,
		maxModificationsPerTask: positiveInteger(input.maxModificationsPerTask)
			?? positiveInteger(input.state?.maxModificationsPerTask)
			?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATIONS_PER_TASK,
		maxModificationDepth: positiveInteger(input.maxModificationDepth)
			?? positiveInteger(input.state?.maxModificationDepth)
			?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATION_DEPTH,
		lastSubagentOutput: input.lastSubagentOutput,
		lastTaskModification: {
			type: input.request.type,
			originalTaskId: input.request.originalTaskId,
			proposedTaskIds: [...input.proposedTaskIds],
			reasoning: input.request.reasoning,
			appliedAt,
		},
	};
}

export function applyImplementationTaskModification(
	input: ApplyImplementationTaskModificationInput,
): ApplyImplementationTaskModificationResult {
	const appliedAt = normalizeImplementationField(input.appliedAt) || new Date().toISOString();
	const modificationRecord = {
		id: input.proposedTaskIds[0] ?? input.originalTaskId,
		ids: [...input.proposedTaskIds],
		type: input.request.type,
		reason: input.request.reasoning,
		appliedAt,
	};
	return {
		modificationRecord,
		modificationStatePatch: createImplementationTaskModificationStatePatch(
			input.modificationMap,
			input.originalTaskId,
			input.existingEntry,
			input.priorCount,
			modificationRecord,
		),
	};
}

export function resolveImplementationRetryTarget(task: ImplementationRecoveryTaskLike): string {
	const retryTarget = normalizeImplementationField(task.fields["retry target"]);
	if (retryTarget) return retryTarget;

	const fixMatch = `${task.rawTitle ?? ""} ${task.subject}`.match(/\[FIX\s+([^\]]+)\]/i);
	if (fixMatch?.[1]?.trim()) return fixMatch[1].trim();

	return task.taskNumber?.trim() || task.stableKey;
}

export function resolveImplementationInsertionAnchor(task: ImplementationRecoveryTaskLike): string {
	return normalizeImplementationField(task.taskNumber) || normalizeImplementationField(task.stableKey) || resolveImplementationRetryTarget(task);
}

export function createImplementationFixTaskId(originalTaskId: string, attempts: number): string {
	return `${originalTaskId}.${attempts}`;
}

export function createImplementationFixTaskLineage(
	state: RalphState | null,
	task: ImplementationRecoveryTaskLike,
	lastError: string,
): ImplementationFixTaskLineage {
	const originalTaskId = resolveImplementationRetryTarget(task);
	const insertionAnchorId = resolveImplementationInsertionAnchor(task);
	const fixTaskMap = implementationStateRecord(state?.fixTaskMap);
	const priorEntry = implementationFixTaskEntryFromUnknown(fixTaskMap[originalTaskId]);
	const attempts = priorEntry.attempts + 1;
	const fixTaskId = createImplementationFixTaskId(originalTaskId, attempts);
	const fixTaskIds = mergeImplementationFixTaskIds(priorEntry.fixTaskIds, fixTaskId);
	const normalizedError = normalizeImplementationField(lastError) || "Task execution failed without reported evidence.";

	return {
		originalTaskId,
		insertionAnchorId,
		attempts,
		fixTaskId,
		fixTaskIds,
		lastError: normalizedError,
		fixTaskMap: {
			...fixTaskMap,
			[originalTaskId]: {
				attempts,
				fixTaskIds,
				lastError: normalizedError,
			},
		},
	};
}

export function createImplementationFixTaskPlan(
	state: RalphState | null,
	task: ImplementationRecoveryTaskLike,
	lastError: string,
): ImplementationFixTaskPlan {
	const lineage = createImplementationFixTaskLineage(state, task, lastError);

	return {
		...lineage,
		fixTaskBlock: buildImplementationFixTaskBlock(task, lineage.originalTaskId, lineage.fixTaskId, lineage.lastError),
	};
}

export function createImplementationRecoveryStopPlan(
	state: RalphState | null,
	task: ImplementationRecoveryTaskLike,
	lastError: string,
): ImplementationRecoveryStopPlan {
	const originalTaskId = resolveImplementationRetryTarget(task);
	const failedTaskId = resolveImplementationInsertionAnchor(task);
	const insertionAnchorId = failedTaskId;
	const fixTaskMap = implementationStateRecord(state?.fixTaskMap);
	const priorEntry = implementationFixTaskEntryFromUnknown(fixTaskMap[originalTaskId]);
	const attempts = priorEntry.attempts;
	const lineageDepth = getImplementationFixTaskDepth(task, originalTaskId);
	const { maxFixTasksPerOriginal, maxFixTaskDepth } = getImplementationRecoveryBounds(state);
	const normalizedError = normalizeImplementationField(lastError) || "Task execution failed without reported evidence.";
	const reason = formatImplementationRecoveryStopMessage({
		originalTaskId,
		failedTaskId,
		attempts,
		lineageDepth,
		maxFixTasksPerOriginal,
		maxFixTaskDepth,
		fixTaskIds: priorEntry.fixTaskIds,
	});
	const evidence = createImplementationRecoveryStopEvidence(state?.evidence, {
		originalTaskId,
		failedTaskId,
		insertionAnchorId,
		attempts,
		lineageDepth,
		maxFixTasksPerOriginal,
		maxFixTaskDepth,
		fixTaskIds: priorEntry.fixTaskIds,
		lastError: normalizedError,
		reason,
	});

	return {
		originalTaskId,
		failedTaskId,
		insertionAnchorId,
		attempts,
		lineageDepth,
		maxFixTasksPerOriginal,
		maxFixTaskDepth,
		fixTaskIds: priorEntry.fixTaskIds,
		lastError: normalizedError,
		reason,
		evidence,
	};
}

export function getImplementationRecoveryBounds(state: RalphState | null): ImplementationRecoveryBounds {
	return {
		maxFixTasksPerOriginal: positiveInteger(state?.maxFixTasksPerOriginal)
			?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASKS_PER_ORIGINAL,
		maxFixTaskDepth: positiveInteger(state?.maxFixTaskDepth)
			?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASK_DEPTH,
	};
}

export function isImplementationRecoveryStopRequired(
	attempts: number,
	lineageDepth: number,
	bounds: ImplementationRecoveryBounds,
): boolean {
	return attempts >= bounds.maxFixTasksPerOriginal || lineageDepth >= bounds.maxFixTaskDepth;
}

export function formatImplementationRecoveryStopMessage(
	plan: Pick<ImplementationRecoveryStopPlan, "originalTaskId" | "failedTaskId" | "attempts" | "lineageDepth" | "maxFixTasksPerOriginal" | "maxFixTaskDepth" | "fixTaskIds">,
): string {
	return isImplementationRecoveryStopRequired(plan.attempts, plan.lineageDepth, plan)
		&& plan.attempts >= plan.maxFixTasksPerOriginal
		? `Recovery limit reached for ${plan.originalTaskId}: fix history ${formatImplementationFixTaskIds(plan.fixTaskIds)} already used ${plan.attempts}/${plan.maxFixTasksPerOriginal} attempts.`
		: `Recovery depth reached for ${plan.originalTaskId}: lineage ${plan.failedTaskId} is already at depth ${plan.lineageDepth}/${plan.maxFixTaskDepth}.`;
}

export function createImplementationEvidenceScaffold(existing: unknown): Record<string, unknown> {
	const record = implementationStateRecord(existing);
	const tasks = implementationStateRecord(record.tasks);
	const reviews = Array.isArray(record.reviews) ? [...record.reviews] : [];
	const next: Record<string, unknown> = {
		...record,
		tasks,
		reviews,
	};

	if (record.final !== undefined) {
		next.final = isRecord(record.final) || record.final === null ? record.final : null;
	}

	return next;
}

export function createImplementationTaskEvidence(
	existing: unknown,
	taskKey: string,
	entry: ImplementationTaskEvidenceEntry,
): Record<string, unknown> {
	const evidence = createImplementationEvidenceScaffold(existing);
	const tasks = implementationStateRecord(evidence.tasks);
	return {
		...evidence,
		tasks: {
			...tasks,
			[taskKey]: entry,
		},
	};
}

export function createImplementationRecoveryStopEvidence(
	existing: unknown,
	entry: Omit<ImplementationRecoveryStopPlan, "evidence">,
): Record<string, unknown> {
	const evidence = createImplementationEvidenceScaffold(existing);
	const recoveryStops = Array.isArray(evidence.recoveryStops) ? [...evidence.recoveryStops] : [];
	return {
		...evidence,
		recoveryStops: [
			...recoveryStops,
			{
				...entry,
				stoppedAt: new Date().toISOString(),
			},
		],
	};
}

function implementationReviewPhaseKey(task?: ImplementationReviewTaskLike | null): string {
	if (!task) return "";
	const taskNumber = typeof task.taskNumber === "string" ? task.taskNumber.trim() : "";
	const phaseNumber = taskNumber.match(/^(\d+)/)?.[1];
	if (phaseNumber) return phaseNumber;
	return normalizeImplementationWhitespace(`${task.phase ?? ""} ${task.rawTitle ?? ""} ${task.subject ?? ""}`);
}

export function hasImplementationPhaseBoundary(
	currentTask: ImplementationReviewTaskLike,
	previousTask?: ImplementationReviewTaskLike | null,
): boolean {
	if (!previousTask) return true;
	const currentKey = implementationReviewPhaseKey(currentTask);
	const previousKey = implementationReviewPhaseKey(previousTask);
	if (!currentKey || !previousKey) return false;
	return currentKey !== previousKey;
}

export function calculateImplementationReviewCheckpointFlags(
	taskIndex: number,
	totalTasks: number,
	currentTask: ImplementationReviewTaskLike,
	previousTask?: ImplementationReviewTaskLike | null,
): ImplementationReviewCheckpointFlags {
	const phaseBoundary = hasImplementationPhaseBoundary(currentTask, previousTask);
	return {
		phaseBoundary,
		phaseChanged: phaseBoundary,
		everyFifth: taskIndex > 0 && taskIndex % 5 === 0,
		finalTask: taskIndex === totalTasks - 1,
	};
}

export function createImplementationReviewCheckpoint(
	taskIndex: number,
	totalTasks: number,
	currentTask: ImplementationReviewTaskLike,
	previousTask?: ImplementationReviewTaskLike | null,
): ImplementationReviewCheckpoint {
	const checkpointFlags = calculateImplementationReviewCheckpointFlags(taskIndex, totalTasks, currentTask, previousTask);
	const { phaseBoundary, phaseChanged, everyFifth, finalTask } = checkpointFlags;
	if (phaseBoundary) {
		return {
			required: true,
			checkpoint: "phaseBoundary",
			phaseBoundary,
			phaseChanged,
			everyFifth,
			finalTask,
			reason: "Layer 3 review checkpoint: first task of a new phase boundary.",
		};
	}
	if (everyFifth) {
		return {
			required: true,
			checkpoint: "every5",
			phaseBoundary,
			phaseChanged,
			everyFifth,
			finalTask,
			reason: "Layer 3 review checkpoint: every 5th completed task.",
		};
	}
	if (finalTask) {
		return {
			required: true,
			checkpoint: "finalTask",
			phaseBoundary,
			phaseChanged,
			everyFifth,
			finalTask,
			reason: "Layer 3 review checkpoint: final task before completion.",
		};
	}
	return {
		required: false,
		checkpoint: "none",
		phaseBoundary,
		phaseChanged,
		everyFifth,
		finalTask,
		reason: "Layer 3 review not required for this task.",
	};
}

export function createImplementationReviewEvidenceEntry(
	input: ImplementationReviewEvidenceInput,
): ImplementationReviewEvidenceEntry {
	return {
		taskIndex: input.taskIndex,
		status: input.status,
		iteration: input.iteration,
		checkpoint: input.checkpoint,
		summary: normalizeImplementationWhitespace(input.summary),
		reviewedAt: input.reviewedAt ?? new Date().toISOString(),
	};
}

export function recordImplementationReviewEvidence(
	existing: unknown,
	entry: ImplementationReviewEvidenceEntry,
): Record<string, unknown> {
	const evidence = createImplementationEvidenceScaffold(existing);
	const reviews = Array.isArray(evidence.reviews) ? [...evidence.reviews] : [];
	return {
		...evidence,
		reviews: [...reviews, createImplementationReviewEvidenceEntry(entry)],
	};
}

export function nextImplementationReviewIteration(existing: unknown): number {
	const evidence = createImplementationEvidenceScaffold(existing);
	const reviews = Array.isArray(evidence.reviews) ? evidence.reviews : [];
	return reviews.length + 1;
}

export function latestImplementationReviewStatus(existing: unknown): ImplementationReviewStatus | null {
	const evidence = createImplementationEvidenceScaffold(existing);
	const reviews = Array.isArray(evidence.reviews) ? [...evidence.reviews].reverse() : [];
	for (const review of reviews) {
		if (isRecord(review) && (review.status === "REVIEW_PASS" || review.status === "REVIEW_FAIL")) {
			return review.status;
		}
	}
	return null;
}

export function describeImplementationOutstandingCompletionWork(
	tasks: readonly ImplementationFinalizerTaskLike[],
	state: RalphState | null,
): string[] {
	const blockers: string[] = [];
	if (state?.blocked === true) blockers.push("execution is blocked");
	if (normalizeImplementationField(state?.validationError)) blockers.push("validation error is still present");
	if (isRecord(state?.activeTaskPendingEvidence)) blockers.push("task evidence is still pending");

	const completedTaskIds = new Set(
		tasks
			.filter((task) => task.status === "completed")
			.map((task) => normalizeImplementationField(task.taskNumber) || normalizeImplementationField(task.checkboxKey) || normalizeImplementationField(task.stableKey))
			.filter(Boolean),
	);
	const incompleteTaskIds = new Set(
		tasks
			.filter((task) => task.status !== "completed")
			.map((task) => normalizeImplementationField(task.taskNumber) || normalizeImplementationField(task.checkboxKey) || normalizeImplementationField(task.stableKey))
			.filter(Boolean),
	);
	if (incompleteTaskIds.size > 0) blockers.push("not every task checkbox is complete");

	const fixTaskMap = implementationStateRecord(state?.fixTaskMap);
	for (const [originalTaskId, value] of Object.entries(fixTaskMap)) {
		const entry = implementationFixTaskEntryFromUnknown(value);
		if (incompleteTaskIds.has(originalTaskId) || entry.fixTaskIds.some((taskId) => incompleteTaskIds.has(taskId))) {
			blockers.push(`recovery work remains for ${originalTaskId}`);
		}
	}

	const modificationMap = implementationStateRecord(state?.modificationMap);
	for (const [originalTaskId, value] of Object.entries(modificationMap)) {
		const entry = isRecord(value) ? value : {};
		const modifications = Array.isArray(entry.modifications) ? entry.modifications : [];
		const unresolved = modifications.some((record) => isRecord(record)
			&& Array.isArray(record.ids)
			&& record.ids.some((taskId) => typeof taskId === "string" && incompleteTaskIds.has(taskId)));
		if (incompleteTaskIds.has(originalTaskId) || unresolved) {
			blockers.push(`task modification follow-up remains for ${originalTaskId}`);
		}
	}

	return [...new Set(blockers)];
}

export function createImplementationFinalEvidence(
	existing: unknown,
	patch: Record<string, unknown>,
): Record<string, unknown> {
	const evidence = createImplementationEvidenceScaffold(existing);
	const currentFinal = isRecord(evidence.final) ? evidence.final : {};
	return {
		...evidence,
		final: {
			...currentFinal,
			...patch,
		},
	};
}

export function createImplementationFinalizerStartedPatch(
	existing: unknown,
	taskCount: number,
	completedAt: string,
): Record<string, unknown> {
	return {
		phase: "execution",
		taskIndex: taskCount,
		totalTasks: taskCount,
		awaitingApproval: false,
		blocked: false,
		validationError: null,
		activeTaskPendingEvidence: null,
		completedAt,
		evidence: createImplementationFinalEvidence(existing, {
			completedAt,
			epicUpdated: false,
			indexFinalized: false,
			prUrl: null,
		}),
	};
}

export function createImplementationFinalizerEpicUpdatedPatch(
	existing: unknown,
	taskCount: number,
	completedAt: string,
): Record<string, unknown> {
	return {
		phase: "execution",
		taskIndex: taskCount,
		totalTasks: taskCount,
		awaitingApproval: false,
		blocked: false,
		validationError: null,
		activeTaskPendingEvidence: null,
		evidence: createImplementationFinalEvidence(existing, {
			completedAt,
			epicUpdated: true,
			indexFinalized: false,
			prUrl: null,
		}),
	};
}

export function createImplementationFinalizerIndexFailurePatch(
	existing: unknown,
	taskCount: number,
	completedAt: string,
	indexError: string,
): Record<string, unknown> {
	return {
		phase: "execution",
		taskIndex: taskCount,
		totalTasks: taskCount,
		awaitingApproval: false,
		blocked: true,
		validationError: `Implementation completion index finalization failed: ${indexError}`,
		finalizationError: indexError,
		finalizationErrorAt: new Date().toISOString(),
		activeTaskPendingEvidence: null,
		evidence: createImplementationFinalEvidence(existing, {
			completedAt,
			epicUpdated: true,
			indexFinalized: false,
			indexError,
			prUrl: null,
		}),
	};
}

export function createImplementationFinalizerSuccessPatch(
	existing: unknown,
	taskCount: number,
	completedAt: string,
	indexSummary: string | undefined,
	deletedProgressFiles: readonly string[],
	prUrl: string | null,
): Record<string, unknown> {
	return {
		phase: "completed",
		taskIndex: taskCount,
		totalTasks: taskCount,
		awaitingApproval: false,
		blocked: false,
		validationError: null,
		activeTaskPendingEvidence: null,
		completedAt,
		evidence: createImplementationFinalEvidence(existing, {
			completedAt,
			epicUpdated: true,
			indexFinalized: true,
			indexSummary,
			deletedTempFiles: [...deletedProgressFiles],
			prUrl,
		}),
	};
}

export function formatImplementationFinalizerIndexFailureOutput(input: ImplementationFinalizerFailureOutputInput): string {
	return [
		`Ralph implementation blocked for spec: ${input.specName}`,
		"",
		`Tasks: ${input.taskCount}/${input.taskCount} completed`,
		`State: ${input.statePath}`,
		...(input.epicLines.length > 0 ? ["", ...input.epicLines] : []),
		"",
		`Index finalization failed: ${input.indexError}`,
		input.indexSummary,
	].join("\n");
}

export function formatImplementationFinalizerSuccessOutput(input: ImplementationFinalizerSuccessOutputInput): string {
	return [
		`Ralph implementation complete for spec: ${input.specName}`,
		"",
		`Tasks: ${input.taskCount}/${input.taskCount} completed`,
		`State: ${input.statePath} deleted`,
		...input.completedSummaries,
		...(input.epicLines.length > 0 ? ["", ...input.epicLines] : []),
		"",
		input.indexSummary,
		`Temporary progress cleanup (.progress-task-*.md): ${input.deletedProgressFiles.length > 0 ? input.deletedProgressFiles.join(", ") : "none removed"}`,
		"",
		"ALL_TASKS_COMPLETE",
		...(input.prUrl ? [`PR URL: ${input.prUrl}`] : []),
	].join("\n");
}

// Final completion must only happen after runArtifactReview(...) checkpoints record REVIEW_PASS/REVIEW_FAIL under evidence.reviews.
export function createImplementationStatePatch(
	state: RalphState | null,
	patch: Record<string, unknown>,
): Record<string, unknown> {
	return {
		...patch,
		...createImplementationStateDefaults(state, patch),
	};
}

export function createImplementationStateDefaults(
	state: RalphState | null,
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		maxFixTasksPerOriginal: positiveInteger(overrides.maxFixTasksPerOriginal)
			?? positiveInteger(state?.maxFixTasksPerOriginal)
			?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASKS_PER_ORIGINAL,
		maxFixTaskDepth: positiveInteger(overrides.maxFixTaskDepth)
			?? positiveInteger(state?.maxFixTaskDepth)
			?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASK_DEPTH,
		fixTaskMap: implementationStateRecord(overrides.fixTaskMap ?? state?.fixTaskMap),
		modificationMap: implementationStateRecord(overrides.modificationMap ?? state?.modificationMap),
		nativeTaskMap: implementationStateRecord(overrides.nativeTaskMap ?? state?.nativeTaskMap),
		evidence: createImplementationEvidenceScaffold(overrides.evidence ?? state?.evidence),
		maxModificationsPerTask: positiveInteger(overrides.maxModificationsPerTask)
			?? positiveInteger(state?.maxModificationsPerTask)
			?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATIONS_PER_TASK,
		maxModificationDepth: positiveInteger(overrides.maxModificationDepth)
			?? positiveInteger(state?.maxModificationDepth)
			?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATION_DEPTH,
	};
}

export function recordImplementationTaskEvidence(
	existing: unknown,
	taskKey: string,
	entry: ImplementationTaskEvidenceEntry,
): Record<string, unknown> {
	return createImplementationTaskEvidence(existing, taskKey, entry);
}

export function recordImplementationBatchTaskEvidence(
	existing: unknown,
	taskKey: string,
	entry: ImplementationTaskEvidenceEntry,
): Record<string, unknown> {
	return createImplementationTaskEvidence(existing, taskKey, entry);
}

export function applyImplementationBatchTaskEvidence(
	existing: unknown,
	entry: ImplementationBatchTaskEvidenceEntry,
): Record<string, unknown> {
	return recordImplementationBatchTaskEvidence(existing, entry.taskKey, entry.entry);
}

export function mergeImplementationBatchTaskEvidence(
	existing: unknown,
	entries: readonly ImplementationBatchTaskEvidenceEntry[],
): Record<string, unknown> {
	return entries.reduce<Record<string, unknown>>(
		(current, entry) => applyImplementationBatchTaskEvidence(current, entry),
		createImplementationEvidenceScaffold(existing),
	);
}

export function selectImplementationExecutionBatchTaskIndices(
	tasks: readonly ImplementationExecutionBatchTaskLike[],
	task: ImplementationExecutionBatchTaskLike,
): number[] {
	if (!task.isParallel) return [task.index];

	const taskIndices: number[] = [];
	for (let index = task.index; index < tasks.length; index += 1) {
		const candidate = tasks[index];
		if (!candidate?.isParallel) break;
		if (candidate.status === "completed") continue;
		taskIndices.push(candidate.index);
	}

	return taskIndices.length > 0 ? taskIndices : [task.index];
}

export function resolveImplementationExecutionBatch(
	tasks: readonly ImplementationExecutionBatchTaskLike[],
	task: ImplementationExecutionBatchTaskLike,
): ExecutionBatch {
	const taskIndices = selectImplementationExecutionBatchTaskIndices(tasks, task);
	const isBatch = taskIndices.length > 1;
	return {
		kind: isBatch ? "batch" : "single",
		mode: isBatch ? "parallel-sequential" : "single",
		taskIndices,
	};
}

export function createImplementationExecutionBatch(
	tasks: readonly ImplementationExecutionBatchTaskLike[],
	task: ImplementationExecutionBatchTaskLike,
): ExecutionBatch {
	return resolveImplementationExecutionBatch(tasks, task);
}

export function validateImplementationExecutionState(state: RalphState | null, specOrStatePath: string | { absolutePath: string }): void {
	const error = getImplementationExecutionStateValidationError(state, specOrStatePath);
	if (error) throw new Error(error);
}

export function getImplementationExecutionStateValidationError(
	state: RalphState | null,
	specOrStatePath: string | { absolutePath: string },
): string | null {
	if (!state || state.phase !== "execution") return null;

	const statePath = typeof specOrStatePath === "string"
		? specOrStatePath
		: getRalphStatePath(specOrStatePath);

	for (const [field, predicate, expectation] of executionStateFieldChecks) {
		const error = implementationExecutionFieldError(state, field, predicate, statePath, expectation);
		if (error) return error;
	}

	return null;
}

export function implementationNativeTaskMapFromState(state: RalphState | null): Record<string, string> {
	return implementationNativeTaskMapFromUnknown(state?.nativeTaskMap);
}

export function implementationNativeTaskMapFromUnknown(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};

	const map: Record<string, string> = {};
	for (const [key, taskId] of Object.entries(value)) {
		if (typeof taskId === "string" && taskId.trim()) {
			map[key] = taskId.trim();
		}
	}
	return map;
}

export function getImplementationNativeTaskRepairReason(
	state: RalphState | null,
	tasks: readonly ImplementationNativeTaskLike[],
): string | null {
	const map = implementationNativeTaskMapFromState(state);
	const missingTask = tasks.find((task) => !map[task.checkboxKey]);
	return missingTask ? "missing native task mapping" : null;
}

const executionStateFieldChecks: Array<[
	field: string,
	predicate: (value: unknown) => boolean | undefined,
	expectation: string,
]> = [
	["taskIndex", isNonNegativeInteger, "invalid non-negative integer"],
	["totalTasks", isNonNegativeInteger, "invalid non-negative integer"],
	["taskIteration", positiveInteger, "invalid positive integer"],
	["globalIteration", positiveInteger, "invalid positive integer"],
	["recoveryMode", isBoolean, "invalid boolean"],
	["maxFixTasksPerOriginal", positiveInteger, "invalid positive integer"],
	["maxFixTaskDepth", positiveInteger, "invalid positive integer"],
	["fixTaskMap", isRecord, "invalid required top-level record"],
	["modificationMap", isRecord, "invalid required top-level record"],
	["nativeTaskMap", isRecord, "invalid required top-level record"],
	["evidence", isRecord, "invalid required top-level record"],
];

function implementationExecutionFieldError(
	state: RalphState,
	field: string,
	predicate: (value: unknown) => boolean | undefined,
	statePath: string,
	expectation: string,
): string | null {
	if (!(field in state)) {
		return `Invalid Ralph execution state in ${statePath}: missing required top-level field \"${field}\" in .ralph-state.json.`;
	}

	if (!predicate(state[field])) {
		return `Invalid Ralph execution state in ${statePath}: ${expectation} for field \"${field}\" in .ralph-state.json.`;
	}

	return null;
}

function implementationFixTaskEntryFromUnknown(value: unknown): ImplementationFixTaskEntry {
	if (!isRecord(value)) {
		return { attempts: 0, fixTaskIds: [] };
	}

	const attempts = positiveInteger(value.attempts) ?? 0;
	const fixTaskIds = Array.isArray(value.fixTaskIds)
		? value.fixTaskIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
		: [];
	const lastError = normalizeImplementationField(value.lastError);

	return {
		attempts,
		fixTaskIds,
		...(lastError ? { lastError } : {}),
	};
}

function buildImplementationFixTaskBlock(
	task: ImplementationRecoveryTaskLike,
	originalTaskId: string,
	fixTaskId: string,
	lastError: string,
): string {
	const subject = normalizeImplementationField(task.subject) || "Recover failed task";
	const files = normalizeImplementationField(task.fields.files) || "None";
	const doneWhen = normalizeImplementationField(task.fields["done when"]) || "The original task can be retried safely.";
	const verify = normalizeImplementationField(task.fields.verify) || "None";
	const commit = normalizeImplementationField(task.fields.commit) || "Commit: None";
	const requirements = normalizeImplementationField(task.fields.requirements);
	const design = normalizeImplementationField(task.fields.design);
	const doLines = [
		"1. Diagnose and fix the blocker that prevented the retry target from completing.",
		"2. Re-run the original verifier and record proof so the coordinator can retry the original task.",
	];

	const lines = [
		`- [ ] ${fixTaskId} [FIX ${originalTaskId}] ${subject}`,
		"  - **Do**:",
		...doLines.map((line) => `    ${line}`),
		`  - **Files**: ${files}`,
		`  - **Retry target**: \`${originalTaskId}\``,
		`  - **Last error**: ${lastError}`,
		`  - **Done when**: ${doneWhen}`,
		`  - **Verify**: ${verify}`,
		`  - **Commit**: ${commit}`,
	];

	if (requirements) lines.push(`  - _Requirements: ${requirements}_`);
	if (design) lines.push(`  - _Design: ${design}_`);

	return lines.join("\n");
}

function mergeImplementationFixTaskIds(existing: readonly string[], nextFixTaskId: string): string[] {
	const ids = new Set(existing.filter((entry) => typeof entry === "string" && entry.trim().length > 0));
	ids.add(nextFixTaskId);
	return [...ids].sort(compareImplementationFixTaskIds);
}

function getImplementationFixTaskDepth(task: ImplementationRecoveryTaskLike, originalTaskId: string): number {
	const currentTaskId = normalizeImplementationField(task.taskNumber) || normalizeImplementationField(task.stableKey);
	if (!currentTaskId) return 0;
	const originalSegments = originalTaskId.split(".").filter(Boolean).length;
	const currentSegments = currentTaskId.split(".").filter(Boolean).length;
	return Math.max(0, currentSegments - originalSegments);
}

function formatImplementationFixTaskIds(fixTaskIds: readonly string[]): string {
	return fixTaskIds.length > 0 ? fixTaskIds.join(", ") : "none";
}

function compareImplementationFixTaskIds(left: string, right: string): number {
	const leftSegments = left.split(".");
	const rightSegments = right.split(".");
	const maxLength = Math.max(leftSegments.length, rightSegments.length);
	for (let index = 0; index < maxLength; index += 1) {
		const leftSegment = leftSegments[index] ?? "";
		const rightSegment = rightSegments[index] ?? "";
		const leftNumber = Number(leftSegment);
		const rightNumber = Number(rightSegment);
		const bothNumeric = Number.isInteger(leftNumber) && Number.isInteger(rightNumber);
		if (bothNumeric && leftNumber !== rightNumber) return leftNumber - rightNumber;
		if (leftSegment !== rightSegment) return leftSegment.localeCompare(rightSegment);
	}
	return 0;
}

function normalizeImplementationField(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function meaningfulImplementationEvidence(value: string): string | null {
	const normalized = normalizeImplementationWhitespace(value.replace(/^[*-]\s*/, ""));
	if (normalized.length < 8) return null;
	if (/^(none|n\/a|na|unknown|not run|skipped|pass|passed)$/i.test(normalized)) return null;
	return normalized;
}

function normalizeImplementationWhitespace(value: unknown): string {
	return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function extractImplementationTaggedJsonPayload(output: string, marker: string): string | null {
	const markerMatch = new RegExp(marker, "i").exec(output);
	if (!markerMatch || markerMatch.index < 0) return null;
	const tail = output.slice(markerMatch.index + markerMatch[0].length);
	const fenced = tail.match(/(?:```|~~~)\s*(?:json)?\s*\n?([\s\S]*?)\n?(?:```|~~~)/i);
	if (fenced?.[1]) return fenced[1].trim();
	return extractImplementationBalancedJsonObject(tail)?.trim() ?? null;
}

function extractImplementationBalancedJsonObject(content: string): string | null {
	const start = content.indexOf("{");
	if (start < 0) return null;

	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = start; index < content.length; index += 1) {
		const character = content[index];
		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (character === "\\") {
				escaped = true;
				continue;
			}
			if (character === '"') inString = false;
			continue;
		}

		if (character === '"') {
			inString = true;
			continue;
		}
		if (character === "{") {
			depth += 1;
			continue;
		}
		if (character === "}") {
			depth -= 1;
			if (depth === 0) return content.slice(start, index + 1);
		}
	}

	return null;
}

function taskMutationDepth(taskId: string): number {
	return Math.max(0, countTaskMutationIdDots(taskId) - 1);
}

function countTaskMutationIdDots(taskId: string): number {
	const matches = taskId.match(/\./g);
	return matches ? matches.length : 0;
}

function positiveInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function isNonNegativeInteger(value: unknown): boolean {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isBoolean(value: unknown): boolean {
	return typeof value === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
