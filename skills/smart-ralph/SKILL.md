---
name: smart-ralph
description: This skill should be used when the user asks about "ralph arguments", "quick mode", "commit spec", "max iterations", "ralph state file", "execution modes", "ralph loop", "coordinator behavior", "delegate to subagent", or needs guidance on Ralph plugin arguments, state management, delegation patterns, or execution loop behavior. Core behavioral skill for all Ralph Specum operations.
version: 0.2.0
user-invocable: false
---

# Smart Ralph

Core skill for all Ralph plugins. Defines common arguments, execution modes, shared behaviors, and coordinator delegation rules.

## Common Arguments

All Ralph commands support these standard arguments:

| Argument | Short | Description | Default |
|----------|-------|-------------|---------|
| `--quick` | `-q` | Skip interactive phases, auto-generate artifacts, start execution immediately | false |
| `--commit` | `-c` | Commit and push spec/feature files after generation | true (normal), false (quick) |
| `--no-commit` | | Explicitly disable committing files | - |
| `--max-task-iterations` | `-m` | Max retries per failed task before stopping | 5 |
| `--fresh` | `-f` | Force new spec/feature, overwrite if exists | false |

Argument precedence: `--no-commit` > `--commit` > mode default.

## Execution Modes

### Normal Mode (Interactive)

- User reviews artifacts between phases
- Phase transitions require explicit commands
- Each phase sets `awaitingApproval: true`
- Commits spec files by default

### Quick Mode (`--quick`)

- Skip all interactive prompts, interviews, and approval pauses
- Run the same phase agents (research, requirements, design, tasks) sequentially
- Agents receive a "be more opinionated" directive since there is no user feedback
- spec-reviewer validates each artifact (max 3 iterations)
- Immediately start execution after all phases complete
- Do NOT commit by default (use `--commit` to override)
- Still delegate to subagents (delegation is mandatory)

## State File

All Ralph plugins use `.ralph-state.json` for execution state. See `references/state-file-schema.md` for full schema.

Key fields: `phase`, `taskIndex`, `totalTasks`, `taskIteration`, `maxTaskIterations`, `awaitingApproval`.

## Commit Behavior

When `commitSpec` is true:

1. Stage spec/feature files after generation
2. Commit with message: `chore(<plugin>): commit spec files before implementation`
3. Push to current branch

When `commitSpec` is false:

- Files remain uncommitted
- User can manually commit later

## Task Execution Loop

Pi Smart Ralph has a self-contained execution loop driven by the Pi coordinator. Original Claude/Codex hook behavior is preserved only as packaged reference context and is not installed or invoked by these skill resources.

Key signals:
- `TASK_COMPLETE` - executor finished task
- `ALL_TASKS_COMPLETE` - coordinator ends loop

## Error Handling

When `taskIteration > maxTaskIterations`: block task, suggest manual intervention.

If state file missing/invalid: output error, suggest re-running implement command.

## Branch Management

All Ralph plugins follow consistent branch strategy:

1. Check current branch before starting
2. If on default branch (main/master): prompt for branch strategy
3. If on feature branch: offer to continue or create new
4. Quick mode: auto-create branch, no prompts

## Coordinator Behavior

The main Pi/Ralph agent is orchestration-first for context preservation: coordinate, decide, and keep durable state while delegating work-plane jobs to subagents. Use Pi/Ralph subagent orchestration and native task tools as appropriate; do not collapse delegated work back into the coordinator.

### Coordinator Responsibilities

1. Parse user input and determine intent
2. Read and update Ralph control-plane state files
3. Own phase transitions, approval gates, retry/block decisions, and task advancement
4. Mirror tasks into native Pi task UI when required
5. Delegate work-plane jobs to subagents via Pi/Ralph subagent orchestration and native task tools as appropriate
6. Report results to user

### Control Plane vs Work Plane

- **Control plane (extension/coordinator):** slash-command flow, `.ralph-state.json`, progress/state finalization, approval gates, native task mirroring, task status changes, retries, blockers, and `ALL_TASKS_COMPLETE` decisions.
- **Work plane (subagents):** inspect, research, artifact generation, implementation, verification, refactoring, and evidence collection for a scoped phase or task.

### Subagent Handoff Contract

Subagents should return a compact handoff with: `Status`, `Files inspected`, `Files changed`, `Verification`, `Blockers`, and `Next`.

### Do Not

- Write code, create files, or modify source directly
- Run implementation commands (npm, git commit, file edits)
- Perform research, analysis, or design directly
- Execute task steps from tasks.md

### Delegation Mapping

| Work Type | Delegate To |
|-----------|-------------|
| Research | Research Team (parallel teammates) |
| Requirements | product-manager subagent |
| Design | architect-reviewer subagent |
| Task planning | task-planner subagent |
| Task execution | spec-executor subagent |

Quick mode still requires delegation.
