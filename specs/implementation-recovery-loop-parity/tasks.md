# Tasks: Implementation Recovery Loop Parity

## Phase 1: Loop state and recovery foundations

- [x] 1.1 [RED] Failing test: execution state boots and resumes with parity fields intact
  - **Do**:
    1. Create `scripts/verify-implementation-loop-parity.mjs` following the discovered verifier-script pattern used by existing parity scripts.
    2. Add a `state-resume` case asserting fresh runs create full `ImplementationLoopStateV1` bootstrap keys: `phase`, `taskIndex`, `totalTasks`, `taskIteration`, `globalIteration`, `recoveryMode`, `maxFixTasksPerOriginal`, `maxFixTaskDepth`, `fixTaskMap`, `modificationMap`, `nativeTaskMap`, and `evidence`.
    3. Assert resumed runs preserve those in-flight fields instead of resetting them.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `state-resume` case exists and fails for the expected missing bootstrap/resume behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-resume 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add state resume verifier`
  - _Requirements: FR-1, FR-2, AC-1.1, AC-1.2_
  - _Design: `/ralph-implement` command shell; Implementation loop core; Parity verifier_

- [x] 1.2 [GREEN] Pass test: extract loop bootstrap and persist canonical execution state
  - **Do**:
    1. Create `extensions/ralph-specum/implementation-loop.ts` with exported state init/merge helpers for execution runs.
    2. Update `extensions/ralph-specum/index.ts` so `/ralph-implement` delegates bootstrap/resume work to the helper module.
    3. Persist canonical `evidence` scaffolding plus `phase`, `totalTasks`, `globalIteration`, `maxFixTasksPerOriginal`, `maxFixTaskDepth`, and the required recovery/task-map fields.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Fresh and resumed execution state satisfies the full `state-resume` verifier contract, including bootstrap defaults and preserved fix-depth/count fields.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-resume`
  - **Commit**: `feat(implement): green - extract loop state bootstrap`
  - _Requirements: FR-1, FR-2, AC-1.1, AC-1.2_
  - _Design: `extensions/ralph-specum/implementation-loop.ts`; `ImplementationLoopStateV1`_

- [x] 1.3 [YELLOW] Refactor: centralize execution defaults and evidence initializers
  - **Do**:
    1. Consolidate execution-state defaults and evidence builders behind a small helper surface.
    2. Keep `index.ts` focused on command-shell orchestration only.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Bootstrap helpers are smaller and the `state-resume` case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-resume`
  - **Commit**: `refactor(implement): yellow - centralize loop state defaults`
  - _Requirements: FR-1, FR-2, AC-1.1, AC-1.2_
  - _Design: Implementation loop core; Evidence storage decision_

- [x] Q1 [VERIFY] Quality check: state bootstrap verifier
  - **Do**:
    1. Run the focused verifier case built from the research verifier-script pattern row for full `ImplementationLoopStateV1` bootstrap/resume coverage.
  - **Files**: None
  - **Done when**: The `state-resume` verifier exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-resume`
  - **Commit**: `chore(implement): pass state bootstrap checkpoint` (if fixes needed)
  - _Requirements: FR-1, FR-2, FR-17, AC-1.1, AC-1.2_
  - _Design: Parity verifier_

- [x] 1.4 [RED] Failing test: corrupt execution state stops early and stale native task maps self-repair
  - **Do**:
    1. Add a `state-integrity` case covering corrupt or missing required execution fields, pre-execution state upgrade, and empty/stale `nativeTaskMap` repair from canonical `tasks.md` order.
    2. Assert the loop exits before delegation on corrupt state and persists a repaired map before continuing when the map is stale but recoverable.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `state-integrity` case fails for the expected missing validation or repair behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-integrity 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add state integrity verifier`
  - _Requirements: FR-3, FR-9, AC-1.3, AC-3.3_
  - _Design: Implementation loop core; Error Handling; Edge Cases_

- [x] 1.5 [GREEN] Pass test: validate resume state and rebuild stale native task mappings
  - **Do**:
    1. Reject corrupt execution-resume state before any subagent call and include the invalid file plus field in the error.
    2. Upgrade pre-execution state with execution defaults instead of rejecting it.
    3. Rebuild `nativeTaskMap` from parsed `tasks.md` order when the stored map is missing, empty, or stale.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The `state-integrity` case passes for fail-fast corruption and self-repair map paths.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-integrity`
  - **Commit**: `feat(implement): green - validate state and repair task maps`
  - _Requirements: FR-3, FR-9, AC-1.3, AC-3.3_
  - _Design: State validator/init upgrade; Native task mirror/repair_

