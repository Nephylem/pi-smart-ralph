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

export function implementationStateRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? { ...value } : {};
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
