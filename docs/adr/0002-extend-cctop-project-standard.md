# 0002 — Extend cctop's `_project/` standard

- **Status:** Accepted
- **Date:** 2026-10-07
- **Decided by:** Meddy

## Context

Projects need a place for status, tasks, survey answers and app metadata. cctop already defines
`_project/STATUS.md`, a session hook that writes `sessions.json` and `log.md`, and a skill that
keeps the status updated.

## Options

1. **New `.apeiron/` folder per project** — clean. Trade-off: cctop would not see it; two standards.
2. **Extend `_project/`** — add `project.json`, `tasks.json`, `survey.json`, `notes.md`. Trade-off: tied to cctop's format.

## Decision

Option 2. Engineering docs go in committed `docs/`; personal state in `_project/`, excluded via
`.git/info/exclude`.

## Consequences

- Good: cctop and Apeiron read the same files; existing cctop projects become "cctop" state for free.
- Cost: changes to `STATUS.md` format must stay compatible with cctop.
