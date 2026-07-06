# Pi Smart Ralph Architecture

Pi Smart Ralph is a Pi-native spec-driven workflow package. The package is intentionally split into control-plane code, agent contracts, skills, templates, and verifier scripts.

## Source of truth

A Ralph spec directory is the canonical record:

```text
specs/<spec>/
├─ research.md
├─ requirements.md
├─ design.md
├─ tasks.md
├─ .progress.md
└─ .ralph-state.json
```

Pi task cards, footer widgets, subagent records, GitHub issues, and status output are synchronized views over this state; they are not the source of truth.

## Runtime entrypoint

`extensions/ralph-specum/index.ts` is the extension entrypoint. It owns Pi lifecycle hooks and still contains the high-coupling workflow handlers while those are being extracted. New code should avoid adding more responsibilities to this file.

Current extraction boundaries:

- `extensions/ralph-specum/commands/core.ts` — low-risk command registration for help, feedback, model, index, status, and init.
- `extensions/ralph-specum/state.ts` — atomic state/progress reads and writes.
- `extensions/ralph-specum/paths.ts` — spec root, active spec, and path resolution.
- `extensions/ralph-specum/implementation-loop.ts` — pure implementation-loop helpers, verification recovery, task mutation, finalizer helpers.
- `extensions/ralph-specum/task-completion.ts` — workspace topology and completion-output assessment.
- `extensions/ralph-specum/refactor.ts` — refactor planning, prompts, completion parsing, mutation audit.
- `extensions/ralph-specum/epics.ts` and `github.ts` — epic state and GitHub issue synchronization helpers.
- `extensions/ralph-specum/indexing.ts` — `/ralph-index` scanner, renderers, state, and command formatting.

## Desired module boundaries

The target architecture is a thin `index.ts` plus services:

```text
index.ts
└─ lifecycle hooks + dependency assembly only

commands/
├─ core.ts
├─ spec.ts
├─ phase.ts
├─ implement.ts
├─ epic.ts
└─ refactor.ts

services/
├─ runtime-bootstrap.ts
├─ agent-bootstrap.ts
├─ diagnostics.ts
├─ phase-runner.ts
├─ implementation-runner.ts
├─ epic-runner.ts
└─ native-task-sync.ts
```

Rules:

1. Command modules register commands and adapt Pi `ctx` to service inputs.
2. Service modules coordinate workflows but do not directly own unrelated command registration.
3. Pure helper modules must not import Pi runtime types unless unavoidable.
4. State writes go through `state.ts` or a narrowly named helper with atomic-write behavior.
5. Subagent completion must be validated through explicit signals and evidence before mutating task completion state.

## Testing strategy

Use layered checks:

1. `npm run typecheck` — baseline TypeScript parse/project guardrail.
2. `npm test` — fast unit tests for pure helpers. These must not require a real Pi UI, GitHub auth, or MCP server.
3. `npm run verify:index` — acceptance/parity checks for index, task blockers, refactor, feedback, triage, and implementation-loop acceptance.
4. `npm run verify:pack` — cleanup and package dry-run checks.
5. `node scripts/verify-publish-bundle.mjs` — publish metadata and bundle safety.

When adding a new `/ralph-*` command:

- Add command registration in `commands/` where possible.
- Add argument parsing tests for invalid and valid cases.
- Add source/parity verifier coverage if command registration or published package wiring matters.
- Add README/help text updates.
- Run all quality gates before release.

## Release flow

1. Ensure `npm run typecheck`, `npm test`, `npm run verify:index`, `npm run verify:pack`, and `node scripts/verify-publish-bundle.mjs` pass locally.
2. Confirm `docs/quality-scorecard.md` has no stale known risks for the release.
3. Bump `package.json` version.
4. Merge only after the Quality Gates workflow passes.
5. Publish workflow publishes only when the package version changes and repeats the same quality gates before `npm publish`.
