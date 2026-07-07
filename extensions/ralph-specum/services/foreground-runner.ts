import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { RalphPathOptions, SpecEntry } from "../paths.ts";
import { getRalphStatePath, mergeRalphState, readRalphState, appendProgress } from "../state.ts";

export type ForegroundStage = "brainstorm" | "plan" | "tasks" | "implement" | "verify";

type Notify = (ctx: ExtensionCommandContext, message: string, type?: "info" | "warning") => Promise<void>;

type Tokenizer = (args: string) => { tokens: string[]; error?: string };

type WorkflowPhaseDefinition = {
	phase: "research" | "requirements" | "design" | "tasks";
	commandName: string;
};

type ResolveExistingSpec = (reference: string, options: RalphPathOptions) => { spec?: SpecEntry; error?: string };
type ResolveCurrentSpec = (options: RalphPathOptions) => SpecEntry | null;
type ReadCurrentSpecValue = (options: RalphPathOptions) => string | null;
type WriteCurrentSpec = (spec: SpecEntry, options: RalphPathOptions) => unknown;

type ForegroundVerificationResult = {
	ok: boolean;
	output: string;
};

export type ForegroundRunnerDependencies = {
	notify: Notify;
	tokenizeCommandArgs: Tokenizer;
	pathOptions: (ctx: ExtensionCommandContext) => RalphPathOptions;
	resolveExistingSpec: ResolveExistingSpec;
	resolveCurrentSpec: ResolveCurrentSpec;
	readCurrentSpecValue: ReadCurrentSpecValue;
	writeCurrentSpec: WriteCurrentSpec;
	runStartCommand: (pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext, invocation: unknown) => Promise<void>;
	runPhaseCommand: (pi: ExtensionAPI, definition: WorkflowPhaseDefinition, args: string, ctx: ExtensionCommandContext) => Promise<void>;
	runImplementCommand: (pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext) => Promise<void>;
	runForegroundVerify: (pi: ExtensionAPI, spec: SpecEntry, ctx: ExtensionCommandContext, options: RalphPathOptions) => Promise<ForegroundVerificationResult>;
	phaseDefinitions: Record<"research" | "requirements" | "design" | "tasks", WorkflowPhaseDefinition>;
	startInvocation: unknown;
	setRalphStatus?: (ctx: ExtensionCommandContext, message?: string) => void;
};

type ParsedForegroundArgs = {
	reference: string | null;
	through: ForegroundStage;
	tasksSize?: "fine" | "coarse";
	clarifyMode?: "auto" | "on" | "off";
	forwardedStartArgs: string;
	error?: string;
};

const FOREGROUND_STAGES: readonly ForegroundStage[] = ["brainstorm", "plan", "tasks", "implement", "verify"] as const;

export async function runForegroundStartCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: ExtensionCommandContext,
	deps: ForegroundRunnerDependencies,
): Promise<void> {
	await ctx.waitForIdle();
	const parsed = parseForegroundArgs(args, deps.tokenizeCommandArgs);
	if (parsed.error) {
		await deps.notify(ctx, parsed.error, "warning");
		return;
	}

	await deps.runStartCommand(pi, parsed.forwardedStartArgs, ctx, deps.startInvocation);
	const options = deps.pathOptions(ctx);
	const resolved = resolveForegroundSpec(parsed.reference, options, deps.resolveExistingSpec, deps.readCurrentSpecValue, deps.resolveCurrentSpec);
	if (!resolved.spec) {
		await deps.notify(ctx, resolved.error ?? "Unable to resolve foreground Ralph spec.", "warning");
		return;
	}

	await runForegroundWorkflow(pi, ctx, resolved.spec, parsed, deps);
}

export async function runForegroundContinueCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: ExtensionCommandContext,
	deps: ForegroundRunnerDependencies,
): Promise<void> {
	await ctx.waitForIdle();
	const parsed = parseForegroundArgs(args, deps.tokenizeCommandArgs);
	if (parsed.error) {
		await deps.notify(ctx, parsed.error, "warning");
		return;
	}
	const options = deps.pathOptions(ctx);
	const resolved = resolveForegroundSpec(parsed.reference, options, deps.resolveExistingSpec, deps.readCurrentSpecValue, deps.resolveCurrentSpec);
	if (!resolved.spec) {
		await deps.notify(ctx, resolved.error ?? "Unable to resolve foreground Ralph spec.", "warning");
		return;
	}

	await runForegroundWorkflow(pi, ctx, resolved.spec, parsed, deps);
}

