# Tasks: Indexing Command Parity

## Phase 1: Red-Green-Yellow Cycles

- [x] 1.1 [RED] Failing test: unknown `/ralph-index` option is rejected
  - **Do**:
    1. Create the index parity verifier with a `parser-unknown` case.
    2. Import the future indexing helper and assert unsupported options produce an error naming the option.
    3. Make the verifier print `EXPECTED_FAIL` when the behavior is absent.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for the expected missing parser behavior.
  - **Verify**: `node scripts/verify-index-parity.mjs --case parser-unknown 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - reject unknown options`
  - _Requirements: FR-2, AC-1.3_
  - _Design: Index option parser; Smoke verifier_

- [x] 1.2 [GREEN] Pass test: implement minimal index option parser errors
  - **Do**:
    1. Create `extensions/ralph-specum/indexing.ts`.
    2. Export `parseIndexArgs` with hand-rolled option parsing.
    3. Return a non-ok result for unsupported flags including the unsupported option name.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: The `parser-unknown` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case parser-unknown`
  - **Commit**: `feat(index): green - reject unknown options`
  - _Requirements: FR-2, AC-1.3_
  - _Design: Index option parser_

- [x] 1.3 [YELLOW] Refactor: stabilize parser result shape
  - **Do**:
    1. Add explicit parser result types and defaults.
    2. Keep parser behavior dependency-free.
    3. Remove duplicated option validation branches.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: Parser output is stable and the unknown-option verifier remains green.
  - **Verify**: `node scripts/verify-index-parity.mjs --case parser-unknown`
  - **Commit**: `refactor(index): yellow - stabilize parser results`
  - _Requirements: FR-2, NFR-5, AC-1.3_
  - _Design: Index option parser; Technical Decisions_

- [x] Q1 [VERIFY] Quality check: package verification baseline
  - **Do**:
    1. Run package verification commands discovered in research.md Quality Commands.
  - **Files**: None
  - **Done when**: `npm run prepack` and `npm run verify:pack` exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass quality checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy; Existing Patterns to Follow_

- [x] 1.4 [RED] Failing test: parity flags parse and invalid flag combinations fail
  - **Do**:
    1. Add a `parser-options` verifier case for `--path`, `--type`, `--exclude`, `--dry-run`, `--force`, `--changed`, and `--quick`.
    2. Assert comma-list `--type` and repeated `--exclude` values are preserved.
    3. Assert `--force --changed` fails before scanning.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for missing option support.
  - **Verify**: `node scripts/verify-index-parity.mjs --case parser-options 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - parse parity flags`
  - _Requirements: FR-2, AC-1.2, AC-1.3_
  - _Design: Index option parser; Error Handling_

- [x] 1.5 [GREEN] Pass test: support parity flags and conflict validation
  - **Do**:
    1. Parse all supported parity flags without a new CLI parser dependency.
    2. Normalize categories and exclude patterns.
    3. Reject `--force --changed` with a fatal validation error.
  - **Files**: `extensions/ralph-specum/indexing.ts`
  - **Done when**: The `parser-options` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case parser-options`
  - **Commit**: `feat(index): green - parse parity flags`
  - _Requirements: FR-2, NFR-5, AC-1.2, AC-1.3_
  - _Design: Index option parser; Error Handling_

- [x] 1.6 [YELLOW] Refactor: isolate token normalization helpers
  - **Do**:
    1. Extract category and pattern normalization helpers.
    2. Add readable error messages for missing option values.
    3. Keep exported parser API unchanged.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: Parser helper names reflect their responsibility and verifier cases stay green.
  - **Verify**: `node scripts/verify-index-parity.mjs --case parser-unknown && node scripts/verify-index-parity.mjs --case parser-options`
  - **Commit**: `refactor(index): yellow - isolate option normalization`
  - _Requirements: FR-2, AC-1.2, AC-1.3_
  - _Design: Index option parser; Existing Patterns to Follow_

