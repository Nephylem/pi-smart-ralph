export type TaskTopology = 'single_repo' | 'multi_repo' | 'repo_plus_nonrepo' | 'no_repo';

export interface TaskWorkspaceEntry {
  kind: 'task_file' | 'tasks_md' | 'progress_md';
  path: string;
  repoRoot: string | null;
}

export interface TaskWorkspaceInput {
  entries?: TaskWorkspaceEntry[];
}

export interface TaskWorkspaceReport {
  topology: TaskTopology;
  entries: TaskWorkspaceEntry[];
}

export function analyzeTaskWorkspace(input: TaskWorkspaceInput = {}): TaskWorkspaceReport {
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const repoRoots = new Set(entries.map((entry) => entry.repoRoot).filter((repoRoot): repoRoot is string => Boolean(repoRoot)));
  const hasRepoEntries = repoRoots.size > 0;
  const hasNonRepoEntries = entries.some((entry) => entry.repoRoot === null);

  let topology: TaskTopology = 'no_repo';
  if (hasRepoEntries && hasNonRepoEntries) {
    topology = 'repo_plus_nonrepo';
  } else if (repoRoots.size > 1) {
    topology = 'multi_repo';
  } else if (repoRoots.size === 1) {
    topology = 'single_repo';
  }

  return {
    topology,
    entries,
  };
}

export const classifyTaskWorkspace = analyzeTaskWorkspace;
