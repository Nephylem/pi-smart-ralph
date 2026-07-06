# Tasks: Fix Pi Smart Ralph Interactiveness

_Assumption: BUG_FIX workflow inferred from goal keyword “fix”. Repro source: research.md Quality Commands row `Test` / Verification Tooling row `Node unit/smoke tests`._

## Phase 0: Bug Reproduction

- [x] 0.1 [VERIFY] Reproduce bug
  - **Do**:
    1. Run the discovered smoke test command as baseline.
    2. Note whether existing coverage exposes or misses the TUI regression.
  - **Files**: None
  - **Done when**: Baseline result is known before regression tests.
  - **Verify**: `npm test`
  - **Commit**: None
  - _Requirements: FR-1, FR-2, FR-3, FR-6, NFR-1_
  - _Design: Smoke test harness; Coordinator job guard; Ralph subagent lifecycle tracker_

- [x] 0.2 [VERIFY] Confirm repro is consistent
  - **Do**:
    1. Re-run the discovered smoke test command.
    2. Confirm the baseline result repeats.
  - **Files**: None
  - **Done when**: Same baseline result is observed twice.
  - **Verify**: `npm test`
  - **Commit**: None
  - _Requirements: FR-1, FR-2, FR-3, FR-6, NFR-1_
  - _Design: Smoke test harness_

## Phase 1: Coordinator Startup TDD

- [x] 1.1 [RED] Failing test: `/ralph-*` handler returns before delegated work resolves
  - **Do**:
    1. Add a smoke test invoking one phase command with a pending delegated promise.
    2. Assert the handler returns before the promise resolves.
    3. Reference BEFORE failure mode: missing non-blocking regression proof.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test exists and fails for expected missing/nonconforming behavior.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - nonblocking coordinator startup`
  - _Requirements: FR-1, AC-1.1, AC-1.3, NFR-1_
  - _Design: Coordinator job guard; Data Flow steps 1-4_

- [x] 1.2 [GREEN] Pass test: detach coordinator workflow after UI startup
  - **Do**:
    1. Install UI surfaces before detaching workflow execution.
    2. Catch detached workflow errors without keeping handler pending.
    3. Preserve active-job cleanup after completion/failure.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Non-blocking startup test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - detach coordinator startup`
  - _Requirements: FR-1, AC-1.1, AC-1.3_
  - _Design: Coordinator job guard; Safe Ralph UI helpers_

- [x] 1.3 [YELLOW] Refactor: clarify coordinator startup sequence
  - **Do**:
    1. Reorder helper calls only if readability improves.
    2. Keep UI setup, notify, detach, and cleanup order explicit.
  - **Files**: `extensions/ralph-specum/index.ts`, `tests/runtime-smoke.test.mjs`
  - **Done when**: Startup sequence is readable and tests stay green.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - clarify coordinator startup`
  - _Requirements: FR-1, FR-9_
  - _Design: Coordinator job guard; Existing patterns to follow_

- [x] Q1.1 [VERIFY] Quality check: non-blocking startup slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass nonblocking startup checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

- [x] 1.4 [RED] Failing test: concurrent Ralph job is rejected
  - **Do**:
    1. Add a smoke test that starts one pending Ralph job.
    2. Invoke a second `/ralph-*` command while the first is active.
    3. Assert one delegated promise starts and warning feedback emits.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails for expected overlap-guard behavior if absent/regressed.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - reject overlapping coordinator jobs`
  - _Requirements: FR-2, AC-1.2, NFR-1_
  - _Design: Coordinator job guard; Error Handling concurrent Ralph job_