- [x] 1.6 [YELLOW] Refactor: isolate state validation and native-map repair helpers
  - **Do**:
    1. Extract corrupt-state diagnostics and native-map rebuild logic into focused helpers.
    2. Keep helper outputs stable for later verifier cases.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Validation and repair logic is isolated and the `state-integrity` case remains green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-integrity`
  - **Commit**: `refactor(implement): yellow - extract state integrity helpers`
  - _Requirements: FR-3, FR-9, AC-1.3, AC-3.3_
  - _Design: Implementation loop core; Error Handling_

- [x] Q2 [VERIFY] Quality check: state integrity verifier
  - **Do**:
    1. Run the focused integrity case for corrupt-state rejection and native-map repair.
  - **Files**: None
  - **Done when**: The `state-integrity` verifier exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-integrity`
  - **Commit**: `chore(implement): pass state integrity checkpoint` (if fixes needed)
  - _Requirements: FR-3, FR-9, FR-17, AC-1.3, AC-3.3_
  - _Design: Parity verifier_

- [x] 1.7 [RED] Failing test: recoverable task failure inserts bounded fix tasks and records lineage
  - **Do**:
    1. Add a `recovery-fix` case asserting a recoverable failure in recovery mode updates `fixTaskMap`, inserts a `<taskId>.<attempt>` fix task after the failed block, increments `totalTasks`, and resumes at the new fix task.
    2. Assert the original task remains the retry target in recorded lineage.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `recovery-fix` case fails for the expected missing fix-task behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case recovery-fix 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add recovery fix verifier`
  - _Requirements: FR-4, AC-2.1, AC-2.2_
  - _Design: Fix-task planning; `FixTaskEntry`; Data Flow_

- [x] 1.8 [GREEN] Pass test: generate fix-task chains and persist recovery metadata
  - **Do**:
    1. Update the loop to patch `fixTaskMap[originalTaskId]` with `attempts`, `fixTaskIds`, and `lastError` before the next iteration.
    2. Insert recovery tasks into `tasks.md` immediately after the failed block with deterministic IDs.
    3. Reparse tasks and resume from the inserted fix task while keeping the failed original task as the retry anchor.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The `recovery-fix` case passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case recovery-fix`
  - **Commit**: `feat(implement): green - insert recovery fix tasks`
  - _Requirements: FR-4, AC-2.1, AC-2.2_
  - _Design: Fix-task planning; Implementation loop core_

- [x] 1.9 [YELLOW] Refactor: extract fix-task id, anchor, and lineage helpers
  - **Do**:
    1. Centralize fix-task ID generation, insertion-anchor lookup, and lineage updates.
    2. Keep file writes deterministic for fixture assertions.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: Recovery helpers are isolated and the `recovery-fix` case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case recovery-fix`
  - **Commit**: `refactor(implement): yellow - extract fix task helpers`
  - _Requirements: FR-4, AC-2.1, AC-2.2_
  - _Design: Fix-task planning; Existing Patterns to Follow_

- [x] Q3 [VERIFY] Quality check: recovery insertion verifier
  - **Do**:
    1. Run the focused recovery-insertion fixture case.
  - **Files**: None
  - **Done when**: The `recovery-fix` verifier exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case recovery-fix`
  - **Commit**: `chore(implement): pass recovery insertion checkpoint` (if fixes needed)
  - _Requirements: FR-4, FR-17, AC-2.1, AC-2.2_
  - _Design: Parity verifier_

