import { spawnSync } from "node:child_process";
import type { EpicChildSpec, EpicState } from "./epics.ts";

export const RALPH_GITHUB_METADATA_SCHEMA_VERSION = 1;
export const RALPH_GITHUB_METADATA_TOOL = "ralph-specum";

export const DEFAULT_EPIC_LABELS = ["ralph", "epic"] as const;
export const DEFAULT_CHILD_SPEC_LABELS = ["ralph", "spec"] as const;

export type GithubCommandOptions = {
	cwd?: string;
	input?: string;
	env?: Record<string, string | undefined>;
};

export type GithubCommandResult = {
	status: number;
	stdout: string;
	stderr: string;
	error?: string;
};

export type GithubCommandRunner = (args: readonly string[], options?: GithubCommandOptions) => GithubCommandResult;

export type GithubRepository = {
	owner: string;
	name: string;
	nameWithOwner: string;
	url?: string;
};

export type GithubDetectionOptions = GithubCommandOptions & {
	runner?: GithubCommandRunner;
	repository?: GithubRepository;
};

export type GithubDetection = {
	cwd: string;
	ready: boolean;
	gh: {
		available: boolean;
		version?: string;
		error?: string;
	};
	repository: {
		detected: boolean;
		owner?: string;
		name?: string;
		nameWithOwner?: string;
		url?: string;
		error?: string;
	};
	auth: {
		authenticated: boolean;
		output?: string;
		error?: string;
	};
	labels: {
		detected: boolean;
		names: string[];
		error?: string;
	};
};

export type RalphGithubIssueKind = "epic" | "child-spec";

export type RalphGithubIssueMetadata = {
	tool: typeof RALPH_GITHUB_METADATA_TOOL;
	schemaVersion: typeof RALPH_GITHUB_METADATA_SCHEMA_VERSION;
	kind: RalphGithubIssueKind;
	epicName: string;
	specName?: string;
};

export type GithubIssueSyncOptions = GithubCommandOptions & {
	runner?: GithubCommandRunner;
	dryRun?: boolean;
	repository?: GithubRepository;
	labels?: readonly string[];
	availableLabels?: readonly string[];
};

export type GithubIssueSyncAction = "would_create" | "would_update" | "created" | "updated";
export type GithubIssueNumberSource = "state" | "metadata" | "created";

export type GithubIssueSyncResult = {
	dryRun: boolean;
	action: GithubIssueSyncAction;
	operation: "create" | "update";
	issueNumber: number | null;
	issueUrl?: string;
	issueNumberSource?: GithubIssueNumberSource;
	title: string;
	body: string;
	metadata: RalphGithubIssueMetadata;
	metadataComment: string;
	labels: string[];
	missingLabels: string[];
	lookupCommands: string[][];
	writeCommand: string[];
	stateIssueNumberPatch?: Record<string, unknown>;
	warnings: string[];
};

type ExistingIssue = {
	number: number;
	url?: string;
	source: "state" | "metadata";
};

type IssueListItem = Record<string, unknown> & {
	number?: unknown;
	url?: unknown;
	body?: unknown;
};

type IssueDraft = {
	kind: RalphGithubIssueKind;
	title: string;
	body: string;
	metadata: RalphGithubIssueMetadata;
	stateIssueNumber: unknown;
	statePatchForIssueNumber: (issueNumber: number) => Record<string, unknown> | undefined;
	defaultLabels: readonly string[];
};

export function defaultGithubCommandRunner(args: readonly string[], options: GithubCommandOptions = {}): GithubCommandResult {
	const result = spawnSync("gh", [...args], {
		cwd: options.cwd,
		input: options.input,
		env: options.env ? { ...process.env, ...options.env } : process.env,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});

	return {
		status: typeof result.status === "number" ? result.status : 1,
		stdout: typeof result.stdout === "string" ? result.stdout : "",
		stderr: typeof result.stderr === "string" ? result.stderr : "",
		error: result.error?.message,
	};
}

