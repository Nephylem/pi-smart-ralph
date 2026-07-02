import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	clearCurrentEpic,
	getCurrentEpicFilePath,
	getDefaultSpecRoot,
	readCurrentEpicName,
	resolveCurrentEpic,
	resolveEpic,
	writeCurrentEpic,
	type CurrentEpic,
	type RalphPathOptions,
} from "./paths.ts";

export {
	clearCurrentEpic,
	getCurrentEpicFilePath,
	readCurrentEpicName,
	resolveCurrentEpic,
	resolveEpic,
	resolveEpic as resolveEpicDirectory,
	writeCurrentEpic,
	type CurrentEpic,
};

export const EPIC_STATE_FILE = ".epic-state.json";
export const EPIC_PROGRESS_FILE = ".progress.md";
export const EPIC_SCHEMA_VERSION = 1;

export type EpicStatus = "draft" | "ready" | "in_progress" | "completed" | "cancelled" | "blocked";
export type EpicChildSpecStatus = "pending" | "in_progress" | "completed" | "cancelled" | "blocked";

export type EpicInterfaceContract = Record<string, unknown> & {
	name?: string;
	type?: string;
	producer?: string;
	consumers?: string[];
	shape?: string;
	compatibilityNotes?: string;
};

export type EpicChildSpec = Record<string, unknown> & {
	name: string;
	goal?: string;
	status: EpicChildSpecStatus;
	order?: number;
	path?: string;
	planPath?: string;
	dependencies?: string[];
	size?: string;
	acceptanceCriteria?: string[];
	mvpScope?: Record<string, unknown>;
	interfaceContracts?: EpicInterfaceContract[];
	startedAt?: string | null;
	completedAt?: string | null;
	blockedReason?: string | null;
	issueNumber?: number | null;
	issueUrl?: string | null;
	githubStatus?: string | null;
};

export type EpicState = Record<string, unknown> & {
	schemaVersion: number;
	name: string;
	goal?: string;
	status: EpicStatus;
	phase?: string;
	output?: string;
	basePath?: string;
	epicPath?: string;
	researchPath?: string;
	progressPath?: string;
	createdAt?: string;
	updatedAt?: string;
	activeSpec?: string | null;
	lastCompletedSpec?: string | null;
	issueNumber?: number | null;
	issueUrl?: string | null;
	githubStatus?: string | null;
	github?: Record<string, unknown>;
	specs: EpicChildSpec[];
	contracts?: EpicInterfaceContract[];
	validation?: Record<string, unknown> & {
		warnings?: string[];
		lastValidatedAt?: string | null;
	};
};

export type EpicStatePatch = Record<string, unknown>;
export type EpicStateReference = string | CurrentEpic;

export type SafeEpicStateRead = {
	path: string;
	state: EpicState | null;
	warnings: string[];
};

export type MissingEpicDependency = {
	specName: string;
	dependency: string;
};

export type EpicOrderCollision = {
	order: number;
	specNames: string[];
};

export type EpicValidationResult = {
	valid: boolean;
	warnings: string[];
	missingDependencies: MissingEpicDependency[];
	cycles: string[][];
	duplicateOrders: EpicOrderCollision[];
};

export type EpicSpecDependencyStatus = {
	spec: EpicChildSpec;
	name: string;
	status: EpicChildSpecStatus;
	order: number;
	dependencies: string[];
	completedDependencies: string[];
	unmetDependencies: string[];
	missingDependencies: string[];
	isReady: boolean;
	isExplicitlyBlocked: boolean;
	isDependencyBlocked: boolean;
};

export type EpicDependencySummary = {
	validation: EpicValidationResult;
	specs: EpicSpecDependencyStatus[];
	readySpecs: EpicChildSpec[];
	nextSpec: EpicChildSpec | null;
	completedSpecs: EpicChildSpec[];
	inProgressSpecs: EpicChildSpec[];
	explicitlyBlockedSpecs: EpicChildSpec[];
	dependencyBlockedSpecs: EpicChildSpec[];
	cancelledSpecs: EpicChildSpec[];
};

