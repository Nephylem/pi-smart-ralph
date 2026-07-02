import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const REQUIRED_RALPH_GITIGNORE_PATTERNS = [
	"specs/.current-spec",
	"specs/.current-epic",
	"**/.progress.md",
	"**/.ralph-state.json",
] as const;

export type RalphGitignoreUpdate = {
	path: string;
	created: boolean;
	added: string[];
};

function splitGitignoreEntries(content: string): string[] {
	return content.split(/\r?\n/).filter((entry) => entry.length > 0);
}

function formatGitignoreEntries(entries: string[]): string {
	return `${entries.join("\n")}\n`;
}

export function ensureRalphGitignore(cwd: string): RalphGitignoreUpdate {
	const gitignorePath = join(cwd, ".gitignore");
	if (!existsSync(gitignorePath)) {
		writeFileSync(gitignorePath, formatGitignoreEntries([...REQUIRED_RALPH_GITIGNORE_PATTERNS]), "utf8");
		return { path: gitignorePath, created: true, added: [...REQUIRED_RALPH_GITIGNORE_PATTERNS] };
	}

	const existing = readFileSync(gitignorePath, "utf8");
	const existingEntries = splitGitignoreEntries(existing);
	const missingPatterns = REQUIRED_RALPH_GITIGNORE_PATTERNS.filter((pattern) => !existingEntries.includes(pattern));
	if (missingPatterns.length === 0) {
		return { path: gitignorePath, created: false, added: [] };
	}

	writeFileSync(gitignorePath, formatGitignoreEntries([...existingEntries, ...missingPatterns]), "utf8");
	return { path: gitignorePath, created: false, added: missingPatterns };
}
