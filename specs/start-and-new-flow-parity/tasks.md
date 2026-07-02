# Tasks: Start and New Flow Parity

## Phase 0: Planning Assumptions

- Intent Classification inferred: `MID_SIZED` because this changes existing Pi Smart Ralph command behavior with new helpers and regression smoke coverage; use non-GREENFIELD TDD Red-Green-Yellow.
- Verification commands are limited to research-discovered package commands: `npm run prepack` and `npm run verify:pack`. The smoke verifier is wired into the existing discovered `prepack` script so task verification continues to use discovered commands.
- No browser/devtools/database MCP or project E2E tooling was discovered; VE tasks use the library/Pi-extension package verification strategy from `research.md`.

## Phase 1: Red-Green-Yellow Cycles - Command Registration and Option Parity

- [x] 1.1 [RED] Failing smoke: `/ralph-new` is registered and delegates to shared start path
  - **Do**:
    1. Create a no-dependency smoke verifier that reads extension source and emits `START_FLOW_PARITY_RED` for missing `/ralph-new` registration or duplicated start parsing.
    2. Wire the smoke verifier into the existing `prepack` script before the existing publish-bundle verifier.
    3. Add assertions that `ralph-start` and `ralph-new` call the same shared start runner with invocation metadata.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `package.json`, `extensions/ralph-specum/index.ts`
  - **Done when**: `npm run prepack` fails because `/ralph-new` registration/delegation is not implemented yet and outputs `START_FLOW_PARITY_RED`.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - failing smoke for ralph-new delegation`
  - _Requirements: FR-1, AC-1.1_
  - _Design: Pi command registration; Smoke verification script_

- [x] 1.2 [GREEN] Pass smoke: register `/ralph-new` through the shared start runner
  - **Do**:
    1. Update `ralph-start` registration to pass `{ command: "ralph-start" }` into a shared start runner.
    2. Register `ralph-new` with shared completions and `{ command: "ralph-new", aliasOf: "ralph-start" }` invocation metadata.
    3. Keep option parsing in one canonical path.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: The registration/delegation smoke assertions pass.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(start): green - register ralph-new compatibility command`
  - _Requirements: FR-1, AC-1.1_
  - _Design: Pi command registration; Shared start coordinator_

- [x] 1.3 [YELLOW] Refactor shared invocation metadata types
  - **Do**:
    1. Add focused `StartInvocation` and `StartCommandName` types near existing start command types.
    2. Normalize shared runner parameter names so command registrations are thin.
    3. Keep `--next-epic-spec` call sites on the same runner without semantic changes.
  - **Files**: `extensions/ralph-specum/index.ts`, `scripts/verify-start-flow-parity.mjs`
  - **Done when**: Command registration remains thin and smoke checks stay green.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - normalize start invocation metadata`
  - _Requirements: FR-1, FR-12, AC-1.1_
  - _Design: Pi command registration; Existing Patterns to Follow_

- [x] Q1 [VERIFY] Quality check: command registration package verification
  - **Do**:
    1. Run research-discovered package verification commands after the first command-registration cycle.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass command registration quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Smoke verification script; Test Strategy_

- [x] 1.4 [RED] Failing smoke: start/new option snapshots are equivalent except alias metadata
  - **Do**:
    1. Add smoke assertions for `<spec-name> [goal]`, `--skip-research`, `--specs-dir`, `--tasks-size`, `--commit-spec`, and `--no-commit-spec` parity.
    2. Assert output state snapshots differ only by `command` and `aliasOf` metadata.
    3. Emit `START_FLOW_PARITY_RED` while the option snapshot builder is missing.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/index.ts`
  - **Done when**: `npm run prepack` fails for the missing shared option snapshot behavior.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - failing smoke for start new option parity`
  - _Requirements: FR-2, FR-3, AC-1.2, AC-1.4_
  - _Design: Shared start coordinator; Start contract builder_

- [x] 1.5 [GREEN] Pass smoke: build a shared start option snapshot
  - **Do**:
    1. Add a single option snapshot helper from parsed start args.
    2. Include `reference`, `goalProvided`, `skipResearch`, `specsDir`, `tasksSize`, `commitSpec`, `quickMode`, `autonomousMode`, and `nextEpicSpec`.
    3. Use the helper for both `/ralph-start` and `/ralph-new` state metadata.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Smoke assertions show matching option snapshots for equivalent start/new inputs.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(start): green - capture shared option snapshot`
  - _Requirements: FR-2, FR-3, AC-1.2, AC-1.4_
  - _Design: Start contract builder; Interfaces_