export type EpicChildStatusUpdateOptions = RalphPathOptions & {
	now?: string | Date;
	blockedReason?: string | null;
	patch?: Record<string, unknown>;
	epicStatus?: EpicStatus;
};

export type CompleteEpicChildSpecOptions = EpicChildStatusUpdateOptions & {
	appendProgress?: boolean;
	clearCurrentEpicOnComplete?: boolean;
};

export type CompleteEpicChildSpecResult = {
	state: EpicState;
	completedSpec: EpicChildSpec;
	newlyReadySpecs: EpicChildSpec[];
	epicCompleted: boolean;
	currentEpicCleared: boolean;
};

export class EpicStateError extends Error {
	filePath: string;

	constructor(message: string, filePath: string) {
		super(message);
		this.name = "EpicStateError";
		this.filePath = filePath;
	}
}

export function getEpicStatePath(reference: EpicStateReference, options: RalphPathOptions = {}): string {
	return resolveEpicReference(reference, options).statePath;
}

export function getEpicProgressPath(reference: EpicStateReference, options: RalphPathOptions = {}): string {
	return resolveEpicReference(reference, options).progressPath;
}

export function listEpics(options: RalphPathOptions = {}): CurrentEpic[] {
	const root = getDefaultSpecRoot(options);
	const epicsRoot = join(root.absolutePath, "_epics");
	if (!existsSync(epicsRoot)) {
		return [];
	}

	return readdirSync(epicsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) => resolveEpic(entry.name, options))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function readCurrentEpic(options: RalphPathOptions = {}): SafeEpicStateRead & { epic: CurrentEpic } | null {
	const epic = resolveCurrentEpic(options);
	if (!epic) {
		return null;
	}

	return { epic, ...safeReadEpicState(epic, options) };
}

export function readEpicState(reference: EpicStateReference, options: RalphPathOptions = {}): EpicState | null {
	const statePath = getEpicStatePath(reference, options);
	if (!existsSync(statePath)) {
		return null;
	}

	const content = readFileSync(statePath, "utf8");
	if (!content.trim()) {
		throw new EpicStateError(`Epic state file is empty: ${statePath}`, statePath);
	}

	try {
		const parsed = JSON.parse(content) as unknown;
		if (!isPlainObject(parsed)) {
			throw new Error("epic state JSON must be an object");
		}
		return parsed as EpicState;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new EpicStateError(`Invalid epic state JSON at ${statePath}: ${detail}`, statePath);
	}
}

export function safeReadEpicState(reference: EpicStateReference, options: RalphPathOptions = {}): SafeEpicStateRead {
	const path = getEpicStatePath(reference, options);
	try {
		const state = readEpicState(reference, options);
		const warnings = state ? validateEpicState(state).warnings : [];
		return { path, state, warnings };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { path, state: null, warnings: [message] };
	}
}

export function writeEpicState(
	reference: EpicStateReference,
	state: EpicState,
	options: RalphPathOptions = {},
): string {
	const statePath = getEpicStatePath(reference, options);
	atomicWriteText(statePath, `${JSON.stringify(state, null, 2)}\n`);
	return statePath;
}

export function mergeEpicState(
	reference: EpicStateReference,
	patch: EpicStatePatch,
	options: RalphPathOptions = {},
): EpicState {
	const existing = readEpicState(reference, options) ?? {};
	const merged = deepMerge(existing, patch) as EpicState;
	writeEpicState(reference, merged, options);
	return merged;
}

export function readEpicProgress(reference: EpicStateReference, options: RalphPathOptions = {}): string {
	const progressPath = getEpicProgressPath(reference, options);
	return existsSync(progressPath) ? readFileSync(progressPath, "utf8") : "";
}

export function writeEpicProgress(
	reference: EpicStateReference,
	content: string,
	options: RalphPathOptions = {},
): string {
	const progressPath = getEpicProgressPath(reference, options);
	atomicWriteText(progressPath, ensureTrailingNewline(content));
	return progressPath;
}

