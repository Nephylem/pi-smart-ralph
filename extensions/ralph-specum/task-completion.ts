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

export type TaskCommitMode = 'required' | 'none' | 'topology_relaxed';

export interface TaskWorkspaceReport {
  topology: TaskTopology;
  entries: TaskWorkspaceEntry[];
  commitMode: TaskCommitMode;
  commitReason?: TaskTopology;
  promptGuidance?: string[];
}

export interface TaskCompletionAssessment {
  ok: boolean;
  blocker?: string;
}

export interface TaskCompletionEvidenceFields {
  commit?: string;
  commitReason?: string;
  keyedEvidence: string[];
}

export interface TaskCompletionBlockerSelection {
  topologyBlocker?: string | null;
  modificationBlocker?: string | null;
  verificationBlocker?: string | null;
  fallbackBlocker: string;
}

export function analyzeTaskWorkspace(input: TaskWorkspaceInput = {}): TaskWorkspaceReport {
  const entries = buildWorkspaceEntries(input);
  const topology = classifyTaskWorkspace(entries);
  const { commitMode, commitReason } = deriveCommitGuidance(topology, input.commitDirective);

  return createTaskWorkspaceReport({
    topology,
    entries,
    commitMode,
    commitReason,
  });
}

export function formatTaskWorkspaceReport(report: TaskWorkspaceReport): string {
  const lines = [
    `topology=${report.topology}`,
    `commitMode=${report.commitMode}`,
    `commitReason=${report.commitReason ?? 'none'}`,
  ];

  for (const entry of report.entries) {
    lines.push(`entry:${entry.kind}:${resolve(entry.path)}:${entry.repoRoot ?? 'none'}`);
  }

  return lines.join('\n');
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

function selectTaskCompletionBlocker(selection) {
  return selection.topologyBlocker
    ?? selection.modificationBlocker
    ?? selection.verificationBlocker
    ?? selection.fallbackBlocker;
}

function parseTaskCompletionFields(output) {
  const completionFields = { keyedEvidence: [] };

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const commitMatch = trimmed.match(/^commit:\s*(.+)$/i);
    if (commitMatch) {
      completionFields.commit = String(commitMatch[1] ?? "").replace(/`/g, "").trim().toLowerCase();
      continue;
    }

    const commitReasonMatch = trimmed.match(/^commit_reason:\s*(.+)$/i);
    if (commitReasonMatch) {
      completionFields.commitReason = String(commitReasonMatch[1] ?? "").replace(/`/g, "").trim().toLowerCase();
      continue;
    }

    const keyedEvidenceMatch = trimmed.match(/^(?:verify|verification|evidence):\s*(.+)$/i);
    if (keyedEvidenceMatch) {
      completionFields.keyedEvidence.push(String(keyedEvidenceMatch[1] ?? "").replace(/`/g, "").trim());
    }
  }

  return completionFields;
}

function hasExpectedFailureProof(output, proofToken = 'RED_PASS') {
  const normalizedToken = String(proofToken ?? '').replace(/`/g, '').trim().toLowerCase();
  if (!normalizedToken) return false;

  const completionFields = parseTaskCompletionFields(output);
  return completionFields.keyedEvidence.some((value) => value.toLowerCase() === normalizedToken);
}

function assessTaskCompletionOutput(
  output,
  workspaceReport,
) {
  if (!workspaceReport || workspaceReport.commitMode !== 'topology_relaxed') {
    return { ok: true };
  }

  const completionFields = parseTaskCompletionFields(output);
  if (completionFields.commit && completionFields.commit !== 'none') {
    return { ok: true };
  }

  if (completionFields.commit === 'none' && completionFields.commitReason === workspaceReport.commitReason) {
    return { ok: true };
  }

  const expectedCommitReason = workspaceReport.commitReason ?? workspaceReport.topology;
  if (completionFields.commit === 'none' && completionFields.commitReason && completionFields.commitReason !== expectedCommitReason) {
    return {
      ok: false,
      blocker: `Workspace commit topology ${workspaceReport.topology} is topology_relaxed, so TASK_COMPLETE must report commit: none with commit_reason: ${expectedCommitReason}; received commit_reason: ${completionFields.commitReason}.`,
    };
  }
  if (completionFields.commit === 'none') {
    return {
      ok: false,
      blocker: `Workspace commit topology ${workspaceReport.topology} is topology_relaxed, so TASK_COMPLETE must report commit: none with commit_reason: ${expectedCommitReason} (split_repo_workspace evidence).`,
    };
  }

  return {
    ok: false,
    blocker: `Workspace commit topology ${workspaceReport.topology} is topology_relaxed, so a non-single_repo completion cannot rely on one combined commit across required files; report commit: none with commit_reason: ${expectedCommitReason} (split_repo_workspace evidence).`,
  };
}

Object.assign(analyzeTaskWorkspace, { assessTaskCompletionOutput, selectTaskCompletionBlocker, hasExpectedFailureProof });

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

function createTaskWorkspaceReport({ topology, entries, commitMode, commitReason }) {
  return {
    topology,
    entries: entries.map((entry) => ({
      kind: entry.kind,
      path: resolve(entry.path),
      repoRoot: entry.repoRoot ? resolve(entry.repoRoot) : null,
    })),
    commitMode,
    commitReason,
    promptGuidance: [
      '- Preflight workspace topology before commit handling and follow the computed report below.',
      topology === 'single_repo'
        ? '- single_repo keeps existing commit-required behavior unless the task explicitly says `Commit: None`.'
        : '- Non-single_repo workspaces may complete with `commit: none` when one combined commit cannot span required files.',
    ],
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
