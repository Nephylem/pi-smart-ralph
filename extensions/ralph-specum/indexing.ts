import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';

export type IndexCategory = 'controllers' | 'services' | 'models' | 'helpers' | 'migrations' | 'other';

export interface IndexExternalInputs {
  urls: string[];
  mcpResources: string[];
  includePackageResources: boolean;
}

export interface IndexOptions {
  scanPath: string;
  specRoot: string;
  categories: IndexCategory[];
  excludes: string[];
  dryRun: boolean;
  force: boolean;
  changed: boolean;
  quick: boolean;
  externalInputs: IndexExternalInputs;
}

export type IndexParseResult =
  | { ok: true; options: IndexOptions }
  | { ok: false; options: IndexOptions; error: Error };

export interface IndexPaths {
  projectRoot: string;
  scanPath: string;
  specRoot: string;
  indexRoot: string;
  statePath: string;
  stateWritePath: string;
  stateAliasPath: string;
  stateReadPaths: string[];
  summaryPath: string;
  componentRoot: string;
  externalRoot: string;
}

export interface ResolveIndexPathsInput {
  cwd?: string;
  scanPath?: string;
  specRoot?: string;
}

export interface PriorIndexStateResult {
  state: unknown | null;
  path: string | null;
}

export interface ComponentEntry {
  sourcePath: string;
  sourceDisplayPath: string;
  artifactPath: string;
  category: IndexCategory;
  hash: string;
  name: string;
  exports: string[];
  methods: Array<{ name: string; params: string; description: string }>;
  dependencies: string[];
}

export interface ScanComponentFilesInput {
  paths: IndexPaths;
  options?: Partial<IndexOptions>;
}

export interface ScanComponentFilesResult {
  components: ComponentEntry[];
  skipped: Array<{ path: string; reason: string }>;
}

export type IndexAction = 'create' | 'update' | 'skip';

export const INDEX_WRITE_KINDS = Object.freeze({
  component: 'component',
  external: 'external',
  summary: 'summary',
  state: 'state',
} as const);

export type PlannedWriteKind = (typeof INDEX_WRITE_KINDS)[keyof typeof INDEX_WRITE_KINDS];

export interface PlannedWrite {
  path: string;
  action: IndexAction;
  kind: PlannedWriteKind;
  content?: string;
  reason?: string;
  artifactPath?: string;
  sourcePath?: string;
}

export interface IndexStateV1 {
  indexed: string;
  componentCount: number;
  externalCount: number;
  created: number;
  updated: number;
  skipped: number;
  excludes: string[];
  paths: string[];
  categories: Record<string, number>;
  summaryPath: string;
  components: Array<{ source: string; hash: string; category: IndexCategory; artifactPath: string; indexed: string }>;
  external: Array<{ sourceType: string; sourceId: string; artifactPath: string; fetched: string; hash?: string; error?: string }>;
  errors: Array<{ sourceType: string; sourceId: string; message: string }>;
}

export interface IndexRunInput {
  cwd?: string;
  specRoot?: string;
  args?: string[];
}

export interface IndexRunResult {
  ok: boolean;
  dryRun: boolean;
  indexRoot: string;
  statePath: string;
  summaryPath: string;
  writes: PlannedWrite[];
  state: IndexStateV1;
  message: string;
  error?: string;
}

export type IndexExcludeMatcher = (relativePath: string, entryName?: string) => boolean;

const DEFAULT_INDEX_OPTIONS: IndexOptions = {
  scanPath: '.',
  specRoot: './specs',
  categories: [],
  excludes: [],
  dryRun: false,
  force: false,
  changed: false,
  quick: false,
  externalInputs: {
    urls: [],
    mcpResources: [],
    includePackageResources: false,
  },
};

