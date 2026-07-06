# Tasks: Continuous Verification Recovery Hardening

## Overview
Harden `/ralph-implement` so `[VERIFY]` failures classify cleanly, self-recover when safe, block only on true fatal conditions, and leave state/progress artifacts truthful after recovery or completion.

## Research row aliases
- `VT-1`: `Verification Tooling` row 1, npm-script package verify entrypoint.
- `VT-4`: `Verification Tooling` row 4, implementation-loop acceptance-checklist node verifier; reuse by swapping case.
- `VT-6`: `Verification Tooling` row 6, task-blockers acceptance-checklist node verifier.
- `QC-test`: `Quality Commands` row `test`.
- `QC-verify`: `Quality Commands` row `verify`.
- `QC-verify-index`: `Quality Commands` row `verify:index`.
- `QC-verify-pack`: `Quality Commands` row `verify:pack`.

## Phase 1: Verification failure classification + recovery policy

- [x] 1.1 [RED] Failing test: verification failures classify into stable recovery buckets
  - **Do**:
    1. Add a `verification-recovery-policy` case to `scripts/verify-implementation-loop-parity.mjs`.
    2. Cover: transient tool failure, cleanup artifact failure, shared-contract drift, stale-state failure, publish-bundle failure, real product failure, fatal runtime failure.
    3. Assert each case produces stable `reasonCode`, `recoverable`, and `recoveryAction`.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The new case fails for missing or unstable failure classification.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case verification-recovery-policy 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add verification recovery policy verifier`
  - _Requirements: FR-1, FR-2, AC-1.1, AC-1.2_
  - _Design: Verification recovery classifier; Failure envelope_

- [x] 1.2 [GREEN] Pass test: classify verification failures and choose bounded recovery actions
  - **Do**:
    1. Add failure-classification helpers in `extensions/ralph-specum/implementation-loop.ts`.
    2. Normalize verifier failures into stable buckets with `reasonCode`, `recoverable`, `recoveryAction`, `attemptCount`, and `nextStep`.
    3. Route `/ralph-implement` verification failures through the policy helper before blocking.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Verification failures classify deterministically and the `verification-recovery-policy` case passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case verification-recovery-policy`
  - **Commit**: `feat(implement): green - classify verification failures`
  - _Requirements: FR-1, FR-2, AC-1.1, AC-1.2_
  - _Design: Verification recovery classifier; Loop runtime_

- [x] 1.3 [YELLOW] Refactor: extract failure-envelope and recovery-policy helpers
  - **Do**:
    1. Isolate failure normalization from loop orchestration.
    2. Keep policy output stable for later verifier cases.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Failure policy logic is isolated and the classification case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case verification-recovery-policy`
  - **Commit**: `refactor(implement): yellow - extract recovery policy helpers`
  - _Requirements: FR-1, FR-2, AC-1.1, AC-1.2_
  - _Design: Verification recovery classifier_

- [x] Q1 [VERIFY] Quality check: discovered implementation-loop node verifier entrypoint for recovery policy
  - **Do**:
    1. Run the research.md `Verification Tooling` node-verifier entrypoint for `scripts/verify-implementation-loop-parity.mjs` against the new `verification-recovery-policy` case.
  - **Files**: None
  - **Done when**: The discovered implementation-loop node-verifier entrypoint exits `0` for `verification-recovery-policy`.
  - **Verify**: `RALPH_RUN="VT-4=verification-recovery-policy" python3 -c 'from pathlib import Path; import os, subprocess, sys; text=Path("specs/implementation-verify-self-recovery-hardening/research.md").read_text(); qsec=text.split("## Quality Commands",1)[1].split("\n## ",1)[0]; vsec=text.split("## Verification Tooling",1)[1].split("\n## ",1)[0]; qrows=[l for l in qsec.splitlines() if l.startswith("| ") and not l.startswith("| Type") and not l.startswith("| ------------")]; vrows=[l for l in vsec.splitlines() if l.startswith("| ") and not l.startswith("| Tool") and not l.startswith("| -------------")]; amap={f"VT-{i+1}":r.split("`")[1] for i,r in enumerate(vrows) if "`" in r}; amap.update({f"QC-{r.split("|")[1].strip().replace(":","-")}":r.split("`")[1] for r in qrows if "`" in r}); items=[i for i in os.environ["RALPH_RUN"].split(",") if i]; resolved=[(item.partition("=")[0], (amap[item.partition("=")[0]].replace("acceptance-checklist", item.partition("=")[2]) if item.partition("=")[2] else amap[item.partition("=")[0]]), item.partition("=")[2]) for item in items]; print("\n".join(f"research.md {alias}" + (f" reused for {reuse}" if reuse else "") for alias,_,reuse in resolved)); sys.exit(subprocess.run(" && ".join(cmd for _,cmd,_ in resolved), shell=True).returncode)'`
  - **Commit**: `chore(implement): pass recovery policy checkpoint` (if fixes needed)
  - _Requirements: FR-1, FR-2, FR-11, AC-1.1, AC-1.2_
  - _Design: Parity verifier_

## Phase 2: Auto-recovery loop for `[VERIFY]` failures

- [x] 2.1 [RED] Failing test: recoverable verification failures rerun inside same `/ralph-implement` session
  - **Do**:
    1. Add a `verify-auto-recovery` case to `scripts/verify-implementation-loop-parity.mjs`.
    2. Cover: cleanup artifact failure, transient verifier failure, shared-contract drift repaired in-place.
    3. Assert the loop repairs, reruns the exact verifier, and advances without manual restart.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The new case fails for missing in-loop recovery behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case verify-auto-recovery 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add verify auto recovery verifier`
  - _Requirements: FR-3, FR-4, AC-2.1, AC-2.2_
  - _Design: Verify retry loop; Failure envelope_

