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

export type RelatedSpecDiscoveryWarning = {
	candidatePath: string;
	reason: string;
};

type CandidateArtifact = {
	spec: SpecEntry;
	artifact: string;
	path: string;
	text: string;
	frontmatter: string;
};

type ScoredRelatedSpecDiscovery = {
	discovery: RelatedSpecDiscovery;
	score: number;
	candidateOrder: number;
};

type DiscoveryOptions = RalphPathOptions & {
	limit?: number;
	warnings?: RelatedSpecDiscoveryWarning[];
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

type ArtifactScore = {
	score: number;
	reasons: string[];
	relationship?: string;
};

function recordDiscoveryWarning(warnings: RelatedSpecDiscoveryWarning[] | undefined, candidatePath: string, reason: string): void {
	warnings?.push({ candidatePath, reason });
}

function readCandidateText(path: string, warnings?: RelatedSpecDiscoveryWarning[]): string | null {
	if (!existsSync(path)) return null;
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		recordDiscoveryWarning(warnings, path, `Skipped unreadable related-spec candidate: ${error instanceof Error ? error.message : String(error)}`);
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

function scanSpecArtifacts(currentSpecName: string, options: DiscoveryOptions): CandidateArtifact[] {
	const artifacts: CandidateArtifact[] = [];
	for (const spec of listSpecs({ ...options, allowMissingConfiguredRoots: true })) {
		if (spec.name === currentSpecName) continue;
		for (const artifact of SPEC_ARTIFACTS) {
			const path = join(spec.absolutePath, artifact);
			const text = readCandidateText(path, options.warnings);
			if (!text) continue;
			artifacts.push({ spec, artifact, path, text, frontmatter: extractFrontmatter(text) });
		}
	}
	return artifacts;
}

function scanIndexHintArtifacts(options: DiscoveryOptions): CandidateArtifact[] {
	const artifacts: CandidateArtifact[] = [];
	for (const root of getSpecRoots({ ...options, allowMissingConfiguredRoots: true })) {
		const indexDir = join(root.absolutePath, ".index");
		if (!existsSync(indexDir)) continue;
		try {
			for (const entry of readdirSync(indexDir, { withFileTypes: true })) {
				if (!entry.isFile() || !/\.(?:json|md|txt)$/i.test(entry.name)) continue;
				const path = join(indexDir, entry.name);
				const text = readCandidateText(path, options.warnings);
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
		} catch (error) {
			recordDiscoveryWarning(options.warnings, indexDir, `Skipped unreadable related-spec index hints: ${error instanceof Error ? error.message : String(error)}`);
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

function scoreRelatedArtifact(artifact: CandidateArtifact, goalTokens: Set<string>, currentContracts: Set<string>): ArtifactScore {
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

function buildRelatedSpecEvidence(score: ArtifactScore, artifact: CandidateArtifact): string {
	const reasonText = score.reasons.length > 0 ? score.reasons.join(", ") : "keyword score";
	return `${reasonText} in ${artifact.artifact}`;
}

function scoredDiscoveryForArtifact(artifact: CandidateArtifact, goalTokens: Set<string>, currentContracts: Set<string>, candidateOrder: number): ScoredRelatedSpecDiscovery | null {
	const scored = scoreRelatedArtifact(artifact, goalTokens, currentContracts);
	if (scored.score <= 0) return null;
	return {
		discovery: {
			name: artifact.spec.name,
			path: artifact.spec.path,
			relationship: scored.relationship,
			relevance: relevanceForScore(scored.score),
			mayNeedUpdate: /mayNeedUpdate|needs update|may need update/i.test(artifact.text),
			evidence: buildRelatedSpecEvidence(scored, artifact),
		},
		score: scored.score,
		candidateOrder,
	};
}

function relevanceRank(relevance: RelatedSpecDiscovery["relevance"] | undefined): number {
	if (relevance === "High") return 3;
	if (relevance === "Medium") return 2;
	if (relevance === "Low") return 1;
	return 0;
}

function compareScoredDiscoveries(a: ScoredRelatedSpecDiscovery, b: ScoredRelatedSpecDiscovery): number {
	return b.score - a.score || relevanceRank(b.discovery.relevance) - relevanceRank(a.discovery.relevance) || a.discovery.name.localeCompare(b.discovery.name) || a.candidateOrder - b.candidateOrder;
}

function limitRelatedSpecs<T>(entries: T[], limit: number): T[] {
	return entries.slice(0, Math.max(0, limit));
}

function combineEvidence(left: string, right: string): string {
	if (!left) return right;
	if (!right || left.includes(right)) return left;
	if (right.includes(left)) return right;
	return `${left}; ${right}`;
}

function mergeScoredDiscoveryBySpecName(entries: ScoredRelatedSpecDiscovery[]): ScoredRelatedSpecDiscovery[] {
	const byName = new Map<string, ScoredRelatedSpecDiscovery>();
	for (const entry of entries) {
		const existing = byName.get(entry.discovery.name);
		if (!existing) {
			byName.set(entry.discovery.name, entry);
			continue;
		}
		byName.set(entry.discovery.name, {
			discovery: {
				...existing.discovery,
				relevance: relevanceRank(entry.discovery.relevance) > relevanceRank(existing.discovery.relevance) ? entry.discovery.relevance : existing.discovery.relevance,
				relationship: existing.discovery.relationship ?? entry.discovery.relationship,
				mayNeedUpdate: existing.discovery.mayNeedUpdate || entry.discovery.mayNeedUpdate,
				evidence: combineEvidence(existing.discovery.evidence, entry.discovery.evidence),
			},
			score: Math.max(existing.score, entry.score),
			candidateOrder: Math.min(existing.candidateOrder, entry.candidateOrder),
		});
	}
	return [...byName.values()];
}

export function discoverRelatedSpecs(currentSpec: SpecEntry, currentGoal: string, options: DiscoveryOptions = {}): RelatedSpecDiscovery[] {
	const limit = options.limit ?? DEFAULT_RELATED_SPEC_LIMIT;
	const currentText = `${currentSpec.name} ${currentGoal}`;
	const goalTokens = tokensFrom(currentText);
	const currentContracts = contractNames(currentText);
	const candidates = [...scanSpecArtifacts(currentSpec.name, options), ...scanIndexHintArtifacts(options)];
	const discoveries: ScoredRelatedSpecDiscovery[] = [];

	for (const [candidateOrder, artifact] of candidates.entries()) {
		if (!artifact.spec.name || artifact.spec.name === currentSpec.name) continue;
		const discovery = scoredDiscoveryForArtifact(artifact, goalTokens, currentContracts, candidateOrder);
		if (discovery) discoveries.push(discovery);
	}

	return limitRelatedSpecs(mergeScoredDiscoveryBySpecName(discoveries).sort(compareScoredDiscoveries), limit)
		.map((entry) => entry.discovery);
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

	return limitRelatedSpecs([...byName.values()], limit);
}
