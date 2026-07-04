# Tasks: triage-github-sync-parity

## Phase 1: Minimal epic-state compatibility

- [x] 1.1 [RED] Failing test: original minimal epic state loads as a compatible subset
  - **Do**:
    1. Create `minimal-state-load` verifier case for an original minimal `.epic-state.json` fixture.
    2. Assert normalized output preserves `name`, `goal`, child order, dependency order, and child statuses.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails because current epic-state reads do not normalize original minimal fixtures.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-load 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(epics): red - failing test for minimal epic state load`
  - _Requirements: FR-1, AC-1.1_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/epics.ts` compatibility boundary_

- [x] 1.2 [GREEN] Pass test: normalize original minimal epic state on read
  - **Do**:
    1. Add shared compatible-read normalization in `extensions/ralph-specum/epics.ts`.
    2. Derive missing Pi fields in memory without dropping original-compatible fields or child dependency/status data.
  - **Files**: `extensions/ralph-specum/epics.ts`
  - **Done when**: Minimal fixture reads as normalized `EpicStateV1` and `minimal-state-load` passes.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-load`
  - **Commit**: `feat(epics): green - normalize minimal epic state on read`
  - _Requirements: FR-1, AC-1.1_
  - _Design: `extensions/ralph-specum/epics.ts` compatibility boundary_

- [x] 1.3 [YELLOW] Refactor: extract reusable compatible epic-state helpers
  - **Do**:
    1. Extract helper names/types for raw-read, normalize, and warning collection paths.
    2. Keep runtime behavior unchanged while reducing triage-local branching.
  - **Files**: `extensions/ralph-specum/epics.ts`
  - **Done when**: Compatibility read path is reusable by other epic consumers and `minimal-state-load` stays green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-load`
  - **Commit**: `refactor(epics): yellow - extract compatibility read helpers`
  - _Requirements: FR-1_
  - _Design: `extensions/ralph-specum/epics.ts` compatibility boundary_

- [x] P1V1 [VERIFY] Compatibility checkpoint: minimal load triplet
  - **Do**:
    1. Re-run the targeted `minimal-state-load` verifier case immediately after the first TDD triplet.
  - **Files**: None
  - **Done when**: `minimal-state-load` exits 0 before the repair/save triplet begins.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-load`
  - **Commit**: `chore(verify): pass minimal-load checkpoint`
  - _Requirements: FR-1; AC-1.1_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`_

- [x] 1.4 [RED] Failing test: repair/save backfills Pi-required epic-state fields
  - **Do**:
    1. Add `minimal-state-repair` verifier case.
    2. Assert repair/save adds `schemaVersion`, path fields, timestamps, and `validation` without deleting original-compatible fields.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails for the expected missing-field reason.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-repair 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(epics): red - failing test for minimal epic state repair`
  - _Requirements: FR-2, AC-1.2_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/epics.ts` compatibility boundary_

- [x] 1.5 [GREEN] Pass test: repair/write rich epic state without destructive migration
  - **Do**:
    1. Update repair/write paths to persist Pi-required fields only on save/repair.
    2. Preserve original-compatible fields, child statuses, and dependency lists.
  - **Files**: `extensions/ralph-specum/epics.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: `minimal-state-repair` passes and persisted state matches the documented superset contract.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-repair`
  - **Commit**: `feat(epics): green - repair minimal epic state into rich contract`
  - _Requirements: FR-2, AC-1.2_
  - _Design: `extensions/ralph-specum/epics.ts` compatibility boundary; `extensions/ralph-specum/index.ts` triage coordinator_

