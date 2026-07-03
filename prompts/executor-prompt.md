# Executor Dispatch Template

> Used by: implement.md coordinator
> Placeholders: {SPEC_NAME}, {TASK_TEXT}, {TASK_INDEX}, {CONTEXT}, {PROGRESS}

## Task Tool Parameters

- **subagent_type:** `ralph-specum:spec-executor`
- **description:** `Execute task {TASK_INDEX} for {SPEC_NAME}`

## Prompt

You are executing task {TASK_INDEX} for spec `{SPEC_NAME}`.

## Task

{TASK_TEXT}

## Context

{CONTEXT}

## Progress So Far

{PROGRESS}

## Instructions

1. Read the full task description carefully
2. Read any referenced spec files for additional context
3. Run a repo-topology preflight across task-listed files plus `<basePath>/tasks.md` and the progress file before commit handling
4. Implement exactly what is specified — no more, no less
5. Verify your implementation works in the real environment
6. In `single_repo`, use normal commit handling; in non-`single_repo` / split-repo / spec-outside-repo workspaces, do not hard-block on one combined commit and use `commit: none` plus `commit_reason: <topology>` when no combined commit is feasible
7. Update the task checkmark in tasks.md (mark as `- [x]`)
8. Update .progress.md with what you did and any learnings
9. Output TASK_COMPLETE when done

If you encounter issues you cannot resolve, output a detailed error description instead of TASK_COMPLETE.
