import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findSpec, requireCurrentSpec, type RalphPathOptions, type SpecEntry } from "./paths.ts";

export const REFACTOR_ALLOWED_FILES = Object.freeze(["requirements", "design", "tasks"]);
export const REFACTOR_USAGE = "/ralph-refactor [spec] [--file=requirements|design|tasks]";
export const REFACTOR_COMMAND_DESCRIPTION = "Update an existing spec artifact; supports [spec] [--file=requirements|design|tasks]";

export type RefactorArtifact = (typeof REFACTOR_ALLOWED_FILES)[number];

export type ResolveRefactorSpecPlanOptions = RalphPathOptions & {
	reference?: string | null;
};

export type RefactorArtifactInventory = {
	availableFiles: RefactorArtifact[];
	artifactPaths: Record<RefactorArtifact, string>;
};

export type RefactorSpecPlan = {
	spec: SpecEntry;
} & RefactorArtifactInventory;

export type RefactorSelectionPlan = {
	selectedFile: RefactorArtifact | null;
	requiresFileChoice: boolean;
	availableSections: string[];
	requiresSectionChoice: boolean;
};

function emptyRefactorOptions() {
	return {
		reference: null,
		file: null,
	};
}

export function parseRefactorArgs(args = []) {
	const options = emptyRefactorOptions();

	for (let index = 0; index < args.length; index += 1) {
		const token = args[index];
		if (typeof token !== "string" || token.trim() === "") continue;

		if (token.startsWith("--file")) {
			const valueResult = readFileOptionValue(args, index, token);
			if (!valueResult.ok) return failParse(options, valueResult.error);
			if (!REFACTOR_ALLOWED_FILES.includes(valueResult.value)) {
				return failParse(options, `Unsupported --file value: ${valueResult.value}. Expected one of: ${REFACTOR_ALLOWED_FILES.join(", ")}.`);
			}
			options.file = valueResult.value;
			index = valueResult.index;
			continue;
		}

		if (token.startsWith("--")) {
			return failParse(options, `Unsupported /ralph-refactor option: ${token}`);
		}

		if (options.reference) {
			return failParse(options, `Unexpected /ralph-refactor argument: ${token}`);
		}

		options.reference = token;
	}

	return okParse(options);
}

export function formatRefactorUsage() {
	return `Usage: ${REFACTOR_USAGE}`;
}

export function formatRefactorParseError(error) {
	const message = error instanceof Error ? error.message : String(error ?? "Unknown /ralph-refactor parse error");
	return `${message}\n${formatRefactorUsage()}`;
}

export function formatPendingRefactorMessage(options, plan) {
	const target = options?.reference ? ` for ${options.reference}` : "";
	const scope = options?.file ? ` with --file=${options.file}` : "";
	if (!plan) {
		return `Ralph refactor command registered${target}${scope}. Artifact update flow is not implemented yet.`;
	}
	return `Ralph refactor command registered${target}${scope}. Resolved spec '${plan.spec.name}' with refactorable artifacts: ${formatRefactorArtifactList(plan.availableFiles)}. Artifact update flow is not implemented yet.`;
}

export function formatRefactorResolutionError(error) {
	return error instanceof Error ? error.message : String(error ?? "Unknown /ralph-refactor resolution error");
}

export function resolveRefactorSpecPlan(options = {}) {
	const spec = options.reference ? findSpec(options.reference, options) : requireCurrentSpec(options);
	const inventory = inventoryRefactorArtifacts(spec.absolutePath);
	if (inventory.availableFiles.length === 0) {
		throw buildNoRefactorableArtifactsError(spec);
	}
	return {
		spec,
		...inventory,
	};
}

export function inventoryRefactorArtifacts(specPath): RefactorArtifactInventory {
	const artifactPaths = getRefactorArtifactPaths(specPath);
	const availableFiles = REFACTOR_ALLOWED_FILES.filter((artifact) => existsSync(artifactPaths[artifact]));
	return {
		availableFiles,
		artifactPaths,
	};
}

export function formatRefactorArtifactList(artifacts) {
	return artifacts.join(", ");
}

export function buildRefactorSelectionPlan(plan: RefactorSpecPlan, requestedFile: RefactorArtifact | null = null): RefactorSelectionPlan {
	const selectedFile = selectRequestedArtifact(plan, requestedFile);
	const availableSections = selectedFile ? listRefactorSections(plan.artifactPaths[selectedFile]) : [];
	return {
		selectedFile,
		requiresFileChoice: selectedFile === null,
		availableSections,
		requiresSectionChoice: availableSections.length > 0,
	};
}

export function listRefactorSections(artifactPath: string): string[] {
	if (!artifactPath || !existsSync(artifactPath)) return [];
	const content = readFileSync(artifactPath, "utf8");
	const sections = content
		.split(/\r?\n/)
		.map((line) => line.match(/^##+\s+(.+?)\s*$/)?.[1]?.trim() ?? null)
		.filter((value): value is string => Boolean(value));
	return sections;
}

export function formatRefactorHeadlessDecisionError(plan: RefactorSpecPlan, selection: RefactorSelectionPlan) {
	const fileHint = selection.requiresFileChoice ? `choose a file (${formatRefactorArtifactList(plan.availableFiles)})` : `choose section(s) for ${selection.selectedFile}`;
	return `Headless /ralph-refactor run needs user decisions to ${fileHint}. Re-run with interactive UI${selection.requiresFileChoice ? " or pass --file=<requirements|design|tasks>" : ""} so Ralph can collect the required selection safely.`;
}

function selectRequestedArtifact(plan: RefactorSpecPlan, requestedFile: RefactorArtifact | null): RefactorArtifact | null {
	if (!requestedFile) return null;
	return plan.availableFiles.includes(requestedFile) ? requestedFile : null;
}

function buildNoRefactorableArtifactsError(spec: SpecEntry) {
	return new Error(
		`Spec '${spec.name}' has no refactorable artifacts. Expected one or more of requirements.md, design.md, or tasks.md in ${spec.path}.`,
	);
}

function getRefactorArtifactPaths(specPath) {
	return {
		requirements: join(specPath, "requirements.md"),
		design: join(specPath, "design.md"),
		tasks: join(specPath, "tasks.md"),
	};
}

function readFileOptionValue(args, index, token) {
	if (token === "--file") {
		const value = args[index + 1];
		if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
			return {
				ok: false,
				error: `Missing value for --file. Expected one of: ${REFACTOR_ALLOWED_FILES.join(", ")}.`,
			};
		}
		return { ok: true, value: value.trim(), index: index + 1 };
	}

	if (!token.startsWith("--file=")) {
		return { ok: false, error: `Unsupported /ralph-refactor option: ${token}` };
	}

	const value = token.slice("--file=".length).trim();
	if (!value) {
		return {
			ok: false,
			error: `Missing value for --file. Expected one of: ${REFACTOR_ALLOWED_FILES.join(", ")}.`,
		};
	}

	return { ok: true, value, index };
}

function okParse(options) {
	return { ok: true, options };
}

function failParse(options, message) {
	return {
		ok: false,
		options: { ...options },
		error: new Error(message),
	};
}
