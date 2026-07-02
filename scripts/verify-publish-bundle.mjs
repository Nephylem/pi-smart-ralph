#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const failures = [];

const RESOURCE_MANIFEST_PATH = 'references/ralph-resource-manifest.v1.json';
const RESOURCE_MANIFEST_FULL_PATH = join(root, RESOURCE_MANIFEST_PATH);

function parseJsonFile(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`${label} must parse as JSON: ${error.message}`);
    return undefined;
  }
}

function validateResourceManifest() {
  if (!existsSync(RESOURCE_MANIFEST_FULL_PATH)) return;

  const resourceManifest = parseJsonFile(RESOURCE_MANIFEST_FULL_PATH, RESOURCE_MANIFEST_PATH);
  if (resourceManifest !== undefined && !Array.isArray(resourceManifest)) {
    failures.push(`${RESOURCE_MANIFEST_PATH} must contain a top-level JSON array`);
  }
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
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`missing package resource: ${file}`);
}

validateResourceManifest();

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
  'node_modules/pi-mcp-adapter/index.ts',
  'node_modules/pi-web-access/index.ts',
];

for (const file of requiredBundledEntrypoints) {
  if (!existsSync(join(root, file))) {
    failures.push(`missing bundled dependency entrypoint: ${file} (run npm install before npm pack/publish)`);
  }
}

const bundled = new Set([...(pkg.bundledDependencies ?? []), ...(pkg.bundleDependencies ?? [])]);
for (const name of ['@tintinweb/pi-subagents', '@tintinweb/pi-tasks', 'pi-mcp-adapter', 'pi-web-access']) {
  if (!pkg.dependencies?.[name]) failures.push(`missing dependency declaration: ${name}`);
  if (!bundled.has(name)) failures.push(`missing bundledDependencies entry: ${name}`);
}

if (failures.length > 0) {
  console.error('Smart Ralph package verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
