# Architecture

## Overview

Apeiron is a **CLI that starts a local daemon**, plus a **web UI** served by that daemon. This is
the same pattern as sysdash (and Jupyter). The daemon is the only part that touches the disk,
git, `gh` or `claude`.

```
 ┌──────────────── browser (127.0.0.1:4317) ────────────────┐
 │  React UI  ── HTTP (REST) ──┐    ┌── WebSocket (events) ── │
 └─────────────────────────────┼────┼───────────────────────┘
                               ▼    ▼
 ┌──────────────────────── apeiron daemon ─────────────────────────┐
 │ http + ws (Fastify)   token check   path guard                   │
 │                                                                  │
 │ ProjectScanner ─ watches ~/Projects, classifies, builds cards    │
 │ ProjectStore   ─ reads/writes project.json, STATUS.md, survey…   │
 │ GitService     ─ status, log, ahead/behind, worktrees, pull/push │
 │ GitHubService  ─ gh api: repo info, PRs, repo create             │
 │ ClaudeRunner   ─ spawns `claude`, parses stream-json             │
 │ ApprovalBroker ─ holds pending approvals, routes answers back    │
 │ SessionManager ─ chat sessions, resume ids, transcripts          │
 │ AgentManager   ─ background agents in worktrees                  │
 │ SurveyEngine   ─ steps, decision cards, doc generation           │
 │ Calibrator     ─ scan → questions → proposal → write             │
 │ Magnet         ─ cross-project session with read-only tools      │
 │ Cache (SQLite) ─ app-only cache, rebuildable from disk           │
 └───────┬──────────────┬─────────────┬────────────────┬────────────┘
         ▼              ▼             ▼                ▼
   ~/Projects/*     git / gh      claude CLI     ~/.apeiron/
```

## Packages

```
apeiron/
├── packages/
│   ├── cli/        `apeiron` command: (bare = up), down, status, open, logout, doctor, install-service
│   ├── daemon/     Fastify server, services above, SQLite cache
│   ├── web/        React 19 + Vite UI
│   └── shared/     zod schemas + TS types for API, events, files
├── docs/
└── _project/       personal state (git-excluded)
```

- The daemon serves the built web UI as static files in production. In dev, Vite serves the UI
  and proxies `/api` and `/ws` to the daemon.
- `shared` is the contract. Every API body and WebSocket event has a zod schema there, validated
  on both sides.

## CLI

| Command | Does |
| --- | --- |
| `apeiron` (or `apeiron up`) | Start the daemon in the background if not running, print the login link `http://127.0.0.1:4317/#login=<code>`, open it in the browser, and return to the prompt. |
| `apeiron down` | Stop the daemon. |
| `apeiron status` | Is it running, which port, how many projects, is `claude` found. |
| `apeiron open <project>` | Open the browser straight to a project's workspace. |
| `apeiron logout` | End every browser session. |
| `apeiron doctor` | Check Node, git, gh, claude, folder permissions; print fixes. |
| `apeiron install-service` | Install a systemd **user** service (Linux) or launchd agent (macOS). |

The daemon writes `~/.apeiron/run/daemon.json` with `{ pid, port, startedAt }`
(file mode `0600`). The CLI reads it to talk to a running daemon.

## Key flows

### 1. Open Home
1. Browser loads. If the URL has `#login=<code>`, the UI strips it and posts it to `POST /api/session`, which sets the session cookie (ADR-0008). Later visits and bookmarks use the cookie.
2. `GET /api/projects` → daemon returns cards from cache, then rescans in the background.
3. Changes arrive as `projects.updated` events over the WebSocket.

### 2. Chat turn with an approval
1. User sends a message → `POST /api/projects/:id/chat`.
2. SessionManager calls ClaudeRunner with the project's session id (`--resume`).
3. ClaudeRunner streams events → daemon re-emits them as `chat.*` events.
4. Claude wants to edit a file → the permission request reaches ApprovalBroker (see
   `claude-runner.md`) → `approval.requested` event → UI shows the approval card.
5. User clicks **Allow** → `POST /api/approvals/:id` → broker answers Claude → Claude continues.

### 3. Background agent
1. `POST /api/projects/:id/agents` with `{ task, model }`.
2. AgentManager: `git worktree add ../.apeiron-worktrees/<project>/<slug> -b agent/<slug>`.
3. Runs a headless ClaudeRunner session with `cwd` = worktree. Approvals go through the same broker.
4. On finish: computes the diff vs base branch, sets status Done.
5. **Accept** = merge `agent/<slug>` into the current branch (fast-forward or merge commit,
   never force). **Discard** = remove worktree and delete branch.

Worktrees live **outside** the project folder (`~/Projects/.apeiron-worktrees/`) so they never
show in the file tree and the scanner skips dot-folders.

## Data ownership

| Data | Lives in | Owner |
| --- | --- | --- |
| Engineering docs | `<project>/docs/` (committed) | the project |
| Status, tasks, survey, notes | `<project>/_project/` (git-excluded) | the user |
| Session log | `<project>/_project/sessions.json`, `log.md` | the cctop hook |
| Magnet knowledge | `~/.apeiron/magnet/` | the user (+ generated `projects.md`) |
| App settings | `~/.apeiron/config.json` | the app |
| Cache, transcripts index, usage stats | `~/.apeiron/cache.db` (SQLite) | the app, rebuildable |

**Rule:** if `cache.db` is deleted, Apeiron loses nothing important. Everything that matters is
in plain files. (Usage stats are the one exception; losing them is acceptable.)

## Concurrency

- One chat session per project at a time. A second browser tab watches the same session.
- Agents: up to 3 running (setting). Each has its own process.
- File writes go through ProjectStore, which writes to a temp file and renames (atomic), and
  refuses to write if the file changed on disk since it was read (mtime + hash check).

## Errors and recovery

- Daemon restart: sessions are resumed by id on next message. Pending approvals at shutdown are
  cancelled; Claude sees a deny with reason "Apeiron restarted".
- `claude` crashes: the turn ends with an error row and a **Retry** button.
- Disk folder deleted while open: workspace shows "This folder is gone" and links Home.

## Performance targets

- Home with 30 projects: first paint < 2 s cold, < 300 ms warm (from cache).
- File tree: virtualised beyond 500 rows; `node_modules`, `.git`, `dist`, `build`, `.next`
  shown collapsed and never walked.
- Chat stream: UI renders at most every 50 ms (batched) during fast token streams.
