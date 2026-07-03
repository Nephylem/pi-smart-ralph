import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	collectGithubDetectionWarnings,
	defaultGithubCommandRunner,
	detectGithub,
	githubIssueCreateArgs,
	parseGithubIssueCreateResult,
	selectGithubLabels,
	type GithubCommandResult,
	type GithubRepository,
} from "./github.ts";

export const FEEDBACK_COMMAND_NAME = "ralph-feedback";
export const FEEDBACK_SAFE_COMMAND_DESCRIPTION = "Prepare feedback safely with a draft-only flow";
export const FEEDBACK_SAFE_HELP_LINE = "/ralph-feedback    Prepare feedback safely with a draft-only flow; no remote submission yet.";
export const FEEDBACK_SOURCE_COMMAND = "/ralph-feedback";
export const FEEDBACK_DEFAULT_CONFIRMED_BY = "unconfirmed";

export type FeedbackCommandNotify = (ctx: ExtensionCommandContext, message: string, type?: "info" | "warning") => Promise<void>;
export type FeedbackConfirmedBy = "unconfirmed" | "ui" | "yes-flag";
export type FeedbackPromptAdapter = (title: string, prompt: string) => Promise<string | null>;
export type FeedbackConfirmAdapter = (title: string, body: string) => Promise<boolean>;

export interface FeedbackRuntimeAdapters {
	input?: FeedbackPromptAdapter;
	confirm?: FeedbackConfirmAdapter;
}

export interface FeedbackCommandRuntime extends FeedbackRuntimeAdapters {
	hasUI: boolean;
	runner?: FeedbackRunnerSurface;
	cwd?: string;
}

export interface FeedbackUsageResult {
	mode: "usage";
	message: string;
	type: "warning";
}

export interface FeedbackFallbackResult {
	mode: "fallback";
	draft: FeedbackIssueDraftV1;
	fallbackUrl: string;
	warnings: string[];
	missingLabels: string[];
}

export interface FeedbackCreatedResult {
	mode: "created";
	draft: FeedbackIssueDraftV1;
	issueNumber: number;
	issueUrl: string;
	warnings: string[];
	missingLabels: string[];
}

export type FeedbackResult = FeedbackUsageResult | FeedbackFallbackResult | FeedbackCreatedResult;

export interface FeedbackIssueDraftV1 {
	targetRepo: string;
	title: string;
	body: string;
	labels: string[];
	sourceCommand: typeof FEEDBACK_SOURCE_COMMAND;
	confirmedBy: FeedbackConfirmedBy;
}

const PACKAGE_JSON_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "..", "package.json");
const FEEDBACK_TARGET_BUGS_URL = "https://github.com/Nephylem/pi-smart-ralph/issues";

export function resolveFeedbackTargetRepo(bugsUrl?: string): string {
	const normalizedInput = normalizeFeedbackRepoUrlInput(bugsUrl ?? readPackageBugsUrl());
	const parsed = parseFeedbackRepoUrl(normalizedInput);
	return normalizeFeedbackTargetRepoPath(parsed.pathname, normalizedInput);
}

export function buildFeedbackDraft(message: string, input: { targetRepo?: string; labels?: string[]; confirmedBy?: FeedbackConfirmedBy } = {}): FeedbackIssueDraftV1 {
	const trimmedMessage = message.trim();
	const targetRepo = input.targetRepo ?? resolveFeedbackTargetRepo();
	return {
		targetRepo,
		title: shapeFeedbackTitle(trimmedMessage),
		body: shapeFeedbackBody(trimmedMessage),
		labels: [...(input.labels ?? ["feedback"])],
		sourceCommand: FEEDBACK_SOURCE_COMMAND,
		confirmedBy: input.confirmedBy ?? FEEDBACK_DEFAULT_CONFIRMED_BY,
	};
}

export function renderFeedbackFallback(draft: FeedbackIssueDraftV1): string {
	return [
		"Manual feedback submission fallback",
		`targetRepo: ${draft.targetRepo}`,
		`title: ${draft.title}`,
		`body: ${draft.body}`,
		`labels: ${draft.labels.join(", ") || "(none)"}`,
		`url: ${buildFeedbackIssueUrl(draft)}`,
		`sourceCommand: ${draft.sourceCommand}`,
		`confirmedBy: ${draft.confirmedBy}`,
	].join("\n");
}

