# Tasks: Fix Task Blockers

## Phase 0: Reality check

- [x] 0.1 [VERIFY] Reproduce bug
  - **Do**:
    1. Run the discovered `verify:index` command from research.md as the current automated baseline.
    2. Record that the repo currently lacks task-blocker parity coverage for split-repo/non-repo/`RED_PASS` cases.
  - **Files**: `/home/nephy/pi-custom-workflow/pi-smart-ralph/specs/fix-task-blockers/.progress.md`
  - **Done when**: Baseline package verification output is captured and the missing task-blocker repro coverage is documented in `.progress.md`.
  - **Verify**: `npm run verify:index`
  - **Commit**: None
  - _Requirements: FR-11, NFR-3_
  - _Design: Test Strategy; `scripts/verify-task-blockers-parity.mjs`_

- [x] 0.2 [VERIFY] Confirm repro is consistent
  - **Do**:
    1. Re-run the discovered `verify:index` command used in 0.1.
    2. Confirm the same baseline gap is reproducible before adding the new parity verifier.
  - **Files**: `/home/nephy/pi-custom-workflow/pi-smart-ralph/specs/fix-task-blockers/.progress.md`
  - **Done when**: The pre-fix baseline is repeatable and noted in `.progress.md`.
  - **Verify**: `npm run verify:index`
  - **Commit**: None
  - _Requirements: FR-11, NFR-3_
  - _Design: Test Strategy; bug-fix reality check_

## Phase 1: Verifier harness and topology classification

- [x] 1.1 [RED] Failing test: task-blockers parity harness is invoked by discovered package verification
  - **Do**:
    1. Create `scripts/verify-task-blockers-parity.mjs` following existing parity-script conventions.
    2. Add an initial failing case that asserts the topology helper contract is missing.
    3. Wire the new verifier into `npm run verify:index` so the failing case is exercised by discovered package verification.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`, `package.json`
  - **Done when**: `npm run verify:index` fails for the expected missing task-blocker parity behavior.
  - **Verify**: `npm run verify:index 2>&1 | grep -q "FAIL\|EXPECTED_FAIL\|Error" && echo RED_PASS`
  - **Commit**: `test(task-blockers): red - add parity verifier harness`
  - _Requirements: FR-11, NFR-3_
  - _Design: `scripts/verify-task-blockers-parity.mjs`; `package.json`_

- [x] 1.2 [GREEN] Pass test: export minimal task-completion helper surface
  - **Do**:
    1. Create `extensions/ralph-specum/task-completion.ts` with the exported helper surface expected by the verifier.
    2. Add the smallest topology-report skeleton needed for the initial contract case to pass.
  - **Files**: `extensions/ralph-specum/task-completion.ts`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: The initial parity harness passes through `npm run verify:index`.
  - **Verify**: `npm run verify:index`
  - **Commit**: `feat(task-blockers): green - add completion helper skeleton`
  - _Requirements: FR-1, FR-2, FR-11_
  - _Design: `extensions/ralph-specum/task-completion.ts`_

- [ ] 1.3 [YELLOW] Refactor: stabilize verifier runner and helper exports
  - **Do**:
    1. Normalize case parsing and pass/fail summary output in the new parity verifier.
    2. Keep helper exports narrow and named for later focused cases.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`, `extensions/ralph-specum/task-completion.ts`
  - **Done when**: The verifier runner shape matches existing repo patterns and the initial case stays green.
  - **Verify**: `npm run verify:index`
  - **Commit**: `refactor(task-blockers): yellow - stabilize parity harness`
  - _Requirements: FR-11, NFR-2, NFR-3_
  - _Design: Existing Patterns to Follow; `scripts/verify-task-blockers-parity.mjs`_

- [ ] Q1 [VERIFY] Quality check: parity harness baseline
  - **Do**:
    1. Run the discovered `verify:index` command after adding the new verifier harness.
  - **Files**: None
  - **Done when**: `npm run verify:index` exits 0.
  - **Verify**: `npm run verify:index`
  - **Commit**: `chore(task-blockers): pass verifier harness checkpoint` (if fixes needed)
  - _Requirements: FR-11, NFR-3_
  - _Design: package verification wiring_

