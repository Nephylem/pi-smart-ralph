import { existsSync, readFileSync } from 'node:fs';
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
  stateAliasPath: string;
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
  const paths: IndexPaths = {
    projectRoot,
    scanPath,
    specRoot,
    indexRoot,
    statePath: join(indexRoot, 'index-state.json'),
    stateAliasPath: join(indexRoot, '.index-state.json'),
    summaryPath: join(indexRoot, 'index.md'),
    componentRoot: join(indexRoot, 'components'),
    externalRoot: join(indexRoot, 'external'),
  };

  assertInsideIndexRoot(paths.indexRoot, paths.statePath, 'state path');
  assertInsideIndexRoot(paths.indexRoot, paths.stateAliasPath, 'state alias path');
  assertInsideIndexRoot(paths.indexRoot, paths.summaryPath, 'summary path');
  assertInsideIndexRoot(paths.indexRoot, paths.componentRoot, 'component root');
  assertInsideIndexRoot(paths.indexRoot, paths.externalRoot, 'external root');

  return paths;
}

export function readPriorIndexState(paths: IndexPaths): PriorIndexStateResult {
  for (const candidatePath of [paths.statePath, paths.stateAliasPath]) {
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
  const artifactPath = join(paths.componentRoot, `${category}-${artifactSlug(sourcePath)}.md`);
  assertInsideIndexRoot(paths.indexRoot, artifactPath, 'component artifact path');
  return artifactPath;
}

export function getExternalIndexPath(paths: IndexPaths, sourceId: string): string {
  const artifactPath = join(paths.externalRoot, `${artifactSlug(sourceId)}.md`);
  assertInsideIndexRoot(paths.indexRoot, artifactPath, 'external artifact path');
  return artifactPath;
}

function resolveFrom(basePath: string, configuredPath: string): string {
  return isAbsolute(configuredPath) ? resolve(configuredPath) : resolve(basePath, configuredPath);
}

function assertInsideIndexRoot(indexRoot: string, candidatePath: string, label: string): void {
  const relativePath = relative(indexRoot, candidatePath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Resolved ${label} escapes index root: ${candidatePath}`);
  }
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
