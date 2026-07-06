#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const failures = [];

const RESOURCE_MANIFEST_PATH = 'references/ralph-resource-manifest.v1.json';
const RESOURCE_MANIFEST_FULL_PATH = join(root, RESOURCE_MANIFEST_PATH);
const SCHEMA_RESOURCE_PATH = 'schemas/spec.schema.json';
const README_PATH = 'README.md';
const RESOURCE_MANIFEST_KINDS = new Set(['command', 'template', 'prompt', 'reference', 'skill', 'schema']);
const RESOURCE_MANIFEST_STATUSES = new Set(['copied', 'adapted', 'renamed', 'pi-native', 'excluded', 'deferred']);
const PACKAGED_RESOURCE_ROOTS = ['agents', 'prompts', 'references', 'skills', 'templates', 'schemas'];
const DEFAULT_ORIGINAL_RESOURCE_ROOT = '/home/nephy/pi-custom-workflow/smart-ralph/plugins/ralph-specum';
const EXPLICIT_ORIGINAL_RESOURCE_ROOT = typeof process.env.RALPH_ORIGINAL_RESOURCE_ROOT === 'string'
  && process.env.RALPH_ORIGINAL_RESOURCE_ROOT.trim().length > 0
  ? process.env.RALPH_ORIGINAL_RESOURCE_ROOT.trim()
  : null;
const ORIGINAL_RESOURCE_ROOT = EXPLICIT_ORIGINAL_RESOURCE_ROOT ?? DEFAULT_ORIGINAL_RESOURCE_ROOT;
const ORIGINAL_RESOURCE_ROOT_AVAILABLE = existsSync(ORIGINAL_RESOURCE_ROOT);
const SHOULD_VERIFY_ORIGINAL_RESOURCES = ORIGINAL_RESOURCE_ROOT_AVAILABLE;
const ORIGINAL_RESOURCE_DIRECTORIES = ['commands', 'templates', 'references', 'skills', 'schemas'];
const packagePathFailureCaseKey = 'package-path-failure';
const PACKAGE_VERIFICATION_ENVELOPE_FIELDS = Object.freeze([
  'status',
  'category',
  'reasonCode',
  'failingCommand',
  'recoverable',
  'suggestedRecovery',
  'evidence',
]);
const PACKAGE_VERIFICATION_DIAGNOSTIC_FIELDS = Object.freeze([
  ...PACKAGE_VERIFICATION_ENVELOPE_FIELDS,
  'originalRoot',
  'checkedPath',
  'missingPathType',
  'message',
]);
const PACKAGE_VERIFICATION_FAILURE_ENVELOPE = Object.freeze({
  status: 'VERIFICATION_FAIL',
  category: 'publish_bundle_failure',
  reasonCode: 'VERIFY_PUBLISH_BUNDLE_FAILURE',
  failingCommand: 'node scripts/verify-publish-bundle.mjs',
  recoverable: true,
  suggestedRecovery: 'repair_publish_bundle',
  requiredFields: PACKAGE_VERIFICATION_DIAGNOSTIC_FIELDS,
});
const diagnosticFixture = typeof process.env.RALPH_PUBLISH_DIAGNOSTIC_FIXTURE === 'string'
  ? process.env.RALPH_PUBLISH_DIAGNOSTIC_FIXTURE.trim()
  : '';
const portableDiagnostics = [];

function addPortablePublishDiagnostic({ reasonCode = PACKAGE_VERIFICATION_FAILURE_ENVELOPE.reasonCode, checkedPath, missingPathType, message }) {
  const diagnostic = {
    status: PACKAGE_VERIFICATION_FAILURE_ENVELOPE.status,
    category: PACKAGE_VERIFICATION_FAILURE_ENVELOPE.category,
    reasonCode,
    failingCommand: PACKAGE_VERIFICATION_FAILURE_ENVELOPE.failingCommand,
    recoverable: PACKAGE_VERIFICATION_FAILURE_ENVELOPE.recoverable,
    suggestedRecovery: PACKAGE_VERIFICATION_FAILURE_ENVELOPE.suggestedRecovery,
    evidence: [message],
    originalRoot: normalizePosixPath(ORIGINAL_RESOURCE_ROOT),
    checkedPath: normalizePosixPath(checkedPath),
    missingPathType,
    message,
  };
  portableDiagnostics.push(diagnostic);
  failures.push(`${reasonCode}: ${message}`);
  return diagnostic;
}

