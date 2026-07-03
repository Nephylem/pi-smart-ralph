import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';

export type TaskTopology = 'single_repo' | 'multi_repo' | 'repo_plus_nonrepo' | 'no_repo';

export interface TaskWorkspaceEntry {
  kind: 'task_file' | 'tasks_md' | 'progress_md';
  path: string;
  repoRoot: string | null;
}

export interface TaskWorkspaceInput {
  basePath?: string;
  taskFiles?: string[];
  tasksPath?: string;
  progressPath?: string;
  entries?: TaskWorkspaceEntry[];
}

export interface TaskWorkspaceReport {
  topology: TaskTopology;
  entries: TaskWorkspaceEntry[];
}

export function analyzeTaskWorkspace(input: TaskWorkspaceInput = {}): TaskWorkspaceReport {
  const entries = buildWorkspaceEntries(input);
  const topology = classifyTaskWorkspace(entries);

  return {
    topology,
    entries,
  };
}

export function classifyTaskWorkspace(entries: TaskWorkspaceEntry[] = []): TaskTopology {
  const repoRoots = new Set(entries.map((entry) => entry.repoRoot).filter((repoRoot): repoRoot is string => Boolean(repoRoot)));
  const hasRepoEntries = repoRoots.size > 0;
  const hasNonRepoEntries = entries.some((entry) => entry.repoRoot === null);

  if (hasRepoEntries && hasNonRepoEntries) {
    return 'repo_plus_nonrepo';
  }

  if (repoRoots.size > 1) {
    return 'multi_repo';
  }

  if (repoRoots.size === 1) {
    return 'single_repo';
  }

  return 'no_repo';
}

function buildWorkspaceEntries(input) {
  if (Array.isArray(input.entries) && input.entries.length > 0) {
    return input.entries.map((entry) => ({
      kind: entry.kind,
      path: resolve(entry.path),
      repoRoot: entry.repoRoot,
    }));
  }

  const probeEntries = [];

  for (const taskFile of input.taskFiles ?? []) {
    probeEntries.push({ kind: 'task_file', path: resolve(taskFile) });
  }

  if (input.tasksPath) {
    probeEntries.push({ kind: 'tasks_md', path: resolve(input.tasksPath) });
  }

  if (input.progressPath) {
    probeEntries.push({ kind: 'progress_md', path: resolve(input.progressPath) });
  }

  return probeEntries.map((entry) => ({
    ...entry,
    repoRoot: probeRepoRoot(entry.path),
  }));
}

function probeRepoRoot(targetPath) {
  const probePath = getProbePath(targetPath);
  const result = spawnSync('git', ['-C', probePath, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }

  const repoRoot = result.stdout.trim();
  return repoRoot ? resolve(repoRoot) : null;
}

function getProbePath(targetPath) {
  try {
    return statSync(targetPath).isDirectory() ? targetPath : dirname(targetPath);
  } catch {
    return dirname(targetPath);
  }
}
