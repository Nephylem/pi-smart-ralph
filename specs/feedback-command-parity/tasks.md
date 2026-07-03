# Tasks: Feedback Command Parity

## Phase 1: Red-Green-Yellow Cycles - Command surface and draft contract

- [x] 1.1 [RED] Failing verifier: `/ralph-feedback` registration and help text
  - **Do**:
    1. Create `scripts/verify-feedback-parity.mjs` with a `command-registration` case following the existing `scripts/verify-*.mjs` pattern.
    2. Assert `pi.registerCommand("ralph-feedback", ...)` exists and `/ralph-help` mentions safe feedback submission/preparation behavior.
  - **Files**: `scripts/verify-feedback-parity.mjs`
  - **Done when**: The verifier exists and fails because command registration/help text is still missing or incomplete.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case command-registration 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(feedback): red - add command registration verifier`
  - _Requirements: FR-1, FR-3, AC-4.1_
  - _Design: `extensions/ralph-specum/index.ts`; `scripts/verify-feedback-parity.mjs`_

- [x] 1.2 [GREEN] Pass test: register `/ralph-feedback` and initial help text
  - **Do**:
    1. Create `extensions/ralph-specum/feedback.ts` with the minimum exported command helpers the verifier needs.
    2. Register `ralph-feedback` in `extensions/ralph-specum/index.ts` and add matching `/ralph-help` text.
    3. Keep the first implementation draft-only; no confirmed write path yet.
  - **Files**: `extensions/ralph-specum/feedback.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The command-registration verifier passes.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case command-registration`
  - **Commit**: `feat(feedback): green - register feedback command`
  - _Requirements: FR-1, FR-3, AC-4.1_
  - _Design: `extensions/ralph-specum/index.ts`; `extensions/ralph-specum/feedback.ts`_

- [x] 1.3 [YELLOW] Refactor: centralize usage text and command metadata
  - **Do**:
    1. Move usage/help constants and thin command-surface helpers into `feedback.ts`.
    2. Keep `index.ts` focused on Pi wiring only.
  - **Files**: `extensions/ralph-specum/feedback.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Command/help text stays green and the feedback module exposes a small stable surface.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case command-registration`
  - **Commit**: `refactor(feedback): yellow - extract command metadata helpers`
  - _Requirements: FR-1, FR-3, AC-4.1_
  - _Design: `extensions/ralph-specum/feedback.ts` deep module_

- [x] Q1 [VERIFY] Quality check: command surface verifier
  - **Do**:
    1. Run the dedicated verifier for registration/help behavior.
    2. Run the research `source inspection` row for command registration in `extensions/ralph-specum/index.ts`.
  - **Files**: None
  - **Done when**: The verifier exits `0` and source inspection finds the command registration.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case command-registration && grep -n 'registerCommand("ralph-feedback"' extensions/ralph-specum/index.ts`
  - **Commit**: `chore(feedback): pass command surface checkpoint` (if fixes needed)
  - _Requirements: FR-1, FR-3, AC-4.1_
  - _Design: `scripts/verify-feedback-parity.mjs`; command registration pattern_