- [x] 1.6 [YELLOW] Refactor: isolate repair/write compatibility warnings
  - **Do**:
    1. Centralize compatibility-warning generation for read vs save paths.
    2. Keep non-destructive read semantics intact.
  - **Files**: `extensions/ralph-specum/epics.ts`
  - **Done when**: Read and repair paths share one warning contract and prior cases remain green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-load && node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-repair`
  - **Commit**: `refactor(epics): yellow - isolate repair warning logic`
  - _Requirements: FR-1, FR-2_
  - _Design: `extensions/ralph-specum/epics.ts` compatibility boundary_

- [x] V1 [VERIFY] Compatibility checkpoint: minimal load + repair
  - **Do**:
    1. Run the targeted compatibility verifier cases from `scripts/verify-triage-github-sync-parity.mjs`.
  - **Files**: None
  - **Done when**: Both minimal-state cases exit 0.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-load && node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-repair`
  - **Commit**: `chore(verify): pass minimal-state compatibility checkpoint`
  - _Requirements: FR-1, FR-2; AC-1.1, AC-1.2_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`_

- [x] 1.7 [RED] Failing test: validation runs after normalization, not before
  - **Do**:
    1. Add `minimal-state-validation-boundary` verifier case.
    2. Assert original minimal fixtures produce compatibility warnings instead of an immediate strict-validation failure.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails because current validation still rejects the fixture too early.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-validation-boundary 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(epics): red - failing test for validation boundary`
  - _Requirements: FR-1, AC-1.3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/epics.ts` compatibility boundary_

- [x] 1.8 [GREEN] Pass test: validate normalized epic state with compatibility warnings
  - **Do**:
    1. Route triage reads through the compatible-read helper before strict validation.
    2. Persist compatibility warnings under `validation.compatibilityWarnings`.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/epics.ts`
  - **Done when**: Original minimal fixtures normalize, validate, and emit warnings instead of blocking immediately.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-validation-boundary`
  - **Commit**: `feat(triage): green - validate only after epic-state normalization`
  - _Requirements: FR-1, FR-8; AC-1.3_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator; `extensions/ralph-specum/epics.ts` compatibility boundary_

- [x] 1.9 [YELLOW] Refactor: tighten compatibility warning serialization
  - **Do**:
    1. Standardize warning text and storage shape for normalized epic reads.
    2. Keep all phase-1 verifier cases green.
  - **Files**: `extensions/ralph-specum/epics.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Warning output is deterministic and compatibility cases remain green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-load && node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-repair && node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-validation-boundary`
  - **Commit**: `refactor(epics): yellow - stabilize compatibility warning output`
  - _Requirements: FR-1, FR-2, FR-8_
  - _Design: `extensions/ralph-specum/epics.ts`; `extensions/ralph-specum/index.ts`_

- [x] V2 [VERIFY] Compatibility checkpoint: validation boundary
  - **Do**:
    1. Re-run the compatibility boundary case after the refactor.
  - **Files**: None
  - **Done when**: Validation-boundary case exits 0.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case minimal-state-validation-boundary`
  - **Commit**: `chore(verify): pass validation-boundary checkpoint`
  - _Requirements: FR-1, AC-1.3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`_

## Phase 2: Output-mode parity

- [x] 2.1 [RED] Failing test: `spec-files` output writes child spec artifacts only
  - **Do**:
    1. Add `output-spec-files` verifier case.
    2. Assert child spec artifacts are written and mocked `gh issue create/edit` call count stays 0.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails for the current output-mode behavior.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-spec-files 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(triage): red - failing test for spec-files output`
  - _Requirements: FR-3, AC-2.1_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/index.ts` triage coordinator_

- [x] 2.1.1 Regression test: `spec-files` output writes child spec artifacts only
  - **Do**:
    1. Add `output-spec-files` verifier case.
    2. Assert child spec artifacts are written and mocked `gh issue create/edit` call count stays 0.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and passes against the current runtime behavior.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-spec-files`
  - **Commit**: `test(triage): cover spec-files output parity`

- [x] 2.2 [GREEN] Pass test: keep `spec-files` output off the GitHub path
  - **Do**:
    1. Ensure `spec-files` output skips GitHub sync entirely.
    2. Keep epic and child file materialization intact.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: `output-spec-files` passes with child files present and remote call count 0.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-spec-files`
  - **Commit**: `feat(triage): green - preserve spec-files output behavior`
  - _Requirements: FR-3, AC-2.1_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator_

- [x] 2.3 [YELLOW] Refactor: isolate materialization gating by output mode
  - **Do**:
    1. Extract or tighten output-mode predicates around GitHub sync and child materialization.
    2. Keep behavior unchanged.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Output-mode branching is easier to follow and `output-spec-files` stays green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-spec-files`
  - **Commit**: `refactor(triage): yellow - isolate spec-files gating`
  - _Requirements: FR-3_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator_

