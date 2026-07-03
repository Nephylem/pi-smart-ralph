import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

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
	runner?: {
		run: (...args: unknown[]) => Promise<{ stdout?: string; stderr?: string; exitCode?: number }>;
	};
}

export interface FeedbackUsageResult {
	mode: "usage";
	message: string;
	type: "warning";
}

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
		};
		const confirmation = await authorizeFeedbackDraft(draft, parsed, feedbackRuntime);
		if (!confirmation.confirmedDraft) {
			await notify(ctx, renderFeedbackFallback(draft));
			return;
		}

		await executeFeedbackWrite(feedbackRuntime);
		await notify(ctx, renderFeedbackFallback(confirmation.confirmedDraft));
	};
}

export async function authorizeFeedbackDraft(
	draft: FeedbackIssueDraftV1,
	args: FeedbackCommandArgs,
	runtime: FeedbackCommandRuntime,
): Promise<{ confirmedDraft: FeedbackIssueDraftV1 | null }> {
	if (runtime.hasUI && runtime.confirm) {
		const confirmed = await runtime.confirm("Submit feedback to GitHub?", renderFeedbackFallback(draft));
		return {
			confirmedDraft: confirmed ? cloneFeedbackDraftWithConfirmation(draft, "ui") : null,
		};
	}

	if (args.yes) {
		return {
			confirmedDraft: cloneFeedbackDraftWithConfirmation(draft, "yes-flag"),
		};
	}

	return { confirmedDraft: null };
}

async function executeFeedbackWrite(runtime: FeedbackCommandRuntime): Promise<void> {
	if (!runtime.runner?.run) return;
	await runtime.runner.run("gh", ["issue", "create"]);
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
