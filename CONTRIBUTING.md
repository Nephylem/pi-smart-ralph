# Contributing to Pi Smart Ralph

## Local setup

```bash
npm ci
npm run typecheck
npm test
npm run verify:index
npm run verify:pack
node scripts/verify-publish-bundle.mjs
```

Use Node.js 22 or newer; CI currently runs on Node 26.

## Change checklist

For every change:

- Keep public `/ralph-*` behavior backward compatible unless the README and verifiers are updated.
- Prefer focused modules over adding more code to `extensions/ralph-specum/index.ts`.
- Add or update tests before changing critical state, task, verification, or parsing behavior.
- Run the full local quality gate before opening a PR.

## Module rules

- `index.ts` should only wire lifecycle hooks, command registrars, and shared dependencies.
- Command registration belongs in `extensions/ralph-specum/commands/`.
- Workflow runners should live in service modules with explicit inputs/outputs.
- Pure helper modules should stay Pi-runtime independent where possible.
- State/progress writes should remain atomic and recoverable.

## Test requirements by change type

| Change type | Required checks |
| --- | --- |
| Parser/argument handling | `npm test` plus relevant parity verifier |
| State schema or migration | `npm test`, `verify-implementation-loop-parity`, affected command verifier |
| Task execution/recovery | `npm test`, `verify-implementation-loop-parity.mjs --case acceptance-checklist` |
| Refactor command | `npm test`, `verify-refactor-parity.mjs --case acceptance-checklist` |
| Epic/GitHub sync | `verify-triage-github-sync-parity.mjs --case acceptance-checklist` |
| Package metadata/bundling | `node scripts/verify-publish-bundle.mjs`, `npm run verify:pack` |
| New command | command registration verifier, README/help update, unit tests for parser/service |

## Safety rules

- Do not mark a task complete without real verification evidence.
- Do not mutate `.ralph-state.json` directly from subagents.
- Do not bypass GitHub write confirmations in headless flows.
- Do not introduce mock-only tests for user-visible behavior; mocks may isolate external systems, but assertions must verify real state/output.

## Release checklist

Before a version bump:

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run verify:index`
- [ ] `npm run verify:pack`
- [ ] `node scripts/verify-publish-bundle.mjs`
- [ ] `docs/quality-scorecard.md` reviewed
- [ ] README patch notes updated
- [ ] Package version bumped