- [x] 1.6 [YELLOW] Refactor parser parity checks for maintainability
  - **Do**:
    1. Move repetitive smoke cases into a table inside the verifier.
    2. Ensure the table includes every option named in AC-1.2.
    3. Keep the parser implementation free of duplicated `/ralph-new` branches.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/index.ts`
  - **Done when**: Parity smoke cases are table-driven and package checks pass.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - table drive option parity smoke checks`
  - _Requirements: FR-2, FR-11, AC-1.2, AC-5.1_
  - _Design: Smoke verification script; Test Strategy_

- [x] Q2 [VERIFY] Quality check: option parity package verification
  - **Do**:
    1. Run package verification after parser/option parity changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass option parity quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests_

- [x] 1.7 [RED] Failing smoke: `--skip-research` controls start phase for both commands
  - **Do**:
    1. Add smoke fixtures asserting new specs without `--skip-research` produce `phase: "research"`.
    2. Add smoke fixtures asserting new specs with `--skip-research` produce `phase: "requirements"`.
    3. Emit `START_FLOW_PARITY_RED` if either command diverges.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/index.ts`
  - **Done when**: The smoke fixture fails until phase parity is observable for both invocation names.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - failing smoke for skip research phase parity`
  - _Requirements: FR-2, AC-1.3_
  - _Design: Shared start coordinator; Data Flow_

- [x] 1.8 [GREEN] Pass smoke: preserve phase selection in shared state patch
  - **Do**:
    1. Ensure the shared runner applies existing `determineStartPhase` behavior for both command names.
    2. Include the resolved phase in the state patch used by start/new.
    3. Avoid altering `/ralph-start --next-epic-spec` phase selection semantics.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Smoke fixtures pass for skip-research and default research phase cases.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(start): green - preserve shared phase selection`
  - _Requirements: FR-2, FR-12, AC-1.3_
  - _Design: Shared start coordinator; Error Handling_

- [x] 1.9 [YELLOW] Refactor phase parity smoke diagnostics
  - **Do**:
    1. Improve smoke verifier failure messages to name the command, args, and expected phase.
    2. Keep diagnostics deterministic and free of environment-specific paths.
  - **Files**: `scripts/verify-start-flow-parity.mjs`
  - **Done when**: Phase smoke diagnostics are actionable and checks remain green.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - clarify phase parity smoke diagnostics`
  - _Requirements: FR-11, AC-5.1_
  - _Design: Smoke verification script_

- [x] Q2a [VERIFY] Quality check: phase parity package verification
  - **Do**:
    1. Run package verification after skip-research phase parity changes, satisfying the 2-3 task checkpoint cadence from the tasks review.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass phase parity quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests; Smoke verification script_

## Phase 2: Red-Green-Yellow Cycles - Branch Safety and Gitignore Maintenance

- [x] 2.1 [RED] Failing smoke: branch/worktree decision runs before new-spec writes
  - **Do**:
    1. Add smoke fixture instrumentation that records attempted writes to spec directory, `.current-spec`, `.progress.md`, and `.ralph-state.json`.
    2. Add a branch decision marker that must occur before any recorded write for new specs.
    3. Emit `START_FLOW_PARITY_RED` until the start flow calls branch decision before writes.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/index.ts`
  - **Done when**: `npm run prepack` fails because no pre-write branch decision exists.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - failing smoke for prewrite branch decision`
  - _Requirements: FR-4, AC-2.1_
  - _Design: Start branch/worktree helper; Data Flow_

