import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveSpecReference, type RalphPathOptions, type SpecEntry } from "./paths.ts";
import { formatRalphStateValidationIssues, validateRalphStateShape } from "./state-validation.ts";

export type RalphState = Record<string, unknown> & {
	phase?: string;
	taskIndex?: number;
	totalTasks?: number;
	taskIteration?: number;
	maxTaskIterations?: number;
	awaitingApproval?: boolean;
};

export type RalphStatePatch = Record<string, unknown>;
export type SpecStateReference = string | SpecEntry;

export class RalphStateError extends Error {
	filePath: string;

	constructor(message: string, filePath: string) {
		super(message);
		this.name = "RalphStateError";
		this.filePath = filePath;
	}
}

export function getRalphStatePath(spec: SpecStateReference, options: RalphPathOptions = {}): string {
	return join(resolveSpec(spec, options).absolutePath, ".ralph-state.json");
}

export function getProgressPath(spec: SpecStateReference, options: RalphPathOptions = {}): string {
	return join(resolveSpec(spec, options).absolutePath, ".progress.md");
}

export function readRalphState(spec: SpecStateReference, options: RalphPathOptions = {}): RalphState | null {
	const statePath = getRalphStatePath(spec, options);
	if (!existsSync(statePath)) {
		return null;
	}

	const content = readFileSync(statePath, "utf8");
	if (!content.trim()) {
		throw new RalphStateError(`State file is empty: ${statePath}`, statePath);
	}

	try {
		const parsed = JSON.parse(content) as unknown;
		if (!isPlainObject(parsed)) {
			throw new Error("state JSON must be an object");
		}
		const validation = validateRalphStateShape(parsed);
		if (!validation.ok) {
			throw new Error(formatRalphStateValidationIssues(validation.issues));
		}
		return parsed as RalphState;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new RalphStateError(`Invalid Ralph state JSON at ${statePath}: ${detail}`, statePath);
	}
}

export function mergeRalphState(
	spec: SpecStateReference,
	patch: RalphStatePatch,
	options: RalphPathOptions = {},
): RalphState {
	const existing = readRalphState(spec, options) ?? {};
	const merged = deepMerge(existing, patch) as RalphState;
	const statePath = getRalphStatePath(spec, options);
	atomicWriteText(statePath, `${JSON.stringify(merged, null, 2)}\n`);
	return merged;
}

export function readProgress(spec: SpecStateReference, options: RalphPathOptions = {}): string {
	const progressPath = getProgressPath(spec, options);
	return existsSync(progressPath) ? readFileSync(progressPath, "utf8") : "";
}

export function writeProgress(
	spec: SpecStateReference,
	content: string,
	options: RalphPathOptions = {},
): string {
	const progressPath = getProgressPath(spec, options);
	atomicWriteText(progressPath, ensureTrailingNewline(content));
	return progressPath;
}

export function appendProgress(
	spec: SpecStateReference,
	content: string,
	options: RalphPathOptions = {},
): string {
	const progress = readProgress(spec, options);
	const separator = progress && !progress.endsWith("\n") ? "\n" : "";
	return writeProgress(spec, `${progress}${separator}${ensureTrailingNewline(content)}`, options);
}

function resolveSpec(spec: SpecStateReference, options: RalphPathOptions): SpecEntry {
	return typeof spec === "string" ? resolveSpecReference(spec, options) : spec;
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