function applyDiagnosticFixture() {
  if (!diagnosticFixture) return;
  if (diagnosticFixture === 'missing-file') {
    addPortablePublishDiagnostic({
      checkedPath: join(root, 'schemas', '__missing_fixture__.json'),
      missingPathType: 'file',
      message: 'Fixture package resource file is missing from the publish bundle.',
    });
    return;
  }
  if (diagnosticFixture === 'missing-dependency-entrypoint') {
    addPortablePublishDiagnostic({
      checkedPath: join(root, 'node_modules', '__missing_fixture__', 'index.ts'),
      missingPathType: 'dependency_entrypoint',
      message: 'Fixture bundled dependency entrypoint is missing from the publish bundle.',
    });
    return;
  }
  failures.push(`unknown diagnostic fixture: ${diagnosticFixture}`);
}

function parseJsonFile(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`${label} must parse as JSON: ${error.message}`);
    return undefined;
  }
}

function normalizePosixPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function normalizeManifestPath(filePath) {
  return normalizePosixPath(filePath).replace(/^\.\//, '');
}

function relativePosixPath(from, to) {
  return normalizePosixPath(relative(from, to));
}

function resolvePackagePath(manifestPath) {
  return join(root, ...normalizeManifestPath(manifestPath).split('/'));
}

function resolveOriginalResourcePath(manifestPath) {
  return join(ORIGINAL_RESOURCE_ROOT, ...normalizeManifestPath(manifestPath).split('/'));
}

function formatManifestEntryLabel(index, entry) {
  const originalPath = entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.originalPath === 'string'
    ? JSON.stringify(normalizeManifestPath(entry.originalPath))
    : JSON.stringify(entry?.originalPath ?? 'unavailable');
  return `${RESOURCE_MANIFEST_PATH}[${index}] originalPath=${originalPath}`;
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function validateSha256(label, expectedHash, filePath, manifestPath) {
  if (!isSha256(expectedHash)) {
    failures.push(`${label}.sha256 must be a lowercase SHA-256 hex digest for packaged file ${manifestPath}`);
    return undefined;
  }

  const actualHash = sha256File(filePath);
  if (expectedHash !== actualHash) {
    failures.push(`${label}.sha256 must match packaged file ${manifestPath}; expected ${actualHash}`);
  }

  return actualHash;
}

function validateExactChecksumMatch(label, status, originalPath, piPath, piHash) {
  if (!SHOULD_VERIFY_ORIGINAL_RESOURCES) return;

  const originalFullPath = resolveOriginalResourcePath(originalPath);
  if (!existsSync(originalFullPath)) {
    addPortablePublishDiagnostic({
      checkedPath: originalFullPath,
      missingPathType: 'file',
      message: `${label}.originalPath must point to an existing original file for ${status} comparison: ${originalPath}`,
    });
    return;
  }

  const originalHash = sha256File(originalFullPath);
  if (piHash !== originalHash) {
    failures.push(`${label} status ${status} requires exact source match between ${originalPath} and ${piPath}`);
  }
}

function collectFilesRecursive(directoryPath) {
  let entries;
  try {
    entries = readdirSync(directoryPath, { withFileTypes: true });
  } catch (error) {
    failures.push(`${relativePosixPath(root, directoryPath) || normalizePosixPath(directoryPath)} must be readable: ${error.message}`);
    return [];
  }

  return entries.flatMap((entry) => {
    const entryPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) return collectFilesRecursive(entryPath);
    if (entry.isFile()) return [entryPath];
    return [];
  });
}

function listOriginalResourcePaths() {
  if (!SHOULD_VERIFY_ORIGINAL_RESOURCES) return [];

  const originalPaths = [];
  for (const directory of ORIGINAL_RESOURCE_DIRECTORIES) {
    const directoryPath = join(ORIGINAL_RESOURCE_ROOT, directory);
    if (!existsSync(directoryPath)) {
      failures.push(`original resource directory must exist: ${normalizePosixPath(join(ORIGINAL_RESOURCE_ROOT, directory))}`);
      continue;
    }

    for (const filePath of collectFilesRecursive(directoryPath)) {
      originalPaths.push(relativePosixPath(ORIGINAL_RESOURCE_ROOT, filePath));
    }
  }

  return originalPaths.sort();
}

function hasPackageResourceFile(directoryPath, ignoredFileNames = new Set()) {
  if (!existsSync(directoryPath)) return false;

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = join(directoryPath, entry.name);
    if (entry.isDirectory() && hasPackageResourceFile(entryPath, ignoredFileNames)) return true;
    if (entry.isFile() && entry.name !== '.gitkeep' && !ignoredFileNames.has(entry.name)) return true;
  }

  return false;
}