- [x] Q2 [VERIFY] Quality check: parser package verification
  - **Do**:
    1. Run discovered package verification commands after parser changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass parser quality checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [x] 1.7 [RED] Failing test: configured spec root index paths and state alias
  - **Do**:
    1. Add a `paths` verifier case using temp project and temp spec roots.
    2. Assert canonical state is `<specRoot>/.index/index-state.json`.
    3. Assert compatibility reads from `<specRoot>/.index/.index-state.json`.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for missing path resolver behavior.
  - **Verify**: `node scripts/verify-index-parity.mjs --case paths 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - resolve index paths`
  - _Requirements: FR-8, FR-9, AC-4.1, AC-4.4_
  - _Design: Index path resolver; Technical Decisions_

- [x] 1.8 [GREEN] Pass test: implement index path resolver and alias state read
  - **Do**:
    1. Resolve scan paths from `--path` and output paths from the configured spec root.
    2. Add canonical index root, state, summary, component, and external path helpers.
    3. Read prior state from the canonical file or compatibility alias.
  - **Files**: `extensions/ralph-specum/indexing.ts`
  - **Done when**: The `paths` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case paths`
  - **Commit**: `feat(index): green - resolve index artifact paths`
  - _Requirements: FR-8, FR-9, NFR-4, AC-4.1, AC-4.4_
  - _Design: Index path resolver_

- [x] 1.9 [YELLOW] Refactor: centralize path safety checks
  - **Do**:
    1. Add a shared output containment assertion for `.index/` artifacts.
    2. Normalize display paths for inside and outside repository scan roots.
    3. Keep alias read-only and canonical write-only behavior explicit.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: Path helper responsibilities are centralized and path verifier stays green.
  - **Verify**: `node scripts/verify-index-parity.mjs --case paths`
  - **Commit**: `refactor(index): yellow - centralize path safety`
  - _Requirements: FR-8, FR-9, NFR-4, AC-4.4_
  - _Design: Index path resolver; Security Considerations_

- [x] Q3 [VERIFY] Quality check: path package verification
  - **Do**:
    1. Run discovered package verification commands after path resolver changes.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass path quality checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [x] 1.10 [RED] Failing test: scan services, excludes, and hashes
  - **Do**:
    1. Add a `scanner` verifier case with service, controller, and excluded files.
    2. Assert `--type services` returns only matching service files.
    3. Assert source hashes and normalized source paths are present.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for missing scanner behavior.
  - **Verify**: `node scripts/verify-index-parity.mjs --case scanner 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - scan typed components`
  - _Requirements: FR-5, FR-7, FR-10, AC-3.1, AC-3.4_
  - _Design: Component scanner_

- [x] 1.11 [GREEN] Pass test: implement recursive component scanner
  - **Do**:
    1. Recursively scan readable files under the scan path.
    2. Classify controllers, services, models, helpers, migrations, and other files.
    3. Apply excludes before hashing and candidate creation.
  - **Files**: `extensions/ralph-specum/indexing.ts`
  - **Done when**: The `scanner` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case scanner`
  - **Commit**: `feat(index): green - scan component files`
  - _Requirements: FR-5, FR-7, FR-10, AC-3.1, AC-3.4_
  - _Design: Component scanner; Performance Considerations_

- [x] 1.12 [YELLOW] Refactor: extract classifier and exclude matcher
  - **Do**:
    1. Extract category classifier from the recursive scanner.
    2. Extract simple wildcard exclude matcher without adding dependencies.
    3. Keep scanner output deterministic by sorting candidates.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: Scanner helpers are isolated and deterministic ordering is covered.
  - **Verify**: `node scripts/verify-index-parity.mjs --case scanner`
  - **Commit**: `refactor(index): yellow - isolate scanner helpers`
  - _Requirements: FR-5, FR-7, NFR-1, AC-3.1, AC-3.4_
  - _Design: Component scanner; Technical Decisions_

- [x] Q4 [VERIFY] Quality check: scanner package verification
  - **Do**:
    1. Run discovered package verification commands after scanner changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass scanner quality checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [x] 1.13 [RED] Failing test: dry-run plans writes and writes nothing
  - **Do**:
    1. Add a `dry-run` verifier case with a temp fixture and temp spec root.
    2. Assert planned component, summary, and state actions are reported.
    3. Assert no `.index/` directory or files are created.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for missing dry-run planning behavior.
  - **Verify**: `node scripts/verify-index-parity.mjs --case dry-run 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - plan dry run without writes`
  - _Requirements: FR-3, FR-4, AC-2.1, AC-2.2_
  - _Design: Index planner; Atomic writer_

