# Smart Ralph Pi Resources

This directory is the tracked source for the Pi-native Smart Ralph package in this repo. See [`docs/pi.md`](../docs/pi.md) for install commands, command mapping, epic triage workflow, smoke tests, and Claude/Codex migration.

Tracked source resources live here:

- `extensions/ralph-specum/` - Pi extension source registering `/ralph-*` commands, including `/ralph-triage` and `/ralph-epic-*` helpers
- `agents/` - Pi subagent definitions used by `@tintinweb/pi-subagents`
- `skills/` - Pi/Agent Skills resources
- `prompts/` - Pi prompt templates
- `templates/` - Ralph spec templates shared by the extension
- `references/` - Workflow/reference docs loaded by Ralph agents

Target projects store specs under `specs/` and epics under `specs/_epics/<epic>/`. The active epic marker is `specs/.current-epic`; child specs still progress through normal `research.md`, `requirements.md`, `design.md`, `tasks.md`, and `.ralph-state.json` files.

Runtime state should not be committed:

- `.pi/tasks/`
- `.pi/output/`
- `.pi/subagent-schedules/`
- `.pi/agent-memory-local/`
- `.pi/tasks-config.json`
- `.pi/subagents.json`
