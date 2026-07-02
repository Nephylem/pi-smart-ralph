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
  const unsupportedOption = findUnsupportedOption(args);

  if (unsupportedOption) {
    return failParse(options, `Unsupported /ralph-index option: ${unsupportedOption}`);
  }

  return { ok: true, options };
}

function findUnsupportedOption(args: string[]): string | undefined {
  return args.find((arg) => isOptionToken(arg));
}

function isOptionToken(arg: unknown): arg is string {
  return typeof arg === 'string' && arg.startsWith('--');
}

function failParse(options: IndexOptions, message: string): IndexParseResult {
  return {
    ok: false,
    options,
    error: new Error(message),
  };
}
