import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

type CommandHandler = (pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext) => Promise<void>;

type ForegroundCommandDependencies = {
	runForegroundStart: CommandHandler;
	runForegroundContinue: CommandHandler;
	runForegroundStatus: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
};

export function registerForegroundRalphCommands(pi: ExtensionAPI, deps: ForegroundCommandDependencies): void {
	pi.registerCommand("ralph-foreground-start", {
		description: "Run a foreground orchestrator workflow that delegates brainstorm, plan, tasks, implement, and verify to Ralph subagents",
		handler: async (args, ctx) => deps.runForegroundStart(pi, args, ctx),
	});

	pi.registerCommand("ralph-foreground-continue", {
		description: "Resume the current/selected foreground Ralph workflow from its next stage",
		handler: async (args, ctx) => deps.runForegroundContinue(pi, args, ctx),
	});

	pi.registerCommand("ralph-foreground-status", {
		description: "Show the current foreground Ralph workflow stage for a spec",
		handler: deps.runForegroundStatus,
	});
}
