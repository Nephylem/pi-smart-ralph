import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { getSpecRoots, listSpecs, type RalphPathOptions, type SpecEntry } from "./paths.ts";

export type RelatedSpecDiscovery = {
	name: string;
	path?: string;
	relationship?: string;
	relevance: "High" | "Medium" | "Low";
	mayNeedUpdate: boolean;
	evidence: string;
};

type CandidateArtifact = {
	spec: SpecEntry;
	artifact: string;
	path: string;
	text: string;
	frontmatter: string;
};

type DiscoveryOptions = RalphPathOptions & {
	limit?: number;
};

const DEFAULT_RELATED_SPEC_LIMIT = 5;
const SPEC_ARTIFACTS = ["requirements.md", "design.md", "plan.md", "research.md", "tasks.md", ".ralph-state.json"] as const;
const CONTRACT_RE = /[A-Z][A-Za-z0-9]+ContractV\d+/g;
const TOKEN_STOP_WORDS = new Set([
	"and",
	"are",
	"for",
	"from",
	"into",
	"match",
	"new",
	"original",
	"parity",
	"ralph",
	"spec",
	"start",
	"that",
	"the",
	"this",
	"with",
]);

function readText(path: string): string | null {
	try {
		return existsSync(path) ? readFileSync(path, "utf8") : null;
	} catch {
		return null;
	}
}

function extractFrontmatter(text: string): string {
	const match = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(text);
	return match?.[1] ?? "";
}

function tokensFrom(text: string): Set<string> {
	const tokens = new Set<string>();
	for (const token of text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
		for (const part of token.split("-")) {
			if (part.length >= 3 && !TOKEN_STOP_WORDS.has(part)) tokens.add(part);
		}
		if (!TOKEN_STOP_WORDS.has(token)) tokens.add(token);
	}
	return tokens;
}

function contractNames(text: string): Set<string> {
	return new Set(text.match(CONTRACT_RE) ?? []);
}

function scanSpecArtifacts(currentSpecName: string, options: RalphPathOptions): CandidateArtifact[] {
	const artifacts: CandidateArtifact[] = [];
	for (const spec of listSpecs({ ...options, allowMissingConfiguredRoots: true })) {
		if (spec.name === currentSpecName) continue;
		for (const artifact of SPEC_ARTIFACTS) {
			const path = join(spec.absolutePath, artifact);
			const text = readText(path);
			if (!text) continue;
			artifacts.push({ spec, artifact, path, text, frontmatter: extractFrontmatter(text) });
		}
	}
	return artifacts;
}

function scanIndexHintArtifacts(options: RalphPathOptions): CandidateArtifact[] {
	const artifacts: CandidateArtifact[] = [];
	for (const root of getSpecRoots({ ...options, allowMissingConfiguredRoots: true })) {
		const indexDir = join(root.absolutePath, ".index");
		if (!existsSync(indexDir)) continue;
		try {
			for (const entry of readdirSync(indexDir, { withFileTypes: true })) {
				if (!entry.isFile() || !/\.(?:json|md|txt)$/i.test(entry.name)) continue;
				const path = join(indexDir, entry.name);
				const text = readText(path);
				if (!text) continue;
				const name = entry.name.replace(/\.(?:json|md|txt)$/i, "");
				artifacts.push({
					spec: {
						name,
						path: relative(root.absolutePath, path),
						absolutePath: path,
						rootPath: root.path,
						rootAbsolutePath: root.absolutePath,
						exists: true,
					},
					artifact: `.index/${entry.name}`,
					path,
					text,
					frontmatter: extractFrontmatter(text),
				});
			}
		} catch {
			// Optional index hints are best-effort and must not rebuild or fail kickoff discovery.
		}
	}
	return artifacts;
}

function relevanceForScore(score: number): RelatedSpecDiscovery["relevance"] {
	if (score >= 8) return "High";
	if (score >= 4) return "Medium";
	return "Low";
}

function relationshipForArtifact(artifact: CandidateArtifact, currentContracts: Set<string>): string | undefined {
	const metadata = artifact.frontmatter || artifact.text.slice(0, 1200);
	const metadataContracts = contractNames(metadata);
	for (const contract of currentContracts) {
		if (metadataContracts.has(contract) || metadata.includes(contract)) return `contract:${contract}`;
	}
	if (/\b(epic|contracts?|dependencies?|consumers?|producer)\b/i.test(metadata)) return "metadata";
	return undefined;
}

function scoreArtifact(artifact: CandidateArtifact, goalTokens: Set<string>, currentContracts: Set<string>): { score: number; reasons: string[]; relationship?: string } {
	let score = 0;
	const reasons: string[] = [];
	const metadata = artifact.frontmatter || artifact.text.slice(0, 1200);
	const relationship = relationshipForArtifact(artifact, currentContracts);
	if (relationship) {
		score += relationship.startsWith("contract:") ? 8 : 3;
		reasons.push(relationship.startsWith("contract:") ? relationship.slice("contract:".length) : "metadata/frontmatter");
	}

	const artifactTokens = tokensFrom(`${artifact.spec.name} ${artifact.text}`);
	let keywordMatches = 0;
	for (const token of goalTokens) {
		if (artifactTokens.has(token)) keywordMatches += 1;
	}
	if (keywordMatches > 0) {
		score += Math.min(keywordMatches, 5);
		reasons.push(`${keywordMatches} keyword match${keywordMatches === 1 ? "" : "es"}`);
	}

	if (/mayNeedUpdate|needs update|downstream|consumer|producer/i.test(metadata)) {
		score += 1;
		reasons.push("dependency hint");
	}

	return { score, reasons, relationship };
}