- [ ] 1.4 [RED] Failing test: classify `single_repo`, `multi_repo`, `repo_plus_nonrepo`, and `no_repo`
  - **Do**:
    1. Add temp-fixture cases covering the four required topology enums.
    2. Assert task files plus `tasks.md` and `.progress.md` are all part of the classification input.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: `npm run verify:index` fails because topology classification is incomplete.
  - **Verify**: `npm run verify:index 2>&1 | grep -q "FAIL\|EXPECTED_FAIL\|Error" && echo RED_PASS`
  - **Commit**: `test(task-blockers): red - add topology classification cases`
  - _Requirements: FR-1, FR-2, AC-1.1_
  - _Design: `TaskWorkspaceInput`; `TaskWorkspaceReport`_

- [ ] 1.5 [GREEN] Pass test: implement topology probing across task and spec artifacts
  - **Do**:
    1. Probe repo roots for task files, `tasks.md`, and `.progress.md`.
    2. Return the correct enum for all four topology fixture cases.
    3. Preserve distinct nested roots as `multi_repo`.
  - **Files**: `extensions/ralph-specum/task-completion.ts`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: All topology enum cases pass through `npm run verify:index`.
  - **Verify**: `npm run verify:index`
  - **Commit**: `feat(task-blockers): green - classify workspace topology`
  - _Requirements: FR-1, FR-2, AC-1.1_
  - _Design: `extensions/ralph-specum/task-completion.ts`; Edge Cases_

- [ ] 1.6 [YELLOW] Refactor: normalize path parsing and repo-root memoization
  - **Do**:
    1. Normalize `Files` parsing for `None`, comma lists, backticks, and newlines.
    2. Add per-path memoization so repeated git probes stay local and deterministic.
  - **Files**: `extensions/ralph-specum/task-completion.ts`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: Classification logic is isolated and topology cases remain green.
  - **Verify**: `npm run verify:index`
  - **Commit**: `refactor(task-blockers): yellow - normalize topology inputs`
  - _Requirements: FR-1, FR-2, NFR-2_
  - _Design: Performance Considerations; Edge Cases_

- [ ] Q2 [VERIFY] Quality check: topology classification
  - **Do**:
    1. Run the discovered `verify:index` command after topology helper changes.
  - **Files**: None
  - **Done when**: `npm run verify:index` exits 0.
  - **Verify**: `npm run verify:index`
  - **Commit**: `chore(task-blockers): pass topology checkpoint` (if fixes needed)
  - _Requirements: FR-1, FR-2, FR-11_
  - _Design: `scripts/verify-task-blockers-parity.mjs`_

## Phase 2: Commit-mode derivation and coordinator preflight

- [ ] 2.1 [RED] Failing test: derive commit mode from topology and `Commit: None`
  - **Do**:
    1. Add verifier cases for `Commit: None`, commit message directives, and `Files: None`.
    2. Assert reports distinguish `required`, `none`, and `topology_relaxed` commit modes.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: `npm run verify:index` fails because commit-mode derivation is missing or wrong.
  - **Verify**: `npm run verify:index 2>&1 | grep -q "FAIL\|EXPECTED_FAIL\|Error" && echo RED_PASS`
  - **Commit**: `test(task-blockers): red - add commit mode cases`
  - _Requirements: FR-4, FR-5, FR-12, AC-1.3, AC-2.1_
  - _Design: `TaskWorkspaceReport.commitMode`; `commit_reason`_

- [ ] 2.2 [GREEN] Pass test: implement topology-aware commit guidance
  - **Do**:
    1. Parse the task `Commit` directive alongside normalized file inputs.
    2. Return `none` for `Commit: None` in every topology.
    3. Return `topology_relaxed` plus a machine-readable reason for non-`single_repo` commit-message tasks.
  - **Files**: `extensions/ralph-specum/task-completion.ts`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: Commit-mode cases pass through `npm run verify:index`.
  - **Verify**: `npm run verify:index`
  - **Commit**: `feat(task-blockers): green - derive commit mode by topology`
  - _Requirements: FR-4, FR-5, FR-12, AC-1.3, AC-2.1_
  - _Design: `TaskWorkspaceReport`; Technical Decisions_

- [ ] 2.3 [YELLOW] Refactor: encapsulate workspace report formatting
  - **Do**:
    1. Extract one formatter for topology, entries, commit mode, and commit reason.
    2. Keep machine-readable strings stable across helper and verifier.
  - **Files**: `extensions/ralph-specum/task-completion.ts`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: Report formatting is centralized and commit-mode cases stay green.
  - **Verify**: `npm run verify:index`
  - **Commit**: `refactor(task-blockers): yellow - centralize workspace reports`
  - _Requirements: FR-5, FR-12, NFR-2_
  - _Design: `TaskWorkspaceReport`; Terminology consistency_

