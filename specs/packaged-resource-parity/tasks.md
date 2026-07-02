# Tasks: Packaged Resource Parity

Assumption: `.progress.md` has no Intent Classification; this plan treats the work as `MID_SIZED` because it changes existing package resources, verification, and docs. Workflow: TDD Red-Green-Yellow.

## Phase 0: Baseline

- [x] 0.1 [VERIFY] Establish package verification baseline
  - **Do**:
    1. Run the existing package verification command discovered in `research.md` Quality Commands.
    2. Record any pre-existing failures before changing files.
  - **Files**: None
  - **Done when**: Baseline package verifier behavior is known.
  - **Verify**: `npm run prepack`
  - **Commit**: None
  - _Requirements: NFR-1, NFR-4_
  - _Design: Prepack verifier_

## Phase 1: Manifest Fixture Contract

- [x] 1.1 [RED] Failing verifier: manifest file must exist and be an array
  - **Do**:
    1. Extend `scripts/verify-publish-bundle.mjs` to require `references/ralph-resource-manifest.v1.json`.
    2. Validate that the file parses as JSON and the top-level value is an array.
    3. Preserve the existing `Smart Ralph package verification failed:` aggregate failure format.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: `npm run prepack` fails because the manifest file is missing.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(resources): red - require resource manifest fixture`
  - _Requirements: FR-1, AC-1.1_
  - _Design: `RalphResourceManifestV1` fixture, Prepack verifier_

- [x] 1.2 [GREEN] Pass manifest presence check with an empty fixture
  - **Do**:
    1. Create `references/ralph-resource-manifest.v1.json` as a valid empty JSON array.
    2. Keep the file under the package-included `references/` root.
  - **Files**: `references/ralph-resource-manifest.v1.json`
  - **Done when**: Manifest presence and array-shape validation passes.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(resources): green - add resource manifest fixture`
  - _Requirements: FR-1, AC-1.1_
  - _Design: `RalphResourceManifestV1` fixture, File Structure_

- [x] 1.3 [YELLOW] Refactor manifest verifier helpers
  - **Do**:
    1. Extract manifest path constants and JSON parsing helpers inside `scripts/verify-publish-bundle.mjs`.
    2. Ensure parse failures include the manifest path in the aggregated failure item.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: Manifest validation is isolated and existing checks still pass.
  - **Verify**: `npm run prepack`
  - **Commit**: `refactor(resources): yellow - isolate manifest validation helpers`
  - _Requirements: FR-1, FR-9_
  - _Design: Prepack verifier, Error Handling_

- [x] C1 [VERIFY] Quality check: prepack after manifest bootstrap
  - **Do**:
    1. Run the discovered package verification command from `research.md` Quality Commands.
  - **Files**: None
  - **Done when**: `npm run prepack` exits 0.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(resources): pass manifest bootstrap checkpoint`
  - _Requirements: NFR-1, NFR-4_
  - _Design: Prepack verifier_

- [x] 1.4 [RED] Failing verifier: manifest entries must use the v1 shape
  - **Do**:
    1. Add entry validation for `originalPath`, `piPath`, `kind`, `status`, optional `sha256`, and optional `notes`.
    2. Add the finite `kind` and `status` sets from `design.md`.
    3. Temporarily add one invalid placeholder entry to the manifest to prove the verifier fails.
  - **Files**: `scripts/verify-publish-bundle.mjs`, `references/ralph-resource-manifest.v1.json`
  - **Done when**: `npm run prepack` fails for the invalid placeholder entry.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(resources): red - validate manifest entry shape`
  - _Requirements: FR-1, FR-3, AC-1.1, AC-1.3_
  - _Design: Interfaces, Error Handling_

