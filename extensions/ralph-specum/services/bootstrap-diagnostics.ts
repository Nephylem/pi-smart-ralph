import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

type Notify = (ctx: ExtensionCommandContext, message: string, type?: "info" | "warning") => Promise<void>;

type DiagnosticsResult = { message: string; type: "info" | "warning" };

type AgentBootstrapResult = unknown;
type RuntimeConfigResult = unknown;

type BootstrapDiagnosticsDeps = {
	pi: ExtensionAPI;
	bootstrapRalphAgents: (cwd: string, refreshAgents?: boolean) => AgentBootstrapResult;
	formatDiagnostics: (title: string, pi: ExtensionAPI, cwd: string, agentBootstrap?: AgentBootstrapResult, runtimeConfig?: RuntimeConfigResult) => string;
};

type InitCommandDeps = BootstrapDiagnosticsDeps & {
	notify: Notify;
	parseInitArgs: (args: string) => { error?: string; runtimeConfig?: boolean; refreshAgents?: boolean };
	bootstrapRalphRuntimeConfig: (cwd: string) => RuntimeConfigResult;
};

export function createBootstrapStatusDiagnostics(ctx: ExtensionCommandContext, deps: BootstrapDiagnosticsDeps): DiagnosticsResult {
	const agentBootstrap = deps.bootstrapRalphAgents(ctx.cwd);
	const diagnostics = deps.formatDiagnostics("Smart Ralph Pi status", deps.pi, ctx.cwd, agentBootstrap);
	return diagnosticsResult(diagnostics);
}

export async function runRalphInitCommand(args: string, ctx: ExtensionCommandContext, deps: InitCommandDeps): Promise<void> {
	await ctx.waitForIdle();
	const parsed = deps.parseInitArgs(args);
	if (parsed.error) {
		await deps.notify(ctx, parsed.error, "warning");
		return;
	}
	const runtimeConfig = parsed.runtimeConfig ? deps.bootstrapRalphRuntimeConfig(ctx.cwd) : undefined;
	const agentBootstrap = deps.bootstrapRalphAgents(ctx.cwd, parsed.refreshAgents);
	const diagnostics = deps.formatDiagnostics("Smart Ralph bootstrap diagnostics", deps.pi, ctx.cwd, agentBootstrap, runtimeConfig);
	await deps.notify(ctx, diagnostics, diagnosticsResult(diagnostics).type);
}

function diagnosticsResult(message: string): DiagnosticsResult {
	return { message, type: message.includes("Overall: PASS") ? "info" : "warning" };
}
