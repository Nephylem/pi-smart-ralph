# Tasks: Refactor Command Parity

## Phase 1: Command surface and parser contract

- [x] 1.1 [RED] Failing verifier: command registration and `--file` enum contract
  - **Do**:
    1. Create `scripts/verify-refactor-parity.mjs` with a `command-registration` case following the existing fixture-verifier style.
    2. Assert that `/ralph-refactor` registration/help text is present and that invalid `--file` values are rejected.
  - **Files**: `scripts/verify-refactor-parity.mjs`
  - **Done when**: The verifier exists and fails because `/ralph-refactor` registration/parser support is missing or incomplete.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case command-registration 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add command registration verifier`
  - _Requirements: FR-1, FR-3, AC-1.1, AC-1.3_
  - _Design: `scripts/verify-refactor-parity.mjs`; `extensions/ralph-specum/refactor.ts`_

- [x] 1.2 [GREEN] Pass test: register `/ralph-refactor` and parse bounded file scope
  - **Do**:
    1. Create `extensions/ralph-specum/refactor.ts` with exported argument parsing for `[spec] [--file=requirements|design|tasks]`.
    2. Register `/ralph-refactor` in `extensions/ralph-specum/index.ts` with matching help text.
    3. Reject unsupported `--file` values before any artifact mutation path is entered.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The command-registration verifier passes for help text and bounded `--file` parsing.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case command-registration`
  - **Commit**: `feat(refactor): green - register command and parse file scope`
  - _Requirements: FR-1, FR-3, AC-1.1, AC-1.3_
  - _Design: `extensions/ralph-specum/index.ts`; `extensions/ralph-specum/refactor.ts`_

- [x] 1.3 [YELLOW] Refactor: centralize usage text and parse result helpers
  - **Do**:
    1. Extract reusable usage/help text constants and parse-result helpers into `refactor.ts`.
    2. Keep command registration logic thin in `index.ts`.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Parser/usage logic is encapsulated behind a small exported surface and the command-registration verifier stays green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case command-registration`
  - **Commit**: `refactor(refactor): yellow - extract parser helpers`
  - _Requirements: FR-1, FR-3, AC-1.1, AC-1.3_
  - _Design: `extensions/ralph-specum/refactor.ts` deep module_

- [x] Q1 [VERIFY] Quality check: command surface verifier
  - **Do**:
    1. Run the dedicated verifier implementing the research `command registration smoke` and `fixture/state smoke` tooling rows.
  - **Files**: None
  - **Done when**: The command registration verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case command-registration`
  - **Commit**: `chore(refactor): pass command surface checkpoint` (if fixes needed)
  - _Requirements: FR-1, FR-3, FR-15, AC-1.1, AC-1.3, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs`_

## Phase 2: Spec resolution and artifact discovery

- [x] 1.4 [RED] Failing verifier: configured-root resolution and no-artifact guard
  - **Do**:
    1. Add a `spec-resolution` case to `scripts/verify-refactor-parity.mjs` using temp spec roots.
    2. Assert explicit spec resolution uses configured-root helpers and that specs with no refactorable artifacts fail without writes.
  - **Files**: `scripts/verify-refactor-parity.mjs`
  - **Done when**: The verifier fails because configured-root resolution and/or artifact discovery guards are not fully implemented.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case spec-resolution 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add spec resolution verifier`
  - _Requirements: FR-2, FR-5, AC-1.2, AC-1.5_
  - _Design: `extensions/ralph-specum/paths.ts`; `extensions/ralph-specum/refactor.ts`_