- [x] 1.10 [RED] Failing test: recovery limits stop safely without false completion
  - **Do**:
    1. Add a `recovery-bounds` case asserting `maxFixTasksPerOriginal` and `maxFixTaskDepth` stop the loop non-successfully.
    2. Assert the failure reports the original task ID plus fix-task history or lineage and emits no `ALL_TASKS_COMPLETE`.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `recovery-bounds` case fails for the expected missing stop behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case recovery-bounds 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add recovery bounds verifier`
  - _Requirements: FR-5, AC-2.3_
  - _Design: Error Handling; Edge Cases; Fix-task planning_

- [x] 1.11 [GREEN] Pass test: enforce recovery limits and preserve actionable stop evidence
  - **Do**:
    1. Enforce per-original and depth bounds before creating the next fix task.
    2. Stop the loop without terminal success when bounds are exceeded.
    3. Persist lineage-rich stop evidence for resume or manual intervention.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The `recovery-bounds` case passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case recovery-bounds`
  - **Commit**: `feat(implement): green - enforce recovery bounds`
  - _Requirements: FR-5, AC-2.3_
  - _Design: Error Handling; Implementation loop core_

- [x] 1.12 [YELLOW] Refactor: normalize recovery-stop reporting and bound checks
  - **Do**:
    1. Extract reusable bound-check helpers and stop-message formatting.
    2. Keep recovery stop output stable for verifier assertions.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: Bound checks are isolated and the `recovery-bounds` case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case recovery-bounds`
  - **Commit**: `refactor(implement): yellow - normalize recovery stop helpers`
  - _Requirements: FR-5, AC-2.3_
  - _Design: Error Handling; Fix-task planning_

- [ ] Q4 [VERIFY] Quality check: recovery bounds verifier
  - **Do**:
    1. Run the focused recovery-bounds case.
  - **Files**: None
  - **Done when**: The `recovery-bounds` verifier exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case recovery-bounds`
  - **Commit**: `chore(implement): pass recovery bounds checkpoint` (if fixes needed)
  - _Requirements: FR-5, FR-17, AC-2.3_
  - _Design: Parity verifier_

## Phase 2: Mutation and execution guards

- [x] 2.1 [RED] Failing test: task modification requests reject unsafe payloads and remap safely
  - **Do**:
    1. Add a `task-modification` case covering invalid payload shape, mismatched task IDs, duplicate IDs, and valid task mutation requests.
    2. Assert invalid requests stop before mutating files and valid requests update `modificationMap` plus native task ordering.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `task-modification` case fails for the expected missing validation or mutation behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case task-modification 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add task modification verifier`
  - _Requirements: FR-6, AC-2.4_
  - _Design: Implementation loop core; Error Handling; Edge Cases_

- [ ] 2.2 [GREEN] Pass test: validate modification payloads and apply safe task-list mutations
  - **Do**:
    1. Reject invalid `TASK_MODIFICATION_REQUEST` payloads before any file mutation.
    2. Apply valid task-list updates to `tasks.md` and persist `modificationMap` history.
    3. Rebuild canonical/native task ordering after the mutation.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The `task-modification` case passes for reject and accept paths.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case task-modification`
  - **Commit**: `feat(implement): green - handle task modification requests`
  - _Requirements: FR-6, AC-2.4_
  - _Design: Task mutation path; `modificationMap`; Native task mirror/repair_

