import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  getRalphStatePath,
  mergeRalphState,
  readProgress,
  readRalphState,
  appendProgress,
  RalphStateError,
} from '../extensions/ralph-specum/state.ts';
import {
  getSpecRoots,
  readCurrentSpecValue,
  resolveSpecReference,
  writeCurrentSpec,
} from '../extensions/ralph-specum/paths.ts';
import {
  formatRalphStateValidationIssues,
  readSpecSchema,
  validateRalphStateShape,
} from '../extensions/ralph-specum/state-validation.ts';
import {
  classifyImplementationVerificationFailure,
  createImplementationVerificationRecoveryPolicy,
  normalizeImplementationTaskModificationProposals,
  parseImplementationTaskModification,
  validateImplementationTaskCompletion,
  validateImplementationTaskMutation,
} from '../extensions/ralph-specum/implementation-loop.ts';
import {
  analyzeTaskWorkspace,
  classifyTaskWorkspace,
  createTaskCompletionAssessment,
} from '../extensions/ralph-specum/task-completion.ts';
import {
  buildRefactorRequest,
  buildRefactorSelectedFilePlan,
  buildRefactorSelectedSectionPlan,
  parseRefactorArgs,
  parseRefactorCompletion,
  resolveRefactorCascadeSteps,
  resolveRefactorSpecPlan,
} from '../extensions/ralph-specum/refactor.ts';
import { validatePhaseArtifactContent } from '../extensions/ralph-specum/phase-runner.ts';

