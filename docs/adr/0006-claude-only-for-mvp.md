# 0006 — Claude Code only for the MVP

- **Status:** Accepted
- **Date:** 2026-10-08
- **Decided by:** Meddy

## Context

Other agent CLIs exist (Codex CLI, Gemini CLI). Each reports work and asks permission in a
different way, so approval cards and the timeline would need an adapter per agent.

## Decision

Support only Claude Code in the MVP. Keep the daemon talking to a `Runner` interface
(`RunnerEvent` stream + approval callback) so adapters can be added later without touching the UI.

## Consequences

- Good: one runner to build and test well.
- Cost: people without Claude Code cannot use Apeiron yet.
