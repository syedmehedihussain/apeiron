# 0013 — Release 1.0.0 from GitHub, Linux only

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

Cherry is ready for a first versioned release. The README still describes it as an early
milestone, every package says 0.0.0, and there is no changelog or tag. Two choices decide how
much work 1.0.0 is: how people install it, and which systems it supports.

## Options

1. **Clone + install script** — `git clone`, `mise install`, `pnpm install`,
   `./scripts/install-cli.sh`; a GitHub release with notes. Trade-off: four commands, and the
   user needs mise or Node 22 + pnpm.
2. **npm package `cherry-cli`** — `npm i -g cherry-cli`. Trade-off: needs a real build (bundle
   daemon and CLI, ship the built UI, prebuilt better-sqlite3); days of work and a new failure
   surface.
3. **Linux only** vs **Linux and macOS** — macOS needs a launchd service, a macOS CI job and
   testing `open` and paths on a Mac.

## Decision

We chose **clone + install script** and **Linux only** for 1.0.0, the user's answers on
2026-10-11. The version is 1.0.0 in every package, `cherry --version` prints it, the tag is
`v1.0.0`, and the GitHub release carries the notes from `CHANGELOG.md`.

## Consequences

- Good: ships soon, and what users install is exactly what CI tests.
- Bad / cost: installing needs a few commands and a toolchain; no macOS or Windows.
- Follow-up: npm package (`cherry-cli`) and macOS support are candidates for 1.1.
