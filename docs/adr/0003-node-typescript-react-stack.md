# 0003 — Node 22 + TypeScript, Fastify, React + Vite, SQLite cache

- **Status:** Accepted
- **Date:** 2026-10-08
- **Decided by:** Meddy

## Context

The MVP spec chose Node 22 and TypeScript to match Core, React for the UI, WebSockets for
streaming, and SQLite only for the app's own cache. This ADR pins the libraries.

## Decision

| Part | Choice | Why |
| --- | --- | --- |
| Monorepo | pnpm workspaces | simple, fast, no extra tool |
| Server | Fastify + `@fastify/websocket` | small, typed, `inject` for tests |
| Validation | zod (shared package) | one schema for daemon and UI |
| Cache | better-sqlite3 + plain SQL migrations | sync API, one file, no ORM needed |
| Git | `simple-git` + direct `git` calls for worktrees | well tested |
| UI | React 19 + Vite + React Router | standard |
| UI state | TanStack Query (server state) + Zustand (UI state) | small |
| Styling | plain CSS modules + `tokens.css` | the design is custom; no UI kit to fight |
| Code highlight | Shiki | same grammars as VS Code |
| Markdown | `react-markdown` + `remark-gfm` | tables, task lists |
| Diff | `diff` package for previews; `git diff` for files | |
| Icons | `lucide-react` | matches the stroke style in the designs |
| File watch | `chokidar` | cross-platform |
| Tests | Vitest, Testing Library, Playwright | |
| TypeScript | 6.0 (not 7) | typescript-eslint does not support 7 yet; revisit when it does |
| Dev runner | `tsx` | runs the daemon and CLI from TS source with watch |
| Fonts | `@fontsource-variable/geist`, `geist-mono` | self-hosted; the `geist` package only ships Next.js loaders, and Google Fonts would send requests off the machine |

## Consequences

- Good: one language everywhere, shared types between daemon and UI.
- Cost: native module (better-sqlite3) needs a build on install; acceptable for a dev tool.
