# 0010 — How background agents start, finish and land

- **Status:** Accepted
- **Date:** 2026-10-08
- **Decided by:** Meddy (autonomous build, recorded for review)

## Context

M7 runs Claude headless in a git worktree per task (prd.md A-1 to A-6, architecture.md §3). The
docs left a few details open: what the agent starts from, who commits its work, what happens
over the running limit, and where worktrees live when the projects folder is not `~/Projects`.

## Options

1. **Start from HEAD, Apeiron commits at the end, queue over the limit** — the agent never runs
   git itself. Trade-off: uncommitted work in the main checkout is not visible to the agent.
2. **Copy the working tree, let the agent commit, refuse over the limit** — the agent sees
   everything. Trade-off: copying dirty files is fragile, agent commits are noisy, and refusing
   makes the user retry by hand.

## Decision

We chose **1**:

- `git worktree add -b agent/<slug> <projectsDir>/.apeiron-worktrees/<project>/<slug> HEAD`.
  The default worktree folder follows the projects folder (a custom `agents.worktreeDir` wins).
- Edits inside the worktree are allowed without asking; edits outside are refused by a
  PreToolUse guard; every command needs an approval (shown on the agent card).
- When Claude finishes, Apeiron runs `git add -A` and commits `agent: <task>` on the agent
  branch. The last line Claude wrote is the card's summary.
- Over `agents.maxRunning`, a new agent is **queued** and starts when a slot frees.
- **Accept** = `git merge --no-edit agent/<slug>` into the project's current branch. On a
  conflict or overlapping uncommitted changes the merge is aborted and nothing changes.
  Then the worktree and branch are removed. **Discard** removes them without merging.
- A daemon restart marks running agents as failed but keeps their worktree, so Try again and
  Discard still work.

## Consequences

- Good: the main checkout is untouched until Accept; Discard leaves no trace.
- Cost: the agent does not see uncommitted changes. The New agent form says "Starts from your
  last commit".
- Follow-up: show the agent's full transcript (only the last rows are on the card today).
