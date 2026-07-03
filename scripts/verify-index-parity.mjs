#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = process.cwd();
const requestedCase = parseCaseArg(process.argv.slice(2));

const cases = new Map([
  ['parser-unknown', verifyParserUnknown],
  ['parser-options', verifyParserOptions],
  ['paths', verifyPaths],
  ['scanner', verifyScanner],
  ['dry-run', verifyDryRun],
  ['render-contract', verifyRenderContract],
  ['hash-skip-force', verifyHashSkipForce],
  ['changed-git', verifyChangedGit],
  ['external-adapters', verifyExternalAdapters],
  ['command-registration', verifyCommandRegistration],
  ['package-wiring', verifyPackageWiring],
]);

async function main() {
  if (!requestedCase || requestedCase === 'all') {
    for (const verifyCase of cases.values()) {
      await verifyCase();
    }
    console.log('PASS index parity verifier');
    return;
  }

  const verifyCase = cases.get(requestedCase);
  if (!verifyCase) {
    console.error(`Unknown verify case: ${requestedCase}`);
    console.error(`Supported cases: ${[...cases.keys()].join(', ')}`);
    process.exitCode = 2;
    return;
  }

  await verifyCase();
  console.log(`PASS ${requestedCase}`);
}

function parseCaseArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--case') return args[index + 1] ?? '';
    if (token.startsWith('--case=')) return token.slice('--case='.length);
  }
  return 'all';
}

async function verifyParserUnknown() {
  const parseIndexArgs = await loadParseIndexArgs();

  const defaultsResult = parseIndexArgs([]);
  assertStableDefaultShape(defaultsResult, 'default parse result');

  const unsupportedOption = '--definitely-unsupported-index-option';
  const result = parseIndexArgs([unsupportedOption]);
  const ok = result?.ok === true;
  const errorText = String(result?.error?.message ?? result?.error ?? result?.message ?? '');

  if (ok || !errorText.includes(unsupportedOption)) {
    expectedFail(
      `unsupported option ${unsupportedOption} must return an error naming the option; got ${JSON.stringify(result)}`,
    );
  }

  assertStableDefaultShape(result, 'unknown option parse result');
}