export function appendEpicProgress(
	reference: EpicStateReference,
	content: string,
	options: RalphPathOptions = {},
): string {
	const progress = readEpicProgress(reference, options);
	const separator = progress && !progress.endsWith("\n") ? "\n" : "";
	return writeEpicProgress(reference, `${progress}${separator}${ensureTrailingNewline(content)}`, options);
}

export function validateEpicState(state: EpicState): EpicValidationResult {
	const warnings: string[] = [];
	const missingDependencies: MissingEpicDependency[] = [];
	const duplicateOrders: EpicOrderCollision[] = [];
	const specs = getEpicSpecs(state);

	if (typeof state.name !== "string" || !state.name.trim()) {
		warnings.push("Epic state is missing required field 'name'.");
	} else if (!isKebabCase(state.name)) {
		warnings.push(`Epic name '${state.name}' should be kebab-case.`);
	}

	if (!Array.isArray(state.specs)) {
		warnings.push("Epic state field 'specs' must be an array.");
	}

	const specNames = new Map<string, EpicChildSpec>();
	const duplicateNames = new Set<string>();
	const orders = new Map<number, string[]>();
	for (const spec of specs) {
		if (typeof spec.name !== "string" || !spec.name.trim()) {
			warnings.push("Epic child spec is missing required field 'name'.");
			continue;
		}

		if (!isKebabCase(spec.name)) {
			warnings.push(`Epic child spec name '${spec.name}' should be kebab-case.`);
		}
		if (specNames.has(spec.name)) {
			duplicateNames.add(spec.name);
		}
		specNames.set(spec.name, spec);

		const order = specOrder(spec);
		if (Number.isFinite(order)) {
			orders.set(order, [...(orders.get(order) ?? []), spec.name]);
		}
	}

	for (const name of [...duplicateNames].sort()) {
		warnings.push(`Duplicate epic child spec name '${name}'.`);
	}

	for (const [order, names] of orders.entries()) {
		if (names.length > 1) {
			const sortedNames = names.sort((a, b) => a.localeCompare(b));
			duplicateOrders.push({ order, specNames: sortedNames });
			warnings.push(`Epic child spec order ${order} is duplicated by: ${sortedNames.join(", ")}.`);
		}
	}

	for (const spec of specs) {
		if (typeof spec.name !== "string" || !spec.name.trim()) {
			continue;
		}

		for (const dependency of specDependencies(spec)) {
			if (dependency === spec.name) {
				warnings.push(`Epic child spec '${spec.name}' cannot depend on itself.`);
				continue;
			}
			if (!specNames.has(dependency)) {
				missingDependencies.push({ specName: spec.name, dependency });
				warnings.push(`Epic child spec '${spec.name}' depends on missing spec '${dependency}'.`);
			}
		}
	}

	const cycles = findDependencyCycles(specs);
	for (const cycle of cycles) {
		warnings.push(`Epic dependency cycle detected: ${cycle.join(" -> ")}.`);
	}

	return {
		valid: warnings.length === 0,
		warnings,
		missingDependencies,
		cycles,
		duplicateOrders,
	};
}

