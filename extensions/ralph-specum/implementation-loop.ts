import { getRalphStatePath, type RalphState } from "./state.ts";

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
	if (!state || state.phase !== "execution") return;

	const statePath = typeof specOrStatePath === "string"
		? specOrStatePath
		: getRalphStatePath(specOrStatePath);

	assertExecutionField(state, "taskIndex", isNonNegativeInteger, statePath, "invalid non-negative integer");
	assertExecutionField(state, "totalTasks", isNonNegativeInteger, statePath, "invalid non-negative integer");
	assertExecutionField(state, "taskIteration", positiveInteger, statePath, "invalid positive integer");
	assertExecutionField(state, "globalIteration", positiveInteger, statePath, "invalid positive integer");
	assertExecutionField(state, "recoveryMode", isBoolean, statePath, "invalid boolean");
	assertExecutionField(state, "maxFixTasksPerOriginal", positiveInteger, statePath, "invalid positive integer");
	assertExecutionField(state, "maxFixTaskDepth", positiveInteger, statePath, "invalid positive integer");
	assertExecutionField(state, "fixTaskMap", isRecord, statePath, "invalid required top-level record");
	assertExecutionField(state, "modificationMap", isRecord, statePath, "invalid required top-level record");
	assertExecutionField(state, "nativeTaskMap", isRecord, statePath, "invalid required top-level record");
	assertExecutionField(state, "evidence", isRecord, statePath, "invalid required top-level record");
}

function assertExecutionField<T>(
	state: RalphState,
	field: string,
	predicate: (value: unknown) => T | boolean | undefined,
	statePath: string,
	expectation: string,
): void {
	if (!(field in state)) {
		throw new Error(`Invalid Ralph execution state in ${statePath}: missing required top-level field \"${field}\" in .ralph-state.json.`);
	}

	if (!predicate(state[field])) {
		throw new Error(`Invalid Ralph execution state in ${statePath}: ${expectation} for field \"${field}\" in .ralph-state.json.`);
	}
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