- [x] P2V1 [VERIFY] Output-mode checkpoint: `spec-files` triplet
  - **Do**:
    1. Re-run the targeted `output-spec-files` verifier case immediately after the first output-mode triplet.
  - **Files**: None
  - **Done when**: `output-spec-files` exits 0 before `github-issues` work starts.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-spec-files`
  - **Commit**: `chore(verify): pass spec-files output checkpoint`
  - _Requirements: FR-3; AC-2.1_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`_

- [x] 2.4 [RED] Failing test: `github-issues` output creates no child spec directories
  - **Do**:
    1. Add `output-github-issues` verifier case.
    2. Assert mocked GitHub sync runs while child spec directory creation count stays 0.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails for the expected child-directory side effect.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-github-issues 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(triage): red - failing test for github-issues output`
  - _Requirements: FR-3, FR-4; AC-2.2_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/index.ts` triage coordinator_

- [x] 2.4.1 Regression test: `github-issues` output skips child spec directories while syncing GitHub
  - **Do**:
    1. Add an `output-github-issues` verifier case to `scripts/verify-triage-github-sync-parity.mjs`.
    2. Seed a triage fixture whose output is `github-issues` and a fake `gh` binary that records `issue create/edit` calls.
    3. Assert mocked GitHub sync runs while the created child spec directory count remains 0.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: `output-github-issues` exists and passes with mocked GitHub sync evidence plus 0 child spec directories created.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-github-issues`
  - **Commit**: `test(triage): cover github-issues output parity`

- [x] 2.5 [GREEN] Pass test: disable child materialization for `github-issues`
  - **Do**:
    1. Keep GitHub sync active for `github-issues` output.
    2. Prevent child spec materialization on that path.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: `output-github-issues` passes with remote sync metadata and 0 child spec directories created.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-github-issues`
  - **Commit**: `feat(triage): green - block child dirs for github-issues output`
  - _Requirements: FR-3, FR-4; AC-2.2_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator_

- [x] 2.6 [YELLOW] Refactor: consolidate output-mode branching
  - **Do**:
    1. Remove duplicated mode checks across sync and materialization paths.
    2. Preserve `spec-files` and `github-issues` behavior.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Output-mode flow is centralized and prior output-mode cases remain green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-spec-files && node scripts/verify-triage-github-sync-parity.mjs --case output-github-issues`
  - **Commit**: `refactor(triage): yellow - consolidate output mode branches`
  - _Requirements: FR-3, FR-4_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator_

- [ ] V3 [VERIFY] Output-mode checkpoint: `spec-files` + `github-issues`
  - **Do**:
    1. Run the targeted output-mode verifier cases.
  - **Files**: None
  - **Done when**: Both targeted output-mode cases exit 0.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-spec-files && node scripts/verify-triage-github-sync-parity.mjs --case output-github-issues`
  - **Commit**: `chore(verify): pass output-mode checkpoint`
  - _Requirements: FR-3, FR-4; AC-2.1, AC-2.2_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`_

- [ ] 2.7 [RED] Failing test: `both` output cross-links child plans and issue metadata
  - **Do**:
    1. Add `output-both` verifier case.
    2. Assert child `plan.md` stubs include GitHub references only after confirmed sync metadata exists.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails because current `both` flow is incomplete or misordered.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-both 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(triage): red - failing test for both output cross-links`
  - _Requirements: FR-3, FR-5; AC-2.3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/index.ts` triage coordinator_

- [ ] 2.8 [GREEN] Pass test: sync GitHub before materializing `both` output
  - **Do**:
    1. Preserve GitHub-before-materialization ordering for `both`.
    2. Persist epic and child issue refs back into state before writing child plan stubs.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: `output-both` passes with persisted issue refs and child plan cross-links.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-both`
  - **Commit**: `feat(triage): green - cross-link both output after sync`
  - _Requirements: FR-3, FR-5; AC-2.3_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator_