- [ ] Q3 [VERIFY] Quality check: workspace report coverage
  - **Do**:
    1. Run the discovered `verify:index` command after workspace-report changes.
  - **Files**: None
  - **Done when**: `npm run verify:index` exits 0.
  - **Verify**: `npm run verify:index`
  - **Commit**: `chore(task-blockers): pass workspace report checkpoint` (if fixes needed)
  - _Requirements: FR-4, FR-5, FR-12_
  - _Design: `scripts/verify-task-blockers-parity.mjs`_

- [ ] 2.4 [RED] Failing test: coordinator preflights topology and preserves `single_repo` behavior
  - **Do**:
    1. Add integration cases that inspect coordinator use of the workspace report before executor dispatch.
    2. Assert `single_repo` tasks keep current commit-required behavior.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: `npm run verify:index` fails because the coordinator does not yet preflight topology or preserve `single_repo` semantics.
  - **Verify**: `npm run verify:index 2>&1 | grep -q "FAIL\|EXPECTED_FAIL\|Error" && echo RED_PASS`
  - **Commit**: `test(task-blockers): red - add coordinator preflight cases`
  - _Requirements: FR-3, FR-7, AC-1.2, AC-2.3_
  - _Design: `extensions/ralph-specum/index.ts`; Data Flow step 3_

- [ ] 2.5 [GREEN] Pass test: integrate workspace preflight into coordinator flow
  - **Do**:
    1. Compute the workspace report in `extensions/ralph-specum/index.ts` before executor dispatch.
    2. Pass topology/preflight context into the execution path.
    3. Leave `single_repo` commit validation unchanged.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/task-completion.ts`
  - **Done when**: Coordinator preflight cases pass through `npm run verify:index`.
  - **Verify**: `npm run verify:index`
  - **Commit**: `feat(task-blockers): green - preflight topology in coordinator`
  - _Requirements: FR-3, FR-7, AC-1.2, AC-2.3_
  - _Design: `ImplementationCoordinator`; Data Flow_

- [ ] 2.6 [YELLOW] Refactor: keep coordinator orchestration thin
  - **Do**:
    1. Move task-blocker-specific branching behind helper calls.
    2. Keep `index.ts` focused on sequencing, not topology math.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/task-completion.ts`
  - **Done when**: Coordinator wiring is thinner and preflight cases remain green.
  - **Verify**: `npm run verify:index`
  - **Commit**: `refactor(task-blockers): yellow - thin coordinator preflight`
  - _Requirements: FR-3, FR-7, NFR-1_
  - _Design: `ImplementationCoordinator`; one focused helper decision_

- [ ] Q4 [VERIFY] Quality check: coordinator preflight
  - **Do**:
    1. Run the discovered `verify:index` command after coordinator preflight changes.
  - **Files**: None
  - **Done when**: `npm run verify:index` exits 0.
  - **Verify**: `npm run verify:index`
  - **Commit**: `chore(task-blockers): pass coordinator preflight checkpoint` (if fixes needed)
  - _Requirements: FR-3, FR-7, FR-11_
  - _Design: `scripts/verify-task-blockers-parity.mjs`_

## Phase 3: Completion validation and expected-failure handling

- [ ] 3.1 [RED] Failing test: non-`single_repo` tasks relax impossible combined commits and prefer topology blockers
  - **Do**:
    1. Add completion-validation cases for `multi_repo`, `repo_plus_nonrepo`, and `no_repo` tasks.
    2. Assert impossible combined commits do not hard-fail valid completions.
    3. Assert blocker selection prefers topology/commit-topology reasons over generic verification noise.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: `npm run verify:index` fails because relaxed completion and blocker priority are incomplete.
  - **Verify**: `npm run verify:index 2>&1 | grep -q "FAIL\|EXPECTED_FAIL\|Error" && echo RED_PASS`
  - **Commit**: `test(task-blockers): red - add relaxed completion cases`
  - _Requirements: FR-4, FR-9, FR-12, AC-1.3, AC-3.2_
  - _Design: Error Handling; blocker priority order_

