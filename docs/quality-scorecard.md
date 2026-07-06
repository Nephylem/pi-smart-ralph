# Pi Smart Ralph Quality Scorecard

Target: move the extension from beta-quality (~7/10) toward 10/10 by making quality measurable and release-gated.

## Current scorecard

| Area | Target | Current status | Score |
| --- | --- | --- | --- |
| Package shape | Pi manifest, bundled resources, documented install | Present in `package.json` and README | 9/10 |
| Runtime guardrails | Node engine, module type, TypeScript project check | `engines.node`, `type: module`, `npm run typecheck` present. Semantic TS debt remains because typecheck currently uses `--noCheck`. | 6/10 |
| Unit tests | Fast tests for critical pure helpers | `npm test` covers state, paths, implementation-loop helpers, task completion, and refactor helpers | 7/10 |
| Acceptance/parity tests | Published workflows covered by scripts | `verify:index`, `verify:pack`, and publish-bundle verifier pass locally | 8/10 |
| Coordinator size | Thin entrypoint, command/services extracted | `commands/core.ts` extracted; `index.ts` remains too large and workflow-heavy | 4/10 |
| CI | PR/push quality gate plus publish gate | `quality.yml` added; publish workflow repeats gates before npm publish | 8/10 |
| Docs | Architecture, contribution, release checklist | `docs/architecture.md`, `CONTRIBUTING.md`, this scorecard | 8/10 |
| Integration safety | Headless confirmations, bounded recovery, smoke tests | Safety logic exists; mocked Pi runtime smoke tests still needed | 6/10 |

Estimated current rating after these improvements: **8.0/10** if all gates pass.

## Remaining work to approach 10/10

1. **Burn down semantic TypeScript errors**
   - Replace `tsc --noCheck` with real `tsc -p tsconfig.json`.
   - Add narrow types for command parser results, native task cards, subagent records, and refactor cascade artifacts.

2. **Finish coordinator extraction**
   - Move phase orchestration to `phase-runner.ts`.
   - Move implementation orchestration to `implementation-runner.ts`.
   - Move epic command handlers to `commands/epic.ts` / `epic-runner.ts`.
   - Keep `index.ts` under an agreed maximum size.

3. **Add Pi runtime smoke tests**
   - Mock extension API and command context.
   - Verify session bootstrap, command registration, background coordinator lock, subagent RPC failure, and native task store failure.

4. **Schema-backed state validation**
   - Reconcile `schemas/spec.schema.json` with current runtime state.
   - Add valid, legacy, and malformed state fixtures.
   - Surface actionable repair instructions in command output.

5. **Coverage expansion**
   - Unit tests for epic state compatibility, GitHub write gating, phase artifact review, and command argument parsing.

## Release readiness checklist

A release is considered ready when:

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run verify:index` passes
- [ ] `npm run verify:pack` passes
- [ ] `node scripts/verify-publish-bundle.mjs` passes
- [ ] No new known risks are added without an owner/task
- [ ] README patch notes match the package version
- [ ] CI Quality Gates pass on the release commit