- [ ] 2.9 [YELLOW] Refactor: clean child plan GitHub-link rendering
  - **Do**:
    1. Tighten plan-stub rendering so confirmed refs and no-ref cases are explicit.
    2. Keep all output-mode cases green.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Cross-link rendering is deterministic and output-mode verifier cases remain green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-spec-files && node scripts/verify-triage-github-sync-parity.mjs --case output-github-issues && node scripts/verify-triage-github-sync-parity.mjs --case output-both`
  - **Commit**: `refactor(triage): yellow - clean child plan link rendering`
  - _Requirements: FR-3, FR-5_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator_

- [ ] Q1 [VERIFY] Output-mode checkpoint: `both` end-to-end fixture flow
  - **Do**:
    1. Re-run the `both` fixture case after the output-mode refactor.
  - **Files**: None
  - **Done when**: `output-both` exits 0.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case output-both`
  - **Commit**: `chore(verify): pass both-output checkpoint`
  - _Requirements: FR-3, FR-5; AC-2.3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`_

## Phase 3: GitHub sync safety and idempotency

- [ ] 3.1 [RED] Failing test: unconfirmed GitHub sync records skip and performs no remote writes
  - **Do**:
    1. Add `github-unconfirmed` verifier case.
    2. Assert headless runs without `--yes` and interactive cancellation perform 0 mocked `gh issue create/edit` calls and record a skipped reason.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails for the current confirmation behavior.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-unconfirmed 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(github): red - failing test for unconfirmed sync skip`
  - _Requirements: FR-6, FR-8; AC-3.1_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/github.ts`; `extensions/ralph-specum/index.ts`_

- [ ] 3.2 [GREEN] Pass test: block remote writes until confirmation
  - **Do**:
    1. Keep dry-run planning separate from execution.
    2. Persist skipped/confirmation-needed metadata when sync is not confirmed.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/github.ts`
  - **Done when**: `github-unconfirmed` passes with 0 remote writes and deterministic skipped metadata.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-unconfirmed && grep -n 'Confirm GitHub issue writes\|no GitHub issues were created' extensions/ralph-specum/index.ts`
  - **Commit**: `feat(github): green - require confirmation before issue writes`
  - _Requirements: FR-6, FR-8; AC-3.1_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator; `extensions/ralph-specum/github.ts` GitHub sync helper_

- [ ] 3.3 [YELLOW] Refactor: consolidate skipped-sync metadata persistence
  - **Do**:
    1. Centralize skipped-reason and confirmation outcome mapping.
    2. Preserve unconfirmed behavior.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Skip-state persistence is deterministic and `github-unconfirmed` stays green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-unconfirmed`
  - **Commit**: `refactor(github): yellow - consolidate skipped sync metadata`
  - _Requirements: FR-6, FR-8_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator_

- [ ] P3V1 [VERIFY] GitHub checkpoint: unconfirmed-sync triplet
  - **Do**:
    1. Re-run the targeted `github-unconfirmed` verifier case immediately after the first GitHub safety triplet.
    2. Keep the source-inspection guard in the implementation task; this checkpoint stays runtime-focused.
  - **Files**: None
  - **Done when**: `github-unconfirmed` exits 0 before confirmed-create work begins.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-unconfirmed`
  - **Commit**: `chore(verify): pass unconfirmed GitHub sync checkpoint`
  - _Requirements: FR-6, FR-8; AC-3.1_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`_

- [ ] 3.4 [RED] Failing test: confirmed sync creates issues with metadata comment and persists epic refs
  - **Do**:
    1. Add `github-confirmed-create` verifier case.
    2. Assert mocked `gh issue create` includes the HTML metadata comment and persisted epic `issueNumber`, `issueUrl`, and `githubStatus`.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails because current create-path persistence is incomplete.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-confirmed-create 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(github): red - failing test for confirmed issue create`
  - _Requirements: FR-6, FR-7, FR-8; AC-3.2_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/github.ts`; `extensions/ralph-specum/index.ts`_

- [ ] 3.5 [GREEN] Pass test: persist epic GitHub refs from confirmed create
  - **Do**:
    1. Persist top-level epic GitHub fields plus nested sync summary/result metadata after confirmed create.
    2. Keep the HTML metadata comment in the issue body for idempotent lookup.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/github.ts`
  - **Done when**: `github-confirmed-create` passes and persisted state contains the required epic GitHub fields.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-confirmed-create && grep -n 'ralph-specum:' extensions/ralph-specum/github.ts`
  - **Commit**: `feat(github): green - persist confirmed epic issue refs`
  - _Requirements: FR-6, FR-7, FR-8; AC-3.2_
  - _Design: `extensions/ralph-specum/github.ts` GitHub sync helper; `extensions/ralph-specum/index.ts` triage coordinator_

