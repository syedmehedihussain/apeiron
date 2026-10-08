# 0011 — Magnet: one conversation, proposed actions run by the daemon

- **Status:** Accepted
- **Date:** 2026-10-08
- **Decided by:** Meddy (autonomous build, recorded for review)

## Context

Magnet (prd.md M-1 to M-5) answers questions across every project and may suggest changes, but
must never change anything on its own (ADR-0007 item 6). We needed to decide how its context is
built, how a suggestion becomes a real change, and what the Read-only switch means when Magnet
is read-only anyway.

## Options

1. **Proposed actions as cards; Approve calls the daemon's own services** — Magnet calls a
   `propose_action` tool that only records a card. Trade-off: a fixed list of action kinds.
2. **Let Magnet call the API itself, behind approvals** — more flexible. Trade-off: a model with
   a route list is a much larger attack surface for prompt injection from project files.

## Decision

We chose **1**.

- One Magnet conversation at a time (global, resumable, **New conversation** starts over). The
  workspace tab sends the project id along so Magnet knows what the user is looking at.
- Each turn's system prompt carries `MAGNET.md`, `me.md`, `work.md` and a fresh `projects.md`.
  Magnet may read the projects folder and its own folder, nothing else; no commands at all.
- `show_projects` puts clickable project cards in the answer. `propose_action` records one of
  `calibrate`, `start_agent`, `new_project`, `push`. **Approve** runs the matching service in the
  daemon (calibration scan, AgentManager, the survey page, the push approval), each with its own
  safety rules; nothing is written by the approval itself.
- **Read-only mode** (on by default) means Magnet edits nothing. Turned off, Magnet may edit its
  own three notes files, each edit shown as an approval. Project actions always need Approve.

## Consequences

- Good: a prompt in a README cannot make Magnet write, push or start anything.
- Cost: new kinds of action need code in `MagnetService.approve`.