- [x] 2.2 [GREEN] Pass test: auto-recover recoverable `[VERIFY]` failures before blocking
  - **Do**:
    1. Add bounded recovery attempts for verification tasks.
    2. On recoverable failure: capture evidence, run recovery action, rerun verifier, continue on pass.
    3. Persist attempt history in state evidence.
    4. Block only after retry budget is exhausted.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`, `schemas/spec.schema.json`
  - **Done when**: Recoverable verification failures self-heal in one `/ralph-implement` run and the `verify-auto-recovery` case passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case verify-auto-recovery`
  - **Commit**: `feat(implement): green - auto recover verify failures`
  - _Requirements: FR-3, FR-4, AC-2.1, AC-2.2_
  - _Design: Verify retry loop; State evidence_

- [x] 2.3 [YELLOW] Refactor: isolate verify-retry budgets and rerun helpers
  - **Do**:
    1. Extract retry-budget helpers and exact-verifier rerun helpers.
    2. Keep recovery sequencing deterministic for fixtures.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `schemas/spec.schema.json`
  - **Done when**: Retry logic is isolated and the auto-recovery case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case verify-auto-recovery`
  - **Commit**: `refactor(implement): yellow - extract verify retry helpers`
  - _Requirements: FR-3, FR-4, AC-2.1, AC-2.2_
  - _Design: Verify retry loop_

- [x] Q2 [VERIFY] Quality check: discovered implementation-loop node verifier entrypoint for auto-recovery
  - **Do**:
    1. Run the research.md `Verification Tooling` node-verifier entrypoint for `scripts/verify-implementation-loop-parity.mjs` against the new `verify-auto-recovery` case.
  - **Files**: None
  - **Done when**: The discovered implementation-loop node-verifier entrypoint exits `0` for `verify-auto-recovery`.
  - **Verify**: `RALPH_RUN="VT-4=verify-auto-recovery" python3 -c 'from pathlib import Path; import os, subprocess, sys; text=Path("specs/implementation-verify-self-recovery-hardening/research.md").read_text(); qsec=text.split("## Quality Commands",1)[1].split("\n## ",1)[0]; vsec=text.split("## Verification Tooling",1)[1].split("\n## ",1)[0]; qrows=[l for l in qsec.splitlines() if l.startswith("| ") and not l.startswith("| Type") and not l.startswith("| ------------")]; vrows=[l for l in vsec.splitlines() if l.startswith("| ") and not l.startswith("| Tool") and not l.startswith("| -------------")]; amap={f"VT-{i+1}":r.split("`")[1] for i,r in enumerate(vrows) if "`" in r}; amap.update({f"QC-{r.split("|")[1].strip().replace(":","-")}":r.split("`")[1] for r in qrows if "`" in r}); items=[i for i in os.environ["RALPH_RUN"].split(",") if i]; resolved=[(item.partition("=")[0], (amap[item.partition("=")[0]].replace("acceptance-checklist", item.partition("=")[2]) if item.partition("=")[2] else amap[item.partition("=")[0]]), item.partition("=")[2]) for item in items]; print("\n".join(f"research.md {alias}" + (f" reused for {reuse}" if reuse else "") for alias,_,reuse in resolved)); sys.exit(subprocess.run(" && ".join(cmd for _,cmd,_ in resolved), shell=True).returncode)'`
  - **Commit**: `chore(implement): pass verify auto recovery checkpoint` (if fixes needed)
  - _Requirements: FR-3, FR-4, FR-11, AC-2.1, AC-2.2_
  - _Design: Parity verifier_

## Phase 3: Shared-surface preflight before package VERIFY tasks

- [x] 3.1 [RED] Failing test: shared runtime edits trigger targeted verifier preflight before VE/V tasks
  - **Do**:
    1. Add a `shared-surface-preflight` case to `scripts/verify-implementation-loop-parity.mjs`.
    2. Cover edits to `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/task-completion.ts`, `package.json`, `references/ralph-resource-manifest.v1.json`, and `schemas/spec.schema.json`.
    3. Assert this exact minimum AC-3.1 mapping: `extensions/ralph-specum/index.ts` -> `node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist`, `node scripts/verify-task-blockers-parity.mjs --case acceptance-checklist`; `extensions/ralph-specum/implementation-loop.ts` -> `node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist`; `extensions/ralph-specum/task-completion.ts` -> `node scripts/verify-task-blockers-parity.mjs --case acceptance-checklist`; `package.json` -> `npm run verify:index`, `npm run verify:pack`; `references/ralph-resource-manifest.v1.json` -> `node scripts/verify-publish-bundle.mjs`, `npm run verify:pack`; `schemas/spec.schema.json` -> `node scripts/verify-publish-bundle.mjs`, `npm run verify:index`, `npm run verify:pack`.
    4. Assert every mapped command runs at least once before package verification tasks.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The new case fails for missing exact AC-3.1 mapping or missing preflight behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case shared-surface-preflight 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add shared surface preflight verifier`
  - _Requirements: FR-5, AC-3.1_
  - _Design: Shared-surface preflight planner_