- [x] 1.5 [GREEN] Pass test: resolve target specs and inventory refactorable artifacts
  - **Do**:
    1. Implement spec lookup through existing configured-root helpers.
    2. Detect existing `requirements.md`, `design.md`, and `tasks.md` in the selected spec.
    3. Return a no-write error when none of the refactorable artifact files exist.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The spec-resolution verifier passes for explicit/current-spec lookup and no-artifact failure behavior.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case spec-resolution`
  - **Commit**: `feat(refactor): green - resolve specs and discover artifacts`
  - _Requirements: FR-2, FR-5, AC-1.2, AC-1.5_
  - _Design: `extensions/ralph-specum/refactor.ts`; `extensions/ralph-specum/paths.ts`_

- [x] 1.6 [YELLOW] Refactor: isolate artifact inventory and resolution errors
  - **Do**:
    1. Extract artifact-inventory and error-formatting helpers so `index.ts` only orchestrates the flow.
    2. Reuse the same helper outputs for later verifier cases.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Resolution and artifact inventory are encapsulated and the spec-resolution verifier remains green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case spec-resolution`
  - **Commit**: `refactor(refactor): yellow - extract artifact discovery helpers`
  - _Requirements: FR-2, FR-5, AC-1.2, AC-1.5_
  - _Design: `extensions/ralph-specum/refactor.ts`_

- [x] Q2 [VERIFY] Quality check: resolution and artifact verifier
  - **Do**:
    1. Run the temp-root verifier implementing the research `fixture/state smoke` tooling row for configured-root resolution and empty-artifact safety.
  - **Files**: None
  - **Done when**: The spec-resolution verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case spec-resolution`
  - **Commit**: `chore(refactor): pass resolution checkpoint` (if fixes needed)
  - _Requirements: FR-2, FR-5, FR-15, AC-1.2, AC-1.5, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs`_

## Phase 3: Interactive planning and headless safety

- [x] 2.1 [RED] Failing verifier: file/section prompts and headless safe-stop
  - **Do**:
    1. Add a `headless-prompts` case to `scripts/verify-refactor-parity.mjs` with stubbed UI and headless fixtures.
    2. Assert interactive runs prompt for file/section choices and headless runs stop before any artifact, progress, or state writes.
  - **Files**: `scripts/verify-refactor-parity.mjs`
  - **Done when**: The verifier fails because the coordinator does not yet implement the required prompt/safe-stop behavior.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case headless-prompts 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add headless planning verifier`
  - _Requirements: FR-6, FR-7, AC-2.1, AC-2.2_
  - _Design: `extensions/ralph-specum/index.ts`; `extensions/ralph-specum/refactor.ts`_

- [x] 2.2 [GREEN] Pass test: implement interactive selection flow and headless guardrails
  - **Do**:
    1. Build file-level and section-level choice planning with `ctx.ui` when the scope is not fully determined.
    2. Fail early with a clear actionable message when headless execution still needs user decisions.
    3. Ensure no specialist run or file write occurs on the blocked headless path.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/refactor.ts`
  - **Done when**: The headless-prompts verifier passes for interactive prompts and no-write headless failure.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case headless-prompts`
  - **Commit**: `feat(refactor): green - add interactive planning and headless stop`
  - _Requirements: FR-6, FR-7, AC-2.1, AC-2.2_
  - _Design: command handler orchestration; `refactor.ts` planning helpers_

- [x] 2.3 [YELLOW] Refactor: extract section summary and prompt helper module logic
  - **Do**:
    1. Extract heading-summary and prompt-building helpers from the coordinator flow.
    2. Keep the selected-section plan serializable for later verifier reuse.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Prompt/summary logic is isolated and the headless-prompts verifier remains green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case headless-prompts`
  - **Commit**: `refactor(refactor): yellow - extract planning helpers`
  - _Requirements: FR-6, FR-7, AC-2.1, AC-2.2_
  - _Design: `extensions/ralph-specum/refactor.ts` deep module_

- [x] Q3 [VERIFY] Quality check: interactive and headless verifier
  - **Do**:
    1. Run the verifier implementing the research `headless-failure smoke` tooling row.
  - **Files**: None
  - **Done when**: The headless-prompts verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case headless-prompts`
  - **Commit**: `chore(refactor): pass headless safety checkpoint` (if fixes needed)
  - _Requirements: FR-6, FR-7, FR-15, AC-2.1, AC-2.2, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs`_

## Phase 4: Scope narrowing and progress-learnings input