- [x] 2.2 [GREEN] Pass smoke: add injectable branch decision helper before writes
  - **Do**:
    1. Create `start-branch.ts` with pure decision planning and injectable git/UI dependencies.
    2. Call the helper for new specs before `.gitignore`, directory, state, progress, or current-spec writes.
    3. Return `skipped-existing-spec` for existing spec resumes.
  - **Files**: `extensions/ralph-specum/start-branch.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Smoke order fixture shows branch decision occurs before all new-spec writes.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(start): green - decide branch before spec writes`
  - _Requirements: FR-4, AC-2.1_
  - _Design: Start branch/worktree helper; Data Flow_

- [x] 2.3 [YELLOW] Refactor branch helper boundaries
  - **Do**:
    1. Separate pure branch planning from git command application.
    2. Keep injected runner/UI interfaces small and serializable for smoke fixtures.
    3. Ensure helper returns a `BranchDecision` object matching the design interface.
  - **Files**: `extensions/ralph-specum/start-branch.ts`, `scripts/verify-start-flow-parity.mjs`
  - **Done when**: Branch planning is fixture-testable without invoking real destructive git operations.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - isolate branch planner boundaries`
  - _Requirements: FR-4, FR-11, NFR-1, AC-2.1, AC-5.2_
  - _Design: Start branch/worktree helper; Security Considerations_

- [x] Q3 [VERIFY] Quality check: branch ordering package verification
  - **Do**:
    1. Run package verification after branch ordering changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass branch ordering quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests_

- [x] 2.4 [RED] Failing smoke: interactive branch choices are offered through Pi UI
  - **Do**:
    1. Add injected UI fixtures for default-branch interactive mode.
    2. Add injected UI fixtures for non-default-branch interactive mode.
    3. Assert default branch offers current-directory branch and worktree choices, while non-default branch offers stay-current and worktree choices.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/start-branch.ts`
  - **Done when**: Smoke fails until interactive choice planning is implemented.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - failing smoke for interactive branch choices`
  - _Requirements: FR-5, AC-2.2, AC-2.3_
  - _Design: Start branch/worktree helper; Error Handling_

- [x] 2.5 [GREEN] Pass smoke: implement interactive branch/worktree choices
  - **Do**:
    1. Implement default-branch choice planning for current-directory branch creation or worktree creation.
    2. Implement non-default-branch choice planning for stay-current or worktree creation.
    3. Abort before writes if a required interactive choice is cancelled or unavailable.
  - **Files**: `extensions/ralph-specum/start-branch.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Interactive smoke fixtures pass and cancellation produces no state/progress writes.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(start): green - offer interactive branch and worktree choices`
  - _Requirements: FR-5, AC-2.2, AC-2.3_
  - _Design: Start branch/worktree helper; Error Handling_

- [x] 2.6 [YELLOW] Refactor interactive choice labels and decision serialization
  - **Do**:
    1. Keep Pi-native labels centralized inside the branch helper.
    2. Serialize selected mode, current branch, default branch, target branch, worktree path, dirty state, applied flag, and reason.
    3. Keep smoke assertions independent of exact prose labels where possible.
  - **Files**: `extensions/ralph-specum/start-branch.ts`, `scripts/verify-start-flow-parity.mjs`
  - **Done when**: Interactive branch decisions are stable and package checks pass.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - stabilize branch decision serialization`
  - _Requirements: FR-5, FR-9, AC-2.2, AC-2.3, AC-3.4_
  - _Design: Interfaces; Start contract builder_