export function resolveIndexPaths(input: ResolveIndexPathsInput | IndexOptions = {}): IndexPaths {
  const projectRoot = resolve(input.cwd ?? process.cwd());
  const configuredScanPath = input.scanPath ?? DEFAULT_INDEX_OPTIONS.scanPath;
  const configuredSpecRoot = input.specRoot ?? DEFAULT_INDEX_OPTIONS.specRoot;
  const scanPath = resolveFrom(projectRoot, configuredScanPath);
  const specRoot = resolveFrom(projectRoot, configuredSpecRoot);
  const indexRoot = join(specRoot, '.index');
  const stateWritePath = resolveIndexOutputPath(indexRoot, 'index-state.json', 'canonical state path');
  const stateAliasPath = resolveIndexOutputPath(indexRoot, '.index-state.json', 'state alias path');
  const paths: IndexPaths = {
    projectRoot,
    scanPath,
    specRoot,
    indexRoot,
    statePath: stateWritePath,
    stateWritePath,
    stateAliasPath,
    stateReadPaths: [stateWritePath, stateAliasPath],
    summaryPath: resolveIndexOutputPath(indexRoot, 'index.md', 'summary path'),
    componentRoot: resolveIndexOutputPath(indexRoot, 'components', 'component root'),
    externalRoot: resolveIndexOutputPath(indexRoot, 'external', 'external root'),
  };

  return paths;
}

export function readPriorIndexState(paths: IndexPaths): PriorIndexStateResult {
  for (const candidatePath of paths.stateReadPaths) {
    if (!existsSync(candidatePath)) continue;
    return {
      state: JSON.parse(readFileSync(candidatePath, 'utf8')),
      path: candidatePath,
    };
  }

  return { state: null, path: null };
}

export const readIndexState = readPriorIndexState;

export async function runRalphIndex(input: IndexRunInput = {}): Promise<IndexRunResult> {
  const parseResult = parseIndexArgs(input.args ?? []);
  const parsedOptions = parseResult.options;
  const options: IndexOptions = {
    ...parsedOptions,
    categories: [...parsedOptions.categories],
    excludes: [...parsedOptions.excludes],
    specRoot: input.specRoot ?? parsedOptions.specRoot,
    externalInputs: {
      ...parsedOptions.externalInputs,
      urls: [...parsedOptions.externalInputs.urls],
      mcpResources: [...parsedOptions.externalInputs.mcpResources],
    },
  };
  const paths = resolveIndexPaths({ cwd: input.cwd, scanPath: options.scanPath, specRoot: options.specRoot });

  if (!parseResult.ok) {
    return {
      ok: false,
      dryRun: options.dryRun,
      indexRoot: paths.indexRoot,
      statePath: paths.stateWritePath,
      summaryPath: paths.summaryPath,
      writes: [],
      state: createEmptyIndexState(paths, options, new Date().toISOString()),
      message: parseResult.error.message,
      error: parseResult.error.message,
    };
  }

  const priorState = readPriorIndexState(paths).state;
  const scanResult = scanComponentFiles({ paths, options });
  const plannedAt = new Date().toISOString();
  const plan = planIndexWrites({ paths, options, components: scanResult.components, priorState, indexedAt: plannedAt });

  writeIndexPlan(plan.writes, { dryRun: options.dryRun });

  return {
    ok: true,
    dryRun: options.dryRun,
    indexRoot: paths.indexRoot,
    statePath: paths.stateWritePath,
    summaryPath: paths.summaryPath,
    writes: plan.writes,
    state: plan.state,
    message: formatIndexRunMessage(options, plan.writes),
  };
}

export function getComponentIndexPath(paths: IndexPaths, sourcePath: string, category: IndexCategory = 'other'): string {
  return resolveIndexOutputPath(paths.indexRoot, join('components', `${category}-${artifactSlug(sourcePath)}.md`), 'component artifact path');
}

export function getExternalIndexPath(paths: IndexPaths, sourceId: string): string {
  return resolveIndexOutputPath(paths.indexRoot, join('external', `${artifactSlug(sourceId)}.md`), 'external artifact path');
}

export function scanComponentFiles(input: ScanComponentFilesInput): ScanComponentFilesResult {
  const options = { ...createDefaultIndexOptions(), ...(input.options ?? {}) };
  const categories = new Set(options.categories ?? []);
  const excludeMatcher = createIndexExcludeMatcher([...DEFAULT_EXCLUDES, ...(options.excludes ?? [])]);
  const components: ComponentEntry[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const sourcePath of walkReadableFiles(input.paths.scanPath, input.paths.scanPath, excludeMatcher, skipped)) {
    const category = classifyIndexComponentFile(sourcePath);
    if (categories.size > 0 && !categories.has(category)) continue;

    let source: string;
    try {
      source = readFileSync(sourcePath, 'utf8');
    } catch (_error) {
      skipped.push({ path: sourcePath, reason: 'unreadable' });
      continue;
    }

    components.push({
      sourcePath,
      sourceDisplayPath: toIndexDisplayPath(input.paths, sourcePath),
      artifactPath: getComponentIndexPath(input.paths, sourcePath, category),
      category,
      hash: createHash('sha256').update(source).digest('hex'),
      name: basename(sourcePath, extname(sourcePath)),
      exports: extractExports(source),
      methods: [],
      dependencies: extractDependencies(source),
    });
  }

  components.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  return { components, skipped };
}

