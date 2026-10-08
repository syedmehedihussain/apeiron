# 0001 — A CLI that starts a local web UI

- **Status:** Accepted
- **Date:** 2026-10-07
- **Decided by:** Meddy

## Context

The app needs a file tree, rendered docs, diffs, cards and a chat side by side. It must run
Claude Code and git on the user's machine. Options discussed: a TUI, a web dashboard, or both.

## Options

1. **TUI only** — fits the terminal. Trade-off: rich diffs, cards and Markdown reading are hard.
2. **Desktop app (Electron/Tauri)** — native window. Trade-off: packaging and updates for an open-source side project.
3. **CLI + local web UI** (Jupyter / code-server / sysdash pattern). Trade-off: needs a browser tab and a token.

## Decision

Option 3. `apeiron up` starts a daemon on `127.0.0.1` and opens the browser. Meddy already runs
sysdash this way, so the server and runner code can be reused.

## Consequences

- Good: full web UI, easy to develop, same code could be wrapped in Tauri later.
- Cost: must defend the local server (token, Host/Origin checks — see `security.md`).