- [x] 1.5 [GREEN] Pass test: keep active job guard user-visible
  - **Do**:
    1. Ensure active coordinator state blocks a second job.
    2. Route overlap feedback through `notify`/console fallback.
    3. Prevent a second delegated promise from starting.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Overlap rejection test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - guard overlapping coordinator jobs`
  - _Requirements: FR-2, FR-5, AC-1.2_
  - _Design: Coordinator job guard; Safe Ralph UI helpers_

- [x] 1.6 [YELLOW] Refactor: simplify active job cleanup
  - **Do**:
    1. Centralize active-job reset in detached promise finalization.
    2. Keep failure notification and status clearing intact.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Active job state resets once and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - simplify active job cleanup`
  - _Requirements: FR-1, FR-2, FR-9_
  - _Design: Error Handling workflow throws; Coordinator job guard_

- [x] Q1.2 [VERIFY] Quality check: overlap guard slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass overlap guard checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

- [x] 1.7 [RED] Failing test: coordinator startup publishes Ralph status
  - **Do**:
    1. Add mocked `ctx.ui.setStatus` assertion during phase startup.
    2. Assert key `ralph` and non-empty message are passed.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until startup status is guaranteed.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - coordinator startup status`
  - _Requirements: FR-4, AC-2.2, NFR-1_
  - _Design: Safe Ralph UI helpers; Ralph interactive surfaces_

- [ ] 1.8 [GREEN] Pass test: set non-empty Ralph status at job start
  - **Do**:
    1. Call safe status helper at coordinator startup.
    2. Include running phase/job label in non-empty status text.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Startup status test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - publish coordinator status`
  - _Requirements: FR-4, AC-2.2_
  - _Design: Safe Ralph UI helpers; Ralph interactive surfaces_

- [ ] 1.9 [YELLOW] Refactor: isolate status message formatting
  - **Do**:
    1. Keep status formatting local and deterministic.
    2. Avoid broad untyped UI calls.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Typecheck and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - isolate status formatting`
  - _Requirements: FR-4, FR-9_
  - _Design: Safe Ralph UI helpers_

- [ ] Q1.3 [VERIFY] Quality check: coordinator startup status slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass coordinator status checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

## Phase 2: Safe UI Surface TDD

- [ ] 2.1 [RED] Failing test: session start installs footer and `ralph-subagents` widget
  - **Do**:
    1. Add/extend `session_start` smoke test with mocked `setFooter`/`setWidget`.
    2. Assert footer install is called.
    3. Assert widget key is `ralph-subagents`.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until both interactive surfaces install.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - install session UI surfaces`
  - _Requirements: FR-3, FR-11, AC-2.1, AC-5.2_
  - _Design: Ralph interactive surfaces; Safe Ralph UI helpers_

- [ ] 2.2 [GREEN] Pass test: self-guard footer and widget installation
  - **Do**:
    1. Make footer installation safely no-op when unavailable.
    2. Make `ralph-subagents` installation safely no-op when unavailable.
    3. Preserve widget key `ralph-subagents`.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Session start surface test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - install safe session surfaces`
  - _Requirements: FR-3, FR-8, FR-11, AC-2.1, AC-5.2_
  - _Design: Ralph interactive surfaces; Safe Ralph UI helpers_

- [ ] 2.3 [YELLOW] Refactor: consolidate surface installation guards
  - **Do**:
    1. Remove duplicate `ctx.hasUI`/method checks where local helper owns them.
    2. Keep call sites simple and explicit.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Surface setup remains safe and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - consolidate surface guards`
  - _Requirements: FR-8, FR-9_
  - _Design: Safe Ralph UI helpers_

- [ ] Q2.1 [VERIFY] Quality check: session surfaces slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass session surfaces checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

- [ ] 2.4 [RED] Failing test: UI notifications route through `ctx.ui.notify`
  - **Do**:
    1. Add a mocked UI test that triggers a Ralph notification.
    2. Assert `ctx.ui.notify(message, type)` receives message and type.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until UI notification routing is guaranteed.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - route UI notifications`
  - _Requirements: FR-5, AC-2.3, NFR-1_
  - _Design: Safe Ralph UI helpers; notify UI/console split_

- [ ] 2.5 [GREEN] Pass test: preserve notify UI path
  - **Do**:
    1. Use `ctx.ui.notify` when `ctx.hasUI === true` and method exists.
    2. Preserve warning/info type mapping.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: UI notification test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - route UI notifications`
  - _Requirements: FR-5, AC-2.3_
  - _Design: Safe Ralph UI helpers_

