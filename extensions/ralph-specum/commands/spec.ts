import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { listSpecs, writeCurrentSpec } from "../paths.ts";
import type { RalphState } from "../state.ts";

type Notify = (ctx: ExtensionCommandContext, message: string, type?: "info" | "warning") => Promise<void>;

type CoordinatorStarter = (ctx: ExtensionCommandContext, label: string, run: () => Promise<void>) => Promise<void>;

type SpecCommandDependencies = {
	notify: Notify;
	startRalphCoordinatorJob: CoordinatorStarter;
	startArgumentCompletions: (prefix: string) => any[] | null;
	phaseArgumentCompletions: (prefix: string) => any[] | null;
	specArgumentCompletions: (prefix: string) => any[] | null;
	cancelArgumentCompletions: (prefix: string) => any[] | null;
	pathOptions: (ctx: ExtensionCommandContext) => any;
	runStartCommand: (pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext, invocation: unknown) => Promise<void>;
	RALPH_START_INVOCATION: unknown;
	RALPH_NEW_INVOCATION: unknown;
	selectSpec: (ctx: ExtensionCommandContext, specs: any[], activeSpecPath: string | null) => Promise<any | null>;
	currentSpecPath: (options: any) => string | null;
	formatAvailableSpecs: (specs: any[], options: any, activeSpecPath: string | null) => string;
	resolveExistingSpec: (reference: string, options: any) => { spec?: any; error?: string };
	formatSwitchSummary: (spec: any, value: string, options: any) => string;
	parseCancelArgs: (args: string) => { error?: string; reference?: string | null; deleteSpec?: boolean };
	resolveCancelTarget: (reference: string | null | undefined, options: any) => { spec?: any; error?: string };
	safeReadSpecState: (spec: any, options: any) => { path: string; state: RalphState | null; error?: string };
	formatCancelConfirmation: (spec: any, stateRead: any, deleteSpec: boolean | undefined, options: any) => string;
	unlinkIfExists: (path: string) => boolean;
	clearCurrentSpecIfMatches: (spec: any, options: any) => boolean;
	maybeDeleteSpecDirectory: (ctx: ExtensionCommandContext, spec: any, options: any) => Promise<string>;
	formatStateBeforeCancel: (stateRead: any) => string[];
};

export function registerSpecLifecycleCommands(pi: ExtensionAPI, deps: SpecCommandDependencies): void {
	pi.registerCommand("ralph-start", {
		description: "Create/resume a Ralph spec; --quick reviews artifacts and implements",
		getArgumentCompletions: deps.startArgumentCompletions,
		handler: async (args, ctx) => deps.startRalphCoordinatorJob(ctx, "start", () => deps.runStartCommand(pi, args, ctx, deps.RALPH_START_INVOCATION)),
	});

	pi.registerCommand("ralph-new", {
		description: "Compatibility alias for /ralph-start",
		getArgumentCompletions: deps.startArgumentCompletions,
		handler: async (args, ctx) => deps.startRalphCoordinatorJob(ctx, "start", () => deps.runStartCommand(pi, args, ctx, deps.RALPH_NEW_INVOCATION)),
	});

	pi.registerCommand("ralph-switch", {
		description: "Switch the active Ralph spec",
		getArgumentCompletions: deps.specArgumentCompletions,
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const options = deps.pathOptions(ctx);
			const reference = args.trim();
			let spec: any | undefined;

			if (!reference) {
				const specs = listSpecs({ ...options, allowMissingConfiguredRoots: true });
				if (specs.length === 0) {
					await deps.notify(ctx, `${deps.formatAvailableSpecs(specs, options, null)}\n\nNo specs found to switch to.`, "warning");
					return;
				}

				const selected = await deps.selectSpec(ctx, specs, deps.currentSpecPath(options));
				if (!selected) {
					await deps.notify(ctx, `${deps.formatAvailableSpecs(specs, options, deps.currentSpecPath(options))}\n\nRun /ralph-switch <name> to select one.`);
					return;
				}
				spec = selected;
			} else {
				const resolved = deps.resolveExistingSpec(reference, options);
				if (!resolved.spec) {
					await deps.notify(ctx, resolved.error ?? `Unable to resolve spec '${reference}'.`, "warning");
					return;
				}
				spec = resolved.spec;
			}

			const pointer = writeCurrentSpec(spec, options);
			await deps.notify(ctx, deps.formatSwitchSummary(pointer.spec, pointer.value, options));
		},
	});

	pi.registerCommand("ralph-cancel", {
		description: "Clear Ralph execution state for a spec",
		getArgumentCompletions: deps.cancelArgumentCompletions,
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const options = deps.pathOptions(ctx);
			const parsed = deps.parseCancelArgs(args);
			if (parsed.error) {
				await deps.notify(ctx, parsed.error, "warning");
				return;
			}

			const target = deps.resolveCancelTarget(parsed.reference, options);
			if (!target.spec) {
				await deps.notify(ctx, target.error ?? "No spec selected for cancellation.", "warning");
				return;
			}

			const spec = target.spec;
			const stateRead = deps.safeReadSpecState(spec, options);
			if (ctx.hasUI) {
				const confirmed = await ctx.ui.confirm(
					"Cancel Ralph execution?",
					deps.formatCancelConfirmation(spec, stateRead, parsed.deleteSpec, options),
				);
				if (!confirmed) {
					await deps.notify(ctx, "Ralph cancel aborted.");
					return;
				}
			}

			let removedState = false;
			let clearedCurrent = false;
			try {
				removedState = deps.unlinkIfExists(stateRead.path);
				clearedCurrent = deps.clearCurrentSpecIfMatches(spec, options);
			} catch (error) {
				await deps.notify(ctx, `Failed to clear Ralph execution state: ${error instanceof Error ? error.message : String(error)}`, "warning");
				return;
			}

			const cleanupLines = [
				`- [${removedState ? "x" : " "}] Removed .ralph-state.json`,
				`- [${clearedCurrent ? "x" : " "}] Cleared current spec marker`,
			];
			if (parsed.deleteSpec) {
				cleanupLines.push(`- ${await deps.maybeDeleteSpecDirectory(ctx, spec, options)}`);
			} else {
				cleanupLines.push("- [x] Kept spec files");
			}

			await deps.notify(
				ctx,
				[
					`Canceled Ralph execution for spec: ${spec.name}`,
					"",
					`Location: ${spec.path}`,
					...deps.formatStateBeforeCancel(stateRead),
					"",
					"Cleanup:",
					...cleanupLines,
				].join("\n"),
			);
		},
	});
}
