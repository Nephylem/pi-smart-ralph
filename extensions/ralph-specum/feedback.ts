import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export const FEEDBACK_COMMAND_NAME = "ralph-feedback";
export const FEEDBACK_HELP_LINE = "/ralph-feedback    Prepare feedback safely; draft-only for now and never writes remotely yet.";

export function formatFeedbackDraftOnlyMessage(args: string): string {
	const message = args.trim();
	return [
		"/ralph-feedback is available.",
		message ? `Captured draft message: ${message}` : "No feedback message provided yet.",
		"Current behavior is safe draft-only: no GitHub issue will be created in this step.",
	].join("\n");
}

export async function runFeedbackCommand(args: string, ctx: ExtensionCommandContext, notify: (ctx: ExtensionCommandContext, message: string, type?: "info" | "warning") => Promise<void>): Promise<void> {
	await notify(ctx, formatFeedbackDraftOnlyMessage(args));
}