- [ ] 2.6 [YELLOW] Refactor: type notification helper narrowly
  - **Do**:
    1. Keep notification type union narrow.
    2. Avoid broad `any` at UI call sites.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Typecheck and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - type notification helper`
  - _Requirements: FR-5, FR-9, AC-4.3_
  - _Design: Safe Ralph UI helpers; Interfaces_

- [ ] Q2.2 [VERIFY] Quality check: notification slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass notification checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

- [ ] 2.7 [RED] Failing test: no-UI and partial-UI contexts do not throw
  - **Do**:
    1. Add no-UI test for notify, status, footer, and widget paths.
    2. Add partial-UI test missing `setWidget`, `setFooter`, and `setStatus`.
    3. Assert zero throws and console fallback for notify.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until safe fallback behavior is complete.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - safe no-ui fallbacks`
  - _Requirements: FR-5, FR-8, AC-2.4, AC-4.1, AC-4.2_
  - _Design: Error Handling no UI context; Edge Cases partial UI context_

- [ ] 2.8 [GREEN] Pass test: guard optional Pi UI methods
  - **Do**:
    1. Guard `setStatus`, `setFooter`, `setWidget`, and `notify` before calling.
    2. Route no-UI notifications to console.
    3. Keep status/footer/widget no-op without UI.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: No-UI and partial-UI tests pass.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - guard optional UI methods`
  - _Requirements: FR-5, FR-8, AC-2.4, AC-4.1, AC-4.2_
  - _Design: Safe Ralph UI helpers; Error Handling_

- [ ] 2.9 [YELLOW] Refactor: keep no-UI paths side-effect small
  - **Do**:
    1. Remove redundant no-op branches if helper guards cover them.
    2. Keep console fallback limited to notification messages.
  - **Files**: `extensions/ralph-specum/index.ts`, `tests/runtime-smoke.test.mjs`
  - **Done when**: No-UI behavior remains covered and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - reduce no-ui branching`
  - _Requirements: FR-5, FR-8, FR-9_
  - _Design: Safe Ralph UI helpers_

- [ ] Q2.3 [VERIFY] Quality check: no-UI fallback slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass fallback checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

## Phase 3: `ralph-subagents` Lifecycle TDD

- [ ] 3.1 [RED] Failing test: `subagents:created` renders queued row
  - **Do**:
    1. Extend test event bus to emit `subagents:created`.
    2. Mount `ralph-subagents` renderer from mocked `setWidget`.
    3. Assert queued/pending row text for emitted agent.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until created events render queued rows.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - render queued subagent rows`
  - _Requirements: FR-6, AC-3.1, NFR-1_
  - _Design: Ralph subagent lifecycle tracker; Data Flow steps 5-7_

- [ ] 3.2 [GREEN] Pass test: upsert created events as queued
  - **Do**:
    1. Normalize `subagents:created` payloads into tracked entries.
    2. Render queued/pending state in widget rows.
    3. Ignore events without usable `id`.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Created-event queued-row test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - render queued subagents`
  - _Requirements: FR-6, AC-3.1_
  - _Design: Ralph subagent lifecycle tracker; Error Handling missing id_