function tempProject() {
  const cwd = mkdtempSync(join(tmpdir(), 'ralph-tests-'));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createSpec(cwd, name = 'demo-spec') {
  const specPath = join(cwd, 'specs', name);
  mkdirSync(specPath, { recursive: true });
  return specPath;
}

test('state helpers atomically merge nested state and append progress', () => {
  const project = tempProject();
  try {
    const specPath = createSpec(project.cwd);
    const spec = resolveSpecReference('demo-spec', { cwd: project.cwd });

    assert.equal(getRalphStatePath(spec, { cwd: project.cwd }), join(specPath, '.ralph-state.json'));
    assert.equal(readRalphState(spec, { cwd: project.cwd }), null);

    const merged = mergeRalphState(spec, {
      phase: 'execution',
      nested: { a: 1 },
    }, { cwd: project.cwd });
    assert.equal(merged.phase, 'execution');

    const mergedAgain = mergeRalphState(spec, {
      nested: { b: 2 },
      ignored: undefined,
    }, { cwd: project.cwd });
    assert.deepEqual(mergedAgain.nested, { a: 1, b: 2 });
    assert.equal(Object.hasOwn(mergedAgain, 'ignored'), false);

    appendProgress(spec, 'first line', { cwd: project.cwd });
    appendProgress(spec, 'second line', { cwd: project.cwd });
    assert.match(readProgress(spec, { cwd: project.cwd }), /first line\nsecond line\n$/);
  } finally {
    project.cleanup();
  }
});

test('state helpers reject malformed JSON with file-aware errors', () => {
  const project = tempProject();
  try {
    const specPath = createSpec(project.cwd);
    writeFileSync(join(specPath, '.ralph-state.json'), '{ nope', 'utf8');
    const spec = resolveSpecReference('demo-spec', { cwd: project.cwd });

    assert.throws(
      () => readRalphState(spec, { cwd: project.cwd }),
      (error) => error instanceof RalphStateError && error.filePath.endsWith('.ralph-state.json'),
    );
  } finally {
    project.cleanup();
  }
});

test('state validation reports actionable schema-shape issues', () => {
  const schema = readSpecSchema();
  assert.equal(typeof schema, 'object');

  const valid = validateRalphStateShape({ source: 'spec', name: 'demo', basePath: './specs/demo', phase: 'execution', taskIndex: 0 }, { requireCoreFields: true });
  assert.equal(valid.ok, true);

  const invalid = validateRalphStateShape({ phase: 'completed', taskIndex: -1, nativeTaskMap: [] }, { requireCoreFields: true });
  assert.equal(invalid.ok, false);
  const message = formatRalphStateValidationIssues(invalid.issues);
  assert.match(message, /Invalid Ralph state/);
  assert.match(message, /Repair:/);
  assert.match(message, /\$\.phase/);
});

test('readRalphState rejects invalid state shapes with repair guidance', () => {
  const project = tempProject();
  try {
    const specPath = createSpec(project.cwd);
    writeFileSync(join(specPath, '.ralph-state.json'), JSON.stringify({ phase: 'completed' }), 'utf8');
    const spec = resolveSpecReference('demo-spec', { cwd: project.cwd });

    assert.throws(
      () => readRalphState(spec, { cwd: project.cwd }),
      /Invalid Ralph state:[\s\S]*Repair:/,
    );
  } finally {
    project.cleanup();
  }
});

test('path helpers resolve default roots, current specs, and missing spec references', () => {
  const project = tempProject();
  try {
    createSpec(project.cwd, 'alpha');
    mkdirSync(join(project.cwd, 'specs'), { recursive: true });

    const roots = getSpecRoots({ cwd: project.cwd });
    assert.equal(roots.length, 1);
    assert.equal(roots[0].path, './specs');

    const alpha = resolveSpecReference('alpha', { cwd: project.cwd });
    assert.equal(alpha.exists, true);
    assert.equal(alpha.name, 'alpha');

    const pointer = writeCurrentSpec(alpha, { cwd: project.cwd });
    assert.equal(pointer.value, 'alpha');
    assert.equal(readCurrentSpecValue({ cwd: project.cwd }), 'alpha');

    const missing = resolveSpecReference('future-work', { cwd: project.cwd });
    assert.equal(missing.exists, false);
    assert.equal(missing.path, './specs/future-work');
  } finally {
    project.cleanup();
  }
});

test('phase artifact validation catches missing required sections and manual task verification', () => {
  const researchErrors = validatePhaseArtifactContent('research', 'Research', '# Research\n\n## Sources\n- local');
  assert.deepEqual(researchErrors, [
    'research.md missing required section: External Research.',
    'research.md missing required section: Codebase Analysis.',
  ]);

  const taskErrors = validatePhaseArtifactContent('tasks', 'Tasks', '# Tasks\n\n- [ ] 1.1 Do it\n  - **Do**: work\n  - **Files**: a.ts\n  - **Done when**: done\n  - **Verify**: manually inspect\n  - **Commit**: `test: work`');
  assert.equal(taskErrors.some((error) => /must be automated/.test(error)), true);
});

test('implementation verification helpers classify failures and build recovery policy', () => {
  const transient = 'VERIFICATION_FAIL\nError: ETIMEDOUT while running npm test';
  assert.equal(classifyImplementationVerificationFailure(transient), 'transient_tool_failure');

  const policy = createImplementationVerificationRecoveryPolicy('VERIFICATION_FAIL\ncleanup artifact left behind: .progress-task-a.md', 0);
  assert.equal(policy.recoverable, true);
  assert.equal(policy.recoveryAction, 'cleanup_artifacts');

  const fatal = createImplementationVerificationRecoveryPolicy('VERIFICATION_FAIL\nreal product failure: assertion failed', 2);
  assert.equal(fatal.recoverable, false);
  assert.equal(fatal.recoveryAction, 'delegate_fix_task');
});

test('implementation task completion requires expected RED proof when requested', () => {
  const missingProof = validateImplementationTaskCompletion({
    output: 'TASK_COMPLETE\nstatus: pass\ncommit: abc1234\nverify: test failed as expected',
    signal: 'TASK_COMPLETE',
    requiresExpectedFailureProof: true,
  });
  assert.equal(missingProof.ok, false);
  assert.match(missingProof.error, /expected-failure proof/i);

  const withProof = validateImplementationTaskCompletion({
    output: 'TASK_COMPLETE\nstatus: pass\ncommit: abc1234\nverify: RED_PASS failing test observed',
    signal: 'TASK_COMPLETE',
    requiresExpectedFailureProof: true,
    hasExpectedFailureProof: (output, token) => output.includes(token ?? 'RED_PASS'),
  });
  assert.equal(withProof.ok, true);
});

test('task modification helpers normalize structured proposals and reject duplicate ids', () => {
  const output = `TASK_MODIFICATION_REQUEST\n\n~~~json\n${JSON.stringify({
    type: 'ADD_FOLLOWUP',
    originalTaskId: '1.2',
    reasoning: 'Need a follow-up gate.',
    proposedTasks: [{
      id: '1.2.1',
      title: 'Verify follow-up',
      do: ['Run the gate'],
      files: ['package.json'],
      doneWhen: 'Gate passes',
      verify: 'npm test',
      commit: 'test: add gate',
    }],
  })}\n~~~`;

  const request = parseImplementationTaskModification(output);
  assert.equal(request.type, 'ADD_FOLLOWUP');
  assert.equal(request.proposedTasks.length, 1);
  assert.match(request.proposedTasks[0], /\*\*Verify\*\*: npm test/);

  const proposed = normalizeImplementationTaskModificationProposals(request);
  const parsedTask = {
    taskNumber: '1.2.1',
    status: 'pending',
    fields: {
      do: 'Run the gate',
      files: 'package.json',
      'done when': 'Gate passes',
      verify: 'npm test',
      commit: 'test: add gate',
    },
  };

  assert.throws(() => validateImplementationTaskMutation({
    request,
    currentTaskId: '1.2',
    priorCount: 0,
    maxModificationsPerTask: 3,
    maxModificationDepth: 2,
    proposedTasks: [parsedTask],
    requiredFields: [
      { key: 'do', label: 'Do' },
      { key: 'files', label: 'Files' },
      { key: 'done when', label: 'Done when' },
      { key: 'verify', label: 'Verify' },
      { key: 'commit', label: 'Commit' },
    ],
    existingTaskIds: new Set(['1.2.1']),
  }), /already exists/);

  assert.equal(proposed.length, 1);
});

test('task workspace and completion helpers enforce topology-aware no-commit evidence', () => {
  assert.equal(classifyTaskWorkspace([
    { kind: 'task_file', path: '/repo-a/a.js', repoRoot: '/repo-a' },
    { kind: 'tasks_md', path: '/repo-b/tasks.md', repoRoot: '/repo-b' },
  ]), 'multi_repo');

  const report = analyzeTaskWorkspace({
    entries: [
      { kind: 'task_file', path: '/repo-a/a.js', repoRoot: '/repo-a' },
      { kind: 'progress_md', path: '/tmp/progress.md', repoRoot: null },
    ],
    commitDirective: 'feat(scope): change',
  });
  assert.equal(report.topology, 'repo_plus_nonrepo');
  assert.equal(report.commitMode, 'topology_relaxed');

  const bad = createTaskCompletionAssessment('TASK_COMPLETE\ncommit: none\nverify: ok', report);
  assert.equal(bad.ok, false);
  assert.match(bad.blocker, /commit_reason: repo_plus_nonrepo/);

  const good = createTaskCompletionAssessment('TASK_COMPLETE\ncommit: none\ncommit_reason: repo_plus_nonrepo\nverify: ok', report);
  assert.equal(good.ok, true);
});

test('refactor helpers parse args, build bounded requests, and parse completion markers', () => {
  const project = tempProject();
  try {
    const specPath = createSpec(project.cwd, 'refactor-me');
    writeFileSync(join(specPath, 'requirements.md'), '# Requirements\n\n## User Stories\nBody\n', 'utf8');
    writeFileSync(join(specPath, 'design.md'), '# Design\n\n## Overview\nBody\n', 'utf8');
    writeFileSync(join(specPath, '.progress.md'), '## Learnings\n- Keep requirements concise.\n', 'utf8');

    const parsed = parseRefactorArgs(['refactor-me', '--file=requirements']);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.options.reference, 'refactor-me');
    assert.equal(parsed.options.file, 'requirements');

    const plan = resolveRefactorSpecPlan({ cwd: project.cwd, reference: 'refactor-me' });
    const selectedFile = buildRefactorSelectedFilePlan(plan, 'requirements');
    const selectedSection = buildRefactorSelectedSectionPlan(selectedFile, 'User Stories');
    const request = buildRefactorRequest(plan, selectedFile, selectedSection, { cwd: project.cwd });

    assert.deepEqual(request.files.map((file) => file.kind), ['requirements']);
    assert.deepEqual(request.sections, ['User Stories']);
    assert.deepEqual(request.allowedFiles, [join(specPath, 'requirements.md')]);
    assert.match(request.progressLearnings.join('\n'), /Keep requirements concise/);

    const cascade = resolveRefactorCascadeSteps('requirements', 'design,tasks', ['requirements', 'design'], 'Need downstream update.');
    assert.deepEqual(cascade.pending.map((step) => step.targetFile), ['design']);
    assert.deepEqual(cascade.skipped.map((step) => step.targetFile), []);

    const completion = parseRefactorCompletion('Updated requested section.\nREFACTOR_COMPLETE\nEVIDENCE: requirements tightened\nCASCADE_NEEDED: design\nCASCADE_REASON: FR changed');
    assert.equal(completion.ok, true);
    assert.equal(completion.evidence, 'requirements tightened');
    assert.equal(completion.cascadeNeeded, 'design');
  } finally {
    project.cleanup();
  }
});