- [x] 3.2 [GREEN] Pass test: run targeted preflight bundles from touched shared surfaces
  - **Do**:
    1. Detect touched shared-surface files from task evidence or changed-files reports.
    2. Implement this exact minimum AC-3.1 mapping in the planner: `extensions/ralph-specum/index.ts` -> `node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist`, `node scripts/verify-task-blockers-parity.mjs --case acceptance-checklist`; `extensions/ralph-specum/implementation-loop.ts` -> `node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist`; `extensions/ralph-specum/task-completion.ts` -> `node scripts/verify-task-blockers-parity.mjs --case acceptance-checklist`; `package.json` -> `npm run verify:index`, `npm run verify:pack`; `references/ralph-resource-manifest.v1.json` -> `node scripts/verify-publish-bundle.mjs`, `npm run verify:pack`; `schemas/spec.schema.json` -> `node scripts/verify-publish-bundle.mjs`, `npm run verify:index`, `npm run verify:pack`.
    3. Deduplicate bundle entries, then run every mapped command at least once before entering package VE/V tasks.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: The exact AC-3.1 mapping is implemented, shared-surface regressions fail early, and the `shared-surface-preflight` case passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case shared-surface-preflight`
  - **Commit**: `feat(implement): green - add shared surface preflight`
  - _Requirements: FR-5, AC-3.1_
  - _Design: Shared-surface preflight planner; Loop runtime_

- [x] 3.3 [YELLOW] Refactor: extract impacted-verifier bundle planner
  - **Do**:
    1. Centralize touched-file to verifier-bundle mapping.
    2. Keep bundle planning stable for package and runtime parity tests.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`
  - **Done when**: Bundle-planning logic is isolated and the preflight case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case shared-surface-preflight`
  - **Commit**: `refactor(implement): yellow - extract preflight bundle planner`
  - _Requirements: FR-5, AC-3.1_
  - _Design: Shared-surface preflight planner_

- [x] Q3 [VERIFY] Quality check: discovered implementation-loop node verifier entrypoint for shared-surface preflight
  - **Do**:
    1. Run the research.md `Verification Tooling` node-verifier entrypoint for `scripts/verify-implementation-loop-parity.mjs` against the new `shared-surface-preflight` case.
  - **Files**: None
  - **Done when**: The discovered implementation-loop node-verifier entrypoint exits `0` for `shared-surface-preflight`.
  - **Verify**: `RALPH_RUN="VT-4=shared-surface-preflight" python3 -c 'from pathlib import Path; import os, subprocess, sys; text=Path("specs/implementation-verify-self-recovery-hardening/research.md").read_text(); qsec=text.split("## Quality Commands",1)[1].split("\n## ",1)[0]; vsec=text.split("## Verification Tooling",1)[1].split("\n## ",1)[0]; qrows=[l for l in qsec.splitlines() if l.startswith("| ") and not l.startswith("| Type") and not l.startswith("| ------------")]; vrows=[l for l in vsec.splitlines() if l.startswith("| ") and not l.startswith("| Tool") and not l.startswith("| -------------")]; amap={f"VT-{i+1}":r.split("`")[1] for i,r in enumerate(vrows) if "`" in r}; amap.update({f"QC-{r.split("|")[1].strip().replace(":","-")}":r.split("`")[1] for r in qrows if "`" in r}); items=[i for i in os.environ["RALPH_RUN"].split(",") if i]; resolved=[(item.partition("=")[0], (amap[item.partition("=")[0]].replace("acceptance-checklist", item.partition("=")[2]) if item.partition("=")[2] else amap[item.partition("=")[0]]), item.partition("=")[2]) for item in items]; print("\n".join(f"research.md {alias}" + (f" reused for {reuse}" if reuse else "") for alias,_,reuse in resolved)); sys.exit(subprocess.run(" && ".join(cmd for _,cmd,_ in resolved), shell=True).returncode)'`
  - **Commit**: `chore(implement): pass shared surface preflight checkpoint` (if fixes needed)
  - _Requirements: FR-5, FR-11, AC-3.1_
  - _Design: Parity verifier_

## Phase 4: Structured verification result envelopes

- [x] 4.1 [RED] Failing test: verifier and QA outputs normalize into structured envelopes
  - **Do**:
    1. Add a `verification-envelope` case to `scripts/verify-implementation-loop-parity.mjs`.
    2. Cover pass and fail outputs from verification agents, package scripts, and nested parity scripts.
    3. Assert normalized fields: `status`, `reasonCode`, `category`, `failingCommand`, `recoverable`, `suggestedRecovery`, and `evidence`.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The new case fails for missing structured output normalization.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case verification-envelope 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add verification envelope verifier`
  - _Requirements: FR-6, FR-7, AC-4.1, AC-4.2_
  - _Design: Failure envelope; Completion validation bridge_