function validatePackageResourceRoot(relativePath, options = {}) {
  const ignoredFileNames = options.ignoredFileNames ?? new Set();
  const ignoredFiles = [...ignoredFileNames].sort().map((name) => name === '.gitkeep' ? name : `the ${name}`).join(' and ');
  if (!hasPackageResourceFile(join(root, relativePath), ignoredFileNames)) {
    failures.push(`${relativePath}/ must contain at least one packaged resource file besides ${ignoredFiles || '.gitkeep'}`);
  }
}

function validateDirectoryExists(relativePath) {
  const fullPath = join(root, relativePath);
  let existsAsDirectory = false;
  try {
    existsAsDirectory = existsSync(fullPath) && readdirSync(fullPath, { withFileTypes: true }) !== undefined;
  } catch {
    existsAsDirectory = false;
  }

  if (!existsAsDirectory) failures.push(`${relativePath}/ directory must exist`);
}

function validatePackageFilesIncludes(relativePath) {
  if (!Array.isArray(pkg.files) || !pkg.files.includes(relativePath)) {
    failures.push(`package.json files must include ${relativePath}`);
  }
}

function validatePackageFilesEntryExistsOrAbsent(relativePath) {
  if (!Array.isArray(pkg.files) || !pkg.files.includes(relativePath)) return;

  if (!existsSync(join(root, relativePath))) {
    failures.push(`package.json files entry ${relativePath} must exist or be removed from the publish allowlist`);
  }
}

function validatePackageResourceRootsIncluded(relativePaths) {
  for (const relativePath of relativePaths) validatePackageFilesIncludes(relativePath);
}

function validateReadmeIncludes(readmeContent, label, requiredText) {
  if (!readmeContent.includes(requiredText)) {
    failures.push(`${README_PATH} must document ${label}: ${requiredText}`);
  }
}

function validateReadmePackagedResourceDocs() {
  if (!existsSync(join(root, README_PATH))) {
    failures.push(`missing package resource: ${README_PATH}`);
    return;
  }

  const readmeContent = readFileSync(join(root, README_PATH), 'utf8');

  for (const resourceRoot of PACKAGED_RESOURCE_ROOTS) {
    validateReadmeIncludes(readmeContent, `packaged resource root ${resourceRoot}/`, `${resourceRoot}/`);
  }

  validateReadmeIncludes(readmeContent, 'resource manifest path', RESOURCE_MANIFEST_PATH);

  for (const status of RESOURCE_MANIFEST_STATUSES) {
    validateReadmeIncludes(readmeContent, `manifest status ${status}`, status);
  }

  validateReadmeIncludes(readmeContent, 'Pi-native command implementation boundary', 'extensions/ralph-specum/index.ts');
  validateReadmeIncludes(readmeContent, 'non-executable original command/hook boundary', 'not installed as executable Claude/Codex hooks');
  validateReadmeIncludes(readmeContent, 'prepack verification command', 'npm run prepack');
  validateReadmeIncludes(readmeContent, 'pack dry-run verification command', 'npm pack --dry-run --json');
}