- [x] 1.14 [GREEN] Pass test: implement plan-first dry-run runner
  - **Do**:
    1. Add `runRalphIndex` orchestration over parser, paths, scanner, planner, and writer.
    2. Return planned writes for dry-run without creating directories.
    3. Include action names and planned paths in the run message.
  - **Files**: `extensions/ralph-specum/indexing.ts`
  - **Done when**: The `dry-run` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case dry-run`
  - **Commit**: `feat(index): green - plan dry runs without writes`
  - _Requirements: FR-3, FR-4, AC-2.1, AC-2.2_
  - _Design: Index planner; Data Flow_

- [x] 1.15 [YELLOW] Refactor: separate planner from writer
  - **Do**:
    1. Split planned-write creation from filesystem mutation.
    2. Keep `dryRun` handling in one writer guard.
    3. Add stable write kind values for component, external, summary, and state.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: Planner can be invoked without filesystem writes and dry-run verifier stays green.
  - **Verify**: `node scripts/verify-index-parity.mjs --case dry-run`
  - **Commit**: `refactor(index): yellow - split planner and writer`
  - _Requirements: FR-3, FR-4, NFR-2, AC-2.1, AC-2.2_
  - _Design: Index planner; Atomic writer_

- [x] Q5 [VERIFY] Quality check: dry-run package verification
  - **Do**:
    1. Run discovered package verification commands after dry-run changes.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass dry-run quality checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [x] 1.16 [RED] Failing test: component specs, state, and summary match contract
  - **Do**:
    1. Add a `render-contract` verifier case for non-dry-run indexing.
    2. Assert component frontmatter contains `type`, `generated`, `source`, `hash`, `category`, and `indexed`.
    3. Assert `index.md` and `index-state.json` counts match the run.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for missing contract artifact output.
  - **Verify**: `node scripts/verify-index-parity.mjs --case render-contract 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - validate index contract artifacts`
  - _Requirements: FR-6, FR-8, AC-3.2, AC-3.3, AC-4.1, AC-4.2, AC-4.3_
  - _Design: Template/frontmatter renderer; Index planner_

- [x] 1.17 [GREEN] Pass test: write component, state, and summary artifacts atomically
  - **Do**:
    1. Render component Markdown with schema-required frontmatter and template-equivalent body.
    2. Render `index-state.json` with component entries and run counts.
    3. Write create/update artifacts with temp-file-then-rename.
  - **Files**: `extensions/ralph-specum/indexing.ts`
  - **Done when**: The `render-contract` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case render-contract`
  - **Commit**: `feat(index): green - write contract artifacts`
  - _Requirements: FR-6, FR-8, NFR-2, AC-3.2, AC-3.3, AC-4.1, AC-4.2, AC-4.3_
  - _Design: Template/frontmatter renderer; Atomic writer_

- [x] 1.18 [YELLOW] Refactor: align renderers with packaged templates and schema names
  - **Do**:
    1. Read packaged template files when available and keep inline fallback minimal.
    2. Keep frontmatter key names aligned with `schemas/spec.schema.json`.
    3. Ensure generated artifact filenames are stable for duplicate basenames.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: Contract verifier stays green and renderer fallback behavior is explicit.
  - **Verify**: `node scripts/verify-index-parity.mjs --case render-contract`
  - **Commit**: `refactor(index): yellow - align renderers with packaged templates`
  - _Requirements: FR-6, FR-8, NFR-1, AC-3.2, AC-3.3, AC-4.2_
  - _Design: Template/frontmatter renderer; File Structure_

- [x] Q6 [VERIFY] Quality check: contract package verification
  - **Do**:
    1. Run discovered package verification commands after contract artifact changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass contract quality checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [x] 1.19 [RED] Failing test: unchanged files skip and force updates
  - **Do**:
    1. Add a `hash-skip-force` verifier case that runs the same fixture twice.
    2. Assert the second run reports `skip` and preserves component content or mtime.
    3. Assert a `--force` run reports `update` for unchanged sources.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for missing hash-skip behavior.
  - **Verify**: `node scripts/verify-index-parity.mjs --case hash-skip-force 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - skip unchanged artifacts`
  - _Requirements: FR-10, AC-5.1, AC-5.2_
  - _Design: Index planner; Atomic writer_