function mergeDiscoveryBySpecName(entries: RelatedSpecDiscovery[]): RelatedSpecDiscovery[] {
	const byName = new Map<string, RelatedSpecDiscovery>();
	for (const entry of entries) {
		const existing = byName.get(entry.name);
		if (!existing) {
			byName.set(entry.name, entry);
			continue;
		}
		byName.set(entry.name, {
			...existing,
			relevance: relevanceRank(entry.relevance) > relevanceRank(existing.relevance) ? entry.relevance : existing.relevance,
			relationship: existing.relationship ?? entry.relationship,
			mayNeedUpdate: existing.mayNeedUpdate || entry.mayNeedUpdate,
			evidence: combineEvidence(existing.evidence, entry.evidence),
		});
	}
	return [...byName.values()];
}

function relevanceRank(relevance: RelatedSpecDiscovery["relevance"] | undefined): number {
	if (relevance === "High") return 3;
	if (relevance === "Medium") return 2;
	if (relevance === "Low") return 1;
	return 0;
}

function combineEvidence(left: string, right: string): string {
	if (!left) return right;
	if (!right || left.includes(right)) return left;
	if (right.includes(left)) return right;
	return `${left}; ${right}`;
}

export function discoverRelatedSpecs(currentSpec: SpecEntry, currentGoal: string, options: DiscoveryOptions = {}): RelatedSpecDiscovery[] {
	const limit = options.limit ?? DEFAULT_RELATED_SPEC_LIMIT;
	const currentText = `${currentSpec.name} ${currentGoal}`;
	const goalTokens = tokensFrom(currentText);
	const currentContracts = contractNames(currentText);
	const candidates = [...scanSpecArtifacts(currentSpec.name, options), ...scanIndexHintArtifacts(options)];
	const discoveries: RelatedSpecDiscovery[] = [];

	for (const artifact of candidates) {
		if (!artifact.spec.name || artifact.spec.name === currentSpec.name) continue;
		const scored = scoreArtifact(artifact, goalTokens, currentContracts);
		if (scored.score <= 0) continue;
		const reasonText = scored.reasons.length > 0 ? scored.reasons.join(", ") : "keyword score";
		discoveries.push({
			name: artifact.spec.name,
			path: artifact.spec.path,
			relationship: scored.relationship,
			relevance: relevanceForScore(scored.score),
			mayNeedUpdate: /mayNeedUpdate|needs update|may need update/i.test(artifact.text),
			evidence: `${reasonText} in ${artifact.artifact}`,
		});
	}

	return mergeDiscoveryBySpecName(discoveries)
		.sort((a, b) => relevanceRank(b.relevance) - relevanceRank(a.relevance) || a.name.localeCompare(b.name))
		.slice(0, limit);
}

export function mergeRelatedSpecsByName(existing: unknown, discovered: RelatedSpecDiscovery[], limit = DEFAULT_RELATED_SPEC_LIMIT): RelatedSpecDiscovery[] {
	const byName = new Map<string, RelatedSpecDiscovery>();
	for (const entry of Array.isArray(existing) ? existing : []) {
		if (!entry || typeof entry !== "object") continue;
		const candidate = entry as Partial<RelatedSpecDiscovery>;
		if (typeof candidate.name !== "string" || !candidate.name) continue;
		byName.set(candidate.name, {
			name: candidate.name,
			path: typeof candidate.path === "string" ? candidate.path : undefined,
			relationship: typeof candidate.relationship === "string" ? candidate.relationship : undefined,
			relevance: candidate.relevance === "High" || candidate.relevance === "Medium" || candidate.relevance === "Low" ? candidate.relevance : "Low",
			mayNeedUpdate: typeof candidate.mayNeedUpdate === "boolean" ? candidate.mayNeedUpdate : false,
			evidence: typeof candidate.evidence === "string" && candidate.evidence ? candidate.evidence : "Existing related spec preserved from state.",
		});
	}

	for (const entry of discovered) {
		const existingEntry = byName.get(entry.name);
		if (!existingEntry) {
			byName.set(entry.name, entry);
			continue;
		}
		byName.set(entry.name, {
			...existingEntry,
			path: existingEntry.path ?? entry.path,
			relationship: existingEntry.relationship ?? entry.relationship,
			relevance: relevanceRank(existingEntry.relevance) >= relevanceRank(entry.relevance) ? existingEntry.relevance : entry.relevance,
			mayNeedUpdate: existingEntry.mayNeedUpdate || entry.mayNeedUpdate,
			evidence: combineEvidence(existingEntry.evidence, entry.evidence),
		});
	}

	return [...byName.values()].slice(0, limit);
}