function validateManifestOriginalCoverage(resourceManifest) {
  if (!Array.isArray(resourceManifest)) return;

  const manifestOriginalPaths = new Set(
    resourceManifest
      .filter((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.originalPath === 'string')
      .map((entry) => normalizeManifestPath(entry.originalPath)),
  );
  const missingOriginalPaths = listOriginalResourcePaths().filter((originalPath) => !manifestOriginalPaths.has(originalPath));

  if (missingOriginalPaths.length > 0) {
    failures.push(`${RESOURCE_MANIFEST_PATH} must cover every original resource file; missing ${missingOriginalPaths.length}: ${missingOriginalPaths.join(', ')}`);
  }
}

function validateManifestEntryIntegrity(label, entry) {
  if (typeof entry.piPath !== 'string' || entry.piPath.length === 0) return;

  const piPath = normalizeManifestPath(entry.piPath);
  const piFullPath = resolvePackagePath(piPath);
  if (!existsSync(piFullPath)) {
    failures.push(`${label}.piPath must point to an existing repository file: ${piPath}`);
    return;
  }

  const piHash = validateSha256(label, entry.sha256, piFullPath, piPath);
  if (piHash === undefined) return;

  if (entry.status === 'copied' || entry.status === 'renamed') {
    if (typeof entry.originalPath !== 'string' || entry.originalPath.length === 0) return;

    validateExactChecksumMatch(label, entry.status, normalizeManifestPath(entry.originalPath), piPath, piHash);
  }
}

function validateResourceManifest() {
  if (!existsSync(RESOURCE_MANIFEST_FULL_PATH)) return undefined;

  const resourceManifest = parseJsonFile(RESOURCE_MANIFEST_FULL_PATH, RESOURCE_MANIFEST_PATH);
  if (resourceManifest === undefined) return undefined;

  if (!Array.isArray(resourceManifest)) {
    failures.push(`${RESOURCE_MANIFEST_PATH} must contain a top-level JSON array`);
    return undefined;
  }

  for (const [index, entry] of resourceManifest.entries()) {
    const label = formatManifestEntryLabel(index, entry);
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      failures.push(`${label} must be an object`);
      continue;
    }

    for (const field of ['originalPath', 'piPath']) {
      if (typeof entry[field] !== 'string' || (entry[field].length === 0 && field === 'originalPath')) {
        failures.push(`${label}.${field} must be a ${field === 'originalPath' ? 'non-empty ' : ''}string`);
      }
    }

    if (typeof entry.kind !== 'string' || !RESOURCE_MANIFEST_KINDS.has(entry.kind)) {
      failures.push(`${label}.kind must be one of ${[...RESOURCE_MANIFEST_KINDS].join(', ')}`);
    }

    if (typeof entry.status !== 'string' || !RESOURCE_MANIFEST_STATUSES.has(entry.status)) {
      failures.push(`${label}.status must be one of ${[...RESOURCE_MANIFEST_STATUSES].join(', ')}`);
    }

    if ('sha256' in entry && typeof entry.sha256 !== 'string') {
      failures.push(`${label}.sha256 must be a string when present`);
    }

    if ('notes' in entry && typeof entry.notes !== 'string') {
      failures.push(`${label}.notes must be a string when present`);
    }

    if (RESOURCE_MANIFEST_STATUSES.has(entry.status) && entry.status !== 'copied' && (typeof entry.notes !== 'string' || entry.notes.trim().length === 0)) {
      failures.push(`${label}.notes must be a non-empty string when status is ${entry.status}`);
    }

    validateManifestEntryIntegrity(label, entry);
  }

  validateManifestOriginalCoverage(resourceManifest);
  return resourceManifest;
}

const expectedManifest = {
  extensions: './extensions/ralph-specum/index.ts',
  skills: './skills',
  prompts: './prompts',
};