- [ ] 1.20 [GREEN] Pass test: implement hash-skip and force planning
  - **Do**:
    1. Compare current source hashes to prior state/frontmatter hashes.
    2. Plan `skip` for unchanged artifacts unless `--force` is set.
    3. Preserve skipped artifact content and write updated state counts.
  - **Files**: `extensions/ralph-specum/indexing.ts`
  - **Done when**: The `hash-skip-force` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case hash-skip-force`
  - **Commit**: `feat(index): green - skip unchanged artifacts`
  - _Requirements: FR-10, NFR-1, AC-5.1, AC-5.2_
  - _Design: Index planner; Edge Cases_

- [ ] 1.21 [YELLOW] Refactor: make action selection deterministic
  - **Do**:
    1. Extract action selection for create, update, and skip.
    2. Preserve deterministic counts for component and state entries.
    3. Add helper comments explaining allowed timestamp drift.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: Hash-skip behavior is isolated and verifier stays green.
  - **Verify**: `node scripts/verify-index-parity.mjs --case hash-skip-force`
  - **Commit**: `refactor(index): yellow - isolate action selection`
  - _Requirements: FR-10, NFR-1, AC-5.1, AC-5.2_
  - _Design: Index planner_

- [ ] Q7 [VERIFY] Quality check: hash package verification
  - **Do**:
    1. Run discovered package verification commands after hash-skip changes.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass hash quality checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [ ] 1.22 [RED] Failing test: `--changed` requires Git and filters changed files
  - **Do**:
    1. Add a `changed-git` verifier case using a temp non-Git directory and temp Git repo.
    2. Assert non-Git `--changed` errors with a Git worktree message.
    3. Assert only paths from `git diff --name-only` are indexed inside the temp repo.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for missing changed-file behavior.
  - **Verify**: `node scripts/verify-index-parity.mjs --case changed-git 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - filter changed files`
  - _Requirements: FR-11, AC-5.3, AC-5.4_
  - _Design: Git changed filter_

- [ ] 1.23 [GREEN] Pass test: implement Git worktree and diff filtering
  - **Do**:
    1. Use `git rev-parse --show-toplevel` to require a worktree.
    2. Use `git diff --name-only` to collect changed files.
    3. Intersect changed files with scan path, type filters, and excludes.
  - **Files**: `extensions/ralph-specum/indexing.ts`
  - **Done when**: The `changed-git` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case changed-git`
  - **Commit**: `feat(index): green - filter changed files`
  - _Requirements: FR-11, AC-5.3, AC-5.4_
  - _Design: Git changed filter; Security Considerations_

- [ ] 1.24 [YELLOW] Refactor: isolate Git command execution
  - **Do**:
    1. Wrap Git calls in a small helper using argument arrays.
    2. Keep Git error messages stable for verifier assertions.
    3. Avoid destructive Git operations in verifier fixtures.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: Git helper is isolated and changed-file verifier stays green.
  - **Verify**: `node scripts/verify-index-parity.mjs --case changed-git`
  - **Commit**: `refactor(index): yellow - isolate git changed filter`
  - _Requirements: FR-11, AC-5.3, AC-5.4_
  - _Design: Git changed filter; Security Considerations_

- [ ] Q8 [VERIFY] Quality check: changed-files package verification
  - **Do**:
    1. Run discovered package verification commands after Git filtering changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass changed-files quality checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [ ] 1.25 [RED] Failing test: external resources use Pi-native lazy seams
  - **Do**:
    1. Add an `external-adapters` verifier case.
    2. Assert package resource indexing reads `references/ralph-resource-manifest.v1.json`.
    3. Assert URL/MCP adapter mocks are called only when explicit inputs are supplied and failures are recorded as recoverable errors.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for missing external adapter behavior.
  - **Verify**: `node scripts/verify-index-parity.mjs --case external-adapters 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - index external resources lazily`
  - _Requirements: FR-12, FR-13, AC-6.1, AC-6.2, AC-6.3, AC-6.4_
  - _Design: External resource adapters_