export function toIndexDisplayPath(paths: Pick<IndexPaths, 'projectRoot'>, sourcePath: string): string {
  const absoluteSourcePath = resolveFrom(paths.projectRoot, sourcePath);
  const projectRelativePath = normalizePathSeparators(relative(paths.projectRoot, absoluteSourcePath));
  if (projectRelativePath && !projectRelativePath.startsWith('..') && !isAbsolute(projectRelativePath)) {
    return projectRelativePath;
  }

  return normalizePathSeparators(absoluteSourcePath);
}

export function resolveIndexOutputPath(indexRoot: string, outputPath: string, label = 'index output path'): string {
  const resolvedIndexRoot = resolve(indexRoot);
  const candidatePath = resolveFrom(resolvedIndexRoot, outputPath);
  assertIndexOutputPath(resolvedIndexRoot, candidatePath, label);
  return candidatePath;
}

export function assertIndexOutputPath(indexRoot: string, candidatePath: string, label = 'index output path'): void {
  const relativePath = relative(resolve(indexRoot), resolve(candidatePath));
  if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) return;
  throw new Error(`Resolved ${label} escapes index root: ${candidatePath}`);
}

export interface IndexPlanInput {
  paths: IndexPaths;
  options: IndexOptions;
  components: ComponentEntry[];
  priorState: unknown;
  indexedAt: string;
}

export interface IndexPlanResult {
  writes: PlannedWrite[];
  state: IndexStateV1;
}

export function planIndexWrites(input: IndexPlanInput): IndexPlanResult {
  const priorComponentHashes = readPriorComponentHashes(input.priorState);
  const writes: PlannedWrite[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const component of input.components) {
    const priorHash = priorComponentHashes.get(component.sourceDisplayPath) ?? priorComponentHashes.get(component.sourcePath);
    const action = chooseWriteAction(component.artifactPath, priorHash === component.hash, input.options.force);
    if (action === 'create') created += 1;
    if (action === 'update') updated += 1;
    if (action === 'skip') skipped += 1;
    writes.push({
      kind: INDEX_WRITE_KINDS.component,
      action,
      path: `${component.sourcePath} -> ${component.artifactPath}`,
      artifactPath: component.artifactPath,
      sourcePath: component.sourcePath,
      content: renderComponentSpec(component, input.indexedAt),
      reason: action === 'skip' ? 'source hash unchanged' : undefined,
    });
  }

  const categories = countComponentsByCategory(input.components);
  const state: IndexStateV1 = {
    indexed: input.indexedAt,
    componentCount: input.components.length,
    externalCount: 0,
    created: created + 2,
    updated,
    skipped,
    excludes: [...input.options.excludes],
    paths: [input.paths.scanPath],
    categories,
    summaryPath: input.paths.summaryPath,
    components: input.components.map((component) => ({
      source: component.sourceDisplayPath,
      hash: component.hash,
      category: component.category,
      artifactPath: component.artifactPath,
      indexed: input.indexedAt,
    })),
    external: [],
    errors: [],
  };

  const summaryContent = renderIndexSummary(state);
  const stateContent = `${JSON.stringify(state, null, 2)}\n`;
  writes.push({
    kind: INDEX_WRITE_KINDS.summary,
    action: chooseWriteAction(input.paths.summaryPath, false, input.options.force),
    path: input.paths.summaryPath,
    artifactPath: input.paths.summaryPath,
    content: summaryContent,
  });
  writes.push({
    kind: INDEX_WRITE_KINDS.state,
    action: chooseWriteAction(input.paths.stateWritePath, false, input.options.force),
    path: input.paths.stateWritePath,
    artifactPath: input.paths.stateWritePath,
    content: stateContent,
  });

  return { writes, state };
}