- [x] Q4 [VERIFY] Quality check: interactive branch package verification
  - **Do**:
    1. Run package verification after interactive branch behavior changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass interactive branch quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests_

- [x] 2.7 [RED] Failing smoke: quick/autonomous branch decisions are deterministic and non-destructive
  - **Do**:
    1. Add smoke fixtures for quick/default branch, autonomous/default branch, and quick/non-default branch.
    2. Assert headless fixtures make zero prompt calls.
    3. Assert generated git commands do not contain `--force`, `--discard-changes`, reset, delete, or equivalent destructive operations.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/start-branch.ts`
  - **Done when**: Smoke fails until deterministic headless branch decisions exist.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - failing smoke for deterministic headless branch safety`
  - _Requirements: FR-6, NFR-1, NFR-2, AC-2.4, AC-2.5_
  - _Design: Start branch/worktree helper; Technical Decisions_

- [x] 2.8 [GREEN] Pass smoke: implement quick/autonomous branch decisions
  - **Do**:
    1. In quick/autonomous/headless default-branch cases, select a safe `ralph/<spec-name>` current-directory branch decision without prompt calls.
    2. In quick/autonomous/headless non-default cases, select `stay-current` without prompt calls.
    3. Record dirty worktree state in the decision without resetting, stashing, discarding, or deleting changes.
  - **Files**: `extensions/ralph-specum/start-branch.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Headless branch fixtures pass and no destructive git flags are present in generated command plans.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(start): green - implement deterministic headless branch safety`
  - _Requirements: FR-6, NFR-1, NFR-2, AC-2.4, AC-2.5_
  - _Design: Technical Decisions; Security Considerations_

- [x] 2.9 [YELLOW] Refactor safe git command construction
  - **Do**:
    1. Centralize allowed git operations in the branch helper.
    2. Add source comments explaining why destructive flags are excluded.
    3. Ensure smoke fixture command recording covers both branch and worktree operations.
  - **Files**: `extensions/ralph-specum/start-branch.ts`, `scripts/verify-start-flow-parity.mjs`
  - **Done when**: Safe git command construction is centralized and smoke checks remain green.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - centralize safe git command construction`
  - _Requirements: FR-6, FR-11, NFR-1, AC-5.2_
  - _Design: Security Considerations; Test Strategy_

- [x] Q5 [VERIFY] Quality check: headless branch package verification
  - **Do**:
    1. Run package verification after quick/autonomous branch changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass headless branch quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests_

- [x] 2.10 [RED] Failing smoke: Ralph `.gitignore` entries are idempotent
  - **Do**:
    1. Add smoke fixtures for missing `.gitignore`, existing `.gitignore`, and two repeated updater runs.
    2. Assert required patterns are `specs/.current-spec`, `specs/.current-epic`, `**/.progress.md`, and `**/.ralph-state.json`.
    3. Assert unrelated existing entries are preserved in order.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/gitignore.ts`
  - **Done when**: Smoke fails until an idempotent `.gitignore` updater exists.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - failing smoke for ralph gitignore idempotency`
  - _Requirements: FR-10, NFR-3, AC-4.1, AC-4.2, AC-4.3_
  - _Design: Gitignore updater_

- [x] 2.11 [GREEN] Pass smoke: implement idempotent `.gitignore` updater
  - **Do**:
    1. Create `gitignore.ts` with an updater that creates `.gitignore` when missing.
    2. Append missing required Ralph patterns without deleting or reordering existing entries.
    3. Call the updater after branch decision and before spec state/progress writes.
  - **Files**: `extensions/ralph-specum/gitignore.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Missing-file, existing-file, and repeated-run smoke fixtures pass.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(start): green - maintain ralph gitignore entries idempotently`
  - _Requirements: FR-10, NFR-3, AC-4.1, AC-4.2, AC-4.3_
  - _Design: Gitignore updater; Data Flow_

- [x] 2.12 [YELLOW] Refactor gitignore newline and duplicate handling
  - **Do**:
    1. Normalize final newline handling for created and appended `.gitignore` files.
    2. Keep duplicate detection exact for the required patterns.
    3. Improve smoke diagnostics for duplicate and ordering failures.
  - **Files**: `extensions/ralph-specum/gitignore.ts`, `scripts/verify-start-flow-parity.mjs`
  - **Done when**: Gitignore fixtures are stable across missing, existing, and repeated-run cases.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - harden ralph gitignore updater`
  - _Requirements: FR-10, FR-11, NFR-3, AC-4.1, AC-4.3_
  - _Design: Gitignore updater; Edge Cases_