- [ ] 1.26 [GREEN] Pass test: implement package resource and lazy URL/MCP adapters
  - **Do**:
    1. Add package resource external entries from the Ralph resource manifest and package resource directories.
    2. Add URL and MCP provider seams invoked only for explicit helper inputs.
    3. Render external frontmatter with `type`, `generated`, `source-type`, `source-id`, and `fetched`.
  - **Files**: `extensions/ralph-specum/indexing.ts`
  - **Done when**: The `external-adapters` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case external-adapters`
  - **Commit**: `feat(index): green - index external resources lazily`
  - _Requirements: FR-12, FR-13, AC-6.1, AC-6.2, AC-6.3, AC-6.4_
  - _Design: External resource adapters; Template/frontmatter renderer_

- [ ] 1.27 [YELLOW] Refactor: separate recoverable external errors from fatal run errors
  - **Do**:
    1. Normalize external error entries in state and summary.
    2. Ensure component indexing can succeed when one external resource fails.
    3. Keep MCP provider access lazy and injectable for verifier mocks.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: External adapter verifier stays green and error handling is explicit.
  - **Verify**: `node scripts/verify-index-parity.mjs --case external-adapters`
  - **Commit**: `refactor(index): yellow - isolate external error handling`
  - _Requirements: FR-12, FR-13, AC-6.2, AC-6.3_
  - _Design: External resource adapters; Error Handling_

- [ ] Q9 [VERIFY] Quality check: external package verification
  - **Do**:
    1. Run discovered package verification commands after external adapter changes.
  - **Files**: None
  - **Done when**: Both commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass external quality checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [ ] 1.28 [RED] Failing test: `/ralph-index` is registered and documented
  - **Do**:
    1. Add a `command-registration` verifier case that inspects `extensions/ralph-specum/index.ts`.
    2. Assert `pi.registerCommand("ralph-index", ...)` is present.
    3. Assert help/status text mentions `/ralph-index` and documented parity flags.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails because command registration is absent.
  - **Verify**: `node scripts/verify-index-parity.mjs --case command-registration 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - verify command registration`
  - _Requirements: FR-1, FR-2, AC-1.1, AC-1.2_
  - _Design: `/ralph-index` command registration_

- [ ] 1.29 [GREEN] Pass test: register `/ralph-index` command and help text
  - **Do**:
    1. Import the indexing runner into `extensions/ralph-specum/index.ts`.
    2. Register `ralph-index` with a Pi-native command handler.
    3. Add help/status documentation for supported parity flags.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/indexing.ts`
  - **Done when**: The `command-registration` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case command-registration`
  - **Commit**: `feat(index): green - register ralph index command`
  - _Requirements: FR-1, FR-2, AC-1.1, AC-1.2_
  - _Design: `/ralph-index` command registration; Existing Patterns to Follow_

- [ ] 1.30 [YELLOW] Refactor: keep command layer thin
  - **Do**:
    1. Move command formatting details that can be tested into `indexing.ts`.
    2. Keep Pi notification handling in `index.ts` only.
    3. Confirm no legacy Smart Ralph plugin files are edited.
  - **Files**: `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: Command handler delegates to the runner and registration verifier stays green.
  - **Verify**: `node scripts/verify-index-parity.mjs --case command-registration`
  - **Commit**: `refactor(index): yellow - keep command layer thin`
  - _Requirements: FR-1, FR-15, AC-1.1, AC-7.3_
  - _Design: `/ralph-index` command registration; Architecture_

- [ ] Q10 [VERIFY] Quality check: command registration package verification
  - **Do**:
    1. Run discovered package verification commands after command registration changes.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass command quality checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [ ] 1.31 [RED] Failing test: package script wiring runs index verifier
  - **Do**:
    1. Add a `package-wiring` verifier case that inspects `package.json`.
    2. Assert `verify:index` runs `scripts/verify-index-parity.mjs`.
    3. Assert `prepack` includes the index verifier or `npm run verify:index`.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails because package wiring is absent.
  - **Verify**: `node scripts/verify-index-parity.mjs --case package-wiring 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - verify package wiring`
  - _Requirements: FR-14, AC-7.1, AC-7.2_
  - _Design: Smoke verifier; Technical Decisions_