- [x] 1.5 [GREEN] Pass v1 shape validation with a valid seed entry
  - **Do**:
    1. Replace the invalid placeholder with one valid `deferred` seed entry.
    2. Use source-root-relative `originalPath`, empty `piPath`, allowed `kind`, allowed `status`, and non-empty `notes`.
  - **Files**: `references/ralph-resource-manifest.v1.json`
  - **Done when**: Manifest entry shape and status validation passes.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(resources): green - seed manifest entry contract`
  - _Requirements: FR-1, FR-3, AC-1.1, AC-1.3_
  - _Design: Interfaces, Technical Decisions_

- [x] 1.6 [YELLOW] Improve manifest validation diagnostics
  - **Do**:
    1. Include entry indexes and `originalPath` values in manifest validation failures.
    2. Keep all failures aggregated under one package verification report.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: Diagnostics are actionable and verifier output remains stable.
  - **Verify**: `npm run prepack`
  - **Commit**: `refactor(resources): yellow - improve manifest diagnostics`
  - _Requirements: FR-3, FR-9_
  - _Design: Error Handling, Existing Patterns to Follow_

## Phase 2: Packaged Resource Roots

- [x] 2.1 [RED] Failing verifier: templates root must contain package files
  - **Do**:
    1. Add a prepack check that `templates/` contains at least one non-`.gitkeep` file.
    2. Make the failure mention `templates/` explicitly.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: `npm run prepack` fails because `templates/` is empty except `.gitkeep`.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(resources): red - require packaged templates`
  - _Requirements: FR-5, FR-9, AC-2.1, AC-3.1_
  - _Design: Packaged resource tree, Prepack verifier_

- [x] 2.2 [GREEN] Populate packaged templates from original resources
  - **Do**:
    1. Copy original non-prompt template markdown files into `templates/`.
    2. Preserve source names where Pi-safe.
    3. Leave prompt templates for the `prompts/` root task.
  - **Files**: `templates/**/*.md`
  - **Done when**: `templates/` has non-`.gitkeep` package files and prepack passes the template check.
  - **Verify**: `find agents extensions prompts references skills templates -maxdepth 3 -type f | sort && npm run prepack`
  - **Commit**: `feat(resources): green - package template resources`
  - _Requirements: FR-5, AC-2.1_
  - _Design: Packaged resource tree, File Structure_