- [x] 2.4 [RED] Failing verifier: `--file` narrowing and progress learnings ingestion
  - **Do**:
    1. Add a `file-narrowing` case to `scripts/verify-refactor-parity.mjs`.
    2. Assert `--file=<value>` suppresses unrelated file prompts and that `.progress.md` learnings are loaded into the refactor plan.
  - **Files**: `scripts/verify-refactor-parity.mjs`
  - **Done when**: The verifier fails because narrowing and/or progress-learning ingestion are incomplete.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case file-narrowing 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add scope narrowing verifier`
  - _Requirements: FR-4, FR-8, AC-2.3, AC-2.4_
  - _Design: `extensions/ralph-specum/refactor.ts`; command planner_

- [x] 2.5 [GREEN] Pass test: narrow scope to one artifact and feed learnings into the plan
  - **Do**:
    1. Short-circuit unrelated file prompts when `--file` already selects the artifact.
    2. Read `.progress.md` learnings and include them in the selected-file refactor plan.
    3. Preserve byte-unchanged behavior for non-selected artifact files.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The file-narrowing verifier passes for prompt suppression, progress learning extraction, and single-file scope.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case file-narrowing`
  - **Commit**: `feat(refactor): green - narrow file scope and load learnings`
  - _Requirements: FR-4, FR-8, AC-1.4, AC-2.3, AC-2.4_
  - _Design: `extensions/ralph-specum/refactor.ts`; coordinator plan assembly_

- [x] 2.6 [YELLOW] Refactor: normalize selected-file plan and progress-learning extraction
  - **Do**:
    1. Consolidate selected-file planning and learning extraction into a single helper surface.
    2. Reuse the same normalized plan for later specialist-request cases.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Planning helpers are reusable and the file-narrowing verifier remains green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case file-narrowing`
  - **Commit**: `refactor(refactor): yellow - normalize selected file plans`
  - _Requirements: FR-4, FR-8, AC-1.4, AC-2.3, AC-2.4_
  - _Design: `extensions/ralph-specum/refactor.ts`_

- [x] Q4 [VERIFY] Quality check: scope narrowing verifier
  - **Do**:
    1. Run the verifier implementing the research `fixture/state smoke` row for `--file` scoping and progress-learning ingestion.
  - **Files**: None
  - **Done when**: The file-narrowing verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case file-narrowing`
  - **Commit**: `chore(refactor): pass scope narrowing checkpoint` (if fixes needed)
  - _Requirements: FR-4, FR-8, FR-15, AC-1.4, AC-2.3, AC-2.4, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs`_

## Phase 5: Specialist contract and bounded delegation

- [x] 3.1 [RED] Failing verifier: specialist contract requires artifact-only structured completion
  - **Do**:
    1. Add a `specialist-contract` case to `scripts/verify-refactor-parity.mjs`.
    2. Assert the specialist contract requires artifact-only edits plus `REFACTOR_COMPLETE`, `CASCADE_NEEDED`, `CASCADE_REASON`, and `EVIDENCE` markers.
  - **Files**: `scripts/verify-refactor-parity.mjs`, `agents/ralph-refactor-specialist.md`
  - **Done when**: The verifier fails because the specialist contract is not yet fully aligned with the coordinator protocol.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case specialist-contract 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add specialist contract verifier`
  - _Requirements: FR-9, FR-10, AC-3.1, AC-3.3, AC-3.6_
  - _Design: `agents/ralph-refactor-specialist.md`_

- [x] 3.2 [GREEN] Pass test: align specialist prompt with structured artifact-only completion
  - **Do**:
    1. Update `agents/ralph-refactor-specialist.md` to limit edits to the selected artifact and to emit the structured completion markers.
    2. Update any coordinator parsing expectations in `refactor.ts` or `index.ts` to match the contract wording.
  - **Files**: `agents/ralph-refactor-specialist.md`, `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The specialist-contract verifier passes.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case specialist-contract`
  - **Commit**: `feat(refactor): green - align specialist contract`
  - _Requirements: FR-9, FR-10, AC-3.1, AC-3.3, AC-3.6_
  - _Design: specialist agent; completion parser_