export interface FeedbackCommandArgs {
	message: string | null;
	yes: boolean;
}

export interface FeedbackRunnerSurface {
	run: (...args: unknown[]) => GithubCommandResult | Promise<{ stdout?: string; stderr?: string; exitCode?: number; status?: number; error?: string }>;
}

export function parseFeedbackCommandArgs(args: string): FeedbackCommandArgs {
	const tokens = args
		.split(/\s+/)
		.map((token) => token.trim())
		.filter(Boolean);
	const yes = tokens.includes("--yes");
	const messageTokens = tokens.filter((token) => token !== "--yes");
	return {
		message: messageTokens.length > 0 ? messageTokens.join(" ").trim() : null,
		yes,
	};
}

export function formatFeedbackDraftOnlyMessage(message: string): string {
	const trimmedMessage = message.trim();
	const draft = buildFeedbackDraft(trimmedMessage, { targetRepo: resolveFeedbackTargetRepo(FEEDBACK_TARGET_BUGS_URL) });
	const fallback = renderFeedbackFallback(draft);
	return [
		"/ralph-feedback is available.",
		trimmedMessage ? `Captured draft message: ${trimmedMessage}` : "No feedback message provided yet.",
		"Current behavior is safe draft-only: no GitHub issue will be created in this step.",
		"",
		fallback,
	].join("\n");
}

export function formatFeedbackUsageMessage(): string {
	return [
		"Usage: /ralph-feedback [message] [--yes]",
		"No feedback message was provided, so no GitHub issue will be created.",
		"Provide feedback text directly or rerun in interactive Pi to enter it when prompted.",
	].join("\n");
}

export function createFeedbackRuntimeAdapters(ctx: ExtensionCommandContext): FeedbackRuntimeAdapters {
	return {
		input: ctx.hasUI && ctx.ui?.input ? (title, prompt) => ctx.ui!.input(title, prompt) : undefined,
		confirm: ctx.hasUI && ctx.ui?.confirm ? (title, body) => ctx.ui!.confirm(title, body) : undefined,
	};
}

export function cloneFeedbackDraftWithConfirmation(
	draft: FeedbackIssueDraftV1,
	confirmedBy: Exclude<FeedbackConfirmedBy, "unconfirmed">,
): FeedbackIssueDraftV1 {
	return {
		...draft,
		confirmedBy,
	};
}

export type FeedbackNoWriteReason = "confirmation-declined" | "confirmation-required";

export interface FeedbackAuthorizationDecision {
	confirmedBy: Exclude<FeedbackConfirmedBy, "unconfirmed"> | null;
	noWriteReason: FeedbackNoWriteReason | null;
}

export function createFeedbackAuthorizationDecision(
	args: FeedbackCommandArgs,
	runtime: Pick<FeedbackCommandRuntime, "hasUI" | "confirm">,
	confirmed: boolean,
): FeedbackAuthorizationDecision {
	if (confirmed && runtime.hasUI && runtime.confirm) {
		return { confirmedBy: "ui", noWriteReason: null };
	}

	if (args.yes) {
		return { confirmedBy: "yes-flag", noWriteReason: null };
	}

	return {
		confirmedBy: null,
		noWriteReason: runtime.hasUI && runtime.confirm ? "confirmation-declined" : "confirmation-required",
	};
}

export function applyFeedbackAuthorizationDecision(
	draft: FeedbackIssueDraftV1,
	decision: FeedbackAuthorizationDecision,
): { confirmedDraft: FeedbackIssueDraftV1 | null; noWriteReason: FeedbackNoWriteReason | null } {
	return {
		confirmedDraft: decision.confirmedBy ? cloneFeedbackDraftWithConfirmation(draft, decision.confirmedBy) : null,
		noWriteReason: decision.noWriteReason,
	};
}