- [x] 2.3 [RED] Failing verifier: prompts root must contain package files
  - **Do**:
    1. Add a prepack check that `prompts/` contains at least one non-`.gitkeep` file.
    2. Make the failure mention `prompts/` explicitly.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: `npm run prepack` fails because `prompts/` is empty except `.gitkeep`.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(resources): red - require packaged prompts`
  - _Requirements: FR-5, FR-9, AC-2.1, AC-3.1_
  - _Design: Packaged resource tree, Prepack verifier_

- [x] 2.4 [GREEN] Populate Pi prompt resources
  - **Do**:
    1. Copy or adapt original `templates/prompts/*.md` into `prompts/`.
    2. Keep prompt filenames predictable for Pi package consumers.
    3. Do not register original prompt files as executable commands.
  - **Files**: `prompts/*.md`
  - **Done when**: `prompts/` has non-`.gitkeep` package files and prepack passes the prompts check.
  - **Verify**: `find agents extensions prompts references skills templates -maxdepth 3 -type f | sort && npm run prepack`
  - **Commit**: `feat(resources): green - package prompt resources`
  - _Requirements: FR-5, FR-13, AC-2.1, AC-4.2_
  - _Design: Prompt resources, Security Considerations_

- [x] C2 [VERIFY] Quality check: prepack after templates and prompts
  - **Do**:
    1. Run the discovered package verification command from `research.md` Quality Commands.
  - **Files**: None
  - **Done when**: `npm run prepack` exits 0.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(resources): pass template prompt checkpoint`
  - _Requirements: NFR-1, NFR-4_
  - _Design: Prepack verifier_

- [x] 2.5 [RED] Failing verifier: references root must contain workflow references
  - **Do**:
    1. Add a prepack check that `references/` contains package files beyond `.gitkeep` and the manifest.
    2. Require the non-executable original command archive directory `references/original-commands/` to exist.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: `npm run prepack` fails because reference resources and original command archives are missing.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(resources): red - require packaged references`
  - _Requirements: FR-5, FR-13, AC-2.1, AC-4.2_
  - _Design: Original commands, Packaged resource tree_

- [x] 2.6 [GREEN] Populate workflow references and original command archives
  - **Do**:
    1. Copy original `references/*.md` files into `references/`.
    2. Copy original `commands/*.md` files into `references/original-commands/`.
    3. Keep archived command files outside any executable Pi command location.
  - **Files**: `references/*.md`, `references/original-commands/*.md`
  - **Done when**: Reference resources and original command archives exist and prepack passes.
  - **Verify**: `find agents extensions prompts references skills templates -maxdepth 3 -type f | sort && npm run prepack`
  - **Commit**: `feat(resources): green - package references and command archives`
  - _Requirements: FR-5, FR-13, AC-2.1, AC-4.2_
  - _Design: Original commands, File Structure, Security Considerations_

- [x] 2.7 [RED] Failing verifier: skills root must contain package files
  - **Do**:
    1. Add a prepack check that `skills/` contains at least one non-`.gitkeep` file.
    2. Make the failure mention `skills/` explicitly.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: `npm run prepack` fails because `skills/` is empty except `.gitkeep`.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(resources): red - require packaged skills`
  - _Requirements: FR-5, FR-9, AC-2.1, AC-3.1_
  - _Design: Packaged resource tree, Prepack verifier_

- [x] 2.8 [GREEN] Populate Pi-safe skill resources
  - **Do**:
    1. Copy original skill directories into `skills/`.
    2. Adapt text only where needed to avoid legacy Claude/Codex hook execution instructions.
    3. Preserve nested skill reference files.
  - **Files**: `skills/**/SKILL.md`, `skills/**/references/*.md`
  - **Done when**: `skills/` has package files and prepack passes the skills check.
  - **Verify**: `find agents extensions prompts references skills templates -maxdepth 3 -type f | sort && npm run prepack`
  - **Commit**: `feat(resources): green - package pi safe skill resources`
  - _Requirements: FR-5, FR-13, AC-2.1, AC-4.2_
  - _Design: Packaged resource tree, Security Considerations_

- [x] C3 [VERIFY] Quality check: prepack after references and skills
  - **Do**:
    1. Run the discovered package verification command from `research.md` Quality Commands.
  - **Files**: None
  - **Done when**: `npm run prepack` exits 0.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(resources): pass reference skill checkpoint`
  - _Requirements: NFR-1, NFR-4_
  - _Design: Prepack verifier_

- [x] 2.9 [RED] Failing verifier: schema resource and package allowlist are required
  - **Do**:
    1. Add a prepack check requiring `schemas/spec.schema.json`.
    2. Add a prepack check requiring `schemas` in `package.json.files`.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: `npm run prepack` fails because the schema file or package allowlist entry is missing.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(resources): red - require packaged schema`
  - _Requirements: FR-6, FR-7, FR-9, AC-2.2, AC-2.3, AC-3.1_
  - _Design: Schemas exposure, Package boundary_

- [x] 2.10 [GREEN] Package Smart Ralph schema and include schemas root
  - **Do**:
    1. Copy the original `schemas/spec.schema.json` into `schemas/spec.schema.json`.
    2. Add `schemas` to `package.json.files`.
    3. Keep resources package-internal with no `exports` changes.
  - **Files**: `schemas/spec.schema.json`, `package.json`
  - **Done when**: The schema exists, `package.json.files` includes `schemas`, and prepack passes.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(resources): green - package spec schema`
  - _Requirements: FR-6, FR-7, AC-2.2, AC-2.3_
  - _Design: Schemas exposure, File Structure_

- [x] 2.11 [YELLOW] Remove stale placeholder files from populated roots
  - **Do**:
    1. Remove `.gitkeep` files from resource roots that now contain real package files.
    2. Keep directory structure stable for Pi package consumers.
  - **Files**: `prompts/.gitkeep`, `references/.gitkeep`, `skills/.gitkeep`, `templates/.gitkeep`
  - **Done when**: Placeholder files are gone where no longer needed and prepack still passes.
  - **Verify**: `find agents extensions prompts references skills templates -maxdepth 3 -type f | sort && npm run prepack`
  - **Commit**: `refactor(resources): yellow - remove populated root placeholders`
  - _Requirements: FR-5, NFR-5_
  - _Design: Packaged resource tree, File Structure_

## Phase 3: Manifest Completeness and Integrity

- [x] 3.1 [RED] Failing verifier: manifest must cover every original resource file
  - **Do**:
    1. Add original resource root discovery with default `/home/nephy/pi-custom-workflow/smart-ralph/plugins/ralph-specum` and `RALPH_ORIGINAL_RESOURCE_ROOT` override.
    2. Enumerate original `commands`, `templates`, `references`, `skills`, and `schemas` files.
    3. Fail when any original source-root-relative path is missing from the manifest.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: `npm run prepack` fails because the seed manifest lacks complete coverage.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(resources): red - require complete original coverage`
  - _Requirements: FR-2, FR-9, AC-1.2, AC-3.1_
  - _Design: Data Flow, Error Handling_

- [x] 3.2 [GREEN] Populate complete RalphResourceManifestV1 coverage
  - **Do**:
    1. Replace the seed manifest with one entry per original command/template/reference/skill/schema file.
    2. Map original commands to `references/original-commands/` entries.
    3. Map prompt templates to `prompts/` entries with `kind: "prompt"`.
    4. Use `excluded` or `deferred` only when the resource is intentionally not packaged and explain it in `notes`.
  - **Files**: `references/ralph-resource-manifest.v1.json`
  - **Done when**: Manifest coverage validation passes for the full original file set.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(resources): green - complete resource manifest coverage`
  - _Requirements: FR-1, FR-2, FR-3, AC-1.1, AC-1.2, AC-1.3_
  - _Design: `RalphResourceManifestV1` fixture, Data Flow_

- [x] 3.3 [YELLOW] Normalize manifest ordering and kind classification
  - **Do**:
    1. Sort manifest entries by `originalPath`.
    2. Ensure `templates/prompts/*` entries use `kind: "prompt"`.
    3. Ensure command archive entries use `kind: "command"` and non-executable `piPath`s.
  - **Files**: `references/ralph-resource-manifest.v1.json`
  - **Done when**: Manifest ordering and kind classification are deterministic.
  - **Verify**: `npm run prepack`
  - **Commit**: `refactor(resources): yellow - normalize manifest ordering`
  - _Requirements: FR-1, FR-2, FR-13_
  - _Design: Edge Cases, Technical Decisions_

- [ ] C4 [VERIFY] Quality check: prepack after manifest coverage
  - **Do**:
    1. Run the discovered package verification command from `research.md` Quality Commands.
  - **Files**: None
  - **Done when**: `npm run prepack` exits 0.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(resources): pass manifest coverage checkpoint`
  - _Requirements: NFR-1, NFR-2, NFR-4_
  - _Design: Prepack verifier_

- [ ] 3.4 [RED] Failing verifier: piPath existence, notes, and checksums must be enforced
  - **Do**:
    1. Add validation that every non-empty manifest `piPath` exists from the repository root.
    2. Require non-empty `notes` for every non-`copied` status.
    3. Require valid SHA-256 for packaged entries and exact source match for `copied`/`renamed` claims.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: `npm run prepack` fails because the manifest lacks valid checksum data.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(resources): red - enforce manifest integrity`
  - _Requirements: FR-3, FR-4, FR-9, AC-1.3, AC-1.4, AC-3.1_
  - _Design: Checksums, Error Handling_

- [ ] 3.5 [GREEN] Add checksum data and fix integrity failures
  - **Do**:
    1. Compute packaged-file SHA-256 values for entries with non-empty `piPath`.
    2. Update manifest `sha256` fields.
    3. Change statuses to `adapted` with notes where package content intentionally differs from source.
  - **Files**: `references/ralph-resource-manifest.v1.json`
  - **Done when**: piPath, notes, checksum, and exact-copy validation pass.
  - **Verify**: `npm run prepack`
  - **Commit**: `feat(resources): green - add manifest integrity metadata`
  - _Requirements: FR-3, FR-4, AC-1.3, AC-1.4_
  - _Design: Checksums, Technical Decisions_

- [ ] 3.6 [YELLOW] Refactor checksum and path normalization helpers
  - **Do**:
    1. Normalize all manifest and filesystem paths to POSIX-style `/` separators.
    2. Extract checksum helpers in `scripts/verify-publish-bundle.mjs`.
    3. Keep validation deterministic across repeated runs.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: Integrity validation is readable and two consecutive prepack runs pass.
  - **Verify**: `npm run prepack && npm run prepack`
  - **Commit**: `refactor(resources): yellow - normalize manifest integrity checks`
  - _Requirements: NFR-2, FR-9_
  - _Design: Edge Cases, Performance Considerations_

## Phase 4: Package Boundary and Dry-Run Verification

- [ ] 4.1 [RED] Failing verifier: package files list must be asset-consistent
  - **Do**:
    1. Add validation that every `package.json.files` entry for `LICENSE` and `smart-ralph.png` either exists or is absent from the allowlist.
    2. Add validation that declared resource roots are present in `package.json.files`.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: `npm run prepack` fails because absent `LICENSE` and `smart-ralph.png` are still listed.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(package): red - require files allowlist consistency`
  - _Requirements: FR-7, FR-11, AC-2.3, AC-3.5_
  - _Design: Asset consistency, Package boundary_

- [ ] 4.2 [GREEN] Resolve asset consistency by removing absent file entries
  - **Do**:
    1. Remove absent `LICENSE` and `smart-ralph.png` entries from `package.json.files`.
    2. Keep all required package resource roots listed, including `schemas`.
  - **Files**: `package.json`
  - **Done when**: Files allowlist consistency validation passes.
  - **Verify**: `npm run prepack`
  - **Commit**: `fix(package): green - remove absent publish assets`
  - _Requirements: FR-7, FR-11, AC-2.3, AC-3.5_
  - _Design: Technical Decisions, Error Handling_

- [ ] 4.3 [YELLOW] Stabilize package allowlist ordering
  - **Do**:
    1. Keep `package.json.files` sorted by package resource category.
    2. Avoid unrelated package metadata changes.
  - **Files**: `package.json`
  - **Done when**: Package allowlist is clear and prepack passes.
  - **Verify**: `npm run prepack`
  - **Commit**: `refactor(package): yellow - organize package files allowlist`
  - _Requirements: FR-7, FR-11, NFR-5_
  - _Design: Package boundary_

- [ ] C5 [VERIFY] Quality check: prepack after package allowlist changes
  - **Do**:
    1. Run the discovered package verification command from `research.md` Quality Commands.
  - **Files**: None
  - **Done when**: `npm run prepack` exits 0.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(package): pass allowlist checkpoint`
  - _Requirements: NFR-1, NFR-4, NFR-5_
  - _Design: Prepack verifier_

- [ ] 4.4 [RED] Failing dry-run verifier entrypoint
  - **Do**:
    1. Add a `verify:pack` package script that calls `scripts/verify-pack-dry-run.mjs`.
    2. Do not create the script yet, so the command proves the missing verifier fails.
  - **Files**: `package.json`
  - **Done when**: The dry-run verifier command fails because the verifier script is missing.
  - **Verify**: `npm run verify:pack 2>&1 | grep -q "Error\|Cannot find module\|MODULE_NOT_FOUND" && echo RED_PASS`
  - **Commit**: `test(package): red - require dry run verifier script`
  - _Requirements: FR-10, AC-3.3, AC-3.4_
  - _Design: Dry-run pack verifier, Package boundary_

- [ ] 4.5 [GREEN] Implement machine-readable dry-run pack verifier
  - **Do**:
    1. Create `scripts/verify-pack-dry-run.mjs` that runs `npm pack --dry-run --json` discovered in `research.md` Verification Tooling.
    2. Parse JSON output and normalize optional `package/` path prefixes.
    3. Assert required manifest, schema, templates, references, skills, and prompts files are included.
    4. Assert `specs/`, `.ralph-state.json`, `.progress.md`, and generated runtime state are excluded.
  - **Files**: `scripts/verify-pack-dry-run.mjs`
  - **Done when**: `npm run verify:pack` exits 0 and internally validates `npm pack --dry-run --json` output.
  - **Verify**: `npm run verify:pack`
  - **Commit**: `feat(package): green - add dry run package verifier`
  - _Requirements: FR-10, AC-3.3, AC-3.4, NFR-3, NFR-5_
  - _Design: Dry-run pack verifier, Data Flow_

- [ ] 4.6 [YELLOW] Refactor dry-run verifier failure reporting
  - **Do**:
    1. Aggregate dry-run verifier failures with clear included/excluded path labels.
    2. Print npm stdout/stderr context only when JSON parsing or npm execution fails.
  - **Files**: `scripts/verify-pack-dry-run.mjs`
  - **Done when**: Dry-run verifier output is concise and `npm run verify:pack` passes.
  - **Verify**: `npm run verify:pack`
  - **Commit**: `refactor(package): yellow - improve dry run verifier diagnostics`
  - _Requirements: FR-10, NFR-3, NFR-5_
  - _Design: Error Handling, Edge Cases_

- [ ] C6 [VERIFY] Quality check: package dry-run after verifier implementation
  - **Do**:
    1. Run package verification and the dry-run verifier.
    2. Confirm both discovered publish-boundary checks remain green.
  - **Files**: None
  - **Done when**: Both package verification commands exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(package): pass dry run checkpoint`
  - _Requirements: NFR-1, NFR-3, NFR-4, NFR-5_
  - _Design: Prepack verifier, Dry-run pack verifier_

## Phase 5: Documentation

- [ ] 5.1 [RED] Failing verifier: README must document packaged resources
  - **Do**:
    1. Add a lightweight README content check to `scripts/verify-publish-bundle.mjs` for resource roots, manifest path, status names, Pi-native command boundary, and verification commands.
    2. Reuse the aggregate failure format.
  - **Files**: `scripts/verify-publish-bundle.mjs`
  - **Done when**: `npm run prepack` fails because README lacks the new package-resource contract text.
  - **Verify**: `npm run prepack 2>&1 | grep -q "Smart Ralph package verification failed:" && echo RED_PASS`
  - **Commit**: `test(docs): red - require resource parity docs`
  - _Requirements: FR-12, FR-13, AC-4.1, AC-4.2, AC-4.3, AC-4.4_
  - _Design: Documentation, Existing Patterns to Follow_

- [ ] 5.2 [GREEN] Document resource roots, manifest statuses, and verification commands
  - **Do**:
    1. Update README Package layout with `schemas/` and `references/ralph-resource-manifest.v1.json`.
    2. Document manifest status meanings: `copied`, `adapted`, `renamed`, `pi-native`, `excluded`, `deferred`.
    3. Document `npm run prepack`, `npm run verify:pack`, and `npm pack --dry-run --json`.
  - **Files**: `README.md`
  - **Done when**: README documentation check and prepack pass.
  - **Verify**: `npm run prepack`
  - **Commit**: `docs(resources): green - document packaged resource contract`
  - _Requirements: FR-12, AC-4.1, AC-4.3, AC-4.4_
  - _Design: Documentation_

- [ ] 5.3 [YELLOW] Clarify Pi-native command boundary in docs
  - **Do**:
    1. State that Pi commands remain implemented in `extensions/ralph-specum/index.ts`.
    2. State that original command and hook files are packaged only as non-executable references.
    3. Cross-reference `references/original-commands/` and the manifest.
  - **Files**: `README.md`
  - **Done when**: Documentation explains intentional Pi differences and prepack passes.
  - **Verify**: `npm run prepack`
  - **Commit**: `docs(resources): yellow - clarify pi native command boundary`
  - _Requirements: FR-12, FR-13, AC-4.1, AC-4.2, AC-4.4_
  - _Design: Security Considerations, Documentation_

- [ ] C7 [VERIFY] Quality check: docs and package verification
  - **Do**:
    1. Run the discovered package verification command after documentation updates.
  - **Files**: None
  - **Done when**: `npm run prepack` exits 0.
  - **Verify**: `npm run prepack`
  - **Commit**: `chore(docs): pass documentation checkpoint`
  - _Requirements: NFR-1, FR-12_
  - _Design: Documentation, Prepack verifier_

## Phase 6: E2E Package Verification and Quality Gates

- [ ] VE1 [VERIFY] Package startup/build verification using discovered prepack command
  - **Do**:
    1. Run `npm run prepack` from `research.md` Quality Commands and Verification Tooling.
    2. Treat this as the package-resource startup/build gate for this library/Pi extension package.
  - **Files**: None
  - **Done when**: The package verifier exits 0.
  - **Verify**: `npm run prepack`
  - **Commit**: None
  - _Requirements: AC-3.1, NFR-1, NFR-4_
  - _Design: Prepack verifier_

- [ ] VE2 [VERIFY] Package dry-run content verification using discovered npm pack command
  - **Do**:
    1. Run the dry-run verifier that relies on the `npm pack --dry-run --json` command discovered in `research.md` Verification Tooling.
    2. Confirm required resources are included and runtime/spec state is excluded.
  - **Files**: None
  - **Done when**: The dry-run verifier exits 0 and validates the npm pack JSON file list.
  - **Verify**: `npm run verify:pack`
  - **Commit**: None
  - _Requirements: AC-3.3, AC-3.4, NFR-3, NFR-5_
  - _Design: Dry-run pack verifier_

- [ ] V4 [VERIFY] Full local CI
  - **Do**:
    1. Run all discovered local quality/package gates for this spec.
    2. Use `npm run prepack` and the dry-run verifier because research found no lint, typecheck, test, build, or CI command.
  - **Files**: None
  - **Done when**: All local gates exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: `chore(package): pass full local verification` (if fixes were required)
  - _Requirements: NFR-1, NFR-2, NFR-3, NFR-4, NFR-5_
  - _Design: Test Strategy, Dry-run pack verifier_

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Run the discovered package verification gates used as CI-equivalent evidence because `research.md` found no CI command.
    2. Confirm no additional CI workflow command was introduced.
  - **Files**: None
  - **Done when**: CI-equivalent package gates exit 0.
  - **Verify**: `npm run prepack && npm run verify:pack`
  - **Commit**: None
  - _Requirements: NFR-1, NFR-4, NFR-5_
  - _Design: Test Strategy_

- [ ] V6 [VERIFY] AC checklist
  - **Do**:
    1. Run package verification to cover manifest shape, coverage, status, notes, piPath, checksum, resource roots, schema, agents, and asset consistency.
    2. Run dry-run verification to cover pack inclusion and exclusion acceptance criteria.
    3. Run the raw dry-run command discovered in `research.md` for machine-readable tarball evidence.
  - **Files**: None
  - **Done when**: Acceptance criteria AC-1.1 through AC-4.4 are covered by passing automated verification gates.
  - **Verify**: `npm run prepack && npm run verify:pack && npm pack --dry-run --json`
  - **Commit**: None
  - _Requirements: AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-3.1, AC-3.2, AC-3.3, AC-3.4, AC-3.5, AC-4.1, AC-4.2, AC-4.3, AC-4.4_
  - _Design: All components_

## Unresolved Questions
- None. Planning decision: resolve absent `LICENSE` and `smart-ralph.png` by removing them from `package.json.files` rather than inventing unapproved assets.

## Notes
- POC shortcuts: None; use TDD because this is a MID_SIZED change to an existing package.
- Production TODOs: Keep `RalphResourceManifestV1` path stable for downstream parity specs; do not add public `package.json.exports` for resources in this spec.