- [ ] 3.2 [GREEN] Pass test: accept non-`single_repo` success with `commit: none` plus reason
  - **Do**:
    1. Reuse the workspace report during completion validation.
    2. Allow successful non-`single_repo` completions to finish with `commit: none` and `commit_reason`.
    3. Surface topology blockers ahead of generic verification output when commit scope is the true issue.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/task-completion.ts`
  - **Done when**: Relaxed-completion cases pass through `npm run verify:index`.
  - **Verify**: `npm run verify:index`
  - **Commit**: `feat(task-blockers): green - relax impossible commit scope blockers`
  - _Requirements: FR-4, FR-9, FR-12, AC-1.3, AC-3.2_
  - _Design: Error Handling; `TaskCompletionAssessment`_

- [ ] 3.3 [YELLOW] Refactor: isolate blocker-reason selection
  - **Do**:
    1. Extract one blocker-selection helper with the approved priority order.
    2. Keep fallback handling explicit for missing completion signals.
  - **Files**: `extensions/ralph-specum/task-completion.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Blocker priority is isolated and relaxed-completion cases stay green.
  - **Verify**: `npm run verify:index`
  - **Commit**: `refactor(task-blockers): yellow - extract blocker priority`
  - _Requirements: FR-9, FR-10, NFR-2_
  - _Design: blocker priority decision; `TaskCompletionAssessment`_

- [ ] Q5 [VERIFY] Quality check: relaxed completion and blocker priority
  - **Do**:
    1. Run the discovered `verify:index` command after blocker-priority changes.
  - **Files**: None
  - **Done when**: `npm run verify:index` exits 0.
  - **Verify**: `npm run verify:index`
  - **Commit**: `chore(task-blockers): pass blocker priority checkpoint` (if fixes needed)
  - _Requirements: FR-4, FR-9, FR-12_
  - _Design: `scripts/verify-task-blockers-parity.mjs`_

- [ ] 3.4 [RED] Failing test: `[RED]` tasks require keyed expected-failure proof
  - **Do**:
    1. Add cases for `TASK_COMPLETE` plus `verify: RED_PASS`.
    2. Add a negative case where raw failing output appears without keyed proof.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: `npm run verify:index` fails because keyed `RED_PASS` handling is not yet implemented.
  - **Verify**: `npm run verify:index 2>&1 | grep -q "FAIL\|EXPECTED_FAIL\|Error" && echo RED_PASS`
  - **Commit**: `test(task-blockers): red - add red-pass evidence cases`
  - _Requirements: FR-8, FR-10, AC-3.1, AC-3.3_
  - _Design: keyed evidence helpers; Technical Decisions_

