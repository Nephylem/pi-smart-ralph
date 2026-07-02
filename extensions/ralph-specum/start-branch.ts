import { spawnSync } from "node:child_process";

export type StartBranchMode =
	| "not-git"
	| "stay-current"
	| "create-current-branch"
	| "use-existing-branch"
	| "create-worktree"
	| "skipped-existing-spec";

export type BranchDecision = {
	mode: StartBranchMode;
	currentBranch?: string;
	defaultBranch?: string;
	targetBranch?: string;
	worktreePath?: string;
	dirty?: boolean;
	applied: boolean;
	reason: string;
	aborted?: boolean;
};

export type StartBranchUiChoice = {
	mode: StartBranchMode;
	label: string;
	decision: BranchDecision;
};

export type StartBranchUiSelector = (title: string, choices: StartBranchUiChoice[]) => Promise<StartBranchUiChoice | null | undefined>;

export type StartBranchPlanInput = {
	isNew: boolean;
	specName: string;
	currentBranch?: string | null;
	defaultBranch?: string | null;
	dirty?: boolean;
	quickMode?: boolean;
	autonomousMode?: boolean;
};

export type StartBranchGitResult = {
	ok: boolean;
	stdout: string;
	stderr?: string;
};

export type StartBranchGitRunner = (args: string[], options: { cwd: string }) => StartBranchGitResult;

export type StartBranchGitState = {
	insideWorkTree: boolean;
	currentBranch?: string;
	defaultBranch?: string;
	dirty?: boolean;
};

export type StartBranchGitCommand = {
	args: string[];
	description: string;
};

export type StartBranchDependencies = {
	cwd: string;
	git?: StartBranchGitRunner;
	ui?: StartBranchUiSelector;
};

export type DecideStartBranchInput = {
	cwd: string;
	specName: string;
	isNew: boolean;
	quickMode: boolean;
	autonomousMode: boolean;
	dependencies?: Partial<StartBranchDependencies>;
};

function defaultGitRunner(args: string[], options: { cwd: string }): StartBranchGitResult {
	const result = spawnSync("git", args, { cwd: options.cwd, encoding: "utf8" });
	return {
		ok: result.status === 0,
		stdout: (result.stdout ?? "").trim(),
		stderr: (result.stderr ?? "").trim(),
	};
}

function cleanBranchName(value: string | null | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed && trimmed !== "HEAD" ? trimmed : undefined;
}

function safeTargetBranch(specName: string): string {
	return `ralph/${specName}`;
}

function safeWorktreePath(specName: string): string {
	return `../${specName}-worktree`;
}

function abortedBranchDecision(input: StartBranchPlanInput, reason: string): BranchDecision {
	return {
		mode: "stay-current",
		currentBranch: cleanBranchName(input.currentBranch),
		defaultBranch: cleanBranchName(input.defaultBranch),
		dirty: input.dirty,
		applied: false,
		reason,
		aborted: true,
	};
}

export function planStartBranchInteractiveChoices(input: StartBranchPlanInput): StartBranchUiChoice[] {
	if (!input.isNew || input.quickMode || input.autonomousMode) return [];
	const currentBranch = cleanBranchName(input.currentBranch);
	const defaultBranch = cleanBranchName(input.defaultBranch);
	if (!currentBranch) return [];

	const targetBranch = safeTargetBranch(input.specName);
	const worktreePath = safeWorktreePath(input.specName);
	const createWorktreeChoice: StartBranchUiChoice = {
		mode: "create-worktree",
		label: `Create worktree at ${worktreePath} on ${targetBranch}`,
		decision: {
			mode: "create-worktree",
			currentBranch,
			defaultBranch,
			targetBranch,
			worktreePath,
			dirty: input.dirty,
			applied: false,
			reason: "Interactive start selected a separate Ralph worktree before spec writes.",
		},
	};

	if (currentBranch === defaultBranch) {
		// Interactive default branch offers: create-current-branch, then create-worktree.
		return [
			{
				mode: "create-current-branch",
				label: `Create current-directory branch ${targetBranch}`,
				decision: {
					mode: "create-current-branch",
					currentBranch,
					defaultBranch,
					targetBranch,
					dirty: input.dirty,
					applied: false,
					reason: "Interactive start selected current-directory branch creation before spec writes.",
				},
			},
			createWorktreeChoice,
		];
	}

	if (currentBranch !== defaultBranch) {
		// Interactive non-default branch offers: stay-current, then create-worktree.
		return [
			{
				mode: "stay-current",
				label: `Stay-current on ${currentBranch}`,
				decision: {
					mode: "stay-current",
					currentBranch,
					defaultBranch,
					dirty: input.dirty,
					applied: false,
					reason: "Interactive start selected staying on the current non-default branch before spec writes.",
				},
			},
			createWorktreeChoice,
		];
	}

	return [];
}