- [ ] Q5a [VERIFY] Quality check: gitignore package verification
  - **Do**:
    1. Run package verification after gitignore idempotency changes, satisfying the 2-3 task checkpoint cadence from the tasks review.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass gitignore quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests; Gitignore updater_

## Phase 3: Red-Green-Yellow Cycles - Discovery and StartCompatibilityContractV1

- [x] 3.1 [RED] Failing smoke: related specs are discovered and merged by name
  - **Do**:
    1. Add smoke fixtures with existing spec artifacts and keyword/metadata matches.
    2. Assert discovered entries include `name`, relevance or relationship, `mayNeedUpdate`, and evidence text.
    3. Assert existing `relatedSpecs` entries are preserved or merged by `name` on resume.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/start-discovery.ts`
  - **Done when**: Smoke fails until related-spec discovery and merge behavior exists.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - failing smoke for related spec discovery merge`
  - _Requirements: FR-7, AC-3.1, AC-3.3_
  - _Design: Start discovery helper_

- [x] 3.2 [GREEN] Pass smoke: implement read-only related spec discovery
  - **Do**:
    1. Create `start-discovery.ts` with read-only spec root scanning using existing path helpers and optional index hints.
    2. Score and cap related spec results without invoking `/ralph-index` rebuilding.
    3. Merge new results with existing state by spec name.
  - **Files**: `extensions/ralph-specum/start-discovery.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Related-spec discovery fixtures pass and existing state is preserved on resume.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(start): green - discover and merge related specs at kickoff`
  - _Requirements: FR-7, FR-3, AC-3.1, AC-3.3_
  - _Design: Start discovery helper; Performance Considerations_

- [ ] 3.3 [YELLOW] Refactor related discovery scoring and limits
  - **Do**:
    1. Centralize relevance scoring and evidence string construction.
    2. Cap results to the design limit while preserving deterministic ordering.
    3. Keep unreadable candidates skipped with warning metadata instead of failing kickoff.
  - **Files**: `extensions/ralph-specum/start-discovery.ts`, `scripts/verify-start-flow-parity.mjs`
  - **Done when**: Related discovery remains deterministic and package checks pass.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - stabilize related spec discovery scoring`
  - _Requirements: FR-7, FR-11, AC-3.1, AC-5.1_
  - _Design: Start discovery helper; Edge Cases_

- [ ] Q6 [VERIFY] Quality check: related discovery package verification
  - **Do**:
    1. Run package verification after related-spec discovery changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass related discovery quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests_

- [ ] 3.4 [RED] Failing smoke: discovered skills are persisted from metadata only
  - **Do**:
    1. Add smoke fixtures for packaged/project `SKILL.md` metadata matching the spec goal.
    2. Assert discovery results include `name`, `path`, relevance, and reason.
    3. Assert discovery does not execute skill code and preserves existing `discoveredSkills` by name.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/start-discovery.ts`
  - **Done when**: Smoke fails until skill discovery metadata scanning exists.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - failing smoke for skill metadata discovery`
  - _Requirements: FR-8, AC-3.2, AC-3.3_
  - _Design: Start discovery helper; Security Considerations_

- [ ] 3.5 [GREEN] Pass smoke: implement non-destructive skill discovery
  - **Do**:
    1. Extend `start-discovery.ts` to read packaged/project skill metadata paths.
    2. Match relevant skills from names/descriptions/frontmatter without executing skill files.
    3. Merge discovered skills into the start state patch while preserving existing entries by name.
  - **Files**: `extensions/ralph-specum/start-discovery.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Skill discovery fixtures pass and existing discovered skills survive resume.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(start): green - persist kickoff skill discovery metadata`
  - _Requirements: FR-8, AC-3.2, AC-3.3_
  - _Design: Start discovery helper; Security Considerations_

- [ ] 3.6 [YELLOW] Refactor discovery merge helpers
  - **Do**:
    1. Share merge-by-name behavior between related specs and discovered skills.
    2. Keep state preservation rules explicit for resume flows.
    3. Ensure discovery warnings do not block successful kickoff.
  - **Files**: `extensions/ralph-specum/start-discovery.ts`, `scripts/verify-start-flow-parity.mjs`
  - **Done when**: Discovery merge helpers are shared and all discovery smoke checks pass.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - share kickoff discovery merge helpers`
  - _Requirements: FR-7, FR-8, AC-3.1, AC-3.2, AC-3.3_
  - _Design: Start discovery helper; Existing Patterns to Follow_

