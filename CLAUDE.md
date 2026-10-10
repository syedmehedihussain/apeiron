# CLAUDE.md — Cherry

Cherry is a local web workspace that drives the `claude` CLI to plan, document and build
projects in `~/Projects`. A CLI starts a daemon on `127.0.0.1`; a React UI talks to it.

## Read first

- `_project/STATUS.md` — where we left off and what is next. Always read this first.
- `docs/roadmap.md` — the milestone being built and its **Done when** list.
- `docs/README.md` — map of the docs. Open other docs **only when the task needs them**.

## Repo layout

```
CLAUDE.md, README.md
docs/                 product, engineering and design docs (committed)
  adr/                one file per decision
  design/tokens.css   design tokens; the web package imports this file
  design/screens/     artboards (*.dc.html), source of truth for layout
packages/             cli, daemon, web, shared (see Stack)
_project/             personal state, git-excluded, never committed
```

## Stack

- Node 22, TypeScript (strict), pnpm workspaces
- `packages/cli` — the `cherry` command
- `packages/daemon` — Fastify + WebSockets, SQLite cache (better-sqlite3)
- `packages/web` — React 19 + Vite, plain CSS with tokens from `docs/design/tokens.css`
- `packages/shared` — types and zod schemas shared by daemon and web

Library choices are pinned in `docs/adr/0003-node-typescript-react-stack.md`.

## Commands

Node 22 and pnpm 12 are pinned in `mise.toml`. Run commands through mise if your shell has a
different Node (`mise exec -- pnpm test`).

```bash
pnpm dev          # daemon (127.0.0.1:4317) + web (127.0.0.1:5173) with reload
pnpm test         # vitest, all packages
pnpm test:e2e     # playwright, uses /usr/bin/chromium locally
pnpm lint         # eslint + prettier check
pnpm typecheck    # tsc --noEmit, root + all packages
pnpm cherry      # run the CLI from source
```

Workspace packages import each other's TypeScript source directly (`exports` points at
`src/*.ts`); there is no build step until the daemon serves the built UI (M1).

## Rules

1. **The browser never touches the disk.** Every file, git or Claude action goes through the
   daemon API in `docs/api.md`.
2. **Loopback only.** The daemon binds `127.0.0.1`. Every request carries the per-run token.
   See `docs/security.md`.
3. **Never overwrite a user file without an approval.** Calibration and survey write only after
   the user approves the file list. Existing files get additions, never replacement.
4. **`_project/` is personal state, `docs/` is committed.** Do not move things between them.
5. **No code editing in the UI.** Code is shown read-only. Edits come from Claude, after approval.
6. **Match the design.** Screens are in `docs/design/screens/`. Use tokens, not raw hex.
7. **The designs say "Harness"** (the first name; it was later Apeiron, ADR-0014). Build it as **Cherry**, `~/.cherry/` and the
   `cherry` command. Replace the "H" app mark with the Cherry badge (`docs/design-system.md` → Brand).
8. **Every real choice becomes an ADR** in `docs/adr/`. Use `docs/adr/template.md`.
9. **Work milestone by milestone.** Finish and test one roadmap task before the next. Tick the
   box in `docs/roadmap.md` and update `_project/STATUS.md` when a task is done.
10. Conventional commits (`feat:`, `fix:`, `docs:` …). Small commits, one roadmap task each.

## Ask before

- Adding a dependency that is not in ADR-0003.
- Changing a file format in `docs/project-standard.md` or `docs/data-model.md`.
- Anything that sends data off the machine other than to Claude or GitHub.
- Pushing to GitHub or creating the remote repo.