export function planStartBranchDecision(input: StartBranchPlanInput): BranchDecision {
	if (!input.isNew) {
		return {
			mode: "skipped-existing-spec",
			currentBranch: cleanBranchName(input.currentBranch),
			defaultBranch: cleanBranchName(input.defaultBranch),
			dirty: input.dirty,
			applied: false,
			reason: "Existing spec resume skips branch/worktree changes.",
		};
	}

	const currentBranch = cleanBranchName(input.currentBranch);
	const defaultBranch = cleanBranchName(input.defaultBranch);
	if (!currentBranch) {
		return {
			mode: "not-git",
			defaultBranch,
			dirty: input.dirty,
			applied: false,
			reason: "No git branch was detected before spec writes.",
		};
	}

	if (defaultBranch && currentBranch === defaultBranch && (input.quickMode || input.autonomousMode)) {
		return {
			mode: "create-current-branch",
			currentBranch,
			defaultBranch,
			targetBranch: safeTargetBranch(input.specName),
			dirty: input.dirty,
			applied: false,
			reason: "Quick/autonomous new spec on default branch plans a safe Ralph branch before writes.",
		};
	}

	return {
		mode: "stay-current",
		currentBranch,
		defaultBranch,
		dirty: input.dirty,
		applied: false,
		reason: "Branch decision recorded before spec writes; no branch mutation was required.",
	};
}

export function planStartBranchApplication(decision: BranchDecision): StartBranchGitCommand[] {
	if (decision.mode === "create-current-branch" && decision.targetBranch) {
		return [{ args: ["switch", "-c", decision.targetBranch], description: "Create and switch to the planned Ralph branch." }];
	}

	if (decision.mode === "use-existing-branch" && decision.targetBranch) {
		return [{ args: ["switch", decision.targetBranch], description: "Switch to the selected existing branch." }];
	}

	if (decision.mode === "create-worktree" && decision.worktreePath && decision.targetBranch) {
		return [
			{
				args: ["worktree", "add", "-b", decision.targetBranch, decision.worktreePath],
				description: "Create the selected Ralph worktree.",
			},
		];
	}

	return [];
}

export function collectStartBranchGitState(git: StartBranchGitRunner, cwd: string): StartBranchGitState {
	const insideWorkTree = git(["rev-parse", "--is-inside-work-tree"], { cwd });
	if (!insideWorkTree.ok || insideWorkTree.stdout !== "true") {
		return { insideWorkTree: false };
	}

	const current = git(["branch", "--show-current"], { cwd });
	const defaultRef = git(["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], { cwd });
	const status = git(["status", "--porcelain=v1"], { cwd });
	const defaultBranch = defaultRef.ok ? defaultRef.stdout.replace(/^origin\//, "") : undefined;

	return {
		insideWorkTree: true,
		currentBranch: current.ok ? current.stdout : undefined,
		defaultBranch,
		dirty: status.ok ? status.stdout.length > 0 : undefined,
	};
}

export function applyStartBranchApplication(decision: BranchDecision, input: DecideStartBranchInput): BranchDecision {
	const git = input.dependencies?.git ?? defaultGitRunner;
	const cwd = input.dependencies?.cwd ?? input.cwd;
	for (const command of planStartBranchApplication(decision)) {
		const result = git(command.args, { cwd });
		if (!result.ok) {
			return {
				...decision,
				applied: false,
				reason: `${decision.reason} Git application failed: ${result.stderr || result.stdout || command.description}`,
			};
		}
	}

	return { ...decision, applied: planStartBranchApplication(decision).length > 0 };
}

export function decideStartBranchDecision(input: DecideStartBranchInput): BranchDecision {
	const git = input.dependencies?.git ?? defaultGitRunner;
	const cwd = input.dependencies?.cwd ?? input.cwd;
	const gitState = collectStartBranchGitState(git, cwd);
	if (!gitState.insideWorkTree) {
		return planStartBranchDecision({
			isNew: input.isNew,
			specName: input.specName,
			quickMode: input.quickMode,
			autonomousMode: input.autonomousMode,
		});
	}

	return planStartBranchDecision({
		isNew: input.isNew,
		specName: input.specName,
		currentBranch: gitState.currentBranch,
		defaultBranch: gitState.defaultBranch,
		dirty: gitState.dirty,
		quickMode: input.quickMode,
		autonomousMode: input.autonomousMode,
	});
}

export async function decideStartBranchBeforeWrites(input: DecideStartBranchInput): Promise<BranchDecision> {
	const git = input.dependencies?.git ?? defaultGitRunner;
	const cwd = input.dependencies?.cwd ?? input.cwd;
	const gitState = collectStartBranchGitState(git, cwd);
	const planInput: StartBranchPlanInput = {
		isNew: input.isNew,
		specName: input.specName,
		currentBranch: gitState.currentBranch,
		defaultBranch: gitState.defaultBranch,
		dirty: gitState.dirty,
		quickMode: input.quickMode,
		autonomousMode: input.autonomousMode,
	};

	if (!gitState.insideWorkTree) {
		return planStartBranchDecision({
			isNew: input.isNew,
			specName: input.specName,
			quickMode: input.quickMode,
			autonomousMode: input.autonomousMode,
		});
	}

	const choices = planStartBranchInteractiveChoices(planInput);
	if (choices.length > 0) {
		if (!input.dependencies?.ui) {
			return abortedBranchDecision(planInput, "Ralph start aborted before writes: interactive branch/worktree choice is unavailable.");
		}
		const selected = await input.dependencies.ui("Choose Ralph branch/worktree target", choices);
		if (!selected) {
			return abortedBranchDecision(planInput, "Ralph start aborted before writes: interactive branch/worktree choice was cancelled.");
		}
		return selected.decision;
	}

	return planStartBranchDecision(planInput);
}