- [ ] 2.3 [YELLOW] Refactor: extract task-mutation validation and remap helpers
  - **Do**:
    1. Isolate payload validation, task insertion/replacement, and post-mutation remap helpers.
    2. Keep mutation behavior deterministic for fixture tests.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: Mutation helpers are isolated and the `task-modification` case remains green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case task-modification`
  - **Commit**: `refactor(implement): yellow - extract task mutation helpers`
  - _Requirements: FR-6, AC-2.4_
  - _Design: Task mutation path; Existing Patterns to Follow_

- [ ] Q5 [VERIFY] Quality check: task modification verifier
  - **Do**:
    1. Run the focused mutation case for safe reject/apply behavior.
  - **Files**: None
  - **Done when**: The `task-modification` verifier exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case task-modification`
  - **Commit**: `chore(implement): pass task modification checkpoint` (if fixes needed)
  - _Requirements: FR-6, FR-17, AC-2.4_
  - _Design: Parity verifier_

- [ ] 2.4 [RED] Failing test: normal and `[VERIFY]` tasks require explicit success signals and evidence
  - **Do**:
    1. Add a `completion-gates` case covering normal-task success, contradiction rejection, `[VERIFY]` pass, and `[VERIFY]` fail behavior.
    2. Assert normal tasks require the coordinator's completion signal plus keyed evidence and `[VERIFY]` tasks require `VERIFICATION_PASS`.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `completion-gates` case fails for the expected missing gate behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case completion-gates 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add completion gate verifier`
  - _Requirements: FR-7, FR-8, AC-3.1, AC-3.2_
  - _Design: Implementation loop core; Completion validation bridge_

- [ ] 2.5 [GREEN] Pass test: gate task completion on signals, evidence, and contradiction checks
  - **Do**:
    1. Require explicit completion markers and keyed evidence before checking any task box.
    2. Reject contradictory output from normal tasks.
    3. Treat only `VERIFICATION_PASS` as success for `[VERIFY]` tasks.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The `completion-gates` case passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case completion-gates`
  - **Commit**: `feat(implement): green - enforce completion gates`
  - _Requirements: FR-7, FR-8, AC-3.1, AC-3.2_
  - _Design: Completion validation; `task-completion.ts` integration_

- [ ] 2.6 [YELLOW] Refactor: isolate completion-result parsing and gate enforcement
  - **Do**:
    1. Extract a narrow bridge between loop execution and task-completion validation.
    2. Keep signal names and evidence parsing stable for verifier fixtures.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Completion-gate logic is clearer and the `completion-gates` case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case completion-gates`
  - **Commit**: `refactor(implement): yellow - extract completion gate helpers`
  - _Requirements: FR-7, FR-8, AC-3.1, AC-3.2_
  - _Design: Implementation loop core; Completion validation bridge_

- [ ] Q6 [VERIFY] Quality check: completion gate verifier
  - **Do**:
    1. Run the focused completion-gates case.
  - **Files**: None
  - **Done when**: The `completion-gates` verifier exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case completion-gates`
  - **Commit**: `chore(implement): pass completion gate checkpoint` (if fixes needed)
  - _Requirements: FR-7, FR-8, FR-17, AC-3.1, AC-3.2_
  - _Design: Parity verifier_

- [ ] 2.7 [RED] Failing test: contiguous `[P]` groups run as one sequential batch with downstream barriers
  - **Do**:
    1. Add a `parallel-batch` case covering a contiguous `[P]` group, per-task evidence capture, downstream barrier behavior, and recovery stop inside the batch.
    2. Assert listed order execution is preserved even though the group is treated as one batch.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `parallel-batch` case fails for the expected missing batch semantics.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case parallel-batch 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add parallel batch verifier`
  - _Requirements: FR-10, AC-3.4_
  - _Design: `ExecutionBatch`; `[P]` sequential-batch decision; Data Flow_