- [ ] 1.32 [GREEN] Pass test: add `verify:index` and wire it into `prepack`
  - **Do**:
    1. Add a `verify:index` package script that runs the index verifier.
    2. Update `prepack` to execute the index verifier with existing verifiers.
    3. Keep `verify:pack` unchanged.
  - **Files**: `package.json`, `scripts/verify-index-parity.mjs`
  - **Done when**: The `package-wiring` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case package-wiring`
  - **Commit**: `chore(index): green - wire index verifier`
  - _Requirements: FR-14, AC-7.1, AC-7.2_
  - _Design: Smoke verifier; File Structure_

- [ ] 1.33 [YELLOW] Refactor: make verifier default run all index cases
  - **Do**:
    1. Add default all-case execution for `scripts/verify-index-parity.mjs`.
    2. Keep `--case` support for focused TDD checks.
    3. Print concise pass/fail summaries for package script output.
  - **Files**: `scripts/verify-index-parity.mjs`, `package.json`
  - **Done when**: Focused cases and default verifier execution both work.
  - **Verify**: `node scripts/verify-index-parity.mjs && npm run verify:index`
  - **Commit**: `refactor(index): yellow - finalize verifier runner`
  - _Requirements: FR-14, AC-7.1, AC-7.2_
  - _Design: Smoke verifier; Test Strategy_

## Phase 2: Additional Testing

- [ ] 2.1 [RED] Failing test: dry-run preserves existing index files and mtimes
  - **Do**:
    1. Add a `dry-run-existing` verifier case with a pre-existing `.index/` fixture.
    2. Assert dry-run returns planned writes but does not change state, Markdown content, or mtimes.
    3. Print `EXPECTED_FAIL` until preservation behavior is implemented.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for missing existing-index dry-run preservation.
  - **Verify**: `node scripts/verify-index-parity.mjs --case dry-run-existing 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - preserve existing index on dry run`
  - _Requirements: FR-4, AC-2.3_
  - _Design: Atomic writer; Edge Cases_

- [ ] 2.2 [GREEN] Pass test: prevent all dry-run filesystem mutation
  - **Do**:
    1. Guard directory creation and temp-file writes behind non-dry-run execution.
    2. Ensure state read does not rewrite corrupt or alias state during dry-run.
    3. Preserve skipped artifact mtimes.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: The `dry-run-existing` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case dry-run-existing`
  - **Commit**: `fix(index): green - preserve existing index during dry run`
  - _Requirements: FR-4, NFR-2, AC-2.3_
  - _Design: Atomic writer; Error Handling_

- [ ] 2.3 [RED] Failing test: output path escape is rejected
  - **Do**:
    1. Add a `path-safety` verifier case with a crafted artifact path escape attempt.
    2. Assert the run fails before writing outside `<specRoot>/.index/`.
    3. Assert no escaped file is created.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The verifier case fails for missing path-safety enforcement.
  - **Verify**: `node scripts/verify-index-parity.mjs --case path-safety 2>&1 | grep -q "EXPECTED_FAIL"`
  - **Commit**: `test(index): red - reject output path escapes`
  - _Requirements: FR-9, NFR-4, AC-4.4_
  - _Design: Index path resolver; Security Considerations_

- [ ] 2.4 [GREEN] Pass test: enforce `.index/` output containment before writes
  - **Do**:
    1. Apply containment checks to every planned write path.
    2. Fail the run on any path outside the resolved index root.
    3. Keep scan paths read-only even when outside the repository.
  - **Files**: `extensions/ralph-specum/indexing.ts`, `scripts/verify-index-parity.mjs`
  - **Done when**: The `path-safety` verifier case passes.
  - **Verify**: `node scripts/verify-index-parity.mjs --case path-safety`
  - **Commit**: `fix(index): green - enforce index output containment`
  - _Requirements: FR-9, NFR-4, AC-4.4_
  - _Design: Index path resolver; Security Considerations_

- [ ] Q11 [VERIFY] Quality check: additional behavior package verification
  - **Do**:
    1. Run discovered package verification commands after additional behavior checks.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass additional testing checkpoint` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

## Phase 3: E2E Verification

- [ ] VE1 [VERIFY] Startup/build verification: package prepack includes index verifier
  - **Do**:
    1. Run the discovered `npm run prepack` package verification command from research.md Quality Commands.
    2. Confirm it executes the dedicated index verifier added by this spec.
  - **Files**: None
  - **Done when**: `npm run prepack` exits 0 and includes index smoke coverage from the package script wiring.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(index): pass prepack verification` (if fixes needed)
  - _Requirements: FR-14, AC-7.2, AC-7.3_
  - _Design: Test Strategy; Smoke verifier_