- [ ] 3.3 [YELLOW] Refactor: normalize lifecycle event parsing
  - **Do**:
    1. Keep event normalization local to tracker/widget code.
    2. Preserve row width truncation behavior.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Event parsing is small and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - normalize lifecycle events`
  - _Requirements: FR-6, FR-9_
  - _Design: RalphSubagentLifecycleEvent; Performance Considerations_

- [ ] Q3.1 [VERIFY] Quality check: queued lifecycle slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass queued lifecycle checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

- [ ] 3.4 [RED] Failing test: `subagents:started` updates row without duplicate widget key
  - **Do**:
    1. Emit `subagents:created`, then `subagents:started` for same id.
    2. Assert row changes to running/active state.
    3. Assert lifecycle update does not register duplicate widget keys.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until started events update in place.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - update running subagent rows`
  - _Requirements: FR-6, FR-11, AC-3.2, AC-5.2_
  - _Design: Ralph subagent lifecycle tracker; Widget identity decision_

- [ ] 3.5 [GREEN] Pass test: upsert started events in existing tracker entry
  - **Do**:
    1. Update existing tracked entry on `subagents:started`.
    2. Preserve original start timestamp when appropriate.
    3. Trigger re-render without re-registering widget.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Started-event update test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - update running subagents`
  - _Requirements: FR-6, FR-11, AC-3.2_
  - _Design: Edge Cases repeated started; Callback setWidget pattern_

- [ ] 3.6 [YELLOW] Refactor: separate render request from widget registration
  - **Do**:
    1. Keep render request separate from `setWidget` registration.
    2. Ensure lifecycle events only mutate data and request render.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: No duplicate registration and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - separate render requests`
  - _Requirements: FR-6, FR-11, FR-9_
  - _Design: Callback setWidget with dispose and requestRender_

- [ ] Q3.2 [VERIFY] Quality check: running lifecycle slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass running lifecycle checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

- [ ] 3.7 [RED] Failing test: `subagents:completed` renders bounded done linger
  - **Do**:
    1. Emit `subagents:completed` for a tracked id.
    2. Assert done/completed state appears.
    3. Advance test clock or trigger prune and assert row clears.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until completed rows linger and prune deterministically.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - bounded completed subagent linger`
  - _Requirements: FR-6, AC-3.3, NFR-5_
  - _Design: Finished rows decision; Edge Cases completed before started_

- [ ] 3.8 [GREEN] Pass test: prune completed rows after bounded linger
  - **Do**:
    1. Mark completed entries with terminal timestamp.
    2. Render completed state during linger.
    3. Prune completed rows after configured clear condition.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Completed linger/prune test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - prune completed subagents`
  - _Requirements: FR-6, AC-3.3, NFR-5_
  - _Design: Ralph subagent lifecycle tracker; Performance Considerations_

- [ ] 3.9 [YELLOW] Refactor: bound terminal row retention constants
  - **Do**:
    1. Keep success/error linger constants near widget constants.
    2. Keep max rendered lines enforced.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Retention behavior is explicit and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - bound terminal row retention`
  - _Requirements: FR-6, NFR-5, FR-9_
  - _Design: Performance Considerations; Edge Cases many active agents_

- [ ] Q3.3 [VERIFY] Quality check: completed lifecycle slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass completed lifecycle checkpoint`
  - _Requirements: NFR-1, NFR-2, NFR-5_
  - _Design: Smoke test harness_

- [ ] 3.10 [RED] Failing test: `subagents:failed` renders error indicator
  - **Do**:
    1. Emit `subagents:failed` with an error/failure value.
    2. Assert row shows failed/error state and identifying metadata.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until failed rows render an error indicator.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - render failed subagents`
  - _Requirements: FR-6, AC-3.4, NFR-1_
  - _Design: Ralph subagent lifecycle tracker; Error Handling workflow throws_

- [ ] 3.11 [GREEN] Pass test: render failed/stopped/aborted terminal states
  - **Do**:
    1. Normalize failed/error/stopped/aborted statuses as terminal error states.
    2. Preserve error text or indicator in row.
    3. Use bounded error linger.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Failed-row test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - render failed subagents`
  - _Requirements: FR-6, AC-3.4, NFR-5_
  - _Design: Edge Cases failed/stopped/aborted statuses_

