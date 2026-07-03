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
        options.categories.push(...normalizeCategories(valueResult.value));
        index = valueResult.index;
        break;
      }
      case '--exclude': {
        const valueResult = readOptionValue(args, index, optionName, inlineValue);
        if (!valueResult.ok) return failParse(options, valueResult.error);
        options.excludes.push(...normalizeExcludePatterns(valueResult.value));
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
    if (inlineValue.trim() === '') return { ok: false, error: `${optionName} requires a value` };
    return { ok: true, value: inlineValue, index };
  }

  const nextIndex = index + 1;
  const value = args[nextIndex];
  if (value === undefined || isOptionToken(value) || value.trim() === '') {
    return { ok: false, error: `${optionName} requires a value` };
  }

  return { ok: true, value, index: nextIndex };
}

function normalizePathValue(value: string): string {
  return value.trim();
}

function normalizeCategories(value: string): IndexCategory[] {
  return value
    .split(',')
    .map((category) => category.trim().toLowerCase())
    .filter((category): category is IndexCategory => isIndexCategory(category));
}

function isIndexCategory(category: string): category is IndexCategory {
  return ['controllers', 'services', 'models', 'helpers', 'migrations', 'other'].includes(category);
}

function normalizeExcludePatterns(value: string): string[] {
  return value
    .split(',')
    .map((pattern) => pattern.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
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