- [ ] 3.6 [YELLOW] Refactor: extract sync-result mapping into one state updater
  - **Do**:
    1. Reduce duplicate issue-result to epic-state mapping logic.
    2. Preserve create-path behavior.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: One mapping path handles epic GitHub metadata updates and prior GitHub cases stay green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-unconfirmed && node scripts/verify-triage-github-sync-parity.mjs --case github-confirmed-create`
  - **Commit**: `refactor(github): yellow - extract sync result mapper`
  - _Requirements: FR-6, FR-8_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator_

- [ ] Q2 [VERIFY] GitHub checkpoint: confirmation gate + confirmed create
  - **Do**:
    1. Run the targeted GitHub verifier cases after the create-path refactor.
  - **Files**: None
  - **Done when**: `github-unconfirmed` and `github-confirmed-create` both exit 0.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-unconfirmed && node scripts/verify-triage-github-sync-parity.mjs --case github-confirmed-create`
  - **Commit**: `chore(verify): pass GitHub confirmation checkpoint`
  - _Requirements: FR-6, FR-7, FR-8; AC-3.1, AC-3.2_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`_

- [ ] 3.7 [RED] Failing test: metadata lookup updates an existing issue instead of duplicating it
  - **Do**:
    1. Add `github-metadata-update` verifier case.
    2. Assert absent state `issueNumber` plus existing HTML comment in listed issue bodies chooses update instead of create.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails because current lookup precedence is insufficient.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-metadata-update 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(github): red - failing test for metadata lookup update`
  - _Requirements: FR-7, AC-3.3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/github.ts` GitHub sync helper_

- [ ] 3.8 [GREEN] Pass test: prefer metadata-comment lookup before duplicate creation
  - **Do**:
    1. Preserve state `issueNumber` as first choice.
    2. Fall back to metadata-comment body lookup before any create path.
  - **Files**: `extensions/ralph-specum/github.ts`
  - **Done when**: `github-metadata-update` passes and no duplicate create call occurs.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-metadata-update && grep -n 'ralph-specum:' extensions/ralph-specum/github.ts`
  - **Commit**: `feat(github): green - update existing issues via metadata lookup`
  - _Requirements: FR-7, AC-3.3_
  - _Design: `extensions/ralph-specum/github.ts` GitHub sync helper_

