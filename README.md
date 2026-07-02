# Pi Smart Ralph

**Pi Smart Ralph** is a Pi-only extension for structured, spec-driven software development with autonomous subagents, task tracking, epic decomposition, verification gates, and optional GitHub issue output.

Install it into any Pi project with:

```bash
pi install npm:pi-smart-ralph@beta
```

Then run inside Pi:

```text
/ralph-init
/ralph-help
```

---

## Disclaimer and credits

This project is an independent Pi-native package inspired by the original Smart Ralph workflow.

Credit to the original Smart Ralph project and author:

- Original repository: <https://github.com/tzachbon/smart-ralph>
- Original author/repository owner: `tzachbon`

This repository is maintained separately for the Pi agent ecosystem and is intended to be used **only with Pi**.

---

## What it does

Pi Smart Ralph adds a full `/ralph-*` workflow to Pi:

1. Turn a rough goal into a tracked spec.
2. Generate research, requirements, design, and task artifacts.
3. Mirror `tasks.md` into Pi task cards.
4. Execute tasks through focused Pi subagents.
5. Require real verification evidence before marking work complete.
6. Decompose larger initiatives into epics and child specs.
7. Optionally create or update GitHub issues from epic triage.

The goal is to make AI-assisted development more auditable and less ad hoc: every implementation should have context, acceptance criteria, task boundaries, verification proof, and resumable state.

---

## Current status

This package is currently in beta.

Recommended install:

```bash
pi install npm:pi-smart-ralph@beta
```

The package name is:

```text
pi-smart-ralph
```

Npm package metadata should point to this repository:

```text
https://github.com/Nephylem/pi-smart-ralph
```

---

## Requirements

- Node.js and npm
- Pi coding agent installed as `pi`
- A target project, preferably a git repository
- Optional for GitHub issue sync:
  - GitHub CLI: `gh`
  - authenticated `gh auth status`
  - a GitHub remote on the target repository

Pi Smart Ralph bundles and conditionally loads the runtime packages it needs:

- `@tintinweb/pi-subagents`
- `@tintinweb/pi-tasks`
- `pi-mcp-adapter`
- `pi-web-access`

If those tools are already installed and active in your Pi environment, Smart Ralph uses the existing tools instead of loading duplicate bundled copies.

---

## Model provider support

Ralph agents now inherit the active Pi model instead of pinning a provider-specific model in their agent frontmatter.

That means Ralph works with the Pi provider you authenticated and selected, including the three common Pi login providers:

- `anthropic`
- `openai-codex`
- `github-copilot`

Use Pi's built-in model selector whenever you want full control:

```text
/model
```

Or use Ralph's helper command:

```text
/ralph-model
/ralph-model auto
/ralph-model anthropic
/ralph-model openai-codex
/ralph-model github-copilot
/ralph-model <provider>/<model-id>
```

`/ralph-model auto` selects the recommended available model for the current supported provider, or for the only supported provider you have authenticated. After switching, Ralph subagents inherit that active Pi model.

If you previously bootstrapped older Ralph agents that still contain `model:` frontmatter, refresh them:

```text
/ralph-init --refresh-agents
```

---

## Installation

From the project where you want to use Ralph:

```bash
pi install npm:pi-smart-ralph@beta
```

Start Pi:

```bash
pi --approve
```

Inside Pi:

```text
/ralph-init
```

`/ralph-init` validates package resources, required Pi tools, bundled runtime bootstrap, and Ralph subagent discovery.

If everything is healthy, you should see:

```text
Smart Ralph bootstrap validation passed.
```

---

## Updating

Update the installed Pi package:

```bash
pi update npm:pi-smart-ralph
```

Then restart Pi or run:

```text
/reload
```

Check the commands:

```text
/ralph-help
/ralph-init
```

---

## Quick start

Create a new spec from a goal:

```text
/ralph-start add-email-login Add passwordless email login with rate limiting and tests
```

Run the normal spec phases:

```text
/ralph-research
/ralph-requirements
/ralph-design
/ralph-tasks
/ralph-implement
```

For a small smoke test:

```text
/ralph-start --quick smoke-test Create a smoke.txt file containing "pi smart ralph works" and verify it exists.
```

---

## Command overview

### Bootstrap

| Command | Description |
| --- | --- |
| `/ralph-help` | Show command help. |
| `/ralph-init` | Validate the package and bootstrap project-local Ralph agents. |
| `/ralph-init --refresh-agents` | Re-copy bundled Ralph agents into `.pi/agents`, replacing conflicts intentionally. |
| `/ralph-model [auto\|provider\|model]` | Show or switch the active Pi model that Ralph subagents inherit. |

