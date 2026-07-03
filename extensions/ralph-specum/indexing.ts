import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

export function getComponentIndexPath(paths: IndexPaths, sourcePath: string, category: IndexCategory = 'other'): string {
  return resolveIndexOutputPath(paths.indexRoot, join('components', `${category}-${artifactSlug(sourcePath)}.md`), 'component artifact path');
}

export function getExternalIndexPath(paths: IndexPaths, sourceId: string): string {
  return resolveIndexOutputPath(paths.indexRoot, join('external', `${artifactSlug(sourceId)}.md`), 'external artifact path');
}

export function scanComponentFiles(input: ScanComponentFilesInput): ScanComponentFilesResult {
  const options = { ...createDefaultIndexOptions(), ...(input.options ?? {}) };
  const categories = new Set(options.categories ?? []);
  const excludes = [...DEFAULT_EXCLUDES, ...(options.excludes ?? [])];
  const components: ComponentEntry[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const sourcePath of walkReadableFiles(input.paths.scanPath, input.paths.scanPath, excludes, skipped)) {
    const category = classifyComponentFile(sourcePath);
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
  excludes: string[],
  skipped: Array<{ path: string; reason: string }>,
): Generator<string> {
  let entries;
  try {
    entries = readdirSync(currentPath, { withFileTypes: true });
  } catch (_error) {
    skipped.push({ path: currentPath, reason: 'unreadable' });
    return;
  }

  for (const entry of entries) {
    const entryPath = join(currentPath, entry.name);
    const relativePath = normalizePathSeparators(relative(rootPath, entryPath));
    if (matchesAnyExclude(relativePath, entry.name, excludes)) continue;

    if (entry.isDirectory()) {
      yield* walkReadableFiles(rootPath, entryPath, excludes, skipped);
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

function classifyComponentFile(sourcePath: string): IndexCategory {
  const normalized = normalizePathSeparators(sourcePath).toLowerCase();
  const fileBase = basename(normalized, extname(normalized));
  if (normalized.includes('/controllers/') || /(^|[.-])controller$/.test(fileBase)) return 'controllers';
  if (normalized.includes('/services/') || /(^|[.-])service$/.test(fileBase)) return 'services';
  if (normalized.includes('/models/') || /(^|[.-])model$/.test(fileBase)) return 'models';
  if (normalized.includes('/helpers/') || normalized.includes('/utils/') || /(^|[.-])(helper|util)$/.test(fileBase)) return 'helpers';
  if (normalized.includes('/migrations/') || /^\d+[-_].+/.test(fileBase)) return 'migrations';
  return 'other';
}

function matchesAnyExclude(relativePath: string, entryName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesExcludePattern(relativePath, entryName, pattern));
}

function matchesExcludePattern(relativePath: string, entryName: string, pattern: string): boolean {
  const normalizedPattern = normalizePathSeparators(pattern).replace(/^\.\//, '');
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