- [ ] 2.8 [GREEN] Pass test: execute `[P]` groups as deterministic sequential batches
  - **Do**:
    1. Detect contiguous `[P]` groups and run them in listed order as one batch.
    2. Store completion evidence per task within the batch.
    3. Prevent the first downstream non-group task from running until the whole batch completes successfully.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The `parallel-batch` case passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case parallel-batch`
  - **Commit**: `feat(implement): green - add sequential parallel batches`
  - _Requirements: FR-10, AC-3.4_
  - _Design: `ExecutionBatch`; Implementation loop core_

- [ ] 2.9 [YELLOW] Refactor: separate batch planning from evidence recording
  - **Do**:
    1. Extract contiguous-group selection and downstream-barrier rules into helpers.
    2. Keep evidence recording reusable for single and batch execution modes.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: Batch logic is isolated and the `parallel-batch` case remains green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case parallel-batch`
  - **Commit**: `refactor(implement): yellow - extract batch helpers`
  - _Requirements: FR-10, AC-3.4_
  - _Design: `ExecutionBatch`; Technical Decisions_

- [ ] Q7 [VERIFY] Quality check: sequential batch verifier
  - **Do**:
    1. Run the focused `[P]` batch case.
  - **Files**: None
  - **Done when**: The `parallel-batch` verifier exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case parallel-batch`
  - **Commit**: `chore(implement): pass batch checkpoint` (if fixes needed)
  - _Requirements: FR-10, FR-17, AC-3.4_
  - _Design: Parity verifier_

- [ ] 2.10 [RED] Failing test: Layer 3 review runs only at approved checkpoints and records evidence
  - **Do**:
    1. Add a `layer3-review` case covering phase-boundary, every-5th-task, and final-task checkpoints.
    2. Assert each triggered review records pass/fail evidence before final completion is allowed.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `layer3-review` case fails for the expected missing review cadence behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case layer3-review 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add layer3 review verifier`
  - _Requirements: FR-11, AC-3.5_
  - _Design: Layer 3 review path; `Layer3ReviewInput`; Data Flow_

- [ ] 2.11 [GREEN] Pass test: integrate reviewer checkpoints and persist review evidence
  - **Do**:
    1. Reuse the existing reviewer flow only at the approved checkpoint cadence.
    2. Record review pass/fail status into progress or canonical evidence.
    3. Block final success when a required checkpoint review fails.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The `layer3-review` case passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case layer3-review`
  - **Commit**: `feat(implement): green - add layer3 review checkpoints`
  - _Requirements: FR-11, AC-3.5_
  - _Design: Reviewer reuse; Evidence storage; Implementation loop core_

- [ ] 2.12 [YELLOW] Refactor: extract checkpoint calculator and review recorder
  - **Do**:
    1. Isolate checkpoint calculation from reviewer execution.
    2. Keep review recording format stable for acceptance-bundle assertions.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: Checkpoint logic is isolated and the `layer3-review` case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case layer3-review`
  - **Commit**: `refactor(implement): yellow - extract review checkpoint helpers`
  - _Requirements: FR-11, AC-3.5_
  - _Design: `Layer3ReviewInput`; Technical Decisions_

- [ ] Q8 [VERIFY] Quality check: Layer 3 review verifier
  - **Do**:
    1. Run the focused Layer 3 cadence case.
  - **Files**: None
  - **Done when**: The `layer3-review` verifier exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case layer3-review`
  - **Commit**: `chore(implement): pass layer3 checkpoint` (if fixes needed)
  - _Requirements: FR-11, FR-17, AC-3.5_
  - _Design: Parity verifier_

## Phase 3: Completion and contract alignment

- [ ] 3.1 [RED] Failing test: successful completion finalizes index once, cleans temp files, deletes state, and optionally prints PR URL
  - **Do**:
    1. Add a `completion-finalizer` case covering all-tasks-complete success, epic update, single index finalization, stale `.progress-task-*.md` cleanup, `.ralph-state.json` deletion, and optional PR URL output.
    2. Add a failing-index subcase asserting no `ALL_TASKS_COMPLETE` is emitted when index finalization fails.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `completion-finalizer` case fails for the expected missing success or failure-path finalization behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case completion-finalizer 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add completion finalizer verifier`
  - _Requirements: FR-12, FR-13, FR-14, FR-15, FR-16, AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5_
  - _Design: Completion finalizer; Error Handling; Data Flow_