export function computeEpicDependencyStatus(state: EpicState): EpicDependencySummary {
	const validation = validateEpicState(state);
	const specs = getEpicSpecs(state).sort(compareEpicChildren);
	const specByName = new Map(specs.map((spec) => [spec.name, spec]));
	const statuses = specs.map((spec) => {
		const dependencies = specDependencies(spec);
		const completedDependencies: string[] = [];
		const unmetDependencies: string[] = [];
		const missingDependencies: string[] = [];

		for (const dependency of dependencies) {
			const dependencySpec = specByName.get(dependency);
			if (!dependencySpec) {
				missingDependencies.push(dependency);
				continue;
			}
			if (normalizeChildSpecStatus(dependencySpec.status) === "completed") {
				completedDependencies.push(dependency);
			} else {
				unmetDependencies.push(dependency);
			}
		}

		const status = normalizeChildSpecStatus(spec.status);
		const isExplicitlyBlocked = status === "blocked";
		const isDependencyBlocked = status === "pending" && (missingDependencies.length > 0 || unmetDependencies.length > 0);
		const isReady = status === "pending" && missingDependencies.length === 0 && unmetDependencies.length === 0;

		return {
			spec,
			name: spec.name,
			status,
			order: specOrder(spec),
			dependencies,
			completedDependencies,
			unmetDependencies,
			missingDependencies,
			isReady,
			isExplicitlyBlocked,
			isDependencyBlocked,
		};
	});

	const readyStatuses = statuses.filter((status) => status.isReady).sort(compareEpicDependencyStatuses);

	return {
		validation,
		specs: statuses,
		readySpecs: readyStatuses.map((status) => status.spec),
		nextSpec: readyStatuses[0]?.spec ?? null,
		completedSpecs: statuses.filter((status) => status.status === "completed").map((status) => status.spec),
		inProgressSpecs: statuses.filter((status) => status.status === "in_progress").map((status) => status.spec),
		explicitlyBlockedSpecs: statuses.filter((status) => status.isExplicitlyBlocked).map((status) => status.spec),
		dependencyBlockedSpecs: statuses.filter((status) => status.isDependencyBlocked).map((status) => status.spec),
		cancelledSpecs: statuses.filter((status) => status.status === "cancelled").map((status) => status.spec),
	};
}

export function getReadyEpicSpecs(state: EpicState): EpicChildSpec[] {
	return computeEpicDependencyStatus(state).readySpecs;
}

export function getNextUnblockedSpec(state: EpicState): EpicChildSpec | null {
	return computeEpicDependencyStatus(state).nextSpec;
}

export const nextUnblockedSpec = getNextUnblockedSpec;
export const selectNextUnblockedSpec = getNextUnblockedSpec;

export function deriveEpicStatus(state: EpicState): EpicStatus {
	const currentStatus = normalizeEpicStatus(state.status);
	if (currentStatus === "cancelled") {
		return "cancelled";
	}

	const summary = computeEpicDependencyStatus(state);
	const activeSpecs = summary.specs.filter((entry) => entry.status !== "cancelled");
	if (activeSpecs.length > 0 && activeSpecs.every((entry) => entry.status === "completed")) {
		return "completed";
	}
	if (summary.inProgressSpecs.length > 0) {
		return "in_progress";
	}
	if (summary.completedSpecs.length > 0) {
		return "in_progress";
	}
	if (summary.readySpecs.length > 0) {
		return currentStatus === "draft" ? "draft" : "ready";
	}
	if (summary.explicitlyBlockedSpecs.length > 0 || summary.dependencyBlockedSpecs.length > 0 || summary.validation.warnings.length > 0) {
		return "blocked";
	}
	return currentStatus;
}

export function updateEpicChildSpecStatus(
	reference: EpicStateReference,
	specName: string,
	status: EpicChildSpecStatus,
	options: EpicChildStatusUpdateOptions = {},
): EpicState {
	if (!CHILD_SPEC_STATUSES.has(status)) {
		throw new EpicStateError(`Invalid epic child spec status: ${status}`, getEpicStatePath(reference, options));
	}

	const state = requireEpicState(reference, options);
	const now = timestamp(options.now);
	let updatedSpec: EpicChildSpec | null = null;
	const currentSpecs = Array.isArray(state.specs) ? state.specs : [];
	const specs = currentSpecs.map((spec) => {
		if (!isPlainObject(spec) || spec.name !== specName) {
			return spec;
		}

		let nextSpec = { ...spec, status, updatedAt: now } as EpicChildSpec;
		if (status === "in_progress") {
			nextSpec.startedAt = typeof nextSpec.startedAt === "string" ? nextSpec.startedAt : now;
			nextSpec.completedAt = null;
			nextSpec.blockedReason = null;
		} else if (status === "completed") {
			nextSpec.completedAt = now;
			nextSpec.blockedReason = null;
		} else if (status === "blocked") {
			nextSpec.blockedReason = options.blockedReason ?? nextSpec.blockedReason ?? "Blocked";
		} else if (status === "pending") {
			nextSpec.blockedReason = null;
			nextSpec.completedAt = null;
		} else if (status === "cancelled") {
			nextSpec.blockedReason = options.blockedReason ?? nextSpec.blockedReason ?? null;
		}

		if (options.patch) {
			nextSpec = deepMerge(nextSpec, options.patch) as EpicChildSpec;
			nextSpec.status = status;
		}
		updatedSpec = nextSpec;
		return nextSpec;
	});

	if (!updatedSpec) {
		throw new EpicStateError(`Epic child spec '${specName}' was not found in epic '${state.name}'.`, getEpicStatePath(reference, options));
	}

	const nextState: EpicState = {
		...state,
		specs,
		updatedAt: now,
	};

	if (status === "in_progress") {
		nextState.activeSpec = specName;
	} else if (nextState.activeSpec === specName) {
		nextState.activeSpec = null;
	}
	if (status === "completed") {
		nextState.lastCompletedSpec = specName;
	}

	nextState.status = options.epicStatus ?? deriveEpicStatus(nextState);
	if (nextState.status === "completed") {
		nextState.phase = "completed";
	}

	writeEpicState(reference, nextState, options);
	return nextState;
}