- [x] 4.2 [GREEN] Pass test: normalize verification results before coordinator decisions
  - **Do**:
    1. Parse verifier outputs into structured envelopes.
    2. Make coordinator recovery or block decisions from envelope fields, not prose-only parsing.
    3. Persist structured verification evidence in state.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/task-completion.ts`, `schemas/spec.schema.json`
  - **Done when**: Verification decision paths consume structured envelopes and the `verification-envelope` case passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case verification-envelope`
  - **Commit**: `feat(implement): green - normalize verification envelopes`
  - _Requirements: FR-6, FR-7, AC-4.1, AC-4.2_
  - _Design: Failure envelope; State evidence_

- [x] 4.3 [YELLOW] Refactor: isolate verifier output parsers and evidence writers
  - **Do**:
    1. Extract parser helpers for QA, verifier, and package outputs.
    2. Keep envelope schema stable for later verifier and cleanup tasks.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/task-completion.ts`
  - **Done when**: Parsing and writing helpers are isolated and the envelope case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case verification-envelope`
  - **Commit**: `refactor(implement): yellow - extract verification envelope helpers`
  - _Requirements: FR-6, FR-7, AC-4.1, AC-4.2_
  - _Design: Failure envelope_

- [x] Q4 [VERIFY] Quality check: discovered implementation-loop node verifier entrypoint for envelopes
  - **Do**:
    1. Run the research.md `Verification Tooling` node-verifier entrypoint for `scripts/verify-implementation-loop-parity.mjs` against the new `verification-envelope` case.
  - **Files**: None
  - **Done when**: The discovered implementation-loop node-verifier entrypoint exits `0` for `verification-envelope`.
  - **Verify**: `RALPH_RUN="VT-4=verification-envelope" python3 -c 'from pathlib import Path; import os, subprocess, sys; text=Path("specs/implementation-verify-self-recovery-hardening/research.md").read_text(); qsec=text.split("## Quality Commands",1)[1].split("\n## ",1)[0]; vsec=text.split("## Verification Tooling",1)[1].split("\n## ",1)[0]; qrows=[l for l in qsec.splitlines() if l.startswith("| ") and not l.startswith("| Type") and not l.startswith("| ------------")]; vrows=[l for l in vsec.splitlines() if l.startswith("| ") and not l.startswith("| Tool") and not l.startswith("| -------------")]; amap={f"VT-{i+1}":r.split("`")[1] for i,r in enumerate(vrows) if "`" in r}; amap.update({f"QC-{r.split("|")[1].strip().replace(":","-")}":r.split("`")[1] for r in qrows if "`" in r}); items=[i for i in os.environ["RALPH_RUN"].split(",") if i]; resolved=[(item.partition("=")[0], (amap[item.partition("=")[0]].replace("acceptance-checklist", item.partition("=")[2]) if item.partition("=")[2] else amap[item.partition("=")[0]]), item.partition("=")[2]) for item in items]; print("\n".join(f"research.md {alias}" + (f" reused for {reuse}" if reuse else "") for alias,_,reuse in resolved)); sys.exit(subprocess.run(" && ".join(cmd for _,cmd,_ in resolved), shell=True).returncode)'`
  - **Commit**: `chore(implement): pass verification envelope checkpoint` (if fixes needed)
  - _Requirements: FR-6, FR-7, FR-11, AC-4.1, AC-4.2_
  - _Design: Parity verifier_

## Phase 5: State and progress cleanup after recovery and completion

- [x] 5.1 [RED] Failing test: successful recovery or completion clears stale blocked metadata and misleading progress text
  - **Do**:
    1. Add a `state-cleanup` case to `scripts/verify-implementation-loop-parity.mjs`.
    2. Cover: stale `currentTask`, stale `blockedAt`, stale `validationError`, stale `lastSubagentOutput`, stale `.progress.md` header or next-step text, missing completion evidence, and undeleted `<basePath>/.ralph-state.json`.
    3. Assert recovered specs clear stale failure metadata before the next task starts.
    4. Assert completed specs write completion evidence, rewrite `.progress.md` truthfully, delete `<basePath>/.ralph-state.json`, and retain no stale blocked or in-flight fields.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`
  - **Done when**: The new case fails for missing cleanup, missing completion evidence, or missing `<basePath>/.ralph-state.json` deletion.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-cleanup 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add state cleanup verifier`
  - _Requirements: FR-8, FR-9, AC-5.1, AC-5.2_
  - _Design: State finalizer; Progress sync_