- [ ] 3.2 [GREEN] Pass test: implement parity finalizer ordering and index-failure suppression
  - **Do**:
    1. Gate terminal success on every checkbox complete and no unresolved recovery or modification work.
    2. Finalize in order: epic update, index finalization once, stale temp cleanup, state deletion, optional PR URL output.
    3. Preserve resume-safe state and final error evidence when index finalization fails.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The `completion-finalizer` case passes for success, no-false-success, cleanup, and PR-output paths.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case completion-finalizer`
  - **Commit**: `feat(implement): green - add parity completion finalizer`
  - _Requirements: FR-12, FR-13, FR-14, FR-15, FR-16, AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5_
  - _Design: Completion finalizer; `runRalphIndex` reuse; optional PR output_

- [ ] 3.3 [YELLOW] Refactor: isolate finalizer side effects and terminal output formatting
  - **Do**:
    1. Extract finalizer steps behind a small helper surface.
    2. Keep index-failure and PR-output formatting stable for verifier assertions.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Finalizer helpers are isolated and the `completion-finalizer` case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case completion-finalizer`
  - **Commit**: `refactor(implement): yellow - extract completion finalizer helpers`
  - _Requirements: FR-12, FR-13, FR-14, FR-15, FR-16, AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5_
  - _Design: Completion finalizer; Technical Decisions_

- [ ] Q9 [VERIFY] Quality check: completion finalizer verifier
  - **Do**:
    1. Run the focused completion-finalizer case.
  - **Files**: None
  - **Done when**: The `completion-finalizer` verifier exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case completion-finalizer`
  - **Commit**: `chore(implement): pass completion finalizer checkpoint` (if fixes needed)
  - _Requirements: FR-12, FR-13, FR-14, FR-15, FR-16, FR-17, AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5_
  - _Design: Parity verifier_

- [ ] 3.4 [RED] Failing test: schema, related-contract compatibility, and package verification wiring expose implementation-loop parity coverage
  - **Do**:
    1. Add a `contract-wiring` case asserting `schemas/spec.schema.json` matches in-flight `ImplementationLoopStateV1` fields and keeps `phase` limited to in-flight execution values.
    2. Extend the case to verify `StartCompatibilityContractV1` (`start-and-new-flow-parity`), `IndexArtifactContractV1` (`indexing-command-parity`), `RalphResourceManifestV1` (`packaged-resource-parity`), and refactor-loop delegation expectations shared with `spec-refactor-command-parity` still align with implementation-loop bootstrap/finalization behavior.
    3. Assert discovered package scripts include the new implementation-loop verifier in `verify:index`, `verify:pack`, and `prepack`, with `acceptance-checklist` and `cleanup` cases exposed.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `contract-wiring` case fails for the expected missing schema, related-contract, or package wiring behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case contract-wiring 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add contract wiring verifier`
  - _Requirements: FR-1, FR-15, FR-17, AC-1.2, AC-4.4_
  - _Design: `schemas/spec.schema.json`; Parity verifier; File Structure_

- [ ] 3.5 [GREEN] Pass test: align schema, related contracts, and discovered package verification wiring
  - **Do**:
    1. Update `schemas/spec.schema.json` for the approved in-flight execution fields, including `maxFixTaskDepth`, `nativeTaskMap`, and canonical `evidence` shape.
    2. Extend `scripts/verify-implementation-loop-parity.mjs` so `contract-wiring` proves compatibility or update-needed detection for `StartCompatibilityContractV1`, `IndexArtifactContractV1`, `RalphResourceManifestV1`, and refactor-loop delegation expectations.
    3. Update `package.json` so the implementation-loop verifier runs via discovered `verify:index`, `verify:pack`, and `prepack` entrypoints.
    4. Add `acceptance-checklist` and `cleanup` execution paths to `scripts/verify-implementation-loop-parity.mjs`.
  - **Files**: `schemas/spec.schema.json`, `package.json`, `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `contract-wiring` case passes for schema parity, related-contract compatibility, and package script wiring.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case contract-wiring`
  - **Commit**: `feat(implement): green - align schema and package verification`
  - _Requirements: FR-1, FR-15, FR-17, AC-1.2, AC-4.4_
  - _Design: `schemas/spec.schema.json`; package verification wiring; Parity verifier_

