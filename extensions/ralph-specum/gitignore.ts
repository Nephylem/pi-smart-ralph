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

function findMissingRequiredPatterns(content: string): string[] {
	const existingEntries = new Set(splitGitignoreEntries(content));
	return REQUIRED_RALPH_GITIGNORE_PATTERNS.filter((pattern) => !existingEntries.has(pattern));
}

function hasFinalNewline(content: string): boolean {
	return content.length === 0 || content.endsWith("\n");
}

function formatGitignoreEntries(entries: readonly string[]): string {
	return `${entries.join("\n")}\n`;
}

function appendMissingGitignoreEntries(content: string, missingPatterns: readonly string[]): string {
	const normalizedContent = hasFinalNewline(content) ? content : `${content}\n`;
	return `${normalizedContent}${formatGitignoreEntries(missingPatterns)}`;
}

export function ensureRalphGitignore(cwd: string): RalphGitignoreUpdate {
	const gitignorePath = join(cwd, ".gitignore");
	if (!existsSync(gitignorePath)) {
		writeFileSync(gitignorePath, formatGitignoreEntries(REQUIRED_RALPH_GITIGNORE_PATTERNS), "utf8");
		return { path: gitignorePath, created: true, added: [...REQUIRED_RALPH_GITIGNORE_PATTERNS] };
	}

	const existing = readFileSync(gitignorePath, "utf8");
	const missingPatterns = findMissingRequiredPatterns(existing);
	const normalized =
		missingPatterns.length > 0 ? appendMissingGitignoreEntries(existing, missingPatterns) : hasFinalNewline(existing) ? existing : `${existing}\n`;
	if (normalized !== existing) {
		writeFileSync(gitignorePath, normalized, "utf8");
	}

	return { path: gitignorePath, created: false, added: missingPatterns };
}