- [ ] 3.12 [YELLOW] Refactor: unify terminal status labels
  - **Do**:
    1. Keep completed and failed label mapping consistent.
    2. Avoid duplicated terminal-state checks.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Terminal statuses render consistently and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - unify terminal status labels`
  - _Requirements: FR-6, FR-9, NFR-5_
  - _Design: Ralph subagent lifecycle tracker_

- [ ] Q3.4 [VERIFY] Quality check: failed lifecycle slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass failed lifecycle checkpoint`
  - _Requirements: NFR-1, NFR-2, NFR-5_
  - _Design: Smoke test harness_

- [ ] 3.13 [RED] Failing test: manager records fill incomplete lifecycle payloads
  - **Do**:
    1. Install mocked `Symbol.for("pi-subagents:manager")` global manager record.
    2. Emit incomplete lifecycle event with only id/status.
    3. Assert rendered row uses manager metadata/progress.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until manager fallback enriches widget rows.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - use subagent manager fallback`
  - _Requirements: FR-7, AC-3.5, NFR-1_
  - _Design: Ralph subagent lifecycle tracker; Manager fallback_

- [ ] 3.14 [GREEN] Pass test: enrich rows from pi-subagents manager fallback
  - **Do**:
    1. Resolve manager records by id when event data is incomplete.
    2. Merge type, description, tool use, token, and status data safely.
    3. Skip manager fallback when unavailable.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Manager fallback test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - use subagent manager fallback`
  - _Requirements: FR-7, AC-3.5_
  - _Design: Error Handling manager unavailable; Interfaces RalphSubagentManager_

- [ ] 3.15 [YELLOW] Refactor: keep manager access isolated
  - **Do**:
    1. Isolate global symbol lookup in one local helper.
    2. Keep helper typed narrowly and side-effect free.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Manager fallback code is isolated and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - isolate manager fallback`
  - _Requirements: FR-7, FR-9_
  - _Design: RalphSubagentManager; Security Considerations_

- [ ] Q3.5 [VERIFY] Quality check: manager fallback slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass manager fallback checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

## Phase 4: Integration Defaults and E2E-Equivalent Verification

- [ ] 4.1 [RED] Failing test: bootstrap preserves pi-subagents defaults
  - **Do**:
    1. Add/extend bootstrap test for generated `.pi/subagents.json`.
    2. Assert `widgetMode: "background"` and `fleetView: true`.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until defaults are asserted/preserved.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - preserve subagents defaults`
  - _Requirements: FR-10, AC-5.1, NFR-1_
  - _Design: Runtime bootstrap defaults_

- [ ] 4.2 [GREEN] Pass test: keep `widgetMode` and `fleetView` defaults
  - **Do**:
    1. Preserve bootstrap defaults for pi-subagents settings.
    2. Avoid dependency version or pi-subagents package-source changes.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Bootstrap defaults test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - preserve subagents defaults`
  - _Requirements: FR-10, AC-5.1_
  - _Design: Runtime bootstrap defaults; Technical Decisions dependency changes_

- [ ] 4.3 [YELLOW] Refactor: keep bootstrap defaults readable
  - **Do**:
    1. Keep default settings grouped by key names.
    2. Preserve existing user override behavior.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Defaults remain clear and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - clarify subagents defaults`
  - _Requirements: FR-10, FR-9_
  - _Design: Runtime bootstrap defaults_

- [ ] Q4.1 [VERIFY] Quality check: subagents defaults slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass subagents defaults checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