- [ ] VE2 [VERIFY] Behavior verification: focused index smoke suite
  - **Do**:
    1. Run the dedicated index verifier script based on research.md fixture scanner, dry-run, and changed-files smoke rows.
    2. Confirm all focused fixture cases pass in one run.
  - **Files**: None
  - **Done when**: The index verifier exits 0 across dry-run, generation, skip/force, changed, schema/frontmatter, and registration cases.
  - **Verify**: `npm run verify:index`
  - **Commit**: `chore(index): pass index smoke verification` (if fixes needed)
  - _Requirements: FR-14, AC-7.1, AC-7.2_
  - _Design: Test Strategy; Smoke verifier_

- [ ] VE3 [VERIFY] Cleanup verification: temp fixture cleanup is automatic
  - **Do**:
    1. Run the verifier cleanup case based on the research.md temp-fixture smoke strategy.
    2. Assert verifier-created temporary directories are removed by the verifier.
  - **Files**: None
  - **Done when**: The cleanup case exits 0 with no persistent verifier temp fixture paths.
  - **Verify**: `node scripts/verify-index-parity.mjs --case cleanup`
  - **Commit**: `chore(index): pass verifier cleanup check` (if fixes needed)
  - _Requirements: FR-14, NFR-3, AC-7.1_
  - _Design: Test Strategy; Performance Considerations_

## Phase 4: Quality Gates

- [ ] V4 [VERIFY] Full local CI
  - **Do**:
    1. Run all discovered local package verification commands.
  - **Files**: None
  - **Done when**: `npm run prepack` and `npm run verify:pack` exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): pass full local ci` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Re-run the discovered package verification command set used as the repository CI substitute in research.md.
  - **Files**: None
  - **Done when**: The package verification command set exits 0 with no failing verifier output.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(index): confirm ci-equivalent verification` (if fixes needed)
  - _Requirements: FR-14, AC-7.3_
  - _Design: Test Strategy_

- [ ] V6 [VERIFY] AC checklist
  - **Do**:
    1. Add and run an `acceptance-checklist` verifier case covering the acceptance criteria that can be asserted from generated fixtures and source inspection.
    2. Confirm command registration, dry-run, component artifacts, state/summary, skip/force, changed, external seams, and package wiring all pass.
  - **Files**: `scripts/verify-index-parity.mjs`
  - **Done when**: The automated acceptance checklist exits 0.
  - **Verify**: `node scripts/verify-index-parity.mjs --case acceptance-checklist`
  - **Commit**: `test(index): verify acceptance checklist` (if fixes needed)
  - _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15_
  - _Design: Test Strategy; Architecture_

## Phase 5: PR Lifecycle

- [ ] 5.1 [VERIFY] Commit readiness check
  - **Do**:
    1. Run final discovered package verification commands before handoff.
    2. Confirm no generated temp fixture files are left in the repository.
  - **Files**: None
  - **Done when**: Verification commands exit 0 and verifier cleanup has passed.
  - **Verify**: `npm run prepack && npm run verify:pack && node scripts/verify-index-parity.mjs --case cleanup`
  - **Commit**: `chore(index): final verification before handoff` (if fixes needed)
  - _Requirements: FR-14, FR-15, AC-7.3_
  - _Design: Test Strategy; PR Lifecycle_

## Unresolved Questions
- Non-blocking: exact public CLI syntax for URL and MCP external inputs remains unresolved; tasks implement helper-level explicit inputs, lazy adapters, and deterministic package resource indexing until a public syntax is approved.
- Non-blocking: production policy for scanning paths outside the current repository follows the approved requirements assumption that readable local directories are allowed while writes remain under the configured spec root.

## Notes
- Intent Classification was missing in `.progress.md`; assumed `MID_SIZED` non-greenfield command parity work and used TDD Red-Green-Yellow.
- POC shortcuts: None.
- Production TODOs: finalize public URL/MCP input syntax if coordinator approves expanding beyond helper-level external inputs.