export function detectGithub(options: GithubDetectionOptions = {}): GithubDetection {
	const runner = options.runner ?? defaultGithubCommandRunner;
	const cwd = options.cwd ?? process.cwd();
	const versionResult = runner(["--version"], options);
	const ghAvailable = commandSucceeded(versionResult);
	const ghError = ghAvailable ? undefined : commandError(versionResult, "gh --version failed");
	const version = ghAvailable ? firstLine(versionResult.stdout) : undefined;

	const repository = options.repository ?? (ghAvailable ? detectRepository(runner, options) : undefined);
	const repositoryError = ghAvailable && !repository ? detectRepositoryError(runner, options) : undefined;
	const auth = ghAvailable ? detectAuth(runner, options) : { authenticated: false, error: ghError };
	const labels = ghAvailable && repository ? detectLabels(runner, options, repository) : { detected: false, names: [], error: repository ? ghError : repositoryError ?? ghError };

	return {
		cwd,
		ready: ghAvailable && Boolean(repository) && auth.authenticated,
		gh: {
			available: ghAvailable,
			version,
			error: ghError,
		},
		repository: {
			detected: Boolean(repository),
			owner: repository?.owner,
			name: repository?.name,
			nameWithOwner: repository?.nameWithOwner,
			url: repository?.url,
			error: repository ? undefined : repositoryError ?? ghError,
		},
		auth,
		labels,
	};
}

export function parseGithubIssueNumber(output: string): number | null {
	const patterns = [
		/\/issues\/(\d+)(?:\b|$)/,
		/#(\d+)\b/,
		/\bissue\s+(\d+)\b/i,
		/^\s*(\d+)\s*$/m,
	];

	for (const pattern of patterns) {
		const match = output.match(pattern);
		if (!match) continue;
		const number = Number.parseInt(match[1], 10);
		if (Number.isSafeInteger(number) && number > 0) return number;
	}
	return null;
}

export function collectGithubDetectionWarnings(detection: GithubDetection): string[] {
	return [
		detection.gh.error,
		detection.repository.error,
		detection.auth.error,
		detection.labels.error,
	].filter((value): value is string => Boolean(value));
}

export function parseGithubIssueCreateResult(result: GithubCommandResult, repository?: GithubRepository): { issueNumber: number; issueUrl?: string } {
	const combinedOutput = `${result.stdout}\n${result.stderr}`;
	const issueNumber = parseGithubIssueNumber(combinedOutput);
	if (!issueNumber) {
		throw new Error(`Unable to parse GitHub issue number from gh issue create output: ${trimForMessage(combinedOutput)}`);
	}
	return {
		issueNumber,
		issueUrl: issueUrl(repository, issueNumber),
	};
}

export function ralphGithubMetadataComment(metadata: RalphGithubIssueMetadata): string {
	return `<!-- ralph-specum:${JSON.stringify(orderedMetadata(metadata))} -->`;
}

export function planEpicIssueSync(state: EpicState, options: GithubIssueSyncOptions = {}): GithubIssueSyncResult {
	return syncGithubIssue(epicIssueDraft(state), { ...options, dryRun: true });
}

export function createOrUpdateEpicIssue(state: EpicState, options: GithubIssueSyncOptions = {}): GithubIssueSyncResult {
	return syncGithubIssue(epicIssueDraft(state), options);
}

export function planChildSpecIssueSync(
	state: EpicState,
	childSpec: EpicChildSpec | string,
	options: GithubIssueSyncOptions = {},
): GithubIssueSyncResult {
	const child = typeof childSpec === "string" ? findChildSpec(state, childSpec) : childSpec;
	return syncGithubIssue(childSpecIssueDraft(state, child), { ...options, dryRun: true });
}

