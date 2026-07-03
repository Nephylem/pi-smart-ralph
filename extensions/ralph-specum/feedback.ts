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
	const candidateUrl = bugsUrl ?? readPackageBugsUrl();
	if (typeof candidateUrl !== "string" || candidateUrl.trim().length === 0) {
		throw new Error("Feedback target repo is unavailable because package.json bugs.url is missing.");
	}

	const normalizedInput = candidateUrl.trim();
	let parsed: URL;
	try {
		parsed = new URL(normalizedInput);
	} catch {
		throw new Error(`Feedback target repo is unavailable because bugs.url is invalid: ${normalizedInput}`);
	}

	if (parsed.hostname !== "github.com") {
		throw new Error(`Feedback target repo is unavailable because bugs.url must point to github.com/issues: ${normalizedInput}`);
	}

	const parts = parsed.pathname.split("/").filter(Boolean);
	if (parts.length !== 3 || parts[2] !== "issues") {
		throw new Error(`Feedback target repo is unavailable because bugs.url must end with /owner/repo/issues: ${normalizedInput}`);
	}

	return `${parts[0]}/${parts[1]}`;
}

export function buildFeedbackDraft(message: string, input: { targetRepo?: string; labels?: string[]; confirmedBy?: FeedbackConfirmedBy } = {}): FeedbackIssueDraftV1 {
	const trimmedMessage = message.trim();
	const targetRepo = input.targetRepo ?? resolveFeedbackTargetRepo();
	return {
		targetRepo,
		title: trimmedMessage ? `Feedback: ${trimmedMessage.slice(0, 72)}` : "Feedback: No message provided",
		body: [
			"Feedback submitted via /ralph-feedback.",
			"",
			trimmedMessage || "No feedback message provided.",
		].join("\n"),
		labels: [...(input.labels ?? ["feedback"])],
		sourceCommand: FEEDBACK_SOURCE_COMMAND,
		confirmedBy: input.confirmedBy ?? FEEDBACK_DEFAULT_CONFIRMED_BY,
	};
}

export function renderFeedbackFallback(draft: FeedbackIssueDraftV1): string {
	const url = new URL(`https://github.com/${draft.targetRepo}/issues/new`);
	url.searchParams.set("title", draft.title);
	url.searchParams.set("body", draft.body);
	if (draft.labels.length > 0) {
		url.searchParams.set("labels", draft.labels.join(","));
	}

	return [
		"Manual feedback submission fallback",
		`targetRepo: ${draft.targetRepo}`,
		`title: ${draft.title}`,
		`body: ${draft.body}`,
		`labels: ${draft.labels.join(", ") || "(none)"}`,
		`url: ${url.toString()}`,
		`sourceCommand: ${draft.sourceCommand}`,
		`confirmedBy: ${draft.confirmedBy}`,
	].join("\n");
}

export function formatFeedbackDraftOnlyMessage(args: string): string {
	const message = args.trim();
	const draft = buildFeedbackDraft(message, { targetRepo: resolveFeedbackTargetRepo(FEEDBACK_TARGET_BUGS_URL) });
	const fallback = renderFeedbackFallback(draft);
	return [
		"/ralph-feedback is available.",
		message ? `Captured draft message: ${message}` : "No feedback message provided yet.",
		"Current behavior is safe draft-only: no GitHub issue will be created in this step.",
		"",
		fallback,
	].join("\n");
}

export function createFeedbackCommandHandler(notify: FeedbackCommandNotify) {
	return async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
		await notify(ctx, formatFeedbackDraftOnlyMessage(args));
	};
}

function readPackageBugsUrl(): string | undefined {
	const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as { bugs?: { url?: string } };
	return packageJson?.bugs?.url;
}