- [x] 3.3 [YELLOW] Refactor: tighten specialist examples and completion parsing notes
  - **Do**:
    1. Simplify prompt wording and examples so the bounded contract is explicit and hard to misuse.
    2. Keep the completion markers stable for verifier assertions.
  - **Files**: `agents/ralph-refactor-specialist.md`, `extensions/ralph-specum/refactor.ts`
  - **Done when**: The prompt is clearer, the parser assumptions are documented, and the specialist-contract verifier stays green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case specialist-contract`
  - **Commit**: `refactor(refactor): yellow - polish specialist protocol`
  - _Requirements: FR-9, FR-10, AC-3.1, AC-3.3, AC-3.6_
  - _Design: specialist contract; `refactor.ts` completion parser_

- [x] Q5 [VERIFY] Quality check: specialist protocol verifier
  - **Do**:
    1. Run the verifier covering the research `fixture/state smoke` contract for structured specialist completion.
  - **Files**: None
  - **Done when**: The specialist-contract verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case specialist-contract`
  - **Commit**: `chore(refactor): pass specialist contract checkpoint` (if fixes needed)
  - _Requirements: FR-9, FR-10, FR-15, AC-3.1, AC-3.3, AC-3.6, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs`_

## Phase 6: Request payload shape and allowed-files scoping

- [x] 3.4 [RED] Failing verifier: `RefactorRequestV1` payload and allowed-files scope
  - **Do**:
    1. Add a `request-payload` case to `scripts/verify-refactor-parity.mjs` with a request-capture stub.
    2. Assert the coordinator sends `{ spec, files, sections, progressLearnings, cascadePolicy, allowedFiles }` and that `allowedFiles` contains only in-scope artifact paths.
  - **Files**: `scripts/verify-refactor-parity.mjs`
  - **Done when**: The verifier fails because the request payload or `allowedFiles` scoping is not yet fully implemented.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case request-payload 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add request payload verifier`
  - _Requirements: FR-4, FR-8, FR-9, AC-3.1, AC-3.2, AC-3.6_
  - _Design: `RefactorRequestV1`; coordinator delegation flow_

- [x] 3.5 [GREEN] Pass test: build bounded request payloads and dispatch one artifact at a time
  - **Do**:
    1. Implement `RefactorRequestV1` construction from the selected-file plan.
    2. Populate `allowedFiles` with only the current artifact path.
    3. Dispatch one specialist run per selected artifact step.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The request-payload verifier passes.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case request-payload`
  - **Commit**: `feat(refactor): green - send bounded specialist requests`
  - _Requirements: FR-4, FR-8, FR-9, AC-3.1, AC-3.2, AC-3.6_
  - _Design: `extensions/ralph-specum/refactor.ts`; `extensions/ralph-specum/index.ts`_

- [x] 3.6 [YELLOW] Refactor: isolate request builders and scope guards
  - **Do**:
    1. Extract request-building and allowed-file helper functions into `refactor.ts`.
    2. Keep the handler orchestration focused on sequencing rather than payload assembly.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Request assembly is reusable and the request-payload verifier remains green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case request-payload`
  - **Commit**: `refactor(refactor): yellow - extract request builders`
  - _Requirements: FR-4, FR-8, FR-9, AC-3.1, AC-3.2, AC-3.6_
  - _Design: `extensions/ralph-specum/refactor.ts` deep module_

- [x] Q6 [VERIFY] Quality check: bounded request verifier
  - **Do**:
    1. Run the verifier implementing the research `fixture/state smoke` tooling row for request capture and allowed-files containment.
  - **Files**: None
  - **Done when**: The request-payload verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case request-payload`
  - **Commit**: `chore(refactor): pass request payload checkpoint` (if fixes needed)
  - _Requirements: FR-4, FR-8, FR-9, FR-15, AC-3.1, AC-3.2, AC-3.6, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs`_

## Phase 7: Completion validation and unauthorized-edit auditing

