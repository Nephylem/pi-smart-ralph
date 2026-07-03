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
  filesDirective?: string | string[];
  tasksPath?: string;
  progressPath?: string;
  commitDirective?: string;
  entries?: TaskWorkspaceEntry[];
}

export interface TaskWorkspaceReport {
  topology: TaskTopology;
  entries: TaskWorkspaceEntry[];
  commitMode: 'required' | 'none' | 'topology_relaxed';
  commitReason?: TaskTopology;
}

export function analyzeTaskWorkspace(input: TaskWorkspaceInput = {}): TaskWorkspaceReport {
  const entries = buildWorkspaceEntries(input);
  const topology = classifyTaskWorkspace(entries);
  const { commitMode, commitReason } = deriveCommitGuidance(topology, input.commitDirective);

  return {
    topology,
    entries,
    commitMode,
    commitReason,
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
  const repoRootByPath = new Map();

  for (const taskFile of normalizeTaskFiles(input.taskFiles, input.filesDirective)) {
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
    repoRoot: probeRepoRoot(entry.path, repoRootByPath),
  }));
}

function normalizeTaskFiles(taskFiles, filesDirective) {
  if (Array.isArray(taskFiles) && taskFiles.length > 0) {
    return taskFiles.map((taskFile) => resolve(String(taskFile).trim())).filter(Boolean);
  }

  if (Array.isArray(filesDirective)) {
    return filesDirective.map((taskFile) => resolve(String(taskFile).trim())).filter(Boolean);
  }

  const normalizedDirective = String(filesDirective ?? '')
    .replace(/`/g, '')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ',');

  if (!normalizedDirective.trim() || /^none$/i.test(normalizedDirective.trim())) {
    return [];
  }

  return normalizedDirective
    .split(',')
    .map((taskFile) => taskFile.trim())
    .filter((taskFile) => taskFile.length > 0 && !/^none$/i.test(taskFile))
    .map((taskFile) => resolve(taskFile));
}

function deriveCommitGuidance(topology, commitDirective) {
  const normalizedDirective = normalizeCommitDirective(commitDirective);

  if (normalizedDirective === 'none') {
    return {
      commitMode: 'none',
      commitReason: undefined,
    };
  }

  if (topology !== 'single_repo') {
    return {
      commitMode: 'topology_relaxed',
      commitReason: topology,
    };
  }

  return {
    commitMode: 'required',
    commitReason: undefined,
  };
}

function normalizeCommitDirective(commitDirective) {
  const normalizedDirective = String(commitDirective ?? '')
    .replace(/`/g, '')
    .trim();

  if (!normalizedDirective || /^none$/i.test(normalizedDirective)) {
    return 'none';
  }

  return normalizedDirective;
}

function probeRepoRoot(targetPath, repoRootByPath) {
  const resolvedTargetPath = resolve(targetPath);
  const cachedRepoRoot = repoRootByPath.get(resolvedTargetPath);
  if (cachedRepoRoot !== undefined) {
    return cachedRepoRoot;
  }

  const probePath = getProbePath(resolvedTargetPath);
  const cachedProbeRoot = repoRootByPath.get(probePath);
  if (cachedProbeRoot !== undefined) {
    repoRootByPath.set(resolvedTargetPath, cachedProbeRoot);
    return cachedProbeRoot;
  }

  const result = spawnSync('git', ['-C', probePath, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });

  const repoRoot = result.status === 0 ? resolve(result.stdout.trim()) : null;
  const normalizedRepoRoot = repoRoot || null;

  repoRootByPath.set(probePath, normalizedRepoRoot);
  repoRootByPath.set(resolvedTargetPath, normalizedRepoRoot);
  return normalizedRepoRoot;
}

function getProbePath(targetPath) {
  try {
    return statSync(targetPath).isDirectory() ? targetPath : dirname(targetPath);
  } catch {
    return dirname(targetPath);
  }
}
