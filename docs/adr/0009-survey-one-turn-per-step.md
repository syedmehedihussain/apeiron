# 0009 — The survey drafts each step in its own short Claude turn

- **Status:** Accepted
- **Date:** 2026-10-08
- **Decided by:** Meddy (autonomous build, recorded for review)

## Context

The survey (prd.md S-1 to S-8) asks seven questions, saves every answer at once, can be paused
for days, and lets the user change an earlier answer. `claude-runner.md` first said the survey
would use the chat's `ask_decision` tool, which keeps one Claude session open and blocked until
the user answers. That session dies when the daemon restarts, and changing an answer would mean
rewinding a conversation.

## Options

1. **One long session with `ask_decision`** — same tool as chat. Trade-off: cannot survive a
   restart or a pause; Change needs a conversation rewind.
2. **One short turn per step** — each step gets a fresh, tool-less turn that returns its card
   through a `draft_card` tool, built from `survey.json`. Trade-off: Claude starts again for each
   step (about 10–50 s per card), and it only knows what `survey.json` tells it.

## Decision

We chose **one short turn per step**. `survey.json` is the only state, so resume and Change are
plain file updates. The final step is one more turn that returns every document through
`propose_docs`; Apeiron adds `STATUS.md`, `project.json`, `tasks.json` and the ADR template.
Survey turns get no file tools at all (all built-in tools disallowed, plus a PreToolUse guard).

## Consequences

- Good: a survey survives restarts; Change re-shows the saved card; later answers are marked
  stale and re-shown with "Check again".
- Good: Claude cannot touch the disk during the survey; Apeiron writes the files after review.
- Cost: a card takes a fresh Claude start. The UI shows "Drafting options…" meanwhile.
- File format: the step-1 answer's `value` gains `quick: boolean` (needed for the Quick toggle,
  ADR-0007 item 5). Everything else in `survey.json` is as in data-model.md.
