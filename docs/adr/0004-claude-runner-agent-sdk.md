# 0004 — Drive Claude Code through the Claude Agent SDK

- **Status:** Accepted (spike passed 2026-10-08, SDK 0.3.292, Claude Code 2.1.288)
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

## Decision

Option 2 for all sessions, behind the `RunnerEvent` interface in `claude-runner.md`, so the raw
CLI path can be swapped in if the spike finds a blocker.

## Spike checklist

- [x] Resume a session by id across process restarts.
- [x] `canUseTool` can wait minutes for a human answer without timing out.
- [x] Custom in-process tool (`ask_decision`) can hold its result until the user answers.
- [x] Interrupt (Stop) works mid-tool.
- [x] Per-session allow rules and working directory (worktree) work.
- [x] Uses the user's existing `claude` login (no API key required).

Re-run with `pnpm --filter @cherry/daemon spike` (`packages/daemon/scripts/spike-agent-sdk.ts`).

## Findings

- Bare `allowedTools` entries skip `canUseTool` entirely, so only read-only tools go there.
  Everything that writes or runs goes through `canUseTool`.
- `settingSources: []` so user or project settings files cannot add allow rules that bypass
  Cherry's approvals. The `claude_code` system-prompt preset plus our append still tells Claude
  to read `CLAUDE.md` and `STATUS.md` first.
- An interrupted turn ends with `result.subtype = error_during_execution`, and the iterator may
  throw afterwards; the runner treats both as "stopped".

## Consequences

- Good: approvals and decision cards are simple, testable code.
- Cost: pin the SDK version; re-run the spike checklist on upgrades.
