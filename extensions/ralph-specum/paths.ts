import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export const DEFAULT_SPECS_DIR = "./specs";
export const CURRENT_SPEC_FILE = ".current-spec";
export const CURRENT_EPIC_FILE = ".current-epic";
export const PI_SETTINGS_FILE = ".pi/ralph-specum.local.md";
export const CLAUDE_SETTINGS_FILE = ".claude/ralph-specum.local.md";

export type RalphPathOptions = {
	cwd?: string;
	settingsFile?: string;
	allowMissingConfiguredRoots?: boolean;
};

export type RalphSettings = {
	settingsFile: string | null;
	specsDirs: string[];
};

export type SpecRoot = {
	path: string;
	absolutePath: string;
	exists: boolean;
	source: "default" | "settings";
};

export type SpecEntry = {
	name: string;
	path: string;
	absolutePath: string;
	rootPath: string;
	rootAbsolutePath: string;
	exists: boolean;
};

export type CurrentSpecPointer = {
	filePath: string;
	value: string;
	spec: SpecEntry;
};

export type CurrentEpic = {
	name: string;
	path: string;
	absolutePath: string;
	statePath: string;
	progressPath: string;
	exists: boolean;
};

export type SpecResolutionErrorCode = "missing_current_spec" | "empty_current_spec" | "not_found" | "ambiguous";

export class SpecResolutionError extends Error {
	code: SpecResolutionErrorCode;
	matches: SpecEntry[];

	constructor(code: SpecResolutionErrorCode, message: string, matches: SpecEntry[] = []) {
		super(message);
		this.name = "SpecResolutionError";
		this.code = code;
		this.matches = matches;
	}
}

export function getRalphCwd(options: RalphPathOptions = {}): string {
	return resolve(options.cwd ?? process.env.RALPH_CWD ?? process.cwd());
}