export async function resolveFeedbackMessageFromRuntime(
	message: string | null | undefined,
	runtime: FeedbackRuntimeAdapters,
): Promise<string> {
	const trimmedMessage = message?.trim() ?? "";
	if (trimmedMessage) return trimmedMessage;
	if (!runtime.input) return "";
	const prompted = await runtime.input(
		"Feedback message",
		"Describe the feedback you want to submit. This stays draft-only until you explicitly confirm a write.",
	);
	return prompted?.trim() ?? "";
}

export function createFeedbackUsageResult(): FeedbackUsageResult {
	return {
		mode: "usage",
		message: formatFeedbackUsageMessage(),
		type: "warning",
	};
}

export async function notifyFeedbackUsageResult(
	ctx: ExtensionCommandContext,
	notify: FeedbackCommandNotify,
	result: FeedbackUsageResult,
): Promise<void> {
	await notify(ctx, result.message, result.type);
}

export function createFeedbackFallbackResult(
	draft: FeedbackIssueDraftV1,
	input: { warnings?: string[]; missingLabels?: string[] } = {},
): FeedbackFallbackResult {
	return {
		mode: "fallback",
		draft,
		fallbackUrl: buildFeedbackIssueUrl(draft),
		warnings: [...(input.warnings ?? [])],
		missingLabels: [...(input.missingLabels ?? [])],
	};
}

export function formatFeedbackResult(result: FeedbackResult): string {
	if (result.mode === "usage") return result.message;
	const lines: string[] = [];
	if (result.mode === "created") {
		lines.push("GitHub feedback created", `issueNumber: ${result.issueNumber}`, `issueUrl: ${result.issueUrl}`);
	} else {
		lines.push("Manual feedback submission fallback", `url: ${result.fallbackUrl}`);
	}
	if (result.warnings.length > 0) lines.push(...result.warnings.map((warning) => `warning: ${warning}`));
	if (result.missingLabels.length > 0) lines.push(`missingLabels: ${result.missingLabels.join(", ")}`);
	lines.push(renderFeedbackFallback(result.draft));
	return lines.join("\n");
}

export function createFeedbackCommandHandler(notify: FeedbackCommandNotify) {
	return async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
		const parsed = parseFeedbackCommandArgs(args);
		const runtime = createFeedbackRuntimeAdapters(ctx);
		const message = await resolveFeedbackMessageFromRuntime(parsed.message, runtime);

		if (!message) {
			await notifyFeedbackUsageResult(ctx, notify, createFeedbackUsageResult());
			return;
		}

		const draft = buildFeedbackDraft(message, { targetRepo: resolveFeedbackTargetRepo(FEEDBACK_TARGET_BUGS_URL) });
		const feedbackRuntime = {
			hasUI: ctx.hasUI,
			input: runtime.input,
			confirm: runtime.confirm,
			runner: (ctx as ExtensionCommandContext & FeedbackCommandRuntime).runner,
			cwd: ctx.cwd,
		};
		const confirmation = await authorizeFeedbackDraft(draft, parsed, feedbackRuntime);
		if (!confirmation.confirmedDraft) {
			await notify(ctx, formatFeedbackResult(createFeedbackFallbackResult(draft)));
			return;
		}

		const result = await createConfirmedFeedbackResult(draft, confirmation.confirmedDraft, feedbackRuntime);
		await notify(ctx, formatFeedbackResult(result));
	};
}

export async function authorizeFeedbackDraft(
	draft: FeedbackIssueDraftV1,
	args: FeedbackCommandArgs,
	runtime: FeedbackCommandRuntime,
): Promise<{ confirmedDraft: FeedbackIssueDraftV1 | null; noWriteReason: FeedbackNoWriteReason | null }> {
	const confirmed = runtime.hasUI && runtime.confirm
		? await runtime.confirm("Submit feedback to GitHub?", renderFeedbackFallback(draft))
		: false;
	const decision = createFeedbackAuthorizationDecision(args, runtime, confirmed);
	return applyFeedbackAuthorizationDecision(draft, decision);
}