- [ ] 3.9 [YELLOW] Refactor: clarify issue-number precedence rules
  - **Do**:
    1. Isolate state-first vs metadata-fallback lookup helpers.
    2. Preserve create/update behavior.
  - **Files**: `extensions/ralph-specum/github.ts`
  - **Done when**: Lookup precedence is explicit and `github-confirmed-create` plus `github-metadata-update` stay green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-confirmed-create && node scripts/verify-triage-github-sync-parity.mjs --case github-metadata-update`
  - **Commit**: `refactor(github): yellow - clarify issue lookup precedence`
  - _Requirements: FR-7_
  - _Design: `extensions/ralph-specum/github.ts` GitHub sync helper_

- [ ] P3V2 [VERIFY] GitHub checkpoint: metadata-lookup triplet
  - **Do**:
    1. Re-run the targeted `github-metadata-update` verifier case immediately after the metadata-lookup triplet.
  - **Files**: None
  - **Done when**: `github-metadata-update` exits 0 before missing-label handling work begins.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-metadata-update`
  - **Commit**: `chore(verify): pass metadata-lookup checkpoint`
  - _Requirements: FR-7; AC-3.3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`_

- [ ] 3.10 [RED] Failing test: missing GitHub labels are omitted and recorded as warnings
  - **Do**:
    1. Add `github-missing-labels` verifier case.
    2. Assert unavailable labels are omitted from mocked `gh` args and recorded in warnings/metadata without auto-creation.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails for the expected label-handling reason.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-missing-labels 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(github): red - failing test for missing label handling`
  - _Requirements: FR-8, FR-9; AC-3.4_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/github.ts`; `extensions/ralph-specum/index.ts`_

- [ ] 3.11 [GREEN] Pass test: record missing-label warnings without auto-creating labels
  - **Do**:
    1. Keep missing labels out of write args.
    2. Persist aggregate and per-result missing-label metadata in epic state.
  - **Files**: `extensions/ralph-specum/github.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: `github-missing-labels` passes and no label auto-create behavior exists.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-missing-labels`
  - **Commit**: `feat(github): green - record missing labels without auto-create`
  - _Requirements: FR-8, FR-9; AC-3.4_
  - _Design: `extensions/ralph-specum/github.ts` GitHub sync helper; `extensions/ralph-specum/index.ts` triage coordinator_

- [ ] 3.12 [YELLOW] Refactor: stabilize warning aggregation for GitHub sync summaries
  - **Do**:
    1. Consolidate missing-label and skipped/failure warning aggregation.
    2. Preserve all GitHub verifier cases.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/github.ts`
  - **Done when**: GitHub summary warnings are deterministic and all GitHub cases remain green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-unconfirmed && node scripts/verify-triage-github-sync-parity.mjs --case github-confirmed-create && node scripts/verify-triage-github-sync-parity.mjs --case github-metadata-update && node scripts/verify-triage-github-sync-parity.mjs --case github-missing-labels`
  - **Commit**: `refactor(github): yellow - stabilize sync warning aggregation`
  - _Requirements: FR-8, FR-9_
  - _Design: `extensions/ralph-specum/index.ts`; `extensions/ralph-specum/github.ts`_

- [ ] Q3 [VERIFY] GitHub checkpoint: idempotency + label handling
  - **Do**:
    1. Run the metadata-update and missing-label verifier cases together.
  - **Files**: None
  - **Done when**: Both GitHub idempotency cases exit 0.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case github-metadata-update && node scripts/verify-triage-github-sync-parity.mjs --case github-missing-labels`
  - **Commit**: `chore(verify): pass GitHub idempotency checkpoint`
  - _Requirements: FR-7, FR-8, FR-9; AC-3.3, AC-3.4_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`_

## Phase 4: Fresh branch safety and parity docs

- [ ] 4.1 [RED] Failing test: fresh triage records branch safety before any new epic writes
  - **Do**:
    1. Add `fresh-branch-safety` verifier case.
    2. Assert fresh triage records a shared branch decision before new epic materialization.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Verifier case exists and fails because branch safety is not enforced early enough.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case fresh-branch-safety 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(triage): red - failing test for fresh branch safety`
  - _Requirements: FR-10, AC-4.2_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/start-branch.ts`; `extensions/ralph-specum/index.ts`_

- [ ] 4.2 [GREEN] Pass test: reuse shared branch decision helper before fresh writes
  - **Do**:
    1. Call `decideStartBranchBeforeWrites(...)` before fresh epic directory/current-epic/initial-file writes.
    2. Support headless record-only behavior unless `--yes` explicitly allows apply.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/start-branch.ts`
  - **Done when**: `fresh-branch-safety` passes and source inspection shows the shared helper import/call site in triage.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case fresh-branch-safety && grep -n 'decideStartBranchBeforeWrites' extensions/ralph-specum/index.ts`
  - **Commit**: `feat(triage): green - enforce branch safety before fresh writes`
  - _Requirements: FR-10, AC-4.1, AC-4.2_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator; `extensions/ralph-specum/start-branch.ts` shared branch safety_

- [ ] 4.3 [YELLOW] Refactor: serialize branch decisions into validation metadata
  - **Do**:
    1. Persist the serialized branch decision under `validation.branchDecision`.
    2. Keep fresh triage behavior unchanged.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Branch decisions are recorded deterministically and `fresh-branch-safety` stays green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case fresh-branch-safety`
  - **Commit**: `refactor(triage): yellow - serialize branch decision metadata`
  - _Requirements: FR-8, FR-10_
  - _Design: `extensions/ralph-specum/index.ts` triage coordinator_

- [ ] Q4 [VERIFY] Branch checkpoint: shared helper reuse and ordering
  - **Do**:
    1. Re-run the fresh branch safety case.
    2. Re-run the exact source inspection required by `AC-4.1`.
  - **Files**: None
  - **Done when**: Runtime case and source-inspection command both succeed.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case fresh-branch-safety && grep -n 'decideStartBranchBeforeWrites' extensions/ralph-specum/index.ts`
  - **Commit**: `chore(verify): pass branch-safety checkpoint`
  - _Requirements: FR-10; AC-4.1, AC-4.2_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `extensions/ralph-specum/index.ts`_

- [ ] 4.4 [RED] Failing test: README documents parity matrix, headless sentence, state authority, and contracts
  - **Do**:
    1. Add `docs-parity-matrix`, `docs-state-authority`, and `docs-contracts` verifier cases.
    2. Assert the exact README rows, phrases, contract names, required fields, and downstream consumer names from the requirements.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Documentation verifier cases exist and fail because README lacks the required wording.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case docs-parity-matrix 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS && node scripts/verify-triage-github-sync-parity.mjs --case docs-state-authority 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS && node scripts/verify-triage-github-sync-parity.mjs --case docs-contracts 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(docs): red - failing test for triage parity documentation`
  - _Requirements: FR-11, FR-12; AC-4.3, AC-5.1, AC-5.2, AC-5.3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `README.md` parity docs_

