import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export const FEEDBACK_COMMAND_NAME = "ralph-feedback";
export const FEEDBACK_SAFE_COMMAND_DESCRIPTION = "Prepare feedback safely with a draft-only flow";
export const FEEDBACK_SAFE_HELP_LINE = "/ralph-feedback    Prepare feedback safely with a draft-only flow; no remote submission yet.";

export type FeedbackCommandNotify = (ctx: ExtensionCommandContext, message: string, type?: "info" | "warning") => Promise<void>;

export function formatFeedbackDraftOnlyMessage(args: string): string {
	const message = args.trim();
	return [
		"/ralph-feedback is available.",
		message ? `Captured draft message: ${message}` : "No feedback message provided yet.",
		"Current behavior is safe draft-only: no GitHub issue will be created in this step.",
	].join("\n");
}

export function createFeedbackCommandHandler(notify: FeedbackCommandNotify) {
	return async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
		await notify(ctx, formatFeedbackDraftOnlyMessage(args));
	};
}