export async function runForegroundStatusCommand(
	args: string,
	ctx: ExtensionCommandContext,
	deps: Pick<ForegroundRunnerDependencies, "notify" | "tokenizeCommandArgs" | "pathOptions" | "resolveExistingSpec" | "resolveCurrentSpec" | "readCurrentSpecValue">,
): Promise<void> {
	await ctx.waitForIdle();
	const parsed = parseForegroundArgs(args, deps.tokenizeCommandArgs);
	if (parsed.error) {
		await deps.notify(ctx, parsed.error, "warning");
		return;
	}
	const options = deps.pathOptions(ctx);
	const resolved = resolveForegroundSpec(parsed.reference, options, deps.resolveExistingSpec, deps.readCurrentSpecValue, deps.resolveCurrentSpec);
	if (!resolved.spec) {
		await deps.notify(ctx, resolved.error ?? "Unable to resolve foreground Ralph spec.", "warning");
		return;
	}

	const spec = resolved.spec;
	const state = readForegroundState(spec, options);
	const nextStage = detectNextStage(spec, state);
	const foreground = isRecord(state.foreground) ? state.foreground : {};
	await deps.notify(
		ctx,
		[
			`Foreground Ralph status for '${spec.name}'`,
			`Spec: ${spec.path}`,
			`workflowMode: ${typeof state.workflowMode === "string" ? state.workflowMode : "background/default"}`,
			`Status: ${typeof foreground.status === "string" ? foreground.status : "idle"}`,
			`Current stage: ${typeof foreground.currentStage === "string" ? foreground.currentStage : "unknown"}`,
			`Last completed: ${typeof foreground.lastCompletedStage === "string" ? foreground.lastCompletedStage : "none"}`,
			`Verification: ${typeof foreground.verificationStatus === "string" ? foreground.verificationStatus : "pending"}`,
			`Next recommended stage: ${nextStage ?? "complete"}`,
			`State: ${getRalphStatePath(spec, options)}`,
		].join("\n"),
	);
}

function parseForegroundArgs(args: string, tokenize: Tokenizer): ParsedForegroundArgs {
	const tokenized = tokenize(args);
	if (tokenized.error) return { reference: null, through: "verify", forwardedStartArgs: "", error: tokenized.error };

	const forwardedTokens: string[] = [];
	let reference: string | null = null;
	let through: ForegroundStage = "verify";
	let tasksSize: "fine" | "coarse" | undefined;
	let clarifyMode: "auto" | "on" | "off" | undefined;

	for (let index = 0; index < tokenized.tokens.length; index += 1) {
		const token = tokenized.tokens[index];
		if (token === "--") {
			forwardedTokens.push(token, ...tokenized.tokens.slice(index + 1));
			break;
		}
		if (token === "--quick" || token === "--autonomous" || token === "--auto") {
			return {
				reference: null,
				through,
				forwardedStartArgs: "",
				error: "Foreground Ralph owns the orchestration loop; do not combine it with --quick/--autonomous.",
			};
		}
		if (token === "--through" || token.startsWith("--through=")) {
			const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : tokenized.tokens[++index];
			if (!isForegroundStage(value)) return { reference: null, through, forwardedStartArgs: "", error: "--through requires brainstorm, plan, tasks, implement, or verify." };
			through = value;
			continue;
		}
		if (token === "--clarify" || token.startsWith("--clarify=")) {
			const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : tokenized.tokens[++index];
			if (!value || (value !== "auto" && value !== "on" && value !== "off")) {
				return { reference: null, through, forwardedStartArgs: "", error: "--clarify requires auto, on, or off." };
			}
			clarifyMode = value;
			continue;
		}
		if (token === "--tasks-size" || token.startsWith("--tasks-size=")) {
			const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : tokenized.tokens[++index];
			if (!value || (value !== "fine" && value !== "coarse")) {
				return { reference: null, through, forwardedStartArgs: "", error: "--tasks-size requires fine or coarse." };
			}
			tasksSize = value;
			forwardedTokens.push("--tasks-size", value);
			continue;
		}
		if (!reference && !token.startsWith("--")) reference = token;
		forwardedTokens.push(token);
	}

	return {
		reference,
		through,
		tasksSize,
		clarifyMode,
		forwardedStartArgs: stringifyCommandTokens(forwardedTokens),
	};
}