- [ ] Q7 [VERIFY] Quality check: skill discovery package verification
  - **Do**:
    1. Run package verification after skill discovery changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass skill discovery quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests_

- [ ] 3.7 [RED] Failing smoke: start state includes StartCompatibilityContractV1 metadata
  - **Do**:
    1. Add smoke assertions for `startCompatibility.command`, optional `aliasOf`, `options`, `branchDecision`, `specRoot`, and `statePatch`.
    2. Assert `/ralph-new` records `aliasOf: "ralph-start"` and `/ralph-start` does not.
    3. Assert contract metadata preserves `commitSpec`, `relatedSpecs`, and `discoveredSkills` behavior.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/index.ts`
  - **Done when**: Smoke fails until contract metadata is present in state.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - failing smoke for start compatibility contract`
  - _Requirements: FR-9, AC-3.4_
  - _Design: Start contract builder; Interfaces_

- [ ] 3.8 [GREEN] Pass smoke: persist StartCompatibilityContractV1-compatible state
  - **Do**:
    1. Build `startCompatibility` from invocation metadata, option snapshot, branch decision, spec root metadata, and state patch snapshot.
    2. Persist the contract in `.ralph-state.json` for both start and new flows.
    3. Preserve existing state fields and `/ralph-start --next-epic-spec` semantics.
  - **Files**: `extensions/ralph-specum/index.ts`
  - **Done when**: Contract smoke assertions pass for `/ralph-start` and `/ralph-new`.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(start): green - persist start compatibility contract`
  - _Requirements: FR-9, FR-12, AC-3.4_
  - _Design: Start contract builder; Data Flow_

- [ ] 3.9 [YELLOW] Refactor start summary metadata without changing orchestration
  - **Do**:
    1. Include branch decision and discovery counts in start summary/warnings where existing output patterns allow.
    2. Avoid changing quick flow handoff or epic-next selection semantics.
    3. Keep contract construction isolated from display formatting.
  - **Files**: `extensions/ralph-specum/index.ts`, `scripts/verify-start-flow-parity.mjs`
  - **Done when**: Summary metadata is separate from state contract construction and checks pass.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - separate start summary from contract metadata`
  - _Requirements: FR-9, FR-12, AC-3.4_
  - _Design: Start contract builder; Existing Patterns to Follow_

- [ ] Q7a [VERIFY] Quality check: start compatibility contract package verification
  - **Do**:
    1. Run package verification after StartCompatibilityContractV1 state and summary changes, satisfying the 2-3 task checkpoint cadence from the tasks review.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0 before additional testing begins.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass start compatibility contract quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests; Start contract builder_

## Phase 4: Additional Testing and Documentation