- [ ] 4.5 [GREEN] Pass test: publish README triage parity matrix and contract docs
  - **Do**:
    1. Add one README triage parity section with the required matrix rows.
    2. Add the exact headless sentence, state-authority phrases, contract field lists, and downstream consumer names.
  - **Files**: `README.md`
  - **Done when**: All README-focused verifier cases pass.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case docs-parity-matrix && node scripts/verify-triage-github-sync-parity.mjs --case docs-state-authority && node scripts/verify-triage-github-sync-parity.mjs --case docs-contracts && grep -n 'Headless /ralph-triage --fresh runs record the branch decision and require --yes before applying any branch or worktree change\.' README.md`
  - **Commit**: `docs(readme): green - add triage parity matrix and contracts`
  - _Requirements: FR-11, FR-12; AC-4.3, AC-5.1, AC-5.2, AC-5.3_
  - _Design: `README.md` parity docs_

- [ ] 4.6 [YELLOW] Refactor: tighten README triage parity section layout
  - **Do**:
    1. Reformat the triage parity section for scanability without changing required wording.
    2. Keep all documentation verifier cases green.
  - **Files**: `README.md`
  - **Done when**: README section is concise, stable, and all docs cases remain green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case docs-parity-matrix && node scripts/verify-triage-github-sync-parity.mjs --case docs-state-authority && node scripts/verify-triage-github-sync-parity.mjs --case docs-contracts`
  - **Commit**: `refactor(docs): yellow - tighten triage parity section`
  - _Requirements: FR-11, FR-12_
  - _Design: `README.md` parity docs_

- [ ] Q5 [VERIFY] Docs checkpoint: parity matrix and contract wording
  - **Do**:
    1. Run all README-focused verifier cases together.
  - **Files**: None
  - **Done when**: Documentation cases exit 0 and the exact headless sentence remains present once.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case docs-parity-matrix && node scripts/verify-triage-github-sync-parity.mjs --case docs-state-authority && node scripts/verify-triage-github-sync-parity.mjs --case docs-contracts && grep -n 'Headless /ralph-triage --fresh runs record the branch decision and require --yes before applying any branch or worktree change\.' README.md`
  - **Commit**: `chore(verify): pass triage docs checkpoint`
  - _Requirements: FR-11, FR-12; AC-4.3, AC-5.1, AC-5.2, AC-5.3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `README.md`_

## Phase 5: Verifier lifecycle, package wiring, and final gates

- [ ] 5.1 [RED] Failing test: verifier lifecycle and package wiring include triage parity checks
  - **Do**:
    1. Add `package-wiring`, `acceptance-checklist`, and `cleanup` verifier coverage for triage parity.
    2. Assert `package.json` wires triage acceptance into `verify:index` and triage cleanup into `verify:pack`.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Lifecycle/package-wiring coverage exists and fails because the repo is not yet wired for triage parity.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case package-wiring 2>&1 | grep -Eq 'FAIL|EXPECTED_FAIL|Unknown verify case|Error' && echo RED_PASS`
  - **Commit**: `test(verify): red - failing test for triage package wiring`
  - _Requirements: NFR-2, NFR-3; AC-5.1, AC-5.2, AC-5.3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `package.json`_

- [ ] 5.2 [GREEN] Pass test: wire triage verifier into package verification chains
  - **Do**:
    1. Implement triage `acceptance-checklist` and `cleanup` lifecycle cases.
    2. Add triage acceptance coverage to `verify:index` and triage cleanup coverage to `verify:pack`.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`, `package.json`
  - **Done when**: `package-wiring` passes and discovered package commands include the triage verifier lifecycle.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case package-wiring && npm run verify:index`
  - **Commit**: `feat(verify): green - wire triage parity into package checks`
  - _Requirements: NFR-2, NFR-3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; `package.json`_