async function runForegroundWorkflow(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	spec: SpecEntry,
	parsed: ParsedForegroundArgs,
	deps: ForegroundRunnerDependencies,
): Promise<void> {
	const options = deps.pathOptions(ctx);
	deps.writeCurrentSpec(spec, options);
	const nextStage = detectNextStage(spec, readForegroundState(spec, options));
	if (!nextStage) {
		await updateForegroundState(spec, options, { status: "completed", verificationStatus: "passed" }, undefined);
		await deps.notify(ctx, `Foreground Ralph: '${spec.name}' is already verified and complete.`);
		return;
	}

	const startIndex = FOREGROUND_STAGES.indexOf(nextStage);
	const targetIndex = FOREGROUND_STAGES.indexOf(parsed.through);
	if (targetIndex < startIndex) {
		await deps.notify(ctx, `Foreground Ralph next stage is '${nextStage}', which is already beyond --through ${parsed.through}. Run /ralph-foreground-status ${spec.name} to inspect current state.`);
		return;
	}

	for (let index = startIndex; index <= targetIndex; index += 1) {
		const stage = FOREGROUND_STAGES[index];
		await updateForegroundState(spec, options, { status: "running", currentStage: stage, targetStage: parsed.through }, stage);
		deps.setRalphStatus?.(ctx, `Ralph foreground: ${stage} (${spec.name})`);
		const result = await runStage(pi, ctx, spec, parsed, stage, deps, options);
		if (!result.ok) {
			await updateForegroundState(spec, options, { status: "blocked", currentStage: stage, lastError: result.message }, stage);
			await deps.notify(ctx, result.message, "warning");
			return;
		}
		await updateForegroundState(spec, options, {
			status: index === targetIndex ? "paused" : "running",
			currentStage: stage,
			lastCompletedStage: stage,
			lastError: null,
			verificationStatus: stage === "verify" ? "passed" : undefined,
		}, stage, true);

		const next = index < targetIndex ? FOREGROUND_STAGES[index + 1] : null;
		if (!next) {
			const completionStatus = stage === "verify" ? "completed" : "paused";
			await updateForegroundState(spec, options, { status: completionStatus }, stage);
			await deps.notify(ctx, formatStageCompletion(spec, stage, next, parsed.through));
			deps.setRalphStatus?.(ctx);
			return;
		}
		const shouldContinue = await confirmContinue(ctx, spec, stage, next);
		if (!shouldContinue) {
			await updateForegroundState(spec, options, { status: "paused" }, stage);
			await deps.notify(ctx, `Foreground Ralph paused after ${stage} for '${spec.name}'. Resume with: /ralph-foreground-continue ${spec.name} --through ${parsed.through}`);
			deps.setRalphStatus?.(ctx);
			return;
		}
	}
	deps.setRalphStatus?.(ctx);
}

async function runStage(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	spec: SpecEntry,
	parsed: ParsedForegroundArgs,
	stage: ForegroundStage,
	deps: ForegroundRunnerDependencies,
	options: RalphPathOptions,
): Promise<{ ok: boolean; message: string }> {
	try {
		if (stage === "brainstorm") {
			await deps.runPhaseCommand(pi, deps.phaseDefinitions.research, buildPhaseArgs(spec, { quick: true }), ctx);
			return phaseOutcome(spec, options, "research", `Foreground brainstorm completed for '${spec.name}'.`);
		}
		if (stage === "plan") {
			if (!artifactExists(spec, "requirements")) {
				await deps.runPhaseCommand(pi, deps.phaseDefinitions.requirements, buildPhaseArgs(spec, { quick: true }), ctx);
				const requirementsOutcome = phaseOutcome(spec, options, "requirements", `Foreground requirements completed for '${spec.name}'.`);
				if (!requirementsOutcome.ok) return requirementsOutcome;
			}
			await deps.runPhaseCommand(pi, deps.phaseDefinitions.design, buildPhaseArgs(spec, { quick: true }), ctx);
			return phaseOutcome(spec, options, "design", `Foreground plan completed for '${spec.name}'.`);
		}
		if (stage === "tasks") {
			await deps.runPhaseCommand(pi, deps.phaseDefinitions.tasks, buildPhaseArgs(spec, { quick: true, tasksSize: parsed.tasksSize, clarifyMode: parsed.clarifyMode }), ctx);
			return phaseOutcome(spec, options, "tasks", `Foreground tasks completed for '${spec.name}'.`);
		}
		if (stage === "implement") {
			await deps.runImplementCommand(pi, spec.path, ctx);
			const state = readForegroundState(spec, options);
			return typeof state.phase === "string" && state.phase === "completed"
				? { ok: true, message: `Foreground implementation completed for '${spec.name}'.` }
				: { ok: false, message: `Foreground implementation did not reach completion for '${spec.name}'. Inspect ${getRalphStatePath(spec, options)} and resume with /ralph-foreground-continue ${spec.name}.` };
		}
		const verification = await deps.runForegroundVerify(pi, spec, ctx, options);
		return verification.ok
			? { ok: true, message: `Foreground verification passed for '${spec.name}'.` }
			: { ok: false, message: verification.output || `Foreground verification failed for '${spec.name}'.` };
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : String(error) };
	}
}

