import type { RalphState } from "./state.ts";

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

function positiveInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