- [x] 4.1 [RED] Failing verifier: reject missing markers and unauthorized spec edits
  - **Do**:
    1. Add an `audit-rollback` case to `scripts/verify-refactor-parity.mjs` with malformed specialist output and unauthorized file mutations.
    2. Assert the coordinator rejects missing completion markers and restores unauthorized spec-directory edits before progress/state writes.
  - **Files**: `scripts/verify-refactor-parity.mjs`
  - **Done when**: The verifier fails because completion validation and rollback/audit logic are incomplete.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case audit-rollback 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add audit and rollback verifier`
  - _Requirements: FR-9, FR-10, AC-3.3, AC-3.6_
  - _Design: completion parser; allowed-file audit_

- [x] 4.2 [GREEN] Pass test: validate completion output and restore unauthorized changes
  - **Do**:
    1. Require valid completion markers before treating a specialist run as successful.
    2. Snapshot the selected spec directory and reject/restore unauthorized mutations outside `allowedFiles`.
    3. Skip coordinator-owned progress/state updates on failed validation paths.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The audit-rollback verifier passes.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case audit-rollback`
  - **Commit**: `feat(refactor): green - validate completion and audit file scope`
  - _Requirements: FR-9, FR-10, AC-3.3, AC-3.6_
  - _Design: audit layer; `refactor.ts` completion parsing_

- [x] 4.3 [YELLOW] Refactor: isolate snapshot, diff, and error-report helpers
  - **Do**:
    1. Extract snapshot/diff helpers and user-facing failure messages into reusable functions.
    2. Keep unauthorized-edit recovery deterministic for the verifier fixtures.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Audit/rollback helpers are isolated and the audit-rollback verifier stays green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case audit-rollback`
  - **Commit**: `refactor(refactor): yellow - extract audit helpers`
  - _Requirements: FR-9, FR-10, AC-3.3, AC-3.6_
  - _Design: `extensions/ralph-specum/refactor.ts` audit helpers_

- [x] Q7 [VERIFY] Quality check: audit and rollback verifier
  - **Do**:
    1. Run the verifier implementing the research `fixture/state smoke` row for unauthorized-edit detection and bounded recovery.
  - **Files**: None
  - **Done when**: The audit-rollback verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case audit-rollback`
  - **Commit**: `chore(refactor): pass audit checkpoint` (if fixes needed)
  - _Requirements: FR-9, FR-10, FR-15, AC-3.3, AC-3.6, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs`_

## Phase 8: Cascade handling

- [x] 4.4 [RED] Failing verifier: approved and rejected cascades are handled deliberately
  - **Do**:
    1. Add a `cascade-handling` case to `scripts/verify-refactor-parity.mjs` with interactive approval and rejection fixtures.
    2. Assert approved requirements→design cascades run as a second bounded step and rejected cascades are logged without downstream edits.
  - **Files**: `scripts/verify-refactor-parity.mjs`
  - **Done when**: The verifier fails because cascade approval/logging behavior is incomplete.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case cascade-handling 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add cascade handling verifier`
  - _Requirements: FR-11, AC-3.4, AC-3.5_
  - _Design: sequential cascade flow; coordinator prompts_

- [ ] 4.5 [GREEN] Pass test: implement downstream approve/skip cascade flow
  - **Do**:
    1. Prompt for downstream handling when the specialist signals a cascade.
    2. Run approved cascades as separate artifact-scoped refactor steps.
    3. Keep rejected/skipped cascades from mutating downstream files.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/refactor.ts`
  - **Done when**: The cascade-handling verifier passes for approved and rejected cascade paths.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case cascade-handling`
  - **Commit**: `feat(refactor): green - add cascade approval flow`
  - _Requirements: FR-11, AC-3.4, AC-3.5_
  - _Design: coordinator cascade sequencing; bounded downstream steps_