- [x] 1.4 [RED] Failing verifier: fixed repo draft contract and manual fallback
  - **Do**:
    1. Add a `draft-fallback` case to `scripts/verify-feedback-parity.mjs`.
    2. Assert `targetRepo` resolves from packaged `package.json` `bugs.url`, `sourceCommand = "/ralph-feedback"`, `confirmedBy = "unconfirmed"`, and the fallback prints the same draft fields plus a prefilled `issues/new` URL.
    3. Assert no fallback path points to `tzachbon/smart-ralph`.
  - **Files**: `scripts/verify-feedback-parity.mjs`
  - **Done when**: The verifier fails because fixed-repo draft generation and fallback rendering are incomplete.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case draft-fallback 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(feedback): red - add draft fallback verifier`
  - _Requirements: FR-2, FR-4, FR-5, AC-1.2, AC-1.3, AC-1.4_
  - _Design: `extensions/ralph-specum/feedback.ts`; package `bugs.url` target repo resolution_

- [x] 1.5 [GREEN] Pass test: implement fixed repo resolution and draft/fallback helpers
  - **Do**:
    1. Implement `resolveFeedbackTargetRepo`, `buildFeedbackDraft`, and `renderFeedbackFallback` in `feedback.ts`.
    2. Normalize `https://github.com/Nephylem/pi-smart-ralph/issues` to `Nephylem/pi-smart-ralph` and fail closed if `bugs.url` is invalid.
    3. Render fallback output with repo, title, body, labels, URL, `sourceCommand`, and `confirmedBy`.
  - **Files**: `extensions/ralph-specum/feedback.ts`, `scripts/verify-feedback-parity.mjs`
  - **Done when**: The draft-fallback verifier passes.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case draft-fallback`
  - **Commit**: `feat(feedback): green - build fixed repo feedback drafts`
  - _Requirements: FR-2, FR-4, FR-5, AC-1.2, AC-1.3, AC-1.4_
  - _Design: `extensions/ralph-specum/feedback.ts`; fixed target repo decision_

- [x] 1.6 [YELLOW] Refactor: isolate repo normalization and fallback rendering
  - **Do**:
    1. Extract repo normalization, title/body shaping, and URL encoding helpers.
    2. Keep fallback rendering deterministic for verifier assertions.
  - **Files**: `extensions/ralph-specum/feedback.ts`, `scripts/verify-feedback-parity.mjs`
  - **Done when**: Draft generation is cleaner and the draft-fallback verifier stays green.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case draft-fallback`
  - **Commit**: `refactor(feedback): yellow - normalize draft helpers`
  - _Requirements: FR-2, FR-4, FR-5, AC-1.2, AC-1.3, AC-1.4_
  - _Design: `extensions/ralph-specum/feedback.ts` deep module_

- [x] Q2 [VERIFY] Quality check: draft contract verifier
  - **Do**:
    1. Run the dedicated draft/fallback verifier.
    2. Confirm the fixed target repo remains package-metadata-driven.
  - **Files**: None
  - **Done when**: The draft-fallback verifier exits `0`.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case draft-fallback`
  - **Commit**: `chore(feedback): pass draft contract checkpoint` (if fixes needed)
  - _Requirements: FR-2, FR-4, FR-5, AC-1.2, AC-1.3, AC-1.4_
  - _Design: draft/fallback contract_

## Phase 2: Red-Green-Yellow Cycles - Input safety and confirmation

- [x] 2.1 [RED] Failing verifier: missing-message prompt and headless usage guard
  - **Do**:
    1. Add a `headless-input` case to `scripts/verify-feedback-parity.mjs` with stubbed UI and headless fixtures.
    2. Assert UI runs prompt once for missing message and headless runs stop with usage/no-write guidance before any GitHub write attempt.
  - **Files**: `scripts/verify-feedback-parity.mjs`
  - **Done when**: The verifier fails because missing-message prompt and headless guard behavior is incomplete.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case headless-input 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(feedback): red - add headless input verifier`
  - _Requirements: FR-7, AC-3.1, AC-3.2_
  - _Design: `extensions/ralph-specum/index.ts`; `feedback.ts` runtime interface_

- [x] 2.2 [GREEN] Pass test: implement prompt-first message resolution and headless stop
  - **Do**:
    1. Parse `/ralph-feedback [message] [--yes]` into a feedback command args shape.
    2. Prompt with `ctx.ui.input(...)` when the message is missing and UI exists.
    3. Return usage/no-write output when the message is missing in noninteractive mode.
  - **Files**: `extensions/ralph-specum/feedback.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The headless-input verifier passes.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case headless-input`
  - **Commit**: `feat(feedback): green - handle missing feedback input safely`
  - _Requirements: FR-7, AC-3.1, AC-3.2_
  - _Design: message-resolution flow; usage mode_

- [ ] 2.3 [YELLOW] Refactor: isolate runtime prompt helpers and usage results
  - **Do**:
    1. Extract runtime adapters for `input`, `confirm`, and no-write usage output.
    2. Keep prompt and headless result shapes easy to stub in the verifier.
  - **Files**: `extensions/ralph-specum/feedback.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Input handling is encapsulated and the headless-input verifier remains green.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case headless-input`
  - **Commit**: `refactor(feedback): yellow - extract input runtime helpers`
  - _Requirements: FR-7, AC-3.1, AC-3.2_
  - _Design: `feedback.ts` runtime surface_