export function createOrUpdateChildSpecIssue(
	state: EpicState,
	childSpec: EpicChildSpec | string,
	options: GithubIssueSyncOptions = {},
): GithubIssueSyncResult {
	const child = typeof childSpec === "string" ? findChildSpec(state, childSpec) : childSpec;
	return syncGithubIssue(childSpecIssueDraft(state, child), options);
}

export const syncEpicIssue = createOrUpdateEpicIssue;
export const syncChildSpecIssue = createOrUpdateChildSpecIssue;

export function selectGithubLabels(requestedLabels: readonly string[], availableLabels?: readonly string[]): { labels: string[]; missingLabels: string[] } {
	const requested = uniqueStrings(requestedLabels);
	if (!availableLabels) {
		return { labels: requested, missingLabels: [] };
	}

	const available = new Set(availableLabels.map((label) => label.toLowerCase()));
	const labels = requested.filter((label) => available.has(label.toLowerCase()));
	const missingLabels = requested.filter((label) => !available.has(label.toLowerCase()));
	return { labels, missingLabels };
}

function syncGithubIssue(draft: IssueDraft, options: GithubIssueSyncOptions): GithubIssueSyncResult {
	const runner = options.runner ?? defaultGithubCommandRunner;
	const dryRun = options.dryRun === true;
	const metadataComment = ralphGithubMetadataComment(draft.metadata);
	const body = ensureMetadataComment(draft.body, metadataComment);
	const requestedLabels = options.labels ?? draft.defaultLabels;
	const { labels, missingLabels } = selectGithubLabels(requestedLabels, options.availableLabels);
	const lookupCommands: string[][] = [];
	const warnings: string[] = [];
	const existing = resolveExistingIssue(draft, metadataComment, runner, options, lookupCommands, warnings);
	const operation = existing ? "update" : "create";
	const writeCommand = existing
		? githubIssueEditArgs(existing.number, draft.title, body, labels, options.repository)
		: githubIssueCreateArgs(draft.title, body, labels, options.repository);

	if (dryRun) {
		return {
			dryRun,
			action: existing ? "would_update" : "would_create",
			operation,
			issueNumber: existing?.number ?? null,
			issueUrl: existing?.url,
			issueNumberSource: existing?.source,
			title: draft.title,
			body,
			metadata: draft.metadata,
			metadataComment,
			labels,
			missingLabels,
			lookupCommands,
			writeCommand,
			stateIssueNumberPatch: existing ? draft.statePatchForIssueNumber(existing.number) : undefined,
			warnings,
		};
	}

	if (existing) {
		const result = runner(writeCommand, options);
		assertGhSuccess(result, writeCommand);
		return {
			dryRun,
			action: "updated",
			operation,
			issueNumber: existing.number,
			issueUrl: existing.url,
			issueNumberSource: existing.source,
			title: draft.title,
			body,
			metadata: draft.metadata,
			metadataComment,
			labels,
			missingLabels,
			lookupCommands,
			writeCommand,
			stateIssueNumberPatch: draft.statePatchForIssueNumber(existing.number),
			warnings,
		};
	}

	const result = runner(writeCommand, options);
	assertGhSuccess(result, writeCommand);
	const createdIssue = parseGithubIssueCreateResult(result, options.repository);

	return {
		dryRun,
		action: "created",
		operation,
		issueNumber: createdIssue.issueNumber,
		issueUrl: createdIssue.issueUrl,
		issueNumberSource: "created",
		title: draft.title,
		body,
		metadata: draft.metadata,
		metadataComment,
		labels,
		missingLabels,
		lookupCommands,
		writeCommand,
		stateIssueNumberPatch: draft.statePatchForIssueNumber(createdIssue.issueNumber),
		warnings,
	};
}

