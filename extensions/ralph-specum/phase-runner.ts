export type PhaseArtifactKind = "research" | "requirements" | "design" | "tasks";

export function containsMarkdownHeading(content: string, heading: string): boolean {
	return new RegExp(`^#{1,3}\\s+${escapeRegExp(heading)}\\b`, "im").test(content);
}

export function validateCanonicalTasks(content: string): string[] {
	const errors: string[] = [];
	const taskLines = content.match(/^\s*-\s*\[[ xX]\]\s+\S+/gm) ?? [];
	if (taskLines.length === 0) errors.push("tasks.md must contain at least one '- [ ]' task.");

	for (const field of ["**Do**", "**Files**", "**Done when**", "**Verify**", "**Commit**"]) {
		if (!content.toLowerCase().includes(field.toLowerCase())) errors.push(`tasks.md missing canonical field: ${field}.`);
	}

	const verifyLines = content.split(/\r?\n/).filter((line) => /\*\*Verify\*\*/i.test(line));
	if (verifyLines.length === 0) errors.push("tasks.md must include automated Verify commands.");
	const manualLine = verifyLines.find((line) => /manual|manually|visually|ask user/i.test(line));
	if (manualLine) errors.push(`tasks.md Verify line must be automated, found manual wording: ${manualLine.trim()}`);

	return errors;
}

export function validatePhaseArtifactContent(kind: PhaseArtifactKind, title: string, content: string): string[] {
	const errors: string[] = [];
	if (!content.trim()) errors.push(`${kind}.md is empty.`);
	if (!containsMarkdownHeading(content, title)) {
		errors.push(`${kind}.md must contain a '${title}' heading.`);
	}

	if (kind === "research") {
		for (const section of ["External Research", "Codebase Analysis", "Sources"]) {
			if (!containsMarkdownHeading(content, section)) errors.push(`research.md missing required section: ${section}.`);
		}
	}
	if (kind === "requirements") {
		for (const section of ["User Stories", "Functional Requirements"]) {
			if (!containsMarkdownHeading(content, section)) errors.push(`requirements.md missing required section: ${section}.`);
		}
	}
	if (kind === "design") {
		for (const section of ["Overview", "File Structure", "Test Strategy"]) {
			if (!containsMarkdownHeading(content, section)) errors.push(`design.md missing required section: ${section}.`);
		}
	}
	if (kind === "tasks") {
		errors.push(...validateCanonicalTasks(content));
	}

	return errors;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