- [ ] 4.4 [RED] Failing test: native task widget remains phase-scoped
  - **Do**:
    1. Add tests for `/ralph-start`, `/ralph-tasks`, `/ralph-implement` showing native task widget.
    2. Add tests for `/ralph-research`, `/ralph-requirements` showing no native task widget.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until phase scoping is asserted.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - scope native task widget phases`
  - _Requirements: FR-12, AC-5.3, NFR-1_
  - _Design: Native task widget decision; Edge Cases research/requirements startup_

- [ ] 4.5 [GREEN] Pass test: preserve native task phase regex
  - **Do**:
    1. Keep native task startup widget limited to configured phases.
    2. Ensure research/requirements use status/subagent widget only.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Phase-scoped native task widget test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - preserve task widget phase scope`
  - _Requirements: FR-12, AC-5.3_
  - _Design: Native task widget decision; maybeShowNativeTaskStartupWidget pattern_

- [ ] 4.6 [YELLOW] Refactor: name phase scope predicate
  - **Do**:
    1. Keep phase scope predicate explicit and easy to test.
    2. Avoid widening scope without requirement.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Phase scope remains readable and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - name task widget phase scope`
  - _Requirements: FR-12, FR-9_
  - _Design: Existing Patterns phase-scoped native task widget_

- [ ] Q4.2 [VERIFY] Quality check: native task widget scope slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass task widget scope checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

- [ ] 4.7 [RED] Failing test: Smart Ralph never overwrites pi-subagents `agents` widget
  - **Do**:
    1. Add smoke test inspecting mocked `setWidget` keys across session/lifecycle updates.
    2. Assert Smart Ralph uses `ralph-subagents` and not `agents`.
  - **Files**: `tests/runtime-smoke.test.mjs`
  - **Done when**: Test fails until widget key behavior is asserted.
  - **Verify**: `npm test 2>&1 | grep -q "FAIL\|fail\|Error" && echo RED_PASS`
  - **Commit**: `test(ralph-tui): red - avoid agents widget overwrite`
  - _Requirements: FR-11, AC-5.2, NFR-1_
  - _Design: Widget identity decision; Pitfalls duplicate displays_

- [ ] 4.8 [GREEN] Pass test: keep custom widget key distinct
  - **Do**:
    1. Ensure all custom subagent widget calls use `ralph-subagents`.
    2. Do not call `setWidget("agents", ...)` from Smart Ralph code.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Widget key test passes.
  - **Verify**: `npm test`
  - **Commit**: `fix(ralph-tui): green - keep custom widget key distinct`
  - _Requirements: FR-11, AC-5.2_
  - _Design: Widget identity decision_

- [ ] 4.9 [YELLOW] Refactor: centralize Ralph widget key constant
  - **Do**:
    1. Use a single local constant for `ralph-subagents` if absent.
    2. Keep native task widget key separate.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Widget keys are explicit and tests pass.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `refactor(ralph-tui): yellow - centralize widget keys`
  - _Requirements: FR-11, FR-9_
  - _Design: Ralph interactive surfaces_

- [ ] Q4.3 [VERIFY] Quality check: widget key slice
  - **Do**:
    1. Run discovered typecheck and smoke test commands from research.md.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run typecheck && npm test`
  - **Commit**: `chore(ralph-tui): pass widget key checkpoint`
  - _Requirements: NFR-1, NFR-2_
  - _Design: Smoke test harness_

- [ ] VE1 [VERIFY] Startup/build verification using discovered Node typecheck
  - **Do**:
    1. Use research.md Verification Tooling row `Node typecheck`.
    2. Verify Pi extension TypeScript surface builds without emitting.
  - **Files**: None
  - **Done when**: Typecheck exits 0.
  - **Verify**: `npm run typecheck`
  - **Commit**: None
  - _Requirements: NFR-2, FR-9_
  - _Design: Test Strategy; Technical Decisions testing_

- [ ] VE2 [VERIFY] TUI behavior verification using discovered mocked Pi UI harness
  - **Do**:
    1. Use research.md Verification Tooling rows `Node unit/smoke tests` and `TUI unit harness`.
    2. Verify mocked `ctx.ui`/event-bus behavior covers coordinator, fallback, lifecycle, and defaults.
  - **Files**: None
  - **Done when**: Smoke tests exit 0.
  - **Verify**: `npm test`
  - **Commit**: None
  - _Requirements: NFR-1, FR-1, FR-2, FR-3, FR-5, FR-6, FR-7, FR-8, FR-10, FR-11, FR-12_
  - _Design: Smoke test harness; E2E Tests none/tooling boundary_

