# 0004 — Drive Claude Code through the Claude Agent SDK

- **Status:** Proposed (confirm with the M3 spike)
- **Date:** 2026-10-08
- **Decided by:** Meddy

## Context

Live approve/deny for every edit and command is the core feature. sysdash spawns `claude -p`
with stream-json output and a read-only allowlist; it never needed live approvals.

## Options

1. **Raw CLI, sysdash style** — reuse working code. Trade-off: live approvals need a separate
   permission-prompt MCP server that calls back into the daemon.
2. **Claude Agent SDK (TypeScript)** — `canUseTool` callback gives approvals in plain code;
   custom tools (`ask_decision`) are easy. Trade-off: new dependency, API still moving.

## Decision (proposed)

Option 2 for all sessions, behind the `RunnerEvent` interface in `claude-runner.md`, so the raw
CLI path can be swapped in if the spike finds a blocker.

## Spike checklist

- [ ] Resume a session by id across process restarts.
- [ ] `canUseTool` can wait minutes for a human answer without timing out.
- [ ] Custom in-process tool (`ask_decision`) can hold its result until the user answers.
- [ ] Interrupt (Stop) works mid-tool.
- [ ] Per-session allow rules and working directory (worktree) work.
- [ ] Uses the user's existing `claude` login (no API key required).

## Consequences

- Good: approvals and decision cards are simple, testable code.
- Cost: pin the SDK version; re-run the spike checklist on upgrades.