- [ ] Q3 [VERIFY] Quality check: input safety verifier
  - **Do**:
    1. Run the verifier covering prompt and headless no-write behavior.
  - **Files**: None
  - **Done when**: The headless-input verifier exits `0`.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case headless-input`
  - **Commit**: `chore(feedback): pass input safety checkpoint` (if fixes needed)
  - _Requirements: FR-7, AC-3.1, AC-3.2_
  - _Design: input safety flow_

- [ ] 2.4 [RED] Failing verifier: confirmation gate and `confirmedBy` transitions
  - **Do**:
    1. Add a `confirmation-flow` case to `scripts/verify-feedback-parity.mjs`.
    2. Assert unconfirmed runs never invoke `gh issue create`, UI approval sets `confirmedBy = "ui"`, and `--yes` sets `confirmedBy = "yes-flag"`.
  - **Files**: `scripts/verify-feedback-parity.mjs`
  - **Done when**: The verifier fails because confirmation gating and `confirmedBy` transitions are incomplete.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case confirmation-flow 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(feedback): red - add confirmation flow verifier`
  - _Requirements: FR-2, FR-3, AC-1.1, AC-2.1, AC-2.2, AC-2.4_
  - _Design: confirmation gate; `FeedbackConfirmedBy`_

- [ ] 2.5 [GREEN] Pass test: implement UI/`--yes` confirmation gating
  - **Do**:
    1. Build the initial unconfirmed draft before any write path.
    2. Require Pi UI confirmation for interactive runs and `--yes` for noninteractive runs.
    3. Return fallback output unchanged when confirmation is withheld.
  - **Files**: `extensions/ralph-specum/feedback.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The confirmation-flow verifier passes.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case confirmation-flow`
  - **Commit**: `feat(feedback): green - gate feedback writes behind confirmation`
  - _Requirements: FR-2, FR-3, AC-1.1, AC-2.1, AC-2.2, AC-2.4_
  - _Design: confirmation data flow; draft-first execution_

- [ ] 2.6 [YELLOW] Refactor: extract authorization and draft-cloning helpers
  - **Do**:
    1. Centralize the decision that turns an unconfirmed draft into a confirmed draft.
    2. Keep user-facing no-write reasons stable for verifier assertions.
  - **Files**: `extensions/ralph-specum/feedback.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Confirmation logic is isolated and the confirmation-flow verifier stays green.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case confirmation-flow`
  - **Commit**: `refactor(feedback): yellow - isolate confirmation helpers`
  - _Requirements: FR-2, FR-3, AC-1.1, AC-2.1, AC-2.2, AC-2.4_
  - _Design: `feedback.ts` confirmation helpers_

- [ ] Q4 [VERIFY] Quality check: confirmation-flow verifier
  - **Do**:
    1. Run the dedicated confirmation verifier.
    2. Confirm no-write reasons stay aligned with the triage-style safety pattern.
  - **Files**: None
  - **Done when**: The confirmation-flow verifier exits `0`.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case confirmation-flow`
  - **Commit**: `chore(feedback): pass confirmation checkpoint` (if fixes needed)
  - _Requirements: FR-2, FR-3, AC-1.1, AC-2.1, AC-2.2, AC-2.4_
  - _Design: confirmation gate; triage safety precedent_

## Phase 3: Red-Green-Yellow Cycles - GitHub execution and package wiring

- [ ] 3.1 [RED] Failing verifier: GitHub readiness fallback and confirmed create args
  - **Do**:
    1. Add a `github-execution` case to `scripts/verify-feedback-parity.mjs` with mocked runner and readiness fixtures.
    2. Assert `gh` missing, auth failure, or repo detection failure returns manual fallback with zero writes.
    3. Assert confirmed create passes repo, title, body, and available labels only, then parses issue number/URL from mocked `gh` output.
  - **Files**: `scripts/verify-feedback-parity.mjs`
  - **Done when**: The verifier fails because readiness fallback and confirmed create behavior are incomplete.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case github-execution 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(feedback): red - add github execution verifier`
  - _Requirements: FR-4, FR-6, FR-8, AC-2.3, AC-3.3_
  - _Design: `feedback.ts` create path; shared GitHub adapter reuse_