- [ ] 4.1 [RED] Failing smoke: package verifier covers destructive git command regression cases
  - **Do**:
    1. Add smoke assertions that search generated branch/worktree command plans for destructive operations.
    2. Include default branch, non-default branch, dirty worktree, quick/autonomous, and interactive fixtures.
    3. Emit `START_FLOW_PARITY_RED` if any fixture is missing from coverage.
  - **Files**: `scripts/verify-start-flow-parity.mjs`, `extensions/ralph-specum/start-branch.ts`
  - **Done when**: Smoke fails until all AC-5.2 branch fixtures are covered.
  - **Verify**: `npm run prepack 2>&1 | grep -q "START_FLOW_PARITY_RED" && echo RED_PASS`
  - **Commit**: `test(start): red - require complete branch safety smoke coverage`
  - _Requirements: FR-11, NFR-1, AC-5.2_
  - _Design: Test Strategy; Security Considerations_

- [ ] 4.2 [GREEN] Pass smoke: complete branch safety fixture coverage
  - **Do**:
    1. Add missing fixture cases for default branch, non-default branch, dirty worktree, quick/autonomous mode, and interactive mode.
    2. Assert no fixture uses real destructive git operations.
    3. Keep fixtures isolated from the repository working tree.
  - **Files**: `scripts/verify-start-flow-parity.mjs`
  - **Done when**: All branch safety smoke coverage assertions pass.
  - **Verify**: `npm run prepack`
  - **Commit**: `test(start): green - cover branch safety smoke fixtures`
  - _Requirements: FR-11, AC-5.2_
  - _Design: Smoke verification script; Test Strategy_

- [ ] 4.3 [YELLOW] Refactor smoke verifier cleanup and temp fixture handling
  - **Do**:
    1. Ensure smoke fixtures use isolated temporary directories and remove them on success/failure.
    2. Add an internal cleanup assertion to the verifier.
    3. Keep failure output concise and deterministic.
  - **Files**: `scripts/verify-start-flow-parity.mjs`
  - **Done when**: Smoke verifier proves its temporary fixtures are cleaned up and package checks pass.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `refactor(start): yellow - harden smoke verifier cleanup`
  - _Requirements: FR-11, AC-5.1, AC-5.2_
  - _Design: Smoke verification script; Integration Tests_

- [ ] Q8 [VERIFY] Quality check: full smoke package verification
  - **Do**:
    1. Run package verification after the full smoke coverage cycle.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass full smoke quality checkpoint` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests_

- [ ] 4.4 [GREEN] Document `/ralph-new`, branch defaults, and `.gitignore` behavior
  - **Do**:
    1. Update README command documentation for `/ralph-new` compatibility with `/ralph-start`.
    2. Document quick/autonomous branch defaults and non-destructive safety expectations.
    3. Document required runtime `.gitignore` entries.
  - **Files**: `README.md`
  - **Done when**: README reflects the implemented command alias, branch behavior, and ignore-file behavior.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `docs(start): document start and new flow parity`
  - _Requirements: FR-1, FR-6, FR-10, AC-1.1, AC-2.4, AC-4.1_
  - _Design: File Structure; Technical Decisions_

## Phase 5: VE End-to-End Verification for Library/Pi Extension Package

- [ ] VE1 [VERIFY] Package/build verification startup using discovered `npm run prepack`
  - **Do**:
    1. Use `research.md` Verification Tooling row `npm script | npm run prepack | package.json` as the package startup/build verification surrogate for this library/Pi extension.
  - **Files**: None
  - **Done when**: `prepack` runs the start-flow smoke verifier and publish-bundle verifier successfully.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(start): pass package startup verification` (if fixes needed)
  - _Requirements: FR-11, NFR-4, AC-5.1, AC-5.2, AC-5.3_
  - _Design: Integration Tests; E2E Tests_

