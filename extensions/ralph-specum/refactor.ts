import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { findSpec, requireCurrentSpec, type RalphPathOptions, type SpecEntry } from "./paths.ts";
import { getProgressPath, getRalphStatePath, readProgress } from "./state.ts";

export const REFACTOR_ALLOWED_FILES = Object.freeze(["requirements", "design", "tasks"]);
export const REFACTOR_USAGE = "/ralph-refactor [spec] [--file=requirements|design|tasks]";
export const REFACTOR_COMMAND_DESCRIPTION = "Update an existing spec artifact; supports [spec] [--file=requirements|design|tasks]";

// Keep these literal marker names stable. The verifier and future coordinator-side
// completion parsing rely on exact labels rather than free-form summaries.
export const REFACTOR_COMPLETION_MARKERS = Object.freeze([
	"REFACTOR_COMPLETE",
	"CASCADE_NEEDED",
	"CASCADE_REASON",
	"EVIDENCE",
]);

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

export type RefactorPromptPlan = {
	title: string;
	options: string[];
};

export type RefactorSelectedSectionPlan = {
	selectedFile: RefactorArtifact;
	availableSections: string[];
	selectedSections: string[];
};

export type RefactorSelectedFilePlan = {
	selectedFile: RefactorArtifact | null;
	artifactPath: string | null;
	requiresFileChoice: boolean;
	availableSections: string[];
	requiresSectionChoice: boolean;
	progressLearnings: string[];
};

export type RefactorCascadePolicy = "detect-only" | "approved" | "skipped";
export type RefactorCascadeDecision = "approved" | "rejected";

export type RefactorRequestFile = {
	kind: RefactorArtifact;
	path: string;
};

export type RefactorRequestV1 = {
	spec: {
		name: string;
		basePath: string;
		statePath: string;
		progressPath: string;
	};
	files: RefactorRequestFile[];
	sections: string[];
	progressLearnings: string[];
	cascadePolicy: RefactorCascadePolicy;
	allowedFiles: string[];
};

export type RefactorCompletionParseResult = {
	ok: boolean;
	cascadeNeeded?: string;
	cascadeReason?: string;
	evidence?: string;
	error?: string;
};

export type RefactorSpecSnapshot = {
	specPath: string;
	files: Map<string, Buffer>;
};

export type RefactorSpecDiff = {
	currentFiles: Map<string, Buffer>;
	changedFiles: string[];
};

export type RefactorAuditResult = {
	changedFiles: string[];
	unauthorizedFiles: string[];
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
	const selectedFilePlan = buildRefactorSelectedFilePlan(plan, requestedFile);
	return {
		selectedFile: selectedFilePlan.selectedFile,
		requiresFileChoice: selectedFilePlan.requiresFileChoice,
		availableSections: [...selectedFilePlan.availableSections],
		requiresSectionChoice: selectedFilePlan.requiresSectionChoice,
	};
}