function detectRepository(runner: GithubCommandRunner, options: GithubDetectionOptions): GithubRepository | undefined {
	const result = runner(["repo", "view", "--json", "name,owner,url"], options);
	if (!commandSucceeded(result)) return undefined;

	const parsed = parseJsonObject(result.stdout);
	if (!parsed) return undefined;

	const name = stringValue(parsed.name);
	const ownerValue = parsed.owner;
	const owner = typeof ownerValue === "string" ? ownerValue : isRecord(ownerValue) ? stringValue(ownerValue.login) : undefined;
	if (!name || !owner) return undefined;

	return {
		owner,
		name,
		nameWithOwner: `${owner}/${name}`,
		url: stringValue(parsed.url),
	};
}

function detectRepositoryError(runner: GithubCommandRunner, options: GithubDetectionOptions): string | undefined {
	const result = runner(["repo", "view", "--json", "name,owner,url"], options);
	return commandSucceeded(result) ? undefined : commandError(result, "gh repo view failed");
}

function detectAuth(runner: GithubCommandRunner, options: GithubDetectionOptions): GithubDetection["auth"] {
	const result = runner(["auth", "status"], options);
	const output = trimForMessage(`${result.stdout}\n${result.stderr}`);
	return commandSucceeded(result)
		? { authenticated: true, output }
		: { authenticated: false, output, error: commandError(result, "gh auth status failed") };
}

function detectLabels(runner: GithubCommandRunner, options: GithubDetectionOptions, repository: GithubRepository): GithubDetection["labels"] {
	const result = runner(withRepository(["label", "list", "--limit", "200", "--json", "name"], repository), options);
	if (!commandSucceeded(result)) {
		return { detected: false, names: [], error: commandError(result, "gh label list failed") };
	}

	const parsed = parseJsonArray(result.stdout);
	if (!parsed) {
		return { detected: false, names: [], error: "gh label list returned invalid JSON" };
	}

	return {
		detected: true,
		names: uniqueStrings(parsed.map((entry) => (isRecord(entry) ? stringValue(entry.name) : undefined)).filter((name): name is string => Boolean(name))),
	};
}

function lookupExistingIssueByMetadata(
	metadataComment: string,
	runner: GithubCommandRunner,
	options: GithubIssueSyncOptions,
	lookupCommands: string[][],
	warnings: string[],
): ExistingIssue | null {
	const command = githubIssueListArgs(options.repository);
	lookupCommands.push(command);
	const result = runner(command, options);
	if (!commandSucceeded(result)) {
		warnings.push(commandError(result, "gh issue list failed"));
		return null;
	}

	const issues = parseJsonArray(result.stdout) as IssueListItem[] | null;
	if (!issues) {
		warnings.push("gh issue list returned invalid JSON; metadata idempotency lookup was skipped.");
		return null;
	}

	for (const issue of issues) {
		if (!isRecord(issue) || typeof issue.body !== "string" || !issue.body.includes(metadataComment)) continue;
		const issueNumber = normalizeIssueNumber(issue.number);
		if (!issueNumber) continue;
		return {
			number: issueNumber,
			url: stringValue(issue.url),
			source: "metadata",
		};
	}
	return null;
}

function epicIssueDraft(state: EpicState): IssueDraft {
	const metadata: RalphGithubIssueMetadata = orderedMetadata({
		tool: RALPH_GITHUB_METADATA_TOOL,
		schemaVersion: RALPH_GITHUB_METADATA_SCHEMA_VERSION,
		kind: "epic",
		epicName: state.name,
	});
	return {
		kind: "epic",
		title: `Epic: ${state.name}`,
		body: formatEpicIssueBody(state, metadata),
		metadata,
		stateIssueNumber: state.issueNumber,
		statePatchForIssueNumber: (issueNumber) => (normalizeIssueNumber(state.issueNumber) === issueNumber ? undefined : { issueNumber }),
		defaultLabels: DEFAULT_EPIC_LABELS,
	};
}