async function verifyPaths() {
  const helper = await loadIndexingHelper();
  const resolveIndexPaths = helper?.resolveIndexPaths;
  const readPriorIndexState = helper?.readPriorIndexState ?? helper?.readIndexState;
  const assertIndexOutputPath = helper?.assertIndexOutputPath;
  const getComponentIndexPath = helper?.getComponentIndexPath;
  const toIndexDisplayPath = helper?.toIndexDisplayPath;

  if (typeof resolveIndexPaths !== 'function') {
    expectedFail('resolveIndexPaths is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof readPriorIndexState !== 'function') {
    expectedFail('readPriorIndexState/readIndexState is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof assertIndexOutputPath !== 'function') {
    expectedFail('assertIndexOutputPath is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof getComponentIndexPath !== 'function') {
    expectedFail('getComponentIndexPath is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof toIndexDisplayPath !== 'function') {
    expectedFail('toIndexDisplayPath is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-index-paths-'));
  try {
    const projectRoot = join(tempRoot, 'project');
    const scanRoot = join(projectRoot, 'src');
    const specRoot = join(tempRoot, 'custom-spec-root');
    mkdirSync(scanRoot, { recursive: true });
    mkdirSync(specRoot, { recursive: true });

    const resolved = resolveIndexPaths({ cwd: projectRoot, scanPath: scanRoot, specRoot });
    const paths = resolved?.paths ?? resolved;
    const indexRoot = join(specRoot, '.index');
    const canonicalStatePath = join(indexRoot, 'index-state.json');
    const aliasStatePath = join(indexRoot, '.index-state.json');

    assertEqual(paths?.projectRoot, resolve(projectRoot), 'resolved project root');
    assertEqual(paths?.scanPath, resolve(scanRoot), 'resolved scan path');
    assertEqual(paths?.specRoot, resolve(specRoot), 'resolved configured spec root');
    assertEqual(paths?.indexRoot, indexRoot, 'resolved index root');
    assertEqual(paths?.statePath, canonicalStatePath, 'canonical state path');
    assertEqual(paths?.stateWritePath, canonicalStatePath, 'canonical write-only state path');
    assertArrayEqual(paths?.stateReadPaths, [canonicalStatePath, aliasStatePath], 'canonical-first state read paths');
    assertEqual(paths?.summaryPath, join(indexRoot, 'index.md'), 'summary path');
    assertEqual(paths?.componentRoot, join(indexRoot, 'components'), 'component root');
    assertEqual(paths?.externalRoot, join(indexRoot, 'external'), 'external root');
    assertEqual(paths?.stateAliasPath, aliasStatePath, 'compatibility read-only state alias path');

    assertIndexOutputPath(paths.indexRoot, paths.summaryPath, 'summary path');
    assertIndexOutputPath(paths.indexRoot, getComponentIndexPath(paths, join(scanRoot, 'accounts.service.ts'), 'services'), 'component artifact path');
    assertThrows(() => assertIndexOutputPath(paths.indexRoot, join(indexRoot, '..', 'escape.md'), 'escaping output path'), 'escaping output path');
    assertEqual(toIndexDisplayPath(paths, join(projectRoot, 'src', 'accounts.service.ts')), 'src/accounts.service.ts', 'inside project display path');
    assertEqual(toIndexDisplayPath(paths, join(tempRoot, 'external-src', 'outside.service.ts')), join(tempRoot, 'external-src', 'outside.service.ts'), 'outside project display path');

    mkdirSync(indexRoot, { recursive: true });
    const aliasState = { indexed: 'alias-state-read', components: [], external: [] };
    writeFileSync(aliasStatePath, `${JSON.stringify(aliasState)}\n`, 'utf8');

    const priorStateResult = readPriorIndexState(paths);
    const priorState = priorStateResult?.state ?? priorStateResult;
    const priorStatePath = priorStateResult?.path ?? priorStateResult?.statePath ?? priorStateResult?.sourcePath;

    assertEqual(priorState?.indexed, aliasState.indexed, 'compatibility alias state read');
    if (priorStatePath !== undefined) {
      assertEqual(priorStatePath, aliasStatePath, 'compatibility alias state source path');
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyScanner() {
  const helper = await loadIndexingHelper();
  const parseIndexArgs = helper?.parseIndexArgs;
  const resolveIndexPaths = helper?.resolveIndexPaths;
  const scanComponentFiles = helper?.scanComponentFiles;
  const classifyIndexComponentFile = helper?.classifyIndexComponentFile;
  const createIndexExcludeMatcher = helper?.createIndexExcludeMatcher;

  if (typeof parseIndexArgs !== 'function') {
    expectedFail('parseIndexArgs is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof resolveIndexPaths !== 'function') {
    expectedFail('resolveIndexPaths is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof scanComponentFiles !== 'function') {
    expectedFail('scanComponentFiles is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof classifyIndexComponentFile !== 'function') {
    expectedFail('classifyIndexComponentFile is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof createIndexExcludeMatcher !== 'function') {
    expectedFail('createIndexExcludeMatcher is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  assertEqual(classifyIndexComponentFile('/tmp/app/controllers/accounts.controller.ts'), 'controllers', 'isolated controller classifier');
  assertEqual(classifyIndexComponentFile('/tmp/app/services/accounts.service.ts'), 'services', 'isolated service classifier');
  const excludeMatcher = createIndexExcludeMatcher(['generated/**', '*excluded.service.ts']);
  assertEqual(excludeMatcher('generated/client.ts', 'client.ts'), true, 'directory wildcard exclude matcher');
  assertEqual(excludeMatcher('services/excluded.service.ts', 'excluded.service.ts'), true, 'basename wildcard exclude matcher');
  assertEqual(excludeMatcher('services/accounts.service.ts', 'accounts.service.ts'), false, 'non-matching exclude matcher');

  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-index-scanner-'));
  try {
    const projectRoot = join(tempRoot, 'project');
    const scanRoot = join(projectRoot, 'src');
    const specRoot = join(tempRoot, 'specs');
    const servicesRoot = join(scanRoot, 'services');
    const controllersRoot = join(scanRoot, 'controllers');
    mkdirSync(servicesRoot, { recursive: true });
    mkdirSync(controllersRoot, { recursive: true });
    mkdirSync(specRoot, { recursive: true });

    const servicePath = join(servicesRoot, 'accounts.service.ts');
    const serviceSource = 'export class AccountsService {\n  list() { return []; }\n}\n';
    const billingServicePath = join(servicesRoot, 'billing.service.ts');
    writeFileSync(join(servicesRoot, 'excluded.service.ts'), 'export class ExcludedService {}\n', 'utf8');
    writeFileSync(billingServicePath, 'export class BillingService {}\n', 'utf8');
    writeFileSync(servicePath, serviceSource, 'utf8');
    writeFileSync(join(controllersRoot, 'accounts.controller.ts'), 'export class AccountsController {}\n', 'utf8');

    const parseResult = parseIndexArgs([
      '--path',
      scanRoot,
      '--type',
      'services',
      '--exclude',
      '*excluded.service.ts',
      '--quick',
    ]);

    if (parseResult?.ok !== true) {
      expectedFail(`scanner options must parse successfully; got ${stringifyParseResult(parseResult)}`);
    }

    const paths = resolveIndexPaths({ cwd: projectRoot, scanPath: parseResult.options.scanPath, specRoot });
    const scanResult = await scanComponentFiles({ paths, options: parseResult.options });
    const components = scanResult?.components ?? scanResult?.entries ?? scanResult;

    if (!Array.isArray(components)) {
      expectedFail(`scanComponentFiles must return an array or { components }; got ${JSON.stringify(scanResult)}`);
    }

    assertEqual(components.length, 2, 'scanner service-only component count');
    assertArrayEqual(
      components.map((component) => component.sourcePath),
      [resolve(servicePath), resolve(billingServicePath)],
      'deterministic scanner source ordering',
    );
    const [component] = components;
    assertEqual(component.category, 'services', 'service component category');
    assertEqual(component.sourcePath, resolve(servicePath), 'service source path');
    assertEqual(component.sourceDisplayPath, 'src/services/accounts.service.ts', 'normalized service source display path');
    assertEqual(component.hash, sha256(serviceSource), 'service source SHA-256 hash');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyDryRun() {
  const helper = await loadIndexingHelper();
  const runRalphIndex = helper?.runRalphIndex;
  const parseIndexArgs = helper?.parseIndexArgs;
  const resolveIndexPaths = helper?.resolveIndexPaths;
  const scanComponentFiles = helper?.scanComponentFiles;
  const planIndexWrites = helper?.planIndexWrites;
  const writeIndexPlan = helper?.writeIndexPlan;
  const INDEX_WRITE_KINDS = helper?.INDEX_WRITE_KINDS;

  if (typeof runRalphIndex !== 'function') {
    expectedFail('runRalphIndex is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof parseIndexArgs !== 'function') {
    expectedFail('parseIndexArgs is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof resolveIndexPaths !== 'function') {
    expectedFail('resolveIndexPaths is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof scanComponentFiles !== 'function') {
    expectedFail('scanComponentFiles is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof planIndexWrites !== 'function') {
    expectedFail('planIndexWrites is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof writeIndexPlan !== 'function') {
    expectedFail('writeIndexPlan is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  assertStableWriteKinds(INDEX_WRITE_KINDS);

  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-index-dry-run-'));
  try {
    const projectRoot = join(tempRoot, 'project');
    const scanRoot = join(projectRoot, 'src');
    const servicesRoot = join(scanRoot, 'services');
    const specRoot = join(tempRoot, 'spec-root');
    mkdirSync(servicesRoot, { recursive: true });
    mkdirSync(specRoot, { recursive: true });

    const servicePath = join(servicesRoot, 'accounts.service.ts');
    writeFileSync(servicePath, 'export class AccountsService { list() { return []; } }\n', 'utf8');

    const args = ['--path', scanRoot, '--type', 'services', '--dry-run', '--quick'];
    const parseResult = parseIndexArgs(args);
    if (parseResult?.ok !== true) {
      expectedFail(`dry-run planner options must parse successfully; got ${stringifyParseResult(parseResult)}`);
    }

    const paths = resolveIndexPaths({ cwd: projectRoot, scanPath: parseResult.options.scanPath, specRoot });
    const scanResult = await scanComponentFiles({ paths, options: parseResult.options });
    const plan = planIndexWrites({
      paths,
      options: { ...parseResult.options, specRoot },
      components: scanResult.components,
      priorState: null,
      indexedAt: '2026-01-02T03:04:05.000Z',
    });

    assertPlannedWrite(plan.writes, 'component', servicePath);
    assertPlannedWrite(plan.writes, 'summary', 'index.md');
    assertPlannedWrite(plan.writes, 'state', 'index-state.json');
    if (existsSync(join(specRoot, '.index'))) {
      expectedFail('planner must be invokable without creating a .index/ directory or files.');
    }

    writeIndexPlan(plan.writes, { dryRun: true });
    if (existsSync(join(specRoot, '.index'))) {
      expectedFail('dry-run writer guard must prevent creating a .index/ directory or files.');
    }

    const result = await runRalphIndex({
      cwd: projectRoot,
      specRoot,
      args,
    });

    if (result?.ok !== true || result?.dryRun !== true) {
      expectedFail(`dry-run helper must return an ok dry-run result; got ${JSON.stringify(result)}`);
    }

    const writes = result?.writes;
    if (!Array.isArray(writes)) {
      expectedFail(`dry-run result must include planned writes; got ${JSON.stringify(result)}`);
    }

    assertPlannedWrite(writes, 'component', servicePath);
    assertPlannedWrite(writes, 'summary', 'index.md');
    assertPlannedWrite(writes, 'state', 'index-state.json');

    const reportedPlan = `${result?.message ?? ''}\n${writes
      .map((write) => `${write.action ?? ''} ${write.kind ?? ''} ${write.path ?? ''}`)
      .join('\n')}`;
    for (const expectedText of ['create', 'component', 'summary', 'state']) {
      if (!reportedPlan.includes(expectedText)) {
        expectedFail(`dry-run plan must report ${expectedText}; got ${reportedPlan}`);
      }
    }

    if (existsSync(join(specRoot, '.index'))) {
      expectedFail('dry-run must not create a .index/ directory or files.');
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyRenderContract() {
  const helper = await loadIndexingHelper();
  const runRalphIndex = helper?.runRalphIndex;

  if (typeof runRalphIndex !== 'function') {
    expectedFail('runRalphIndex is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-index-render-contract-'));
  try {
    const projectRoot = join(tempRoot, 'project');
    const scanRoot = join(projectRoot, 'src');
    const servicesRoot = join(scanRoot, 'services');
    const specRoot = join(tempRoot, 'spec-root');
    mkdirSync(servicesRoot, { recursive: true });
    mkdirSync(specRoot, { recursive: true });

    const servicePath = join(servicesRoot, 'accounts.service.ts');
    const duplicateServiceRoot = join(servicesRoot, 'billing');
    mkdirSync(duplicateServiceRoot, { recursive: true });
    const duplicateServicePath = join(duplicateServiceRoot, 'accounts.service.ts');
    const serviceSource = 'export class AccountsService { list() { return []; } }\n';
    const duplicateServiceSource = 'export class BillingAccountsService { list() { return []; } }\n';
    writeFileSync(servicePath, serviceSource, 'utf8');
    writeFileSync(duplicateServicePath, duplicateServiceSource, 'utf8');

    const result = await runRalphIndex({
      cwd: projectRoot,
      specRoot,
      args: ['--path', scanRoot, '--type', 'services', '--quick'],
    });

    if (result?.ok !== true || result?.dryRun !== false) {
      expectedFail(`non-dry-run helper must return an ok write result; got ${JSON.stringify(result)}`);
    }

    const componentDir = join(specRoot, '.index', 'components');
    const componentFiles = readdirSync(componentDir).filter((entry) => entry.endsWith('.md'));
    assertEqual(componentFiles.length, 2, 'component artifact count for duplicate basenames');
    assertEqual(new Set(componentFiles).size, 2, 'duplicate basenames produce unique component artifact filenames');
    if (!componentFiles.every((file) => file.startsWith('services-accounts-service-'))) {
      expectedFail(`duplicate basename artifact filenames must keep stable category/base prefixes; got ${componentFiles.join(', ')}`);
    }

    const frontmatters = componentFiles.map((file) => {
      const componentPath = join(componentDir, file);
      const componentMarkdown = readFileSync(componentPath, 'utf8');
      const frontmatter = parseFrontmatter(componentMarkdown);
      assertRequiredFrontmatter(frontmatter, ['type', 'generated', 'source', 'hash', 'category', 'indexed'], componentPath);
      return { path: componentPath, markdown: componentMarkdown, frontmatter };
    });
    const primaryComponent = frontmatters.find((entry) => entry.frontmatter.source === 'src/services/accounts.service.ts');
    if (!primaryComponent) {
      expectedFail(`component frontmatter source must include primary service; got ${JSON.stringify(frontmatters.map((entry) => entry.frontmatter))}`);
    }
    const { frontmatter } = primaryComponent;
    assertEqual(frontmatter.type, 'component-spec', 'component frontmatter type follows packaged schema');
    assertEqual(frontmatter.generated, 'true', 'component frontmatter generated flag');
    assertEqual(frontmatter.source, 'src/services/accounts.service.ts', 'component frontmatter source');
    assertEqual(frontmatter.hash, sha256(serviceSource), 'component frontmatter source hash');
    assertEqual(frontmatter.category, 'services', 'component frontmatter category');
    if (!primaryComponent.markdown.includes('## Purpose') || !primaryComponent.markdown.includes('## Location')) {
      expectedFail(`component renderer must use packaged template structure or explicit fallback sections; got ${primaryComponent.markdown}`);
    }

    const statePath = join(specRoot, '.index', 'index-state.json');
    const summaryPath = join(specRoot, '.index', 'index.md');
    if (!existsSync(statePath) || !existsSync(summaryPath)) {
      expectedFail('non-dry-run indexing must write index-state.json and index.md contract artifacts.');
    }

    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assertEqual(state.componentCount, 2, 'state component count');
    assertEqual(state.externalCount, 0, 'state external count');
    assertEqual(state.created, 4, 'state created count for components, summary, and state');
    assertEqual(state.updated, 0, 'state updated count');
    assertEqual(state.skipped, 0, 'state skipped count');
    assertEqual(state.components?.[0]?.source, frontmatter.source, 'state component source matches frontmatter');
    assertEqual(state.components?.[0]?.hash, frontmatter.hash, 'state component hash matches frontmatter');
    assertEqual(state.components?.[0]?.category, frontmatter.category, 'state component category matches frontmatter');

    const summary = readFileSync(summaryPath, 'utf8').toLowerCase();
    for (const expectedText of [
      'generated-at',
      `component count: ${state.componentCount}`,
      `external count: ${state.externalCount}`,
      `created: ${state.created}`,
      `updated: ${state.updated}`,
      `skipped: ${state.skipped}`,
    ]) {
      if (!summary.includes(expectedText)) {
        expectedFail(`index.md must include ${expectedText} matching index-state.json; got ${summary}`);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyHashSkipForce() {
  const helper = await loadIndexingHelper();
  const runRalphIndex = helper?.runRalphIndex;
  const selectIndexWriteAction = helper?.selectIndexWriteAction;

  if (typeof runRalphIndex !== 'function') {
    expectedFail('runRalphIndex is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof selectIndexWriteAction !== 'function') {
    expectedFail('selectIndexWriteAction must be exported so create/update/skip selection is isolated.');
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-index-hash-skip-force-'));
  try {
    const projectRoot = join(tempRoot, 'project');
    const scanRoot = join(projectRoot, 'src');
    const servicesRoot = join(scanRoot, 'services');
    const specRoot = join(tempRoot, 'spec-root');
    mkdirSync(servicesRoot, { recursive: true });
    mkdirSync(specRoot, { recursive: true });

    const servicePath = join(servicesRoot, 'accounts.service.ts');
    writeFileSync(servicePath, 'export class AccountsService { list() { return []; } }\n', 'utf8');

    const args = ['--path', scanRoot, '--type', 'services', '--quick'];
    const firstResult = await runRalphIndex({ cwd: projectRoot, specRoot, args });
    if (firstResult?.ok !== true) {
      expectedFail(`initial hash-skip fixture run must succeed; got ${JSON.stringify(firstResult)}`);
    }

    const firstComponentWrite = findComponentWrite(firstResult.writes, servicePath);
    assertEqual(firstComponentWrite.action, 'create', 'initial component write action');
    const componentPath = firstComponentWrite.artifactPath;
    if (!componentPath || !existsSync(componentPath)) {
      expectedFail(`initial run must create a component artifact; got ${JSON.stringify(firstComponentWrite)}`);
    }

    assertEqual(
      selectIndexWriteAction({ targetPath: join(specRoot, '.index', 'missing.md'), unchanged: false, force: false }),
      'create',
      'isolated action helper create branch',
    );
    assertEqual(
      selectIndexWriteAction({ targetPath: componentPath, unchanged: true, force: false }),
      'skip',
      'isolated action helper skip branch',
    );
    assertEqual(
      selectIndexWriteAction({ targetPath: componentPath, unchanged: true, force: true }),
      'update',
      'isolated action helper force update branch',
    );

    const firstContent = readFileSync(componentPath, 'utf8');
    const firstMtimeMs = statSync(componentPath).mtimeMs;

    const secondResult = await runRalphIndex({ cwd: projectRoot, specRoot, args });
    if (secondResult?.ok !== true) {
      expectedFail(`second unchanged fixture run must succeed; got ${JSON.stringify(secondResult)}`);
    }

    const secondComponentWrite = findComponentWrite(secondResult.writes, servicePath);
    assertEqual(secondComponentWrite.action, 'skip', 'unchanged component write action');
    // Summary/state are refreshed on each run, so indexed timestamps may drift; deterministic assertions focus
    // on component action counts and skipped artifact preservation instead of full state byte equality.
    assertEqual(secondResult.state?.created, 0, 'unchanged run created count');
    if (!String(secondComponentWrite.reason ?? '').includes('unchanged')) {
      expectedFail(`unchanged skip write must explain that the source hash is unchanged; got ${JSON.stringify(secondComponentWrite)}`);
    }
    assertEqual(secondResult.state?.skipped, 1, 'unchanged run skipped count');

    const secondContent = readFileSync(componentPath, 'utf8');
    const secondMtimeMs = statSync(componentPath).mtimeMs;
    if (secondContent !== firstContent && secondMtimeMs !== firstMtimeMs) {
      expectedFail('unchanged skip run must preserve component artifact content or mtime.');
    }

    const secondReport = `${secondResult.message ?? ''}\n${secondResult.writes
      .map((write) => `${write.action ?? ''} ${write.kind ?? ''} ${write.path ?? ''}`)
      .join('\n')}`;
    if (!secondReport.includes('skip')) {
      expectedFail(`unchanged run must report a skip action; got ${secondReport}`);
    }

    const forceResult = await runRalphIndex({ cwd: projectRoot, specRoot, args: [...args, '--force'] });
    if (forceResult?.ok !== true) {
      expectedFail(`force hash-skip fixture run must succeed; got ${JSON.stringify(forceResult)}`);
    }

    const forceComponentWrite = findComponentWrite(forceResult.writes, servicePath);
    assertEqual(forceComponentWrite.action, 'update', 'force unchanged component write action');
    assertEqual(forceResult.state?.updated, 1, 'force unchanged run updated count');

    const forceReport = `${forceResult.message ?? ''}\n${forceResult.writes
      .map((write) => `${write.action ?? ''} ${write.kind ?? ''} ${write.path ?? ''}`)
      .join('\n')}`;
    if (!forceReport.includes('update')) {
      expectedFail(`force run must report an update action for unchanged sources; got ${forceReport}`);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyChangedGit() {
  const helper = await loadIndexingHelper();
  const runRalphIndex = helper?.runRalphIndex;
  const runGitCommand = helper?.runGitCommand;

  if (typeof runRalphIndex !== 'function') {
    expectedFail('runRalphIndex is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof runGitCommand !== 'function') {
    expectedFail('runGitCommand is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  const nonGitRoot = mkdtempSync(join(tmpdir(), 'ralph-index-changed-non-git-'));
  try {
    const projectRoot = join(nonGitRoot, 'project');
    const scanRoot = join(projectRoot, 'src');
    const servicesRoot = join(scanRoot, 'services');
    const specRoot = join(nonGitRoot, 'spec-root');
    mkdirSync(servicesRoot, { recursive: true });
    mkdirSync(specRoot, { recursive: true });
    writeFileSync(join(servicesRoot, 'accounts.service.ts'), 'export class AccountsService {}\n', 'utf8');

    const nonGitResult = await runRalphIndex({
      cwd: projectRoot,
      specRoot,
      args: ['--path', scanRoot, '--type', 'services', '--changed', '--quick'],
    });
    const nonGitMessage = String(nonGitResult?.error ?? nonGitResult?.message ?? '');
    if (nonGitResult?.ok !== false || !/git/i.test(nonGitMessage) || !/worktree|work tree/i.test(nonGitMessage)) {
      expectedFail(`--changed outside Git must fail with a Git worktree message; got ${JSON.stringify(nonGitResult)}`);
    }
  } finally {
    rmSync(nonGitRoot, { recursive: true, force: true });
  }

  const gitRoot = mkdtempSync(join(tmpdir(), 'ralph-index-changed-git-'));
  try {
    const projectRoot = join(gitRoot, 'project');
    const scanRoot = join(projectRoot, 'src');
    const servicesRoot = join(scanRoot, 'services');
    const controllersRoot = join(scanRoot, 'controllers');
    const specRoot = join(gitRoot, 'spec-root');
    mkdirSync(servicesRoot, { recursive: true });
    mkdirSync(controllersRoot, { recursive: true });
    mkdirSync(specRoot, { recursive: true });

    const changedServicePath = join(servicesRoot, 'accounts.service.ts');
    const unchangedServicePath = join(servicesRoot, 'billing.service.ts');
    const changedControllerPath = join(controllersRoot, 'accounts.controller.ts');
    writeFileSync(changedServicePath, 'export class AccountsService { list() { return []; } }\n', 'utf8');
    writeFileSync(unchangedServicePath, 'export class BillingService { list() { return []; } }\n', 'utf8');
    writeFileSync(changedControllerPath, 'export class AccountsController { list() { return []; } }\n', 'utf8');

    runFixtureGitCommand(projectRoot, ['init']);
    runFixtureGitCommand(projectRoot, ['config', 'user.email', 'ralph-index@example.test']);
    runFixtureGitCommand(projectRoot, ['config', 'user.name', 'Ralph Index Verifier']);
    runFixtureGitCommand(projectRoot, ['add', 'src']);
    runFixtureGitCommand(projectRoot, ['commit', '-m', 'fixture baseline']);

    writeFileSync(changedServicePath, 'export class AccountsService { listChanged() { return []; } }\n', 'utf8');
    writeFileSync(changedControllerPath, 'export class AccountsController { listChanged() { return []; } }\n', 'utf8');
    writeFileSync(join(servicesRoot, 'untracked.service.ts'), 'export class UntrackedService {}\n', 'utf8');

    assertArrayEqual(
      fixtureGitChangedPaths(projectRoot),
      ['src/controllers/accounts.controller.ts', 'src/services/accounts.service.ts'],
      'git diff changed paths fixture',
    );

    const helperDiff = runGitCommand(scanRoot, ['diff', '--name-only']);
    assertEqual(helperDiff.status, 0, 'indexing Git helper diff status');

    const result = await runRalphIndex({
      cwd: projectRoot,
      specRoot,
      args: ['--path', scanRoot, '--type', 'services', '--changed', '--quick'],
    });
    if (result?.ok !== true) {
      expectedFail(`--changed inside Git must succeed after filtering changed files; got ${JSON.stringify(result)}`);
    }

    const componentWrites = result.writes.filter((write) => write?.kind === 'component');
    assertArrayEqual(
      componentWrites.map((write) => write.sourcePath),
      [resolve(changedServicePath)],
      '--changed component writes filtered to git diff service paths only',
    );
    assertEqual(result.state?.componentCount, 1, '--changed state component count');
    assertEqual(result.state?.components?.[0]?.source, 'src/services/accounts.service.ts', '--changed state component source');
  } finally {
    rmSync(gitRoot, { recursive: true, force: true });
  }
}

async function verifyExternalAdapters() {
  const helper = await loadIndexingHelper();
  const parseIndexArgs = helper?.parseIndexArgs;
  const resolveIndexPaths = helper?.resolveIndexPaths;
  const collectExternalResources = helper?.collectExternalResources ?? helper?.collectIndexExternalResources;
  const runRalphIndex = helper?.runRalphIndex;

  if (typeof parseIndexArgs !== 'function') {
    expectedFail('parseIndexArgs is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof resolveIndexPaths !== 'function') {
    expectedFail('resolveIndexPaths is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof collectExternalResources !== 'function') {
    expectedFail('collectExternalResources is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  if (typeof runRalphIndex !== 'function') {
    expectedFail('runRalphIndex is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  const manifestPath = join(root, 'references', 'ralph-resource-manifest.v1.json');
  const manifestSource = readFileSync(manifestPath, 'utf8');
  const manifestHash = sha256(manifestSource);

  const tempRoot = mkdtempSync(join(tmpdir(), 'ralph-index-external-adapters-'));
  try {
    const projectRoot = join(tempRoot, 'project');
    const scanRoot = join(projectRoot, 'src');
    const specRoot = join(tempRoot, 'spec-root');
    mkdirSync(scanRoot, { recursive: true });
    mkdirSync(specRoot, { recursive: true });
    writeFileSync(join(scanRoot, 'accounts.service.ts'), 'export class AccountsService {}\n', 'utf8');

    const parseResult = parseIndexArgs(['--path', scanRoot, '--quick']);
    if (parseResult?.ok !== true) {
      expectedFail(`external adapter fixture options must parse successfully; got ${stringifyParseResult(parseResult)}`);
    }

    const paths = resolveIndexPaths({ cwd: projectRoot, scanPath: parseResult.options.scanPath, specRoot });
    const baseOptions = {
      ...parseResult.options,
      specRoot,
      externalInputs: {
        urls: [],
        mcpResources: [],
        includePackageResources: false,
      },
    };
    const lazyCalls = { urls: [], mcpResources: [] };
    const lazyAdapters = createExternalAdapterSpies(lazyCalls);

    const lazyResult = await collectExternalResources({
      paths,
      options: baseOptions,
      adapters: lazyAdapters,
      indexedAt: '2026-01-02T03:04:05.000Z',
    });
    const lazyExternal = normalizeExternalEntries(lazyResult);
    if (lazyCalls.urls.length !== 0 || lazyCalls.mcpResources.length !== 0) {
      expectedFail(`URL/MCP adapters must not be called without explicit inputs; got ${JSON.stringify(lazyCalls)}`);
    }
    assertEqual(lazyExternal.entries.length, 0, 'no explicit external entries by default');

    const packageResult = await collectExternalResources({
      paths,
      options: {
        ...baseOptions,
        externalInputs: {
          ...baseOptions.externalInputs,
          includePackageResources: true,
        },
      },
      adapters: lazyAdapters,
      indexedAt: '2026-01-02T03:04:05.000Z',
    });
    const packageExternal = normalizeExternalEntries(packageResult);
    const manifestEntry = packageExternal.entries.find((entry) => JSON.stringify(entry).includes('references/ralph-resource-manifest.v1.json'));
    if (!manifestEntry) {
      expectedFail(`package resource indexing must include references/ralph-resource-manifest.v1.json; got ${JSON.stringify(packageExternal)}`);
    }
    if (manifestEntry.hash !== manifestHash) {
      expectedFail(`manifest external entry must hash the packaged manifest contents; expected ${manifestHash}, got ${manifestEntry.hash}`);
    }

    const failingCalls = { urls: [], mcpResources: [] };
    const failingAdapters = createExternalAdapterSpies(failingCalls, {
      urlError: new Error('fixture URL fetch failure'),
      mcpError: new Error('fixture MCP fetch failure'),
    });
    const failureResult = await collectExternalResources({
      paths,
      options: {
        ...baseOptions,
        externalInputs: {
          urls: ['https://example.invalid/architecture'],
          mcpResources: ['mcp://fixture/resource'],
          includePackageResources: false,
        },
      },
      adapters: failingAdapters,
      indexedAt: '2026-01-02T03:04:05.000Z',
    });
    const failureExternal = normalizeExternalEntries(failureResult);

    assertArrayEqual(failingCalls.urls, ['https://example.invalid/architecture'], 'explicit URL adapter calls');
    assertArrayEqual(failingCalls.mcpResources, ['mcp://fixture/resource'], 'explicit MCP adapter calls');
    if (failureExternal.ok === false) {
      expectedFail(`external adapter failures must be recoverable, not fatal; got ${JSON.stringify(failureResult)}`);
    }
    assertRecoverableExternalError(failureExternal.errors, 'url', 'https://example.invalid/architecture', 'fixture URL fetch failure');
    assertRecoverableExternalError(failureExternal.errors, 'mcp', 'mcp://fixture/resource', 'fixture MCP fetch failure');

    const runCalls = { urls: [], mcpResources: [] };
    const runResult = await runRalphIndex({
      cwd: projectRoot,
      specRoot,
      args: ['--path', scanRoot, '--type', 'services', '--quick'],
      externalInputs: {
        urls: ['https://example.invalid/recoverable'],
        mcpResources: [],
        includePackageResources: false,
      },
      adapters: createExternalAdapterSpies(runCalls, {
        urlError: new Error('fixture run URL failure'),
        mcpError: new Error('MCP should stay lazy for this run'),
      }),
    });
    if (runResult?.ok !== true) {
      expectedFail(`component indexing must succeed when one requested external resource fails; got ${JSON.stringify(runResult)}`);
    }
    assertArrayEqual(runCalls.urls, ['https://example.invalid/recoverable'], 'run-level explicit URL adapter calls');
    assertArrayEqual(runCalls.mcpResources, [], 'run-level MCP adapter stays lazy without explicit MCP inputs');
    assertEqual(runResult.state.componentCount, 1, 'component count with recoverable external failure');
    assertEqual(runResult.state.externalCount, 0, 'external success count excludes failed external resources');
    assertRecoverableExternalError(runResult.state.errors, 'url', 'https://example.invalid/recoverable', 'fixture run URL failure');
    assertEqual(runResult.state.errors[0]?.recoverable, true, 'state marks external failures recoverable');
    const summary = readFileSync(runResult.summaryPath, 'utf8');
    if (!summary.includes('recoverable external errors: 1') || !summary.includes('fixture run URL failure')) {
      expectedFail(`summary must include recoverable external error count and detail; got ${summary}`);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function createExternalAdapterSpies(calls, failures = {}) {
  return {
    fetchUrl: async (url) => {
      calls.urls.push(url);
      if (failures.urlError) throw failures.urlError;
      return { sourceType: 'url', sourceId: url, fetched: '2026-01-02T03:04:05.000Z', summary: `Fetched ${url}` };
    },
    fetchMcpResource: async (resource) => {
      calls.mcpResources.push(resource);
      if (failures.mcpError) throw failures.mcpError;
      return { sourceType: 'mcp', sourceId: resource, fetched: '2026-01-02T03:04:05.000Z', summary: `Fetched ${resource}` };
    },
  };
}

function normalizeExternalEntries(result) {
  if (Array.isArray(result)) return { ok: true, entries: result, errors: [] };
  return {
    ok: result?.ok,
    entries: result?.external ?? result?.entries ?? result?.resources ?? [],
    errors: result?.errors ?? result?.state?.errors ?? [],
  };
}

function assertRecoverableExternalError(errors, sourceType, sourceId, messageFragment) {
  const error = errors.find((candidate) => {
    const serialized = JSON.stringify(candidate);
    return serialized.includes(sourceType) && serialized.includes(sourceId) && serialized.includes(messageFragment);
  });
  if (!error) {
    expectedFail(`recoverable ${sourceType} error for ${sourceId} must be recorded; got ${JSON.stringify(errors)}`);
  }
  if (error.recoverable !== true) {
    expectedFail(`recoverable ${sourceType} error for ${sourceId} must be normalized with recoverable: true; got ${JSON.stringify(error)}`);
  }
}

async function verifyCommandRegistration() {
  const commandSourcePath = join(root, 'extensions', 'ralph-specum', 'index.ts');
  const source = readFileSync(commandSourcePath, 'utf8');
  const helper = await loadIndexingHelper();
  const failures = [];

  if (!/\.registerCommand\(\s*["']ralph-index["']\s*,/m.test(source)) {
    failures.push('pi.registerCommand("ralph-index", ...) is absent');
  }

  if (!/import \{[^}]*formatRalphIndexCommandResult[^}]*runRalphIndex[^}]*\} from ["']\.\/indexing\.ts["'];/m.test(source)) {
    failures.push('command handler must import formatter and runner from indexing.ts');
  }

  if (/function\s+formatRalphIndexCommandResult\s*\(/m.test(source)) {
    failures.push('command result formatting must live in indexing.ts, not index.ts');
  }

  if (typeof helper?.formatRalphIndexCommandResult !== 'function') {
    failures.push('formatRalphIndexCommandResult is not exported from indexing.ts');
  } else {
    const formatted = helper.formatRalphIndexCommandResult({
      ok: true,
      dryRun: true,
      indexRoot: '/tmp/specs/.index',
      statePath: '/tmp/specs/.index/index-state.json',
      summaryPath: '/tmp/specs/.index/index.md',
      writes: [{ path: '/tmp/specs/.index/index.md', action: 'create', kind: 'summary' }],
      state: { components: [], external: [], errors: [] },
      message: 'Dry-run planned index writes',
    });
    if (!formatted.includes('Ralph index complete.') || !formatted.includes('Mode: dry-run') || !formatted.includes('Writes: 1')) {
      failures.push(`indexing.ts formatter must produce command notification summary; got ${JSON.stringify(formatted)}`);
    }
  }

  const requiredDocumentationTokens = [
    '/ralph-index',
    '--path',
    '--type',
    '--exclude',
    '--dry-run',
    '--force',
    '--changed',
    '--quick',
  ];
  const missingDocumentationTokens = requiredDocumentationTokens.filter((token) => !source.includes(token));
  if (missingDocumentationTokens.length > 0) {
    failures.push(`help/status documentation is missing ${missingDocumentationTokens.join(', ')}`);
  }

  if (failures.length > 0) {
    expectedFail(`command registration source inspection failed for ${commandSourcePath}: ${failures.join('; ')}`);
  }
}

async function verifyPackageWiring() {
  const packageJsonPath = join(root, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const scripts = packageJson?.scripts ?? {};
  const failures = [];

  const verifyIndexScript = String(scripts['verify:index'] ?? '');
  if (!verifyIndexScript.includes('scripts/verify-index-parity.mjs')) {
    failures.push('package.json script "verify:index" must run scripts/verify-index-parity.mjs');
  }

  const prepackScript = String(scripts.prepack ?? '');
  if (!prepackScript.includes('scripts/verify-index-parity.mjs') && !prepackScript.includes('npm run verify:index')) {
    failures.push('package.json script "prepack" must include the index verifier or npm run verify:index');
  }

  if (failures.length > 0) {
    expectedFail(`package wiring inspection failed for ${packageJsonPath}: ${failures.join('; ')}`);
  }
}

async function verifyParserOptions() {
  const parseIndexArgs = await loadParseIndexArgs();

  const result = parseIndexArgs([
    '--path',
    'src/features',
    '--type',
    'services,controllers',
    '--exclude',
    'node_modules',
    '--exclude',
    'dist/**',
    '--dry-run',
    '--force',
    '--quick',
  ]);

  if (result?.ok !== true) {
    expectedFail(`parity flags must parse successfully; got ${stringifyParseResult(result)}`);
  }

  assertStableDefaultShape(result, 'parity option parse result');

  const options = result.options;
  assertEqual(options.scanPath, 'src/features', '--path value');
  assertArrayEqual(options.categories, ['services', 'controllers'], 'comma-list --type values');
  assertArrayEqual(options.excludes, ['node_modules', 'dist/**'], 'repeated --exclude values');
  assertEqual(options.dryRun, true, '--dry-run flag');
  assertEqual(options.force, true, '--force flag');
  assertEqual(options.changed, false, '--changed default when omitted');
  assertEqual(options.quick, true, '--quick flag');

  const changedResult = parseIndexArgs(['--changed']);
  if (changedResult?.ok !== true || changedResult.options.changed !== true) {
    expectedFail(`--changed must parse successfully when used without --force; got ${stringifyParseResult(changedResult)}`);
  }

  const conflictResult = parseIndexArgs(['--force', '--changed']);
  const conflictError = String(conflictResult?.error?.message ?? conflictResult?.error ?? conflictResult?.message ?? '');
  if (conflictResult?.ok !== false || !conflictError.includes('--force') || !conflictError.includes('--changed')) {
    expectedFail(
      `--force --changed must fail before scanning with both flag names in the error; got ${stringifyParseResult(
        conflictResult,
      )}`,
    );
  }

  assertMissingValueMessage(parseIndexArgs(['--path']), '--path');
  assertMissingValueMessage(parseIndexArgs(['--type=']), '--type');
  assertMissingValueMessage(parseIndexArgs(['--exclude', '--quick']), '--exclude');
}

function runFixtureGitCommand(cwd, args) {
  assertNonDestructiveFixtureGitArgs(args);
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function fixtureGitChangedPaths(cwd) {
  return runFixtureGitCommand(cwd, ['diff', '--name-only'])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function assertNonDestructiveFixtureGitArgs(args) {
  const command = args[0];
  if (['checkout', 'reset', 'clean', 'restore'].includes(command)) {
    expectedFail(`changed-git verifier must not run destructive Git command: git ${args.join(' ')}`);
  }
}

function findComponentWrite(writes, sourcePath) {
  if (!Array.isArray(writes)) {
    expectedFail(`index run must include planned writes; got ${JSON.stringify(writes)}`);
  }

  const write = writes.find((candidate) => candidate?.kind === 'component' && candidate?.sourcePath === sourcePath);
  if (!write) {
    expectedFail(`index run must include component write for ${sourcePath}; got ${JSON.stringify(writes)}`);
  }

  return write;
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) {
    expectedFail(`component spec must start with YAML frontmatter; got ${markdown.slice(0, 80)}`);
  }

  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) {
    expectedFail(`component spec must close YAML frontmatter; got ${markdown.slice(0, 120)}`);
  }

  const frontmatter = {};
  for (const line of markdown.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    frontmatter[key] = value;
  }
  return frontmatter;
}

function assertRequiredFrontmatter(frontmatter, requiredKeys, pathLabel) {
  for (const key of requiredKeys) {
    if (!(key in frontmatter) || frontmatter[key] === '') {
      expectedFail(`${pathLabel} frontmatter must include required key ${key}; got ${JSON.stringify(frontmatter)}`);
    }
  }
}

function assertStableWriteKinds(kinds) {
  assertEqual(kinds?.component, 'component', 'stable component write kind');
  assertEqual(kinds?.external, 'external', 'stable external write kind');
  assertEqual(kinds?.summary, 'summary', 'stable summary write kind');
  assertEqual(kinds?.state, 'state', 'stable state write kind');
}

function assertPlannedWrite(writes, expectedKind, expectedPathFragment) {
  const write = writes.find((candidate) => {
    const candidatePath = String(candidate?.path ?? '');
    return candidate?.kind === expectedKind && candidatePath.includes(expectedPathFragment);
  });

  if (!write) {
    expectedFail(`dry-run plan must include a ${expectedKind} write containing ${expectedPathFragment}; got ${JSON.stringify(writes)}`);
  }

  if (!['create', 'update', 'skip'].includes(write.action)) {
    expectedFail(`dry-run ${expectedKind} write must include an action; got ${JSON.stringify(write)}`);
  }
}

function assertMissingValueMessage(result, optionName) {
  const errorText = String(result?.error?.message ?? result?.error ?? result?.message ?? '');
  if (result?.ok !== false || !errorText.includes('Missing value') || !errorText.includes(optionName)) {
    expectedFail(`${optionName} missing value error must be readable and name the option; got ${stringifyParseResult(result)}`);
  }
}

function assertStableDefaultShape(result, label) {
  const options = result?.options;
  const externalInputs = options?.externalInputs;
  const stable =
    options &&
    typeof options.scanPath === 'string' &&
    typeof options.specRoot === 'string' &&
    Array.isArray(options.categories) &&
    Array.isArray(options.excludes) &&
    typeof options.dryRun === 'boolean' &&
    typeof options.force === 'boolean' &&
    typeof options.changed === 'boolean' &&
    typeof options.quick === 'boolean' &&
    externalInputs &&
    Array.isArray(externalInputs.urls) &&
    Array.isArray(externalInputs.mcpResources) &&
    typeof externalInputs.includePackageResources === 'boolean';

  if (!stable) {
    expectedFail(`${label} must include stable parser option defaults; got ${JSON.stringify(result)}`);
  }
}

async function loadParseIndexArgs() {
  const helper = await loadIndexingHelper();
  const parseIndexArgs = helper?.parseIndexArgs;

  if (typeof parseIndexArgs !== 'function') {
    expectedFail('parseIndexArgs is not exported from extensions/ralph-specum/indexing.ts yet.');
  }

  return parseIndexArgs;
}

async function loadIndexingHelper() {
  const helperUrl = new URL('../extensions/ralph-specum/indexing.ts', import.meta.url);
  try {
    return await import(helperUrl.href);
  } catch (error) {
    if (isExpectedMissingHelperError(error)) return null;
    throw error;
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    expectedFail(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    expectedFail(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(action, label) {
  try {
    action();
  } catch (_error) {
    return;
  }
  expectedFail(`${label} expected to throw`);
}

function stringifyParseResult(result) {
  return JSON.stringify(result, (_key, value) => {
    if (value instanceof Error) return { message: value.message };
    return value;
  });
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function isExpectedMissingHelperError(error) {
  const message = String(error?.message ?? '');
  return (
    error?.code === 'ERR_MODULE_NOT_FOUND' ||
    error?.code === 'ERR_UNKNOWN_FILE_EXTENSION' ||
    message.includes('Cannot find module') ||
    message.includes('Unknown file extension') ||
    message.includes('/extensions/ralph-specum/indexing.ts')
  );
}

function expectedFail(message) {
  console.error(`EXPECTED_FAIL ${requestedCase}: ${message}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