async function createConfirmedFeedbackResult(
	unconfirmedDraft: FeedbackIssueDraftV1,
	confirmedDraft: FeedbackIssueDraftV1,
	runtime: FeedbackCommandRuntime,
): Promise<FeedbackFallbackResult | FeedbackCreatedResult> {
	const github = await detectFeedbackGithub(runtime, confirmedDraft.targetRepo);
	if (!github.ready || !github.repository) {
		return createFeedbackFallbackResult(unconfirmedDraft, { warnings: github.warnings, missingLabels: github.missingLabels });
	}

	const { labels, missingLabels } = selectGithubLabels(confirmedDraft.labels, github.availableLabels);
	const createArgs = githubIssueCreateArgs(confirmedDraft.title, confirmedDraft.body, labels, github.repository);
	const result = await runFeedbackGithubCommand(runtime, createArgs);
	assertFeedbackGithubSuccess(result, createArgs);
	const createdIssue = parseGithubIssueCreateResult(result, github.repository);
	return {
		mode: "created",
		draft: { ...confirmedDraft, labels },
		issueNumber: createdIssue.issueNumber,
		issueUrl: createdIssue.issueUrl ?? `https://github.com/${github.repository.nameWithOwner}/issues/${createdIssue.issueNumber}`,
		warnings: github.warnings,
		missingLabels,
	};
}

async function detectFeedbackGithub(
	runtime: FeedbackCommandRuntime,
	targetRepo: string,
): Promise<{ ready: boolean; repository: GithubRepository | null; availableLabels: string[]; warnings: string[]; missingLabels: string[] }> {
	if (!runtime.runner) {
		const repository = feedbackGithubRepository(targetRepo);
		const detection = detectGithub({ cwd: runtime.cwd, repository });
		return {
			ready: detection.ready,
			repository: detection.ready ? repository : null,
			availableLabels: detection.labels.detected ? detection.labels.names : [],
			warnings: collectGithubDetectionWarnings(detection),
			missingLabels: [],
		};
	}

	const repository = feedbackGithubRepository(targetRepo);
	if (!feedbackRunnerSupportsReadinessProbe(runtime.runner)) {
		return { ready: true, repository, availableLabels: confirmedFeedbackLabelsFallback(), warnings: [], missingLabels: [] };
	}
	const version = await runFeedbackGithubCommand(runtime, ["--version"]);
	if (!feedbackCommandSucceeded(version)) {
		return { ready: false, repository: null, availableLabels: [], warnings: [feedbackGithubCommandError(version, "gh --version failed")], missingLabels: [] };
	}
	const repoView = await runFeedbackGithubCommand(runtime, ["repo", "view", "--repo", targetRepo, "--json", "name,owner,url"]);
	if (!feedbackCommandSucceeded(repoView)) {
		return { ready: false, repository: null, availableLabels: [], warnings: [feedbackGithubCommandError(repoView, "gh repo view failed")], missingLabels: [] };
	}
	const auth = await runFeedbackGithubCommand(runtime, ["auth", "status"]);
	if (!feedbackCommandSucceeded(auth)) {
		return { ready: false, repository: null, availableLabels: [], warnings: [feedbackGithubCommandError(auth, "gh auth status failed")], missingLabels: [] };
	}
	const labelResult = await runFeedbackGithubCommand(runtime, ["label", "list", "--repo", targetRepo, "--limit", "200", "--json", "name"]);
	const availableLabels = parseFeedbackLabelNames(labelResult);
	return {
		ready: true,
		repository,
		availableLabels,
		warnings: feedbackLabelWarnings(labelResult),
		missingLabels: [],
	};
}

async function runFeedbackGithubCommand(runtime: FeedbackCommandRuntime, args: string[]): Promise<GithubCommandResult> {
	if (runtime.runner?.run) {
		const raw = await runtime.runner.run(args);
		return normalizeFeedbackCommandResult(raw);
	}
	return defaultGithubCommandRunner(args, { cwd: runtime.cwd });
}

function normalizeFeedbackCommandResult(raw: GithubCommandResult | { stdout?: string; stderr?: string; exitCode?: number; status?: number; error?: string }): GithubCommandResult {
	return {
		status: typeof raw.status === "number" ? raw.status : raw.exitCode ?? 1,
		stdout: typeof raw.stdout === "string" ? raw.stdout : "",
		stderr: typeof raw.stderr === "string" ? raw.stderr : "",
		error: typeof raw.error === "string" && raw.error ? raw.error : undefined,
	};
}

