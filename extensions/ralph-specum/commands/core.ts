import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { FEEDBACK_SAFE_COMMAND_DESCRIPTION } from "../feedback.ts";
import { formatRalphIndexCommandResult, runRalphIndex } from "../indexing.ts";

type Notify = (ctx: ExtensionCommandContext, message: string, type?: "info" | "warning") => Promise<void>;

type CommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

type CommandCompletions = (prefix: string) => any[] | null | Promise<any[] | null>;

type CoreCommandDependencies = {
	notify: Notify;
	feedbackHandler: CommandHandler;
	switchRalphModel: CommandHandler;
	modelArgumentCompletions: CommandCompletions;
	indexArgumentCompletions: CommandCompletions;
	tokenizeCommandArgs: (args: string) => { tokens: string[]; error?: string };
	statusArgumentCompletions: CommandCompletions;
	bootstrapStatusDiagnostics: (ctx: ExtensionCommandContext) => { message: string; type: "info" | "warning" };
	formatRalphSpecStatus: (ctx: ExtensionCommandContext) => { message: string; type: "info" | "warning" };
	initArgumentCompletions: CommandCompletions;
	runInit: CommandHandler;
};

export function registerCoreRalphCommands(pi: ExtensionAPI, deps: CoreCommandDependencies): void {
	pi.registerCommand("ralph-help", {
		description: "Show Smart Ralph Pi shell help",
		handler: async (_args, ctx) => {
			await deps.notify(
				ctx,
				[
					"Smart Ralph Pi shell",
					"",
					"Commands:",
					"/ralph-help     Show this help.",
					"/ralph-feedback    Prepare feedback safely with a draft-only flow; no remote submission yet.",
					"/ralph-triage       Create or resume an epic; --output spec-files|github-issues|both; --yes confirms GitHub writes.",
					"/ralph-epic-status  Show active epic readiness; --json prints machine state, --repair fills missing stubs.",
					"/ralph-epic-switch  Switch the active epic marker.",
					"/ralph-epic-next    Preview/select the next unblocked child spec; --peek previews, --switch updates the marker, --start begins it.",
					"/ralph-epic-cancel  Cancel active epic execution state safely; --delete-child-specs also removes child spec dirs after confirmation.",
					"/ralph-start        Create or resume a spec; supports --fresh, --quick, --autonomous, --skip-research, --tasks-size fine|coarse, --next-epic-spec, and `--` before markdown goals.",
					"/ralph-foreground-start    Run a foreground orchestration flow; supports --through brainstorm|plan|tasks|implement|verify, --clarify auto|on|off, --tasks-size fine|coarse, and `--` before markdown goals.",
					"/ralph-foreground-continue Resume the next foreground stage for the active/selected spec.",
					"/ralph-foreground-status   Show foreground workflow state for the active/selected spec.",
					"/ralph-research     Generate research.md with ralph-research-analyst.",
					"/ralph-requirements Generate requirements.md with ralph-product-manager.",
					"/ralph-design       Generate design.md with ralph-architect-reviewer.",
					"/ralph-tasks        Generate canonical tasks.md with ralph-task-planner; supports --quick, --autonomous, --tasks-size fine|coarse, --clarify auto|on|off.",
					"/ralph-implement    Execute tasks.md through Ralph subagents; supports --recovery-mode, --max-task-iterations N, --max-global-iterations N.",
					"/ralph-refactor     Update one existing spec artifact; supports [spec] [--file requirements|design|tasks].",
					"/ralph-index        Generate searchable index artifacts; supports --path, --type, --exclude, --dry-run, --force, --changed, --quick.",
					"/ralph-status       Show specs across configured roots.",
					"/ralph-switch       Switch the active spec marker.",
					"/ralph-cancel       Clear execution state for a spec.",
					"/ralph-model        Show/switch Ralph's inherited Pi model profile; supports auto, anthropic, openai-codex, github-copilot, inherit, provider/model.",
					"/ralph-init         Bootstrap/check Pi tools, runtime defaults, and project Ralph subagents; supports --refresh-agents and --no-runtime-config.",
				].join("\n"),
			);
		},
	});

	pi.registerCommand("ralph-feedback", {
		description: FEEDBACK_SAFE_COMMAND_DESCRIPTION,
		handler: deps.feedbackHandler,
	});

	pi.registerCommand("ralph-model", {
		description: "Show or switch Ralph's inherited Pi model profile across anthropic, openai-codex, and github-copilot",
		getArgumentCompletions: deps.modelArgumentCompletions,
		handler: deps.switchRalphModel,
	});

	pi.registerCommand("ralph-index", {
		description: "Generate searchable component and external index artifacts; supports --path, --type, --exclude, --dry-run, --force, --changed, and --quick",
		getArgumentCompletions: deps.indexArgumentCompletions,
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const tokenized = deps.tokenizeCommandArgs(args);
			if (tokenized.error) {
				await deps.notify(ctx, tokenized.error, "warning");
				return;
			}
			const result = await runRalphIndex({ cwd: ctx.cwd, args: tokenized.tokens });
			await deps.notify(ctx, formatRalphIndexCommandResult(result), result.ok ? "info" : "warning");
		},
	});

	pi.registerCommand("ralph-status", {
		description: "Show Ralph specs across configured roots",
		getArgumentCompletions: deps.statusArgumentCompletions,
		handler: async (args, ctx) => {
			const trimmedArgs = args.trim();
			if (trimmedArgs === "--bootstrap" || trimmedArgs === "--diagnostics") {
				const diagnostics = deps.bootstrapStatusDiagnostics(ctx);
				await deps.notify(ctx, diagnostics.message, diagnostics.type);
				return;
			}

			const status = deps.formatRalphSpecStatus(ctx);
			await deps.notify(ctx, status.message, status.type);
		},
	});

	pi.registerCommand("ralph-init", {
		description: "Bootstrap and validate Smart Ralph dependencies, runtime defaults, and project Ralph subagents; use --refresh-agents to overwrite conflicting ralph-*.md files",
		getArgumentCompletions: deps.initArgumentCompletions,
		handler: deps.runInit,
	});
}