function chooseWriteAction(pathValue: string, unchanged: boolean, force: boolean): IndexAction {
  if (unchanged && !force) return 'skip';
  if (existsSync(pathValue)) return 'update';
  return 'create';
}

function readPriorComponentHashes(priorState: unknown): Map<string, string> {
  const hashes = new Map<string, string>();
  if (!priorState || typeof priorState !== 'object') return hashes;
  const components = (priorState as { components?: unknown }).components;
  if (!Array.isArray(components)) return hashes;
  for (const component of components) {
    if (!component || typeof component !== 'object') continue;
    const source = (component as { source?: unknown }).source;
    const hash = (component as { hash?: unknown }).hash;
    if (typeof source === 'string' && typeof hash === 'string') hashes.set(source, hash);
  }
  return hashes;
}

function countComponentsByCategory(components: ComponentEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const component of components) {
    counts[component.category] = (counts[component.category] ?? 0) + 1;
  }
  return counts;
}

function createEmptyIndexState(paths: IndexPaths, options: IndexOptions, indexedAt: string): IndexStateV1 {
  return {
    indexed: indexedAt,
    componentCount: 0,
    externalCount: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    excludes: [...options.excludes],
    paths: [paths.scanPath],
    categories: {},
    summaryPath: paths.summaryPath,
    components: [],
    external: [],
    errors: [],
  };
}

function renderComponentSpec(component: ComponentEntry, indexedAt: string): string {
  return `---\ntype: component\ngenerated: true\nsource: ${component.sourceDisplayPath}\nhash: ${component.hash}\ncategory: ${component.category}\nindexed: ${indexedAt}\n---\n\n# ${component.name}\n\n## Summary\n\nIndexed ${component.category} component from ${component.sourceDisplayPath}.\n\n## Source\n\n- Path: ${component.sourceDisplayPath}\n- Category: ${component.category}\n- Hash: ${component.hash}\n- Indexed: ${indexedAt}\n`;
}

function renderIndexSummary(state: IndexStateV1): string {
  return `# Index Summary\n\n- generated-at: ${state.indexed}\n- component count: ${state.componentCount}\n- external count: ${state.externalCount}\n- created: ${state.created}\n- updated: ${state.updated}\n- skipped: ${state.skipped}\n`;
}

export interface WriteIndexPlanOptions {
  dryRun?: boolean;
}

export function writeIndexPlan(writes: PlannedWrite[], options: WriteIndexPlanOptions = {}): void {
  if (options.dryRun) return;

  for (const write of writes) {
    if (write.action === 'skip' || write.content === undefined) continue;
    const targetPath = write.artifactPath ?? write.path;
    mkdirSync(resolve(targetPath, '..'), { recursive: true });
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tempPath, write.content, 'utf8');
    renameSync(tempPath, targetPath);
  }
}

function formatIndexRunMessage(options: IndexOptions, writes: PlannedWrite[]): string {
  const prefix = options.dryRun ? 'Dry-run planned index writes' : 'Completed index writes';
  const lines = writes.map((write) => `${write.action} ${write.kind} ${write.path}`);
  return [prefix, ...lines].join('\n');
}

const DEFAULT_EXCLUDES = [
  '.git/**',
  'node_modules/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.index/**',
  '**/*.test.*',
  '**/*.spec.*',
];

const READABLE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.java', '.cs', '.php', '.rs', '.sql']);