- [ ] 5.3 [YELLOW] Refactor: align triage verifier lifecycle with existing script patterns
  - **Do**:
    1. Reuse the acceptance-checklist and cleanup registry pattern from existing parity verifiers.
    2. Keep temp-fixture prefixes and cleanup deterministic.
  - **Files**: `scripts/verify-triage-github-sync-parity.mjs`
  - **Done when**: Triage verifier follows existing lifecycle conventions and package-wiring coverage stays green.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case package-wiring && node scripts/verify-triage-github-sync-parity.mjs --case acceptance-checklist`
  - **Commit**: `refactor(verify): yellow - align triage verifier lifecycle`
  - _Requirements: NFR-2, NFR-3_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs`; existing verifier lifecycle pattern in `scripts/verify-feedback-parity.mjs`_

- [ ] VE1 [VERIFY] Startup/build: package verification bootstrap
  - **Do**:
    1. Run the discovered package verification entrypoint from `package.json`.
    2. Use it as the library-mode startup/build gate for triage parity.
  - **Files**: None
  - **Done when**: `npm run verify:index` exits 0 with triage acceptance-checklist wired in.
  - **Verify**: `npm run verify:index`
  - **Commit**: `chore(verify): pass triage startup build gate`
  - _Requirements: NFR-2, NFR-3_
  - _Design: Verification Tooling `npm run verify:index`; `package.json`_

- [ ] VE2 [VERIFY] Check: package-level triage parity behavior
  - **Do**:
    1. Run the discovered full package verification command from `package.json`.
    2. Confirm triage parity behavior now participates in the repo verification chain.
  - **Files**: None
  - **Done when**: `npm run prepack` exits 0 and triage parity cases participate in the package verification sequence.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(verify): pass triage package behavior gate`
  - _Requirements: NFR-2, NFR-3_
  - _Design: Quality Commands `npm run prepack`; `package.json`_

- [ ] VE3 [VERIFY] Cleanup: verifier temp fixtures and pack cleanup chain
  - **Do**:
    1. Run the discovered cleanup-oriented package verification command from `package.json`.
    2. Confirm triage cleanup is part of the `verify:pack` chain.
  - **Files**: None
  - **Done when**: `npm run verify:pack` exits 0 and no triage verifier temp artifacts remain.
  - **Verify**: `npm run verify:pack`
  - **Commit**: `chore(verify): pass triage cleanup gate`
  - _Requirements: NFR-2, NFR-3_
  - _Design: Quality Commands `npm run verify:pack`; `package.json`_

- [ ] V4 [VERIFY] Full local CI
  - **Do**:
    1. Run the discovered full local package verification command from `package.json`.
  - **Files**: None
  - **Done when**: All local package verification steps exit 0.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(verify): pass full local CI`
  - _Requirements: NFR-3_
  - _Design: Quality Commands `npm run prepack`; `package.json`_

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Run the discovered CI-equivalent package verification chain from `package.json`.
    2. Treat these commands as the repo's available pipeline proxy because research found no separate workflow run command.
  - **Files**: None
  - **Done when**: `verify:index` and `verify:pack` both exit 0.
  - **Verify**: `npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(verify): pass CI-equivalent package pipeline`
  - _Requirements: NFR-3_
  - _Design: Quality Commands `npm run verify:index`; `npm run verify:pack`; `package.json`_

- [ ] V6 [VERIFY] AC checklist
  - **Do**:
    1. Run the triage parity acceptance-checklist case covering the required behavior set.
    2. Confirm all targeted acceptance cases are included in the checklist.
  - **Files**: None
  - **Done when**: `acceptance-checklist` exits 0.
  - **Verify**: `node scripts/verify-triage-github-sync-parity.mjs --case acceptance-checklist`
  - **Commit**: `chore(verify): pass triage acceptance checklist`
  - _Requirements: FR-1, FR-3, FR-6, FR-10, FR-11, FR-12; NFR-2_
  - _Design: `scripts/verify-triage-github-sync-parity.mjs` acceptance-checklist lifecycle_

## Unresolved Questions
- None blocking MVP. Deferred product questions remain in `requirements.md` and `design.md`.

## Notes
- Workflow assumption: `MID_SIZED` parity feature; use non-GREENFIELD TDD triplets.
- POC shortcuts: None.
- Production TODOs: Revisit optional GitHub issue-field mirroring only after MVP parity stabilizes.
