# 0012 — Ready-made scan agents that write reports

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

Background agents (ADR-0010) take a free-text task, edit code in a worktree and end with a diff.
The user also wants one-click agents that look the project over (security, tests, code health,
dependencies) and hand back a report to read in the centre column, plus their own agents of the
same kind. A background run cannot stop for approvals, but tests and audits need commands.

## Options

1. **Ask for every command** — safest. Trade-off: a one-click run stalls until the user answers.
2. **A fixed command list per agent, everything else refused** — the run never stalls, and the
   list is visible on the Run button. Trade-off: `pnpm test` runs the project's own scripts.
3. **No commands** — read files only. Trade-off: the test runner and audits become guesses.

Where reports live: the project's git-ignored `apeiron/` folder (next to chat uploads),
`docs/reports/` (committed), or `~/.apeiron` (outside the project).

## Decision

We chose **option 2** and **`apeiron/reports/<agent>/<YYYY-MM-DD-HHmmss>.md`**, the user's
answers on 2026-10-11.

- Scan agents run in the project folder itself (read-only, so no worktree). Read tools run
  freely; Edit, Write and web tools are disallowed; Bash runs only when the command is exactly
  an allowed one, or it plus arguments, with no shell syntax (`; & | < > $ \` ( )`); anything
  else is refused without asking. Secret files stay refused as everywhere.
- Every agent may also run `git status`, `git log`, `git ls-files`, `git diff`.
- The agent finishes by calling `submit_report` (verdict, one-line summary, counts by
  severity, Markdown). Apeiron writes the file with front matter; a run that ends without the
  tool keeps its last message as the report, a crash keeps a short failed report, a Stop keeps
  nothing.
- Built-ins: Security review (Opus), Test runner, Code health, Dependency audit (Sonnet).
  Custom agents are `~/.apeiron/agents/<id>.md` (data-model.md §8); one with a built-in id
  replaces it.
- One run per agent per project at a time; running state is in memory only.

## Consequences

- Good: one click, no prompts, a dated history of reports per agent that survives restarts.
- Bad / cost: the Dependency audit asks the package registry (npm, PyPI, crates.io). The user
  picked it knowing it runs `pnpm audit`; it is the only scan that sends anything off the
  machine besides Claude, and it says so in its description.
- Bad / cost: the test runner executes the project's test scripts unattended.
- Follow-up: scheduled runs (nightly), and a "Fix with an agent" button that turns a finding
  into a background-agent task.