export function buildRefactorSelectedFilePlan(plan: RefactorSpecPlan, requestedFile: RefactorArtifact | null = null): RefactorSelectedFilePlan {
	const selectedFile = selectRequestedArtifact(plan, requestedFile);
	const availableSections = selectedFile ? listRefactorSections(plan.artifactPaths[selectedFile]) : [];
	const progressLearnings = extractProgressLearnings(readProgress(plan.spec));
	return {
		selectedFile,
		artifactPath: selectedFile ? plan.artifactPaths[selectedFile] : null,
		requiresFileChoice: selectedFile === null,
		availableSections,
		requiresSectionChoice: availableSections.length > 0,
		progressLearnings,
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

export function buildRefactorFilePromptPlan(plan: RefactorSpecPlan): RefactorPromptPlan {
	return {
		title: "Choose refactor artifact file",
		options: plan.availableFiles.map((artifact) => `${artifact} (${plan.spec.path}/${artifact}.md)`),
	};
}

export function parseRefactorFilePromptSelection(selectedLabel: string | null): RefactorArtifact | null {
	if (typeof selectedLabel !== "string") return null;
	const selectedFile = selectedLabel.split(" ")[0]?.trim();
	return REFACTOR_ALLOWED_FILES.includes(selectedFile as RefactorArtifact) ? (selectedFile as RefactorArtifact) : null;
}

export function buildRefactorSectionPromptPlan(selection: Pick<RefactorSelectedFilePlan, "selectedFile" | "availableSections">): RefactorPromptPlan | null {
	if (!selection.selectedFile) return null;
	return {
		title: `Choose refactor section for ${selection.selectedFile}`,
		options: [...selection.availableSections],
	};
}

export function buildRefactorSelectedSectionPlan(
	selection: Pick<RefactorSelectedFilePlan, "selectedFile" | "availableSections">,
	selectedSection: string | null,
): RefactorSelectedSectionPlan | null {
	if (!selection.selectedFile) return null;
	const selectedSections = typeof selectedSection === "string" && selectedSection.trim() !== ""
		? [selectedSection]
		: [];
	return {
		selectedFile: selection.selectedFile,
		availableSections: [...selection.availableSections],
		selectedSections,
	};
}

export function buildRefactorRequest(
	plan: RefactorSpecPlan,
	selectedFilePlan: RefactorSelectedFilePlan,
	selectedSectionPlan: RefactorSelectedSectionPlan | null,
	options: RalphPathOptions = {},
): RefactorRequestV1 {
	const selection = requireRefactorSelectedArtifact(selectedFilePlan);

	return {
		spec: {
			name: plan.spec.name,
			basePath: plan.spec.absolutePath,
			statePath: getRalphStatePath(plan.spec, options),
			progressPath: getProgressPath(plan.spec, options),
		},
		files: buildRefactorRequestFiles(selection),
		sections: selectedSectionPlan?.selectedSections ? [...selectedSectionPlan.selectedSections] : [],
		progressLearnings: [...selectedFilePlan.progressLearnings],
		cascadePolicy: "detect-only",
		allowedFiles: buildRefactorAllowedFiles(selection),
	};
}

export function buildRefactorRequestFiles(selection: { selectedFile: RefactorArtifact; artifactPath: string }): RefactorRequestFile[] {
	return [
		{
			kind: selection.selectedFile,
			path: selection.artifactPath,
		},
	];
}

export function buildRefactorAllowedFiles(selection: { artifactPath: string }): string[] {
	return [selection.artifactPath];
}

export function buildRefactorSpecialistPrompt(request: RefactorRequestV1): string {
	return [
		"Apply one bounded Smart Ralph refactor step using this request payload.",
		JSON.stringify(request, null, 2),
	].join("\n\n");
}

export function resolveRefactorCascadeTargets(
	sourceFile: RefactorArtifact,
	cascadeNeeded: string | undefined,
	availableFiles: RefactorArtifact[],
): RefactorArtifact[] {
	const downstreamTargets = new Set(downstreamRefactorArtifacts(sourceFile));
	if (downstreamTargets.size === 0) return [];
	const available = new Set(availableFiles);
	return tokenizeCascadeNeeded(cascadeNeeded).filter((artifact): artifact is RefactorArtifact => {
		return REFACTOR_ALLOWED_FILES.includes(artifact as RefactorArtifact)
			&& downstreamTargets.has(artifact as RefactorArtifact)
			&& available.has(artifact as RefactorArtifact);
	}) as RefactorArtifact[];
}

export function buildRefactorCascadePrompt(
	sourceFile: RefactorArtifact,
	targetFile: RefactorArtifact,
	reason: string,
): { title: string; message: string } {
	return {
		title: `Approve downstream ${targetFile} cascade?`,
		message: [
			`The ${sourceFile}.md refactor signaled a downstream cascade into ${targetFile}.md.`,
			`Reason: ${reason}`,
			"Approve a separate bounded downstream refactor step?",
		].join("\n"),
	};
}

export function buildApprovedRefactorCascadeRequest(
	plan: RefactorSpecPlan,
	targetFile: RefactorArtifact,
	options: RalphPathOptions = {},
): RefactorRequestV1 {
	const selectedFilePlan = buildRefactorSelectedFilePlan(plan, targetFile);
	const selectedSectionPlan = buildRefactorSelectedSectionPlan(selectedFilePlan, null);
	return {
		...buildRefactorRequest(plan, selectedFilePlan, selectedSectionPlan, options),
		cascadePolicy: "approved",
	};
}

export function formatRefactorCascadeProgressEntry(
	sourceFile: RefactorArtifact,
	targetFile: RefactorArtifact,
	decision: RefactorCascadeDecision,
	reason: string,
): string {
	const outcome = decision === "approved" ? "approved" : "rejected/skipped";
	return `- Refactor cascade ${outcome}: ${sourceFile} -> ${targetFile}. Reason: ${reason}`;
}

export function parseRefactorCompletion(output: string): RefactorCompletionParseResult {
	const text = typeof output === "string" ? output : String(output ?? "");
	const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	const missingMarkers = REFACTOR_COMPLETION_MARKERS.filter((marker) => {
		if (marker === "REFACTOR_COMPLETE") return !lines.includes(marker);
		return !lines.some((line) => line.startsWith(`${marker}:`));
	});
	if (missingMarkers.length > 0) {
		return {
			ok: false,
			error: `Missing required refactor completion marker(s): ${missingMarkers.join(", ")}.`,
		};
	}

	const cascadeNeeded = readCompletionValue(lines, "CASCADE_NEEDED");
	const cascadeReason = readCompletionValue(lines, "CASCADE_REASON");
	const evidence = readCompletionValue(lines, "EVIDENCE");
	if (!cascadeNeeded || !cascadeReason || !evidence) {
		return {
			ok: false,
			error: "Refactor completion markers must include non-empty CASCADE_NEEDED, CASCADE_REASON, and EVIDENCE values.",
		};
	}

	return {
		ok: true,
		cascadeNeeded,
		cascadeReason,
		evidence,
	};
}

export function snapshotRefactorSpecDirectory(specPath: string): RefactorSpecSnapshot {
	return {
		specPath,
		files: collectRefactorSpecFiles(specPath),
	};
}

export function diffRefactorSpecDirectory(snapshot: RefactorSpecSnapshot): RefactorSpecDiff {
	const currentFiles = collectRefactorSpecFiles(snapshot.specPath);
	const allFiles = [...new Set([...snapshot.files.keys(), ...currentFiles.keys()])].sort();
	const changedFiles = allFiles.filter((filePath) => hasRefactorFileChanged(snapshot.files.get(filePath), currentFiles.get(filePath)));
	return {
		currentFiles,
		changedFiles,
	};
}

export function auditRefactorSpecMutationScope(snapshot: RefactorSpecSnapshot, allowedFiles: string[]): RefactorAuditResult {
	const diff = diffRefactorSpecDirectory(snapshot);
	const allowedSet = new Set(allowedFiles.map((filePath) => resolve(filePath)));
	const unauthorizedFiles = diff.changedFiles.filter((filePath) => !allowedSet.has(filePath));
	return {
		changedFiles: diff.changedFiles,
		unauthorizedFiles,
	};
}

export function formatRefactorCompletionValidationError(error: string): string {
	return `Rejected /ralph-refactor result: ${error}`;
}

export function formatRefactorUnauthorizedEditError(
	unauthorizedFiles: string[],
	formatPath: (filePath: string) => string,
): string {
	return `Rejected /ralph-refactor result: unauthorized spec edits escaped allowedFiles (${unauthorizedFiles.map((filePath) => formatPath(filePath)).join(", ")}).`;
}

export function formatRefactorExecutionError(error: unknown): string {
	return `Rejected /ralph-refactor result: ${error instanceof Error ? error.message : String(error ?? "Unknown /ralph-refactor execution error")}`;
}

export function restoreRefactorSpecDirectory(snapshot: RefactorSpecSnapshot): void {
	const currentFiles = collectRefactorSpecFiles(snapshot.specPath);
	for (const filePath of currentFiles.keys()) {
		if (!snapshot.files.has(filePath)) unlinkSync(filePath);
	}
	for (const [filePath, content] of snapshot.files.entries()) {
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, content);
	}
	pruneEmptyDirectories(snapshot.specPath);
}

function extractProgressLearnings(progressContent: string): string[] {
	if (!progressContent.trim()) return [];
	const learnings: string[] = [];
	const lines = progressContent.split(/\r?\n/);
	let inLearnings = false;
	for (const line of lines) {
		if (/^##\s+Learnings\s*$/i.test(line.trim())) {
			inLearnings = true;
			continue;
		}
		if (inLearnings && /^##\s+/.test(line.trim())) {
			inLearnings = false;
		}
		if (!inLearnings) continue;
		const bullet = line.match(/^\s*-\s+(.+?)\s*$/);
		if (bullet) learnings.push(bullet[1]);
	}
	return learnings;
}

function readCompletionValue(lines: string[], marker: string): string {
	const line = lines.find((entry) => entry.startsWith(`${marker}:`));
	return line ? line.slice(marker.length + 1).trim() : "";
}

function downstreamRefactorArtifacts(sourceFile: RefactorArtifact): RefactorArtifact[] {
	switch (sourceFile) {
		case "requirements":
			return ["design"];
		case "design":
			return ["tasks"];
		default:
			return [];
	}
}

function tokenizeCascadeNeeded(cascadeNeeded: string | undefined): string[] {
	if (!cascadeNeeded) return [];
	return cascadeNeeded
		.split(/[\s,]+/)
		.map((token) => token.trim().toLowerCase())
		.filter((token) => token && token !== "none");
}

function collectRefactorSpecFiles(specPath: string): Map<string, Buffer> {
	const files = new Map<string, Buffer>();
	if (!existsSync(specPath)) return files;
	for (const entry of listRefactorDirectoryEntries(specPath)) {
		const entryPath = join(specPath, entry.name);
		if (entry.isDirectory()) {
			for (const [filePath, content] of collectRefactorSpecFiles(entryPath).entries()) {
				files.set(filePath, content);
			}
			continue;
		}
		if (entry.isFile()) files.set(resolve(entryPath), readFileSync(entryPath));
	}
	return files;
}

function listRefactorDirectoryEntries(directoryPath: string) {
	return readdirSync(directoryPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
}

function hasRefactorFileChanged(before: Buffer | undefined, after: Buffer | undefined): boolean {
	return !before || !after || !before.equals(after);
}

function pruneEmptyDirectories(directoryPath: string, isRoot = true): void {
	if (!existsSync(directoryPath)) return;
	for (const entry of listRefactorDirectoryEntries(directoryPath)) {
		if (entry.isDirectory()) pruneEmptyDirectories(join(directoryPath, entry.name), false);
	}
	if (isRoot) return;
	if (readdirSync(directoryPath).length === 0) rmSync(directoryPath, { recursive: true, force: true });
}

function requireRefactorSelectedArtifact(selectedFilePlan: RefactorSelectedFilePlan) {
	if (!selectedFilePlan.selectedFile || !selectedFilePlan.artifactPath) {
		throw new Error("Refactor request requires a selected artifact before delegation.");
	}
	return {
		selectedFile: selectedFilePlan.selectedFile,
		artifactPath: selectedFilePlan.artifactPath,
	};
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