function childSpecIssueDraft(state: EpicState, child: EpicChildSpec): IssueDraft {
	const metadata: RalphGithubIssueMetadata = orderedMetadata({
		tool: RALPH_GITHUB_METADATA_TOOL,
		schemaVersion: RALPH_GITHUB_METADATA_SCHEMA_VERSION,
		kind: "child-spec",
		epicName: state.name,
		specName: child.name,
	});
	return {
		kind: "child-spec",
		title: `Spec: ${child.name}`,
		body: formatChildSpecIssueBody(state, child, metadata),
		metadata,
		stateIssueNumber: child.issueNumber,
		statePatchForIssueNumber: (issueNumber) => {
			if (normalizeIssueNumber(child.issueNumber) === issueNumber) return undefined;
			return { childSpecName: child.name, issueNumber };
		},
		defaultLabels: DEFAULT_CHILD_SPEC_LABELS,
	};
}

function formatEpicIssueBody(state: EpicState, metadata: RalphGithubIssueMetadata): string {
	const specs = Array.isArray(state.specs) ? state.specs : [];
	const lines = [
		`# Epic: ${state.name}`,
		"",
		state.goal?.trim() || "_No epic goal recorded._",
		"",
		"## Status",
		`- Epic status: ${state.status ?? "draft"}`,
		`- Phase: ${state.phase ?? "unknown"}`,
		"",
		"## Child specs",
	];

	if (specs.length === 0) {
		lines.push("- None recorded");
	} else {
		lines.push("| Spec | Status | Dependencies |", "| --- | --- | --- |");
		for (const spec of specs) {
			if (!isRecord(spec) || typeof spec.name !== "string") continue;
			const dependencies = Array.isArray(spec.dependencies) ? spec.dependencies.filter((dependency): dependency is string => typeof dependency === "string") : [];
			lines.push(`| ${escapeTableCell(spec.name)} | ${escapeTableCell(String(spec.status ?? "pending"))} | ${escapeTableCell(dependencies.join(", ") || "none")} |`);
		}
	}

	lines.push("", "## Ralph metadata", ralphGithubMetadataComment(metadata));
	return lines.join("\n");
}

function formatChildSpecIssueBody(state: EpicState, child: EpicChildSpec, metadata: RalphGithubIssueMetadata): string {
	const dependencies = Array.isArray(child.dependencies) ? child.dependencies.filter((dependency): dependency is string => typeof dependency === "string") : [];
	const acceptanceCriteria = Array.isArray(child.acceptanceCriteria)
		? child.acceptanceCriteria.filter((criterion): criterion is string => typeof criterion === "string" && criterion.trim())
		: [];
	const lines = [
		`# Spec: ${child.name}`,
		"",
		`Parent epic: ${state.name}`,
		"",
		child.goal?.trim() || "_No child spec goal recorded._",
		"",
		"## Status",
		`- Spec status: ${child.status ?? "pending"}`,
		`- Order: ${typeof child.order === "number" ? child.order : "unspecified"}`,
		`- Dependencies: ${dependencies.join(", ") || "none"}`,
		"",
		"## Acceptance criteria",
	];

	if (acceptanceCriteria.length === 0) {
		lines.push("- None recorded");
	} else {
		lines.push(...acceptanceCriteria.map((criterion) => `- ${criterion}`));
	}

	lines.push("", "## Ralph metadata", ralphGithubMetadataComment(metadata));
	return lines.join("\n");
}

function resolveExistingIssue(
	draft: IssueDraft,
	metadataComment: string,
	runner: GithubCommandRunner,
	options: GithubIssueSyncOptions,
	lookupCommands: string[][],
	warnings: string[],
): ExistingIssue | null {
	return lookupExistingIssueFromState(draft, options.repository)
		?? lookupExistingIssueByMetadata(metadataComment, runner, options, lookupCommands, warnings);
}