- [ ] 3.2 [GREEN] Pass test: reuse GitHub helpers for readiness, labels, and confirmed create
  - **Do**:
    1. Reuse `detectGithub(...)`, `selectGithubLabels(...)`, `parseGithubIssueNumber(...)`, and the shared runner surface for confirmed writes.
    2. Call `gh issue create` only after confirmation succeeds.
    3. Surface created issue number/URL and fallback warnings through the feedback result.
  - **Files**: `extensions/ralph-specum/feedback.ts`, `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/github.ts`
  - **Done when**: The github-execution verifier passes.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case github-execution`
  - **Commit**: `feat(feedback): green - execute confirmed github feedback flow`
  - _Requirements: FR-4, FR-6, FR-8, AC-2.3, AC-3.3_
  - _Design: GitHub helper reuse; confirmed create flow_

- [ ] 3.3 [YELLOW] Refactor: isolate readiness warnings and create-result parsing
  - **Do**:
    1. Extract warning aggregation and issue-create result parsing helpers.
    2. Keep label filtering and parse-failure messaging deterministic.
  - **Files**: `extensions/ralph-specum/feedback.ts`, `extensions/ralph-specum/github.ts`
  - **Done when**: GitHub execution helpers are isolated and the github-execution verifier stays green.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case github-execution`
  - **Commit**: `refactor(feedback): yellow - isolate github execution helpers`
  - _Requirements: FR-4, FR-6, FR-8, AC-2.3, AC-3.3_
  - _Design: `feedback.ts` GitHub execution helpers_

- [ ] Q5 [VERIFY] Quality check: GitHub execution verifier
  - **Do**:
    1. Run the dedicated GitHub execution verifier.
    2. Run the research `source inspection` row for helper reuse in `extensions/ralph-specum/github.ts`.
  - **Files**: None
  - **Done when**: The verifier exits `0` and helper reuse source inspection remains available.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case github-execution && grep -n 'detectGithub\|githubIssueCreateArgs\|label list' extensions/ralph-specum/github.ts`
  - **Commit**: `chore(feedback): pass github execution checkpoint` (if fixes needed)
  - _Requirements: FR-4, FR-6, FR-8, AC-2.3, AC-3.3_
  - _Design: shared GitHub adapter reuse_

- [ ] 3.4 [RED] Failing verifier: README, package wiring, acceptance, and cleanup cases
  - **Do**:
    1. Add a `package-wiring` case to `scripts/verify-feedback-parity.mjs`.
    2. Assert `README.md` documents confirmation, `--yes`, manual fallback, fixed repo, and archived-original behavior.
    3. Assert `package.json` wires feedback parity through discovered `npm run verify:index` and `npm run verify:pack`, and that `acceptance-checklist` plus `cleanup` cases exist.
  - **Files**: `scripts/verify-feedback-parity.mjs`
  - **Done when**: The verifier fails because docs/package wiring are still incomplete.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case package-wiring 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(feedback): red - add package wiring verifier`
  - _Requirements: FR-1, FR-9, NFR-3, AC-4.2_
  - _Design: `README.md`; `package.json`; verifier script wiring_

- [ ] 3.5 [GREEN] Pass test: document behavior and wire feedback verifier into discovered package commands
  - **Do**:
    1. Update `README.md` with confirmation rules, `--yes`, fallback behavior, fixed repo targeting, and archived-original context.
    2. Update `package.json` so the feedback verifier runs through discovered `verify:index` and `verify:pack` entrypoints.
    3. Add `acceptance-checklist` and `cleanup` cases to `scripts/verify-feedback-parity.mjs`.
  - **Files**: `README.md`, `package.json`, `scripts/verify-feedback-parity.mjs`
  - **Done when**: The package-wiring verifier passes.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case package-wiring`
  - **Commit**: `docs(feedback): green - document and wire feedback parity`
  - _Requirements: FR-1, FR-9, NFR-3, AC-4.2_
  - _Design: docs update; package verification wiring_

- [ ] 3.6 [YELLOW] Refactor: align feedback verifier runner with existing parity-script conventions
  - **Do**:
    1. Normalize case parsing, summaries, and cleanup handling to match existing `scripts/verify-*.mjs` structure.
    2. Keep case names stable for later `verify:index` and `verify:pack` usage.
  - **Files**: `scripts/verify-feedback-parity.mjs`
  - **Done when**: The feedback verifier structure is consistent and the package-wiring verifier stays green.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case package-wiring`
  - **Commit**: `refactor(feedback): yellow - normalize verifier runner`
  - _Requirements: NFR-2, NFR-3, AC-4.2_
  - _Design: verifier script conventions_