- [ ] Q10 [VERIFY] Quality check: contract, related-spec, and package wiring verifier
  - **Do**:
    1. Run the focused `contract-wiring` case after schema, related-contract, and package updates.
  - **Files**: None
  - **Done when**: The `contract-wiring` verifier exits `0` for schema parity and `StartCompatibilityContractV1` / `IndexArtifactContractV1` / `RalphResourceManifestV1` compatibility checks.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case contract-wiring`
  - **Commit**: `chore(implement): pass contract wiring checkpoint` (if fixes needed)
  - _Requirements: FR-1, FR-15, FR-17, AC-1.2, AC-4.4_
  - _Design: Parity verifier_

## Phase 4: Additional Testing

- [ ] 4.1 [RED] Failing test: edge-case fixtures cover re-entry, `[P]` mutation breaks, stale-progress age gating, and empty PR URL success
  - **Do**:
    1. Add an `edge-cases` case covering resume after `[x]` without evidence, valid modification inside a `[P]` batch, stale `.progress-task-*.md` deletion older than 60 minutes only, and empty `gh pr view` output as non-fatal.
    2. Make the acceptance bundle fail until each edge path is asserted.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The `edge-cases` case fails for the expected missing fixture coverage.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case edge-cases 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add edge case verifier`
  - _Requirements: FR-2, FR-6, FR-10, FR-14, FR-16, FR-17, AC-1.1, AC-2.4, AC-3.4, AC-4.3, AC-4.5_
  - _Design: Edge Cases; Completion finalizer; Task mutation path_

- [ ] 4.2 [GREEN] Pass test: extend acceptance coverage for remaining loop edge cases
  - **Do**:
    1. Add fixture coverage for the edge paths to `scripts/verify-implementation-loop-parity.mjs` and fold them into `acceptance-checklist`.
    2. Patch runtime only where a new edge-case fixture proves a remaining gap.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`, `extensions/ralph-specum/implementation-loop.ts`
  - **Done when**: The `edge-cases` case passes and the acceptance bundle includes the added coverage.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case edge-cases`
  - **Commit**: `feat(implement): green - cover remaining edge cases`
  - _Requirements: FR-2, FR-6, FR-10, FR-14, FR-16, FR-17, AC-1.1, AC-2.4, AC-3.4, AC-4.3, AC-4.5_
  - _Design: Edge Cases; Parity verifier_

- [ ] Q11 [VERIFY] Quality check: edge-case verifier
  - **Do**:
    1. Run the focused edge-case case and keep it in the acceptance bundle.
  - **Files**: None
  - **Done when**: The `edge-cases` verifier exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case edge-cases`
  - **Commit**: `chore(implement): pass edge-case checkpoint` (if fixes needed)
  - _Requirements: FR-2, FR-6, FR-10, FR-14, FR-16, FR-17, AC-1.1, AC-2.4, AC-3.4, AC-4.3, AC-4.5_
  - _Design: Parity verifier_

## Phase 5: E2E Verification

- [ ] VE1 [VERIFY] Package verification startup/build proxy
  - **Do**:
    1. Use the research `Quality Commands` row `verify = npm run prepack` as the library-package startup/build proxy because no separate build or E2E runner was discovered.
  - **Files**: None
  - **Done when**: The discovered package verification bundle exits `0` with implementation-loop parity wiring included.
  - **Verify**: `npm run prepack`
  - **Commit**: None
  - _Requirements: FR-15, FR-17, AC-4.4_
  - _Design: package verification wiring_

- [ ] VE2 [VERIFY] Implementation-loop parity fixture acceptance flow
  - **Do**:
    1. Run the dedicated verifier using the discovered case-based verifier pattern from research.md (`node scripts/verify-index-parity.mjs --case acceptance-checklist`) adapted for `scripts/verify-implementation-loop-parity.mjs`.
    2. Assert the acceptance bundle covers resume, recovery, modification, `[P]`, review, cleanup, and index-finalization behavior together.
  - **Files**: None
  - **Done when**: The implementation-loop `acceptance-checklist` bundle exits `0`.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist`
  - **Commit**: None
  - _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17_
  - _Design: Parity verifier; end-to-end fixture bundle_