if (!pkg.pi?.extensions?.includes(expectedManifest.extensions)) {
  failures.push(`package.json pi.extensions must include ${expectedManifest.extensions}`);
}
if (!pkg.pi?.skills?.includes(expectedManifest.skills)) {
  failures.push(`package.json pi.skills must include ${expectedManifest.skills}`);
}
if (!pkg.pi?.prompts?.includes(expectedManifest.prompts)) {
  failures.push(`package.json pi.prompts must include ${expectedManifest.prompts}`);
}

const requiredFiles = [
  'extensions/ralph-specum/index.ts',
  'extensions/ralph-specum/paths.ts',
  'extensions/ralph-specum/state.ts',
  'extensions/ralph-specum/epics.ts',
  'extensions/ralph-specum/github.ts',
  'agents/ralph-spec-executor.md',
  'agents/ralph-task-planner.md',
  'agents/ralph-triage-analyst.md',
  RESOURCE_MANIFEST_PATH,
  SCHEMA_RESOURCE_PATH,
];

for (const file of requiredFiles) {
  const fullPath = join(root, file);
  if (!existsSync(fullPath)) {
    addPortablePublishDiagnostic({
      checkedPath: fullPath,
      missingPathType: 'file',
      message: `missing package resource: ${file}`,
    });
  }
}

applyDiagnosticFixture();

if (EXPLICIT_ORIGINAL_RESOURCE_ROOT && !ORIGINAL_RESOURCE_ROOT_AVAILABLE) {
  addPortablePublishDiagnostic({
    checkedPath: ORIGINAL_RESOURCE_ROOT,
    missingPathType: 'root',
    message: `explicit original resource root does not exist: ${ORIGINAL_RESOURCE_ROOT}`,
  });
}

validateResourceManifest();
validatePackageResourceRoot('templates');
validatePackageResourceRoot('prompts');
validatePackageResourceRoot('references', {
  ignoredFileNames: new Set(['.gitkeep', 'ralph-resource-manifest.v1.json']),
});
validateDirectoryExists('references/original-commands');
validatePackageResourceRoot('skills');
validatePackageResourceRootsIncluded(['agents', 'extensions', 'prompts', 'references', 'skills', 'templates', 'schemas']);
validateReadmePackagedResourceDocs();
validatePackageFilesEntryExistsOrAbsent('LICENSE');
validatePackageFilesEntryExistsOrAbsent('smart-ralph.png');

const agentsDir = join(root, 'agents');
if (existsSync(agentsDir)) {
  for (const file of readdirSync(agentsDir).filter((name) => /^ralph-.*\.md$/.test(name))) {
    const content = readFileSync(join(agentsDir, file), 'utf8');
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
    if (/^model\s*:/m.test(frontmatter)) failures.push(`${file} must not pin model: Ralph agents inherit the active Pi model`);
  }
}

const requiredBundledEntrypoints = [
  'node_modules/@tintinweb/pi-subagents/src/index.ts',
  'node_modules/@tintinweb/pi-tasks/src/index.ts',
  'node_modules/pi-agent-browser-native/dist/extensions/agent-browser/index.js',
  'node_modules/pi-mcp-adapter/index.ts',
];

for (const file of requiredBundledEntrypoints) {
  if (!existsSync(join(root, file))) {
    addPortablePublishDiagnostic({
      checkedPath: join(root, file),
      missingPathType: 'dependency_entrypoint',
      message: `missing bundled dependency entrypoint: ${file} (run npm install before npm pack/publish)`,
    });
  }
}

const bundled = new Set([...(pkg.bundledDependencies ?? []), ...(pkg.bundleDependencies ?? [])]);
for (const name of ['@tintinweb/pi-subagents', '@tintinweb/pi-tasks', 'pi-agent-browser-native', 'pi-mcp-adapter']) {
  if (!pkg.dependencies?.[name]) failures.push(`missing dependency declaration: ${name}`);
  if (!bundled.has(name)) failures.push(`missing bundledDependencies entry: ${name}`);
}

function parseCaseArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--case') return args[index + 1] ?? '';
    if (token.startsWith('--case=')) return token.slice('--case='.length);
  }
  return null;
}

function expectedFail(caseName, message) {
  const error = new Error(message);
  error.expectedFail = true;
  error.caseName = caseName;
  throw error;
}

