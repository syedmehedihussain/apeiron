# 0014 — Rename Apeiron to Cherry

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

The app was first called Harness (in the design artboards), then Apeiron. The user wants it
called **Cherry** before the first release. The old name was everywhere: the command, the
config folder, package names, environment variables, the folder Cherry keeps in each project,
the docs, the Claude Code skill and the GitHub repo.

## Options

1. **Rename everything** — UI, `cherry` command, `~/.cherry`, `@cherry/*` packages,
   `CHERRY_*` variables, `<project>/cherry/`, docs, skill, repo. Trade-off: a big change, and
   existing data must move.
2. **Rename what users see** — UI, command and docs only. Trade-off: two names in the code for
   good.

## Decision

We chose **option 1**, the user's answer on 2026-10-11. The repo becomes
`syedmehedihussain/cherry` (GitHub redirects the old URL) and the local folder becomes
`~/Projects/cherry`.

Existing data moves once, automatically:

- `~/.apeiron` → `~/.cherry`, when `~/.cherry` does not exist yet (the CLI before it writes
  anything, and the daemon for `pnpm dev`). Settings, sessions, Magnet files, custom agents and
  transcripts come along.
- `<project>/apeiron/` → `<project>/cherry/` at daemon start, only when that folder holds nothing
  but `uploads/` and `reports/`; the `/apeiron/` line in that project's `.gitignore` becomes
  `/cherry/`.

## Consequences

- Good: one name everywhere; an update keeps all data.
- Bad / cost: browsers sign in once more (the cookie is now `cherry_session`) and the side
  panel forgets its last view. A systemd service installed as `apeiron.service` must be removed
  and installed again with `cherry install-service`. The old `~/.local/bin/apeiron` shim must be
  replaced by running `./scripts/install-cli.sh` again. Existing agent worktrees stay where they
  are; new ones go to `<projectsDir>/.cherry-worktrees`.
- Follow-up: the npm name for a later package is `cherry-cli` if it is free.