function lookupExistingIssueFromState(draft: IssueDraft, repository: GithubRepository | undefined): ExistingIssue | null {
	const issueNumber = normalizeIssueNumber(draft.stateIssueNumber);
	return issueNumber ? { number: issueNumber, url: issueUrl(repository, issueNumber), source: "state" } : null;
}

function normalizeIssueNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
	if (typeof value === "string") return parseGithubIssueNumber(value);
	return null;
}

function githubIssueListArgs(repository: GithubRepository | undefined): string[] {
	return withRepository(["issue", "list", "--state", "all", "--limit", "1000", "--json", "number,title,body,url"], repository);
}

export function githubIssueCreateArgs(title: string, body: string, labels: string[], repository: GithubRepository | undefined): string[] {
	return withRepository(["issue", "create", "--title", title, "--body", body, ...labels.flatMap((label) => ["--label", label])], repository);
}

function githubIssueEditArgs(issueNumber: number, title: string, body: string, labels: string[], repository: GithubRepository | undefined): string[] {
	return withRepository(["issue", "edit", String(issueNumber), "--title", title, "--body", body, ...labels.flatMap((label) => ["--add-label", label])], repository);
}

function withRepository(args: string[], repository: GithubRepository | undefined): string[] {
	return repository ? [...args, "--repo", repository.nameWithOwner] : args;
}

function issueUrl(repository: GithubRepository | undefined, issueNumber: number): string | undefined {
	return repository ? `https://github.com/${repository.nameWithOwner}/issues/${issueNumber}` : undefined;
}

function findChildSpec(state: EpicState, specName: string): EpicChildSpec {
	const child = Array.isArray(state.specs) ? state.specs.find((spec) => isRecord(spec) && spec.name === specName) : undefined;
	if (!child || !isRecord(child) || typeof child.name !== "string") {
		throw new Error(`Epic '${state.name}' does not include child spec '${specName}'.`);
	}
	return child as EpicChildSpec;
}

function ensureMetadataComment(body: string, metadataComment: string): string {
	return body.includes(metadataComment) ? body : `${body.trimEnd()}\n\n${metadataComment}\n`;
}

function orderedMetadata(metadata: RalphGithubIssueMetadata): RalphGithubIssueMetadata {
	return metadata.kind === "child-spec"
		? {
			tool: RALPH_GITHUB_METADATA_TOOL,
			schemaVersion: RALPH_GITHUB_METADATA_SCHEMA_VERSION,
			kind: "child-spec",
			epicName: metadata.epicName,
			specName: metadata.specName,
		}
		: {
			tool: RALPH_GITHUB_METADATA_TOOL,
			schemaVersion: RALPH_GITHUB_METADATA_SCHEMA_VERSION,
			kind: "epic",
			epicName: metadata.epicName,
		};
}

function assertGhSuccess(result: GithubCommandResult, args: readonly string[]): void {
	if (commandSucceeded(result)) return;
	throw new Error(`${formatGhCommand(args)} failed: ${commandError(result, "gh command failed")}`);
}

function commandSucceeded(result: GithubCommandResult): boolean {
	return result.status === 0 && !result.error;
}

function commandError(result: GithubCommandResult, fallback: string): string {
	return trimForMessage(result.stderr) || trimForMessage(result.stdout) || result.error || fallback;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(value) as unknown;
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function parseJsonArray(value: string): unknown[] | null {
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		const label = value.trim();
		if (!label || seen.has(label.toLowerCase())) continue;
		seen.add(label.toLowerCase());
		result.push(label);
	}
	return result;
}

function firstLine(value: string): string | undefined {
	return value.split(/\r?\n/).find((line) => line.trim())?.trim();
}

function trimForMessage(value: string): string {
	return value.trim().replace(/\s+/g, " ");
}

function escapeTableCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatGhCommand(args: readonly string[]): string {
	return `gh ${args.map(formatShellToken).join(" ")}`;
}

function formatShellToken(value: string): string {
	return /^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : JSON.stringify(value);
}