- [ ] 4.6 [YELLOW] Refactor: centralize cascade decisions and absent-downstream handling
  - **Do**:
    1. Extract cascade decision and missing-downstream-artifact handling into focused helpers.
    2. Ensure the same helper emits consistent log text for skip/reject outcomes.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Cascade helpers are centralized and the cascade-handling verifier stays green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case cascade-handling`
  - **Commit**: `refactor(refactor): yellow - extract cascade helpers`
  - _Requirements: FR-11, AC-3.4, AC-3.5_
  - _Design: `extensions/ralph-specum/refactor.ts`; coordinator cascade flow_

- [ ] Q8 [VERIFY] Quality check: cascade verifier
  - **Do**:
    1. Run the verifier implementing the research `fixture/state smoke` tooling row for approved/rejected cascade behavior.
  - **Files**: None
  - **Done when**: The cascade-handling verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case cascade-handling`
  - **Commit**: `chore(refactor): pass cascade checkpoint` (if fixes needed)
  - _Requirements: FR-11, FR-15, AC-3.4, AC-3.5, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs`_

## Phase 9: State, progress, and task-mirror invariants

- [ ] 5.1 [RED] Failing verifier: state merge, progress summaries, and task-index reset rules
  - **Do**:
    1. Add a `state-merge` case to `scripts/verify-refactor-parity.mjs` using temp state/progress fixtures.
    2. Assert preserved metadata survives merges, direct updates and skipped cascades append progress summaries, and `taskIndex` resets only when `tasks.md` changes.
  - **Files**: `scripts/verify-refactor-parity.mjs`
  - **Done when**: The verifier fails because state/progress invariants are not yet fully implemented.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case state-merge 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add state merge verifier`
  - _Requirements: FR-12, FR-13, FR-14, AC-4.1, AC-4.2, AC-4.3, AC-4.4_
  - _Design: coordinator state/progress layer; native task mirror_

- [ ] 5.2 [GREEN] Pass test: merge state safely and append progress outcomes
  - **Do**:
    1. Use existing atomic state/progress helpers for coordinator-owned writes.
    2. Preserve required metadata fields during merges.
    3. Reset `taskIndex` and rerun native task mirroring only when `tasks.md` changes.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/refactor.ts`
  - **Done when**: The state-merge verifier passes.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case state-merge`
  - **Commit**: `feat(refactor): green - merge state and progress safely`
  - _Requirements: FR-12, FR-13, FR-14, AC-4.1, AC-4.2, AC-4.3, AC-4.4_
  - _Design: `state.ts` integration; existing task-mirror helpers_

- [ ] 5.3 [YELLOW] Refactor: isolate coordinator-owned write summaries and task reset logic
  - **Do**:
    1. Extract summary-entry formatting and task-reset decisions into helpers.
    2. Keep the merge path deterministic for fixture assertions.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: State/progress write logic is isolated and the state-merge verifier remains green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case state-merge`
  - **Commit**: `refactor(refactor): yellow - extract state update helpers`
  - _Requirements: FR-12, FR-13, FR-14, AC-4.1, AC-4.2, AC-4.3, AC-4.4_
  - _Design: coordinator state/progress layer_

- [ ] Q9 [VERIFY] Quality check: state and progress verifier
  - **Do**:
    1. Run the verifier implementing the research `fixture/state smoke` row for state merge, progress append, and task reset invariants.
  - **Files**: None
  - **Done when**: The state-merge verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case state-merge`
  - **Commit**: `chore(refactor): pass state merge checkpoint` (if fixes needed)
  - _Requirements: FR-12, FR-13, FR-14, FR-15, AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs`_

## Phase 10: Local commit-only behavior

- [ ] 5.4 [RED] Failing verifier: `commitSpec` creates one local commit and never pushes
  - **Do**:
    1. Add a `commit-spec` case to `scripts/verify-refactor-parity.mjs` with a temp git fixture.
    2. Assert `commitSpec=true` creates exactly one local commit scoped to the selected spec directory and `commitSpec=false` creates no commit; assert `git push` is never invoked.
  - **Files**: `scripts/verify-refactor-parity.mjs`
  - **Done when**: The verifier fails because local-commit/no-push behavior is not yet fully implemented.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case commit-spec 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add commitSpec verifier`
  - _Requirements: FR-16, FR-17, AC-4.5, AC-4.6_
  - _Design: optional local git commit flow_