### Spec workflow

| Command | Description |
| --- | --- |
| `/ralph-start <spec> <goal>` | Create or resume a spec and set it active. |
| `/ralph-start --quick <spec> <goal>` | Start a quick flow that minimizes approval pauses. |
| `/ralph-start --autonomous <spec> <goal>` | Start an autonomous-style quick flow. |
| `/ralph-research [spec]` | Generate `research.md`. |
| `/ralph-requirements [spec]` | Generate `requirements.md`. |
| `/ralph-design [spec]` | Generate `design.md`. |
| `/ralph-tasks [spec]` | Generate `tasks.md` and mirror tasks into Pi task cards. |
| `/ralph-implement [spec]` | Execute open tasks through Ralph subagents. |
| `/ralph-status` | Show known specs and progress. |
| `/ralph-switch <spec-or-path>` | Switch the active spec. |
| `/ralph-cancel [spec-or-path]` | Clear active Ralph execution state for a spec. |

### Epic workflow

| Command | Description |
| --- | --- |
| `/ralph-triage <epic> <goal>` | Decompose a large goal into a dependency-aware epic. |
| `/ralph-triage --fresh <epic> <goal>` | Regenerate an epic plan from scratch. |
| `/ralph-triage --output spec-files <epic> <goal>` | Write epic and child spec files only. |
| `/ralph-triage --output github-issues <epic> <goal>` | Create/update GitHub issues after confirmation. |
| `/ralph-triage --output both <epic> <goal>` | Write spec files and sync GitHub issues. |
| `/ralph-triage --output both --yes <epic> <goal>` | Confirm GitHub writes for approved/noninteractive runs. |
| `/ralph-epic-status [epic]` | Show child-spec readiness and blockers. |
| `/ralph-epic-status --json [epic]` | Print normalized epic state. |
| `/ralph-epic-status --repair [epic]` | Repair missing child stubs and stale active-spec metadata. |
| `/ralph-epic-switch <epic>` | Switch the active epic. |
| `/ralph-epic-next [--switch\|--start] [epic]` | Select the next unblocked child spec. |
| `/ralph-epic-cancel [epic]` | Cancel active epic execution state safely. |
| `/ralph-start --next-epic-spec` | Begin the next unblocked child spec from the active epic. |

---

## Generated files

Smart Ralph stores spec artifacts in your target project.

Typical spec:

```text
specs/<spec-name>/
  research.md
  requirements.md
  design.md
  tasks.md
  .progress.md
  .ralph-state.json
```

Typical epic:

```text
specs/_epics/<epic-name>/
  epic.md
  .epic-state.json
```

Project markers:

```text
specs/.current-spec
specs/.current-epic
```

Ralph agent definitions copied into the target project:

```text
.pi/agents/ralph-*.md
```

Pi task runtime files may be created under:

```text
.pi/tasks/
```

You usually should not commit runtime state such as `.pi/tasks/`, `.pi/output/`, `.pi/subagent-schedules/`, or `.pi/agent-memory-local/`.

---

## Included Ralph agents

Pi Smart Ralph includes these subagent definitions:

| Agent | Purpose |
| --- | --- |
| `ralph-research-analyst` | Researches external sources and project internals before conclusions. |
| `ralph-product-manager` | Converts goals into testable requirements. |
| `ralph-architect-reviewer` | Produces maintainable technical designs. |
| `ralph-task-planner` | Writes executable `tasks.md` plans with verification gates. |
| `ralph-spec-executor` | Implements one task and reports completion evidence. |
| `ralph-qa-engineer` | Runs verification tasks and reports pass/fail signals. |
| `ralph-refactor-specialist` | Updates specs and follow-up artifacts after implementation. |
| `ralph-spec-reviewer` | Reviews artifacts with read-only rubric checks. |
| `ralph-triage-analyst` | Decomposes large goals into epics and child specs. |

The package ships these files in `agents/`. Because Pi subagents discover project-local custom agents from `.pi/agents`, `/ralph-init` copies them into the target project.

After running `/ralph-init`, they should be visible in Pi’s `/agents` menu.

---

## How Pi tasks are used

`/ralph-tasks` keeps `tasks.md` as the canonical plan, then mirrors checkbox tasks into Pi task cards.

During `/ralph-implement`, Ralph updates the mirrored task cards as work moves through:

```text
pending -> in_progress -> completed
```

Task cards are used for visibility, dependency tracking, and execution status. The markdown file remains the source of truth for the implementation plan.

---

## How Pi subagents are used

Ralph phase commands and implementation loops run specialized subagents through Pi subagent orchestration.

Examples:

- `/ralph-research` delegates to `ralph-research-analyst`
- `/ralph-tasks` delegates to `ralph-task-planner`
- `/ralph-implement` delegates individual tasks to `ralph-spec-executor`, `ralph-qa-engineer`, or `ralph-refactor-specialist`
- `/ralph-triage` delegates epic planning to `ralph-triage-analyst`

Smart Ralph uses Pi subagent runtime events/RPC internally, so subagent runs may not always look like manual `Agent(...)` tool calls in the transcript.

---

## GitHub issue output

Epic triage can create or update GitHub issues.

Example:

```text
/ralph-triage --output both onboarding Build a complete onboarding flow with analytics and admin visibility
```

For safety, actual GitHub writes require either:

- confirmation in the Pi UI, or
- explicit `--yes`

Example:

```text
/ralph-triage --output github-issues --yes onboarding Build onboarding tracking
```

Before using GitHub output, confirm:

```bash
gh auth status
git remote -v
```

---

## Package layout

This repository is laid out as a Pi package:

```text
agents/                    Ralph subagent definitions
extensions/ralph-specum/   Pi extension source
prompts/                   Pi prompt resources
references/                Workflow reference resources
skills/                    Pi skill resources
templates/                 Spec template resources
scripts/                   Packaging verification scripts
package.json               Npm and Pi package manifest
README.md                  Project documentation
```

The Pi package manifest uses:

```json
{
  "pi": {
    "extensions": ["./extensions/ralph-specum/index.ts"],
    "skills": ["./skills"],
    "prompts": ["./prompts"]
  }
}
```

---

## Troubleshooting

### Slash commands are missing

Update and reload:

```bash
pi update npm:pi-smart-ralph
```

Then inside Pi:

```text
/reload
/ralph-help
```

If still missing, reinstall:

```bash
pi remove npm:pi-smart-ralph
pi install npm:pi-smart-ralph@beta --approve
```

### `/agents` does not show Ralph agents

Run:

```text
/ralph-init
```

If project-local files already exist and you want to replace them:

```text
/ralph-init --refresh-agents
/reload
/agents
```

### `/ralph-init` reports missing runtime tools

Make sure you are on the latest beta:

```bash
pi update npm:pi-smart-ralph
```

Then restart Pi and run:

```text
/ralph-init
```

The fixed beta package includes bundled runtime packages and should be able to bootstrap them in isolated installs.

### GitHub issue sync fails

Check authentication and repository detection:

```bash
gh auth status
git remote -v
```

Then rerun the triage command.

---

## Local development

Clone and install:

```bash
git clone https://github.com/Nephylem/pi-smart-ralph.git
cd pi-smart-ralph
npm install
```

Validate package resources and bundled runtime dependencies:

```bash
node scripts/verify-publish-bundle.mjs
npm pack --dry-run --json
```

Run a local tarball test:

```bash
npm pack
mkdir -p /tmp/pi-smart-ralph-consumer /tmp/pi-smart-ralph-project
cd /tmp/pi-smart-ralph-consumer
npm init -y
npm install /path/to/pi-smart-ralph/pi-smart-ralph-*.tgz

cd /tmp/pi-smart-ralph-project
git init
pi install /tmp/pi-smart-ralph-consumer/node_modules/pi-smart-ralph -l --approve
pi --approve
```

Inside Pi:

```text
/ralph-help
/ralph-init
```

---

## Publishing

Maintainers only.

Before publishing:

```bash
npm install
node scripts/verify-publish-bundle.mjs
npm pack --dry-run --json
```

Publish beta:

```bash
npm publish --tag beta --access public --otp <2fa-code>
```

Npm does not allow republishing the same version. For the next beta:

```bash
npm version patch
npm publish --tag beta --access public --otp <2fa-code>
```

Verify npm metadata:

```bash
npm view pi-smart-ralph version dist-tags repository homepage bugs
```

---

## Safety notes

- Review generated `tasks.md` before implementation if you are not intentionally using quick/autonomous mode.
- GitHub issue writes require UI confirmation or `--yes`.
- Ralph subagents are expected to verify real behavior and provide evidence before completion.
- Avoid destructive git or external-system actions unless you explicitly intend them.

---

## Contributing

Issues and pull requests are welcome:

- Repository: <https://github.com/Nephylem/pi-smart-ralph>
- Issues: <https://github.com/Nephylem/pi-smart-ralph/issues>

Good contributions include:

- clearer command UX
- stronger bootstrap diagnostics
- more smoke tests
- safer GitHub issue handling
- better task parsing and verification rules
- improved Ralph agent prompts for Pi workflows

---

## License

MIT
