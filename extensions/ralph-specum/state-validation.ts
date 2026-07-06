import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type RalphStateValidationIssue = {
	path: string;
	message: string;
	repair: string;
};

export type RalphStateValidationResult = {
	ok: boolean;
	issues: RalphStateValidationIssue[];
};

export type RalphStateValidationOptions = {
	requireCoreFields?: boolean;
};

const VALID_PHASES = new Set(["research", "requirements", "design", "tasks", "execution"]);
const INTEGER_FIELDS = ["taskIndex", "totalTasks", "taskIteration", "maxTaskIterations", "globalIteration", "maxGlobalIterations"];
const BOOLEAN_FIELDS = ["awaitingApproval", "recoveryMode", "quickMode", "autonomousMode", "nativeSyncEnabled"];

export function getSpecSchemaPath(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "schemas", "spec.schema.json");
}

export function readSpecSchema(): unknown {
	return JSON.parse(readFileSync(getSpecSchemaPath(), "utf8")) as unknown;
}

export function validateRalphStateShape(
	state: unknown,
	options: RalphStateValidationOptions = {},
): RalphStateValidationResult {
	const issues: RalphStateValidationIssue[] = [];
	if (!isRecord(state)) {
		return {
			ok: false,
			issues: [{ path: "$", message: "Ralph state must be a JSON object.", repair: "Regenerate the state with /ralph-start or /ralph-tasks." }],
		};
	}

	if (options.requireCoreFields) {
		for (const field of ["source", "name", "basePath", "phase"]) {
			if (!(field in state)) {
				issues.push({ path: `$.${field}`, message: `Missing required field '${field}'.`, repair: "Run /ralph-status --diagnostics, then resume or regenerate the spec state." });
			}
		}
	}

	if ("phase" in state && (typeof state.phase !== "string" || !VALID_PHASES.has(state.phase))) {
		issues.push({ path: "$.phase", message: `Invalid phase '${String(state.phase)}'.`, repair: "Set phase to research, requirements, design, tasks, or execution; or rerun the appropriate /ralph-* phase command." });
	}

	for (const field of INTEGER_FIELDS) {
		const value = state[field];
		if (value !== undefined && (!Number.isInteger(value) || Number(value) < 0)) {
			issues.push({ path: `$.${field}`, message: `${field} must be a non-negative integer.`, repair: "Remove the invalid field or rerun the command that owns this state transition." });
		}
	}

	for (const field of BOOLEAN_FIELDS) {
		const value = state[field];
		if (value !== undefined && typeof value !== "boolean") {
			issues.push({ path: `$.${field}`, message: `${field} must be boolean when present.`, repair: "Remove the invalid field or set it to true/false." });
		}
	}

	for (const field of ["nativeTaskMap", "verifiedTaskEvidence", "verificationRecovery", "fixTaskMap", "modificationMap"]) {
		const value = state[field];
		if (value !== undefined && !isRecord(value)) {
			issues.push({ path: `$.${field}`, message: `${field} must be an object when present.`, repair: "Rerun /ralph-tasks or /ralph-implement to rebuild coordinator-owned maps." });
		}
	}

	return { ok: issues.length === 0, issues };
}

export function formatRalphStateValidationIssues(issues: RalphStateValidationIssue[]): string {
	if (issues.length === 0) return "Ralph state is valid.";
	return [
		"Invalid Ralph state:",
		...issues.map((issue) => `- ${issue.path}: ${issue.message} Repair: ${issue.repair}`),
	].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