- [ ] 5.5 [GREEN] Pass test: implement local commit-only git flow
  - **Do**:
    1. Add the optional local commit path after successful coordinator-owned updates.
    2. Scope the commit to the selected spec directory changes only.
    3. Ensure no `git push` or remote git write path exists.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/refactor.ts`
  - **Done when**: The commit-spec verifier passes for both `commitSpec=true` and `commitSpec=false` cases.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case commit-spec`
  - **Commit**: `feat(refactor): green - add local commit only behavior`
  - _Requirements: FR-16, FR-17, AC-4.5, AC-4.6_
  - _Design: local git commit flow; no-push guard_

- [ ] 5.6 [YELLOW] Refactor: isolate git side-effect helpers and warnings
  - **Do**:
    1. Extract commit-scoping and warning helpers so git behavior stays explicit and easy to verify.
    2. Keep remote-write prevention documented in the helper surface.
  - **Files**: `extensions/ralph-specum/refactor.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Git side-effect helpers are isolated and the commit-spec verifier remains green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case commit-spec`
  - **Commit**: `refactor(refactor): yellow - extract git helpers`
  - _Requirements: FR-16, FR-17, AC-4.5, AC-4.6_
  - _Design: local git helper surface_

- [ ] Q10 [VERIFY] Quality check: commitSpec verifier
  - **Do**:
    1. Run the temp-git verifier implementing the research `fixture/state smoke` recommendation for local commit/no-push behavior.
  - **Files**: None
  - **Done when**: The commit-spec verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case commit-spec`
  - **Commit**: `chore(refactor): pass git behavior checkpoint` (if fixes needed)
  - _Requirements: FR-15, FR-16, FR-17, AC-4.5, AC-4.6, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs`_

## Phase 11: Package verification wiring

- [ ] 6.1 [RED] Failing verifier: package entrypoints do not yet enforce refactor parity coverage
  - **Do**:
    1. Add a `package-wiring` case to `scripts/verify-refactor-parity.mjs`.
    2. Assert `package.json` wires the refactor verifier into the discovered package verification entrypoints without inventing a new framework.
  - **Files**: `scripts/verify-refactor-parity.mjs`, `package.json`
  - **Done when**: The verifier fails because package verification wiring is not yet complete.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case package-wiring 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(refactor): red - add package wiring verifier`
  - _Requirements: FR-15, AC-5.1, AC-5.2_
  - _Design: `scripts/verify-refactor-parity.mjs`; `package.json`_

- [ ] 6.2 [GREEN] Pass test: wire refactor verifier into discovered package verification commands
  - **Do**:
    1. Update `package.json` so the dedicated refactor verifier runs through the discovered verification entrypoints.
    2. Add acceptance and cleanup cases to `scripts/verify-refactor-parity.mjs` for final bundle coverage.
  - **Files**: `package.json`, `scripts/verify-refactor-parity.mjs`
  - **Done when**: The package-wiring verifier passes and the refactor verifier exposes `acceptance-checklist` and `cleanup` cases.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case package-wiring`
  - **Commit**: `feat(refactor): green - wire verifier into package checks`
  - _Requirements: FR-15, AC-5.1, AC-5.2_
  - _Design: package verification wiring; dedicated verifier script_

- [ ] 6.3 [YELLOW] Refactor: align verifier structure with existing parity-script conventions
  - **Do**:
    1. Normalize case parsing, cleanup handling, and summary output to match the existing repository verifier style.
    2. Keep acceptance-case names stable for final quality gates.
  - **Files**: `scripts/verify-refactor-parity.mjs`
  - **Done when**: The verifier is structurally consistent with existing parity scripts and the package-wiring verifier remains green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case package-wiring`
  - **Commit**: `refactor(refactor): yellow - normalize verifier structure`
  - _Requirements: FR-15, AC-5.1, AC-5.2_
  - _Design: `scripts/verify-refactor-parity.mjs`_

- [ ] Q11 [VERIFY] Quality check: package wiring verifier
  - **Do**:
    1. Run the verifier implementing the research `fixture/state smoke` tooling row plus the discovered package verification wiring check.
  - **Files**: None
  - **Done when**: The package-wiring verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case package-wiring`
  - **Commit**: `chore(refactor): pass package wiring checkpoint` (if fixes needed)
  - _Requirements: FR-15, AC-5.1, AC-5.2_
  - _Design: `scripts/verify-refactor-parity.mjs`; `package.json`_