- [ ] Q6 [VERIFY] Quality check: docs and package wiring
  - **Do**:
    1. Run the dedicated package-wiring verifier.
    2. Run the research-discovered package verification commands after feedback wiring is added.
  - **Files**: None
  - **Done when**: The package-wiring verifier, `npm run verify:index`, and `npm run verify:pack` all exit `0`.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case package-wiring && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(feedback): pass package wiring checkpoint` (if fixes needed)
  - _Requirements: FR-1, FR-9, NFR-2, NFR-3, AC-4.2_
  - _Design: package verification wiring; README docs_

## Phase 4: Additional Testing

- [ ] 4.1 [RED] Failing verifier: acceptance checklist bundles all feedback parity cases
  - **Do**:
    1. Expand `acceptance-checklist` in `scripts/verify-feedback-parity.mjs` to run command-registration, draft-fallback, headless-input, confirmation-flow, github-execution, and package-wiring assertions together.
    2. Make the case fail if any sub-case is missing from the bundle.
  - **Files**: `scripts/verify-feedback-parity.mjs`
  - **Done when**: The acceptance bundle fails because one or more required cases are not yet included or isolated correctly.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case acceptance-checklist 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(feedback): red - require bundled acceptance coverage`
  - _Requirements: NFR-1, NFR-2, AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-3.1, AC-3.2, AC-3.3, AC-4.1, AC-4.2_
  - _Design: `scripts/verify-feedback-parity.mjs` acceptance bundle_

- [ ] 4.2 [GREEN] Pass test: stabilize bundled acceptance coverage and fixture isolation
  - **Do**:
    1. Ensure the acceptance bundle runs all required sub-cases in one invocation.
    2. Fix any remaining fixture leakage or cross-case coupling surfaced by the bundle.
    3. Keep implementation changes limited to feedback flow files only if bundle failures expose a gap.
  - **Files**: `scripts/verify-feedback-parity.mjs`, `extensions/ralph-specum/feedback.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The acceptance-checklist verifier passes.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case acceptance-checklist`
  - **Commit**: `test(feedback): green - pass bundled acceptance coverage`
  - _Requirements: NFR-1, NFR-2, AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-3.1, AC-3.2, AC-3.3, AC-4.1, AC-4.2_
  - _Design: acceptance bundle; fixture-based verifier_