- [ ] VE3 [VERIFY] Cleanup/package verification using discovered pack verifier
  - **Do**:
    1. Use research.md Verification Tooling row `Pack verifiers`.
    2. Verify package dry-run checks leave extension packable after TUI changes.
  - **Files**: None
  - **Done when**: Pack verifier exits 0.
  - **Verify**: `npm run verify:pack`
  - **Commit**: None
  - _Requirements: NFR-3_
  - _Design: Security Considerations; Test Strategy_

## Phase 5: Quality Gates and PR Lifecycle

- [ ] V4 [VERIFY] Full local CI
  - **Do**:
    1. Run all discovered local quality commands from research.md Quality Commands except install.
  - **Files**: None
  - **Done when**: All commands exit 0.
  - **Verify**: `npm run typecheck && npm test && npm run verify:index && npm run verify:pack && node scripts/verify-publish-bundle.mjs`
  - **Commit**: `chore(ralph-tui): pass full local CI`
  - _Requirements: NFR-1, NFR-2, NFR-3_
  - _Design: Test Strategy; Security Considerations_

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Run local equivalent of `.github/workflows/quality.yml` discovered in research.md.
  - **Files**: None
  - **Done when**: CI-equivalent commands exit 0.
  - **Verify**: `npm run typecheck && npm test && npm run verify:index && npm run verify:pack && node scripts/verify-publish-bundle.mjs`
  - **Commit**: None
  - _Requirements: NFR-1, NFR-2, NFR-3_
  - _Design: Test Strategy_

- [ ] V6 [VERIFY] AC checklist
  - **Do**:
    1. Verify tests and typecheck cover AC-1 through AC-5.
    2. Confirm no browser/server E2E tooling was added for this CLI/Pi extension fix.
  - **Files**: None
  - **Done when**: Smoke tests and typecheck pass with all acceptance tests present.
  - **Verify**: `npm test && npm run typecheck`
  - **Commit**: None
  - _Requirements: AC-1.1, AC-1.2, AC-1.3, AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-3.1, AC-3.2, AC-3.3, AC-3.4, AC-3.5, AC-4.1, AC-4.2, AC-4.3, AC-5.1, AC-5.2, AC-5.3, NFR-4_
  - _Design: Test Strategy; E2E Tests none_

- [ ] VF [VERIFY] Goal verification: original failure now passes
  - **Do**:
    1. Re-run discovered test and quality gates proving `/ralph-*` TUI behavior.
    2. Verify non-blocking startup, visible UI surfaces, lifecycle rows, and fallbacks via automated tests.
  - **Files**: None
  - **Done when**: Original TUI interactiveness regression is covered by passing tests and package verifiers.
  - **Verify**: `npm run typecheck && npm test && npm run verify:index && npm run verify:pack && node scripts/verify-publish-bundle.mjs`
  - **Commit**: None
  - _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, NFR-1, NFR-2, NFR-3, NFR-5_
  - _Design: Full architecture; Test Strategy_

## Unresolved Questions
- Exact observed TUI failure remains unknown: missing widget, stale rows, duplicate widgets, flicker, hidden placement, or input blocking.
- Long-term relationship between `ralph-subagents` and pi-subagents default `agents` widget remains supplement-by-default for this fix.
- Research/requirements native task widget remains out of default scope unless later requested.

## Notes
- POC shortcuts: None; BUG_FIX TDD workflow selected.
- Production TODOs: Keep changes scoped to `extensions/ralph-specum/index.ts` and `tests/runtime-smoke.test.mjs`; do not modify pi-subagents package source or legacy plugin files.