## Phase 12: End-to-end verification and final gates

- [ ] VE1 [VERIFY] Package verification startup/build proxy
  - **Do**:
    1. Use the research `Quality Commands` row `verify = npm run prepack` as the library-package startup/build proxy because no separate build or E2E runner was discovered.
  - **Files**: None
  - **Done when**: The discovered package verification bundle exits `0` with the refactor verifier wired in.
  - **Verify**: `npm run prepack`
  - **Commit**: None
  - _Requirements: FR-15, AC-5.2_
  - _Design: package verification wiring_

- [ ] VE2 [VERIFY] Refactor parity fixture acceptance flow
  - **Do**:
    1. Run the dedicated Node verifier implementing the research `fixture/state smoke` and `headless-failure smoke` tooling rows to exercise configured-root resolution, headless stop, bounded delegation, cascades, state merge, and commit behavior together.
  - **Files**: None
  - **Done when**: The acceptance-case verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case acceptance-checklist`
  - **Commit**: None
  - _Requirements: FR-15, AC-5.1, AC-5.2_
  - _Design: `scripts/verify-refactor-parity.mjs` acceptance bundle_

- [ ] VE3 [VERIFY] Refactor parity fixture cleanup
  - **Do**:
    1. Run the verifier cleanup case so temp spec roots and temp git fixtures prove they are removed after acceptance coverage.
  - **Files**: None
  - **Done when**: The cleanup-case verifier exits `0`.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case cleanup`
  - **Commit**: None
  - _Requirements: FR-15, AC-5.1_
  - _Design: `scripts/verify-refactor-parity.mjs` cleanup path_

- [ ] V4 [VERIFY] Full local CI
  - **Do**:
    1. Run all discovered package verification commands after the refactor verifier is wired into the package bundle.
  - **Files**: None
  - **Done when**: The discovered verification command set exits `0`.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(refactor): pass full local verification` (if fixes needed)
  - _Requirements: FR-15, AC-5.2_
  - _Design: package verification wiring_

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Re-run the discovered package verification bundle as the repo's CI-equivalent gate because research found no `.github/workflows` pipeline to invoke separately.
  - **Files**: None
  - **Done when**: The CI-equivalent command set exits `0`.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(refactor): confirm ci-equivalent verification` (if fixes needed)
  - _Requirements: FR-15, AC-5.2_
  - _Design: package verification wiring; repo verification policy_

- [ ] V6 [VERIFY] AC checklist
  - **Do**:
    1. Run the acceptance-case verifier that bundles the command registration, scope, headless, cascade, state, and git assertions mapped to the approved acceptance criteria.
  - **Files**: None
  - **Done when**: The acceptance-checklist verifier exits `0` and the package verification bundle remains green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case acceptance-checklist && npm run prepack`
  - **Commit**: None
  - _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17; AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-1.5, AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-3.1, AC-3.2, AC-3.3, AC-3.4, AC-3.5, AC-3.6, AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5, AC-4.6, AC-5.1, AC-5.2_
  - _Design: end-to-end coordinator plus verifier bundle_

## Unresolved Questions
- None blocking. Assumption: because research found no dedicated repo CI workflow, `V5` uses the discovered package verification bundle as the CI-equivalent gate.

## Notes
- Workflow assumption: `REFACTOR` intent inferred from command-parity work inside an existing extension package, so the plan uses TDD Red-Green-Yellow rather than GREENFIELD POC-first.
- POC shortcuts: None.
- Production TODOs: revisit a future non-interactive section-policy flag only if a later spec approves behavior beyond the current headless safe-stop contract.
- Guardrail: do not edit legacy plugin files; keep all runtime changes inside the Pi package paths listed in design.