- [ ] 4.3 [YELLOW] Refactor: harden verifier cleanup and bundled case summaries
  - **Do**:
    1. Make `cleanup` remove verifier temp fixtures deterministically.
    2. Keep bundled summary output concise for package-script logs.
  - **Files**: `scripts/verify-feedback-parity.mjs`
  - **Done when**: Acceptance and cleanup cases are stable and deterministic.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case acceptance-checklist && node scripts/verify-feedback-parity.mjs --case cleanup`
  - **Commit**: `refactor(feedback): yellow - harden verifier cleanup`
  - _Requirements: NFR-2, NFR-3, AC-4.2_
  - _Design: verifier cleanup path; package-script summaries_

- [ ] Q7 [VERIFY] Quality check: bundled acceptance verifier
  - **Do**:
    1. Run the dedicated acceptance bundle after cleanup hardening.
  - **Files**: None
  - **Done when**: The acceptance-checklist verifier exits `0`.
  - **Verify**: `node scripts/verify-feedback-parity.mjs --case acceptance-checklist`
  - **Commit**: `chore(feedback): pass acceptance bundle checkpoint` (if fixes needed)
  - _Requirements: NFR-1, NFR-2, AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-3.1, AC-3.2, AC-3.3, AC-4.1, AC-4.2_
  - _Design: acceptance bundle_

## Phase 5: VE End-to-End Verification for Library/Pi extension package

- [ ] VE1 [VERIFY] Package verification startup/build proxy
  - **Do**:
    1. Use the research `Quality Commands` row `verify = npm run prepack` as the library-package startup/build proxy.
    2. Confirm the feedback verifier is now included through the discovered package verification path.
  - **Files**: None
  - **Done when**: `npm run prepack` exits `0` with feedback parity coverage included.
  - **Verify**: `npm run prepack`
  - **Commit**: None
  - _Requirements: NFR-3_
  - _Design: package verification wiring; library-package VE strategy_

- [ ] VE2 [VERIFY] Feedback parity acceptance flow
  - **Do**:
    1. Use the research `Verification Tooling` row `npm script | npm run verify:index | package.json` as the discovered acceptance runner.
    2. Confirm `verify:index` executes the feedback acceptance coverage added by this spec.
  - **Files**: None
  - **Done when**: `npm run verify:index` exits `0` and includes feedback acceptance coverage.
  - **Verify**: `npm run verify:index`
  - **Commit**: None
  - _Requirements: NFR-2, NFR-3_
  - _Design: `scripts/verify-feedback-parity.mjs` acceptance bundle; package wiring_

- [ ] VE3 [VERIFY] Feedback parity cleanup flow
  - **Do**:
    1. Use the research `Verification Tooling` row `npm script | npm run verify:pack | package.json` as the discovered cleanup gate.
    2. Confirm `verify:pack` executes the feedback cleanup coverage added by this spec.
  - **Files**: None
  - **Done when**: `npm run verify:pack` exits `0` and cleanup coverage passes.
  - **Verify**: `npm run verify:pack`
  - **Commit**: None
  - _Requirements: NFR-3_
  - _Design: verifier cleanup path; package wiring_

## Phase 6: Quality Gates

- [ ] V4 [VERIFY] Full local CI
  - **Do**:
    1. Run all research-discovered package verification commands after feedback parity is wired in.
  - **Files**: None
  - **Done when**: `npm run prepack`, `npm run verify:index`, and `npm run verify:pack` all exit `0`.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(feedback): pass full local verification` (if fixes needed)
  - _Requirements: NFR-3_
  - _Design: package verification wiring_

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Re-run the discovered package verification bundle as the repo CI-equivalent gate because research found no separate workflow command.
  - **Files**: None
  - **Done when**: The CI-equivalent package verification bundle exits `0`.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(feedback): confirm ci-equivalent verification` (if fixes needed)
  - _Requirements: NFR-3_
  - _Design: repo verification policy; package verification bundle_

- [ ] V6 [VERIFY] AC checklist
  - **Do**:
    1. Run the bundled feedback acceptance coverage.
    2. Re-run the discovered package verification bundle.
    3. Keep the research `source inspection` command rows available through the acceptance coverage and prior checkpoints.
  - **Files**: None
  - **Done when**: Acceptance coverage passes and the package verification bundle remains green.
  - **Verify**: `npm run verify:index && npm run prepack`
  - **Commit**: None
  - _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9; AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-3.1, AC-3.2, AC-3.3, AC-4.1, AC-4.2_
  - _Design: end-to-end feedback command plus verifier bundle_

## Phase 7: PR Lifecycle

- [ ] 7.1 [VERIFY] Review handoff gate
  - **Do**:
    1. Run final discovered package verification commands before review handoff.
    2. Confirm no legacy original-command files were edited.
  - **Files**: None
  - **Done when**: The implementation is review-ready with package verification green.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(feedback): prepare feedback parity changes for review` (if fixes needed)
  - _Requirements: NFR-3_
  - _Design: PR lifecycle; legacy-file guardrail_

- [ ] 7.2 [VERIFY] Post-review rerun gate
  - **Do**:
    1. After any review fixes, rerun the discovered package verification bundle.
    2. Keep fixes scoped to files listed in this plan unless a reviewer requests a directly related source file.
  - **Files**: None
  - **Done when**: Verification stays green after review fixes.
  - **Verify**: `npm run prepack && npm run verify:index && npm run verify:pack`
  - **Commit**: `chore(feedback): verify review fixes` (if fixes needed)
  - _Requirements: NFR-3_
  - _Design: PR lifecycle; package verification bundle_

## Unresolved Questions
- Non-blocking: when the `feedback` label is unavailable, should fallback output warn explicitly or silently omit it?
- Non-blocking: should manual fallback also print a copy-pasteable `gh issue create` command, or is the browser `issues/new` URL sufficient for MVP?

## Notes
- Workflow assumption: `.progress.md` has no explicit Intent Classification; infer `MID_SIZED` non-GREENFIELD command-parity work, so use TDD Red-Green-Yellow.
- Scoped task verification uses the dedicated `scripts/verify-feedback-parity.mjs`; broad gates use research-discovered `npm run prepack`, `npm run verify:index`, and `npm run verify:pack`.
- POC shortcuts: None.
- Production TODOs: revisit label-warning wording and optional fallback CLI command only if a later spec expands MVP behavior.