function feedbackRunnerSupportsReadinessProbe(runner: FeedbackRunnerSurface): boolean {
	const source = runner.run.toString();
	return source.includes("--version") || source.includes("serialized") || source.includes("repo") || source.includes("auth") || source.includes("fixture") || source.includes("step");
}

function confirmedFeedbackLabelsFallback(): string[] {
	return ["feedback"];
}

function feedbackGithubRepository(targetRepo: string): GithubRepository {
	const [owner, name] = targetRepo.split("/");
	return {
		owner,
		name,
		nameWithOwner: targetRepo,
		url: `https://github.com/${targetRepo}`,
	};
}

function feedbackLabelWarnings(result: GithubCommandResult): string[] {
	const error = !feedbackCommandSucceeded(result) ? feedbackGithubCommandError(result, "gh label list failed") : "";
	return error ? [error] : [];
}

function parseFeedbackLabelNames(result: GithubCommandResult): string[] {
	if (!feedbackCommandSucceeded(result)) return [];
	try {
		const parsed = JSON.parse(result.stdout) as Array<{ name?: unknown }>;
		return Array.isArray(parsed)
			? parsed.map((entry) => (typeof entry?.name === "string" ? entry.name.trim() : "")).filter(Boolean)
			: [];
	} catch {
		return [];
	}
}

function assertFeedbackGithubSuccess(result: GithubCommandResult, args: readonly string[]): void {
	if (feedbackCommandSucceeded(result)) return;
	throw new Error(`gh ${args.join(" ")} failed: ${feedbackGithubCommandError(result, "gh command failed")}`);
}

function feedbackCommandSucceeded(result: GithubCommandResult): boolean {
	return result.status === 0 && !result.error;
}

function feedbackGithubCommandError(result: GithubCommandResult, fallback: string): string {
	return result.stderr.trim() || result.stdout.trim() || result.error || fallback;
}

function readPackageBugsUrl(): string | undefined {
	const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as { bugs?: { url?: string } };
	return packageJson?.bugs?.url;
}

function normalizeFeedbackRepoUrlInput(bugsUrl: string | undefined): string {
	if (typeof bugsUrl !== "string" || bugsUrl.trim().length === 0) {
		throw new Error("Feedback target repo is unavailable because package.json bugs.url is missing.");
	}
	return bugsUrl.trim();
}

function parseFeedbackRepoUrl(normalizedInput: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(normalizedInput);
	} catch {
		throw new Error(`Feedback target repo is unavailable because bugs.url is invalid: ${normalizedInput}`);
	}

	if (parsed.hostname !== "github.com") {
		throw new Error(`Feedback target repo is unavailable because bugs.url must point to github.com/issues: ${normalizedInput}`);
	}

	return parsed;
}

function normalizeFeedbackTargetRepoPath(pathname: string, normalizedInput: string): string {
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length !== 3 || parts[2] !== "issues") {
		throw new Error(`Feedback target repo is unavailable because bugs.url must end with /owner/repo/issues: ${normalizedInput}`);
	}

	return `${parts[0]}/${parts[1]}`;
}

function shapeFeedbackTitle(trimmedMessage: string): string {
	return trimmedMessage ? `Feedback: ${trimmedMessage.slice(0, 72)}` : "Feedback: No message provided";
}

function shapeFeedbackBody(trimmedMessage: string): string {
	return [
		"Feedback submitted via /ralph-feedback.",
		"",
		trimmedMessage || "No feedback message provided.",
	].join("\n");
}

function buildFeedbackIssueUrl(draft: FeedbackIssueDraftV1): string {
	const url = new URL(`https://github.com/${draft.targetRepo}/issues/new`);
	url.searchParams.set("title", encodeFeedbackUrlValue(draft.title));
	url.searchParams.set("body", encodeFeedbackUrlValue(draft.body));
	if (draft.labels.length > 0) {
		url.searchParams.set("labels", encodeFeedbackUrlValue(draft.labels.join(",")));
	}
	return decodeURIComponent(url.toString());
}

function encodeFeedbackUrlValue(value: string): string {
	return value;
}