export const setEpicChildSpecStatus = updateEpicChildSpecStatus;

export function startEpicChildSpec(
	reference: EpicStateReference,
	specName: string,
	options: EpicChildStatusUpdateOptions = {},
): EpicState {
	return updateEpicChildSpecStatus(reference, specName, "in_progress", options);
}

export function completeEpicChildSpec(
	reference: EpicStateReference,
	specName: string,
	options: CompleteEpicChildSpecOptions = {},
): CompleteEpicChildSpecResult {
	const beforeState = requireEpicState(reference, options);
	const beforeReadyNames = new Set(getReadyEpicSpecs(beforeState).map((spec) => spec.name));
	const state = updateEpicChildSpecStatus(reference, specName, "completed", options);
	const completedSpec = getEpicSpecs(state).find((spec) => spec.name === specName);
	if (!completedSpec) {
		throw new EpicStateError(`Epic child spec '${specName}' disappeared after completion update.`, getEpicStatePath(reference, options));
	}

	const newlyReadySpecs = getReadyEpicSpecs(state).filter((spec) => !beforeReadyNames.has(spec.name));
	const epicCompleted = normalizeEpicStatus(state.status) === "completed";
	let currentEpicCleared = false;

	if (options.appendProgress !== false) {
		appendEpicProgress(state.name, formatCompletionProgressEntry(state.name, specName, newlyReadySpecs, epicCompleted, timestamp(options.now)), options);
	}

	if (epicCompleted && options.clearCurrentEpicOnComplete !== false && readCurrentEpicName(options) === state.name) {
		currentEpicCleared = clearCurrentEpic(options);
	}

	return {
		state,
		completedSpec,
		newlyReadySpecs,
		epicCompleted,
		currentEpicCleared,
	};
}

function resolveEpicReference(reference: EpicStateReference, options: RalphPathOptions): CurrentEpic {
	return typeof reference === "string" ? resolveEpic(reference, options) : reference;
}

function requireEpicState(reference: EpicStateReference, options: RalphPathOptions): EpicState {
	const state = readEpicState(reference, options);
	if (!state) {
		throw new EpicStateError(`Missing epic state at ${getEpicStatePath(reference, options)}`, getEpicStatePath(reference, options));
	}
	return state;
}

function getEpicSpecs(state: EpicState): EpicChildSpec[] {
	if (!Array.isArray(state.specs)) {
		return [];
	}
	return state.specs.filter((spec): spec is EpicChildSpec => isPlainObject(spec) && typeof spec.name === "string");
}

function normalizeEpicStatus(status: unknown): EpicStatus {
	return typeof status === "string" && EPIC_STATUSES.has(status) ? status : "draft";
}

function normalizeChildSpecStatus(status: unknown): EpicChildSpecStatus {
	return typeof status === "string" && CHILD_SPEC_STATUSES.has(status) ? status : "pending";
}

