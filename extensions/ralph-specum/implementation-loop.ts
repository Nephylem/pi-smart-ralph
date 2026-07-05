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

export function implementationStateRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? { ...value } : {};
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