export function normalizePathText(pathText: string): string {
	let normalized = pathText.trim().replace(/\\/g, "/");
	while (normalized.length > 1 && normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	return normalized || ".";
}

export function isPathReference(value: string): boolean {
	const normalized = normalizePathText(value);
	return isAbsolute(normalized) || normalized.startsWith("./") || normalized.startsWith("../") || normalized.includes("/");
}

export function findRalphSettingsFile(options: RalphPathOptions = {}): string | null {
	const cwd = getRalphCwd(options);
	const candidates = options.settingsFile
		? [toAbsolutePath(options.settingsFile, cwd)]
		: [join(cwd, PI_SETTINGS_FILE), join(cwd, CLAUDE_SETTINGS_FILE)];

	return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function readRalphSettings(options: RalphPathOptions = {}): RalphSettings {
	const settingsFile = findRalphSettingsFile(options);
	if (!settingsFile) {
		return { settingsFile: null, specsDirs: [] };
	}

	const content = readFileSync(settingsFile, "utf8");
	return {
		settingsFile,
		specsDirs: parseSpecsDirs(extractFrontmatter(content)),
	};
}

export function getSpecRoots(options: RalphPathOptions = {}): SpecRoot[] {
	const cwd = getRalphCwd(options);
	const settings = readRalphSettings(options);
	const configuredDirs = settings.specsDirs.length > 0 ? settings.specsDirs : [DEFAULT_SPECS_DIR];
	const source: SpecRoot["source"] = settings.specsDirs.length > 0 ? "settings" : "default";
	const roots: SpecRoot[] = [];
	const seen = new Set<string>();

	for (const configuredDir of configuredDirs) {
		const absolutePath = toAbsolutePath(configuredDir, cwd);
		const exists = existsSync(absolutePath);
		if (source === "settings" && !exists && !options.allowMissingConfiguredRoots) {
			continue;
		}
		if (seen.has(absolutePath)) {
			continue;
		}
		seen.add(absolutePath);
		roots.push({ path: displayPath(absolutePath, cwd), absolutePath, exists, source });
	}

	if (roots.length > 0) {
		return roots;
	}

	const defaultAbsolutePath = toAbsolutePath(DEFAULT_SPECS_DIR, cwd);
	return [
		{
			path: displayPath(defaultAbsolutePath, cwd),
			absolutePath: defaultAbsolutePath,
			exists: existsSync(defaultAbsolutePath),
			source: "default",
		},
	];
}

export function getDefaultSpecRoot(options: RalphPathOptions = {}): SpecRoot {
	return getSpecRoots(options)[0];
}

export function getCurrentSpecFilePath(options: RalphPathOptions = {}): string {
	return join(getDefaultSpecRoot(options).absolutePath, CURRENT_SPEC_FILE);
}

export function readCurrentSpecValue(options: RalphPathOptions = {}): string | null {
	const currentSpecFile = getCurrentSpecFilePath(options);
	if (!existsSync(currentSpecFile)) {
		return null;
	}

	const value = normalizePathText(readFileSync(currentSpecFile, "utf8"));
	return value === "." ? null : value;
}

export function resolveCurrentSpec(options: RalphPathOptions = {}): SpecEntry | null {
	const value = readCurrentSpecValue(options);
	if (!value) {
		return null;
	}

	const cwd = getRalphCwd(options);
	const defaultRoot = getDefaultSpecRoot(options);
	const absolutePath = isPathReference(value) ? toAbsolutePath(value, cwd) : join(defaultRoot.absolutePath, value);
	return specEntryFromAbsolutePath(absolutePath, options);
}

export function requireCurrentSpec(options: RalphPathOptions = {}): SpecEntry {
	const currentSpecFile = getCurrentSpecFilePath(options);
	if (!existsSync(currentSpecFile)) {
		throw new SpecResolutionError("missing_current_spec", `Missing ${CURRENT_SPEC_FILE} at ${currentSpecFile}`);
	}

	const value = readCurrentSpecValue(options);
	if (!value) {
		throw new SpecResolutionError("empty_current_spec", `${CURRENT_SPEC_FILE} at ${currentSpecFile} is empty`);
	}

	const spec = resolveCurrentSpec(options);
	if (!spec) {
		throw new SpecResolutionError("missing_current_spec", `Unable to resolve ${CURRENT_SPEC_FILE} at ${currentSpecFile}`);
	}
	return spec;
}

export function writeCurrentSpec(specReference: string | SpecEntry, options: RalphPathOptions = {}): CurrentSpecPointer {
	const spec = typeof specReference === "string" ? resolveSpecReference(specReference, options) : specReference;
	const defaultRoot = getDefaultSpecRoot(options);
	const currentSpecFile = join(defaultRoot.absolutePath, CURRENT_SPEC_FILE);
	const value = dirname(spec.absolutePath) === defaultRoot.absolutePath ? spec.name : spec.path;

	mkdirSync(defaultRoot.absolutePath, { recursive: true });
	writeFileSync(currentSpecFile, `${value}\n`, "utf8");
	return { filePath: currentSpecFile, value, spec };
}

export function listSpecs(options: RalphPathOptions = {}): SpecEntry[] {
	const entries: SpecEntry[] = [];
	for (const root of getSpecRoots(options)) {
		if (!root.exists) {
			continue;
		}

		for (const entry of readdirSync(root.absolutePath, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) {
				continue;
			}
			entries.push(specEntryFromAbsolutePath(join(root.absolutePath, entry.name), options));
		}
	}

	return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function findSpec(nameOrPath: string, options: RalphPathOptions = {}): SpecEntry {
	const reference = normalizePathText(nameOrPath);
	if (reference === ".") {
		throw new SpecResolutionError("not_found", "Spec name is required");
	}

	if (isPathReference(reference)) {
		const spec = specEntryFromAbsolutePath(toAbsolutePath(reference, getRalphCwd(options)), options);
		if (!spec.exists) {
			throw new SpecResolutionError("not_found", `Spec not found at ${spec.path}`);
		}
		return spec;
	}

	const matches = listSpecs(options).filter((spec) => spec.name === reference);
	if (matches.length === 0) {
		throw new SpecResolutionError("not_found", `Spec '${reference}' not found in configured spec roots`);
	}
	if (matches.length > 1) {
		throw new SpecResolutionError("ambiguous", `Multiple specs named '${reference}' found`, matches);
	}
	return matches[0];
}

export function resolveSpecReference(reference: string, options: RalphPathOptions = {}): SpecEntry {
	const normalizedReference = normalizePathText(reference);
	if (normalizedReference === ".") {
		throw new SpecResolutionError("not_found", "Spec reference is required");
	}

	if (isPathReference(normalizedReference)) {
		return specEntryFromAbsolutePath(toAbsolutePath(normalizedReference, getRalphCwd(options)), options);
	}

	try {
		return findSpec(normalizedReference, options);
	} catch (error) {
		if (error instanceof SpecResolutionError && error.code === "not_found") {
			const defaultRoot = getDefaultSpecRoot(options);
			return specEntryFromAbsolutePath(join(defaultRoot.absolutePath, normalizedReference), options);
		}
		throw error;
	}
}

export function getCurrentEpicFilePath(options: RalphPathOptions = {}): string {
	return join(getDefaultSpecRoot(options).absolutePath, CURRENT_EPIC_FILE);
}

export function readCurrentEpicName(options: RalphPathOptions = {}): string | null {
	const currentEpicFile = getCurrentEpicFilePath(options);
	if (!existsSync(currentEpicFile)) {
		return null;
	}

	const name = readFileSync(currentEpicFile, "utf8").trim();
	return name || null;
}

export function resolveEpic(name: string, options: RalphPathOptions = {}): CurrentEpic {
	const epicName = name.trim();
	const defaultRoot = getDefaultSpecRoot(options);
	const absolutePath = join(defaultRoot.absolutePath, "_epics", epicName);
	const path = joinDisplayPath(joinDisplayPath(defaultRoot.path, "_epics"), epicName);

	return {
		name: epicName,
		path,
		absolutePath,
		statePath: join(absolutePath, ".epic-state.json"),
		progressPath: join(absolutePath, ".progress.md"),
		exists: existsSync(absolutePath),
	};
}

export function resolveCurrentEpic(options: RalphPathOptions = {}): CurrentEpic | null {
	const name = readCurrentEpicName(options);
	return name ? resolveEpic(name, options) : null;
}

export function writeCurrentEpic(name: string, options: RalphPathOptions = {}): CurrentEpic {
	const defaultRoot = getDefaultSpecRoot(options);
	const currentEpicFile = join(defaultRoot.absolutePath, CURRENT_EPIC_FILE);
	const epic = resolveEpic(name, options);

	mkdirSync(defaultRoot.absolutePath, { recursive: true });
	writeFileSync(currentEpicFile, `${epic.name}\n`, "utf8");
	return epic;
}

export function clearCurrentEpic(options: RalphPathOptions = {}): boolean {
	const currentEpicFile = getCurrentEpicFilePath(options);
	if (!existsSync(currentEpicFile)) {
		return false;
	}
	unlinkSync(currentEpicFile);
	return true;
}

export function specEntryFromAbsolutePath(absolutePath: string, options: RalphPathOptions = {}): SpecEntry {
	const cwd = getRalphCwd(options);
	const normalizedAbsolutePath = resolve(absolutePath);
	const root = findContainingRoot(normalizedAbsolutePath, options);
	const rootAbsolutePath = root?.absolutePath ?? dirname(normalizedAbsolutePath);
	const rootPath = root?.path ?? displayPath(rootAbsolutePath, cwd);

	return {
		name: basename(normalizedAbsolutePath),
		path: displayPath(normalizedAbsolutePath, cwd),
		absolutePath: normalizedAbsolutePath,
		rootPath,
		rootAbsolutePath,
		exists: existsSync(normalizedAbsolutePath),
	};
}

function extractFrontmatter(content: string): string {
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	if (lines[0]?.trim() !== "---") {
		return "";
	}

	for (let index = 1; index < lines.length; index += 1) {
		if (lines[index].trim() === "---") {
			return lines.slice(1, index).join("\n");
		}
	}
	return "";
}

function parseSpecsDirs(frontmatter: string): string[] {
	const lines = frontmatter.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		const match = lines[index].match(/^\s*specs_dirs\s*:\s*(.*)$/);
		if (!match) {
			continue;
		}

		const value = match[1].trim();
		if (value.startsWith("[")) {
			return splitYamlFlowList(value).map(unquoteYamlValue).map(normalizePathText).filter((dir) => dir !== ".");
		}
		if (value) {
			return [unquoteYamlValue(value)].map(normalizePathText).filter((dir) => dir !== ".");
		}

		const blockValues: string[] = [];
		for (let blockIndex = index + 1; blockIndex < lines.length; blockIndex += 1) {
			const itemMatch = lines[blockIndex].match(/^\s*-\s*(.+?)\s*$/);
			if (itemMatch) {
				blockValues.push(normalizePathText(unquoteYamlValue(itemMatch[1])));
				continue;
			}
			if (lines[blockIndex].trim()) {
				break;
			}
		}
		return blockValues.filter((dir) => dir !== ".");
	}
	return [];
}

function splitYamlFlowList(value: string): string[] {
	const trimmed = value.trim();
	const body = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
	const items: string[] = [];
	let current = "";
	let quote: string | null = null;

	for (const char of body) {
		if ((char === '"' || char === "'") && quote === null) {
			quote = char;
			current += char;
			continue;
		}
		if (char === quote) {
			quote = null;
			current += char;
			continue;
		}
		if (char === "," && quote === null) {
			items.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim()) {
		items.push(current.trim());
	}
	return items.filter(Boolean);
}

function unquoteYamlValue(value: string): string {
	const trimmed = value.trim();
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
	}
	return trimmed;
}

function toAbsolutePath(pathText: string, cwd: string): string {
	const normalized = normalizePathText(pathText);
	return resolve(isAbsolute(normalized) ? normalized : join(cwd, normalized));
}

function displayPath(absolutePath: string, cwd: string): string {
	const relativePath = relative(cwd, absolutePath).replace(/\\/g, "/");
	if (!relativePath) {
		return ".";
	}
	if (!isOutsideRelativePath(relativePath)) {
		return `./${relativePath}`;
	}
	return absolutePath.replace(/\\/g, "/");
}

function findContainingRoot(absolutePath: string, options: RalphPathOptions): SpecRoot | null {
	return getSpecRoots(options)
		.filter((root) => isInside(root.absolutePath, absolutePath))
		.sort((a, b) => b.absolutePath.length - a.absolutePath.length)[0] ?? null;
}

function isInside(parent: string, child: string): boolean {
	const relativePath = relative(parent, child);
	return relativePath === "" || !isOutsideRelativePath(relativePath);
}

function isOutsideRelativePath(relativePath: string): boolean {
	return relativePath === ".." || relativePath.startsWith("../") || isAbsolute(relativePath);
}

function joinDisplayPath(base: string, child: string): string {
	const normalizedBase = normalizePathText(base);
	return normalizedBase === "." ? normalizePathText(child) : `${normalizedBase}/${normalizePathText(child)}`;
}
