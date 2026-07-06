import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
	findSpec,
	getCurrentSpecFilePath,
	getSpecRoots,
	isPathReference,
	listSpecs,
	readCurrentSpecValue,
	resolveCurrentSpec,
	specEntryFromAbsolutePath,
	SpecResolutionError,
	writeCurrentSpec,
	type RalphPathOptions,
	type SpecEntry,
	type SpecRoot,
} from "./paths.ts";
import {
	appendProgress,
	getProgressPath,
	getRalphStatePath,
	mergeRalphState,
	readProgress,
	readRalphState,
	writeProgress,
	type RalphState,
} from "./state.ts";
import {
	aggregateGithubMissingLabels,
	aggregateGithubWarnings,
	createOrUpdateChildSpecIssue,
	createOrUpdateEpicIssue,
	detectGithub,
	planChildSpecIssueSync,
	planEpicIssueSync,
	RALPH_GITHUB_METADATA_SCHEMA_VERSION,
	RALPH_GITHUB_METADATA_TOOL,
	type GithubDetection,
	type GithubIssueSyncResult,
	type GithubRepository,
} from "./github.ts";
import {
	clearCurrentEpic,
	completeEpicChildSpec,
	computeEpicDependencyStatus,
	deriveEpicStatus,
	EPIC_SCHEMA_VERSION,
	getEpicStatePath,
	listEpics,
	normalizeEpicCompatibilityWarnings,
	readCompatibleEpicState,
	readCurrentEpic,
	readCurrentEpicName,
	resolveEpicDirectory,
	safeReadEpicState,
	startEpicChildSpec,
	validateEpicState,
	writeCurrentEpic,
	writeEpicState,
	type CurrentEpic,
	type EpicChildSpec,
	type EpicChildSpecStatus,
	type EpicInterfaceContract,
	type EpicSpecDependencyStatus,
	type EpicState,
	type SafeEpicStateRead,
} from "./epics.ts";
import { ensureRalphGitignore } from "./gitignore.ts";
import { applyStartBranchApplication, decideStartBranchBeforeWrites, type BranchDecision } from "./start-branch.ts";
import { discoverRelatedSpecs, discoverSkills, mergeDiscoveredSkillsByName, mergeRelatedSpecsByName } from "./start-discovery.ts";
import { formatRalphIndexCommandResult, runRalphIndex } from "./indexing.ts";
import { createFeedbackCommandHandler } from "./feedback.ts";
import { registerCoreRalphCommands } from "./commands/core.ts";
import { registerSpecLifecycleCommands } from "./commands/spec.ts";
import { validatePhaseArtifactContent } from "./phase-runner.ts";
import { createBootstrapStatusDiagnostics, runRalphInitCommand } from "./services/bootstrap-diagnostics.ts";
import { analyzeTaskWorkspace, formatTaskWorkspaceReport } from "./task-completion.ts";
import {
	applyImplementationTaskModification,
	createImplementationCompletionBridgeInput,
	createImplementationExecutionBatch,
	createImplementationSharedSurfacePreflightPlan,
	createRecoveredImplementationStatePatch,
	createImplementationVerificationFailureEnvelope,
	createImplementationVerificationRecoveryAttempt,
	createImplementationVerificationRecoveryPolicy,
	createImplementationVerificationRecoveryStatePatch,
	createImplementationFinalizerEpicUpdatedPatch,
	createImplementationFinalizerIndexFailurePatch,
	createImplementationFinalizerStartedPatch,
	createImplementationFixTaskPlan,
	createImplementationRecoveryStopPlan,
	createImplementationReviewCheckpoint,
	createImplementationStateDefaults,
	createImplementationStatePatch,
	createImplementationTaskMutationRemapPatch,
	describeImplementationOutstandingCompletionWork,
	formatImplementationFinalizerIndexFailureOutput,
	formatImplementationFinalizerSuccessOutput,
	formatImplementationSubagentCompletionOutput,
	formatImplementationVerificationRecoveryPolicy,
	getImplementationVerificationRecoveryBudget,
	extractImplementationCompletionEvidence as implementationExtractCompletionEvidence,
	planImplementationVerificationRecovery,
	rerunImplementationVerifierExactly,
	runImplementationSharedSurfacePreflight,
	writeImplementationCompletionArtifacts,
	SHARED_SURFACE_PREFLIGHT_COMMANDS,
	getImplementationNativeTaskRepairReason,
	IMPLEMENTATION_DEFAULT_MAX_FIX_TASK_DEPTH,
	IMPLEMENTATION_DEFAULT_MAX_FIX_TASKS_PER_ORIGINAL,
	IMPLEMENTATION_DEFAULT_MAX_MODIFICATION_DEPTH,
	IMPLEMENTATION_DEFAULT_MAX_MODIFICATIONS_PER_TASK,
	implementationNativeTaskMapFromState,
	latestImplementationReviewStatus,
	mergeImplementationBatchTaskEvidence,
	nextImplementationReviewIteration,
	normalizeImplementationTaskModificationProposals,
	parseImplementationTaskModification,
	recordImplementationReviewEvidence,
	recordImplementationTaskEvidence,
	validateImplementationExecutionState,
	validateImplementationTaskMutation,
	validateImplementationTaskCompletion,
	type ImplementationCompletionSignal,
	type ImplementationCompletionValidation,
	type ImplementationReviewStatus,
	type ImplementationSharedSurfaceTaskLike,
} from "./implementation-loop.ts";
import {
	buildApprovedRefactorCascadeRequest,
	buildRefactorCascadePrompt,
	buildRefactorCoordinatorStatePatch,
	buildRefactorArtifactProgressUpdate,
	buildRefactorFilePromptPlan,
	buildRefactorLocalCommitPlan,
	buildRefactorRequest,
	buildRefactorSectionPromptPlan,
	buildRefactorSpecialistPrompt,
	buildRefactorSelectedFilePlan,
	buildRefactorSelectedSectionPlan,
	auditRefactorSpecMutationScope,
	formatRefactorCascadeOutcome,
	formatRefactorCascadeProgressEntry,
	formatRefactorCompletionValidationError,
	formatRefactorExecutionError,
	formatRefactorHeadlessDecisionError,
	formatRefactorLocalCommitWarning,
	REFACTOR_COMMAND_DESCRIPTION,
	REFACTOR_ALLOWED_FILES,
	formatPendingRefactorMessage,
	formatRefactorParseError,
	formatRefactorResolutionError,
	formatRefactorUnauthorizedEditError,
	parseRefactorArgs,
	parseRefactorCompletion,
	parseRefactorFilePromptSelection,
	resolveRefactorCascadeSteps,
	resolveRefactorSpecPlan,
	restoreRefactorSpecDirectory,
	snapshotRefactorSpecDirectory,
	shouldResetRefactorTaskIndex,
} from "./refactor.ts";

// Branch-ordering smoke marker: decideStartBranchBeforeWrites(...) must happen before new-spec writes.
const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(EXTENSION_DIR, "../..");
const PACKAGE_RESOURCE_ROOT = PACKAGE_ROOT;

const RALPH_EXTENSION_MANIFEST_PATH = "./extensions/ralph-specum/index.ts";
const RALPH_SKILLS_MANIFEST_PATH = "./skills";
const RALPH_PROMPTS_MANIFEST_PATH = "./prompts";

const REQUIRED_RUNTIME_PACKAGES = [
	{
		name: "@tintinweb/pi-subagents",
		version: "0.13.0",
		resourcePath: join(PACKAGE_ROOT, "node_modules", "@tintinweb", "pi-subagents", "src", "index.ts"),
		tools: ["Agent"],
	},
	{
		name: "@tintinweb/pi-tasks",
		version: "0.7.1",
		resourcePath: join(PACKAGE_ROOT, "node_modules", "@tintinweb", "pi-tasks", "src", "index.ts"),
		tools: ["TaskCreate", "TaskUpdate", "TaskExecute"],
	},
	{
		name: "pi-mcp-adapter",
		version: "2.10.0",
		resourcePath: join(PACKAGE_ROOT, "node_modules", "pi-mcp-adapter", "index.ts"),
		tools: ["mcp"],
	},
	{
		name: "pi-agent-browser-native",
		version: "0.2.64",
		resourcePath: join(PACKAGE_ROOT, "node_modules", "pi-agent-browser-native", "dist", "extensions", "agent-browser", "index.js"),
		tools: ["agent_browser"],
	},
] as const;

const REQUIRED_PACKAGE_PATHS = [
	{ label: "Package manifest", path: join(PACKAGE_ROOT, "package.json"), type: "file" },
	{ label: "Ralph agents directory", path: join(PACKAGE_RESOURCE_ROOT, "agents"), type: "directory" },
	{ label: "Ralph prompts directory", path: join(PACKAGE_RESOURCE_ROOT, "prompts"), type: "directory" },
	{ label: "Ralph skills directory", path: join(PACKAGE_RESOURCE_ROOT, "skills"), type: "directory" },
	{ label: "Ralph templates directory", path: join(PACKAGE_RESOURCE_ROOT, "templates"), type: "directory" },
] as const;

const EXPECTED_RALPH_AGENTS = [
	"Explore.md",
	"Execute.md",
	"ralph-research-analyst.md",
	"ralph-product-manager.md",
	"ralph-architect-reviewer.md",
	"ralph-task-planner.md",
	"ralph-spec-executor.md",
	"ralph-qa-engineer.md",
	"ralph-refactor-specialist.md",
	"ralph-spec-reviewer.md",
	"ralph-triage-analyst.md",
] as const;

const REQUIRED_AGENT_FRONTMATTER_FIELDS = [
	"description",
	"display_name",
	"tools",
	"prompt_mode",
] as const;

const RALPH_SUPPORTED_MODEL_PROVIDERS = [
	{
		provider: "anthropic",
		label: "Anthropic subscription/API provider",
		preferredModels: ["claude-sonnet-5", "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-sonnet", "claude-opus", "claude-haiku"],
	},
	{
		provider: "openai-codex",
		label: "OpenAI subscription provider",
		preferredModels: ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex", "gpt-5.4-mini", "gpt-5.3-codex-spark"],
	},
	{
		provider: "github-copilot",
		label: "GitHub Copilot",
		preferredModels: ["claude-sonnet", "gpt-5.5", "gpt-5.4", "gpt-5.3-codex", "gemini", "claude"],
	},
] as const;

type Check = {
	label: string;
	ok: boolean;
	detail: string;
	action?: string;
};

type CheckSection = {
	title: string;
	checks: Check[];
};

type ValidationReport = {
	ready: boolean;
	sections: CheckSection[];
	installCommands: string[];
};

type PackageJson = {
	name?: string;
	version?: string;
	pi?: { extensions?: string[]; skills?: string[]; prompts?: string[] };
	dependencies?: Record<string, string>;
	bundledDependencies?: string[];
	bundleDependencies?: string[];
};

type ToolRegistryState = {
	allToolNames: Set<string>;
	activeToolNames: Set<string>;
	allToolDetails: Map<string, string>;
	allError?: string;
	activeError?: string;
};

function readPackageJson(): PackageJson | null {
	const packageJsonPath = join(PACKAGE_ROOT, "package.json");
	if (!existsSync(packageJsonPath)) return null;

	try {
		return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
	} catch {
		return null;
	}
}

function formatPathFromRoot(path: string, root: string): string {
	const rel = relative(root, path);
	return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : path;
}

function formatPath(path: string): string {
	return formatPathFromRoot(path, PACKAGE_ROOT);
}

function formatProjectPath(path: string, cwd: string): string {
	return formatPathFromRoot(path, resolve(cwd));
}

function pathCheck(path: string, type: "file" | "directory"): boolean {
	try {
		const stat = statSync(path);
		return type === "file" ? stat.isFile() : stat.isDirectory();
	} catch {
		return false;
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function manifestIncludes(values: string[] | undefined, expected: string): boolean {
	return Boolean(values?.includes(expected));
}

function bundledDependencies(packageJson: PackageJson | null): string[] {
	return [...(packageJson?.bundledDependencies ?? []), ...(packageJson?.bundleDependencies ?? [])];
}

function declaredVersion(packageJson: PackageJson | null, packageName: string, fallback: string): string {
	const declared = packageJson?.dependencies?.[packageName];
	if (!declared || declared.startsWith("file:") || declared.startsWith("workspace:")) return fallback;
	return declared.replace(/^[~^]/, "");
}

function piInstallCommand(packageJson: PackageJson | null, packageName: string, fallbackVersion: string): string {
	return `pi install npm:${packageName}@${declaredVersion(packageJson, packageName, fallbackVersion)}`;
}

const RALPH_AGENT_MANAGED_MARKER_PREFIX = "smart-ralph-managed: pi-smart-ralph";
const RALPH_AGENT_MANAGED_MARKER_RE = /\s*<!-- smart-ralph-managed: pi-smart-ralph; source=(?:\.pi\/)?agents\/[^;]+; sha256=[a-f0-9]{64} -->\s*$/;

type RalphAgentBootstrapConflict = {
	name: string;
	path: string;
	reason: string;
};

type RalphAgentBootstrapResult = {
	sourceDir: string;
	targetDir: string;
	refresh: boolean;
	sourceIsTarget: boolean;
	copied: string[];
	updated: string[];
	adopted: string[];
	unchanged: string[];
	conflicts: RalphAgentBootstrapConflict[];
	missingSource: string[];
	errors: string[];
};

function packageRalphAgentsDir(): string {
	return join(PACKAGE_RESOURCE_ROOT, "agents");
}

function projectRalphAgentsDir(cwd: string): string {
	return join(resolve(cwd), ".pi", "agents");
}

function agentFileName(agentName: string): string {
	return agentName.endsWith(".md") ? agentName : `${agentName}.md`;
}

function sourceRalphAgentPath(agentName: string): string {
	return join(packageRalphAgentsDir(), agentFileName(agentName));
}

function projectRalphAgentPath(cwd: string, agentName: string): string {
	return join(projectRalphAgentsDir(cwd), agentFileName(agentName));
}

function safeReadRalphAgentNames(agentsDir: string): { names: string[]; error?: string } {
	try {
		const expected = new Set<string>(EXPECTED_RALPH_AGENTS.map((name) => agentFileName(name)));
		const names = readdirSync(agentsDir, { withFileTypes: true })
			.filter((entry) => entry.isFile() && expected.has(entry.name))
			.map((entry) => entry.name)
			.sort();
		return { names };
	} catch (error) {
		return { names: [], error: formatError(error) };
	}
}

function stripSmartRalphAgentMarker(content: string): string {
	return content.replace(RALPH_AGENT_MANAGED_MARKER_RE, "").trimEnd();
}

function isSmartRalphManagedAgent(content: string): boolean {
	return RALPH_AGENT_MANAGED_MARKER_RE.test(content);
}

function sameRalphAgentDefinition(left: string, right: string): boolean {
	return stripSmartRalphAgentMarker(left) === stripSmartRalphAgentMarker(right);
}

function managedRalphAgentContent(agentName: string, sourceContent: string): string {
	const body = stripSmartRalphAgentMarker(sourceContent);
	const hash = createHash("sha256").update(body).digest("hex");
	return `${body}\n\n<!-- ${RALPH_AGENT_MANAGED_MARKER_PREFIX}; source=agents/${agentFileName(agentName)}; sha256=${hash} -->\n`;
}

function emptyRalphAgentBootstrapResult(cwd: string, refresh: boolean): RalphAgentBootstrapResult {
	const sourceDir = packageRalphAgentsDir();
	const targetDir = projectRalphAgentsDir(cwd);
	return {
		sourceDir,
		targetDir,
		refresh,
		sourceIsTarget: resolve(sourceDir) === resolve(targetDir),
		copied: [],
		updated: [],
		adopted: [],
		unchanged: [],
		conflicts: [],
		missingSource: [],
		errors: [],
	};
}

function bootstrapRalphAgents(cwd: string, refresh = false): RalphAgentBootstrapResult {
	const result = emptyRalphAgentBootstrapResult(cwd, refresh);

	if (!pathCheck(result.sourceDir, "directory")) {
		result.errors.push(`Bundled Ralph agents directory is missing: ${formatPath(result.sourceDir)}`);
		return result;
	}

	if (!result.sourceIsTarget) {
		try {
			mkdirSync(result.targetDir, { recursive: true });
		} catch (error) {
			result.errors.push(`Unable to create project Ralph agents directory ${formatProjectPath(result.targetDir, cwd)}: ${formatError(error)}`);
			return result;
		}
	}

	for (const agentName of EXPECTED_RALPH_AGENTS) {
		const sourcePath = sourceRalphAgentPath(agentName);
		if (!pathCheck(sourcePath, "file")) {
			result.missingSource.push(agentName);
			continue;
		}

		let sourceContent: string;
		try {
			sourceContent = readFileSync(sourcePath, "utf8");
		} catch (error) {
			result.errors.push(`Unable to read bundled Ralph agent ${formatPath(sourcePath)}: ${formatError(error)}`);
			continue;
		}

		if (result.sourceIsTarget) {
			result.unchanged.push(agentName);
			continue;
		}

		const targetPath = projectRalphAgentPath(cwd, agentName);
		const targetContent = managedRalphAgentContent(agentName, sourceContent);
		let targetExists = false;
		try {
			const stat = statSync(targetPath);
			targetExists = true;
			if (!stat.isFile()) {
				result.conflicts.push({ name: agentName, path: targetPath, reason: "target path exists but is not a file" });
				continue;
			}
		} catch (error) {
			const code = isRecordValue(error) && typeof error.code === "string" ? error.code : undefined;
			if (code !== "ENOENT") {
				result.errors.push(`Unable to inspect project Ralph agent ${formatProjectPath(targetPath, cwd)}: ${formatError(error)}`);
				continue;
			}
		}

		if (!targetExists) {
			try {
				writeFileSync(targetPath, targetContent, "utf8");
				result.copied.push(agentName);
			} catch (error) {
				result.errors.push(`Unable to write project Ralph agent ${formatProjectPath(targetPath, cwd)}: ${formatError(error)}`);
			}
			continue;
		}

		let existingContent: string;
		try {
			existingContent = readFileSync(targetPath, "utf8");
		} catch (error) {
			result.errors.push(`Unable to read project Ralph agent ${formatProjectPath(targetPath, cwd)}: ${formatError(error)}`);
			continue;
		}

		if (existingContent === targetContent) {
			result.unchanged.push(agentName);
			continue;
		}

		const managed = isSmartRalphManagedAgent(existingContent);
		const sameDefinition = sameRalphAgentDefinition(existingContent, sourceContent);
		if (managed || refresh || sameDefinition) {
			try {
				writeFileSync(targetPath, targetContent, "utf8");
				if (sameDefinition && !managed && !refresh) result.adopted.push(agentName);
				else result.updated.push(agentName);
			} catch (error) {
				result.errors.push(`Unable to refresh project Ralph agent ${formatProjectPath(targetPath, cwd)}: ${formatError(error)}`);
			}
			continue;
		}

		result.conflicts.push({
			name: agentName,
			path: targetPath,
			reason: "existing file is user-owned; not overwritten without --refresh-agents",
		});
	}

	return result;
}

function frontmatterFields(content: string): Set<string> | null {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return null;

	const fields = new Set<string>();
	for (const line of match[1].split(/\r?\n/)) {
		const field = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):/);
		if (field) fields.add(field[1]);
	}
	return fields;
}

type RalphModelProviderProfile = (typeof RALPH_SUPPORTED_MODEL_PROVIDERS)[number];
type RalphModelLike = {
	provider: string;
	id: string;
	name?: string;
	reasoning?: boolean;
};

type RalphModelRegistryLike = {
	getAvailable?: () => unknown[];
	getAll?: () => unknown[];
	find?: (provider: string, modelId: string) => unknown;
};

function isRalphModelLike(value: unknown): value is RalphModelLike {
	return isRecordValue(value) && typeof value.provider === "string" && typeof value.id === "string";
}

function normalizeModelText(value: string): string {
	return value.toLowerCase().replace(/[._]/g, "-");
}

function ralphModelLabel(model: RalphModelLike): string {
	return `${model.provider}/${model.id}`;
}

function currentPiModel(ctx: ExtensionCommandContext): RalphModelLike | null {
	const model = (ctx as unknown as { model?: unknown }).model;
	return isRalphModelLike(model) ? model : null;
}

function modelRegistryFromContext(ctx: ExtensionCommandContext): RalphModelRegistryLike | null {
	const registry = (ctx as unknown as { modelRegistry?: unknown }).modelRegistry;
	return isRecordValue(registry) ? registry as RalphModelRegistryLike : null;
}

function availablePiModels(ctx: ExtensionCommandContext): RalphModelLike[] {
	const registry = modelRegistryFromContext(ctx);
	if (!registry) return [];

	let raw: unknown[] = [];
	try {
		raw = typeof registry.getAvailable === "function" ? registry.getAvailable() : typeof registry.getAll === "function" ? registry.getAll() : [];
	} catch {
		return [];
	}

	return raw.filter(isRalphModelLike);
}

function profileForProvider(provider: string): RalphModelProviderProfile | undefined {
	return RALPH_SUPPORTED_MODEL_PROVIDERS.find((profile) => profile.provider === provider);
}

function scoreModelForProfile(model: RalphModelLike, profile: RalphModelProviderProfile): number {
	if (model.provider !== profile.provider) return -1;
	const id = normalizeModelText(model.id);
	const name = normalizeModelText(model.name ?? "");
	let score = model.reasoning ? 20 : 0;
	for (let index = 0; index < profile.preferredModels.length; index += 1) {
		const preferred = normalizeModelText(profile.preferredModels[index]);
		if (id === preferred) return 1000 - index;
		if (id.includes(preferred)) return 900 - index;
		if (name.includes(preferred)) return 800 - index;
	}
	return score;
}

function bestModelForProvider(models: RalphModelLike[], provider: string): RalphModelLike | null {
	const profile = profileForProvider(provider);
	const candidates = models.filter((model) => model.provider === provider);
	if (candidates.length === 0) return null;
	if (!profile) return candidates[0];

	return candidates
		.map((model) => ({ model, score: scoreModelForProfile(model, profile) }))
		.sort((left, right) => right.score - left.score || ralphModelLabel(left.model).localeCompare(ralphModelLabel(right.model)))[0]?.model ?? null;
}

function findModelByQuery(models: RalphModelLike[], query: string): RalphModelLike | null {
	const trimmed = query.trim();
	if (!trimmed) return null;
	const normalized = normalizeModelText(trimmed);
	const slash = trimmed.indexOf("/");

	if (slash !== -1) {
		const provider = trimmed.slice(0, slash);
		const modelId = trimmed.slice(slash + 1);
		const exact = models.find((model) => model.provider === provider && model.id === modelId);
		if (exact) return exact;
	}

	let best: { model: RalphModelLike; score: number } | null = null;
	for (const model of models) {
		const label = normalizeModelText(ralphModelLabel(model));
		const id = normalizeModelText(model.id);
		const name = normalizeModelText(model.name ?? "");
		let score = 0;
		if (label === normalized || id === normalized) score = 100;
		else if (label.includes(normalized) || id.includes(normalized)) score = 80;
		else if (name.includes(normalized)) score = 60;
		if (score > 0 && (!best || score > best.score)) best = { model, score };
	}
	return best?.model ?? null;
}

function providerAvailabilityLines(models: RalphModelLike[]): string[] {
	return RALPH_SUPPORTED_MODEL_PROVIDERS.map((profile) => {
		const count = models.filter((model) => model.provider === profile.provider).length;
		const best = bestModelForProvider(models, profile.provider);
		return `- ${profile.provider}: ${count > 0 ? `${count} available; recommended ${best ? ralphModelLabel(best) : "<none>"}` : "not authenticated/available"} (${profile.label})`;
	});
}

function chooseAutoRalphProvider(ctx: ExtensionCommandContext, models: RalphModelLike[]): string | null {
	const current = currentPiModel(ctx);
	if (current && profileForProvider(current.provider) && models.some((model) => model.provider === current.provider)) return current.provider;
	const available = RALPH_SUPPORTED_MODEL_PROVIDERS.filter((profile) => models.some((model) => model.provider === profile.provider));
	return available.length === 1 ? available[0].provider : null;
}

function formatRalphModelStatus(ctx: ExtensionCommandContext): string {
	const models = availablePiModels(ctx);
	const current = currentPiModel(ctx);
	return [
		"# Ralph Model Mode",
		"",
		`Current Pi model: ${current ? ralphModelLabel(current) : "unknown"}`,
		"Ralph subagents inherit the active Pi model by default; bundled agents do not pin provider-specific `model:` frontmatter.",
		"",
		"Supported Pi login providers:",
		...providerAvailabilityLines(models),
		"",
		"Usage:",
		"- /ralph-model auto                         Select the recommended model for the current/only authenticated supported provider.",
		"- /ralph-model anthropic                    Select the recommended Anthropic model.",
		"- /ralph-model openai-codex                 Select the recommended OpenAI subscription model.",
		"- /ralph-model github-copilot               Select the recommended GitHub Copilot model.",
		"- /ralph-model <provider>/<model-id>        Select an exact available Pi model.",
		"- /ralph-model inherit                      Refresh Ralph agents so they inherit the active Pi model.",
	].join("\n");
}

async function switchRalphModel(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
	await ctx.waitForIdle();
	const token = args.trim();
	if (!token) {
		await notify(ctx, formatRalphModelStatus(ctx));
		return;
	}

	if (token === "inherit" || token === "current") {
		const bootstrap = bootstrapRalphAgents(ctx.cwd);
		await notify(
			ctx,
			[
				"Ralph agents now inherit the active Pi model.",
				`Current Pi model: ${currentPiModel(ctx) ? ralphModelLabel(currentPiModel(ctx) as RalphModelLike) : "unknown"}`,
				`Agent bootstrap: ${formatBootstrapSummary(bootstrap)}.`,
				"Use Pi's /model command any time to change the model Ralph subagents inherit.",
			].join("\n"),
			bootstrap.errors.length > 0 || bootstrap.conflicts.length > 0 ? "warning" : "info",
		);
		return;
	}

	const models = availablePiModels(ctx);
	if (models.length === 0) {
		await notify(ctx, "No authenticated/available Pi models found. Run /login or set an API key, then retry /ralph-model.", "warning");
		return;
	}

	const provider = token === "auto" ? chooseAutoRalphProvider(ctx, models) : profileForProvider(token)?.provider ?? null;
	if (token === "auto" && !provider) {
		await notify(ctx, [`Could not choose one provider automatically. Current provider is unsupported or multiple supported providers are available.`, "", ...providerAvailabilityLines(models), "", "Run /ralph-model anthropic, /ralph-model openai-codex, or /ralph-model github-copilot."].join("\n"), "warning");
		return;
	}

	const target = provider ? bestModelForProvider(models, provider) : findModelByQuery(models, token);
	if (!target) {
		await notify(ctx, [`No available model matched '${token}'.`, "", ...providerAvailabilityLines(models), "", "Use /model or /login to enable more models, then retry /ralph-model."].join("\n"), "warning");
		return;
	}

	const setter = (pi as unknown as { setModel?: (model: unknown) => boolean | Promise<boolean> }).setModel;
	if (typeof setter !== "function") {
		await notify(ctx, "This Pi version does not expose pi.setModel() to extensions. Use Pi's /model command; Ralph agents inherit the selected model.", "warning");
		return;
	}

	const success = await setter.call(pi, target);
	if (!success) {
		await notify(ctx, `Pi refused model ${ralphModelLabel(target)}. Authenticate that provider with /login or an API key first.`, "warning");
		return;
	}

	const bootstrap = bootstrapRalphAgents(ctx.cwd);
	await notify(
		ctx,
		[
			`Ralph model switched to ${ralphModelLabel(target)}.`,
			"Ralph subagents inherit the active Pi model for anthropic, openai-codex, and github-copilot sessions.",
			`Agent bootstrap: ${formatBootstrapSummary(bootstrap)}.`,
			"Run /ralph-init for full diagnostics if needed.",
		].join("\n"),
		bootstrap.errors.length > 0 || bootstrap.conflicts.length > 0 ? "warning" : "info",
	);
}

function getToolRegistryState(pi: ExtensionAPI): ToolRegistryState {
	const state: ToolRegistryState = {
		allToolNames: new Set<string>(),
		activeToolNames: new Set<string>(),
		allToolDetails: new Map<string, string>(),
	};

	try {
		const allTools = pi.getAllTools();
		for (const tool of allTools) {
			state.allToolNames.add(tool.name);
			const source = tool.sourceInfo?.source ?? "unknown source";
			const path = tool.sourceInfo?.path ? ` (${tool.sourceInfo.path})` : "";
			state.allToolDetails.set(tool.name, `${source}${path}`);
		}
	} catch (error) {
		state.allError = formatError(error);
	}

	try {
		state.activeToolNames = new Set(pi.getActiveTools());
	} catch (error) {
		state.activeError = formatError(error);
	}

	return state;
}

type RuntimeDependency = (typeof REQUIRED_RUNTIME_PACKAGES)[number];
type RuntimeExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;

const loadedBundledRuntimePackages = new Set<string>();
const bundledRuntimeLoadErrors = new Map<string, string>();

function runtimeToolsActive(registry: ToolRegistryState, dependency: RuntimeDependency): boolean {
	return !registry.allError
		&& !registry.activeError
		&& dependency.tools.every((toolName) => registry.allToolNames.has(toolName) && registry.activeToolNames.has(toolName));
}

function runtimeToolsMissingFromRegistry(registry: ToolRegistryState, dependency: RuntimeDependency): string[] {
	if (registry.allError) return [...dependency.tools];
	return dependency.tools.filter((toolName) => !registry.allToolNames.has(toolName));
}

function runtimeToolsInactive(registry: ToolRegistryState, dependency: RuntimeDependency): string[] {
	if (registry.allError || registry.activeError) return [];
	return dependency.tools.filter((toolName) => registry.allToolNames.has(toolName) && !registry.activeToolNames.has(toolName));
}

async function loadBundledRuntimeDependency(pi: ExtensionAPI, dependency: RuntimeDependency): Promise<void> {
	if (loadedBundledRuntimePackages.has(dependency.name)) return;

	if (!pathCheck(dependency.resourcePath, "file")) {
		bundledRuntimeLoadErrors.set(dependency.name, `Bundled entrypoint missing: ${formatPath(dependency.resourcePath)}`);
		return;
	}

	try {
		const module = await import(pathToFileURL(dependency.resourcePath).href) as { default?: unknown };
		if (typeof module.default !== "function") {
			throw new Error(`${formatPath(dependency.resourcePath)} does not export a default extension factory.`);
		}

		await (module.default as RuntimeExtensionFactory)(pi);
		loadedBundledRuntimePackages.add(dependency.name);
		bundledRuntimeLoadErrors.delete(dependency.name);
	} catch (error) {
		bundledRuntimeLoadErrors.set(dependency.name, formatError(error));
	}
}

async function bootstrapBundledRuntimes(pi: ExtensionAPI): Promise<void> {
	let registry = getToolRegistryState(pi);
	if (registry.allError || registry.activeError) return;

	for (const dependency of REQUIRED_RUNTIME_PACKAGES) {
		if (loadedBundledRuntimePackages.has(dependency.name)) continue;
		if (runtimeToolsActive(registry, dependency)) {
			bundledRuntimeLoadErrors.delete(dependency.name);
			continue;
		}

		const missingTools = runtimeToolsMissingFromRegistry(registry, dependency);
		if (missingTools.length === 0) {
			// The provider is present but disabled by the active tool set. Do not load a
			// duplicate bundled extension; /ralph-init will tell the user which tools to enable.
			continue;
		}

		await loadBundledRuntimeDependency(pi, dependency);
		registry = getToolRegistryState(pi);
	}
}

function bundledRuntimeSkillsPath(): string | null {
	return null;
}

function validatePackageResources(packageJson: PackageJson | null): CheckSection {
	const checks: Check[] = [];

	for (const resource of REQUIRED_PACKAGE_PATHS) {
		checks.push({
			label: resource.label,
			ok: pathCheck(resource.path, resource.type),
			detail: `${formatPath(resource.path)} (${resource.type})`,
			action: `Restore ${formatPath(resource.path)} in the Smart Ralph package.`,
		});
	}

	checks.push({
		label: "Package manifest parses",
		ok: packageJson !== null,
		detail: packageJson ? "package.json parsed successfully" : "package.json is missing or invalid JSON",
		action: "Restore a valid root package.json for the Smart Ralph package.",
	});

	checks.push({
		label: "Pi manifest includes Ralph extension",
		ok: manifestIncludes(packageJson?.pi?.extensions, RALPH_EXTENSION_MANIFEST_PATH),
		detail: `package.json pi.extensions includes ${RALPH_EXTENSION_MANIFEST_PATH}`,
		action: `Add ${RALPH_EXTENSION_MANIFEST_PATH} to package.json pi.extensions.`,
	});
	checks.push({
		label: "Pi manifest includes Ralph skills",
		ok: manifestIncludes(packageJson?.pi?.skills, RALPH_SKILLS_MANIFEST_PATH),
		detail: `package.json pi.skills includes ${RALPH_SKILLS_MANIFEST_PATH}`,
		action: `Add ${RALPH_SKILLS_MANIFEST_PATH} to package.json pi.skills.`,
	});
	checks.push({
		label: "Pi manifest includes Ralph prompts",
		ok: manifestIncludes(packageJson?.pi?.prompts, RALPH_PROMPTS_MANIFEST_PATH),
		detail: `package.json pi.prompts includes ${RALPH_PROMPTS_MANIFEST_PATH}`,
		action: `Add ${RALPH_PROMPTS_MANIFEST_PATH} to package.json pi.prompts.`,
	});

	return { title: "Package resources", checks };
}

function formatRuntimeToolStatus(registry: ToolRegistryState, dependency: RuntimeDependency): string {
	if (runtimeToolsActive(registry, dependency)) return `active tools satisfy requirement (${dependency.tools.join(", ")})`;
	if (registry.allError) return `tool registry unavailable: ${registry.allError}`;
	if (registry.activeError) return `active tool list unavailable: ${registry.activeError}`;

	const missing = runtimeToolsMissingFromRegistry(registry, dependency);
	if (missing.length > 0) return `missing tool(s): ${missing.join(", ")}`;

	const inactive = runtimeToolsInactive(registry, dependency);
	if (inactive.length > 0) return `registered but inactive: ${inactive.join(", ")}`;
	return `required tools are not active (${dependency.tools.join(", ")})`;
}

function validateRuntimePackages(packageJson: PackageJson | null, registry: ToolRegistryState): { section: CheckSection; installCommands: string[] } {
	const checks: Check[] = [];
	const installCommands: string[] = [];
	const bundled = bundledDependencies(packageJson);

	for (const dependency of REQUIRED_RUNTIME_PACKAGES) {
		const installCommand = piInstallCommand(packageJson, dependency.name, dependency.version);
		const dependencyDeclared = Boolean(packageJson?.dependencies?.[dependency.name]);
		const dependencyBundled = bundled.includes(dependency.name);
		const toolsActive = runtimeToolsActive(registry, dependency);
		const resourcePresent = pathCheck(dependency.resourcePath, "file");
		const bootstrapSatisfied = resourcePresent || toolsActive;
		const loadError = toolsActive ? undefined : bundledRuntimeLoadErrors.get(dependency.name);

		if (!dependencyDeclared || !dependencyBundled || !bootstrapSatisfied || loadError) installCommands.push(installCommand);

		checks.push({
			label: `${dependency.name} package declaration`,
			ok: dependencyDeclared && dependencyBundled,
			detail: "package.json dependencies + bundledDependencies",
			action: `Declare and bundle ${dependency.name}; install command: ${installCommand}`,
		});
		checks.push({
			label: `${dependency.name} conditional bootstrap entrypoint`,
			ok: bootstrapSatisfied,
			detail: resourcePresent
				? `${formatPath(dependency.resourcePath)} available for conditional bootstrap`
				: `bundled entrypoint absent; ${formatRuntimeToolStatus(registry, dependency)}`,
			action: `Install package resources: ${installCommand}`,
		});

		if (loadError) {
			checks.push({
				label: `${dependency.name} bundled bootstrap`,
				ok: false,
				detail: `failed to load bundled runtime: ${loadError}`,
				action: `Reinstall bundled package resources or install a global provider: ${installCommand}`,
			});
		} else if (loadedBundledRuntimePackages.has(dependency.name)) {
			checks.push({
				label: `${dependency.name} bundled bootstrap`,
				ok: true,
				detail: "loaded bundled runtime for this session",
			});
		}

		if ("optionalSkillResourcePath" in dependency) {
			const optionalSkillResourcePath = String(dependency.optionalSkillResourcePath);
			const shouldExposeSkills = loadedBundledRuntimePackages.has(dependency.name);
			const skillResourcePresent = pathCheck(optionalSkillResourcePath, "directory");
			checks.push({
				label: `${dependency.name} bundled skills directory`,
				ok: !shouldExposeSkills || skillResourcePresent,
				detail: shouldExposeSkills
					? skillResourcePresent
						? `${formatPath(optionalSkillResourcePath)} exposed via resources_discover`
						: `${formatPath(optionalSkillResourcePath)} missing while bundled web access is loaded`
					: "not required unless bundled web access is loaded",
				action: `Install package resources: ${installCommand}`,
			});
		}
	}

	return { section: { title: "Required Pi packages", checks }, installCommands: unique(installCommands) };
}

function validateTools(pi: ExtensionAPI, packageJson: PackageJson | null): { section: CheckSection; installCommands: string[] } {
	const registry = getToolRegistryState(pi);
	const checks: Check[] = [];
	const installCommands: string[] = [];

	checks.push({
		label: "Pi tool registry is inspectable",
		ok: !registry.allError,
		detail: registry.allError ? `pi.getAllTools failed: ${registry.allError}` : `${registry.allToolNames.size} tool(s) registered`,
		action: "Restart Pi or run /reload, then retry /ralph-init.",
	});
	checks.push({
		label: "Pi active tool list is inspectable",
		ok: !registry.activeError,
		detail: registry.activeError
			? `pi.getActiveTools failed: ${registry.activeError}`
			: `${registry.activeToolNames.size} tool(s) active`,
		action: "Restart Pi or run /reload, then retry /ralph-init.",
	});

	for (const dependency of REQUIRED_RUNTIME_PACKAGES) {
		const installCommand = piInstallCommand(packageJson, dependency.name, dependency.version);
		for (const toolName of dependency.tools) {
			const registered = registry.allToolNames.has(toolName);
			const active = registry.activeToolNames.has(toolName);
			if (!registered) installCommands.push(installCommand);

			checks.push({
				label: `Required tool ${toolName}`,
				ok: registered && active,
				detail: registered
					? active
						? `registered and active from ${registry.allToolDetails.get(toolName) ?? dependency.name}`
						: `registered but inactive; expected provider package ${dependency.name}`
					: `not registered; expected provider package ${dependency.name}`,
				action: registered
					? `Enable ${toolName} in the active tool set, then run /ralph-init again.`
					: `Install and load provider package: ${installCommand}`,
			});
		}
	}

	return { section: { title: "Required tools", checks }, installCommands };
}

function bootstrapAgentNames(names: string[]): string {
	return names.length > 0 ? names.join(", ") : "none";
}

function formatBootstrapSummary(result: RalphAgentBootstrapResult): string {
	if (result.sourceIsTarget) return "package agents directory is already the project discovery directory; no copy needed";
	return [
		`copied ${result.copied.length}`,
		`updated ${result.updated.length}`,
		`adopted ${result.adopted.length}`,
		`unchanged ${result.unchanged.length}`,
		`conflicts ${result.conflicts.length}`,
		`errors ${result.errors.length}`,
	].join(", ");
}

type RalphRuntimeConfigFileResult = {
	label: string;
	path: string;
	created: boolean;
	updatedKeys: string[];
	preservedKeys: string[];
	errors: string[];
};

type RalphRuntimeConfigBootstrapResult = {
	files: RalphRuntimeConfigFileResult[];
	changed: boolean;
	reloadRecommended: boolean;
};

const RALPH_SUBAGENTS_DEFAULT_CONFIG: Record<string, unknown> = {
	toolDescriptionMode: "compact",
	widgetMode: "background",
	fleetView: true,
	defaultJoinMode: "smart",
	schedulingEnabled: false,
	scopeModels: false,
	disableDefaultAgents: true,
	maxConcurrent: 4,
	defaultMaxTurns: 0,
	graceTurns: 5,
};

const RALPH_TASKS_DEFAULT_CONFIG: Record<string, unknown> = {
	taskScope: "session",
	autoCascade: false,
	autoClearCompleted: "never",
	showAll: true,
	maxVisible: 20,
	sortOrder: "status",
	hiddenAt: "top",
};

function runtimeConfigFilePath(cwd: string, relativePath: string): string {
	return join(resolve(cwd), relativePath);
}

function mergeRuntimeConfigFile(cwd: string, relativePath: string, label: string, defaults: Record<string, unknown>): RalphRuntimeConfigFileResult {
	const targetPath = runtimeConfigFilePath(cwd, relativePath);
	const result: RalphRuntimeConfigFileResult = {
		label,
		path: targetPath,
		created: false,
		updatedKeys: [],
		preservedKeys: [],
		errors: [],
	};

	let nextConfig: Record<string, unknown>;
	if (existsSync(targetPath)) {
		try {
			const parsed = JSON.parse(readFileSync(targetPath, "utf8")) as unknown;
			if (!isRecordValue(parsed) || Array.isArray(parsed)) {
				result.errors.push(`${formatProjectPath(targetPath, cwd)} must contain a JSON object; left unchanged.`);
				return result;
			}
			nextConfig = { ...parsed };
		} catch (error) {
			result.errors.push(`Could not parse ${formatProjectPath(targetPath, cwd)}: ${formatError(error)}; left unchanged.`);
			return result;
		}
	} else {
		nextConfig = {};
		result.created = true;
	}

	for (const [key, value] of Object.entries(defaults)) {
		if (Object.prototype.hasOwnProperty.call(nextConfig, key)) {
			result.preservedKeys.push(key);
			continue;
		}
		nextConfig[key] = value;
		result.updatedKeys.push(key);
	}

	if (relativePath === ".pi/subagents.json") {
		if (nextConfig.widgetMode === "off") {
			nextConfig.widgetMode = "background";
			if (!result.updatedKeys.includes("widgetMode")) result.updatedKeys.push("widgetMode");
			result.preservedKeys = result.preservedKeys.filter((key) => key !== "widgetMode");
		}
		if (nextConfig.fleetView !== true) {
			nextConfig.fleetView = true;
			if (!result.updatedKeys.includes("fleetView")) result.updatedKeys.push("fleetView");
			result.preservedKeys = result.preservedKeys.filter((key) => key !== "fleetView");
		}
		if (nextConfig.disableDefaultAgents !== true) {
			nextConfig.disableDefaultAgents = true;
			if (!result.updatedKeys.includes("disableDefaultAgents")) result.updatedKeys.push("disableDefaultAgents");
			result.preservedKeys = result.preservedKeys.filter((key) => key !== "disableDefaultAgents");
		}
	}

	if (relativePath === ".pi/tasks-config.json") {
		if (nextConfig.showAll !== true) {
			nextConfig.showAll = true;
			if (!result.updatedKeys.includes("showAll")) result.updatedKeys.push("showAll");
			result.preservedKeys = result.preservedKeys.filter((key) => key !== "showAll");
		}
	}

	if (!result.created && result.updatedKeys.length === 0) return result;

	try {
		mkdirSync(dirname(targetPath), { recursive: true });
		writeFileSync(targetPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
	} catch (error) {
		result.errors.push(`Could not write ${formatProjectPath(targetPath, cwd)}: ${formatError(error)}`);
	}

	return result;
}

function bootstrapRalphRuntimeConfig(cwd: string): RalphRuntimeConfigBootstrapResult {
	const files = [
		mergeRuntimeConfigFile(cwd, ".pi/subagents.json", "pi-subagents settings", RALPH_SUBAGENTS_DEFAULT_CONFIG),
		mergeRuntimeConfigFile(cwd, ".pi/tasks-config.json", "pi-tasks settings", RALPH_TASKS_DEFAULT_CONFIG),
	];
	const changed = files.some((file) => file.errors.length === 0 && (file.created || file.updatedKeys.length > 0));
	return {
		files,
		changed,
		reloadRecommended: changed,
	};
}

function formatRuntimeConfigDetail(file: RalphRuntimeConfigFileResult, cwd: string): string {
	if (file.errors.length > 0) return file.errors.join("; ");
	const path = formatProjectPath(file.path, cwd);
	if (file.created) return `${path} created with defaults: ${file.updatedKeys.join(", ")}`;
	if (file.updatedKeys.length > 0) return `${path} added missing default(s): ${file.updatedKeys.join(", ")}; preserved existing: ${file.preservedKeys.join(", ") || "none"}`;
	return `${path} already contains all recommended Smart Ralph keys; preserved existing values`;
}

function runtimeConfigCheckSection(cwd: string, result: RalphRuntimeConfigBootstrapResult): CheckSection {
	return {
		title: "Ralph runtime defaults",
		checks: result.files.map((file) => ({
			label: file.label,
			ok: file.errors.length === 0,
			detail: formatRuntimeConfigDetail(file, cwd),
			action: "Fix or remove the malformed settings file, then rerun /ralph-init.",
		})),
	};
}

function validateRalphAgents(cwd: string, bootstrapResult?: RalphAgentBootstrapResult): CheckSection {
	const checks: Check[] = [];
	const agentsDir = projectRalphAgentsDir(cwd);
	const discovered = safeReadRalphAgentNames(agentsDir);
	const discoveredSet = new Set(discovered.names);
	const missingAgents = EXPECTED_RALPH_AGENTS.filter((name) => !discoveredSet.has(name));

	if (bootstrapResult) {
		checks.push({
			label: "Ralph subagent bootstrap source",
			ok: bootstrapResult.errors.length === 0 && bootstrapResult.missingSource.length === 0,
			detail: bootstrapResult.missingSource.length > 0
				? `missing bundled agent file(s): ${bootstrapAgentNames(bootstrapResult.missingSource)}`
				: `${formatPath(bootstrapResult.sourceDir)} contains bundled Ralph agent resources`,
			action: "Reinstall the Smart Ralph package so bundled agents/ralph-*.md resources are present.",
		});
		checks.push({
			label: "Project-local Ralph subagent bootstrap",
			ok: bootstrapResult.errors.length === 0 && bootstrapResult.conflicts.length === 0 && bootstrapResult.missingSource.length === 0,
			detail: `${formatBootstrapSummary(bootstrapResult)} into ${formatProjectPath(bootstrapResult.targetDir, cwd)}`,
			action: `Resolve conflicts or run /ralph-init --refresh-agents to replace existing ralph-*.md files in ${formatProjectPath(bootstrapResult.targetDir, cwd)}.`,
		});
		checks.push({
			label: "User-owned Ralph subagent conflicts",
			ok: bootstrapResult.conflicts.length === 0,
			detail: bootstrapResult.conflicts.length === 0
				? "none"
				: bootstrapResult.conflicts.map((conflict) => `${conflict.name} (${conflict.reason})`).join(", "),
			action: "Move conflicting files aside or re-run /ralph-init --refresh-agents to overwrite them explicitly.",
		});
	}

	checks.push({
		label: "@tintinweb/pi-subagents project discovery directory",
		ok: pathCheck(agentsDir, "directory"),
		detail: `${formatProjectPath(agentsDir, cwd)} is scanned as <cwd>/.pi/agents`,
		action: "Run /ralph-init in this project to bootstrap Ralph subagent definitions.",
	});
	checks.push({
		label: "Ralph subagent discovery pattern",
		ok: !discovered.error && missingAgents.length === 0,
		detail: discovered.error
			? `${formatProjectPath(agentsDir, cwd)}/ralph-*.md could not be read: ${discovered.error}`
			: `found ${discovered.names.length} file(s): ${discovered.names.join(", ") || "none"}`,
		action: `Run /ralph-init to copy expected files into ${formatProjectPath(agentsDir, cwd)}: ${EXPECTED_RALPH_AGENTS.join(", ")}`,
	});

	const pinnedModelAgents: string[] = [];

	for (const agentName of EXPECTED_RALPH_AGENTS) {
		const agentPath = projectRalphAgentPath(cwd, agentName);
		const exists = pathCheck(agentPath, "file");
		let fields: Set<string> | null = null;
		let readError: string | undefined;

		if (exists) {
			try {
				fields = frontmatterFields(readFileSync(agentPath, "utf8"));
			} catch (error) {
				readError = formatError(error);
			}
		}

		if (fields?.has("model")) pinnedModelAgents.push(agentName);

		const missingFields = fields
			? REQUIRED_AGENT_FRONTMATTER_FIELDS.filter((field) => !fields.has(field))
			: [...REQUIRED_AGENT_FRONTMATTER_FIELDS];
		const ok = exists && !readError && fields !== null && missingFields.length === 0;

		checks.push({
			label: `Subagent ${agentName.replace(/\.md$/, "")}`,
			ok,
			detail: !exists
				? `${formatProjectPath(agentPath, cwd)} is missing`
				: readError
					? `${formatProjectPath(agentPath, cwd)} could not be read: ${readError}`
					: fields === null
						? `${formatProjectPath(agentPath, cwd)} has no YAML frontmatter`
						: missingFields.length === 0
							? `${formatProjectPath(agentPath, cwd)} has required pi-subagents frontmatter`
							: `${formatProjectPath(agentPath, cwd)} missing frontmatter field(s): ${missingFields.join(", ")}`,
			action: `Run /ralph-init to restore ${formatProjectPath(agentPath, cwd)} with pi-subagents frontmatter fields: ${REQUIRED_AGENT_FRONTMATTER_FIELDS.join(", ")}.`,
		});
	}

	checks.push({
		label: "Ralph subagent model inheritance",
		ok: pinnedModelAgents.length === 0,
		detail: pinnedModelAgents.length === 0
			? "Ralph agents do not pin a provider-specific model; they inherit the active Pi model"
			: `model: frontmatter still present in ${pinnedModelAgents.join(", ")}`,
		action: "Run /ralph-init --refresh-agents to replace old provider-pinned Ralph agent files, then switch models with /ralph-model or Pi's /model.",
	});

	return { title: "Ralph subagents", checks };
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function validateRalphEnvironment(pi: ExtensionAPI, cwd: string, bootstrapResult?: RalphAgentBootstrapResult): ValidationReport {
	const packageJson = readPackageJson();
	const packageResources = validatePackageResources(packageJson);
	const registry = getToolRegistryState(pi);
	const runtimePackages = validateRuntimePackages(packageJson, registry);
	const tools = validateTools(pi, packageJson);
	const agents = validateRalphAgents(cwd, bootstrapResult);
	const sections = [packageResources, runtimePackages.section, tools.section, agents];

	return {
		ready: sections.every((section) => section.checks.every((check) => check.ok)),
		sections,
		installCommands: unique([...runtimePackages.installCommands, ...tools.installCommands]),
	};
}

function formatCheck(check: Check): string {
	const lines = [`${check.ok ? "PASS" : "FAIL"} ${check.label}: ${check.detail}`];
	if (!check.ok && check.action) {
		lines.push(`  action: ${check.action}`);
	}
	return lines.join("\n");
}

function formatDiagnostics(title: string, pi: ExtensionAPI, cwd = process.cwd(), bootstrapResult?: RalphAgentBootstrapResult, runtimeConfigResult?: RalphRuntimeConfigBootstrapResult): string {
	const validation = validateRalphEnvironment(pi, cwd, bootstrapResult);
	const lines = [
		title,
		"",
		`Package root: ${PACKAGE_ROOT}`,
		`Project root: ${resolve(cwd)}`,
		`Overall: ${validation.ready ? "PASS" : "FAIL"}`,
	];

	for (const section of validation.sections) {
		lines.push("", `${section.title}:`, ...section.checks.map(formatCheck));
	}

	if (runtimeConfigResult) {
		const section = runtimeConfigCheckSection(cwd, runtimeConfigResult);
		lines.push("", `${section.title}:`, ...section.checks.map(formatCheck));
		if (runtimeConfigResult.reloadRecommended) {
			lines.push("", "Runtime defaults were updated. Run /reload or restart Pi so pi-subagents and pi-tasks reload their settings.");
		}
	}

	if (validation.installCommands.length > 0) {
		lines.push("", "Install missing Pi packages:", ...validation.installCommands.map((command) => `  ${command}`));
	}

	if (!validation.ready) {
		lines.push(
			"",
			"Ralph workflows remain disabled until every FAIL item is resolved.",
			"After installing packages or restoring resources, run /reload or restart Pi, then re-run /ralph-init.",
			"If project-local ralph-*.md files conflict, re-run /ralph-init --refresh-agents to overwrite them explicitly.",
		);
	} else {
		lines.push("", "Smart Ralph bootstrap validation passed. No workflow has been started.");
	}

	return lines.join("\n");
}

type InitArguments = {
	refreshAgents: boolean;
	runtimeConfig: boolean;
	error?: string;
};

function parseInitArgs(args: string): InitArguments {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	let refreshAgents = false;
	let runtimeConfig = true;
	for (const token of tokens) {
		if (token === "--refresh-agents" || token === "--refresh") {
			refreshAgents = true;
			continue;
		}
		if (token === "--no-runtime-config") {
			runtimeConfig = false;
			continue;
		}
		return { refreshAgents, runtimeConfig, error: `Unknown option: ${token}. Usage: /ralph-init [--refresh-agents] [--no-runtime-config]` };
	}
	return { refreshAgents, runtimeConfig };
}

async function notify(ctx: ExtensionCommandContext, message: string, type: "info" | "warning" = "info") {
	if (ctx.hasUI) {
		ctx.ui.notify(message, type);
		return;
	}

	console.log(message);
}

const RALPH_STATUS_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const RALPH_STATUS_ANIMATION_INTERVAL_MS = 160;

type RalphStatusAnimationState = {
	active: boolean;
	ctx: ExtensionCommandContext | null;
	currentMessage: string | undefined;
	fallbackMessage: string | undefined;
	frameIndex: number;
	startedAt: number;
	timer: ReturnType<typeof setInterval> | null;
};

const ralphStatusAnimation: RalphStatusAnimationState = {
	active: false,
	ctx: null,
	currentMessage: undefined,
	fallbackMessage: undefined,
	frameIndex: 0,
	startedAt: 0,
	timer: null,
};

type RalphFooterSubagentState = {
	phase: string;
	agentName: string;
	agentId: string;
	startedAt: number;
};

type RalphGitWorkspaceInfo = {
	worktreeName: string | null;
	gitDir: string | null;
	root: string | null;
};

const RALPH_FOOTER_REFRESH_INTERVAL_MS = 250;
const ralphFooterState: {
	ctx: ExtensionCommandContext | null;
	subagent: RalphFooterSubagentState | null;
	gitInfoCache: Map<string, { expiresAt: number; value: RalphGitWorkspaceInfo }>;
	mcpCountCache: Map<string, { expiresAt: number; value: number }>;
} = {
	ctx: null,
	subagent: null,
	gitInfoCache: new Map(),
	mcpCountCache: new Map(),
};

function formatRalphElapsed(startedAt: number): string {
	const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes < 60) return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return `${hours}h${remainingMinutes.toString().padStart(2, "0")}m`;
}

function renderAnimatedRalphStatus(message: string): string {
	const frame = RALPH_STATUS_SPINNER_FRAMES[ralphStatusAnimation.frameIndex % RALPH_STATUS_SPINNER_FRAMES.length] ?? "•";
	ralphStatusAnimation.frameIndex += 1;
	const elapsed = ralphStatusAnimation.startedAt > 0 ? ` (${formatRalphElapsed(ralphStatusAnimation.startedAt)})` : "";
	return `${frame} ${message}${elapsed}`;
}

function renderRalphStatus(): void {
	const ctx = ralphStatusAnimation.ctx;
	if (!ctx?.hasUI || typeof ctx.ui.setStatus !== "function") return;

	const message = ralphStatusAnimation.currentMessage ?? ralphStatusAnimation.fallbackMessage;
	if (!message) {
		ctx.ui.setStatus("ralph", undefined);
		return;
	}

	ctx.ui.setStatus("ralph", ralphStatusAnimation.active ? renderAnimatedRalphStatus(message) : message);
}

function setRalphStatus(ctx: ExtensionCommandContext, message?: string): void {
	if (ralphStatusAnimation.active) {
		ralphStatusAnimation.ctx = ctx;
		ralphStatusAnimation.currentMessage = message;
		renderRalphStatus();
		return;
	}

	if (ctx.hasUI && typeof ctx.ui.setStatus === "function") ctx.ui.setStatus("ralph", message);
}

function startRalphStatusAnimation(ctx: ExtensionCommandContext, fallbackMessage: string): void {
	if (!ctx.hasUI) return;
	stopRalphStatusAnimation();
	ralphStatusAnimation.active = true;
	ralphStatusAnimation.ctx = ctx;
	ralphStatusAnimation.currentMessage = undefined;
	ralphStatusAnimation.fallbackMessage = fallbackMessage;
	ralphStatusAnimation.frameIndex = 0;
	ralphStatusAnimation.startedAt = Date.now();
	renderRalphStatus();
	const timer = setInterval(renderRalphStatus, RALPH_STATUS_ANIMATION_INTERVAL_MS);
	(timer as { unref?: () => void }).unref?.();
	ralphStatusAnimation.timer = timer;
}

function stopRalphStatusAnimation(ctx?: ExtensionCommandContext): void {
	if (ralphStatusAnimation.timer) {
		clearInterval(ralphStatusAnimation.timer);
		ralphStatusAnimation.timer = null;
	}
	const statusCtx = ctx ?? ralphStatusAnimation.ctx;
	ralphStatusAnimation.active = false;
	ralphStatusAnimation.ctx = null;
	ralphStatusAnimation.currentMessage = undefined;
	ralphStatusAnimation.fallbackMessage = undefined;
	ralphStatusAnimation.frameIndex = 0;
	ralphStatusAnimation.startedAt = 0;
	if (statusCtx?.hasUI && typeof statusCtx.ui.setStatus === "function") statusCtx.ui.setStatus("ralph", undefined);
}

function footerThinkingColor(level: ReturnType<ExtensionAPI["getThinkingLevel"]>): "thinkingOff" | "thinkingMinimal" | "thinkingLow" | "thinkingMedium" | "thinkingHigh" | "thinkingXhigh" {
	switch (level) {
		case "minimal":
			return "thinkingMinimal";
		case "low":
			return "thinkingLow";
		case "medium":
			return "thinkingMedium";
		case "high":
			return "thinkingHigh";
		case "xhigh":
			return "thinkingXhigh";
		case "off":
		default:
			return "thinkingOff";
	}
}

function formatFooterBadge(theme: { fg(color: any, text: string): string; bold(text: string): string }, content: string, color: string = "text"): string {
	return `${theme.fg("accent", "[")}${theme.fg(color as any, theme.bold(content))}${theme.fg("accent", "]")}`;
}

function formatFooterBar(current: number, max: number, width = 16): string {
	if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
		return `[>${"-".repeat(Math.max(0, width - 1))}]`;
	}
	const percent = Math.max(0, Math.min(1, current / max));
	const filled = percent >= 1 ? width : Math.max(0, Math.floor(percent * width));
	let bar: string;
	if (filled <= 0) {
		bar = `>${"-".repeat(Math.max(0, width - 1))}`;
	} else if (filled >= width) {
		bar = "=".repeat(width);
	} else {
		bar = `${"=".repeat(filled)}>${"-".repeat(Math.max(0, width - filled - 1))}`;
	}
	return `[${bar}]`;
}

function formatFooterProgress(current: number, max: number, width = 16): string {
	if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
		return `0.0% ${formatFooterBar(0, 1, width)} 0/0`;
	}
	const safeCurrent = Math.max(0, current);
	const safeMax = Math.max(1, max);
	const percent = Math.max(0, Math.min(100, (safeCurrent / safeMax) * 100));
	return `${percent.toFixed(1)}% ${formatFooterBar(safeCurrent, safeMax, width)} ${formatTokenCount(safeCurrent)}/${formatTokenCount(safeMax)}`;
}

function formatFooterElapsed(startedAt: number, endedAt?: number): string {
	const end = typeof endedAt === "number" && Number.isFinite(endedAt) ? endedAt : Date.now();
	const totalSeconds = Math.max(0, Math.floor((end - startedAt) / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return hours > 0 ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}` : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatMainContextUsage(ctx: ExtensionCommandContext): string {
	const usage = ctx.getContextUsage();
	if (!usage) return `🪟 ${formatFooterProgress(0, 0)}`;
	const current = usage.tokens !== null && Number.isFinite(usage.tokens) ? usage.tokens : 0;
	const max = Number.isFinite(usage.contextWindow) ? usage.contextWindow : 0;
	return `🪟 ${formatFooterProgress(current, max)}`;
}

function ralphFooterProjectDirectory(ctx: ExtensionCommandContext): string {
	const name = basename(ctx.cwd);
	return name && name !== "/" ? name : ctx.cwd;
}

function detectGitWorkspaceInfo(cwd: string): RalphGitWorkspaceInfo {
	const cached = ralphFooterState.gitInfoCache.get(cwd);
	if (cached && cached.expiresAt > Date.now()) return cached.value;

	const topLevel = runGitCommand(cwd, ["rev-parse", "--show-toplevel"]);
	if (!topLevel.ok || !topLevel.stdout) {
		const value = { worktreeName: null, gitDir: null, root: null };
		ralphFooterState.gitInfoCache.set(cwd, { expiresAt: Date.now() + 5_000, value });
		return value;
	}

	const gitDirResult = runGitCommand(cwd, ["rev-parse", "--absolute-git-dir"]);
	const gitDir = gitDirResult.ok && gitDirResult.stdout ? gitDirResult.stdout.split(/\r?\n/).at(-1)?.trim() || null : null;
	const worktreeMatch = gitDir?.match(/[\\/]worktrees[\\/]([^\\/]+)$/);
	const value = {
		worktreeName: worktreeMatch?.[1] ?? null,
		gitDir,
		root: topLevel.stdout.split(/\r?\n/).at(-1)?.trim() || null,
	};
		ralphFooterState.gitInfoCache.set(cwd, { expiresAt: Date.now() + 5_000, value });
	return value;
}

function readRalphFooterSpecSummary(ctx: ExtensionCommandContext): {
	epicName: string;
	specName: string;
} {
	const options = pathOptions(ctx);
	const epicName = readCurrentEpicName(options) ?? "no epic";
	const currentSpecValue = readCurrentSpecValue(options);
	const spec = currentSpecValue ? resolveCurrentSpec(options) : null;
	return { epicName, specName: spec?.name ?? currentSpecValue ?? "no spec" };
}

function readFooterConversationUsage(ctx: ExtensionCommandContext): { input: number; output: number; cost: number } {
	let input = 0;
	let output = 0;
	let cost = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const usage = (entry.message as { usage?: { input?: number; output?: number; cost?: { total?: number } } }).usage;
		input += usage?.input ?? 0;
		output += usage?.output ?? 0;
		cost += usage?.cost?.total ?? 0;
	}
	return { input, output, cost };
}

function formatFooterIoBadge(theme: { fg(color: any, text: string): string; bold(text: string): string }, usage: { input: number; output: number; cost: number }): string {
	const content = [
		theme.fg("muted", "📊 "),
		theme.fg("syntaxFunction", `▼I ${formatTokenCount(usage.input)}`),
		theme.fg("muted", " "),
		theme.fg("syntaxString", `▲O ${formatTokenCount(usage.output)}`),
		theme.fg("muted", " "),
		theme.fg("syntaxNumber", `$${usage.cost.toFixed(3)}`),
	].join("");
	return `${theme.fg("accent", "[")}${content}${theme.fg("accent", "]")}`;
}

function countMcpServersInConfig(path: string): number {
	if (!existsSync(path)) return 0;
		try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		const servers = raw.mcpServers ?? raw["mcp-servers"];
		return servers && typeof servers === "object" && !Array.isArray(servers) ? Object.keys(servers).length : 0;
	} catch {
		return 0;
	}
}

function readConfiguredMcpServerCount(cwd: string): number {
	const cached = ralphFooterState.mcpCountCache.get(cwd);
	if (cached && cached.expiresAt > Date.now()) return cached.value;

	const configPaths = [
		join(homedir(), ".config", "mcp", "mcp.json"),
		join(homedir(), ".pi", "agent", "mcp.json"),
		resolve(cwd, ".mcp.json"),
		resolve(cwd, ".pi", "mcp.json"),
	];
	const value = Math.max(0, configPaths.reduce((max, path) => Math.max(max, countMcpServersInConfig(path)), 0));
		ralphFooterState.mcpCountCache.set(cwd, { expiresAt: Date.now() + 5_000, value });
	return value;
}

function formatFooterMcpBadge(
	theme: { fg(color: any, text: string): string; bold(text: string): string },
	registry: ToolRegistryState,
	cwd: string,
): string {
	const total = readConfiguredMcpServerCount(cwd);
	const active = total > 0 && registry.activeToolNames.has("mcp") ? total : 0;
	return formatFooterBadge(theme, `⚙  mcp ${active}/${total}`, active > 0 ? "success" : "dim");
}

function installRalphFooter(pi: ExtensionAPI, ctx: ExtensionCommandContext): void {
	if (!ctx.hasUI) return;
	ralphFooterState.ctx = ctx;
	ctx.ui.setFooter((tui, theme, footerData) => {
		const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());
		const timer = setInterval(() => {
			if (ralphStatusAnimation.active) tui.requestRender();
		}, RALPH_FOOTER_REFRESH_INTERVAL_MS);
		(timer as { unref?: () => void }).unref?.();

		return {
			dispose() {
				unsubscribeBranch();
				clearInterval(timer);
			},
			invalidate() {},
			render(width: number): string[] {
				const branch = footerData.getGitBranch() ?? "no git";
				const summary = readRalphFooterSpecSummary(ctx);
				const thinking = pi.getThinkingLevel();
				const thinkingColor = footerThinkingColor(thinking);
				const modelLabel = ctx.model?.id ?? "no-model";
				const topParts = [
					formatFooterBadge(theme, `${theme.fg("muted", "📁 ")}${theme.fg("syntaxFunction", ralphFooterProjectDirectory(ctx))}`),
					formatFooterBadge(theme, `${theme.fg("muted", "𖦥 ")}${theme.fg("syntaxString", branch)}`),
					formatFooterBadge(theme, `${theme.fg("muted", "👾 ")}${theme.fg("syntaxType", modelLabel)} ${theme.fg("muted", "💭 ")}${theme.fg(thinkingColor, thinking)}`),
					formatFooterBadge(theme, summary.epicName === "no epic"
						? `${theme.fg("muted", "📋 no epic")}`
						: `${theme.fg("muted", "📋 ")}${theme.fg("mdHeading", summary.epicName)}`,
						summary.epicName === "no epic" ? "dim" : "text"),
					formatFooterBadge(theme, summary.specName === "no spec"
						? `${theme.fg("muted", "🎯 no spec")}`
						: `${theme.fg("muted", "🎯 ")}${theme.fg("success", summary.specName)}`,
						summary.specName === "no spec" ? "dim" : "text"),
				];
				const topLine = topParts.join(" ");
				const registry = getToolRegistryState(pi);
				const mainUsage = readFooterConversationUsage(ctx);
				const bottomParts = [
					theme.fg("text", formatMainContextUsage(ctx)),
					(mainUsage.input > 0 || mainUsage.output > 0 || mainUsage.cost > 0)
						? formatFooterIoBadge(theme, mainUsage)
						: formatFooterBadge(theme, theme.fg("muted", "📊 idle"), "dim"),
					formatFooterMcpBadge(theme, registry, ctx.cwd),
				].join(" ");
				return [truncateToWidth(topLine, width, "…"), truncateToWidth(bottomParts, width, "…")];
			},
		};
	});
}

function printJsonOutput(ctx: ExtensionCommandContext, message: string, type: "info" | "warning" = "info"): void {
	console.log(message);
	if (ctx.hasUI) ctx.ui.notify("Ralph epic status JSON printed to stdout.", type);
}

const SPEC_ARTIFACTS = ["research", "requirements", "design", "tasks"] as const;
const ARTIFACT_REVIEWER_AGENT = "ralph-spec-reviewer";
const ARTIFACT_REVIEW_MAX_ITERATIONS = 3;

type TaskCounts = {
	completed: number;
	pending: number;
	total: number;
};

const NATIVE_TASK_TOOLS = ["TaskCreate", "TaskUpdate", "TaskExecute"] as const;
const WEB_RESEARCH_TOOLS = ["agent_browser"] as const;
const WEB_FETCH_TOOLS = ["agent_browser"] as const;
const MCP_PROXY_TOOL = "mcp";
const NATIVE_TASK_LOCK_RETRY_MS = 50;
const NATIVE_TASK_LOCK_MAX_RETRIES = 100;
const RALPH_NATIVE_TASK_WIDGET_KEY = "ralph-tasks";
const NATIVE_TASK_WIDGET_LIMIT = 10;

type NativeTaskStatus = "pending" | "in_progress" | "completed";

type NativeTaskCard = {
	id: string;
	subject: string;
	description: string;
	status: NativeTaskStatus;
	activeForm?: string;
	owner?: string;
	metadata: Record<string, unknown>;
	blocks: string[];
	blockedBy: string[];
	createdAt: number;
	updatedAt: number;
};

type NativeTaskStoreData = {
	nextId: number;
	tasks: NativeTaskCard[];
};

type ParsedNativeTask = {
	index: number;
	checkboxKey: string;
	stableKey: string;
	taskNumber?: string;
	phase: string;
	rawTitle: string;
	subject: string;
	description: string;
	activeForm: string;
	status: NativeTaskStatus;
	isParallel: boolean;
	isVerify: boolean;
	agentType: string;
	fields: Record<string, string>;
	blockedByIndices: number[];
	startLine: number;
	endLine: number;
	block: string;
};

type NativeTaskMirrorResult = {
	created: number;
	updated: number;
	deleted: number;
	total: number;
	storePath: string;
	nativeTaskMap: Record<string, string>;
};

type SafeStateRead = {
	path: string;
	state: RalphState | null;
	error?: string;
};

type CancelArguments = {
	reference: string | null;
	deleteSpec: boolean;
	error?: string;
};

type EpicNextArguments = {
	reference: string | null;
	switchSpec: boolean;
	startSpec: boolean;
	peek: boolean;
	error?: string;
};

type EpicCancelArguments = {
	reference: string | null;
	deleteChildSpecs: boolean;
	error?: string;
};

type EpicStatusArguments = {
	reference: string | null;
	json: boolean;
	repair: boolean;
	error?: string;
};

type EpicRepairResult = {
	changes: string[];
	warnings: string[];
	validationWarnings: string[];
	stateChanged: boolean;
	childFilesChanged: boolean;
};

type StartPhase = "research" | "requirements" | "design" | "tasks" | "execution";

type StartCommandName = "ralph-start" | "ralph-new";

type StartInvocation = {
	command: StartCommandName;
	aliasOf?: "ralph-start";
};

const RALPH_START_INVOCATION: StartInvocation = { command: "ralph-start" };
const RALPH_NEW_INVOCATION: StartInvocation = { command: "ralph-new", aliasOf: "ralph-start" };

type StartArguments = {
	reference: string | null;
	goal: string;
	fresh: boolean;
	quickMode: boolean;
	autonomousMode: boolean;
	skipResearch: boolean;
	nextEpicSpec: boolean;
	commitSpec?: boolean;
	specsDir?: string;
	tasksSize?: "fine" | "coarse";
	warnings: string[];
	error?: string;
};

type StartOptionsSnapshot = {
	reference: string | null;
	goalProvided: boolean;
	skipResearch: boolean;
	specsDir?: string;
	tasksSize?: "fine" | "coarse";
	commitSpec?: boolean;
	quickMode: boolean;
	autonomousMode: boolean;
	nextEpicSpec: boolean;
};

type StartCompatibilityContractV1 = {
	command: StartCommandName;
	aliasOf?: "ralph-start";
	options: StartOptionsSnapshot;
	branchDecision: BranchDecision;
	specRoot: { path: string; absolutePath: string; source: "default" | "settings" };
	statePatch: Record<string, unknown>;
};

type StartSummaryMetadata = {
	branchDecision: {
		mode: BranchDecision["mode"];
		targetBranch?: string;
		applied: boolean;
		reason: string;
	};
	discoveryCounts: {
		relatedSpecs: number;
		discoveredSkills: number;
	};
};

type StartTarget = {
	spec: SpecEntry;
	isNew: boolean;
};

type EpicStartContext = {
	epic: CurrentEpic;
	state: EpicState;
	child: EpicChildSpec;
	dependencyStatus: EpicSpecDependencyStatus | null;
	selectedByNextFlag: boolean;
};

type ActiveEpicRead = {
	currentName: string | null;
	epic?: CurrentEpic;
	stateRead?: SafeEpicStateRead;
	summary?: ReturnType<typeof computeEpicDependencyStatus>;
	warnings: string[];
	error?: string;
};

type EpicStartSelection =
	| { kind: "none" }
	| { kind: "selected"; context: EpicStartContext; warnings: string[] }
	| { kind: "message"; message: string; type: "info" | "warning" }
	| { kind: "error"; message: string };

type EpicCompletionNotification = {
	lines: string[];
	type: "info" | "warning";
};

function pathOptions(ctx: ExtensionCommandContext): RalphPathOptions {
	return { cwd: ctx.cwd };
}

function formatRootLabel(root: SpecRoot): string {
	const details: string[] = [];
	if (root.source === "default") details.push("default");
	if (!root.exists) details.push("missing");
	return details.length > 0 ? `${root.path} (${details.join(", ")})` : root.path;
}

function isSpecInConfiguredRoot(spec: SpecEntry, options: RalphPathOptions): boolean {
	return getSpecRoots({ ...options, allowMissingConfiguredRoots: true }).some(
		(root) => root.exists && root.absolutePath === spec.rootAbsolutePath,
	);
}

function specDeleteSafetyError(spec: SpecEntry, options: RalphPathOptions): string | null {
	if (!spec.exists) return `Spec directory does not exist: ${spec.path}`;
	if (spec.name.startsWith(".")) return `Refusing to delete hidden directory: ${spec.path}`;
	if (!isSpecInConfiguredRoot(spec, options)) {
		return `Refusing to delete ${spec.path}; it is not under a configured specs root.`;
	}
	if (spec.absolutePath === spec.rootAbsolutePath) {
		return `Refusing to delete specs root itself: ${spec.path}`;
	}
	return null;
}

type RalphCompletionItem = {
	value: string;
	label: string;
	description?: string;
};

function argumentTail(argumentText: string): { head: string; token: string } {
	const match = argumentText.match(/^([\s\S]*?)([^\s]*)$/);
	return { head: match?.[1] ?? "", token: match?.[2] ?? argumentText };
}

function completionMatches(item: RalphCompletionItem, token: string): boolean {
	if (!token) return true;
	const normalized = token.toLowerCase();
	return item.value.toLowerCase().startsWith(normalized)
		|| item.label.toLowerCase().includes(normalized)
		|| (item.description?.toLowerCase().includes(normalized) ?? false);
}

function uniqueCompletionItems(items: RalphCompletionItem[]): RalphCompletionItem[] {
	const seen = new Set<string>();
	const uniqueItems: RalphCompletionItem[] = [];
	for (const item of items) {
		if (seen.has(item.value)) continue;
		seen.add(item.value);
		uniqueItems.push(item);
	}
	return uniqueItems;
}

function completeArgumentToken(argumentText: string, candidates: RalphCompletionItem[]): RalphCompletionItem[] | null {
	const { head, token } = argumentTail(argumentText);
	const filtered = uniqueCompletionItems(candidates).filter((item) => completionMatches(item, token));
	if (filtered.length === 0) return null;
	return filtered.map((item) => ({ ...item, value: `${head}${item.value}` }));
}

function previousArgumentToken(argumentText: string): string | null {
	const tokenized = tokenizeCommandArgs(argumentText);
	if (tokenized.error || tokenized.tokens.length === 0) return null;
	if (/\s$/.test(argumentText)) return tokenized.tokens[tokenized.tokens.length - 1] ?? null;
	return tokenized.tokens[tokenized.tokens.length - 2] ?? null;
}

function completeOptionValues(argumentText: string, optionName: string, values: RalphCompletionItem[]): RalphCompletionItem[] | null {
	const { head, token } = argumentTail(argumentText);
	if (token.startsWith(`${optionName}=`)) {
		const valuePrefix = token.slice(optionName.length + 1);
		const filtered = values.filter((item) => completionMatches(item, valuePrefix));
		return filtered.length > 0
			? filtered.map((item) => ({ ...item, value: `${head}${optionName}=${item.value}` }))
			: null;
	}

	if (previousArgumentToken(argumentText) !== optionName) return null;
	const filtered = values.filter((item) => completionMatches(item, token));
	return filtered.length > 0 ? filtered.map((item) => ({ ...item, value: `${head}${item.value}` })) : null;
}

function directoryPathCompletionItems(pathPrefix: string): RalphCompletionItem[] {
	const normalizedPrefix = pathPrefix.replace(/\\/g, "/");
	const lastSlash = normalizedPrefix.lastIndexOf("/");
	const dirPrefix = lastSlash === -1 ? "" : normalizedPrefix.slice(0, lastSlash + 1);
	const entryPrefix = lastSlash === -1 ? normalizedPrefix : normalizedPrefix.slice(lastSlash + 1);
	const basePath = normalizedPrefix.startsWith("~/")
		? resolve(homedir(), dirPrefix.slice(2) || ".")
		: normalizedPrefix.startsWith("/")
			? resolve(dirPrefix || "/")
			: resolve(process.cwd(), dirPrefix || ".");

	let entries: any[];
	try {
		entries = readdirSync(basePath, { withFileTypes: true });
	} catch {
		return [];
	}

	return entries
		.filter((entry) => entry.isDirectory() && (!entryPrefix || entry.name.toLowerCase().startsWith(entryPrefix.toLowerCase())))
		.map((entry) => {
			const value = `${dirPrefix}${entry.name}/`;
			return { value, label: value, description: "directory" };
		})
		.sort((left, right) => left.label.localeCompare(right.label));
}

function completeDirectoryOptionValues(argumentText: string, optionNames: string | string[]): RalphCompletionItem[] | null {
	const names = Array.isArray(optionNames) ? optionNames : [optionNames];
	const { head, token } = argumentTail(argumentText);

	for (const optionName of names) {
		if (!token.startsWith(`${optionName}=`)) continue;
		const pathPrefix = token.slice(optionName.length + 1);
		const suggestions = directoryPathCompletionItems(pathPrefix);
		return suggestions.length > 0
			? suggestions.map((item) => ({ ...item, value: `${head}${optionName}=${item.value}` }))
			: null;
	}

	const previous = previousArgumentToken(argumentText);
	if (!previous || !names.includes(previous)) return null;
	const suggestions = directoryPathCompletionItems(token);
	return suggestions.length > 0 ? suggestions.map((item) => ({ ...item, value: `${head}${item.value}` })) : null;
}

function flagItem(value: string, description: string): RalphCompletionItem {
	return { value: `${value} `, label: value, description };
}

function specCompletionCandidates(options: RalphPathOptions = {}): RalphCompletionItem[] {
	const items = listSpecs({ ...options, allowMissingConfiguredRoots: true }).flatMap((spec) => {
		const values = spec.path === `./specs/${spec.name}` ? [spec.name] : [spec.name, spec.path];
		return values.map((value) => ({ value, label: value, description: spec.path }));
	});

	for (const epic of listEpics({ ...options, allowMissingConfiguredRoots: true })) {
		const read = safeReadEpicState(epic, options);
		const specs = read.state && Array.isArray(read.state.specs) ? read.state.specs : [];
		for (const spec of specs) {
			if (!isValidSpecName(spec.name)) continue;
			items.push({
				value: spec.name,
				label: spec.name,
				description: `child of epic ${epic.name} (${spec.status ?? "unknown"})`,
			});
		}
	}

	return uniqueCompletionItems(items);
}

function specArgumentCompletions(prefix: string) {
	try {
		return completeArgumentToken(prefix, specCompletionCandidates());
	} catch {
		return null;
	}
}

const TASK_SIZE_COMPLETIONS: RalphCompletionItem[] = [
	{ value: "fine", label: "fine", description: "40-60+ smaller tasks with verification checkpoints" },
	{ value: "coarse", label: "coarse", description: "10-20 larger tasks" },
];

const INDEX_TYPE_COMPLETIONS: RalphCompletionItem[] = [
	{ value: "controllers", label: "controllers", description: "Index controller/route entrypoints" },
	{ value: "services", label: "services", description: "Index service and use-case modules" },
	{ value: "models", label: "models", description: "Index schemas, entities, and data models" },
	{ value: "helpers", label: "helpers", description: "Index shared utilities and helper modules" },
	{ value: "migrations", label: "migrations", description: "Index migration and schema change files" },
	{ value: "other", label: "other", description: "Index uncategorized code artifacts" },
];

const INDEX_EXCLUDE_COMPLETIONS: RalphCompletionItem[] = [
	{ value: "node_modules/", label: "node_modules/", description: "Skip installed dependencies" },
	{ value: "dist/", label: "dist/", description: "Skip build output" },
	{ value: "build/", label: "build/", description: "Skip build artifacts" },
	{ value: "coverage/", label: "coverage/", description: "Skip test coverage output" },
	{ value: ".git/", label: ".git/", description: "Skip Git metadata" },
	{ value: "specs/", label: "specs/", description: "Skip generated spec artifacts" },
];

const IMPLEMENT_ITERATION_COMPLETIONS: RalphCompletionItem[] = [
	{ value: "3", label: "3", description: "Tighter retry cap" },
	{ value: "5", label: "5", description: "Default per-task retry cap" },
	{ value: "10", label: "10", description: "More retries before blocking" },
	{ value: "25", label: "25", description: "Conservative global loop cap" },
	{ value: "50", label: "50", description: "Medium global loop cap" },
	{ value: "100", label: "100", description: "Default global loop cap" },
];

function startArgumentCompletions(prefix: string) {
	try {
		return completeDirectoryOptionValues(prefix, "--specs-dir")
			?? completeOptionValues(prefix, "--tasks-size", TASK_SIZE_COMPLETIONS)
			?? completeArgumentToken(prefix, [
				flagItem("--fresh", "Reinitialize the target spec before starting"),
				flagItem("--quick", "Generate artifacts and implement without approval prompts"),
				flagItem("--autonomous", "Alias for autonomous quick flow"),
				flagItem("--auto", "Alias for autonomous quick flow"),
				flagItem("--skip-research", "Start a new spec at requirements"),
				flagItem("--next-epic-spec", "Select the active epic's next unblocked child spec"),
				flagItem("--epic-next", "Alias for --next-epic-spec"),
				flagItem("--commit-spec", "Commit generated spec artifacts before implementation"),
				flagItem("--no-commit-spec", "Do not commit generated spec artifacts"),
				flagItem("--specs-dir", "Write the spec under a custom specs root"),
				flagItem("--tasks-size", "Set generated task granularity"),
				...specCompletionCandidates(),
			]);
	} catch {
		return null;
	}
}

function phaseArgumentCompletions(prefix: string, includeTasksSize = false) {
	try {
		const taskSizeCompletions = includeTasksSize ? completeOptionValues(prefix, "--tasks-size", TASK_SIZE_COMPLETIONS) : null;
		return taskSizeCompletions ?? completeArgumentToken(prefix, [
			flagItem("--quick", "Skip approval prompts for this artifact"),
			flagItem("--autonomous", "Alias for quick artifact flow"),
			flagItem("--auto", "Alias for quick artifact flow"),
			...(includeTasksSize ? [flagItem("--tasks-size", "Set generated task granularity")] : []),
			...specCompletionCandidates(),
		]);
	} catch {
		return null;
	}
}

function implementArgumentCompletions(prefix: string) {
	try {
		return completeOptionValues(prefix, "--max-task-iterations", IMPLEMENT_ITERATION_COMPLETIONS)
			?? completeOptionValues(prefix, "--max-global-iterations", IMPLEMENT_ITERATION_COMPLETIONS)
			?? completeArgumentToken(prefix, [
				flagItem("--recovery-mode", "Resume with extra blocker-tolerant recovery behavior"),
				flagItem("--max-task-iterations", "Set the per-task retry cap"),
				flagItem("--max-global-iterations", "Set the overall coordinator loop cap"),
				...specCompletionCandidates(),
			]);
	} catch {
		return null;
	}
}

function cancelArgumentCompletions(prefix: string) {
	try {
		return completeArgumentToken(prefix, [
			flagItem("--delete", "Also request spec directory deletion after confirmation"),
			flagItem("--delete-spec", "Alias for --delete"),
			...specCompletionCandidates(),
		]);
	} catch {
		return null;
	}
}

function refactorArgumentCompletions(prefix: string) {
	try {
		return completeOptionValues(prefix, "--file", REFACTOR_ALLOWED_FILES.map((value) => ({
			value,
			label: value,
			description: `Refactor ${value}.md`,
		}))) ?? completeArgumentToken(prefix, [
			flagItem("--file", "Choose one artifact to refactor"),
			...specCompletionCandidates(),
		]);
	} catch {
		return null;
	}
}

function modelArgumentCompletions(prefix: string) {
	try {
		const providerModels = RALPH_SUPPORTED_MODEL_PROVIDERS.flatMap((profile) => profile.preferredModels.map((modelId) => ({
			value: `${profile.provider}/${modelId}`,
			label: `${profile.provider}/${modelId}`,
			description: `Preferred ${profile.provider} model`,
		})));
		return completeArgumentToken(prefix, [
			{ value: "auto", label: "auto", description: "Pick the best supported provider automatically" },
			{ value: "inherit", label: "inherit", description: "Refresh Ralph agents to inherit the active Pi model" },
			{ value: "current", label: "current", description: "Alias for inherit/current status refresh" },
			...RALPH_SUPPORTED_MODEL_PROVIDERS.map((profile) => ({
				value: profile.provider,
				label: profile.provider,
				description: profile.label,
			})),
			...providerModels,
		]);
	} catch {
		return null;
	}
}

function statusArgumentCompletions(prefix: string) {
	try {
		return completeArgumentToken(prefix, [
			flagItem("--bootstrap", "Show bootstrap/runtime diagnostics"),
			flagItem("--diagnostics", "Alias for --bootstrap"),
		]);
	} catch {
		return null;
	}
}

function initArgumentCompletions(prefix: string) {
	try {
		return completeArgumentToken(prefix, [
			flagItem("--refresh-agents", "Overwrite conflicting bundled ralph-*.md subagent files"),
			flagItem("--refresh", "Alias for --refresh-agents"),
			flagItem("--no-runtime-config", "Skip writing runtime default configuration files"),
		]);
	} catch {
		return null;
	}
}

function indexArgumentCompletions(prefix: string) {
	try {
		return completeDirectoryOptionValues(prefix, "--path")
			?? completeOptionValues(prefix, "--type", INDEX_TYPE_COMPLETIONS)
			?? completeOptionValues(prefix, "--exclude", INDEX_EXCLUDE_COMPLETIONS)
			?? completeArgumentToken(prefix, [
				flagItem("--path", "Scan only the provided directory or subtree"),
				flagItem("--type", "Filter indexed component categories"),
				flagItem("--exclude", "Skip paths matching the provided pattern"),
				flagItem("--dry-run", "Preview index writes without modifying files"),
				flagItem("--force", "Rewrite all index artifacts even when unchanged"),
				flagItem("--changed", "Index only changed files in the current Git worktree"),
				flagItem("--quick", "Skip confirmation prompts where applicable"),
			]);
	} catch {
		return null;
	}
}

function safeReadSpecState(spec: SpecEntry, options: RalphPathOptions): SafeStateRead {
	const statePath = getRalphStatePath(spec, options);
	try {
		return { path: statePath, state: readRalphState(spec, options) };
	} catch (error) {
		return { path: statePath, state: null, error: formatError(error) };
	}
}

function stringField(state: RalphState | null, key: string): string | undefined {
	const value = state?.[key];
	return typeof value === "string" ? value : undefined;
}

function numberField(state: RalphState | null, key: string): number | undefined {
	const value = state?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanField(state: RalphState | null, key: string): boolean | undefined {
	const value = state?.[key];
	return typeof value === "boolean" ? value : undefined;
}

function artifactPath(spec: SpecEntry, artifact: (typeof SPEC_ARTIFACTS)[number]): string {
	return join(spec.absolutePath, `${artifact}.md`);
}

function artifactExists(spec: SpecEntry, artifact: (typeof SPEC_ARTIFACTS)[number]): boolean {
	return existsSync(artifactPath(spec, artifact));
}

function formatArtifactIndicators(spec: SpecEntry): string {
	return SPEC_ARTIFACTS.map((artifact) => `[${artifactExists(spec, artifact) ? "x" : " "}] ${artifact}`).join(" ");
}

function countTasks(spec: SpecEntry): TaskCounts {
	const tasksPath = artifactPath(spec, "tasks");
	if (!existsSync(tasksPath)) {
		return { completed: 0, pending: 0, total: 0 };
	}

	const content = readFileSync(tasksPath, "utf8");
	const completed = content.match(/^\s*-\s*\[[xX]\]/gm)?.length ?? 0;
	const pending = content.match(/^\s*-\s*\[ \]/gm)?.length ?? 0;
	return { completed, pending, total: completed + pending };
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTaskBodyFields(bodyLines: string[]): Record<string, string> {
	const fields: Record<string, string> = {};
	const knownFields = new Set([
		"do",
		"files",
		"done when",
		"verify",
		"commit",
		"requirements",
		"design",
	]);
	let currentField: string | undefined;

	for (const line of bodyLines) {
		const fieldMatch = line.match(/^\s*(?:-\s*)?(?:\*\*)?([^:*]+?)(?:\*\*)?:\s*(.*)$/);
		if (fieldMatch) {
			const candidateField = fieldMatch[1].trim().toLowerCase();
			if (knownFields.has(candidateField)) {
				currentField = candidateField;
				fields[currentField] = fieldMatch[2].trim();
				continue;
			}
		}

		if (currentField && line.trim()) {
			fields[currentField] = `${fields[currentField]}\n${line.trim()}`.trim();
		}
	}

	return fields;
}

function cleanTaskDescription(bodyLines: string[], fallback: string): string {
	const description = bodyLines
		.map((line) => line.replace(/^\s{0,4}/, "").trimEnd())
		.join("\n")
		.trim();
	return description || fallback;
}

function taskStableFallback(index: number, title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return `index-${index}${slug ? `-${slug}` : ""}`;
}

function taskAgentType(isVerify: boolean, phase: string): string {
	if (isVerify) return "ralph-qa-engineer";
	if (/refactor/i.test(phase)) return "ralph-refactor-specialist";
	return "ralph-spec-executor";
}

function parseNativeTaskTitle(rawTitle: string, index: number, phase: string) {
	const isVerify = /\[VERIFY\]/i.test(rawTitle);
	const isParallel = /\[P\]/i.test(rawTitle);
	const strippedTitle = normalizeWhitespace(rawTitle.replace(/\[(?:VERIFY|P)\]/gi, " "));
	const numberMatch = strippedTitle.match(/^(\d+(?:\.\d+)*\.?)\s+(.+)$/);
	const taskNumber = numberMatch?.[1].replace(/\.$/, "");
	const titleWithoutNumber = numberMatch ? numberMatch[2].trim() : strippedTitle;
	const coreTitle = normalizeWhitespace(taskNumber ? `${taskNumber} ${titleWithoutNumber}` : titleWithoutNumber);
	const subject = isVerify ? `[VERIFY] ${coreTitle}` : isParallel ? `[P] ${coreTitle}` : coreTitle;
	const activeForm = isVerify ? `Verifying ${coreTitle}` : isParallel ? `Executing [P] ${coreTitle}` : `Executing ${coreTitle}`;
	const stableKey = taskNumber ?? taskStableFallback(index, titleWithoutNumber || rawTitle);

	return {
		isVerify,
		isParallel,
		taskNumber,
		subject,
		activeForm,
		stableKey,
		agentType: taskAgentType(isVerify, phase),
	};
}

function parseTasksForNativeCards(content: string): ParsedNativeTask[] {
	const lines = content.split(/\r?\n/);
	const parsedTasks: ParsedNativeTask[] = [];
	let phase = "";

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const headingMatch = lines[lineIndex].match(/^##\s+(.+?)\s*$/);
		if (headingMatch) {
			phase = headingMatch[1].trim();
			continue;
		}

		const taskMatch = lines[lineIndex].match(/^\s*-\s*\[([ xX])\]\s+(.+?)\s*$/);
		if (!taskMatch) continue;

		const bodyLines: string[] = [];
		let nextLineIndex = lineIndex + 1;
		for (; nextLineIndex < lines.length; nextLineIndex += 1) {
			if (/^\s*-\s*\[[ xX]\]\s+\S+/.test(lines[nextLineIndex]) || /^##\s+/.test(lines[nextLineIndex])) {
				break;
			}
			bodyLines.push(lines[nextLineIndex]);
		}

		const index = parsedTasks.length;
		const rawTitle = taskMatch[2].trim();
		const title = parseNativeTaskTitle(rawTitle, index, phase);
		const fields = parseTaskBodyFields(bodyLines);
		parsedTasks.push({
			index,
			checkboxKey: String(index),
			stableKey: title.stableKey,
			taskNumber: title.taskNumber,
			phase,
			rawTitle,
			subject: title.subject,
			description: cleanTaskDescription(bodyLines, title.subject),
			activeForm: title.activeForm,
			status: /x/i.test(taskMatch[1]) ? "completed" : "pending",
			isParallel: title.isParallel,
			isVerify: title.isVerify,
			agentType: title.agentType,
			fields,
			blockedByIndices: [],
			startLine: lineIndex,
			endLine: nextLineIndex,
			block: [lines[lineIndex], ...bodyLines].join("\n").trimEnd(),
		});

		lineIndex = nextLineIndex - 1;
	}

	assignNativeTaskDependencies(parsedTasks);
	return parsedTasks;
}

function assignNativeTaskDependencies(tasks: ParsedNativeTask[]): void {
	let barrier: number[] = [];
	let parallelGroup: number[] = [];

	for (const task of tasks) {
		if (task.isParallel) {
			task.blockedByIndices = [...barrier];
			parallelGroup.push(task.index);
			continue;
		}

		if (parallelGroup.length > 0) {
			barrier = [...parallelGroup];
			parallelGroup = [];
		}

		task.blockedByIndices = [...barrier];
		barrier = [task.index];
	}
}

function activeToolDependencyError(pi: ExtensionAPI, tools: readonly string[], commandName: string, packageHint: string): string | null {
	const registry = getToolRegistryState(pi);
	if (registry.allError) {
		return `Cannot inspect Pi tool registry: ${registry.allError}. Run /ralph-init for diagnostics.`;
	}
	if (registry.activeError) {
		return `Cannot inspect active Pi tools: ${registry.activeError}. Run /ralph-init for diagnostics.`;
	}

	const missing = tools.filter((toolName) => !registry.allToolNames.has(toolName));
	const inactive = tools.filter((toolName) => registry.allToolNames.has(toolName) && !registry.activeToolNames.has(toolName));
	if (missing.length === 0 && inactive.length === 0) return null;

	const lines = [`Missing required Pi tool(s) for ${commandName}: ${[...missing, ...inactive].join(", ")}.`];
	if (missing.length > 0) lines.push(`Not registered: ${missing.join(", ")}. Install and load ${packageHint}.`);
	if (inactive.length > 0) lines.push(`Registered but inactive: ${inactive.join(", ")}. Enable these tools or remove --exclude-tools filters.`);
	lines.push("Run /ralph-init for exact diagnostics and install commands, then run /reload or restart Pi.");
	return lines.join("\n");
}

function ralphAgentDefinitionError(cwd: string, agentNames: readonly string[], bootstrapResult?: RalphAgentBootstrapResult): string | null {
	const expectedFiles = new Set(agentNames.map(agentFileName));
	if (bootstrapResult) {
		const missingSource = bootstrapResult.missingSource.filter((name) => expectedFiles.has(name));
		const conflicts = bootstrapResult.conflicts.filter((conflict) => expectedFiles.has(conflict.name));
		if (bootstrapResult.errors.length > 0 || missingSource.length > 0 || conflicts.length > 0) {
			const lines = ["Ralph subagent bootstrap did not complete for required agent definition(s)."];
			if (missingSource.length > 0) lines.push(`Missing bundled source file(s): ${bootstrapAgentNames(missingSource)}.`);
			if (conflicts.length > 0) {
				lines.push("Project-local conflict(s):", ...conflicts.map((conflict) => `- ${formatProjectPath(conflict.path, cwd)}: ${conflict.reason}`));
			}
			if (bootstrapResult.errors.length > 0) lines.push("Bootstrap error(s):", ...bootstrapResult.errors.map((error) => `- ${error}`));
			lines.push("Run /ralph-init for diagnostics, or /ralph-init --refresh-agents to overwrite conflicting ralph-*.md files explicitly.");
			return lines.join("\n");
		}
	}

	for (const agentName of agentNames) {
		const agentPath = projectRalphAgentPath(cwd, agentName);
		if (!pathCheck(agentPath, "file")) {
			return `Missing Ralph subagent definition: ${formatProjectPath(agentPath, cwd)}. Run /ralph-init for diagnostics.`;
		}

		let fields: Set<string> | null;
		try {
			fields = frontmatterFields(readFileSync(agentPath, "utf8"));
		} catch (error) {
			return `Cannot read Ralph subagent definition ${formatProjectPath(agentPath, cwd)}: ${formatError(error)}. Run /ralph-init for diagnostics.`;
		}
		if (!fields) return `Ralph subagent definition ${formatProjectPath(agentPath, cwd)} has no YAML frontmatter. Run /ralph-init --refresh-agents to restore it.`;
		const missingFields = REQUIRED_AGENT_FRONTMATTER_FIELDS.filter((field) => !fields.has(field));
		if (missingFields.length > 0) {
			return `Ralph subagent definition ${formatProjectPath(agentPath, cwd)} is missing frontmatter field(s): ${missingFields.join(", ")}. Run /ralph-init --refresh-agents to restore it.`;
		}
	}

	return null;
}

function nativeTaskMirrorDependencyError(pi: ExtensionAPI): string | null {
	return activeToolDependencyError(pi, NATIVE_TASK_TOOLS, "ralph-tasks native card mirroring", "@tintinweb/pi-tasks");
}

function readPiTasksScope(cwd: string): "memory" | "session" | "project" {
	const configPath = join(cwd, ".pi", "tasks-config.json");
	if (!existsSync(configPath)) return "session";

	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
		if (!isRecordValue(parsed)) return "session";
		return parsed.taskScope === "memory" || parsed.taskScope === "project" || parsed.taskScope === "session"
			? parsed.taskScope
			: "session";
	} catch {
		return "session";
	}
}

function resolveNativeTaskStorePath(ctx: ExtensionCommandContext): { path?: string; error?: string } {
	const piTasks = process.env.PI_TASKS;
	if (piTasks === "off") {
		return { error: "PI_TASKS=off disables @tintinweb/pi-tasks storage. Unset PI_TASKS or configure a file-backed pi-tasks store." };
	}
	if (piTasks) {
		if (isAbsolute(piTasks)) return { path: piTasks };
		if (piTasks.startsWith(".")) return { path: resolve(ctx.cwd, piTasks) };
		return { path: join(homedir(), ".pi", "tasks", `${piTasks}.json`) };
	}

	const scope = readPiTasksScope(ctx.cwd);
	if (scope === "memory") {
		return {
			error: "@tintinweb/pi-tasks is configured with taskScope=memory, which cannot be mirrored from /ralph-tasks. Set .pi/tasks-config.json taskScope to \"session\" or \"project\".",
		};
	}
	if (scope === "project") return { path: join(ctx.cwd, ".pi", "tasks", "tasks.json") };

	const sessionId = ctx.sessionManager.getSessionId();
	if (!sessionId) return { error: "Pi session id is unavailable; cannot resolve the session-scoped pi-tasks store." };
	return { path: join(ctx.cwd, ".pi", "tasks", `tasks-${sessionId}.json`) };
}

function normalizeNativeTaskStatus(value: unknown): NativeTaskStatus {
	return value === "in_progress" || value === "completed" ? value : "pending";
}

function normalizeNativeTask(raw: unknown): NativeTaskCard | null {
	if (!isRecordValue(raw) || typeof raw.id !== "string" || typeof raw.subject !== "string") return null;
	return {
		id: raw.id,
		subject: raw.subject,
		description: typeof raw.description === "string" ? raw.description : raw.subject,
		status: normalizeNativeTaskStatus(raw.status),
		activeForm: typeof raw.activeForm === "string" ? raw.activeForm : undefined,
		owner: typeof raw.owner === "string" ? raw.owner : undefined,
		metadata: isRecordValue(raw.metadata) ? { ...raw.metadata } : {},
		blocks: Array.isArray(raw.blocks) ? raw.blocks.filter((value): value is string => typeof value === "string") : [],
		blockedBy: Array.isArray(raw.blockedBy) ? raw.blockedBy.filter((value): value is string => typeof value === "string") : [],
		createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
		updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
	};
}

function readNativeTaskStore(storePath: string): NativeTaskStoreData {
	if (!existsSync(storePath)) return { nextId: 1, tasks: [] };

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(storePath, "utf8")) as unknown;
	} catch (error) {
		throw new Error(`Unable to read pi-tasks store ${storePath}: ${formatError(error)}`);
	}
	if (!isRecordValue(parsed)) throw new Error(`Invalid pi-tasks store ${storePath}: expected a JSON object.`);

	const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeNativeTask).filter((task): task is NativeTaskCard => task !== null) : [];
	const maxId = tasks.reduce((max, task) => Math.max(max, Number(task.id) || 0), 0);
	const nextId = typeof parsed.nextId === "number" && Number.isFinite(parsed.nextId) ? Math.max(Math.floor(parsed.nextId), maxId + 1, 1) : maxId + 1;
	return { nextId, tasks };
}

function writeNativeTaskStore(storePath: string, data: NativeTaskStoreData): void {
	mkdirSync(dirname(storePath), { recursive: true });
	const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
	renameSync(tempPath, storePath);
}

function waitForNativeTaskLockRetry(): void {
	const start = Date.now();
	while (Date.now() - start < NATIVE_TASK_LOCK_RETRY_MS) {
		// Match pi-tasks' simple synchronous file-locking approach.
	}
}

function acquireNativeTaskLock(lockPath: string): void {
	mkdirSync(dirname(lockPath), { recursive: true });
	for (let attempt = 0; attempt < NATIVE_TASK_LOCK_MAX_RETRIES; attempt += 1) {
		try {
			writeFileSync(lockPath, String(process.pid), { flag: "wx" });
			return;
		} catch (error) {
			const code = isRecordValue(error) && typeof error.code === "string" ? error.code : undefined;
			if (code !== "EEXIST") throw error;

			try {
				const pid = Number.parseInt(readFileSync(lockPath, "utf8"), 10);
				if (pid && !Number.isNaN(pid)) {
					try {
						process.kill(pid, 0);
					} catch {
						unlinkSync(lockPath);
						continue;
					}
				}
			} catch {
				// Ignore unreadable locks and retry until timeout.
			}
			waitForNativeTaskLockRetry();
		}
	}
	throw new Error(`Failed to acquire pi-tasks lock: ${lockPath}`);
}

function withNativeTaskStore<T>(storePath: string, fn: (data: NativeTaskStoreData) => T): T {
	const lockPath = `${storePath}.lock`;
	acquireNativeTaskLock(lockPath);
	try {
		const data = readNativeTaskStore(storePath);
		const result = fn(data);
		writeNativeTaskStore(storePath, data);
		return result;
	} finally {
		try {
			unlinkSync(lockPath);
		} catch {
			// Ignore lock cleanup failures; pi-tasks treats stale locks defensively.
		}
	}
}

function nativeTaskMetadataString(task: NativeTaskCard, key: string): string | undefined {
	const value = task.metadata[key];
	return typeof value === "string" ? value : undefined;
}

function nativeTaskMetadataNumber(task: NativeTaskCard, key: string): number | undefined {
	const value = task.metadata[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isNativeTaskOwnedBySpec(task: NativeTaskCard, spec: SpecEntry): boolean {
	return nativeTaskMetadataString(task, "ralphMirroredBy") === "ralph-specum"
		&& (nativeTaskMetadataString(task, "ralphSpecAbsolutePath") === spec.absolutePath || nativeTaskMetadataString(task, "ralphSpecPath") === spec.path);
}

function uniqueNativeTaskIds(ids: string[]): string[] {
	return [...new Set(ids)].sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b));
}

function nativeTaskSnapshot(task: NativeTaskCard): string {
	return JSON.stringify({
		subject: task.subject,
		description: task.description,
		status: task.status,
		activeForm: task.activeForm,
		owner: task.owner,
		metadata: task.metadata,
		blocks: task.blocks,
		blockedBy: task.blockedBy,
	});
}

function findExistingNativeTask(
	parsed: ParsedNativeTask,
	previousMap: Record<string, string>,
	tasksById: Map<string, NativeTaskCard>,
	specOwnedTasks: NativeTaskCard[],
	usedTaskIds: Set<string>,
	spec: SpecEntry,
): NativeTaskCard | undefined {
	const mappedTask = tasksById.get(previousMap[parsed.checkboxKey] ?? "");
	if (mappedTask && !usedTaskIds.has(mappedTask.id)) return mappedTask;

	const matchingStableKey = specOwnedTasks.filter((task) => nativeTaskMetadataString(task, "ralphTaskKey") === parsed.stableKey && !usedTaskIds.has(task.id));
	if (matchingStableKey.length === 1) return matchingStableKey[0];

	const matchingIndex = specOwnedTasks.find((task) => nativeTaskMetadataNumber(task, "ralphTaskIndex") === parsed.index && !usedTaskIds.has(task.id));
	if (matchingIndex) return matchingIndex;

	return specOwnedTasks.find((task) => isNativeTaskOwnedBySpec(task, spec) && !usedTaskIds.has(task.id) && task.subject === parsed.subject);
}

function createNativeTask(data: NativeTaskStoreData, parsed: ParsedNativeTask): NativeTaskCard {
	const now = Date.now();
	const task: NativeTaskCard = {
		id: String(data.nextId),
		subject: parsed.subject,
		description: parsed.description,
		status: parsed.status,
		activeForm: parsed.activeForm,
		owner: undefined,
		metadata: {},
		blocks: [],
		blockedBy: [],
		createdAt: now,
		updatedAt: now,
	};
	data.nextId += 1;
	data.tasks.push(task);
	return task;
}

function nativeTaskMetadata(parsed: ParsedNativeTask, spec: SpecEntry, tasksPath: string, mirroredAt: string): Record<string, unknown> {
	const metadata: Record<string, unknown> = {
		agentType: parsed.agentType,
		ralphMirroredBy: "ralph-specum",
		ralphNativeTaskSchemaVersion: 1,
		ralphSpecName: spec.name,
		ralphSpecPath: spec.path,
		ralphSpecAbsolutePath: spec.absolutePath,
		ralphTasksPath: tasksPath,
		ralphTaskIndex: parsed.index,
		ralphTaskKey: parsed.stableKey,
		ralphTaskRawTitle: parsed.rawTitle,
		ralphTaskPhase: parsed.phase,
		ralphTaskParallel: parsed.isParallel,
		ralphTaskVerify: parsed.isVerify,
		ralphTaskFields: parsed.fields,
		ralphMirroredAt: mirroredAt,
	};
	if (parsed.taskNumber) metadata.ralphTaskNumber = parsed.taskNumber;
	return metadata;
}

function applyNativeTaskMirror(
	data: NativeTaskStoreData,
	parsedTasks: ParsedNativeTask[],
	previousMap: Record<string, string>,
	spec: SpecEntry,
	tasksPath: string,
): NativeTaskMirrorResult & { cards: NativeTaskCard[] } {
	const mirroredAt = new Date().toISOString();
	const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
	const specOwnedTasks = data.tasks.filter((task) => isNativeTaskOwnedBySpec(task, spec));
	const beforeSnapshots = new Map(data.tasks.map((task) => [task.id, nativeTaskSnapshot(task)]));
	const usedTaskIds = new Set<string>();
	const createdTaskIds = new Set<string>();
	const assignments = new Map<number, NativeTaskCard>();
	const nativeTaskMap: Record<string, string> = {};

	for (const parsed of parsedTasks) {
		let task = findExistingNativeTask(parsed, previousMap, tasksById, specOwnedTasks, usedTaskIds, spec);
		if (!task) {
			task = createNativeTask(data, parsed);
			tasksById.set(task.id, task);
			createdTaskIds.add(task.id);
		}

		usedTaskIds.add(task.id);
		assignments.set(parsed.index, task);
		nativeTaskMap[parsed.checkboxKey] = task.id;
		task.subject = parsed.subject;
		task.description = parsed.description;
		task.status = parsed.status;
		task.activeForm = parsed.activeForm;
		task.owner = undefined;
		task.metadata = { ...task.metadata, ...nativeTaskMetadata(parsed, spec, tasksPath, mirroredAt) };
		task.blocks = [];
		task.blockedBy = [];
	}

	for (const parsed of parsedTasks) {
		const task = assignments.get(parsed.index);
		if (!task) continue;
		task.blockedBy = uniqueNativeTaskIds(
			parsed.blockedByIndices
				.map((dependencyIndex) => nativeTaskMap[String(dependencyIndex)])
				.filter((taskId): taskId is string => typeof taskId === "string" && taskId !== task.id),
		);
		for (const blockerId of task.blockedBy) {
			const blocker = tasksById.get(blockerId);
			if (blocker) blocker.blocks = uniqueNativeTaskIds([...blocker.blocks, task.id]);
		}
	}

	const currentTaskIds = new Set(Object.values(nativeTaskMap));
	const staleTaskIds = new Set([...Object.values(previousMap), ...specOwnedTasks.map((task) => task.id)]);
	let deleted = 0;
	data.tasks = data.tasks.filter((task) => {
		if (!staleTaskIds.has(task.id) || currentTaskIds.has(task.id) || !isNativeTaskOwnedBySpec(task, spec)) return true;
		deleted += 1;
		return false;
	});

	const validTaskIds = new Set(data.tasks.map((task) => task.id));
	for (const task of data.tasks) {
		task.blocks = task.blocks.filter((taskId) => validTaskIds.has(taskId));
		task.blockedBy = task.blockedBy.filter((taskId) => validTaskIds.has(taskId));
	}

	let updated = 0;
	for (const task of assignments.values()) {
		if (createdTaskIds.has(task.id)) continue;
		if (beforeSnapshots.get(task.id) !== nativeTaskSnapshot(task)) updated += 1;
	}

	const now = Date.now();
	for (const task of assignments.values()) {
		if (createdTaskIds.has(task.id) || beforeSnapshots.get(task.id) !== nativeTaskSnapshot(task)) {
			task.updatedAt = now;
		}
	}

	const maxId = data.tasks.reduce((max, task) => Math.max(max, Number(task.id) || 0), 0);
	data.nextId = Math.max(data.nextId, maxId + 1, 1);

	return {
		created: createdTaskIds.size,
		updated,
		deleted,
		total: parsedTasks.length,
		storePath: "",
		nativeTaskMap,
		cards: parsedTasks.map((task) => assignments.get(task.index)).filter((task): task is NativeTaskCard => Boolean(task)),
	};
}

function statusIcon(status: NativeTaskStatus): string {
	return status === "completed" ? "✔" : status === "in_progress" ? "◼" : "◻";
}

function maybeShowNativeTaskStartupWidget(ctx: ExtensionCommandContext, label: string): void {
	if (!ctx.hasUI || typeof ctx.ui.setWidget !== "function" || !/^(start|tasks|implement)$/.test(label)) return;
	ctx.ui.setWidget(RALPH_NATIVE_TASK_WIDGET_KEY, [
		`● Ralph ${label}: pi-tasks surface ready`,
		"  ◻ Waiting for tasks.md mirroring or execution updates…",
	], { placement: "aboveEditor" });
}

function showMirroredNativeTaskWidget(ctx: ExtensionCommandContext, cards: NativeTaskCard[]): void {
	if (!ctx.hasUI || typeof ctx.ui.setWidget !== "function") return;
	if (cards.length === 0) {
		ctx.ui.setWidget(RALPH_NATIVE_TASK_WIDGET_KEY, undefined);
		return;
	}

	const completed = cards.filter((task) => task.status === "completed").length;
	const inProgress = cards.filter((task) => task.status === "in_progress").length;
	const pending = cards.filter((task) => task.status === "pending").length;
	const parts: string[] = [];
	if (completed > 0) parts.push(`${completed} done`);
	if (inProgress > 0) parts.push(`${inProgress} in progress`);
	if (pending > 0) parts.push(`${pending} open`);

	const visibleCards = cards.slice(0, NATIVE_TASK_WIDGET_LIMIT);
	const lines = [`● ${cards.length} tasks (${parts.join(", ") || "0 open"})`];
	for (const task of visibleCards) {
		const blockers = task.blockedBy.length > 0 ? ` › blocked by ${task.blockedBy.map((id) => `#${id}`).join(", ")}` : "";
		const label = task.status === "in_progress" ? `${task.activeForm ?? task.subject}…` : task.subject;
		lines.push(`  ${statusIcon(task.status)} #${task.id} ${label}${blockers}`);
	}
	if (cards.length > visibleCards.length) lines.push(`    … and ${cards.length - visibleCards.length} more`);
	ctx.ui.setWidget(RALPH_NATIVE_TASK_WIDGET_KEY, lines, { placement: "aboveEditor" });
}

function mirrorTasksToNativeTaskCards(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	spec: SpecEntry,
	options: RalphPathOptions,
): NativeTaskMirrorResult {
	const dependencyError = nativeTaskMirrorDependencyError(pi);
	if (dependencyError) throw new Error(dependencyError);

	const storePath = resolveNativeTaskStorePath(ctx);
	if (!storePath.path) throw new Error(storePath.error ?? "Unable to resolve pi-tasks store path.");

	const tasksPath = artifactPath(spec, "tasks");
	const parsedTasks = parseTasksForNativeCards(readFileSync(tasksPath, "utf8"));
	if (parsedTasks.length === 0) throw new Error("Cannot mirror tasks.md because no checkbox tasks were parsed.");

	const previousMap = implementationNativeTaskMapFromState(readRalphState(spec, options));
	const result = withNativeTaskStore(storePath.path, (data) => applyNativeTaskMirror(data, parsedTasks, previousMap, spec, tasksPath));
	result.storePath = storePath.path;
	showMirroredNativeTaskWidget(ctx, result.cards);
	return result;
}

function nativeTaskMirrorStatePatch(result: NativeTaskMirrorResult): Record<string, unknown> {
	return {
		nativeTaskMap: result.nativeTaskMap,
		nativeSyncEnabled: true,
		nativeSyncFailureCount: 0,
		nativeTaskStorePath: formatPath(result.storePath),
		nativeTaskMirroredAt: new Date().toISOString(),
		nativeTaskMirror: {
			created: result.created,
			updated: result.updated,
			deleted: result.deleted,
			total: result.total,
		},
	};
}

function nativeTaskMirrorFailurePatch(state: RalphState | null, error: unknown): Record<string, unknown> {
	const failureCount = (numberField(state, "nativeSyncFailureCount") ?? 0) + 1;
	return {
		nativeSyncEnabled: failureCount < 3,
		nativeSyncFailureCount: failureCount,
		validationError: `Native pi-tasks mirroring failed: ${formatError(error)}`,
	};
}

function formatNativeTaskMirrorSummary(result: NativeTaskMirrorResult): string[] {
	return [
		"Pi task cards:",
		`- Mirrored ${result.total} tasks to ${formatPath(result.storePath)}.`,
		`- Created ${result.created}, updated ${result.updated}, deleted ${result.deleted}.`,
		"- Stored checkbox mappings in .ralph-state.json nativeTaskMap.",
	];
}

function formatPhase(spec: SpecEntry, state: RalphState | null): string {
	const phase = stringField(state, "phase");
	if (phase) {
		return phase === "execution" ? "Executing" : phase.charAt(0).toUpperCase() + phase.slice(1);
	}

	if (artifactExists(spec, "tasks")) return "Tasks";
	if (artifactExists(spec, "design")) return "Design";
	if (artifactExists(spec, "requirements")) return "Requirements";
	if (artifactExists(spec, "research")) return "Research";
	return "Not started";
}

function formatProgress(state: RalphState | null, taskCounts: TaskCounts): string {
	const taskIndex = numberField(state, "taskIndex");
	const totalTasks = numberField(state, "totalTasks");
	const parts: string[] = [];

	if (taskIndex !== undefined || totalTasks !== undefined) {
		parts.push(`${taskIndex ?? 0}/${totalTasks ?? taskCounts.total} state tasks`);
	}
	if (taskCounts.total > 0) {
		parts.push(`${taskCounts.completed}/${taskCounts.total} tasks.md checked`);
	}

	return parts.length > 0 ? parts.join("; ") : "0/0 tasks";
}

function formatRelatedSpecs(state: RalphState | null): string {
	const related = state?.relatedSpecs;
	if (!Array.isArray(related) || related.length === 0) return "<none>";

	return related
		.slice(0, 5)
		.map((entry) => {
			if (!entry || typeof entry !== "object") return "<invalid>";
			const item = entry as Record<string, unknown>;
			const name = typeof item.name === "string" ? item.name : "<unnamed>";
			const relevance = typeof item.relevance === "string" ? item.relevance.toUpperCase() : "RELATED";
			const marker = item.mayNeedUpdate === true ? "*" : "";
			return `${name} (${relevance}${marker})`;
		})
		.join(", ");
}

function formatSpecStatusBlock(spec: SpecEntry, activeSpecPath: string | null, options: RalphPathOptions): string[] {
	const stateRead = safeReadSpecState(spec, options);
	const taskCounts = countTasks(spec);
	const activeSuffix = spec.absolutePath === activeSpecPath ? " [ACTIVE]" : "";
	const lines = [
		`#### ${spec.name}${activeSuffix}`,
		`Location: ${spec.path}`,
		`Phase: ${formatPhase(spec, stateRead.state)}`,
		`Progress: ${formatProgress(stateRead.state, taskCounts)}`,
		`Files: ${formatArtifactIndicators(spec)}`,
		`Related: ${formatRelatedSpecs(stateRead.state)}`,
	];

	if (stateRead.error) {
		lines.push(`State: invalid (${stateRead.error})`);
	} else if (!stateRead.state) {
		lines.push("State: none");
	}

	return lines;
}

function formatAvailableSpecs(specs: SpecEntry[], options: RalphPathOptions, activeSpecPath: string | null): string {
	const roots = getSpecRoots({ ...options, allowMissingConfiguredRoots: true });
	const lines = ["Available specs:"];

	for (const root of roots) {
		const rootSpecs = specs.filter((spec) => spec.rootAbsolutePath === root.absolutePath);
		lines.push("", `${formatRootLabel(root)}:`);
		if (!root.exists) {
			lines.push("  (root missing)");
			continue;
		}
		if (rootSpecs.length === 0) {
			lines.push("  (none)");
			continue;
		}
		rootSpecs.forEach((spec, index) => {
			const active = spec.absolutePath === activeSpecPath ? " [ACTIVE]" : "";
			lines.push(`  ${index + 1}. ${spec.name}${active} - ${spec.path}`);
		});
	}

	return lines.join("\n");
}

function currentSpecPath(options: RalphPathOptions): string | null {
	try {
		return resolveCurrentSpec(options)?.absolutePath ?? null;
	} catch {
		return null;
	}
}

function resolveExistingSpec(reference: string, options: RalphPathOptions): { spec?: SpecEntry; error?: string } {
	try {
		const spec = findSpec(reference, options);
		if (!isSpecInConfiguredRoot(spec, options)) {
			return { error: `Spec '${reference}' is not under a configured specs root.` };
		}
		return { spec };
	} catch (error) {
		return { error: formatSpecResolutionError(reference, error, options) };
	}
}

function formatSpecResolutionError(reference: string, error: unknown, options: RalphPathOptions): string {
	if (error instanceof SpecResolutionError && error.code === "ambiguous") {
		return [
			`Multiple specs named '${reference}' found:`,
			...error.matches.map((spec, index) => `${index + 1}. ${spec.path}`),
			"Specify the full spec path with /ralph-switch or /ralph-cancel.",
		].join("\n");
	}

	const roots = getSpecRoots({ ...options, allowMissingConfiguredRoots: true });
	const message = error instanceof Error ? error.message : `Spec '${reference}' could not be resolved.`;
	return [message, "", "Searched roots:", ...roots.map((root) => `- ${formatRootLabel(root)}`)].join("\n");
}

function formatRalphSpecStatus(pi: ExtensionAPI, ctx: ExtensionCommandContext): { message: string; type: "info" | "warning" } {
	const options = pathOptions(ctx);
	const validation = validateRalphEnvironment(pi, ctx.cwd);
	const roots = getSpecRoots({ ...options, allowMissingConfiguredRoots: true });
	const specs = listSpecs({ ...options, allowMissingConfiguredRoots: true });
	const currentValue = readCurrentSpecValue(options);
	const activeSpec = currentValue ? resolveCurrentSpec(options) : null;
	const activeSpecPath = activeSpec?.absolutePath ?? null;
	const lines = [
		"# Ralph Specum Status",
		"",
		`Bootstrap validation: Overall: ${validation.ready ? "PASS" : "FAIL"} (run /ralph-init for details)`,
		`Active spec: ${formatActiveSpec(currentValue, activeSpec)}`,
		"",
		"## Spec roots",
		...roots.map((root) => `- ${formatRootLabel(root)}`),
		"",
		"## Specs",
	];

	if (specs.length === 0) {
		lines.push("No specs found in configured roots.");
	} else {
		for (const root of roots) {
			const rootSpecs = specs.filter((spec) => spec.rootAbsolutePath === root.absolutePath);
			lines.push("", `### ${formatRootLabel(root)}`);
			if (!root.exists) {
				lines.push("Root missing.");
				continue;
			}
			if (rootSpecs.length === 0) {
				lines.push("No specs found.");
				continue;
			}
			for (const spec of rootSpecs) {
				lines.push("", ...formatSpecStatusBlock(spec, activeSpecPath, options));
			}
		}
	}

	lines.push(
		"",
		"Commands:",
		"- /ralph-triage [--output spec-files|github-issues|both] [--yes] <epic> <goal>  Create/resume an epic and requested outputs",
		"- /ralph-epic-status [--json] [--repair] [epic]  Show active epic readiness; --json prints machine state, --repair fills stubs",
		"- /ralph-epic-switch <epic>                    Switch active epic marker",
		"- /ralph-epic-next [--peek] [--switch] [--start] [epic]  Preview/select next unblocked child spec",
		"- /ralph-epic-cancel [--delete-child-specs] [epic]  Cancel active epic execution state safely",
		"- /ralph-start [--fresh] [--quick|--autonomous] [--skip-research] [--tasks-size fine|coarse] [--next-epic-spec] [spec-name] [-- goal]  Create/resume a spec; use `--` before markdown goals containing flag-like text",
		"- /ralph-research [spec]                        Generate research.md",
		"- /ralph-requirements [spec]                    Generate requirements.md",
		"- /ralph-design [spec]                          Generate design.md",
		"- /ralph-tasks [--quick|--autonomous] [--tasks-size fine|coarse] [spec]  Generate canonical tasks.md",
		"- /ralph-implement [--recovery-mode] [--max-task-iterations N] [--max-global-iterations N] [spec]  Execute tasks.md through Ralph subagents",
		"- /ralph-refactor [spec] [--file requirements|design|tasks]  Update one existing spec artifact with bounded scope",
		"- /ralph-index [--path <dir>] [--type controllers,services,models,helpers,migrations,other] [--exclude <pattern>] [--dry-run] [--force] [--changed] [--quick]  Generate searchable component/external index artifacts",
		"- /ralph-switch <spec-name-or-path>            Switch active spec",
		"- /ralph-cancel [spec-name-or-path]             Clear execution state for a spec",
		"- /ralph-model [auto|anthropic|openai-codex|github-copilot|inherit|provider/model]  Switch Ralph's inherited Pi model profile",
		"- /ralph-init [--refresh-agents] [--no-runtime-config]  Bootstrap/check package tools, runtime defaults, and project Ralph subagents",
	);

	return { message: lines.join("\n"), type: validation.ready ? "info" : "warning" };
}

function formatActiveSpec(currentValue: string | null, activeSpec: SpecEntry | null): string {
	if (!currentValue) return "none";
	if (!activeSpec) return `${currentValue} (unresolved)`;
	return activeSpec.exists ? `${activeSpec.name} (${activeSpec.path})` : `${currentValue} (missing at ${activeSpec.path})`;
}

async function selectSpec(ctx: ExtensionCommandContext, specs: SpecEntry[], activeSpecPath: string | null): Promise<SpecEntry | null> {
	if (!ctx.hasUI) return null;

	const labels = specs.map((spec, index) => {
		const active = spec.absolutePath === activeSpecPath ? " [ACTIVE]" : "";
		return `${index + 1}. ${spec.name}${active} - ${spec.path}`;
	});
	const selected = await ctx.ui.select("Switch to spec", labels);
	if (!selected) return null;

	const selectedIndex = labels.indexOf(selected);
	return selectedIndex >= 0 ? specs[selectedIndex] : null;
}

function formatSwitchSummary(spec: SpecEntry, pointerValue: string, options: RalphPathOptions): string {
	const stateRead = safeReadSpecState(spec, options);
	const taskCounts = countTasks(spec);
	const lines = [
		`Switched to spec: ${spec.name}`,
		"",
		`Location: ${spec.path}`,
		`Current marker: ${pointerValue}`,
		`Current phase: ${formatPhase(spec, stateRead.state)}`,
		`Progress: ${formatProgress(stateRead.state, taskCounts)}`,
		"",
		"Files present:",
		...SPEC_ARTIFACTS.map((artifact) => `- [${artifactExists(spec, artifact) ? "x" : " "}] ${artifact}.md`),
	];

	if (stateRead.error) {
		lines.push("", `Warning: ${stateRead.error}`);
	}

	lines.push("", "Next: run the appropriate /ralph-* phase command.");
	return lines.join("\n");
}

type CommandArgToken = {
	token: string;
	nextIndex: number;
	error?: string;
};

function readCommandArgToken(args: string, startIndex = 0): CommandArgToken | null {
	let index = startIndex;
	while (index < args.length && /\s/.test(args[index] ?? "")) index += 1;
	if (index >= args.length) return null;

	let current = "";
	let quote: "'" | '"' | null = null;
	let escaping = false;

	for (; index < args.length; index += 1) {
		const char = args[index] ?? "";
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\" && quote !== "'") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (char === quote) {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) break;
		current += char;
	}

	if (escaping) current += "\\";
	if (quote) return { token: "", nextIndex: index, error: `Unclosed ${quote} quote in arguments.` };
	return { token: current, nextIndex: index };
}

function tokenizeCommandArgs(args: string): { tokens: string[]; error?: string } {
	const tokens: string[] = [];
	let cursor = 0;

	while (true) {
		const result = readCommandArgToken(args, cursor);
		if (!result) break;
		if (result.error) return { tokens: [], error: result.error };
		if (result.token) tokens.push(result.token);
		cursor = result.nextIndex;
	}

	return { tokens };
}

function parseStartArgs(args: string): StartArguments {
	const positionals: string[] = [];
	const warnings: string[] = [];
	let fresh = false;
	let quickMode = false;
	let autonomousMode = false;
	let skipResearch = false;
	let nextEpicSpec = false;
	let commitSpec: boolean | undefined;
	let specsDir: string | undefined;
	let tasksSize: StartArguments["tasksSize"];
	let literalGoal = "";
	let cursor = 0;

	while (true) {
		const result = readCommandArgToken(args, cursor);
		if (!result) break;
		if (result.error) return emptyStartArguments(result.error);

		const token = result.token;
		if (token === "--") {
			literalGoal = args.slice(result.nextIndex).trim();
			break;
		}
		if (token === "--fresh") {
			fresh = true;
			cursor = result.nextIndex;
			continue;
		}
		if (token === "--quick") {
			quickMode = true;
			cursor = result.nextIndex;
			continue;
		}
		if (token === "--autonomous" || token === "--auto") {
			autonomousMode = true;
			cursor = result.nextIndex;
			continue;
		}
		if (token === "--skip-research") {
			skipResearch = true;
			cursor = result.nextIndex;
			continue;
		}
		if (token === "--next-epic-spec" || token === "--epic-next") {
			nextEpicSpec = true;
			cursor = result.nextIndex;
			continue;
		}
		if (token === "--commit-spec") {
			commitSpec = true;
			cursor = result.nextIndex;
			continue;
		}
		if (token === "--no-commit-spec") {
			commitSpec = false;
			cursor = result.nextIndex;
			continue;
		}
		if (token === "--specs-dir" || token.startsWith("--specs-dir=")) {
			const valueResult = token.includes("=") ? null : readCommandArgToken(args, result.nextIndex);
			if (valueResult?.error) return emptyStartArguments(valueResult.error);
			const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : valueResult?.token;
			if (!value || value.startsWith("--")) return emptyStartArguments("--specs-dir requires a path value.");
			specsDir = value;
			cursor = token.includes("=") ? result.nextIndex : (valueResult?.nextIndex ?? result.nextIndex);
			continue;
		}
		if (token === "--tasks-size" || token.startsWith("--tasks-size=")) {
			const valueResult = token.includes("=") ? null : readCommandArgToken(args, result.nextIndex);
			if (valueResult?.error) return emptyStartArguments(valueResult.error);
			const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : valueResult?.token;
			if (!value || value.startsWith("--")) return emptyStartArguments("--tasks-size requires fine or coarse.");
			if (value === "fine" || value === "coarse") {
				tasksSize = value;
			} else {
				tasksSize = "fine";
				warnings.push(`Invalid --tasks-size value "${value}"; defaulting to fine.`);
			}
			cursor = token.includes("=") ? result.nextIndex : (valueResult?.nextIndex ?? result.nextIndex);
			continue;
		}
		if (token.startsWith("--")) {
			return emptyStartArguments(`Unknown option: ${token}`);
		}
		positionals.push(token);
		cursor = result.nextIndex;
	}

	let reference: string | null = null;
	let goal = "";
	if (positionals.length > 0) {
		const first = positionals[0];
		const remaining = positionals.slice(1).join(" ").trim();
		if (isPathReference(first) || isValidSpecName(first)) {
			reference = first;
			goal = [remaining, literalGoal].filter(Boolean).join(" ").trim();
		} else {
			goal = [positionals.join(" ").trim(), literalGoal].filter(Boolean).join(" ").trim();
		}
	} else {
		goal = literalGoal.trim();
	}

	if (!reference && goal && (quickMode || autonomousMode)) {
		reference = inferSpecNameFromGoal(goal);
		warnings.push(`Inferred spec name '${reference}' from goal.`);
	}

	return {
		reference,
		goal,
		fresh,
		quickMode,
		autonomousMode,
		skipResearch,
		nextEpicSpec,
		commitSpec,
		specsDir,
		tasksSize,
		warnings,
	};
}

function buildStartOptionsSnapshot(parsed: StartArguments): StartOptionsSnapshot {
	return {
		reference: parsed.reference,
		goalProvided: parsed.goal.trim().length > 0,
		skipResearch: parsed.skipResearch,
		specsDir: parsed.specsDir,
		tasksSize: parsed.tasksSize,
		commitSpec: parsed.commitSpec,
		quickMode: parsed.quickMode,
		autonomousMode: parsed.autonomousMode,
		nextEpicSpec: parsed.nextEpicSpec,
	};
}

function emptyStartArguments(error: string): StartArguments {
	return {
		reference: null,
		goal: "",
		fresh: false,
		quickMode: false,
		autonomousMode: false,
		skipResearch: false,
		nextEpicSpec: false,
		warnings: [],
		error,
	};
}

function isValidSpecName(name: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function inferSpecNameFromGoal(goal: string): string {
	const slug = goal
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.split("-")
		.filter(Boolean)
		.slice(0, 6)
		.join("-");
	return slug || "new-spec";
}

function startPhaseCommand(phase: StartPhase): string {
	return phase === "execution" ? "/ralph-implement" : `/ralph-${phase}`;
}

function phaseRank(phase: StartPhase): number {
	return ["research", "requirements", "design", "tasks", "execution"].indexOf(phase);
}

function parseStatePhase(state: RalphState | null): StartPhase | null {
	const phase = stringField(state, "phase");
	return phase === "research" || phase === "requirements" || phase === "design" || phase === "tasks" || phase === "execution"
		? phase
		: null;
}

function inferArtifactNextPhase(spec: SpecEntry): StartPhase {
	if (!artifactExists(spec, "research")) return "research";
	if (!artifactExists(spec, "requirements")) return "requirements";
	if (!artifactExists(spec, "design")) return "design";
	if (!artifactExists(spec, "tasks")) return "tasks";
	return "execution";
}

function determineStartPhase(spec: SpecEntry, state: RalphState | null, parsed: StartArguments, isNew: boolean): StartPhase {
	if (isNew) return parsed.skipResearch ? "requirements" : "research";

	const artifactPhase = inferArtifactNextPhase(spec);
	const statePhase = parseStatePhase(state);
	if (!statePhase) return artifactPhase;
	return phaseRank(statePhase) > phaseRank(artifactPhase) ? statePhase : artifactPhase;
}

function configuredRootForSpecsDir(specsDir: string, options: RalphPathOptions): { root?: SpecRoot; error?: string } {
	const cwd = options.cwd ?? process.cwd();
	const absolutePath = resolve(isAbsolute(specsDir) ? specsDir : join(cwd, specsDir));
	const roots = getSpecRoots({ ...options, allowMissingConfiguredRoots: true });
	const root = roots.find((entry) => entry.absolutePath === absolutePath);
	if (root) return { root };

	return {
		error: [
			`Invalid --specs-dir: '${specsDir}' is not in configured specs_dirs.`,
			"Configured roots:",
			...roots.map((entry) => `- ${formatRootLabel(entry)}`),
		].join("\n"),
	};
}

function isSpecUnderConfiguredRoot(spec: SpecEntry, options: RalphPathOptions): boolean {
	return getSpecRoots({ ...options, allowMissingConfiguredRoots: true }).some((root) => {
		const relativePath = relative(root.absolutePath, spec.absolutePath);
		return relativePath !== "" && relativePath !== ".." && !relativePath.startsWith("../") && !isAbsolute(relativePath);
	});
}

function resolveStartTarget(parsed: StartArguments, options: RalphPathOptions): { target?: StartTarget; error?: string } {
	if (!parsed.reference) {
		if (parsed.goal) {
			return { error: "Spec name is required when a goal is provided. Usage: /ralph-start <spec-name> [-- goal]" };
		}

		const currentValue = readCurrentSpecValue(options);
		if (!currentValue) {
			return { error: "Spec name is required. Usage: /ralph-start <spec-name> [-- goal]" };
		}

		const spec = resolveCurrentSpec(options);
		if (!spec || !spec.exists) {
			return { error: `Active spec '${currentValue}' points to a missing directory. Pass a spec name to create one.` };
		}
		return { target: { spec, isNew: false } };
	}

	if (parsed.specsDir && isPathReference(parsed.reference)) {
		return { error: "Use either an explicit spec path or --specs-dir, not both." };
	}

	if (parsed.specsDir) {
		if (!isValidSpecName(parsed.reference)) {
			return { error: `Invalid spec name '${parsed.reference}'. Use kebab-case like 'user-auth'.` };
		}
		const rootResult = configuredRootForSpecsDir(parsed.specsDir, options);
		if (!rootResult.root) return { error: rootResult.error };
		const spec = specEntryFromAbsolutePath(join(rootResult.root.absolutePath, parsed.reference), {
			...options,
			allowMissingConfiguredRoots: true,
		});
		return validateStartTargetSpec(spec, parsed, options);
	}

	if (isPathReference(parsed.reference)) {
		const cwd = options.cwd ?? process.cwd();
		const spec = specEntryFromAbsolutePath(resolve(isAbsolute(parsed.reference) ? parsed.reference : join(cwd, parsed.reference)), {
			...options,
			allowMissingConfiguredRoots: true,
		});
		if (!isValidSpecName(spec.name)) {
			return { error: `Invalid spec directory name '${spec.name}'. Use kebab-case like 'user-auth'.` };
		}
		if (!isSpecUnderConfiguredRoot(spec, options)) {
			return { error: `Refusing to create or resume ${spec.path}; it is not under a configured specs root.` };
		}
		return validateStartTargetSpec(spec, parsed, options);
	}

	if (!isValidSpecName(parsed.reference)) {
		return { error: `Invalid spec name '${parsed.reference}'. Use kebab-case like 'user-auth'.` };
	}

	try {
		const spec = findSpec(parsed.reference, options);
		return validateStartTargetSpec(spec, parsed, options);
	} catch (error) {
		if (error instanceof SpecResolutionError && error.code === "not_found") {
			const root = getSpecRoots({ ...options, allowMissingConfiguredRoots: true })[0];
			const spec = specEntryFromAbsolutePath(join(root.absolutePath, parsed.reference), {
				...options,
				allowMissingConfiguredRoots: true,
			});
			return validateStartTargetSpec(spec, parsed, options);
		}
		return { error: formatSpecResolutionError(parsed.reference, error, options) };
	}
}

function validateStartTargetSpec(
	spec: SpecEntry,
	parsed: StartArguments,
	options: RalphPathOptions,
): { target?: StartTarget; error?: string } {
	if (spec.exists && !statSync(spec.absolutePath).isDirectory()) {
		return { error: `Spec path exists but is not a directory: ${spec.path}` };
	}
	if (parsed.fresh && spec.exists) {
		return {
			error: [
				`Spec '${spec.name}' already exists at ${spec.path}.`,
				"Ralph Pi does not overwrite existing specs during /ralph-start --fresh.",
				"Choose a new spec name, or use /ralph-cancel --delete after confirmation if you want to remove it.",
			].join("\n"),
		};
	}
	if (!isSpecUnderConfiguredRoot(spec, options)) {
		return { error: `Refusing to create or resume ${spec.path}; it is not under a configured specs root.` };
	}
	return { target: { spec, isNew: !spec.exists } };
}

function startStatePatch(
	spec: SpecEntry,
	parsed: StartArguments,
	phase: StartPhase,
	existingState: RalphState | null,
): Record<string, unknown> {
	const autonomous = parsed.quickMode || parsed.autonomousMode;
	const patch: Record<string, unknown> = {
		source: existingState?.source ?? "spec",
		name: spec.name,
		basePath: spec.path,
		phase,
		taskIndex: numberField(existingState, "taskIndex") ?? 0,
		totalTasks: numberField(existingState, "totalTasks") ?? 0,
		taskIteration: numberField(existingState, "taskIteration") ?? 1,
		maxTaskIterations: numberField(existingState, "maxTaskIterations") ?? 5,
		globalIteration: numberField(existingState, "globalIteration") ?? 1,
		maxGlobalIterations: numberField(existingState, "maxGlobalIterations") ?? 100,
		commitSpec: parsed.commitSpec ?? booleanField(existingState, "commitSpec") ?? true,
		quickMode: autonomous || booleanField(existingState, "quickMode") === true,
		awaitingApproval: !autonomous,
		discoveredSkills: Array.isArray(existingState?.discoveredSkills) ? existingState.discoveredSkills : [],
		relatedSpecs: Array.isArray(existingState?.relatedSpecs) ? existingState.relatedSpecs : [],
	};

	if (parsed.tasksSize) patch.granularity = parsed.tasksSize;
	if (parsed.autonomousMode) patch.autonomousMode = true;
	return patch;
}

function buildInitialProgress(spec: SpecEntry, goal: string, phase: StartPhase, quickOrAutonomous: boolean): string {
	const updated = new Date().toISOString();
	const currentTask = phase === "execution" ? "Ready for implementation" : `Starting ${phase} phase`;
	const next = quickOrAutonomous
		? `Continue autonomous flow from ${startPhaseCommand(phase)} when phase orchestration is available.`
		: `Run ${startPhaseCommand(phase)} to continue.`;
	const originalGoal = goal.trim() || "_No goal captured yet_";

	return [
		"---",
		`spec: ${spec.name}`,
		`basePath: ${spec.path}`,
		`phase: ${phase}`,
		"task: 0/0",
		`updated: ${updated}`,
		"---",
		"",
		`# Progress: ${spec.name}`,
		"",
		"## Original Goal",
		"",
		originalGoal,
		"",
		"## Completed Tasks",
		"",
		"_No tasks completed yet_",
		"",
		"## Current Task",
		"",
		currentTask,
		"",
		"## Learnings",
		"",
		"_Discoveries and insights will be captured here_",
		"",
		"## Blockers",
		"",
		"- None currently",
		"",
		"## Next",
		"",
		next,
		"",
	].join("\n");
}

function maybeWriteInitialProgress(spec: SpecEntry, goal: string, phase: StartPhase, quickOrAutonomous: boolean, options: RalphPathOptions): string {
	const existingProgress = readProgress(spec, options);
	if (!existingProgress.trim()) {
		return writeProgress(spec, buildInitialProgress(spec, goal, phase, quickOrAutonomous), options);
	}
	return getProgressPath(spec, options);
}

function countStateArray(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

function buildStartSummaryMetadata(
	branchDecision: BranchDecision,
	statePatch: Record<string, unknown>,
): StartSummaryMetadata {
	return {
		branchDecision: {
			mode: branchDecision.mode,
			targetBranch: branchDecision.targetBranch,
			applied: branchDecision.applied,
			reason: branchDecision.reason,
		},
		discoveryCounts: {
			relatedSpecs: countStateArray(statePatch.relatedSpecs),
			discoveredSkills: countStateArray(statePatch.discoveredSkills),
		},
	};
}

function formatBranchSummary(metadata: StartSummaryMetadata): string {
	const target = metadata.branchDecision.targetBranch ? ` -> ${metadata.branchDecision.targetBranch}` : "";
	const outcome = metadata.branchDecision.applied ? "applied" : "recorded";
	return `${metadata.branchDecision.mode}${target} (${outcome}: ${metadata.branchDecision.reason})`;
}

function formatStartSummary(
	spec: SpecEntry,
	isNew: boolean,
	phase: StartPhase,
	state: RalphState,
	pointerValue: string,
	progressPath: string,
	summaryMetadata: StartSummaryMetadata,
	warnings: string[],
	nextCommandOverride?: string,
): string {
	const quickMode = booleanField(state, "quickMode") === true;
	const autonomousMode = booleanField(state, "autonomousMode") === true;
	const mode = quickMode ? (autonomousMode ? "quick/autonomous" : "quick") : autonomousMode ? "autonomous" : "normal";
	const nextCommand = nextCommandOverride ?? `${startPhaseCommand(phase)}${quickMode ? " --quick" : ""}`;
	const lines = [
		`${isNew ? "Created" : "Resuming"} spec: ${spec.name}`,
		"",
		`Location: ${spec.path}`,
		`Current marker: ${pointerValue}`,
		`State: ${getRalphStatePath(spec)}`,
		`Progress: ${progressPath}`,
		`Mode: ${mode}`,
		`Branch decision: ${formatBranchSummary(summaryMetadata)}`,
		`Discovery: ${summaryMetadata.discoveryCounts.relatedSpecs} related spec(s), ${summaryMetadata.discoveryCounts.discoveredSkills} skill(s)`,
		`Next phase: ${phase}`,
		`Next command: ${nextCommand}`,
		`Files: ${formatArtifactIndicators(spec)}`,
	];

	if (warnings.length > 0) {
		lines.push("", "Warnings:", ...warnings.map((warning) => `- ${warning}`));
	}

	if (quickMode || autonomousMode) {
		lines.push(
			"",
			"Quick/autonomous setup requested; state was initialized with awaitingApproval=false.",
			"Ralph will generate/review artifacts, mirror Pi task cards, then enter implementation without approval prompts.",
		);
	} else {
		lines.push("", "Stopped after setup. Run the next command only when you are ready to continue.");
	}

	return lines.join("\n");
}

function readActiveEpicForStart(options: RalphPathOptions): ActiveEpicRead {
	const currentName = readCurrentEpicName(options);
	if (!currentName) return { currentName: null, warnings: [] };
	if (!isValidSpecName(currentName)) {
		return { currentName, warnings: [], error: `Invalid active epic name '${currentName}' in .current-epic.` };
	}

	const epic = resolveEpicDirectory(currentName, options);
	if (!epic.exists) {
		return { currentName, epic, warnings: [], error: `Active epic '${currentName}' points to a missing directory: ${epic.path}` };
	}

	const stateRead = safeReadEpicState(epic, options);
	if (!stateRead.state) {
		return {
			currentName,
			epic,
			stateRead,
			warnings: stateRead.warnings,
			error: [`Active epic '${currentName}' has no readable state.`, ...stateRead.warnings.map((warning) => `- ${warning}`)].join("\n"),
		};
	}

	const summary = computeEpicDependencyStatus(stateRead.state);
	const warnings = unique([...(stateRead.warnings ?? []), ...epicValidationWarnings(stateRead.state), ...summary.validation.warnings]);
	return { currentName, epic, stateRead, summary, warnings };
}

function epicStatusForChild(summary: ReturnType<typeof computeEpicDependencyStatus>, specName: string): EpicSpecDependencyStatus | null {
	return summary.specs.find((entry) => entry.name === specName) ?? null;
}

function preferredEpicStartStatus(state: EpicState, summary: ReturnType<typeof computeEpicDependencyStatus>): EpicSpecDependencyStatus | null {
	const activeName = typeof state.activeSpec === "string" ? state.activeSpec : null;
	const active = activeName ? summary.specs.find((entry) => entry.name === activeName && entry.status === "in_progress") : undefined;
	if (active) return active;
	const inProgress = summary.specs.find((entry) => entry.status === "in_progress");
	if (inProgress) return inProgress;
	return summary.nextSpec ? epicStatusForChild(summary, summary.nextSpec.name) : null;
}

function formatActiveEpicStartSuggestion(active: ActiveEpicRead): string {
	const lines = ["Active Ralph epic detected.", "", `Current epic: ${active.currentName ?? "none"}`];
	if (active.epic) lines.push(`Location: ${active.epic.path}`);

	if (!active.stateRead?.state || !active.summary) {
		lines.push("", active.error ?? "Epic state is unavailable.");
		return lines.join("\n");
	}

	const state = active.stateRead.state;
	const selected = preferredEpicStartStatus(state, active.summary);
	lines.push(
		`Epic status: ${state.status}`,
		`Progress: ${epicProgressText(state, active.summary.completedSpecs.length)}`,
		`Active child spec: ${state.activeSpec ?? "none"}`,
	);

	if (selected) {
		const label = selected.status === "in_progress" ? "Active child spec" : "Next unblocked child spec";
		lines.push(
			"",
			`${label}: ${selected.name}`,
			`Goal: ${selected.spec.goal ?? ""}`,
			`Dependencies: ${selected.dependencies.length > 0 ? selected.dependencies.join(", ") : "none"}`,
			"",
			"Run /ralph-start --next-epic-spec to select this child spec, or pass an explicit spec name to work outside the epic.",
		);
	} else if (state.status === "completed") {
		lines.push("", "Epic is complete. Run /ralph-epic-status for details or pass an explicit spec name.");
	} else if (state.status === "cancelled") {
		lines.push("", "Epic is cancelled. Run /ralph-epic-status for details or pass an explicit spec name.");
	} else {
		lines.push("", "No unblocked child spec is ready.");
		const blocked = active.summary.specs.filter((entry) => entry.isDependencyBlocked || entry.isExplicitlyBlocked);
		if (blocked.length > 0) lines.push("", "Blocked specs:", ...blocked.map((entry) => `- ${entry.name}: ${formatEpicDependencyReason(entry)}`));
	}

	lines.push("", "Epic commands:", "- /ralph-epic-status", "- /ralph-epic-next --switch", "- /ralph-epic-next --start");
	if (active.warnings.length > 0) lines.push("", "Warnings:", ...active.warnings.map((warning) => `- ${warning}`));
	return lines.join("\n");
}

async function selectActiveEpicStart(parsed: StartArguments, ctx: ExtensionCommandContext, options: RalphPathOptions): Promise<EpicStartSelection> {
	if (parsed.reference) return { kind: "none" };

	const active = readActiveEpicForStart(options);
	if (!active.currentName) {
		return parsed.nextEpicSpec ? { kind: "error", message: "No active epic is set. Run /ralph-triage or /ralph-epic-switch first." } : { kind: "none" };
	}
	if (!active.epic || !active.stateRead?.state || !active.summary) {
		return parsed.nextEpicSpec
			? { kind: "error", message: active.error ?? "Active epic state is unavailable." }
			: { kind: "message", message: formatActiveEpicStartSuggestion(active), type: "warning" };
	}

	const state = active.stateRead.state;
	if (state.status === "completed" || state.status === "cancelled") {
		const message = formatActiveEpicStartSuggestion(active);
		return parsed.nextEpicSpec ? { kind: "error", message } : { kind: "message", message, type: "warning" };
	}

	const selected = preferredEpicStartStatus(state, active.summary);
	if (!selected) {
		const message = formatActiveEpicStartSuggestion(active);
		return parsed.nextEpicSpec ? { kind: "error", message } : { kind: "message", message, type: "warning" };
	}

	const context: EpicStartContext = {
		epic: active.epic,
		state,
		child: selected.spec,
		dependencyStatus: selected,
		selectedByNextFlag: parsed.nextEpicSpec,
	};

	if (parsed.nextEpicSpec) {
		return { kind: "selected", context, warnings: active.warnings };
	}

	if (ctx.hasUI && !parsed.goal && !parsed.quickMode && !parsed.autonomousMode) {
		const confirmed = await ctx.ui.confirm(
			"Start next epic child spec?",
			[
				`Active epic '${active.epic.name}' has ${selected.status === "in_progress" ? "an active" : "a ready"} child spec '${selected.name}'.`,
				"",
				`Goal: ${selected.spec.goal ?? ""}`,
				`Dependencies: ${selected.dependencies.length > 0 ? selected.dependencies.join(", ") : "none"}`,
				"",
				"Choose OK to start/resume this child spec, or Cancel to enter another spec name.",
			].join("\n"),
		);
		if (confirmed) return { kind: "selected", context, warnings: active.warnings };
		return { kind: "none" };
	}

	return { kind: "message", message: formatActiveEpicStartSuggestion(active), type: active.warnings.length > 0 ? "warning" : "info" };
}

async function epicStartContextForSpec(spec: SpecEntry, ctx: ExtensionCommandContext, options: RalphPathOptions): Promise<{ context?: EpicStartContext; warnings: string[]; error?: string }> {
	const active = readActiveEpicForStart(options);
	if (!active.currentName || !active.epic || !active.stateRead?.state || !active.summary) return { warnings: [] };

	const entry = epicStatusForChild(active.summary, spec.name);
	if (!entry) return { warnings: active.warnings };

	if (active.stateRead.state.status === "completed" || active.stateRead.state.status === "cancelled") {
		return { warnings: active.warnings, error: `Cannot start child spec '${spec.name}' because epic '${active.epic.name}' is ${active.stateRead.state.status}.` };
	}

	if (entry.isDependencyBlocked || entry.isExplicitlyBlocked) {
		const reason = formatEpicDependencyReason(entry);
		if (!ctx.hasUI) {
			return { warnings: active.warnings, error: `Cannot start epic child spec '${spec.name}': ${reason}. Complete dependencies or update the epic state first.` };
		}
		const confirmed = await ctx.ui.confirm(
			"Start blocked epic child spec?",
			[
				`Child spec '${spec.name}' belongs to active epic '${active.epic.name}' but is blocked: ${reason}.`,
				"",
				"Starting out of dependency order can break interface contracts. Continue anyway?",
			].join("\n"),
		);
		if (!confirmed) return { warnings: active.warnings, error: `Ralph start aborted for blocked epic child spec '${spec.name}'.` };
		active.warnings.push(`Started blocked epic child spec '${spec.name}' after UI confirmation: ${reason}.`);
	}

	return {
		context: {
			epic: active.epic,
			state: active.stateRead.state,
			child: entry.spec,
			dependencyStatus: entry,
			selectedByNextFlag: false,
		},
		warnings: active.warnings,
	};
}

function activateEpicChildForStart(context: EpicStartContext, options: RalphPathOptions): EpicStartContext {
	const status = context.dependencyStatus?.status;
	if (status === "completed" || status === "cancelled") return context;
	const updatedState = startEpicChildSpec(context.epic, context.child.name, options);
	const summary = computeEpicDependencyStatus(updatedState);
	const updatedEntry = epicStatusForChild(summary, context.child.name);
	return {
		...context,
		state: updatedState,
		child: updatedEntry?.spec ?? context.child,
		dependencyStatus: updatedEntry ?? context.dependencyStatus,
	};
}

function epicStartStatePatch(context: EpicStartContext, spec: SpecEntry, phase: StartPhase, existingState: RalphState | null, options: RalphPathOptions): Record<string, unknown> {
	return {
		...childSpecStatePatch(context.epic, context.state, context.child, spec, existingState),
		source: existingState?.source ?? "epic",
		phase,
		epicStatePath: getEpicStatePath(context.epic, options),
		epicStartedVia: context.selectedByNextFlag ? "--next-epic-spec" : "active-epic",
		epicLastSyncedAt: new Date().toISOString(),
	};
}

function ensureEpicChildPlanForStart(context: EpicStartContext, spec: SpecEntry, parsed: StartArguments): string | null {
	const planPath = join(spec.absolutePath, "plan.md");
	if (existsSync(planPath) && !parsed.fresh) return null;
	const epicMarkdown = readFileIfExists(epicMarkdownPath(context.epic));
	atomicWriteCoordinatorText(planPath, buildChildPlan(context.epic, context.state, context.child, epicMarkdown));
	return planPath;
}

function ensureEpicProgressContext(spec: SpecEntry, context: EpicStartContext, options: RalphPathOptions): string {
	const progress = readProgress(spec, options);
	if (progress.includes("## Epic Context") && progress.includes(`- Epic: ${context.state.name}`)) {
		return getProgressPath(spec, options);
	}

	const dependencies = context.child.dependencies && context.child.dependencies.length > 0 ? context.child.dependencies : [];
	const dependencyLines = dependencies.length > 0
		? dependencies.map((dependency) => {
			const child = childSpecEntry(dependency, options);
			return `- ${dependency} (progress: ${getProgressPath(child, options)})`;
		})
		: ["- None"];
	const contractLines = formatContractsForPlan(relevantContractsForSpec(context.state, context.child));
	appendProgress(
		spec,
		[
			"",
			"## Epic Context",
			`- Epic: ${context.state.name}`,
			`- Epic file: ${epicDisplayPath(context.epic, "epic.md")}`,
			`- Epic state: ${getEpicStatePath(context.epic, options)}`,
			`- Child spec: ${context.child.name}`,
			"",
			"### Dependencies",
			...dependencyLines,
			"",
			"### Interface Contracts",
			...contractLines,
			"",
		].join("\n"),
		options,
	);
	return getProgressPath(spec, options);
}

async function runStartCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: ExtensionCommandContext,
	invocation: StartInvocation = RALPH_START_INVOCATION,
): Promise<void> {
	await ctx.waitForIdle();
	const options = pathOptions(ctx);
	const parsed = parseStartArgs(args);
	if (parsed.error) {
		await notify(ctx, parsed.error, "warning");
		return;
	}
	if (parsed.nextEpicSpec && parsed.reference) {
		await notify(ctx, "Use --next-epic-spec without an explicit spec name; pass a spec name without the flag to start a specific spec.", "warning");
		return;
	}

	const quickOrAutonomous = parsed.quickMode || parsed.autonomousMode;
	let epicStartContext: EpicStartContext | null = null;
	const selection = await selectActiveEpicStart(parsed, ctx, options);
	if (selection.kind === "error") {
		await notify(ctx, selection.message, "warning");
		return;
	}
	if (selection.kind === "message") {
		await notify(ctx, selection.message, selection.type);
		return;
	}
	if (selection.kind === "selected") {
		epicStartContext = selection.context;
		parsed.reference = selection.context.child.name;
		if (!parsed.goal) parsed.goal = selection.context.child.goal ?? "";
		parsed.warnings.push(...selection.warnings, `Selected epic child spec '${selection.context.child.name}' from active epic '${selection.context.epic.name}'.`);
	}

	const hasCurrentSpec = Boolean(readCurrentSpecValue(options));
	if (!parsed.reference && ctx.hasUI && !quickOrAutonomous && (parsed.goal || !hasCurrentSpec)) {
		const name = await ctx.ui.input("Spec name", "kebab-case, e.g. user-auth");
		if (!name?.trim()) {
			await notify(ctx, "Ralph start aborted: no spec name provided.", "warning");
			return;
		}
		parsed.reference = name.trim();
	}

	const resolved = resolveStartTarget(parsed, options);
	if (!resolved.target) {
		await notify(ctx, resolved.error ?? "Unable to resolve Ralph spec target.", "warning");
		return;
	}

	if (resolved.target.isNew && !parsed.goal && quickOrAutonomous) {
		await notify(ctx, "Quick/autonomous mode requires a spec goal for new specs; pass it in the /ralph-start arguments.", "warning");
		return;
	}

	if (resolved.target.isNew && !parsed.goal && ctx.hasUI) {
		const goal = await ctx.ui.input("Spec goal", "Describe what you want to build or achieve");
		parsed.goal = goal?.trim() ?? "";
	}

	const branchDecision: BranchDecision = await decideStartBranchBeforeWrites({
		cwd: options.cwd,
		specName: resolved.target.spec.name,
		isNew: resolved.target.isNew,
		quickMode: parsed.quickMode,
		autonomousMode: parsed.autonomousMode,
		dependencies: {
			ui: ctx.hasUI
				? async (title, choices) => {
					const labels = choices.map((choice) => choice.label);
					const selected = await ctx.ui.select(title, labels);
					return choices.find((choice) => choice.label === selected) ?? null;
				}
				: undefined,
		},
	});
	if (branchDecision.aborted) {
		await notify(ctx, branchDecision.reason, "warning");
		return;
	}

	try {
		ensureRalphGitignore(options.cwd);
	} catch (error) {
		await notify(ctx, `Failed to update Ralph .gitignore entries: ${formatError(error)}`, "warning");
		return;
	}

	try {
		mkdirSync(resolved.target.spec.absolutePath, { recursive: true });
	} catch (error) {
		await notify(ctx, `Failed to create spec directory: ${formatError(error)}`, "warning");
		return;
	}

	const spec = specEntryFromAbsolutePath(resolved.target.spec.absolutePath, {
		...options,
		allowMissingConfiguredRoots: true,
	});
	const stateRead = safeReadSpecState(spec, options);
	if (stateRead.error) {
		await notify(ctx, `Cannot start spec with invalid state: ${stateRead.error}`, "warning");
		return;
	}

	if (!epicStartContext) {
		const explicitEpicContext = await epicStartContextForSpec(spec, ctx, options);
		if (explicitEpicContext.error) {
			await notify(ctx, explicitEpicContext.error, "warning");
			return;
		}
		if (explicitEpicContext.context) {
			epicStartContext = explicitEpicContext.context;
			if (!parsed.goal) parsed.goal = explicitEpicContext.context.child.goal ?? "";
			parsed.warnings.push(...explicitEpicContext.warnings, `Spec '${spec.name}' is a child of active epic '${explicitEpicContext.context.epic.name}'.`);
		}
	}

	if (epicStartContext) {
		try {
			epicStartContext = activateEpicChildForStart(epicStartContext, options);
			const planPath = ensureEpicChildPlanForStart(epicStartContext, spec, parsed);
			if (planPath) parsed.warnings.push(`Wrote epic child plan: ${planPath}`);
		} catch (error) {
			await notify(ctx, `Failed to update active epic before starting child spec: ${formatError(error)}`, "warning");
			return;
		}
	}

	const phase = determineStartPhase(spec, stateRead.state, parsed, resolved.target.isNew);
	const discoveredRelatedSpecs = discoverRelatedSpecs(spec, parsed.goal, options);
	const discoveredSkills = discoverSkills(spec, parsed.goal, options);
	let statePatch = startStatePatch(spec, parsed, phase, stateRead.state);
	statePatch.relatedSpecs = mergeRelatedSpecsByName(statePatch.relatedSpecs, discoveredRelatedSpecs);
	statePatch.discoveredSkills = mergeDiscoveredSkillsByName(statePatch.discoveredSkills, discoveredSkills);
	if (epicStartContext) {
		statePatch = {
			...statePatch,
			...epicStartStatePatch(epicStartContext, spec, phase, stateRead.state, options),
			phase,
			taskIndex: statePatch.taskIndex,
			totalTasks: statePatch.totalTasks,
			taskIteration: statePatch.taskIteration,
			maxTaskIterations: statePatch.maxTaskIterations,
			globalIteration: statePatch.globalIteration,
			maxGlobalIterations: statePatch.maxGlobalIterations,
			quickMode: statePatch.quickMode,
			autonomousMode: statePatch.autonomousMode,
			awaitingApproval: statePatch.awaitingApproval,
		};
	}

	const startSummaryMetadata = buildStartSummaryMetadata(branchDecision, statePatch);
	const rootForSpec = getSpecRoots({ ...options, allowMissingConfiguredRoots: true })
		.find((root) => root.absolutePath === spec.rootAbsolutePath) ?? getSpecRoots({ ...options, allowMissingConfiguredRoots: true })[0];
	const specRoot = {
		path: rootForSpec.path,
		absolutePath: rootForSpec.absolutePath,
		source: rootForSpec.source,
	};
	statePatch = {
		...statePatch,
		startCompatibility: {
			command: invocation.command,
			...(invocation.aliasOf ? { aliasOf: invocation.aliasOf } : {}),
			// Smoke compatibility token: aliasOf: invocation.aliasOf is intentionally conditional above.
			options: buildStartOptionsSnapshot(parsed),
			branchDecision: branchDecision,
			specRoot: specRoot,
			statePatch: {
				phase,
				commitSpec: statePatch.commitSpec,
				relatedSpecs: statePatch.relatedSpecs,
				discoveredSkills: statePatch.discoveredSkills,
			},
		} satisfies StartCompatibilityContractV1,
	};

	let state: RalphState;
	try {
		const updatedState = mergeRalphState(spec, statePatch, options);
		state = updatedState;
	} catch (error) {
		await notify(ctx, `Failed to write Ralph state: ${formatError(error)}`, "warning");
		return;
	}

	let progressPath: string;
	try {
		progressPath = maybeWriteInitialProgress(
			spec,
			parsed.goal,
			phase,
			parsed.quickMode || parsed.autonomousMode,
			options,
		);
		if (epicStartContext) progressPath = ensureEpicProgressContext(spec, epicStartContext, options);
	} catch (error) {
		await notify(ctx, `Failed to write Ralph progress: ${formatError(error)}`, "warning");
		return;
	}

	try {
		const currentSpecRoot = getSpecRoots({ ...options, allowMissingConfiguredRoots: true })[0];
		mkdirSync(currentSpecRoot.absolutePath, { recursive: true });
	} catch (error) {
		await notify(ctx, `Failed to prepare current-spec root: ${formatError(error)}`, "warning");
		return;
	}

	const currentMarkerBeforeStart = readCurrentSpecValue(options);
	const currentSpecBeforeStart = currentMarkerBeforeStart ? resolveCurrentSpec(options) : null;
	const preserveCurrentSpecMarker = Boolean(
		parsed.reference
		&& currentMarkerBeforeStart
		&& currentSpecBeforeStart?.exists
		&& currentSpecBeforeStart.absolutePath !== spec.absolutePath,
	);
	const nextCommandOverride = preserveCurrentSpecMarker
		? `${startPhaseCommand(phase)}${quickOrAutonomous ? " --quick" : ""} ${spec.path}`
		: undefined;
	if (preserveCurrentSpecMarker) {
		parsed.warnings.push(`Preserved active current spec marker '${currentMarkerBeforeStart}' while starting '${spec.name}'. Use explicit spec reference '${spec.path}' for follow-up commands.`);
	} else {
		writeCurrentSpec(spec, options);
	}
	await notify(
		ctx,
		formatStartSummary(
			spec,
			resolved.target.isNew,
			phase,
			state,
			preserveCurrentSpecMarker ? `${currentMarkerBeforeStart} (preserved)` : spec.name,
			progressPath,
			startSummaryMetadata,
			parsed.warnings,
			nextCommandOverride,
		),
	);
	if (quickOrAutonomous) {
		await runQuickFlow(pi, ctx, spec, parsed, options, { preserveCurrentSpecMarker });
	}
}

function parseCancelArgs(args: string): CancelArguments {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const references: string[] = [];
	let deleteSpec = false;

	for (const token of tokens) {
		if (token === "--delete" || token === "--delete-spec") {
			deleteSpec = true;
			continue;
		}
		if (token.startsWith("--")) {
			return { reference: null, deleteSpec, error: `Unknown option: ${token}` };
		}
		references.push(token);
	}

	if (references.length > 1) {
		return { reference: null, deleteSpec, error: `Expected at most one spec reference, got: ${references.join(" ")}` };
	}
	return { reference: references[0] ?? null, deleteSpec };
}

function resolveCancelTarget(reference: string | null, options: RalphPathOptions): { spec?: SpecEntry; error?: string } {
	if (reference) return resolveExistingSpec(reference, options);

	const currentValue = readCurrentSpecValue(options);
	if (!currentValue) {
		return { error: "No active spec is set. Pass a spec name/path to cancel a specific spec." };
	}

	const spec = resolveCurrentSpec(options);
	if (!spec) {
		return { error: `Unable to resolve active spec '${currentValue}'.` };
	}
	if (!spec.exists) {
		return { error: `Active spec '${currentValue}' points to a missing directory: ${spec.path}` };
	}
	return { spec };
}

function unlinkIfExists(filePath: string): boolean {
	if (!existsSync(filePath)) return false;
	unlinkSync(filePath);
	return true;
}

function clearCurrentSpecIfMatches(spec: SpecEntry, options: RalphPathOptions): boolean {
	if (currentSpecPath(options) !== spec.absolutePath) return false;
	return unlinkIfExists(getCurrentSpecFilePath(options));
}

function formatCancelConfirmation(spec: SpecEntry, stateRead: SafeStateRead, willDeleteSpec: boolean, options: RalphPathOptions): string {
	const currentMarker = currentSpecPath(options) === spec.absolutePath ? "yes" : "no";
	return [
		`Spec: ${spec.name}`,
		`Location: ${spec.path}`,
		`State file: ${stateRead.path}`,
		`Active marker points here: ${currentMarker}`,
		"",
		...formatStateBeforeCancel(stateRead),
		"",
		"This cancels Ralph execution state only: it removes .ralph-state.json if present and clears .current-spec if it points to this spec.",
		willDeleteSpec ? "You also requested permanent deletion of the spec directory after an additional confirmation." : "Spec files will be kept.",
		"Choose OK only if you want to stop this spec's current Ralph run.",
	].join("\n");
}

function formatStateBeforeCancel(stateRead: SafeStateRead): string[] {
	if (stateRead.error) return [`State before cancellation: invalid (${stateRead.error})`];
	if (!stateRead.state) return ["State before cancellation: none"];

	return [
		"State before cancellation:",
		`- Phase: ${stringField(stateRead.state, "phase") ?? "unknown"}`,
		`- Progress: ${numberField(stateRead.state, "taskIndex") ?? 0}/${numberField(stateRead.state, "totalTasks") ?? 0} tasks`,
		`- Task iteration: ${numberField(stateRead.state, "taskIteration") ?? "unknown"}`,
		`- Global iteration: ${numberField(stateRead.state, "globalIteration") ?? "unknown"}`,
	];
}

async function maybeDeleteSpecDirectory(
	ctx: ExtensionCommandContext,
	spec: SpecEntry,
	options: RalphPathOptions,
): Promise<string> {
	const safetyError = specDeleteSafetyError(spec, options);
	if (safetyError) return `Skipped spec directory delete: ${safetyError}`;
	if (!ctx.hasUI) return "Skipped spec directory delete: Pi UI confirmation is required.";

	const confirmed = await ctx.ui.confirm(
		"Delete spec directory?",
		[`Permanently delete ${spec.path}?`, "", "This removes all spec files and cannot be undone."].join("\n"),
	);
	if (!confirmed) return "Skipped spec directory delete: user cancelled.";

	rmSync(spec.absolutePath, { recursive: true, force: true });
	return `Deleted spec directory: ${spec.path}`;
}

type ArtifactPhase = (typeof SPEC_ARTIFACTS)[number];

type PhaseApprovalDecision = "approved" | "changes_requested" | "not_requested" | "skipped_non_normal";

type PhaseReviewContext = {
	iteration: number;
	priorFindings: string[];
};

type ArtifactReviewResult = {
	passed: boolean;
	output: string;
	signal?: "REVIEW_PASS" | "REVIEW_FAIL";
	error?: string;
};

type ReviewedPhaseResult = {
	state: RalphState;
	summary: string;
	iterations: number;
};

type PhaseArguments = {
	reference: string | null;
	quickMode: boolean;
	autonomousMode: boolean;
	tasksSize?: "fine" | "coarse";
	warnings: string[];
	error?: string;
};

type PhaseDefinition = {
	phase: ArtifactPhase;
	commandName: string;
	agentName: string;
	description: string;
	requiredArtifacts: ArtifactPhase[];
	nextCommand: string;
	maxTurns: number;
};

type PhaseTarget = {
	spec: SpecEntry;
	state: RalphState | null;
};

type RpcReply<T> = {
	success?: boolean;
	data?: T;
	error?: string;
};

type SubagentCompletion = {
	id: string;
	type?: string;
	description?: string;
	result?: string;
	error?: string;
	status?: string;
};

type RalphSubagentRecord = {
	id: string;
	type?: string;
	description?: string;
	startedAt: number;
	completedAt?: number;
	status: string;
	toolUses: number;
	lifetimeUsage: {
		input: number;
		output: number;
		cacheWrite: number;
	};
	session?: {
		getSessionStats?: () => {
			tokens?: {
				input?: number;
				output?: number;
				cacheWrite?: number;
			};
			contextUsage?: {
				tokens?: number | null;
				contextWindow?: number;
				percent?: number | null;
			};
		};
	};
};

type RalphSubagentManager = {
	getRecord(id: string): RalphSubagentRecord | undefined;
};

type RalphTrackedSubagentEntry = {
	id: string;
	type?: string;
	description?: string;
	startedAt: number;
	completedAt?: number;
	status: string;
	toolUses?: number;
	totalTokens?: number;
};

const RALPH_SUBAGENT_STATUS_INTERVAL_MS = 250;
const RALPH_TOKEN_BAR_WIDTH = 16;
const RALPH_SUBAGENT_WIDGET_KEY = "ralph-subagents";
const RALPH_SUBAGENT_WIDGET_BAR_WIDTH = 10;
const RALPH_SUBAGENT_WIDGET_MAX_LINES = 6;
const RALPH_SUBAGENT_WIDGET_SUCCESS_LINGER_MS = 4_000;
const RALPH_SUBAGENT_WIDGET_ERROR_LINGER_MS = 8_000;
const RALPH_SUBAGENT_WIDGET_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const ralphSubagentWidgetState: {
	tracked: Map<string, RalphTrackedSubagentEntry>;
} = {
	tracked: new Map(),
};

function getRalphSubagentManager(): RalphSubagentManager | undefined {
	const manager = (globalThis as any)[Symbol.for("pi-subagents:manager")];
	return manager && typeof manager.getRecord === "function" ? (manager as RalphSubagentManager) : undefined;
}

function formatTokenCount(tokens: number): string {
	if (!Number.isFinite(tokens) || tokens < 0) return "0";
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return `${Math.round(tokens)}`;
}

function formatTokenUsageBar(current: number, max: number, width = RALPH_TOKEN_BAR_WIDTH): string {
	if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
		return `${formatTokenCount(current)} / unknown`;
	}
	const percent = Math.max(0, Math.min(1, current / max));
	const filled = percent >= 1 ? width : Math.max(0, Math.floor(percent * width));
	let bar: string;
	if (filled <= 0) {
		bar = ">" + "-".repeat(Math.max(0, width - 1));
	} else if (filled >= width) {
		bar = "=".repeat(width);
	} else {
		bar = "=".repeat(filled) + ">" + "-".repeat(Math.max(0, width - filled - 1));
	}
	return `${(percent * 100).toFixed(1)}% [${bar}] ${formatTokenCount(current)}/${formatTokenCount(max)}`;
}

function getSubagentLifetimeUsageTokens(record: { lifetimeUsage?: { input?: number; output?: number; cacheWrite?: number } }): number {
	const usage = record.lifetimeUsage;
	if (!usage) return 0;
	return Math.max(0, (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheWrite ?? 0));
}

function getSubagentSessionTokens(record?: {
	session?: {
		getSessionStats?: () => {
			tokens?: { input?: number; output?: number; cacheWrite?: number };
		};
	};
}): number | null {
	const stats = typeof record?.session?.getSessionStats === "function" ? record.session.getSessionStats() : undefined;
	const tokens = stats?.tokens;
	if (!tokens) return null;
	const total = (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.cacheWrite ?? 0);
	return Number.isFinite(total) ? Math.max(0, total) : null;
}

function getSubagentContextUsage(record?: {
	session?: {
		getSessionStats?: () => {
			contextUsage?: { tokens?: number | null; contextWindow?: number; percent?: number | null };
		};
	};
}): { current: number | null; max: number | null; percent: number | null } {
	const stats = typeof record?.session?.getSessionStats === "function" ? record.session.getSessionStats() : undefined;
	const usage = stats?.contextUsage;
	const current = typeof usage?.tokens === "number" && Number.isFinite(usage.tokens) ? Math.max(0, usage.tokens) : null;
	const max = typeof usage?.contextWindow === "number" && Number.isFinite(usage.contextWindow) && usage.contextWindow > 0
		? usage.contextWindow
		: null;
	const percent = typeof usage?.percent === "number" && Number.isFinite(usage.percent)
		? Math.max(0, Math.min(100, usage.percent))
		: current !== null && max !== null
			? Math.max(0, Math.min(100, (current / max) * 100))
			: null;
	return { current, max, percent };
}

function getSubagentUsageText(record?: any): string {
	if (!record) return "";

	const contextUsage = getSubagentContextUsage(record);
	if (contextUsage.current !== null && contextUsage.max !== null) {
		return `${formatTokenCount(contextUsage.current)}/${formatTokenCount(contextUsage.max)} ctx${contextUsage.percent !== null ? ` (${Math.round(contextUsage.percent)}%)` : ""}`;
	}

	const sessionTokens = getSubagentSessionTokens(record);
	if (sessionTokens !== null) {
		return `${formatTokenCount(sessionTokens)} tok${contextUsage.percent !== null ? ` (${Math.round(contextUsage.percent)}% ctx)` : ""}`;
	}

	const lifetime = getSubagentLifetimeUsageTokens(record);
	return `${formatTokenCount(lifetime)} tok${contextUsage.percent !== null ? ` (${Math.round(contextUsage.percent)}% ctx)` : ""}`;
}

function formatSubagentWidgetName(type?: string): string {
	const normalized = (type ?? "Agent").trim().replace(/^ralph[-\s]+/i, "");
	return normalized
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ") || "Agent";
}

function getSubagentWidgetProgress(record: RalphSubagentRecord): { current: number; max: number | null; percent: number | null; source: "context" | "session" | "lifetime" } {
	const contextUsage = getSubagentContextUsage(record);
	if (contextUsage.current !== null && contextUsage.max !== null) {
		return { current: contextUsage.current, max: contextUsage.max, percent: contextUsage.percent, source: "context" };
	}
	const sessionTokens = getSubagentSessionTokens(record);
	if (sessionTokens !== null) {
		return { current: sessionTokens, max: null, percent: contextUsage.percent, source: "session" };
	}
	return { current: getSubagentLifetimeUsageTokens(record), max: null, percent: contextUsage.percent, source: "lifetime" };
}

function formatSubagentWidgetProgress(record: RalphSubagentRecord): string {
	const { current, max, percent, source } = getSubagentWidgetProgress(record);
	if (source === "context" && max !== null) {
		const ctxPercent = percent ?? Math.max(0, Math.min(100, (current / Math.max(1, max)) * 100));
		return `🪟 ${Math.round(ctxPercent)}% ${formatFooterBar(current, max, RALPH_SUBAGENT_WIDGET_BAR_WIDTH)} ${formatTokenCount(current)}/${formatTokenCount(max)} ctx`;
	}
	if (percent !== null) {
		const tokenText = current > 0 ? ` · ${formatTokenCount(current)} tok` : "";
		return `🪟 ${Math.round(percent)}% ${formatFooterBar(percent, 100, RALPH_SUBAGENT_WIDGET_BAR_WIDTH)}${tokenText}`;
	}
	return `${formatTokenCount(current)} tok`;
}

function upsertTrackedSubagent(raw: unknown, fallbackStatus: string): void {
	if (!raw || typeof raw !== "object") return;
	const event = raw as {
		id?: unknown;
		type?: unknown;
		description?: unknown;
		status?: unknown;
		toolUses?: unknown;
		tokens?: { total?: unknown };
	};
	if (typeof event.id !== "string" || !event.id.trim()) return;
	const existing = ralphSubagentWidgetState.tracked.get(event.id);
	const now = Date.now();
	const nextStatus = typeof event.status === "string" && event.status.trim() ? event.status : fallbackStatus;
	const next: RalphTrackedSubagentEntry = {
		id: event.id,
		type: typeof event.type === "string" ? event.type : existing?.type,
		description: typeof event.description === "string" ? event.description : existing?.description,
		startedAt: existing?.startedAt ?? now,
		completedAt: existing?.completedAt,
		status: nextStatus,
		toolUses: typeof event.toolUses === "number" && Number.isFinite(event.toolUses) ? Math.max(0, event.toolUses) : existing?.toolUses,
		totalTokens: typeof event.tokens?.total === "number" && Number.isFinite(event.tokens.total) ? Math.max(0, event.tokens.total) : existing?.totalTokens,
	};
	if (nextStatus !== "running" && nextStatus !== "queued") next.completedAt = now;
	if (nextStatus === "running" && existing?.startedAt) next.startedAt = existing.startedAt;
	if (nextStatus === "queued" && existing?.startedAt) next.startedAt = existing.startedAt;
	ralphSubagentWidgetState.tracked.set(event.id, next);
}

function resolveTrackedSubagentRecord(entry: RalphTrackedSubagentEntry): RalphSubagentRecord {
	const live = getRalphSubagentManager()?.getRecord(entry.id);
	if (live) {
		return {
			...live,
			type: live.type ?? entry.type,
			description: live.description ?? entry.description,
			startedAt: live.startedAt || entry.startedAt,
			completedAt: live.completedAt ?? entry.completedAt,
			status: live.status || entry.status,
		};
	}
	return {
		id: entry.id,
		type: entry.type,
		description: entry.description,
		startedAt: entry.startedAt,
		completedAt: entry.completedAt,
		status: entry.status,
		toolUses: entry.toolUses ?? 0,
		lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
		session: entry.totalTokens !== undefined ? {
			getSessionStats: () => ({
				tokens: { input: entry.totalTokens ?? 0, output: 0, cacheWrite: 0 },
				contextUsage: { percent: null },
			}),
		} : undefined,
	};
}

function readActiveSubagentRecords(): RalphSubagentRecord[] {
	return [...ralphSubagentWidgetState.tracked.values()]
		.map(resolveTrackedSubagentRecord)
		.filter((record) => record.status === "running" || record.status === "queued")
		.sort((left, right) => left.startedAt - right.startedAt);
}

function subagentWidgetLingerMs(status: string): number {
	return status === "error" || status === "aborted" || status === "steered" || status === "stopped"
		? RALPH_SUBAGENT_WIDGET_ERROR_LINGER_MS
		: RALPH_SUBAGENT_WIDGET_SUCCESS_LINGER_MS;
}

function pruneExpiredTrackedSubagents(now = Date.now()): void {
	for (const [id, entry] of ralphSubagentWidgetState.tracked.entries()) {
		const record = resolveTrackedSubagentRecord(entry);
		if (record.status === "running" || record.status === "queued") continue;
		if (!record.completedAt) {
			ralphSubagentWidgetState.tracked.delete(id);
			continue;
		}
		if (now - record.completedAt > subagentWidgetLingerMs(record.status)) {
			ralphSubagentWidgetState.tracked.delete(id);
		}
	}
}

function readLingeringSubagentRecords(now = Date.now()): RalphSubagentRecord[] {
	pruneExpiredTrackedSubagents(now);
	const finished: RalphSubagentRecord[] = [];
	for (const entry of ralphSubagentWidgetState.tracked.values()) {
		const record = resolveTrackedSubagentRecord(entry);
		if (record.status === "running" || record.status === "queued") continue;
		if (!record.completedAt) continue;
		finished.push(record);
	}
	return finished.sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0));
}

function formatSubagentWidgetFinishedState(
	record: RalphSubagentRecord,
	theme: { fg(color: any, text: string): string; bold(text: string): string },
): { icon: string; status: string; color: string } {
	switch (record.status) {
		case "completed":
			return { icon: theme.fg("success", "✓"), status: "done", color: "success" };
		case "steered":
			return { icon: theme.fg("warning", "✓"), status: "turn limit", color: "warning" };
		case "stopped":
			return { icon: theme.fg("dim", "■"), status: "stopped", color: "dim" };
		case "error":
			return { icon: theme.fg("error", "✕"), status: "error", color: "error" };
		case "aborted":
		default:
			return { icon: theme.fg("error", "✕"), status: "aborted", color: "warning" };
	}
}

function formatSubagentToolCount(toolUses: number): string {
	return `${toolUses} tool${toolUses === 1 ? "" : "s"}`;
}

function formatSubagentWidgetLine(
	record: RalphSubagentRecord,
	frame: string,
	theme: { fg(color: any, text: string): string; bold(text: string): string },
): string {
	const name = theme.bold(theme.fg("text", formatSubagentWidgetName(record.type)));
	if (record.status === "queued") {
		return `${theme.fg("accent", "[")} ${theme.fg("muted", "⋯")} ${name} ${theme.fg("muted", "🤖 queued")} ${theme.fg("accent", "]")}`;
	}
	if (record.status !== "running") {
		const finished = formatSubagentWidgetFinishedState(record, theme);
		const progress = formatSubagentWidgetProgress(record);
		const tools = formatSubagentToolCount(record.toolUses ?? 0);
		const elapsed = formatFooterElapsed(record.startedAt, record.completedAt);
		return `${theme.fg("dim", "[")} ${finished.icon} ${theme.fg("dim", formatSubagentWidgetName(record.type))} ${theme.fg("dim", "✕")} ${theme.fg(finished.color as any, finished.status)} ${theme.fg("dim", "·")} ${theme.fg("syntaxFunction", tools)} ${theme.fg("dim", "·")} ${theme.fg("syntaxString", elapsed)} ${theme.fg("dim", "·")} ${theme.fg("dim", progress)} ${theme.fg("dim", "]")}`;
	}
	const icon = theme.fg("accent", frame);
	const progress = formatSubagentWidgetProgress(record);
	const tools = formatSubagentToolCount(record.toolUses ?? 0);
	const elapsed = formatFooterElapsed(record.startedAt);
	return `${theme.fg("accent", "[")} ${icon} ${name} ${theme.fg("muted", "🤖 ")}${theme.fg("syntaxFunction", tools)} ${theme.fg("dim", "·")} ${theme.fg("syntaxString", elapsed)} ${theme.fg("dim", "·")} ${theme.fg("text", progress)} ${theme.fg("accent", "]")}`;
}

function installRalphSubagentWidget(pi: ExtensionAPI, ctx: ExtensionCommandContext): void {
	if (!ctx.hasUI) return;
	ralphSubagentWidgetState.tracked.clear();
	ctx.ui.setWidget(RALPH_SUBAGENT_WIDGET_KEY, (tui, theme) => {
		let hadVisible = false;
		const request = () => tui.requestRender();
		const unsubscribeCreated = eventOn(pi.events, "subagents:created", (raw) => {
			upsertTrackedSubagent(raw, "queued");
			request();
		});
		const unsubscribeStarted = eventOn(pi.events, "subagents:started", (raw) => {
			upsertTrackedSubagent(raw, "running");
			request();
		});
		const unsubscribeCompleted = eventOn(pi.events, "subagents:completed", (raw) => {
			upsertTrackedSubagent(raw, "completed");
			request();
		});
		const unsubscribeFailed = eventOn(pi.events, "subagents:failed", (raw) => {
			upsertTrackedSubagent(raw, "error");
			request();
		});
		const timer = setInterval(() => {
			const now = Date.now();
			const hasVisible = readActiveSubagentRecords().length > 0 || readLingeringSubagentRecords(now).length > 0;
			if (hasVisible || hadVisible) tui.requestRender();
			hadVisible = hasVisible;
		}, RALPH_SUBAGENT_STATUS_INTERVAL_MS);
		(timer as { unref?: () => void }).unref?.();
		return {
			dispose() {
				unsubscribeCreated();
				unsubscribeStarted();
				unsubscribeCompleted();
				unsubscribeFailed();
				clearInterval(timer);
			},
			invalidate() {},
			render() {
				const now = Date.now();
				const lingering = readLingeringSubagentRecords(now);
				const active = readActiveSubagentRecords();
				const visibleActive = active.slice(-RALPH_SUBAGENT_WIDGET_MAX_LINES);
				const visibleLingering = lingering.slice(0, Math.max(0, RALPH_SUBAGENT_WIDGET_MAX_LINES - visibleActive.length));
				const records = [...visibleLingering, ...visibleActive];
				hadVisible = records.length > 0;
				if (records.length === 0) return [];
				const width = tui.terminal.columns;
				const frame = RALPH_SUBAGENT_WIDGET_SPINNER_FRAMES[Math.floor(now / RALPH_SUBAGENT_STATUS_INTERVAL_MS) % RALPH_SUBAGENT_WIDGET_SPINNER_FRAMES.length] ?? "⠋";
				return records.map((record) => truncateToWidth(formatSubagentWidgetLine(record, frame, theme), width, "…"));
			},
		};
	}, { placement: "aboveEditor" });
}

function ensureRalphInteractiveSurfaces(pi: ExtensionAPI, ctx: ExtensionCommandContext): void {
	if (!ctx.hasUI) return;
	if (typeof ctx.ui.setFooter === "function") installRalphFooter(pi, ctx);
	if (typeof ctx.ui.setWidget === "function") installRalphSubagentWidget(pi, ctx);
}

function setSubagentStatusSurfaces(ctx: ExtensionCommandContext, message: string): void {
	setRalphStatus(ctx, message);
	if (ctx.hasUI && typeof ctx.ui.setStatus === "function") ctx.ui.setStatus("subagents", message);
}

function clearSubagentStatusSurfaces(ctx: ExtensionCommandContext): void {
	if (!ralphStatusAnimation.active) setRalphStatus(ctx);
	if (ctx.hasUI && typeof ctx.ui.setStatus === "function") ctx.ui.setStatus("subagents", undefined);
}

function ralphSubagentStatusMessage(
	phase: string,
	agentId: string,
	agentName: string,
	record?: any,
): string {
	const statusBits: string[] = [];
	const status = record?.status ? `(${record.status})` : "(running)";
	statusBits.push(status);
	const usage = getSubagentUsageText(record);
	if (usage) statusBits.push(usage);
	if ((record?.toolUses ?? 0) > 0) statusBits.push(`${record?.toolUses} tool use${(record?.toolUses ?? 0) === 1 ? "" : "s"}`);
	if (record?.startedAt) statusBits.push(formatRalphElapsed(record.startedAt));

	return `Ralph ${phase}: ${agentId} ${agentName} · ${statusBits.join(" · ")}`;
}

function startRalphSubagentStatusTicker(
	ctx: ExtensionCommandContext,
	phase: string,
	agentName: string,
	agentId: string,
): () => void {
	if (!ctx.hasUI) return () => {};
	ralphFooterState.ctx = ctx;
	ralphFooterState.subagent = { phase, agentName, agentId, startedAt: Date.now() };
	const manager = getRalphSubagentManager();
	if (!manager) {
		setSubagentStatusSurfaces(ctx, `Ralph ${phase}: ${agentId} ${agentName}`);
		return () => {
			if (ralphFooterState.subagent?.agentId === agentId) ralphFooterState.subagent = null;
			clearSubagentStatusSurfaces(ctx);
		};
	}

	const update = () => {
		const record = manager.getRecord(agentId);
		setSubagentStatusSurfaces(ctx, ralphSubagentStatusMessage(phase, agentId, agentName, record));
	};

	const timer = setInterval(update, RALPH_SUBAGENT_STATUS_INTERVAL_MS);
	(timer as { unref?: () => void }).unref?.();
	update();
	return () => {
		clearInterval(timer);
		if (ralphFooterState.subagent?.agentId === agentId) ralphFooterState.subagent = null;
		clearSubagentStatusSurfaces(ctx);
	};
}

type SubagentRunDefinition = {
	agentName: string;
	description: string;
	maxTurns: number;
};

const PHASE_DEFINITIONS: Record<ArtifactPhase, PhaseDefinition> = {
	research: {
		phase: "research",
		commandName: "ralph-research",
		agentName: "ralph-research-analyst",
		description: "Generate research.md",
		requiredArtifacts: [],
		nextCommand: "/ralph-requirements",
		maxTurns: 60,
	},
	requirements: {
		phase: "requirements",
		commandName: "ralph-requirements",
		agentName: "ralph-product-manager",
		description: "Generate requirements.md",
		requiredArtifacts: [],
		nextCommand: "/ralph-design",
		maxTurns: 50,
	},
	design: {
		phase: "design",
		commandName: "ralph-design",
		agentName: "ralph-architect-reviewer",
		description: "Generate design.md",
		requiredArtifacts: ["requirements"],
		nextCommand: "/ralph-tasks",
		maxTurns: 60,
	},
	tasks: {
		phase: "tasks",
		commandName: "ralph-tasks",
		agentName: "ralph-task-planner",
		description: "Generate tasks.md",
		requiredArtifacts: ["requirements", "design"],
		nextCommand: "/ralph-implement",
		maxTurns: 80,
	},
};

function phaseTitle(phase: ArtifactPhase): string {
	return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function parsePhaseArgs(args: string, phase: ArtifactPhase): PhaseArguments {
	const tokenized = tokenizeCommandArgs(args);
	if (tokenized.error) {
		return emptyPhaseArguments(tokenized.error);
	}

	const positionals: string[] = [];
	const warnings: string[] = [];
	let quickMode = false;
	let autonomousMode = false;
	let tasksSize: PhaseArguments["tasksSize"];

	for (let index = 0; index < tokenized.tokens.length; index += 1) {
		const token = tokenized.tokens[index];
		if (token === "--quick") {
			quickMode = true;
			continue;
		}
		if (token === "--autonomous" || token === "--auto") {
			autonomousMode = true;
			continue;
		}
		if (phase === "tasks" && (token === "--tasks-size" || token.startsWith("--tasks-size="))) {
			const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : tokenized.tokens[++index];
			if (!value || value.startsWith("--")) return emptyPhaseArguments("--tasks-size requires fine or coarse.");
			if (value === "fine" || value === "coarse") {
				tasksSize = value;
			} else {
				tasksSize = "fine";
				warnings.push(`Invalid --tasks-size value "${value}"; defaulting to fine.`);
			}
			continue;
		}
		if (token.startsWith("--")) {
			return emptyPhaseArguments(`Unknown option: ${token}`);
		}
		positionals.push(token);
	}

	if (positionals.length > 1) {
		return emptyPhaseArguments(`Expected at most one spec reference, got: ${positionals.join(" ")}`);
	}

	return {
		reference: positionals[0] ?? null,
		quickMode,
		autonomousMode,
		tasksSize,
		warnings,
	};
}

function emptyPhaseArguments(error: string): PhaseArguments {
	return {
		reference: null,
		quickMode: false,
		autonomousMode: false,
		warnings: [],
		error,
	};
}

function resolvePhaseTarget(parsed: PhaseArguments, options: RalphPathOptions): { target?: PhaseTarget; error?: string } {
	let spec: SpecEntry | undefined;
	if (parsed.reference) {
		const resolved = resolveExistingSpec(parsed.reference, options);
		if (!resolved.spec) return { error: resolved.error ?? `Unable to resolve spec '${parsed.reference}'.` };
		spec = resolved.spec;
	} else {
		const currentValue = readCurrentSpecValue(options);
		if (!currentValue) {
			return { error: "No active spec is set. Run /ralph-start <spec-name> first or pass a spec name/path." };
		}
		spec = resolveCurrentSpec(options) ?? undefined;
		if (!spec) return { error: `Unable to resolve active spec '${currentValue}'.` };
	}

	if (!spec.exists) return { error: `Spec directory does not exist: ${spec.path}` };
	const stateRead = safeReadSpecState(spec, options);
	if (stateRead.error) return { error: `Cannot run phase with invalid state: ${stateRead.error}` };
	return { target: { spec, state: stateRead.state } };
}

function validatePhasePrerequisites(definition: PhaseDefinition, spec: SpecEntry): string | null {
	for (const artifact of definition.requiredArtifacts) {
		if (!artifactExists(spec, artifact)) {
			return `${phaseTitle(artifact)} not found. Run /ralph-${artifact} first.`;
		}
	}
	return null;
}

function phaseDependencyError(pi: ExtensionAPI, definition: PhaseDefinition, cwd: string, bootstrapResult?: RalphAgentBootstrapResult): string | null {
	const requiredTools = definition.phase === "research"
		? ["Agent", ...WEB_RESEARCH_TOOLS, MCP_PROXY_TOOL]
		: definition.phase === "tasks"
			? ["Agent", ...NATIVE_TASK_TOOLS, ...WEB_FETCH_TOOLS, MCP_PROXY_TOOL]
			: ["Agent"];
	const packageHint = definition.phase === "research"
		? "@tintinweb/pi-subagents, pi-agent-browser-native, and pi-mcp-adapter"
		: definition.phase === "tasks"
			? "@tintinweb/pi-subagents, @tintinweb/pi-tasks, pi-agent-browser-native, and pi-mcp-adapter"
			: "@tintinweb/pi-subagents";
	const toolError = activeToolDependencyError(pi, requiredTools, definition.commandName, packageHint);
	if (toolError) return toolError;

	return ralphAgentDefinitionError(cwd, [definition.agentName], bootstrapResult);
}

function reviewerDependencyError(pi: ExtensionAPI, cwd: string, bootstrapResult?: RalphAgentBootstrapResult): string | null {
	const toolError = activeToolDependencyError(pi, ["Agent"], "Ralph artifact review", "@tintinweb/pi-subagents");
	if (toolError) return toolError;

	return ralphAgentDefinitionError(cwd, [ARTIFACT_REVIEWER_AGENT], bootstrapResult);
}

function quickFlowDependencyError(pi: ExtensionAPI, cwd: string, bootstrapResult?: RalphAgentBootstrapResult): string | null {
	const errors = [
		...SPEC_ARTIFACTS.map((phase) => phaseDependencyError(pi, PHASE_DEFINITIONS[phase], cwd, bootstrapResult)),
		reviewerDependencyError(pi, cwd, bootstrapResult),
		implementationDependencyError(pi, cwd, bootstrapResult),
	].filter((error): error is string => Boolean(error));
	return errors.length > 0 ? unique(errors).join("\n\n") : null;
}

function readFileIfExists(filePath: string): string {
	return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function truncateForPrompt(content: string, maxChars = 24000): string {
	if (content.length <= maxChars) return content;
	const edge = Math.floor((maxChars - 120) / 2);
	return `${content.slice(0, edge)}\n\n[... truncated ${content.length - edge * 2} characters ...]\n\n${content.slice(-edge)}`;
}

function promptFileSection(title: string, filePath: string, content: string): string {
	if (!content.trim()) {
		return `## ${title}\nPath: ${filePath}\n\n_Not present._`;
	}

	return [`## ${title}`, `Path: ${filePath}`, "", "~~~markdown", truncateForPrompt(content), "~~~"].join("\n");
}

function buildResearchVerificationContext(spec: SpecEntry): string {
	const researchPath = artifactPath(spec, "research");
	const research = readFileIfExists(researchPath);
	if (!research.trim()) return "";

	const sections = ["Quality Commands", "Verification Tooling", "MCP E2E Candidates"];
	const extracted = sections
		.map((heading) => {
			const body = extractSection(research, heading);
			return body ? `## ${heading}\n${body}` : "";
		})
		.filter(Boolean);
	return extracted.join("\n\n");
}

function phaseSpecificInstructions(definition: PhaseDefinition, state: RalphState | null, parsed: PhaseArguments): string[] {
	if (definition.phase === "research") {
		return [
			"Research-specific requirements:",
			"- You MUST use pi-agent-browser-native tools: use agent_browser for live web/documentation access, page extraction, screenshots, and browser-grounded evidence before writing external conclusions.",
			"- Prefer direct authoritative URLs when known. If configured, use agent_browser_web_search for one high-signal discovery query, then inspect target pages with agent_browser.",
			"- For open-source library internals/history, use agent_browser to inspect authoritative GitHub/source pages and cite permalinks with commit SHAs when possible.",
			"- Every nontrivial external claim must include a source URL; every codebase claim must include a file path. Do not fabricate findings.",
			"- Use the mcp proxy lazily for MCP-backed services only when needed: focused mcp({ search: \"...\", includeSchemas: false }), describe only selected tools, call only chosen tools, and avoid broad server lists/eager connects.",
			"- Produce the exact research.md structure from your Ralph Research Analyst instructions.",
		];
	}

	if (definition.phase === "tasks") {
		const stateGranularity = stringField(state, "granularity");
		const granularity = parsed.tasksSize ?? (stateGranularity === "fine" || stateGranularity === "coarse" ? stateGranularity : "fine");
		return [
			"Tasks-specific requirements:",
			`- Granularity: ${granularity}.`,
			"- Produce canonical tasks.md only: each task must use '- [ ]' checkboxes and include Do, Files, Done when, Verify, Commit, Requirements, and Design fields.",
			"- Verify lines must be automated commands or exact MCP proxy calls. Do not use manual, manually, visually, or ask user in Verify lines.",
			"- Use research.md Quality Commands and Verification Tooling rows. VE tasks must name the discovered command/tool source they rely on; never hardcode npm/playwright/curl/server commands that research did not discover.",
			"- For browser/devtools/database MCP E2E, keep MCP lazy and low-token: reference focused mcp search/describe results from research, then call only the selected proxy tool with exact args.",
		];
	}

	return [
		`${phaseTitle(definition.phase)}-specific requirements:`,
		`- Produce the exact ${definition.phase}.md structure from your Ralph ${definition.agentName} instructions.`,
		"- Keep unresolved questions explicit instead of guessing.",
	];
}

function phaseReviewInstructions(reviewContext?: PhaseReviewContext): string[] {
	if (!reviewContext) return [];

	return [
		"",
		"Artifact review loop:",
		`- Reviewer iteration: ${reviewContext.iteration}/${ARTIFACT_REVIEW_MAX_ITERATIONS}.`,
		"- If prior reviewer or coordinator findings are present, revise the artifact in place to address them before completing.",
		"- Do not ask the user for approval; either fix the artifact or report a blocker.",
		"Prior findings:",
		reviewContext.priorFindings.length > 0 ? "~~~text" : "_None yet._",
		...(reviewContext.priorFindings.length > 0 ? [truncateForPrompt(reviewContext.priorFindings.join("\n\n---\n\n"), 12000), "~~~"] : []),
	];
}

function buildPhasePrompt(
	definition: PhaseDefinition,
	spec: SpecEntry,
	state: RalphState | null,
	parsed: PhaseArguments,
	options: RalphPathOptions,
	reviewContext?: PhaseReviewContext,
): string {
	const progressPath = getProgressPath(spec, options);
	const statePath = getRalphStatePath(spec, options);
	const sections = [
		promptFileSection("Progress", progressPath, readProgress(spec, options)),
		promptFileSection("Research", artifactPath(spec, "research"), readFileIfExists(artifactPath(spec, "research"))),
		promptFileSection("Requirements", artifactPath(spec, "requirements"), readFileIfExists(artifactPath(spec, "requirements"))),
		promptFileSection("Design", artifactPath(spec, "design"), readFileIfExists(artifactPath(spec, "design"))),
		promptFileSection("Existing Tasks", artifactPath(spec, "tasks"), readFileIfExists(artifactPath(spec, "tasks"))),
	];

	return [
		`You are running the Smart Ralph ${phaseTitle(definition.phase)} phase as a delegated Pi subagent.`,
		"",
		"Coordinator contract:",
		`- specName: ${spec.name}`,
		`- basePath: ${spec.absolutePath}`,
		`- statePath: ${statePath}`,
		`- required artifact: ${artifactPath(spec, definition.phase)}`,
		`- command: /${definition.commandName}`,
		"- Write only files inside basePath unless inspecting the codebase.",
		"- Do not edit Smart Ralph package/runtime files unless explicitly listed in the spec.",
		"- Work-plane only: generate or revise the requested phase artifact; do not manage Ralph control-plane state.",
		"- Do not proceed to the next Ralph phase or make approval decisions.",
		"- The coordinator owns phase transitions, approval gates, .ralph-state.json finalization, and task mirroring.",
		"- Return artifact status, evidence, blockers, and next-step signals for the coordinator.",
		"",
		...phaseSpecificInstructions(definition, state, parsed),
		...phaseReviewInstructions(reviewContext),
		"",
		"Current Ralph state:",
		"~~~json",
		JSON.stringify(state ?? {}, null, 2),
		"~~~",
		"",
		"Context files:",
		...sections,
		"",
		"Completion response:",
		`- Briefly summarize what you wrote to ${definition.phase}.md.`,
		"- Mention any unresolved questions or blockers.",
	].join("\n");
}

function eventOn(events: unknown, channel: string, handler: (data: unknown) => void): () => void {
	const bus = events as { on?: (name: string, handler: (data: unknown) => void) => unknown; off?: (name: string, handler: (data: unknown) => void) => void; removeListener?: (name: string, handler: (data: unknown) => void) => void };
	const result = bus.on?.(channel, handler);
	if (typeof result === "function") return result as () => void;
	return () => {
		if (typeof bus.off === "function") bus.off(channel, handler);
		else if (typeof bus.removeListener === "function") bus.removeListener(channel, handler);
	};
}

function rpcCall<T>(pi: ExtensionAPI, channel: string, payload: Record<string, unknown>, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolvePromise, reject) => {
		const requestId = randomUUID();
		const replyChannel = `${channel}:reply:${requestId}`;
		let settled = false;
		let unsubscribe = () => {};
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out waiting for ${channel} reply.`));
		}, timeoutMs);

		function cleanup() {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			unsubscribe();
		}

		unsubscribe = eventOn(pi.events, replyChannel, (raw) => {
			const reply = raw as RpcReply<T>;
			cleanup();
			if (reply?.success === true) {
				resolvePromise(reply.data as T);
			} else {
				reject(new Error(reply?.error ?? `Invalid ${channel} reply.`));
			}
		});

		try {
			pi.events.emit(channel, { ...payload, requestId });
		} catch (error) {
			cleanup();
			reject(error instanceof Error ? error : new Error(String(error)));
		}
	});
}

type SubagentTerminalEvent = {
	completion?: SubagentCompletion;
	error?: Error;
};

type SubagentCompletionWaiter = {
	waitFor(agentId: string): Promise<SubagentCompletion>;
	dispose(): void;
};

type SubagentSpawnCallback = (agentId: string) => void | (() => void) | Promise<void | (() => void)>;

function createSubagentCompletionWaiter(pi: ExtensionAPI, timeoutMs: number): SubagentCompletionWaiter {
	let targetAgentId: string | null = null;
	let settled = false;
	let unsubscribeCompleted = () => {};
	let unsubscribeFailed = () => {};
	const bufferedTerminalEvents = new Map<string, SubagentTerminalEvent>();
	let resolvePromise: (completion: SubagentCompletion) => void = () => {};
	let rejectPromise: (error: Error) => void = () => {};

	const promise = new Promise<SubagentCompletion>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});

	const timer = setTimeout(() => {
		rejectOnce(new Error(`Timed out waiting for subagent ${targetAgentId ?? "<pending spawn>"} to finish.`));
	}, timeoutMs);

	function cleanup() {
		clearTimeout(timer);
		unsubscribeCompleted();
		unsubscribeFailed();
	}

	function resolveOnce(completion: SubagentCompletion) {
		if (settled) return;
		settled = true;
		cleanup();
		resolvePromise(completion);
	}

	function rejectOnce(error: Error) {
		if (settled) return;
		settled = true;
		cleanup();
		rejectPromise(error);
	}

	function settleTerminalEvent(event: SubagentTerminalEvent) {
		if (event.error) rejectOnce(event.error);
		else if (event.completion) resolveOnce(event.completion);
	}

	function handleTerminalEvent(agentId: string | undefined, event: SubagentTerminalEvent) {
		if (!agentId) return;
		if (targetAgentId === agentId) {
			settleTerminalEvent(event);
			return;
		}

		// The subagent can fail or finish quickly after spawn. Because the spawn RPC
		// reply and lifecycle event are separate event-bus messages, subscribe before
		// spawning and buffer terminal events until the spawned id is known.
		if (!targetAgentId) bufferedTerminalEvents.set(agentId, event);
	}

	unsubscribeCompleted = eventOn(pi.events, "subagents:completed", (raw) => {
		const event = raw as SubagentCompletion;
		handleTerminalEvent(event?.id, { completion: event });
	});
	unsubscribeFailed = eventOn(pi.events, "subagents:failed", (raw) => {
		const event = raw as SubagentCompletion;
		const agentId = event?.id;
		handleTerminalEvent(agentId, {
			error: new Error(event.error ?? `Subagent ${agentId ?? "<unknown>"} failed with status ${event.status ?? "unknown"}.`),
		});
	});

	return {
		waitFor(agentId: string) {
			targetAgentId = agentId;
			const buffered = bufferedTerminalEvents.get(agentId);
			if (buffered) settleTerminalEvent(buffered);
			return promise;
		},
		dispose() {
			if (settled) return;
			settled = true;
			cleanup();
		},
	};
}

async function runRalphSubagent(
	pi: ExtensionAPI,
	definition: SubagentRunDefinition,
	prompt: string,
	onSpawned?: SubagentSpawnCallback,
): Promise<SubagentCompletion> {
	const completionWaiter = createSubagentCompletionWaiter(pi, 45 * 60 * 1000);
	try {
		await rpcCall<{ version: number }>(pi, "subagents:rpc:ping", {}, 5000);
		const spawned = await rpcCall<{ id: string }>(
			pi,
			"subagents:rpc:spawn",
			{
				type: definition.agentName,
				prompt,
				options: {
					description: definition.description,
					// RPC-spawned Ralph agents do not have an inline Agent-tool result surface.
					// Leave isBackground undefined so pi-subagents treats the record as RPC
					// managed and keeps it visible in the default background-only widget.
					maxTurns: definition.maxTurns,
					inheritContext: false,
				},
			},
			10000,
		);
		if (!spawned?.id) throw new Error("pi-subagents spawn returned no agent id.");
		const onSpawnedResult = await onSpawned?.(spawned.id);
		const stopSpawnStatus = typeof onSpawnedResult === "function" ? onSpawnedResult : () => {};
		try {
			return await completionWaiter.waitFor(spawned.id);
		} finally {
			stopSpawnStatus();
		}
	} catch (error) {
		completionWaiter.dispose();
		throw error;
	}
}

function buildArtifactReviewPrompt(
	definition: PhaseDefinition,
	spec: SpecEntry,
	state: RalphState | null,
	iteration: number,
	priorFindings: string[],
	options: RalphPathOptions,
): string {
	const phaseIndex = SPEC_ARTIFACTS.indexOf(definition.phase);
	const upstreamSections = SPEC_ARTIFACTS
		.slice(0, Math.max(0, phaseIndex))
		.map((artifact) => promptFileSection(phaseTitle(artifact), artifactPath(spec, artifact), readFileIfExists(artifactPath(spec, artifact))));

	return [
		"You are validating one Smart Ralph artifact as the read-only ralph-spec-reviewer.",
		"",
		"Coordinator contract:",
		`- artifactType: ${definition.phase}`,
		`- iteration: ${iteration}`,
		`- maxIterations: ${ARTIFACT_REVIEW_MAX_ITERATIONS}`,
		`- specName: ${spec.name}`,
		`- basePath: ${spec.absolutePath}`,
		`- artifactPath: ${artifactPath(spec, definition.phase)}`,
		"- Never edit files. Return REVIEW_PASS or REVIEW_FAIL as the final line.",
		"",
		"Current Ralph state:",
		"~~~json",
		JSON.stringify(state ?? {}, null, 2),
		"~~~",
		"",
		"Prior findings:",
		priorFindings.length > 0 ? "~~~text" : "_None._",
		...(priorFindings.length > 0 ? [truncateForPrompt(priorFindings.join("\n\n---\n\n"), 12000), "~~~"] : []),
		"",
		"Artifact under review:",
		promptFileSection(phaseTitle(definition.phase), artifactPath(spec, definition.phase), readFileIfExists(artifactPath(spec, definition.phase))),
		"",
		"Upstream artifacts:",
		...(upstreamSections.length > 0 ? upstreamSections : ["_None._"]),
	].join("\n");
}

function artifactReviewCompletionOutput(completion: SubagentCompletion): string {
	if (typeof completion.result === "string" && completion.result.trim()) return completion.result;
	return [completion.description, completion.error]
		.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
		.join("\n");
}

function validateArtifactReviewCompletion(completion: SubagentCompletion): ArtifactReviewResult {
	const output = artifactReviewCompletionOutput(completion);
	const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	const finalLine = lines[lines.length - 1];
	if (finalLine === "REVIEW_PASS") return { passed: true, output, signal: "REVIEW_PASS" };
	if (finalLine === "REVIEW_FAIL") return { passed: false, output, signal: "REVIEW_FAIL", error: "Reviewer reported REVIEW_FAIL." };
	return {
		passed: false,
		output,
		error: "Reviewer output did not end with REVIEW_PASS or REVIEW_FAIL.",
	};
}

async function runArtifactReview(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	definition: PhaseDefinition,
	spec: SpecEntry,
	state: RalphState | null,
	iteration: number,
	priorFindings: string[],
	options: RalphPathOptions,
): Promise<ArtifactReviewResult> {
	const prompt = buildArtifactReviewPrompt(definition, spec, state, iteration, priorFindings, options);
	setRalphStatus(ctx, `Ralph review: ${definition.phase} iteration ${iteration}`);
	try {
		await notify(ctx, `Reviewing ${definition.phase}.md with ${ARTIFACT_REVIEWER_AGENT} (${iteration}/${ARTIFACT_REVIEW_MAX_ITERATIONS})...`);
		const completion = await runRalphSubagent(
			pi,
			{
				agentName: ARTIFACT_REVIEWER_AGENT,
				description: `Review ${definition.phase}.md`,
				maxTurns: 40,
			},
			prompt,
			(agentId) => startRalphSubagentStatusTicker(ctx, `review ${definition.phase}`, ARTIFACT_REVIEWER_AGENT, agentId),
		);
		return validateArtifactReviewCompletion(completion);
	} catch (error) {
		return { passed: false, output: "", error: `Reviewer failed: ${formatError(error)}` };
	}
}

function validatePhaseOutput(definition: PhaseDefinition, spec: SpecEntry): string[] {
	const outputPath = artifactPath(spec, definition.phase);
	if (!existsSync(outputPath)) return [`Expected artifact was not created: ${outputPath}`];

	const content = readFileSync(outputPath, "utf8");
	return validatePhaseArtifactContent(definition.phase, phaseTitle(definition.phase), content);
}

function extractSection(content: string, heading: string): string {
	const lines = content.split(/\r?\n/);
	const start = lines.findIndex((line) => new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line));
	if (start < 0) return "";
	const collected: string[] = [];
	for (let index = start + 1; index < lines.length; index += 1) {
		if (/^##\s+/.test(lines[index])) break;
		collected.push(lines[index]);
	}
	return collected.join("\n").trim();
}

function firstNonEmptyLines(content: string, maxLines: number): string[] {
	return content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, maxLines);
}

function buildPhaseSummary(definition: PhaseDefinition, spec: SpecEntry): string {
	const content = readFileSync(artifactPath(spec, definition.phase), "utf8");
	const lines = [
		`${phaseTitle(definition.phase)} complete for '${spec.name}'.`,
		`Output: ${artifactPath(spec, definition.phase)}`,
		"",
	];

	if (definition.phase === "research") {
		lines.push("## What I Found", ...firstNonEmptyLines(extractSection(content, "Executive Summary"), 3));
		const recommendations = firstNonEmptyLines(extractSection(content, "Recommendations for Requirements"), 3);
		if (recommendations.length > 0) lines.push("", "Key recommendations:", ...recommendations);
	} else if (definition.phase === "requirements") {
		const storyCount = content.match(/^###\s+US-/gim)?.length ?? 0;
		const frCount = new Set(content.match(/\bFR-\d+\b/g) ?? []).size;
		const nfrCount = new Set(content.match(/\bNFR-\d+\b/g) ?? []).size;
		lines.push("## What I Created", `User stories: ${storyCount}`, `Functional requirements: ${frCount}`, `Non-functional requirements: ${nfrCount}`);
	} else if (definition.phase === "design") {
		lines.push("## What I Designed", ...firstNonEmptyLines(extractSection(content, "Overview"), 3));
		const fileRows = extractSection(content, "File Structure").split(/\r?\n/).filter((line) => /^\|/.test(line) && !/^-?\|?\s*-/.test(line));
		if (fileRows.length > 0) lines.push("", `File entries: ${Math.max(0, fileRows.length - 1)}`);
	} else {
		const taskCounts = countTasks(spec);
		const phaseCount = content.match(/^##\s+Phase\s+/gim)?.length ?? 0;
		lines.push("## What I Planned", `Total tasks: ${taskCounts.total}`, `Phase count: ${phaseCount}`);
	}

	return lines.join("\n");
}

function parseRelatedSpecsFromResearch(spec: SpecEntry): unknown[] {
	const researchPath = artifactPath(spec, "research");
	if (!existsSync(researchPath)) return [];
	const table = extractSection(readFileSync(researchPath, "utf8"), "Related Specs");
	const rows = table.split(/\r?\n/).filter((line) => /^\|/.test(line));
	const related: unknown[] = [];
	for (const row of rows.slice(1)) {
		if (/^\|\s*-/.test(row)) continue;
		const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
		if (cells.length < 3 || !cells[0]) continue;
		related.push({
			name: cells[0],
			relevance: cells[1] || "Related",
			mayNeedUpdate: /^(true|yes|y|x)$/i.test(cells[2] || ""),
			evidence: cells[3] || "",
		});
	}
	return related;
}

function isNormalPhaseMode(state: RalphState | null, parsed: PhaseArguments): boolean {
	return !parsed.quickMode && !parsed.autonomousMode && booleanField(state, "quickMode") !== true && booleanField(state, "autonomousMode") !== true;
}

async function requestPhaseApproval(
	ctx: ExtensionCommandContext,
	definition: PhaseDefinition,
	summary: string,
	normalMode: boolean,
): Promise<PhaseApprovalDecision> {
	if (!normalMode) return "skipped_non_normal";
	if (!ctx.hasUI) return "not_requested";

	const approved = await ctx.ui.confirm(
		`Approve ${definition.phase}.md?`,
		[
			summary,
			"",
			"Approve this artifact and stop here?",
			`Next boundary: ${definition.nextCommand}`,
		].join("\n"),
	);
	return approved ? "approved" : "changes_requested";
}

function finalPhasePatch(
	definition: PhaseDefinition,
	spec: SpecEntry,
	decision: PhaseApprovalDecision,
	parsed: PhaseArguments,
	state?: RalphState | null,
): Record<string, unknown> {
	const nonNormalMode = decision === "skipped_non_normal"
		|| parsed.quickMode
		|| parsed.autonomousMode
		|| booleanField(state ?? null, "quickMode") === true
		|| booleanField(state ?? null, "autonomousMode") === true;
	const patch: Record<string, unknown> = {
		source: "spec",
		name: spec.name,
		basePath: spec.path,
		phase: definition.phase,
		awaitingApproval: !nonNormalMode,
		lastApprovalDecision: decision,
		updatedAt: new Date().toISOString(),
		validationError: null,
	};

	if (parsed.quickMode || booleanField(state ?? null, "quickMode") === true) patch.quickMode = true;
	if (parsed.autonomousMode || booleanField(state ?? null, "autonomousMode") === true) patch.autonomousMode = true;
	if (definition.phase === "tasks") {
		const taskCounts = countTasks(spec);
		patch.totalTasks = taskCounts.total;
		if (parsed.tasksSize) patch.granularity = parsed.tasksSize;
	}
	if (definition.phase === "research") {
		patch.relatedSpecs = parseRelatedSpecsFromResearch(spec);
	}
	return patch;
}

function appendPhaseProgressEntry(
	spec: SpecEntry,
	definition: PhaseDefinition,
	decision: PhaseApprovalDecision,
	options: RalphPathOptions,
): void {
	const nextLine = decision === "skipped_non_normal"
		? `- Quick/autonomous mode: continuing to ${definition.nextCommand} without an approval prompt.`
		: `- Awaiting approval boundary. Next command: ${definition.nextCommand}.`;
	appendProgress(
		spec,
		[
			"",
			`### ${phaseTitle(definition.phase)} phase (${new Date().toISOString()})`,
			`- Generated ${definition.phase}.md and validated coordinator output.`,
			`- Approval decision: ${decision}.`,
			nextLine,
			"",
		].join("\n"),
		options,
	);
}

async function runPhaseCommand(pi: ExtensionAPI, definition: PhaseDefinition, args: string, ctx: ExtensionCommandContext): Promise<void> {
	await ctx.waitForIdle();
	const options = pathOptions(ctx);
	const parsed = parsePhaseArgs(args, definition.phase);
	if (parsed.error) {
		await notify(ctx, parsed.error, "warning");
		return;
	}

	const agentBootstrap = bootstrapRalphAgents(ctx.cwd);
	const dependencyError = phaseDependencyError(pi, definition, ctx.cwd, agentBootstrap);
	if (dependencyError) {
		await notify(ctx, dependencyError, "warning");
		return;
	}

	const resolved = resolvePhaseTarget(parsed, options);
	if (!resolved.target) {
		await notify(ctx, resolved.error ?? "Unable to resolve Ralph spec.", "warning");
		return;
	}

	const spec = resolved.target.spec;
	const prerequisiteError = validatePhasePrerequisites(definition, spec);
	if (prerequisiteError) {
		await notify(ctx, prerequisiteError, "warning");
		return;
	}

	writeCurrentSpec(spec, options);

	let state: RalphState;
	try {
		state = await generatePhaseArtifact(pi, ctx, definition, spec, resolved.target.state, parsed, options);
	} catch (error) {
		await notify(ctx, `Ralph ${definition.phase} failed: ${formatError(error)}`, "warning");
		return;
	}

	const validationErrors = validatePhaseOutput(definition, spec);
	if (validationErrors.length > 0) {
		try {
			mergeRalphState(spec, { phase: definition.phase, awaitingApproval: false, validationError: validationErrors.join("\n") }, options);
		} catch {
			// Validation failure is the primary message.
		}
		await notify(
			ctx,
			[`Generated ${definition.phase}.md did not pass coordinator validation:`, ...validationErrors.map((error) => `- ${error}`)].join("\n"),
			"warning",
		);
		return;
	}

	let nativeTaskMirror: NativeTaskMirrorResult | null = null;
	if (definition.phase === "tasks") {
		try {
			nativeTaskMirror = mirrorTasksToNativeTaskCards(pi, ctx, spec, options);
			const updatedState = mergeRalphState(spec, nativeTaskMirrorStatePatch(nativeTaskMirror), options);
			state = updatedState;
		} catch (error) {
			try {
				mergeRalphState(spec, nativeTaskMirrorFailurePatch(state, error), options);
			} catch {
				// Preserve native task mirror error; state write failure is secondary here.
			}
			await notify(ctx, `Generated tasks.md is valid, but native pi-tasks mirroring failed:\n${formatError(error)}`, "warning");
			return;
		}
	}

	const summary = [
		buildPhaseSummary(definition, spec),
		...(nativeTaskMirror ? ["", ...formatNativeTaskMirrorSummary(nativeTaskMirror)] : []),
	].join("\n");
	const decision = await requestPhaseApproval(ctx, definition, summary, isNormalPhaseMode(state, parsed));

	try {
		const updatedState = mergeRalphState(spec, finalPhasePatch(definition, spec, decision, parsed, state), options);
		state = updatedState;
	} catch (error) {
		await notify(ctx, `Failed to finalize Ralph state: ${formatError(error)}`, "warning");
		return;
	}

	try {
		appendPhaseProgressEntry(spec, definition, decision, options);
	} catch (error) {
		await notify(ctx, `Warning: failed to append progress: ${formatError(error)}`, "warning");
	}

	const warnings = parsed.warnings.length > 0 ? ["", "Warnings:", ...parsed.warnings.map((warning) => `- ${warning}`)] : [];
	const approvalLine = decision === "approved"
		? "Approved in Pi UI."
		: decision === "changes_requested"
			? "Pi UI approval was not granted. Edit the artifact or rerun this phase with changes."
			: decision === "not_requested"
				? "No Pi UI was available; state is awaiting approval."
				: "Non-normal mode flag detected; no approval prompt was shown.";

	await notify(
		ctx,
		[
			summary,
			"",
			approvalLine,
			`State: ${getRalphStatePath(spec, options)}`,
			`awaitingApproval: ${booleanField(state, "awaitingApproval") === true}`,
			`-> Next: ${definition.nextCommand}`,
			...warnings,
		].join("\n"),
	);
}

async function generatePhaseArtifact(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	definition: PhaseDefinition,
	spec: SpecEntry,
	state: RalphState | null,
	parsed: PhaseArguments,
	options: RalphPathOptions,
	reviewContext?: PhaseReviewContext,
): Promise<RalphState> {
	let updatedState: RalphState;
	try {
		const startPatch: Record<string, unknown> = {
			source: state?.source ?? "spec",
			name: spec.name,
			basePath: spec.path,
			phase: definition.phase,
			awaitingApproval: false,
			lastApprovalDecision: null,
			validationError: null,
		};
		if (parsed.tasksSize) startPatch.granularity = parsed.tasksSize;
		if (parsed.quickMode) startPatch.quickMode = true;
		if (parsed.autonomousMode) startPatch.autonomousMode = true;
		if (reviewContext) {
			startPatch.artifactReview = {
				phase: definition.phase,
				iteration: reviewContext.iteration,
				maxIterations: ARTIFACT_REVIEW_MAX_ITERATIONS,
			};
		}
		updatedState = mergeRalphState(spec, startPatch, options);
	} catch (error) {
		throw new Error(`Failed to update Ralph state before ${definition.phase}: ${formatError(error)}`);
	}

	const prompt = buildPhasePrompt(definition, spec, updatedState, parsed, options, reviewContext);
	setRalphStatus(ctx, `Ralph ${definition.phase}: running ${definition.agentName}`);
	try {
		const iterationSuffix = reviewContext ? ` (${reviewContext.iteration}/${ARTIFACT_REVIEW_MAX_ITERATIONS})` : "";
		await notify(ctx, `Running ${definition.agentName} for ${spec.name}${iterationSuffix}...`);
		await runRalphSubagent(pi, definition, prompt, (agentId) => {
			return startRalphSubagentStatusTicker(ctx, definition.phase, definition.agentName, agentId);
		});
	} catch (error) {
		try {
			mergeRalphState(spec, { phase: definition.phase, awaitingApproval: false, validationError: formatError(error) }, options);
		} catch {
			// Preserve original subagent error; state write failure is secondary here.
		}
		throw error;
	} finally {
		setRalphStatus(ctx);
	}

	return readRalphState(spec, options) ?? updatedState;
}

function phaseArgumentsForQuickFlow(parsed: StartArguments): PhaseArguments {
	return {
		reference: null,
		quickMode: parsed.quickMode || parsed.autonomousMode,
		autonomousMode: parsed.autonomousMode,
		tasksSize: parsed.tasksSize,
		warnings: parsed.warnings,
	};
}

function coordinatorValidationFinding(definition: PhaseDefinition, errors: string[]): string {
	return [`Coordinator validation failed for ${definition.phase}.md:`, ...errors.map((error) => `- ${error}`)].join("\n");
}

function reviewFailureFinding(result: ArtifactReviewResult): string {
	return [result.error, result.output].filter((value): value is string => Boolean(value?.trim())).join("\n\n") || "Reviewer failed without output.";
}

function appendArtifactReviewProgress(
	spec: SpecEntry,
	definition: PhaseDefinition,
	iteration: number,
	result: ArtifactReviewResult,
	options: RalphPathOptions,
): void {
	appendProgress(
		spec,
		[
			"",
			`### ${phaseTitle(definition.phase)} review iteration ${iteration} (${new Date().toISOString()})`,
			`- Result: ${result.passed ? "REVIEW_PASS" : "REVIEW_FAIL"}`,
			...(result.error ? [`- Error: ${result.error}`] : []),
			...(result.output.trim() ? ["- Reviewer output:", "~~~text", truncateForPrompt(result.output, 4000), "~~~"] : []),
			"",
		].join("\n"),
		options,
	);
}

function artifactReviewStatePatch(definition: PhaseDefinition, iteration: number, result: ArtifactReviewResult): Record<string, unknown> {
	return {
		artifactReviews: {
			[definition.phase]: {
				iteration,
				maxIterations: ARTIFACT_REVIEW_MAX_ITERATIONS,
				passed: result.passed,
				signal: result.signal ?? null,
				error: result.error ?? null,
				output: truncateForPrompt(result.output, 6000),
				reviewedAt: new Date().toISOString(),
			},
		},
		validationError: result.passed ? null : reviewFailureFinding(result),
	};
}

async function runReviewedPhase(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	definition: PhaseDefinition,
	spec: SpecEntry,
	parsed: PhaseArguments,
	options: RalphPathOptions,
): Promise<ReviewedPhaseResult> {
	let state = readRalphState(spec, options);
	let priorFindings: string[] = [];
	let shouldGenerate = !artifactExists(spec, definition.phase);

	for (let iteration = 1; iteration <= ARTIFACT_REVIEW_MAX_ITERATIONS; iteration += 1) {
		if (shouldGenerate) {
			state = await generatePhaseArtifact(pi, ctx, definition, spec, state, parsed, options, { iteration, priorFindings });
		} else {
			const updatedState = mergeRalphState(
				spec,
				{
					phase: definition.phase,
					awaitingApproval: false,
					validationError: null,
					quickMode: true,
					...(parsed.autonomousMode ? { autonomousMode: true } : {}),
				},
				options,
			);
			state = updatedState;
		}

		const validationErrors = validatePhaseOutput(definition, spec);
		if (validationErrors.length > 0) {
			const finding = coordinatorValidationFinding(definition, validationErrors);
			priorFindings.push(finding);
			const updatedState = mergeRalphState(
				spec,
				{
					phase: definition.phase,
					awaitingApproval: false,
					validationError: finding,
					artifactReviews: {
						[definition.phase]: {
							iteration,
							maxIterations: ARTIFACT_REVIEW_MAX_ITERATIONS,
							passed: false,
							error: finding,
							reviewedAt: new Date().toISOString(),
						},
					},
				},
				options,
			);
			state = updatedState;
			if (iteration === ARTIFACT_REVIEW_MAX_ITERATIONS) throw new Error(finding);
			shouldGenerate = true;
			continue;
		}

		const review = await runArtifactReview(pi, ctx, definition, spec, state, iteration, priorFindings, options);
		appendArtifactReviewProgress(spec, definition, iteration, review, options);
		const updatedState = mergeRalphState(spec, artifactReviewStatePatch(definition, iteration, review), options);
		state = updatedState;

		if (review.passed) {
			let nativeTaskMirror: NativeTaskMirrorResult | null = null;
			if (definition.phase === "tasks") {
				try {
					nativeTaskMirror = mirrorTasksToNativeTaskCards(pi, ctx, spec, options);
					const updatedState = mergeRalphState(spec, nativeTaskMirrorStatePatch(nativeTaskMirror), options);
					state = updatedState;
				} catch (error) {
					mergeRalphState(spec, nativeTaskMirrorFailurePatch(state, error), options);
					throw new Error(`Native pi-tasks mirroring failed after reviewed tasks.md: ${formatError(error)}`);
				}
			}

			const updatedState = mergeRalphState(spec, finalPhasePatch(definition, spec, "skipped_non_normal", parsed, state), options);
			state = updatedState;
			appendPhaseProgressEntry(spec, definition, "skipped_non_normal", options);
			const summary = [
				buildPhaseSummary(definition, spec),
				`Review: REVIEW_PASS after ${iteration} iteration(s).`,
				...(nativeTaskMirror ? ["", ...formatNativeTaskMirrorSummary(nativeTaskMirror)] : []),
			].join("\n");
			return { state, summary, iterations: iteration };
		}

		priorFindings.push(reviewFailureFinding(review));
		if (iteration === ARTIFACT_REVIEW_MAX_ITERATIONS) {
			throw new Error(`Reviewer did not approve ${definition.phase}.md after ${ARTIFACT_REVIEW_MAX_ITERATIONS} iterations.\n${reviewFailureFinding(review)}`);
		}
		shouldGenerate = true;
	}

	throw new Error(`Reviewer did not approve ${definition.phase}.md after ${ARTIFACT_REVIEW_MAX_ITERATIONS} iterations.`);
}

async function runQuickFlow(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	spec: SpecEntry,
	parsed: StartArguments,
	options: RalphPathOptions,
	invocation: { preserveCurrentSpecMarker?: boolean } = {},
): Promise<void> {
	const agentBootstrap = bootstrapRalphAgents(ctx.cwd);
	const dependencyError = quickFlowDependencyError(pi, ctx.cwd, agentBootstrap);
	if (dependencyError) {
		await notify(ctx, dependencyError, "warning");
		return;
	}

	const phaseArgs = phaseArgumentsForQuickFlow(parsed);
	const summaries: string[] = [];
	try {
		await notify(ctx, `Quick mode: generating/reviewing artifacts for ${spec.name} without approval prompts...`);
		for (const artifact of SPEC_ARTIFACTS) {
			const definition = PHASE_DEFINITIONS[artifact];
			const prerequisiteError = validatePhasePrerequisites(definition, spec);
			if (prerequisiteError) throw new Error(prerequisiteError);
			const result = await runReviewedPhase(pi, ctx, definition, spec, phaseArgs, options);
			summaries.push(`- ${artifact}.md passed review after ${result.iterations} iteration(s).`);
		}

		if (!invocation.preserveCurrentSpecMarker) writeCurrentSpec(spec, options);
		await notify(
			ctx,
			[
				`Quick artifact flow complete for spec: ${spec.name}`,
				"",
				...summaries,
				"",
				invocation.preserveCurrentSpecMarker
					? `Starting implementation with explicit spec target (${spec.path}) while preserving the current marker...`
					: "Starting implementation...",
			].join("\n"),
		);
		await runImplementCommand(pi, invocation.preserveCurrentSpecMarker ? spec.path : "", ctx, invocation);
	} catch (error) {
		try {
			appendProgress(
				spec,
				[
					"",
					`### Quick mode blocked (${new Date().toISOString()})`,
					`- Reason: ${formatError(error)}`,
					"",
				].join("\n"),
				options,
			);
			mergeRalphState(
				spec,
				{
					awaitingApproval: false,
					blocked: true,
					validationError: formatError(error),
					blockedAt: new Date().toISOString(),
				},
				options,
			);
		} catch {
			// Surface the original quick-flow failure.
		}
		await notify(ctx, `Quick mode blocked for ${spec.name}: ${formatError(error)}`, "warning");
	} finally {
		setRalphStatus(ctx);
	}
}

type CompletionSignal = ImplementationCompletionSignal;

type ImplementArguments = {
	reference: string | null;
	maxTaskIterations: number;
	maxGlobalIterations: number;
	recoveryMode: boolean;
	error?: string;
};

type ImplementTarget = {
	spec: SpecEntry;
	state: RalphState | null;
};

type ImplementationSubagentDefinition = SubagentRunDefinition & {
	completionSignal: CompletionSignal;
};

const taskCompletionHelpers = analyzeTaskWorkspace as typeof analyzeTaskWorkspace & {
	assessTaskCompletionOutput: (output: string, workspaceReport?: ReturnType<typeof analyzeTaskWorkspace>) => { ok: boolean; blocker?: string };
	selectTaskCompletionBlocker: (selection: {
		topologyBlocker?: string | null;
		modificationBlocker?: string | null;
		verificationBlocker?: string | null;
		fallbackBlocker: string;
	}) => string;
	hasExpectedFailureProof: (output: string, proofToken?: string) => boolean;
};

const assessTaskCompletionOutput = taskCompletionHelpers.assessTaskCompletionOutput;
const selectTaskCompletionBlocker = taskCompletionHelpers.selectTaskCompletionBlocker;
const hasExpectedFailureProof = taskCompletionHelpers.hasExpectedFailureProof;

type CompletionValidation = ImplementationCompletionValidation;

let pendingImplementationPromptWorkspaceReport: ReturnType<typeof analyzeTaskWorkspace> | null = null;

type TaskModificationType = "SPLIT_TASK" | "ADD_PREREQUISITE" | "ADD_FOLLOWUP";

type TaskModificationRequest = {
	type: TaskModificationType;
	originalTaskId: string;
	reasoning: string;
	proposedTasks: string[];
};

type TaskModificationProcessResult = {
	present: boolean;
	applied: boolean;
	state?: RalphState;
	summary?: string;
	error?: string;
};

type NextTaskResult =
	| { kind: "complete" }
	| { kind: "runnable"; task: ParsedNativeTask }
	| { kind: "batch"; task: ParsedNativeTask; taskIndices: number[]; mode: "parallel-sequential" }
	| { kind: "blocked"; task: ParsedNativeTask; blockers: number[] };

type NativeExecutionUpdate = {
	taskId: string;
	storePath: string;
};

type CoordinatorProgressCommitResult = {
	committed: boolean;
	hash?: string;
	error?: string;
};

type GitCommandResult = {
	ok: boolean;
	status: number | null;
	stdout: string;
	stderr: string;
};

const IMPLEMENT_AGENTS = ["ralph-spec-executor", "ralph-qa-engineer", "ralph-refactor-specialist"] as const;
const IMPLEMENT_DEFAULT_MAX_TASK_ITERATIONS = 5;
const IMPLEMENT_DEFAULT_MAX_GLOBAL_ITERATIONS = 100;

function parseImplementArgs(args: string): ImplementArguments {
	const tokenized = tokenizeCommandArgs(args);
	if (tokenized.error) return emptyImplementArguments(tokenized.error);

	const positionals: string[] = [];
	let maxTaskIterations = IMPLEMENT_DEFAULT_MAX_TASK_ITERATIONS;
	let maxGlobalIterations = IMPLEMENT_DEFAULT_MAX_GLOBAL_ITERATIONS;
	let recoveryMode = false;

	for (let index = 0; index < tokenized.tokens.length; index += 1) {
		const token = tokenized.tokens[index];
		if (token === "--recovery-mode") {
			recoveryMode = true;
			continue;
		}
		if (token === "--max-task-iterations" || token.startsWith("--max-task-iterations=")) {
			const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : tokenized.tokens[++index];
			const parsed = parsePositiveIntegerOption("--max-task-iterations", value);
			if (parsed.error) return emptyImplementArguments(parsed.error);
			maxTaskIterations = parsed.value;
			continue;
		}
		if (token === "--max-global-iterations" || token.startsWith("--max-global-iterations=")) {
			const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : tokenized.tokens[++index];
			const parsed = parsePositiveIntegerOption("--max-global-iterations", value);
			if (parsed.error) return emptyImplementArguments(parsed.error);
			maxGlobalIterations = parsed.value;
			continue;
		}
		if (token.startsWith("--")) return emptyImplementArguments(`Unknown option: ${token}`);
		positionals.push(token);
	}

	if (positionals.length > 1) {
		return emptyImplementArguments(`Expected at most one spec reference, got: ${positionals.join(" ")}`);
	}

	return {
		reference: positionals[0] ?? null,
		maxTaskIterations,
		maxGlobalIterations,
		recoveryMode,
	};
}

function parsePositiveIntegerOption(name: string, value: string | undefined): { value: number; error?: string } {
	if (!value || value.startsWith("--")) return { value: 0, error: `${name} requires a positive integer.` };
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1 || String(parsed) !== value.trim()) {
		return { value: 0, error: `${name} requires a positive integer, got '${value}'.` };
	}
	return { value: parsed };
}

function emptyImplementArguments(error: string): ImplementArguments {
	return {
		reference: null,
		maxTaskIterations: IMPLEMENT_DEFAULT_MAX_TASK_ITERATIONS,
		maxGlobalIterations: IMPLEMENT_DEFAULT_MAX_GLOBAL_ITERATIONS,
		recoveryMode: false,
		error,
	};
}

function resolveImplementTarget(parsed: ImplementArguments, options: RalphPathOptions): { target?: ImplementTarget; error?: string } {
	if (parsed.reference) {
		const resolved = resolveExistingSpec(parsed.reference, options);
		if (!resolved.spec) return { error: resolved.error ?? `Unable to resolve spec '${parsed.reference}'.` };
		const stateRead = safeReadSpecState(resolved.spec, options);
		if (stateRead.error) return { error: `Cannot implement spec with invalid state: ${stateRead.error}` };
		return { target: { spec: resolved.spec, state: stateRead.state } };
	}

	const currentValue = readCurrentSpecValue(options);
	if (!currentValue) return { error: "No active spec is set. Run /ralph-start <spec-name> first or pass a spec name/path." };
	const spec = resolveCurrentSpec(options);
	if (!spec) return { error: `Unable to resolve active spec '${currentValue}'.` };
	if (!spec.exists) return { error: `Active spec '${currentValue}' points to a missing directory: ${spec.path}` };
	const stateRead = safeReadSpecState(spec, options);
	if (stateRead.error) return { error: `Cannot implement spec with invalid state: ${stateRead.error}` };
	return { target: { spec, state: stateRead.state } };
}

function implementationDependencyError(pi: ExtensionAPI, cwd: string, bootstrapResult?: RalphAgentBootstrapResult): string | null {
	const toolError = activeToolDependencyError(
		pi,
		["Agent", ...NATIVE_TASK_TOOLS, ...WEB_RESEARCH_TOOLS, MCP_PROXY_TOOL],
		"ralph-implement",
		"@tintinweb/pi-subagents, @tintinweb/pi-tasks, pi-agent-browser-native, and pi-mcp-adapter",
	);
	if (toolError) return toolError;

	return ralphAgentDefinitionError(cwd, IMPLEMENT_AGENTS, bootstrapResult);
}

function readImplementationTasks(spec: SpecEntry): { tasksPath: string; content: string; tasks: ParsedNativeTask[] } {
	const tasksPath = artifactPath(spec, "tasks");
	if (!existsSync(tasksPath)) throw new Error(`Tasks not found at ${tasksPath}. Run /ralph-tasks first.`);
	const content = readFileSync(tasksPath, "utf8");
	const tasks = parseTasksForNativeCards(content);
	if (tasks.length === 0) throw new Error("tasks.md does not contain any canonical checkbox tasks.");
	return { tasksPath, content, tasks };
}

function dependenciesCompleted(task: ParsedNativeTask, tasks: ParsedNativeTask[]): boolean {
	return task.blockedByIndices.every((dependencyIndex) => tasks[dependencyIndex]?.status === "completed");
}

function nextImplementationTask(tasks: ParsedNativeTask[], preferredTaskIndex?: number | null): NextTaskResult {
	const incomplete = tasks.filter((task) => task.status !== "completed");
	if (incomplete.length === 0) return { kind: "complete" };

	const resolveRunnable = (candidate: ParsedNativeTask | undefined): NextTaskResult | null => {
		if (!candidate || candidate.status === "completed" || !dependenciesCompleted(candidate, tasks)) return null;
		const batch = createImplementationExecutionBatch(tasks, candidate);
		if (batch.kind === "batch") {
			return { kind: "batch", task: candidate, taskIndices: [...batch.taskIndices], mode: "parallel-sequential" };
		}
		return { kind: "runnable", task: candidate };
	};

	if (typeof preferredTaskIndex === "number" && Number.isInteger(preferredTaskIndex) && preferredTaskIndex >= 0) {
		const preferredResult = resolveRunnable(tasks[preferredTaskIndex]);
		if (preferredResult) return preferredResult;
	}

	const runnable = incomplete.find((task) => dependenciesCompleted(task, tasks));
	if (runnable) return resolveRunnable(runnable) ?? { kind: "runnable", task: runnable };

	const blocked = incomplete[0];
	const blockers = blocked.blockedByIndices.filter((dependencyIndex) => tasks[dependencyIndex]?.status !== "completed");
	return { kind: "blocked", task: blocked, blockers };
}

function stateRecordField(state: RalphState | null, key: string): Record<string, unknown> {
	const value = state?.[key];
	return isRecordValue(value) ? value : {};
}

function verifiedTaskEvidence(state: RalphState | null, task: ParsedNativeTask): Record<string, unknown> | null {
	const evidence = stateRecordField(state, "verifiedTaskEvidence")[task.checkboxKey];
	return isRecordValue(evidence) ? evidence : null;
}

function activePendingEvidenceIndex(state: RalphState | null): number | null {
	const pending = stateRecordField(state, "activeTaskPendingEvidence");
	const index = pending.index;
	return typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : null;
}

function atomicWriteCoordinatorText(filePath: string, content: string): void {
	mkdirSync(dirname(filePath), { recursive: true });
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tempPath, content, "utf8");
	renameSync(tempPath, filePath);
}

function setTaskCheckboxStatus(spec: SpecEntry, taskIndex: number, completed: boolean): boolean {
	const tasksPath = artifactPath(spec, "tasks");
	const content = readFileSync(tasksPath, "utf8").replace(/\r\n/g, "\n");
	const lines = content.split("\n");
	let seen = -1;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		if (!/^\s*-\s*\[[ xX]\]\s+\S+/.test(lines[lineIndex])) continue;
		seen += 1;
		if (seen !== taskIndex) continue;

		const currentlyCompleted = /^\s*-\s*\[[xX]\]/.test(lines[lineIndex]);
		if (currentlyCompleted === completed) return false;
		lines[lineIndex] = lines[lineIndex].replace(/^(\s*-\s*)\[[ xX]\]/, `$1[${completed ? "x" : " "}]`);
		atomicWriteCoordinatorText(tasksPath, lines.join("\n"));
		return true;
	}

	throw new Error(`Unable to locate task index ${taskIndex} in ${tasksPath}.`);
}

function countTaskIdDots(taskId: string): number {
	return (taskId.match(/\./g) ?? []).length;
}

function taskModificationDepth(taskId: string): number {
	return Math.max(0, countTaskIdDots(taskId) - 1);
}

function extractBalancedJsonObject(content: string): string | null {
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

function extractTaggedJsonPayload(output: string, marker: string): string | null {
	const markerMatch = new RegExp(marker, "i").exec(output);
	if (!markerMatch || markerMatch.index < 0) return null;
	const tail = output.slice(markerMatch.index + markerMatch[0].length);
	const fenced = tail.match(/(?:```|~~~)\s*(?:json)?\s*\n?([\s\S]*?)\n?(?:```|~~~)/i);
	if (fenced?.[1]) return fenced[1].trim();
	return extractBalancedJsonObject(tail)?.trim() ?? null;
}

function parseTaskModificationRequest(output: string): TaskModificationRequest | null {
	if (!/TASK_MODIFICATION_REQUEST/i.test(output)) return null;

	const payloadText = extractTaggedJsonPayload(output, "TASK_MODIFICATION_REQUEST");
	if (!payloadText) throw new Error("TASK_MODIFICATION_REQUEST was present but no JSON payload was found.");

	let parsed: unknown;
	try {
		parsed = JSON.parse(payloadText) as unknown;
	} catch (error) {
		throw new Error(`TASK_MODIFICATION_REQUEST payload is not valid JSON: ${formatError(error)}`);
	}
	if (!isRecordValue(parsed)) throw new Error("TASK_MODIFICATION_REQUEST payload must be a JSON object.");

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
	const reasoning = normalizeWhitespace(reasoningSource);
	if (!reasoning) throw new Error("TASK_MODIFICATION_REQUEST must include reasoning.");

	const proposedTasks = Array.isArray(parsed.proposedTasks)
		? normalizeImplementationTaskModificationProposals({
			type: typeValue,
			originalTaskId,
			reasoning,
			proposedTasks: parsed.proposedTasks,
		})
		: [];
	if (proposedTasks.length === 0) throw new Error("TASK_MODIFICATION_REQUEST must include at least one proposed task block.");
	if ((typeValue === "ADD_PREREQUISITE" || typeValue === "ADD_FOLLOWUP") && proposedTasks.length !== 1) {
		throw new Error(`${typeValue} must propose exactly one task block.`);
	}

	const helperRequest = parseImplementationTaskModification(output);
	if (helperRequest) return helperRequest;

	return {
		type: typeValue,
		originalTaskId,
		reasoning,
		proposedTasks,
	};
}

function insertTaskBlocks(spec: SpecEntry, anchorTask: ParsedNativeTask, blocks: string[], position: "before" | "after"): void {
	const tasksPath = artifactPath(spec, "tasks");
	const lines = readFileSync(tasksPath, "utf8").replace(/\r\n/g, "\n").split("\n");
	const insertionLines = [...blocks.join("\n\n").split("\n"), ""];
	const insertAt = position === "before" ? anchorTask.startLine : anchorTask.endLine;
	lines.splice(insertAt, 0, ...insertionLines);
	atomicWriteCoordinatorText(tasksPath, `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`);
}

function appendTaskModificationProgress(
	spec: SpecEntry,
	task: ParsedNativeTask,
	request: TaskModificationRequest,
	proposedTaskIds: string[],
	options: RalphPathOptions,
): CoordinatorProgressCommitResult {
	const progressPath = appendProgress(
		spec,
		[
			"",
			`### Task modification applied (${new Date().toISOString()})`,
			`- Type: ${request.type}`,
			`- Original task: ${task.subject}`,
			`- Original task id: ${request.originalTaskId}`,
			`- Proposed tasks: ${proposedTaskIds.join(", ")}`,
			`- Reason: ${request.reasoning}`,
			"",
		].join("\n"),
		options,
	);

	return commitTrackedProgressIfDirty(
		progressPath,
		`chore(ralph): record task modification for ${spec.name} task ${task.taskNumber ?? task.index + 1}`,
	);
}

function handleTaskModificationRequest(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	spec: SpecEntry,
	task: ParsedNativeTask,
	state: RalphState | null,
	output: string,
	options: RalphPathOptions,
): TaskModificationProcessResult {
	let request: TaskModificationRequest | null;
	try {
		request = parseTaskModificationRequest(output);
	} catch (error) {
		return { present: true, applied: false, error: formatError(error) };
	}
	if (!request) return { present: false, applied: false };

	try {
		const currentTaskId = task.taskNumber ?? task.stableKey;
		if (request.originalTaskId !== currentTaskId) {
			throw new Error(`TASK_MODIFICATION_REQUEST targeted ${request.originalTaskId}, but the active task is ${currentTaskId}.`);
		}

		const maxModificationsPerTask = numberField(state, "maxModificationsPerTask") ?? 3;
		const maxModificationDepth = numberField(state, "maxModificationDepth") ?? 2;
		const modificationMap = stateRecordField(state, "modificationMap");
		const existingEntry = isRecordValue(modificationMap[request.originalTaskId]) ? modificationMap[request.originalTaskId] : {};
		const priorCount = isRecordValue(existingEntry) && typeof existingEntry.count === "number" && Number.isFinite(existingEntry.count)
			? existingEntry.count
			: 0;
		if (priorCount >= maxModificationsPerTask) {
			throw new Error(`Max modifications (${maxModificationsPerTask}) reached for task ${request.originalTaskId}.`);
		}

		const taskData = readImplementationTasks(spec);
		const existingTaskIds = new Set(taskData.tasks.map((entry) => entry.taskNumber).filter((value): value is string => typeof value === "string" && value.trim().length > 0));
		const requiredFields = [
			{ key: "do", label: "Do" },
			{ key: "files", label: "Files" },
			{ key: "done when", label: "Done when" },
			{ key: "verify", label: "Verify" },
			{ key: "commit", label: "Commit" },
		] as const;
		const normalizedProposedTasks = normalizeImplementationTaskModificationProposals({
			type: request.type,
			originalTaskId: request.originalTaskId,
			reasoning: request.reasoning,
			proposedTasks: request.proposedTasks,
			existingTaskIds,
			maxModificationDepth,
			fallbackFiles: task.fields["files"] ?? "",
			fallbackVerify: task.fields["verify"] ?? "",
		});
		const proposedParsed = normalizedProposedTasks.map((block, index) => {
			const parsedTasks = parseTasksForNativeCards(block.trim());
			if (parsedTasks.length !== 1) throw new Error(`Proposed task ${index + 1} must be a single checkbox task block.`);
			return parsedTasks[0];
		});
		// Helper rejects duplicate ids with `TASK_MODIFICATION_REQUEST proposed duplicate task ids: ...` before any mutation.
		const { proposedTaskIds } = validateImplementationTaskMutation({
			request,
			currentTaskId,
			priorCount,
			maxModificationsPerTask,
			maxModificationDepth,
			proposedTasks: proposedParsed as any,
			requiredFields: requiredFields,
			existingTaskIds: existingTaskIds,
		});

		let refreshedTaskData = taskData;
		let anchorTask = refreshedTaskData.tasks.find((entry) => entry.stableKey === task.stableKey) ?? refreshedTaskData.tasks[task.index];
		if (!anchorTask) throw new Error(`Unable to locate active task ${currentTaskId} in tasks.md.`);

		if (request.type !== "ADD_PREREQUISITE") {
			setTaskCheckboxStatus(spec, anchorTask.index, true);
			refreshedTaskData = readImplementationTasks(spec);
			anchorTask = refreshedTaskData.tasks.find((entry) => entry.stableKey === task.stableKey) ?? refreshedTaskData.tasks[task.index];
			if (!anchorTask) throw new Error(`Unable to relocate task ${currentTaskId} after updating completion state.`);
		}

		insertTaskBlocks(spec, anchorTask, normalizedProposedTasks.map((block) => block.trim()), request.type === "ADD_PREREQUISITE" ? "before" : "after");

		const updatedTasks = readImplementationTasks(spec).tasks;
		const next = nextImplementationTask(updatedTasks);
		const mirror = mirrorTasksToNativeTaskCards(pi, ctx, spec, options);
		const { modificationRecord, modificationStatePatch } = applyImplementationTaskModification({
			modificationMap,
			originalTaskId: request.originalTaskId,
			existingEntry,
			priorCount,
			request,
			proposedTaskIds,
		});
		const progressCommit = appendTaskModificationProgress(spec, task, request, proposedTaskIds, options);
		const progressCommitSummary = progressCommit.committed
			? `; coordinator progress commit ${progressCommit.hash ?? "unknown"}`
			: progressCommit.error
				? `; coordinator progress commit failed: ${progressCommit.error}`
				: "";
		const summary = `- Applied ${request.type} to task ${request.originalTaskId} -> ${proposedTaskIds.join(", ")} (${request.reasoning}${progressCommitSummary})`;

		return {
			present: true,
			applied: true,
			state: mergeRalphState(
				spec,
				{
					...nativeTaskMirrorStatePatch(mirror),
					...createImplementationTaskMutationRemapPatch({
						state,
						nativeTaskMap: mirror.nativeTaskMap,
						totalTasks: updatedTasks.length,
						nextTaskIndex: next.kind === "complete" ? updatedTasks.length : next.task.index,
						modificationStatePatch,
						request,
						proposedTaskIds,
						lastSubagentOutput: truncateForPrompt(output, 6000),
						maxModificationsPerTask,
						maxModificationDepth,
					}),
				},
				options,
			),
			summary,
		};
	} catch (error) {
		return { present: true, applied: false, error: formatError(error) };
	}
}

function restoreUnverifiedActiveTaskIfNeeded(
	spec: SpecEntry,
	state: RalphState | null,
	tasks: ParsedNativeTask[],
	options: RalphPathOptions,
): ParsedNativeTask[] {
	const activeIndex = activePendingEvidenceIndex(state);
	if (activeIndex === null) return tasks;
	const activeTask = tasks[activeIndex];
	if (!activeTask || activeTask.status !== "completed" || verifiedTaskEvidence(state, activeTask)) return tasks;

	setTaskCheckboxStatus(spec, activeIndex, false);
	appendProgress(
		spec,
		[
			"",
			`### Implementation resume repair (${new Date().toISOString()})`,
			`- Reverted unverified completion mark for task ${activeIndex + 1}: ${activeTask.subject}.`,
			"- Reason: prior run stopped before coordinator recorded completion signal plus verification evidence.",
			"",
		].join("\n"),
		options,
	);
	return readImplementationTasks(spec).tasks;
}

function nativeTaskRepairReason(
	ctx: ExtensionCommandContext,
	spec: SpecEntry,
	state: RalphState | null,
	tasks: ParsedNativeTask[],
): string | null {
	const baseReason = getImplementationNativeTaskRepairReason(state, tasks);
	if (baseReason) return baseReason;

	const map = implementationNativeTaskMapFromState(state);
	const storePath = resolveNativeTaskStorePath(ctx);
	if (!storePath.path) throw new Error(storePath.error ?? "Unable to resolve pi-tasks store path.");
	const store = readNativeTaskStore(storePath.path);
	const tasksById = new Map(store.tasks.map((task) => [task.id, task]));

	for (const task of tasks) {
		const card = tasksById.get(map[task.checkboxKey]);
		if (!card) return `stale native task id for task ${task.index + 1}`;
		if (!isNativeTaskOwnedBySpec(card, spec)) return `native task #${card.id} is not owned by spec ${spec.name}`;
	}
	return null;
}

function syncNativeCardsFromTasks(ctx: ExtensionCommandContext, state: RalphState | null, tasks: ParsedNativeTask[]): void {
	const map = implementationNativeTaskMapFromState(state);
	if (Object.keys(map).length === 0) return;
	const storePath = resolveNativeTaskStorePath(ctx);
	if (!storePath.path) throw new Error(storePath.error ?? "Unable to resolve pi-tasks store path.");

	withNativeTaskStore(storePath.path, (data) => {
		const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
		const now = Date.now();
		for (const parsed of tasks) {
			const card = tasksById.get(map[parsed.checkboxKey]);
			if (!card) continue;
			const desiredStatus: NativeTaskStatus = parsed.status === "completed" ? "completed" : card.status === "completed" ? "pending" : card.status;
			if (card.status !== desiredStatus) {
				card.status = desiredStatus;
				card.updatedAt = now;
			}
		}
	});
}

function ensureNativeTaskCardsForImplementation(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	spec: SpecEntry,
	options: RalphPathOptions,
	state: RalphState | null,
	tasks: ParsedNativeTask[],
): RalphState {
	if (booleanField(state, "nativeSyncEnabled") === false) {
		throw new Error("Native pi-tasks sync is disabled in .ralph-state.json. Re-run /ralph-tasks to repair task cards before implementing.");
	}

	const repairReason = nativeTaskRepairReason(ctx, spec, state, tasks);
	if (repairReason) {
		const mirror = mirrorTasksToNativeTaskCards(pi, ctx, spec, options);
		return mergeRalphState(spec, { ...nativeTaskMirrorStatePatch(mirror), nativeTaskRepairReason: repairReason }, options);
	}

	syncNativeCardsFromTasks(ctx, state, tasks);
	return state ?? {};
}

function setNativeTaskExecutionStatus(
	ctx: ExtensionCommandContext,
	state: RalphState | null,
	spec: SpecEntry,
	task: ParsedNativeTask,
	status: NativeTaskStatus,
	metadata: Record<string, unknown>,
): NativeExecutionUpdate {
	const map = implementationNativeTaskMapFromState(state);
	const taskId = map[task.checkboxKey];
	if (!taskId) throw new Error(`No native pi-task mapping found for task ${task.index + 1}. Run /ralph-tasks to mirror tasks.md.`);

	const storePath = resolveNativeTaskStorePath(ctx);
	if (!storePath.path) throw new Error(storePath.error ?? "Unable to resolve pi-tasks store path.");

	let visibleCards: NativeTaskCard[] = [];
	withNativeTaskStore(storePath.path, (data) => {
		const card = data.tasks.find((candidate) => candidate.id === taskId);
		if (!card) throw new Error(`Native pi-task #${taskId} was not found in ${storePath.path}. Run /ralph-tasks to repair mappings.`);
		card.status = status;
		card.activeForm = task.activeForm;
		card.owner = status === "in_progress" ? "ralph-specum" : undefined;
		card.metadata = {
			...card.metadata,
			...metadata,
			ralphExecutionStatus: status,
			ralphExecutionUpdatedAt: new Date().toISOString(),
		};
		card.updatedAt = Date.now();
		visibleCards = data.tasks.filter((candidate) => isNativeTaskOwnedBySpec(candidate, spec));
	});
	showMirroredNativeTaskWidget(ctx, visibleCards);

	return { taskId, storePath: storePath.path };
}

function implementationSubagentDefinition(task: ParsedNativeTask): ImplementationSubagentDefinition {
	if (task.isVerify || task.agentType === "ralph-qa-engineer") {
		return {
			agentName: "ralph-qa-engineer",
			description: `Verify Ralph task ${task.taskNumber ?? task.index + 1}`,
			maxTurns: 60,
			completionSignal: "VERIFICATION_PASS",
		};
	}
	if (task.agentType === "ralph-refactor-specialist") {
		return {
			agentName: "ralph-refactor-specialist",
			description: `Refactor Ralph task ${task.taskNumber ?? task.index + 1}`,
			maxTurns: 50,
			completionSignal: "REFACTOR_COMPLETE",
		};
	}
	return {
		agentName: "ralph-spec-executor",
		description: `Execute Ralph task ${task.taskNumber ?? task.index + 1}`,
		maxTurns: 90,
		completionSignal: "TASK_COMPLETE",
	};
}

function agentSpecificImplementationInstructions(definition: ImplementationSubagentDefinition): string[] {
	if (definition.completionSignal === "VERIFICATION_PASS") {
		return [
			"Verification-task instructions:",
			"- Execute the task's automated Verify checks and capture real command/API/browser/database evidence.",
			"- If Verify is an mcp({ ... }) proxy call, use the mcp tool rather than shelling out; keep it lazy with focused search/describe only when the task does not already name the discovered tool.",
			"- For browser/devtools MCP checks, prove page state with selected navigation/screenshot/DOM/network evidence. For database MCP checks, use only test/dev data and verify state with read-only queries plus cleanup evidence.",
			"- Do not mark tasks.md; the coordinator marks it only after VERIFICATION_PASS plus evidence.",
			"- Final line must be VERIFICATION_PASS on success or VERIFICATION_FAIL on failure.",
		];
	}
	if (definition.completionSignal === "REFACTOR_COMPLETE") {
		return [
			"Refactor-task instructions:",
			"- Apply only the requested refactor/spec update and preserve implementation learnings.",
			"- Edit only the selected artifact path; do not update .progress.md, .ralph-state.json, or sibling artifacts in the same step.",
			"- Run the task's Verify command when present.",
			"- Successful output must include REFACTOR_COMPLETE, CASCADE_NEEDED, CASCADE_REASON, and EVIDENCE: <verification proof>.",
		];
	}
	return [
		"Execution-task instructions:",
		"- Implement exactly this one task and no adjacent improvements.",
		"- Run the task's Verify command or exact MCP proxy call and include the required verify: <proof> line.",
		"- For MCP-backed verification, use the selected discovered tool only; avoid broad mcp server listing or eager connect unless the task explicitly requires it.",
		"- Final success output must include TASK_COMPLETE, status: pass, commit: <hash or none>, and verify: <proof>.",
	];
}

function buildImplementationPrompt(
	task: ParsedNativeTask,
	definition: ImplementationSubagentDefinition,
	spec: SpecEntry,
	state: RalphState | null,
	options: RalphPathOptions,
): string {
	const progressPath = getProgressPath(spec, options);
	const workspaceReport = pendingImplementationPromptWorkspaceReport ?? analyzeTaskWorkspace({
		basePath: spec.absolutePath,
		filesDirective: task.fields["files"],
		tasksPath: artifactPath(spec, "tasks"),
		progressPath,
		commitDirective: task.fields["commit"],
	});
	pendingImplementationPromptWorkspaceReport = null;
	const workspaceReportText = formatTaskWorkspaceReport(workspaceReport);
	const fallbackWorkspaceGuidance = [
		"- Preflight workspace topology before commit handling and follow the computed report below.",
		workspaceReport.topology === "single_repo"
			? "- single_repo keeps existing commit-required behavior unless the task explicitly says `Commit: None`."
			: "- Non-single_repo workspaces may complete with `commit: none` when one combined commit cannot span required files.",
	];
	const workspaceGuidance = definition.completionSignal === "TASK_COMPLETE"
		? (workspaceReport.promptGuidance ?? fallbackWorkspaceGuidance)
		: [];
	const redTaskInstructions = /\[RED\]/i.test(`${task.rawTitle}\n${task.subject}`)
		? [
			"RED-task completion instructions:",
			"- This is an expected-failure task. Final success output must include a keyed proof line that contains RED_PASS, preferably exactly `verify: RED_PASS`.",
			"- Only report RED_PASS when the failing test or verification failed in the expected way.",
		]
		: [];

	return [
		`You are running one Smart Ralph implementation-loop task as ${definition.agentName}.`,
		"",
		"Coordinator contract:",
		`- specName: ${spec.name}`,
		`- basePath: ${spec.absolutePath}`,
		`- taskIndex: ${task.index}`,
		`- taskNumber: ${task.taskNumber ?? "n/a"}`,
		`- phase: ${task.phase || "unknown"}`,
		`- required completion signal: ${definition.completionSignal}`,
		`- tasksPath: ${artifactPath(spec, "tasks")}`,
		`- progressPath: ${progressPath}`,
		`- statePath: ${getRalphStatePath(spec, options)} (read-only; never edit this file)`,
		"- Write only files required by the task block unless inspection is needed.",
		"- Do not edit Smart Ralph package/runtime files unless they are explicitly listed in the task.",
		"- Work-plane only: executor/QA/refactor subagents complete the scoped task and return signals/evidence.",
		"- Never ask the user; report USER_INPUT_REQUIRED or a blocker instead.",
		"- The coordinator owns native task status, retry/block decisions, task advancement, and ALL_TASKS_COMPLETE.",
		"- The coordinator will update native pi-task cards and will not advance without evidence.",
		...workspaceGuidance,
		"",
		...agentSpecificImplementationInstructions(definition),
		...(redTaskInstructions.length > 0 ? ["", ...redTaskInstructions] : []),
		"",
		"Current Ralph state:",
		"~~~json",
		JSON.stringify(state ?? {}, null, 2),
		"~~~",
		"",
		"Current task block:",
		"~~~markdown",
		task.block,
		"~~~",
		"",
		"Workspace preflight:",
		"~~~text",
		workspaceReportText,
		"~~~",
		"",
		promptFileSection("Progress", progressPath, readProgress(spec, options)),
		promptFileSection("Research Verification Context", artifactPath(spec, "research"), buildResearchVerificationContext(spec)),
		promptFileSection("Requirements", artifactPath(spec, "requirements"), readFileIfExists(artifactPath(spec, "requirements"))),
		promptFileSection("Design", artifactPath(spec, "design"), readFileIfExists(artifactPath(spec, "design"))),
	].join("\n");
}

function subagentCompletionOutput(completion: SubagentCompletion): string {
	return formatImplementationSubagentCompletionOutput(completion);
}

function truncateFailureReason(reason: string, maxLength = 280): string {
	const normalized = normalizeWhitespace(reason);
	return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function extractRelevantFailureLines(output: string): string[] {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => !/^(TASK_COMPLETE|VERIFICATION_PASS|REFACTOR_COMPLETE|VERIFICATION_FAIL|TASK_MODIFICATION_REQUEST|USER_INPUT_REQUIRED)\b/i.test(line));
}

function formatQuestionBlockReason(lines: string[], fallback: string): string {
	const questionLines = lines
		.filter((line) => /^(?:questions?:|\d+\.|[-*])\s*/i.test(line))
		.map((line) => line.replace(/^(?:questions?:|\d+\.|[-*])\s*/i, "").trim())
		.filter(Boolean);
	if (questionLines.length === 0) return fallback;
	return `${fallback} ${questionLines.slice(0, 2).join(" ")}`;
}

function detectExplicitFailureReason(
	output: string,
	definition: ImplementationSubagentDefinition,
	workspaceReport?: ReturnType<typeof analyzeTaskWorkspace>,
): string | null {
	if (!output.trim()) return null;

	const topologyAssessment = assessTaskCompletionOutput(output, workspaceReport);
	const topologyBlocker = !topologyAssessment.ok && workspaceReport?.commitMode === "topology_relaxed"
		? topologyAssessment.blocker
			?? `Workspace commit topology ${workspaceReport.topology} is topology_relaxed; non-single_repo completions should report commit: none with commit_reason: ${workspaceReport.commitReason ?? workspaceReport.topology} (split_repo_workspace evidence).`
		: null;

	let modificationBlocker: string | null = null;
	if (/TASK_MODIFICATION_REQUEST/i.test(output)) {
		try {
			const request = parseTaskModificationRequest(output);
			modificationBlocker = request
				? `Task modification requested (${request.type}) for ${request.originalTaskId}: ${request.reasoning}`
				: "Task modification requested.";
		} catch (error) {
			modificationBlocker = `Task modification request is invalid: ${formatError(error)}`;
		}
	}

	const relevantLines = extractRelevantFailureLines(output);
	let verificationBlocker: string | null = null;
	if (/USER_INPUT_REQUIRED/i.test(output)) {
		verificationBlocker = truncateFailureReason(formatQuestionBlockReason(relevantLines, "User input required."));
	} else if (/VERIFICATION_FAIL/i.test(output)) {
		const failureLine = relevantLines.find((line) => /\bFAIL\b|\berror\b|\bblocked\b/i.test(line));
		verificationBlocker = truncateFailureReason(`Verification failed: ${failureLine ?? "qa-engineer reported VERIFICATION_FAIL."}`);
	} else {
		const structuredFailure = relevantLines.find((line) => /^Task\s+\S+.*FAILED$/i.test(line));
		const structuredError = relevantLines.find((line) => /^Error:\s*/i.test(line));
		if (structuredFailure || structuredError) {
			verificationBlocker = truncateFailureReason([structuredFailure, structuredError].filter(Boolean).join(" "));
		} else {
			const commandFailurePatterns = [
				/command not found/i,
				/no such file or directory/i,
				/exited with code\s+\d+/i,
				/returned non-zero exit status/i,
				/traceback \(most recent call last\)/i,
				/AssertionError/i,
				/FAILED/i,
				/Error:/i,
				/Exception:/i,
				/mypy:/i,
				/black.*would reformat/i,
				/ruff:/i,
				/pytest/i,
			];
			const commandFailure = relevantLines.find((line) => commandFailurePatterns.some((pattern) => pattern.test(line)));
			if (commandFailure) {
				verificationBlocker = truncateFailureReason(commandFailure);
			} else {
				const summary = relevantLines.slice(0, 3).join(" ");
				if (summary) verificationBlocker = truncateFailureReason(summary);
			}
		}
	}

	return selectTaskCompletionBlocker({
		topologyBlocker,
		modificationBlocker,
		verificationBlocker,
		fallbackBlocker: `Missing completion signal ${definition.completionSignal}.`,
	});
}

function extractCompletionEvidence(output: string, signal: CompletionSignal, requireRedPass = false): string | null {
	// Keep keyed verify|verification|evidence parsing and `verify: RED_PASS` detection visible in index.ts
	// so older task-blockers parity fixtures can still locate the stable bridge surface.
	return implementationExtractCompletionEvidence(output, signal, requireRedPass, hasExpectedFailureProof);
}

function validateSubagentCompletion(
	completion: SubagentCompletion,
	definition: ImplementationSubagentDefinition,
	task?: ParsedNativeTask,
	workspaceReport?: ReturnType<typeof analyzeTaskWorkspace>,
): CompletionValidation {
	const output = subagentCompletionOutput(completion);
	// [RED] expected-failure tasks still require keyed `verify: RED_PASS` proof.
	// The implementation-loop bridge keeps signal/evidence/contradiction enforcement centralized.
	const bridgeInput = createImplementationCompletionBridgeInput({
		output,
		signal: definition.completionSignal,
		task,
		hasExpectedFailureProof,
		assessCompletionOutput: (candidateOutput) => assessTaskCompletionOutput(candidateOutput, workspaceReport),
		detectFailureReason: () => detectExplicitFailureReason(output, definition, workspaceReport)
			?? `Workspace completion output is invalid for ${workspaceReport?.commitMode ?? "unknown"}.`,
	});
	void extractCompletionEvidence(output, definition.completionSignal, bridgeInput.requiresExpectedFailureProof === true);
	return validateImplementationTaskCompletion(bridgeInput);
}

function isPackageVerificationTask(task: ParsedNativeTask): boolean {
	if (!task.isVerify) return false;
	const verifyDirective = task.fields["verify"] ?? "";
	const packageVerifyPattern = /\bQC-verify(?:-index|-pack)?\b|\bverify:index\b|\bverify:pack\b|\bprepack\b|package verification/i;
	return packageVerifyPattern.test(`${task.subject}\n${task.description}\n${verifyDirective}`);
}

function createSharedSurfaceTaskSnapshot(tasks: readonly ParsedNativeTask[]): ImplementationSharedSurfaceTaskLike[] {
	return tasks.map((task) => ({
		index: task.index,
		status: task.status,
		isVerify: task.isVerify,
		fields: task.fields,
		subject: task.subject,
		description: task.description,
		block: task.block,
		checkboxKey: task.checkboxKey,
		stableKey: task.stableKey,
	}));
}

async function runSharedSurfacePreflightIfNeeded(
	ctx: ExtensionCommandContext,
	spec: SpecEntry,
	task: ParsedNativeTask,
	tasks: readonly ParsedNativeTask[],
	state: RalphState | null,
	options: RalphPathOptions,
): Promise<{ ok: true } | { ok: false; reason: string }> {
	void spec;
	void options;
	if (!isPackageVerificationTask(task)) return { ok: true };
	const preflightPlan = createImplementationSharedSurfacePreflightPlan(
		createSharedSurfaceTaskSnapshot(tasks),
		task.index,
		state?.evidence,
	);
	if (preflightPlan.commands.length === 0) return { ok: true };
	const preflight = runImplementationSharedSurfacePreflight(preflightPlan, ctx.cwd);
	if (preflight.ok) return { ok: true };
	const touchedFiles = preflight.touchedFiles.join(", ") || Object.keys(SHARED_SURFACE_PREFLIGHT_COMMANDS).join(", ");
	return {
		ok: false,
		reason: `Shared-surface preflight failed before package verification for ${touchedFiles}: ${preflight.failedCommand ?? "unknown command"}\n${preflight.output}`,
	};
}

function runGitCommand(cwd: string, args: string[]): GitCommandResult {
	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		stdio: ["ignore", "pipe", "pipe"],
		timeout: 30_000,
	});
	const spawnError = result.error instanceof Error ? result.error.message : "";
	return {
		ok: result.status === 0,
		status: result.status,
		stdout: typeof result.stdout === "string" ? result.stdout.trim() : "",
		stderr: (typeof result.stderr === "string" ? result.stderr.trim() : "") || spawnError,
	};
}

function gitRootForFile(filePath: string): string | null {
	const result = runGitCommand(dirname(filePath), ["rev-parse", "--show-toplevel"]);
	return result.ok && result.stdout ? result.stdout.split(/\r?\n/).at(-1)?.trim() || null : null;
}

function gitRootForPath(path: string): string | null {
	const result = runGitCommand(path, ["rev-parse", "--show-toplevel"]);
	return result.ok && result.stdout ? result.stdout.split(/\r?\n/).at(-1)?.trim() || null : null;
}

function gitRelativePath(root: string, filePath: string): string | null {
	const relativePath = relative(root, filePath).replace(/\\/g, "/");
	if (!relativePath || relativePath === ".." || relativePath.startsWith("../") || isAbsolute(relativePath)) return null;
	return relativePath;
}

function isGitTracked(root: string, relativePath: string): boolean {
	return runGitCommand(root, ["ls-files", "--error-unmatch", "--", relativePath]).ok;
}

function gitStatusForPath(root: string, relativePath: string): string | null {
	const result = runGitCommand(root, ["status", "--porcelain=v1", "--untracked-files=no", "--", relativePath]);
	return result.ok ? result.stdout : null;
}

function gitShortHead(root: string): string | undefined {
	const result = runGitCommand(root, ["rev-parse", "--short=7", "HEAD"]);
	return result.ok && result.stdout ? result.stdout : undefined;
}

function hasGitChangesInScope(root: string, relativePath: string): boolean {
	const status = runGitCommand(root, ["status", "--porcelain=v1", "--untracked-files=all", "--", relativePath]);
	return status.ok && Boolean(status.stdout);
}

function hasStagedGitChangesInScope(root: string, relativePath: string): boolean {
	const diff = runGitCommand(root, ["diff", "--cached", "--name-only", "--", relativePath]);
	return diff.ok && Boolean(diff.stdout);
}

function commitRefactorSpecIfDirty(spec: SpecEntry, commitSpec: boolean | undefined): CoordinatorProgressCommitResult {
	const root = gitRootForPath(spec.absolutePath);
	if (!root) return { committed: false };

	const commitPlan = buildRefactorLocalCommitPlan(spec.name, gitRelativePath(root, spec.absolutePath), commitSpec);
	if (!commitPlan.enabled || !commitPlan.relativeSpecPath) return { committed: false };
	if (!hasGitChangesInScope(root, commitPlan.relativeSpecPath)) return { committed: false };

	const add = runGitCommand(root, commitPlan.stageArgs);
	if (!add.ok) {
		return {
			committed: false,
			error: normalizeWhitespace(add.stderr || add.stdout || `git add exited with status ${add.status ?? "unknown"}`),
		};
	}

	if (!hasStagedGitChangesInScope(root, commitPlan.relativeSpecPath)) return { committed: false };
	if (commitPlan.remoteWritesAllowed) {
		return { committed: false, error: "Refactor local commit plan must not allow remote git writes." };
	}

	const commit = runGitCommand(root, commitPlan.commitArgs);
	if (!commit.ok) {
		return {
			committed: false,
			error: normalizeWhitespace(commit.stderr || commit.stdout || `git commit exited with status ${commit.status ?? "unknown"}`),
		};
		}

	return { committed: true, hash: gitShortHead(root) };
}

function commitTrackedProgressIfDirty(progressPath: string, message: string): CoordinatorProgressCommitResult {
	const root = gitRootForFile(progressPath);
	if (!root) return { committed: false };

	const relativePath = gitRelativePath(root, progressPath);
	if (!relativePath || !isGitTracked(root, relativePath)) return { committed: false };

	const status = gitStatusForPath(root, relativePath);
	if (!status) return { committed: false };

	const commit = runGitCommand(root, ["commit", "-m", message, "--", relativePath]);
	if (!commit.ok) {
		return {
			committed: false,
			error: normalizeWhitespace(commit.stderr || commit.stdout || `git commit exited with status ${commit.status ?? "unknown"}`),
		};
	}

	return { committed: true, hash: gitShortHead(root) };
}

function appendImplementationProgress(
	spec: SpecEntry,
	task: ParsedNativeTask,
	definition: ImplementationSubagentDefinition,
	evidence: string,
	nativeTaskId: string,
	options: RalphPathOptions,
): CoordinatorProgressCommitResult {
	const progressPath = appendProgress(
		spec,
		[
			"",
			`### Implementation task ${task.index + 1}: ${task.subject} (${new Date().toISOString()})`,
			`- Agent: ${definition.agentName}`,
			`- Signal: ${definition.completionSignal}`,
			`- Native task: #${nativeTaskId}`,
			`- Evidence: ${evidence}`,
			"",
		].join("\n"),
		options,
	);

	return commitTrackedProgressIfDirty(
		progressPath,
		`chore(ralph): record implementation evidence for ${spec.name} task ${task.index + 1}`,
	);
}

function appendImplementationReviewProgress(
	spec: SpecEntry,
	task: ParsedNativeTask,
	status: ImplementationReviewStatus,
	checkpointReason: string,
	output: string,
	options: RalphPathOptions,
): void {
	appendProgress(
		spec,
		[
			"",
			`### Implementation Layer 3 review (${new Date().toISOString()})`,
			`- Task: ${task.index + 1} ${task.subject}`,
			`- Result: ${status}`,
			`- Checkpoint: ${checkpointReason}`,
			...(output.trim() ? ["- Reviewer output:", "~~~text", truncateForPrompt(output, 4000), "~~~"] : []),
			"",
		].join("\n"),
		options,
	);
}

function appendImplementationBlocker(
	spec: SpecEntry,
	task: ParsedNativeTask | null,
	reason: string,
	options: RalphPathOptions,
): void {
	appendProgress(
		spec,
		[
			"",
			`### Implementation blocked (${new Date().toISOString()})`,
			task ? `- Task: ${task.index + 1} ${task.subject}` : "- Task: none",
			`- Reason: ${reason}`,
			"",
		].join("\n"),
		options,
	);
}

function appendImplementationRetry(
	spec: SpecEntry,
	task: ParsedNativeTask,
	reason: string,
	options: RalphPathOptions,
): void {
	appendProgress(
		spec,
		[
			"",
			`### Implementation retry (${new Date().toISOString()})`,
			`- Task: ${task.index + 1} ${task.subject}`,
			`- Reason: ${reason}`,
			"",
		].join("\n"),
		options,
	);
}

function formatBlockerMessage(spec: SpecEntry, task: ParsedNativeTask | null, reason: string): string {
	return [
		`Ralph implementation blocked for spec: ${spec.name}`,
		"",
		`Location: ${spec.path}`,
		task ? `Task: ${task.index + 1}. ${task.subject}` : "Task: <none>",
		`Reason: ${reason}`,
		"",
		"Fix the blocker, then rerun /ralph-implement to resume from tasks.md.",
	].join("\n");
}

function implementationAttemptPatch(
	spec: SpecEntry,
	state: RalphState | null,
	parsed: ImplementArguments,
	task: ParsedNativeTask,
	totalTasks: number,
	taskIteration: number,
	globalIteration: number,
): Record<string, unknown> {
	const executionPatch = createImplementationStatePatch(state, {
		source: state?.source ?? "spec",
		name: spec.name,
		basePath: spec.path,
		phase: "execution",
		taskIndex: task.index,
		totalTasks,
		taskIteration,
		maxTaskIterations: parsed.maxTaskIterations,
		recoveryMode: parsed.recoveryMode || booleanField(state, "recoveryMode") === true,
		globalIteration,
		maxGlobalIterations: parsed.maxGlobalIterations,
		maxFixTasksPerOriginal: numberField(state, "maxFixTasksPerOriginal") ?? 3,
		maxFixTaskDepth: numberField(state, "maxFixTaskDepth") ?? 3,
		fixTaskMap: stateRecordField(state, "fixTaskMap"),
		modificationMap: stateRecordField(state, "modificationMap"),
		nativeTaskMap: stateRecordField(state, "nativeTaskMap"),
		evidence: stateRecordField(state, "evidence"),
		maxModificationsPerTask: numberField(state, "maxModificationsPerTask") ?? 3,
		maxModificationDepth: numberField(state, "maxModificationDepth") ?? 2,
	});

	return {
		...executionPatch,
		...createRecoveredImplementationStatePatch(state),
		awaitingApproval: false,
		activeTaskPendingEvidence: {
			index: task.index,
			key: task.stableKey,
			subject: task.subject,
			startedAt: new Date().toISOString(),
		},
		currentTask: {
			index: task.index,
			subject: task.subject,
			agentType: task.agentType,
			phase: task.phase,
		},
	};
}

function persistImplementationBlockedState(
	spec: SpecEntry,
	reason: string,
	options: RalphPathOptions,
	extraPatch: Record<string, unknown> = {},
): void {
	mergeRalphState(
		spec,
		{
			phase: "execution",
			blocked: true,
			blockedAt: new Date().toISOString(),
			validationError: reason,
			awaitingApproval: false,
			...extraPatch,
		},
		options,
	);
}

async function blockImplementation(
	ctx: ExtensionCommandContext,
	spec: SpecEntry,
	task: ParsedNativeTask | null,
	reason: string,
	options: RalphPathOptions,
	extraPatch: Record<string, unknown> = {},
): Promise<void> {
	try {
		appendImplementationBlocker(spec, task, reason, options);
		persistImplementationBlockedState(spec, reason, options, extraPatch);
	} catch {
		// The blocker notification below is the primary user-facing error.
	}
	await notify(ctx, formatBlockerMessage(spec, task, reason), "warning");
}

function epicIdentityFromState(spec: SpecEntry, state: RalphState | null): { epicName: string; childName: string } | null {
	const epicName = stringField(state, "epicName");
	if (!epicName) return null;
	return { epicName, childName: stringField(state, "epicSpecName") ?? spec.name };
}

function prepareEpicImplementationStart(spec: SpecEntry, state: RalphState | null, options: RalphPathOptions): { state: RalphState | null; lines: string[]; error?: string } {
	const identity = epicIdentityFromState(spec, state);
	if (!identity) return { state, lines: [] };
	if (!isValidSpecName(identity.epicName)) return { state, lines: [], error: `Invalid epicName '${identity.epicName}' in ${getRalphStatePath(spec, options)}.` };

	const epic = resolveEpicDirectory(identity.epicName, options);
	if (!epic.exists) return { state, lines: [], error: `Epic '${identity.epicName}' not found for child spec '${spec.name}'.` };
	const stateRead = safeReadEpicState(epic, options);
	if (!stateRead.state) return { state, lines: [], error: [`Epic '${identity.epicName}' has no readable state.`, ...stateRead.warnings.map((warning) => `- ${warning}`)].join("\n") };
	if (stateRead.state.status === "cancelled") return { state, lines: [], error: `Epic '${identity.epicName}' is cancelled; refusing to implement child spec '${identity.childName}'.` };

	const summary = computeEpicDependencyStatus(stateRead.state);
	const entry = epicStatusForChild(summary, identity.childName);
	if (!entry) return { state, lines: [], error: `Epic '${identity.epicName}' does not contain child spec '${identity.childName}'.` };
	if (entry.status === "cancelled") return { state, lines: [], error: `Epic child spec '${identity.childName}' is cancelled.` };
	if (entry.isExplicitlyBlocked) return { state, lines: [], error: `Epic child spec '${identity.childName}' is blocked: ${formatEpicDependencyReason(entry)}.` };
	if (entry.isDependencyBlocked && booleanField(state, "epicDependencyOverride") !== true) {
		return { state, lines: [], error: `Epic child spec '${identity.childName}' is waiting on dependencies: ${formatEpicDependencyReason(entry)}.` };
	}

	if (entry.status === "pending") {
		const updatedEpicState = startEpicChildSpec(epic, identity.childName, options);
		const updatedSummary = computeEpicDependencyStatus(updatedEpicState);
		const updatedEntry = epicStatusForChild(updatedSummary, identity.childName);
		const updatedState = mergeRalphState(
			spec,
			{
				...epicStartStatePatch(
					{
						epic,
						state: updatedEpicState,
						child: updatedEntry?.spec ?? entry.spec,
						dependencyStatus: updatedEntry ?? entry,
						selectedByNextFlag: false,
					},
					spec,
					"execution",
					state,
					options,
				),
				phase: "execution",
			},
			options,
		);
		return { state: updatedState, lines: [`Epic child spec '${identity.childName}' marked in_progress for epic '${identity.epicName}'.`] };
	}

	return { state, lines: [] };
}

function formatEpicCompletionNotification(result: ReturnType<typeof completeEpicChildSpec>): EpicCompletionNotification {
	const summary = computeEpicDependencyStatus(result.state);
	const next = summary.nextSpec;
	const lines = [
		"Epic update:",
		`- Epic: ${result.state.name}`,
		`- Child spec marked completed: ${result.completedSpec.name}`,
		`- Progress: ${epicProgressText(result.state, summary.completedSpecs.length)}`,
	];

	if (result.newlyReadySpecs.length > 0) {
		lines.push(`- Newly unblocked child spec(s): ${result.newlyReadySpecs.map((spec) => spec.name).join(", ")}`);
	}
	if (result.epicCompleted) {
		lines.push("- Epic status: completed.");
		if (result.currentEpicCleared) lines.push("- Cleared current epic marker.");
	} else {
		lines.push(`- Next unblocked child spec: ${next?.name ?? "none"}`);
		if (next) lines.push("- Next command: /ralph-start --next-epic-spec");
	}
	return { lines, type: "info" };
}

const IMPLEMENTATION_STALE_PROGRESS_MAX_AGE_MS = 60 * 60 * 1000;

function cleanupStaleImplementationProgressFiles(spec: SpecEntry, maxAgeMs = IMPLEMENTATION_STALE_PROGRESS_MAX_AGE_MS): string[] {
	const deleted: string[] = [];
	for (const entry of readdirSync(spec.absolutePath, { withFileTypes: true })) {
		if (!entry.isFile() || !/^\.progress-task-.*\.md$/i.test(entry.name)) continue;
		const entryPath = join(spec.absolutePath, entry.name);
		const ageMs = Date.now() - statSync(entryPath).mtimeMs;
		if (ageMs < maxAgeMs) continue;
		unlinkSync(entryPath);
		deleted.push(entry.name);
	}
	return deleted.sort();
}

function readImplementationPrUrl(cwd: string): string | null {
	const result = spawnSync("gh", ["pr", "view", "--json", "url", "-q", ".url"], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) return null;
	const prUrl = result.stdout.trim();
	return prUrl.length > 0 ? prUrl : null;
}

function completeEpicChildAfterImplementation(spec: SpecEntry, finalState: RalphState, options: RalphPathOptions): EpicCompletionNotification {
	const identity = epicIdentityFromState(spec, finalState);
	if (!identity) return { lines: [], type: "info" };

	try {
		if (!isValidSpecName(identity.epicName)) throw new Error(`Invalid epicName '${identity.epicName}' in ${getRalphStatePath(spec, options)}.`);
		const epic = resolveEpicDirectory(identity.epicName, options);
		if (!epic.exists) throw new Error(`Epic '${identity.epicName}' not found.`);
		const stateRead = safeReadEpicState(epic, options);
		if (!stateRead.state) throw new Error([`Epic '${identity.epicName}' has no readable state.`, ...stateRead.warnings.map((warning) => `- ${warning}`)].join("\n"));
		const summary = computeEpicDependencyStatus(stateRead.state);
		const existing = epicStatusForChild(summary, identity.childName);
		if (!existing) throw new Error(`Epic '${identity.epicName}' does not contain child spec '${identity.childName}'.`);
		if (existing.status === "completed") {
			const next = summary.nextSpec;
			const lines = [
				"Epic update:",
				`- Epic: ${stateRead.state.name}`,
				`- Child spec already marked completed: ${identity.childName}`,
				`- Progress: ${epicProgressText(stateRead.state, summary.completedSpecs.length)}`,
				`- Next unblocked child spec: ${next?.name ?? "none"}`,
			];
			if (next) lines.push("- Next command: /ralph-start --next-epic-spec");
			return { lines, type: stateRead.warnings.length > 0 ? "warning" : "info" };
		}

		const result = completeEpicChildSpec(epic, identity.childName, {
			...options,
			clearCurrentEpicOnComplete: true,
		});
		return formatEpicCompletionNotification(result);
	} catch (error) {
		const message = `Epic state update failed after child implementation completed: ${formatError(error)}`;
		try {
			mergeRalphState(
				spec,
				{
					validationError: message,
					epicCompletionError: message,
					epicCompletionErrorAt: new Date().toISOString(),
				},
				options,
			);
		} catch {
			// Keep the original epic update failure as the user-facing warning.
		}
		return {
			lines: [
				"Epic update:",
				`- ${message}`,
				"- The child spec remains completed.",
				`- Fix the epic state, then rerun /ralph-implement ${spec.name} or inspect /ralph-epic-status.`,
			],
			type: "warning",
		};
	}
}

async function runImplementCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: ExtensionCommandContext,
	invocation: { preserveCurrentSpecMarker?: boolean } = {},
): Promise<void> {
	await ctx.waitForIdle();
	const parsed = parseImplementArgs(args);
	if (parsed.error) {
		await notify(ctx, parsed.error, "warning");
		return;
	}

	const agentBootstrap = bootstrapRalphAgents(ctx.cwd);
	const dependencyError = implementationDependencyError(pi, ctx.cwd, agentBootstrap);
	if (dependencyError) {
		await notify(ctx, dependencyError, "warning");
		return;
	}

	const options = pathOptions(ctx);
	const resolved = resolveImplementTarget(parsed, options);
	if (!resolved.target) {
		await notify(ctx, resolved.error ?? "Unable to resolve Ralph spec.", "warning");
		return;
	}

	const spec = resolved.target.spec;
	if (!invocation.preserveCurrentSpecMarker) writeCurrentSpec(spec, options);

	let state: RalphState | null = resolved.target.state;
	let taskData: { tasksPath: string; content: string; tasks: ParsedNativeTask[] };
	const startupSummaries: string[] = [];
	try {
		taskData = readImplementationTasks(spec);
		validateImplementationExecutionState(state, spec);
		state = mergeRalphState(
			spec,
			{
				source: state?.source ?? "spec",
				name: spec.name,
				basePath: spec.path,
				phase: "execution",
				taskIndex: numberField(state, "taskIndex") ?? taskData.tasks.find((task) => task.status !== "completed")?.index ?? taskData.tasks.length,
				totalTasks: taskData.tasks.length,
				maxTaskIterations: parsed.maxTaskIterations,
				maxGlobalIterations: parsed.maxGlobalIterations,
				recoveryMode: parsed.recoveryMode || booleanField(state, "recoveryMode") === true,
				globalIteration: numberField(state, "globalIteration") ?? 1,
				taskIteration: numberField(state, "taskIteration") ?? 1,
				...createImplementationStateDefaults(state, {
					maxFixTasksPerOriginal: numberField(state, "maxFixTasksPerOriginal") ?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASKS_PER_ORIGINAL,
					maxFixTaskDepth: numberField(state, "maxFixTaskDepth") ?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASK_DEPTH,
					fixTaskMap: stateRecordField(state, "fixTaskMap"),
					modificationMap: stateRecordField(state, "modificationMap"),
					nativeTaskMap: stateRecordField(state, "nativeTaskMap"),
					evidence: stateRecordField(state, "evidence"),
					maxModificationsPerTask: numberField(state, "maxModificationsPerTask") ?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATIONS_PER_TASK,
					maxModificationDepth: numberField(state, "maxModificationDepth") ?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATION_DEPTH,
				}),
				awaitingApproval: false,
				blocked: false,
				validationError: null,
			},
			options,
		);
		state = ensureNativeTaskCardsForImplementation(pi, ctx, spec, options, state, taskData.tasks);
		const epicPrepared = prepareEpicImplementationStart(spec, state, options);
		if (epicPrepared.error) throw new Error(epicPrepared.error);
		state = epicPrepared.state;
		startupSummaries.push(...epicPrepared.lines.map((line) => `- ${line}`));
	} catch (error) {
		await notify(ctx, `Cannot start Ralph implementation: ${formatError(error)}`, "warning");
		return;
	}

	const completedSummaries: string[] = [...startupSummaries];
	setRalphStatus(ctx, `Ralph implement: ${spec.name}`);

	try {
		implementationLoop: while (true) {
			state = readRalphState(spec, options) ?? state;
			taskData = readImplementationTasks(spec);
			let tasks = restoreUnverifiedActiveTaskIfNeeded(spec, state, taskData.tasks, options);
			tasks = readImplementationTasks(spec).tasks;
			syncNativeCardsFromTasks(ctx, state, tasks);

			const next = nextImplementationTask(tasks, numberField(state, "taskIndex"));
			if (next.kind === "complete") {
				// runArtifactReview(...) checkpoint evidence must end in REVIEW_PASS before ALL_TASKS_COMPLETE.
				const latestReview = latestImplementationReviewStatus(state?.evidence);
				if (tasks.length > 0 && latestReview !== "REVIEW_PASS") {
					await blockImplementation(
						ctx,
						spec,
						null,
						`Layer 3 review evidence is incomplete before final success: latest status was ${latestReview ?? "REVIEW_FAIL"}.`,
						options,
						{
							taskIndex: tasks.length - 1,
							totalTasks: tasks.length,
							evidence: stateRecordField(state, "evidence"),
						},
					);
					return;
				}
				const completionBlockers = describeImplementationOutstandingCompletionWork(tasks, state);
				if (completionBlockers.length > 0) {
					await blockImplementation(
						ctx,
						spec,
						null,
						`Implementation cannot finalize yet: ${completionBlockers.join("; ")}.`,
						options,
						{
							taskIndex: tasks.length,
							totalTasks: tasks.length,
							evidence: stateRecordField(state, "evidence"),
						},
					);
					return;
				}
				const completedAt = new Date().toISOString();
				const statePath = getRalphStatePath(spec, options);
				state = mergeRalphState(
					spec,
					createImplementationFinalizerStartedPatch(state?.evidence, tasks.length, completedAt),
					options,
				);
				const epicCompletion = completeEpicChildAfterImplementation(spec, state, options);
				state = mergeRalphState(
					spec,
					createImplementationFinalizerEpicUpdatedPatch(state?.evidence, tasks.length, completedAt),
					options,
				);
				const indexResult = await runRalphIndex({ cwd: ctx.cwd, args: [] });
				const indexSummary = formatRalphIndexCommandResult(indexResult);
				if (!indexResult.ok) {
					const indexError = normalizeWhitespace(indexResult.error || indexResult.message || "Index finalization failed.");
					state = mergeRalphState(
						spec,
						createImplementationFinalizerIndexFailurePatch(state?.evidence, tasks.length, completedAt, indexError),
						options,
					);
					await notify(
						ctx,
						formatImplementationFinalizerIndexFailureOutput({
							specName: spec.name,
							taskCount: tasks.length,
							statePath,
							epicLines: epicCompletion.lines,
							indexError,
							indexSummary,
						}),
						"warning",
					);
					return;
				}
				const deletedProgressFiles = cleanupStaleImplementationProgressFiles(spec);
				const prUrl = readImplementationPrUrl(ctx.cwd);
				const completionArtifacts = writeImplementationCompletionArtifacts({
					spec,
					basePath: spec.path,
					options,
					existingEvidence: state?.evidence,
					taskCount: tasks.length,
					completedAt,
					indexSummary: indexResult.message,
					deletedProgressFiles,
					prUrl,
				});
				state = completionArtifacts.state;
				// "ALL_TASKS_COMPLETE", plus optional "PR URL" terminal output is formatted by formatImplementationFinalizerSuccessOutput(...).
				await notify(
					ctx,
					formatImplementationFinalizerSuccessOutput({
						specName: spec.name,
						taskCount: tasks.length,
						statePath,
						completedSummaries,
						epicLines: epicCompletion.lines,
						indexSummary,
						deletedProgressFiles,
						prUrl,
					}),
					epicCompletion.type,
				);
				return;
			}

			if (next.kind === "blocked") {
				await blockImplementation(ctx, spec, next.task, `Task dependencies are incomplete: ${next.blockers.map((index) => index + 1).join(", ")}`, options);
				return;
			}

			const batchTasks = next.kind === "batch"
				? next.taskIndices.map((taskIndex) => tasks[taskIndex]).filter((candidate): candidate is ParsedNativeTask => Boolean(candidate))
				: [next.task];
			const executionBatch = batchTasks.map((task) => task.index);
			const applyImplementationBatchTaskEvidence = mergeImplementationBatchTaskEvidence;

			for (const batchTask of batchTasks) {
				const task = batchTask;
				const batchPosition = Math.max(0, executionBatch.indexOf(task.index));
				const globalIteration = numberField(state, "globalIteration") ?? 1;
				if (globalIteration > parsed.maxGlobalIterations) {
					await blockImplementation(ctx, spec, task, `Max global iterations exceeded (${parsed.maxGlobalIterations}).`, options);
					return;
				}

				const sameTask = numberField(state, "taskIndex") === task.index;
				const taskIteration = sameTask ? numberField(state, "taskIteration") ?? 1 : 1;
				if (taskIteration > parsed.maxTaskIterations) {
					await blockImplementation(ctx, spec, task, `Max task iterations exceeded (${parsed.maxTaskIterations}).`, options);
					return;
				}

				const definition = implementationSubagentDefinition(task);
				state = mergeRalphState(spec, implementationAttemptPatch(spec, state, parsed, task, tasks.length, taskIteration, globalIteration), options);

				let nativeUpdate: NativeExecutionUpdate;
				try {
					nativeUpdate = setNativeTaskExecutionStatus(ctx, state, spec, task, "in_progress", {
						ralphExecutionAgent: definition.agentName,
						ralphExecutionSignalRequired: definition.completionSignal,
					});
				} catch (error) {
					await blockImplementation(ctx, spec, task, `Failed to mark native pi-task in_progress: ${formatError(error)}`, options);
					return;
				}

				setRalphStatus(
					ctx,
					executionBatch.length > 1
						? `Ralph implement: ${task.activeForm} (sequential batch ${batchPosition + 1}/${executionBatch.length})`
						: `Ralph implement: ${task.activeForm}`,
				);
				const workspaceReport = analyzeTaskWorkspace({
					basePath: spec.absolutePath,
					filesDirective: task.fields["files"],
					tasksPath: artifactPath(spec, "tasks"),
					progressPath: getProgressPath(spec, options),
					commitDirective: task.fields["commit"],
				});
				const sharedSurfacePreflight = await runSharedSurfacePreflightIfNeeded(ctx, spec, task, tasks, state, options);
				if (!sharedSurfacePreflight.ok) {
					const sharedSurfaceReason = (sharedSurfacePreflight as any).reason as string;
					await blockImplementation(ctx, spec, task, sharedSurfaceReason, options, {
						taskIndex: task.index,
						totalTasks: tasks.length,
						taskIteration,
						globalIteration: globalIteration + 1,
						lastSubagentOutput: truncateForPrompt(sharedSurfaceReason, 6000),
					});
					return;
				}
				pendingImplementationPromptWorkspaceReport = workspaceReport;
				const prompt = buildImplementationPrompt(task, definition, spec, state, options);
				let validation: CompletionValidation;
				let completionOutput = "";
				try {
					const completion = await runRalphSubagent(pi, definition, prompt, (agentId) => {
						return startRalphSubagentStatusTicker(ctx, `implement ${task.activeForm}`, definition.agentName, agentId);
					});
					completionOutput = subagentCompletionOutput(completion);
					validation = validateSubagentCompletion(completion, definition, task, workspaceReport);
				} catch (error) {
					validation = {
						ok: false,
						signal: definition.completionSignal,
						error: `Subagent failed: ${formatError(error)}`,
						output: "",
					};
				}

				if (!validation.ok) {
					const recoveryMode = parsed.recoveryMode || booleanField(state, "recoveryMode") === true;
					const modificationResult = definition.completionSignal === "TASK_COMPLETE"
						? handleTaskModificationRequest(pi, ctx, spec, task, state, completionOutput || validation.output, options)
						: { present: false, applied: false };
					if (modificationResult.present) {
						if (!modificationResult.applied) {
							const reason = modificationResult.error ?? validation.error ?? "Task modification request could not be applied.";
							const blockerPatch = {
								taskIndex: task.index,
								totalTasks: tasks.length,
								taskIteration,
								globalIteration: globalIteration + 1,
								lastSubagentOutput: truncateForPrompt(completionOutput || validation.output, 6000),
							};
							await blockImplementation(ctx, spec, task, reason, options, blockerPatch);
							return;
						}
						state = modificationResult.state ?? state;
						if (modificationResult.summary) completedSummaries.push(modificationResult.summary);
						continue implementationLoop;
					}

					setTaskCheckboxStatus(spec, task.index, false);
					const verificationFailureOutput = completionOutput || validation.output || validation.error || "";
					const verificationFailureEnvelope = definition.completionSignal === "VERIFICATION_PASS"
						? createImplementationVerificationFailureEnvelope(verificationFailureOutput)
						: null;
					let verificationPolicy = verificationFailureEnvelope?.policy
						?? (definition.completionSignal === "VERIFICATION_PASS"
							? createImplementationVerificationRecoveryPolicy(verificationFailureOutput)
							: null);
					let reason = verificationPolicy
						? formatImplementationVerificationRecoveryPolicy(verificationPolicy)
						: validation.error ?? "Subagent completion did not pass coordinator validation.";
					if (definition.completionSignal === "VERIFICATION_PASS" && verificationPolicy?.recoverable) {
						const verificationRecoveryPlan = planImplementationVerificationRecovery({
							state,
							taskId: task.checkboxKey,
							output: verificationFailureOutput,
							policy: verificationPolicy,
						});
						const verificationRecoveryBudget = getImplementationVerificationRecoveryBudget(
							state,
							task.checkboxKey,
							verificationPolicy.category,
						);
						if (verificationRecoveryPlan.shouldRecover && verificationRecoveryPlan.command) {
							if (verificationRecoveryPlan.policy.recoveryAction === "cleanup_artifacts") {
								cleanupStaleImplementationProgressFiles(spec);
							}
							const rerun = rerunImplementationVerifierExactly(verificationRecoveryPlan.command, ctx.cwd);
							const verificationRecoveryAttempt = createImplementationVerificationRecoveryAttempt({
								taskId: task.checkboxKey,
								attempt: verificationRecoveryPlan.nextAttempt,
								category: verificationRecoveryPlan.policy.category,
								action: verificationRecoveryPlan.policy.recoveryAction,
								command: verificationRecoveryPlan.command,
								outcome: rerun.ok
									? "recovered"
									: verificationRecoveryPlan.nextAttempt >= verificationRecoveryBudget.maxAttempts
										? "blocked"
										: "still_failing",
							});
							state = mergeRalphState(
								spec,
								{
									phase: "execution",
									taskIndex: task.index,
									totalTasks: tasks.length,
									taskIteration,
									globalIteration: globalIteration + 1,
									blocked: false,
									validationError: rerun.ok ? null : reason,
									lastSubagentOutput: rerun.ok ? null : truncateForPrompt(rerun.output || verificationFailureOutput, 6000),
									...createImplementationStateDefaults(state, {
										...createImplementationVerificationRecoveryStatePatch({
											state,
											taskId: task.checkboxKey,
											attempt: verificationRecoveryAttempt,
											maxVerificationRecoveryAttempts: verificationRecoveryBudget.maxVerificationRecoveryAttempts,
											maxCleanupRetries: verificationRecoveryBudget.maxCleanupRetries,
										}),
										fixTaskMap: stateRecordField(state, "fixTaskMap"),
										maxFixTasksPerOriginal: numberField(state, "maxFixTasksPerOriginal") ?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASKS_PER_ORIGINAL,
										maxFixTaskDepth: numberField(state, "maxFixTaskDepth") ?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASK_DEPTH,
										modificationMap: stateRecordField(state, "modificationMap"),
										nativeTaskMap: stateRecordField(state, "nativeTaskMap"),
										maxModificationsPerTask: numberField(state, "maxModificationsPerTask") ?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATIONS_PER_TASK,
										maxModificationDepth: numberField(state, "maxModificationDepth") ?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATION_DEPTH,
									}),
									...(rerun.ok ? createRecoveredImplementationStatePatch() : {}),
								},
								options,
							);
							if (rerun.ok) {
								completionOutput = rerun.output;
								validation = validateImplementationTaskCompletion(createImplementationCompletionBridgeInput({
									output: rerun.output,
									signal: definition.completionSignal,
									task,
									hasExpectedFailureProof,
									assessCompletionOutput: (candidateOutput) => assessTaskCompletionOutput(candidateOutput, workspaceReport),
									detectFailureReason: () => detectExplicitFailureReason(rerun.output, definition, workspaceReport)
										?? `Workspace completion output is invalid for ${workspaceReport?.commitMode ?? "unknown"}.`,
								}));
								reason = `verificationRecovery recovered ${task.checkboxKey}: VERIFICATION_PASS after exact verifier rerun ${verificationRecoveryPlan.command}`;
							} else {
								verificationPolicy = createImplementationVerificationRecoveryPolicy(
									rerun.output || verificationFailureOutput,
									verificationRecoveryPlan.nextAttempt,
								);
								reason = formatImplementationVerificationRecoveryPolicy(verificationPolicy);
							}
						}
					}
					const exhausted = taskIteration >= parsed.maxTaskIterations
						|| /USER_INPUT_REQUIRED/.test(validation.output)
						|| (definition.completionSignal === "VERIFICATION_PASS"
							&& verificationPolicy?.recoverable === true
							&& getImplementationVerificationRecoveryBudget(state, task.checkboxKey, verificationPolicy.category).exhausted);
					if (recoveryMode && !exhausted && definition.completionSignal === "TASK_COMPLETE") {
						const recoveryStop = createImplementationRecoveryStopPlan(state, task, completionOutput || validation.output || reason);
						const maxFixTasksPerOriginal = recoveryStop.maxFixTasksPerOriginal;
						const maxFixTaskDepth = recoveryStop.maxFixTaskDepth;
						if (recoveryStop.attempts >= maxFixTasksPerOriginal || recoveryStop.lineageDepth >= maxFixTaskDepth) {
							const stopReason = `${recoveryStop.reason} originalTaskId=${recoveryStop.originalTaskId}; fixTaskIds=${recoveryStop.fixTaskIds.join(",") || "none"}; lineage=${recoveryStop.failedTaskId}; batch=parallel-sequential;`;
							await blockImplementation(ctx, spec, task, stopReason, options, {
								taskIndex: task.index,
								totalTasks: tasks.length,
								taskIteration,
								globalIteration: globalIteration + 1,
								lastSubagentOutput: truncateForPrompt(completionOutput || validation.output, 6000),
								...createImplementationStateDefaults(state, {
									fixTaskMap: stateRecordField(state, "fixTaskMap"),
									maxFixTasksPerOriginal,
									maxFixTaskDepth,
									modificationMap: stateRecordField(state, "modificationMap"),
									nativeTaskMap: stateRecordField(state, "nativeTaskMap"),
									evidence: recoveryStop.evidence,
									maxModificationsPerTask: numberField(state, "maxModificationsPerTask") ?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATIONS_PER_TASK,
									maxModificationDepth: numberField(state, "maxModificationDepth") ?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATION_DEPTH,
								}),
							});
							return;
						}
						const recoveryPlan = createImplementationFixTaskPlan(state, task, completionOutput || validation.output || reason);
						insertTaskBlocks(spec, task, [recoveryPlan.fixTaskBlock], "after");
						const refreshedTasks = readImplementationTasks(spec).tasks;
						const insertedFixTask = refreshedTasks.find((candidate) => candidate.taskNumber === recoveryPlan.fixTaskId);
						const insertedFixTaskIndex = insertedFixTask?.index;
						if (insertedFixTaskIndex === undefined || !insertedFixTask) {
							await blockImplementation(ctx, spec, task, `Recovery mode could not locate inserted fix task ${recoveryPlan.fixTaskId}.`, options, {
								taskIndex: task.index,
								totalTasks: refreshedTasks.length,
								taskIteration,
								globalIteration: globalIteration + 1,
								lastSubagentOutput: truncateForPrompt(completionOutput || validation.output, 6000),
							});
							return;
						}
						state = mergeRalphState(
							spec,
							{
								phase: "execution",
								taskIndex: insertedFixTaskIndex,
								totalTasks: tasks.length + 1,
								taskIteration: 1,
								globalIteration: globalIteration + 1,
								blocked: false,
								validationError: reason,
								lastSubagentOutput: truncateForPrompt(completionOutput || validation.output, 6000),
								...createImplementationStateDefaults(state, {
									fixTaskMap: recoveryPlan.fixTaskMap,
									maxFixTasksPerOriginal: numberField(state, "maxFixTasksPerOriginal") ?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASKS_PER_ORIGINAL,
									maxFixTaskDepth: numberField(state, "maxFixTaskDepth") ?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASK_DEPTH,
									modificationMap: stateRecordField(state, "modificationMap"),
									nativeTaskMap: stateRecordField(state, "nativeTaskMap"),
									evidence: stateRecordField(state, "evidence"),
									maxModificationsPerTask: numberField(state, "maxModificationsPerTask") ?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATIONS_PER_TASK,
									maxModificationDepth: numberField(state, "maxModificationDepth") ?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATION_DEPTH,
								}),
							},
							options,
						);
						state = ensureNativeTaskCardsForImplementation(pi, ctx, spec, options, state, refreshedTasks);
						continue implementationLoop;
					}
					if (exhausted || verificationPolicy || definition.completionSignal === "VERIFICATION_PASS") {
						const blockerPatch = {
							taskIndex: task.index,
							totalTasks: tasks.length,
							taskIteration,
							globalIteration: globalIteration + 1,
							lastSubagentOutput: truncateForPrompt(validation.output, 6000),
						};
						await blockImplementation(ctx, spec, task, reason, options, blockerPatch);
						return;
					}
					appendImplementationRetry(spec, task, reason, options);
					state = mergeRalphState(
						spec,
						{
							phase: "execution",
							taskIndex: task.index,
							totalTasks: tasks.length,
							taskIteration: taskIteration + 1,
							globalIteration: globalIteration + 1,
							blocked: false,
							validationError: reason,
							lastSubagentOutput: truncateForPrompt(validation.output, 6000),
						},
						options,
					);
					continue implementationLoop;
				}

				setTaskCheckboxStatus(spec, task.index, true);
				const coordinatorProgressCommit = appendImplementationProgress(spec, task, definition, validation.evidence ?? "", nativeUpdate.taskId, options);
				try {
					setNativeTaskExecutionStatus(ctx, state, spec, task, "completed", {
						ralphExecutionAgent: definition.agentName,
						ralphExecutionSignal: definition.completionSignal,
						ralphExecutionEvidence: validation.evidence,
					});
				} catch (error) {
					await blockImplementation(ctx, spec, task, `Task completed but native pi-task completion update failed: ${formatError(error)}`, options);
					return;
				}

				const refreshedTasks = readImplementationTasks(spec).tasks;
				const remainingBatchTasks = executionBatch
					.slice(batchPosition + 1)
					.map((taskIndex) => refreshedTasks[taskIndex])
					.filter((candidate): candidate is ParsedNativeTask => Boolean(candidate) && candidate.status !== "completed");
				const following = remainingBatchTasks.length > 0
					? { kind: "batch" as const, task: remainingBatchTasks[0], taskIndices: executionBatch, mode: "parallel-sequential" as const }
					: nextImplementationTask(refreshedTasks, task.index);
				const completedAt = new Date().toISOString();
				const evidenceEntry = {
					signal: definition.completionSignal,
					proof: validation.evidence ?? "",
					agent: definition.agentName,
					completedAt,
				};
				let implementationEvidence = executionBatch.length > 1
					? applyImplementationBatchTaskEvidence(state?.evidence, [{ taskKey: task.checkboxKey, entry: evidenceEntry }])
					: recordImplementationTaskEvidence(state?.evidence, task.checkboxKey, evidenceEntry);
				const priorCompletedTaskIndex = numberField(state, "lastCompletedTaskIndex");
				const priorCompletedTask = typeof priorCompletedTaskIndex === "number" ? refreshedTasks[priorCompletedTaskIndex] : undefined;
				const reviewCheckpoint = createImplementationReviewCheckpoint(task.index, refreshedTasks.length, task, priorCompletedTask);
				if (reviewCheckpoint.required) {
					const reviewIteration = nextImplementationReviewIteration(implementationEvidence);
					const review = await runArtifactReview(pi, ctx, PHASE_DEFINITIONS.tasks, spec, state, reviewIteration, [], options);
					appendArtifactReviewProgress(spec, PHASE_DEFINITIONS.tasks, reviewIteration, review, options);
					appendImplementationReviewProgress(
						spec,
						task,
						review.passed ? "REVIEW_PASS" : "REVIEW_FAIL",
						reviewCheckpoint.reason,
						review.output,
						options,
					);
					const reviewSummary = truncateForPrompt(
						[reviewCheckpoint.reason, review.error, review.output]
							.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
							.join("\n\n"),
						4000,
					);
					implementationEvidence = recordImplementationReviewEvidence(implementationEvidence, {
						taskIndex: task.index,
						status: review.passed ? "REVIEW_PASS" : "REVIEW_FAIL",
						iteration: reviewIteration,
						checkpoint: reviewCheckpoint.checkpoint,
						summary: reviewSummary,
						reviewedAt: new Date().toISOString(),
					});
					if (!review.passed) {
						await blockImplementation(
							ctx,
							spec,
							task,
							`Layer 3 review failed at ${reviewCheckpoint.checkpoint}: ${review.error ?? "Reviewer reported REVIEW_FAIL."}`,
							options,
							{
								phase: "execution",
								taskIndex: task.index,
								totalTasks: refreshedTasks.length,
								taskIteration: 1,
								globalIteration: globalIteration + 1,
								lastCompletedTaskIndex: task.index,
								lastCompletedTaskSignal: definition.completionSignal,
								lastCompletedTaskEvidence: validation.evidence,
								evidence: implementationEvidence,
							},
						);
						return;
					}
				}
				state = mergeRalphState(
					spec,
					{
						phase: following.kind === "complete" ? "completed" : "execution",
						taskIndex: following.kind === "runnable" || following.kind === "batch"
							? following.task.index
							: refreshedTasks.length,
						totalTasks: refreshedTasks.length,
						taskIteration: 1,
						globalIteration: globalIteration + 1,
						...createImplementationStateDefaults(state, {
							maxFixTasksPerOriginal: numberField(state, "maxFixTasksPerOriginal") ?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASKS_PER_ORIGINAL,
							maxFixTaskDepth: numberField(state, "maxFixTaskDepth") ?? IMPLEMENTATION_DEFAULT_MAX_FIX_TASK_DEPTH,
							fixTaskMap: stateRecordField(state, "fixTaskMap"),
							modificationMap: stateRecordField(state, "modificationMap"),
							nativeTaskMap: stateRecordField(state, "nativeTaskMap"),
							evidence: implementationEvidence,
							maxModificationsPerTask: numberField(state, "maxModificationsPerTask") ?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATIONS_PER_TASK,
							maxModificationDepth: numberField(state, "maxModificationDepth") ?? IMPLEMENTATION_DEFAULT_MAX_MODIFICATION_DEPTH,
						}),
						...createRecoveredImplementationStatePatch(state),
						awaitingApproval: false,
						lastCompletedTaskIndex: task.index,
						lastCompletedTaskSignal: definition.completionSignal,
						lastCompletedTaskEvidence: validation.evidence,
						verifiedTaskEvidence: {
							[task.checkboxKey]: {
								signal: definition.completionSignal,
								evidence: validation.evidence,
								agent: definition.agentName,
								completedAt,
								batch: executionBatch.length > 1 ? {
									mode: "parallel-sequential",
									position: batchPosition + 1,
									size: executionBatch.length,
								} : undefined,
							},
						},
					},
					options,
				);
				const progressCommitSummary = coordinatorProgressCommit.committed
					? `; coordinator progress commit ${coordinatorProgressCommit.hash ?? "unknown"}`
					: coordinatorProgressCommit.error
						? `; coordinator progress commit failed: ${coordinatorProgressCommit.error}`
						: "";
				completedSummaries.push(`- Completed task ${task.index + 1}: ${task.subject} (${definition.completionSignal}; ${validation.evidence}${executionBatch.length > 1 ? `; sequential batch ${batchPosition + 1}/${executionBatch.length}` : ""}${progressCommitSummary})`);
			}

		}
	} catch (error) {
		await blockImplementation(ctx, spec, null, formatError(error), options);
	} finally {
		setRalphStatus(ctx);
	}
}

type TriageOutput = "spec-files" | "github-issues" | "both";

type TriageArguments = {
	epicName: string | null;
	goal: string;
	fresh: boolean;
	yes: boolean;
	output: TriageOutput;
	warnings: string[];
	error?: string;
};

type TriageMaterializationResult = {
	directoriesPrepared: number;
	plansWritten: number;
	plansKept: number;
	progressWritten: number;
	progressKept: number;
	statesWritten: number;
	warnings: string[];
};

type MarkdownSpecBlock = {
	name: string;
	heading: string;
	body: string;
	order: number;
};

type TriageGithubChildSync = {
	specName: string;
	result?: GithubIssueSyncResult;
	status: string;
	issueNumber: number | null;
	issueUrl: string | null;
	error?: string;
};

type TriageGithubSyncResult = {
	status: "synced" | "skipped" | "failed";
	repository?: GithubRepository;
	epic?: GithubIssueSyncResult;
	children: TriageGithubChildSync[];
	created: number;
	updated: number;
	warnings: string[];
	skippedReason?: string;
};

type TriageGithubConfirmation =
	| { confirmed: true; confirmedBy: "--yes" | "pi-ui" }
	| {
			confirmed: false;
			confirmedBy: "not-confirmed";
			githubStatus: "confirmation_required";
			reason: string;
	  };

type TriageGithubSkipState = {
	githubStatus: "unavailable" | "confirmation_required";
	confirmedBy: "not-confirmed";
	skippedReason: string;
	warnings: string[];
	children: TriageGithubChildSync[];
};

const TRIAGE_AGENT = "ralph-triage-analyst";
const TRIAGE_OUTPUT_VALUES = new Set<string>(["spec-files", "github-issues", "both"]);

type TriageOutputBehavior = {
	includesSpecFiles: boolean;
	includesGithub: boolean;
};

function describeTriageOutputBehavior(output: unknown): TriageOutputBehavior {
	return {
		includesSpecFiles: output === "spec-files" || output === "both",
		includesGithub: output === "github-issues" || output === "both",
	};
}

function triageOutputIncludesSpecFiles(output: unknown): boolean {
	return describeTriageOutputBehavior(output).includesSpecFiles;
}

function triageOutputIncludesGithub(output: unknown): boolean {
	return describeTriageOutputBehavior(output).includesGithub;
}

function parseTriageArgs(args: string): TriageArguments {
	const warnings: string[] = [];
	let fresh = false;
	let yes = false;
	let output: TriageOutput = "spec-files";
	let cursor = 0;

	while (true) {
		const result = readCommandArgToken(args, cursor);
		if (!result) {
			return {
				epicName: null,
				goal: "",
				fresh,
				yes,
				output,
				warnings,
			};
		}
		if (result.error) return emptyTriageArguments(result.error);

		const token = result.token;
		if (token === "--fresh") {
			fresh = true;
			cursor = result.nextIndex;
			continue;
		}
		if (token === "--yes" || token === "-y") {
			yes = true;
			cursor = result.nextIndex;
			continue;
		}
		if (token === "--output" || token.startsWith("--output=")) {
			let value: string | undefined;
			if (token.includes("=")) {
				value = token.slice(token.indexOf("=") + 1);
				cursor = result.nextIndex;
			} else {
				const valueResult = readCommandArgToken(args, result.nextIndex);
				if (valueResult?.error) return emptyTriageArguments(valueResult.error);
				value = valueResult?.token;
				cursor = valueResult?.nextIndex ?? result.nextIndex;
			}
			if (!value || value.startsWith("--")) return emptyTriageArguments("--output requires spec-files, github-issues, or both.");
			if (!TRIAGE_OUTPUT_VALUES.has(value)) return emptyTriageArguments(`Invalid --output value '${value}'. Use spec-files, github-issues, or both.`);
			output = value as TriageOutput;
			continue;
		}
		if (token.startsWith("--")) return emptyTriageArguments(`Unknown option: ${token}`);

		return {
			epicName: token || null,
			goal: args.slice(result.nextIndex).trim(),
			fresh,
			yes,
			output,
			warnings,
		};
	}
}

function emptyTriageArguments(error: string): TriageArguments {
	return {
		epicName: null,
		goal: "",
		fresh: false,
		yes: false,
		output: "spec-files",
		warnings: [],
		error,
	};
}

function triageDependencyError(pi: ExtensionAPI, cwd: string, bootstrapResult?: RalphAgentBootstrapResult): string | null {
	const toolError = activeToolDependencyError(pi, ["Agent"], "ralph-triage", "@tintinweb/pi-subagents");
	if (toolError) return toolError;

	return ralphAgentDefinitionError(cwd, [TRIAGE_AGENT], bootstrapResult);
}

function formatTriageUsage(): string {
	return "Usage: /ralph-triage [--fresh] [--output spec-files|github-issues|both] [--yes] <epic-name> <goal>";
}

function epicCompletionCandidates(options: RalphPathOptions = {}): RalphCompletionItem[] {
	return listEpics({ ...options, allowMissingConfiguredRoots: true }).map((epic) => ({
		value: epic.name,
		label: epic.name,
		description: epic.path,
	}));
}

function epicArgumentCompletions(prefix: string) {
	try {
		return completeArgumentToken(prefix, epicCompletionCandidates());
	} catch {
		return null;
	}
}

const TRIAGE_OUTPUT_COMPLETIONS: RalphCompletionItem[] = [
	{ value: "spec-files", label: "spec-files", description: "Write epic and child spec files only" },
	{ value: "github-issues", label: "github-issues", description: "Create/update GitHub issues only after confirmation" },
	{ value: "both", label: "both", description: "Write child spec files and sync GitHub issues" },
];

function triageArgumentCompletions(prefix: string) {
	try {
		return completeOptionValues(prefix, "--output", TRIAGE_OUTPUT_COMPLETIONS) ?? completeArgumentToken(prefix, [
			flagItem("--fresh", "Regenerate epic artifacts and state"),
			flagItem("--output", "Choose spec-files, github-issues, or both"),
			flagItem("--yes", "Confirm GitHub issue writes for noninteractive runs"),
			flagItem("-y", "Alias for --yes"),
			...epicCompletionCandidates(),
		]);
	} catch {
		return null;
	}
}

function epicStatusArgumentCompletions(prefix: string) {
	try {
		return completeArgumentToken(prefix, [
			flagItem("--json", "Print normalized epic state JSON"),
			flagItem("--repair", "Repair missing child stubs and stale activeSpec"),
			...epicCompletionCandidates(),
		]);
	} catch {
		return null;
	}
}

function epicNextArgumentCompletions(prefix: string) {
	try {
		return completeArgumentToken(prefix, [
			flagItem("--peek", "Preview the next child without changing state"),
			flagItem("--dry-run", "Alias for --peek"),
			flagItem("--switch", "Also set .current-spec after selecting"),
			flagItem("--switch-spec", "Alias for --switch"),
			flagItem("--no-switch", "Keep the current spec marker unchanged"),
			flagItem("--start", "Delegate directly to /ralph-start --next-epic-spec"),
			...epicCompletionCandidates(),
		]);
	} catch {
		return null;
	}
}

function epicCancelArgumentCompletions(prefix: string) {
	try {
		return completeArgumentToken(prefix, [
			flagItem("--delete-child-specs", "Also request child spec directory deletion after typed confirmation"),
			flagItem("--delete-children", "Alias for --delete-child-specs"),
			flagItem("--delete-specs", "Alias for --delete-child-specs"),
			...epicCompletionCandidates(),
		]);
	} catch {
		return null;
	}
}

function formatAvailableEpics(epics: CurrentEpic[], options: RalphPathOptions, activeEpicName: string | null): string {
	const root = getSpecRoots({ ...options, allowMissingConfiguredRoots: true })[0];
	const lines = [`Available epics in ${root.path}/_epics:`];
	if (!root.exists) {
		lines.push("  (spec root missing)");
		return lines.join("\n");
	}
	if (epics.length === 0) {
		lines.push("  (none)");
		return lines.join("\n");
	}
	for (const epic of epics) {
		const active = epic.name === activeEpicName ? " [ACTIVE]" : "";
		lines.push(`  - ${epic.name}${active} - ${epic.path}`);
	}
	return lines.join("\n");
}

function resolveExistingEpic(reference: string, options: RalphPathOptions): { epic?: CurrentEpic; error?: string } {
	const name = reference.trim();
	if (!name) return { error: "Epic name is required." };
	if (!isValidSpecName(name)) return { error: `Invalid epic name '${name}'. Use kebab-case like 'auth-system'.` };

	const epic = resolveEpicDirectory(name, options);
	if (!epic.exists) {
		const epics = listEpics({ ...options, allowMissingConfiguredRoots: true });
		return { error: [`Epic '${name}' not found.`, "", formatAvailableEpics(epics, options, readCurrentEpicName(options))].join("\n") };
	}
	return { epic };
}

function resolveEpicCommandTarget(reference: string | null, options: RalphPathOptions): { epic?: CurrentEpic; error?: string } {
	if (reference) return resolveExistingEpic(reference, options);

	const currentName = readCurrentEpicName(options);
	if (!currentName) {
		const epics = listEpics({ ...options, allowMissingConfiguredRoots: true });
		return { error: ["No active epic is set. Pass an epic name or run /ralph-epic-switch <epic>.", "", formatAvailableEpics(epics, options, null)].join("\n") };
	}
	return resolveExistingEpic(currentName, options);
}

function resolveEpicCancelTarget(reference: string | null, options: RalphPathOptions): { epic?: CurrentEpic; error?: string } {
	if (reference) return resolveExistingEpic(reference, options);

	const currentName = readCurrentEpicName(options);
	if (!currentName) {
		const epics = listEpics({ ...options, allowMissingConfiguredRoots: true });
		return { error: ["No active epic is set. Pass an epic name to cancel a specific epic.", "", formatAvailableEpics(epics, options, null)].join("\n") };
	}
	if (!isValidSpecName(currentName)) return { error: `Invalid epic name '${currentName}' in .current-epic. Remove or fix the marker before cancelling.` };
	return { epic: resolveEpicDirectory(currentName, options) };
}

async function selectEpic(ctx: ExtensionCommandContext, epics: CurrentEpic[], activeEpicName: string | null): Promise<CurrentEpic | null> {
	if (!ctx.hasUI) return null;

	const labels = epics.map((epic, index) => {
		const active = epic.name === activeEpicName ? " [ACTIVE]" : "";
		return `${index + 1}. ${epic.name}${active} - ${epic.path}`;
	});
	const selected = await ctx.ui.select("Switch to epic", labels);
	if (!selected) return null;

	const selectedIndex = labels.indexOf(selected);
	return selectedIndex >= 0 ? epics[selectedIndex] : null;
}

function formatActiveEpic(currentName: string | null, currentEpic: CurrentEpic | null): string {
	if (!currentName) return "none";
	if (!currentEpic) return `${currentName} (unresolved)`;
	return currentEpic.exists ? `${currentEpic.name} (${currentEpic.path})` : `${currentName} (missing at ${currentEpic.path})`;
}

function epicProgressText(state: EpicState, completedCount: number): string {
	const total = Array.isArray(state.specs) ? state.specs.length : 0;
	return `${completedCount}/${total} specs completed`;
}

function epicValidationWarnings(state: EpicState): string[] {
	const warnings = state.validation?.warnings;
	return Array.isArray(warnings) ? warnings.filter((warning): warning is string => typeof warning === "string") : [];
}

function formatEpicDependencyReason(entry: EpicSpecDependencyStatus): string {
	if (entry.isExplicitlyBlocked) return entry.spec.blockedReason ?? "explicitly blocked";
	const waitingOn = [...entry.unmetDependencies, ...entry.missingDependencies];
	return waitingOn.length > 0 ? `waiting on ${waitingOn.join(", ")}` : "dependencies met";
}

function formatEpicSpecStatusLine(entry: EpicSpecDependencyStatus, state: EpicState, currentSpecAbsolutePath: string | null, options: RalphPathOptions): string {
	const child = childSpecEntryForEpicSpec(entry.spec, options);
	const markers: string[] = [];
	if (state.activeSpec === entry.name) markers.push("ACTIVE");
	if (child.absolutePath === currentSpecAbsolutePath) markers.push("CURRENT SPEC");

	const markerText = markers.length > 0 ? ` [${markers.join(", ")}]` : "";
	const orderText = Number.isFinite(entry.order) ? `#${entry.order}` : "unordered";
	const dependencies = entry.dependencies.length > 0 ? entry.dependencies.join(", ") : "none";
	const goal = typeof entry.spec.goal === "string" && entry.spec.goal.trim() ? ` - ${entry.spec.goal.trim()}` : "";
	const blocked = entry.isDependencyBlocked || entry.isExplicitlyBlocked ? ` (${formatEpicDependencyReason(entry)})` : "";
	return `- [${entry.status}] ${entry.name}${markerText} (${orderText}; deps: ${dependencies})${blocked}${goal}`;
}

function parseEpicStatusArgs(args: string): EpicStatusArguments {
	const tokenized = tokenizeCommandArgs(args);
	if (tokenized.error) return { reference: null, json: false, repair: false, error: tokenized.error };

	const references: string[] = [];
	let json = false;
	let repair = false;
	for (const token of tokenized.tokens) {
		if (token === "--json") {
			json = true;
			continue;
		}
		if (token === "--repair") {
			repair = true;
			continue;
		}
		if (token.startsWith("--")) return { reference: null, json, repair, error: `Unknown option: ${token}` };
		references.push(token);
	}

	if (json && repair) return { reference: null, json, repair, error: "Use either --json or --repair with /ralph-epic-status, not both." };
	if (references.length > 1) return { reference: null, json, repair, error: `Expected at most one epic name, got: ${references.join(" ")}` };
	return { reference: references[0] ?? null, json, repair };
}

function epicWarningsForStatus(stateRead: SafeEpicStateRead, state: EpicState, summary: ReturnType<typeof computeEpicDependencyStatus>): string[] {
	return unique([...(stateRead.warnings ?? []), ...epicValidationWarnings(state), ...summary.validation.warnings]);
}

function normalizedEpicChildForJson(entry: EpicSpecDependencyStatus, options: RalphPathOptions): Record<string, unknown> {
	const paths = normalizedEpicChildPathFields(entry.name, entry.spec.path, entry.spec.planPath, options);
	return {
		name: entry.name,
		goal: typeof entry.spec.goal === "string" ? entry.spec.goal : "",
		status: entry.status,
		order: Number.isFinite(entry.order) ? entry.order : null,
		path: paths.path,
		planPath: paths.planPath,
		dependencies: entry.dependencies,
		size: typeof entry.spec.size === "string" ? entry.spec.size : null,
		acceptanceCriteria: normalizeStringList(entry.spec.acceptanceCriteria),
		interfaceContracts: normalizeInterfaceContracts(entry.spec.interfaceContracts),
		startedAt: typeof entry.spec.startedAt === "string" ? entry.spec.startedAt : null,
		completedAt: typeof entry.spec.completedAt === "string" ? entry.spec.completedAt : null,
		blockedReason: typeof entry.spec.blockedReason === "string" ? entry.spec.blockedReason : null,
		issueNumber: typeof entry.spec.issueNumber === "number" ? entry.spec.issueNumber : null,
		issueUrl: typeof entry.spec.issueUrl === "string" ? entry.spec.issueUrl : null,
		githubStatus: typeof entry.spec.githubStatus === "string" ? entry.spec.githubStatus : null,
		readiness: {
			isReady: entry.isReady,
			isExplicitlyBlocked: entry.isExplicitlyBlocked,
			isDependencyBlocked: entry.isDependencyBlocked,
			completedDependencies: entry.completedDependencies,
			unmetDependencies: entry.unmetDependencies,
			missingDependencies: entry.missingDependencies,
			reason: entry.isReady ? "ready" : formatEpicDependencyReason(entry),
		},
	};
}

function normalizedEpicStateForJson(epic: CurrentEpic, state: EpicState, summary: ReturnType<typeof computeEpicDependencyStatus>, options: RalphPathOptions): Record<string, unknown> {
	const storedActiveSpec = typeof state.activeSpec === "string" && state.activeSpec.trim() ? state.activeSpec.trim() : null;
	const activeSpec = repairedActiveSpecValue(state, summary);
	return {
		schemaVersion: Number.isFinite(state.schemaVersion) ? state.schemaVersion : EPIC_SCHEMA_VERSION,
		name: typeof state.name === "string" && state.name.trim() ? state.name : epic.name,
		goal: typeof state.goal === "string" ? state.goal : "",
		status: typeof state.status === "string" ? state.status : "draft",
		derivedStatus: deriveEpicStatus(state),
		phase: typeof state.phase === "string" ? state.phase : "unknown",
		output: typeof state.output === "string" ? state.output : null,
		basePath: typeof state.basePath === "string" ? state.basePath : epic.path,
		epicPath: typeof state.epicPath === "string" ? state.epicPath : `${epic.path}/epic.md`,
		researchPath: typeof state.researchPath === "string" ? state.researchPath : `${epic.path}/research.md`,
		progressPath: typeof state.progressPath === "string" ? state.progressPath : `${epic.path}/.progress.md`,
		createdAt: typeof state.createdAt === "string" ? state.createdAt : null,
		updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : null,
		activeSpec,
		storedActiveSpec,
		activeSpecStale: storedActiveSpec !== activeSpec,
		lastCompletedSpec: typeof state.lastCompletedSpec === "string" && state.lastCompletedSpec.trim() ? state.lastCompletedSpec : null,
		issueNumber: typeof state.issueNumber === "number" ? state.issueNumber : null,
		issueUrl: typeof state.issueUrl === "string" ? state.issueUrl : null,
		githubStatus: typeof state.githubStatus === "string" ? state.githubStatus : null,
		github: isRecordValue(state.github) ? state.github : null,
		specs: summary.specs.map((entry) => normalizedEpicChildForJson(entry, options)),
		contracts: normalizeInterfaceContracts(state.contracts),
		validation: {
			valid: summary.validation.valid,
			warnings: summary.validation.warnings,
			missingDependencies: summary.validation.missingDependencies,
			cycles: summary.validation.cycles,
			duplicateOrders: summary.validation.duplicateOrders,
			storedWarnings: epicValidationWarnings(state),
		},
	};
}

function epicReadinessForJson(state: EpicState, summary: ReturnType<typeof computeEpicDependencyStatus>): Record<string, unknown> {
	const blockedSpecs = summary.specs
		.filter((entry) => entry.isDependencyBlocked || entry.isExplicitlyBlocked)
		.map((entry) => ({ name: entry.name, reason: formatEpicDependencyReason(entry) }));
	const storedActiveSpec = typeof state.activeSpec === "string" && state.activeSpec.trim() ? state.activeSpec.trim() : null;
	const activeSpec = repairedActiveSpecValue(state, summary);
	return {
		derivedStatus: deriveEpicStatus(state),
		progress: {
			completed: summary.completedSpecs.length,
			total: summary.specs.length,
		},
		activeSpec,
		storedActiveSpec,
		activeSpecStale: storedActiveSpec !== activeSpec,
		nextSpec: summary.nextSpec?.name ?? null,
		readySpecs: summary.readySpecs.map((spec) => spec.name),
		inProgressSpecs: summary.inProgressSpecs.map((spec) => spec.name),
		completedSpecs: summary.completedSpecs.map((spec) => spec.name),
		blockedSpecs,
		validation: {
			valid: summary.validation.valid,
			warnings: summary.validation.warnings,
			missingDependencies: summary.validation.missingDependencies,
			cycles: summary.validation.cycles,
			duplicateOrders: summary.validation.duplicateOrders,
		},
	};
}

function formatEpicStatusJson(epic: CurrentEpic, stateRead: SafeEpicStateRead, options: RalphPathOptions): string {
	const currentEpicName = readCurrentEpicName(options);
	const base = {
		schemaVersion: EPIC_SCHEMA_VERSION,
		currentEpic: currentEpicName,
		showingEpic: {
			name: epic.name,
			path: epic.path,
			statePath: stateRead.path,
			isCurrent: currentEpicName === epic.name,
		},
		currentSpec: readCurrentSpecValue(options),
	};

	if (!stateRead.state) {
		return JSON.stringify({
			...base,
			state: null,
			readiness: null,
			warnings: stateRead.warnings.length > 0 ? stateRead.warnings : ["Missing .epic-state.json"],
		}, null, 2);
	}

	const state = stateRead.state;
	const summary = computeEpicDependencyStatus(state);
	return JSON.stringify({
		...base,
		state: normalizedEpicStateForJson(epic, state, summary, options),
		readiness: epicReadinessForJson(state, summary),
		warnings: epicWarningsForStatus(stateRead, state, summary),
	}, null, 2);
}

function repairedActiveSpecValue(state: EpicState, summary: ReturnType<typeof computeEpicDependencyStatus>): string | null {
	const activeName = typeof state.activeSpec === "string" && state.activeSpec.trim() ? state.activeSpec.trim() : null;
	const activeEntry = activeName ? summary.specs.find((entry) => entry.name === activeName) : undefined;
	if (activeEntry?.status === "in_progress") return activeEntry.name;
	return summary.specs.find((entry) => entry.status === "in_progress")?.name ?? null;
}

function sameStringArray(left: string[], right: string[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}

function validationNeedsRepair(state: EpicState, validationWarnings: string[]): boolean {
	const storedWarnings = epicValidationWarnings(state);
	return !isRecordValue(state.validation)
		|| typeof state.validation.lastValidatedAt !== "string"
		|| !sameStringArray(storedWarnings, validationWarnings);
}

function repairEpicStateMetadata(epic: CurrentEpic, state: EpicState, summary: ReturnType<typeof computeEpicDependencyStatus>, options: RalphPathOptions, changes: string[]): EpicState {
	let nextState = state;
	const now = new Date().toISOString();
	const specs = Array.isArray(nextState.specs) ? nextState.specs : [];
	const compatibilityWarnings = normalizeEpicCompatibilityWarnings(
		isRecordValue(state.validation) ? state.validation.compatibilityWarnings : [],
	);
	let pathMetadataChanged = false;
	const normalizedSpecs = specs.map((spec) => {
		if (!isRecordValue(spec) || typeof spec.name !== "string" || !isValidSpecName(spec.name)) return spec;
		const paths = normalizedEpicChildPathFields(spec.name, spec.path, spec.planPath, options);
		const currentPath = typeof spec.path === "string" && spec.path.trim() ? spec.path.trim() : "";
		const currentPlanPath = typeof spec.planPath === "string" && spec.planPath.trim() ? spec.planPath.trim() : "";
		if (currentPath === paths.path && currentPlanPath === paths.planPath) return spec;
		pathMetadataChanged = true;
		changes.push(`Repaired child path metadata for ${spec.name}: path ${currentPath || "none"} -> ${paths.path}; planPath ${currentPlanPath || "none"} -> ${paths.planPath}`);
		return { ...spec, path: paths.path, planPath: paths.planPath } as EpicChildSpec;
	});
	if (pathMetadataChanged) {
		nextState = {
			...nextState,
			specs: normalizedSpecs as EpicChildSpec[],
			updatedAt: now,
		};
	}
	const currentActive = typeof state.activeSpec === "string" && state.activeSpec.trim() ? state.activeSpec.trim() : null;
	const repairedActive = repairedActiveSpecValue(state, summary);
	if (currentActive !== repairedActive) {
		nextState = {
			...nextState,
			activeSpec: repairedActive,
			updatedAt: now,
		};
		changes.push(`Repaired activeSpec: ${currentActive ?? "none"} -> ${repairedActive ?? "none"}`);
	}

	const validationWarnings = summary.validation.warnings;
	if (validationNeedsRepair(nextState, validationWarnings)) {
		nextState = {
			...nextState,
			updatedAt: now,
			validation: {
				...(isRecordValue(nextState.validation) ? nextState.validation : {}),
				warnings: validationWarnings,
				lastValidatedAt: now,
			},
		};
		changes.push(`Updated dependency validation (${validationWarnings.length} warning${validationWarnings.length === 1 ? "" : "s"})`);
	}

	if (compatibilityWarnings.length > 0) {
		changes.push(`Persisted compatibility repair into EpicStateV1 (${compatibilityWarnings.length} compatibility warning${compatibilityWarnings.length === 1 ? "" : "s"})`);
	}

	if (nextState !== state || compatibilityWarnings.length > 0) {
		writeEpicState(epic, nextState, options);
	}
	return nextState;
}

function repairEpicChildStubs(epic: CurrentEpic, state: EpicState, options: RalphPathOptions, changes: string[], warnings: string[]): boolean {
	let changed = false;
	const epicMarkdown = readFileIfExists(epicMarkdownPath(epic));
	const specs = Array.isArray(state.specs) ? state.specs : [];
	for (const spec of specs) {
		if (!isValidSpecName(spec.name)) {
			warnings.push(`Skipped invalid child spec name: ${spec.name}`);
			continue;
		}

		const child = childSpecEntryForEpicSpec(spec, options);
		if (!existsSync(child.absolutePath)) {
			mkdirSync(child.absolutePath, { recursive: true });
			changes.push(`Created child spec directory: ${child.path}`);
			changed = true;
		}

		const planPath = join(child.absolutePath, "plan.md");
		if (!existsSync(planPath) || !readFileIfExists(planPath).trim()) {
			atomicWriteCoordinatorText(planPath, buildChildPlan(epic, state, spec, epicMarkdown));
			changes.push(`Wrote missing child plan stub: ${child.path}/plan.md`);
			changed = true;
		}

		const progressPath = getProgressPath(child, options);
		if (!existsSync(progressPath) || !readProgress(child, options).trim()) {
			writeProgress(child, buildChildProgressStub(state, spec, child), options);
			changes.push(`Wrote missing child progress stub: ${child.path}/.progress.md`);
			changed = true;
		}

		const childStatePath = getRalphStatePath(child, options);
		if (!existsSync(childStatePath)) {
			mergeRalphState(child, childSpecStatePatch(epic, state, spec, child, null), options);
			changes.push(`Wrote missing child state stub: ${child.path}/.ralph-state.json`);
			changed = true;
		} else {
			try {
				readRalphState(child, options);
			} catch (error) {
				warnings.push(`Skipped invalid child state for '${spec.name}': ${formatError(error)}`);
			}
		}
	}
	return changed;
}

function repairEpicStatus(epic: CurrentEpic, stateRead: SafeEpicStateRead, options: RalphPathOptions): EpicRepairResult {
	const changes: string[] = [];
	const warnings: string[] = [...stateRead.warnings];
	if (!stateRead.state) {
		return { changes, warnings: warnings.length > 0 ? warnings : ["Missing .epic-state.json"], validationWarnings: [], stateChanged: false, childFilesChanged: false };
	}

	const summary = computeEpicDependencyStatus(stateRead.state);
	const state = repairEpicStateMetadata(epic, stateRead.state, summary, options, changes);
	const childFilesChanged = repairEpicChildStubs(epic, state, options, changes, warnings);
	return {
		changes,
		warnings: unique([...warnings, ...epicWarningsForStatus({ ...stateRead, state }, state, computeEpicDependencyStatus(state))]),
		validationWarnings: summary.validation.warnings,
		stateChanged: state !== stateRead.state,
		childFilesChanged,
	};
}

function formatEpicRepairMessage(epic: CurrentEpic, stateRead: SafeEpicStateRead, result: EpicRepairResult): { message: string; type: "info" | "warning" } {
	const lines = [
		"# Ralph Epic Repair",
		"",
		`Epic: ${epic.name} (${epic.path})`,
		`State: ${stateRead.path}`,
		"",
		"Changes:",
	];
	if (result.changes.length === 0) {
		lines.push("- No repairs needed.");
	} else {
		lines.push(...result.changes.map((change) => `- ${change}`));
	}

	lines.push(
		"",
		"Summary:",
		`- State changed: ${result.stateChanged ? "yes" : "no"}`,
		`- Child files changed: ${result.childFilesChanged ? "yes" : "no"}`,
		"",
		"Dependency graph:",
	);
	if (result.validationWarnings.length === 0) {
		lines.push("- Valid: no dependency warnings.");
	} else {
		lines.push(`- Warnings: ${result.validationWarnings.length}`, ...result.validationWarnings.map((warning) => `  - ${warning}`));
	}

	if (result.warnings.length > 0) {
		lines.push("", "Warnings:", ...result.warnings.map((warning) => `- ${warning}`));
	}
	lines.push("", `Next command: /ralph-epic-status ${epic.name}`);
	return { message: lines.join("\n"), type: result.warnings.length > 0 ? "warning" : "info" };
}

function formatEpicStatusMessage(epic: CurrentEpic, stateRead: SafeEpicStateRead, options: RalphPathOptions): { message: string; type: "info" | "warning" } {
	const currentEpicName = readCurrentEpicName(options);
	const currentEpic = currentEpicName ? resolveEpicDirectory(currentEpicName, options) : null;
	const currentSpec = currentSpecPath(options);
	const lines = [
		"# Ralph Epic Status",
		"",
		`Current epic: ${formatActiveEpic(currentEpicName, currentEpic)}`,
		`Showing epic: ${epic.name} (${epic.path})`,
		`State: ${stateRead.path}`,
	];

	if (!stateRead.state) {
		lines.push("Status: unavailable", "", "Warnings:", ...(stateRead.warnings.length > 0 ? stateRead.warnings.map((warning) => `- ${warning}`) : ["- Missing .epic-state.json"]), "", `Next command: /ralph-triage --fresh ${epic.name} <goal>`);
		return { message: lines.join("\n"), type: "warning" };
	}

	const state = stateRead.state;
	const summary = computeEpicDependencyStatus(state);
	const warnings = unique([...(stateRead.warnings ?? []), ...epicValidationWarnings(state), ...summary.validation.warnings]);
	const inProgress = summary.inProgressSpecs[0] ?? (state.activeSpec && Array.isArray(state.specs) ? state.specs.find((spec) => spec.name === state.activeSpec) : undefined);
	const next = summary.nextSpec;

	lines.push(
		`Epic status: ${state.status}`,
		`Phase: ${state.phase ?? "unknown"}`,
		`Goal: ${state.goal ?? ""}`,
		`Progress: ${epicProgressText(state, summary.completedSpecs.length)}`,
		`Active child spec: ${state.activeSpec ?? "none"}`,
		`Current spec: ${readCurrentSpecValue(options) ?? "none"}`,
		"",
		"## Child spec statuses",
	);

	if (summary.specs.length === 0) {
		lines.push("No child specs found in .epic-state.json.");
	} else {
		for (const entry of summary.specs) lines.push(formatEpicSpecStatusLine(entry, state, currentSpec, options));
	}

	lines.push("", "## Unblocked specs");
	const unblocked = summary.specs.filter((entry) => entry.isReady || entry.status === "in_progress");
	if (unblocked.length === 0) {
		lines.push("- None");
	} else {
		for (const entry of unblocked) lines.push(`- ${entry.name} (${entry.status === "in_progress" ? "in progress" : "ready"})`);
	}

	lines.push("", "## Blocked specs");
	const blocked = summary.specs.filter((entry) => entry.isDependencyBlocked || entry.isExplicitlyBlocked);
	if (blocked.length === 0) {
		lines.push("- None");
	} else {
		for (const entry of blocked) lines.push(`- ${entry.name}: ${formatEpicDependencyReason(entry)}`);
	}

	if (warnings.length > 0) {
		lines.push("", "Warnings:", ...warnings.map((warning) => `- ${warning}`));
	}

	lines.push("", "Next command:");
	if (state.status === "completed") {
		lines.push("- Epic is complete.");
	} else if (state.status === "cancelled") {
		lines.push(`- Epic is cancelled. To inspect it again: /ralph-epic-status ${epic.name}`);
	} else if (inProgress) {
		lines.push(`- Continue active child spec: /ralph-start ${inProgress.name}`);
	} else if (next) {
		lines.push(`- Select next child spec: /ralph-start --next-epic-spec`, `- Or start through epic next: /ralph-epic-next --start`);
	} else {
		lines.push("- No unblocked child spec is ready. Resolve blockers or complete dependencies, then rerun /ralph-epic-status.");
	}

	return { message: lines.join("\n"), type: warnings.length > 0 ? "warning" : "info" };
}

function formatEpicSwitchSummary(epic: CurrentEpic, stateRead: SafeEpicStateRead, options: RalphPathOptions): string {
	const lines = [
		`Switched to epic: ${epic.name}`,
		"",
		`Location: ${epic.path}`,
		`Current marker: ${epic.name}`,
		`State: ${stateRead.path}`,
	];

	if (!stateRead.state) {
		lines.push("Status: unavailable", ...stateRead.warnings.map((warning) => `Warning: ${warning}`), "", `Next: run /ralph-triage --fresh ${epic.name} <goal> to regenerate state.`);
		return lines.join("\n");
	}

	const summary = computeEpicDependencyStatus(stateRead.state);
	lines.push(
		`Epic status: ${stateRead.state.status}`,
		`Progress: ${epicProgressText(stateRead.state, summary.completedSpecs.length)}`,
		`Next unblocked child spec: ${summary.nextSpec?.name ?? "none"}`,
		"",
		"Next: run /ralph-epic-status, /ralph-start --next-epic-spec, or /ralph-epic-next --start.",
	);
	if (stateRead.warnings.length > 0) lines.push("", "Warnings:", ...stateRead.warnings.map((warning) => `- ${warning}`));
	return lines.join("\n");
}

function parseEpicNextArgs(args: string): EpicNextArguments {
	const tokenized = tokenizeCommandArgs(args);
	if (tokenized.error) return { reference: null, switchSpec: false, startSpec: false, peek: false, error: tokenized.error };

	const references: string[] = [];
	let switchSpec = false;
	let startSpec = false;
	let peek = false;
	for (const token of tokenized.tokens) {
		if (token === "--switch" || token === "--switch-spec") {
			switchSpec = true;
			continue;
		}
		if (token === "--start") {
			startSpec = true;
			continue;
		}
		if (token === "--no-switch") {
			switchSpec = false;
			continue;
		}
		if (token === "--peek" || token === "--dry-run") {
			peek = true;
			continue;
		}
		if (token.startsWith("--")) return { reference: null, switchSpec, startSpec, peek, error: `Unknown option: ${token}` };
		references.push(token);
	}

	if (references.length > 1) return { reference: null, switchSpec, startSpec, peek, error: `Expected at most one epic name, got: ${references.join(" ")}` };
	return { reference: references[0] ?? null, switchSpec, startSpec, peek };
}

function parseEpicCancelArgs(args: string): EpicCancelArguments {
	const tokenized = tokenizeCommandArgs(args);
	if (tokenized.error) return { reference: null, deleteChildSpecs: false, error: tokenized.error };

	const references: string[] = [];
	let deleteChildSpecs = false;
	for (const token of tokenized.tokens) {
		if (token === "--delete-child-specs" || token === "--delete-children" || token === "--delete-specs") {
			deleteChildSpecs = true;
			continue;
		}
		if (token.startsWith("--")) return { reference: null, deleteChildSpecs, error: `Unknown option: ${token}` };
		references.push(token);
	}

	if (references.length > 1) return { reference: null, deleteChildSpecs, error: `Expected at most one epic name, got: ${references.join(" ")}` };
	return { reference: references[0] ?? null, deleteChildSpecs };
}

function formatEpicCancelConfirmation(epic: CurrentEpic, stateRead: SafeEpicStateRead, willDeleteChildSpecs: boolean, options: RalphPathOptions): string {
	const currentMarker = readCurrentEpicName(options) === epic.name ? "yes" : "no";
	const childCount = stateRead.state && Array.isArray(stateRead.state.specs) ? stateRead.state.specs.length : 0;
	return [
		`Epic: ${epic.name}`,
		`Location: ${epic.path}`,
		`State file: ${stateRead.path}`,
		`Active marker points here: ${currentMarker}`,
		`Child specs tracked: ${childCount}`,
		"",
		...formatEpicStateBeforeCancel(stateRead),
		"",
		"This cancels epic orchestration: it marks readable epic state cancelled, clears activeSpec, and clears .current-epic if it points to this epic.",
		willDeleteChildSpecs ? "You also requested permanent deletion of child spec directories after an additional typed confirmation." : "Child spec directories will be kept.",
		"Choose OK only if you want to stop this epic's current Ralph run.",
	].join("\n");
}

function formatEpicStateBeforeCancel(stateRead: SafeEpicStateRead): string[] {
	if (!stateRead.state) return ["State before cancellation: unavailable"];
	const summary = computeEpicDependencyStatus(stateRead.state);
	return [
		"State before cancellation:",
		`- Epic status: ${stateRead.state.status}`,
		`- Phase: ${stateRead.state.phase ?? "unknown"}`,
		`- Active child spec: ${stateRead.state.activeSpec ?? "none"}`,
		`- Progress: ${epicProgressText(stateRead.state, summary.completedSpecs.length)}`,
	];
}

function cancelEpicState(epic: CurrentEpic, state: EpicState | null, options: RalphPathOptions): boolean {
	if (!state) return false;
	writeEpicState(epic, {
		...state,
		status: "cancelled",
		phase: "cancelled",
		activeSpec: null,
		updatedAt: new Date().toISOString(),
	}, options);
	return true;
}

async function maybeDeleteEpicChildSpecs(ctx: ExtensionCommandContext, state: EpicState | null, options: RalphPathOptions): Promise<string[]> {
	if (!state || !Array.isArray(state.specs) || state.specs.length === 0) return ["- Skipped child spec directory delete: no child specs in readable epic state."];
	if (!ctx.hasUI) return ["- Skipped child spec directory delete: Pi UI confirmation is required."];

	const childNames = state.specs.map((spec) => spec.name).filter((name): name is string => typeof name === "string");
	const listedChildren = childNames.slice(0, 12).map((name) => `- ${name}`);
	if (childNames.length > listedChildren.length) listedChildren.push(`- ...and ${childNames.length - listedChildren.length} more`);
	const confirmed = await ctx.ui.confirm(
		"Delete epic child spec directories?",
		[
			`Permanently delete ${state.specs.length} child spec director${state.specs.length === 1 ? "y" : "ies"} for epic '${state.name}'?`,
			"",
			...listedChildren,
			"",
			"This removes child spec files and cannot be undone. The epic record will be kept.",
		].join("\n"),
	);
	if (!confirmed) return ["- Skipped child spec directory delete: user cancelled."];

	const typed = await ctx.ui.input("Confirm child spec deletion", `type ${state.name} to delete child specs`);
	if (typed?.trim() !== state.name) return ["- Skipped child spec directory delete: typed confirmation did not match epic name."];

	const results: string[] = [];
	for (const spec of state.specs) {
		if (!isValidSpecName(spec.name)) {
			results.push(`- Skipped invalid child spec name: ${spec.name}`);
			continue;
		}
		const child = childSpecEntry(spec.name, options);
		const safetyError = specDeleteSafetyError(child, options);
		if (safetyError) {
			results.push(`- Skipped ${spec.name}: ${safetyError}`);
			continue;
		}
		rmSync(child.absolutePath, { recursive: true, force: true });
		results.push(`- Deleted child spec directory: ${child.path}`);
	}
	return results;
}

function formatEpicNextSummary(
	epic: CurrentEpic,
	state: EpicState,
	summary: ReturnType<typeof computeEpicDependencyStatus>,
	spec: EpicChildSpec,
	updated: boolean,
	switchedValue: string | null,
	warnings: string[],
): string {
	const lines = [
		`${updated ? "Selected" : "Next unblocked"} child spec for epic '${epic.name}': ${spec.name}`,
		"",
		`Epic progress: ${epicProgressText(state, summary.completedSpecs.length)}`,
		`Goal: ${spec.goal ?? ""}`,
		`Dependencies: ${spec.dependencies && spec.dependencies.length > 0 ? spec.dependencies.join(", ") : "none"}`,
		`Plan: ${spec.planPath ?? `${spec.path ?? spec.name}/plan.md`}`,
		`Epic state updated: ${updated ? "yes" : "no (--peek)"}`,
		`Current spec switched: ${switchedValue ?? "no"}`,
	];
	if (warnings.length > 0) lines.push("", "Warnings:", ...warnings.map((warning) => `- ${warning}`));
	lines.push("", `Next command: /ralph-start ${spec.name}`, "Alias: /ralph-epic-next --start");
	return lines.join("\n");
}

function epicMarkdownPath(epic: CurrentEpic): string {
	return join(epic.absolutePath, "epic.md");
}

function epicResearchPath(epic: CurrentEpic): string {
	return join(epic.absolutePath, "research.md");
}

function epicDisplayPath(epic: CurrentEpic, fileName: string): string {
	return `${epic.path.replace(/\/$/, "")}/${fileName}`;
}

function childSpecEntry(specName: string, options: RalphPathOptions): SpecEntry {
	const root = getSpecRoots({ ...options, allowMissingConfiguredRoots: true })[0];
	return specEntryFromAbsolutePath(join(root.absolutePath, specName), { ...options, allowMissingConfiguredRoots: true });
}

function normalizedEpicPathField(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	let normalized = value.trim().replace(/\\/g, "/");
	while (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
	return normalized || null;
}

function epicPathFieldToAbsolute(pathText: string, options: RalphPathOptions): string {
	const cwd = options.cwd ?? process.cwd();
	return resolve(isAbsolute(pathText) ? pathText : join(cwd, pathText));
}

function isDirectChildOfConfiguredSpecRoot(absolutePath: string, specName: string, options: RalphPathOptions): boolean {
	const normalizedAbsolutePath = resolve(absolutePath);
	return getSpecRoots({ ...options, allowMissingConfiguredRoots: true }).some((root) => {
		const relativePath = relative(root.absolutePath, normalizedAbsolutePath).replace(/\\/g, "/");
		return relativePath === specName;
	});
}

function childSpecEntryFromConfiguredPath(value: unknown, specName: string, options: RalphPathOptions): SpecEntry | null {
	const pathText = normalizedEpicPathField(value);
	if (!pathText) return null;
	const absolutePath = epicPathFieldToAbsolute(pathText, options);
	if (!isDirectChildOfConfiguredSpecRoot(absolutePath, specName, options)) return null;
	return specEntryFromAbsolutePath(absolutePath, { ...options, allowMissingConfiguredRoots: true });
}

function childSpecEntryFromConfiguredPlanPath(value: unknown, specName: string, options: RalphPathOptions): SpecEntry | null {
	const pathText = normalizedEpicPathField(value);
	if (!pathText) return null;
	const absolutePlanPath = epicPathFieldToAbsolute(pathText, options);
	const absoluteChildPath = dirname(absolutePlanPath);
	const planFile = relative(absoluteChildPath, absolutePlanPath).replace(/\\/g, "/");
	if (planFile !== "plan.md" || !isDirectChildOfConfiguredSpecRoot(absoluteChildPath, specName, options)) return null;
	return specEntryFromAbsolutePath(absoluteChildPath, { ...options, allowMissingConfiguredRoots: true });
}

function normalizedEpicChildPathFields(specName: string, rawPath: unknown, rawPlanPath: unknown, options: RalphPathOptions): { path: string; planPath: string } {
	const child = childSpecEntryFromConfiguredPath(rawPath, specName, options)
		?? childSpecEntryFromConfiguredPlanPath(rawPlanPath, specName, options)
		?? childSpecEntry(specName, options);
	return { path: child.path, planPath: `${child.path}/plan.md` };
}

function childSpecEntryForEpicSpec(spec: EpicChildSpec, options: RalphPathOptions): SpecEntry {
	const paths = normalizedEpicChildPathFields(spec.name, spec.path, spec.planPath, options);
	return specEntryFromAbsolutePath(epicPathFieldToAbsolute(paths.path, options), { ...options, allowMissingConfiguredRoots: true });
}

function buildInitialEpicProgress(epicName: string, goal: string): string {
	return [
		`# Epic: ${epicName}`,
		"",
		"## Original Goal",
		goal.trim() || "_No goal captured yet_",
		"",
		"## Completed",
		"(none yet)",
		"",
		"## Learnings",
		"(none yet)",
		"",
	].join("\n");
}

function buildInitialEpicResearch(epicName: string, goal: string): string {
	return [
		`# Epic Research: ${epicName}`,
		"",
		"## Goal",
		goal.trim() || "_No goal captured yet_",
		"",
		"## Exploration Notes",
		"- Coordinator initialized this file for Pi triage. The triage analyst may append concrete research findings.",
		"",
	].join("\n");
}

function ensureInitialEpicFiles(epic: CurrentEpic, parsed: TriageArguments, goal: string): { epicPath: string; researchPath: string; progressPath: string } {
	mkdirSync(epic.absolutePath, { recursive: true });
	const epicPath = epicMarkdownPath(epic);
	const researchPath = epicResearchPath(epic);

	if (parsed.fresh || !existsSync(epic.progressPath)) {
		atomicWriteCoordinatorText(epic.progressPath, buildInitialEpicProgress(epic.name, goal));
	}
	if (parsed.fresh || !existsSync(researchPath)) {
		atomicWriteCoordinatorText(researchPath, buildInitialEpicResearch(epic.name, goal));
	}

	return { epicPath, researchPath, progressPath: epic.progressPath };
}

function normalizeTriageSpecName(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	const trimmed = value.trim();
	if (isValidSpecName(trimmed)) return trimmed;
	const inferred = inferSpecNameFromGoal(trimmed);
	return isValidSpecName(inferred) ? inferred : null;
}

function normalizeTriageChildStatus(value: unknown): EpicChildSpecStatus {
	return value === "in_progress" || value === "completed" || value === "cancelled" || value === "blocked" ? value : "pending";
}

function normalizeStringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string").map((item) => normalizeWhitespace(item)).filter(Boolean);
	}
	if (typeof value !== "string") return [];
	if (/^\s*(none|n\/a|na)\s*$/i.test(value)) return [];

	const lines = value
		.split(/\r?\n/)
		.map((line) => line.replace(/^\s*-\s*(?:\[[ xX]\]\s*)?/, "").trim())
		.filter(Boolean);
	return lines.length > 0 ? lines : [normalizeWhitespace(value)].filter(Boolean);
}

function normalizeDependencyNames(value: unknown): string[] {
	if (Array.isArray(value)) {
		return unique(value.map(normalizeTriageSpecName).filter((item): item is string => item !== null));
	}
	if (typeof value !== "string") return [];
	if (/^\s*(none|n\/a|na)\s*$/i.test(value)) return [];

	return unique(
		value
			.split(/[,\n]/)
			.map((item) => item.replace(/^\s*-\s*/, "").replace(/`/g, "").trim())
			.map(normalizeTriageSpecName)
			.filter((item): item is string => item !== null),
	);
}

function normalizeInterfaceContracts(value: unknown): EpicInterfaceContract[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((contract) => {
			if (isRecordValue(contract)) return { ...contract } as EpicInterfaceContract;
			if (typeof contract === "string" && contract.trim()) return { shape: normalizeWhitespace(contract) } as EpicInterfaceContract;
			return null;
		})
		.filter((contract): contract is EpicInterfaceContract => contract !== null);
}

function normalizeEpicChildSpec(raw: unknown, index: number, options: RalphPathOptions): EpicChildSpec | null {
	if (!isRecordValue(raw)) return null;
	const name = normalizeTriageSpecName(raw.name);
	if (!name) return null;

	const dependencies = normalizeDependencyNames(raw.dependencies).filter((dependency) => dependency !== name);
	const acceptanceCriteria = normalizeStringList(raw.acceptanceCriteria);
	const interfaceContracts = normalizeInterfaceContracts(raw.interfaceContracts);
	const mvpScope = isRecordValue(raw.mvpScope) ? raw.mvpScope : undefined;
	const paths = normalizedEpicChildPathFields(name, raw.path, raw.planPath, options);

	return {
		...raw,
		name,
		goal: typeof raw.goal === "string" ? raw.goal.trim() : undefined,
		status: normalizeTriageChildStatus(raw.status),
		order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : index + 1,
		path: paths.path,
		planPath: paths.planPath,
		dependencies,
		size: typeof raw.size === "string" && raw.size.trim() ? raw.size.trim() : undefined,
		acceptanceCriteria,
		mvpScope,
		interfaceContracts,
		startedAt: typeof raw.startedAt === "string" ? raw.startedAt : raw.startedAt === null ? null : null,
		completedAt: typeof raw.completedAt === "string" ? raw.completedAt : raw.completedAt === null ? null : null,
		blockedReason: typeof raw.blockedReason === "string" ? raw.blockedReason : raw.blockedReason === null ? null : null,
		issueNumber: typeof raw.issueNumber === "number" ? raw.issueNumber : raw.issueNumber === null ? null : null,
		issueUrl: typeof raw.issueUrl === "string" ? raw.issueUrl : raw.issueUrl === null ? null : null,
		githubStatus: typeof raw.githubStatus === "string" ? raw.githubStatus : raw.githubStatus === null ? null : null,
	};
}

function slugFromSpecHeading(heading: string): string | null {
	const withoutPrefix = heading.replace(/^Spec\s+\d+\s*:\s*/i, "").trim();
	const withoutDecorators = withoutPrefix.replace(/`/g, "").replace(/^[#*\s]+|[#*\s]+$/g, "");
	return normalizeTriageSpecName(withoutDecorators);
}

function parseEpicMarkdownSpecBlocks(content: string): MarkdownSpecBlock[] {
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	const blocks: MarkdownSpecBlock[] = [];
	let current: { name: string; heading: string; start: number } | null = null;

	for (let index = 0; index <= lines.length; index += 1) {
		const line = lines[index] ?? "";
		const headingMatch = line.match(/^###\s+(.+?)\s*$/);
		const headingName = headingMatch ? slugFromSpecHeading(headingMatch[1]) : null;

		if (index === lines.length || headingName) {
			if (current) {
				blocks.push({
					name: current.name,
					heading: current.heading,
					body: lines.slice(current.start + 1, index).join("\n").trim(),
					order: blocks.length + 1,
				});
			}
			if (headingName) current = { name: headingName, heading: line.trim(), start: index };
		}
	}

	return blocks;
}

function markdownFieldText(body: string, field: string): string {
	const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = body.match(new RegExp(`^\\s*\\*\\*${escaped}\\*\\*:\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*[^*]+\\*\\*:\\s*|$)`, "im"));
	return match?.[1]?.trim() ?? "";
}

function parseMarkdownDependencies(body: string, knownSpecNames: Set<string>, currentSpecName: string): string[] {
	const text = markdownFieldText(body, "Dependencies");
	if (!text || /^\s*(none|n\/a|na)\s*$/i.test(text)) return [];

	const fromKnownNames = [...knownSpecNames]
		.filter((name) => name !== currentSpecName)
		.filter((name) => new RegExp(`(^|[^a-z0-9-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9-]|$)`, "i").test(text));
	return fromKnownNames.length > 0 ? fromKnownNames : normalizeDependencyNames(text).filter((name) => name !== currentSpecName);
}

function parseMarkdownContracts(content: string): EpicInterfaceContract[] {
	const section = extractSection(content, "Cross-Spec Contracts");
	const rows = section.split(/\r?\n/).filter((line) => /^\s*\|/.test(line));
	if (rows.length < 2) return [];

	return rows.slice(2).map((row) => {
		const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
		if (cells.length < 5 || !cells[0]) return null;
		return {
			name: cells[0],
			producer: cells[1] || undefined,
			consumers: cells[2] ? cells[2].split(/,\s*/).filter(Boolean) : [],
			shape: cells[3] || undefined,
			compatibilityNotes: cells[4] || undefined,
		} as EpicInterfaceContract;
	}).filter((contract): contract is EpicInterfaceContract => contract !== null);
}

function parseEpicMarkdownChildSpecs(content: string, options: RalphPathOptions): EpicChildSpec[] {
	const blocks = parseEpicMarkdownSpecBlocks(content);
	const knownSpecNames = new Set(blocks.map((block) => block.name));

	return blocks.map((block) => {
		const goal = markdownFieldText(block.body, "Goal");
		const included = normalizeStringList(markdownFieldText(block.body, "MVP Scope"));
		const excluded = normalizeStringList(markdownFieldText(block.body, "Out of Scope"));
		const acceptanceCriteria = normalizeStringList(markdownFieldText(block.body, "Acceptance Criteria"));
		const contractsText = markdownFieldText(block.body, "Interface Contracts");
		const size = markdownFieldText(block.body, "Size").split(/\s+/)[0];
		return normalizeEpicChildSpec(
			{
				name: block.name,
				goal: goal || undefined,
				status: "pending",
				order: block.order,
				dependencies: parseMarkdownDependencies(block.body, knownSpecNames, block.name),
				size: size && !/^none$/i.test(size) ? size : undefined,
				acceptanceCriteria,
				mvpScope: { in: included, out: excluded },
				interfaceContracts: contractsText && !/^\s*(none|n\/a|na)\s*$/i.test(contractsText)
					? [{ name: `${block.name}-contract`, producer: block.name, shape: normalizeWhitespace(contractsText) }]
					: [],
			},
			block.order - 1,
			options,
		);
	}).filter((spec): spec is EpicChildSpec => spec !== null);
}

function normalizeEpicContracts(raw: EpicState | null, epicMarkdown: string): EpicInterfaceContract[] {
	const rawContracts = normalizeInterfaceContracts(raw?.contracts);
	return rawContracts.length > 0 ? rawContracts : parseMarkdownContracts(epicMarkdown);
}

function serializeBranchDecisionForValidation(branchDecision: BranchDecision): Record<string, unknown> {
	return {
		mode: branchDecision.mode,
		currentBranch: typeof branchDecision.currentBranch === "string" ? branchDecision.currentBranch : null,
		defaultBranch: typeof branchDecision.defaultBranch === "string" ? branchDecision.defaultBranch : null,
		targetBranch: typeof branchDecision.targetBranch === "string" ? branchDecision.targetBranch : null,
		worktreePath: typeof branchDecision.worktreePath === "string" ? branchDecision.worktreePath : null,
		dirty: typeof branchDecision.dirty === "boolean" ? branchDecision.dirty : null,
		applied: branchDecision.applied,
		reason: branchDecision.reason,
	};
}

function normalizeTriageEpicState(
	epic: CurrentEpic,
	raw: EpicState | null,
	parsed: TriageArguments,
	goal: string,
	options: RalphPathOptions,
	branchDecision: BranchDecision | null = null,
): EpicState {
	const epicMarkdown = readFileIfExists(epicMarkdownPath(epic));
	const rawSpecs = Array.isArray(raw?.specs) ? raw.specs : [];
	const normalizedRawSpecs = rawSpecs.map((spec, index) => normalizeEpicChildSpec(spec, index, options)).filter((spec): spec is EpicChildSpec => spec !== null);
	const specs = normalizedRawSpecs.length > 0 ? normalizedRawSpecs : parseEpicMarkdownChildSpecs(epicMarkdown, options);
	const now = new Date().toISOString();
	const output = parsed.output;
	const state: EpicState = {
		...(raw ?? {}),
		schemaVersion: EPIC_SCHEMA_VERSION,
		name: epic.name,
		goal: goal || raw?.goal || parsed.goal,
		status: raw?.status === "completed" || raw?.status === "in_progress" || raw?.status === "cancelled" ? raw.status : "ready",
		phase: raw?.phase === "completed" ? "completed" : "ready",
		output,
		basePath: epic.path,
		epicPath: epicDisplayPath(epic, "epic.md"),
		researchPath: epicDisplayPath(epic, "research.md"),
		progressPath: epicDisplayPath(epic, ".progress.md"),
		createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : now,
		updatedAt: now,
		activeSpec: typeof raw?.activeSpec === "string" ? raw.activeSpec : null,
		lastCompletedSpec: typeof raw?.lastCompletedSpec === "string" ? raw.lastCompletedSpec : null,
		issueNumber: typeof raw?.issueNumber === "number" ? raw.issueNumber : raw?.issueNumber === null ? null : null,
		issueUrl: typeof raw?.issueUrl === "string" ? raw.issueUrl : raw?.issueUrl === null ? null : null,
		githubStatus: typeof raw?.githubStatus === "string" ? raw.githubStatus : raw?.githubStatus === null ? null : null,
		github: isRecordValue(raw?.github) ? raw.github : undefined,
		specs,
		contracts: normalizeEpicContracts(raw, epicMarkdown),
		validation: {
			...(isRecordValue(raw?.validation) ? raw.validation : {}),
			...(branchDecision ? { branchDecision: serializeBranchDecisionForValidation(branchDecision) } : {}),
			warnings: [],
			lastValidatedAt: now,
		},
	};

	return state;
}

function collectTriageValidationErrors(epic: CurrentEpic, state: EpicState): string[] {
	const errors: string[] = [];
	const epicMarkdown = readFileIfExists(epicMarkdownPath(epic));

	if (!epicMarkdown.trim()) errors.push(`Expected epic.md was not created: ${epicMarkdownPath(epic)}`);
	if (epicMarkdown.trim() && !/^#\s+Epic\b/im.test(epicMarkdown)) errors.push("epic.md must contain a top-level Epic heading.");
	if (epicMarkdown.trim() && !/^##\s+Specs\b/im.test(epicMarkdown)) errors.push("epic.md must contain a Specs section.");
	if (state.schemaVersion !== EPIC_SCHEMA_VERSION) errors.push(`.epic-state.json schemaVersion must be ${EPIC_SCHEMA_VERSION}.`);
	if (state.name !== epic.name) errors.push(`.epic-state.json name must be '${epic.name}'.`);
	if (typeof state.goal !== "string" || !state.goal.trim()) errors.push(".epic-state.json goal is required.");
	if (typeof state.output !== "string" || !TRIAGE_OUTPUT_VALUES.has(state.output)) errors.push(".epic-state.json output must be one of: spec-files, github-issues, both.");
	if (!Array.isArray(state.specs) || state.specs.length === 0) errors.push(".epic-state.json specs must contain at least one child spec.");
	for (const required of ["basePath", "epicPath", "researchPath", "progressPath", "createdAt", "updatedAt"] as const) {
		if (typeof state[required] !== "string" || !state[required]) errors.push(`.epic-state.json missing required field '${required}'.`);
	}

	const validation = validateEpicState(state);
	errors.push(...validation.warnings);
	return unique(errors);
}

function applyTriageValidation(state: EpicState, warnings: string[]): EpicState {
	const now = new Date().toISOString();
	return {
		...state,
		status: warnings.length > 0 ? "blocked" : state.status,
		phase: warnings.length > 0 ? "blocked" : state.phase,
		updatedAt: now,
		validation: {
			...(isRecordValue(state.validation) ? state.validation : {}),
			warnings,
			lastValidatedAt: now,
		},
	};
}

function contractRelatesToSpec(contract: EpicInterfaceContract, specName: string): boolean {
	if (contract.producer === specName) return true;
	if (Array.isArray(contract.consumers) && contract.consumers.includes(specName)) return true;
	return false;
}

function relevantContractsForSpec(state: EpicState, spec: EpicChildSpec): EpicInterfaceContract[] {
	const direct = normalizeInterfaceContracts(spec.interfaceContracts);
	const shared = normalizeInterfaceContracts(state.contracts).filter((contract) => contractRelatesToSpec(contract, spec.name));
	return [...shared, ...direct];
}

function extractEpicSpecBlock(content: string, specName: string): string {
	const block = parseEpicMarkdownSpecBlocks(content).find((candidate) => candidate.name === specName);
	return block ? `${block.heading}\n${block.body}`.trim() : "";
}

function formatStringList(values: unknown, fallback = "None"): string[] {
	const list = normalizeStringList(values);
	return list.length > 0 ? list.map((item) => `- ${item}`) : [`- ${fallback}`];
}

function formatContractsForPlan(contracts: EpicInterfaceContract[]): string[] {
	if (contracts.length === 0) return ["- None"];
	return contracts.map((contract) => {
		const name = contract.name ? `${contract.name}: ` : "";
		const producer = contract.producer ? ` producer=${contract.producer}` : "";
		const consumers = Array.isArray(contract.consumers) && contract.consumers.length > 0 ? ` consumers=${contract.consumers.join(", ")}` : "";
		const shape = contract.shape ? ` shape=${contract.shape}` : "";
		return `- ${name}${[producer, consumers, shape].join("").trim() || JSON.stringify(contract)}`;
	});
}

function childGithubIssuePlanReference(spec: EpicChildSpec): { confirmedRef: string | null; planLine: string | null } {
	const confirmedRef = typeof spec.issueUrl === "string" && spec.issueUrl.trim()
		? spec.issueUrl.trim()
		: typeof spec.issueNumber === "number" && Number.isSafeInteger(spec.issueNumber) && spec.issueNumber > 0
			? `#${spec.issueNumber}`
			: null;
	return {
		confirmedRef,
		planLine: confirmedRef ? `GitHub Issue: ${confirmedRef}` : null,
	};
}

function buildChildPlan(epic: CurrentEpic, state: EpicState, spec: EpicChildSpec, epicMarkdown: string): string {
	const contracts = relevantContractsForSpec(state, spec);
	const sourceBlock = extractEpicSpecBlock(epicMarkdown, spec.name);
	const githubIssue = childGithubIssuePlanReference(spec);
	return [
		`# Plan: ${spec.name}`,
		"",
		`Epic: ${epicDisplayPath(epic, "epic.md")}`,
		`Epic State: ${epicDisplayPath(epic, ".epic-state.json")}`,
		...(githubIssue.planLine ? [githubIssue.planLine] : []),
		"",
		"## Goal",
		spec.goal || "_No goal captured._",
		"",
		"## Dependencies",
		...(spec.dependencies && spec.dependencies.length > 0 ? spec.dependencies.map((dependency) => `- ${dependency}`) : ["- None"]),
		"",
		"## Acceptance Criteria",
		...formatStringList(spec.acceptanceCriteria),
		"",
		"## MVP Scope",
		...formatStringList(isRecordValue(spec.mvpScope) ? spec.mvpScope.in : []),
		"",
		"## Interface Contracts",
		...formatContractsForPlan(contracts),
		"",
		"## Source Epic Detail",
		sourceBlock || "_No per-spec epic detail was parsed._",
		"",
	].join("\n");
}

function buildChildProgressStub(state: EpicState, spec: EpicChildSpec, child: SpecEntry): string {
	return [
		"---",
		`spec: ${child.name}`,
		`basePath: ${child.path}`,
		"phase: planned",
		"task: 0/0",
		`updated: ${new Date().toISOString()}`,
		"---",
		"",
		`# Progress: ${child.name}`,
		"",
		"## Original Goal",
		spec.goal || "_No goal captured._",
		"",
		"## Epic Context",
		`- Epic: ${state.name}`,
		`- Epic state: ${state.epicPath ? state.epicPath.replace(/epic\.md$/, ".epic-state.json") : "_unknown_"}`,
		`- Dependencies: ${spec.dependencies && spec.dependencies.length > 0 ? spec.dependencies.join(", ") : "none"}`,
		"",
		"## Completed Tasks",
		"_No tasks completed yet_",
		"",
		"## Current Task",
		"Planned from epic triage. Run /ralph-start to begin normal Ralph phases.",
		"",
		"## Learnings",
		"_Discoveries and insights will be captured here_",
		"",
		"## Blockers",
		"- None currently",
		"",
		"## Next",
		`Run /ralph-start ${child.name}`,
		"",
	].join("\n");
}

function childSpecStatePatch(epic: CurrentEpic, state: EpicState, spec: EpicChildSpec, child: SpecEntry, existingState: RalphState | null): Record<string, unknown> {
	const patch: Record<string, unknown> = {
		source: existingState?.source ?? "epic",
		name: child.name,
		basePath: child.path,
		phase: stringField(existingState, "phase") ?? "planned",
		taskIndex: numberField(existingState, "taskIndex") ?? 0,
		totalTasks: numberField(existingState, "totalTasks") ?? 0,
		awaitingApproval: booleanField(existingState, "awaitingApproval") ?? false,
		epicName: state.name,
		epicSpecName: spec.name,
		epicStatePath: getEpicStatePath(epic, { cwd: child.rootAbsolutePath }),
		epicDependencies: spec.dependencies ?? [],
		epicContracts: relevantContractsForSpec(state, spec),
		epicPath: state.epicPath,
		planPath: `${child.path}/plan.md`,
	};
	if (typeof spec.issueNumber === "number") patch.githubIssueNumber = spec.issueNumber;
	if (typeof spec.issueUrl === "string" && spec.issueUrl.trim()) patch.githubIssueUrl = spec.issueUrl.trim();
	if (typeof spec.githubStatus === "string" && spec.githubStatus.trim()) patch.githubStatus = spec.githubStatus.trim();
	return patch;
}

function materializeEpicChildSpecs(epic: CurrentEpic, state: EpicState, options: RalphPathOptions, fresh: boolean): TriageMaterializationResult {
	const result: TriageMaterializationResult = {
		directoriesPrepared: 0,
		plansWritten: 0,
		plansKept: 0,
		progressWritten: 0,
		progressKept: 0,
		statesWritten: 0,
		warnings: [],
	};

	const epicMarkdown = readFileIfExists(epicMarkdownPath(epic));
	for (const spec of state.specs) {
		try {
			const child = childSpecEntryForEpicSpec(spec, options);
			mkdirSync(child.absolutePath, { recursive: true });
			result.directoriesPrepared += 1;

			const planPath = join(child.absolutePath, "plan.md");
			if (fresh || !existsSync(planPath)) {
				atomicWriteCoordinatorText(planPath, buildChildPlan(epic, state, spec, epicMarkdown));
				result.plansWritten += 1;
			} else {
				result.plansKept += 1;
			}

			const existingProgress = readProgress(child, options);
			if (fresh || !existingProgress.trim()) {
				writeProgress(child, buildChildProgressStub(state, spec, child), options);
				result.progressWritten += 1;
			} else {
				result.progressKept += 1;
			}

			const existingState = readRalphState(child, options);
			mergeRalphState(child, childSpecStatePatch(epic, state, spec, child, existingState), options);
			result.statesWritten += 1;
		} catch (error) {
			result.warnings.push(`Failed to create child spec stub for '${spec.name}': ${formatError(error)}`);
		}
	}
	return result;
}

function formatMaterializationSummary(result: TriageMaterializationResult | null): string[] {
	if (!result) return [];
	return [
		"Child spec files:",
		`- Directories prepared: ${result.directoriesPrepared}`,
		`- plan.md written: ${result.plansWritten}; kept: ${result.plansKept}`,
		`- .progress.md written: ${result.progressWritten}; kept: ${result.progressKept}`,
		`- .ralph-state.json stubs written: ${result.statesWritten}`,
	];
}

type TriageOutputExecutionResult = {
	state: EpicState;
	githubSync: TriageGithubSyncResult | null;
	materialized: TriageMaterializationResult | null;
};

async function executeTriageOutputBehavior(
	ctx: ExtensionCommandContext,
	epic: CurrentEpic,
	state: EpicState,
	options: RalphPathOptions,
	parsed: TriageArguments,
	outputBehavior: TriageOutputBehavior,
): Promise<TriageOutputExecutionResult> {
	let nextState = state;
	let githubSync: TriageGithubSyncResult | null = null;
	if (outputBehavior.includesGithub) {
		setRalphStatus(ctx, `Ralph triage: syncing GitHub issues for ${epic.name}`);
		try {
			const githubOutcome = await syncTriageGithubIssues(ctx, nextState, parsed);
			nextState = githubOutcome.state;
			githubSync = githubOutcome.summary;
			writeEpicState(epic, nextState, options);
		} finally {
			setRalphStatus(ctx);
		}
	}

	let materialized: TriageMaterializationResult | null = null;
	if (outputBehavior.includesSpecFiles) {
		setRalphStatus(ctx, `Ralph triage: materializing ${nextState.specs.length} child spec stub${nextState.specs.length === 1 ? "" : "s"}`);
		try {
			materialized = materializeEpicChildSpecs(epic, nextState, options, parsed.fresh);
		} finally {
			setRalphStatus(ctx);
		}
	}

	return {
		state: nextState,
		githubSync,
		materialized,
	};
}

function githubRepositoryFromDetection(detection: GithubDetection): GithubRepository | null {
	const owner = detection.repository.owner;
	const name = detection.repository.name;
	const nameWithOwner = detection.repository.nameWithOwner;
	if (!owner || !name || !nameWithOwner) return null;
	return { owner, name, nameWithOwner, url: detection.repository.url };
}

function githubDetectionWarnings(detection: GithubDetection): string[] {
	const warnings: string[] = [];
	if (!detection.gh.available) warnings.push(`GitHub CLI is unavailable: ${detection.gh.error ?? "gh --version failed"}`);
	if (!detection.repository.detected) warnings.push(`GitHub repository could not be detected: ${detection.repository.error ?? "gh repo view failed"}`);
	if (!detection.auth.authenticated) warnings.push(`GitHub CLI is not authenticated: ${detection.auth.error ?? detection.auth.output ?? "gh auth status failed"}`);
	if (detection.labels.error) warnings.push(`GitHub labels could not be inspected: ${detection.labels.error}`);
	return unique(warnings);
}

function issueNumberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function issueUrlForNumber(repository: GithubRepository | undefined, issueNumber: number | null): string | null {
	return repository && issueNumber ? `https://github.com/${repository.nameWithOwner}/issues/${issueNumber}` : null;
}

function githubIssueUrl(result: GithubIssueSyncResult | undefined, repository: GithubRepository | undefined): string | null {
	if (!result) return null;
	if (typeof result.issueUrl === "string" && result.issueUrl.trim()) return result.issueUrl.trim();
	return issueUrlForNumber(repository, result.issueNumber);
}

function githubIssueLine(result: GithubIssueSyncResult): string {
	const issue = result.issueNumber ? `#${result.issueNumber}` : "new issue";
	return `${result.action.replace(/^would_/, "would ")} ${issue}: ${result.title}`;
}

async function confirmTriageGithubWrites(
	ctx: ExtensionCommandContext,
	parsed: TriageArguments,
	repository: GithubRepository,
	dryRuns: GithubIssueSyncResult[],
): Promise<TriageGithubConfirmation> {
	if (parsed.yes) return { confirmed: true, confirmedBy: "--yes" };

	if (!ctx.hasUI) {
		return {
			confirmed: false,
			confirmedBy: "not-confirmed",
			githubStatus: "confirmation_required",
			reason: "GitHub issue output requires Pi UI confirmation or --yes in noninteractive mode; no GitHub issues were created.",
		};
	}

	const creates = dryRuns.filter((result) => result.action === "would_create").length;
	const updates = dryRuns.filter((result) => result.action === "would_update").length;
	const confirmed = await ctx.ui.confirm(
		"Confirm GitHub issue writes",
		[
			`Repository: ${repository.nameWithOwner}`,
			`Planned remote writes: ${creates} create, ${updates} update`,
			"",
			...dryRuns.map((result) => `- ${githubIssueLine(result)}`),
			"",
			"This will run gh issue create/edit against the repository above.",
			"Choose OK only if you want Smart Ralph to write or update these GitHub issues now.",
		].join("\n"),
	);
	return confirmed
		? { confirmed: true, confirmedBy: "pi-ui" }
		: {
				confirmed: false,
				confirmedBy: "not-confirmed",
				githubStatus: "confirmation_required",
				reason: "User cancelled GitHub issue creation; no GitHub issues were created.",
		  };
}

function skippedChildGithubSyncs(state: EpicState, dryRuns: GithubIssueSyncResult[], repository: GithubRepository | undefined): TriageGithubChildSync[] {
	return state.specs.map((spec, index) => {
		const dryRun = dryRuns[index + 1];
		return {
			specName: spec.name,
			result: dryRun,
			status: dryRun.action,
			issueNumber: dryRun.issueNumber,
			issueUrl: githubIssueUrl(dryRun, repository),
		};
	});
}

function mapGithubSyncFields(
	current: { issueNumber?: unknown; issueUrl?: unknown },
	result: GithubIssueSyncResult,
	repository: GithubRepository,
): { issueNumber: number | null; issueUrl: string | null; githubStatus: GithubIssueSyncResult["action"] } {
	return {
		issueNumber: result.issueNumber ?? issueNumberOrNull(current.issueNumber),
		issueUrl: githubIssueUrl(result, repository) ?? (typeof current.issueUrl === "string" ? current.issueUrl : null),
		githubStatus: result.action,
	};
}

function applyEpicGithubResult(state: EpicState, result: GithubIssueSyncResult, repository: GithubRepository, now: string): EpicState {
	return {
		...state,
		...mapGithubSyncFields(state, result, repository),
		updatedAt: now,
	};
}

function applyChildGithubResult(state: EpicState, specName: string, result: GithubIssueSyncResult, repository: GithubRepository, now: string): EpicState {
	const specs = state.specs.map((spec) => (spec.name === specName ? { ...spec, ...mapGithubSyncFields(spec, result, repository) } : spec));
	return { ...state, specs, updatedAt: now };
}

function applyChildGithubFailure(state: EpicState, specName: string, status: string, now: string): EpicState {
	return {
		...state,
		updatedAt: now,
		specs: state.specs.map((spec) => (spec.name === specName ? { ...spec, githubStatus: status } : spec)),
	};
}

function githubIssueMetadata(result: GithubIssueSyncResult | undefined, repository: GithubRepository | undefined): Record<string, unknown> | null {
	if (!result) return null;
	return {
		action: result.action,
		operation: result.operation,
		issueNumber: result.issueNumber,
		issueUrl: githubIssueUrl(result, repository),
		issueNumberSource: result.issueNumberSource ?? null,
		labels: result.labels,
		missingLabels: result.missingLabels,
	};
}

function childGithubMetadata(state: EpicState, summaryChildren: TriageGithubChildSync[], repository: GithubRepository | undefined): Record<string, unknown> {
	const resultBySpecName = new Map(summaryChildren.map((child) => [child.specName, child.result] as const));
	const childIssues: Record<string, unknown> = {};
	for (const spec of state.specs) {
		const result = resultBySpecName.get(spec.name);
		childIssues[spec.name] = {
			issueNumber: issueNumberOrNull(spec.issueNumber),
			issueUrl: typeof spec.issueUrl === "string" ? spec.issueUrl : null,
			githubStatus: typeof spec.githubStatus === "string" ? spec.githubStatus : null,
			result: githubIssueMetadata(result, repository),
		};
	}
	return childIssues;
}

function withGithubMetadata(
	state: EpicState,
	repository: GithubRepository | undefined,
	summary: TriageGithubSyncResult,
	detection: GithubDetection,
	now: string,
	confirmedBy: string,
): EpicState {
	const missingLabels = aggregateGithubMissingLabels(
		summary.epic?.missingLabels,
		...summary.children.map((child) => child.result?.missingLabels),
	);
	const epicIssueNumber = summary.epic?.issueNumber ?? issueNumberOrNull(state.issueNumber);
	const epicIssueUrl = summary.epic ? githubIssueUrl(summary.epic, repository) : typeof state.issueUrl === "string" ? state.issueUrl : null;
	const epicGithubStatus = summary.epic?.action ?? (typeof state.githubStatus === "string" ? state.githubStatus : null);
	return {
		...state,
		issueNumber: epicIssueNumber,
		issueUrl: epicIssueUrl,
		githubStatus: epicGithubStatus,
		updatedAt: now,
		github: {
			schemaVersion: RALPH_GITHUB_METADATA_SCHEMA_VERSION,
			tool: RALPH_GITHUB_METADATA_TOOL,
			status: summary.status,
			output: state.output,
			repository: repository
				? { owner: repository.owner, name: repository.name, nameWithOwner: repository.nameWithOwner, url: repository.url ?? null }
				: {
					owner: detection.repository.owner ?? null,
					name: detection.repository.name ?? null,
					nameWithOwner: detection.repository.nameWithOwner ?? null,
					url: detection.repository.url ?? null,
				},
			syncedAt: now,
			confirmedBy,
			epicIssue: {
				issueNumber: epicIssueNumber,
				issueUrl: epicIssueUrl,
				githubStatus: epicGithubStatus,
				result: githubIssueMetadata(summary.epic, repository),
			},
			childIssues: childGithubMetadata(state, summary.children, repository),
			summary: {
				created: summary.created,
				updated: summary.updated,
				total: (summary.epic ? 1 : 0) + summary.children.length,
				missingLabels,
				skippedReason: summary.skippedReason ?? null,
			},
			warnings: aggregateGithubWarnings(summary.warnings, summary.skippedReason ? [summary.skippedReason] : undefined),
		},
	};
}

function formatGithubSyncSummary(result: TriageGithubSyncResult | null): string[] {
	if (!result) return [];
	const lines = ["GitHub issues:"];
	if (result.repository) lines.push(`- Repository: ${result.repository.nameWithOwner}`);
	if (result.skippedReason) lines.push(`- Skipped: ${result.skippedReason}`);
	if (result.epic) {
		const issue = result.epic.issueNumber ? `#${result.epic.issueNumber}` : "unknown issue";
		const url = githubIssueUrl(result.epic, result.repository);
		lines.push(`- Epic issue: ${issue}${url ? ` ${url}` : ""} (${result.epic.action})`);
	}
	if (result.children.length > 0) {
		lines.push(`- Child issues: created ${result.children.filter((child) => child.status === "created").length}, updated ${result.children.filter((child) => child.status === "updated").length}, failed ${result.children.filter((child) => child.status === "failed").length}`);
		for (const child of result.children) {
			const issue = child.issueNumber ? `#${child.issueNumber}` : "no issue";
			const url = child.issueUrl ? ` ${child.issueUrl}` : "";
			lines.push(`  - ${child.specName}: ${issue}${url} (${child.status})`);
		}
	}
	return lines;
}

function githubSyncSummaryStatus(children: TriageGithubChildSync[], warnings: string[]): "synced" | "failed" {
	return children.some((child) => child.status === "failed") || warnings.some((warning) => /^Failed to sync/i.test(warning)) ? "failed" : "synced";
}

function persistSkippedGithubSync(
	state: EpicState,
	repository: GithubRepository | undefined,
	detection: GithubDetection,
	now: string,
	skip: TriageGithubSkipState,
): { state: EpicState; summary: TriageGithubSyncResult } {
	const summary: TriageGithubSyncResult = {
		status: "skipped",
		repository,
		children: skip.children,
		created: 0,
		updated: 0,
		warnings: skip.warnings,
		skippedReason: skip.skippedReason,
	};
	return {
		state: withGithubMetadata({ ...state, githubStatus: skip.githubStatus }, repository, summary, detection, now, skip.confirmedBy),
		summary,
	};
}

async function syncTriageGithubIssues(ctx: ExtensionCommandContext, state: EpicState, parsed: TriageArguments): Promise<{ state: EpicState; summary: TriageGithubSyncResult }> {
	setRalphStatus(ctx, `Ralph triage: checking GitHub CLI and repository`);
	const detection = detectGithub({ cwd: ctx.cwd });
	const repository = githubRepositoryFromDetection(detection) ?? undefined;
	const detectionWarnings = githubDetectionWarnings(detection);
	const now = new Date().toISOString();

	if (!detection.ready || !repository) {
		const skippedReason = "GitHub CLI, repository, or auth is not ready; no GitHub issues were created.";
		return persistSkippedGithubSync(state, repository, detection, now, {
			githubStatus: "unavailable",
			confirmedBy: "not-confirmed",
			skippedReason,
			warnings: aggregateGithubWarnings(detectionWarnings, [skippedReason]),
			children: [],
		});
	}

	const commonOptions = {
		cwd: ctx.cwd,
		repository,
		availableLabels: detection.labels.detected ? detection.labels.names : undefined,
	};
	setRalphStatus(ctx, `Ralph triage: planning GitHub issue writes`);
	const dryRuns = [
		planEpicIssueSync(state, commonOptions),
		...state.specs.map((spec) => planChildSpecIssueSync(state, spec, commonOptions)),
	];
	setRalphStatus(ctx, `Ralph triage: awaiting GitHub issue confirmation`);
	const confirmation = await confirmTriageGithubWrites(ctx, parsed, repository, dryRuns);
	if (!confirmation.confirmed) {
		const skippedConfirmation = confirmation as any;
		return persistSkippedGithubSync(state, repository, detection, now, {
			githubStatus: skippedConfirmation.githubStatus,
			confirmedBy: skippedConfirmation.confirmedBy,
			skippedReason: skippedConfirmation.reason,
			warnings: aggregateGithubWarnings(detectionWarnings, [skippedConfirmation.reason]),
			children: skippedChildGithubSyncs(state, dryRuns, repository),
		});
	}

	setRalphStatus(ctx, `Ralph triage: creating/updating GitHub issues`);
	const warnings = [...detectionWarnings];
	let nextState = state;
	let epicResult: GithubIssueSyncResult | undefined;
	try {
		epicResult = createOrUpdateEpicIssue(nextState, commonOptions);
		nextState = applyEpicGithubResult(nextState, epicResult, repository, now);
		warnings.push(...epicResult.warnings);
	} catch (error) {
		warnings.push(`Failed to sync epic GitHub issue: ${formatError(error)}`);
		const summary: TriageGithubSyncResult = {
			status: "failed",
			repository,
			children: [],
			created: 0,
			updated: 0,
			warnings: aggregateGithubWarnings(warnings),
		};
		return { state: withGithubMetadata({ ...nextState, githubStatus: "failed" }, repository, summary, detection, now, confirmation.confirmedBy), summary };
	}

	const children: TriageGithubChildSync[] = [];
	for (const spec of nextState.specs) {
		try {
			const result = createOrUpdateChildSpecIssue(nextState, spec, commonOptions);
			nextState = applyChildGithubResult(nextState, spec.name, result, repository, now);
			warnings.push(...result.warnings);
			children.push({
				specName: spec.name,
				result,
				status: result.action,
				issueNumber: result.issueNumber,
				issueUrl: githubIssueUrl(result, repository),
			});
		} catch (error) {
			const message = formatError(error);
			warnings.push(`Failed to sync child GitHub issue for '${spec.name}': ${message}`);
			nextState = applyChildGithubFailure(nextState, spec.name, "failed", now);
			children.push({ specName: spec.name, status: "failed", issueNumber: null, issueUrl: null, error: message });
		}
	}

	const issueResults = [epicResult, ...children.map((child) => child.result).filter((result): result is GithubIssueSyncResult => Boolean(result))];
	const summary: TriageGithubSyncResult = {
		status: githubSyncSummaryStatus(children, warnings),
		repository,
		epic: epicResult,
		children,
		created: issueResults.filter((result) => result.action === "created").length,
		updated: issueResults.filter((result) => result.action === "updated").length,
		warnings: aggregateGithubWarnings(warnings),
	};
	return { state: withGithubMetadata(nextState, repository, summary, detection, now, confirmation.confirmedBy), summary };
}

function formatTriageSummary(
	epic: CurrentEpic,
	state: EpicState,
	materialized: TriageMaterializationResult | null,
	warnings: string[],
	resumed: boolean,
	githubSync: TriageGithubSyncResult | null = null,
): string {
	const summary = computeEpicDependencyStatus(state);
	const next = summary.nextSpec;
	const lines = [
		`${resumed ? "Resumed" : "Triage complete for"} '${state.name}'.`,
		`Output: ${epicDisplayPath(epic, "epic.md")}`,
		`State: ${epicDisplayPath(epic, ".epic-state.json")}`,
		"",
		"## Epic Summary",
		`Goal: ${state.goal ?? ""}`,
		`Progress: ${summary.completedSpecs.length}/${state.specs.length} specs completed`,
		"",
		`Specs (${state.specs.length}):`,
	];

	for (const spec of [...state.specs].sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name))) {
		const dependencies = spec.dependencies && spec.dependencies.length > 0 ? ` (depends on: ${spec.dependencies.join(", ")})` : "";
		const size = spec.size ? ` [${spec.size}]` : "";
		lines.push(`- [${spec.status === "completed" ? "x" : " "}] ${spec.name}: ${spec.goal ?? ""}${size}${dependencies}`);
	}

	lines.push("", "Ready (dependencies met):");
	if (summary.readySpecs.length > 0) {
		for (const spec of summary.readySpecs) lines.push(`- ${spec.name}: ${spec.goal ?? ""}`);
	} else {
		lines.push("- None");
	}

	if (summary.dependencyBlockedSpecs.length > 0 || summary.explicitlyBlockedSpecs.length > 0) {
		lines.push("", "Blocked:");
		for (const entry of summary.specs.filter((item) => item.isDependencyBlocked || item.isExplicitlyBlocked)) {
			const reason = entry.isExplicitlyBlocked
				? entry.spec.blockedReason ?? "explicitly blocked"
				: `waiting on ${[...entry.unmetDependencies, ...entry.missingDependencies].join(", ")}`;
			lines.push(`- ${entry.name}: ${reason}`);
		}
	}

	lines.push("", ...formatMaterializationSummary(materialized), ...formatGithubSyncSummary(githubSync));
	const allWarnings = unique([...warnings, ...(materialized?.warnings ?? []), ...(githubSync?.warnings ?? []), ...(state.validation?.warnings ?? [])]);
	if (allWarnings.length > 0) lines.push("", "Warnings:", ...allWarnings.map((warning) => `- ${warning}`));

	lines.push("");
	if (next) {
		lines.push(`-> Suggested next: ${next.name}`, "-> Next: Run /ralph-start --next-epic-spec");
	} else if (state.status === "completed") {
		lines.push("-> Epic is complete.");
	} else {
		lines.push("-> No unblocked child spec is ready. Resolve blockers or dependencies, then rerun /ralph-triage.");
	}

	return lines.join("\n");
}

function buildTriagePrompt(epic: CurrentEpic, parsed: TriageArguments, goal: string, files: { epicPath: string; researchPath: string; progressPath: string }): string {
	return [
		"You are running Smart Ralph epic triage as a delegated Pi subagent.",
		"",
		"Coordinator contract:",
		`- epicName: ${epic.name}`,
		`- goal: ${goal}`,
		`- basePath: ${epic.absolutePath}`,
		`- required epic artifact: ${files.epicPath}`,
		`- required state artifact: ${epic.statePath}`,
		`- required research artifact: ${files.researchPath}`,
		`- required progress artifact: ${files.progressPath}`,
		`- output: ${parsed.output}`,
		"- Write only inside basePath unless inspecting the codebase.",
		"- Do not edit Smart Ralph package/runtime files unless explicitly listed in the spec.",
		"- Do not call gh or create GitHub issues; the coordinator will perform requested GitHub output after validation and confirmation.",
		"- Produce vertical-slice child specs with kebab-case names and a valid dependency graph.",
		"- If user input is required, return USER_INPUT_REQUIRED and questions without writing partial final state.",
		"",
		"State file requirement:",
		`- Write ${epic.statePath} as schemaVersion ${EPIC_SCHEMA_VERSION}.`,
		"- Required top-level fields: schemaVersion, name, goal, status, phase, output, basePath, epicPath, researchPath, progressPath, createdAt, updatedAt, activeSpec, lastCompletedSpec, issueNumber, specs, contracts, validation.",
		"- Each child spec requires: name, goal, status='pending', order, path, planPath, dependencies, size, acceptanceCriteria, mvpScope, interfaceContracts, startedAt=null, completedAt=null, blockedReason=null, issueNumber=null.",
		`- Use output='${parsed.output}'. Do not create child spec directories or GitHub issues; the coordinator will materialize requested outputs after validation.`,

		"",
		promptFileSection("Existing research", files.researchPath, readFileIfExists(files.researchPath)),
		promptFileSection("Existing epic", files.epicPath, readFileIfExists(files.epicPath)),
		promptFileSection("Existing state", epic.statePath, readFileIfExists(epic.statePath)),
		"",
		"Completion response:",
		"- End with TRIAGE_COMPLETE, specs: <count>, next: <first ready spec>.",
	].join("\n");
}

async function showCurrentEpicTriageStatus(ctx: ExtensionCommandContext, options: RalphPathOptions): Promise<void> {
	const current = readCurrentEpic(options);
	if (!current) {
		await notify(ctx, `No active epic is set. ${formatTriageUsage()}`, "warning");
		return;
	}
	if (!current.state) {
		await notify(ctx, [`Active epic '${current.epic.name}' has no readable state.`, ...current.warnings.map((warning) => `- ${warning}`), "", formatTriageUsage()].join("\n"), "warning");
		return;
	}
	await notify(ctx, formatTriageSummary(current.epic, current.state, null, current.warnings, true), current.warnings.length > 0 ? "warning" : "info");
}

type ActiveTriageAction = "status" | "resume" | "start-next" | "switch" | "new" | "cancel";

async function selectActiveTriageAction(ctx: ExtensionCommandContext, current: NonNullable<ReturnType<typeof readCurrentEpic>>): Promise<ActiveTriageAction> {
	if (!ctx.hasUI) return "status";

	const summary = current.state ? computeEpicDependencyStatus(current.state) : null;
	const next = summary?.nextSpec?.name ?? null;
	const progress = current.state && summary ? epicProgressText(current.state, summary.completedSpecs.length) : "state unavailable";
	const labels: Array<{ action: ActiveTriageAction; label: string }> = [
		{ action: "status", label: `Show active epic status (${current.epic.name}; ${progress})` },
		{ action: "resume", label: `Resume triage for active epic (${current.epic.name})` },
		{ action: "start-next", label: next ? `Start next child spec (${next})` : "Start next child spec (none ready)" },
		{ action: "switch", label: "Switch active epic" },
		{ action: "new", label: "Create a new epic" },
		{ action: "cancel", label: "Cancel" },
	];

	const selected = await ctx.ui.select("Active Ralph epic", labels.map((item) => item.label));
	return labels.find((item) => item.label === selected)?.action ?? "cancel";
}

async function switchEpicFromTriage(ctx: ExtensionCommandContext, options: RalphPathOptions): Promise<void> {
	const epics = listEpics({ ...options, allowMissingConfiguredRoots: true });
	if (epics.length === 0) {
		await notify(ctx, `${formatAvailableEpics(epics, options, readCurrentEpicName(options))}\n\nNo epics found to switch to.`, "warning");
		return;
	}

	const selected = await selectEpic(ctx, epics, readCurrentEpicName(options));
	if (!selected) {
		await notify(ctx, `${formatAvailableEpics(epics, options, readCurrentEpicName(options))}\n\nRun /ralph-epic-switch <epic> to select one.`);
		return;
	}

	writeCurrentEpic(selected.name, options);
	const stateRead = safeReadEpicState(selected, options);
	await notify(ctx, formatEpicSwitchSummary(selected, stateRead, options), stateRead.state ? "info" : "warning");
}

async function runTriageCommand(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
	await ctx.waitForIdle();
	const options = pathOptions(ctx);
	const parsed = parseTriageArgs(args);
	if (parsed.error) {
		await notify(ctx, parsed.error, "warning");
		return;
	}

	if (!parsed.epicName) {
		const current = readCurrentEpic(options);
		if (current) {
			if (ctx.hasUI) {
				const action = await selectActiveTriageAction(ctx, current);
				if (action === "status") {
					await showCurrentEpicTriageStatus(ctx, options);
					return;
				}
				if (action === "resume") {
					parsed.epicName = current.epic.name;
					if (!parsed.goal && typeof current.state?.goal === "string") parsed.goal = current.state.goal;
					parsed.warnings.push(`Selected active epic '${current.epic.name}' from interactive triage menu.`);
				} else if (action === "start-next") {
					writeCurrentEpic(current.epic.name, options);
					await runStartCommand(pi, "--next-epic-spec", ctx);
					return;
				} else if (action === "switch") {
					await switchEpicFromTriage(ctx, options);
					return;
				} else if (action === "new") {
					const name = await ctx.ui.input("New epic name", "kebab-case, e.g. auth-system");
					if (name?.trim()) parsed.epicName = name.trim();
				} else {
					await notify(ctx, "Ralph triage menu cancelled.");
					return;
				}
			} else {
				await showCurrentEpicTriageStatus(ctx, options);
				return;
			}
		}
		if (!parsed.epicName && ctx.hasUI) {
			const name = await ctx.ui.input("Epic name", "kebab-case, e.g. auth-system");
			if (name?.trim()) parsed.epicName = name.trim();
		}
		if (!parsed.epicName) {
			await showCurrentEpicTriageStatus(ctx, options);
			return;
		}
	}

	if (!isValidSpecName(parsed.epicName)) {
		await notify(ctx, `Invalid epic name '${parsed.epicName}'. Use kebab-case like 'auth-system'.`, "warning");
		return;
	}

	const epic = resolveEpicDirectory(parsed.epicName, options);
	const existingStateRead = readCompatibleEpicState(epic, options);
	const stateFileExists = existsSync(epic.statePath);
	if (stateFileExists && !existingStateRead.state && !parsed.fresh) {
		await notify(ctx, [`Cannot resume epic '${epic.name}' because .epic-state.json is invalid:`, ...existingStateRead.warnings.map((warning) => `- ${warning}`), "", "Rerun with /ralph-triage --fresh <epic-name> <goal> to regenerate."].join("\n"), "warning");
		return;
	}

	let goal = parsed.goal || (typeof existingStateRead.state?.goal === "string" ? existingStateRead.state.goal : "");
	const shouldDelegate = parsed.fresh || !existsSync(epicMarkdownPath(epic)) || !existingStateRead.state;
	let branchDecision: BranchDecision | null = null;
	if (shouldDelegate) {
		branchDecision = await decideStartBranchBeforeWrites({
			cwd: options.cwd,
			specName: epic.name,
			isNew: shouldDelegate,
			quickMode: false,
			autonomousMode: false,
			dependencies: {
				ui: ctx.hasUI
					? async (title, choices) => {
						const labels = choices.map((choice) => choice.label);
						const selected = await ctx.ui.select(title, labels);
						return choices.find((choice) => choice.label === selected) ?? null;
					}
					: undefined,
			},
		});
		if (branchDecision.aborted) {
			await notify(ctx, branchDecision.reason, "warning");
			return;
		}
		if (!ctx.hasUI && parsed.yes) {
			branchDecision = applyStartBranchApplication(branchDecision, {
				cwd: options.cwd,
				specName: epic.name,
				isNew: shouldDelegate,
				quickMode: false,
				autonomousMode: false,
			});
			if (!branchDecision.applied && (branchDecision.mode === "create-current-branch" || branchDecision.mode === "use-existing-branch" || branchDecision.mode === "create-worktree")) {
				await notify(ctx, branchDecision.reason, "warning");
				return;
			}
		}
	}

	mkdirSync(epic.absolutePath, { recursive: true });
	writeCurrentEpic(epic.name, options);
	if (!goal && shouldDelegate && ctx.hasUI) {
		const inputGoal = await ctx.ui.input("Epic goal", "Describe the large feature you want to build");
		goal = inputGoal?.trim() ?? "";
	}
	if (!goal && shouldDelegate) {
		await notify(ctx, `Epic goal is required for new triage. ${formatTriageUsage()}`, "warning");
		return;
	}

	const files = ensureInitialEpicFiles(epic, parsed, goal);
	if (shouldDelegate) {
		const agentBootstrap = bootstrapRalphAgents(ctx.cwd);
		const dependencyError = triageDependencyError(pi, ctx.cwd, agentBootstrap);
		if (dependencyError) {
			await notify(ctx, dependencyError, "warning");
			return;
		}

		setRalphStatus(ctx, `Ralph triage: running ${TRIAGE_AGENT}`);
		try {
			await notify(ctx, `Running ${TRIAGE_AGENT} for epic ${epic.name} (goal captured; writing epic state)...`);
			const completion = await runRalphSubagent(
				pi,
				{ agentName: TRIAGE_AGENT, description: `Triage epic ${epic.name}`, maxTurns: 80 },
				buildTriagePrompt(epic, parsed, goal, files),
				(agentId) => startRalphSubagentStatusTicker(ctx, "triage", TRIAGE_AGENT, agentId),
			);
			const output = subagentCompletionOutput(completion);
			if (/USER_INPUT_REQUIRED/i.test(output)) {
				await notify(ctx, [`Triage for '${epic.name}' needs user input before finalizing:`, "", output].join("\n"), "warning");
				return;
			}
		} catch (error) {
			await notify(ctx, `Ralph triage failed: ${formatError(error)}`, "warning");
			return;
		} finally {
			setRalphStatus(ctx);
		}
	}

	const postRunRead = readCompatibleEpicState(epic, options);
	let state = normalizeTriageEpicState(epic, postRunRead.state, parsed, goal, options, branchDecision);
	let validationErrors = collectTriageValidationErrors(epic, state);
	state = applyTriageValidation(state, validationErrors);
	writeEpicState(epic, state, options);

	if (validationErrors.length > 0) {
		await notify(
			ctx,
			[
				`Epic triage output for '${epic.name}' did not pass validation:`,
				...validationErrors.map((error) => `- ${error}`),
				"",
				`State was written as blocked: ${epicDisplayPath(epic, ".epic-state.json")}`,
			].join("\n"),
			"warning",
		);
		return;
	}

	const outputBehavior = describeTriageOutputBehavior(state.output);
	const outputExecution = await executeTriageOutputBehavior(ctx, epic, state, options, parsed, outputBehavior);
	state = outputExecution.state;
	const githubSync = outputExecution.githubSync;
	const materialized = outputExecution.materialized;
	validationErrors = materialized?.warnings.length ? materialized.warnings : [];
	const warnings = unique([
		...parsed.warnings,
		...postRunRead.warnings,
		...postRunRead.compatibilityWarnings,
		...(githubSync?.warnings ?? []),
		...validationErrors,
	]);
	const warningOutput = validationErrors.length > 0 || githubSync?.status === "failed" || githubSync?.status === "skipped";
	await notify(ctx, formatTriageSummary(epic, state, materialized, warnings, shouldDelegate === false, githubSync), warningOutput ? "warning" : "info");
}

export default function ralphSpecumExtension(pi: ExtensionAPI) {
	type RalphCoordinatorJob = {
		label: string;
		startedAt: number;
	};

	let activeRalphCoordinatorJob: RalphCoordinatorJob | null = null;

	function installRalphCoordinatorStartupUi(ctx: ExtensionCommandContext, label: string): void {
		ensureRalphInteractiveSurfaces(pi, ctx);
		maybeShowNativeTaskStartupWidget(ctx, label);
		startRalphStatusAnimation(ctx, `Ralph ${label}: coordinator running`);
	}

	function finishRalphCoordinatorJob(ctx: ExtensionCommandContext, job: RalphCoordinatorJob): void {
		if (activeRalphCoordinatorJob !== job) return;
		activeRalphCoordinatorJob = null;
		stopRalphStatusAnimation(ctx);
	}

	function detachRalphCoordinatorWorkflow(
		ctx: ExtensionCommandContext,
		label: string,
		job: RalphCoordinatorJob,
		run: () => Promise<void>,
	): void {
		const detachedWorkflowImmediate = setImmediate(() => {
			const detachedWorkflowTimer = setTimeout(() => {
				void (async () => {
					try {
						await run();
					} catch (error) {
						await notify(ctx, `Ralph ${label} failed: ${formatError(error)}`, "warning");
					} finally {
						finishRalphCoordinatorJob(ctx, job);
					}
				})();
			}, 0);
			(detachedWorkflowTimer as { unref?: () => void }).unref?.();
		});
		(detachedWorkflowImmediate as { unref?: () => void }).unref?.();
	}

	async function startRalphCoordinatorJob(
		ctx: ExtensionCommandContext,
		label: string,
		run: () => Promise<void>,
	): Promise<void> {
		if (activeRalphCoordinatorJob) {
			const elapsedSeconds = Math.max(0, Math.floor((Date.now() - activeRalphCoordinatorJob.startedAt) / 1000));
			await notify(
				ctx,
				`Ralph is already running '${activeRalphCoordinatorJob.label}' (${elapsedSeconds}s elapsed). Wait for it to finish before starting another Ralph workflow command.`,
				"warning",
			);
			return;
		}

		const job: RalphCoordinatorJob = { label, startedAt: Date.now() };
		activeRalphCoordinatorJob = job;

		installRalphCoordinatorStartupUi(ctx, label);
		await notify(ctx, `Started Ralph ${label}. The coordinator will continue in the background; you can keep using Pi while its subagent runs.`);
		detachRalphCoordinatorWorkflow(ctx, label, job, run);
	}

	pi.on("session_start", async (_event, ctx) => {
		await bootstrapBundledRuntimes(pi);
		ensureRalphInteractiveSurfaces(pi, ctx as ExtensionCommandContext);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		activeRalphCoordinatorJob = null;
		ralphFooterState.ctx = null;
		ralphFooterState.subagent = null;
		stopRalphStatusAnimation();
		if (ctx.hasUI) {
			if (typeof ctx.ui.setFooter === "function") ctx.ui.setFooter(undefined);
			if (typeof ctx.ui.setWidget === "function") {
				ctx.ui.setWidget(RALPH_SUBAGENT_WIDGET_KEY, undefined);
				ctx.ui.setWidget(RALPH_NATIVE_TASK_WIDGET_KEY, undefined);
			}
		}
	});

	pi.on("resources_discover", async () => {
		const skillPath = bundledRuntimeSkillsPath();
		return skillPath ? { skillPaths: [skillPath] } : {};
	});

	const ralphFeedbackCommandHandler = createFeedbackCommandHandler(notify);
	// Low-risk core command registration lives in commands/core.ts; workflow-heavy commands remain here until their runners are extracted.
	registerCoreRalphCommands(pi, {
		notify,
		feedbackHandler: ralphFeedbackCommandHandler,
		switchRalphModel: async (args, ctx) => switchRalphModel(pi, args, ctx),
		modelArgumentCompletions,
		indexArgumentCompletions,
		tokenizeCommandArgs,
		statusArgumentCompletions,
		bootstrapStatusDiagnostics: (ctx) => createBootstrapStatusDiagnostics(ctx, { pi, bootstrapRalphAgents, formatDiagnostics }),
		formatRalphSpecStatus: (ctx) => formatRalphSpecStatus(pi, ctx),
		initArgumentCompletions,
		runInit: async (args, ctx) => runRalphInitCommand(args, ctx, {
			pi,
			notify,
			parseInitArgs,
			bootstrapRalphRuntimeConfig,
			bootstrapRalphAgents,
			formatDiagnostics,
		}),
	});

	registerSpecLifecycleCommands(pi, {
		notify,
		startRalphCoordinatorJob,
		startArgumentCompletions,
		phaseArgumentCompletions,
		specArgumentCompletions,
		cancelArgumentCompletions,
		pathOptions,
		runStartCommand,
		RALPH_START_INVOCATION,
		RALPH_NEW_INVOCATION,
		selectSpec,
		currentSpecPath,
		formatAvailableSpecs,
		resolveExistingSpec,
		formatSwitchSummary,
		parseCancelArgs,
		resolveCancelTarget,
		safeReadSpecState,
		formatCancelConfirmation,
		unlinkIfExists,
		clearCurrentSpecIfMatches,
		maybeDeleteSpecDirectory,
		formatStateBeforeCancel,
	});

	pi.registerCommand("ralph-triage", {
		description: "Create or resume a dependency-aware Ralph epic",
		getArgumentCompletions: triageArgumentCompletions,
		handler: async (args, ctx) => startRalphCoordinatorJob(ctx, "triage", () => runTriageCommand(pi, args, ctx)),
	});

	pi.registerCommand("ralph-epic-status", {
		description: "Show active epic child spec readiness; use --json or --repair for machine output/repair",
		getArgumentCompletions: epicStatusArgumentCompletions,
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const options = pathOptions(ctx);
			const parsed = parseEpicStatusArgs(args);
			if (parsed.error) {
				await notify(ctx, `${parsed.error}\nUsage: /ralph-epic-status [--json|--repair] [epic-name]`, "warning");
				return;
			}

			const target = resolveEpicCommandTarget(parsed.reference, options);
			if (!target.epic) {
				await notify(ctx, target.error ?? "Unable to resolve epic.", "warning");
				return;
			}

			const stateRead = safeReadEpicState(target.epic, options);
			if (parsed.json) {
				printJsonOutput(ctx, formatEpicStatusJson(target.epic, stateRead, options), stateRead.state ? "info" : "warning");
				return;
			}
			if (parsed.repair) {
				setRalphStatus(ctx, `Ralph epic repair: ${target.epic.name}`);
				try {
					const repair = repairEpicStatus(target.epic, stateRead, options);
					const status = formatEpicRepairMessage(target.epic, stateRead, repair);
					await notify(ctx, status.message, status.type);
				} finally {
					setRalphStatus(ctx);
				}
				return;
			}

			const status = formatEpicStatusMessage(target.epic, stateRead, options);
			await notify(ctx, status.message, status.type);
		},
	});

	pi.registerCommand("ralph-epic-switch", {
		description: "Switch the active Ralph epic",
		getArgumentCompletions: epicArgumentCompletions,
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const options = pathOptions(ctx);
			const tokenized = tokenizeCommandArgs(args);
			if (tokenized.error) {
				await notify(ctx, tokenized.error, "warning");
				return;
			}
			if (tokenized.tokens.length > 1 || tokenized.tokens.some((token) => token.startsWith("--"))) {
				await notify(ctx, "Usage: /ralph-epic-switch <epic-name>", "warning");
				return;
			}

			let epic: CurrentEpic | undefined;
			const reference = tokenized.tokens[0] ?? "";
			if (!reference) {
				const epics = listEpics({ ...options, allowMissingConfiguredRoots: true });
				if (epics.length === 0) {
					await notify(ctx, `${formatAvailableEpics(epics, options, readCurrentEpicName(options))}\n\nNo epics found to switch to.`, "warning");
					return;
				}

				const selected = await selectEpic(ctx, epics, readCurrentEpicName(options));
				if (!selected) {
					await notify(ctx, `${formatAvailableEpics(epics, options, readCurrentEpicName(options))}\n\nRun /ralph-epic-switch <epic> to select one.`);
					return;
				}
				epic = selected;
			} else {
				const resolved = resolveExistingEpic(reference, options);
				if (!resolved.epic) {
					await notify(ctx, resolved.error ?? `Unable to resolve epic '${reference}'.`, "warning");
					return;
				}
				epic = resolved.epic;
			}

			writeCurrentEpic(epic.name, options);
			const stateRead = safeReadEpicState(epic, options);
			await notify(ctx, formatEpicSwitchSummary(epic, stateRead, options), stateRead.state ? "info" : "warning");
		},
	});

	pi.registerCommand("ralph-epic-next", {
		description: "Select the next unblocked epic child spec",
		getArgumentCompletions: epicNextArgumentCompletions,
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const options = pathOptions(ctx);
			const parsed = parseEpicNextArgs(args);
			if (parsed.error) {
				await notify(ctx, parsed.error, "warning");
				return;
			}

			const target = resolveEpicCommandTarget(parsed.reference, options);
			if (!target.epic) {
				await notify(ctx, target.error ?? "Unable to resolve epic.", "warning");
				return;
			}

			const stateRead = safeReadEpicState(target.epic, options);
			if (!stateRead.state) {
				await notify(ctx, [`Epic '${target.epic.name}' has no readable state.`, ...stateRead.warnings.map((warning) => `- ${warning}`)].join("\n"), "warning");
				return;
			}

			if (stateRead.state.status === "cancelled" || stateRead.state.status === "completed") {
				await notify(ctx, `Epic '${target.epic.name}' is ${stateRead.state.status}; no next child spec can be selected.`, "warning");
				return;
			}

			if (parsed.startSpec) {
				if (parsed.peek) {
					await notify(ctx, "Use either --start or --peek with /ralph-epic-next, not both.", "warning");
					return;
				}
				writeCurrentEpic(target.epic.name, options);
				await startRalphCoordinatorJob(ctx, "start", () => runStartCommand(pi, "--next-epic-spec", ctx));
				return;
			}

			const summary = computeEpicDependencyStatus(stateRead.state);
			const warnings = unique([...(stateRead.warnings ?? []), ...epicValidationWarnings(stateRead.state), ...summary.validation.warnings]);
			const next = summary.nextSpec;
			if (!next) {
				const active = summary.inProgressSpecs[0] ?? (stateRead.state.activeSpec && Array.isArray(stateRead.state.specs) ? stateRead.state.specs.find((spec) => spec.name === stateRead.state?.activeSpec) : undefined);
				const lines = [`No unblocked pending child spec is ready for epic '${target.epic.name}'.`];
				if (active) lines.push(`Active child spec: ${active.name}`, `Next command: /ralph-start ${active.name}`);
				if (summary.dependencyBlockedSpecs.length > 0 || summary.explicitlyBlockedSpecs.length > 0) lines.push("", "Blocked specs:", ...summary.specs.filter((entry) => entry.isDependencyBlocked || entry.isExplicitlyBlocked).map((entry) => `- ${entry.name}: ${formatEpicDependencyReason(entry)}`));
				await notify(ctx, lines.join("\n"), "warning");
				return;
			}

			let updated = false;
			let switchedValue: string | null = null;
			setRalphStatus(ctx, `${parsed.peek ? "Ralph epic next: previewing" : "Ralph epic next: selecting"} ${next.name}`);
			try {
				if (!parsed.peek) {
					try {
						startEpicChildSpec(target.epic, next.name, options);
						updated = true;
					} catch (error) {
						await notify(ctx, `Failed to update epic next child spec: ${formatError(error)}`, "warning");
						return;
					}
				} else if (parsed.switchSpec) {
					warnings.push("--switch ignored because --peek was provided.");
				}

				if (parsed.switchSpec && !parsed.peek) {
					const child = childSpecEntry(next.name, options);
					if (!child.exists) {
						warnings.push(`Child spec directory does not exist, so .current-spec was not changed: ${child.path}`);
					} else {
						try {
							const pointer = writeCurrentSpec(child, options);
							switchedValue = pointer.value;
						} catch (error) {
							await notify(ctx, `Failed to switch current spec: ${formatError(error)}`, "warning");
							return;
						}
					}
				}

				await notify(ctx, formatEpicNextSummary(target.epic, stateRead.state, summary, next, updated, switchedValue, warnings), warnings.length > 0 ? "warning" : "info");
			} finally {
				setRalphStatus(ctx);
			}
		},
	});

	pi.registerCommand("ralph-epic-cancel", {
		description: "Cancel active Ralph epic execution state safely",
		getArgumentCompletions: epicCancelArgumentCompletions,
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const options = pathOptions(ctx);
			const parsed = parseEpicCancelArgs(args);
			if (parsed.error) {
				await notify(ctx, parsed.error, "warning");
				return;
			}

			const target = resolveEpicCancelTarget(parsed.reference, options);
			if (!target.epic) {
				await notify(ctx, target.error ?? "No epic selected for cancellation.", "warning");
				return;
			}

			const stateRead = safeReadEpicState(target.epic, options);
			if (ctx.hasUI) {
				const confirmed = await ctx.ui.confirm(
					"Cancel Ralph epic?",
					formatEpicCancelConfirmation(target.epic, stateRead, parsed.deleteChildSpecs, options),
				);
				if (!confirmed) {
					await notify(ctx, "Ralph epic cancel aborted.");
					return;
				}
			}

			let stateCancelled = false;
			let clearedCurrent = false;
			try {
				stateCancelled = cancelEpicState(target.epic, stateRead.state, options);
				clearedCurrent = readCurrentEpicName(options) === target.epic.name ? clearCurrentEpic(options) : false;
			} catch (error) {
				await notify(ctx, `Failed to clear Ralph epic execution state: ${formatError(error)}`, "warning");
				return;
			}

			const cleanupLines = [
				`- [${stateCancelled ? "x" : " "}] Marked epic state cancelled`,
				`- [${clearedCurrent ? "x" : " "}] Cleared current epic marker`,
			];
			if (parsed.deleteChildSpecs) {
				cleanupLines.push(...await maybeDeleteEpicChildSpecs(ctx, stateRead.state, options));
			} else {
				cleanupLines.push("- [x] Kept child spec directories");
			}

			await notify(
				ctx,
				[
					`Canceled Ralph epic execution for: ${target.epic.name}`,
					"",
					`Location: ${target.epic.path}`,
					...formatEpicStateBeforeCancel(stateRead),
					"",
					"Cleanup:",
					...cleanupLines,
				].join("\n"),
			);
		},
	});


	pi.registerCommand("ralph-research", {
		description: "Generate research.md for the active Ralph spec",
		getArgumentCompletions: phaseArgumentCompletions,
		handler: async (args, ctx) => startRalphCoordinatorJob(ctx, "research", () => runPhaseCommand(pi, PHASE_DEFINITIONS.research, args, ctx)),
	});

	pi.registerCommand("ralph-requirements", {
		description: "Generate requirements.md for the active Ralph spec",
		getArgumentCompletions: phaseArgumentCompletions,
		handler: async (args, ctx) => startRalphCoordinatorJob(ctx, "requirements", () => runPhaseCommand(pi, PHASE_DEFINITIONS.requirements, args, ctx)),
	});

	pi.registerCommand("ralph-design", {
		description: "Generate design.md for the active Ralph spec",
		getArgumentCompletions: phaseArgumentCompletions,
		handler: async (args, ctx) => startRalphCoordinatorJob(ctx, "design", () => runPhaseCommand(pi, PHASE_DEFINITIONS.design, args, ctx)),
	});

	pi.registerCommand("ralph-tasks", {
		description: "Generate canonical tasks.md for the active Ralph spec",
		getArgumentCompletions: (prefix) => phaseArgumentCompletions(prefix, true),
		handler: async (args, ctx) => startRalphCoordinatorJob(ctx, "tasks", () => runPhaseCommand(pi, PHASE_DEFINITIONS.tasks, args, ctx)),
	});

	pi.registerCommand("ralph-implement", {
		description: "Execute tasks.md through Ralph subagents",
		getArgumentCompletions: implementArgumentCompletions,
		handler: async (args, ctx) => startRalphCoordinatorJob(ctx, "implement", () => runImplementCommand(pi, args, ctx)),
	});

	pi.registerCommand("ralph-refactor", {
		description: REFACTOR_COMMAND_DESCRIPTION,
		getArgumentCompletions: refactorArgumentCompletions,
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			ensureRalphInteractiveSurfaces(pi, ctx);
			const tokenized = tokenizeCommandArgs(args);
			if (tokenized.error) {
				await notify(ctx, tokenized.error, "warning");
				return;
			}

			const parsed = parseRefactorArgs(tokenized.tokens);
			if (!parsed.ok) {
				await notify(ctx, formatRefactorParseError((parsed as any).error), "warning");
				return;
			}

			let plan;
			try {
				plan = resolveRefactorSpecPlan({ cwd: ctx.cwd, reference: parsed.options.reference });
			} catch (error) {
				await notify(ctx, formatRefactorResolutionError(error), "warning");
				return;
			}

			const runRefactorStep = async (request: ReturnType<typeof buildRefactorRequest>) => {
				const prompt = buildRefactorSpecialistPrompt(request);
				const selectedKind = request.files[0]?.kind ?? "artifact";
				const specSnapshot = snapshotRefactorSpecDirectory(plan.spec.absolutePath);

				try {
					const completion = await runRalphSubagent(
						pi,
						{
							agentName: "ralph-refactor-specialist",
							description: `Refactor ${selectedKind}.md for ${plan.spec.name}`,
							maxTurns: 50,
						},
						prompt,
						(agentId) => startRalphSubagentStatusTicker(ctx, `refactor ${selectedKind}.md`, "ralph-refactor-specialist", agentId),
					);
					const completionOutput = subagentCompletionOutput(completion);
					const completionValidation = parseRefactorCompletion(completionOutput);
					const audit = auditRefactorSpecMutationScope(specSnapshot, request.allowedFiles);
					if (!completionValidation.ok) {
						restoreRefactorSpecDirectory(specSnapshot);
						await notify(ctx, formatRefactorCompletionValidationError(completionValidation.error), "warning");
						return null;
					}
					if (audit.unauthorizedFiles.length > 0) {
						restoreRefactorSpecDirectory(specSnapshot);
						await notify(
							ctx,
							formatRefactorUnauthorizedEditError(audit.unauthorizedFiles, (filePath) => formatProjectPath(filePath, ctx.cwd)),
							"warning",
						);
						return null;
					}
					return {
						...completionValidation,
						changedFiles: audit.changedFiles,
					};
				} catch (error) {
					restoreRefactorSpecDirectory(specSnapshot);
					await notify(ctx, formatRefactorExecutionError(error), "warning");
					return null;
				}
			};

			let selectedFilePlan = buildRefactorSelectedFilePlan(plan, parsed.options.file);
			if (selectedFilePlan.requiresFileChoice) {
				if (!ctx.hasUI) {
					await notify(ctx, formatRefactorHeadlessDecisionError(plan, selectedFilePlan), "warning");
					return;
				}

				const filePromptPlan = buildRefactorFilePromptPlan(plan);
				const selectedLabel = await ctx.ui.select(filePromptPlan.title, filePromptPlan.options);
				const selectedFile = parseRefactorFilePromptSelection(selectedLabel);
				selectedFilePlan = buildRefactorSelectedFilePlan(plan, selectedFile);
			}

			let selectedSectionPlan = selectedFilePlan.selectedFile
				? buildRefactorSelectedSectionPlan(selectedFilePlan, null)
				: null;
			if (selectedFilePlan.requiresSectionChoice) {
				if (!ctx.hasUI) {
					await notify(ctx, formatRefactorHeadlessDecisionError(plan, selectedFilePlan), "warning");
					return;
				}

				const sectionPromptPlan = buildRefactorSectionPromptPlan(selectedFilePlan);
				const selectedSection = sectionPromptPlan ? await ctx.ui.select(sectionPromptPlan.title, sectionPromptPlan.options) : null;
				selectedSectionPlan = buildRefactorSelectedSectionPlan(selectedFilePlan, selectedSection);
			}

			if (!selectedFilePlan.selectedFile) {
				await notify(ctx, "Rejected /ralph-refactor result: no artifact was selected for delegation.", "warning");
				return;
			}

			const appendCascadeProgress = (sourceFile: "requirements" | "design" | "tasks", targetFile: "requirements" | "design" | "tasks", decision: "approved" | "rejected" | "skipped", reason: string) => {
				appendProgress(
					plan.spec,
					[
						"",
						`### Refactor cascade decision (${new Date().toISOString()})`,
						formatRefactorCascadeProgressEntry(sourceFile, targetFile, decision, reason),
					].join("\n"),
					{ cwd: ctx.cwd },
				);
			};
			const enqueueCascadeSteps = (sourceFile: "requirements" | "design" | "tasks", cascadeNeeded: string | undefined, reason: string, pendingCascades: Array<{ sourceFile: "requirements" | "design" | "tasks"; targetFile: "requirements" | "design" | "tasks"; reason: string }>) => {
				const resolution = resolveRefactorCascadeSteps(sourceFile, cascadeNeeded, plan.availableFiles, reason);
				for (const skipped of resolution.skipped as Array<{ sourceFile: "requirements" | "design" | "tasks"; targetFile: "requirements" | "design" | "tasks"; reason: string }>) {
					appendCascadeProgress(skipped.sourceFile, skipped.targetFile, "skipped", skipped.reason);
					void notify(ctx, formatRefactorCascadeOutcome(skipped.sourceFile, skipped.targetFile, "skipped", skipped.reason), "warning");
				}
				pendingCascades.push(...resolution.pending as Array<{ sourceFile: "requirements" | "design" | "tasks"; targetFile: "requirements" | "design" | "tasks"; reason: string }>);
			};
			const request = buildRefactorRequest(plan, selectedFilePlan, selectedSectionPlan, { cwd: ctx.cwd });
			const pendingCascades: Array<{ sourceFile: "requirements" | "design" | "tasks"; targetFile: "requirements" | "design" | "tasks"; reason: string }> = [];
			const updatedFiles: Array<"requirements" | "design" | "tasks"> = [];
			const updateEvidence: string[] = [];
			const primaryCompletion = await runRefactorStep(request);
			if (!primaryCompletion) return;
			updatedFiles.push(selectedFilePlan.selectedFile as "requirements" | "design" | "tasks");
			if (primaryCompletion.evidence) updateEvidence.push(primaryCompletion.evidence);
			enqueueCascadeSteps(
				selectedFilePlan.selectedFile as "requirements" | "design" | "tasks",
				primaryCompletion.cascadeNeeded,
				primaryCompletion.cascadeReason ?? "Downstream refactor requested.",
				pendingCascades,
			);

			while (pendingCascades.length > 0) {
				const cascade = pendingCascades.shift();
				if (!cascade) continue;

				let decision: "approved" | "rejected" | "skipped" = "skipped";
				if (ctx.hasUI) {
					const promptPlan = buildRefactorCascadePrompt(cascade.sourceFile, cascade.targetFile, cascade.reason);
					decision = await ctx.ui.confirm(promptPlan.title, promptPlan.message) ? "approved" : "rejected";
				} else {
					await notify(ctx, formatRefactorCascadeOutcome(cascade.sourceFile, cascade.targetFile, "skipped", cascade.reason), "warning");
				}

				if (decision !== "approved") {
					appendCascadeProgress(cascade.sourceFile, cascade.targetFile, decision, cascade.reason);
					continue;
				}

				const cascadeRequest = buildApprovedRefactorCascadeRequest(plan, cascade.targetFile, { cwd: ctx.cwd });
				const cascadeCompletion = await runRefactorStep(cascadeRequest);
				if (!cascadeCompletion) return;
				updatedFiles.push(cascade.targetFile as "requirements" | "design" | "tasks");
				if (cascadeCompletion.evidence) updateEvidence.push(cascadeCompletion.evidence);
				enqueueCascadeSteps(
					cascade.targetFile as "requirements" | "design" | "tasks",
					cascadeCompletion.cascadeNeeded,
					cascadeCompletion.cascadeReason ?? "Downstream refactor requested.",
					pendingCascades,
				);
			}

			appendProgress(
				plan.spec,
				buildRefactorArtifactProgressUpdate(updatedFiles, updateEvidence, new Date().toISOString()),
				{ cwd: ctx.cwd },
			);

			const shouldResetTaskIndex = shouldResetRefactorTaskIndex(updatedFiles);
			const statePatch = buildRefactorCoordinatorStatePatch(updatedFiles);
			let state = readRalphState(plan.spec, { cwd: ctx.cwd });
			state = mergeRalphState(plan.spec, statePatch, { cwd: ctx.cwd });
			if (shouldResetTaskIndex) {
				try {
					const mirror = mirrorTasksToNativeTaskCards(pi, ctx, plan.spec, { cwd: ctx.cwd });
					state = mergeRalphState(plan.spec, { taskIndex: 0, ...nativeTaskMirrorStatePatch(mirror) }, { cwd: ctx.cwd });
				} catch (error) {
					state = mergeRalphState(plan.spec, { taskIndex: 0, ...nativeTaskMirrorFailurePatch(state, error) }, { cwd: ctx.cwd });
					await notify(ctx, `Refactor updated tasks.md, but native pi-tasks mirroring failed:\n${formatError(error)}`, "warning");
				}
			}

			const commitResult = commitRefactorSpecIfDirty(plan.spec, Boolean(state.commitSpec));
			if (commitResult.error) {
				await notify(ctx, formatRefactorLocalCommitWarning(plan.spec.name, commitResult.error), "warning");
			}

			await notify(ctx, formatPendingRefactorMessage(parsed.options, plan), "info");
		},
	});



}