function phaseOutcome(spec: SpecEntry, options: RalphPathOptions, artifact: "research" | "requirements" | "design" | "tasks", successMessage: string) {
	const state = readForegroundState(spec, options);
	if (!artifactExists(spec, artifact)) {
		return { ok: false, message: `Foreground ${artifact} did not produce ${artifact}.md for '${spec.name}'.` };
	}
	if (typeof state.validationError === "string" && state.validationError.trim()) {
		return { ok: false, message: `Foreground ${artifact} finished with validation errors: ${state.validationError}` };
	}
	return { ok: true, message: successMessage };
}

function readForegroundState(spec: SpecEntry, options: RalphPathOptions): Record<string, unknown> {
	try {
		return readRalphState(spec, options) ?? {};
	} catch {
		try {
			const parsed = JSON.parse(readFileSync(getRalphStatePath(spec, options), "utf8"));
			return isRecord(parsed) ? parsed : {};
		} catch {
			return {};
		}
	}
}

function resolveForegroundSpec(
	reference: string | null,
	options: RalphPathOptions,
	resolveExistingSpec: ResolveExistingSpec,
	readCurrentSpecValue: ReadCurrentSpecValue,
	resolveCurrentSpec: ResolveCurrentSpec,
): { spec?: SpecEntry; error?: string } {
	if (reference) return resolveExistingSpec(reference, options);
	const currentValue = readCurrentSpecValue(options);
	if (!currentValue) return { error: "No active spec is set. Start one with /ralph-foreground-start <spec> -- <goal> or pass a spec name/path." };
	const spec = resolveCurrentSpec(options);
	if (!spec) return { error: `Unable to resolve active spec '${currentValue}'.` };
	return { spec };
}

function detectNextStage(spec: SpecEntry, state: Record<string, unknown>): ForegroundStage | null {
	const foreground = isRecord(state.foreground) ? state.foreground : null;
	if (foreground && foreground.verificationStatus === "passed") return null;
	if (!artifactExists(spec, "research")) return "brainstorm";
	if (!artifactExists(spec, "requirements") || !artifactExists(spec, "design")) return "plan";
	if (!artifactExists(spec, "tasks")) return "tasks";
	if (foreground?.lastCompletedStage === "implement") return "verify";
	if (state.phase === "completed") return "verify";
	return "implement";
}

function artifactExists(spec: SpecEntry, artifact: "research" | "requirements" | "design" | "tasks"): boolean {
	return existsSync(join(spec.absolutePath, `${artifact}.md`));
}

function buildPhaseArgs(
	spec: SpecEntry,
	options: { quick?: boolean; tasksSize?: "fine" | "coarse"; clarifyMode?: "auto" | "on" | "off" },
): string {
	const tokens: string[] = [];
	if (options.quick) tokens.push("--quick");
	if (options.tasksSize) tokens.push("--tasks-size", options.tasksSize);
	if (options.clarifyMode) tokens.push("--clarify", options.clarifyMode);
	tokens.push(spec.path);
	return stringifyCommandTokens(tokens);
}

async function confirmContinue(ctx: ExtensionCommandContext, spec: SpecEntry, completed: ForegroundStage, next: ForegroundStage): Promise<boolean> {
	if (!ctx.hasUI) return true;
	return await ctx.ui.confirm(
		"Continue foreground Ralph workflow?",
		[
			`Spec: ${spec.name}`,
			`Completed: ${completed}`,
			`Next stage: ${next}`,
			"",
			"Continue orchestrating subagents in this foreground session?",
		].join("\n"),
	);
}

async function updateForegroundState(
	spec: SpecEntry,
	options: RalphPathOptions,
	patch: Record<string, unknown>,
	stage?: ForegroundStage,
	appendStageProgress = false,
): Promise<void> {
	mergeRalphState(spec, { workflowMode: "foreground", foreground: patch }, options);
	if (!stage) return;
	const status = typeof patch.status === "string" ? patch.status : "updated";
	if (!appendStageProgress) return;
	appendProgress(
		spec,
		[
			"## Learnings",
			`### Foreground workflow: ${stage}`,
			`- Status: ${status}`,
		].join("\n"),
		options,
	);
}

function formatStageCompletion(spec: SpecEntry, stage: ForegroundStage, next: ForegroundStage | null, target: ForegroundStage): string {
	return [
		`Foreground Ralph completed ${stage} for '${spec.name}'.`,
		next ? `Next stage: ${next}` : `Reached target stage: ${target}`,
		`Resume: /ralph-foreground-continue ${spec.name}${next ? ` --through ${target}` : ""}`,
	].join("\n");
}

function stringifyCommandTokens(tokens: string[]): string {
	return tokens.map((token) => needsQuoting(token) ? JSON.stringify(token) : token).join(" ").trim();
}

function needsQuoting(token: string): boolean {
	return /\s|"|'/.test(token);
}

function isForegroundStage(value: string | undefined): value is ForegroundStage {
	return Boolean(value) && (FOREGROUND_STAGES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, any> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