- [ ] 3.5 [GREEN] Pass test: accept keyed `RED_PASS` and reject proofless failures
  - **Do**:
    1. Extend `TASK_COMPLETE` evidence parsing to accept keyed expected-failure proof.
    2. Keep verification failure behavior unchanged when keyed proof is absent.
    3. Ensure `[RED]` evidence does not override a real non-expected failure.
  - **Files**: `extensions/ralph-specum/task-completion.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: `RED_PASS` and proofless-failure cases pass through `npm run verify:index`.
  - **Verify**: `npm run verify:index`
  - **Commit**: `feat(task-blockers): green - accept keyed red pass proof`
  - _Requirements: FR-8, FR-10, AC-3.1, AC-3.3_
  - _Design: keyed evidence helpers; Error Handling_

- [ ] 3.6 [YELLOW] Refactor: centralize completion evidence parsing
  - **Do**:
    1. Isolate keyed evidence extraction for `verify:`, `verification:`, and `evidence:` lines.
    2. Keep `RED_PASS` parsing rules explicit and stable for future regressions.
  - **Files**: `extensions/ralph-specum/task-completion.ts`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: Evidence parsing is centralized and `RED_PASS` cases remain green.
  - **Verify**: `npm run verify:index`
  - **Commit**: `refactor(task-blockers): yellow - centralize completion evidence parsing`
  - _Requirements: FR-8, FR-10, NFR-2_
  - _Design: `TaskCompletionAssessment`; Technical Decisions_

- [ ] Q6 [VERIFY] Quality check: expected-failure handling
  - **Do**:
    1. Run the discovered `verify:index` command after evidence-parsing changes.
  - **Files**: None
  - **Done when**: `npm run verify:index` exits 0.
  - **Verify**: `npm run verify:index`
  - **Commit**: `chore(task-blockers): pass red-pass checkpoint` (if fixes needed)
  - _Requirements: FR-8, FR-10, FR-11_
  - _Design: `scripts/verify-task-blockers-parity.mjs`_

## Phase 4: Prompt and template contracts

- [ ] 4.1 [RED] Failing test: executor contract requires topology preflight and non-`single_repo` no-commit output
  - **Do**:
    1. Add prompt-inspection cases covering `agents/ralph-spec-executor.md` and `prompts/executor-prompt.md`.
    2. Assert both surfaces require topology preflight and allow `commit: none` plus `commit_reason` in non-`single_repo` workspaces.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: `npm run verify:index` fails because executor prompt guidance is incomplete.
  - **Verify**: `npm run verify:index 2>&1 | grep -q "FAIL\|EXPECTED_FAIL\|Error" && echo RED_PASS`
  - **Commit**: `test(task-blockers): red - add executor contract cases`
  - _Requirements: FR-7, FR-12, AC-2.3_
  - _Design: `agents/ralph-spec-executor.md`; `prompts/executor-prompt.md`_

- [ ] 4.2 [GREEN] Pass test: update executor guidance for topology-aware completion
  - **Do**:
    1. Require repo-topology preflight before commit handling in `agents/ralph-spec-executor.md`.
    2. Mirror the same rules in `prompts/executor-prompt.md`.
    3. Document `commit: none` plus `commit_reason` for non-`single_repo` success.
  - **Files**: `agents/ralph-spec-executor.md`, `prompts/executor-prompt.md`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: Executor contract cases pass through `npm run verify:index`.
  - **Verify**: `npm run verify:index`
  - **Commit**: `feat(task-blockers): green - align executor topology contract`
  - _Requirements: FR-7, FR-12, AC-2.3_
  - _Design: Prompt contracts; Data Flow step 4_

- [ ] 4.3 [YELLOW] Refactor: tighten executor examples and output markers
  - **Do**:
    1. Simplify executor wording so required topology markers are easy to follow.
    2. Keep output examples stable for verifier string assertions.
  - **Files**: `agents/ralph-spec-executor.md`, `prompts/executor-prompt.md`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: Executor guidance is clearer and prompt cases remain green.
  - **Verify**: `npm run verify:index`
  - **Commit**: `refactor(task-blockers): yellow - polish executor contract`
  - _Requirements: FR-7, FR-12, NFR-2_
  - _Design: Prompt contracts_

- [ ] Q7 [VERIFY] Quality check: executor prompt contract
  - **Do**:
    1. Run the discovered `verify:index` command after executor prompt updates.
  - **Files**: None
  - **Done when**: `npm run verify:index` exits 0.
  - **Verify**: `npm run verify:index`
  - **Commit**: `chore(task-blockers): pass executor prompt checkpoint` (if fixes needed)
  - _Requirements: FR-7, FR-12, FR-11_
  - _Design: `scripts/verify-task-blockers-parity.mjs`_

- [ ] 4.4 [RED] Failing test: planner and template default to feasible commit contracts
  - **Do**:
    1. Add prompt-inspection cases covering `agents/ralph-task-planner.md` and `templates/tasks.md`.
    2. Assert both surfaces steer non-shared-repo tasks toward `Commit: None` and avoid hardcoded `./specs/` assumptions.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: `npm run verify:index` fails because planner/template guidance is incomplete.
  - **Verify**: `npm run verify:index 2>&1 | grep -q "FAIL\|EXPECTED_FAIL\|Error" && echo RED_PASS`
  - **Commit**: `test(task-blockers): red - add planner contract cases`
  - _Requirements: FR-6, NFR-4, AC-2.2_
  - _Design: `agents/ralph-task-planner.md`; `templates/tasks.md`_

- [ ] 4.5 [GREEN] Pass test: update planner and template topology guidance
  - **Do**:
    1. Instruct the planner to default to `Commit: None` when task files and required spec artifacts cannot share one repo.
    2. Update the task template examples to reflect feasible commit contracts and topology-aware notes.
    3. Keep spec-root references configurable rather than hardcoded.
  - **Files**: `agents/ralph-task-planner.md`, `templates/tasks.md`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: Planner/template contract cases pass through `npm run verify:index`.
  - **Verify**: `npm run verify:index`
  - **Commit**: `feat(task-blockers): green - align planner commit guidance`
  - _Requirements: FR-6, NFR-4, AC-2.2_
  - _Design: Prompt contracts; File Structure_

- [ ] 4.6 [YELLOW] Refactor: keep planner examples concise and canonical
  - **Do**:
    1. Remove redundant wording from planner and template examples.
    2. Keep topology terms and commit markers identical to runtime/verifier strings.
  - **Files**: `agents/ralph-task-planner.md`, `templates/tasks.md`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: Planner/template guidance is concise and contract cases remain green.
  - **Verify**: `npm run verify:index`
  - **Commit**: `refactor(task-blockers): yellow - canonicalize planner examples`
  - _Requirements: FR-6, NFR-2, NFR-4_
  - _Design: Prompt contracts; Terminology consistency_

- [ ] Q8 [VERIFY] Quality check: planner contract
  - **Do**:
    1. Run the discovered `verify:index` command after planner/template updates.
  - **Files**: None
  - **Done when**: `npm run verify:index` exits 0.
  - **Verify**: `npm run verify:index`
  - **Commit**: `chore(task-blockers): pass planner prompt checkpoint` (if fixes needed)
  - _Requirements: FR-6, NFR-4, FR-11_
  - _Design: `scripts/verify-task-blockers-parity.mjs`_

## Phase 5: Acceptance bundle and package integration

- [ ] 5.1 [RED] Failing test: acceptance bundle covers topology, commit, prompt, and `RED_PASS` regressions
  - **Do**:
    1. Add `acceptance-checklist` and `cleanup` cases to the new parity verifier.
    2. Assert the acceptance bundle exercises topology enums, `Commit: None`, relaxed blocker priority, prompt contract strings, and keyed `RED_PASS` behavior.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: `npm run verify:index` fails because the aggregate acceptance bundle is incomplete.
  - **Verify**: `npm run verify:index 2>&1 | grep -q "FAIL\|EXPECTED_FAIL\|Error" && echo RED_PASS`
  - **Commit**: `test(task-blockers): red - add acceptance bundle cases`
  - _Requirements: FR-11, AC-1.1, AC-2.1, AC-3.1_
  - _Design: `scripts/verify-task-blockers-parity.mjs` acceptance bundle_

- [ ] 5.2 [GREEN] Pass test: finalize parity bundle and package verification flow
  - **Do**:
    1. Ensure `npm run verify:index` executes the new task-blockers parity cases in the normal verifier bundle.
    2. Finalize acceptance and cleanup cases so temp fixtures are removed after runs.
    3. Keep `npm run prepack` green with the new verifier included.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`, `package.json`
  - **Done when**: The task-blockers acceptance bundle passes through `npm run verify:index` and `npm run prepack`.
  - **Verify**: `npm run verify:index && npm run prepack`
  - **Commit**: `feat(task-blockers): green - finalize parity bundle`
  - _Requirements: FR-11, NFR-1, NFR-3_
  - _Design: package verification wiring; acceptance bundle_