- [x] 5.2 [GREEN] Pass test: scrub stale runtime metadata on unblock, recovery, and completion
  - **Do**:
    1. Clear stale blocked and failure fields when recovery succeeds.
    2. On successful completion, set completion evidence, clear stale `currentTask` and finalizer residue, and delete `<basePath>/.ralph-state.json`.
    3. Rewrite `.progress.md` header, current, and next sections to match reality, and ensure any retained completion artifact has no stale blocked or in-flight fields.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Recovery clears stale failure fields, completion writes evidence and deletes `<basePath>/.ralph-state.json`, and the `state-cleanup` case passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-cleanup`
  - **Commit**: `feat(implement): green - clean runtime state artifacts`
  - _Requirements: FR-8, FR-9, AC-5.1, AC-5.2_
  - _Design: State finalizer; Progress sync_

- [x] 5.3 [YELLOW] Refactor: isolate state-finalization and progress-sync helpers
  - **Do**:
    1. Extract cleanup, completion-evidence, and state-deletion writers from the main loop flow.
    2. Keep progress artifact formatting deterministic.
  - **Files**: `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/index.ts`
  - **Done when**: Cleanup helpers are isolated and the `state-cleanup` case stays green.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case state-cleanup`
  - **Commit**: `refactor(implement): yellow - extract state cleanup helpers`
  - _Requirements: FR-8, FR-9, AC-5.1, AC-5.2_
  - _Design: State finalizer; Progress sync_

- [x] Q5 [VERIFY] Quality check: discovered implementation-loop node verifier entrypoint for state cleanup
  - **Do**:
    1. Run the research.md `Verification Tooling` node-verifier entrypoint for `scripts/verify-implementation-loop-parity.mjs` against the new `state-cleanup` case.
  - **Files**: None
  - **Done when**: The discovered implementation-loop node-verifier entrypoint exits `0` for `state-cleanup`.
  - **Verify**: `RALPH_RUN="VT-4=state-cleanup" python3 -c 'from pathlib import Path; import os, subprocess, sys; text=Path("specs/implementation-verify-self-recovery-hardening/research.md").read_text(); qsec=text.split("## Quality Commands",1)[1].split("\n## ",1)[0]; vsec=text.split("## Verification Tooling",1)[1].split("\n## ",1)[0]; qrows=[l for l in qsec.splitlines() if l.startswith("| ") and not l.startswith("| Type") and not l.startswith("| ------------")]; vrows=[l for l in vsec.splitlines() if l.startswith("| ") and not l.startswith("| Tool") and not l.startswith("| -------------")]; amap={f"VT-{i+1}":r.split("`")[1] for i,r in enumerate(vrows) if "`" in r}; amap.update({f"QC-{r.split("|")[1].strip().replace(":","-")}":r.split("`")[1] for r in qrows if "`" in r}); items=[i for i in os.environ["RALPH_RUN"].split(",") if i]; resolved=[(item.partition("=")[0], (amap[item.partition("=")[0]].replace("acceptance-checklist", item.partition("=")[2]) if item.partition("=")[2] else amap[item.partition("=")[0]]), item.partition("=")[2]) for item in items]; print("\n".join(f"research.md {alias}" + (f" reused for {reuse}" if reuse else "") for alias,_,reuse in resolved)); sys.exit(subprocess.run(" && ".join(cmd for _,cmd,_ in resolved), shell=True).returncode)'`
  - **Commit**: `chore(implement): pass state cleanup checkpoint` (if fixes needed)
  - _Requirements: FR-8, FR-9, FR-11, AC-5.1, AC-5.2_
  - _Design: Parity verifier_

## Phase 6: Harden parity verifiers against refactor drift