- [ ] VE2 [VERIFY] Package dry-run verification using discovered `npm run verify:pack`
  - **Do**:
    1. Use `research.md` Verification Tooling row `npm script | npm run verify:pack | package.json` to verify the package dry-run after implementation.
  - **Files**: None
  - **Done when**: Package dry-run verification exits 0 with implemented start/new files included as expected.
  - **Verify**: `npm run verify:pack`
  - **Commit**: `chore(start): pass package dry run verification` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Integration Tests; E2E Tests_

- [ ] VE3 [VERIFY] Smoke fixture cleanup evidence using discovered `npm run prepack`
  - **Do**:
    1. Use the smoke verifier cleanup assertions introduced in task 4.3 and run them through the research-discovered `npm run prepack` command.
  - **Files**: None
  - **Done when**: Smoke fixtures create no persistent temp artifacts and `prepack` exits 0.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(start): verify smoke fixture cleanup` (if fixes needed)
  - _Requirements: FR-11, AC-5.1, AC-5.2_
  - _Design: Smoke verification script; Integration Tests_

## Phase 6: Quality Gates

- [ ] V4 [VERIFY] Full local CI
  - **Do**:
    1. Run all research-discovered local package verification commands.
  - **Files**: None
  - **Done when**: Both commands exit 0 after all implementation and documentation changes.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass full local verification` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Quality Gates; Integration Tests_

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Use package dry-run verification as the CI surrogate because `research.md` found no `.github/workflows` directory or CI command.
  - **Files**: None
  - **Done when**: Package dry-run verification exits 0.
  - **Verify**: `npm run verify:pack`
  - **Commit**: `chore(start): pass ci surrogate verification` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: Quality Gates; Test Strategy_

- [ ] V6 [VERIFY] AC checklist
  - **Do**:
    1. Run the smoke verifier through `prepack` to cover AC-1.1 through AC-5.2.
    2. Run package dry-run verification to cover AC-5.3.
  - **Files**: None
  - **Done when**: Automated smoke and package checks cover all acceptance criteria and exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): pass acceptance checklist verification` (if fixes needed)
  - _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-2.5, AC-3.1, AC-3.2, AC-3.3, AC-3.4, AC-4.1, AC-4.2, AC-4.3, AC-5.1, AC-5.2, AC-5.3_
  - _Design: Quality Gates; Test Strategy_

## Phase 7: PR Lifecycle Readiness

- [ ] 7.1 [VERIFY] PR readiness package gate
  - **Do**:
    1. Confirm the working implementation is ready for repository review using the discovered local verification commands.
    2. Ensure no task requires edits under the legacy Smart Ralph plugin path.
  - **Files**: None
  - **Done when**: Local package verification is green and the implementation is review-ready.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): prepare start parity changes for review` (if fixes needed)
  - _Requirements: NFR-4, NFR-5, AC-5.3_
  - _Design: Quality Gates; File Structure_

- [ ] 7.2 [VERIFY] Post-review fix loop gate
  - **Do**:
    1. After any review fixes, rerun the discovered local verification commands.
    2. Keep fixes scoped to files listed in this plan unless a reviewer requests an explicitly related source file.
  - **Files**: None
  - **Done when**: Local verification remains green after review fixes.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(start): verify review fixes` (if fixes needed)
  - _Requirements: NFR-4, AC-5.3_
  - _Design: PR Lifecycle; Quality Gates_

## Unresolved Questions
- None blocking implementation. Research found no CI workflow, PR CLI, browser/devtools MCP, database MCP, or dedicated E2E runner, so PR lifecycle and VE verification are limited to the discovered package verification commands.

## Notes
- POC shortcuts: None; this is a TDD parity implementation, not a GREENFIELD POC.
- Production TODOs: Keep the smoke verifier no-dependency unless a future spec introduces an approved test runner; do not rebuild `/ralph-index` in this spec; do not edit legacy Smart Ralph plugin/runtime files.