function* walkReadableFiles(
  rootPath: string,
  currentPath: string,
  excludeMatcher: IndexExcludeMatcher,
  skipped: Array<{ path: string; reason: string }>,
): Generator<string> {
  let entries;
  try {
    entries = readdirSync(currentPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  } catch (_error) {
    skipped.push({ path: currentPath, reason: 'unreadable' });
    return;
  }

  for (const entry of entries) {
    const entryPath = join(currentPath, entry.name);
    const relativePath = normalizePathSeparators(relative(rootPath, entryPath));
    if (excludeMatcher(relativePath, entry.name)) continue;

    if (entry.isDirectory()) {
      yield* walkReadableFiles(rootPath, entryPath, excludeMatcher, skipped);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!isReadableCandidateFile(entryPath)) continue;
    yield entryPath;
  }
}

function isReadableCandidateFile(sourcePath: string): boolean {
  if (!READABLE_EXTENSIONS.has(extname(sourcePath).toLowerCase())) return false;
  try {
    return statSync(sourcePath).isFile();
  } catch (_error) {
    return false;
  }
}

export function classifyIndexComponentFile(sourcePath: string): IndexCategory {
  const normalized = normalizePathSeparators(sourcePath).toLowerCase();
  const fileBase = basename(normalized, extname(normalized));
  if (normalized.includes('/controllers/') || /(^|[.-])controller$/.test(fileBase)) return 'controllers';
  if (normalized.includes('/services/') || /(^|[.-])service$/.test(fileBase)) return 'services';
  if (normalized.includes('/models/') || /(^|[.-])model$/.test(fileBase)) return 'models';
  if (normalized.includes('/helpers/') || normalized.includes('/utils/') || /(^|[.-])(helper|util)$/.test(fileBase)) return 'helpers';
  if (normalized.includes('/migrations/') || /^\d+[-_].+/.test(fileBase)) return 'migrations';
  return 'other';
}

export function createIndexExcludeMatcher(patterns: string[] = []): IndexExcludeMatcher {
  const normalizedPatterns = patterns.map(normalizeExcludePattern).filter(Boolean);
  return (relativePath: string, entryName = basename(relativePath)): boolean => {
    const normalizedRelativePath = normalizePathSeparators(relativePath).replace(/^\.\//, '');
    return normalizedPatterns.some((pattern) => matchesExcludePattern(normalizedRelativePath, entryName, pattern));
  };
}

function normalizeExcludePattern(pattern: string): string {
  return normalizePathSeparators(pattern).replace(/^\.\//, '').trim();
}

function matchesExcludePattern(relativePath: string, entryName: string, normalizedPattern: string): boolean {
  if (!normalizedPattern) return false;
  if (normalizedPattern.endsWith('/**')) {
    const directoryPattern = normalizedPattern.slice(0, -3);
    if (relativePath === directoryPattern || relativePath.startsWith(`${directoryPattern}/`)) return true;
  }
  if (!normalizedPattern.includes('/') && !normalizedPattern.includes('*')) {
    return relativePath === normalizedPattern || relativePath.startsWith(`${normalizedPattern}/`) || entryName === normalizedPattern;
  }
  const regex = new RegExp(`^${globPatternToRegexSource(normalizedPattern)}$`);
  return regex.test(relativePath) || regex.test(entryName);
}

function globPatternToRegexSource(pattern: string): string {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }
    source += escapeRegex(char);
  }
  return source;
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function extractExports(source: string): string[] {
  const exports = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+([A-Za-z_$][\w$]*)/g)) {
    exports.add(match[1]);
  }
  return [...exports];
}