- [ ] VE3 [VERIFY] Implementation-loop parity fixture cleanup
  - **Do**:
    1. Run the verifier cleanup path so temp spec fixtures prove they are removed after acceptance coverage.
    2. Use the same cleanup style as the discovered repository verifier scripts.
  - **Files**: None
  - **Done when**: The implementation-loop `cleanup` case exits `0` with no lingering verifier temp roots.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case cleanup`
  - **Commit**: None
  - _Requirements: FR-14, FR-17, AC-4.3_
  - _Design: Parity verifier cleanup path_

## Phase 6: Quality Gates

- [ ] V4 [VERIFY] Full local CI
  - **Do**:
    1. Run all discovered package verification commands after implementation-loop parity is wired in.
  - **Files**: None
  - **Done when**: The discovered verification command set exits `0`.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(implement): pass full local verification` (if fixes needed)
  - _Requirements: FR-15, FR-17, AC-4.4_
  - _Design: package verification wiring; Test Strategy_

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Re-run the discovered package verification bundle as the repo's CI-equivalent gate because research found no separate `.github/workflows` pipeline to invoke.
  - **Files**: None
  - **Done when**: The CI-equivalent command set exits `0`.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(implement): confirm ci-equivalent verification` (if fixes needed)
  - _Requirements: FR-15, FR-17, AC-4.4_
  - _Design: package verification wiring; repo verification policy_

- [ ] V6 [VERIFY] AC checklist
  - **Do**:
    1. Run the implementation-loop acceptance bundle and the discovered package verification bundle.
    2. Confirm the bundled cases map back to resume, recovery, mutation, verification, batch, review, cleanup, and finalization acceptance criteria.
  - **Files**: None
  - **Done when**: The automated acceptance checklist exits `0` and package verification remains green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist && npm run prepack`
  - **Commit**: None
  - _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17; AC-1.1, AC-1.2, AC-1.3, AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-3.1, AC-3.2, AC-3.3, AC-3.4, AC-3.5, AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5_
  - _Design: end-to-end fixture bundle; Completion finalizer; Implementation loop core_

## Phase 7: PR Lifecycle

- [ ] 7.1 [VERIFY] Commit readiness check
  - **Do**:
    1. Run final discovered package verification commands before handoff.
    2. Re-run verifier cleanup to ensure no temp fixtures remain in the repo or temp roots.
  - **Files**: None
  - **Done when**: Final verification exits `0` and cleanup has passed.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack && node scripts/verify-implementation-loop-parity.mjs --case cleanup`
  - **Commit**: `chore(implement): final verification before handoff` (if fixes needed)
  - _Requirements: FR-14, FR-15, FR-17, AC-4.3, AC-4.4_
  - _Design: Parity verifier cleanup path; package verification wiring_

## Unresolved Questions
- None.

## Notes
- Intent Classification missing in `.progress.md`; assumed `MID_SIZED` non-greenfield parity work, so the plan uses TDD Red-Green-Yellow.
- POC shortcuts: None.
- Production TODOs: if a later spec requires true concurrent `[P]` execution, add a new contract plus verifier instead of stretching this sequential-batch parity plan.
- Guardrail: keep runtime changes inside the Pi package files listed in design; do not edit legacy plugin files.