- [x] 6.1 [RED] Failing test: parity verifiers rely on behavior contracts, not `index.ts` source shape
  - **Do**:
    1. Add a `contract-surface` case to `scripts/verify-implementation-loop-parity.mjs`.
    2. Add or extend focused cases in `scripts/verify-task-blockers-parity.mjs` to import/check stable helper bridges from `implementation-loop.ts` and `task-completion.ts` instead of helper-order assertions, raw `index.ts` scraping, or ad hoc TypeScript text matching.
    3. Assert behavior stays green when recovery/finalizer logic moves between `index.ts` and `implementation-loop.ts` behind stable bridges, while the current source-shape-coupled verifiers still fail red.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`, `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: New cases fail because current parity checks still couple to raw `index.ts` layout or syntax-shape assumptions instead of exported bridges and fixture behavior.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case contract-surface 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(implement): red - add contract surface verifier`
  - _Requirements: FR-10, AC-6.1_
  - _Design: Stable verifier contract surface_

- [x] 6.2 [GREEN] Pass test: replace brittle source-shape assertions with stable helper and fixture checks
  - **Do**:
    1. Export narrow stable helper bridges for completion, recovery, and finalizer logic where needed, including the helper surfaces the focused `stable-helper-exports` task-blockers case expects from `implementation-loop.ts` and `task-completion.ts`.
    2. Replace `scripts/verify-implementation-loop-parity.mjs` scraping of `index.ts` function bodies with helper imports or fixture-driven assertions against the stable bridge surface.
    3. Reduce `scripts/verify-task-blockers-parity.mjs` dependency on raw coordinator file layout so acceptance checks validate behavior/exports instead of source shape.
  - **Files**: `scripts/verify-implementation-loop-parity.mjs`, `scripts/verify-task-blockers-parity.mjs`, `extensions/ralph-specum/index.ts`, `extensions/ralph-specum/implementation-loop.ts`, `extensions/ralph-specum/task-completion.ts`
  - **Done when**: Refactors across shared runtime files no longer cause false-negative parity failures, `contract-surface` stops reporting `index.ts` body scraping / coordinator source-shape coupling, and the acceptance-checklist task-blockers verifier passes.
  - **Verify**: `node scripts/verify-implementation-loop-parity.mjs --case contract-surface && node scripts/verify-task-blockers-parity.mjs --case acceptance-checklist`
  - **Commit**: `feat(verify): green - harden verifier contracts`
  - _Requirements: FR-10, AC-6.1_
  - _Design: Stable verifier contract surface; Behavior-first verifiers_

- [x] 6.3 [YELLOW] Refactor: replace ad hoc TypeScript loading paths in verifiers
  - **Do**:
    1. Remove or minimize custom regex transpilation for `task-completion.ts`.
    2. Use a stable module-loading path for verifier runtime imports.
  - **Files**: `scripts/verify-task-blockers-parity.mjs`
  - **Done when**: Verifier loading is less syntax-fragile and contract-surface checks stay green.
  - **Verify**: `node scripts/verify-task-blockers-parity.mjs --case acceptance-checklist`
  - **Commit**: `refactor(verify): yellow - harden ts loading path`
  - _Requirements: FR-10, AC-6.1_
  - _Design: Stable verifier contract surface_

- [x] Q6 [VERIFY] Quality check: discovered parity node-verifier rows for contract hardening
  - **Do**:
    1. Run the research.md `Verification Tooling` node-verifier entrypoint for `scripts/verify-implementation-loop-parity.mjs` against the new `contract-surface` case.
    2. Run the research.md `Verification Tooling` row for `node scripts/verify-task-blockers-parity.mjs --case acceptance-checklist`.
  - **Files**: None
  - **Done when**: The discovered implementation-loop and task-blockers node-verifier rows both exit `0`.
  - **Verify**: `RALPH_RUN="VT-4=contract-surface,VT-6" python3 -c 'from pathlib import Path; import os, subprocess, sys; text=Path("specs/implementation-verify-self-recovery-hardening/research.md").read_text(); qsec=text.split("## Quality Commands",1)[1].split("\n## ",1)[0]; vsec=text.split("## Verification Tooling",1)[1].split("\n## ",1)[0]; qrows=[l for l in qsec.splitlines() if l.startswith("| ") and not l.startswith("| Type") and not l.startswith("| ------------")]; vrows=[l for l in vsec.splitlines() if l.startswith("| ") and not l.startswith("| Tool") and not l.startswith("| -------------")]; amap={f"VT-{i+1}":r.split("`")[1] for i,r in enumerate(vrows) if "`" in r}; amap.update({f"QC-{r.split("|")[1].strip().replace(":","-")}":r.split("`")[1] for r in qrows if "`" in r}); items=[i for i in os.environ["RALPH_RUN"].split(",") if i]; resolved=[(item.partition("=")[0], (amap[item.partition("=")[0]].replace("acceptance-checklist", item.partition("=")[2]) if item.partition("=")[2] else amap[item.partition("=")[0]]), item.partition("=")[2]) for item in items]; print("\n".join(f"research.md {alias}" + (f" reused for {reuse}" if reuse else "") for alias,_,reuse in resolved)); sys.exit(subprocess.run(" && ".join(cmd for _,cmd,_ in resolved), shell=True).returncode)'`
  - **Commit**: `chore(verify): pass contract hardening checkpoint` (if fixes needed)
  - _Requirements: FR-10, FR-11, AC-6.1_
  - _Design: Parity verifier_

## Phase 7: Publish and cleanup gate hardening

- [x] 7.1 [RED] Failing test: publish gate cleanup failures self-repair or fail with exact reason code
  - **Do**:
    1. Add a `cleanup-recovery` case to `scripts/verify-refactor-parity.mjs`.
    2. Add a package-path failure case to `scripts/verify-publish-bundle.mjs` for portable diagnostics.
    3. Assert cleanup leftovers normalize to a recoverable reason code and exact artifact list.
  - **Files**: `scripts/verify-refactor-parity.mjs`, `scripts/verify-publish-bundle.mjs`
  - **Done when**: New cases fail for missing cleanup recovery or portable diagnostics.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case cleanup-recovery 2>&1 | grep -q "FAIL\|EXPECTED_FAIL" && echo RED_PASS`
  - **Commit**: `test(pack): red - add cleanup recovery verifier`
  - _Requirements: FR-12, FR-13, AC-7.1, AC-7.2_
  - _Design: Package verification diagnostics; Cleanup recovery_