function extractDependencies(source: string): string[] {
  const dependencies = new Set<string>();
  for (const match of source.matchAll(/(?:import\s+[^'\"]*from\s+|require\()['\"]([^'\"]+)['\"]/g)) {
    dependencies.add(match[1]);
  }
  return [...dependencies];
}

function resolveFrom(basePath: string, configuredPath: string): string {
  return isAbsolute(configuredPath) ? resolve(configuredPath) : resolve(basePath, configuredPath);
}

function normalizePathSeparators(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

function artifactSlug(input: string): string {
  const parsedBase = basename(input, extname(input)) || 'resource';
  const normalized = input.replace(/\\/g, '/');
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  const safeBase = parsedBase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'resource';
  return `${safeBase}-${hash.toString(16).padStart(8, '0').slice(0, 8)}`;
}

export function createDefaultIndexOptions(): IndexOptions {
  return {
    ...DEFAULT_INDEX_OPTIONS,
    categories: [...DEFAULT_INDEX_OPTIONS.categories],
    excludes: [...DEFAULT_INDEX_OPTIONS.excludes],
    externalInputs: {
      ...DEFAULT_INDEX_OPTIONS.externalInputs,
      urls: [...DEFAULT_INDEX_OPTIONS.externalInputs.urls],
      mcpResources: [...DEFAULT_INDEX_OPTIONS.externalInputs.mcpResources],
    },
  };
}

export function parseIndexArgs(args: string[] = []): IndexParseResult {
  const options = createDefaultIndexOptions();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!isOptionToken(token)) {
      return failParse(options, `Unexpected /ralph-index argument: ${token}`);
    }

    const inlineValue = getInlineOptionValue(token);
    const optionName = getOptionName(token);

    switch (optionName) {
      case '--path': {
        const valueResult = readOptionValue(args, index, optionName, inlineValue);
        if (!valueResult.ok) return failParse(options, valueResult.error);
        options.scanPath = normalizePathValue(valueResult.value);
        index = valueResult.index;
        break;
      }
      case '--type': {
        const valueResult = readOptionValue(args, index, optionName, inlineValue);
        if (!valueResult.ok) return failParse(options, valueResult.error);
        options.categories.push(...normalizeCategoryTokens(valueResult.value));
        index = valueResult.index;
        break;
      }
      case '--exclude': {
        const valueResult = readOptionValue(args, index, optionName, inlineValue);
        if (!valueResult.ok) return failParse(options, valueResult.error);
        options.excludes.push(...normalizePatternTokens(valueResult.value));
        index = valueResult.index;
        break;
      }
      case '--dry-run':
        if (inlineValue !== undefined) return failParse(options, `${optionName} does not accept a value`);
        options.dryRun = true;
        break;
      case '--force':
        if (inlineValue !== undefined) return failParse(options, `${optionName} does not accept a value`);
        options.force = true;
        break;
      case '--changed':
        if (inlineValue !== undefined) return failParse(options, `${optionName} does not accept a value`);
        options.changed = true;
        break;
      case '--quick':
        if (inlineValue !== undefined) return failParse(options, `${optionName} does not accept a value`);
        options.quick = true;
        break;
      default:
        return failParse(options, `Unsupported /ralph-index option: ${optionName}`);
    }
  }

  if (options.force && options.changed) {
    return failParse(options, 'Invalid /ralph-index options: --force cannot be combined with --changed');
  }

  options.categories = uniqueValues(options.categories);
  options.excludes = uniqueValues(options.excludes);

  return { ok: true, options };
}

function isOptionToken(arg: unknown): arg is string {
  return typeof arg === 'string' && arg.startsWith('--');
}

function getOptionName(token: string): string {
  const equalsIndex = token.indexOf('=');
  return equalsIndex === -1 ? token : token.slice(0, equalsIndex);
}

function getInlineOptionValue(token: string): string | undefined {
  const equalsIndex = token.indexOf('=');
  return equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);
}

type OptionValueResult =
  | { ok: true; value: string; index: number }
  | { ok: false; error: string };

function readOptionValue(args: string[], index: number, optionName: string, inlineValue: string | undefined): OptionValueResult {
  if (inlineValue !== undefined) {
    if (inlineValue.trim() === '') return { ok: false, error: missingOptionValueMessage(optionName) };
    return { ok: true, value: inlineValue, index };
  }

  const nextIndex = index + 1;
  const value = args[nextIndex];
  if (value === undefined || isOptionToken(value) || value.trim() === '') {
    return { ok: false, error: missingOptionValueMessage(optionName) };
  }

  return { ok: true, value, index: nextIndex };
}

function missingOptionValueMessage(optionName: string): string {
  return `Missing value for ${optionName}. Provide a value after ${optionName} or use ${optionName}=<value>.`;
}

function normalizePathValue(value: string): string {
  return value.trim();
}

function normalizeCategoryTokens(value: string): IndexCategory[] {
  return splitCommaSeparatedTokens(value)
    .map((category) => category.toLowerCase())
    .filter((category): category is IndexCategory => isIndexCategory(category));
}

function isIndexCategory(category: string): category is IndexCategory {
  return ['controllers', 'services', 'models', 'helpers', 'migrations', 'other'].includes(category);
}

function normalizePatternTokens(value: string): string[] {
  return splitCommaSeparatedTokens(value).map((pattern) => pattern.replace(/\\/g, '/').replace(/^\.\//, ''));
}

function splitCommaSeparatedTokens(value: string): string[] {
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function failParse(options: IndexOptions, message: string): IndexParseResult {
  return {
    ok: false,
    options,
    error: new Error(message),
  };
}