function formatError(error) {
  return String(error?.stack ?? error?.message ?? error);
}

function extractMachineReadableDiagnostic(output) {
  const match = output.match(/\{[\s\S]*\}/m);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function verifyPackagePathFailureCase() {
  const fixtures = [
    {
      label: 'missing original-root',
      expectedMissingPathType: 'root',
      env: { RALPH_ORIGINAL_RESOURCE_ROOT: join(root, '__missing_publish_bundle_root__') },
    },
    {
      label: 'missing bundled file',
      expectedMissingPathType: 'file',
      env: { RALPH_PUBLISH_DIAGNOSTIC_FIXTURE: 'missing-file' },
    },
    {
      label: 'missing dependency entrypoint',
      expectedMissingPathType: 'dependency_entrypoint',
      env: { RALPH_PUBLISH_DIAGNOSTIC_FIXTURE: 'missing-dependency-entrypoint' },
    },
  ];

  for (const fixture of fixtures) {
    const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...fixture.env,
      },
    });

    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    if (result.status === 0) {
      throw new Error(`${fixture.label} fixture must fail before publish.`);
    }

    const diagnostic = extractMachineReadableDiagnostic(output);
    if (!diagnostic) {
      expectedFail(packagePathFailureCaseKey, `publish-bundle failure output is missing a machine-readable diagnostic block for ${fixture.label}. Output: ${output}`);
    }

    const missingFields = PACKAGE_VERIFICATION_FAILURE_ENVELOPE.requiredFields.filter((field) => diagnostic?.[field] === undefined || diagnostic?.[field] === null || diagnostic?.[field] === '');
    if (missingFields.length > 0) {
      expectedFail(packagePathFailureCaseKey, `publish-bundle diagnostic for ${fixture.label} is missing required fields ${missingFields.join(', ')}. Diagnostic: ${JSON.stringify(diagnostic)}`);
    }

    if (diagnostic.missingPathType !== fixture.expectedMissingPathType) {
      expectedFail(packagePathFailureCaseKey, `${fixture.label} fixture must classify as missingPathType=${fixture.expectedMissingPathType}; got ${JSON.stringify(diagnostic.missingPathType)}`);
    }
  }
}

function printPortableDiagnosticEnvelope(diagnostic) {
  console.error(diagnostic.status);
  console.error(`category: ${diagnostic.category}`);
  console.error(`reasonCode: ${diagnostic.reasonCode}`);
  console.error(`failingCommand: ${diagnostic.failingCommand}`);
  console.error(`recoverable: ${diagnostic.recoverable}`);
  console.error(`suggestedRecovery: ${diagnostic.suggestedRecovery}`);
  if (Array.isArray(diagnostic.evidence)) {
    for (const line of diagnostic.evidence) {
      console.error(`Evidence: ${line}`);
    }
  }
  console.error(JSON.stringify(diagnostic, null, 2));
}

function main() {
  if (requestedCase) {
    if (requestedCase !== packagePathFailureCaseKey) {
      console.error(`Unknown verify case: ${requestedCase}`);
      console.error(`Supported cases: ${packagePathFailureCaseKey}`);
      process.exit(2);
      return;
    }

    try {
      verifyPackagePathFailureCase();
      console.log(`PASS ${packagePathFailureCaseKey}`);
      return;
    } catch (error) {
      if (error?.expectedFail === true) {
        console.error(`EXPECTED_FAIL ${packagePathFailureCaseKey}: ${error.message}`);
      } else {
        console.error(`FAIL ${packagePathFailureCaseKey}: ${formatError(error)}`);
      }
      process.exit(1);
      return;
    }
  }

  if (failures.length > 0) {
    console.error('Smart Ralph package verification failed:');
    if (portableDiagnostics.length > 0) {
      printPortableDiagnosticEnvelope(portableDiagnostics[0]);
      if (portableDiagnostics.length > 1) {
        console.error(`Additional portable diagnostics: ${JSON.stringify(portableDiagnostics.slice(1))}`);
      }
    }
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
}

main();