- [x] 7.1.1 Refresh manifest checksum for adapted schema before publish-gate hardening
  - **Do**:
    1. Update `references/ralph-resource-manifest.v1.json` so the `schemas/spec.schema.json` entry `sha256` matches the current packaged schema file.
    2. Confirm `node scripts/verify-publish-bundle.mjs` no longer fails on the manifest/schema checksum mismatch.
  - **Files**: `references/ralph-resource-manifest.v1.json`
  - **Done when**: `node scripts/verify-publish-bundle.mjs` is unblocked from the current manifest/schema checksum failure.
  - **Verify**: `node scripts/verify-publish-bundle.mjs`
  - **Commit**: `chore(pack): refresh schema manifest checksum`
  - _Requirements: FR-12, FR-13, AC-7.1, AC-7.2_
  - _Design: Package verification diagnostics; Cleanup recovery_

- [x] 7.2 [GREEN] Pass test: package verify flow repairs temp artifacts and reports portable failures
  - **Do**:
    1. Normalize temporary-artifact cleanup before package verification reruns.
    2. Make publish verifier original-root and dependency-path diagnostics explicit and portable.
    3. Feed cleanup and package failures into the same verification recovery policy.
  - **Files**: `scripts/verify-refactor-parity.mjs`, `scripts/verify-publish-bundle.mjs`, `extensions/ralph-specum/implementation-loop.ts`
  - **Done when**: Package cleanup issues self-repair when safe; otherwise fail with exact reason codes; new cleanup cases pass.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case cleanup-recovery && node scripts/verify-publish-bundle.mjs`
  - **Commit**: `feat(pack): green - harden cleanup and publish verification`
  - _Requirements: FR-12, FR-13, AC-7.1, AC-7.2_
  - _Design: Package verification diagnostics; Cleanup recovery_

- [ ] 7.3 [YELLOW] Refactor: centralize package-verification diagnostics
  - **Do**:
    1. Reuse failure-envelope fields across package verifiers.
    2. Keep pack failure output stable for coordinator recovery logic.
  - **Files**: `scripts/verify-refactor-parity.mjs`, `scripts/verify-publish-bundle.mjs`
  - **Done when**: Package diagnostics are consistent and cleanup recovery cases stay green.
  - **Verify**: `node scripts/verify-refactor-parity.mjs --case cleanup-recovery && node scripts/verify-publish-bundle.mjs`
  - **Commit**: `refactor(pack): yellow - normalize package diagnostics`
  - _Requirements: FR-12, FR-13, AC-7.1, AC-7.2_
  - _Design: Package verification diagnostics_

- [ ] V1 [VERIFY] Package verification gate: discovered `verify` quality-command row
  - **Do**:
    1. Run the research.md `Quality Commands` `verify` row and matching `Verification Tooling` npm-script row: `npm run prepack`.
  - **Files**: None
  - **Done when**: The discovered `verify` package gate exits `0`.
  - **Verify**: `RALPH_RUN="QC-verify" python3 -c 'from pathlib import Path; import os, subprocess, sys; text=Path("specs/implementation-verify-self-recovery-hardening/research.md").read_text(); qsec=text.split("## Quality Commands",1)[1].split("\n## ",1)[0]; vsec=text.split("## Verification Tooling",1)[1].split("\n## ",1)[0]; qrows=[l for l in qsec.splitlines() if l.startswith("| ") and not l.startswith("| Type") and not l.startswith("| ------------")]; vrows=[l for l in vsec.splitlines() if l.startswith("| ") and not l.startswith("| Tool") and not l.startswith("| -------------")]; amap={f"VT-{i+1}":r.split("`")[1] for i,r in enumerate(vrows) if "`" in r}; amap.update({f"QC-{r.split("|")[1].strip().replace(":","-")}":r.split("`")[1] for r in qrows if "`" in r}); items=[i for i in os.environ["RALPH_RUN"].split(",") if i]; resolved=[(item.partition("=")[0], (amap[item.partition("=")[0]].replace("acceptance-checklist", item.partition("=")[2]) if item.partition("=")[2] else amap[item.partition("=")[0]]), item.partition("=")[2]) for item in items]; print("\n".join(f"research.md {alias}" + (f" reused for {reuse}" if reuse else "") for alias,_,reuse in resolved)); sys.exit(subprocess.run(" && ".join(cmd for _,cmd,_ in resolved), shell=True).returncode)'`
  - **Commit**: `chore(pack): pass package verification proxy` (if fixes needed)
  - _Requirements: FR-12, FR-13, FR-14, AC-7.1, AC-7.2_
  - _Design: Package verification diagnostics; Publish flow_

## Phase 8: Full regression and readiness gate

- [ ] V2 [VERIFY] Continuous implementation loop acceptance: discovered verifier + package-gate rows
  - **Do**:
    1. Run the research.md `Verification Tooling` row for `node scripts/verify-implementation-loop-parity.mjs --case acceptance-checklist`.
    2. Run the research.md `Quality Commands` / `Verification Tooling` rows for `verify:index` and `verify:pack`.
    3. Confirm the discovered acceptance chain is green end-to-end.
  - **Files**: None
  - **Done when**: The discovered acceptance-checklist, `verify:index`, and `verify:pack` rows all exit `0`.
  - **Verify**: `RALPH_RUN="VT-4,QC-verify-index,QC-verify-pack" python3 -c 'from pathlib import Path; import os, subprocess, sys; text=Path("specs/implementation-verify-self-recovery-hardening/research.md").read_text(); qsec=text.split("## Quality Commands",1)[1].split("\n## ",1)[0]; vsec=text.split("## Verification Tooling",1)[1].split("\n## ",1)[0]; qrows=[l for l in qsec.splitlines() if l.startswith("| ") and not l.startswith("| Type") and not l.startswith("| ------------")]; vrows=[l for l in vsec.splitlines() if l.startswith("| ") and not l.startswith("| Tool") and not l.startswith("| -------------")]; amap={f"VT-{i+1}":r.split("`")[1] for i,r in enumerate(vrows) if "`" in r}; amap.update({f"QC-{r.split("|")[1].strip().replace(":","-")}":r.split("`")[1] for r in qrows if "`" in r}); items=[i for i in os.environ["RALPH_RUN"].split(",") if i]; resolved=[(item.partition("=")[0], (amap[item.partition("=")[0]].replace("acceptance-checklist", item.partition("=")[2]) if item.partition("=")[2] else amap[item.partition("=")[0]]), item.partition("=")[2]) for item in items]; print("\n".join(f"research.md {alias}" + (f" reused for {reuse}" if reuse else "") for alias,_,reuse in resolved)); sys.exit(subprocess.run(" && ".join(cmd for _,cmd,_ in resolved), shell=True).returncode)'`
  - **Commit**: `chore(implement): pass continuous recovery acceptance`
  - _Requirements: FR-1, FR-5, FR-8, FR-10, FR-11, FR-12, AC-1.1, AC-3.1, AC-5.1, AC-6.1, AC-7.1_
  - _Design: Parity verifier; Publish flow_

- [ ] V3 [VERIFY] Full local CI: discovered test + package-gate quality-command rows
  - **Do**:
    1. Run the research.md `Quality Commands` rows for `test`, `verify:index`, `verify:pack`, and `verify` in publish-order scope.
  - **Files**: None
  - **Done when**: The discovered local-CI command chain exits `0`.
  - **Verify**: `RALPH_RUN="QC-test,QC-verify-index,QC-verify-pack,QC-verify" python3 -c 'from pathlib import Path; import os, subprocess, sys; text=Path("specs/implementation-verify-self-recovery-hardening/research.md").read_text(); qsec=text.split("## Quality Commands",1)[1].split("\n## ",1)[0]; vsec=text.split("## Verification Tooling",1)[1].split("\n## ",1)[0]; qrows=[l for l in qsec.splitlines() if l.startswith("| ") and not l.startswith("| Type") and not l.startswith("| ------------")]; vrows=[l for l in vsec.splitlines() if l.startswith("| ") and not l.startswith("| Tool") and not l.startswith("| -------------")]; amap={f"VT-{i+1}":r.split("`")[1] for i,r in enumerate(vrows) if "`" in r}; amap.update({f"QC-{r.split("|")[1].strip().replace(":","-")}":r.split("`")[1] for r in qrows if "`" in r}); items=[i for i in os.environ["RALPH_RUN"].split(",") if i]; resolved=[(item.partition("=")[0], (amap[item.partition("=")[0]].replace("acceptance-checklist", item.partition("=")[2]) if item.partition("=")[2] else amap[item.partition("=")[0]]), item.partition("=")[2]) for item in items]; print("\n".join(f"research.md {alias}" + (f" reused for {reuse}" if reuse else "") for alias,_,reuse in resolved)); sys.exit(subprocess.run(" && ".join(cmd for _,cmd,_ in resolved), shell=True).returncode)'`
  - **Commit**: `chore(ci): pass local verification` (if fixes needed)
  - _Requirements: FR-11, FR-14_
  - _Design: Full verification chain_

## Unresolved Questions
- Verification recovery budgets global, per-task, or per-reason-code?

## Next Steps
1. Create matching `requirements.md` with FR and AC for recovery policy, preflight, cleanup, and verifier hardening.
2. Create matching `design.md` with recovery classifier, retry loop, envelope schema, preflight planner, and cleanup flow.
3. Start execution at `1.1 [RED]` and keep strict RED -> GREEN -> YELLOW -> VERIFY order.