- [ ] 5.3 [YELLOW] Refactor: align parity script structure with repo conventions
  - **Do**:
    1. Normalize default all-case execution, focused case routing, and cleanup handling.
    2. Keep concise pass/fail summaries for package-script output.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`, `package.json`
  - **Done when**: The verifier structure matches existing parity scripts and package verification stays green.
  - **Verify**: `npm run verify:index && npm run prepack`
  - **Commit**: `refactor(task-blockers): yellow - normalize parity bundle`
  - _Requirements: FR-11, NFR-2, NFR-3_
  - _Design: Existing Patterns to Follow; package verification wiring_

## Phase 6: E2E verification

- [ ] VE1 [VERIFY] Startup/build proxy: run discovered package verification bundle
  - **Do**:
    1. Use research.md Quality Commands row `verify = npm run prepack` from root `package.json` as the library startup/build proxy because no separate build or E2E runner was discovered.
  - **Files**: None
  - **Done when**: The discovered package verification bundle exits 0 with task-blockers parity included.
  - **Verify**: `npm run prepack`
  - **Commit**: None
  - _Requirements: FR-11, NFR-1, NFR-3_
  - _Design: E2E Tests; package verification wiring_

- [ ] VE2 [VERIFY] Behavior check: run discovered focused verification commands
  - **Do**:
    1. Use research.md Verification Tooling rows `npm run verify:index` and `npm run verify:pack` from root `package.json` to prove topology, prompt, and package parity behavior together.
  - **Files**: None
  - **Done when**: The discovered focused verification commands exit 0.
  - **Verify**: `npm run verify:index && npm run verify:pack`
  - **Commit**: None
  - _Requirements: FR-11, NFR-1, NFR-3_
  - _Design: acceptance bundle; package verification wiring_

- [ ] VE3 [VERIFY] Cleanup check: parity fixtures leave no persistent temp state
  - **Do**:
    1. Use the acceptance/cleanup path inside the task-blockers parity verifier, exercised through the discovered `npm run verify:index` bundle, to confirm fixture cleanup remains automatic.
  - **Files**: None
  - **Done when**: The discovered verifier bundle exits 0 after cleanup-aware parity cases run.
  - **Verify**: `npm run verify:index`
  - **Commit**: None
  - _Requirements: FR-11, NFR-3_
  - _Design: `scripts/verify-task-blockers-parity.mjs` cleanup path_

## Phase 7: Quality gates and fix verification

- [ ] V4 [VERIFY] Full local CI
  - **Do**:
    1. Run all discovered package verification commands from research.md Quality Commands.
  - **Files**: None
  - **Done when**: `npm run prepack`, `npm run verify:index`, and `npm run verify:pack` all exit 0.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(task-blockers): pass full local verification` (if fixes needed)
  - _Requirements: FR-11, NFR-1, NFR-3_
  - _Design: Test Strategy; package verification wiring_

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Re-run the discovered package verification bundle as the repo's CI-equivalent gate because research.md found no `.github/workflows/*` pipeline command to invoke separately.
  - **Files**: None
  - **Done when**: The CI-equivalent command set exits 0.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(task-blockers): confirm ci-equivalent verification` (if fixes needed)
  - _Requirements: FR-11, NFR-1, NFR-3_
  - _Design: Test Strategy; repo verification policy_

- [ ] V6 [VERIFY] AC checklist
  - **Do**:
    1. Run the automated acceptance bundle inside the task-blockers parity verifier through the discovered verification commands.
    2. Confirm coverage for topology enums, `Commit: None`, relaxed blocker priority, executor/planner contract strings, and keyed `RED_PASS` behavior.
  - **Files**: None
  - **Done when**: The acceptance bundle is green and package verification remains green.
  - **Verify**: `npm run verify:index && npm run prepack`
  - **Commit**: None
  - _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12; AC-1.1, AC-1.2, AC-1.3, AC-2.1, AC-2.2, AC-2.3, AC-3.1, AC-3.2, AC-3.3_
  - _Design: acceptance bundle; prompt contracts; completion analyzer_

- [ ] VF [VERIFY] Goal verification: original failure now passes
  - **Do**:
    1. Re-run the Phase 0 discovered verification command set.
    2. Compare AFTER results with the baseline gap recorded in `.progress.md`.
    3. Append AFTER verification notes to `.progress.md`.
  - **Files**: `/home/nephy/pi-custom-workflow/pi-smart-ralph/specs/fix-task-blockers/.progress.md`
  - **Done when**: The original split-repo/non-repo/`RED_PASS` failure modes are covered by the parity bundle and the AFTER note records the fix as resolved.
  - **Verify**: `npm run verify:index && npm run prepack`
  - **Commit**: `chore(task-blockers): verify original blocker failures resolved`
  - _Requirements: FR-4, FR-5, FR-8, FR-9, FR-10, FR-11, FR-12_
  - _Design: bug-fix reality verification; acceptance bundle_

## Unresolved Questions
- None blocking. Assumption: v1 standardizes non-`single_repo` success on `commit: none` plus `commit_reason`, matching requirements/design scope.
- None blocking. Assumption: keyed `RED_PASS` proof remains limited to `verify:` / `verification:` / `evidence:` lines.
- None blocking. Because research found no dedicated CI workflow, `V5` uses the discovered package verification bundle as the CI-equivalent gate.

## Notes
- Intent Classification missing in `.progress.md`; inferred `BUG_FIX` from the fix/patch goal, so the plan uses TDD Red-Green-Yellow plus BEFORE/AFTER verification.
- POC shortcuts: None.
- Production TODOs: revisit per-repo commit reporting and extra changed-file topology inputs only in a follow-up spec.
- Guardrail: do not edit legacy plugin/reference files; keep runtime changes scoped to the package paths named in design.
