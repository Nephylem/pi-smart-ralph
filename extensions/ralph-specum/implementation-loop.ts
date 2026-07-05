import { getRalphStatePath, type RalphState } from "./state.ts";

export type ImplementationNativeTaskLike = {
	checkboxKey: string;
	index: number;
};

export const IMPLEMENTATION_DEFAULT_MAX_FIX_TASKS_PER_ORIGINAL = 3;
export const IMPLEMENTATION_DEFAULT_MAX_FIX_TASK_DEPTH = 3;
export const IMPLEMENTATION_DEFAULT_MAX_MODIFICATIONS_PER_TASK = 3;
export const IMPLEMENTATION_DEFAULT_MAX_MODIFICATION_DEPTH = 2;

export type ImplementationTaskEvidenceEntry = {
	signal: string;
	proof: string;
	agent: string;
	completedAt: string;
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

export type ImplementationFixTaskPlan = {
	originalTaskId: string;
	attempts: number;
	fixTaskId: string;
	fixTaskBlock: string;
	fixTaskMap: Record<string, unknown>;
	lastError: string;
};

export function implementationStateRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? { ...value } : {};
}

export function resolveImplementationRetryTarget(task: ImplementationRecoveryTaskLike): string {
	const retryTarget = normalizeImplementationField(task.fields["retry target"]);
	if (retryTarget) return retryTarget;

	const fixMatch = `${task.rawTitle ?? ""} ${task.subject}`.match(/\[FIX\s+([^\]]+)\]/i);
	if (fixMatch?.[1]?.trim()) return fixMatch[1].trim();

	return task.taskNumber?.trim() || task.stableKey;
}

export function createImplementationFixTaskPlan(
	state: RalphState | null,
	task: ImplementationRecoveryTaskLike,
	lastError: string,
): ImplementationFixTaskPlan {
	const originalTaskId = resolveImplementationRetryTarget(task);
	const fixTaskMap = implementationStateRecord(state?.fixTaskMap);
	const priorEntry = implementationFixTaskEntryFromUnknown(fixTaskMap[originalTaskId]);
	const attempts = priorEntry.attempts + 1;
	const fixTaskId = `${originalTaskId}.${attempts}`;
	const fixTaskIds = priorEntry.fixTaskIds.includes(fixTaskId)
		? [...priorEntry.fixTaskIds]
		: [...priorEntry.fixTaskIds, fixTaskId];
	const normalizedError = normalizeImplementationField(lastError) || "Task execution failed without reported evidence.";

	return {
		originalTaskId,
		attempts,
		fixTaskId,
		lastError: normalizedError,
		fixTaskMap: {
			...fixTaskMap,
			[originalTaskId]: {
				attempts,
				fixTaskIds,
				lastError: normalizedError,
			},
		},
		fixTaskBlock: buildImplementationFixTaskBlock(task, originalTaskId, fixTaskId, normalizedError),
	};
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

function normalizeImplementationField(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
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
