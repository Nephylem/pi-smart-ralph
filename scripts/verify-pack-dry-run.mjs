#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const REQUIRED_FILES = [
  'references/ralph-resource-manifest.v1.json',
  'schemas/spec.schema.json',
];

const REQUIRED_RESOURCE_ROOTS = [
  'templates/',
  'references/',
  'skills/',
  'prompts/',
];

const EXCLUDED_PATH_CHECKS = [
  { label: 'spec state directory', pathLabel: 'specs/', matches: (path) => path === 'specs' || path.startsWith('specs/') },
  { label: 'Smart Ralph state file', pathLabel: '.ralph-state.json', matches: (path) => path === '.ralph-state.json' || path.endsWith('/.ralph-state.json') },
  { label: 'Smart Ralph progress file', pathLabel: '.progress.md', matches: (path) => path === '.progress.md' || path.endsWith('/.progress.md') },
  { label: 'generated runtime state', pathLabel: '.pi/', matches: (path) => path === '.pi' || path.startsWith('.pi/') },
];

function normalizePackPath(path) {
  return String(path ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^package\//, '');
}

function parsePackJson(stdout, stderr) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    console.error('Failed to parse `npm pack --dry-run --json` output as JSON.');
    console.error(`Parse error: ${error.message}`);
    if (stdout.trim()) {
      console.error('npm stdout:');
      console.error(stdout.trim());
    }
    if (stderr.trim()) {
      console.error('npm stderr:');
      console.error(stderr.trim());
    }
    process.exit(1);
  }
}

function collectPackFiles(packJson) {
  const packages = Array.isArray(packJson) ? packJson : [packJson];
  return new Set(packages.flatMap((packageEntry) => {
    if (!packageEntry || !Array.isArray(packageEntry.files)) {
      return [];
    }
    return packageEntry.files.map((file) => normalizePackPath(file.path)).filter(Boolean);
  }));
}

const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

if (result.error || result.status !== 0) {
  console.error('`npm pack --dry-run --json` failed.');
  if (result.error) {
    console.error(result.error.message);
  }
  if (result.stdout?.trim()) {
    console.error('npm stdout:');
    console.error(result.stdout.trim());
  }
  if (result.stderr?.trim()) {
    console.error('npm stderr:');
    console.error(result.stderr.trim());
  }
  process.exit(result.status ?? 1);
}

function addIncludedFileFailure(failures, pathLabel) {
  failures.push({
    boundary: 'included',
    label: 'required package file',
    path: pathLabel,
    message: 'not present in npm pack dry-run file list',
  });
}

function addIncludedRootFailure(failures, pathLabel) {
  failures.push({
    boundary: 'included',
    label: 'required package resource root',
    path: pathLabel,
    message: 'contains no non-.gitkeep files in npm pack dry-run file list',
  });
}

function addExcludedPathFailure(failures, excludedCheck, packedPath) {
  failures.push({
    boundary: 'excluded',
    label: excludedCheck.label,
    path: packedPath,
    expectedPath: excludedCheck.pathLabel,
    message: 'was present in npm pack dry-run file list',
  });
}

function formatFailure(failure) {
  const expectedPath = failure.expectedPath ? ` (blocked pattern: ${failure.expectedPath})` : '';
  return `[${failure.boundary}] ${failure.label}: ${failure.path}${expectedPath} — ${failure.message}`;
}

function reportFailures(failures) {
  if (failures.length === 0) {
    return;
  }

  console.error('Smart Ralph pack dry-run verification failed:');
  for (const failure of failures) {
    console.error(`- ${formatFailure(failure)}`);
  }
  process.exit(1);
}

const packJson = parsePackJson(result.stdout, result.stderr ?? '');
const packFiles = collectPackFiles(packJson);
const failures = [];

for (const requiredFile of REQUIRED_FILES) {
  if (!packFiles.has(requiredFile)) {
    addIncludedFileFailure(failures, requiredFile);
  }
}

for (const requiredRoot of REQUIRED_RESOURCE_ROOTS) {
  const includedFiles = [...packFiles].filter((path) => path.startsWith(requiredRoot) && !path.endsWith('/.gitkeep'));
  if (includedFiles.length === 0) {
    addIncludedRootFailure(failures, requiredRoot);
  }
}

for (const packedPath of packFiles) {
  for (const excludedCheck of EXCLUDED_PATH_CHECKS) {
    if (excludedCheck.matches(packedPath)) {
      addExcludedPathFailure(failures, excludedCheck, packedPath);
    }
  }
}

reportFailures(failures);