function specDependencies(spec: EpicChildSpec): string[] {
	if (!Array.isArray(spec.dependencies)) {
		return [];
	}
	return [...new Set(spec.dependencies.filter((dependency): dependency is string => typeof dependency === "string" && dependency.trim()).map((dependency) => dependency.trim()))];
}

function specOrder(spec: EpicChildSpec): number {
	return typeof spec.order === "number" && Number.isFinite(spec.order) ? spec.order : Number.MAX_SAFE_INTEGER;
}

function compareEpicChildren(a: EpicChildSpec, b: EpicChildSpec): number {
	return specOrder(a) - specOrder(b) || a.name.localeCompare(b.name);
}

function compareEpicDependencyStatuses(a: EpicSpecDependencyStatus, b: EpicSpecDependencyStatus): number {
	return a.order - b.order || a.name.localeCompare(b.name);
}

function findDependencyCycles(specs: EpicChildSpec[]): string[][] {
	const specNames = new Set(specs.map((spec) => spec.name));
	const dependenciesByName = new Map(specs.map((spec) => [spec.name, specDependencies(spec).filter((dependency) => specNames.has(dependency))]));
	const visited = new Set<string>();
	const stack: string[] = [];
	const cycles: string[][] = [];
	const cycleKeys = new Set<string>();

	function visit(name: string): void {
		const stackIndex = stack.indexOf(name);
		if (stackIndex >= 0) {
			const cycle = [...stack.slice(stackIndex), name];
			const key = canonicalCycleKey(cycle);
			if (!cycleKeys.has(key)) {
				cycleKeys.add(key);
				cycles.push(cycle);
			}
			return;
		}
		if (visited.has(name)) {
			return;
		}

		visited.add(name);
		stack.push(name);
		for (const dependency of dependenciesByName.get(name) ?? []) {
			visit(dependency);
		}
		stack.pop();
	}

	for (const spec of specs.sort(compareEpicChildren)) {
		visit(spec.name);
	}
	return cycles;
}

function canonicalCycleKey(cycle: string[]): string {
	const uniqueCycle = cycle.slice(0, -1);
	if (uniqueCycle.length === 0) {
		return cycle.join("->");
	}

	const rotations = uniqueCycle.map((_, index) => [...uniqueCycle.slice(index), ...uniqueCycle.slice(0, index)].join("->"));
	return rotations.sort()[0];
}

function formatCompletionProgressEntry(
	epicName: string,
	specName: string,
	newlyReadySpecs: EpicChildSpec[],
	epicCompleted: boolean,
	now: string,
): string {
	const lines = [`## ${now}`, `- Completed child spec '${specName}' for epic '${epicName}'.`];
	if (newlyReadySpecs.length > 0) {
		lines.push(`- Newly ready spec(s): ${newlyReadySpecs.map((spec) => spec.name).join(", ")}.`);
	}
	if (epicCompleted) {
		lines.push("- Epic status: completed.");
	}
	return lines.join("\n");
}

function atomicWriteText(filePath: string, content: string): void {
	mkdirSync(dirname(filePath), { recursive: true });
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tempPath, content, "utf8");
	renameSync(tempPath, filePath);
}

function ensureTrailingNewline(content: string): string {
	return content.endsWith("\n") ? content : `${content}\n`;
}

function deepMerge(base: unknown, patch: unknown): unknown {
	if (!isPlainObject(base) || !isPlainObject(patch)) {
		return patch;
	}

	const merged: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) {
			continue;
		}
		merged[key] = isPlainObject(value) && isPlainObject(merged[key]) ? deepMerge(merged[key], value) : value;
	}
	return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKebabCase(value: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function timestamp(value?: string | Date): string {
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === "string" && value.trim()) {
		return value;
	}
	return new Date().toISOString();
}

const EPIC_STATUSES = new Set<string>(["draft", "ready", "in_progress", "completed", "cancelled", "blocked"]);
const CHILD_SPEC_STATUSES = new Set<string>(["pending", "in_progress", "completed", "cancelled", "blocked"]);
